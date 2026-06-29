import { NextResponse } from "next/server";
import {
  canAccessDepartment,
  checkDashboardAccess,
  filterApplicationsByScope,
} from "@/lib/auth";
import { isValidUUID, isValidReviewStatus } from "@/lib/validation";
import {
  DATABASE_OPTIONS,
  DEPARTMENT_OPTIONS,
  DASHBOARD_STUDY_STATUS_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  GPA_SCALE_OPTIONS,
  OTHER_AID_STATUS_OPTIONS,
  isAllowedMultiOption,
  isAllowedOption,
} from "@/lib/scholarship-form-options";
import type { Journal, ScholarshipPayload } from "@/lib/types";

/**
 * Validate the reviewer-edited payload and merge it over the existing one.
 * - Enforces fixed-option fields against the shared option lists.
 * - Protects server-owned verification data and student-change metadata:
 *   `verificationSummary` is kept from the DB, and each journal's
 *   `verification` plus DOI autofill change notes are re-attached from the
 *   existing record when a matching journal is found.
 * Returns `{ ok: false, error }` on validation failure.
 */
function validateAndMergePayload(
  incoming: unknown,
  existing: ScholarshipPayload
): { ok: true; merged: ScholarshipPayload } | { ok: false; error: string } {
  if (!incoming || typeof incoming !== "object") {
    return { ok: false, error: "payload 格式不合法。" };
  }
  const p = incoming as Partial<ScholarshipPayload>;
  const { applicantInfo, eligibility, academicPerformance } = p;

  if (
    !applicantInfo ||
    typeof applicantInfo !== "object" ||
    !eligibility ||
    typeof eligibility !== "object" ||
    !academicPerformance ||
    typeof academicPerformance !== "object"
  ) {
    return { ok: false, error: "payload 結構不完整。" };
  }

  const journals = Array.isArray(p.journals) ? p.journals : [];
  const conferences = Array.isArray(p.conferences) ? p.conferences : [];
  const researchExperiences = Array.isArray(p.researchExperiences)
    ? p.researchExperiences
    : [];
  const researchAwards = Array.isArray(p.researchAwards)
    ? p.researchAwards
    : [];
  const plannedResearch = Array.isArray(p.plannedResearch)
    ? p.plannedResearch
    : [];

  // ── Fixed-option validation ──
  if (!isAllowedOption(applicantInfo.department, DEPARTMENT_OPTIONS)) {
    return { ok: false, error: "系所不在允許清單中。" };
  }
  if (!isAllowedOption(applicantInfo.studyStatus, DASHBOARD_STUDY_STATUS_OPTIONS)) {
    return { ok: false, error: "請領別不合法。" };
  }
  if (!isAllowedOption(eligibility.gpaScale, GPA_SCALE_OPTIONS)) {
    return { ok: false, error: "GPA 級距不合法。" };
  }
  if (
    !isAllowedOption(academicPerformance.cumulativeGpaScale, GPA_SCALE_OPTIONS)
  ) {
    return { ok: false, error: "累計 GPA 級距不合法。" };
  }
  if (!isAllowedOption(eligibility.employmentStatus, EMPLOYMENT_STATUS_OPTIONS)) {
    return { ok: false, error: "兼職情形不合法。" };
  }
  if (!isAllowedOption(eligibility.otherAidStatus, OTHER_AID_STATUS_OPTIONS)) {
    return { ok: false, error: "獎助調查不合法。" };
  }
  for (const j of journals) {
    // Journal Edition / 資料庫別 may hold several editions joined by "、".
    if (!isAllowedMultiOption(j?.database, DATABASE_OPTIONS)) {
      return { ok: false, error: "期刊資料庫別不合法。" };
    }
  }
  for (const c of conferences) {
    if (!isAllowedOption(c?.database, DATABASE_OPTIONS)) {
      return { ok: false, error: "研討會資料庫別不合法。" };
    }
  }
  for (const r of plannedResearch) {
    if (!isAllowedOption(r?.database, DATABASE_OPTIONS)) {
      return { ok: false, error: "預計研究資料庫別不合法。" };
    }
  }

  // ── Protect server-owned verification data ──
  const existingJournalByDoi = new Map(
    (existing.journals ?? [])
      .filter((j) => j?.doi)
      .map((j) => [j.doi, j])
  );
  const existingJournals = existing.journals ?? [];
  const mergedJournals: Journal[] = journals.map((j, index) => {
    const existingJournal =
      (j?.doi ? existingJournalByDoi.get(j.doi) : undefined) ??
      existingJournals[index];

    return {
      ...j,
      verification: existingJournal?.verification,
      publicationAutofillBaseline:
        existingJournal?.publicationAutofillBaseline ??
        j.publicationAutofillBaseline,
      publicationChangeNotes:
        existingJournal?.publicationChangeNotes ?? j.publicationChangeNotes,
    };
  });

  const merged: ScholarshipPayload = {
    ...existing,
    ...p,
    applicantInfo: { ...existing.applicantInfo, ...applicantInfo },
    eligibility: { ...existing.eligibility, ...eligibility },
    academicPerformance: {
      ...existing.academicPerformance,
      ...academicPerformance,
    },
    journals: mergedJournals,
    conferences,
    researchExperiences,
    researchAwards,
    plannedResearch,
    // Always keep the server-owned summary; never trust the client value.
    verificationSummary: existing.verificationSummary,
  };

  return { ok: true, merged };
}

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
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const { serviceRoleKey, url } = getSupabaseConfig();

    const response = await fetch(
      `${url}/rest/v1/scholarship_applications?submission_status=eq.submitted&order=submitted_at.desc&select=id,applicant_name,student_id,department,advisor_name,gpa,gpa_scale,program_key,scholarship_program,submission_status,review_status,reviewer_remarks,payload,files,submitted_at,created_at,updated_at`,
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

    const applications = filterApplicationsByScope(
      await response.json(),
      auth.departmentScope
    );

    return NextResponse.json({ success: true, applications });
  } catch (error) {
    console.error("Dashboard GET error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update review_status and/or reviewer_remarks               */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as {
      applicationId?: string;
      review_status?: string;
      reviewer_remarks?: string;
      payload?: ScholarshipPayload;
    };

    const { applicationId, review_status, reviewer_remarks, payload } = body;

    if (!applicationId) {
      return jsonError("缺少 applicationId。");
    }

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    if (
      review_status === undefined &&
      reviewer_remarks === undefined &&
      payload === undefined
    ) {
      return jsonError("請提供要更新的欄位。");
    }

    if (review_status !== undefined && !isValidReviewStatus(review_status)) {
      return jsonError("不合法的審查狀態。");
    }

    const existingResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}&select=id,department,payload`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!existingResponse.ok) {
      throw new Error("查詢申請案失敗。");
    }

    const existingRecords = (await existingResponse.json()) as {
      department: string | null;
      id: string;
      payload: ScholarshipPayload;
    }[];
    const existingApplication = existingRecords[0];
    if (!existingApplication) {
      return jsonError("找不到該申請案。", 404);
    }
    if (
      !canAccessDepartment(auth.departmentScope, existingApplication.department)
    ) {
      return jsonError("無權限修改此系所申請案。", 403);
    }

    // Build update payload
    const updateFields: Record<string, unknown> = {};
    if (auth.userId) {
      updateFields.reviewed_by = auth.userId;
    }
    if (review_status !== undefined) {
      updateFields.review_status = review_status;
    }
    if (reviewer_remarks !== undefined) {
      updateFields.reviewer_remarks = reviewer_remarks;
    }

    if (payload !== undefined) {
      const result = validateAndMergePayload(
        payload,
        existingApplication.payload
      );
      if (!result.ok) {
        return jsonError(result.error);
      }

      const newDepartment = result.merged.applicantInfo.department;
      // A reviewer must not move an application outside their own scope.
      if (
        newDepartment !== existingApplication.department &&
        !canAccessDepartment(auth.departmentScope, newDepartment)
      ) {
        return jsonError("無法將申請案改為您權限外的系所。", 403);
      }

      updateFields.payload = result.merged;

      // Keep top-level columns (used by the list view + scope filter) in sync.
      const { applicantInfo, academicPerformance } = result.merged;
      updateFields.applicant_name = applicantInfo.applicantName;
      updateFields.student_id = applicantInfo.studentId;
      updateFields.department = newDepartment;
      updateFields.advisor_name = applicantInfo.advisorName || null;
      const gpaNumber = Number(academicPerformance.cumulativeGpa);
      if (Number.isFinite(gpaNumber) && academicPerformance.cumulativeGpa !== "") {
        updateFields.gpa = gpaNumber;
      }
      const gpaScaleNumber = Number(academicPerformance.cumulativeGpaScale);
      if (
        Number.isFinite(gpaScaleNumber) &&
        academicPerformance.cumulativeGpaScale !== ""
      ) {
        updateFields.gpa_scale = gpaScaleNumber;
      }
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

    const [updated] = (await updateResponse.json()) as unknown[];
    return NextResponse.json({ success: true, application: updated });
  } catch (error) {
    console.error("Dashboard PATCH error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Admin removes an application record (admin only)           */
/* ------------------------------------------------------------------ */

const STORAGE_BUCKET = "scholarship-documents";

export async function DELETE(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }
    // Deleting a record is irreversible — restrict to admins.
    if (auth.role !== "admin") {
      return jsonError("只有管理員可以刪除申請紀錄。", 403);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json().catch(() => ({}))) as {
      applicationId?: string;
    };
    const applicationId = body.applicationId;

    if (!applicationId) {
      return jsonError("缺少 applicationId。");
    }
    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    // Fetch the record first so we can clean up its Storage files afterwards.
    const existingResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}&select=id,files`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!existingResponse.ok) {
      throw new Error("查詢申請案失敗。");
    }

    const existingRecords = (await existingResponse.json()) as {
      id: string;
      files: { path?: string | null }[] | null;
    }[];
    if (!existingRecords[0]) {
      return jsonError("找不到該申請案。", 404);
    }

    // Delete the application row. review_logs cascade automatically (FK ON
    // DELETE CASCADE).
    const deleteResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?id=eq.${applicationId}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      throw new Error("刪除申請案失敗。");
    }

    // Best-effort: remove the uploaded PDFs from Storage. A failure here must
    // not fail the request — the record is already gone.
    const prefixes = (existingRecords[0].files ?? [])
      .map((file) => file?.path)
      .filter(
        (path): path is string => typeof path === "string" && path.length > 0
      );
    if (prefixes.length > 0) {
      try {
        await fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}`, {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ prefixes }),
        });
      } catch (storageError) {
        console.error("Application storage cleanup error:", storageError);
      }
    }

    return NextResponse.json({ success: true, applicationId });
  } catch (error) {
    console.error("Dashboard DELETE error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
