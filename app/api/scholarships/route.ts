import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ScholarshipPayload = {
  applicantInfo?: {
    applicantName?: string;
    studentId?: string;
    department?: string;
    email?: string;
    phone?: string;
    advisorName?: string;
    admissionAcademicYear?: string;
    applicationType?: string;
  };
  academicPerformance?: {
    cumulativeGpa?: string;
    cumulativeGpaScale?: string;
  };
  [key: string]: unknown;
};

type SupabaseFileRecord = {
  field: string;
  label: string | null;
  name: string;
  path: string;
  type: string;
  size: number;
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

/* ------------------------------------------------------------------ */
/*  POST — Create application record (JSON only, no files)             */
/* ------------------------------------------------------------------ */

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

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as {
      applicationId: string;
      payload: ScholarshipPayload;
      status: string;
    };

    const { applicationId, payload, status } = body;

    if (!applicationId || !payload) {
      return jsonError("缺少必要欄位。");
    }

    const applicantInfo = payload.applicantInfo || {};
    if (!applicantInfo.applicantName || !applicantInfo.department) {
      return jsonError("請填寫申請人姓名與所屬學系所。");
    }

    const submissionStatus =
      status === "submitted" ? "submitted" : "draft";
    const academic = payload.academicPerformance || {};

    const insertResponse = await fetch(
      `${url}/rest/v1/scholarship_applications`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          id: applicationId,
          user_id: user.id,
          scholarship_program: "國科會-培育優秀博士生獎學金",
          applicant_name: applicantInfo.applicantName,
          student_id: applicantInfo.studentId || null,
          department: applicantInfo.department,
          email: applicantInfo.email || null,
          phone: applicantInfo.phone || null,
          advisor_name: applicantInfo.advisorName || null,
          admission_academic_year:
            applicantInfo.admissionAcademicYear || null,
          application_type: applicantInfo.applicationType || null,
          gpa: academic.cumulativeGpa || null,
          gpa_scale: academic.cumulativeGpaScale || null,
          submission_status: submissionStatus,
          payload,
          files: [],
        }),
      }
    );

    if (!insertResponse.ok) {
      throw new Error("Supabase 資料寫入失敗。");
    }

    return NextResponse.json({
      success: true,
      applicationId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "伺服器處理時發生錯誤。";
    return jsonError(message, 500);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update file metadata after client-side uploads             */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("請先使用 Google 帳戶登入。", 401);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as {
      applicationId: string;
      files: SupabaseFileRecord[];
    };

    const { applicationId, files } = body;

    if (!applicationId || !Array.isArray(files)) {
      return jsonError("缺少必要欄位。");
    }

    // Verify the application belongs to this user
    const checkResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}&user_id=eq.${user.id}&select=id`,
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

    const records = (await checkResponse.json()) as { id: string }[];
    if (records.length === 0) {
      return jsonError("找不到該申請案或無權限。", 403);
    }

    // Update the files metadata
    const updateResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({ files }),
      }
    );

    if (!updateResponse.ok) {
      throw new Error("檔案資料更新失敗。");
    }

    return NextResponse.json({
      success: true,
      applicationId,
      files,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "伺服器處理時發生錯誤。";
    return jsonError(message, 500);
  }
}
