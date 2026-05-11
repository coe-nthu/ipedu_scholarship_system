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
  eligibilityNotes: string;
};

export type AcademicPerformance = {
  cumulativeGpa: string;
  cumulativeGpaScale: string;
  classRankPercent: string;
  completedCredits: string;
  conductScore: string;
  transcriptNotes: string;
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
  attachmentNote: string;
};

export type ResearchAward = {
  name: string;
  projectNumber: string;
  amountOrItem: string;
  contribution: string;
  attachmentNote: string;
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
};

export type ReviewStatus =
  | "auto_verified"       // 自動審核完成
  | "pending_manual"      // 待人工審核
  | "manual_verified"     // 人工審核完成
  | "data_error";         // 上傳資料有錯誤

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  auto_verified: "自動審核完成",
  pending_manual: "待人工審核",
  manual_verified: "人工審核完成",
  data_error: "上傳資料有錯誤",
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
  status: SubmissionStatus;
  review_status: ReviewStatus;
  payload: ScholarshipPayload;
  files: SupabaseFileRecord[];
  submitted_at: string | null;
  created_at: string;
};
