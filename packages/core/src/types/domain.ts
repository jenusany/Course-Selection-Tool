// Framework-independent domain types. No Prisma/Next.js imports allowed here —
// packages/db maps its Prisma models onto these shapes at the boundary.

export type Term = "FALL" | "WINTER" | "SUMMER";
export type BreadthCategory = "A" | "B" | "C";
export type ModuleType =
  | "HONOURS_SPECIALIZATION"
  | "MAJOR"
  | "MINOR"
  | "SPECIALIZATION"
  | "GENERAL";
export type SectionComponent = "LEC" | "LAB" | "TUT";
export type StudentStanding = "GOOD_STANDING" | "ON_PROBATION" | "REQUIRED_TO_WITHDRAW";
export type HoldType =
  | "FINANCIAL"
  | "ADVISING"
  | "MEDICAL_CLEARANCE"
  | "DISCIPLINARY"
  | "DOCUMENT_MISSING";

export interface CourseRef {
  subject: string;
  number: string;
}

export interface Course extends CourseRef {
  id: string;
  subjectName: string;
  title: string;
  description: string | null;
  creditWeight: number;
  essay: boolean;
  breadth: BreadthCategory | null;
  level: number;
  prerequisiteTree: RequisiteNode | null;
  antirequisiteTree: RequisiteNode | null;
}

export interface MeetingTime {
  day: "MO" | "TU" | "WE" | "TH" | "FR";
  start: string; // "HH:MM", 24h
  end: string;
}

export interface Section {
  id: string;
  courseId: string;
  term: Term;
  year: number;
  component: SectionComponent;
  sectionCode: string;
  meetingTimes: MeetingTime[];
  location: string | null;
  instructor: string | null;
  capacity: number;
  enrolledCount: number;
  version: number;
}

// ── Requisite tree (prerequisites / antirequisites) ────────────────────────

export type RequisiteNode =
  | { type: "course"; subject: string; number: string; minGrade?: number }
  | { type: "and"; nodes: RequisiteNode[] }
  | { type: "or"; nodes: RequisiteNode[] }
  | { type: "creditsAtLevel"; level: number; credits: number; subject?: string }
  | { type: "registrationIn"; moduleCode: string }
  | { type: "externalRequirement"; text: string }; // Ontario Secondary School codes, "permission of the department", etc.

// ── Student record (as returned by StudentRecordProvider) ──────────────────

export interface CompletedCourse {
  course: CourseRef;
  term: Term;
  year: number;
  grade: number;
}

export interface InProgressCourse {
  course: CourseRef;
  term: Term;
  year: number;
}

export interface Hold {
  id: string;
  type: HoldType;
  reason: string;
  placedAt: string;
  resolvedAt: string | null;
}

export interface StudentProfile {
  studentId: string;
  name: string;
  year: number;
  standing: StudentStanding;
  programs: Array<{ code: string; name: string; type: ModuleType; isPrimary: boolean }>;
}

// ── Degree audit result shape (produced by packages/core/src/audit) ────────

export type RequirementStatus = "MET" | "IN_PROGRESS" | "UNMET";

export interface RequirementResult {
  id: string;
  label: string;
  status: RequirementStatus;
  creditsRequired: number;
  creditsSatisfied: number;
  satisfiedBy: CourseRef[];
  suggestedCourses: CourseRef[];
}

export interface DegreeAuditResult {
  studentId: string;
  generatedAt: string;
  overallCreditsCompleted: number;
  overallCreditsInProgress: number;
  requirements: RequirementResult[];
}
