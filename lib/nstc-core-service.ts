import type { NstcCoreJournalRecord } from "@/lib/types";

export type NstcMatch = {
  /** TSSCI / THCI / THCI、TSSCI */
  database: string;
  /** 第一級 / 第二級 */
  tier: string | null;
  indexSource: string;
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

/** Title normalised to lowercase words separated by single spaces. */
function normalizeTitleWords(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim();
}

/**
 * Whether two journal titles refer to the same journal. Besides an exact match,
 * tolerate a trailing sub-title difference: the shorter title must be a
 * word-boundary prefix of the longer one and be specific enough (≥3 words) to
 * avoid generic prefixes. (Same rule as lib/journal-index-service.ts.)
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

/**
 * The NSTC core list is small (≈100 journals), so fetch it all and match in JS
 * against both the Chinese and English title — far simpler and more reliable
 * than SQL ilike for such a small table.
 */
async function fetchAllNstcRecords(): Promise<NstcCoreJournalRecord[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  const response = await fetch(
    `${config.url}/rest/v1/nstc_core_journal_records?select=journal_title_zh,journal_title_en,discipline,database,tier&limit=5000`,
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

  return (await response.json()) as NstcCoreJournalRecord[];
}

/**
 * Match a journal (by its Chinese or English name) against the NSTC core list.
 * Journals in the list are I級期刊 by definition.
 */
export async function findNstcMatch({
  journalTitle,
}: {
  journalTitle: string;
}): Promise<NstcMatch | undefined> {
  const title = (journalTitle ?? "").trim();
  if (!title) return undefined;

  const records = await fetchAllNstcRecords();
  const match = records.find(
    (record) =>
      (record.journal_title_en &&
        titlesMatch(record.journal_title_en, title)) ||
      (record.journal_title_zh && titlesMatch(record.journal_title_zh, title))
  );

  if (!match) return undefined;

  return {
    database: match.database,
    tier: match.tier ?? null,
    indexSource: `國科會核心期刊（${match.database}${
      match.tier ? `，${match.tier}` : ""
    }）`,
  };
}
