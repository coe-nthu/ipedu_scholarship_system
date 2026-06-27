import type {
  JournalIndexImportSummary,
  NstcCoreJournalRecord,
} from "@/lib/types";

/**
 * Parser for the 國科會人社中心 core-journal list CSV (the file produced from the
 * yearly 評比結果暨核心期刊名單). Columns:
 *   領域, 學門, 期刊中文名稱, 期刊英文名稱, 出版者, 資料庫, 論文分級
 * Only "core" rows are imported — those whose 資料庫 is TSSCI / THCI /「THCI、TSSCI」
 * (i.e. 第一級 / 第二級). 非核心（第三級）rows are skipped because they are not in
 * the NSTC core database.
 */

const FIELD_ALIASES = {
  titleZh: ["期刊中文名稱", "中文名稱", "中文刊名", "期刊名稱"],
  titleEn: [
    "期刊英文名稱",
    "英文名稱",
    "英文刊名",
    "journal title",
    "journal name",
  ],
  database: ["資料庫", "核心期刊", "database"],
  tier: ["論文分級", "分級", "分級結果", "level"],
  discipline: ["學門", "領域學門"],
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/^﻿/, "");
}

function normalizeCell(value: string) {
  const trimmed = value.trim();
  return trimmed && trimmed.toUpperCase() !== "N/A" ? trimmed : "";
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function findColumn(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

/**
 * Reduce a 資料庫 cell to the core NSTC database label, or "" when the journal is
 * not core (e.g. 非核心 / 第三級).
 */
function coreDatabase(value: string): string {
  const upper = value.toUpperCase();
  const hasThci = upper.includes("THCI");
  const hasTssci = upper.includes("TSSCI");
  if (hasThci && hasTssci) return "THCI、TSSCI";
  if (hasTssci) return "TSSCI";
  if (hasThci) return "THCI";
  return "";
}

function findHeaderIndex(lines: string[]) {
  return lines.findIndex((line) => {
    const headers = parseCsvLine(line).map(normalizeHeader);
    const hasTitle =
      FIELD_ALIASES.titleZh.some((alias) => headers.includes(alias)) ||
      FIELD_ALIASES.titleEn.some((alias) => headers.includes(alias));
    const hasDatabase = FIELD_ALIASES.database.some((alias) =>
      headers.includes(alias)
    );
    return hasTitle && hasDatabase;
  });
}

export function parseNstcCoreCsv(
  csvText: string,
  sourceFileName: string
): { records: NstcCoreJournalRecord[]; summary: JournalIndexImportSummary } {
  const lines = csvText
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = findHeaderIndex(lines);
  if (headerIndex < 0) {
    throw new Error(
      "不是有效的國科會核心期刊 CSV：缺少期刊名稱（中/英）或資料庫欄位。"
    );
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const titleZhIndex = findColumn(headers, FIELD_ALIASES.titleZh);
  const titleEnIndex = findColumn(headers, FIELD_ALIASES.titleEn);
  const databaseIndex = findColumn(headers, FIELD_ALIASES.database);
  const tierIndex = findColumn(headers, FIELD_ALIASES.tier);
  const disciplineIndex = findColumn(headers, FIELD_ALIASES.discipline);

  if (databaseIndex < 0 || (titleZhIndex < 0 && titleEnIndex < 0)) {
    throw new Error(
      "不是有效的國科會核心期刊 CSV：缺少期刊名稱或資料庫欄位。"
    );
  }

  const records: NstcCoreJournalRecord[] = [];
  const seen = new Set<string>();
  let duplicatesSkipped = 0;
  let nonCoreSkipped = 0;

  for (const line of lines.slice(headerIndex + 1)) {
    const cells = parseCsvLine(line);
    const titleZh =
      titleZhIndex >= 0 ? normalizeCell(cells[titleZhIndex] ?? "") : "";
    const titleEn =
      titleEnIndex >= 0 ? normalizeCell(cells[titleEnIndex] ?? "") : "";
    if (!titleZh && !titleEn) {
      continue;
    }

    const database = coreDatabase(
      normalizeCell(cells[databaseIndex] ?? "")
    );
    if (!database) {
      // 非核心（第三級）— not in the NSTC database.
      nonCoreSkipped += 1;
      continue;
    }

    const key = `${titleZh.toLowerCase()}|${titleEn.toLowerCase()}|${database}`;
    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);

    records.push({
      journal_title_zh: titleZh || null,
      journal_title_en: titleEn || null,
      discipline:
        disciplineIndex >= 0
          ? normalizeCell(cells[disciplineIndex] ?? "") || null
          : null,
      database,
      tier: tierIndex >= 0 ? normalizeCell(cells[tierIndex] ?? "") || null : null,
      source_file_name: sourceFileName,
    });
  }

  if (records.length === 0) {
    throw new Error(
      "CSV 中沒有可匯入的核心期刊（資料庫需為 TSSCI / THCI）。"
    );
  }

  return {
    records,
    summary: {
      count: records.length,
      duplicatesSkipped,
      errors:
        nonCoreSkipped > 0
          ? [`已略過 ${nonCoreSkipped} 筆非核心（第三級）期刊。`]
          : [],
      sourceFileName,
    },
  };
}
