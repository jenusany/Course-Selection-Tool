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

/**
 * Why a requisite fragment couldn't be turned into a course/credit check:
 * - highSchool:   Ontario Secondary School / Grade 12U course codes
 * - permission:   "permission of the department"
 * - registration: registration in a program/year we don't model as a module
 * - outOfCatalog: a real course, but in a subject we haven't seeded, so we
 *                 can't resolve its subject code with confidence
 * - unparsed:     the parser couldn't confidently structure this text — a
 *                 human should check it against the raw calendar text
 *                 (the "UNVERIFIED-PARSE" escape hatch from PLAN.md §6)
 */
export type ExternalRequirementReason = "highSchool" | "permission" | "registration" | "outOfCatalog" | "unparsed";

export type RequisiteNode =
  | { type: "course"; subject: string; number: string; minGrade?: number }
  | { type: "and"; nodes: RequisiteNode[] }
  | { type: "or"; nodes: RequisiteNode[] }
  // "1.0 course from: A, B, C" — credits' worth of the listed options
  | { type: "creditsFrom"; credits: number; nodes: RequisiteNode[] }
  | { type: "creditsAtLevel"; level: number; credits: number; subject?: string }
  | { type: "registrationIn"; moduleCode: string }
  | { type: "externalRequirement"; text: string; reason?: ExternalRequirementReason };

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

/**
 * MET:         satisfied by completed courses alone.
 * IN_PROGRESS: will be satisfied if the student passes what they're currently
 *              taking. For average requirements: currently at/above the
 *              threshold but the module isn't finished yet.
 * UNMET:       not satisfied even counting in-progress courses (or, for an
 *              average, currently below the threshold).
 */
export type RequirementStatus = "MET" | "IN_PROGRESS" | "UNMET";

export interface RequirementResult {
  id: string;
  label: string;
  /** Requirement DSL type (see packages/core/src/requirements/schema.ts), or a degree-level rule name. */
  type: string;
  status: RequirementStatus;
  creditsRequired: number;
  /** Completed credits counted toward this requirement, capped at creditsRequired. */
  creditsCompleted: number;
  /** In-progress credits counted toward the remainder, capped so completed + inProgress <= creditsRequired. */
  creditsInProgress: number;
  satisfiedBy: CourseRef[];
  inProgressBy: CourseRef[];
  /** Catalog courses not yet on the student's record that would count here. Only filled for UNMET requirements. */
  suggestedCourses: CourseRef[];
  notes: string[];
  /** Present on average requirements. `value` is null when there are no graded courses yet. */
  average?: { value: number | null; required: number; minMarkPerCourse?: number };
  /** Present on `count` (n-of-m) requirements. */
  children?: RequirementResult[];
  countRequired?: number;
}

export interface ModuleAuditResult {
  code: string;
  name: string;
  type: ModuleType;
  isPrimary: boolean;
  status: RequirementStatus;
  creditsRequired: number;
  creditsCompleted: number;
  creditsInProgress: number;
  requirements: RequirementResult[];
  notes: string[];
}

export interface AuditAdvisory {
  source: string; // module code or "degree"
  message: string;
}

export type AuditWarningType = "ANTIREQUISITE_CONFLICT" | "UNKNOWN_COURSE" | "FAILED_COURSE" | "REPEATED_COURSE";

export interface AuditWarning {
  type: AuditWarningType;
  message: string;
  courses: CourseRef[];
}

export interface DegreeAuditResult {
  studentId: string;
  generatedAt: string;
  engineVersion: string;
  degree: { code: string; name: string };
  status: RequirementStatus;
  /** Credits counting toward the degree (after first-year and per-subject caps). */
  creditsRequired: number;
  creditsCompleted: number;
  creditsInProgress: number;
  modules: ModuleAuditResult[];
  degreeRequirements: RequirementResult[];
  advisories: AuditAdvisory[];
  warnings: AuditWarning[];
  /** Degree rules present in the requirement data that v1 doesn't evaluate, with the reason. */
  notEvaluated: string[];
}
