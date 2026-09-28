import { describe, expect, it } from "vitest";
import {
  checkModuleAgainstCatalog,
  parseDegreeDefinition,
  parseModuleDefinition,
  RequirementsValidationError,
} from "../src/index.js";
import { catalog, loadYaml, moduleFiles, modules } from "./fixtures.js";

const minimalModule = (requirements: unknown[]) => ({
  code: "test-module",
  name: "Test Module",
  type: "MAJOR",
  faculty: "Faculty of Science",
  department: "Test",
  module: { totalCredits: 1.0, requirements },
});

function expectInvalid(raw: unknown, message: RegExp) {
  expect(() => parseModuleDefinition(raw, "test.yaml")).toThrowError(RequirementsValidationError);
  expect(() => parseModuleDefinition(raw, "test.yaml")).toThrowError(message);
}

describe("requirement YAML files", () => {
  it("every module file under requirements/modules parses", () => {
    expect(moduleFiles.length).toBeGreaterThanOrEqual(4);
    expect([...modules.keys()].sort()).toEqual([
      "hsp-biology",
      "hsp-computer-science",
      "major-computer-science",
      "major-mathematics",
    ]);
  });

  it("each module file is named after its code (the seed's requirementsRef relies on this)", () => {
    for (const f of moduleFiles) expect(modules.has(f.replace(/\.yaml$/, ""))).toBe(true);
  });

  it("the honours BSc degree file parses", () => {
    const d = parseDegreeDefinition(loadYaml("requirements/degrees/honours-bachelor-of-science.yaml"));
    expect(d.totalCredits).toBe(20);
    expect(d.grading.honoursModuleExceptionalAverage).toBe(68);
  });

  it("every exact course a module names is in the seeded catalog, and allOf credit totals match catalog weights", () => {
    const problems = [...modules.values()].flatMap((m) => checkModuleAgainstCatalog(m, catalog));
    expect(problems).toEqual([]);
  });
});

describe("requirement schema validation", () => {
  it("accepts every requirement type", () => {
    const def = parseModuleDefinition(
      minimalModule([
        { id: "a", type: "specificCourse", course: { subject: "CS", number: "1000A/B" } },
        { id: "b", type: "allOf", courses: [{ subject: "CS", number: "1000A/B" }] },
        { id: "c", type: "oneOf", courses: [{ subject: "CS", number: "1000A/B", minMark: 85 }] },
        { id: "d", type: "creditsFromList", credits: 1.0, list: [{ subject: "CS", minLevel: 3000 }, { essay: true }] },
        { id: "e", type: "creditsAtLevel", credits: 1.0, level: 2000, subject: null },
        { id: "f", type: "totalCredits", credits: 20, maxCreditsBelowLevel: { level: 2000, credits: 7 } },
        { id: "g", type: "moduleAverage", minAverage: 70, minMarkPerCourse: 60 },
        { id: "h", type: "cumulativeAverage", minAverage: 65 },
        {
          id: "i",
          type: "count",
          n: 1,
          of: [{ id: "i1", type: "specificCourse", course: { subject: "CS", number: "2000A/B" } }],
        },
      ]),
    );
    expect(def.module.requirements.map((r) => r.type)).toEqual([
      "specificCourse",
      "allOf",
      "oneOf",
      "creditsFromList",
      "creditsAtLevel",
      "totalCredits",
      "moduleAverage",
      "cumulativeAverage",
      "count",
    ]);
  });

  it("rejects an unknown requirement type", () => {
    expectInvalid(minimalModule([{ id: "a", type: "anyThreeCourses" }]), /type/);
  });

  it("rejects unknown keys (typos shouldn't be silently ignored)", () => {
    expectInvalid(
      minimalModule([{ id: "a", type: "specificCourse", course: { subject: "CS", number: "1000A/B" }, minmark: 60 }]),
      /minmark/,
    );
  });

  it("rejects duplicate requirement ids, including inside a count", () => {
    expectInvalid(
      minimalModule([
        { id: "a", type: "specificCourse", course: { subject: "CS", number: "1000A/B" } },
        { id: "n", type: "count", n: 1, of: [{ id: "a", type: "specificCourse", course: { subject: "CS", number: "2000A/B" } }] },
      ]),
      /duplicate requirement id "a"/,
    );
  });

  it("rejects allowSharedWith pointing at a requirement that doesn't exist", () => {
    expectInvalid(
      minimalModule([
        { id: "a", type: "specificCourse", course: { subject: "CS", number: "1000A/B" }, allowSharedWith: ["nope"] },
      ]),
      /unknown requirement "nope"/,
    );
  });

  it("rejects a count whose n exceeds its children", () => {
    expectInvalid(
      minimalModule([
        { id: "n", type: "count", n: 2, of: [{ id: "x", type: "specificCourse", course: { subject: "CS", number: "1000A/B" } }] },
      ]),
      /n \(2\) exceeds/,
    );
  });

  it("rejects a matcher that pins a number without a subject", () => {
    expectInvalid(minimalModule([{ id: "a", type: "creditsFromList", credits: 0.5, list: [{ number: "1000A/B" }] }]), /subject/);
  });

  it("rejects credits that aren't a multiple of 0.5", () => {
    expectInvalid(minimalModule([{ id: "a", type: "creditsAtLevel", credits: 0.75, level: 2000 }]), /credits/);
  });

  it("reports the file name and path of each problem", () => {
    try {
      parseModuleDefinition(minimalModule([{ id: "a", type: "creditsAtLevel", credits: -1, level: 2000 }]), "bad.yaml");
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/Invalid requirements file bad\.yaml/);
      expect((e as Error).message).toMatch(/module\.requirements\.0\.credits/);
    }
  });

  it("flags catalog mismatches that the schema can't see", () => {
    const def = parseModuleDefinition(
      minimalModule([
        { id: "a", type: "allOf", credits: 1.5, courses: [{ subject: "COMPSCI", number: "2208A/B" }] },
        { id: "b", type: "specificCourse", course: { subject: "MATH", number: "2250A/B" } },
      ]),
    );
    expect(checkModuleAgainstCatalog(def, catalog).map((p) => `${p.requirementId}: ${p.message}`)).toEqual([
      "a: credits is 1.5 but the listed courses total 0.5 in the catalog",
      "b: MATH 2250A/B is not in the catalog",
    ]);
  });
});
