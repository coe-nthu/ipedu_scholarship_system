import type { AcademicPerformance, ScholarshipPayload } from "@/lib/types";

type SemesterGpaSummary = {
  completedCredits: string;
  gpa: number | null;
};

const RENEWAL_STUDY_STATUSES = new Set(["續領", "舊生"]);

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function splitSemesterText(value: string) {
  return value
    .split(/[;\n；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCredits(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/([\d.]+)\s*學分/);
  return toNumber(match?.[1] ?? value);
}

function parseGpa(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/GPA\s*([\d.]+)/i);
  const explicitGpa = toNumber(match?.[1]);
  if (explicitGpa !== null) return explicitGpa;

  const directGpa = toNumber(value);
  if (directGpa !== null) return directGpa;

  const numericParts = Array.from(value.matchAll(/\d+(?:\.\d+)?/g))
    .map((part) => toNumber(part[0]))
    .filter((part): part is number => part !== null && part >= 0 && part <= 4.3);

  return numericParts.length > 0 ? numericParts[numericParts.length - 1] : null;
}

export function calculateSemesterGpaSummary(
  creditsText: string | undefined,
  gpasText: string | undefined
): SemesterGpaSummary {
  const creditParts = splitSemesterText(creditsText ?? "");
  const gpaParts = splitSemesterText(gpasText ?? "");
  const maxLength = Math.max(creditParts.length, gpaParts.length);
  let completedCredits = 0;
  let weightedCredits = 0;
  let weightedGpa = 0;

  for (let index = 0; index < maxLength; index += 1) {
    const credits = parseCredits(creditParts[index]);
    const gpa = parseGpa(gpaParts[index]);

    if (credits !== null && credits > 0) {
      completedCredits += credits;
      if (gpa !== null) {
        weightedCredits += credits;
        weightedGpa += credits * gpa;
      }
    }
  }

  return {
    completedCredits: completedCredits > 0 ? String(completedCredits) : "",
    gpa: weightedCredits > 0 ? weightedGpa / weightedCredits : null,
  };
}

export function calculateDoctoralStudyGpaSummary(
  academic: AcademicPerformance
): SemesterGpaSummary {
  const masterDirect = calculateSemesterGpaSummary(
    academic.masterDirectSemesterCredits,
    academic.masterDirectSemesterGpas
  );
  const doctoral = calculateSemesterGpaSummary(
    academic.doctoralSemesterCredits,
    academic.doctoralSemesterGpas
  );
  const masterCredits = toNumber(masterDirect.completedCredits) ?? 0;
  const doctoralCredits = toNumber(doctoral.completedCredits) ?? 0;
  const weightedParts = [
    { credits: masterCredits, gpa: masterDirect.gpa },
    { credits: doctoralCredits, gpa: doctoral.gpa },
  ].filter((part) => part.credits > 0 && part.gpa !== null);
  const weightedCredits = weightedParts.reduce(
    (sum, part) => sum + part.credits,
    0
  );
  const weightedGpa = weightedParts.reduce(
    (sum, part) => sum + part.credits * (part.gpa ?? 0),
    0
  );
  const completedCredits = masterCredits + doctoralCredits;

  return {
    completedCredits: completedCredits > 0 ? String(completedCredits) : "",
    gpa: weightedCredits > 0 ? weightedGpa / weightedCredits : null,
  };
}

export function shouldUseDoctoralStudyGpa(
  programKey: string | null | undefined,
  studyStatus: string | null | undefined
) {
  return (
    programKey === "nstc-doctoral" ||
    RENEWAL_STUDY_STATUSES.has(studyStatus ?? "")
  );
}

export function getDerivedAcademicGpaSummary(
  academic: AcademicPerformance,
  programKey: string | null | undefined,
  studyStatus: string | null | undefined
): SemesterGpaSummary {
  const directGpa = toNumber(academic.cumulativeGpa);
  if (directGpa !== null && academic.completedCredits) {
    return {
      completedCredits: academic.completedCredits,
      gpa: directGpa,
    };
  }

  if (shouldUseDoctoralStudyGpa(programKey, studyStatus)) {
    const semesterSummary = calculateDoctoralStudyGpaSummary(academic);
    if (semesterSummary.gpa !== null || semesterSummary.completedCredits) {
      return semesterSummary;
    }
  }

  return {
    completedCredits: academic.completedCredits,
    gpa: directGpa,
  };
}

export function deriveAcademicPerformanceGpa(
  academic: AcademicPerformance,
  programKey: string | null | undefined,
  studyStatus: string | null | undefined
): AcademicPerformance {
  const summary = getDerivedAcademicGpaSummary(
    academic,
    programKey,
    studyStatus
  );

  if (summary.gpa === null && !summary.completedCredits) {
    return academic;
  }

  return {
    ...academic,
    completedCredits: summary.completedCredits || academic.completedCredits,
    cumulativeGpa:
      summary.gpa !== null ? summary.gpa.toFixed(2) : academic.cumulativeGpa,
    cumulativeGpaScale: academic.cumulativeGpaScale || "4.3",
  };
}

export function derivePayloadAcademicGpa(
  payload: ScholarshipPayload,
  programKey: string | null | undefined
): ScholarshipPayload {
  return {
    ...payload,
    academicPerformance: deriveAcademicPerformanceGpa(
      payload.academicPerformance,
      programKey,
      payload.applicantInfo.studyStatus
    ),
  };
}
