import { createClient } from "@/lib/supabase/server";

export type DashboardRole = "teacher" | "admin";

export type AuthResult =
  | { authorized: true; email: string; role: DashboardRole; userId: string }
  | { authorized: false; reason: "not_authenticated" | "not_authorized" };

/**
 * Check if the current user has dashboard access (teacher or admin role).
 * Uses the profiles table which is synced with the authorized_emails whitelist.
 */
export async function checkDashboardAccess(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) {
    return { authorized: false, reason: "not_authenticated" };
  }

  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return { authorized: false, reason: "not_authorized" };
  }

  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );

  if (res.ok) {
    const profiles = (await res.json()) as { role: string }[];
    const role = profiles[0]?.role;
    if (role === "teacher" || role === "admin") {
      return {
        authorized: true,
        email: user.email,
        role,
        userId: user.id,
      };
    }
  }

  return { authorized: false, reason: "not_authorized" };
}
