import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
/*  GET — Fetch all submitted applications for the dashboard           */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("請先登入。", 401);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();

    const response = await fetch(
      `${url}/rest/v1/scholarship_applications?submission_status=eq.submitted&order=submitted_at.desc&select=id,applicant_name,student_id,department,advisor_name,gpa,gpa_scale,submission_status,review_status,reviewer_remarks,payload,files,submitted_at,created_at,updated_at`,
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

    const applications = await response.json();

    return NextResponse.json({ success: true, applications });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "伺服器處理時發生錯誤。";
    return jsonError(message, 500);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update review_status and/or reviewer_remarks               */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError("請先登入。", 401);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as {
      applicationId?: string;
      review_status?: string;
      reviewer_remarks?: string;
    };

    const { applicationId, review_status, reviewer_remarks } = body;

    if (!applicationId) {
      return jsonError("缺少 applicationId。");
    }

    if (review_status === undefined && reviewer_remarks === undefined) {
      return jsonError("請提供要更新的欄位。");
    }

    // Build update payload
    const updateFields: Record<string, unknown> = {
      reviewed_by: user.id,
    };
    if (review_status !== undefined) {
      updateFields.review_status = review_status;
    }
    if (reviewer_remarks !== undefined) {
      updateFields.reviewer_remarks = reviewer_remarks;
    }

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
        body: JSON.stringify(updateFields),
      }
    );

    if (!updateResponse.ok) {
      throw new Error("更新失敗。");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "伺服器處理時發生錯誤。";
    return jsonError(message, 500);
  }
}
