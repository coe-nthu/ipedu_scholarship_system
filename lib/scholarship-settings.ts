export type ScholarshipProgramKey =
  | "nstc-doctoral"
  | "nstc-research-grant"
  | "presidential-new-student"
  | "moe-doctoral"
  | "full-time-doctoral-grant";

export type ScholarshipProgramSetting = {
  amount: string;
  created_at?: string;
  description: string;
  display_order: number;
  eligibility_reminder: string;
  is_open: boolean;
  is_visible: boolean;
  period: string;
  program_key: ScholarshipProgramKey;
  route_path: string;
  status_label: string;
  title: string;
  updated_at?: string;
  updated_by?: string | null;
};

export const SCHOLARSHIP_PROGRAM_KEYS = [
  "nstc-doctoral",
  "nstc-research-grant",
  "presidential-new-student",
  "moe-doctoral",
  "full-time-doctoral-grant",
] as const satisfies readonly ScholarshipProgramKey[];

export const DEFAULT_SCHOLARSHIP_PROGRAM_KEY: ScholarshipProgramKey =
  "nstc-doctoral";

export const DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS: ScholarshipProgramSetting[] =
  [
    {
      amount: "每月 4 萬元，至多 4 學年",
      description:
        "填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。",
      display_order: 10,
      eligibility_reminder:
        "學士班排名前 20%、碩士班累計 GPA 3.76/4.3 或百分制 85 分以上，或有特殊表現經指導教授及院系所推薦。指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。",
      is_open: true,
      is_visible: true,
      period: "適用 111-112 學年度學生申請",
      program_key: "nstc-doctoral",
      route_path: "/scholarships/nstc-doctoral",
      status_label: "已開放",
      title: "國科會-培育優秀博士生獎學金",
    },
    {
      amount: "每月 4 萬元，至多 3 學年",
      description:
        "填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。",
      display_order: 20,
      eligibility_reminder:
        "本獎學金適用 114 學年度入學新生。請填寫基本資料、學術表現與指定文件；指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。",
      is_open: true,
      is_visible: true,
      period: "適用 114 學年度入學新生",
      program_key: "nstc-research-grant",
      route_path: "/scholarships/nstc-research-grant",
      status_label: "測試中",
      title: "國科會-博士生研究獎助學金(適用114學年度入學新生)",
    },
    {
      amount: "每月 4 萬元，至多 4 學年",
      description:
        "填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。",
      display_order: 30,
      eligibility_reminder:
        "本獎學金為校長獎學金（新生獎學金）。請填寫基本資料、學術表現與指定文件；指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。",
      is_open: true,
      is_visible: true,
      period: "新生獎學金",
      program_key: "presidential-new-student",
      route_path: "/scholarships/presidential-new-student",
      status_label: "測試中",
      title: "校長獎學金 (新生獎學金)",
    },
    {
      amount: "每月 4 萬元，至多 3 學年",
      description:
        "填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。",
      display_order: 40,
      eligibility_reminder:
        "本獎學金適用 114 學年度博士班 1 至 3 年級學生。請填寫基本資料、學術表現與指定文件；指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。",
      is_open: true,
      is_visible: true,
      period: "適用 114 學年度博士班 1 至 3 年級學生",
      program_key: "moe-doctoral",
      route_path: "/scholarships/moe-doctoral",
      status_label: "測試中",
      title: "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)",
    },
    {
      amount: "實際核發金額及核發月數由學院審查委員會核定",
      description:
        "填寫基本資料、申請類型、兼職情形調查與指定文件上傳。",
      display_order: 50,
      eligibility_reminder:
        "限全時無專職就讀本院之博士生申請，以一至四年級為原則。通過申請後如有休學或專職情形，應主動通知院辦公室。",
      is_open: true,
      is_visible: true,
      period: "適用本院全時博士生",
      program_key: "full-time-doctoral-grant",
      route_path: "/scholarships/full-time-doctoral-grant",
      status_label: "測試中",
      title: "全時博士生助學金",
    },
  ];

export function isScholarshipProgramKey(
  value: string | null | undefined
): value is ScholarshipProgramKey {
  return SCHOLARSHIP_PROGRAM_KEYS.includes(value as ScholarshipProgramKey);
}

export function getDefaultScholarshipProgramSetting(
  programKey: ScholarshipProgramKey
) {
  return DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS.find(
    (setting) => setting.program_key === programKey
  )!;
}

export function getProgramKeyByRoutePath(pathname: string) {
  return (
    DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS.find(
      (setting) => setting.route_path === pathname
    )?.program_key ?? DEFAULT_SCHOLARSHIP_PROGRAM_KEY
  );
}

export function getProgramKeyByLegacyTitle(title: string | null | undefined) {
  return (
    DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS.find(
      (setting) => setting.title === title
    )?.program_key ?? DEFAULT_SCHOLARSHIP_PROGRAM_KEY
  );
}

export function mergeScholarshipProgramSettings(
  rows: Partial<ScholarshipProgramSetting>[]
) {
  const rowMap = new Map(rows.map((row) => [row.program_key, row]));

  return DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS.map((fallback) => {
    const row = rowMap.get(fallback.program_key);
    return {
      ...fallback,
      ...row,
      program_key: fallback.program_key,
      route_path: row?.route_path || fallback.route_path,
    };
  }).sort((a, b) => a.display_order - b.display_order);
}
