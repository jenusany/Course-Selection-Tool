import { courseKey, type Catalog, type CatalogCourse } from "../catalog.js";
import { collectCourseRefs, evaluateRequisite, type RequisiteContext } from "../prereq/evaluate.js";
import type { CourseRef, MeetingTime } from "../types/domain.js";

/**
 * A soft per-term credit ceiling above which a normal student would need
 * Dean's permission to add more. Western's scraped degree rules only state
 * the *annual* minimum (see requirements/degrees), not a per-term maximum —
 * this figure is a reasonable planning default (roughly a 5-course term),
 * not a scraped calendar number. Flagged in DATA_TODO.md.
 */
export const DEFAULT_MAX_CREDITS_PER_TERM = 3.0;

export type ScheduleConflictType =
  | "DUPLICATE_IN_SCHEDULE"
  | "ALREADY_COMPLETED"
  | "TIME_CONFLICT"
  | "PREREQUISITE_NOT_MET"
  | "PREREQUISITE_UNKNOWN"
  | "ANTIREQUISITE_CONFLICT"
  | "SECTION_FULL"
  | "CREDIT_LOAD_WARNING";

export interface ScheduleConflict {
  type: ScheduleConflictType;
  /** "block" prevents adding; "warning" is shown but doesn't block. */
  severity: "block" | "warning";
  message: string;
  courses: CourseRef[];
}

export interface SectionMeetingInfo {
  id: string;
  meetingTimes: MeetingTime[];
  capacity: number;
  enrolledCount: number;
}

export interface ExistingScheduleEntry {
  course: CourseRef;
  creditWeight: number;
  section: SectionMeetingInfo | null;
}

export interface ValidateAdditionInput {
  candidateCourse: CatalogCourse;
  candidateSection: SectionMeetingInfo | null;
  existingItems: readonly ExistingScheduleEntry[];
  completed: readonly { course: CourseRef; grade: number }[];
  inProgress: readonly CourseRef[];
  catalog: Catalog;
  moduleCodes: readonly string[];
  maxCreditsPerTerm?: number;
}

const DAY_ORDER: Record<MeetingTime["day"], number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4 };
const DAY_LABEL: Record<MeetingTime["day"], string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri" };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Two meetings overlap if they're the same day and their time ranges intersect. */
export function meetingsOverlap(a: MeetingTime, b: MeetingTime): boolean {
  if (a.day !== b.day) return false;
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

export function sectionsOverlap(a: readonly MeetingTime[], b: readonly MeetingTime[]): boolean {
  return a.some((x) => b.some((y) => meetingsOverlap(x, y)));
}

export function describeMeetingTime(m: MeetingTime): string {
  return `${DAY_LABEL[m.day]} ${m.start}–${m.end}`;
}

function sortedByDay(times: readonly MeetingTime[]): MeetingTime[] {
  return [...times].sort((x, y) => DAY_ORDER[x.day] - DAY_ORDER[y.day] || x.start.localeCompare(y.start));
}

/**
 * Checks whether adding `candidateCourse`/`candidateSection` to a draft
 * schedule is safe, given what else is already in it and the student's
 * record. Pure and framework-independent — the caller supplies everything
 * (no DB access here). Order of returned conflicts is not significant; the
 * caller decides how to group/display `severity`.
 */
export function validateScheduleAddition(input: ValidateAdditionInput): ScheduleConflict[] {
  const {
    candidateCourse,
    candidateSection,
    existingItems,
    completed,
    inProgress,
    catalog,
    moduleCodes,
    maxCreditsPerTerm = DEFAULT_MAX_CREDITS_PER_TERM,
  } = input;
  const conflicts: ScheduleConflict[] = [];
  const candidateRef: CourseRef = { subject: candidateCourse.subject, number: candidateCourse.number };
  const candidateKey = courseKey(candidateRef);

  if (existingItems.some((e) => courseKey(e.course) === candidateKey)) {
    conflicts.push({
      type: "DUPLICATE_IN_SCHEDULE",
      severity: "block",
      message: `${candidateKey} is already in this schedule.`,
      courses: [candidateRef],
    });
  }

  const completedMatch = completed.find((c) => courseKey(c.course) === candidateKey);
  if (completedMatch) {
    conflicts.push({
      type: "ALREADY_COMPLETED",
      severity: "block",
      message: `You've already completed ${candidateKey} (grade ${completedMatch.grade}%).`,
      courses: [candidateRef],
    });
  }

  if (candidateSection) {
    for (const existing of existingItems) {
      if (!existing.section) continue;
      if (sectionsOverlap(candidateSection.meetingTimes, existing.section.meetingTimes)) {
        const overlapping = sortedByDay(candidateSection.meetingTimes).find((m) =>
          existing.section!.meetingTimes.some((n) => meetingsOverlap(m, n)),
        );
        conflicts.push({
          type: "TIME_CONFLICT",
          severity: "block",
          message: `Time conflict with ${courseKey(existing.course)}${overlapping ? ` (${describeMeetingTime(overlapping)})` : ""}.`,
          courses: [candidateRef, existing.course],
        });
      }
    }

    if (candidateSection.enrolledCount >= candidateSection.capacity) {
      conflicts.push({
        type: "SECTION_FULL",
        severity: "warning",
        message: `This section is full (${candidateSection.enrolledCount}/${candidateSection.capacity}) — you may need a fallback section.`,
        courses: [candidateRef],
      });
    }
  }

  const reqCtx: RequisiteContext = { catalog, completed, inProgress, moduleCodes };

  if (candidateCourse.prerequisiteTree) {
    const outcome = evaluateRequisite(candidateCourse.prerequisiteTree, reqCtx);
    if (outcome === "NOT_SATISFIED") {
      conflicts.push({
        type: "PREREQUISITE_NOT_MET",
        severity: "block",
        message: `Prerequisites for ${candidateKey} aren't met yet.`,
        courses: [candidateRef],
      });
    } else if (outcome === "UNKNOWN") {
      conflicts.push({
        type: "PREREQUISITE_UNKNOWN",
        severity: "warning",
        message: `${candidateKey}'s prerequisites include something we can't verify automatically (e.g. departmental permission or a high-school course) — confirm with an academic advisor.`,
        courses: [candidateRef],
      });
    }
  }

  if (candidateCourse.antirequisiteTree) {
    const outcome = evaluateRequisite(candidateCourse.antirequisiteTree, reqCtx);
    if (outcome === "SATISFIED") {
      const conflictingRefs = collectCourseRefs(candidateCourse.antirequisiteTree).filter((ref) => {
        const k = courseKey(ref);
        return completed.some((c) => courseKey(c.course) === k) || inProgress.some((r) => courseKey(r) === k);
      });
      conflicts.push({
        type: "ANTIREQUISITE_CONFLICT",
        severity: "block",
        message: `${candidateKey} can't be taken with ${conflictingRefs.map(courseKey).join(", ") || "a course you already have credit for"} — they're antirequisites of each other.`,
        courses: [candidateRef, ...conflictingRefs],
      });
    } else if (outcome === "UNKNOWN") {
      conflicts.push({
        type: "PREREQUISITE_UNKNOWN",
        severity: "warning",
        message: `${candidateKey}'s antirequisites include something we can't verify automatically — confirm with an academic advisor.`,
        courses: [candidateRef],
      });
    }
  }

  const currentCredits = existingItems.reduce((sum, e) => sum + e.creditWeight, 0);
  const projected = currentCredits + candidateCourse.creditWeight;
  if (projected > maxCreditsPerTerm) {
    conflicts.push({
      type: "CREDIT_LOAD_WARNING",
      severity: "warning",
      message: `Adding ${candidateKey} brings this term to ${projected.toFixed(1)} credits, above the typical ${maxCreditsPerTerm.toFixed(1)}-credit course load — you may need Dean's permission for an overload.`,
      courses: [candidateRef],
    });
  }

  return conflicts;
}

export function hasBlockingConflict(conflicts: readonly ScheduleConflict[]): boolean {
  return conflicts.some((c) => c.severity === "block");
}
