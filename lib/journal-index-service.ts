import { findJournalIndexMatch as findSeedJournalIndexMatch } from "@/lib/journal-indexes";
import type { Journal, JournalIndexRecord } from "@/lib/types";

export type JournalIndexMatch = {
  database: string;
  edition: string;
  /** Every edition this journal belongs to, best-ranked first (e.g. SSCI、SCIE). */
  editions: string[];
  indexSource: string;
  level: "I級期刊" | "非I級期刊";
  record?: Pick<
    JournalIndexRecord,
    | "category"
    | "eissn"
    | "issn"
    | "jcr_year"
    | "journal_title"
    | "publisher_name"
  >;
  publisherName: string;
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

/** Split a cell that may hold several ISSNs (e.g. "0027-8424; 1091-6490"). */
function splitIssns(value: string | null | undefined) {
  return (value ?? "")
    .split(/[;,/|\s]+/)
    .map(normalizeIssn)
    .filter(Boolean);
}

/** Title normalised to lowercase words separated by single spaces. */
function normalizeTitleWords(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

/**
 * Whether two journal titles refer to the same journal. Besides an exact
 * match, tolerate a trailing sub-title difference such as
 * "Proceedings of the National Academy of Sciences" vs
 * "... of the United States of America". The shorter title must be a
 * word-boundary prefix of the longer one and be specific enough (\u22653 words)
 * to avoid generic prefixes matching unrelated journals.
 */
function titlesMatch(a: string, b: string) {
  const na = normalizeTitleWords(a);
  const nb = normalizeTitleWords(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.split(" ").length < 3) return false;
  return longer.startsWith(`${shorter} `);
}

function editionRank(edition: string) {
  const normalized = edition.toUpperCase();
  const ranks: Record<string, number> = {
    SSCI: 1,
    SCIE: 2,
    AHCI: 3,
    SCI: 4,
    TSSCI: 5,
    SCOPUS: 6,
  };
  return ranks[normalized] ?? 99;
}

function databaseFromEdition(edition: string) {
  const normalized = edition.toUpperCase();
  if (["SSCI", "SCIE", "AHCI", "SCI", "TSSCI", "SCOPUS"].includes(normalized)) {
    return normalized;
  }
  return "其他";
}

function buildMatch(
  record: JournalIndexRecord,
  editions: string[]
): JournalIndexMatch {
  const edition = record.edition.toUpperCase();
  const meta = [
    record.jcr_year ? `${record.jcr_year} JCR` : null,
    record.category,
  ].filter(Boolean);

  return {
    database: databaseFromEdition(edition),
    edition,
    editions,
    indexSource: `依期刊索引判別所屬資料庫：${editions.join("、")}${meta.length ? `（${meta.join("，")}）` : ""}`,
    level: "I級期刊",
    publisherName: record.publisher_name ?? "",
    record: {
      category: record.category,
      eissn: record.eissn,
      issn: record.issn,
      jcr_year: record.jcr_year,
      journal_title: record.journal_title,
      publisher_name: record.publisher_name,
    },
  };
}

const SELECT_COLUMNS =
  "journal_title,issn,eissn,category,edition,jif,jci,publisher_name,jcr_year,source_file_name";

async function queryJournalIndex(filter: string): Promise<JournalIndexRecord[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  // Query Supabase directly with a filter instead of downloading the whole
  // table — the index can hold tens of thousands of rows, so fetching all of
  // them per lookup is slow and breaks under row caps.
  const response = await fetch(
    `${config.url}/rest/v1/journal_index_records?select=${SELECT_COLUMNS}&${filter}`,
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

  return (await response.json()) as JournalIndexRecord[];
}

/** Find records whose ISSN or eISSN matches any of the given ISSNs. */
async function fetchRecordsByIssn(
  issns: string[]
): Promise<JournalIndexRecord[]> {
  // Query both the hyphenated form (e.g. 0027-8424) and the compact form so
  // the lookup tolerates whichever way the index stored the ISSN.
  const variants = new Set<string>();
  for (const issn of issns) {
    const trimmed = issn.trim();
    if (!trimmed) continue;
    variants.add(trimmed);
    const compact = normalizeIssn(trimmed);
    if (compact) variants.add(compact);
    if (compact.length === 8) {
      variants.add(`${compact.slice(0, 4)}-${compact.slice(4)}`);
    }
  }
  if (variants.size === 0) return [];

  const list = Array.from(variants).join(",");
  return queryJournalIndex(
    `or=(issn.in.(${list}),eissn.in.(${list}))&limit=2000`
  );
}

/** Find candidate records whose stored title starts with the given title. */
async function fetchRecordsByTitle(
  journalTitle: string
): Promise<JournalIndexRecord[]> {
  const term = journalTitle.trim().replace(/[%*,()]/g, " ").trim();
  if (term.length < 3) return [];
  return queryJournalIndex(
    `journal_title=ilike.${encodeURIComponent(`${term}*`)}&limit=50`
  );
}

export async function findJournalIndexMatch({
  issns,
  journalTitle,
}: {
  issns: string[];
  journalTitle: string;
}): Promise<JournalIndexMatch | undefined> {
  const normalizedIssns = new Set(issns.map(normalizeIssn).filter(Boolean));

  // 1) Fast path: match by ISSN via a direct query.
  let matches = (await fetchRecordsByIssn(issns)).filter((record) =>
    [...splitIssns(record.issn), ...splitIssns(record.eissn)].some((value) =>
      normalizedIssns.has(value)
    )
  );

  // 2) Fallback: match by title (covers records with no ISSN, e.g. the wide
  //    edition-matrix import) — only when the ISSN lookup found nothing.
  if (matches.length === 0 && journalTitle.trim()) {
    matches = (await fetchRecordsByTitle(journalTitle)).filter((record) =>
      titlesMatch(record.journal_title, journalTitle)
    );
  }

  matches = matches.sort(
    (a, b) => editionRank(a.edition) - editionRank(b.edition)
  );

  if (matches[0]) {
    // Collect every edition this journal belongs to (e.g. both SSCI and SCIE),
    // best-ranked first, so the UI can show all of them — not just one.
    const editions = Array.from(
      new Set(matches.map((record) => record.edition.toUpperCase()))
    ).sort((a, b) => editionRank(a) - editionRank(b));
    return buildMatch(matches[0], editions);
  }

  const seedMatch = findSeedJournalIndexMatch({ issns, journalTitle });
  if (!seedMatch) {
    return undefined;
  }

  return {
    database: seedMatch.database,
    edition: seedMatch.database,
    editions: [seedMatch.database],
    indexSource: `依內建索引判別所屬資料庫：${seedMatch.database}`,
    level: seedMatch.level,
    publisherName: "",
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

  // Only the Edition / 資料庫別 is auto-filled — every edition the journal
  // belongs to, joined by "、". `journalLevel`（I級/非I級）is always a manual
  // decision and is intentionally left untouched here.
  const studentChangedFields = new Set(
    journal.publicationChangeNotes?.map((note) => note.field) ?? []
  );
  return {
    ...journal,
    database: studentChangedFields.has("database")
      ? journal.database
      : match.editions.length > 0
        ? match.editions.join("、")
        : match.database || journal.database,
    indexSource: match.indexSource,
    reviewUnit: studentChangedFields.has("reviewUnit")
      ? journal.reviewUnit
      : match.publisherName || journal.reviewUnit,
  };
}
