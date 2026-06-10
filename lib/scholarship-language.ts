export type ScholarshipLanguage = "zh" | "en";

export const SCHOLARSHIP_LANGUAGE_STORAGE_KEY = "scholarship-ui-language";

export function normalizeScholarshipLanguage(
  value: unknown
): ScholarshipLanguage {
  return value === "en" ? "en" : "zh";
}

export function textForLanguage(
  language: ScholarshipLanguage,
  zh: string,
  en: string
) {
  return language === "en" ? en : zh;
}

export function getInitialScholarshipLanguage(): ScholarshipLanguage {
  if (typeof window === "undefined") {
    return "zh";
  }

  return normalizeScholarshipLanguage(
    window.localStorage.getItem(SCHOLARSHIP_LANGUAGE_STORAGE_KEY)
  );
}
