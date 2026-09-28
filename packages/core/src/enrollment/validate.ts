import { courseKey, type Catalog, type CatalogCourse } from "../catalog.js";
import type { CourseRef } from "../types/domain.js";
import {
  hasBlockingConflict,
  validateScheduleAddition,
  type ExistingScheduleEntry,
  type ScheduleConflict,
  type SectionMeetingInfo,
} from "../validation/schedule.js";

export interface EnrollmentIntentItem {
  courseId: string;
  course: CatalogCourse;
  preferredSection: SectionMeetingInfo | null;
  fallbackSection: SectionMeetingInfo | null;
}

export type ChosenSection = "preferred" | "fallback" | "none";

export interface ItemValidationResult {
  courseId: string;
  course: CourseRef;
  chosen: ChosenSection;
  /** Which section id was chosen, or null if neither preferred nor fallback is committable. */
  chosenSectionId: string | null;
  preferredConflicts: ScheduleConflict[];
  fallbackConflicts: ScheduleConflict[] | null;
}

export interface ValidateEnrollmentIntentInput {
  items: readonly EnrollmentIntentItem[];
  completed: readonly { course: CourseRef; grade: number }[];
  inProgress: readonly CourseRef[];
  catalog: Catalog;
  moduleCodes: readonly string[];
  /** Any unresolved hold blocks the whole intent, regardless of per-course validity. */
  hasUnresolvedHold: boolean;
}

export interface EnrollmentIntentValidation {
  blockedByHold: boolean;
  items: ItemValidationResult[];
}

/**
 * Validates every item in an enrollment intent, in order, building up the
 * "what's already committed" list as it goes — so two courses in the *same*
 * intent whose sections overlap are caught too, not just conflicts against
 * the student's existing record. For each item: try the preferred section
 * first, fall back to the fallback section if the preferred one has a
 * blocking conflict (most commonly SECTION_FULL), otherwise "none" (the
 * commit worker will record this as a failed attempt).
 */
export function validateEnrollmentIntent(input: ValidateEnrollmentIntentInput): EnrollmentIntentValidation {
  const { items, completed, inProgress, catalog, moduleCodes, hasUnresolvedHold } = input;
  const existing: ExistingScheduleEntry[] = [];
  const results: ItemValidationResult[] = [];

  for (const item of items) {
    const ref: CourseRef = { subject: item.course.subject, number: item.course.number };
    const preferredConflicts = item.preferredSection
      ? validateScheduleAddition({
          candidateCourse: item.course,
          candidateSection: item.preferredSection,
          existingItems: existing,
          completed,
          inProgress,
          catalog,
          moduleCodes,
        })
      : [{ type: "SECTION_FULL" as const, severity: "block" as const, message: `No preferred section chosen for ${courseKey(ref)}.`, courses: [ref] }];

    let chosen: ChosenSection = "none";
    let chosenSection: SectionMeetingInfo | null = null;
    let fallbackConflicts: ScheduleConflict[] | null = null;

    if (!hasBlockingConflict(preferredConflicts)) {
      chosen = "preferred";
      chosenSection = item.preferredSection;
    } else if (item.fallbackSection) {
      fallbackConflicts = validateScheduleAddition({
        candidateCourse: item.course,
        candidateSection: item.fallbackSection,
        existingItems: existing,
        completed,
        inProgress,
        catalog,
        moduleCodes,
      });
      if (!hasBlockingConflict(fallbackConflicts)) {
        chosen = "fallback";
        chosenSection = item.fallbackSection;
      }
    }

    if (chosen !== "none" && chosenSection) {
      existing.push({ course: ref, creditWeight: item.course.creditWeight, section: chosenSection });
    }

    results.push({
      courseId: item.courseId,
      course: ref,
      chosen,
      chosenSectionId: chosenSection?.id ?? null,
      preferredConflicts,
      fallbackConflicts,
    });
  }

  return { blockedByHold: hasUnresolvedHold, items: results };
}
