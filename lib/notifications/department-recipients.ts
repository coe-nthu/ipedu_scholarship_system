import { canAccessDepartment, resolveDashboardScope } from "@/lib/departments";
import { parseNotificationEmails } from "@/lib/notification-emails";
import type { DashboardRole } from "@/lib/types";

/**
 * Resolves which dashboard accounts should be told about an application.
 *
 * Uses the exact same `canAccessDepartment` predicate the dashboard list uses,
 * so "can see the case" and "gets the mail" can never drift apart.
 *
 * Both kinds of dashboard account are covered: 帳密 accounts in
 * `dashboard_accounts` and Google accounts in `authorized_emails`.
 */

export type DepartmentNotificationRecipient = {
  /** Stable per-account key; used in the Resend idempotency key. */
  accountKey: string;
  displayName: string;
  emails: string[];
  role: DashboardRole;
};

type ScopedAccountRow = {
  department_scope: unknown;
  notification_emails: unknown;
  role: string;
};

type DashboardAccountRow = ScopedAccountRow & {
  display_name: string | null;
  username: string;
};

type AuthorizedEmailRow = ScopedAccountRow & {
  email: string;
};

async function fetchRows<T>({
  query,
  serviceRoleKey,
  table,
  url,
}: {
  query: string;
  serviceRoleKey: string;
  table: string;
  url: string;
}): Promise<T[]> {
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(
      detail.includes("notification_emails")
        ? `Skipping ${table} notification recipients: run supabase/add_dashboard_notification_emails.sql.`
        : `Skipping ${table} notification recipients: query failed. ${detail}`
    );
    return [];
  }

  return (await response.json()) as T[];
}

/**
 * 找出所有「department_scope 涵蓋此申請案系所」且已填通知信箱的後台帳號。
 * scope 為 "all" 的院辦帳號自然全部命中。
 *
 * 任何錯誤都只記 log 並回傳 []，通知永遠不能影響學生送件。
 */
export async function resolveDepartmentNotificationRecipients({
  department,
  serviceRoleKey,
  url,
}: {
  department: string | null | undefined;
  serviceRoleKey: string;
  url: string;
}): Promise<DepartmentNotificationRecipient[]> {
  try {
    const [passwordRows, googleRows] = await Promise.all([
      fetchRows<DashboardAccountRow>({
        query: new URLSearchParams({
          is_active: "eq.true",
          select:
            "username,display_name,role,department_scope,notification_emails",
        }).toString(),
        serviceRoleKey,
        table: "dashboard_accounts",
        url,
      }),
      fetchRows<AuthorizedEmailRow>({
        // authorized_emails has no is_active column.
        query: new URLSearchParams({
          select: "email,role,department_scope,notification_emails",
        }).toString(),
        serviceRoleKey,
        table: "authorized_emails",
        url,
      }),
    ]);

    const candidates = [
      ...passwordRows.map((row) => ({
        accountKey: `account:${row.username}`,
        displayName: row.display_name || row.username,
        row: row as ScopedAccountRow,
        scopeFallbackKey: row.username,
      })),
      ...googleRows.map((row) => ({
        accountKey: `google:${row.email}`,
        displayName: row.email,
        row: row as ScopedAccountRow,
        scopeFallbackKey: row.email,
      })),
    ];

    // 同一個信箱同時掛在多個帳號時只寄一次。
    const globallySeen = new Set<string>();
    const recipients: DepartmentNotificationRecipient[] = [];

    for (const candidate of candidates) {
      const { role } = candidate.row;
      if (role !== "teacher" && role !== "admin") continue;

      const scope = resolveDashboardScope(
        candidate.row.department_scope,
        candidate.scopeFallbackKey,
        role
      );
      if (!canAccessDepartment(scope, department)) continue;

      const emails = parseNotificationEmails(
        candidate.row.notification_emails
      ).filter((email) => !globallySeen.has(email));
      if (emails.length === 0) continue;
      for (const email of emails) globallySeen.add(email);

      recipients.push({
        accountKey: candidate.accountKey,
        displayName: candidate.displayName,
        emails,
        role,
      });
    }

    return recipients;
  } catch (error) {
    console.error("resolveDepartmentNotificationRecipients failed:", error);
    return [];
  }
}
