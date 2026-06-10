import { NextResponse } from "next/server";
import { isValidDoi, normalizeDoi } from "@/lib/doi";
import { findJournalIndexMatch } from "@/lib/journal-index-service";

// Crossref's "polite pool": identifying the caller avoids the heavily
// throttled anonymous pool, which is the usual cause of flaky lookups
// from shared serverless IPs.
const CROSSREF_USER_AGENT =
  "IpeduScholarshipSystem/1.0 (mailto:ipedu@mail.nthu.edu.tw)";

type Author = {
  given: string;
  family: string;
  sequence: string;
};

/** Build a display string like "Brown, T., Mann, B. et al." */
function formatAuthorString(authors: Author[]): string {
  if (authors.length === 0) return "";
  const names = authors.slice(0, 3).map((a) => {
    const initial = a.given ? `${a.given.charAt(0)}.` : "";
    return `${a.family}, ${initial}`.trim();
  });
  let result = names.join(", ");
  if (authors.length > 3) result += " et al.";
  return result;
}

/** Format date-parts [YYYY, MM, DD] → "YYYY-MM-DD" */
function formatDate(dateParts: number[]): string {
  if (dateParts.length === 0) return "";
  const year = dateParts[0];
  if (!year || isNaN(year)) return "";
  const month = String(dateParts[1] || 1).padStart(2, "0");
  const day = String(dateParts[2] || 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawDoi = searchParams.get("doi");

  if (!rawDoi || !rawDoi.trim()) {
    return NextResponse.json(
      { success: false, error: "缺少 DOI 參數" },
      { status: 400 }
    );
  }

  // Normalise common paste artefacts (full URL, "doi:" scheme, trailing
  // punctuation) before doing anything else.
  const doi = normalizeDoi(rawDoi);

  // Reject malformed input with a distinct code so the client can show a
  // "格式錯誤" warning rather than a misleading "查無資料".
  if (!isValidDoi(doi)) {
    return NextResponse.json(
      {
        success: false,
        code: "invalid_format",
        error:
          "DOI 格式不正確，請輸入如 10.xxxx/xxxxx 的格式（可省略 https://doi.org/ 前綴）。",
      },
      { status: 422 }
    );
  }

  try {
    // ── Step 1: Try Crossref (has the richest metadata) ──
    const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const crRes = await fetch(crossrefUrl, {
      headers: { "User-Agent": CROSSREF_USER_AGENT },
    });

    if (crRes.ok) {
      const data = (await crRes.json()).message;

      const dateParts =
        data["published-print"]?.["date-parts"]?.[0] ||
        data["published-online"]?.["date-parts"]?.[0] ||
        data["created"]?.["date-parts"]?.[0] ||
        [];

      const authorsRaw: { given?: string; family?: string; sequence?: string }[] =
        data.author || [];
      const authors: Author[] = authorsRaw.map((a) => ({
        given: a.given || "",
        family: a.family || "",
        sequence: a.sequence || "additional",
      }));

      const volume = data.volume ? `Vol. ${data.volume}` : "";
      const issue = data.issue ? `Issue ${data.issue}` : "";
      const volumeIssue = [volume, issue].filter(Boolean).join(", ");

      const journalName = data["container-title"]?.[0] || "未提供期刊名稱";
      const issns: string[] = data.ISSN || [];
      const indexMatch = await findJournalIndexMatch({
        issns,
        journalTitle: journalName,
      });

      return NextResponse.json({
        success: true,
        source: "Crossref",
        data: {
          doi: data.DOI,
          title: data.title?.[0] || "未提供標題",
          journalName,
          publishDate: formatDate(dateParts),
          volumeIssue,
          issns,
          indexMatch,
          authors,
          authorString: formatAuthorString(authors),
          publisher: data.publisher || "",
        },
      });
    }

    // ── Step 2: Crossref miss — fallback to DOI content negotiation (CSL JSON) ──
    // Works for Airiti (Taiwan), DataCite, mEDRA, JaLC, etc.
    const cslRes = await fetch(
      `https://doi.org/${encodeURIComponent(doi)}`,
      {
        headers: {
          Accept: "application/vnd.citationstyles.csl+json",
          "User-Agent": CROSSREF_USER_AGENT,
        },
        redirect: "follow",
      }
    );

    if (!cslRes.ok) {
      return NextResponse.json(
        { success: false, error: "找不到此 DOI，請確認輸入是否正確。" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csl = (await cslRes.json()) as Record<string, any>;

    // Parse authors — CSL may use "literal" (single string) or given+family
    const cslAuthors: Author[] = (
      Array.isArray(csl.author) ? csl.author : []
    ).map(
      (a: { literal?: string; given?: string; family?: string; sequence?: string }) => {
        if (a.literal) {
          // For Chinese names like "黃寶園", put the full name in family
          return { given: "", family: a.literal.trim(), sequence: "additional" };
        }
        return {
          given: a.given || "",
          family: a.family || "",
          sequence: a.sequence || "additional",
        };
      }
    );

    // Mark first author
    if (cslAuthors.length > 0) {
      cslAuthors[0].sequence = "first";
    }

    // date-parts may contain strings (Airiti) or numbers (DataCite) — normalise
    const rawDateParts: (string | number)[] =
      csl.issued?.["date-parts"]?.[0] || [];
    const cslDateParts = rawDateParts.map(Number);

    const cslVolume = csl.volume ? `Vol. ${csl.volume}` : "";
    const cslIssue = csl.issue ? `Issue ${csl.issue}` : "";
    const cslVolumeIssue = [cslVolume, cslIssue].filter(Boolean).join(", ");

    // ISSN may be a string or array — normalise to array
    const rawIssn = csl.ISSN;
    const issns: string[] = Array.isArray(rawIssn)
      ? rawIssn
      : typeof rawIssn === "string" && rawIssn
        ? [rawIssn]
        : [];

    // Format author string for Chinese names (no abbreviation)
    let authorString = "";
    if (cslAuthors.length > 0) {
      const names = cslAuthors.slice(0, 3).map((a) => {
        if (!a.given) return a.family; // Chinese literal name
        const initial = `${a.given.charAt(0)}.`;
        return `${a.family}, ${initial}`.trim();
      });
      authorString = names.join(", ");
      if (cslAuthors.length > 3) authorString += " et al.";
    }

    const journalName = csl["container-title"] || "未提供期刊名稱";
    const indexMatch = await findJournalIndexMatch({
      issns,
      journalTitle: journalName,
    });

    return NextResponse.json({
      success: true,
      source: "DOI",
      data: {
        doi: csl.DOI || doi,
        title: csl.title || "未提供標題",
        journalName,
        publishDate: formatDate(cslDateParts),
        volumeIssue: cslVolumeIssue,
        issns,
        indexMatch,
        authors: cslAuthors,
        authorString,
        publisher: csl.publisher || "",
      },
    });
  } catch (error) {
    console.error("Fetch Publication Error:", error);
    return NextResponse.json(
      { success: false, error: "伺服器處理時發生錯誤，請稍後再試。" },
      { status: 500 }
    );
  }
}
