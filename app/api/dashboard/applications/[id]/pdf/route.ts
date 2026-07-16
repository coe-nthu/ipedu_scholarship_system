import { NextResponse } from "next/server";
import { canAccessDepartment, checkDashboardAccess } from "@/lib/auth";
import { getDashboardRolePermissions } from "@/lib/dashboard-permissions";
import { createApplicationDetailPdf } from "@/lib/dashboard-application-pdf";
import type { ScholarshipApplication } from "@/lib/types";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";

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

function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }
    const permissions = await getDashboardRolePermissions(auth.role);
    if (!permissions.exportPdf) {
      return jsonError("此角色目前無法匯出申請資料 PDF。", 403);
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return jsonError("applicationId 格式不合法。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const response = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${id}&select=id,applicant_name,student_id,department,advisor_name,gpa,gpa_scale,program_key,scholarship_program,submission_status,review_status,reviewer_remarks,payload,files,submitted_at,created_at,updated_at&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("查詢申請案失敗。");
    }

    const [application] = (await response.json()) as ScholarshipApplication[];
    if (!application) {
      return jsonError("找不到該申請案。", 404);
    }

    if (!canAccessDepartment(auth.departmentScope, application.department)) {
      return jsonError("無權限匯出此系所申請案。", 403);
    }

    const pdf = await createApplicationDetailPdf(application);
    const fileName = `${safeFilePart(application.student_id)}_${safeFilePart(
      application.applicant_name
    )}_申請資料詳情.pdf`;
    const encodedName = encodeURIComponent(fileName).replace(/%20/g, "+");

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "content-length": String(pdf.length),
        "content-type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("Application PDF export error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
