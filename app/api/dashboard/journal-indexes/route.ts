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

const MAX_CSV_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_CSV_BYTES = 100 * 1024 * 1024;
const INSERT_CHUNK_SIZE = 1000;

function mergeRecords(
  batches: {
    records: JournalIndexRecord[];
    summary: { duplicatesSkipped: number; errors: string[] };
  }[]
) {
  const records: JournalIndexRecord[] = [];
  const seen = new Map<string, number>();
  let duplicatesSkipped = 0;
  const errors: string[] = [];

  for (const batch of batches) {
    duplicatesSkipped += batch.summary.duplicatesSkipped;
    errors.push(...batch.summary.errors);

    for (const record of batch.records) {
      const key = [
        record.journal_title.toLowerCase(),
        record.issn ?? "",
        record.eissn ?? "",
        record.edition.toUpperCase(),
      ].join("|");

      if (seen.has(key)) {
        const existingIndex = seen.get(key);
        const existing =
          existingIndex !== undefined ? records[existingIndex] : undefined;
        if (existing && record.category) {
          const categories = new Set(
            (existing.category ?? "")
              .split(";")
              .map((item) => item.trim())
              .filter(Boolean)
          );
          if (!categories.has(record.category)) {
            categories.add(record.category);
            existing.category = Array.from(categories).join("; ");
          }
        }
        duplicatesSkipped += 1;
        continue;
      }

      seen.set(key, records.length);
      records.push(record);
    }
  }

  return {
    duplicatesSkipped,
    errors: errors.slice(0, 20),
    records,
  };
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

async function fetchAllRecords(url: string, serviceRoleKey: string) {
  const pageSize = 1000;
  const maxRecords = 100000;
  const records: JournalIndexRecord[] = [];

  for (let offset = 0; offset < maxRecords; offset += pageSize) {
    const page = await fetchJson<JournalIndexRecord[]>(
      `${url}/rest/v1/journal_index_records?select=journal_title,issn,eissn,category,edition,jif,jci,quartile,jcr_year,source_file_name&order=journal_title.asc&limit=${pageSize}&offset=${offset}`,
      serviceRoleKey
    );
    records.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return records;
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

export async function GET(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return authError(auth.reason);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    // `?all=1` returns every record so the dashboard panel can scroll through
    // the full index; the default view returns only a small preview.
    const wantAll = new URL(request.url).searchParams.get("all") === "1";

    const [count, latestRows, records] = await Promise.all([
      fetchCount(url, serviceRoleKey),
      fetchJson<
        Pick<JournalIndexRecord, "created_at" | "source_file_name" | "uploaded_by">[]
      >(
        `${url}/rest/v1/journal_index_records?select=created_at,source_file_name,uploaded_by&order=created_at.desc&limit=1`,
        serviceRoleKey
      ),
      wantAll
        ? fetchAllRecords(url, serviceRoleKey)
        : fetchJson<JournalIndexRecord[]>(
            `${url}/rest/v1/journal_index_records?select=journal_title,issn,eissn,category,edition,jif,jci,quartile,jcr_year,source_file_name,created_at&order=journal_title.asc&limit=10`,
            serviceRoleKey
          ),
    ]);

    return NextResponse.json({
      success: true,
      canUpload: auth.role === "admin",
      count,
      latest: latestRows[0] ?? null,
      preview: records,
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
    const files = [...formData.getAll("files"), formData.get("file")]
      .filter((file): file is File => file instanceof File)
      .filter((file, index, allFiles) => allFiles.indexOf(file) === index);

    if (files.length === 0) {
      return jsonError("請選擇 CSV 檔案。");
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_CSV_BYTES) {
      return jsonError("CSV 檔案總大小不可超過 100MB。");
    }

    const parsedBatches = [];
    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".csv")) {
          return jsonError(`僅支援 CSV 檔案：${file.name}`);
        }
        if (file.size > MAX_CSV_BYTES) {
          return jsonError(`單一 CSV 檔案不可超過 50MB：${file.name}`);
        }
        parsedBatches.push(parseJournalIndexCsv(await file.text(), file.name));
      }
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "CSV 解析失敗。"
      );
    }

    const merged = mergeRecords(parsedBatches);

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

    const records = merged.records.map((record) => ({
      ...record,
      uploaded_by: auth.userId,
    }));

    for (let index = 0; index < records.length; index += INSERT_CHUNK_SIZE) {
      const chunk = records.slice(index, index + INSERT_CHUNK_SIZE);
      const insertResponse = await fetch(`${url}/rest/v1/journal_index_records`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify(chunk),
      });

      if (!insertResponse.ok) {
        throw new Error(await insertResponse.text());
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        count: records.length,
        duplicatesSkipped: merged.duplicatesSkipped,
        errors: merged.errors,
        sourceFileName:
          files.length === 1 ? files[0].name : `${files.length} 個 CSV 檔案`,
      },
      preview: records.slice(0, 10),
    });
  } catch (error) {
    console.error("Journal indexes POST error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
