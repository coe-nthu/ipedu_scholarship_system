import type {
  DashboardDepartmentScope,
  DashboardRole,
} from "@/lib/types";

/**
 * Pure, client-safe department / scope helpers.
 *
 * Kept separate from `lib/auth.ts` (which imports `next/headers` and `crypto`)
 * so client components can use these without pulling server-only modules into
 * the browser bundle. `lib/auth.ts` re-exports the server-relevant pieces.
 */

export function normalizeDepartment(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export const DEPARTMENT_ALIAS_GROUPS = {
  "ipedu-phd": [
    "竹師教育學院博士班",
    "竹師教育學院博士生班",
    "竹師教育學院院博班",
  ],
  edtech: ["教育與學習科技學系", "教育與學習科技系", "教科系"],
  psy: ["教育心理與諮商學系", "心諮系", "教育心理與諮商系"],
  taiwanese: [
    "臺灣語言研究與教學研究所",
    "台灣語言研究與教學研究所",
    "臺語所",
    "台語所",
  ],
} as const;

export type DepartmentGroupKey = keyof typeof DEPARTMENT_ALIAS_GROUPS;

/** 系所群組顯示名稱（前端 badge / 編輯選單共用） */
export const DEPARTMENT_GROUP_LABELS: Record<DepartmentGroupKey, string> = {
  "ipedu-phd": "竹師教育學院博士班",
  edtech: "教育與學習科技學系",
  psy: "教育心理與諮商學系",
  taiwanese: "臺灣語言研究與教學研究所",
};

export const DEPARTMENT_GROUP_KEYS = Object.keys(
  DEPARTMENT_ALIAS_GROUPS
) as DepartmentGroupKey[];

export function isDashboardScope(
  value: unknown
): value is DashboardDepartmentScope {
  return (
    value === "all" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

/**
 * 將儲存的 department_scope（"all" 或別名陣列）轉成群組 key 陣列。
 * 任一別名命中即視為該群組被選取。
 */
export function scopeToGroupKeys(
  scope: DashboardDepartmentScope
): DepartmentGroupKey[] {
  if (scope === "all") return [...DEPARTMENT_GROUP_KEYS];
  const normalized = new Set(scope.map((s) => normalizeDepartment(s)));
  return DEPARTMENT_GROUP_KEYS.filter((key) =>
    DEPARTMENT_ALIAS_GROUPS[key].some((alias) =>
      normalized.has(normalizeDepartment(alias))
    )
  );
}

/**
 * 將群組 key 陣列展開為別名聯集（存 DB 用）。
 * 選滿所有群組 → "all"；未選 → []。
 */
export function groupKeysToScope(
  keys: DepartmentGroupKey[]
): DashboardDepartmentScope {
  const unique = [...new Set(keys)].filter((key) =>
    DEPARTMENT_GROUP_KEYS.includes(key)
  );
  if (unique.length === 0) return [];
  if (unique.length === DEPARTMENT_GROUP_KEYS.length) return "all";
  return unique.flatMap((key) => [...DEPARTMENT_ALIAS_GROUPS[key]]);
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

export function getDefaultScopeForUsername(
  username: string,
  role: DashboardRole
): DashboardDepartmentScope {
  if (role === "admin") return "all";

  const aliases =
    DEPARTMENT_ALIAS_GROUPS[username as DepartmentGroupKey];

  return aliases ? [...aliases] : [];
}

export function resolveDashboardScope(
  value: unknown,
  username: string,
  role: DashboardRole
): DashboardDepartmentScope {
  return isDashboardScope(value)
    ? value
    : getDefaultScopeForUsername(username, role);
}
