import { NextResponse } from "next/server";
import { canAccessDepartment, checkDashboardAccess } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";
import { verifyPublication, verifyAllPublications } from "@/lib/verification";
import type { Journal, ScholarshipPayload } from "@/lib/types";

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

/**
 * POST /api/dashboard/verify
 *
 * Body: { applicationId: string, journalIndex?: number }
 *   - journalIndex omitted → verify ALL journals
 *   - journalIndex = N     → verify only journals[N]
 *
 * Returns the updated verification results.
 */
export async function POST(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const body = (await request.json()) as {
      applicationId?: string;
      journalIndex?: number;
    };
    const { applicationId, journalIndex } = body;

    if (!applicationId) {
      return jsonError("缺少 applicationId。");
    }
    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();

    // Fetch the application
    const fetchRes = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}&select=id,department,payload,review_status`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!fetchRes.ok) {
      throw new Error("查詢失敗。");
    }

    const records = (await fetchRes.json()) as {
      id: string;
      department: string | null;
      payload: ScholarshipPayload;
      review_status: string;
    }[];

    if (records.length === 0) {
      return jsonError("找不到該申請案。", 404);
    }

    const app = records[0];
    if (!canAccessDepartment(auth.departmentScope, app.department)) {
      return jsonError("無權限驗證此系所申請案。", 403);
    }
    const journals: Journal[] = app.payload.journals ?? [];

    if (journals.length === 0) {
      return NextResponse.json({
        success: true,
        message: "無期刊資料可驗證。",
      });
    }

    let updatedJournals: Journal[];
    let reviewStatus: string;
    let summary;

    if (journalIndex !== undefined && journalIndex >= 0) {
      // Verify a single journal
      if (journalIndex >= journals.length) {
        return jsonError("journalIndex 超出範圍。");
      }

      const result = await verifyPublication(journals[journalIndex]);
      updatedJournals = journals.map((j, i) =>
        i === journalIndex ? { ...j, verification: result } : j
      );

      // Re-evaluate overall status
      const allResults = updatedJournals.map(
        (j) => j.verification?.status ?? "skipped"
      );
      const hasFail = allResults.includes("fail");
      const hasTimeout = allResults.includes("timeout");
      const allGood = allResults.every(
        (s) => s === "pass" || s === "skipped"
      );

      if (hasFail) {
        summary = { status: "has_issues" as const, verifiedAt: new Date().toISOString() };
        reviewStatus = "等待人工審核";
      } else if (hasTimeout) {
        summary = { status: "timeout" as const, verifiedAt: new Date().toISOString() };
        reviewStatus = "等待人工審核";
      } else if (allGood) {
        summary = { status: "all_passed" as const, verifiedAt: new Date().toISOString() };
        reviewStatus = "自動審核完成";
      } else {
        summary = { status: "pending" as const, verifiedAt: new Date().toISOString() };
        reviewStatus = "等待人工審核";
      }
    } else {
      // Verify all journals
      const vResult = await verifyAllPublications(journals);
      updatedJournals = vResult.journals;
      summary = vResult.summary;
      reviewStatus = vResult.reviewStatus;
    }

    // Save results back
    const enrichedPayload = {
      ...app.payload,
      journals: updatedJournals,
      verificationSummary: summary,
    };

    const updateRes = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          payload: enrichedPayload,
          review_status: reviewStatus,
        }),
      }
    );

    if (!updateRes.ok) {
      console.error("Verify PATCH failed:", await updateRes.text());
      return jsonError("驗證結果儲存失敗。", 500);
    }

    return NextResponse.json({
      success: true,
      summary,
      reviewStatus,
      journals: updatedJournals.map((j, i) => ({
        index: i,
        doi: j.doi,
        title: j.title,
        verification: j.verification,
      })),
    });
  } catch (error) {
    console.error("Verify API error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
