import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  evaluateRequirements,
  normalizeRecord,
  type CatalogCourse,
  type CompletedCourse,
  type InProgressCourse,
  type RequirementNode,
  type RequirementResult,
} from "../src/index.js";

// A small synthetic catalog so each requirement type can be exercised in isolation.
function course(key: string, extra: Partial<CatalogCourse> = {}): CatalogCourse {
  const [subject, number] = key.split(" ") as [string, string];
  const n = Number(number.slice(0, 4));
  return {
    subject,
    number,
    title: key,
    creditWeight: 0.5,
    level: Math.floor(n / 1000) * 1000,
    breadth: "C",
    essay: /[EFGZ]/.test(number.slice(4)),
    ...extra,
  };
}

const catalog = buildCatalog([
  course("CS 1000A/B"),
  course("CS 2100A/B"),
  course("CS 2200A/B"),
  course("CS 2300A/B"),
  course("CS 3100A/B"),
  course("CS 3200A/B"),
  course("CS 3300A/B"),
  course("CS 4100A/B"),
  course("CS 4200F/G"),
  course("CS 1900", { creditWeight: 1.0 }),
  course("MATH 1100A/B"),
  course("MATH 1200A/B"),
  course("MATH 2100A/B"),
  course("MATH 3100A/B"),
  course("PSYCH 1000", { creditWeight: 1.0, breadth: "A" }),
  course("WRIT 2100F/G", { breadth: "B" }),
]);

const split = (key: string) => {
  const [subject, number] = key.split(" ") as [string, string];
  return { subject, number };
};
const done = (key: string, grade: number): CompletedCourse => ({ course: split(key), term: "FALL", year: 2025, grade });
const ip = (key: string): InProgressCourse => ({ course: split(key), term: "FALL", year: 2026 });
const keys = (refs: { subject: string; number: string }[]) => refs.map((r) => `${r.subject} ${r.number}`);

function run(
  reqs: RequirementNode[],
  completed: CompletedCourse[],
  inProgress: InProgressCourse[] = [],
  opts: { exclusive?: boolean; minMarkPerCourse?: number } = {},
) {
  const record = normalizeRecord(completed, inProgress, catalog, 50);
  const out = evaluateRequirements(reqs, {
    catalog,
    record,
    exclusive: opts.exclusive ?? true,
    minMarkPerCourse: opts.minMarkPerCourse,
  });
  const byId = new Map<string, RequirementResult>();
  const walk = (rs: RequirementResult[]) =>
    rs.forEach((r) => {
      byId.set(r.id, r);
      if (r.children) walk(r.children);
    });
  walk(out.results);
  return { ...out, record, get: (id: string) => byId.get(id)! };
}

const cs = (number: string) => ({ subject: "CS", number });

describe("specificCourse", () => {
  const req: RequirementNode = { id: "r", type: "specificCourse", course: cs("4200F/G") };

  it("is MET by a completed pass, IN_PROGRESS while enrolled, UNMET otherwise (with a suggestion)", () => {
    expect(run([req], [done("CS 4200F/G", 70)]).get("r").status).toBe("MET");
    expect(run([req], [], [ip("CS 4200F/G")]).get("r").status).toBe("IN_PROGRESS");
    const unmet = run([req], []).get("r");
    expect(unmet.status).toBe("UNMET");
    expect(keys(unmet.suggestedCourses)).toEqual(["CS 4200F/G"]);
  });

  it("gets its credit requirement from the catalog weight", () => {
    const r = run([{ id: "r", type: "specificCourse", course: cs("1900") }], [done("CS 1900", 80)]).get("r");
    expect(r.creditsRequired).toBe(1.0);
    expect(r.creditsCompleted).toBe(1.0);
  });
});

describe("allOf", () => {
  const req: RequirementNode = { id: "core", type: "allOf", courses: [cs("2100A/B"), cs("2200A/B"), cs("2300A/B")] };

  it("is UNMET with partial credit and suggests only the missing courses", () => {
    const r = run([req], [done("CS 2100A/B", 70)], [ip("CS 2200A/B")]).get("core");
    expect(r.status).toBe("UNMET");
    expect(r.creditsRequired).toBe(1.5);
    expect(r.creditsCompleted).toBe(0.5);
    expect(r.creditsInProgress).toBe(0.5);
    expect(keys(r.suggestedCourses)).toEqual(["CS 2300A/B"]);
  });

  it("is IN_PROGRESS when every course is completed or in progress", () => {
    const r = run([req], [done("CS 2100A/B", 70), done("CS 2200A/B", 70)], [ip("CS 2300A/B")]).get("core");
    expect(r.status).toBe("IN_PROGRESS");
    expect(r.suggestedCourses).toEqual([]);
  });

  it("is MET when every course is completed", () => {
    expect(
      run([req], [done("CS 2100A/B", 70), done("CS 2200A/B", 70), done("CS 2300A/B", 70)]).get("core").status,
    ).toBe("MET");
  });
});

describe("oneOf", () => {
  it("without credits: one course, preferring a completed option over an in-progress one listed first", () => {
    const req: RequirementNode = { id: "r", type: "oneOf", courses: [cs("2100A/B"), cs("2200A/B")] };
    const r = run([req], [done("CS 2200A/B", 72)], [ip("CS 2100A/B")]).get("r");
    expect(r.status).toBe("MET");
    expect(keys(r.satisfiedBy)).toEqual(["CS 2200A/B"]);
    expect(r.inProgressBy).toEqual([]);
  });

  it("honours a per-course minimum mark (e.g. 'Calculus 1301A/B with at least 85%')", () => {
    const req: RequirementNode = {
      id: "r",
      type: "oneOf",
      courses: [{ subject: "MATH", number: "1100A/B", minMark: 85 }, { subject: "MATH", number: "1200A/B" }],
    };
    expect(run([req], [done("MATH 1100A/B", 80)]).get("r").status).toBe("UNMET");
    expect(run([req], [done("MATH 1100A/B", 86)]).get("r").status).toBe("MET");
  });

  it("honours a requirement-level minimum mark", () => {
    const req: RequirementNode = { id: "r", type: "oneOf", minMark: 65, courses: [cs("1000A/B")] };
    expect(run([req], [done("CS 1000A/B", 64)]).get("r").status).toBe("UNMET");
    expect(run([req], [done("CS 1000A/B", 65)]).get("r").status).toBe("MET");
  });

  it("with credits: needs that many credits' worth of the listed courses", () => {
    const req: RequirementNode = {
      id: "r",
      type: "oneOf",
      credits: 1.0,
      courses: [{ subject: "MATH", number: "1100A/B" }, { subject: "MATH", number: "1200A/B" }, cs("1000A/B")],
    };
    const half = run([req], [done("MATH 1100A/B", 70)]).get("r");
    expect(half.status).toBe("UNMET");
    expect(half.creditsCompleted).toBe(0.5);
    const full = run([req], [done("MATH 1100A/B", 70)], [ip("MATH 1200A/B")]).get("r");
    expect(full.status).toBe("IN_PROGRESS");
    expect(keys(full.inProgressBy)).toEqual(["MATH 1200A/B"]);
  });
});

describe("creditsFromList", () => {
  it("matches subject + minLevel against the four-digit course number, not the catalog level bucket", () => {
    const req: RequirementNode = { id: "r", type: "creditsFromList", credits: 1.0, list: [{ subject: "CS", minLevel: 2200 }] };
    const r = run([req], [done("CS 2100A/B", 70), done("CS 2200A/B", 70), done("CS 2300A/B", 70)]).get("r");
    expect(r.status).toBe("MET");
    expect(keys(r.satisfiedBy)).toEqual(["CS 2200A/B", "CS 2300A/B"]); // 2100 is below 2200
  });

  it("stops allocating once covered, leaving extra courses free for later requirements", () => {
    const pool: RequirementNode = { id: "pool", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 3000 }] };
    const r = run([pool], [done("CS 3100A/B", 70), done("CS 3200A/B", 70)]);
    expect(keys(r.get("pool").satisfiedBy)).toEqual(["CS 3100A/B"]);
    expect(keys(r.allocated.map((c) => c.ref))).toEqual(["CS 3100A/B"]);
  });

  it("supports exact-course, breadth and essay matchers, and suggests matching catalog courses when unmet", () => {
    const req: RequirementNode = {
      id: "r",
      type: "creditsFromList",
      credits: 1.0,
      list: [{ essay: true }, { breadth: "A" }, { subject: "MATH", number: "3100A/B" }],
    };
    const r = run([req], [done("CS 4200F/G", 70)]).get("r");
    expect(r.status).toBe("UNMET");
    expect(keys(r.suggestedCourses)).toEqual(["MATH 3100A/B", "PSYCH 1000", "WRIT 2100F/G"]);
  });

  it("counts completed credit first, then in-progress credit for the remainder", () => {
    const req: RequirementNode = { id: "r", type: "creditsFromList", credits: 1.0, list: [{ subject: "CS", minLevel: 3000 }] };
    const r = run([req], [done("CS 3100A/B", 70)], [ip("CS 3200A/B"), ip("CS 3300A/B")]).get("r");
    expect(r.status).toBe("IN_PROGRESS");
    expect(r.creditsCompleted).toBe(0.5);
    expect(r.creditsInProgress).toBe(0.5);
    expect(keys(r.inProgressBy)).toEqual(["CS 3200A/B"]);
  });
});

describe("creditsAtLevel", () => {
  it("counts credits at or above a level, in one subject or (subject null) any subject", () => {
    const record = [done("CS 3100A/B", 70), done("MATH 3100A/B", 70), done("CS 2100A/B", 70)];
    const csOnly = run([{ id: "r", type: "creditsAtLevel", credits: 1.0, level: 3000, subject: "CS" }], record).get("r");
    expect(csOnly.status).toBe("UNMET");
    expect(csOnly.creditsCompleted).toBe(0.5);
    const any = run([{ id: "r", type: "creditsAtLevel", credits: 1.0, level: 3000, subject: null }], record).get("r");
    expect(any.status).toBe("MET");
  });
});

describe("totalCredits", () => {
  it("counts every passed course without consuming it, so other requirements can still use it", () => {
    const reqs: RequirementNode[] = [
      { id: "t", type: "totalCredits", credits: 1.0 },
      { id: "s", type: "specificCourse", course: cs("2100A/B") },
    ];
    const r = run(reqs, [done("CS 2100A/B", 70), done("CS 2200A/B", 70)]);
    expect(r.get("t").status).toBe("MET");
    expect(r.get("s").status).toBe("MET");
  });

  it("caps credits below a level (max first-year credits) and per subject", () => {
    const req: RequirementNode = {
      id: "t",
      type: "totalCredits",
      credits: 5.0,
      maxCreditsBelowLevel: { level: 2000, credits: 1.0 },
      maxCreditsPerSubject: 1.5,
    };
    const r = run(
      [req],
      [
        done("CS 1000A/B", 70),
        done("MATH 1100A/B", 70),
        done("MATH 1200A/B", 70), // third first-year half course: over the 1.0 first-year cap
        done("CS 2100A/B", 70),
        done("CS 2200A/B", 70),
        done("CS 2300A/B", 70), // CS now at 2.0 raw, capped at 1.5
        done("MATH 2100A/B", 70),
      ],
    ).get("t");
    // first-year: CS 1000 + MATH 1100 = 1.0 (MATH 1200 dropped); CS: 1000 + 2100 + 2200 = 1.5 (2300 dropped); MATH 2100: 0.5
    expect(r.creditsCompleted).toBe(2.5);
    expect(r.status).toBe("UNMET");
  });

  it("doesn't count failed courses", () => {
    const r = run([{ id: "t", type: "totalCredits", credits: 1.0 }], [done("CS 2100A/B", 45), done("CS 2200A/B", 70)]).get("t");
    expect(r.creditsCompleted).toBe(0.5);
  });
});

describe("moduleAverage", () => {
  const core: RequirementNode = { id: "core", type: "allOf", courses: [cs("2100A/B"), cs("1900")] };

  it("is the credit-weighted average of courses allocated to the module's other requirements", () => {
    const req: RequirementNode = { id: "avg", type: "moduleAverage", minAverage: 70 };
    // (0.5 * 60 + 1.0 * 78) / 1.5 = 72; CS 3100 (95) isn't allocated to the module, so it doesn't count
    const r = run([core, req], [done("CS 2100A/B", 60), done("CS 1900", 78), done("CS 3100A/B", 95)]).get("avg");
    expect(r.average).toEqual({ value: 72, required: 70 });
    expect(r.status).toBe("MET");
  });

  it("is UNMET below the minimum, or when any counted course is below minMarkPerCourse", () => {
    const low = run([core, { id: "avg", type: "moduleAverage", minAverage: 75 }], [done("CS 2100A/B", 60), done("CS 1900", 78)]);
    expect(low.get("avg").status).toBe("UNMET");
    const perCourse = run(
      [core, { id: "avg", type: "moduleAverage", minAverage: 60, minMarkPerCourse: 65 }],
      [done("CS 2100A/B", 60), done("CS 1900", 90)],
    );
    expect(perCourse.get("avg").status).toBe("UNMET");
    expect(perCourse.get("avg").average?.value).toBe(80);
  });

  it("is IN_PROGRESS with no graded module courses yet", () => {
    const r = run([core, { id: "avg", type: "moduleAverage", minAverage: 70 }], [], [ip("CS 2100A/B")]).get("avg");
    expect(r.status).toBe("IN_PROGRESS");
    expect(r.average?.value).toBeNull();
  });
});

describe("cumulativeAverage", () => {
  it("averages every graded attempt, failures and repeats included", () => {
    const r = run(
      [{ id: "c", type: "cumulativeAverage", minAverage: 65 }],
      [done("CS 2100A/B", 40), done("CS 2100A/B", 70), done("PSYCH 1000", 80)],
    ).get("c");
    // (0.5*40 + 0.5*70 + 1.0*80) / 2.0 = 67.5
    expect(r.average?.value).toBe(67.5);
    expect(r.status).toBe("MET");
  });
});

describe("count (n of m)", () => {
  const req: RequirementNode = {
    id: "n",
    type: "count",
    n: 2,
    of: [
      { id: "a", type: "specificCourse", course: cs("3100A/B") },
      { id: "b", type: "specificCourse", course: cs("3200A/B") },
      { id: "c", type: "specificCourse", course: cs("3300A/B") },
    ],
  };

  it("is MET when n children are met, IN_PROGRESS when n are met or in progress, else UNMET", () => {
    expect(run([req], [done("CS 3100A/B", 70), done("CS 3300A/B", 70)]).get("n").status).toBe("MET");
    expect(run([req], [done("CS 3100A/B", 70)], [ip("CS 3200A/B")]).get("n").status).toBe("IN_PROGRESS");
    const unmet = run([req], [done("CS 3100A/B", 70)]).get("n");
    expect(unmet.status).toBe("UNMET");
    expect(unmet.children?.map((c) => c.status)).toEqual(["MET", "UNMET", "UNMET"]);
    expect(unmet.countRequired).toBe(2);
    expect(unmet.creditsRequired).toBe(1.0);
    expect(unmet.creditsCompleted).toBe(0.5);
  });
});

describe("allocation", () => {
  it("counts a course toward at most one requirement per module by default", () => {
    const reqs: RequirementNode[] = [
      { id: "a", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 3000 }] },
      { id: "b", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 3000 }] },
    ];
    const r = run(reqs, [done("CS 3100A/B", 70)]);
    expect([r.get("a").status, r.get("b").status].sort()).toEqual(["MET", "UNMET"]);
  });

  it("lets requirements that opt in via allowSharedWith reuse a course", () => {
    const reqs: RequirementNode[] = [
      { id: "a", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 3000 }], allowSharedWith: ["b"] },
      { id: "b", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 3000 }] },
    ];
    const r = run(reqs, [done("CS 3100A/B", 70)]);
    expect(r.get("a").status).toBe("MET");
    expect(r.get("b").status).toBe("MET");
  });

  it("fills specific courses before pools, even when the pool is listed first", () => {
    const reqs: RequirementNode[] = [
      { id: "pool", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 4000 }] },
      { id: "capstone", type: "specificCourse", course: cs("4200F/G") },
    ];
    const r = run(reqs, [done("CS 4200F/G", 70), done("CS 4100A/B", 70)]);
    expect(keys(r.get("capstone").satisfiedBy)).toEqual(["CS 4200F/G"]);
    expect(keys(r.get("pool").satisfiedBy)).toEqual(["CS 4100A/B"]);
  });

  it("fills the scarcest pool first so a broad pool doesn't starve a narrow one", () => {
    const reqs: RequirementNode[] = [
      { id: "broad", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 2000 }] },
      { id: "narrow", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", number: "2100A/B" }] },
    ];
    // In document order "broad" would take CS 2100 (first in record order) and starve "narrow", whose only
    // option it is. Scarcity ordering runs "narrow" (slack 0) before "broad" (slack 0.5).
    const r = run(reqs, [done("CS 2100A/B", 70), done("CS 3100A/B", 70)]);
    expect(keys(r.get("narrow").satisfiedBy)).toEqual(["CS 2100A/B"]);
    expect(keys(r.get("broad").satisfiedBy)).toEqual(["CS 3100A/B"]);
  });

  it("pins the greedy allocator's known limitation: an earlier requirement can take a course a later pool needed", () => {
    // oneOf (rank 1) picks the first completed option, CS 4100, though CS 3100 would also have satisfied it; the
    // 4000-level pool is then left unmet. An optimal allocator would satisfy both. See PLAN.md §8.
    const reqs: RequirementNode[] = [
      { id: "choice", type: "oneOf", courses: [cs("4100A/B"), cs("3100A/B")] },
      { id: "senior", type: "creditsFromList", credits: 0.5, list: [{ subject: "CS", minLevel: 4000 }] },
    ];
    const r = run(reqs, [done("CS 3100A/B", 70), done("CS 4100A/B", 70)]);
    expect(keys(r.get("choice").satisfiedBy)).toEqual(["CS 4100A/B"]);
    expect(r.get("senior").status).toBe("UNMET");
  });

  it("excludes completed courses below the module's per-course minimum (honours rule)", () => {
    const req: RequirementNode = { id: "r", type: "specificCourse", course: cs("2100A/B") };
    expect(run([req], [done("CS 2100A/B", 55)], [], { minMarkPerCourse: 60 }).get("r").status).toBe("UNMET");
    expect(run([req], [done("CS 2100A/B", 60)], [], { minMarkPerCourse: 60 }).get("r").status).toBe("MET");
  });

  it("in shared (degree) mode every requirement sees every course", () => {
    const reqs: RequirementNode[] = [
      { id: "essay", type: "creditsFromList", credits: 0.5, list: [{ essay: true }] },
      { id: "senior", type: "creditsAtLevel", credits: 0.5, level: 2000 },
    ];
    const r = run(reqs, [done("WRIT 2100F/G", 70)], [], { exclusive: false });
    expect(r.get("essay").status).toBe("MET");
    expect(r.get("senior").status).toBe("MET");
  });
});

describe("record normalization", () => {
  it("gives no credit for a failed course and warns about it", () => {
    const r = run([{ id: "r", type: "specificCourse", course: cs("2100A/B") }], [done("CS 2100A/B", 49)]);
    expect(r.get("r").status).toBe("UNMET");
    expect(r.record.warnings.map((w) => w.type)).toEqual(["FAILED_COURSE"]);
  });

  it("counts a repeated course once, with the best mark", () => {
    const r = run([{ id: "t", type: "totalCredits", credits: 1.0 }], [done("CS 2100A/B", 55), done("CS 2100A/B", 81)]);
    expect(r.get("t").creditsCompleted).toBe(0.5);
    expect(r.record.courses.find((c) => c.key === "CS 2100A/B")?.grade).toBe(81);
    expect(r.record.warnings.map((w) => w.type)).toEqual(["REPEATED_COURSE"]);
  });

  it("ignores an in-progress repeat of an already-passed course", () => {
    const r = run([{ id: "t", type: "totalCredits", credits: 1.0 }], [done("CS 2100A/B", 70)], [ip("CS 2100A/B")]);
    expect(r.get("t").creditsInProgress).toBe(0);
    expect(r.record.warnings.map((w) => w.type)).toEqual(["REPEATED_COURSE"]);
  });

  it("warns about record courses missing from the catalog instead of silently counting them", () => {
    const r = run([{ id: "t", type: "totalCredits", credits: 1.0 }], [done("CS 9999A/B", 90)]);
    expect(r.get("t").creditsCompleted).toBe(0);
    expect(r.record.warnings.map((w) => w.type)).toEqual(["UNKNOWN_COURSE"]);
  });
});
