import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DOCUMENT_PREFIX = "document_";
const STORAGE_BUCKET = "scholarship-documents";
const REQUIRED_DOCUMENT_FIELDS = [
  "transcript",
  "advisorRecommendation",
  "learningPlan",
  "noFullTimeDeclaration",
];

type SupabaseFileRecord = {
  field: string;
  label: string | null;
  name: string;
  path: string;
  type: string;
  size: number;
};

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
  otherReviewDocuments?: Array<{
    name?: string;
  }>;
  [key: string]: unknown;
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

function parsePayload(rawPayload: FormDataEntryValue | null) {
  if (typeof rawPayload !== "string") {
    throw new Error("缺少申請資料。");
  }

  const payload = JSON.parse(rawPayload) as ScholarshipPayload;
  const applicantInfo = payload.applicantInfo || {};

  if (!applicantInfo.applicantName || !applicantInfo.department) {
    throw new Error("請填寫申請人姓名與所屬學系所。");
  }

  return payload;
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function uploadFile(
  supabaseUrl: string,
  serviceRoleKey: string,
  applicationId: string,
  field: string,
  file: File,
  label: string | null = null
): Promise<SupabaseFileRecord> {
  const safeFileName = sanitizeFileName(file.name) || "upload";
  const path = `${applicationId}/${field}/${Date.now()}-${safeFileName}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(path).replace(/%2F/g, "/")}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "cache-control": "3600",
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`檔案 ${file.name} 上傳失敗。`);
  }

  return {
    field,
    label,
    name: file.name,
    path,
    type: file.type,
    size: file.size,
  };
}

function getDocumentLabel(payload: ScholarshipPayload, field: string) {
  const match = field.match(/^otherReviewDocuments_(\d+)$/);

  if (match) {
    const index = Number(match[1]);
    return payload.otherReviewDocuments?.[index]?.name || null;
  }

  return null;
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

    const { serviceRoleKey, url } = getSupabaseConfig();
    const formData = await request.formData();
    const payload = parsePayload(formData.get("payload"));
    const status = formData.get("status") === "submitted" ? "submitted" : "draft";
    const applicationId = crypto.randomUUID();
    const files: SupabaseFileRecord[] = [];
    const otherReviewDocumentFields = Array.from(formData.keys()).filter(
      (field) => field.match(/^document_otherReviewDocuments_\d+$/)
    );

    if (
      otherReviewDocumentFields.length > 1 ||
      (payload.otherReviewDocuments?.length || 0) > 1
    ) {
      return jsonError("其他有利審查文件限上傳一件。");
    }

    if (status === "submitted") {
      const missingDocuments = REQUIRED_DOCUMENT_FIELDS.filter((field) => {
        const file = formData.get(`${DOCUMENT_PREFIX}${field}`);
        return !(file instanceof File) || file.size === 0;
      });

      if (missingDocuments.length > 0) {
        return jsonError("送出申請前請上傳所有必繳文件。");
      }
    }

    for (const [field, value] of formData.entries()) {
      if (
        field.startsWith(DOCUMENT_PREFIX) &&
        value instanceof File &&
        value.size > 0
      ) {
        const documentField = field.replace(DOCUMENT_PREFIX, "");

        files.push(
          await uploadFile(
            url,
            serviceRoleKey,
            applicationId,
            documentField,
            value,
            getDocumentLabel(payload, documentField)
          )
        );
      }
    }

    const applicant = payload.applicantInfo || {};
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
          scholarship_program: "國科會-培育優秀博士生獎學金",
          applicant_name: applicant.applicantName,
          student_id: applicant.studentId || null,
          department: applicant.department,
          email: applicant.email || null,
          phone: applicant.phone || null,
          advisor_name: applicant.advisorName || null,
          admission_academic_year: applicant.admissionAcademicYear || null,
          application_type: applicant.applicationType || null,
          gpa: academic.cumulativeGpa || null,
          gpa_scale: academic.cumulativeGpaScale || null,
          status,
          payload,
          files,
        }),
      }
    );

    if (!insertResponse.ok) {
      throw new Error("Supabase 資料寫入失敗。");
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
