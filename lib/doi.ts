/**
 * Shared, dependency-free DOI helpers used by:
 *  - the student form's "自動帶入" lookup (client)
 *  - the `/api/publications/fetch` route (server)
 *  - submit-time verification (`lib/verification.ts`)
 *
 * Students frequently paste a DOI as a full URL (`https://doi.org/10.xxxx/...`),
 * with a `doi:` scheme, wrapped in angle brackets, or with trailing punctuation
 * copied from a citation. These break a naive lookup and surface a misleading
 * "查無資料" message. Normalising first — and validating the format explicitly —
 * lets us auto-fill reliably and show a real "格式錯誤" warning when needed.
 */

/**
 * Strip common prefixes / wrappers / trailing citation punctuation from a
 * user-entered DOI string. Returns the bare DOI (e.g. `10.3389/fpsyg.2023.1222608`).
 */
export function normalizeDoi(input: string | null | undefined): string {
  let doi = (input ?? "").trim();
  if (!doi) return "";

  // Remove surrounding angle brackets: <10.xxxx/...>
  doi = doi.replace(/^<+/, "").replace(/>+$/, "").trim();

  // Strip URL prefixes: https://doi.org/, http://dx.doi.org/, etc.
  doi = doi.replace(/^https?:\/\/(www\.)?(dx\.)?doi\.org\//i, "");

  // Strip the "doi:" scheme prefix
  doi = doi.replace(/^doi:\s*/i, "");

  // Trim again, then drop trailing whitespace / period / closing brackets that
  // commonly get copied from the end of a citation sentence.
  doi = doi.trim().replace(/[\s.,;)\]>]+$/, "");

  return doi;
}

/**
 * Validate a DOI's structural format. A DOI is `10.<registrant>/<suffix>`,
 * where the registrant is 4–9 digits and the suffix is any non-space string.
 * Call this on the NORMALISED value.
 */
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

export function isValidDoi(doi: string | null | undefined): boolean {
  return DOI_PATTERN.test((doi ?? "").trim());
}
