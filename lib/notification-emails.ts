import { isValidEmail } from "@/lib/validation";

/**
 * Pure helpers for `dashboard_accounts.notification_emails`.
 *
 * Kept in `lib/` root rather than `lib/email/` (which is the server-only Resend
 * transport) so the settings dialog in `components/auth-button.tsx` and the API
 * routes share one definition of "what a valid list looks like".
 */

/** 每個後台帳號最多可設定的通知信箱數量。 */
export const MAX_NOTIFICATION_EMAILS = 5;

/** trim + 轉小寫 + 去重（保留輸入順序）+ 去掉空字串。不做格式驗證。 */
export function normalizeNotificationEmails(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const email = item.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }

  return result;
}

export type NotificationEmailsValidation =
  | { ok: true; emails: string[] }
  | { ok: false; error: string };

/** 寫入前的嚴格驗證，錯誤訊息可直接顯示給使用者。 */
export function validateNotificationEmails(
  value: unknown
): NotificationEmailsValidation {
  if (
    value !== undefined &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value !== "string"
  ) {
    return { ok: false, error: "通知信箱格式不合法。" };
  }

  const emails = normalizeNotificationEmails(value);

  if (emails.length > MAX_NOTIFICATION_EMAILS) {
    return {
      ok: false,
      error: `通知信箱最多只能設定 ${MAX_NOTIFICATION_EMAILS} 組。`,
    };
  }

  const invalid = emails.find((email) => !isValidEmail(email));
  if (invalid) {
    return { ok: false, error: `信箱格式不合法：${invalid}` };
  }

  return { ok: true, emails };
}

/**
 * 讀取 DB 欄位用的寬鬆解析：永不 throw，直接丟掉格式錯誤或超量的值。
 * 寄信路徑用這個，避免一筆髒資料就讓整批通知失敗。
 */
export function parseNotificationEmails(value: unknown): string[] {
  return normalizeNotificationEmails(value)
    .filter((email) => isValidEmail(email))
    .slice(0, MAX_NOTIFICATION_EMAILS);
}
