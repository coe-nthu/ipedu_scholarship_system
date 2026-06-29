import { createHmac, randomInt } from "crypto";
import { NextResponse } from "next/server";
import { sendDashboardPasswordResetCodeEmail } from "@/lib/email/resend";

const CODE_EXPIRES_MINUTES = 10;
const MIN_REQUEST_INTERVAL_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MINUTES = 15;
const GENERIC_SUCCESS_MESSAGE =
  "若帳號與重設信箱正確，系統已寄出驗證碼。";

type DashboardAccountRow = {
  display_name: string;
  is_active: boolean;
  recovery_email: string | null;
  username: string;
};

type ResetCodeRow = {
  created_at: string;
};

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

function getResetSecret() {
  return (
    process.env.DASHBOARD_PASSWORD_RESET_SECRET ||
    process.env.DASHBOARD_SESSION_SECRET ||
    ""
  );
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

function genericSuccess() {
  return NextResponse.json({
    success: true,
    message: GENERIC_SUCCESS_MESSAGE,
  });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createCodeHash(username: string, recoveryEmail: string, code: string) {
  const secret = getResetSecret();
  if (!secret) {
    throw new Error("DASHBOARD_SESSION_SECRET is required.");
  }

  return `sha256:${createHmac("sha256", secret)
    .update(`${username}:${recoveryEmail}:${code}`)
    .digest("hex")}`;
}

function createResetCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      recoveryEmail?: string;
      username?: string;
    };
    const username = body.username?.trim().toLowerCase() ?? "";
    const recoveryEmail = body.recoveryEmail?.trim().toLowerCase() ?? "";

    if (!username || !recoveryEmail) {
      return jsonError("請輸入帳號與重設信箱。");
    }
    if (!isValidEmail(recoveryEmail)) {
      return jsonError("重設信箱格式不正確。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const headers = authHeaders(serviceRoleKey);
    const encodedUsername = encodeURIComponent(username);

    const accountRes = await fetch(
      `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}&select=username,display_name,recovery_email,is_active&limit=1`,
      { headers, cache: "no-store" }
    );

    if (!accountRes.ok) {
      throw new Error("查詢帳號失敗。");
    }

    const [account] = (await accountRes.json()) as DashboardAccountRow[];
    if (
      !account?.username ||
      !account.is_active ||
      !account.recovery_email ||
      account.recovery_email.trim().toLowerCase() !== recoveryEmail
    ) {
      return genericSuccess();
    }

    const windowStart = new Date(
      Date.now() - REQUEST_WINDOW_MINUTES * 60 * 1000
    ).toISOString();
    const recentRes = await fetch(
      `${url}/rest/v1/dashboard_password_reset_codes?username=eq.${encodedUsername}&recovery_email=eq.${encodeURIComponent(
        recoveryEmail
      )}&created_at=gt.${encodeURIComponent(
        windowStart
      )}&select=created_at&order=created_at.desc`,
      { headers, cache: "no-store" }
    );

    if (!recentRes.ok) {
      throw new Error("查詢驗證碼紀錄失敗。");
    }

    const recentRows = (await recentRes.json()) as ResetCodeRow[];
    const latestCreatedAt = recentRows[0]?.created_at
      ? new Date(recentRows[0].created_at).getTime()
      : 0;
    const tooSoon =
      latestCreatedAt > 0 &&
      Date.now() - latestCreatedAt < MIN_REQUEST_INTERVAL_SECONDS * 1000;

    if (tooSoon || recentRows.length >= MAX_REQUESTS_PER_WINDOW) {
      return genericSuccess();
    }

    const now = new Date();
    await fetch(
      `${url}/rest/v1/dashboard_password_reset_codes?username=eq.${encodedUsername}&recovery_email=eq.${encodeURIComponent(
        recoveryEmail
      )}&used_at=is.null`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ used_at: now.toISOString() }),
      }
    );

    const code = createResetCode();
    const expiresAt = new Date(
      now.getTime() + CODE_EXPIRES_MINUTES * 60 * 1000
    ).toISOString();

    const insertRes = await fetch(
      `${url}/rest/v1/dashboard_password_reset_codes`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          code_hash: createCodeHash(username, recoveryEmail, code),
          expires_at: expiresAt,
          recovery_email: recoveryEmail,
          username,
        }),
      }
    );

    if (!insertRes.ok) {
      throw new Error("建立驗證碼失敗。");
    }

    await sendDashboardPasswordResetCodeEmail({
      code,
      displayName: account.display_name || account.username,
      expiresMinutes: CODE_EXPIRES_MINUTES,
      recipientEmail: recoveryEmail,
      username,
    });

    return genericSuccess();
  } catch (error) {
    console.error("Dashboard password reset request error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
