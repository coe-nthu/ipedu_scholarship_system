import { NextResponse } from "next/server";

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
  const doi = searchParams.get("doi");

  if (!doi) {
    return NextResponse.json(
      { success: false, error: "缺少 DOI 參數" },
      { status: 400 }
    );
  }

  try {
    // ── Step 1: Try Crossref (has the richest metadata) ──
    const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const crRes = await fetch(crossrefUrl);

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

      return NextResponse.json({
        success: true,
        source: "Crossref",
        data: {
          doi: data.DOI,
          title: data.title?.[0] || "未提供標題",
          journalName: data["container-title"]?.[0] || "未提供期刊名稱",
          publishDate: formatDate(dateParts),
          volumeIssue,
          issns: data.ISSN || [],
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
        headers: { Accept: "application/vnd.citationstyles.csl+json" },
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

    return NextResponse.json({
      success: true,
      source: "DOI",
      data: {
        doi: csl.DOI || doi,
        title: csl.title || "未提供標題",
        journalName: csl["container-title"] || "未提供期刊名稱",
        publishDate: formatDate(cslDateParts),
        volumeIssue: cslVolumeIssue,
        issns,
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
