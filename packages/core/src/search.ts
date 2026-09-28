import { courseKey, type CatalogCourse } from "./catalog.js";
import type { BreadthCategory, CourseRef, DegreeAuditResult, RequirementResult } from "./types/domain.js";

export interface RequirementBadge {
  /** The requirement's own label, e.g. "One of: COMPSCI 2214A/B, MATH 2155F/G". */
  label: string;
  /** Module name, or "Degree" for a degree-level requirement. */
  source: string;
}

/**
 * Walks every UNMET requirement (module and degree-level) looking for one
 * whose `suggestedCourses` includes this course — i.e. "adding this course
 * would help satisfy that still-outstanding requirement". `suggestedCourses`
 * is only populated for UNMET requirements (see RequirementResult), so a
 * requirement that's already MET or merely IN_PROGRESS never contributes a
 * badge here, even if this course happens to count toward it.
 */
export function computeRequirementBadges(ref: CourseRef, audit: DegreeAuditResult): RequirementBadge[] {
  const key = courseKey(ref);
  const badges: RequirementBadge[] = [];

  const visit = (r: RequirementResult, source: string) => {
    if (r.status === "UNMET" && r.suggestedCourses.some((c) => courseKey(c) === key)) {
      badges.push({ label: r.label, source });
    }
    r.children?.forEach((c) => visit(c, source));
  };

  for (const m of audit.modules) for (const r of m.requirements) visit(r, m.name);
  for (const r of audit.degreeRequirements) visit(r, "Degree");

  return badges;
}

export interface CourseSearchFilters {
  query?: string;
  subject?: string;
  level?: number;
  breadth?: BreadthCategory;
  essayOnly?: boolean;
}

/** Filters that only need the catalog row itself — no student record or term data. */
export function matchesCourseFilters(course: CatalogCourse, filters: CourseSearchFilters): boolean {
  if (filters.query) {
    const q = filters.query.trim().toLowerCase();
    const haystack = `${course.subject} ${course.number} ${course.title}`.toLowerCase();
    if (q && !haystack.includes(q)) return false;
  }
  if (filters.subject && course.subject !== filters.subject) return false;
  if (filters.level !== undefined && course.level !== filters.level) return false;
  if (filters.breadth && course.breadth !== filters.breadth) return false;
  if (filters.essayOnly && !course.essay) return false;
  return true;
}
