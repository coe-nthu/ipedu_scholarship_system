import { NextResponse } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import {
  getDefaultScholarshipProgramSetting,
  isScholarshipProgramKey,
  type ScholarshipProgramSetting,
} from "@/lib/scholarship-settings";
import { fetchScholarshipProgramSettings } from "@/lib/scholarship-settings-server";

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

function normalizeText(value: unknown, fieldLabel: string) {
  if (typeof value !== "string") {
    throw new Error(`${fieldLabel} 必須是文字。`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldLabel} 不可空白。`);
  }

  if (trimmed.length > 500) {
    throw new Error(`${fieldLabel} 不可超過 500 字。`);
  }

  return trimmed;
}

function normalizeOptionalText(value: unknown, fieldLabel: string) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldLabel} 必須是文字。`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 500) {
    throw new Error(`${fieldLabel} 不可超過 500 字。`);
  }

  return trimmed;
}

function normalizeBoolean(value: unknown, fieldLabel: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldLabel} 必須是布林值。`);
  }
  return value;
}

function normalizeDisplayOrder(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("排序必須是整數。");
  }

  if (value < 0 || value > 9999) {
    throw new Error("排序必須介於 0 到 9999。");
  }

  return value;
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

    const programs = await fetchScholarshipProgramSettings();
    return NextResponse.json({ success: true, programs });
  } catch (error) {
    console.error("Scholarship program settings error:", error);
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
      return jsonError("只有管理員可以修改獎學金設定。", 403);
    }

    const body = (await request.json()) as Partial<ScholarshipProgramSetting>;
    if (!isScholarshipProgramKey(body.program_key)) {
      return jsonError("獎學金代碼不合法。");
    }

    const fallback = getDefaultScholarshipProgramSetting(body.program_key);
    let payload: ScholarshipProgramSetting;
    try {
      payload = {
        amount: normalizeText(body.amount, "金額"),
        amount_en: normalizeOptionalText(body.amount_en, "英文金額"),
        description: normalizeText(body.description, "卡片說明"),
        description_en: normalizeOptionalText(
          body.description_en,
          "英文卡片說明"
        ),
        display_order: normalizeDisplayOrder(body.display_order),
        eligibility_reminder: normalizeText(
          body.eligibility_reminder,
          "表單提醒"
        ),
        is_open: normalizeBoolean(body.is_open, "開放填寫"),
        is_visible: normalizeBoolean(body.is_visible, "顯示於首頁"),
        period: normalizeText(body.period, "適用對象"),
        period_en: normalizeOptionalText(body.period_en, "英文適用對象"),
        program_key: body.program_key,
        route_path: fallback.route_path,
        status_label: normalizeText(body.status_label, "狀態標籤"),
        status_label_en: normalizeOptionalText(
          body.status_label_en,
          "英文狀態標籤"
        ),
        title: normalizeText(body.title, "獎學金名稱"),
        title_en: normalizeOptionalText(body.title_en, "英文獎學金名稱"),
      };
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "欄位不合法。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/scholarship_program_settings?program_key=eq.${payload.program_key}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          ...payload,
          updated_by: auth.userId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("更新獎學金設定失敗。");
    }

    const [program] = (await response.json()) as ScholarshipProgramSetting[];
    return NextResponse.json({ success: true, program: program ?? payload });
  } catch (error) {
    console.error("Scholarship program settings error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
