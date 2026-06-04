import type { ScholarshipApplication, ScholarshipPayload } from "@/lib/types";

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

function getProgramKey(application: ScholarshipApplication) {
  return application.program_key ?? "";
}

function isMasterGraduateGpaProgram(application: ScholarshipApplication) {
  return MASTER_GRADUATE_GPA_PROGRAMS.has(getProgramKey(application));
}

function isFullTimeDoctoralGrant(application: ScholarshipApplication) {
  return getProgramKey(application) === FULL_TIME_DOCTORAL_GRANT_KEY;
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

function parseList(value: string) {
  return value
    .split("；")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNumberFromText(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? "";
}

function getDoctoralSemesterRows(payload: ScholarshipPayload) {
  const credits = parseList(payload.academicPerformance.doctoralSemesterCredits);
  const gpas = parseList(payload.academicPerformance.doctoralSemesterGpas);
  const length = Math.max(credits.length, gpas.length);

  return Array.from({ length }, (_, index) => {
    const creditText = credits[index] ?? "";
    const gpaText = gpas[index] ?? "";
    const semester =
      creditText.replace(/\s*\d+(?:\.\d+)?\s*學分\s*$/, "") ||
      gpaText.replace(/\s*GPA\s*\d+(?:\.\d+)?\s*$/i, "") ||
      `第 ${index + 1} 筆`;

    return {
      credits: getNumberFromText(creditText, /(\d+(?:\.\d+)?)\s*學分/),
      gpa: getNumberFromText(gpaText, /GPA\s*(\d+(?:\.\d+)?)/i),
      semester,
    };
  });
}

function getWeightedDoctoralGpa(payload: ScholarshipPayload) {
  const rows = getDoctoralSemesterRows(payload);
  let totalCredits = 0;
  let weightedTotal = 0;

  for (const row of rows) {
    const credits = toNumber(row.credits);
    const gpa = toNumber(row.gpa);
    if (credits === null || gpa === null) continue;
    totalCredits += credits;
    weightedTotal += credits * gpa;
  }

  if (totalCredits <= 0) {
    return { completedCredits: "", gpa: null, scale: "4.3" };
  }

  return {
    completedCredits: String(totalCredits),
    gpa: weightedTotal / totalCredits,
    scale: "4.3",
  };
}

export function getDashboardGpaSummary(
  application: ScholarshipApplication
): GpaSummary {
  const academic = application.payload.academicPerformance;

  if (isFullTimeDoctoralGrant(application)) {
    return getWeightedDoctoralGpa(application.payload);
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
    return [
      ...declarationRows,
      { label: "兼職情形", value: eligibility.employmentStatus },
      { label: "教學助理月薪", value: eligibility.taMonthlyIncome },
      { label: "兼職工作", value: eligibility.employmentDescription },
      { label: "兼職平均月薪", value: eligibility.employmentMonthlyIncome },
      { label: "補充說明", value: eligibility.eligibilityNotes },
    ];
  }

  if (isMasterGraduateGpaProgram(application)) {
    return declarationRows;
  }

  return [
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
  const gpaSummary = getDashboardGpaSummary(application);

  if (isFullTimeDoctoralGrant(application)) {
    return [
      {
        label: "博士班加權 GPA",
        value:
          gpaSummary.gpa === null
            ? ""
            : `${gpaSummary.gpa.toFixed(2)} / ${gpaSummary.scale}`,
      },
      { label: "博士班總學分", value: gpaSummary.completedCredits },
      { label: "博士班學分", value: academic.doctoralSemesterCredits },
      { label: "博士班 GPA", value: academic.doctoralSemesterGpas },
      { label: "曾獲學術獎勵", value: academic.previousAcademicAwards },
      { label: "學術成就概述", value: academic.academicAchievementSummary },
      { label: "著作目錄", value: academic.publicationList },
      { label: "成績備註", value: academic.transcriptNotes },
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
