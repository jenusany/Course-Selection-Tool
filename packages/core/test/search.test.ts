import { describe, expect, it } from "vitest";
import type { CatalogCourse } from "../src/catalog.js";
import { computeRequirementBadges, matchesCourseFilters } from "../src/search.js";
import type { DegreeAuditResult } from "../src/types/domain.js";

const cs2214: CatalogCourse = {
  subject: "COMPSCI",
  number: "2214A/B",
  title: "Discrete Structures For Computing",
  creditWeight: 0.5,
  level: 2000,
  breadth: "C",
  essay: false,
};

describe("matchesCourseFilters", () => {
  it("matches on free-text query across subject/number/title", () => {
    expect(matchesCourseFilters(cs2214, { query: "discrete" })).toBe(true);
    expect(matchesCourseFilters(cs2214, { query: "2214" })).toBe(true);
    expect(matchesCourseFilters(cs2214, { query: "biology" })).toBe(false);
  });
  it("matches on subject/level/breadth/essay", () => {
    expect(matchesCourseFilters(cs2214, { subject: "COMPSCI" })).toBe(true);
    expect(matchesCourseFilters(cs2214, { subject: "BIOLOGY" })).toBe(false);
    expect(matchesCourseFilters(cs2214, { level: 2000 })).toBe(true);
    expect(matchesCourseFilters(cs2214, { level: 3000 })).toBe(false);
    expect(matchesCourseFilters(cs2214, { breadth: "C" })).toBe(true);
    expect(matchesCourseFilters(cs2214, { essayOnly: true })).toBe(false);
  });
});

function minimalAudit(overrides: Partial<DegreeAuditResult>): DegreeAuditResult {
  return {
    studentId: "s1",
    generatedAt: new Date().toISOString(),
    engineVersion: "test",
    degree: { code: "d", name: "D" },
    status: "IN_PROGRESS",
    creditsRequired: 20,
    creditsCompleted: 0,
    creditsInProgress: 0,
    modules: [],
    degreeRequirements: [],
    advisories: [],
    warnings: [],
    notEvaluated: [],
    ...overrides,
  };
}

describe("computeRequirementBadges", () => {
  it("badges a course suggested by an unmet module requirement", () => {
    const audit = minimalAudit({
      modules: [
        {
          code: "hsp-computer-science",
          name: "Honours Specialization in Computer Science",
          type: "HONOURS_SPECIALIZATION",
          isPrimary: true,
          status: "IN_PROGRESS",
          creditsRequired: 9,
          creditsCompleted: 0,
          creditsInProgress: 0,
          notes: [],
          requirements: [
            {
              id: "discrete-choice",
              label: "One of: COMPSCI 2214A/B, MATH 2155F/G",
              type: "oneOf",
              status: "UNMET",
              creditsRequired: 0.5,
              creditsCompleted: 0,
              creditsInProgress: 0,
              satisfiedBy: [],
              inProgressBy: [],
              suggestedCourses: [{ subject: "COMPSCI", number: "2214A/B" }],
              notes: [],
            },
          ],
        },
      ],
    });
    const badges = computeRequirementBadges({ subject: "COMPSCI", number: "2214A/B" }, audit);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toEqual({
      label: "One of: COMPSCI 2214A/B, MATH 2155F/G",
      source: "Honours Specialization in Computer Science",
    });
  });

  it("does not badge a MET requirement even if the course is in suggestedCourses", () => {
    const audit = minimalAudit({
      degreeRequirements: [
        {
          id: "breadth-b",
          label: "Category B breadth",
          type: "creditsFromList",
          status: "MET",
          creditsRequired: 1,
          creditsCompleted: 1,
          creditsInProgress: 0,
          satisfiedBy: [{ subject: "WRITING", number: "2101F/G" }],
          inProgressBy: [],
          suggestedCourses: [{ subject: "COMPSCI", number: "2214A/B" }],
          notes: [],
        },
      ],
    });
    expect(computeRequirementBadges({ subject: "COMPSCI", number: "2214A/B" }, audit)).toHaveLength(0);
  });

  it("finds badges nested under a count (n-of-m) requirement's children", () => {
    const audit = minimalAudit({
      degreeRequirements: [
        {
          id: "combo",
          label: "2 of 3",
          type: "count",
          status: "UNMET",
          creditsRequired: 0,
          creditsCompleted: 0,
          creditsInProgress: 0,
          satisfiedBy: [],
          inProgressBy: [],
          suggestedCourses: [],
          notes: [],
          countRequired: 2,
          children: [
            {
              id: "child-1",
              label: "Child requirement",
              type: "specificCourse",
              status: "UNMET",
              creditsRequired: 0.5,
              creditsCompleted: 0,
              creditsInProgress: 0,
              satisfiedBy: [],
              inProgressBy: [],
              suggestedCourses: [{ subject: "COMPSCI", number: "2214A/B" }],
              notes: [],
            },
          ],
        },
      ],
    });
    expect(computeRequirementBadges({ subject: "COMPSCI", number: "2214A/B" }, audit)).toHaveLength(1);
  });
});
