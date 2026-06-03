import { NextResponse } from "next/server";
import {
  canAccessDepartment,
  checkDashboardAccess,
} from "@/lib/auth";
import { sendScholarshipCorrectionEmail } from "@/lib/email/resend";
import type { ScholarshipPayload } from "@/lib/types";
import { isValidUUID } from "@/lib/validation";

const MAX_MESSAGE_LENGTH = 2000;

type CorrectionEmailRequest = {
  applicationId?: string;
  message?: string;
};

type ScholarshipApplicationRecord = {
  id: string;
  applicant_name: string | null;
  department: string | null;
  email: string | null;
  payload: ScholarshipPayload;
  scholarship_program: string | null;
  submission_status: string;
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

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getRecipientEmail(application: ScholarshipApplicationRecord) {
  return (
    application.email?.trim() ||
    application.payload.applicantInfo?.email?.trim() ||
    ""
  );
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

    const body = (await request.json()) as CorrectionEmailRequest;
    const applicationId = body.applicationId?.trim();
    const message = body.message?.trim() ?? "";

    if (!applicationId) {
      return jsonError("缺少 applicationId。");
    }

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    if (!message) {
      return jsonError("請填寫需補正內容。");
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonError(`需補正內容不可超過 ${MAX_MESSAGE_LENGTH} 字。`);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const query = new URLSearchParams({
      id: `eq.${applicationId}`,
      limit: "1",
      select:
        "id,applicant_name,department,email,payload,scholarship_program,submission_status",
    });

    const checkResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?${query}`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!checkResponse.ok) {
      throw new Error("查詢申請案失敗。");
    }

    const [application] =
      (await checkResponse.json()) as ScholarshipApplicationRecord[];

    if (!application) {
      return jsonError("找不到該申請案。", 404);
    }

    if (!canAccessDepartment(auth.departmentScope, application.department)) {
      return jsonError("無權限通知此系所申請案。", 403);
    }

    if (application.submission_status !== "submitted") {
      return jsonError("此申請案目前不是已送出狀態，無法退回補正。");
    }

    const recipientEmail = getRecipientEmail(application);
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return jsonError("找不到可寄送的學生 Email。");
    }

    const emailId = await sendScholarshipCorrectionEmail({
      applicationId: application.id,
      applicantName:
        application.applicant_name ||
        application.payload.applicantInfo?.applicantName ||
        "",
      department:
        application.department ||
        application.payload.applicantInfo?.department ||
        "",
      message,
      recipientEmail,
      scholarshipProgram: application.scholarship_program || "獎學金申請",
    });

    const updateResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${application.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          reviewed_by: auth.userId,
          review_status: "未審核",
          reviewer_remarks: message,
          submission_status: "draft",
          submitted_at: null,
        }),
      }
    );

    if (!updateResponse.ok) {
      throw new Error("退回申請案失敗。");
    }

    const [updated] = (await updateResponse.json()) as unknown[];

    return NextResponse.json({
      success: true,
      application: updated,
      emailId,
    });
  } catch (error) {
    console.error("Dashboard correction email error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
