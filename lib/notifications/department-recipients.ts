import { canAccessDepartment, resolveDashboardScope } from "@/lib/departments";
import { parseNotificationEmails } from "@/lib/notification-emails";
import type { DashboardRole } from "@/lib/types";

/**
 * Resolves which dashboard accounts should be told about an application.
 *
 * Uses the exact same `canAccessDepartment` predicate the dashboard list uses,
 * so "can see the case" and "gets the mail" can never drift apart.
 */

export type DepartmentNotificationRecipient = {
  displayName: string;
  emails: string[];
  role: DashboardRole;
  username: string;
};

type DashboardAccountRow = {
  department_scope: unknown;
  display_name: string | null;
  notification_emails: unknown;
  role: string;
  username: string;
};

/**
 * 找出所有「department_scope 涵蓋此申請案系所」且已填通知信箱的啟用中後台帳號。
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
    const query = new URLSearchParams({
      is_active: "eq.true",
      select:
        "username,display_name,role,department_scope,notification_emails",
    });

    const response = await fetch(
      `${url}/rest/v1/dashboard_accounts?${query}`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        detail.includes("notification_emails")
          ? "Skipping department notification: run supabase/add_dashboard_notification_emails.sql."
          : `Skipping department notification: dashboard_accounts query failed. ${detail}`
      );
      return [];
    }

    const rows = (await response.json()) as DashboardAccountRow[];

    // 同一個信箱同時掛在兩個帳號時只寄一次。
    const globallySeen = new Set<string>();
    const recipients: DepartmentNotificationRecipient[] = [];

    for (const row of rows) {
      if (row.role !== "teacher" && row.role !== "admin") continue;

      const scope = resolveDashboardScope(
        row.department_scope,
        row.username,
        row.role
      );
      if (!canAccessDepartment(scope, department)) continue;

      const emails = parseNotificationEmails(row.notification_emails).filter(
        (email) => !globallySeen.has(email)
      );
      if (emails.length === 0) continue;
      for (const email of emails) globallySeen.add(email);

      recipients.push({
        displayName: row.display_name || row.username,
        emails,
        role: row.role,
        username: row.username,
      });
    }

    return recipients;
  } catch (error) {
    console.error("resolveDepartmentNotificationRecipients failed:", error);
    return [];
  }
}
