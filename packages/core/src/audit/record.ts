import { courseKey, toCourseRef, type Catalog, type CatalogCourse } from "../catalog.js";
import type {
  AuditWarning,
  BreadthCategory,
  CompletedCourse,
  CourseRef,
  InProgressCourse,
  RequisiteNode,
} from "../types/domain.js";

/** One credit-bearing course on the record, joined with its catalog attributes. */
export interface AuditCourse {
  key: string;
  ref: CourseRef;
  subject: string;
  number: string;
  creditWeight: number;
  level: number;
  breadth: BreadthCategory | null;
  essay: boolean;
  status: "COMPLETED" | "IN_PROGRESS";
  grade: number | null;
  antirequisiteTree: RequisiteNode | null;
}

export interface GradedAttempt {
  key: string;
  ref: CourseRef;
  creditWeight: number;
  grade: number;
}

export interface AuditRecord {
  /** Passed completed courses (best attempt only), then in-progress courses not already passed. Sorted, deterministic. */
  courses: AuditCourse[];
  /** Every graded completed attempt including failures and repeats — the cumulative average's input. */
  gradedAttempts: GradedAttempt[];
  warnings: AuditWarning[];
}

function toAuditCourse(entry: CatalogCourse, status: AuditCourse["status"], grade: number | null): AuditCourse {
  return {
    key: courseKey(entry),
    ref: toCourseRef(entry),
    subject: entry.subject,
    number: entry.number,
    creditWeight: entry.creditWeight,
    level: entry.level,
    breadth: entry.breadth,
    essay: entry.essay,
    status,
    grade,
    antirequisiteTree: entry.antirequisiteTree ?? null,
  };
}

const byKey = (a: AuditCourse, b: AuditCourse) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * Joins the raw record against the catalog and applies the calendar's
 * credit rules: a course below `passMark` earns no credit, and a repeated
 * course only earns credit once (best grade kept).
 */
export function normalizeRecord(
  completed: readonly CompletedCourse[],
  inProgress: readonly InProgressCourse[],
  catalog: Catalog,
  passMark: number,
): AuditRecord {
  const warnings: AuditWarning[] = [];
  const gradedAttempts: GradedAttempt[] = [];
  const unknown = new Map<string, CourseRef>();
  const best = new Map<string, { entry: CatalogCourse; grade: number }>();
  const passes = new Map<string, number>();
  const failed = new Map<string, CatalogCourse>();

  for (const c of completed) {
    const key = courseKey(c.course);
    const entry = catalog.get(key);
    if (!entry) {
      unknown.set(key, toCourseRef(c.course));
      continue;
    }
    gradedAttempts.push({ key, ref: toCourseRef(entry), creditWeight: entry.creditWeight, grade: c.grade });
    if (c.grade < passMark) {
      failed.set(key, entry);
      continue;
    }
    passes.set(key, (passes.get(key) ?? 0) + 1);
    const prev = best.get(key);
    if (!prev || c.grade > prev.grade) best.set(key, { entry, grade: c.grade });
  }

  for (const [key, entry] of failed) {
    if (best.has(key)) continue;
    warnings.push({
      type: "FAILED_COURSE",
      message: `${key}: mark below ${passMark}% — no credit earned. It still counts in the cumulative average.`,
      courses: [toCourseRef(entry)],
    });
  }
  for (const [key, n] of passes) {
    if (n > 1) {
      warnings.push({
        type: "REPEATED_COURSE",
        message: `${key} was passed ${n} times — credit counts once, using the best mark.`,
        courses: [toCourseRef(best.get(key)!.entry)],
      });
    }
  }

  const courses: AuditCourse[] = [...best.values()].map(({ entry, grade }) => toAuditCourse(entry, "COMPLETED", grade));
  courses.sort(byKey);

  const ipCourses: AuditCourse[] = [];
  const seenIp = new Set<string>();
  for (const c of inProgress) {
    const key = courseKey(c.course);
    const entry = catalog.get(key);
    if (!entry) {
      unknown.set(key, toCourseRef(c.course));
      continue;
    }
    if (best.has(key)) {
      warnings.push({
        type: "REPEATED_COURSE",
        message: `${key} is in progress but already passed — the repeat won't add credit.`,
        courses: [toCourseRef(entry)],
      });
      continue;
    }
    if (seenIp.has(key)) continue;
    seenIp.add(key);
    ipCourses.push(toAuditCourse(entry, "IN_PROGRESS", null));
  }
  ipCourses.sort(byKey);

  for (const ref of unknown.values()) {
    warnings.push({
      type: "UNKNOWN_COURSE",
      message: `${courseKey(ref)} is on the record but not in the course catalog — it isn't counted anywhere in this audit.`,
      courses: [ref],
    });
  }

  return { courses: [...courses, ...ipCourses], gradedAttempts, warnings };
}
