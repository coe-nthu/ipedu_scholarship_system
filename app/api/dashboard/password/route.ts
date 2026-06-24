import { NextResponse } from "next/server";
import {
  checkDashboardAccess,
  createDashboardPasswordHash,
  setDashboardPasswordSession,
  verifyDashboardPassword,
} from "@/lib/auth";

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

export async function POST(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    if (auth.authProvider !== "password" || !auth.username) {
      return jsonError("只有帳密登入帳號可以自行修改密碼。", 403);
    }

    const body = (await request.json()) as {
      confirmPassword?: string;
      currentPassword?: string;
      newPassword?: string;
    };
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    const confirmPassword = body.confirmPassword ?? "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      return jsonError("請完整填寫目前密碼、新密碼與確認密碼。");
    }
    if (newPassword.length < 8) {
      return jsonError("新密碼至少需要 8 個字元。");
    }
    if (newPassword !== confirmPassword) {
      return jsonError("新密碼與確認密碼不一致。");
    }
    if (newPassword === currentPassword) {
      return jsonError("新密碼不可與目前密碼相同。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const headers = authHeaders(serviceRoleKey);
    const username = auth.username.trim().toLowerCase();
    const encodedUsername = encodeURIComponent(username);

    const accountRes = await fetch(
      `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}&select=username,is_active&limit=1`,
      { headers, cache: "no-store" }
    );

    if (!accountRes.ok) {
      throw new Error("查詢帳號失敗。");
    }

    const [accountRow] = (await accountRes.json()) as {
      is_active: boolean;
      username: string;
    }[];

    if (!accountRow) {
      return jsonError("找不到目前登入帳號。", 404);
    }
    if (!accountRow.is_active) {
      return jsonError("目前帳號已停用，無法修改密碼。", 403);
    }

    const account = await verifyDashboardPassword(username, currentPassword);
    if (!account) {
      return jsonError("目前密碼不正確。");
    }

    const updateRes = await fetch(
      `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          password_hash: createDashboardPasswordHash(newPassword),
        }),
      }
    );

    if (!updateRes.ok) {
      console.error("Dashboard password update failed:", await updateRes.text());
      return jsonError("密碼更新失敗，請稍後再試。", 500);
    }

    await setDashboardPasswordSession(account);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dashboard password POST error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
