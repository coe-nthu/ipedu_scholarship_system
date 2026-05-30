import type {
  Journal,
  PublicationVerification,
  ReviewStatus,
  VerificationSummary,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Chinese numeral mapping */
const CHINESE_NUMS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/**
 * Parse a claimed author order string to a numeric position or "corresponding".
 *
 * Supports:
 *   "第一作者" / "第1作者" / "1" / "第一" → 1
 *   "通訊作者" / contains "通訊" → "corresponding"
 *   "共同第一作者" → 1
 */
function parseAuthorOrder(
  order: string
): number | "corresponding" | null {
  const t = order.trim();
  if (!t) return null;

  if (t.includes("通訊")) return "corresponding";

  // "共同第一作者" → treat as position 1
  if (t.includes("共同") && t.includes("第一")) return 1;

  // Chinese numeral: 第X or 第X作者
  const chMatch = t.match(/第([一二三四五六七八九十])/);
  if (chMatch) return CHINESE_NUMS[chMatch[1]] ?? null;

  // Arabic numeral: 第N作者, 第N, or just N
  const numMatch = t.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return null;
}

/** Normalise an author name for fuzzy comparison */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-''"""]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if two author names match (fuzzy) */
function authorNamesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (!na || !nb) return false;
  if (na === nb) return true;

  // One contains the other ("J Smith" vs "John Smith")
  if (na.includes(nb) || nb.includes(na)) return true;

  // Last-name + first-initial match
  const pa = na.split(" ");
  const pb = nb.split(" ");
  if (pa.length > 0 && pb.length > 0) {
    const lastA = pa[pa.length - 1];
    const lastB = pb[pb.length - 1];
    if (lastA === lastB && pa[0]?.[0] === pb[0]?.[0]) return true;
  }

  return false;
}

/** fetch() with an AbortController timeout */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Verify a single publication via Crossref + OpenAlex                */
/* ------------------------------------------------------------------ */

export async function verifyPublication(
  journal: Journal
): Promise<PublicationVerification> {
  const now = new Date().toISOString();
  const base: PublicationVerification = {
    status: "skipped",
    doiExists: "skipped",
    doiRegistrationAgency: null,
    authorFound: "skipped",
    authorOrderCorrect: "skipped",
    actualAuthorPosition: null,
    totalAuthors: null,
    citedByCount: null,
    crossrefTitle: null,
    crossrefJournal: null,
    crossrefAuthors: null,
    message: "",
    verifiedAt: now,
  };

  if (!journal.doi) {
    base.message = "無 DOI，跳過自動驗證";
    return base;
  }

  /* ---- Step 1: Check DOI existence via doi.org Registration Agency API ---- */
  let doiRA: string | null = null;
  try {
    const raUrl = `https://doi.org/doiRA/${encodeURIComponent(journal.doi)}`;
    const raRes = await fetchWithTimeout(raUrl, {}, 5000);
    if (raRes.ok) {
      const raData = (await raRes.json()) as { RA?: string; status?: string }[];
      if (raData?.[0]?.RA) {
        doiRA = raData[0].RA;
        base.doiExists = "pass";
        base.doiRegistrationAgency = doiRA;
      } else {
        // DOI does not exist
        return {
          ...base,
          doiExists: "fail",
          status: "fail",
          message: `DOI「${journal.doi}」不存在`,
        };
      }
    }
  } catch {
    // doiRA check failed — continue and try Crossref directly
  }

  /* ---- Helper: run author + order matching against a list of names ---- */
  function matchAuthors(authors: string[], source: string) {
    base.crossrefAuthors = authors;
    base.totalAuthors = authors.length;

    if (journal.applicantAuthorName && authors.length > 0) {
      const idx = authors.findIndex((n) =>
        authorNamesMatch(journal.applicantAuthorName, n)
      );

      if (idx >= 0) {
        base.authorFound = "pass";
        base.actualAuthorPosition = idx + 1;

        const claimed = parseAuthorOrder(journal.authorOrder);
        if (claimed === "corresponding") {
          base.authorOrderCorrect = journal.isCorrespondingAuthor
            ? "pass"
            : "fail";
          base.message = journal.isCorrespondingAuthor
            ? `通訊作者身分需人工確認（${source} 無法完全驗證）`
            : "宣稱為通訊作者但未勾選通訊作者欄位";
        } else if (claimed !== null) {
          if (claimed === base.actualAuthorPosition) {
            base.authorOrderCorrect = "pass";
          } else {
            base.authorOrderCorrect = "fail";
            base.message = `宣稱第 ${claimed} 作者，實際排序為第 ${base.actualAuthorPosition} 作者（共 ${base.totalAuthors} 位）`;
          }
        } else {
          base.authorOrderCorrect = "skipped";
          base.message = `無法解析作者順序「${journal.authorOrder}」，需人工確認`;
        }
      } else {
        base.authorFound = "fail";
        base.message = `申請者署名「${journal.applicantAuthorName}」未在 DOI 作者列表中找到`;
      }
    } else if (!journal.applicantAuthorName) {
      base.authorFound = "skipped";
      base.message = "未填寫申請者署名，跳過作者比對";
    }
  }

  /* ---- Step 2: Crossref lookup (author verification) ---- */
  let authorDataFound = false;
  const isCrossref = doiRA === "Crossref" || doiRA === null; // null = doiRA check failed, try anyway
  if (isCrossref) {
    try {
      const crUrl = `https://api.crossref.org/works/${encodeURIComponent(journal.doi)}`;
      const crRes = await fetchWithTimeout(crUrl, {}, 8000);

      if (!crRes.ok) {
        if (base.doiExists !== "pass") {
          return {
            ...base,
            doiExists: "fail",
            status: "fail",
            message:
              crRes.status === 404
                ? `DOI「${journal.doi}」在 Crossref 中不存在`
                : `Crossref 回傳 HTTP ${crRes.status}`,
          };
        }
      } else {
        base.doiExists = "pass";
        const data = (await crRes.json()).message;
        base.crossrefTitle = data.title?.[0] ?? null;
        base.crossrefJournal = data["container-title"]?.[0] ?? null;

        const authors: string[] = (
          data.author as { given?: string; family?: string }[] | undefined
        )?.map((a) => [a.given, a.family].filter(Boolean).join(" ").trim()) ?? [];

        if (authors.length > 0) {
          matchAuthors(authors, "Crossref");
          authorDataFound = true;
        }
      }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && err.name === "AbortError";
      if (base.doiExists !== "pass") {
        return {
          ...base,
          doiExists: "timeout",
          status: "timeout",
          message: isAbort ? "Crossref API 逾時" : "Crossref API 查詢失敗",
        };
      }
    }
  }

  /* ---- Step 3: DOI content negotiation fallback (Airiti, DataCite, etc.) ---- */
  if (!authorDataFound && base.doiExists === "pass") {
    try {
      const cnUrl = `https://doi.org/${encodeURIComponent(journal.doi)}`;
      const cnRes = await fetchWithTimeout(
        cnUrl,
        { headers: { Accept: "application/vnd.citationstyles.csl+json" } },
        8000
      );
      if (cnRes.ok) {
        const cslData = (await cnRes.json()) as {
          title?: string;
          "container-title"?: string;
          author?: { literal?: string; given?: string; family?: string }[];
        };

        base.crossrefTitle = base.crossrefTitle ?? cslData.title ?? null;
        base.crossrefJournal =
          base.crossrefJournal ?? cslData["container-title"] ?? null;

        const authors: string[] =
          cslData.author
            ?.map((a) =>
              a.literal
                ? a.literal.trim()
                : [a.given, a.family].filter(Boolean).join(" ").trim()
            )
            .filter(Boolean) ?? [];

        if (authors.length > 0) {
          matchAuthors(authors, doiRA ?? "DOI");
          authorDataFound = true;
        }
      }
    } catch {
      // Content negotiation is best-effort
    }
  }

  /* ---- Non-Crossref DOI with no author data from any source ---- */
  if (!authorDataFound && base.doiExists === "pass") {
    base.message = `DOI 存在（註冊機構：${doiRA ?? "未知"}），無法取得作者資訊，需人工確認`;
  }

  /* ---- OpenAlex (non-blocking) ---- */
  try {
    const oaUrl = `https://api.openalex.org/works/doi:${encodeURIComponent(journal.doi)}`;
    const oaRes = await fetchWithTimeout(oaUrl, {}, 5000);
    if (oaRes.ok) {
      const oaData = (await oaRes.json()) as { cited_by_count?: number };
      base.citedByCount = oaData.cited_by_count ?? null;
    }
  } catch {
    // citation count is best-effort; don't fail the check
  }

  /* ---- Overall status ---- */
  const checks = [base.doiExists, base.authorFound, base.authorOrderCorrect];
  if (checks.includes("fail")) {
    base.status = "fail";
  } else if (checks.includes("timeout")) {
    base.status = "timeout";
  } else if (
    base.doiExists === "pass" &&
    base.authorFound === "pass" &&
    (base.authorOrderCorrect === "pass" ||
      base.authorOrderCorrect === "skipped")
  ) {
    base.status = "pass";
  } else {
    base.status = "skipped";
  }

  return base;
}

/* ------------------------------------------------------------------ */
/*  Verify all publications in a payload                               */
/* ------------------------------------------------------------------ */

export async function verifyAllPublications(journals: Journal[]): Promise<{
  journals: Journal[];
  summary: VerificationSummary;
  reviewStatus: ReviewStatus;
}> {
  if (!journals || journals.length === 0) {
    return {
      journals: [],
      summary: {
        status: "all_passed",
        verifiedAt: new Date().toISOString(),
      },
      reviewStatus: "未審核",
    };
  }

  // Run all DOI-bearing journals in parallel; skip others
  const results = await Promise.all(
    journals.map((j) => verifyPublication(j))
  );

  // Embed results into each journal
  const enriched = journals.map((j, i) => ({
    ...j,
    verification: results[i],
  }));

  const hasFail = results.some((r) => r.status === "fail");
  const hasTimeout = results.some((r) => r.status === "timeout");
  const allGood = results.every(
    (r) => r.status === "pass" || r.status === "skipped"
  );

  let summaryStatus: VerificationSummary["status"];
  let reviewStatus: ReviewStatus;

  if (hasFail) {
    summaryStatus = "has_issues";
    reviewStatus = "未審核";
  } else if (hasTimeout) {
    summaryStatus = "timeout";
    reviewStatus = "未審核";
  } else if (allGood) {
    summaryStatus = "all_passed";
    reviewStatus = "未審核";
  } else {
    summaryStatus = "pending";
    reviewStatus = "未審核";
  }

  return {
    journals: enriched,
    summary: { status: summaryStatus, verifiedAt: new Date().toISOString() },
    reviewStatus,
  };
}
