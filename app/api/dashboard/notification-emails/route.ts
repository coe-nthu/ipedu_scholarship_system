import { NextResponse } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import {
  parseNotificationEmails,
  validateNotificationEmails,
} from "@/lib/notification-emails";

/**
 * Self-serve notification inbox settings for 帳密 dashboard accounts.
 *
 * Mirrors app/api/dashboard/password/route.ts: 系所 accounts never see the
 * admin panel, so this is the only way they can maintain their own field.
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

type PasswordAccountGuard =
  | { ok: true; username: string }
  | { error: NextResponse; ok: false };

/** 只有帳密登入的後台帳號有 dashboard_accounts 列可以寫。 */
async function requirePasswordAccount(): Promise<PasswordAccountGuard> {
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

  if (auth.authProvider !== "password" || !auth.username) {
    return {
      error: jsonError("只有帳密登入的系所帳號可以設定通知信箱。", 403),
      ok: false,
    };
  }

  return { ok: true, username: auth.username.trim().toLowerCase() };
}

type DashboardAccountRow = {
  is_active: boolean;
  notification_emails: unknown;
};

async function fetchAccountRow({
  encodedUsername,
  serviceRoleKey,
  url,
}: {
  encodedUsername: string;
  serviceRoleKey: string;
  url: string;
}) {
  const response = await fetch(
    `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}&select=notification_emails,is_active&limit=1`,
    { headers: authHeaders(serviceRoleKey), cache: "no-store" }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { detail, ok: false as const };
  }

  const [row] = (await response.json()) as DashboardAccountRow[];
  return { ok: true as const, row: row ?? null };
}

export async function GET() {
  try {
    const guard = await requirePasswordAccount();
    if (!guard.ok) return guard.error;

    const { serviceRoleKey, url } = getSupabaseConfig();
    const result = await fetchAccountRow({
      encodedUsername: encodeURIComponent(guard.username),
      serviceRoleKey,
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
      return jsonError("找不到目前登入帳號。", 404);
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
    const guard = await requirePasswordAccount();
    if (!guard.ok) return guard.error;

    const body = (await request.json()) as { notificationEmails?: unknown };
    const validation = validateNotificationEmails(body.notificationEmails);
    if (!validation.ok) {
      return jsonError(validation.error);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const encodedUsername = encodeURIComponent(guard.username);
    const result = await fetchAccountRow({
      encodedUsername,
      serviceRoleKey,
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
      return jsonError("找不到目前登入帳號。", 404);
    }
    if (!result.row.is_active) {
      return jsonError("目前帳號已停用，無法修改通知信箱。", 403);
    }

    const updateRes = await fetch(
      `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}`,
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
