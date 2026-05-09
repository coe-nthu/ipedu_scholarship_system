"use client";

import { useMemo, useState } from "react";
import { FileText, Plus, Save, Send, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
} from "@/lib/types";

const documentFields = [
  { key: "transcript", label: "歷年成績單", required: true },
  { key: "advisorRecommendation", label: "指導教授推薦函", required: true },
  { key: "learningPlan", label: "個人學習計畫書（最多 3 頁）", required: true },
  { key: "noFullTimeDeclaration", label: "無專職切結書", required: true },
] as const;

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
  attachmentNote: "",
});

const emptyResearchAward = (): ResearchAward => ({
  name: "",
  projectNumber: "",
  amountOrItem: "",
  contribution: "",
  attachmentNote: "",
});

const emptyPlannedResearch = (): PlannedResearch => ({
  title: "",
  expectedDate: "",
  targetVenue: "",
  hasTrustedDatabase: "是",
  database: "",
  advisor: "",
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

export default function ScholarshipForm() {
  const [applicantInfo, setApplicantInfo] = useState<ApplicantInfo>({
    applicantName: "",
    studentId: "",
    department: "",
    email: "",
    phone: "",
    advisorName: "",
    admissionAcademicYear: "112",
    studyStatus: "新領",
    applicationType: "培育優秀博士生獎學金",
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
    useState<AcademicPerformance>({
      cumulativeGpa: "",
      cumulativeGpaScale: "4.3",
      classRankPercent: "",
      completedCredits: "",
      conductScore: "",
      transcriptNotes: "",
    });
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

  const updateApplicant = (field: keyof ApplicantInfo, value: string) => {
    setApplicantInfo((current) => ({ ...current, [field]: value }));
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

  const fetchPaperData = async (index: number) => {
    const doiValue = journals[index].doi.trim();
    if (!doiValue) {
      alert("請先輸入 DOI 碼");
      return;
    }

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
    }
  };

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

    if (status === "submitted" && !academicPerformance.cumulativeGpa) {
      setSubmitMessage("送出前請填寫學業表現 GPA。");
      return;
    }

    const formData = new FormData(form);
    const missingRequiredDocuments = documentFields
      .filter((document) => document.required)
      .filter((document) => {
        const file = formData.get(`document_${document.key}`);
        return !(file instanceof File) || file.size === 0;
      });

    if (status === "submitted" && missingRequiredDocuments.length > 0) {
      setSubmitMessage(
        `送出前請上傳：${missingRequiredDocuments
          .map((document) => document.label)
          .join("、")}。`
      );
      return;
    }

    formData.set("status", status);
    formData.set("payload", JSON.stringify(buildPayload()));

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/scholarships", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "儲存失敗，請稍後再試。");
      }

      setSubmitMessage(
        status === "draft"
          ? `草稿已儲存，申請編號：${result.applicationId}`
          : `申請已送出，申請編號：${result.applicationId}`
      );
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
        <header className="border-b border-slate-300 pb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">
                國科會-培育優秀博士生獎學金
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">
                適用 111-112 學年度學生申請表單
              </h1>
            </div>
            <Badge className="w-fit bg-[#1f6f78] text-white">
              每月 4 萬元，至多 4 學年
            </Badge>
          </div>
        </header>

        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <FileText className="size-4" />
          <AlertTitle>請領資格提醒</AlertTitle>
          <AlertDescription>
            學士班排名前 20%、碩士班累計 GPA 3.76/4.3 或百分制 85
            分以上，或有特殊表現經指導教授及院系所推薦。指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。
          </AlertDescription>
        </Alert>

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
              <Field label="新/續領" htmlFor="studyStatus">
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
                    <SelectItem value="新領">新領</SelectItem>
                    <SelectItem value="續領">續領</SelectItem>
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
                    <SelectItem value="培育優秀博士生獎學金">
                      培育優秀博士生獎學金
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
                      <TableHead className="w-24">通訊</TableHead>
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
                              onClick={() => fetchPaperData(index)}
                            >
                              自動帶入
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
                            placeholder="第一/通訊"
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
                            placeholder="第一/通訊"
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
                      "attachmentNote",
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
                        <Input
                          value={experience.attachmentNote}
                          onChange={(event) =>
                            updateRow(
                              researchExperiences,
                              setResearchExperiences,
                              index,
                              "attachmentNote",
                              event.target.value
                            )
                          }
                          placeholder="附件編號"
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
                      "attachmentNote",
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
                        <Input
                          value={award.attachmentNote}
                          onChange={(event) =>
                            updateRow(
                              researchAwards,
                              setResearchAwards,
                              index,
                              "attachmentNote",
                              event.target.value
                            )
                          }
                          placeholder="附件編號"
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
                          <Input
                            value={research.database}
                            onChange={(event) =>
                              updateRow(
                                plannedResearch,
                                setPlannedResearch,
                                index,
                                "database",
                                event.target.value
                              )
                            }
                            placeholder="SSCI/SCOPUS..."
                          />
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
                    <Input
                      id="document_otherReviewDocuments_0"
                      name="document_otherReviewDocuments_0"
                      type="file"
                      accept=".pdf,.doc,.docx,.odt,.jpg,.jpeg,.png"
                    />
                  </Field>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {documentFields.map((document) => (
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
                    <Input
                      id={`document_${document.key}`}
                      name={`document_${document.key}`}
                      type="file"
                      accept=".pdf,.doc,.docx,.odt,.jpg,.jpeg,.png"
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
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) {
                  submitApplication(form, "draft");
                }
              }}
            >
              <Save className="size-4" />
              儲存草稿
            </Button>
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
  minWidth,
  onAdd,
  title,
}: {
  actionLabel: string;
  children: React.ReactNode;
  minWidth: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
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
