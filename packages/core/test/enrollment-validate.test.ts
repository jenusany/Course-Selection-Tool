import { describe, expect, it } from "vitest";
import { buildCatalog, type CatalogCourse } from "../src/catalog.js";
import { validateEnrollmentIntent, type EnrollmentIntentItem } from "../src/enrollment/validate.js";
import type { SectionMeetingInfo } from "../src/validation/schedule.js";

const cs1027: CatalogCourse = {
  subject: "COMPSCI",
  number: "1027A/B",
  title: "Computer Science Fundamentals Ii",
  creditWeight: 0.5,
  level: 1000,
  breadth: "C",
  essay: false,
  prerequisiteTree: null,
  antirequisiteTree: null,
};

const cs1020: CatalogCourse = {
  subject: "COMPSCI",
  number: "1020A/B",
  title: "Foundations Of Computer Science",
  creditWeight: 0.5,
  level: 1000,
  breadth: "C",
  essay: false,
  prerequisiteTree: null,
  antirequisiteTree: null,
};

const cs2210: CatalogCourse = {
  subject: "COMPSCI",
  number: "2210A/B",
  title: "Data Structures And Algorithms",
  creditWeight: 0.5,
  level: 2000,
  breadth: "C",
  essay: false,
  prerequisiteTree: { type: "course", subject: "COMPSCI", number: "1027A/B" },
  antirequisiteTree: null,
};

const catalog = buildCatalog([cs1020, cs1027, cs2210]);
const completed = [{ course: { subject: "COMPSCI", number: "1027A/B" }, grade: 80 }];

function section(id: string, day: "MO" | "TU", capacity: number, enrolledCount: number): SectionMeetingInfo {
  return { id, meetingTimes: [{ day, start: "10:00", end: "11:00" }], capacity, enrolledCount };
}

describe("validateEnrollmentIntent", () => {
  it("chooses the preferred section when it's clean", () => {
    const items: EnrollmentIntentItem[] = [
      { courseId: "c1", course: cs2210, preferredSection: section("s1", "MO", 100, 10), fallbackSection: null },
    ];
    const result = validateEnrollmentIntent({ items, completed, inProgress: [], catalog, moduleCodes: [], hasUnresolvedHold: false });
    expect(result.items[0].chosen).toBe("preferred");
    expect(result.items[0].chosenSectionId).toBe("s1");
  });

  it("falls back to the fallback section when only the preferred section conflicts", () => {
    const items: EnrollmentIntentItem[] = [
      { courseId: "c1", course: cs1020, preferredSection: section("s1", "MO", 100, 0), fallbackSection: null },
      {
        courseId: "c2",
        course: cs2210,
        preferredSection: section("s2-conflict", "MO", 100, 0), // overlaps c1's section
        fallbackSection: section("s2-fallback", "TU", 100, 0), // no overlap
      },
    ];
    const result = validateEnrollmentIntent({ items, completed, inProgress: [], catalog, moduleCodes: [], hasUnresolvedHold: false });
    expect(result.items[1].chosen).toBe("fallback");
    expect(result.items[1].chosenSectionId).toBe("s2-fallback");
    expect(result.items[1].preferredConflicts.some((c) => c.type === "TIME_CONFLICT")).toBe(true);
  });

  it("chooses none when both preferred and fallback fail the same course-level check", () => {
    const items: EnrollmentIntentItem[] = [
      {
        courseId: "c1",
        course: cs2210,
        preferredSection: section("s1", "MO", 100, 0),
        fallbackSection: section("s2", "TU", 100, 0),
      },
    ];
    // No completed courses — cs2210's prerequisite (cs1027) isn't met, which
    // blocks both sections identically since it's a course-level check.
    const result = validateEnrollmentIntent({ items, completed: [], inProgress: [], catalog, moduleCodes: [], hasUnresolvedHold: false });
    expect(result.items[0].chosen).toBe("none");
    expect(result.items[0].preferredConflicts.some((c) => c.type === "PREREQUISITE_NOT_MET")).toBe(true);
    expect(result.items[0].fallbackConflicts?.some((c) => c.type === "PREREQUISITE_NOT_MET")).toBe(true);
  });

  it("catches a time conflict between two courses in the same intent", () => {
    const items: EnrollmentIntentItem[] = [
      { courseId: "c1", course: cs1020, preferredSection: section("s1", "MO", 100, 0), fallbackSection: null },
      { courseId: "c2", course: cs2210, preferredSection: section("s2", "MO", 100, 0), fallbackSection: null },
    ];
    const result = validateEnrollmentIntent({ items, completed, inProgress: [], catalog, moduleCodes: [], hasUnresolvedHold: false });
    expect(result.items[0].chosen).toBe("preferred");
    // cs2210's prereq (cs1027) is satisfied via `completed`, but its section overlaps c1's (both MO 10-11).
    expect(result.items[1].chosen).toBe("none");
    expect(result.items[1].preferredConflicts.some((c) => c.type === "TIME_CONFLICT")).toBe(true);
  });

  it("surfaces blockedByHold independently of per-item validity", () => {
    const items: EnrollmentIntentItem[] = [
      { courseId: "c1", course: cs1027, preferredSection: section("s1", "MO", 100, 0), fallbackSection: null },
    ];
    const result = validateEnrollmentIntent({ items, completed: [], inProgress: [], catalog, moduleCodes: [], hasUnresolvedHold: true });
    expect(result.blockedByHold).toBe(true);
    expect(result.items[0].chosen).toBe("preferred");
  });
});
