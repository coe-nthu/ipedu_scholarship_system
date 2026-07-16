import { NextResponse } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import {
  DASHBOARD_ACTION_KEYS,
  DEFAULT_DASHBOARD_PERMISSION_SETTINGS,
  getDashboardPermissionSettings,
  isDashboardActionPermissions,
  normalizeDashboardPermissionSettings,
  type DashboardActionPermissions,
} from "@/lib/dashboard-permissions";
import type { DashboardRole } from "@/lib/types";

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

export async function GET() {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const permissions = await getDashboardPermissionSettings();
    return NextResponse.json({ success: true, permissions });
  } catch (error) {
    console.error("Dashboard permissions GET error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

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
      return jsonError("只有管理員可以修改功能權限。", 403);
    }

    const body = (await request.json()) as {
      permissions?: Partial<Record<DashboardRole, DashboardActionPermissions>>;
    };
    const incoming = body.permissions;
    if (!incoming || typeof incoming !== "object") {
      return jsonError("請提供權限設定。");
    }

    for (const role of ["admin", "teacher"] as const) {
      if (
        incoming[role] !== undefined &&
        !isDashboardActionPermissions(incoming[role])
      ) {
        return jsonError("權限設定格式不合法。");
      }
    }

    const merged = {
      admin: incoming.admin ?? DEFAULT_DASHBOARD_PERMISSION_SETTINGS.admin,
      teacher:
        incoming.teacher ?? DEFAULT_DASHBOARD_PERMISSION_SETTINGS.teacher,
    };

    const { serviceRoleKey, url } = getSupabaseConfig();
    const rows = (["admin", "teacher"] as const).map((role) => ({
      permissions: DASHBOARD_ACTION_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: merged[role][key] }),
        {} as DashboardActionPermissions
      ),
      role,
    }));

    const response = await fetch(
      `${url}/rest/v1/dashboard_permission_settings?on_conflict=role`,
      {
        method: "POST",
        headers: {
          ...authHeaders(serviceRoleKey),
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(rows),
      }
    );

    if (!response.ok) {
      console.error("Dashboard permissions PATCH failed:", await response.text());
      return jsonError("功能權限儲存失敗，請確認資料庫已套用最新 schema。", 500);
    }

    const saved = (await response.json()) as {
      permissions: unknown;
      role: string;
    }[];
    return NextResponse.json({
      success: true,
      permissions: normalizeDashboardPermissionSettings(saved),
    });
  } catch (error) {
    console.error("Dashboard permissions PATCH error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
