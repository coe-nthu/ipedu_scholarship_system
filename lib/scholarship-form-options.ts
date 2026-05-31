/**
 * Shared fixed-option constants and validators for the scholarship form.
 *
 * Client-safe (no server-only imports) so it can be consumed by:
 *  - the public application form (`app/scholarships/.../page.tsx`)
 *  - the dashboard reviewer edit UI (`app/dashboard/application-detail.tsx`)
 *  - the dashboard PATCH API (`app/api/dashboard/route.ts`)
 *
 * Keep this the single source of truth for these enumerations so the front-end
 * dropdowns and the back-end validation can never drift apart.
 */

export const DEPARTMENT_OPTIONS = [
  "竹師教育學院博士班",
  "教育與學習科技學系",
  "教育心理與諮商學系",
  "臺灣語言研究與教學研究所",
] as const;

export const GPA_SCALE_OPTIONS = ["4.3", "4.0"] as const;

export const STUDY_STATUS_NEW = "新領";
export const STUDY_STATUS_RENEWAL = "續領";
export const STUDY_STATUS_OPTIONS = [
  STUDY_STATUS_NEW,
  STUDY_STATUS_RENEWAL,
] as const;

export const EMPLOYMENT_STATUS_NONE = "無兼職";
export const EMPLOYMENT_STATUS_TA = "擔任校內外教學助理";
export const EMPLOYMENT_STATUS_PART_TIME = "有校內外兼職";
export const EMPLOYMENT_STATUS_OPTIONS = [
  EMPLOYMENT_STATUS_NONE,
  EMPLOYMENT_STATUS_TA,
  EMPLOYMENT_STATUS_PART_TIME,
] as const;

export const DATABASE_OPTIONS = [
  "SSCI",
  "SCIE",
  "SCI",
  "TSSCI",
  "SCOPUS",
  "其他",
  "否",
] as const;

/**
 * Validate that a value is an allowed option.
 * Empty string / undefined / null are treated as "not set" → valid, because
 * these fields are optional on the form. A non-empty value must be in the list.
 */
export function isAllowedOption(
  value: unknown,
  allowed: readonly string[]
): boolean {
  if (value === undefined || value === null || value === "") return true;
  return typeof value === "string" && allowed.includes(value);
}
