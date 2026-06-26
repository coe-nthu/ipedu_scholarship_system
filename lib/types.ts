export type SubmissionStatus = "draft" | "submitted";

export type ApplicantInfo = {
  applicantName: string;
  studentId: string;
  department: string;
  email: string;
  phone: string;
  advisorName: string;
  admissionAcademicYear: string;
  studyStatus: string;
  applicationType: string;
};

export type Eligibility = {
  bachelorRankPercent: string;
  masterGpa: string;
  gpaScale: string;
  masterPercentScore: string;
  hasSpecialRecommendation: boolean;
  noFullTimeJob: boolean;
  notReceivingOtherScholarship: boolean;
  employmentStatus: string;
  employmentDescription: string;
  employmentMonthlyIncome: string;
  taMonthlyIncome: string;
  eligibilityNotes: string;
};

export type AcademicPerformance = {
  cumulativeGpa: string;
  cumulativeGpaScale: string;
  classRankPercent: string;
  completedCredits: string;
  conductScore: string;
  transcriptNotes: string;
  bachelorDepartment: string;
  bachelorGpa: string;
  bachelorRankPercent: string;
  bachelorSchool: string;
  bachelorTotalCredits: string;
  masterDepartment: string;
  masterDirectSemesterCredits: string;
  masterDirectSemesterGpas: string;
  masterGraduateGpa: string;
  masterGraduateRankPercent: string;
  masterGraduateTotalCredits: string;
  masterSchool: string;
  doctoralSemesterCredits: string;
  doctoralSemesterGpas: string;
  previousAcademicAwards: string;
  academicAchievementSummary: string;
  publicationList: string;
  specialPerformance: string;
  admissionChannel: string;
  masterThesisTitle: string;
  doctoralResearchTopic: string;
  professionalPerformanceStatement: string;
  presidentialApplicationPreference: string;
};

export type Journal = {
  doi: string;
  date: string;
  author: string;
  applicantAuthorName: string;
  doiAuthorNames: string[];
  issns: string[];
  title: string;
  journal: string;
  reviewUnit: string;
  journalLevel: string;
  indexSource: string;
  isCorrespondingAuthor: boolean;
  hasTrustedDatabase: string;
  database: string;
  authorOrder: string;
  authorOrderOriginal: string;
  authorOrderModified: boolean;
  authorOrderChangeNote: string;
  attachmentNote: string;
  verification?: PublicationVerification;
};

export type Conference = {
  date: string;
  author: string;
  title: string;
  conference: string;
  organizer: string;
  type: string;
  database: string;
  authorOrder: string;
};

export type ResearchExperience = {
  institution: string;
  role: string;
  nature: string;
  duration: string;
};

export type ResearchAward = {
  name: string;
  projectNumber: string;
  amountOrItem: string;
  contribution: string;
};

export type PlannedResearch = {
  title: string;
  expectedDate: string;
  targetVenue: string;
  hasTrustedDatabase: string;
  database: string;
  advisor: string;
};

export type OtherReviewDocument = {
  name: string;
};

export type ScholarshipPayload = {
  applicantInfo: ApplicantInfo;
  eligibility: Eligibility;
  academicPerformance: AcademicPerformance;
  journals: Journal[];
  conferences: Conference[];
  researchExperiences: ResearchExperience[];
  researchAwards: ResearchAward[];
  plannedResearch: PlannedResearch[];
  otherAchievements: string;
  otherReviewDocuments: OtherReviewDocument[];
  verificationSummary?: VerificationSummary;
};

export type ReviewStatus =
  | "未審核"
  | "系所審核通過"
  | "院辦審核通過";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  "未審核": "未審核",
  "系所審核通過": "系所審核通過",
  "院辦審核通過": "院辦審核通過",
};

export type SupabaseFileRecord = {
  field: string;
  label: string | null;
  name: string;
  path: string;
  type: string;
  size: number;
};

export type ScholarshipApplication = {
  id: string;
  applicant_name: string;
  student_id: string;
  department: string;
  advisor_name: string | null;
  gpa: number | null;
  gpa_scale: number | null;
  program_key: string | null;
  scholarship_program: string;
  submission_status: SubmissionStatus;
  review_status: ReviewStatus;
  reviewer_remarks: string;
  payload: ScholarshipPayload;
  files: SupabaseFileRecord[];
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/*  Publication verification types                                     */
/* ------------------------------------------------------------------ */

export type VerificationCheckStatus =
  | "pass"
  | "fail"
  | "timeout"
  | "skipped";

/** Per-publication verification result stored in Journal.verification */
export type PublicationVerification = {
  status: "pass" | "fail" | "timeout" | "skipped";
  doiExists: VerificationCheckStatus;
  doiRegistrationAgency: string | null;
  authorFound: VerificationCheckStatus;
  authorOrderCorrect: VerificationCheckStatus;
  actualAuthorPosition: number | null;
  totalAuthors: number | null;
  citedByCount: number | null;
  crossrefTitle: string | null;
  crossrefJournal: string | null;
  crossrefAuthors: string[] | null;
  message: string;
  verifiedAt: string;
};

/** Top-level verification summary stored in ScholarshipPayload */
export type VerificationSummary = {
  status: "all_passed" | "has_issues" | "timeout" | "pending";
  verifiedAt: string;
};

export type DashboardRole = "teacher" | "admin";
export type DashboardAuthProvider = "google" | "password";
export type DashboardDepartmentScope = "all" | string[];

export type AuthorizedEmail = {
  id: string;
  email: string;
  role: DashboardRole;
  department_scope: DashboardDepartmentScope;
  added_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Unified account row for the admin "accounts & permissions" panel */
export type DashboardAccountEntry = {
  kind: "password" | "google";
  /** password: username · google: authorized_emails.id */
  key: string;
  /** password: username · google: email */
  label: string;
  displayName: string;
  role: DashboardRole;
  departmentScope: DashboardDepartmentScope;
  /** Only meaningful for password accounts; google is always true */
  isActive: boolean;
};

export type JournalIndexRecord = {
  id?: string;
  journal_title: string;
  issn: string | null;
  eissn: string | null;
  category: string | null;
  edition: string;
  jif: string | null;
  jci: string | null;
  publisher_name: string | null;
  jcr_year: number | null;
  source_file_name: string | null;
  uploaded_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type JournalIndexImportSummary = {
  count: number;
  duplicatesSkipped: number;
  errors: string[];
  sourceFileName: string;
};
