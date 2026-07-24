import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  getDefaultScholarshipProgramSetting,
  type ScholarshipProgramKey,
} from "@/lib/scholarship-settings";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";

const STORAGE_BUCKET = "scholarship-documents";
const PDF_MIME_TYPE = "application/pdf";
const STORAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

type UploadUrlRequest = {
  applicationId?: string;
  contentType?: string;
  fileName?: string;
  path?: string;
};

type ExistingApplicationAccessRecord = {
  id: string;
  program_key: string;
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

function isPdfFile(fileName: string, contentType: string) {
  return (
    fileName.toLowerCase().endsWith(".pdf") && contentType === PDF_MIME_TYPE
  );
}

async function fetchProgramSetting({
  programKey,
  serviceRoleKey,
  url,
}: {
  programKey: ScholarshipProgramKey;
  serviceRoleKey: string;
  url: string;
}) {
  const query = new URLSearchParams({
    limit: "1",
    program_key: `eq.${programKey}`,
    select: "program_key,is_open,is_correction_open",
  });

  const response = await fetch(
    `${url}/rest/v1/scholarship_program_settings?${query}`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("獎學金開放設定查詢失敗。");
  }

  const [setting] = (await response.json()) as {
    is_correction_open: boolean;
    is_open: boolean;
    program_key: ScholarshipProgramKey;
  }[];

  return setting ?? getDefaultScholarshipProgramSetting(programKey);
}

function getUploadAccessError(
  setting: Awaited<ReturnType<typeof fetchProgramSetting>>,
  application: ExistingApplicationAccessRecord
) {
  if (setting?.is_open) {
    return null;
  }

  if (application.submission_status !== "draft") {
    return "此獎學金目前已關閉，只有退回補正的草稿可上傳檔案。";
  }

  if (!setting?.is_correction_open) {
    return "此獎學金目前未開放補正。";
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

    const body = (await request.json()) as UploadUrlRequest;
    const applicationId = body.applicationId?.trim();
    const contentType = body.contentType?.trim() || "";
    const fileName = body.fileName?.trim() || "";
    const path = body.path?.trim() || "";

    if (!applicationId || !path || !fileName) {
      return jsonError("缺少必要欄位。");
    }

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    if (
      !isPdfFile(fileName, contentType) ||
      !path.toLowerCase().endsWith(".pdf")
    ) {
      return jsonError("只能上傳 PDF 檔案。");
    }

    if (
      !path.startsWith(`${applicationId}/`) ||
      !STORAGE_PATH_PATTERN.test(path)
    ) {
      return jsonError("檔案路徑不合法。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();

    const checkResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}&user_id=eq.${user.id}&select=id,program_key,submission_status`,
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

    const records = (await checkResponse.json()) as ExistingApplicationAccessRecord[];
    const application = records[0];
    if (!application) {
      return jsonError("找不到該申請案或無權限。", 403);
    }

    const accessError = getUploadAccessError(
      await fetchProgramSetting({
        programKey: application.program_key as ScholarshipProgramKey,
        serviceRoleKey,
        url,
      }),
      application
    );
    if (accessError) {
      return jsonError(accessError, 403);
    }

    const admin = createSupabaseAdminClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { data, error } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data?.token) {
      throw new Error(error?.message || "建立上傳授權失敗。");
    }

    return NextResponse.json({
      success: true,
      path: data.path,
      token: data.token,
    });
  } catch (error) {
    console.error("Upload URL error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
