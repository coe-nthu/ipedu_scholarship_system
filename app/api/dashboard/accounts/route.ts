import { NextResponse } from "next/server";
import { checkDashboardAccess, isDashboardScope } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import type {
  DashboardAccountEntry,
  DashboardDepartmentScope,
  DashboardRole,
} from "@/lib/types";

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

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function authHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
}

function normalizeScope(value: unknown): DashboardDepartmentScope {
  return isDashboardScope(value) ? value : "all";
}

/* ------------------------------------------------------------------ */
/*  GET — List unified accounts (password + google)                    */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const headers = authHeaders(serviceRoleKey);

    const [passwordRes, googleRes] = await Promise.all([
      fetch(
        `${url}/rest/v1/dashboard_accounts?order=username.asc&select=username,display_name,role,department_scope,is_active`,
        { headers, cache: "no-store" }
      ),
      fetch(
        `${url}/rest/v1/authorized_emails?order=created_at.asc&select=id,email,role,department_scope`,
        { headers, cache: "no-store" }
      ),
    ]);

    if (!passwordRes.ok || !googleRes.ok) {
      throw new Error("查詢帳號失敗。");
    }

    const passwordRows = (await passwordRes.json()) as {
      username: string;
      display_name: string;
      role: DashboardRole;
      department_scope: unknown;
      is_active: boolean;
    }[];

    const googleRows = (await googleRes.json()) as {
      id: string;
      email: string;
      role: DashboardRole;
      department_scope: unknown;
    }[];

    const accounts: DashboardAccountEntry[] = [
      ...passwordRows.map((row) => ({
        kind: "password" as const,
        key: row.username,
        label: row.username,
        displayName: row.display_name || row.username,
        role: row.role,
        departmentScope: normalizeScope(row.department_scope),
        isActive: row.is_active,
      })),
      ...googleRows.map((row) => ({
        kind: "google" as const,
        key: row.id,
        label: row.email,
        displayName: row.email,
        role: row.role,
        departmentScope: normalizeScope(row.department_scope),
        isActive: true,
      })),
    ];

    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error("Accounts GET error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update an account's role and/or department scope (admin)   */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    if (auth.role !== "admin") {
      return jsonError("只有管理員可以修改帳號權限。", 403);
    }

    const body = (await request.json()) as {
      kind?: string;
      key?: string;
      role?: string;
      departmentScope?: unknown;
    };
    const { kind, key, role, departmentScope } = body;

    if (kind !== "password" && kind !== "google") {
      return jsonError("帳號類型不合法。");
    }
    if (!key || typeof key !== "string") {
      return jsonError("缺少帳號識別碼。");
    }
    if (kind === "google" && !isValidUUID(key)) {
      return jsonError("帳號識別碼格式不合法。");
    }
    if (role !== undefined && role !== "teacher" && role !== "admin") {
      return jsonError("角色必須是 teacher 或 admin。");
    }
    if (departmentScope !== undefined && !isDashboardScope(departmentScope)) {
      return jsonError("系所範圍格式不合法。");
    }
    if (role === undefined && departmentScope === undefined) {
      return jsonError("請提供要更新的欄位。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const headers = authHeaders(serviceRoleKey);

    // Load the target row to apply self/last-admin protections.
    const filter =
      kind === "google"
        ? `id=eq.${key}`
        : `username=eq.${encodeURIComponent(key.trim().toLowerCase())}`;
    const selectCols =
      kind === "google" ? "email,role" : "username,role";

    const checkRes = await fetch(
      `${url}/rest/v1/${
        kind === "google" ? "authorized_emails" : "dashboard_accounts"
      }?${filter}&select=${selectCols}`,
      { headers, cache: "no-store" }
    );

    if (!checkRes.ok) {
      throw new Error("查詢帳號失敗。");
    }

    const [existing] = (await checkRes.json()) as {
      email?: string;
      username?: string;
      role: DashboardRole;
    }[];

    if (!existing) {
      return jsonError("找不到此帳號。", 404);
    }

    const isSelf =
      kind === "google" &&
      (existing.email ?? "").toLowerCase() === auth.email.toLowerCase();

    // Prevent self-downgrade from admin to teacher.
    if (
      role === "teacher" &&
      existing.role === "admin" &&
      isSelf
    ) {
      return jsonError("無法降級自己的管理員權限。");
    }

    // Prevent removing the last admin in the whole system.
    if (role === "teacher" && existing.role === "admin") {
      const remaining = await countAdmins(url, headers);
      if (remaining <= 1) {
        return jsonError("無法降級最後一位管理員。");
      }
    }

    const patch: Record<string, unknown> = {};
    if (role !== undefined) patch.role = role;
    if (departmentScope !== undefined) patch.department_scope = departmentScope;

    const table =
      kind === "google" ? "authorized_emails" : "dashboard_accounts";
    const updateRes = await fetch(`${url}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!updateRes.ok) {
      console.error("Accounts PATCH failed:", await updateRes.text());
      return jsonError("更新帳號失敗。", 500);
    }

    // Sync the profiles role for google accounts.
    if (kind === "google" && role !== undefined && existing.email) {
      await fetch(
        `${url}/rest/v1/profiles?email=eq.${encodeURIComponent(
          existing.email.toLowerCase()
        )}`,
        {
          method: "PATCH",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Accounts PATCH error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/** Count admins across both password and google accounts. */
async function countAdmins(
  url: string,
  headers: Record<string, string>
): Promise<number> {
  const [passwordRes, googleRes] = await Promise.all([
    fetch(
      `${url}/rest/v1/dashboard_accounts?role=eq.admin&is_active=eq.true&select=username`,
      { headers, cache: "no-store" }
    ),
    fetch(`${url}/rest/v1/authorized_emails?role=eq.admin&select=id`, {
      headers,
      cache: "no-store",
    }),
  ]);

  let count = 0;
  if (passwordRes.ok) {
    count += ((await passwordRes.json()) as unknown[]).length;
  }
  if (googleRes.ok) {
    count += ((await googleRes.json()) as unknown[]).length;
  }
  return count;
}
