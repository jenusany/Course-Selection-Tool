import type { Course, CourseRef } from "./types/domain.js";

/** The subset of a catalog `Course` that the audit engine and requisite evaluator need. */
export type CatalogCourse = Pick<
  Course,
  "subject" | "number" | "title" | "creditWeight" | "level" | "breadth" | "essay"
> &
  Partial<Pick<Course, "subjectName" | "prerequisiteTree" | "antirequisiteTree">>;

export type Catalog = ReadonlyMap<string, CatalogCourse>;

/** Map key for a course — "SUBJECT NUMBER", matching how the calendar prints it. Not a user-facing format. */
export function courseKey(ref: CourseRef): string {
  return `${ref.subject} ${ref.number}`;
}

export function buildCatalog(courses: Iterable<CatalogCourse>): Catalog {
  const map = new Map<string, CatalogCourse>();
  for (const c of courses) map.set(courseKey(c), c);
  return map;
}

/**
 * The four-digit course number as a number. Level comparisons use this rather
 * than the catalog's `level` bucket, so "the 2200 level or above" can exclude
 * 2100–2199 the way the calendar means it.
 */
export function courseNumberValue(c: { number: string; level: number }): number {
  const m = /^(\d{4})/.exec(c.number);
  return m ? Number(m[1]) : c.level;
}

export function toCourseRef(ref: CourseRef): CourseRef {
  return { subject: ref.subject, number: ref.number };
}
