import { NextResponse } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import {
  parseNotificationEmails,
  validateNotificationEmails,
} from "@/lib/notification-emails";

/**
 * Self-serve notification inbox settings for dashboard accounts.
 *
 * Mirrors app/api/dashboard/password/route.ts. 系所 accounts never see the
 * admin panel, so this is the only way they can maintain their own field.
 *
 * Two kinds of account, two tables:
 *   帳密登入   → dashboard_accounts.notification_emails (keyed by username)
 *   Google登入 → authorized_emails.notification_emails  (keyed by email)
 */

const MISSING_COLUMN_ERROR =
  "資料庫尚未建立通知信箱欄位，請先執行 supabase/add_dashboard_notification_emails.sql。";

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("尚未設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。");
  }

  return {
    serviceRoleKey,
    url: url.replace(/\/$/, ""),
  };
}

function authHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Where this account's notification emails live. Both tables are queried with
 * the service role key, so the filter below is the only thing scoping the write
 * to the caller's own row — it must come from the verified session, never body.
 */
type AccountTarget = {
  filter: string;
  table: "authorized_emails" | "dashboard_accounts";
};

type AccountGuard =
  | { error: NextResponse; ok: false }
  | { ok: true; target: AccountTarget };

async function requireDashboardAccount(): Promise<AccountGuard> {
  const auth = await checkDashboardAccess();

  if (!auth.authorized) {
    return {
      error: jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      ),
      ok: false,
    };
  }

  if (auth.authProvider === "password") {
    if (!auth.username) {
      return { error: jsonError("找不到目前登入帳號。", 404), ok: false };
    }
    return {
      ok: true,
      target: {
        filter: `username=eq.${encodeURIComponent(
          auth.username.trim().toLowerCase()
        )}`,
        table: "dashboard_accounts",
      },
    };
  }

  if (!auth.email) {
    return { error: jsonError("找不到目前登入帳號。", 404), ok: false };
  }

  return {
    ok: true,
    target: {
      filter: `email=eq.${encodeURIComponent(auth.email.trim().toLowerCase())}`,
      table: "authorized_emails",
    },
  };
}

type AccountRow = {
  is_active?: boolean;
  notification_emails: unknown;
};

async function fetchAccountRow({
  serviceRoleKey,
  target,
  url,
}: {
  serviceRoleKey: string;
  target: AccountTarget;
  url: string;
}) {
  // authorized_emails has no is_active column — only dashboard_accounts does.
  const select =
    target.table === "dashboard_accounts"
      ? "notification_emails,is_active"
      : "notification_emails";

  const response = await fetch(
    `${url}/rest/v1/${target.table}?${target.filter}&select=${select}&limit=1`,
    { headers: authHeaders(serviceRoleKey), cache: "no-store" }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { detail, ok: false as const };
  }

  const [row] = (await response.json()) as AccountRow[];
  return { ok: true as const, row: row ?? null };
}

/**
 * A Google account can be authorized through profiles.role alone (the legacy
 * fallback in lib/auth.ts), in which case there is no authorized_emails row to
 * store anything on. Say so plainly instead of failing with a generic error.
 */
function missingRowError(target: AccountTarget) {
  return target.table === "authorized_emails"
    ? jsonError(
        "此 Google 帳號不在後台授權名單中，無法設定通知信箱，請聯絡管理員將您加入名單。",
        404
      )
    : jsonError("找不到目前登入帳號。", 404);
}

export async function GET() {
  try {
    const guard = await requireDashboardAccount();
    if (!guard.ok) return guard.error;

    const { serviceRoleKey, url } = getSupabaseConfig();
    const result = await fetchAccountRow({
      serviceRoleKey,
      target: guard.target,
      url,
    });

    if (!result.ok) {
      console.error("Notification emails query failed:", result.detail);
      return jsonError(
        result.detail.includes("notification_emails")
          ? MISSING_COLUMN_ERROR
          : "查詢通知信箱失敗，請稍後再試。",
        500
      );
    }

    if (!result.row) {
      return missingRowError(guard.target);
    }

    return NextResponse.json({
      success: true,
      notificationEmails: parseNotificationEmails(
        result.row.notification_emails
      ),
    });
  } catch (error) {
    console.error("Notification emails GET error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireDashboardAccount();
    if (!guard.ok) return guard.error;

    const body = (await request.json()) as { notificationEmails?: unknown };
    const validation = validateNotificationEmails(body.notificationEmails);
    if (!validation.ok) {
      return jsonError(validation.error);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const result = await fetchAccountRow({
      serviceRoleKey,
      target: guard.target,
      url,
    });

    if (!result.ok) {
      console.error("Notification emails query failed:", result.detail);
      return jsonError(
        result.detail.includes("notification_emails")
          ? MISSING_COLUMN_ERROR
          : "查詢帳號失敗，請稍後再試。",
        500
      );
    }

    if (!result.row) {
      return missingRowError(guard.target);
    }
    if (result.row.is_active === false) {
      return jsonError("目前帳號已停用，無法修改通知信箱。", 403);
    }

    const updateRes = await fetch(
      `${url}/rest/v1/${guard.target.table}?${guard.target.filter}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(serviceRoleKey),
          "content-type": "application/json",
        },
        body: JSON.stringify({ notification_emails: validation.emails }),
      }
    );

    if (!updateRes.ok) {
      const detail = await updateRes.text().catch(() => "");
      console.error("Notification emails update failed:", detail);
      return jsonError(
        detail.includes("notification_emails")
          ? MISSING_COLUMN_ERROR
          : "通知信箱更新失敗，請稍後再試。",
        500
      );
    }

    return NextResponse.json({
      success: true,
      notificationEmails: validation.emails,
    });
  } catch (error) {
    console.error("Notification emails POST error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
