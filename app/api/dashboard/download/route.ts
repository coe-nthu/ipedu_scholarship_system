import { NextResponse, type NextRequest } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import { isValidStoragePath } from "@/lib/validation";

const STORAGE_BUCKET = "scholarship-documents";

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

/**
 * GET /api/dashboard/download?path=...&name=...
 *
 * Proxies a file from Supabase Storage and serves it with the
 * original filename in Content-Disposition so the browser saves
 * it using the name the student originally uploaded.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。" },
        { status: auth.reason === "not_authenticated" ? 401 : 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");
    const fileName = searchParams.get("name");

    if (!filePath || !isValidStoragePath(filePath)) {
      return NextResponse.json(
        { error: "檔案路徑不合法。" },
        { status: 400 }
      );
    }

    const { serviceRoleKey, url } = getSupabaseConfig();

    // Fetch the file from Supabase Storage
    const storageUrl = `${url}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`;
    const fileResponse = await fetch(storageUrl, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: "檔案下載失敗。" },
        { status: fileResponse.status }
      );
    }

    const blob = await fileResponse.blob();
    const downloadName = fileName || filePath.split("/").pop() || "download.pdf";

    // RFC 5987 encoding for non-ASCII filenames
    const encodedName = encodeURIComponent(downloadName).replace(/%20/g, "+");

    return new NextResponse(blob, {
      headers: {
        "content-type": fileResponse.headers.get("content-type") || "application/pdf",
        "content-disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "content-length": String(blob.size),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "伺服器處理時發生錯誤。" },
      { status: 500 }
    );
  }
}
