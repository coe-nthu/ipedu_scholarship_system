import { NextResponse } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import { parseJournalIndexCsv } from "@/lib/journal-index-import";
import type { JournalIndexRecord } from "@/lib/types";

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

function authError(reason: "not_authenticated" | "not_authorized") {
  return jsonError(
    reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
    reason === "not_authenticated" ? 401 : 403
  );
}

async function fetchJson<T>(url: string, serviceRoleKey: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

async function fetchCount(url: string, serviceRoleKey: string) {
  const response = await fetch(
    `${url}/rest/v1/journal_index_records?select=id&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        prefer: "count=exact",
      },
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const contentRange = response.headers.get("content-range") ?? "";
  const total = contentRange.split("/")[1];
  return total ? Number(total) : 0;
}

export async function GET() {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return authError(auth.reason);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const [count, latestRows, preview] = await Promise.all([
      fetchCount(url, serviceRoleKey),
      fetchJson<
        Pick<JournalIndexRecord, "created_at" | "source_file_name" | "uploaded_by">[]
      >(
        `${url}/rest/v1/journal_index_records?select=created_at,source_file_name,uploaded_by&order=created_at.desc&limit=1`,
        serviceRoleKey
      ),
      fetchJson<JournalIndexRecord[]>(
        `${url}/rest/v1/journal_index_records?select=journal_title,issn,eissn,category,edition,jif,jci,quartile,jcr_year,source_file_name,created_at&order=journal_title.asc&limit=10`,
        serviceRoleKey
      ),
    ]);

    return NextResponse.json({
      success: true,
      canUpload: auth.role === "admin",
      count,
      latest: latestRows[0] ?? null,
      preview,
    });
  } catch (error) {
    console.error("Journal indexes GET error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return authError(auth.reason);
    }
    if (auth.role !== "admin") {
      return jsonError("只有管理員可以上傳期刊索引。", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("請選擇 CSV 檔案。");
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return jsonError("僅支援 CSV 檔案。");
    }
    if (file.size > 5 * 1024 * 1024) {
      return jsonError("CSV 檔案不可超過 5MB。");
    }

    const csvText = await file.text();
    let parsed;
    try {
      parsed = parseJournalIndexCsv(csvText, file.name);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "CSV 解析失敗。"
      );
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const deleteResponse = await fetch(
      `${url}/rest/v1/journal_index_records?id=not.is.null`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      throw new Error(await deleteResponse.text());
    }

    const records = parsed.records.map((record) => ({
      ...record,
      uploaded_by: auth.userId,
    }));

    const insertResponse = await fetch(`${url}/rest/v1/journal_index_records`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(records),
    });

    if (!insertResponse.ok) {
      throw new Error(await insertResponse.text());
    }

    return NextResponse.json({
      success: true,
      summary: parsed.summary,
      preview: records.slice(0, 10),
    });
  } catch (error) {
    console.error("Journal indexes POST error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
