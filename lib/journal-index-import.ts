import type { JournalIndexImportSummary, JournalIndexRecord } from "@/lib/types";

const FIELD_ALIASES = {
  category: ["category"],
  edition: ["edition", "database", "web of science edition"],
  eissn: ["eissn", "e-issn", "electronic issn"],
  issn: ["issn"],
  jci: ["2024 jci", "jci"],
  jcrYear: ["jcr year", "jcryear", "year"],
  jif: ["2024 jif", "jif", "journal impact factor"],
  journalTitle: ["journal name", "journal title", "full journal title"],
  quartile: ["jif quartile", "quartile"],
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "");
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

function parseYear(value: string) {
  const match = value.match(/\b(20\d{2}|19\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function findHeaderIndex(lines: string[]) {
  return lines.findIndex((line) => {
    const headers = parseCsvLine(line).map(normalizeHeader);
    return (
      headers.includes("journal name") ||
      headers.includes("journal title") ||
      headers.includes("full journal title")
    );
  });
}

function extractYearFromIntro(lines: string[]) {
  for (const line of lines.slice(0, 5)) {
    const year = parseYear(line);
    if (year) return year;
  }
  return null;
}

export function parseJournalIndexCsv(
  csvText: string,
  sourceFileName: string
): { records: JournalIndexRecord[]; summary: JournalIndexImportSummary } {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = findHeaderIndex(lines);
  if (headerIndex < 0) {
    throw new Error(
      "不是有效的期刊清單 CSV：缺少 Journal name / Journal Title 欄位。請匯出 JCR JournalResults 檔案。"
    );
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const titleIndex = findColumn(headers, FIELD_ALIASES.journalTitle);
  const issnIndex = findColumn(headers, FIELD_ALIASES.issn);
  const eissnIndex = findColumn(headers, FIELD_ALIASES.eissn);
  const editionIndex = findColumn(headers, FIELD_ALIASES.edition);
  const categoryIndex = findColumn(headers, FIELD_ALIASES.category);
  const jifIndex = findColumn(headers, FIELD_ALIASES.jif);
  const jciIndex = findColumn(headers, FIELD_ALIASES.jci);
  const quartileIndex = findColumn(headers, FIELD_ALIASES.quartile);
  const jcrYearIndex = findColumn(headers, FIELD_ALIASES.jcrYear);
  const fallbackYear = extractYearFromIntro(lines);

  if (titleIndex < 0 && issnIndex < 0 && eissnIndex < 0) {
    throw new Error(
      "不是有效的期刊清單 CSV：缺少期刊名稱或 ISSN/eISSN 欄位。"
    );
  }
  if (editionIndex < 0) {
    throw new Error("不是有效的期刊清單 CSV：缺少 Edition 欄位。");
  }

  const records: JournalIndexRecord[] = [];
  const seen = new Map<string, number>();
  const errors: string[] = [];
  let duplicatesSkipped = 0;

  for (const [rowOffset, line] of lines.slice(headerIndex + 1).entries()) {
    const rowNumber = headerIndex + rowOffset + 2;
    const cells = parseCsvLine(line);
    const title = normalizeCell(cells[titleIndex] ?? "");
    const issn = issnIndex >= 0 ? normalizeCell(cells[issnIndex] ?? "") : "";
    const eissn = eissnIndex >= 0 ? normalizeCell(cells[eissnIndex] ?? "") : "";
    const edition = normalizeCell(cells[editionIndex] ?? "");

    if (!title && !issn && !eissn) {
      continue;
    }
    if (!edition) {
      errors.push(`第 ${rowNumber} 列缺少 Edition，已略過。`);
      continue;
    }

    const key = `${title.toLowerCase()}|${issn}|${eissn}|${edition}`;
    if (seen.has(key)) {
      const existingIndex = seen.get(key);
      const category =
        categoryIndex >= 0 ? normalizeCell(cells[categoryIndex] ?? "") : "";
      const existing =
        existingIndex !== undefined ? records[existingIndex] : undefined;
      if (
        category &&
        existing &&
        !existing.category?.split(";").map((item) => item.trim()).includes(category)
      ) {
        existing.category = existing.category
          ? `${existing.category}; ${category}`
          : category;
      }
      duplicatesSkipped += 1;
      continue;
    }
    seen.set(key, records.length);

    records.push({
      category:
        categoryIndex >= 0 ? normalizeCell(cells[categoryIndex] ?? "") || null : null,
      edition,
      eissn: eissn || null,
      issn: issn || null,
      jci: jciIndex >= 0 ? normalizeCell(cells[jciIndex] ?? "") || null : null,
      jcr_year:
        jcrYearIndex >= 0
          ? parseYear(cells[jcrYearIndex] ?? "") ?? fallbackYear
          : fallbackYear,
      jif: jifIndex >= 0 ? normalizeCell(cells[jifIndex] ?? "") || null : null,
      journal_title: title,
      quartile:
        quartileIndex >= 0
          ? normalizeCell(cells[quartileIndex] ?? "") || null
          : null,
      source_file_name: sourceFileName,
    });
  }

  if (records.length === 0) {
    throw new Error("CSV 中沒有可匯入的期刊資料。");
  }

  return {
    records,
    summary: {
      count: records.length,
      duplicatesSkipped,
      errors: errors.slice(0, 20),
      sourceFileName,
    },
  };
}
