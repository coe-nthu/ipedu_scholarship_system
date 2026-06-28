import type { ScholarshipApplication } from "@/lib/types";

type DisplayRow = {
  label: string;
  value: string;
};

type GpaSummary = {
  completedCredits: string;
  gpa: number | null;
  scale: string;
};

const MASTER_GRADUATE_GPA_PROGRAMS = new Set([
  "nstc-research-grant",
  "presidential-new-student",
  "moe-doctoral",
]);

const FULL_TIME_DOCTORAL_GRANT_KEY = "full-time-doctoral-grant";
const NSTC_DOCTORAL_KEY = "nstc-doctoral";
const TAIPEI_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Taipei",
  year: "numeric",
});

function getProgramKey(application: ScholarshipApplication) {
  return application.program_key ?? "";
}

function isMasterGraduateGpaProgram(application: ScholarshipApplication) {
  return MASTER_GRADUATE_GPA_PROGRAMS.has(getProgramKey(application));
}

export function isFullTimeDoctoralGrant(application: ScholarshipApplication) {
  return getProgramKey(application) === FULL_TIME_DOCTORAL_GRANT_KEY;
}

export function isNstcDoctoralProgram(application: ScholarshipApplication) {
  return getProgramKey(application) === NSTC_DOCTORAL_KEY;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value: string) {
  return value ? `前 ${value}%` : "";
}

function formatGpa(value: string, scale = "4.3") {
  return value ? `${value} / ${scale}` : "";
}

export function formatSubmittedAt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return TAIPEI_TIME_FORMATTER.format(date);
}

export function getDashboardGpaSummary(
  application: ScholarshipApplication
): GpaSummary {
  const academic = application.payload.academicPerformance;

  if (isFullTimeDoctoralGrant(application)) {
    const isNewStudent =
      application.payload.applicantInfo.studyStatus === "新生" ||
      application.payload.applicantInfo.studyStatus === "新領";
    return {
      completedCredits: isNewStudent
        ? academic.fullTimePreviousDegreeCredits
        : academic.fullTimePreviousYearCredits,
      gpa: toNumber(
        isNewStudent
          ? academic.fullTimePreviousDegreeGpa
          : academic.fullTimePreviousYearGpa
      ),
      scale: "4.3",
    };
  }

  if (isMasterGraduateGpaProgram(application)) {
    return {
      completedCredits: academic.masterGraduateTotalCredits,
      gpa: toNumber(academic.masterGraduateGpa),
      scale: "4.3",
    };
  }

  return {
    completedCredits: academic.completedCredits,
    gpa: toNumber(academic.cumulativeGpa),
    scale: academic.cumulativeGpaScale || "4.3",
  };
}

export function getEligibilityDisplayRows(
  application: ScholarshipApplication
): DisplayRow[] {
  const { eligibility } = application.payload;
  const declarationRows = [
    {
      label: "內容屬實",
      value: eligibility.hasSpecialRecommendation ? "是" : "否",
    },
    {
      label: "無專職工作",
      value: eligibility.noFullTimeJob ? "是" : "否",
    },
    {
      label: "已詳閱辦法",
      value: eligibility.notReceivingOtherScholarship ? "是" : "否",
    },
  ];

  if (isFullTimeDoctoralGrant(application)) {
    const otherAidRows =
      eligibility.otherAidStatus === "有領取"
        ? [
            { label: "獎助調查", value: "有領取校內其他獎助學金" },
            { label: "核發單位", value: eligibility.otherAidOrganization },
            { label: "每月支領", value: eligibility.otherAidMonthlyAmount },
          ]
        : [
            {
              label: "獎助調查",
              value:
                eligibility.otherAidStatus === "未兼領"
                  ? "未兼領其他獎助學金"
                  : "",
            },
          ];
    return [
      ...declarationRows,
      { label: "兼職情形", value: eligibility.employmentStatus },
      { label: "教學助理月薪", value: eligibility.taMonthlyIncome },
      { label: "兼職工作", value: eligibility.employmentDescription },
      { label: "兼職平均月薪", value: eligibility.employmentMonthlyIncome },
      ...otherAidRows,
      { label: "補充說明", value: eligibility.eligibilityNotes },
    ];
  }

  if (isMasterGraduateGpaProgram(application) && !isNstcDoctoralProgram(application)) {
    return declarationRows;
  }

  const qualificationRows = [
    {
      label: "學士班排名",
      value: formatPercent(eligibility.bachelorRankPercent),
    },
    {
      label: "碩士班 GPA",
      value: formatGpa(eligibility.masterGpa, eligibility.gpaScale),
    },
    { label: "碩士百分制", value: eligibility.masterPercentScore },
    ...declarationRows,
  ];

  if (isNstcDoctoralProgram(application)) {
    return [
      ...qualificationRows,
      { label: "補充說明", value: eligibility.eligibilityNotes },
    ];
  }

  return [
    ...qualificationRows,
    { label: "兼職情形", value: eligibility.employmentStatus },
    { label: "教學助理月薪", value: eligibility.taMonthlyIncome },
    { label: "兼職工作", value: eligibility.employmentDescription },
    { label: "兼職平均月薪", value: eligibility.employmentMonthlyIncome },
    { label: "補充說明", value: eligibility.eligibilityNotes },
  ];
}

export function getAcademicDisplayRows(
  application: ScholarshipApplication
): DisplayRow[] {
  const { academicPerformance: academic } = application.payload;

  if (isFullTimeDoctoralGrant(application)) {
    if (
      application.payload.applicantInfo.studyStatus === "新生" ||
      application.payload.applicantInfo.studyStatus === "新領"
    ) {
      return [
        {
          label: "成績類別",
          value: "前一學制畢業總平均",
        },
        { label: "總學分數", value: academic.fullTimePreviousDegreeCredits },
        { label: "GPA", value: academic.fullTimePreviousDegreeGpa },
        { label: "系或班排名", value: academic.fullTimePreviousDegreeRank },
      ];
    }

    return [
      {
        label: "成績類別",
        value: "前一學年成績",
      },
      { label: "總學分數", value: academic.fullTimePreviousYearCredits },
      { label: "GPA", value: academic.fullTimePreviousYearGpa },
      { label: "系或班排名", value: academic.fullTimePreviousYearRank },
    ];
  }

  if (isMasterGraduateGpaProgram(application)) {
    const rows: DisplayRow[] = [
      { label: "學士學校", value: academic.bachelorSchool },
      { label: "學士科系", value: academic.bachelorDepartment },
      { label: "學士總學分", value: academic.bachelorTotalCredits },
      { label: "學士 GPA", value: academic.bachelorGpa },
      { label: "學士排名", value: formatPercent(academic.bachelorRankPercent) },
      { label: "碩士學校", value: academic.masterSchool },
      { label: "碩士科系", value: academic.masterDepartment },
      { label: "碩士畢業總學分", value: academic.masterGraduateTotalCredits },
      { label: "碩士畢業 GPA", value: academic.masterGraduateGpa },
      {
        label: "碩士畢業排名",
        value: formatPercent(academic.masterGraduateRankPercent),
      },
    ];

    if (getProgramKey(application) === "presidential-new-student") {
      rows.push(
        { label: "入學管道", value: academic.admissionChannel },
        { label: "碩士論文題目", value: academic.masterThesisTitle },
        { label: "博班研究主題", value: academic.doctoralResearchTopic },
        { label: "學術表現", value: academic.academicAchievementSummary },
        {
          label: "其他專業表現",
          value: academic.professionalPerformanceStatement,
        },
        {
          label: "項目意願",
          value: academic.presidentialApplicationPreference,
        }
      );
    } else {
      rows.push(
        { label: "碩逕博學分", value: academic.masterDirectSemesterCredits },
        { label: "碩逕博 GPA", value: academic.masterDirectSemesterGpas },
        { label: "特殊表現", value: academic.specialPerformance },
        { label: "博士班學分", value: academic.doctoralSemesterCredits },
        { label: "博士班 GPA", value: academic.doctoralSemesterGpas },
        { label: "曾獲學術獎勵", value: academic.previousAcademicAwards },
        { label: "學術成就概述", value: academic.academicAchievementSummary },
        { label: "著作目錄", value: academic.publicationList }
      );
    }

    return rows;
  }

  return [
    {
      label: "累計 GPA",
      value: formatGpa(academic.cumulativeGpa, academic.cumulativeGpaScale),
    },
    { label: "班排名", value: formatPercent(academic.classRankPercent) },
    { label: "已修學分", value: academic.completedCredits },
    { label: "操行成績", value: academic.conductScore },
    { label: "成績備註", value: academic.transcriptNotes },
  ];
}
