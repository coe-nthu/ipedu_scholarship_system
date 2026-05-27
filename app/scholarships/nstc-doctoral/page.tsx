"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Info,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthButton } from "@/components/auth-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { findJournalIndexMatch } from "@/lib/journal-indexes";
import { createClient } from "@/lib/supabase/client";
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

type ScholarshipFormConfig = {
  academicForm: "standard" | "doctoralResearchGrant" | "presidentialScholarship";
  amount: string;
  applicationType: string;
  description: string;
  eligibilityReminder: string;
  period: string;
  program: string;
  studyStatusOptions: string[];
  title: string;
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

const STUDY_STATUS_NEW = "新領";
const STUDY_STATUS_RENEWAL = "續領";
const PENDING_ADVISOR_NAME = "找尋中，待定";

const DEFAULT_SCHOLARSHIP_CONFIG: ScholarshipFormConfig = {
  academicForm: "standard",
  amount: "每月 4 萬元，至多 4 學年",
  applicationType: "培育優秀博士生獎學金",
  description: "適用 111-112 學年度學生申請表單",
  eligibilityReminder:
    "學士班排名前 20%、碩士班累計 GPA 3.76/4.3 或百分制 85 分以上，或有特殊表現經指導教授及院系所推薦。指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。",
  period: "每學年下學期依公告辦理",
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
    program: "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)",
    studyStatusOptions: [STUDY_STATUS_NEW, STUDY_STATUS_RENEWAL],
    title: "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)",
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
    program: "校長獎學金 (新生獎學金)",
    studyStatusOptions: [STUDY_STATUS_NEW, STUDY_STATUS_RENEWAL],
    title: "校長獎學金 (新生獎學金)",
  },
};

const DOCUMENT_PREFIX = "document_";
const STORAGE_BUCKET = "scholarship-documents";
const PDF_MIME_TYPE = "application/pdf";

const documentFields = [
  { key: "transcript", label: "歷年成績單", required: true },
  { key: "advisorRecommendation", label: "指導教授推薦函", required: true },
  { key: "learningPlan", label: "個人學習計畫書（最多 3 頁）", required: true },
  { key: "noFullTimeDeclaration", label: "無專職切結書", required: true },
] as const;

const databaseOptions = [
  "SSCI",
  "SCIE",
  "SCI",
  "TSSCI",
  "SCOPUS",
  "其他",
  "否",
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
  const config =
    scholarshipConfigs[pathname] ?? DEFAULT_SCHOLARSHIP_CONFIG;
  const defaultStudyStatus = config.studyStatusOptions[0] ?? STUDY_STATUS_RENEWAL;
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
  const [eligibility, setEligibility] = useState<Eligibility>({
    bachelorRankPercent: "",
    masterGpa: "",
    gpaScale: "4.3",
    masterPercentScore: "",
    hasSpecialRecommendation: false,
    noFullTimeJob: false,
    notReceivingOtherScholarship: false,
    eligibilityNotes: "",
  });
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
  const [
    hasOpenedOtherScholarshipRule,
    setHasOpenedOtherScholarshipRule,
  ] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

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

  useEffect(() => {
    setApplicantInfo((current) => ({
      ...current,
      applicationType: config.applicationType,
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
  }, [config.applicationType, config.studyStatusOptions, defaultStudyStatus]);

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
          applicationType: config.applicationType,
          studyStatus: normalizedStudyStatus,
          advisorName:
            normalizedStudyStatus === STUDY_STATUS_NEW &&
            !p.applicantInfo.advisorName
              ? PENDING_ADVISOR_NAME
              : p.applicantInfo.advisorName,
        });
      }
      if (p.eligibility) setEligibility(p.eligibility);
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
    [config.applicationType, config.studyStatusOptions, defaultStudyStatus]
  );

  // Load existing application data when user is authenticated
  const loadExistingApplication = useCallback(async () => {
    const draftKey = `scholarship-draft-${config.program}`;
    setIsLoadingExisting(true);
    try {
      const response = await fetch(
        `/api/scholarships?scholarshipProgram=${encodeURIComponent(config.program)}`
      );
      const result = await response.json();

      // Try reading localStorage draft
      let localDraft: (ScholarshipPayload & { savedAt?: number; doctoralSemesterRecords?: DoctoralSemesterRecord[]; masterDirectSemesterRecords?: MasterDirectSemesterRecord[] }) | null = null;
      try {
        const raw = localStorage.getItem(draftKey);
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
  }, [config.program, applyFormDraft]);

  useEffect(() => {
    if (currentUser && !hasLoadedExisting.current) {
      hasLoadedExisting.current = true;
      loadExistingApplication();
    }
  }, [currentUser, loadExistingApplication]);

  // ── Auto-save form state to localStorage ──
  const DRAFT_KEY = `scholarship-draft-${config.program}`;

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
      (eligibility.masterPercentScore && masterScore >= 85) ||
      eligibility.hasSpecialRecommendation
    ) {
      return "已符合至少一項請領資格條件";
    }

    return "請填寫學士排名、碩士 GPA/百分制或特殊表現推薦";
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
      documentFields.map((document) =>
        document.key === "advisorRecommendation" && isAdvisorPending
          ? { ...document, required: false }
          : document
      ),
    [isAdvisorPending]
  );

  const updateApplicant = (field: keyof ApplicantInfo, value: string) => {
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
    setEligibility((current) => ({ ...current, [field]: value }));
  };

  const handleOtherScholarshipConfirmation = (checked: boolean) => {
    if (!checked) {
      updateEligibility("notReceivingOtherScholarship", false);
      return;
    }

    if (!hasOpenedOtherScholarshipRule) {
      window.open(otherScholarshipRuleUrl, "_blank", "noopener,noreferrer");
      setHasOpenedOtherScholarshipRule(true);
      setSubmitMessage(
        "請先閱讀本院其他獎助學金頁面，回到表單後再次勾選即可確認。"
      );
      return;
    }

    updateEligibility("notReceivingOtherScholarship", true);
    setSubmitMessage("");
  };

  const updateAcademicPerformance = (
    field: keyof AcademicPerformance,
    value: string
  ) => {
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

  const updateRow = <T,>(
    rows: T[],
    setRows: (rows: T[]) => void,
    index: number,
    field: keyof T,
    value: T[keyof T]
  ) => {
    setRows(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const removeRow = <T,>(
    rows: T[],
    setRows: (rows: T[]) => void,
    index: number,
    fallback: () => T
  ) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    setRows(nextRows.length > 0 ? nextRows : [fallback()]);
  };

  const addRowWhenComplete = <T extends Record<string, unknown>>(
    rows: T[],
    setRows: (rows: T[]) => void,
    fallback: () => T,
    requiredFields: (keyof T)[],
    message: string
  ) => {
    const lastRow = rows[rows.length - 1];
    const isComplete = requiredFields.every((field) => isFilled(lastRow[field]));

    if (!isComplete) {
      alert(message);
      return;
    }

    setRows([...rows, fallback()]);
  };

  const updateJournalApplicantAuthorName = (index: number, value: string) => {
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

  const fetchPaperData = async (index: number) => {
    const doiValue = journals[index].doi.trim();
    if (!doiValue) {
      alert("請先輸入 DOI 碼");
      return;
    }
    if (fetchingDoiIndex !== null) return; // prevent concurrent fetches

    setFetchingDoiIndex(index);
    try {
      const response = await fetch(
        `/api/publications/fetch?doi=${encodeURIComponent(doiValue)}`
      );
      const result = await response.json();

      if (!result.success) {
        alert(result.error || "找不到資料");
        return;
      }

      const doiAuthorNames =
        result.data.authors?.map((author: { given: string; family: string }) =>
          [author.given, author.family].filter(Boolean).join(" ").trim()
        ) ?? [];
      const issns = result.data.issns ?? [];
      const journalIndexMatch = findJournalIndexMatch({
        issns,
        journalTitle: result.data.journalName,
      });

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
            database: journalIndexMatch?.database || journal.database,
            journalLevel: journalIndexMatch?.level || journal.journalLevel,
            indexSource: journalIndexMatch
              ? "依期刊索引對照表自動判別"
              : "未命中索引對照表，請人工選擇",
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
      alert("連線發生錯誤，請稍後再試。");
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

    if (!applicantInfo.applicantName || !applicantInfo.department) {
      setSubmitMessage("請至少填寫申請人姓名與所屬學系所。");
      return;
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
      setSubmitMessage(
        config.academicForm === "doctoralResearchGrant"
          ? "送出前請填寫學業成績資料。"
          : "送出前請填寫學業表現 GPA。"
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
      setSubmitMessage(
        `送出前請上傳：${missingRequiredDocuments
          .map((document) => document.label)
          .join("、")}。`
      );
      return;
    }

    // Check otherReviewDocuments limit
    const otherReviewDocumentFields = Array.from(formData.keys()).filter(
      (field) => field.match(/^document_otherReviewDocuments_\d+$/)
    );
    if (
      otherReviewDocumentFields.length > 1 ||
      (otherReviewDocuments.filter((d) => d.name.trim()).length || 0) > 1
    ) {
      setSubmitMessage("其他有利審查文件限上傳一件。");
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
                    返回獎學金選擇
                  </Link>
                  <p className="text-sm font-medium text-emerald-700">
                    {config.title}
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-950">
                    {config.description}
                  </h1>
                </div>
                <Badge className="w-fit bg-[#1f6f78] text-white">
                  {config.amount}
                </Badge>
                <AuthButton />
              </div>
            </header>

            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <FileText className="size-4" />
              <AlertTitle>請領資格提醒</AlertTitle>
              <AlertDescription>
                {config.eligibilityReminder}
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
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">一、基本資料</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Field label="申請人姓名" htmlFor="applicantName" required>
                <Input
                  id="applicantName"
                  value={applicantInfo.applicantName}
                  onChange={(event) =>
                    updateApplicant("applicantName", event.target.value)
                  }
                  placeholder="請輸入姓名"
                  required
                />
              </Field>
              <Field label="學號" htmlFor="studentId">
                <Input
                  id="studentId"
                  value={applicantInfo.studentId}
                  onChange={(event) =>
                    updateApplicant("studentId", event.target.value)
                  }
                  placeholder="例：112xxxxxx"
                />
              </Field>
              <Field label="所屬學系所" htmlFor="department" required>
                <Input
                  id="department"
                  value={applicantInfo.department}
                  onChange={(event) =>
                    updateApplicant("department", event.target.value)
                  }
                  placeholder="例：教育心理與諮商學系"
                  required
                />
              </Field>
              <Field label="Email" htmlFor="email">
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
              <Field label="手機" htmlFor="phone">
                <Input
                  id="phone"
                  value={applicantInfo.phone}
                  onChange={(event) =>
                    updateApplicant("phone", event.target.value)
                  }
                  placeholder="09xx-xxx-xxx"
                />
              </Field>
              <Field label="指導教授" htmlFor="advisorName">
                <Input
                  id="advisorName"
                  value={applicantInfo.advisorName}
                  onChange={(event) =>
                    updateApplicant("advisorName", event.target.value)
                  }
                  placeholder="請輸入指導教授姓名"
                />
              </Field>
              <Field label="入學學年度" htmlFor="admissionAcademicYear">
                <Input
                  id="admissionAcademicYear"
                  value={applicantInfo.admissionAcademicYear}
                  onChange={(event) =>
                    updateApplicant("admissionAcademicYear", event.target.value)
                  }
                  placeholder="111 或 112"
                />
              </Field>
              <Field label="請領別" htmlFor="studyStatus">
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
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="申請類別" htmlFor="applicationType">
                <Select
                  value={applicantInfo.applicationType}
                  onValueChange={(value) =>
                    updateApplicant("applicationType", value ?? "")
                  }
                >
                  <SelectTrigger id="applicationType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={config.applicationType}>
                      {config.applicationType}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">二、請領資格與學業表現</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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
                      <Field label="學士學校全稱" htmlFor="bachelorSchool">
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
                      <Field label="學士科系全稱" htmlFor="bachelorDepartment">
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
                      <Field label="碩士學校全稱" htmlFor="masterSchool">
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
                      <Field label="碩士科系全稱" htmlFor="masterDepartment">
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
                      <Field label="學士班總學分數" htmlFor="bachelorTotalCredits">
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
                      <Field label="學士班 GPA" htmlFor="bachelorGpa">
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
                      <Field label="學士班排名百分比" htmlFor="newBachelorRankPercent">
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
                      <Field label="碩士班畢業總學分數" htmlFor="masterGraduateTotalCredits">
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
                      <Field label="碩士班畢業 GPA" htmlFor="masterGraduateGpa">
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
                      <Field label="碩士班畢業排名百分比" htmlFor="masterGraduateRankPercent">
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
                <Field label="學士班排名百分比" htmlFor="bachelorRankPercent">
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
                <Field label="碩士班累計 GPA" htmlFor="masterGpa">
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
                <Field label="GPA 滿分制" htmlFor="gpaScale">
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
                <Field label="百分制成績" htmlFor="masterPercentScore">
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
                <Field label="本獎學金 GPA" htmlFor="cumulativeGpa" required>
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
                <Field label="GPA 滿分制" htmlFor="cumulativeGpaScale">
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
                <Field label="班排名百分比" htmlFor="classRankPercent">
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
                <Field label="已修畢學分" htmlFor="completedCredits">
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
                <Field label="操行/其他學業表現" htmlFor="conductScore">
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CheckField
                  checked={eligibility.hasSpecialRecommendation}
                  label="特殊表現，經指導教授及院系所推薦"
                  onChange={(checked) =>
                    updateEligibility("hasSpecialRecommendation", checked)
                  }
                />
                <CheckField
                  checked={eligibility.noFullTimeJob}
                  label="確認未於公私立機構從事專職工作"
                  onChange={(checked) =>
                    updateEligibility("noFullTimeJob", checked)
                  }
                />
                <CheckField
                  checked={eligibility.notReceivingOtherScholarship}
                  label="確認未重複請領本院其他獎助學金"
                  onChange={handleOtherScholarshipConfirmation}
                />
              </div>
              <p className="text-sm leading-6 text-slate-600">
                勾選「未重複請領」前，系統會先開啟
                <a
                  className="mx-1 font-medium text-[#1f6f78] underline underline-offset-4"
                  href={otherScholarshipRuleUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setHasOpenedOtherScholarshipRule(true)}
                >
                  本院獎助學金頁面
                </a>
                供閱讀申請規則。
              </p>

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
                三、期刊發表（填 DOI 自動索引，可手動補登）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[1500px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-44">DOI</TableHead>
                      <TableHead className="w-36">發表日期</TableHead>
                      <TableHead className="w-44">申請人作者姓名</TableHead>
                      <TableHead className="w-44">DOI 作者清單</TableHead>
                      <TableHead>期刊/論文名稱</TableHead>
                      <TableHead className="w-36">審查單位</TableHead>
                      <TableHead className="w-36">期刊等級</TableHead>
                      <TableHead className="w-40">資料庫</TableHead>
                      <TableHead className="w-28">通訊作者</TableHead>
                      <TableHead className="w-40">作者順位</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journals.map((journal, index) => (
                      <TableRow key={index}>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <Input
                              value={journal.doi}
                              onChange={(event) =>
                                updateRow(
                                  journals,
                                  setJournals,
                                  index,
                                  "doi",
                                  event.target.value
                                )
                              }
                              placeholder="10.10xx/..."
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={fetchingDoiIndex !== null}
                              onClick={() => fetchPaperData(index)}
                            >
                              {fetchingDoiIndex === index
                                ? "查詢中..."
                                : "自動帶入"}
                            </Button>
                            <p className="text-xs leading-5 text-slate-500">
                              DOI 查無資料時，右側欄位可自行補登。
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            type="date"
                            value={journal.date}
                            onChange={(event) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "date",
                                event.target.value
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={journal.applicantAuthorName}
                            onChange={(event) =>
                              updateJournalApplicantAuthorName(
                                index,
                                event.target.value
                              )
                            }
                            placeholder="請填自己在論文中的姓名"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Textarea
                            className="min-h-20 resize-y"
                            value={journal.author}
                            onChange={(event) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "author",
                                event.target.value
                              )
                            }
                            placeholder="DOI 會自動帶入作者清單"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <Input
                              value={journal.title}
                              onChange={(event) =>
                                updateRow(
                                  journals,
                                  setJournals,
                                  index,
                                  "title",
                                  event.target.value
                                )
                              }
                              placeholder="論文名稱"
                            />
                            <Input
                              value={journal.journal}
                              onChange={(event) =>
                                updateRow(
                                  journals,
                                  setJournals,
                                  index,
                                  "journal",
                                  event.target.value
                                )
                              }
                              placeholder="期刊名稱/期數"
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
                                value ?? ""
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="期刊等級" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="I級期刊">I級期刊</SelectItem>
                              <SelectItem value="非I級期刊">非I級期刊</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="align-top">
                          <Select
                            value={journal.database}
                            onValueChange={(value) =>
                              updateRow(
                                journals,
                                setJournals,
                                index,
                                "database",
                                value ?? ""
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="資料庫" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SSCI">SSCI</SelectItem>
                              <SelectItem value="SCIE">SCIE</SelectItem>
                              <SelectItem value="SCI">SCI</SelectItem>
                              <SelectItem value="TSSCI">TSSCI</SelectItem>
                              <SelectItem value="SCOPUS">SCOPUS</SelectItem>
                              <SelectItem value="其他">其他</SelectItem>
                              <SelectItem value="否">否</SelectItem>
                            </SelectContent>
                          </Select>
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
                            value={journal.authorOrder}
                            onChange={(event) =>
                              updateJournalAuthorOrder(index, event.target.value)
                            }
                            placeholder="第一作者/通訊作者"
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
                                emptyJournal
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
                    ],
                    "請先將最後一列「期刊發表」填寫完整，再新增下一列。"
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
                四、國際研討會發表（口頭/壁報）
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
                            type="date"
                            value={conference.date}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "date",
                                event.target.value
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={conference.author}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "author",
                                event.target.value
                              )
                            }
                            placeholder="作者"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={conference.title}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "title",
                                event.target.value
                              )
                            }
                            placeholder="論文名稱"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={conference.conference}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "conference",
                                event.target.value
                              )
                            }
                            placeholder="研討會名稱"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={conference.organizer}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "organizer",
                                event.target.value
                              )
                            }
                            placeholder="主辦單位"
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
                                value ?? ""
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="口頭發表">口頭發表</SelectItem>
                              <SelectItem value="壁報發表">壁報發表</SelectItem>
                            </SelectContent>
                          </Select>
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
                                value ?? ""
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="資料庫" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WOS conference proceedings citation index">
                                WOS proceedings
                              </SelectItem>
                              <SelectItem value="SCOPUS conference proceedings citation index">
                                SCOPUS proceedings
                              </SelectItem>
                              <SelectItem value="其他">其他</SelectItem>
                              <SelectItem value="否">否</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={conference.authorOrder}
                            onChange={(event) =>
                              updateRow(
                                conferences,
                                setConferences,
                                index,
                                "authorOrder",
                                event.target.value
                              )
                            }
                            placeholder="第一作者/通訊作者"
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
                                emptyConference
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
                    ],
                    "請先將最後一列「國際研討會發表」填寫完整，再新增下一列。"
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
              <CardTitle className="text-lg">五、相關研究參與表現</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <EditableTable
                title="研究經歷"
                actionLabel="新增研究經歷"
                minWidth="900px"
                onAdd={() =>
                  addRowWhenComplete(
                    researchExperiences,
                    setResearchExperiences,
                    emptyResearchExperience,
                    [
                      "institution",
                      "role",
                      "nature",
                      "duration",
                    ],
                    "請先將最後一列「研究經歷」填寫完整，再新增下一列。"
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
                          value={experience.institution}
                          onChange={(event) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "institution",
                              event.target.value
                            )
                          }
                          placeholder="機構/主持人"
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
                              value ?? ""
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="職稱" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="研究者本人">研究者本人</SelectItem>
                            <SelectItem value="研究助理">研究助理</SelectItem>
                            <SelectItem value="工讀生">工讀生</SelectItem>
                            <SelectItem value="其他">其他</SelectItem>
                          </SelectContent>
                        </Select>
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
                              value ?? ""
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="性質" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="教師研究案">教師研究案</SelectItem>
                            <SelectItem value="畢業專題">畢業專題</SelectItem>
                            <SelectItem value="國際合作">國際合作</SelectItem>
                            <SelectItem value="其他">其他</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={experience.duration}
                          onChange={(event) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "duration",
                              event.target.value
                            )
                          }
                          placeholder="2023.01-2023.12"
                        />
                      </TableCell>
                      <TableCell>
                        <FileUploadControl
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
                              emptyResearchExperience
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
                    researchAwards,
                    setResearchAwards,
                    emptyResearchAward,
                    [
                      "name",
                      "projectNumber",
                      "amountOrItem",
                      "contribution",
                    ],
                    "請先將最後一列「研究獲獎/獎助」填寫完整，再新增下一列。"
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
                          value={award.name}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "name",
                              event.target.value
                            )
                          }
                          placeholder="獎項/獎助名稱"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={award.projectNumber}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "projectNumber",
                              event.target.value
                            )
                          }
                          placeholder="編號"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={award.amountOrItem}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "amountOrItem",
                              event.target.value
                            )
                          }
                          placeholder="金額/項目"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={award.contribution}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "contribution",
                              event.target.value
                            )
                          }
                          placeholder="主要參與部分"
                        />
                      </TableCell>
                      <TableCell>
                        <FileUploadControl
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
                              emptyResearchAward
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
                六、獲獎當學年預計研究議題（非畢業論文）
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
                            value={research.title}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "title",
                                event.target.value
                              )
                            }
                            placeholder="論文名稱"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={research.expectedDate}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "expectedDate",
                                event.target.value
                              )
                            }
                            placeholder="2026.09"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={research.targetVenue}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "targetVenue",
                                event.target.value
                              )
                            }
                            placeholder="期刊/研討會"
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
                                value ?? ""
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選擇資料庫" />
                            </SelectTrigger>
                            <SelectContent>
                              {databaseOptions.map((database) => (
                                <SelectItem key={database} value={database}>
                                  {database}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={research.advisor}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "advisor",
                                event.target.value
                              )
                            }
                            placeholder="指導教授"
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
                                emptyPlannedResearch
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
                    plannedResearch,
                    setPlannedResearch,
                    emptyPlannedResearch,
                    [
                      "title",
                      "expectedDate",
                      "targetVenue",
                      "database",
                      "advisor",
                    ],
                    "請先將最後一列「預計研究議題」填寫完整，再新增下一列。"
                  )
                }
              >
                <Plus className="size-4" />
                新增預計研究議題
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                七、其他優秀事蹟與指定資料上傳
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Textarea
                className="min-h-28"
                value={otherAchievements}
                onChange={(event) => setOtherAchievements(event.target.value)}
                placeholder="例如：專利發表、語言能力證明、作品、優良表現與服務等"
              />

              <section className="space-y-3">
                <h2 className="text-base font-semibold">其他有利審查文件</h2>
                <div className="grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-2">
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
                      id="document_otherReviewDocuments_0"
                      name="document_otherReviewDocuments_0"
                      existingFileName={getExistingFileName("otherReviewDocuments_0")}
                    />
                  </Field>
                </div>
              </section>

              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
                上傳檔名請依照「年度申請獎學金_成績單/教授推薦函/無專職切結書_系所_名字」。
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {effectiveDocumentFields.map((document) => (
                  <div
                    key={document.key}
                    className="rounded-md border border-slate-200 bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Label
                        htmlFor={`document_${document.key}`}
                        className="font-medium"
                      >
                        {document.label}
                      </Label>
                      {document.required ? (
                        <Badge variant="secondary">必繳</Badge>
                      ) : (
                        <Badge variant="outline">選繳</Badge>
                      )}
                    </div>
                    {document.key === "advisorRecommendation" &&
                    isAdvisorPending ? (
                      <p className="mb-3 text-xs leading-5 text-slate-500">
                        指導教授暫填「找尋中，待定」時，本項可免繳。
                      </p>
                    ) : null}
                    <FileUploadControl
                      id={`document_${document.key}`}
                      name={`document_${document.key}`}
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

          <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-300 bg-[#f4f7f6]/95 py-4 backdrop-blur sm:flex-row sm:justify-end">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#1f6f78] hover:bg-[#185d65]"
            >
              <Send className="size-4" />
              {isSubmitting ? "處理中..." : "送出申請"}
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
  htmlFor,
  label,
  required,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function FileUploadControl({
  id,
  name,
  existingFileName,
}: {
  id: string;
  name: string;
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
        onChange={(event) =>
          setFileName(event.currentTarget.files?.[0]?.name ?? "")
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          上傳 PDF
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
          刪除
        </Button>
      </div>
      {fileName ? (
        <p className="min-h-5 truncate text-sm text-slate-600">
          {fileName}
        </p>
      ) : existingFileName ? (
        <p className="min-h-5 truncate text-sm text-emerald-600">
          <CheckCircle2 className="mr-1 inline-block size-3.5" />
          已上傳：{existingFileName}
        </p>
      ) : (
        <p className="min-h-5 truncate text-sm text-slate-600">
          尚未選擇檔案
        </p>
      )}
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
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-16 items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm leading-6">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span>{label}</span>
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
