"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Info,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthButton } from "@/components/auth-button";
import { LanguageToggle } from "@/components/language-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DatabaseMultiSelect } from "@/components/database-multi-select";
import { isValidDoi, normalizeDoi } from "@/lib/doi";
import {
  getInitialScholarshipLanguage,
  SCHOLARSHIP_LANGUAGE_STORAGE_KEY,
  type ScholarshipLanguage,
} from "@/lib/scholarship-language";
import {
  getDefaultScholarshipProgramSetting,
  getProgramKeyByRoutePath,
  type ScholarshipProgramKey,
  type ScholarshipProgramSetting,
} from "@/lib/scholarship-settings";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  SubmissionStatus,
  ApplicantInfo,
  Eligibility,
  AcademicPerformance,
  Journal,
  Conference,
  ResearchExperience,
  ResearchAward,
  PlannedResearch,
  OtherReviewDocument,
  ScholarshipPayload,
  SupabaseFileRecord,
} from "@/lib/types";
import {
  DATABASE_OPTIONS as databaseOptions,
  DEPARTMENT_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_STATUS_PART_TIME,
  EMPLOYMENT_STATUS_TA,
  STUDY_STATUS_NEW,
  STUDY_STATUS_RENEWAL,
} from "@/lib/scholarship-form-options";

type ScholarshipFormConfig = {
  academicForm: "standard" | "doctoralResearchGrant" | "presidentialScholarship";
  amount: string;
  applicationType: string;
  applicationTypeOptions?: readonly string[];
  description: string;
  documentFields?: readonly DocumentField[];
  eligibilityReminder: string;
  period: string;
  programKey: ScholarshipProgramKey;
  program: string;
  studyStatusOptions: string[];
  title: string;
};

type DocumentField = {
  key: string;
  label: string;
  required: boolean;
};

type DoctoralSemesterRecord = {
  semester: string;
  credits: string;
  gpa: string;
};

type MasterDirectSemesterRecord = {
  semester: string;
  credits: string;
  gpa: string;
};

type PreviousApp = {
  id: string;
  program_key: string;
  scholarship_program: string | null;
  submitted_at: string | null;
  payload: ScholarshipPayload;
};

type RepeatableSection =
  | "journals"
  | "conferences"
  | "researchExperiences"
  | "researchAwards"
  | "plannedResearch";

type RowValidationErrors = Partial<
  Record<RepeatableSection, Record<number, Record<string, string>>>
>;

type TopLevelErrors = Record<string, string>;

const ROW_FIELD_LABELS: Record<RepeatableSection, Record<string, string>> = {
  conferences: {
    author: "作者",
    authorOrder: "順位",
    conference: "研討會名稱",
    database: "資料庫",
    date: "發表日期",
    organizer: "主辦單位",
    title: "論文名稱",
    type: "發表類別",
  },
  journals: {
    applicantAuthorName: "申請人作者姓名",
    author: "DOI 作者清單",
    authorOrder: "作者順位",
    database: "Edition / 資料庫別",
    date: "發表日期",
    doi: "DOI",
    journal: "期刊名稱",
    journalLevel: "期刊等級",
    title: "論文名稱",
  },
  plannedResearch: {
    advisor: "指導教授",
    database: "資料庫名稱",
    expectedDate: "預計發表時間",
    targetVenue: "預計投稿期刊/研討會",
    title: "論文名稱",
  },
  researchAwards: {
    amountOrItem: "獎助金額/項目",
    contribution: "主要參與部分",
    name: "名稱",
    projectNumber: "計畫/成果編號",
  },
  researchExperiences: {
    duration: "起訖日期",
    institution: "機構/主持人",
    nature: "研究案性質",
    role: "職稱",
  },
};

const INVALID_FIELD_CLASS =
  "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30";

const PENDING_ADVISOR_NAME = "找尋中，待定";
const FULL_TIME_DOCTORAL_GRANT_KEY = "full-time-doctoral-grant";
const FULL_TIME_APPLICATION_TYPES = ["指導教授配合款", "競爭型"] as const;
const BILINGUAL_PROGRAM_KEYS = new Set<ScholarshipProgramKey>([
  "nstc-doctoral",
  "nstc-research-grant",
  "full-time-doctoral-grant",
]);

const FORM_ENGLISH_COPY = {
  academic: "Eligibility and Academic Records",
  amount: {
    "full-time-doctoral-grant":
      "Grant amount and award period are determined by the college review committee.",
    "nstc-doctoral": "NT$40,000 per month, up to 4 academic years.",
    "nstc-research-grant": "NT$40,000 per month, up to 3 academic years.",
  },
  applicationType: "Application Type",
  basic: "Personal Information",
  declarations: "Declarations Before Submission",
  department: "Department / Institute",
  description: {
    "full-time-doctoral-grant":
      "Full-Time Doctoral Student Grant application form",
    "nstc-doctoral":
      "Application form for 111-112 academic year students",
    "nstc-research-grant":
      "Application form for incoming 114 academic year doctoral students",
  },
  documents: "Other Achievements and Required PDF Uploads",
  email: "Email",
  employment: "Employment Status Survey",
  employmentDescription: "Part-time Work Description",
  employmentMonthlyIncome: "Average Monthly Part-time Income",
  employmentStatus: "Employment Status",
  fullName: "Applicant Name",
  gpaScale: "GPA Scale",
  journal: "Journal Publications",
  moe: "",
  nstc: "National Science and Technology Council (NSTC)",
  phone: "Mobile Phone",
  program: {
    "full-time-doctoral-grant": "Full-Time Doctoral Student Grant",
    "nstc-doctoral": "NSTC Scholarship for Outstanding Doctoral Students",
    "nstc-research-grant": "NSTC Doctoral Research Grant",
  },
  eligibilityReminder:
    "Please review the eligibility requirements and required documents before submitting.",
  researchExperience: "Research Experience",
  submit: "Submit Application",
  studyStatus: "Application Category",
  taIncome: "Average Monthly Teaching Assistant Income",
  uploadsNoteFullTime:
    "Recommended filename format: year_grant_application/transcript/research statement_department_name. Filename format is recommended, not enforced.",
  uploadsNoteScholarship:
    "Recommended filename format: year_scholarship_transcript/recommendation/no full-time job declaration_department_name. Filename format is recommended, not enforced.",
} as const;

const OPTION_ENGLISH_COPY: Record<string, string> = {
  "WOS conference proceedings citation index":
    "WOS conference proceedings citation index",
  "SCOPUS conference proceedings citation index":
    "SCOPUS conference proceedings citation index",
  I級期刊: "Level I Journal",
  非I級期刊: "Non-Level I Journal",
  其他: "Other",
  否: "No",
  口頭發表: "Oral Presentation",
  壁報發表: "Poster Presentation",
  新領: "New Application",
  續領: "Renewal",
  指導教授配合款: "Advisor Matching Fund",
  競爭型: "Competitive Track",
  無兼職: "No Part-time Work",
  擔任校內外教學助理: "Teaching Assistant",
  有校內外兼職: "Part-time Work",
  研究者本人: "Principal Researcher",
  研究助理: "Research Assistant",
  工讀生: "Student Worker",
  教師研究案: "Faculty Research Project",
  畢業專題: "Graduation Project",
  國際合作: "International Collaboration",
  逕博: "Direct Doctoral Program",
  甄試: "Recommendation Admission",
  考試: "Entrance Exam",
  僅申請續領校長獎學金: "Renew Presidential Scholarship Only",
  同意達標準時更換申請教育部博士生獎學金:
    "Switch to MOE Doctoral Scholarship if eligible",
};

const DOCUMENT_ENGLISH_COPY: Record<string, string> = {
  applicationForm: "Application Form",
  advisorRecommendation: "Advisor Recommendation",
  noFullTimeJobDeclaration: "No Full-time Job Declaration",
  researchDirectionStatement: "Personal Research Statement",
  transcript: "Official Transcript",
};

function isBilingualProgram(programKey: ScholarshipProgramKey) {
  return BILINGUAL_PROGRAM_KEYS.has(programKey);
}

function getBilingualAmount(programKey: ScholarshipProgramKey) {
  return isBilingualProgram(programKey)
    ? FORM_ENGLISH_COPY.amount[
        programKey as keyof typeof FORM_ENGLISH_COPY.amount
      ]
    : undefined;
}

function getBilingualProgramTitle(programKey: ScholarshipProgramKey) {
  return isBilingualProgram(programKey)
    ? FORM_ENGLISH_COPY.program[
        programKey as keyof typeof FORM_ENGLISH_COPY.program
      ]
    : undefined;
}

function getBilingualDescription(programKey: ScholarshipProgramKey) {
  return isBilingualProgram(programKey)
    ? FORM_ENGLISH_COPY.description[
        programKey as keyof typeof FORM_ENGLISH_COPY.description
      ]
    : undefined;
}

function optionText(option: string, englishMode: boolean) {
  return englishMode ? OPTION_ENGLISH_COPY[option] ?? option : option;
}

function documentText(document: DocumentField, englishMode: boolean) {
  return englishMode
    ? DOCUMENT_ENGLISH_COPY[document.key] ?? document.label
    : document.label;
}

function BiText({
  children,
  className,
  enabled,
  english,
}: {
  children: React.ReactNode;
  className?: string;
  enabled: boolean;
  english?: string;
}) {
  return (
    <span className={className}>
      {enabled && english ? english : children}
    </span>
  );
}

function bi(enabled: boolean, zh: string, en: string) {
  return enabled ? en : zh;
}

const DEFAULT_SCHOLARSHIP_CONFIG: ScholarshipFormConfig = {
  academicForm: "standard",
  amount: "每月 4 萬元，至多 4 學年",
  applicationType: "培育優秀博士生獎學金",
  description: "適用 111-112 學年度學生申請表單",
  eligibilityReminder:
    "學士班排名前 20%、碩士班累計 GPA 3.76/4.3 或百分制 85 分以上，或有特殊表現經指導教授及院系所推薦。指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。",
  period: "每學年下學期依公告辦理",
  programKey: "nstc-doctoral",
  program: "國科會-培育優秀博士生獎學金",
  studyStatusOptions: [STUDY_STATUS_RENEWAL],
  title: "國科會-培育優秀博士生獎學金",
};

const scholarshipConfigs: Record<string, ScholarshipFormConfig> = {
  "/scholarships/moe-doctoral": {
    academicForm: "doctoralResearchGrant",
    amount: "每月 4 萬元，至多 3 學年",
    applicationType: "博士生獎學金",
    description: "適用 114 學年度博士班 1 至 3 年級學生申請表單",
    eligibilityReminder:
      "本項目適用 114 學年度博士班 1 至 3 年級學生。頁面樣式先沿用既有獎學金申請表，欄位與指定文件後續可依正式公告再調整。",
    period: "114 學年度博士班 1 至 3 年級學生",
    programKey: "moe-doctoral",
    program: "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)",
    studyStatusOptions: [STUDY_STATUS_NEW, STUDY_STATUS_RENEWAL],
    title: "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)",
  },
  "/scholarships/full-time-doctoral-grant": {
    academicForm: "doctoralResearchGrant",
    amount: "實際核發金額及核發月數由學院審查委員會核定",
    applicationType: FULL_TIME_APPLICATION_TYPES[0],
    applicationTypeOptions: FULL_TIME_APPLICATION_TYPES,
    description: "全時博士生助學金申請表單",
    documentFields: [
      { key: "applicationForm", label: "申請單", required: true },
      { key: "transcript", label: "歷年成績單", required: true },
      {
        key: "researchDirectionStatement",
        label: "個人研究方向說明",
        required: true,
      },
    ],
    eligibilityReminder:
      "限全時無專職就讀本院之博士生提出申請，以一至四年級為原則。請填寫申請類型、兼職情形調查並上傳指定文件。",
    period: "本院全時博士生",
    programKey: FULL_TIME_DOCTORAL_GRANT_KEY,
    program: "全時博士生助學金",
    studyStatusOptions: [STUDY_STATUS_NEW, STUDY_STATUS_RENEWAL],
    title: "全時博士生助學金",
  },
  "/scholarships/nstc-doctoral": DEFAULT_SCHOLARSHIP_CONFIG,
  "/scholarships/nstc-research-grant": {
    academicForm: "doctoralResearchGrant",
    amount: "每月 4 萬元，至多 3 學年",
    applicationType: "博士生研究獎助學金",
    description: "適用 114 學年度入學新生申請表單",
    eligibilityReminder:
      "本項目適用 114 學年度入學新生。頁面樣式先沿用既有獎學金申請表，欄位與指定文件後續可依正式公告再調整。",
    period: "114 學年度入學新生",
    programKey: "nstc-research-grant",
    program: "國科會-博士生研究獎助學金(適用114學年度入學新生)",
    studyStatusOptions: [STUDY_STATUS_NEW, STUDY_STATUS_RENEWAL],
    title: "國科會-博士生研究獎助學金(適用114學年度入學新生)",
  },
  "/scholarships/presidential-new-student": {
    academicForm: "presidentialScholarship",
    amount: "每月 4 萬元，至多 4 學年",
    applicationType: "校長獎學金 (新生獎學金)",
    description: "新生獎學金申請表單",
    eligibilityReminder:
      "本項目為校長獎學金新生獎學金。頁面樣式先沿用既有獎學金申請表，欄位與指定文件後續可依正式公告再調整。",
    period: "新生獎學金",
    programKey: "presidential-new-student",
    program: "校長獎學金 (新生獎學金)",
    studyStatusOptions: [STUDY_STATUS_NEW, STUDY_STATUS_RENEWAL],
    title: "校長獎學金 (新生獎學金)",
  },
};

function applyProgramSetting(
  config: ScholarshipFormConfig,
  setting: ScholarshipProgramSetting
): ScholarshipFormConfig {
  return {
    ...config,
    amount: setting.amount,
    description: setting.description,
    eligibilityReminder: setting.eligibility_reminder,
    period: setting.period,
    program: setting.title,
    title: setting.title,
  };
}

const DOCUMENT_PREFIX = "document_";
const STORAGE_BUCKET = "scholarship-documents";
const PDF_MIME_TYPE = "application/pdf";

const standardDocumentFields = [
  { key: "transcript", label: "歷年成績單", required: true },
  { key: "advisorRecommendation", label: "指導教授推薦函", required: true },
  { key: "learningPlan", label: "個人學習計畫書（最多 3 頁）", required: true },
  { key: "noFullTimeDeclaration", label: "無專職切結書", required: true },
] as const;

function isPdfFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".pdf") &&
    (!file.type || file.type === PDF_MIME_TYPE)
  );
}

function createStoragePath(applicationId: string, field: string) {
  return `${applicationId}/${field}/${crypto.randomUUID()}.pdf`;
}

const createEmptyEligibility = (): Eligibility => ({
  bachelorRankPercent: "",
  masterGpa: "",
  gpaScale: "4.3",
  masterPercentScore: "",
  hasSpecialRecommendation: false,
  noFullTimeJob: false,
  notReceivingOtherScholarship: false,
  employmentStatus: "",
  employmentDescription: "",
  employmentMonthlyIncome: "",
  taMonthlyIncome: "",
  eligibilityNotes: "",
});

const otherScholarshipRuleUrl =
  "https://ec.site.nthu.edu.tw/p/406-1584-160474,r255.php?Lang=zh-tw";

const emptyJournal = (): Journal => ({
  doi: "",
  date: "",
  author: "",
  applicantAuthorName: "",
  doiAuthorNames: [],
  issns: [],
  title: "",
  journal: "",
  reviewUnit: "",
  journalLevel: "",
  indexSource: "",
  isCorrespondingAuthor: false,
  hasTrustedDatabase: "是",
  database: "",
  authorOrder: "",
  authorOrderOriginal: "",
  authorOrderModified: false,
  authorOrderChangeNote: "",
  attachmentNote: "",
});

const emptyConference = (): Conference => ({
  date: "",
  author: "",
  title: "",
  conference: "",
  organizer: "",
  type: "口頭發表",
  database: "",
  authorOrder: "",
});

const emptyResearchExperience = (): ResearchExperience => ({
  institution: "",
  role: "",
  nature: "",
  duration: "",
});

const emptyResearchAward = (): ResearchAward => ({
  name: "",
  projectNumber: "",
  amountOrItem: "",
  contribution: "",
});

const emptyPlannedResearch = (): PlannedResearch => ({
  title: "",
  expectedDate: "",
  targetVenue: "",
  hasTrustedDatabase: "是",
  database: "",
  advisor: "",
});

const emptyAcademicPerformance = (): AcademicPerformance => ({
  cumulativeGpa: "",
  cumulativeGpaScale: "4.3",
  classRankPercent: "",
  completedCredits: "",
  conductScore: "",
  transcriptNotes: "",
  bachelorDepartment: "",
  bachelorGpa: "",
  bachelorRankPercent: "",
  bachelorSchool: "",
  bachelorTotalCredits: "",
  masterDepartment: "",
  masterDirectSemesterCredits: "",
  masterDirectSemesterGpas: "",
  masterGraduateGpa: "",
  masterGraduateRankPercent: "",
  masterGraduateTotalCredits: "",
  masterSchool: "",
  doctoralSemesterCredits: "",
  doctoralSemesterGpas: "",
  previousAcademicAwards: "",
  academicAchievementSummary: "",
  publicationList: "",
  specialPerformance: "",
  admissionChannel: "",
  masterThesisTitle: "",
  doctoralResearchTopic: "",
  professionalPerformanceStatement: "",
  presidentialApplicationPreference: "",
});

const emptyOtherReviewDocument = (): OtherReviewDocument => ({
  name: "",
});

function isFilled(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function compactRows<T extends Record<string, unknown>>(rows: T[]) {
  return rows.filter((row) => Object.values(row).some(isFilled));
}

function normalizeAuthorName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[,\s.，。・·\-_]/g, "");
}

function formatAuthorOrder(index: number) {
  if (index === 0) {
    return "第一作者";
  }

  if (index === 1) {
    return "第二作者";
  }

  return `第${index + 1}作者`;
}

function inferAuthorOrder(
  applicantAuthorName: string,
  doiAuthorNames: string[],
  isCorrespondingAuthor: boolean
) {
  if (isCorrespondingAuthor) {
    return "通訊作者";
  }

  const normalizedApplicantName = normalizeAuthorName(applicantAuthorName);
  if (!normalizedApplicantName || doiAuthorNames.length === 0) {
    return "";
  }

  const authorIndex = doiAuthorNames.findIndex((authorName) => {
    const normalizedAuthorName = normalizeAuthorName(authorName);
    return (
      normalizedAuthorName === normalizedApplicantName ||
      normalizedAuthorName.includes(normalizedApplicantName) ||
      normalizedApplicantName.includes(normalizedAuthorName)
    );
  });

  return authorIndex >= 0 ? formatAuthorOrder(authorIndex) : "未比對到作者姓名";
}

function getAuthorOrderBucket(authorOrder: string) {
  if (authorOrder.includes("通訊")) {
    return "corresponding";
  }

  if (authorOrder.includes("第一")) {
    return "first";
  }

  return "other";
}

function createJournalLevelStats() {
  return {
    first: 0,
    corresponding: 0,
    other: 0,
  };
}

const emptyDoctoralSemesterRecord = (): DoctoralSemesterRecord => ({
  semester: "",
  credits: "",
  gpa: "",
});

const emptyMasterDirectSemesterRecord = (): MasterDirectSemesterRecord => ({
  semester: "",
  credits: "",
  gpa: "",
});

function parseDoctoralSemesterRecords(
  creditsText: string,
  gpasText: string
) {
  const creditParts = creditsText
    .split(/[;\n；]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const gpaParts = gpasText
    .split(/[;\n；]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const maxLength = Math.max(creditParts.length, gpaParts.length, 1);

  return Array.from({ length: maxLength }, (_, index) => ({
    semester: creditParts[index]?.match(/第\s*(.+?)\s*學期/)?.[1]
      ? `第${creditParts[index].match(/第\s*(.+?)\s*學期/)?.[1]}學期`
      : gpaParts[index]?.match(/第\s*(.+?)\s*學期/)?.[1]
        ? `第${gpaParts[index].match(/第\s*(.+?)\s*學期/)?.[1]}學期`
        : "",
    credits:
      creditParts[index]?.match(/([\d.]+)\s*學分/)?.[1] ||
      creditParts[index] ||
      "",
    gpa:
      gpaParts[index]?.match(/GPA\s*([\d.]+)/i)?.[1] ||
      gpaParts[index] ||
      "",
  }));
}

function parseMasterDirectSemesterRecords(
  creditsText: string,
  gpasText: string
) {
  return parseDoctoralSemesterRecords(creditsText, gpasText);
}

export default function ScholarshipForm() {
  const pathname = usePathname();
  const routeProgramKey = getProgramKeyByRoutePath(pathname);
  const baseConfig =
    scholarshipConfigs[pathname] ?? DEFAULT_SCHOLARSHIP_CONFIG;
  const [programSetting, setProgramSetting] =
    useState<ScholarshipProgramSetting>(() =>
      getDefaultScholarshipProgramSetting(routeProgramKey)
    );
  const config = applyProgramSetting(baseConfig, programSetting);
  const defaultStudyStatus = config.studyStatusOptions[0] ?? STUDY_STATUS_RENEWAL;
  const applicationTypeOptions = useMemo(
    () => config.applicationTypeOptions ?? [config.applicationType],
    [config.applicationType, config.applicationTypeOptions]
  );
  const configuredDocumentFields = useMemo(
    () => config.documentFields ?? standardDocumentFields,
    [config.documentFields]
  );
  const isFullTimeDoctoralGrant =
    config.programKey === FULL_TIME_DOCTORAL_GRANT_KEY;
  const supportsLanguageSwitch = isBilingualProgram(config.programKey);
  const [language, setLanguage] = useState<ScholarshipLanguage>(
    getInitialScholarshipLanguage
  );
  const bilingual = supportsLanguageSwitch && language === "en";
  const [applicantInfo, setApplicantInfo] = useState<ApplicantInfo>({
    applicantName: "",
    studentId: "",
    department: "",
    email: "",
    phone: "",
    advisorName:
      defaultStudyStatus === STUDY_STATUS_NEW ? PENDING_ADVISOR_NAME : "",
    admissionAcademicYear: "112",
    studyStatus: defaultStudyStatus,
    applicationType: config.applicationType,
  });
  const [eligibility, setEligibility] =
    useState<Eligibility>(createEmptyEligibility);
  const [academicPerformance, setAcademicPerformance] =
    useState<AcademicPerformance>(emptyAcademicPerformance);
  const [doctoralSemesterRecords, setDoctoralSemesterRecords] = useState<
    DoctoralSemesterRecord[]
  >([emptyDoctoralSemesterRecord()]);
  const [masterDirectSemesterRecords, setMasterDirectSemesterRecords] = useState<
    MasterDirectSemesterRecord[]
  >([emptyMasterDirectSemesterRecord()]);
  const [journals, setJournals] = useState<Journal[]>([emptyJournal()]);
  const [conferences, setConferences] = useState<Conference[]>([
    emptyConference(),
  ]);
  const [researchExperiences, setResearchExperiences] = useState<
    ResearchExperience[]
  >([emptyResearchExperience()]);
  const [researchAwards, setResearchAwards] = useState<ResearchAward[]>([
    emptyResearchAward(),
  ]);
  const [plannedResearch, setPlannedResearch] = useState<PlannedResearch[]>([
    emptyPlannedResearch(),
  ]);
  const [otherAchievements, setOtherAchievements] = useState("");
  const [otherReviewDocuments, setOtherReviewDocuments] = useState<
    OtherReviewDocument[]
  >([emptyOtherReviewDocument()]);
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [rowValidationErrors, setRowValidationErrors] =
    useState<RowValidationErrors>({});
  const [topLevelErrors, setTopLevelErrors] = useState<TopLevelErrors>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Existing application state
  const [existingAppId, setExistingAppId] = useState<string | null>(null);
  const [existingFiles, setExistingFiles] = useState<SupabaseFileRecord[]>([]);
  const [existingUpdatedAt, setExistingUpdatedAt] = useState<string | null>(
    null
  );
  const [existingSubmissionStatus, setExistingSubmissionStatus] = useState<
    string | null
  >(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const hasLoadedExisting = useRef(false);
  const formInitialized = useRef(false); // true after initial server/localStorage load completes

  // Auto-fill prompt: offer to import data from a previously submitted application
  const [importCandidates, setImportCandidates] = useState<PreviousApp[]>([]);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const importPromptChecked = useRef(false);

  const updateLanguage = (nextLanguage: ScholarshipLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(
      SCHOLARSHIP_LANGUAGE_STORAGE_KEY,
      nextLanguage
    );
  };

  const setSectionRef = (key: string) => (node: HTMLDivElement | null) => {
    sectionRefs.current[key] = node;
  };

  const scrollToSection = (key: string) => {
    window.setTimeout(() => {
      sectionRefs.current[key]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const sectionErrorClass = (key: string) =>
    topLevelErrors[key] ? "ring-red-300 bg-red-50/20" : "";

  const failValidation = (
    sectionKey: string,
    errors: TopLevelErrors,
    message: string
  ) => {
    setTopLevelErrors(errors);
    setSubmitMessage(message);
    scrollToSection(sectionKey);
  };

  useEffect(() => {
    hasLoadedExisting.current = false;
    formInitialized.current = false;
    importPromptChecked.current = false;
    setImportCandidates([]);
    setShowImportPrompt(false);
    setExistingAppId(null);
    setExistingFiles([]);
    setExistingUpdatedAt(null);
    setExistingSubmissionStatus(null);
  }, [routeProgramKey]);

  useEffect(() => {
    setProgramSetting(getDefaultScholarshipProgramSetting(routeProgramKey));

    let isMounted = true;
    fetch("/api/scholarship-programs")
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted || !data.success || !Array.isArray(data.programs)) {
          return;
        }

        const setting = (data.programs as ScholarshipProgramSetting[]).find(
          (program) => program.program_key === routeProgramKey
        );
        if (setting) {
          setProgramSetting(setting);
        }
      })
      .catch(() => {
        if (isMounted) {
          setProgramSetting(getDefaultScholarshipProgramSetting(routeProgramKey));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [routeProgramKey]);

  useEffect(() => {
    setApplicantInfo((current) => ({
      ...current,
      applicationType: applicationTypeOptions.includes(current.applicationType)
        ? current.applicationType
        : applicationTypeOptions[0] ?? config.applicationType,
      studyStatus: config.studyStatusOptions.includes(current.studyStatus)
        ? current.studyStatus
        : defaultStudyStatus,
      advisorName:
        (config.studyStatusOptions.includes(current.studyStatus)
          ? current.studyStatus
          : defaultStudyStatus) === STUDY_STATUS_NEW && !current.advisorName
          ? PENDING_ADVISOR_NAME
          : current.advisorName,
    }));
  }, [
    applicationTypeOptions,
    config.applicationType,
    config.studyStatusOptions,
    defaultStudyStatus,
  ]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setCurrentUser(data.user);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Restore form fields from a draft object (server payload or localStorage)
  const applyFormDraft = useCallback(
    (p: ScholarshipPayload & {
      doctoralSemesterRecords?: DoctoralSemesterRecord[];
      masterDirectSemesterRecords?: MasterDirectSemesterRecord[];
    }) => {
      if (p.applicantInfo) {
        const savedStudyStatus = p.applicantInfo.studyStatus;
        const normalizedStudyStatus = config.studyStatusOptions.includes(
          savedStudyStatus
        )
          ? savedStudyStatus
          : defaultStudyStatus;
        setApplicantInfo({
          ...p.applicantInfo,
          applicationType: applicationTypeOptions.includes(
            p.applicantInfo.applicationType
          )
            ? p.applicantInfo.applicationType
            : applicationTypeOptions[0] ?? config.applicationType,
          studyStatus: normalizedStudyStatus,
          advisorName:
            normalizedStudyStatus === STUDY_STATUS_NEW &&
            !p.applicantInfo.advisorName
              ? PENDING_ADVISOR_NAME
              : p.applicantInfo.advisorName,
        });
      }
      if (p.eligibility) {
        setEligibility({
          ...createEmptyEligibility(),
          ...p.eligibility,
        });
      }
      if (p.academicPerformance) {
        const savedAcademicPerformance = {
          ...emptyAcademicPerformance(),
          ...p.academicPerformance,
        };
        setAcademicPerformance((current) => ({
          ...current,
          ...p.academicPerformance,
        }));
        if (p.doctoralSemesterRecords) {
          setDoctoralSemesterRecords(p.doctoralSemesterRecords);
        } else {
          setDoctoralSemesterRecords(
            parseDoctoralSemesterRecords(
              savedAcademicPerformance.doctoralSemesterCredits,
              savedAcademicPerformance.doctoralSemesterGpas
            )
          );
        }
        if (p.masterDirectSemesterRecords) {
          setMasterDirectSemesterRecords(p.masterDirectSemesterRecords);
        } else {
          setMasterDirectSemesterRecords(
            parseMasterDirectSemesterRecords(
              savedAcademicPerformance.masterDirectSemesterCredits,
              savedAcademicPerformance.masterDirectSemesterGpas
            )
          );
        }
      }
      if (p.journals && p.journals.length > 0) setJournals(p.journals);
      if (p.conferences && p.conferences.length > 0)
        setConferences(p.conferences);
      if (p.researchExperiences && p.researchExperiences.length > 0)
        setResearchExperiences(p.researchExperiences);
      if (p.researchAwards && p.researchAwards.length > 0)
        setResearchAwards(p.researchAwards);
      if (p.plannedResearch && p.plannedResearch.length > 0)
        setPlannedResearch(p.plannedResearch);
      if (p.otherAchievements) setOtherAchievements(p.otherAchievements);
      if (p.otherReviewDocuments && p.otherReviewDocuments.length > 0)
        setOtherReviewDocuments(p.otherReviewDocuments);
    },
    [
      applicationTypeOptions,
      config.applicationType,
      config.studyStatusOptions,
      defaultStudyStatus,
    ]
  );

  // Load existing application data when user is authenticated
  const loadExistingApplication = useCallback(async () => {
    const draftKey = `scholarship-draft-${config.programKey}`;
    const legacyDraftKey = `scholarship-draft-${baseConfig.program}`;
    setIsLoadingExisting(true);
    try {
      const response = await fetch(
        `/api/scholarships?programKey=${encodeURIComponent(config.programKey)}`
      );
      const result = await response.json();

      // Try reading localStorage draft
      let localDraft: (ScholarshipPayload & { savedAt?: number; doctoralSemesterRecords?: DoctoralSemesterRecord[]; masterDirectSemesterRecords?: MasterDirectSemesterRecord[] }) | null = null;
      try {
        const raw =
          localStorage.getItem(draftKey) ?? localStorage.getItem(legacyDraftKey);
        if (raw) localDraft = JSON.parse(raw);
      } catch {
        // ignore parse errors
      }

      if (!response.ok || !result.success || !result.application) {
        // No server data — restore from localStorage if available
        if (localDraft) {
          applyFormDraft(localDraft);
        }
        return;
      }

      const app = result.application as {
        id: string;
        payload: ScholarshipPayload;
        files: SupabaseFileRecord[];
        submission_status: string;
        updated_at: string;
      };

      setExistingAppId(app.id);
      setExistingFiles(app.files || []);
      setExistingUpdatedAt(app.updated_at);
      setExistingSubmissionStatus(app.submission_status);

      // Compare: prefer localStorage only if it has real content AND is newer
      const serverTime = new Date(app.updated_at).getTime();
      const localDraftHasContent =
        !!localDraft?.applicantInfo?.applicantName?.trim();
      const useLocalDraft =
        localDraftHasContent &&
        !!localDraft?.savedAt &&
        localDraft.savedAt > serverTime;

      applyFormDraft(useLocalDraft ? localDraft! : app.payload);
    } catch {
      // Silently fail — user can still fill a new form
    } finally {
      setIsLoadingExisting(false);
      formInitialized.current = true;
    }
  }, [applyFormDraft, baseConfig.program, config.programKey]);

  useEffect(() => {
    if (currentUser && !hasLoadedExisting.current) {
      hasLoadedExisting.current = true;
      loadExistingApplication();
    }
  }, [currentUser, loadExistingApplication]);

  // Fill empty form fields from a previously submitted application's payload.
  // Never overwrites values the student has already entered.
  const importFromPayload = useCallback((source: ScholarshipPayload) => {
    // Deep clone + strip server-computed verification fields (recomputed on submit)
    const p = JSON.parse(JSON.stringify(source)) as ScholarshipPayload;
    delete (p as Record<string, unknown>).verificationSummary;

    // Scalar fields: fill only when the current value is an empty string.
    const fillScalar =
      <T extends Record<string, unknown>>(incoming?: Partial<T>) =>
      (current: T): T => {
        if (!incoming) return current;
        const next = { ...current };
        for (const key of Object.keys(incoming) as (keyof T)[]) {
          const incomingValue = incoming[key];
          if (
            current[key] === "" &&
            typeof incomingValue === "string" &&
            incomingValue !== ""
          ) {
            next[key] = incomingValue as T[keyof T];
          }
        }
        return next;
      };

    setApplicantInfo(fillScalar<ApplicantInfo>(p.applicantInfo));
    setEligibility(fillScalar<Eligibility>(p.eligibility));
    setAcademicPerformance(fillScalar<AcademicPerformance>(p.academicPerformance));

    if (p.otherAchievements) {
      setOtherAchievements((current) =>
        current.trim() === "" ? p.otherAchievements ?? current : current
      );
    }

    // Repeatable sections: only import when the student hasn't entered anything.
    // NOTE: the empty templates carry non-empty defaults (e.g. journal
    // hasTrustedDatabase "是", conference type "口頭發表"), so `compactRows`
    // would treat a fresh row as "filled". Instead we compare against a blank
    // template row to decide whether the section is still pristine.
    const fillRows =
      <T extends Record<string, unknown>>(
        incoming: T[] | undefined,
        makeEmpty: () => T
      ) =>
      (current: T[]): T[] => {
        const blank = JSON.stringify(makeEmpty());
        const isPristine = current.every(
          (row) => JSON.stringify(row) === blank
        );
        if (!isPristine) return current;
        const cleaned = compactRows(incoming ?? []);
        return cleaned.length > 0 ? cleaned : current;
      };

    // Strip per-journal verification before import.
    const incomingJournals = (p.journals ?? []).map((journal) => {
      const next = { ...journal } as Record<string, unknown>;
      delete next.verification;
      return next as Journal;
    });

    setJournals(fillRows<Journal>(incomingJournals, emptyJournal));
    setConferences(fillRows<Conference>(p.conferences, emptyConference));
    setResearchExperiences(
      fillRows<ResearchExperience>(p.researchExperiences, emptyResearchExperience)
    );
    setResearchAwards(
      fillRows<ResearchAward>(p.researchAwards, emptyResearchAward)
    );
    setPlannedResearch(
      fillRows<PlannedResearch>(p.plannedResearch, emptyPlannedResearch)
    );
    setOtherReviewDocuments(
      fillRows<OtherReviewDocument>(
        p.otherReviewDocuments,
        emptyOtherReviewDocument
      )
    );

    setShowImportPrompt(false);
    toast.success("已帶入先前申請的資料，請確認並補上需重新上傳的附件。");
  }, []);

  // Student-initiated import: open the chooser if there are several previous
  // applications, otherwise import the single candidate directly.
  const handleImportClick = useCallback(() => {
    if (importCandidates.length === 0) return;
    if (importCandidates.length === 1) {
      importFromPayload(importCandidates[0].payload);
      return;
    }
    setShowImportPrompt(true);
  }, [importCandidates, importFromPayload]);

  // Fetch this user's previously submitted applications so we can offer a
  // manual "帶入" button — only when starting a brand-new application for this
  // program (no existing record). Does NOT auto-open any dialog; the student
  // actively triggers the import via the button.
  useEffect(() => {
    if (
      !currentUser ||
      !formInitialized.current ||
      isLoadingExisting ||
      existingAppId !== null ||
      importPromptChecked.current
    ) {
      return;
    }

    importPromptChecked.current = true;
    let isMounted = true;

    fetch("/api/scholarships?previousSubmitted=1")
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted || !data?.success || !Array.isArray(data.applications)) {
          return;
        }
        const candidates = (data.applications as PreviousApp[]).filter(
          (app) => app.program_key !== config.programKey && app.payload
        );
        if (candidates.length > 0) {
          setImportCandidates(candidates);
        }
      })
      .catch(() => {
        // Non-blocking — student can still fill the form manually.
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser, isLoadingExisting, existingAppId, config.programKey]);

  // ── Auto-save form state to localStorage ──
  const DRAFT_KEY = `scholarship-draft-${config.programKey}`;

  useEffect(() => {
    // Don't save until initial data has been loaded from server/localStorage
    if (!formInitialized.current) return;
    const timer = setTimeout(() => {
      try {
        const draft = {
          applicantInfo,
          eligibility,
          academicPerformance,
          journals,
          conferences,
          researchExperiences,
          researchAwards,
          plannedResearch,
          otherAchievements,
          otherReviewDocuments,
          doctoralSemesterRecords,
          masterDirectSemesterRecords,
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // localStorage full or unavailable — ignore
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    DRAFT_KEY,
    applicantInfo,
    eligibility,
    academicPerformance,
    journals,
    conferences,
    researchExperiences,
    researchAwards,
    plannedResearch,
    otherAchievements,
    otherReviewDocuments,
    doctoralSemesterRecords,
    masterDirectSemesterRecords,
  ]);

  const eligibilitySummary = useMemo(() => {
    const masterGpa = Number(eligibility.masterGpa);
    const masterScore = Number(eligibility.masterPercentScore);
    const bachelorRank = Number(eligibility.bachelorRankPercent);

    if (
      (eligibility.bachelorRankPercent && bachelorRank <= 20) ||
      (eligibility.masterGpa && masterGpa >= 3.76) ||
      (eligibility.masterPercentScore && masterScore >= 85)
    ) {
      return "已符合至少一項請領資格條件";
    }

    return "請填寫學士排名、碩士 GPA 或百分制成績";
  }, [eligibility]);

  const journalSummary = useMemo(() => {
    const levelStats = {
      "I級期刊": createJournalLevelStats(),
      "非I級期刊": createJournalLevelStats(),
    };
    const databaseStats: Record<string, number> = {};

    compactRows(journals).forEach((journal) => {
      const level =
        journal.journalLevel === "I級期刊" ? "I級期刊" : "非I級期刊";
      const authorOrderBucket = getAuthorOrderBucket(journal.authorOrder);

      levelStats[level][authorOrderBucket] += 1;

      if (journal.database && journal.database !== "否") {
        databaseStats[journal.database] =
          (databaseStats[journal.database] || 0) + 1;
      }
    });

    return { levelStats, databaseStats };
  }, [journals]);

  const isAdvisorPending =
    applicantInfo.advisorName.trim() === PENDING_ADVISOR_NAME;
  const effectiveDocumentFields = useMemo(
    () =>
      configuredDocumentFields.map((document) =>
        document.key === "advisorRecommendation" && isAdvisorPending
          ? { ...document, required: false }
          : document
      ),
    [configuredDocumentFields, isAdvisorPending]
  );

  const updateApplicant = (field: keyof ApplicantInfo, value: string) => {
    setTopLevelErrors((current) => {
      const next = { ...current };
      delete next.basic;
      if (field === "applicationType") delete next.applicationType;
      return next;
    });
    setApplicantInfo((current) => {
      if (
        field === "studyStatus" &&
        value === STUDY_STATUS_NEW &&
        !current.advisorName
      ) {
        return {
          ...current,
          [field]: value,
          advisorName: PENDING_ADVISOR_NAME,
        };
      }

      return { ...current, [field]: value };
    });
  };

  const updateEligibility = (
    field: keyof Eligibility,
    value: string | boolean
  ) => {
    setTopLevelErrors((current) => {
      const next = { ...current };
      if (
        field === "employmentStatus" ||
        field === "taMonthlyIncome" ||
        field === "employmentDescription" ||
        field === "employmentMonthlyIncome"
      ) {
        delete next.employment;
        delete next[field];
      }
      if (
        field === "hasSpecialRecommendation" ||
        field === "noFullTimeJob" ||
        field === "notReceivingOtherScholarship"
      ) {
        delete next.declarations;
      }
      return next;
    });
    setEligibility((current) => ({ ...current, [field]: value }));
  };

  const updateAcademicPerformance = (
    field: keyof AcademicPerformance,
    value: string
  ) => {
    setTopLevelErrors((current) => {
      const next = { ...current };
      delete next.academic;
      return next;
    });
    setAcademicPerformance((current) => ({ ...current, [field]: value }));
  };

  const syncDoctoralSemesterRecords = (records: DoctoralSemesterRecord[]) => {
    const normalizedRecords =
      records.length > 0 ? records : [emptyDoctoralSemesterRecord()];
    setDoctoralSemesterRecords(normalizedRecords);
    setAcademicPerformance((current) => ({
      ...current,
      doctoralSemesterCredits: normalizedRecords
        .filter((record) => record.semester || record.credits)
        .map((record) =>
          [record.semester, record.credits ? `${record.credits} 學分` : ""]
            .filter(Boolean)
            .join(" ")
        )
        .join("；"),
      doctoralSemesterGpas: normalizedRecords
        .filter((record) => record.semester || record.gpa)
        .map((record) =>
          [record.semester, record.gpa ? `GPA ${record.gpa}` : ""]
            .filter(Boolean)
            .join(" ")
        )
        .join("；"),
    }));
  };

  const updateDoctoralSemesterRecord = (
    index: number,
    field: keyof DoctoralSemesterRecord,
    value: string
  ) => {
    syncDoctoralSemesterRecords(
      doctoralSemesterRecords.map((record, currentIndex) =>
        currentIndex === index ? { ...record, [field]: value } : record
      )
    );
  };

  const syncMasterDirectSemesterRecords = (
    records: MasterDirectSemesterRecord[]
  ) => {
    const normalizedRecords =
      records.length > 0 ? records : [emptyMasterDirectSemesterRecord()];
    setMasterDirectSemesterRecords(normalizedRecords);
    setAcademicPerformance((current) => ({
      ...current,
      masterDirectSemesterCredits: normalizedRecords
        .filter((record) => record.semester || record.credits)
        .map((record) =>
          [record.semester, record.credits ? `${record.credits} 學分` : ""]
            .filter(Boolean)
            .join(" ")
        )
        .join("；"),
      masterDirectSemesterGpas: normalizedRecords
        .filter((record) => record.semester || record.gpa)
        .map((record) =>
          [record.semester, record.gpa ? `GPA ${record.gpa}` : ""]
            .filter(Boolean)
            .join(" ")
        )
        .join("；"),
    }));
  };

  const updateMasterDirectSemesterRecord = (
    index: number,
    field: keyof MasterDirectSemesterRecord,
    value: string
  ) => {
    syncMasterDirectSemesterRecords(
      masterDirectSemesterRecords.map((record, currentIndex) =>
        currentIndex === index ? { ...record, [field]: value } : record
      )
    );
  };

  const getMissingFields = <T extends Record<string, unknown>>(
    row: T,
    requiredFields: (keyof T)[]
  ) => requiredFields.filter((field) => !isFilled(row[field]));

  const setRowValidationErrorFields = <T extends Record<string, unknown>>(
    section: RepeatableSection,
    rowIndex: number,
    fields: (keyof T)[]
  ) => {
    const fieldErrors = Object.fromEntries(
      fields.map((field) => {
        const fieldName = String(field);
        const label = ROW_FIELD_LABELS[section][fieldName] ?? fieldName;
        return [fieldName, `請填寫${label}`];
      })
    );

    setRowValidationErrors((current) => ({
      ...current,
      [section]: {
        ...(current[section] ?? {}),
        [rowIndex]: fieldErrors,
      },
    }));
  };

  const clearRowValidationSection = (section: RepeatableSection) => {
    setRowValidationErrors((current) => {
      const next = { ...current };
      delete next[section];
      return next;
    });
  };

  const clearRowFieldError = (
    section: RepeatableSection,
    rowIndex: number,
    field: string
  ) => {
    setRowValidationErrors((current) => {
      const sectionErrors = current[section];
      const rowErrors = sectionErrors?.[rowIndex];
      if (!sectionErrors || !rowErrors?.[field]) {
        return current;
      }

      const nextRowErrors = { ...rowErrors };
      delete nextRowErrors[field];
      const nextSectionErrors = { ...sectionErrors };

      if (Object.keys(nextRowErrors).length > 0) {
        nextSectionErrors[rowIndex] = nextRowErrors;
      } else {
        delete nextSectionErrors[rowIndex];
      }

      const next = { ...current };
      if (Object.keys(nextSectionErrors).length > 0) {
        next[section] = nextSectionErrors;
      } else {
        delete next[section];
      }

      return next;
    });
  };

  const getRowFieldError = (
    section: RepeatableSection,
    rowIndex: number,
    field: string
  ) => rowValidationErrors[section]?.[rowIndex]?.[field] ?? "";

  const getRowFieldClassName = (
    section: RepeatableSection,
    rowIndex: number,
    field: string
  ) => (getRowFieldError(section, rowIndex, field) ? INVALID_FIELD_CLASS : "");

  const updateRow = <T,>(
    rows: T[],
    setRows: (rows: T[]) => void,
    index: number,
    field: keyof T,
    value: T[keyof T],
    validation?: {
      section: RepeatableSection;
    }
  ) => {
    setRows(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );

    if (validation && isFilled(value)) {
      clearRowFieldError(validation.section, index, String(field));
    }
  };

  const removeRow = <T,>(
    rows: T[],
    setRows: (rows: T[]) => void,
    index: number,
    fallback: () => T,
    section?: RepeatableSection
  ) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    setRows(nextRows.length > 0 ? nextRows : [fallback()]);
    if (section) {
      clearRowValidationSection(section);
    }
  };

  const addRowWhenComplete = <T extends Record<string, unknown>>(
    section: RepeatableSection,
    rows: T[],
    setRows: (rows: T[]) => void,
    fallback: () => T,
    requiredFields: (keyof T)[]
  ) => {
    const lastRow = rows[rows.length - 1];
    const missingFields = getMissingFields(lastRow, requiredFields);

    if (missingFields.length > 0) {
      setRowValidationErrorFields(section, rows.length - 1, missingFields);
      return;
    }

    clearRowValidationSection(section);
    setRows([...rows, fallback()]);
  };

  const updateJournalApplicantAuthorName = (index: number, value: string) => {
    if (isFilled(value)) {
      clearRowFieldError("journals", index, "applicantAuthorName");
    }

    setJournals((current) =>
      current.map((journal, rowIndex) => {
        if (rowIndex !== index) {
          return journal;
        }

        const inferredOrder = inferAuthorOrder(
          value,
          journal.doiAuthorNames,
          journal.isCorrespondingAuthor
        );

        return {
          ...journal,
          applicantAuthorName: value,
          authorOrder: journal.authorOrderModified
            ? journal.authorOrder
            : inferredOrder,
          authorOrderOriginal: inferredOrder,
          authorOrderChangeNote: journal.authorOrderModified
            ? `原系統比對為「${inferredOrder}」，申請人改為「${journal.authorOrder}」。`
            : "",
        };
      })
    );
  };

  const updateJournalCorrespondingAuthor = (index: number, checked: boolean) => {
    setJournals((current) =>
      current.map((journal, rowIndex) => {
        if (rowIndex !== index) {
          return journal;
        }

        const inferredOrder = inferAuthorOrder(
          journal.applicantAuthorName,
          journal.doiAuthorNames,
          checked
        );

        return {
          ...journal,
          isCorrespondingAuthor: checked,
          authorOrder: journal.authorOrderModified
            ? journal.authorOrder
            : inferredOrder,
          authorOrderOriginal: inferredOrder,
          authorOrderChangeNote: journal.authorOrderModified
            ? `原系統比對為「${inferredOrder}」，申請人改為「${journal.authorOrder}」。`
            : "",
        };
      })
    );
  };

  const updateJournalAuthorOrder = (index: number, value: string) => {
    if (isFilled(value)) {
      clearRowFieldError("journals", index, "authorOrder");
    }

    setJournals((current) =>
      current.map((journal, rowIndex) => {
        if (rowIndex !== index) {
          return journal;
        }

        const authorOrderModified =
          Boolean(journal.authorOrderOriginal) &&
          value.trim() !== journal.authorOrderOriginal;

        return {
          ...journal,
          authorOrder: value,
          authorOrderModified,
          authorOrderChangeNote: authorOrderModified
            ? `原系統比對為「${journal.authorOrderOriginal}」，申請人改為「${value}」。`
            : "",
        };
      })
    );
  };

  const [fetchingDoiIndex, setFetchingDoiIndex] = useState<number | null>(null);

  const setDoiFieldError = (index: number, message: string) => {
    setRowValidationErrors((current) => ({
      ...current,
      journals: {
        ...(current.journals ?? {}),
        [index]: { ...(current.journals?.[index] ?? {}), doi: message },
      },
    }));
  };

  const fetchPaperData = async (index: number) => {
    const rawDoi = journals[index].doi;
    const doiValue = normalizeDoi(rawDoi);

    if (!doiValue) {
      setDoiFieldError(index, "請先輸入 DOI 碼");
      return;
    }

    // Validate format up-front so a malformed DOI shows a clear "格式錯誤"
    // warning instead of a misleading "查無資料".
    if (!isValidDoi(doiValue)) {
      setDoiFieldError(
        index,
        "DOI 格式不正確，請輸入如 10.xxxx/xxxxx 的格式（可省略 https://doi.org/ 前綴）。"
      );
      return;
    }

    // Write the cleaned DOI back into the field so verification later uses it.
    if (doiValue !== rawDoi) {
      updateRow(journals, setJournals, index, "doi", doiValue, {
        section: "journals",
      });
    } else {
      clearRowFieldError("journals", index, "doi");
    }

    if (fetchingDoiIndex !== null) return; // prevent concurrent fetches

    setFetchingDoiIndex(index);
    try {
      const response = await fetch(
        `/api/publications/fetch?doi=${encodeURIComponent(doiValue)}`
      );
      const result = await response.json();

      if (!result.success) {
        if (result.code === "invalid_format") {
          setDoiFieldError(
            index,
            result.error || "DOI 格式不正確，請確認輸入。"
          );
        } else {
          setDoiFieldError(
            index,
            result.error || "查無此 DOI 資料，請確認是否正確，或於右側欄位自行補登。"
          );
        }
        return;
      }

      clearRowFieldError("journals", index, "doi");

      const doiAuthorNames =
        result.data.authors?.map((author: { given: string; family: string }) =>
          [author.given, author.family].filter(Boolean).join(" ").trim()
        ) ?? [];
      const issns = result.data.issns ?? [];
      const journalIndexMatch = result.data.indexMatch;

      setJournals((current) =>
        current.map((journal, rowIndex) => {
          if (rowIndex !== index) {
            return journal;
          }

          const inferredOrder = inferAuthorOrder(
            journal.applicantAuthorName,
            doiAuthorNames,
            journal.isCorrespondingAuthor
          );

          return {
                ...journal,
                title: result.data.title,
                journal: `${result.data.journalName} (${result.data.volumeIssue})`,
                date: result.data.publishDate,
                author: result.data.authorString,
            doiAuthorNames,
            issns,
            // Auto-fill only the Edition / 資料庫別 — every edition the journal
            // belongs to. 期刊等級（I級/非I級）is always chosen manually, so the
            // student's existing choice is preserved.
            database:
              journalIndexMatch?.editions?.length > 0
                ? journalIndexMatch.editions.join("、")
                : journalIndexMatch?.database || journal.database,
            journalLevel: journal.journalLevel,
            indexSource: journalIndexMatch
              ? journalIndexMatch.indexSource || "依期刊索引對照表自動判別"
              : "未命中索引對照表，請手動選擇 Edition / 資料庫別與期刊等級",
            authorOrder: journal.authorOrderModified
              ? journal.authorOrder
              : inferredOrder,
            authorOrderOriginal: inferredOrder,
            authorOrderChangeNote: journal.authorOrderModified
              ? `原系統比對為「${inferredOrder}」，申請人改為「${journal.authorOrder}」。`
              : "",
          };
        })
      );
    } catch {
      setDoiFieldError(index, "連線發生錯誤，請稍後再試。");
    } finally {
      setFetchingDoiIndex(null);
    }
  };

  const getExistingFileName = useCallback(
    (field: string) => {
      const file = existingFiles.find((f) => f.field === field);
      return file?.name || undefined;
    },
    [existingFiles]
  );

  const buildPayload = (): ScholarshipPayload => ({
    applicantInfo,
    eligibility,
    academicPerformance,
    journals: compactRows(journals),
    conferences: compactRows(conferences),
    researchExperiences: compactRows(researchExperiences),
    researchAwards: compactRows(researchAwards),
    plannedResearch: compactRows(plannedResearch),
    otherAchievements,
    otherReviewDocuments: compactRows(otherReviewDocuments),
  });

  const submitApplication = async (
    form: HTMLFormElement,
    status: SubmissionStatus
  ) => {
    setSubmitMessage("");
    setTopLevelErrors({});

    if (!applicantInfo.applicantName || !applicantInfo.department) {
      failValidation(
        "basic",
        {
          applicantName: !applicantInfo.applicantName
            ? bi(bilingual, "請填寫申請人姓名。", "Please enter your full name.")
            : "",
          basic: bi(
            bilingual,
            "請至少填寫申請人姓名與所屬學系所。",
            "Please complete your full name and department/institute."
          ),
          department: !applicantInfo.department
            ? bi(
                bilingual,
                "請選擇所屬學系所。",
                "Please select your department/institute."
              )
            : "",
        },
        bi(
          bilingual,
          "請至少填寫申請人姓名與所屬學系所。",
          "Please complete your full name and department/institute."
        )
      );
      return;
    }

    if (
      status === "submitted" &&
      !applicationTypeOptions.includes(applicantInfo.applicationType)
    ) {
      failValidation(
        "basic",
        {
          applicationType: bi(
            bilingual,
            "送出前請選擇申請類型。",
            "Please select an application type before submitting."
          ),
          basic: bi(
            bilingual,
            "送出前請選擇申請類型。",
            "Please select an application type before submitting."
          ),
        },
        bi(
          bilingual,
          "送出前請選擇申請類型。",
          "Please select an application type before submitting."
        )
      );
      return;
    }

    if (status === "submitted" && isFullTimeDoctoralGrant) {
      if (!eligibility.employmentStatus) {
        failValidation(
          "employment",
          {
            employment: bi(
              bilingual,
              "送出前請完成兼職情形調查。",
              "Please complete the employment status survey before submitting."
            ),
            employmentStatus: bi(
              bilingual,
              "請選擇兼職情形。",
              "Please select your employment status."
            ),
          },
          bi(
            bilingual,
            "送出前請完成兼職情形調查。",
            "Please complete the employment status survey before submitting."
          )
        );
        return;
      }

      if (
        eligibility.employmentStatus === EMPLOYMENT_STATUS_TA &&
        !eligibility.taMonthlyIncome.trim()
      ) {
        failValidation(
          "employment",
          {
            employment: bi(
              bilingual,
              "請填寫校內外教學助理平均月薪。",
              "Please enter your average monthly teaching assistant income."
            ),
            taMonthlyIncome: bi(
              bilingual,
              "請填寫校內外教學助理平均月薪。",
              "Please enter your average monthly teaching assistant income."
            ),
          },
          bi(
            bilingual,
            "請填寫校內外教學助理平均月薪。",
            "Please enter your average monthly teaching assistant income."
          )
        );
        return;
      }

      if (
        eligibility.employmentStatus === EMPLOYMENT_STATUS_PART_TIME &&
        (!eligibility.employmentDescription.trim() ||
          !eligibility.employmentMonthlyIncome.trim())
      ) {
        failValidation(
          "employment",
          {
            employment: bi(
              bilingual,
              "請填寫兼職工作簡述與兼職平均月薪。",
              "Please describe your part-time work and enter the average monthly income."
            ),
            employmentDescription: !eligibility.employmentDescription.trim()
              ? bi(
                  bilingual,
                  "請填寫兼職工作簡述。",
                  "Please describe your part-time work."
                )
              : "",
            employmentMonthlyIncome:
              !eligibility.employmentMonthlyIncome.trim()
                ? bi(
                    bilingual,
                    "請填寫兼職平均月薪。",
                    "Please enter your average monthly part-time income."
                  )
                : "",
          },
          bi(
            bilingual,
            "請填寫兼職工作簡述與兼職平均月薪。",
            "Please describe your part-time work and enter the average monthly income."
          )
        );
        return;
      }
    }

    const hasRequiredAcademicPerformance =
      config.academicForm === "presidentialScholarship"
        ? applicantInfo.studyStatus === STUDY_STATUS_NEW
          ? Boolean(
              academicPerformance.bachelorGpa ||
                academicPerformance.masterGraduateGpa ||
                academicPerformance.masterThesisTitle.trim() ||
                academicPerformance.doctoralResearchTopic.trim()
            )
          : Boolean(academicPerformance.doctoralSemesterGpas.trim())
        : config.academicForm === "doctoralResearchGrant"
        ? applicantInfo.studyStatus === STUDY_STATUS_NEW
          ? Boolean(
              academicPerformance.bachelorGpa ||
                academicPerformance.masterGraduateGpa ||
                academicPerformance.masterDirectSemesterGpas.trim()
            )
          : Boolean(academicPerformance.doctoralSemesterGpas.trim())
        : Boolean(academicPerformance.cumulativeGpa);

    if (status === "submitted" && !hasRequiredAcademicPerformance) {
      const message =
        config.academicForm === "doctoralResearchGrant"
          ? bi(
              bilingual,
              "送出前請填寫學業成績資料。",
              "Please complete academic record information before submitting."
            )
          : bi(
              bilingual,
              "送出前請填寫學業表現 GPA。",
              "Please enter the required GPA before submitting."
            );
      failValidation(
        "academic",
        {
          academic: message,
        },
        message
      );
      return;
    }

    if (
      status === "submitted" &&
      (!eligibility.hasSpecialRecommendation ||
        !eligibility.noFullTimeJob ||
        !eligibility.notReceivingOtherScholarship)
    ) {
      failValidation(
        "declarations",
        {
          declarations: bi(
            bilingual,
            "送出前請勾選表單底部三項聲明。",
            "Please check all three declarations before submitting."
          ),
        },
        bi(
          bilingual,
          "送出前請勾選表單底部三項聲明。",
          "Please check all three declarations before submitting."
        )
      );
      return;
    }

    const formData = new FormData(form);
    const missingRequiredDocuments = effectiveDocumentFields
      .filter((document) => document.required)
      .filter((document) => {
        const file = formData.get(`${DOCUMENT_PREFIX}${document.key}`);
        const hasNewFile = file instanceof File && file.size > 0;
        const hasExistingFile = existingFiles.some(
          (f) => f.field === document.key
        );
        return !hasNewFile && !hasExistingFile;
      });

    if (status === "submitted" && missingRequiredDocuments.length > 0) {
      const message = `送出前請上傳：${missingRequiredDocuments
        .map((document) => document.label)
        .join("、")}。${
        bilingual
          ? `\nPlease upload the required PDF file(s): ${missingRequiredDocuments
              .map((document) => document.label)
              .join(", ")}.`
          : ""
      }`;
      failValidation(
        "documents",
        {
          documents: message,
          ...Object.fromEntries(
            missingRequiredDocuments.map((document) => [
              `document.${document.key}`,
              bi(
                bilingual,
                `請上傳${document.label}。`,
                `Please upload ${document.label}.`
              ),
            ])
          ),
        },
        message
      );
      return;
    }

    // Check otherReviewDocuments limit
    const otherReviewDocumentFields = Array.from(formData.keys()).filter(
      (field) => field.match(/^document_otherReviewDocuments_\d+$/)
    );
    if (
      !isFullTimeDoctoralGrant &&
      (otherReviewDocumentFields.length > 1 ||
        (otherReviewDocuments.filter((d) => d.name.trim()).length || 0) > 1)
    ) {
      failValidation(
        "documents",
        {
          documents: bi(
            bilingual,
            "其他有利審查文件限上傳一件。",
            "Only one optional supporting document may be uploaded."
          ),
          otherReviewDocuments: bi(
            bilingual,
            "其他有利審查文件限上傳一件。",
            "Only one optional supporting document may be uploaded."
          ),
        },
        bi(
          bilingual,
          "其他有利審查文件限上傳一件。",
          "Only one optional supporting document may be uploaded."
        )
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = buildPayload();
      // Use existing application ID if updating, otherwise generate new
      const applicationId = existingAppId || crypto.randomUUID();
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("登入資訊已失效，請重新登入後再試。");
      }

      // Step 1: Create DB record (JSON only, no files)
      setSubmitMessage("正在建立申請資料...");
      const createResponse = await fetch("/api/scholarships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationId,
          payload,
          programKey: config.programKey,
          scholarshipProgram: config.program,
          status,
        }),
      });
      const createResult = await createResponse.json();

      if (!createResponse.ok || !createResult.success) {
        throw new Error(createResult.error || "建立申請資料失敗。");
      }

      // Step 2: Upload files to Supabase Storage with signed upload URLs
      const newlyUploadedFiles: SupabaseFileRecord[] = [];
      const fileEntries: { field: string; file: File; label: string | null }[] =
        [];

      for (const [key, value] of formData.entries()) {
        if (
          key.startsWith(DOCUMENT_PREFIX) &&
          value instanceof File &&
          value.size > 0
        ) {
          const documentField = key.replace(DOCUMENT_PREFIX, "");
          const otherDocMatch = documentField.match(
            /^otherReviewDocuments_(\d+)$/
          );
          const label = otherDocMatch
            ? payload.otherReviewDocuments?.[Number(otherDocMatch[1])]?.name ||
              null
            : null;
          if (!isPdfFile(value)) {
            throw new Error(`檔案「${value.name}」不是 PDF，請改上傳 .pdf 檔。`);
          }

          fileEntries.push({ field: documentField, file: value, label });
        }
      }

      if (fileEntries.length > 0) {
        setSubmitMessage(
          `正在上傳檔案（0/${fileEntries.length}）...`
        );

        for (let i = 0; i < fileEntries.length; i++) {
          const { field, file, label } = fileEntries[i];
          const path = createStoragePath(applicationId, field);

          setSubmitMessage(
            `正在上傳檔案（${i + 1}/${fileEntries.length}）...`
          );

          const uploadUrlResponse = await fetch("/api/scholarships/upload-url", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              applicationId,
              contentType: file.type || PDF_MIME_TYPE,
              fileName: file.name,
              path,
              size: file.size,
            }),
          });
          const uploadUrlResult = (await uploadUrlResponse.json()) as {
            error?: string;
            success?: boolean;
            token?: string;
          };

          if (
            !uploadUrlResponse.ok ||
            !uploadUrlResult.success ||
            !uploadUrlResult.token
          ) {
            throw new Error(uploadUrlResult.error || "建立檔案上傳授權失敗。");
          }

          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .uploadToSignedUrl(path, uploadUrlResult.token, file, {
              contentType: file.type || PDF_MIME_TYPE,
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`檔案「${file.name}」上傳失敗：${uploadError.message}`);
          }

          setSubmitMessage(
            `正在上傳檔案（${i + 1}/${fileEntries.length}，完成）...`
          );

          newlyUploadedFiles.push({
            field,
            label,
            name: file.name,
            path,
            type: file.type || PDF_MIME_TYPE,
            size: file.size,
          });
        }
      }

      // Merge: keep existing files for fields not re-uploaded, replace those that are
      const uploadedFieldSet = new Set(
        newlyUploadedFiles.map((f) => f.field)
      );
      const retainedFiles = existingFiles.filter(
        (f) => !uploadedFieldSet.has(f.field)
      );
      const mergedFiles = [...retainedFiles, ...newlyUploadedFiles];

      // Step 3: Update DB record with merged file metadata
      if (mergedFiles.length > 0) {
        setSubmitMessage("正在更新檔案資料...");
        const patchResponse = await fetch("/api/scholarships", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ applicationId, files: mergedFiles }),
        });
        const patchResult = await patchResponse.json();

        if (!patchResponse.ok || !patchResult.success) {
          throw new Error(patchResult.error || "檔案資料更新失敗。");
        }
      }

      // Update local state to reflect saved data
      setExistingAppId(applicationId);
      setExistingFiles(mergedFiles);
      setExistingUpdatedAt(new Date().toISOString());
      setExistingSubmissionStatus(status);

      // Clear localStorage draft — data is now safely on the server
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }

      if (status === "submitted") {
        setSubmitMessage("申請已送出，正在寄送確認信...");
        const emailResponse = await fetch(
          "/api/scholarships/confirmation-email",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ applicationId }),
          }
        );
        const emailResult = (await emailResponse.json()) as {
          error?: string;
          success?: boolean;
        };

        setSubmitMessage(
          emailResponse.ok && emailResult.success
            ? `申請已送出，確認信已寄出。申請編號：${applicationId}`
            : `申請已送出，申請編號：${applicationId}。但確認信寄送失敗：${
                emailResult.error || "請聯絡承辦人確認。"
              }`
        );
      } else {
        setSubmitMessage(`草稿已儲存，申請編號：${applicationId}`);
      }
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : "儲存失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {currentUser ? (
          <>
            <header className="border-b border-slate-300 pb-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <Link
                    href="/"
                    className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 transition hover:text-slate-950"
                  >
                    <ArrowLeft className="size-4" />
                    {bilingual
                      ? "Back to scholarship selection"
                      : "返回獎學金選擇"}
                  </Link>
                  <p className="text-sm font-medium text-emerald-700">
                    <BiText
                      enabled={bilingual}
                      english={getBilingualProgramTitle(config.programKey)}
                    >
                      {config.title}
                    </BiText>
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-950">
                    <BiText
                      enabled={bilingual}
                      english={getBilingualDescription(config.programKey)}
                    >
                      {config.description}
                    </BiText>
                  </h1>
                </div>
                <div className="flex flex-col items-start gap-3 md:items-end">
                  <div className="flex flex-wrap items-center gap-3">
                    {supportsLanguageSwitch ? (
                      <LanguageToggle
                        language={language}
                        onChange={updateLanguage}
                      />
                    ) : null}
                    <AuthButton />
                  </div>
                  <div className="max-w-sm rounded-lg bg-[#1f6f78] px-3 py-2 text-sm leading-6 text-white shadow-sm">
                    <BiText
                      enabled={bilingual}
                      english={getBilingualAmount(config.programKey)}
                    >
                      {config.amount}
                    </BiText>
                  </div>
                </div>
              </div>
            </header>

            {importCandidates.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-xl border border-[#1f6f78]/30 bg-[#1f6f78]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-5 shrink-0 text-[#1f6f78]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      帶入先前申請的資料
                    </p>
                    <p className="text-xs text-slate-600">
                      偵測到你曾提交過其他獎學金申請，可一鍵帶入基本資料、科系、文獻與研討會等相同欄位。僅會填入目前空白的欄位，附件需重新上傳。
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleImportClick}
                  className="w-full shrink-0 gap-1.5 bg-[#1f6f78] font-semibold text-white shadow-sm transition hover:bg-[#185860] sm:w-auto"
                >
                  <Sparkles className="size-4" />
                  一鍵帶入
                </Button>
              </div>
            ) : null}

            <Dialog open={showImportPrompt} onOpenChange={setShowImportPrompt}>
              <DialogContent className="bg-white text-slate-900 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>選擇要帶入的申請</DialogTitle>
                  <DialogDescription>
                    你有多筆已提交的申請，請選擇要帶入哪一筆。僅會填入目前空白的欄位，不會覆蓋你已填的內容，附件需重新上傳。
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                  {importCandidates.map((candidate) => {
                    const title =
                      candidate.scholarship_program ||
                      getDefaultScholarshipProgramSetting(
                        candidate.program_key as ScholarshipProgramKey
                      ).title;
                    const submittedAt = candidate.submitted_at
                      ? new Date(candidate.submitted_at).toLocaleDateString(
                          "zh-TW"
                        )
                      : null;
                    return (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {title}
                          </p>
                          {submittedAt ? (
                            <p className="text-xs text-slate-500">
                              提交於 {submittedAt}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="shrink-0 bg-[#1f6f78] text-white hover:bg-[#185860]"
                          onClick={() => importFromPayload(candidate.payload)}
                        >
                          帶入
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowImportPrompt(false)}
                  >
                    不需要，自行填寫
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <FileText className="size-4" />
              <AlertTitle>
                <BiText enabled={bilingual} english="Eligibility Reminder">
                  請領資格提醒
                </BiText>
              </AlertTitle>
              <AlertDescription>
                {bilingual
                  ? FORM_ENGLISH_COPY.eligibilityReminder
                  : config.eligibilityReminder}
              </AlertDescription>
            </Alert>

            {isLoadingExisting ? (
              <Alert className="border-slate-200 bg-white">
                <Info className="size-4" />
                <AlertTitle>正在載入</AlertTitle>
                <AlertDescription>
                  正在查詢是否有先前填寫的資料...
                </AlertDescription>
              </Alert>
            ) : existingAppId ? (
              <Alert
                className={
                  existingSubmissionStatus === "submitted"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                }
              >
                {existingSubmissionStatus === "submitted" ? (
                  <CheckCircle2 className="size-4 text-emerald-700" />
                ) : (
                  <Info className="size-4 text-amber-700" />
                )}
                <AlertTitle>
                  {existingSubmissionStatus === "submitted"
                    ? "已送出的申請"
                    : "草稿已載入"}
                </AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>
                    系統偵測到你先前
                    {existingSubmissionStatus === "submitted"
                      ? "已送出"
                      : "儲存的草稿"}
                    的申請資料，已自動載入表單。
                    {existingSubmissionStatus === "submitted"
                      ? "再次送出將覆蓋原有資料。"
                      : "你可以繼續編輯後送出。"}
                  </p>
                  {existingUpdatedAt ? (
                    <p className="text-xs text-slate-500">
                      最後更新時間：
                      {new Date(existingUpdatedAt).toLocaleString("zh-TW", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ) : null}
                  {existingFiles.length > 0 ? (
                    <p className="text-xs text-slate-500">
                      已上傳 {existingFiles.length} 個檔案（重新上傳同欄位檔案將取代舊檔）
                    </p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}

        {isAuthLoading ? (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">正在確認登入狀態</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-600">
                請稍候，系統正在確認你的 Google 登入狀態。
              </p>
            </CardContent>
          </Card>
        ) : !currentUser ? (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">請先登入 Google 帳戶</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                登入後才能填寫與送出獎學金申請表。系統會使用你的 Google
                帳戶建立登入狀態。
              </p>
              <AuthButton />
            </CardContent>
          </Card>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              submitApplication(event.currentTarget, "submitted");
            }}
          >
          <Card
            ref={setSectionRef("basic")}
            className={cn("shadow-sm", sectionErrorClass("basic"))}
          >
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText enabled={bilingual} english={FORM_ENGLISH_COPY.basic}>
                  一、基本資料
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {topLevelErrors.basic ? (
                <div className="md:col-span-3">
                  <ValidationMessage message={topLevelErrors.basic} />
                </div>
              ) : null}
              <Field
                label="申請人姓名"
                english={bilingual ? FORM_ENGLISH_COPY.fullName : undefined}
                htmlFor="applicantName"
                required
                error={topLevelErrors.applicantName}
              >
                <Input
                  id="applicantName"
                  value={applicantInfo.applicantName}
                  onChange={(event) =>
                    updateApplicant("applicantName", event.target.value)
                  }
                  className={cn(
                    topLevelErrors.applicantName && INVALID_FIELD_CLASS
                  )}
                  placeholder={bilingual ? "Full name" : "請輸入姓名"}
                  required
                />
              </Field>
              <Field
                label="學號"
                english={bilingual ? "Student ID" : undefined}
                htmlFor="studentId"
              >
                <Input
                  id="studentId"
                  value={applicantInfo.studentId}
                  onChange={(event) =>
                    updateApplicant("studentId", event.target.value)
                  }
                  placeholder="例：112xxxxxx"
                />
              </Field>
              <Field
                label="所屬學系所"
                english={bilingual ? FORM_ENGLISH_COPY.department : undefined}
                htmlFor="department"
                required
                error={topLevelErrors.department}
              >
                <Select
                  value={applicantInfo.department}
                  onValueChange={(value) =>
                    updateApplicant("department", value ?? "")
                  }
                >
                  <SelectTrigger
                    id="department"
                    className={cn(
                      topLevelErrors.department && INVALID_FIELD_CLASS
                    )}
                  >
                    <SelectValue
                      placeholder={
                        bilingual
                          ? "Select department / institute"
                          : "請選擇所屬學系所"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENT_OPTIONS.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Email"
                english={bilingual ? FORM_ENGLISH_COPY.email : undefined}
                htmlFor="email"
              >
                <Input
                  id="email"
                  type="email"
                  value={applicantInfo.email}
                  onChange={(event) =>
                    updateApplicant("email", event.target.value)
                  }
                  placeholder="name@mx.nthu.edu.tw"
                />
              </Field>
              <Field
                label="手機"
                english={bilingual ? FORM_ENGLISH_COPY.phone : undefined}
                htmlFor="phone"
              >
                <Input
                  id="phone"
                  value={applicantInfo.phone}
                  onChange={(event) =>
                    updateApplicant("phone", event.target.value)
                  }
                  placeholder="09xx-xxx-xxx"
                />
              </Field>
              <Field
                label="指導教授"
                english={bilingual ? "Advisor" : undefined}
                htmlFor="advisorName"
              >
                <Input
                  id="advisorName"
                  value={applicantInfo.advisorName}
                  onChange={(event) =>
                    updateApplicant("advisorName", event.target.value)
                  }
                  placeholder={bilingual ? "Advisor name" : "請輸入指導教授姓名"}
                />
              </Field>
              <Field
                label="入學學年度"
                english={bilingual ? "Admission Academic Year" : undefined}
                htmlFor="admissionAcademicYear"
              >
                <Input
                  id="admissionAcademicYear"
                  value={applicantInfo.admissionAcademicYear}
                  onChange={(event) =>
                    updateApplicant("admissionAcademicYear", event.target.value)
                  }
                  placeholder="111 或 112"
                />
              </Field>
              <Field
                label="請領別"
                english={bilingual ? FORM_ENGLISH_COPY.studyStatus : undefined}
                htmlFor="studyStatus"
              >
                <Select
                  value={applicantInfo.studyStatus}
                  onValueChange={(value) =>
                    updateApplicant("studyStatus", value ?? "")
                  }
                >
                  <SelectTrigger id="studyStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.studyStatusOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {optionText(option, bilingual)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="申請類別"
                english={bilingual ? FORM_ENGLISH_COPY.applicationType : undefined}
                htmlFor="applicationType"
                error={topLevelErrors.applicationType}
              >
                <Select
                  value={applicantInfo.applicationType}
                  onValueChange={(value) =>
                    updateApplicant("applicationType", value ?? "")
                  }
                >
                  <SelectTrigger
                    id="applicationType"
                    className={cn(
                      topLevelErrors.applicationType && INVALID_FIELD_CLASS
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {applicationTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {optionText(option, bilingual)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          {isFullTimeDoctoralGrant ? (
            <Card
              ref={setSectionRef("employment")}
              className={cn("shadow-sm", sectionErrorClass("employment"))}
            >
              <CardHeader>
                <CardTitle className="text-lg">
                  <BiText
                    enabled={bilingual}
                    english={FORM_ENGLISH_COPY.employment}
                  >
                    兼職情形調查
                  </BiText>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-slate-600">
                  {bilingual
                    ? "Please report your current work status. If you take a full-time job after applying, notify the college office."
                    : "請依目前校內外工作情形填寫；若申請後有專職工作，應主動通知院辦公室。"}
                </p>
                <ValidationMessage message={topLevelErrors.employment} />
                <Field
                  label="兼職情形"
                  english={bilingual ? FORM_ENGLISH_COPY.employmentStatus : undefined}
                  htmlFor="employmentStatus"
                  required
                  error={topLevelErrors.employmentStatus}
                >
                  <Select
                    value={eligibility.employmentStatus}
                    onValueChange={(value) =>
                      updateEligibility("employmentStatus", value ?? "")
                    }
                  >
                    <SelectTrigger
                      id="employmentStatus"
                      className={cn(
                        topLevelErrors.employmentStatus && INVALID_FIELD_CLASS
                      )}
                    >
                      <SelectValue
                        placeholder={
                          bilingual
                            ? "Select employment status"
                            : "請選擇兼職情形"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {optionText(option, bilingual)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {eligibility.employmentStatus === EMPLOYMENT_STATUS_TA ? (
                  <Field
                    label="教學助理平均月薪"
                    english={bilingual ? FORM_ENGLISH_COPY.taIncome : undefined}
                    htmlFor="taMonthlyIncome"
                    required
                    error={topLevelErrors.taMonthlyIncome}
                  >
                    <Input
                      id="taMonthlyIncome"
                      value={eligibility.taMonthlyIncome}
                      onChange={(event) =>
                        updateEligibility(
                          "taMonthlyIncome",
                          event.target.value
                        )
                      }
                      className={cn(
                        topLevelErrors.taMonthlyIncome && INVALID_FIELD_CLASS
                      )}
                      placeholder="例：8000"
                    />
                  </Field>
                ) : null}
                {eligibility.employmentStatus === EMPLOYMENT_STATUS_PART_TIME ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                      label="兼職工作簡述"
                      english={
                        bilingual
                          ? FORM_ENGLISH_COPY.employmentDescription
                          : undefined
                      }
                      htmlFor="employmentDescription"
                      required
                      error={topLevelErrors.employmentDescription}
                    >
                      <Input
                        id="employmentDescription"
                        value={eligibility.employmentDescription}
                        onChange={(event) =>
                          updateEligibility(
                            "employmentDescription",
                            event.target.value
                          )
                        }
                        className={cn(
                          topLevelErrors.employmentDescription &&
                            INVALID_FIELD_CLASS
                        )}
                        placeholder="例：研究助理、課輔教師"
                      />
                    </Field>
                    <Field
                      label="兼職平均月薪"
                      english={
                        bilingual
                          ? FORM_ENGLISH_COPY.employmentMonthlyIncome
                          : undefined
                      }
                      htmlFor="employmentMonthlyIncome"
                      required
                      error={topLevelErrors.employmentMonthlyIncome}
                    >
                      <Input
                        id="employmentMonthlyIncome"
                        value={eligibility.employmentMonthlyIncome}
                        onChange={(event) =>
                          updateEligibility(
                            "employmentMonthlyIncome",
                            event.target.value
                          )
                        }
                        className={cn(
                          topLevelErrors.employmentMonthlyIncome &&
                            INVALID_FIELD_CLASS
                        )}
                        placeholder="例：12000"
                      />
                    </Field>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card
            ref={setSectionRef("academic")}
            className={cn("shadow-sm", sectionErrorClass("academic"))}
          >
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText
                  enabled={bilingual}
                  english={FORM_ENGLISH_COPY.academic}
                >
                  二、請領資格與學業表現
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ValidationMessage message={topLevelErrors.academic} />
              {config.academicForm === "presidentialScholarship" ? (
                applicantInfo.studyStatus === STUDY_STATUS_NEW ? (
                  <>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <Field label="學士學校全稱" htmlFor="presidentialBachelorSchool">
                        <Input
                          id="presidentialBachelorSchool"
                          value={academicPerformance.bachelorSchool}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorSchool",
                              event.target.value
                            )
                          }
                          placeholder="例：國立清華大學"
                        />
                      </Field>
                      <Field label="學士科系全稱" htmlFor="presidentialBachelorDepartment">
                        <Input
                          id="presidentialBachelorDepartment"
                          value={academicPerformance.bachelorDepartment}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorDepartment",
                              event.target.value
                            )
                          }
                          placeholder="例：教育心理與諮商學系"
                        />
                      </Field>
                      <Field label="碩士學校全稱" htmlFor="presidentialMasterSchool">
                        <Input
                          id="presidentialMasterSchool"
                          value={academicPerformance.masterSchool}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterSchool",
                              event.target.value
                            )
                          }
                          placeholder="例：國立清華大學"
                        />
                      </Field>
                      <Field label="碩士科系全稱" htmlFor="presidentialMasterDepartment">
                        <Input
                          id="presidentialMasterDepartment"
                          value={academicPerformance.masterDepartment}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterDepartment",
                              event.target.value
                            )
                          }
                          placeholder="例：教育與學習科技學系"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                      <Field label="學士班總學分數" htmlFor="presidentialBachelorCredits">
                        <Input
                          id="presidentialBachelorCredits"
                          type="number"
                          min="0"
                          value={academicPerformance.bachelorTotalCredits}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorTotalCredits",
                              event.target.value
                            )
                          }
                          placeholder="例：128"
                        />
                      </Field>
                      <Field label="學士班 GPA" htmlFor="presidentialBachelorGpa">
                        <Input
                          id="presidentialBachelorGpa"
                          type="number"
                          min="0"
                          step="0.01"
                          value={academicPerformance.bachelorGpa}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorGpa",
                              event.target.value
                            )
                          }
                          placeholder="例：3.85"
                        />
                      </Field>
                      <Field label="學士班排名百分比" htmlFor="presidentialBachelorRank">
                        <Input
                          id="presidentialBachelorRank"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={academicPerformance.bachelorRankPercent}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorRankPercent",
                              event.target.value
                            )
                          }
                          placeholder="例：15"
                        />
                      </Field>
                      <Field label="碩士班總學分數" htmlFor="presidentialMasterCredits">
                        <Input
                          id="presidentialMasterCredits"
                          type="number"
                          min="0"
                          value={academicPerformance.masterGraduateTotalCredits}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterGraduateTotalCredits",
                              event.target.value
                            )
                          }
                          placeholder="例：32"
                        />
                      </Field>
                      <Field label="碩士班 GPA" htmlFor="presidentialMasterGpa">
                        <Input
                          id="presidentialMasterGpa"
                          type="number"
                          min="0"
                          step="0.01"
                          value={academicPerformance.masterGraduateGpa}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterGraduateGpa",
                              event.target.value
                            )
                          }
                          placeholder="例：3.92"
                        />
                      </Field>
                      <Field label="碩士班排名百分比" htmlFor="presidentialMasterRank">
                        <Input
                          id="presidentialMasterRank"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={academicPerformance.masterGraduateRankPercent}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterGraduateRankPercent",
                              event.target.value
                            )
                          }
                          placeholder="例：10"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                      <Field label="入學管道" htmlFor="admissionChannel">
                        <Select
                          value={academicPerformance.admissionChannel}
                          onValueChange={(value) =>
                            updateAcademicPerformance(
                              "admissionChannel",
                              value ?? ""
                            )
                          }
                        >
                          <SelectTrigger id="admissionChannel">
                            <SelectValue placeholder="請選擇" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="逕博">逕博</SelectItem>
                            <SelectItem value="甄試">甄試</SelectItem>
                            <SelectItem value="考試">考試</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="碩士論文題目" htmlFor="masterThesisTitle">
                        <Input
                          id="masterThesisTitle"
                          value={academicPerformance.masterThesisTitle}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterThesisTitle",
                              event.target.value
                            )
                          }
                          placeholder="請輸入碩士論文題目"
                        />
                      </Field>
                      <Field label="博班研究主題" htmlFor="doctoralResearchTopic">
                        <Input
                          id="doctoralResearchTopic"
                          value={academicPerformance.doctoralResearchTopic}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "doctoralResearchTopic",
                              event.target.value
                            )
                          }
                          placeholder="請輸入博班研究主題"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <Textarea
                        className="min-h-28"
                        value={academicPerformance.academicAchievementSummary}
                        onChange={(event) =>
                          updateAcademicPerformance(
                            "academicAchievementSummary",
                            event.target.value
                          )
                        }
                        placeholder="學術表現"
                      />
                      <Textarea
                        className="min-h-28"
                        value={
                          academicPerformance.professionalPerformanceStatement
                        }
                        onChange={(event) =>
                          updateAcademicPerformance(
                            "professionalPerformanceStatement",
                            event.target.value
                          )
                        }
                        placeholder="其他專業表現說明"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <EditableTable
                      actionLabel="新增學期"
                      minWidth="720px"
                      onAdd={() =>
                        syncDoctoralSemesterRecords([
                          ...doctoralSemesterRecords,
                          emptyDoctoralSemesterRecord(),
                        ])
                      }
                      title="前一學期成績"
                    >
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-48">學期</TableHead>
                          <TableHead className="w-48">修習學分數</TableHead>
                          <TableHead className="w-48">GPA</TableHead>
                          <TableHead className="w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {doctoralSemesterRecords.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Input
                                value={record.semester}
                                onChange={(event) =>
                                  updateDoctoralSemesterRecord(
                                    index,
                                    "semester",
                                    event.target.value
                                  )
                                }
                                placeholder="例：第2學期"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                value={record.credits}
                                onChange={(event) =>
                                  updateDoctoralSemesterRecord(
                                    index,
                                    "credits",
                                    event.target.value
                                  )
                                }
                                placeholder="例：9"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={record.gpa}
                                onChange={(event) =>
                                  updateDoctoralSemesterRecord(
                                    index,
                                    "gpa",
                                    event.target.value
                                  )
                                }
                                placeholder="例：4.1"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  syncDoctoralSemesterRecords(
                                    doctoralSemesterRecords.filter(
                                      (_, currentIndex) => currentIndex !== index
                                    )
                                  )
                                }
                                disabled={doctoralSemesterRecords.length === 1}
                                aria-label="刪除學期"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </EditableTable>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <Textarea
                        className="min-h-28"
                        value={academicPerformance.academicAchievementSummary}
                        onChange={(event) =>
                          updateAcademicPerformance(
                            "academicAchievementSummary",
                            event.target.value
                          )
                        }
                        placeholder="前一學期學術表現"
                      />
                      <Textarea
                        className="min-h-28"
                        value={
                          academicPerformance.professionalPerformanceStatement
                        }
                        onChange={(event) =>
                          updateAcademicPerformance(
                            "professionalPerformanceStatement",
                            event.target.value
                          )
                        }
                        placeholder="其他專業表現說明"
                      />
                    </div>

                    <Field label="項目意願" htmlFor="presidentialPreference">
                      <Select
                        value={
                          academicPerformance.presidentialApplicationPreference
                        }
                        onValueChange={(value) =>
                          updateAcademicPerformance(
                            "presidentialApplicationPreference",
                            value ?? ""
                          )
                        }
                      >
                        <SelectTrigger id="presidentialPreference">
                          <SelectValue placeholder="請選擇" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="僅申請續領校長獎學金">
                            僅申請續領校長獎學金
                          </SelectItem>
                          <SelectItem value="同意達標準時更換申請教育部博士生獎學金">
                            同意達標準時更換申請教育部博士生獎學金
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )
              ) : config.academicForm === "doctoralResearchGrant" ? (
                applicantInfo.studyStatus === STUDY_STATUS_NEW ? (
                  <>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <Field
                        label="學士學校全稱"
                        english={bilingual ? "Bachelor's Institution" : undefined}
                        htmlFor="bachelorSchool"
                      >
                        <Input
                          id="bachelorSchool"
                          value={academicPerformance.bachelorSchool}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorSchool",
                              event.target.value
                            )
                          }
                          placeholder="例：國立清華大學"
                        />
                      </Field>
                      <Field
                        label="學士科系全稱"
                        english={bilingual ? "Bachelor's Department" : undefined}
                        htmlFor="bachelorDepartment"
                      >
                        <Input
                          id="bachelorDepartment"
                          value={academicPerformance.bachelorDepartment}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorDepartment",
                              event.target.value
                            )
                          }
                          placeholder="例：教育心理與諮商學系"
                        />
                      </Field>
                      <Field
                        label="碩士學校全稱"
                        english={bilingual ? "Master's Institution" : undefined}
                        htmlFor="masterSchool"
                      >
                        <Input
                          id="masterSchool"
                          value={academicPerformance.masterSchool}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterSchool",
                              event.target.value
                            )
                          }
                          placeholder="例：國立清華大學"
                        />
                      </Field>
                      <Field
                        label="碩士科系全稱"
                        english={bilingual ? "Master's Department" : undefined}
                        htmlFor="masterDepartment"
                      >
                        <Input
                          id="masterDepartment"
                          value={academicPerformance.masterDepartment}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterDepartment",
                              event.target.value
                            )
                          }
                          placeholder="例：教育與學習科技學系"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                      <Field
                        label="學士班總學分數"
                        english={bilingual ? "Bachelor's Total Credits" : undefined}
                        htmlFor="bachelorTotalCredits"
                      >
                        <Input
                          id="bachelorTotalCredits"
                          type="number"
                          min="0"
                          value={academicPerformance.bachelorTotalCredits}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorTotalCredits",
                              event.target.value
                            )
                          }
                          placeholder="例：128"
                        />
                      </Field>
                      <Field
                        label="學士班 GPA"
                        english={bilingual ? "Bachelor's GPA" : undefined}
                        htmlFor="bachelorGpa"
                      >
                        <Input
                          id="bachelorGpa"
                          type="number"
                          min="0"
                          step="0.01"
                          value={academicPerformance.bachelorGpa}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorGpa",
                              event.target.value
                            )
                          }
                          placeholder="例：3.85"
                        />
                      </Field>
                      <Field
                        label="學士班排名百分比"
                        english={bilingual ? "Bachelor's Class Rank Percentile" : undefined}
                        htmlFor="newBachelorRankPercent"
                      >
                        <Input
                          id="newBachelorRankPercent"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={academicPerformance.bachelorRankPercent}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "bachelorRankPercent",
                              event.target.value
                            )
                          }
                          placeholder="例：15"
                        />
                      </Field>
                      <Field
                        label="碩士班畢業總學分數"
                        english={bilingual ? "Master's Graduation Credits" : undefined}
                        htmlFor="masterGraduateTotalCredits"
                      >
                        <Input
                          id="masterGraduateTotalCredits"
                          type="number"
                          min="0"
                          value={academicPerformance.masterGraduateTotalCredits}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterGraduateTotalCredits",
                              event.target.value
                            )
                          }
                          placeholder="例：32"
                        />
                      </Field>
                      <Field
                        label="碩士班畢業 GPA"
                        english={bilingual ? "Master's Graduation GPA" : undefined}
                        htmlFor="masterGraduateGpa"
                      >
                        <Input
                          id="masterGraduateGpa"
                          type="number"
                          min="0"
                          step="0.01"
                          value={academicPerformance.masterGraduateGpa}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterGraduateGpa",
                              event.target.value
                            )
                          }
                          placeholder="例：3.92"
                        />
                      </Field>
                      <Field
                        label="碩士班畢業排名百分比"
                        english={bilingual ? "Master's Graduation Rank Percentile" : undefined}
                        htmlFor="masterGraduateRankPercent"
                      >
                        <Input
                          id="masterGraduateRankPercent"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={academicPerformance.masterGraduateRankPercent}
                          onChange={(event) =>
                            updateAcademicPerformance(
                              "masterGraduateRankPercent",
                              event.target.value
                            )
                          }
                          placeholder="例：10"
                        />
                      </Field>
                    </div>

                    <EditableTable
                      actionLabel="新增學期"
                      minWidth="720px"
                      onAdd={() =>
                        syncMasterDirectSemesterRecords([
                          ...masterDirectSemesterRecords,
                          emptyMasterDirectSemesterRecord(),
                        ])
                      }
                      title="碩士班逕讀各學期學分與 GPA"
                      description="碩逕博學生請填寫；如無，則免填。"
                    >
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-48">學期</TableHead>
                          <TableHead className="w-48">修習學分數</TableHead>
                          <TableHead className="w-48">GPA</TableHead>
                          <TableHead className="w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {masterDirectSemesterRecords.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Input
                                value={record.semester}
                                onChange={(event) =>
                                  updateMasterDirectSemesterRecord(
                                    index,
                                    "semester",
                                    event.target.value
                                  )
                                }
                                placeholder={`第${index + 1}學期`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                value={record.credits}
                                onChange={(event) =>
                                  updateMasterDirectSemesterRecord(
                                    index,
                                    "credits",
                                    event.target.value
                                  )
                                }
                                placeholder="例：9"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={record.gpa}
                                onChange={(event) =>
                                  updateMasterDirectSemesterRecord(
                                    index,
                                    "gpa",
                                    event.target.value
                                  )
                                }
                                placeholder="例：4.0"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  syncMasterDirectSemesterRecords(
                                    masterDirectSemesterRecords.filter(
                                      (_, currentIndex) => currentIndex !== index
                                    )
                                  )
                                }
                                disabled={masterDirectSemesterRecords.length === 1}
                                aria-label="刪除學期"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </EditableTable>

                    <Textarea
                      className="min-h-28"
                      value={academicPerformance.specialPerformance}
                      onChange={(event) =>
                        updateAcademicPerformance(
                          "specialPerformance",
                          event.target.value
                        )
                      }
                      placeholder="特殊表現、重要獎項或其他有利審查說明"
                    />
                  </>
                ) : (
                  <>
                    <EditableTable
                      actionLabel="新增學期"
                      minWidth="720px"
                      onAdd={() =>
                        syncDoctoralSemesterRecords([
                          ...doctoralSemesterRecords,
                          emptyDoctoralSemesterRecord(),
                        ])
                      }
                      title="博士班歷年修習學分與 GPA"
                    >
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-48">學期</TableHead>
                          <TableHead className="w-48">修習學分數</TableHead>
                          <TableHead className="w-48">GPA</TableHead>
                          <TableHead className="w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {doctoralSemesterRecords.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Input
                                value={record.semester}
                                onChange={(event) =>
                                  updateDoctoralSemesterRecord(
                                    index,
                                    "semester",
                                    event.target.value
                                  )
                                }
                                placeholder={`第${index + 1}學期`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                value={record.credits}
                                onChange={(event) =>
                                  updateDoctoralSemesterRecord(
                                    index,
                                    "credits",
                                    event.target.value
                                  )
                                }
                                placeholder="例：9"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={record.gpa}
                                onChange={(event) =>
                                  updateDoctoralSemesterRecord(
                                    index,
                                    "gpa",
                                    event.target.value
                                  )
                                }
                                placeholder="例：4.1"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  syncDoctoralSemesterRecords(
                                    doctoralSemesterRecords.filter(
                                      (_, currentIndex) => currentIndex !== index
                                    )
                                  )
                                }
                                disabled={doctoralSemesterRecords.length === 1}
                                aria-label="刪除學期"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </EditableTable>

                    <Textarea
                      className="min-h-24"
                      value={academicPerformance.previousAcademicAwards}
                      onChange={(event) =>
                        updateAcademicPerformance(
                          "previousAcademicAwards",
                          event.target.value
                        )
                      }
                      placeholder="曾獲學術獎勵情形"
                    />
                    <Textarea
                      className="min-h-28"
                      value={academicPerformance.academicAchievementSummary}
                      onChange={(event) =>
                        updateAcademicPerformance(
                          "academicAchievementSummary",
                          event.target.value
                        )
                      }
                      placeholder="學術成就概述"
                    />
                    <Textarea
                      className="min-h-32"
                      value={academicPerformance.publicationList}
                      onChange={(event) =>
                        updateAcademicPerformance(
                          "publicationList",
                          event.target.value
                        )
                      }
                      placeholder="著作目錄：請詳列過去 5 年內發表學術著作；ISI/WOS/JCR 期刊 Impact Factor 前 15% 可特別註記"
                    />
                  </>
                )
              ) : (
                <>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <Field
                  label="學士班排名百分比"
                  english={bilingual ? "Bachelor's Class Rank Percentile" : undefined}
                  htmlFor="bachelorRankPercent"
                >
                  <Input
                    id="bachelorRankPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={eligibility.bachelorRankPercent}
                    onChange={(event) =>
                      updateEligibility(
                        "bachelorRankPercent",
                        event.target.value
                      )
                    }
                    placeholder="20"
                  />
                </Field>
                <Field
                  label="碩士班累計 GPA"
                  english={bilingual ? "Master's Cumulative GPA" : undefined}
                  htmlFor="masterGpa"
                >
                  <Input
                    id="masterGpa"
                    type="number"
                    min="0"
                    step="0.01"
                    value={eligibility.masterGpa}
                    onChange={(event) =>
                      updateEligibility("masterGpa", event.target.value)
                    }
                    placeholder="3.76"
                  />
                </Field>
                <Field
                  label="GPA 滿分制"
                  english={bilingual ? FORM_ENGLISH_COPY.gpaScale : undefined}
                  htmlFor="gpaScale"
                >
                  <Select
                    value={eligibility.gpaScale}
                    onValueChange={(value) =>
                      updateEligibility("gpaScale", value ?? "")
                    }
                  >
                    <SelectTrigger id="gpaScale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4.3">4.3</SelectItem>
                      <SelectItem value="4.0">4.0</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="百分制成績"
                  english={bilingual ? "Percentage Score" : undefined}
                  htmlFor="masterPercentScore"
                >
                  <Input
                    id="masterPercentScore"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={eligibility.masterPercentScore}
                    onChange={(event) =>
                      updateEligibility("masterPercentScore", event.target.value)
                    }
                    placeholder="85"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <Field
                  label="本獎學金 GPA"
                  english={bilingual ? "GPA for This Application" : undefined}
                  htmlFor="cumulativeGpa"
                  required
                >
                  <Input
                    id="cumulativeGpa"
                    type="number"
                    min="0"
                    step="0.01"
                    value={academicPerformance.cumulativeGpa}
                    onChange={(event) =>
                      updateAcademicPerformance(
                        "cumulativeGpa",
                        event.target.value
                      )
                    }
                    placeholder="例：3.92"
                  />
                </Field>
                <Field
                  label="GPA 滿分制"
                  english={bilingual ? FORM_ENGLISH_COPY.gpaScale : undefined}
                  htmlFor="cumulativeGpaScale"
                >
                  <Select
                    value={academicPerformance.cumulativeGpaScale}
                    onValueChange={(value) =>
                      updateAcademicPerformance(
                        "cumulativeGpaScale",
                        value ?? ""
                      )
                    }
                  >
                    <SelectTrigger id="cumulativeGpaScale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4.3">4.3</SelectItem>
                      <SelectItem value="4.0">4.0</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="班排名百分比"
                  english={bilingual ? "Class Rank Percentile" : undefined}
                  htmlFor="classRankPercent"
                >
                  <Input
                    id="classRankPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={academicPerformance.classRankPercent}
                    onChange={(event) =>
                      updateAcademicPerformance(
                        "classRankPercent",
                        event.target.value
                      )
                    }
                    placeholder="例：12.5"
                  />
                </Field>
                <Field
                  label="已修畢學分"
                  english={bilingual ? "Completed Credits" : undefined}
                  htmlFor="completedCredits"
                >
                  <Input
                    id="completedCredits"
                    type="number"
                    min="0"
                    value={academicPerformance.completedCredits}
                    onChange={(event) =>
                      updateAcademicPerformance(
                        "completedCredits",
                        event.target.value
                      )
                    }
                    placeholder="例：24"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field
                  label="操行/其他學業表現"
                  english={bilingual ? "Conduct / Other Academic Performance" : undefined}
                  htmlFor="conductScore"
                >
                  <Input
                    id="conductScore"
                    value={academicPerformance.conductScore}
                    onChange={(event) =>
                      updateAcademicPerformance("conductScore", event.target.value)
                    }
                    placeholder="例：A 或 90"
                  />
                </Field>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {eligibilitySummary}
                </div>
              </div>

              <Textarea
                className="min-h-24"
                value={academicPerformance.transcriptNotes}
                onChange={(event) =>
                  updateAcademicPerformance("transcriptNotes", event.target.value)
                }
                placeholder="補充學業表現、成績排名或成績單備註"
              />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText enabled={bilingual} english={FORM_ENGLISH_COPY.journal}>
                  三、期刊發表（填 DOI 自動索引，可手動補登）
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[1500px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-44">DOI</TableHead>
                      <TableHead className="w-36">
                        <BiText enabled={bilingual} english="Publication Date">
                          發表日期
                        </BiText>
                      </TableHead>
                      <TableHead className="w-44">
                        <BiText enabled={bilingual} english="Applicant Author Name">
                          申請人作者姓名
                        </BiText>
                      </TableHead>
                      <TableHead className="w-44">
                        <BiText enabled={bilingual} english="DOI Author List">
                          DOI 作者清單
                        </BiText>
                      </TableHead>
                      <TableHead>
                        <BiText enabled={bilingual} english="Journal / Paper Title">
                          期刊/論文名稱
                        </BiText>
                      </TableHead>
                      <TableHead className="w-36">
                        <BiText enabled={bilingual} english="Review Body">
                          審查單位
                        </BiText>
                      </TableHead>
                      <TableHead className="w-36">
                        <BiText enabled={bilingual} english="Journal Level">
                          期刊等級
                        </BiText>
                      </TableHead>
                      <TableHead className="w-40">
                        <BiText enabled={bilingual} english="Edition / Database">
                          Edition / 資料庫別
                        </BiText>
                      </TableHead>
                      <TableHead className="w-28">
                        <BiText enabled={bilingual} english="Corresponding Author">
                          通訊作者
                        </BiText>
                      </TableHead>
                      <TableHead className="w-40">
                        <BiText enabled={bilingual} english="Author Order">
                          作者順位
                        </BiText>
                      </TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journals.map((journal, index) => (
                      <TableRow key={index}>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <Input
                              className={getRowFieldClassName(
                                "journals",
                                index,
                                "doi"
                              )}
                              value={journal.doi}
                              onChange={(event) =>
                                updateRow(
                                  journals,
                                  setJournals,
                                  index,
                                  "doi",
                                  event.target.value,
                                  { section: "journals" }
                                )
                              }
                              placeholder="10.10xx/..."
                            />
                            <ValidationMessage
                              message={getRowFieldError(
                                "journals",
                                index,
                                "doi"
                              )}
                            />
                            <Button
                              type="button"
                              disabled={fetchingDoiIndex !== null}
                              onClick={() => fetchPaperData(index)}
                              className="w-full gap-1.5 bg-[#1f6f78] font-semibold text-white shadow-sm transition hover:bg-[#185860] disabled:opacity-60"
                            >
                              <Sparkles className="size-4" />
                              {fetchingDoiIndex === index
                                ? "查詢中..."
                                : "自動帶入文獻資訊"}
                            </Button>
                            <p className="text-xs leading-5 text-slate-500">
                              DOI 查無資料時，右側欄位可自行補登。
                              {bilingual ? (
                                <span className="mt-1 block">
                                  If DOI lookup fails, fill in the fields
                                  manually.
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            className={getRowFieldClassName(
                              "journals",
                              index,
                              "date"
                            )}
                            type="date"
                            value={journal.date}
                            onChange={(event) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "date",
                                event.target.value,
                                { section: "journals" }
                              )
                            }
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "journals",
                              index,
                              "date"
                            )}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            className={getRowFieldClassName(
                              "journals",
                              index,
                              "applicantAuthorName"
                            )}
                            value={journal.applicantAuthorName}
                            onChange={(event) =>
                              updateJournalApplicantAuthorName(
                                index,
                                event.target.value
                              )
                            }
                            placeholder="請填自己在論文中的姓名"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "journals",
                              index,
                              "applicantAuthorName"
                            )}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Textarea
                            className={cn(
                              "min-h-20 resize-y",
                              getRowFieldClassName("journals", index, "author")
                            )}
                            value={journal.author}
                            onChange={(event) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "author",
                                event.target.value,
                                { section: "journals" }
                              )
                            }
                            placeholder="DOI 會自動帶入作者清單"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "journals",
                              index,
                              "author"
                            )}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <Input
                              className={getRowFieldClassName(
                                "journals",
                                index,
                                "title"
                              )}
                              value={journal.title}
                              onChange={(event) =>
                                updateRow(
                                  journals,
                                  setJournals,
                                  index,
                                  "title",
                                  event.target.value,
                                  { section: "journals" }
                                )
                              }
                              placeholder="論文名稱"
                            />
                            <ValidationMessage
                              message={getRowFieldError(
                                "journals",
                                index,
                                "title"
                              )}
                            />
                            <Input
                              className={getRowFieldClassName(
                                "journals",
                                index,
                                "journal"
                              )}
                              value={journal.journal}
                              onChange={(event) =>
                                updateRow(
                                  journals,
                                  setJournals,
                                  index,
                                  "journal",
                                  event.target.value,
                                  { section: "journals" }
                                )
                              }
                              placeholder="期刊名稱/期數"
                            />
                            <ValidationMessage
                              message={getRowFieldError(
                                "journals",
                                index,
                                "journal"
                              )}
                            />
                            {journal.issns.length > 0 ? (
                              <p className="text-xs leading-5 text-slate-500">
                                ISSN：{journal.issns.join("、")}
                              </p>
                            ) : null}
                            {journal.indexSource ? (
                              <p className="text-xs leading-5 text-slate-500">
                                {journal.indexSource}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={journal.reviewUnit}
                            onChange={(event) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "reviewUnit",
                                event.target.value
                              )
                            }
                            placeholder="審查單位"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Select
                            value={journal.journalLevel}
                            onValueChange={(value) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "journalLevel",
                                value ?? "",
                                { section: "journals" }
                              )
                            }
                          >
                            <SelectTrigger
                              className={getRowFieldClassName(
                                "journals",
                                index,
                                "journalLevel"
                              )}
                            >
                              <SelectValue
                                placeholder={
                                  bilingual ? "Journal Level" : "期刊等級"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="I級期刊">
                                {optionText("I級期刊", bilingual)}
                              </SelectItem>
                              <SelectItem value="非I級期刊">
                                {optionText("非I級期刊", bilingual)}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <ValidationMessage
                            message={getRowFieldError(
                              "journals",
                              index,
                              "journalLevel"
                            )}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <DatabaseMultiSelect
                            value={journal.database}
                            onChange={(value) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "database",
                                value,
                                { section: "journals" }
                              )
                            }
                            options={databaseOptions}
                            renderOption={(option) =>
                              optionText(option, bilingual)
                            }
                            placeholder={
                              bilingual ? "Edition / Database" : "Edition / 資料庫別"
                            }
                            className={getRowFieldClassName(
                              "journals",
                              index,
                              "database"
                            )}
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "journals",
                              index,
                              "database"
                            )}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex justify-center pt-2">
                            <Checkbox
                              checked={journal.isCorrespondingAuthor}
                              onCheckedChange={(checked) =>
                                updateJournalCorrespondingAuthor(
                                  index,
                                  checked === true
                                )
                              }
                              aria-label="標記為通訊作者"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            className={getRowFieldClassName(
                              "journals",
                              index,
                              "authorOrder"
                            )}
                            value={journal.authorOrder}
                            onChange={(event) =>
                              updateJournalAuthorOrder(index, event.target.value)
                            }
                            placeholder="第一作者/通訊作者"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "journals",
                              index,
                              "authorOrder"
                            )}
                          />
                          {journal.authorOrderOriginal ? (
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              系統比對：{journal.authorOrderOriginal}
                            </p>
                          ) : null}
                          {journal.authorOrderModified ? (
                            <p className="mt-2 text-xs leading-5 text-amber-700">
                              {journal.authorOrderChangeNote}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeRow(
                                journals,
                                setJournals,
                                index,
                                emptyJournal,
                                "journals"
                              )
                            }
                            aria-label="刪除期刊列"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-white p-4 text-sm md:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900">期刊累計</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <JournalLevelSummary
                      label="I級期刊"
                      stats={journalSummary.levelStats["I級期刊"]}
                    />
                    <JournalLevelSummary
                      label="非I級期刊"
                      stats={journalSummary.levelStats["非I級期刊"]}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900">資料庫統計</h3>
                  {Object.keys(journalSummary.databaseStats).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(journalSummary.databaseStats).map(
                        ([database, count]) => (
                          <Badge key={database} variant="secondary">
                            {database}：{count} 篇
                          </Badge>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500">尚未選擇資料庫。</p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() =>
                  addRowWhenComplete(
                    "journals",
                    journals,
                    setJournals,
                    emptyJournal,
                    [
                      "doi",
                      "date",
                      "applicantAuthorName",
                      "author",
                      "title",
                      "journal",
                      "journalLevel",
                      "database",
                      "authorOrder",
                    ]
                  )
                }
              >
                <Plus className="size-4" />
                新增期刊發表
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText enabled={bilingual} english="Conference Presentations">
                  四、國際研討會發表（口頭/壁報）
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[980px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-36">發表日期</TableHead>
                      <TableHead className="w-36">作者</TableHead>
                      <TableHead>論文名稱</TableHead>
                      <TableHead>研討會名稱</TableHead>
                      <TableHead className="w-36">主辦單位</TableHead>
                      <TableHead className="w-36">發表類別</TableHead>
                      <TableHead className="w-44">資料庫</TableHead>
                      <TableHead className="w-32">順位</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conferences.map((conference, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "conferences",
                              index,
                              "date"
                            )}
                            type="date"
                            value={conference.date}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "date",
                                event.target.value,
                                { section: "conferences" }
                              )
                            }
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "date"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "conferences",
                              index,
                              "author"
                            )}
                            value={conference.author}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "author",
                                event.target.value,
                                { section: "conferences" }
                              )
                            }
                            placeholder="作者"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "author"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "conferences",
                              index,
                              "title"
                            )}
                            value={conference.title}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "title",
                                event.target.value,
                                { section: "conferences" }
                              )
                            }
                            placeholder="論文名稱"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "title"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "conferences",
                              index,
                              "conference"
                            )}
                            value={conference.conference}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "conference",
                                event.target.value,
                                { section: "conferences" }
                              )
                            }
                            placeholder="研討會名稱"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "conference"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "conferences",
                              index,
                              "organizer"
                            )}
                            value={conference.organizer}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "organizer",
                                event.target.value,
                                { section: "conferences" }
                              )
                            }
                            placeholder="主辦單位"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "organizer"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={conference.type}
                            onValueChange={(value) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "type",
                                value ?? "",
                                { section: "conferences" }
                              )
                            }
                          >
                            <SelectTrigger
                              className={getRowFieldClassName(
                                "conferences",
                                index,
                                "type"
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="口頭發表">
                                {optionText("口頭發表", bilingual)}
                              </SelectItem>
                              <SelectItem value="壁報發表">
                                {optionText("壁報發表", bilingual)}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "type"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={conference.database}
                            onValueChange={(value) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "database",
                                value ?? "",
                                { section: "conferences" }
                              )
                            }
                          >
                            <SelectTrigger
                              className={getRowFieldClassName(
                                "conferences",
                                index,
                                "database"
                              )}
                            >
                              <SelectValue
                                placeholder={bilingual ? "Database" : "資料庫"}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WOS conference proceedings citation index">
                                {optionText(
                                  "WOS conference proceedings citation index",
                                  bilingual
                                )}
                              </SelectItem>
                              <SelectItem value="SCOPUS conference proceedings citation index">
                                {optionText(
                                  "SCOPUS conference proceedings citation index",
                                  bilingual
                                )}
                              </SelectItem>
                              <SelectItem value="其他">
                                {optionText("其他", bilingual)}
                              </SelectItem>
                              <SelectItem value="否">
                                {optionText("否", bilingual)}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "database"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "conferences",
                              index,
                              "authorOrder"
                            )}
                            value={conference.authorOrder}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "authorOrder",
                                event.target.value,
                                { section: "conferences" }
                              )
                            }
                            placeholder="第一作者/通訊作者"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "conferences",
                              index,
                              "authorOrder"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeRow(
                                conferences,
                                setConferences,
                                index,
                                emptyConference,
                                "conferences"
                              )
                            }
                            aria-label="刪除研討會列"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() =>
                  addRowWhenComplete(
                    "conferences",
                    conferences,
                    setConferences,
                    emptyConference,
                    [
                      "date",
                      "author",
                      "title",
                      "conference",
                      "organizer",
                      "type",
                      "database",
                      "authorOrder",
                    ]
                  )
                }
              >
                <Plus className="size-4" />
                新增研討會發表
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText
                  enabled={bilingual}
                  english={FORM_ENGLISH_COPY.researchExperience}
                >
                  五、相關研究參與表現
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <EditableTable
                title="研究經歷"
                actionLabel="新增研究經歷"
                minWidth="900px"
                onAdd={() =>
                  addRowWhenComplete(
                    "researchExperiences",
                    researchExperiences,
                    setResearchExperiences,
                    emptyResearchExperience,
                    [
                      "institution",
                      "role",
                      "nature",
                      "duration",
                    ]
                  )
                }
              >
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>機構/主持人</TableHead>
                    <TableHead className="w-40">職稱</TableHead>
                    <TableHead className="w-44">研究案性質</TableHead>
                    <TableHead className="w-44">起訖日期</TableHead>
                    <TableHead className="w-40">證明文件</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {researchExperiences.map((experience, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          className={getRowFieldClassName(
                            "researchExperiences",
                            index,
                            "institution"
                          )}
                          value={experience.institution}
                          onChange={(event) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "institution",
                              event.target.value,
                              { section: "researchExperiences" }
                            )
                          }
                          placeholder="機構/主持人"
                        />
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchExperiences",
                            index,
                            "institution"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={experience.role}
                          onValueChange={(value) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "role",
                              value ?? "",
                              { section: "researchExperiences" }
                            )
                          }
                        >
                          <SelectTrigger
                            className={getRowFieldClassName(
                              "researchExperiences",
                              index,
                              "role"
                            )}
                          >
                            <SelectValue
                              placeholder={bilingual ? "Role" : "職稱"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="研究者本人">
                              {optionText("研究者本人", bilingual)}
                            </SelectItem>
                            <SelectItem value="研究助理">
                              {optionText("研究助理", bilingual)}
                            </SelectItem>
                            <SelectItem value="工讀生">
                              {optionText("工讀生", bilingual)}
                            </SelectItem>
                            <SelectItem value="其他">
                              {optionText("其他", bilingual)}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchExperiences",
                            index,
                            "role"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={experience.nature}
                          onValueChange={(value) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "nature",
                              value ?? "",
                              { section: "researchExperiences" }
                            )
                          }
                        >
                          <SelectTrigger
                            className={getRowFieldClassName(
                              "researchExperiences",
                              index,
                              "nature"
                            )}
                          >
                            <SelectValue
                              placeholder={bilingual ? "Project Type" : "性質"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="教師研究案">
                              {optionText("教師研究案", bilingual)}
                            </SelectItem>
                            <SelectItem value="畢業專題">
                              {optionText("畢業專題", bilingual)}
                            </SelectItem>
                            <SelectItem value="國際合作">
                              {optionText("國際合作", bilingual)}
                            </SelectItem>
                            <SelectItem value="其他">
                              {optionText("其他", bilingual)}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchExperiences",
                            index,
                            "nature"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={getRowFieldClassName(
                            "researchExperiences",
                            index,
                            "duration"
                          )}
                          value={experience.duration}
                          onChange={(event) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "duration",
                              event.target.value,
                              { section: "researchExperiences" }
                            )
                          }
                          placeholder="2023.01-2023.12"
                        />
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchExperiences",
                            index,
                            "duration"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FileUploadControl
                          bilingual={bilingual}
                          id={`document_researchExperiences_${index}`}
                          name={`document_researchExperiences_${index}`}
                          existingFileName={getExistingFileName(`researchExperiences_${index}`)}
                        />
                      </TableCell>
                      <TableCell>
                        <DeleteButton
                          label="刪除研究經歷"
                          onClick={() =>
                            removeRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              emptyResearchExperience,
                              "researchExperiences"
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </EditableTable>

              <EditableTable
                title="研究獲獎/獎助"
                actionLabel="新增研究獲獎"
                minWidth="900px"
                onAdd={() =>
                  addRowWhenComplete(
                    "researchAwards",
                    researchAwards,
                    setResearchAwards,
                    emptyResearchAward,
                    [
                      "name",
                      "projectNumber",
                      "amountOrItem",
                      "contribution",
                    ]
                  )
                }
              >
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>名稱</TableHead>
                    <TableHead className="w-40">計畫/成果編號</TableHead>
                    <TableHead className="w-40">獎助金額/項目</TableHead>
                    <TableHead>主要參與部分</TableHead>
                    <TableHead className="w-40">證明文件</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {researchAwards.map((award, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          className={getRowFieldClassName(
                            "researchAwards",
                            index,
                            "name"
                          )}
                          value={award.name}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "name",
                              event.target.value,
                              { section: "researchAwards" }
                            )
                          }
                          placeholder="獎項/獎助名稱"
                        />
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchAwards",
                            index,
                            "name"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={getRowFieldClassName(
                            "researchAwards",
                            index,
                            "projectNumber"
                          )}
                          value={award.projectNumber}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "projectNumber",
                              event.target.value,
                              { section: "researchAwards" }
                            )
                          }
                          placeholder="編號"
                        />
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchAwards",
                            index,
                            "projectNumber"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={getRowFieldClassName(
                            "researchAwards",
                            index,
                            "amountOrItem"
                          )}
                          value={award.amountOrItem}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "amountOrItem",
                              event.target.value,
                              { section: "researchAwards" }
                            )
                          }
                          placeholder="金額/項目"
                        />
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchAwards",
                            index,
                            "amountOrItem"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={getRowFieldClassName(
                            "researchAwards",
                            index,
                            "contribution"
                          )}
                          value={award.contribution}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "contribution",
                              event.target.value,
                              { section: "researchAwards" }
                            )
                          }
                          placeholder="主要參與部分"
                        />
                        <ValidationMessage
                          message={getRowFieldError(
                            "researchAwards",
                            index,
                            "contribution"
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FileUploadControl
                          bilingual={bilingual}
                          id={`document_researchAwards_${index}`}
                          name={`document_researchAwards_${index}`}
                          existingFileName={getExistingFileName(`researchAwards_${index}`)}
                        />
                      </TableCell>
                      <TableCell>
                        <DeleteButton
                          label="刪除研究獲獎"
                          onClick={() =>
                            removeRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              emptyResearchAward,
                              "researchAwards"
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </EditableTable>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText enabled={bilingual} english="Planned Research Topics">
                  六、獲獎當學年預計研究議題（非畢業論文）
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[920px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>論文名稱</TableHead>
                      <TableHead className="w-40">預計發表時間</TableHead>
                      <TableHead>預計投稿期刊/研討會</TableHead>
                      <TableHead className="w-40">資料庫名稱</TableHead>
                      <TableHead className="w-36">指導教授</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plannedResearch.map((research, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "plannedResearch",
                              index,
                              "title"
                            )}
                            value={research.title}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "title",
                                event.target.value,
                                { section: "plannedResearch" }
                              )
                            }
                            placeholder="論文名稱"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "plannedResearch",
                              index,
                              "title"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "plannedResearch",
                              index,
                              "expectedDate"
                            )}
                            value={research.expectedDate}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "expectedDate",
                                event.target.value,
                                { section: "plannedResearch" }
                              )
                            }
                            placeholder="2026.09"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "plannedResearch",
                              index,
                              "expectedDate"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "plannedResearch",
                              index,
                              "targetVenue"
                            )}
                            value={research.targetVenue}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "targetVenue",
                                event.target.value,
                                { section: "plannedResearch" }
                              )
                            }
                            placeholder={
                              bilingual ? "Journal / Conference" : "期刊/研討會"
                            }
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "plannedResearch",
                              index,
                              "targetVenue"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={research.database}
                            onValueChange={(value) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "database",
                                value ?? "",
                                { section: "plannedResearch" }
                              )
                            }
                          >
                            <SelectTrigger
                              className={getRowFieldClassName(
                                "plannedResearch",
                                index,
                                "database"
                              )}
                            >
                              <SelectValue
                                placeholder={
                                  bilingual ? "Select database" : "選擇資料庫"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {databaseOptions.map((database) => (
                                <SelectItem key={database} value={database}>
                                  {optionText(database, bilingual)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <ValidationMessage
                            message={getRowFieldError(
                              "plannedResearch",
                              index,
                              "database"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className={getRowFieldClassName(
                              "plannedResearch",
                              index,
                              "advisor"
                            )}
                            value={research.advisor}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "advisor",
                                event.target.value,
                                { section: "plannedResearch" }
                              )
                            }
                            placeholder="指導教授"
                          />
                          <ValidationMessage
                            message={getRowFieldError(
                              "plannedResearch",
                              index,
                              "advisor"
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <DeleteButton
                            label="刪除預計研究"
                            onClick={() =>
                              removeRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                emptyPlannedResearch,
                                "plannedResearch"
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() =>
                  addRowWhenComplete(
                    "plannedResearch",
                    plannedResearch,
                    setPlannedResearch,
                    emptyPlannedResearch,
                    [
                      "title",
                      "expectedDate",
                      "targetVenue",
                      "database",
                      "advisor",
                    ]
                  )
                }
              >
                <Plus className="size-4" />
                新增預計研究議題
              </Button>
            </CardContent>
          </Card>

          <Card
            ref={setSectionRef("documents")}
            className={cn("shadow-sm", sectionErrorClass("documents"))}
          >
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText enabled={bilingual} english={FORM_ENGLISH_COPY.documents}>
                  七、其他優秀事蹟與指定資料上傳
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ValidationMessage message={topLevelErrors.documents} />
              <Textarea
                className="min-h-28"
                value={otherAchievements}
                onChange={(event) => setOtherAchievements(event.target.value)}
                placeholder="例如：專利發表、語言能力證明、作品、優良表現與服務等"
              />

              {!isFullTimeDoctoralGrant ? (
                <section className="space-y-3">
                  <h2 className="text-base font-semibold">
                    {bilingual
                      ? "Optional Supporting Document"
                      : "其他有利審查文件"}
                  </h2>
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-4 rounded-md border bg-white p-4 md:grid-cols-2",
                      topLevelErrors.otherReviewDocuments
                        ? "border-red-300 bg-red-50/30"
                        : "border-slate-200"
                    )}
                  >
                    <Field label="名稱" htmlFor="otherReviewDocumentName">
                      <Input
                        id="otherReviewDocumentName"
                        value={otherReviewDocuments[0]?.name ?? ""}
                        onChange={(event) =>
                          setOtherReviewDocuments([{ name: event.target.value }])
                        }
                        placeholder="例：語言能力證明、專利證書、作品集"
                      />
                    </Field>
                    <Field
                      label="有利資料上傳（請合併上傳成 1 件）"
                      htmlFor="document_otherReviewDocuments_0"
                    >
                      <FileUploadControl
                        bilingual={bilingual}
                        error={topLevelErrors.otherReviewDocuments}
                        id="document_otherReviewDocuments_0"
                        name="document_otherReviewDocuments_0"
                        onFileChange={() =>
                          setTopLevelErrors((current) => {
                            const next = { ...current };
                            delete next.documents;
                            delete next.otherReviewDocuments;
                            return next;
                          })
                        }
                        existingFileName={getExistingFileName(
                          "otherReviewDocuments_0"
                        )}
                      />
                    </Field>
                  </div>
                </section>
              ) : null}

              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
                {bilingual
                  ? isFullTimeDoctoralGrant
                    ? FORM_ENGLISH_COPY.uploadsNoteFullTime
                    : FORM_ENGLISH_COPY.uploadsNoteScholarship
                  : isFullTimeDoctoralGrant
                    ? "上傳檔名請依照「年度申請助學金_申請單/歷年成績單/個人研究方向說明_系所_名字」。"
                    : "上傳檔名請依照「年度申請獎學金_成績單/教授推薦函/無專職切結書_系所_名字」。"}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {effectiveDocumentFields.map((document) => (
                  <div
                    key={document.key}
                    className={cn(
                      "rounded-md border bg-white p-4",
                      topLevelErrors[`document.${document.key}`]
                        ? "border-red-300 bg-red-50/30"
                        : "border-slate-200"
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Label
                        htmlFor={`document_${document.key}`}
                        className="font-medium"
                      >
                        {documentText(document, bilingual)}
                      </Label>
                      {document.required ? (
                        <Badge variant="secondary">
                          {bilingual ? "Required" : "必繳"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {bilingual ? "Optional" : "選繳"}
                        </Badge>
                      )}
                    </div>
                    {document.key === "advisorRecommendation" &&
                    isAdvisorPending ? (
                      <p className="mb-3 text-xs leading-5 text-slate-500">
                        {bilingual
                          ? "If the advisor is temporarily entered as pending, this item is waived."
                          : "指導教授暫填「找尋中，待定」時，本項可免繳。"}
                      </p>
                    ) : null}
                      <FileUploadControl
                        bilingual={bilingual}
                        error={topLevelErrors[`document.${document.key}`]}
                        id={`document_${document.key}`}
                      name={`document_${document.key}`}
                      onFileChange={() =>
                        setTopLevelErrors((current) => {
                          const next = { ...current };
                          delete next.documents;
                          delete next[`document.${document.key}`];
                          return next;
                        })
                      }
                      existingFileName={getExistingFileName(document.key)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {submitMessage ? (
            <Alert className="border-[#1f6f78]/30 bg-white">
              <Upload className="size-4" />
              <AlertTitle>系統訊息</AlertTitle>
              <AlertDescription>{submitMessage}</AlertDescription>
            </Alert>
          ) : null}

          <Card
            ref={setSectionRef("declarations")}
            className={cn("shadow-sm", sectionErrorClass("declarations"))}
          >
            <CardHeader>
              <CardTitle className="text-lg">
                <BiText
                  enabled={bilingual}
                  english={FORM_ENGLISH_COPY.declarations}
                >
                  送出前聲明
                </BiText>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ValidationMessage message={topLevelErrors.declarations} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CheckField
                  checked={eligibility.hasSpecialRecommendation}
                  error={
                    topLevelErrors.declarations &&
                    !eligibility.hasSpecialRecommendation
                      ? bi(bilingual, "請勾選此聲明。", "Please check this declaration.")
                      : undefined
                  }
                  label="我保證以上內容皆為真實，否則後果自行承擔"
                  english={
                    bilingual
                      ? "I certify that all information above is true and accurate."
                      : undefined
                  }
                  onChange={(checked) =>
                    updateEligibility("hasSpecialRecommendation", checked)
                  }
                />
                <CheckField
                  checked={eligibility.noFullTimeJob}
                  error={
                    topLevelErrors.declarations && !eligibility.noFullTimeJob
                      ? bi(bilingual, "請勾選此聲明。", "Please check this declaration.")
                      : undefined
                  }
                  label="我目前未於公私立機構從事專職工作"
                  english={
                    bilingual
                      ? "I am not currently employed full-time by any public or private institution."
                      : undefined
                  }
                  onChange={(checked) =>
                    updateEligibility("noFullTimeJob", checked)
                  }
                />
                <CheckField
                  checked={eligibility.notReceivingOtherScholarship}
                  error={
                    topLevelErrors.declarations &&
                    !eligibility.notReceivingOtherScholarship
                      ? bi(bilingual, "請勾選此聲明。", "Please check this declaration.")
                      : undefined
                  }
                  label="我已詳閱獎學金相關辦法，並了解相關規則"
                  english={
                    bilingual
                      ? "I have read and understood the scholarship regulations."
                      : undefined
                  }
                  onChange={(checked) =>
                    updateEligibility("notReceivingOtherScholarship", checked)
                  }
                />
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {bilingual
                  ? "Scholarship regulations are available on the "
                  : "獎學金相關辦法可參考"}
                <a
                  className="mx-1 font-medium text-[#1f6f78] underline underline-offset-4"
                  href={otherScholarshipRuleUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {bilingual
                    ? "College scholarship page"
                    : "本院獎助學金頁面"}
                </a>
                {bilingual ? "." : "。"}
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 border-t border-slate-300 py-6 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#1f6f78] hover:bg-[#185d65]"
            >
              <Send className="size-4" />
              {isSubmitting
                ? bilingual
                  ? "Processing..."
                  : "處理中..."
                : bilingual
                  ? "Submit Application"
                  : "送出申請"}
            </Button>
          </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({
  children,
  english,
  error,
  htmlFor,
  label,
  required,
}: {
  children: React.ReactNode;
  english?: string;
  error?: string;
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {english ?? label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </Label>
      {children}
      <ValidationMessage message={error} />
    </div>
  );
}

function ValidationMessage({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 whitespace-pre-line text-xs font-medium text-red-600">
      {message}
    </p>
  ) : null;
}

function FileUploadControl({
  bilingual,
  error,
  id,
  name,
  onFileChange,
  existingFileName,
}: {
  bilingual?: boolean;
  error?: string;
  id: string;
  name: string;
  onFileChange?: () => void;
  existingFileName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={(event) => {
          setFileName(event.currentTarget.files?.[0]?.name ?? "");
          onFileChange?.();
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {bilingual ? "Upload PDF" : "上傳 PDF"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="justify-start text-slate-600"
          disabled={!fileName}
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = "";
            }
            setFileName("");
          }}
        >
          <Trash2 className="size-4" />
          {bilingual ? "Remove" : "刪除"}
        </Button>
      </div>
      {fileName ? (
        <p className="min-h-5 truncate text-sm text-slate-600">
          {fileName}
        </p>
      ) : existingFileName ? (
        <p className="min-h-5 truncate text-sm text-emerald-600">
          <CheckCircle2 className="mr-1 inline-block size-3.5" />
          {bilingual ? "Uploaded: " : "已上傳："}
          {existingFileName}
        </p>
      ) : (
        <p className="min-h-5 truncate text-sm text-slate-600">
          {bilingual ? "No file selected" : "尚未選擇檔案"}
        </p>
      )}
      <ValidationMessage message={error} />
    </div>
  );
}

function JournalLevelSummary({
  label,
  stats,
}: {
  label: string;
  stats: { first: number; corresponding: number; other: number };
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="mt-2 leading-6 text-slate-700">
        第一作者：{stats.first} 篇；通訊作者：{stats.corresponding} 篇；其他：
        {stats.other} 篇
      </p>
    </div>
  );
}

function CheckField({
  checked,
  english,
  error,
  label,
  onChange,
}: {
  checked: boolean;
  english?: string;
  error?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-16 items-start gap-3 rounded-md border bg-white p-4 text-sm leading-6",
        error ? "border-red-300 bg-red-50/30" : "border-slate-200"
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span className="space-y-1">
        <span>{english ?? label}</span>
        <ValidationMessage message={error} />
      </span>
    </label>
  );
}

function DeleteButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick}>
      <Trash2 className="size-4" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function EditableTable({
  actionLabel,
  children,
  description,
  minWidth,
  onAdd,
  title,
}: {
  actionLabel: string;
  children: React.ReactNode;
  description?: string;
  minWidth: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table style={{ minWidth }}>{children}</Table>
      </div>
    </section>
  );
}
