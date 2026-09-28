import { describe, expect, it } from "vitest";
import { buildCatalog, type CatalogCourse } from "../src/catalog.js";
import {
  DEFAULT_MAX_CREDITS_PER_TERM,
  hasBlockingConflict,
  meetingsOverlap,
  sectionsOverlap,
  validateScheduleAddition,
  type ExistingScheduleEntry,
} from "../src/validation/schedule.js";

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

const cs4490: CatalogCourse = {
  subject: "COMPSCI",
  number: "4490Z",
  title: "Thesis",
  creditWeight: 0.5,
  level: 4000,
  breadth: "C",
  essay: false,
  prerequisiteTree: null,
  antirequisiteTree: { type: "course", subject: "COMPSCI", number: "3380F/G/Z" },
};

const catalog = buildCatalog([cs2210, cs1027, cs4490]);

const noCourse = { catalog, moduleCodes: [] as string[] };

describe("meetingsOverlap / sectionsOverlap", () => {
  it("flags same-day overlapping ranges", () => {
    expect(meetingsOverlap({ day: "MO", start: "10:00", end: "11:00" }, { day: "MO", start: "10:30", end: "11:30" })).toBe(true);
  });
  it("does not flag adjacent (touching) ranges", () => {
    expect(meetingsOverlap({ day: "MO", start: "10:00", end: "11:00" }, { day: "MO", start: "11:00", end: "12:00" })).toBe(false);
  });
  it("does not flag different days", () => {
    expect(meetingsOverlap({ day: "MO", start: "10:00", end: "11:00" }, { day: "TU", start: "10:00", end: "11:00" })).toBe(false);
  });
  it("sectionsOverlap checks all pairs", () => {
    const a = [{ day: "MO" as const, start: "09:00", end: "10:00" }];
    const b = [
      { day: "TU" as const, start: "09:00", end: "10:00" },
      { day: "MO" as const, start: "09:30", end: "10:30" },
    ];
    expect(sectionsOverlap(a, b)).toBe(true);
  });
});

describe("validateScheduleAddition", () => {
  it("blocks a duplicate course already in the schedule", () => {
    const existing: ExistingScheduleEntry[] = [{ course: { subject: "COMPSCI", number: "2210A/B" }, creditWeight: 0.5, section: null }];
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs2210,
      candidateSection: null,
      existingItems: existing,
      completed: [],
      inProgress: [],
    });
    expect(conflicts.some((c) => c.type === "DUPLICATE_IN_SCHEDULE" && c.severity === "block")).toBe(true);
  });

  it("blocks a course already completed", () => {
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs2210,
      candidateSection: null,
      existingItems: [],
      completed: [{ course: { subject: "COMPSCI", number: "2210A/B" }, grade: 80 }],
      inProgress: [],
    });
    expect(conflicts.some((c) => c.type === "ALREADY_COMPLETED")).toBe(true);
  });

  it("blocks a time conflict against an existing section", () => {
    const existing: ExistingScheduleEntry[] = [
      {
        course: { subject: "COMPSCI", number: "1027A/B" },
        creditWeight: 0.5,
        section: { id: "s1", meetingTimes: [{ day: "MO", start: "10:00", end: "11:00" }], capacity: 100, enrolledCount: 10 },
      },
    ];
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs2210,
      candidateSection: { id: "s2", meetingTimes: [{ day: "MO", start: "10:30", end: "11:30" }], capacity: 100, enrolledCount: 10 },
      existingItems: existing,
      completed: [{ course: { subject: "COMPSCI", number: "1027A/B" }, grade: 75 }],
      inProgress: [],
    });
    expect(conflicts.some((c) => c.type === "TIME_CONFLICT")).toBe(true);
  });

  it("blocks when prerequisites aren't met", () => {
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs2210,
      candidateSection: null,
      existingItems: [],
      completed: [],
      inProgress: [],
    });
    expect(conflicts.some((c) => c.type === "PREREQUISITE_NOT_MET")).toBe(true);
    expect(hasBlockingConflict(conflicts)).toBe(true);
  });

  it("passes prerequisites once the required course is completed", () => {
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs2210,
      candidateSection: null,
      existingItems: [],
      completed: [{ course: { subject: "COMPSCI", number: "1027A/B" }, grade: 75 }],
      inProgress: [],
    });
    expect(conflicts.some((c) => c.type === "PREREQUISITE_NOT_MET")).toBe(false);
  });

  it("blocks an antirequisite conflict and names the conflicting course", () => {
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs4490,
      candidateSection: null,
      existingItems: [],
      completed: [{ course: { subject: "COMPSCI", number: "3380F/G/Z" }, grade: 68 }],
      inProgress: [],
    });
    const conflict = conflicts.find((c) => c.type === "ANTIREQUISITE_CONFLICT");
    expect(conflict).toBeTruthy();
    expect(conflict?.message).toContain("COMPSCI 3380F/G/Z");
  });

  it("warns (does not block) when projected credits exceed the default term load", () => {
    const existing: ExistingScheduleEntry[] = Array.from({ length: 6 }, (_, i) => ({
      course: { subject: "COMPSCI", number: `100${i}A/B` },
      creditWeight: 0.5,
      section: null,
    }));
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs1027,
      candidateSection: null,
      existingItems: existing,
      completed: [],
      inProgress: [],
    });
    const warning = conflicts.find((c) => c.type === "CREDIT_LOAD_WARNING");
    expect(warning?.severity).toBe("warning");
    expect(hasBlockingConflict(conflicts)).toBe(false);
    expect(DEFAULT_MAX_CREDITS_PER_TERM).toBeGreaterThan(0);
  });

  it("flags a full section as a warning, not a block", () => {
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs1027,
      candidateSection: { id: "s1", meetingTimes: [], capacity: 30, enrolledCount: 30 },
      existingItems: [],
      completed: [],
      inProgress: [],
    });
    const full = conflicts.find((c) => c.type === "SECTION_FULL");
    expect(full?.severity).toBe("warning");
  });

  it("returns no conflicts for a clean addition", () => {
    const conflicts = validateScheduleAddition({
      ...noCourse,
      candidateCourse: cs1027,
      candidateSection: { id: "s1", meetingTimes: [{ day: "TU", start: "09:00", end: "10:00" }], capacity: 100, enrolledCount: 5 },
      existingItems: [],
      completed: [],
      inProgress: [],
    });
    expect(conflicts).toHaveLength(0);
  });
});
