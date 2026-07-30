import type { DashboardRole } from "@/lib/types";

export type DashboardActionKey =
  | "exportPdf"
  | "sendCorrection"
  | "editApplication"
  | "deleteApplication"
  | "changeReviewStatus";

export type DashboardActionPermissions = Record<DashboardActionKey, boolean>;

export type DashboardPermissionSettings = Record<
  DashboardRole,
  DashboardActionPermissions
>;

export const DASHBOARD_ACTION_LABELS: Record<DashboardActionKey, string> = {
  changeReviewStatus: "文獻真實性審核",
  deleteApplication: "刪除",
  editApplication: "編輯",
  exportPdf: "匯出 PDF",
  sendCorrection: "通知補正",
};

export const DASHBOARD_ROLE_LABELS: Record<DashboardRole, string> = {
  admin: "管理員",
  teacher: "系所",
};

export const DASHBOARD_ACTION_KEYS: DashboardActionKey[] = [
  "changeReviewStatus",
  "exportPdf",
  "sendCorrection",
  "editApplication",
  "deleteApplication",
];

export const DEFAULT_DASHBOARD_PERMISSION_SETTINGS: DashboardPermissionSettings =
  {
    admin: {
      changeReviewStatus: true,
      deleteApplication: true,
      editApplication: true,
      exportPdf: true,
      sendCorrection: true,
    },
    teacher: {
      changeReviewStatus: true,
      deleteApplication: false,
      editApplication: true,
      exportPdf: false,
      sendCorrection: true,
    },
  };

function getSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;
  return { serviceRoleKey, url };
}

function normalizePermissions(
  role: DashboardRole,
  value: unknown
): DashboardActionPermissions {
  const defaults = DEFAULT_DASHBOARD_PERMISSION_SETTINGS[role];
  if (!value || typeof value !== "object") return defaults;
  const source = value as Partial<Record<DashboardActionKey, unknown>>;
  return {
    changeReviewStatus:
      typeof source.changeReviewStatus === "boolean"
        ? source.changeReviewStatus
        : defaults.changeReviewStatus,
    deleteApplication:
      typeof source.deleteApplication === "boolean"
        ? source.deleteApplication
        : defaults.deleteApplication,
    editApplication:
      typeof source.editApplication === "boolean"
        ? source.editApplication
        : defaults.editApplication,
    exportPdf:
      typeof source.exportPdf === "boolean"
        ? source.exportPdf
        : defaults.exportPdf,
    sendCorrection:
      typeof source.sendCorrection === "boolean"
        ? source.sendCorrection
        : defaults.sendCorrection,
  };
}

export function normalizeDashboardPermissionSettings(
  rows: { permissions: unknown; role: string }[]
): DashboardPermissionSettings {
  const byRole = new Map(rows.map((row) => [row.role, row.permissions]));
  return {
    admin: normalizePermissions("admin", byRole.get("admin")),
    teacher: normalizePermissions("teacher", byRole.get("teacher")),
  };
}

export function isDashboardActionKey(value: string): value is DashboardActionKey {
  return DASHBOARD_ACTION_KEYS.includes(value as DashboardActionKey);
}

export function isDashboardActionPermissions(
  value: unknown
): value is DashboardActionPermissions {
  if (!value || typeof value !== "object") return false;
  const permissions = value as Partial<Record<DashboardActionKey, unknown>>;
  return DASHBOARD_ACTION_KEYS.every(
    (key) => typeof permissions[key] === "boolean"
  );
}

export async function getDashboardPermissionSettings(): Promise<DashboardPermissionSettings> {
  const config = getSupabaseConfig();
  if (!config) return DEFAULT_DASHBOARD_PERMISSION_SETTINGS;

  try {
    const response = await fetch(
      `${config.url}/rest/v1/dashboard_permission_settings?select=role,permissions`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return DEFAULT_DASHBOARD_PERMISSION_SETTINGS;
    }

    const rows = (await response.json()) as {
      permissions: unknown;
      role: string;
    }[];
    return normalizeDashboardPermissionSettings(rows);
  } catch {
    return DEFAULT_DASHBOARD_PERMISSION_SETTINGS;
  }
}

export async function getDashboardRolePermissions(role: DashboardRole) {
  const settings = await getDashboardPermissionSettings();
  return settings[role];
}
