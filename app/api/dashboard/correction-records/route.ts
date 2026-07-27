import { NextResponse } from "next/server";
import {
  canAccessDepartment,
  checkDashboardAccess,
} from "@/lib/auth";
import type { ScholarshipCorrectionRecord } from "@/lib/types";
import { isValidUUID } from "@/lib/validation";

type ApplicationDepartmentRecord = {
  department: string | null;
  id: string;
};

type ProfileRecord = {
  full_name: string | null;
  id: string;
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

async function fetchNotifierNames({
  records,
  serviceRoleKey,
  url,
}: {
  records: ScholarshipCorrectionRecord[];
  serviceRoleKey: string;
  url: string;
}) {
  const notifierIds = Array.from(
    new Set(records.map((record) => record.notified_by).filter(Boolean))
  ) as string[];

  if (notifierIds.length === 0) {
    return new Map<string, string>();
  }

  const response = await fetch(
    `${url}/rest/v1/profiles?id=in.(${notifierIds.join(",")})&select=id,full_name`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return new Map<string, string>();
  }

  const profiles = (await response.json()) as ProfileRecord[];
  return new Map(
    profiles
      .filter((profile) => profile.full_name)
      .map((profile) => [profile.id, profile.full_name!])
  );
}

export async function GET(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const applicationId = new URL(request.url).searchParams
      .get("applicationId")
      ?.trim();

    if (!applicationId) {
      return jsonError("缺少 applicationId。");
    }

    if (!isValidUUID(applicationId)) {
      return jsonError("applicationId 格式不合法。");
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const applicationQuery = new URLSearchParams({
      id: `eq.${applicationId}`,
      limit: "1",
      select: "id,department",
    });

    const applicationResponse = await fetch(
      `${url}/rest/v1/scholarship_applications?${applicationQuery}`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!applicationResponse.ok) {
      throw new Error("查詢申請案失敗。");
    }

    const [application] =
      (await applicationResponse.json()) as ApplicationDepartmentRecord[];

    if (!application) {
      return jsonError("找不到該申請案。", 404);
    }

    if (!canAccessDepartment(auth.departmentScope, application.department)) {
      return jsonError("無權限檢視此系所申請案。", 403);
    }

    const recordsQuery = new URLSearchParams({
      application_id: `eq.${applicationId}`,
      order: "correction_number.desc",
      select:
        "id,application_id,correction_number,message,notified_by,notifier_role,created_at",
    });

    const recordsResponse = await fetch(
      `${url}/rest/v1/scholarship_correction_records?${recordsQuery}`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!recordsResponse.ok) {
      throw new Error("查詢補正紀錄失敗。");
    }

    const records =
      (await recordsResponse.json()) as ScholarshipCorrectionRecord[];
    const notifierNames = await fetchNotifierNames({
      records,
      serviceRoleKey,
      url,
    });

    return NextResponse.json({
      success: true,
      records: records.map((record) => ({
        ...record,
        notifier_display_name:
          record.notified_by && notifierNames.has(record.notified_by)
            ? notifierNames.get(record.notified_by)
            : null,
      })),
    });
  } catch (error) {
    console.error("Dashboard correction records error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
