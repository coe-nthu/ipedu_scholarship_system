import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const message =
      error instanceof Error ? error.message : "伺服器處理時發生錯誤。";
    return jsonError(message, 500);
  }
}
