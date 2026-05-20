import { NextResponse } from "next/server";
import { sendScholarshipConfirmationEmail } from "@/lib/email/resend";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";

type ConfirmationEmailRequest = {
  applicationId?: string;
};

type ScholarshipApplicationRecord = {
  id: string;
  applicant_name: string | null;
  department: string | null;
  email: string | null;
  scholarship_program: string | null;
  submitted_at: string | null;
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("請先使用 Google 帳戶登入。", 401);
    }

    const body = (await request.json()) as ConfirmationEmailRequest;
    const applicationId = body.applicationId?.trim();

    if (!applicationId) {
      return jsonError("缺少申請編號。");
    }

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const checkResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}&user_id=eq.${user.id}&select=id,applicant_name,department,email,scholarship_program,submitted_at,submission_status`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!checkResponse.ok) {
      throw new Error("資料查詢失敗。");
    }

    const records = (await checkResponse.json()) as ScholarshipApplicationRecord[];
    const application = records[0];

    if (!application) {
      return jsonError("找不到該申請案或無權限。", 403);
    }

    if (application.submission_status !== "submitted") {
      return jsonError("草稿尚未正式送出，不寄送確認信。", 400);
    }

    const recipientEmail = application.email || user.email;
    if (!recipientEmail) {
      return jsonError("找不到可寄送的 Email。", 400);
    }

    const emailId = await sendScholarshipConfirmationEmail({
      applicationId: application.id,
      applicantName: application.applicant_name || "",
      department: application.department || "",
      recipientEmail,
      scholarshipProgram:
        application.scholarship_program || "獎學金申請",
      submittedAt: application.submitted_at,
    });

    return NextResponse.json({
      success: true,
      emailId,
    });
  } catch (error) {
    console.error("Confirmation email error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
