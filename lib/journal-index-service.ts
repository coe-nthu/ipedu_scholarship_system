import { findJournalIndexMatch as findSeedJournalIndexMatch } from "@/lib/journal-indexes";
import type { Journal, JournalIndexRecord } from "@/lib/types";

export type JournalIndexMatch = {
  database: string;
  edition: string;
  indexSource: string;
  level: "I級期刊" | "非I級期刊";
  record?: Pick<
    JournalIndexRecord,
    "category" | "eissn" | "issn" | "jcr_year" | "journal_title" | "quartile"
  >;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    serviceRoleKey,
    url: url.replace(/\/$/, ""),
  };
}

function normalizeIssn(value: string) {
  return value.replace(/[^0-9xX]/g, "").toUpperCase();
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function editionRank(edition: string) {
  const normalized = edition.toUpperCase();
  const ranks: Record<string, number> = {
    SSCI: 1,
    SCIE: 2,
    SCI: 3,
    TSSCI: 4,
    SCOPUS: 5,
    ESCI: 6,
    AHCI: 7,
  };
  return ranks[normalized] ?? 99;
}

function databaseFromEdition(edition: string) {
  const normalized = edition.toUpperCase();
  if (
    ["SSCI", "SCIE", "SCI", "TSSCI", "SCOPUS", "ESCI", "AHCI"].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return "其他";
}

function buildMatch(record: JournalIndexRecord): JournalIndexMatch {
  const edition = record.edition.toUpperCase();
  const meta = [
    record.jcr_year ? `${record.jcr_year} JCR` : null,
    record.quartile,
    record.category,
  ].filter(Boolean);

  return {
    database: databaseFromEdition(edition),
    edition,
    indexSource: `JCR 匯入索引：${edition}${meta.length ? `（${meta.join("，")}）` : ""}`,
    level: "I級期刊",
    record: {
      category: record.category,
      eissn: record.eissn,
      issn: record.issn,
      jcr_year: record.jcr_year,
      journal_title: record.journal_title,
      quartile: record.quartile,
    },
  };
}

async function fetchJournalIndexRecords() {
  const config = getSupabaseConfig();
  if (!config) return [];

  const pageSize = 5000;
  const records: JournalIndexRecord[] = [];

  for (let offset = 0; offset < 100000; offset += pageSize) {
    const response = await fetch(
      `${config.url}/rest/v1/journal_index_records?select=journal_title,issn,eissn,category,edition,jif,jci,quartile,jcr_year,source_file_name&limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const page = (await response.json()) as JournalIndexRecord[];
    records.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return records;
}

export async function findJournalIndexMatch({
  issns,
  journalTitle,
}: {
  issns: string[];
  journalTitle: string;
}): Promise<JournalIndexMatch | undefined> {
  const records = await fetchJournalIndexRecords();
  const normalizedIssns = new Set(issns.map(normalizeIssn).filter(Boolean));
  const normalizedJournalTitle = normalizeTitle(journalTitle);

  const matches = records
    .filter((record) => {
      const issnMatches = [record.issn, record.eissn]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizedIssns.has(normalizeIssn(value)));
      const titleMatches =
        normalizedJournalTitle.length > 0 &&
        normalizeTitle(record.journal_title) === normalizedJournalTitle;

      return issnMatches || titleMatches;
    })
    .sort((a, b) => editionRank(a.edition) - editionRank(b.edition));

  if (matches[0]) {
    return buildMatch(matches[0]);
  }

  const seedMatch = findSeedJournalIndexMatch({ issns, journalTitle });
  if (!seedMatch) {
    return undefined;
  }

  return {
    database: seedMatch.database,
    edition: seedMatch.database,
    indexSource: "內建期刊索引對照表自動判別",
    level: seedMatch.level,
  };
}

function storedJournalTitle(journal: Journal) {
  return journal.journal.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export async function findJournalIndexMatchForJournal(
  journal: Journal,
  preferredTitle?: string | null
) {
  return findJournalIndexMatch({
    issns: journal.issns ?? [],
    journalTitle:
      preferredTitle ||
      storedJournalTitle(journal) ||
      journal.title ||
      journal.journal,
  });
}

export async function applyJournalIndexMatch(
  journal: Journal,
  preferredTitle?: string | null
): Promise<Journal> {
  const match = await findJournalIndexMatchForJournal(journal, preferredTitle);
  if (!match) {
    return journal.indexSource
      ? journal
      : {
          ...journal,
          indexSource:
            "未命中索引對照表，請手動選擇 Edition / 資料庫別與期刊等級",
        };
  }

  // Only the Edition / 資料庫別 is auto-filled. `journalLevel`（I級/非I級）is
  // always a manual decision and is intentionally left untouched here.
  return {
    ...journal,
    database: match.database || journal.database,
    indexSource: match.indexSource,
  };
}
