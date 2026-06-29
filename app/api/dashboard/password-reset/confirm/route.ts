import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createDashboardPasswordHash } from "@/lib/auth";

const MAX_CODE_ATTEMPTS = 5;

type DashboardAccountRow = {
  is_active: boolean;
  recovery_email: string | null;
  username: string;
};

type ResetCodeRow = {
  attempt_count: number;
  code_hash: string;
  created_at: string;
  expires_at: string;
  id: string;
  used_at: string | null;
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidCode(value: string) {
  return /^\d{6}$/.test(value);
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return (
    aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
  );
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

async function incrementAttempt(
  url: string,
  headers: Record<string, string>,
  row: ResetCodeRow
) {
  await fetch(`${url}/rest/v1/dashboard_password_reset_codes?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ attempt_count: row.attempt_count + 1 }),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      confirmPassword?: string;
      newPassword?: string;
      recoveryEmail?: string;
      username?: string;
    };
    const username = body.username?.trim().toLowerCase() ?? "";
    const recoveryEmail = body.recoveryEmail?.trim().toLowerCase() ?? "";
    const code = body.code?.trim() ?? "";
    const newPassword = body.newPassword ?? "";
    const confirmPassword = body.confirmPassword ?? "";

    if (!username || !recoveryEmail || !code || !newPassword || !confirmPassword) {
      return jsonError("請完整填寫帳號、信箱、驗證碼與新密碼。");
    }
    if (!isValidEmail(recoveryEmail)) {
      return jsonError("重設信箱格式不正確。");
    }
    if (!isValidCode(code)) {
      return jsonError("驗證碼格式不正確。");
    }
    if (newPassword.length < 8) {
      return jsonError("新密碼至少需要 8 個字元。");
    }
    if (newPassword !== confirmPassword) {
      return jsonError("新密碼與確認密碼不一致。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const headers = authHeaders(serviceRoleKey);
    const encodedUsername = encodeURIComponent(username);
    const encodedEmail = encodeURIComponent(recoveryEmail);

    const accountRes = await fetch(
      `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}&select=username,recovery_email,is_active&limit=1`,
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
      return jsonError("驗證碼不正確或已失效。");
    }

    const codeRes = await fetch(
      `${url}/rest/v1/dashboard_password_reset_codes?username=eq.${encodedUsername}&recovery_email=eq.${encodedEmail}&used_at=is.null&select=id,code_hash,expires_at,attempt_count,used_at,created_at&order=created_at.desc&limit=1`,
      { headers, cache: "no-store" }
    );

    if (!codeRes.ok) {
      throw new Error("查詢驗證碼失敗。");
    }

    const [resetCode] = (await codeRes.json()) as ResetCodeRow[];
    if (!resetCode) {
      return jsonError("驗證碼不正確或已失效。");
    }

    if (
      resetCode.used_at ||
      new Date(resetCode.expires_at).getTime() <= Date.now() ||
      resetCode.attempt_count >= MAX_CODE_ATTEMPTS
    ) {
      return jsonError("驗證碼不正確或已失效。");
    }

    const expectedHash = createCodeHash(username, recoveryEmail, code);
    if (!safeEqual(expectedHash, resetCode.code_hash)) {
      await incrementAttempt(url, headers, resetCode);
      return jsonError("驗證碼不正確或已失效。");
    }

    const passwordRes = await fetch(
      `${url}/rest/v1/dashboard_accounts?username=eq.${encodedUsername}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          password_hash: createDashboardPasswordHash(newPassword),
        }),
      }
    );

    if (!passwordRes.ok) {
      console.error("Dashboard password reset failed:", await passwordRes.text());
      return jsonError("密碼重設失敗，請稍後再試。", 500);
    }

    const usedAt = new Date().toISOString();
    const invalidateRes = await fetch(
      `${url}/rest/v1/dashboard_password_reset_codes?username=eq.${encodedUsername}&recovery_email=eq.${encodedEmail}&used_at=is.null`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ used_at: usedAt }),
      }
    );

    if (!invalidateRes.ok) {
      console.error(
        "Dashboard password reset code invalidation failed:",
        await invalidateRes.text()
      );
    }

    return NextResponse.json({
      success: true,
      message: "密碼已重設，請使用新密碼登入。",
    });
  } catch (error) {
    console.error("Dashboard password reset confirm error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
