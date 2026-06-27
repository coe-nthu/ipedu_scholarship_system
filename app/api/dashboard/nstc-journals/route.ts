import { NextResponse } from "next/server";
import { checkDashboardAccess } from "@/lib/auth";
import { parseNstcCoreCsv } from "@/lib/nstc-core-import";
import type { NstcCoreJournalRecord } from "@/lib/types";

const TABLE = "nstc_core_journal_records";
const SELECT =
  "journal_title_zh,journal_title_en,discipline,database,tier,source_file_name";
const MAX_CSV_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_CSV_BYTES = 100 * 1024 * 1024;
const INSERT_CHUNK_SIZE = 1000;

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

function mergeRecords(
  batches: {
    records: NstcCoreJournalRecord[];
    summary: { duplicatesSkipped: number; errors: string[] };
  }[]
) {
  const records: NstcCoreJournalRecord[] = [];
  const seen = new Set<string>();
  let duplicatesSkipped = 0;
  const errors: string[] = [];

  for (const batch of batches) {
    duplicatesSkipped += batch.summary.duplicatesSkipped;
    errors.push(...batch.summary.errors);

    for (const record of batch.records) {
      const key = [
        (record.journal_title_zh ?? "").toLowerCase(),
        (record.journal_title_en ?? "").toLowerCase(),
        record.database.toUpperCase(),
      ].join("|");

      if (seen.has(key)) {
        duplicatesSkipped += 1;
        continue;
      }

      seen.add(key);
      records.push(record);
    }
  }

  return { duplicatesSkipped, errors: errors.slice(0, 20), records };
}

async function fetchJson<T>(
  url: string,
  serviceRoleKey: string
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

async function fetchAllRecords(url: string, serviceRoleKey: string) {
  const pageSize = 1000;
  const records: NstcCoreJournalRecord[] = [];

  for (let offset = 0; offset < 100000; offset += pageSize) {
    const page = await fetchJson<NstcCoreJournalRecord[]>(
      `${url}/rest/v1/${TABLE}?select=${SELECT}&order=journal_title_en.asc&limit=${pageSize}&offset=${offset}`,
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
  const response = await fetch(`${url}/rest/v1/${TABLE}?select=id&limit=1`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "count=exact",
    },
  });

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
    const wantAll = new URL(request.url).searchParams.get("all") === "1";

    const [count, latestRows, records] = await Promise.all([
      fetchCount(url, serviceRoleKey),
      fetchJson<
        Pick<NstcCoreJournalRecord, "created_at" | "source_file_name" | "uploaded_by">[]
      >(
        `${url}/rest/v1/${TABLE}?select=created_at,source_file_name,uploaded_by&order=created_at.desc&limit=1`,
        serviceRoleKey
      ),
      wantAll
        ? fetchAllRecords(url, serviceRoleKey)
        : fetchJson<NstcCoreJournalRecord[]>(
            `${url}/rest/v1/${TABLE}?select=${SELECT}&order=journal_title_en.asc&limit=10`,
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
    console.error("NSTC journals GET error:", error);
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
      return jsonError("只有管理員可以上傳國科會核心期刊名單。", 403);
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
    const fileErrors: string[] = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        fileErrors.push(`僅支援 CSV 檔案：${file.name}`);
        continue;
      }
      if (file.size > MAX_CSV_BYTES) {
        fileErrors.push(`單一 CSV 檔案不可超過 50MB：${file.name}`);
        continue;
      }
      try {
        parsedBatches.push(parseNstcCoreCsv(await file.text(), file.name));
      } catch (error) {
        fileErrors.push(
          `${file.name}：${error instanceof Error ? error.message : "解析失敗"}`
        );
      }
    }

    if (parsedBatches.length === 0) {
      return jsonError(
        fileErrors.length > 0 ? fileErrors.join("\n") : "CSV 解析失敗。"
      );
    }

    const merged = mergeRecords(parsedBatches);

    const { serviceRoleKey, url } = getSupabaseConfig();
    const deleteResponse = await fetch(
      `${url}/rest/v1/${TABLE}?id=not.is.null`,
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
      const insertResponse = await fetch(`${url}/rest/v1/${TABLE}`, {
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
        errors: [...fileErrors, ...merged.errors].slice(0, 20),
        sourceFileName:
          files.length === 1 ? files[0].name : `${files.length} 個 CSV 檔案`,
      },
      preview: records.slice(0, 10),
    });
  } catch (error) {
    console.error("NSTC journals POST error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
