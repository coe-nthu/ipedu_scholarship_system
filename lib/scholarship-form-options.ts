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
export const FULL_TIME_STUDY_STATUS_NEW = "新生";
export const FULL_TIME_STUDY_STATUS_OLD = "舊生";
export const FULL_TIME_STUDY_STATUS_OPTIONS = [
  FULL_TIME_STUDY_STATUS_NEW,
  FULL_TIME_STUDY_STATUS_OLD,
] as const;
export const DASHBOARD_STUDY_STATUS_OPTIONS = [
  ...STUDY_STATUS_OPTIONS,
  ...FULL_TIME_STUDY_STATUS_OPTIONS,
] as const;

export const ADMISSION_CHANNEL_OPTIONS = [
  "甄試",
  "考試",
  "逕修博",
] as const;

export const OTHER_AID_STATUS_NONE = "未兼領";
export const OTHER_AID_STATUS_RECEIVING = "有領取";
export const OTHER_AID_STATUS_OPTIONS = [
  OTHER_AID_STATUS_NONE,
  OTHER_AID_STATUS_RECEIVING,
] as const;

/**
 * 全時博士生助學金「申請類別」。This is a *multi-select* field: a student may
 * apply for both tracks at once, so the value is stored as the selected labels
 * joined by {@link MULTI_OPTION_DELIMITER}. Every other scholarship keeps a
 * single fixed 申請類別.
 */
export const FULL_TIME_APPLICATION_TYPE_MATCHING_FUND = "指導教授配合款";
export const FULL_TIME_APPLICATION_TYPE_COMPETITIVE = "競爭型";
export const FULL_TIME_APPLICATION_TYPES = [
  FULL_TIME_APPLICATION_TYPE_MATCHING_FUND,
  FULL_TIME_APPLICATION_TYPE_COMPETITIVE,
] as const;

export const MATCHING_FUND_SOURCE_OPTIONS = [
  "國科會",
  "教育部",
  "其他",
  "無",
] as const;

/**
 * 全時博士生助學金「兼職與留職停薪情形調查」。紙本申請書為可複選的勾選欄位，
 * 因此這裡是 *multi-select* 欄位，值以 {@link MULTI_OPTION_DELIMITER} 串接。
 * 例：「報考時具專職工作，已辦理留職停薪、受獎期間符合全時就學資格」。
 */
export const EMPLOYMENT_STATUS_NONE = "無兼職";
export const EMPLOYMENT_STATUS_UNPAID_LEAVE = "報考時具專職工作，已辦理留職停薪";
export const EMPLOYMENT_STATUS_FULL_TIME_STUDY = "受獎期間符合全時就學資格";
export const EMPLOYMENT_STATUS_PART_TIME = "有兼職（非專職）";
export const EMPLOYMENT_STATUS_OPTIONS = [
  EMPLOYMENT_STATUS_NONE,
  EMPLOYMENT_STATUS_UNPAID_LEAVE,
  EMPLOYMENT_STATUS_FULL_TIME_STUDY,
  EMPLOYMENT_STATUS_PART_TIME,
] as const;

/**
 * 舊版單選「兼職情形」的選項。表單已不再提供，但既有申請案仍存著這些值，
 * 後台編輯與後端驗證必須繼續接受，否則舊資料一存檔就會被擋下來。
 */
export const LEGACY_EMPLOYMENT_STATUS_TA = "擔任校內外教學助理";
export const LEGACY_EMPLOYMENT_STATUS_PART_TIME = "有校內外兼職";
export const DASHBOARD_EMPLOYMENT_STATUS_OPTIONS = [
  ...EMPLOYMENT_STATUS_OPTIONS,
  LEGACY_EMPLOYMENT_STATUS_TA,
  LEGACY_EMPLOYMENT_STATUS_PART_TIME,
] as const;

/**
 * Edition / 資料庫別 options. The system auto-detects the edition (SSCI / SCIE /
 * TSSCI / THCI …) from the journal index. 期刊等級（I級）is chosen manually for WoS
 * indices; the one exception is the 國科會 core list (TSSCI/THCI), where a match
 * means the journal is I級期刊.
 */
export const DATABASE_OPTIONS = [
  "SSCI",
  "SCIE",
  "AHCI",
  "SCI",
  "TSSCI",
  "THCI",
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

/**
 * Some fixed-option fields accept several values at once — the Edition / 資料庫別
 * of a journal (a journal may be indexed in more than one), and 全時博士生助學金's
 * 申請類別. Multiple values are stored as a single string joined by "、", which
 * keeps the column a plain `text` and leaves single-value rows valid as-is.
 */
export const MULTI_OPTION_DELIMITER = "、";

export function parseMultiOptionValues(
  value: string | null | undefined
): string[] {
  return (value ?? "")
    .split(/[、,;/|\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinMultiOptionValues(values: string[]): string {
  return Array.from(new Set(values)).join(MULTI_OPTION_DELIMITER);
}

/**
 * Like {@link isAllowedOption}, but for a multi-value field: every selected
 * value must be in the allowed list. Empty is treated as "not set" → valid.
 */
export function isAllowedMultiOption(
  value: unknown,
  allowed: readonly string[]
): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  return parseMultiOptionValues(value).every((item) => allowed.includes(item));
}
