/** UUID v4 pattern */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a string is a valid UUID v4 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Allowed review_status values for the dashboard PATCH */
const VALID_REVIEW_STATUSES = [
  "未審核",
  "系所審核通過",
  "院辦審核通過",
] as const;

export type ReviewStatus = (typeof VALID_REVIEW_STATUSES)[number];

export function isValidReviewStatus(value: unknown): value is ReviewStatus {
  return (
    typeof value === "string" &&
    VALID_REVIEW_STATUSES.includes(value as ReviewStatus)
  );
}

/**
 * Validate a Supabase storage path for the download proxy.
 * Must match: {UUID}/{field}/{UUID}.pdf — no "..", no backslash, no encoded traversal.
 */
const SAFE_STORAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export function isValidStoragePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path.includes("..") || path.includes("\\") || path.includes("%2e"))
    return false;
  return SAFE_STORAGE_PATH.test(path);
}
