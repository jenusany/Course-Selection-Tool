import { describe, expect, it } from "vitest";
import type { DegreeAuditResult, RequirementResult } from "../src/index.js";
import { auditPersona, PERSONAS } from "./fixtures.js";

// Expected audit outcomes for every seeded student (packages/db/prisma/seed/students.ts),
// run against the real catalog and requirement YAML. Figures were checked by hand
// against each persona's course list; when a fixture changes, re-derive — don't
// just paste the new output in.

const keys = (refs: { subject: string; number: string }[]) => refs.map((r) => `${r.subject} ${r.number}`);

function moduleReq(a: DegreeAuditResult, moduleCode: string, id: string): RequirementResult {
  const m = a.modules.find((x) => x.code === moduleCode);
  if (!m) throw new Error(`no module ${moduleCode}`);
  const r = m.requirements.find((x) => x.id === id);
  if (!r) throw new Error(`no requirement ${id} in ${moduleCode}`);
  return r;
}

function degreeReq(a: DegreeAuditResult, id: string): RequirementResult {
  const r = a.degreeRequirements.find((x) => x.id === id);
  if (!r) throw new Error(`no degree requirement ${id}`);
  return r;
}

const statuses = (rs: RequirementResult[]) => Object.fromEntries(rs.map((r) => [r.id, r.status]));

describe("seeded students — expected audit outcomes", () => {
  it("covers every seeded persona", () => {
    expect(PERSONAS.map((p) => p.email).sort()).toEqual([
      "aisha.bello@uwo.ca",
      "derek.osei@uwo.ca",
      "grace.petrov@uwo.ca",
      "jordan.whitfield@uwo.ca",
      "jyogara@uwo.ca",
      "liam.fontaine@uwo.ca",
      "marcus.chen@uwo.ca",
      "priya.nakamura@uwo.ca",
      "sofia.marchetti@uwo.ca",
    ]);
  });

  it("no seeded student has graduated — every overall status is UNMET", () => {
    for (const p of PERSONAS) expect(auditPersona(p.email).status, p.email).toBe("UNMET");
  });

  it("is deterministic for the same input", () => {
    for (const p of PERSONAS) expect(auditPersona(p.email)).toEqual(auditPersona(p.email));
  });

  it("Priya (first-year, undeclared): no modules, only in-progress credit, breadth A/C on the way", () => {
    const a = auditPersona("priya.nakamura@uwo.ca");
    expect(a.modules).toEqual([]);
    expect(a.creditsCompleted).toBe(0);
    expect(a.creditsInProgress).toBe(3.0); // four half courses + PSYCHOL 1000 (1.0)
    expect(degreeReq(a, "degree-module-combination")).toMatchObject({ status: "UNMET", notes: ["No module declared yet."] });
    expect(degreeReq(a, "degree-breadth-A").status).toBe("IN_PROGRESS");
    expect(degreeReq(a, "degree-breadth-B").status).toBe("UNMET");
    expect(degreeReq(a, "degree-breadth-C").status).toBe("IN_PROGRESS");
    expect(degreeReq(a, "degree-cumulative-average")).toMatchObject({ status: "IN_PROGRESS", average: { value: null } });
    expect(a.warnings).toEqual([]);
  });

  it("Marcus (2nd-year HSp CS, on track): first-year done, second-year core in progress", () => {
    const a = auditPersona("marcus.chen@uwo.ca");
    expect(a.creditsCompleted).toBe(4.0);
    expect(a.creditsInProgress).toBe(2.5);
    const core = moduleReq(a, "hsp-computer-science", "core-11");
    expect(core.status).toBe("UNMET");
    expect(keys(core.inProgressBy)).toEqual(["COMPSCI 2208A/B", "COMPSCI 2209A/B", "COMPSCI 2210A/B"]);
    expect(keys(core.suggestedCourses)).toEqual([
      "COMPSCI 2211A/B",
      "COMPSCI 2212A/B/Y",
      "COMPSCI 3305A/B",
      "COMPSCI 3307A/B/Y",
      "COMPSCI 3331A/B",
      "COMPSCI 3340A/B",
      "COMPSCI 3342A/B",
      "COMPSCI 3350A/B",
    ]);
    expect(moduleReq(a, "hsp-computer-science", "writing-choice").status).toBe("IN_PROGRESS");
    // No module course completed yet, so there's no module average to judge.
    expect(moduleReq(a, "hsp-computer-science", "module-average")).toMatchObject({ status: "IN_PROGRESS", average: { value: null } });
    expect(degreeReq(a, "degree-breadth-A").status).toBe("MET");
    expect(degreeReq(a, "degree-cumulative-average").average?.value).toBe(75.75);
    expect(a.warnings).toEqual([]);
  });

  it("Aisha (4th-year HSp CS, near graduation): module on track to complete this term, degree-level gaps remain", () => {
    const a = auditPersona("aisha.bello@uwo.ca");
    const m = a.modules[0]!;
    expect(m.status).toBe("IN_PROGRESS"); // every module requirement met or in progress
    expect(statuses(m.requirements)).toEqual({
      "core-11": "MET",
      "discrete-choice": "MET",
      "writing-choice": "MET",
      capstone: "IN_PROGRESS",
      "cs-4000-choice": "IN_PROGRESS",
      "cs-3000-plus-choice": "IN_PROGRESS",
      "stats-choice": "MET",
      "module-average": "MET",
    });
    // 4490Z goes to the capstone (specific courses first), leaving 4413/4451 for the 4000-level pool.
    expect(keys(moduleReq(a, "hsp-computer-science", "capstone").inProgressBy)).toEqual(["COMPSCI 4490Z"]);
    expect(keys(moduleReq(a, "hsp-computer-science", "cs-4000-choice").inProgressBy)).toEqual([
      "COMPSCI 4413A/B",
      "COMPSCI 4451A/B",
    ]);
    expect(keys(moduleReq(a, "hsp-computer-science", "cs-3000-plus-choice").inProgressBy)).toEqual(["COMPSCI 3388A/B"]);
    expect(m.creditsCompleted).toBe(7.0);
    expect(m.creditsInProgress).toBe(2.0);
    expect(moduleReq(a, "hsp-computer-science", "module-average").average?.value).toBe(79.93);
    expect(a.creditsCompleted).toBe(13.0);
    expect(a.creditsInProgress).toBe(2.0);
    expect(statuses(a.degreeRequirements)).toEqual({
      "degree-module-combination": "MET",
      "degree-total-credits": "UNMET",
      "degree-senior-credits": "UNMET",
      "degree-breadth-A": "MET",
      "degree-breadth-B": "UNMET", // only WRITING 2101F/G (0.5)
      "degree-breadth-C": "MET",
      "degree-essay": "UNMET", // WRITING 2101F/G + COMPSCI 4490Z (in progress) = 1.0 of 2.0
      "degree-essay-senior": "IN_PROGRESS",
      "degree-cumulative-average": "MET",
    });
    expect(a.warnings).toEqual([]);
    expect(a.advisories).toEqual([]);
  });

  it("Derek (antirequisite conflict): flags COMPSCI 4490Z against the completed COMPSCI 3380F/G/Z", () => {
    const a = auditPersona("derek.osei@uwo.ca");
    expect(a.warnings).toHaveLength(1);
    expect(a.warnings[0]!.type).toBe("ANTIREQUISITE_CONFLICT");
    expect(keys(a.warnings[0]!.courses).sort()).toEqual(["COMPSCI 3380F/G/Z", "COMPSCI 4490Z"]);
    expect(moduleReq(a, "hsp-computer-science", "capstone").status).toBe("IN_PROGRESS");
    expect(keys(moduleReq(a, "hsp-computer-science", "cs-3000-plus-choice").satisfiedBy)).toEqual(["COMPSCI 3380F/G/Z"]);
    expect(moduleReq(a, "hsp-computer-science", "core-11").creditsCompleted).toBe(2.5);
  });

  it("Sofia (Major CS, active hold): holds don't affect the audit; a lone Major gets the 60% additional-module average", () => {
    const a = auditPersona("sofia.marchetti@uwo.ca");
    const avg = moduleReq(a, "major-computer-science", "module-average");
    expect(avg.average).toEqual({ value: 69.67, required: 60 });
    expect(avg.status).toBe("MET");
    expect(moduleReq(a, "major-computer-science", "core-7")).toMatchObject({
      status: "UNMET",
      creditsCompleted: 2.5,
      creditsInProgress: 0.5,
    });
    // A single Major isn't an honours combination.
    expect(degreeReq(a, "degree-module-combination").status).toBe("UNMET");
    expect(a.warnings).toEqual([]);
  });

  it("Jordan (double Major CS + Math): both modules audited, primary first, honours thresholds for both", () => {
    const a = auditPersona("jordan.whitfield@uwo.ca");
    expect(a.modules.map((m) => [m.code, m.isPrimary])).toEqual([
      ["major-computer-science", true],
      ["major-mathematics", false],
    ]);
    expect(degreeReq(a, "degree-module-combination").status).toBe("MET");
    for (const code of ["major-computer-science", "major-mathematics"]) {
      expect(moduleReq(a, code, "module-average").average?.required).toBe(70);
    }
    expect(moduleReq(a, "major-mathematics", "core-6")).toMatchObject({
      status: "IN_PROGRESS",
      creditsCompleted: 1.5,
      creditsInProgress: 1.5,
    });
    // Modules are audited independently in v1: MATH 2156A/B counts toward both majors.
    expect(keys(moduleReq(a, "major-computer-science", "senior-choice").satisfiedBy)).toEqual(["MATH 2156A/B"]);
    expect(keys(moduleReq(a, "major-mathematics", "core-6").satisfiedBy)).toContain("MATH 2156A/B");
    // Fixture data issue, surfaced correctly: COMPSCI 2214A/B lists MATH 2155F/G as an antirequisite and Jordan
    // has completed both. Flagged in the Phase 2 summary rather than silently "fixed" in the fixture.
    expect(a.warnings.map((w) => [w.type, keys(w.courses).sort()])).toEqual([
      ["ANTIREQUISITE_CONFLICT", ["COMPSCI 2214A/B", "MATH 2155F/G"]],
    ]);
  });

  it("Grace (mid-way HSp Biology): 2000-level core complete, upper-year pool only gets 3000-level courses", () => {
    const a = auditPersona("grace.petrov@uwo.ca");
    expect(statuses(a.modules[0]!.requirements)).toEqual({
      "core-5": "MET",
      "organic-chem": "MET",
      physiology: "MET",
      "stats-choice": "MET",
      "upper-year-biology": "UNMET",
      "senior-biology": "UNMET",
      "capstone-seminar": "UNMET",
      "module-average": "MET",
    });
    // Her 2000-level Biology courses match "BIOLOGY 2200+" too, but were already claimed by the core requirements.
    const upper = moduleReq(a, "hsp-biology", "upper-year-biology");
    expect(upper.satisfiedBy).toEqual([]);
    expect(keys(upper.inProgressBy)).toEqual(["BIOLOGY 3316A/B", "BIOLOGY 3338A/B", "BIOLOGY 3440A/B"]);
    expect(moduleReq(a, "hsp-biology", "module-average").average?.value).toBe(75);
    expect(keys(moduleReq(a, "hsp-biology", "capstone-seminar").suggestedCourses)).toEqual([
      "BIOLOGY 4920F/G/Z",
      "BIOLOGY 4944F/G",
    ]);
  });

  it("Jenusan (4th-year HSp CS, near graduation, typed-login demo account): same shape as Aisha's fixture, higher grades", () => {
    const a = auditPersona("jyogara@uwo.ca");
    const m = a.modules[0]!;
    expect(m.status).toBe("IN_PROGRESS");
    expect(statuses(m.requirements)).toEqual({
      "core-11": "MET",
      "discrete-choice": "MET",
      "writing-choice": "MET",
      capstone: "IN_PROGRESS",
      "cs-4000-choice": "IN_PROGRESS",
      "cs-3000-plus-choice": "IN_PROGRESS",
      "stats-choice": "MET",
      "module-average": "MET",
    });
    expect(keys(moduleReq(a, "hsp-computer-science", "capstone").inProgressBy)).toEqual(["COMPSCI 4490Z"]);
    expect(keys(moduleReq(a, "hsp-computer-science", "cs-4000-choice").inProgressBy)).toEqual([
      "COMPSCI 4413A/B",
      "COMPSCI 4451A/B",
    ]);
    expect(keys(moduleReq(a, "hsp-computer-science", "cs-3000-plus-choice").inProgressBy)).toEqual(["COMPSCI 3388A/B"]);
    expect(m.creditsCompleted).toBe(7.0);
    expect(m.creditsInProgress).toBe(2.0);
    expect(moduleReq(a, "hsp-computer-science", "module-average").average?.value).toBe(86);
    expect(a.creditsCompleted).toBe(13.0);
    expect(a.creditsInProgress).toBe(2.0);
    expect(statuses(a.degreeRequirements)).toEqual({
      "degree-module-combination": "MET",
      "degree-total-credits": "UNMET",
      "degree-senior-credits": "UNMET",
      "degree-breadth-A": "MET",
      "degree-breadth-B": "UNMET",
      "degree-breadth-C": "MET",
      "degree-essay": "UNMET",
      "degree-essay-senior": "IN_PROGRESS",
      "degree-cumulative-average": "MET",
    });
    expect(a.warnings).toEqual([]);
    expect(a.advisories).toEqual([]);
  });

  it("Liam (borderline honours average): module average 69.86% misses 70%, with the Dean's-permission advisory", () => {
    const a = auditPersona("liam.fontaine@uwo.ca");
    const avg = moduleReq(a, "hsp-computer-science", "module-average");
    expect(avg.average).toEqual({ value: 69.86, required: 70, minMarkPerCourse: 60 });
    expect(avg.status).toBe("UNMET");
    expect(a.advisories).toHaveLength(1);
    expect(a.advisories[0]!.source).toBe("hsp-computer-science");
    expect(a.advisories[0]!.message).toMatch(/69\.9%.*at least 68%.*Dean/);
    expect(moduleReq(a, "hsp-computer-science", "core-11").status).toBe("MET");
  });
});
