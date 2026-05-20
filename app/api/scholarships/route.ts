import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { verifyAllPublications } from "@/lib/verification";

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

const DEFAULT_SCHOLARSHIP_PROGRAM = "國科會-培育優秀博士生獎學金";

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

function normalizeScholarshipProgram(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_SCHOLARSHIP_PROGRAM;
}

/* ------------------------------------------------------------------ */
/*  GET — Fetch existing application for the current user              */
/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
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
    const scholarshipProgram = normalizeScholarshipProgram(
      new URL(request.url).searchParams.get("scholarshipProgram")
    );
    const query = new URLSearchParams({
      limit: "1",
      scholarship_program: `eq.${scholarshipProgram}`,
      select:
        "id,payload,files,submission_status,updated_at,submitted_at",
      user_id: `eq.${user.id}`,
    });

    const response = await fetch(
      `${url}/rest/v1/scholarship_applications?${query}`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("資料查詢失敗。");
    }

    const records = (await response.json()) as {
      id: string;
      payload: ScholarshipPayload;
      files: SupabaseFileRecord[];
      submission_status: string;
      updated_at: string;
      submitted_at: string | null;
    }[];

    if (records.length === 0) {
      return NextResponse.json({ success: true, application: null });
    }

    return NextResponse.json({ success: true, application: records[0] });
  } catch (error) {
    console.error("Scholarships API error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Create or update application record (upsert, JSON only)     */
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
      scholarshipProgram?: string;
      status: string;
    };

    const { applicationId, payload, status } = body;
    const scholarshipProgram = normalizeScholarshipProgram(
      body.scholarshipProgram
    );

    if (!applicationId || !payload) {
      return jsonError("缺少必要欄位。");
    }

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    const applicantInfo = payload.applicantInfo || {};
    if (!applicantInfo.applicantName || !applicantInfo.department) {
      return jsonError("請填寫申請人姓名與所屬學系所。");
    }

    const submissionStatus =
      status === "submitted" ? "submitted" : "draft";
    const academic = payload.academicPerformance || {};

    // Use upsert: if same (user_id, scholarship_program) exists, update it
    const upsertResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?on_conflict=user_id,scholarship_program`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          id: applicationId,
          user_id: user.id,
          scholarship_program: scholarshipProgram,
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
          review_status: "等待人工審核",
          reviewer_remarks: "",
          payload,
        }),
      }
    );

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error("Supabase upsert error:", errorText);
      throw new Error("Supabase 資料寫入失敗。");
    }

    const [record] = (await upsertResponse.json()) as { id: string }[];
    const resolvedId = record?.id || applicationId;

    // ── Run publication verification on submission ──
    let verificationSummary = null;
    if (submissionStatus === "submitted") {
      try {
        const journals = (payload as Record<string, unknown>).journals as
          | import("@/lib/types").Journal[]
          | undefined;
        if (journals && journals.length > 0) {
          const vResult = await verifyAllPublications(journals);

          // Update the application with enriched payload + review_status
          const enrichedPayload = {
            ...(payload as Record<string, unknown>),
            journals: vResult.journals,
            verificationSummary: vResult.summary,
          };
          await fetch(
            `${url}/rest/v1/scholarship_applications?id=eq.${resolvedId}`,
            {
              method: "PATCH",
              headers: {
                apikey: serviceRoleKey,
                authorization: `Bearer ${serviceRoleKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                payload: enrichedPayload,
                review_status: vResult.reviewStatus,
              }),
            }
          );
          verificationSummary = vResult.summary;
        }
      } catch (verifyErr) {
        // Verification failure should not block the submission
        console.error("Publication verification error:", verifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      applicationId: resolvedId,
      verificationSummary,
    });
  } catch (error) {
    console.error("Scholarships API error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
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

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
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
    console.error("Scholarships API error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
