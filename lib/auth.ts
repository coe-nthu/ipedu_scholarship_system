import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type DashboardRole = "teacher" | "admin";
export type DashboardDepartmentScope = "all" | string[];
export type DashboardAuthProvider = "google" | "password";

export type AuthResult =
  | {
      authorized: true;
      authProvider: DashboardAuthProvider;
      departmentScope: DashboardDepartmentScope;
      displayName: string;
      email: string;
      role: DashboardRole;
      userId: string | null;
    }
  | { authorized: false; reason: "not_authenticated" | "not_authorized" };

type DashboardAccount = {
  departmentAliases?: string[];
  displayName: string;
  passwordHash: string;
  role: DashboardRole;
  scope: DashboardDepartmentScope;
  username: string;
};

type DashboardSessionPayload = {
  displayName: string;
  role: DashboardRole;
  scope: DashboardDepartmentScope;
  username: string;
};

const DASHBOARD_SESSION_COOKIE = "dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export const DEPARTMENT_ALIAS_GROUPS = {
  "ipedu-phd": ["竹師教育學院博士班", "竹師教育學院博士生班"],
  edtech: ["教育與學習科技學系", "教育與學習科技系", "教科系"],
  psy: ["教育心理與諮商學系", "心諮系", "教育心理與諮商系"],
  taiwanese: [
    "臺灣語言研究與教學研究所",
    "台灣語言研究與教學研究所",
    "臺語所",
    "台語所",
  ],
} as const;

function normalizeDepartment(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || "";
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return (
    aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer)
  );
}

function isSha256PasswordHash(hash: string) {
  return /^sha256:[a-f0-9]{64}$/i.test(hash);
}

function hashPassword(password: string) {
  return createHmac("sha256", getSessionSecret())
    .update(password)
    .digest("hex");
}

function createSessionValue(payload: DashboardSessionPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function parseSessionValue(value: string): DashboardSessionPayload | null {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature || !getSessionSecret()) return null;
  if (!safeEqual(signature, signPayload(encodedPayload))) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<DashboardSessionPayload>;
    const validScope =
      payload.scope === "all" ||
      (Array.isArray(payload.scope) &&
        payload.scope.every((item) => typeof item === "string"));

    if (
      typeof payload.username === "string" &&
      typeof payload.displayName === "string" &&
      (payload.role === "teacher" || payload.role === "admin") &&
      validScope
    ) {
      return payload as DashboardSessionPayload;
    }
  } catch {
    return null;
  }

  return null;
}

async function getPasswordSession(): Promise<DashboardSessionPayload | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value;
  return session ? parseSessionValue(session) : null;
}

export function canAccessDepartment(
  scope: DashboardDepartmentScope,
  department: string | null | undefined
) {
  if (scope === "all") return true;
  if (!department) return false;
  const normalizedDepartment = normalizeDepartment(department);
  return scope.some(
    (candidate) => normalizeDepartment(candidate) === normalizedDepartment
  );
}

export function filterApplicationsByScope<
  T extends { department: string | null | undefined },
>(applications: T[], scope: DashboardDepartmentScope) {
  return applications.filter((application) =>
    canAccessDepartment(scope, application.department)
  );
}

function getSupabaseServiceConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { serviceRoleKey, url };
}

function isDashboardScope(value: unknown): value is DashboardDepartmentScope {
  return (
    value === "all" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function getDefaultScopeForUsername(
  username: string,
  role: DashboardRole
): DashboardDepartmentScope {
  if (role === "admin") return "all";

  const aliases =
    DEPARTMENT_ALIAS_GROUPS[
      username as keyof typeof DEPARTMENT_ALIAS_GROUPS
    ];

  return aliases ? [...aliases] : [];
}

function resolveDashboardScope(
  value: unknown,
  username: string,
  role: DashboardRole
) {
  return isDashboardScope(value)
    ? value
    : getDefaultScopeForUsername(username, role);
}

async function getDashboardAccount(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const config = getSupabaseServiceConfig();
  if (!normalizedUsername || !config) return null;

  const query = new URLSearchParams({
    is_active: "eq.true",
    limit: "1",
    select: "username,display_name,password_hash,role,department_scope",
    username: `eq.${normalizedUsername}`,
  });

  const response = await fetch(`${config.url}/rest/v1/dashboard_accounts?${query}`, {
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const [profile] = (await response.json()) as {
    department_scope: unknown;
    display_name: string;
    password_hash: string | null;
    role: string;
    username: string;
  }[];

  if (
    !profile?.username ||
    !profile.password_hash ||
    (profile.role !== "teacher" && profile.role !== "admin")
  ) {
    return null;
  }

  const role = profile.role as DashboardRole;
  return {
    displayName: profile.display_name || profile.username,
    passwordHash: profile.password_hash,
    role,
    scope: resolveDashboardScope(
      profile.department_scope,
      profile.username,
      role
    ),
    username: profile.username,
  } satisfies DashboardAccount;
}

export async function verifyDashboardPassword(
  username: string,
  password: string
) {
  if (!getSessionSecret()) {
    console.warn("Dashboard password login failed: missing session secret.");
    return null;
  }

  const account = await getDashboardAccount(username);
  if (!account) {
    console.warn("Dashboard password login failed: account not found.", {
      username,
    });
    return null;
  }

  if (!isSha256PasswordHash(account.passwordHash)) {
    console.warn("Dashboard password login failed: invalid hash format.", {
      username,
    });
    return null;
  }

  const expectedHash = account.passwordHash.replace(/^sha256:/i, "");
  if (!safeEqual(expectedHash, hashPassword(password))) {
    console.warn("Dashboard password login failed: password mismatch.", {
      username,
    });
    return null;
  }

  return account;
}

export async function setDashboardPasswordSession(account: DashboardAccount) {
  const cookieStore = await cookies();
  const value = createSessionValue({
    displayName: account.displayName,
    role: account.role,
    scope: account.scope,
    username: account.username,
  });

  cookieStore.set(DASHBOARD_SESSION_COOKIE, value, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearDashboardPasswordSession() {
  const cookieStore = await cookies();
  cookieStore.delete(DASHBOARD_SESSION_COOKIE);
}

export function createDashboardPasswordHash(password: string) {
  if (!getSessionSecret()) {
    throw new Error("DASHBOARD_SESSION_SECRET is required.");
  }
  return `sha256:${hashPassword(password)}`;
}

/**
 * Check if the current user has dashboard access.
 * Password sessions are checked first, then the existing Google/Supabase
 * whitelist flow is used as a fallback.
 */
export async function checkDashboardAccess(): Promise<AuthResult> {
  const passwordSession = await getPasswordSession();
  if (passwordSession) {
    return {
      authorized: true,
      authProvider: "password",
      departmentScope: passwordSession.scope,
      displayName: passwordSession.displayName,
      email: `${passwordSession.username}@dashboard.local`,
      role: passwordSession.role,
      userId: null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) {
    return { authorized: false, reason: "not_authenticated" };
  }

  const config = getSupabaseServiceConfig();

  if (!config) {
    return { authorized: false, reason: "not_authorized" };
  }

  const res = await fetch(
    `${config.url}/rest/v1/profiles?id=eq.${user.id}&select=role,full_name`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        authorization: `Bearer ${config.serviceRoleKey}`,
      },
    }
  );

  if (res.ok) {
    const profiles = (await res.json()) as {
      full_name: string | null;
      role: string;
    }[];
    const profile = profiles[0];
    const role = profile?.role;
    if (role === "teacher" || role === "admin") {
      return {
        authorized: true,
        authProvider: "google",
        departmentScope: "all",
        displayName: profile.full_name || user.email,
        email: user.email,
        role: role as DashboardRole,
        userId: user.id,
      };
    }
  }

  return { authorized: false, reason: "not_authorized" };
}
