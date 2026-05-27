import { NextResponse } from "next/server";
import {
  setDashboardPasswordSession,
  verifyDashboardPassword,
} from "@/lib/auth";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      password?: string;
      username?: string;
    };
    const username = body.username?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return jsonError("請輸入帳號與密碼。");
    }

    const account = await verifyDashboardPassword(username, password);
    if (!account) {
      return jsonError("帳號或密碼不正確。", 401);
    }

    await setDashboardPasswordSession(account);

    return NextResponse.json({
      success: true,
      displayName: account.displayName,
      role: account.role,
    });
  } catch (error) {
    console.error("Dashboard login error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
