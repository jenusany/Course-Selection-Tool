import { describe, expect, it } from "vitest";
import {
  evaluateRequisite,
  parseAntirequisiteText,
  parsePrerequisiteText,
  type RequisiteContext,
  type RequisiteNode,
} from "../src/index.js";
import { catalog, parserOptions, rawCourses } from "./fixtures.js";

const pre = (text: string) => parsePrerequisiteText(text, parserOptions);
const anti = (text: string) => parseAntirequisiteText(text, parserOptions);
const c = (subject: string, number: string, minGrade?: number): RequisiteNode =>
  minGrade === undefined ? { type: "course", subject, number } : { type: "course", subject, number, minGrade };
const rawPre = (key: string) => rawCourses.find((r) => `${r.subjectCode} ${r.number}` === key)!.prerequisiteText!;

describe("parsePrerequisiteText — calendar phrasing", () => {
  it("comma list closed by 'or', with an 'in each case' mark applied to every option (COMPSCI 1027A/B)", () => {
    const r = pre(rawPre("COMPSCI 1027A/B"));
    expect(r.complete).toBe(true);
    expect(r.tree).toEqual({
      type: "or",
      nodes: [c("COMPSCI", "1025A/B", 65), c("COMPSCI", "1026A/B", 65), c("DATASCI", "1200A/B", 65), c("ENGSCI", "1036A/B", 65)],
    });
  });

  it("semicolon clauses AND together, each with its own mark (COMPSCI 2208A/B)", () => {
    expect(pre(rawPre("COMPSCI 2208A/B")).tree).toEqual({
      type: "and",
      nodes: [{ type: "or", nodes: [c("COMPSCI", "1027A/B", 65), c("COMPSCI", "1037A/B", 65)] }, c("COMPSCI", "1020A/B", 60)],
    });
  });

  it("'Either (…) or (…) or (…)' groups, with an out-of-catalog subject and a registration condition (COMPSCI 3305A/B)", () => {
    const r = pre(rawPre("COMPSCI 3305A/B"));
    expect(r.tree).toEqual({
      type: "or",
      nodes: [
        { type: "and", nodes: [c("COMPSCI", "2208A/B"), c("COMPSCI", "2211A/B")] },
        { type: "and", nodes: [c("COMPSCI", "2101A/B"), c("COMPSCI", "2208A/B")] },
        {
          type: "and",
          nodes: [
            c("COMPSCI", "2210A/B"),
            c("COMPSCI", "2211A/B"),
            { type: "externalRequirement", text: "ECE 3375A/B", reason: "outOfCatalog" },
            {
              type: "externalRequirement",
              text: "registration in the fourth year of a BESc program in Computer Engineering or Mechatronic Systems Engineering",
              reason: "registration",
            },
          ],
        },
      ],
    });
  });

  it("'N.N courses from:' becomes creditsFrom, and a known module becomes registrationIn (COMPSCI 4490Z)", () => {
    const r = pre(rawPre("COMPSCI 4490Z"));
    expect(r.complete).toBe(true);
    const first = (r.tree as Extract<RequisiteNode, { type: "or" }>).nodes[0];
    expect(first).toEqual({
      type: "and",
      nodes: [
        {
          type: "creditsFrom",
          credits: 2.0,
          nodes: ["3305A/B", "3307A/B/Y", "3331A/B", "3340A/B", "3342A/B", "3350A/B"].map((n) => c("COMPSCI", n)),
        },
        { type: "registrationIn", moduleCode: "hsp-computer-science" },
      ],
    });
  });

  it("'and' binds looser than 'or', and prefix marks apply to what follows (BIOLOGY 2290F/G)", () => {
    expect(pre(rawPre("BIOLOGY 2290F/G")).tree).toEqual({
      type: "and",
      nodes: [
        c("BIOLOGY", "1001A", 60),
        {
          type: "or",
          nodes: [c("BIOLOGY", "1002B", 60), { type: "externalRequirement", text: "Integrated Science 1001X", reason: "outOfCatalog" }],
        },
      ],
    });
  });

  it("keeps multi-word subject names containing 'and' intact (Numerical and Mathematical Methods)", () => {
    const r = pre(rawPre("NMM 1414A/B"));
    expect(r.complete).toBe(true);
    expect(r.tree).toEqual({
      type: "or",
      nodes: [c("NMM", "1412A/B"), c("CALCULUS", "1000A/B"), c("CALCULUS", "1500A/B"), c("APPLMATH", "1412A/B")],
    });
  });

  it("'A minimum mark of 60% in one of …, or a minimum mark of 85% in X' gives each option its own mark (MATH 2124A/B)", () => {
    const r = pre(rawPre("MATH 2124A/B"));
    expect(r.tree).toEqual({
      type: "or",
      nodes: [
        c("CALCULUS", "1501A/B", 60),
        c("NMM", "1414A/B", 60),
        c("APPLMATH", "1414A/B", 60),
        c("APPLMATH", "1413", 60),
        c("CALCULUS", "1301A/B", 85),
      ],
    });
    // The Integrated Science substitution sentence isn't structured, so the parse is flagged for review.
    expect(r.complete).toBe(false);
    expect(r.notes[0]).toMatch(/Integrated Science 1001X/);
  });

  it("'Completion of at least 1.5 Biology courses at the 3000 level' becomes creditsAtLevel (BIOLOGY 4200A/B)", () => {
    const r = pre(rawPre("BIOLOGY 4200A/B"));
    expect((r.tree as Extract<RequisiteNode, { type: "and" }>).nodes[0]).toEqual({
      type: "creditsAtLevel",
      credits: 1.5,
      subject: "BIOLOGY",
      level: 3000,
    });
  });

  it("keeps pre-or-corequisites in the tree but moves plain corequisites to notes", () => {
    const apm = pre(rawPre("APPLMATH 2402A/B")).tree as Extract<RequisiteNode, { type: "and" }>;
    expect(apm.nodes.at(-1)).toEqual({ type: "or", nodes: [c("MATH", "1600A/B"), c("MATH", "1700A/B")] });
    const cs4480 = pre(rawPre("COMPSCI 4480Y"));
    expect(cs4480.tree).toEqual({ type: "externalRequirement", text: "Registration in the Minor in Game Development", reason: "registration" });
    expect(cs4480.notes).toEqual(["Corequisite(s): Computer Science 4482A/B, Computer Science 4483A/B"]);
  });

  it("falls back to an 'unparsed' node and flags the parse instead of guessing (MATH 3150A/B)", () => {
    const r = pre(rawPre("MATH 3150A/B"));
    expect(r.complete).toBe(false);
    expect(r.tree).toEqual({
      type: "externalRequirement",
      text: "1.0 course in Mathematics, Applied Mathematics, or Calculus at the 2100 level or higher",
      reason: "unparsed",
    });
  });

  it("reads an ambiguous un-conjoined list conservatively as 'all of' and flags it (COMPSCI 4482A/B)", () => {
    const r = pre(rawPre("COMPSCI 4482A/B"));
    expect(r.complete).toBe(false);
    expect(r.notes.some((n) => n.startsWith('Ambiguous list read as "all of"'))).toBe(true);
  });

  it("returns a null tree for empty text", () => {
    expect(pre("")).toEqual({ tree: null, complete: true, notes: [] });
  });
});

describe("parsePrerequisiteText — whole seeded catalog", () => {
  const results = rawCourses
    .filter((r) => r.prerequisiteText)
    .map((r) => ({ key: `${r.subjectCode} ${r.number}`, ...pre(r.prerequisiteText!) }));

  const walk = (n: RequisiteNode | null, out: RequisiteNode[] = []): RequisiteNode[] => {
    if (!n) return out;
    out.push(n);
    if (n.type === "and" || n.type === "or" || n.type === "creditsFrom") n.nodes.forEach((x) => walk(x, out));
    return out;
  };

  it("produces a tree for every course with prerequisite text", () => {
    for (const r of results) expect(r.tree, r.key).not.toBeNull();
  });

  it("only ever emits subject codes that exist in the catalog (never invents a code)", () => {
    const subjects = new Set(rawCourses.map((r) => r.subjectCode));
    for (const r of results) {
      for (const n of walk(r.tree)) {
        if (n.type === "course") expect(subjects.has(n.subject), `${r.key}: ${n.subject}`).toBe(true);
      }
    }
  });

  it("pins exactly which courses need human review (update this list deliberately when the parser improves)", () => {
    expect(results.filter((r) => !r.complete).map((r) => r.key)).toEqual([
      "COMPSCI 2121A/B",
      "COMPSCI 4482A/B",
      "BIOLOGY 2244A/B",
      "BIOLOGY 2382A/B",
      "BIOLOGY 4999E",
      "MATH 1600A/B",
      "MATH 1700A/B",
      "MATH 2124A/B",
      "MATH 2155F/G",
      "MATH 2700A/B",
      "MATH 3022A/B",
      "MATH 3150A/B",
      "STATS 1024A/B",
      "STATS 2141A/B",
      "STATS 2244A/B",
      "STATS 2857A/B",
      "APPLMATH 2402A/B",
      "DATASCI 3000A/B",
      "BIOCHEM 2280A",
    ]);
  });
});

describe("parseAntirequisiteText", () => {
  it("treats the list as any-of", () => {
    expect(anti("Computer Science 1037A/B, Computer Science 2121A/B, Digital Humanities 2221A/B.").tree).toEqual({
      type: "or",
      nodes: [
        c("COMPSCI", "1037A/B"),
        c("COMPSCI", "2121A/B"),
        { type: "externalRequirement", text: "Digital Humanities 2221A/B", reason: "outOfCatalog" },
      ],
    });
  });

  it("keeps a conditional antirequisite's course but flags the unmodelled condition", () => {
    const r = anti(
      "Computer Science 4434A/B, if taken during the 2021-2022 academic year; Computer Science 4457A/B, if taken during the 2020-2021 academic year.",
    );
    expect(r.tree).toEqual({ type: "or", nodes: [c("COMPSCI", "4434A/B"), c("COMPSCI", "4457A/B")] });
    expect(r.complete).toBe(false);
    expect(r.notes).toHaveLength(2);
  });

  it("drops '(except …)' exclusions before extracting courses", () => {
    const r = anti(
      "All other courses in Introductory Statistics (except Statistical Sciences 1023A/B, Data Science 1000A/B): Biology 2244A/B, Statistical Sciences 2141A/B.",
    );
    expect(r.tree).toEqual({ type: "or", nodes: [c("BIOLOGY", "2244A/B"), c("STATS", "2141A/B")] });
  });
});

describe("evaluateRequisite", () => {
  const ctx = (over: Partial<RequisiteContext> = {}): RequisiteContext => ({
    catalog,
    completed: [],
    inProgress: [],
    moduleCodes: [],
    ...over,
  });

  it("checks minimum grades on completed courses", () => {
    const node = c("COMPSCI", "1027A/B", 65);
    const completed = (grade: number) => [{ course: { subject: "COMPSCI", number: "1027A/B" }, grade }];
    expect(evaluateRequisite(node, ctx({ completed: completed(64) }))).toBe("NOT_SATISFIED");
    expect(evaluateRequisite(node, ctx({ completed: completed(65) }))).toBe("SATISFIED");
  });

  it("counts in-progress courses by default, but can't know an in-progress mark", () => {
    const inProgress = [{ subject: "COMPSCI", number: "1027A/B" }];
    expect(evaluateRequisite(c("COMPSCI", "1027A/B"), ctx({ inProgress }))).toBe("SATISFIED");
    expect(evaluateRequisite(c("COMPSCI", "1027A/B", 65), ctx({ inProgress }))).toBe("UNKNOWN");
    expect(evaluateRequisite(c("COMPSCI", "1027A/B"), ctx({ inProgress, countInProgress: false }))).toBe("NOT_SATISFIED");
  });

  it("propagates UNKNOWN through AND/OR three-valued style", () => {
    const hs: RequisiteNode = { type: "externalRequirement", text: "Ontario Secondary School MCV4U", reason: "highSchool" };
    const math = c("MATH", "0110A/B");
    const done = ctx({ completed: [{ course: { subject: "MATH", number: "0110A/B" }, grade: 70 }] });
    expect(evaluateRequisite({ type: "or", nodes: [hs, math] }, done)).toBe("SATISFIED");
    expect(evaluateRequisite({ type: "or", nodes: [hs, math] }, ctx())).toBe("UNKNOWN");
    expect(evaluateRequisite({ type: "and", nodes: [hs, math] }, ctx())).toBe("NOT_SATISFIED");
    expect(evaluateRequisite({ type: "and", nodes: [hs, math] }, done)).toBe("UNKNOWN");
  });

  it("evaluates creditsFrom, creditsAtLevel and registrationIn", () => {
    const completed = [
      { course: { subject: "BIOLOGY", number: "3316A/B" }, grade: 70 },
      { course: { subject: "BIOLOGY", number: "3338A/B" }, grade: 70 },
      { course: { subject: "BIOLOGY", number: "2382A/B" }, grade: 70 },
    ];
    const from: RequisiteNode = { type: "creditsFrom", credits: 1.0, nodes: [c("BIOLOGY", "3316A/B"), c("BIOLOGY", "3440A/B")] };
    expect(evaluateRequisite(from, ctx({ completed }))).toBe("NOT_SATISFIED");
    expect(evaluateRequisite(from, ctx({ completed, inProgress: [{ subject: "BIOLOGY", number: "3440A/B" }] }))).toBe("SATISFIED");
    const atLevel: RequisiteNode = { type: "creditsAtLevel", credits: 1.5, level: 3000, subject: "BIOLOGY" };
    expect(evaluateRequisite(atLevel, ctx({ completed }))).toBe("NOT_SATISFIED"); // 2382 is below 3000
    expect(evaluateRequisite({ ...atLevel, credits: 1.0 }, ctx({ completed }))).toBe("SATISFIED");
    const reg: RequisiteNode = { type: "registrationIn", moduleCode: "hsp-computer-science" };
    expect(evaluateRequisite(reg, ctx({ moduleCodes: ["hsp-computer-science"] }))).toBe("SATISFIED");
    expect(evaluateRequisite(reg, ctx())).toBe("NOT_SATISFIED");
  });

  it("works end to end on a parsed catalog tree: Marcus can take COMPSCI 2211A/B next term", () => {
    const tree = catalog.get("COMPSCI 2211A/B")!.prerequisiteTree!;
    const completed = [{ course: { subject: "COMPSCI", number: "1027A/B" }, grade: 82 }];
    expect(evaluateRequisite(tree, ctx({ completed }))).toBe("SATISFIED");
    expect(evaluateRequisite(tree, ctx({ completed: [{ ...completed[0]!, grade: 64 }] }))).toBe("NOT_SATISFIED");
  });
});
