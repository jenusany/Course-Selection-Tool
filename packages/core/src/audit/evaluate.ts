import { courseKey, courseNumberValue, toCourseRef, type Catalog, type CatalogCourse } from "../catalog.js";
import {
  flattenRequirements,
  type CountRequirement,
  type CourseMatcher,
  type CourseRefSpec,
  type RequirementNode,
} from "../requirements/schema.js";
import type { CourseRef, RequirementResult, RequirementStatus } from "../types/domain.js";
import type { AuditCourse, AuditRecord } from "./record.js";

// ── Requirement evaluation + course allocation ─────────────────────────────
//
// V1 allocator is a deterministic greedy pass (PLAN.md §8), not an optimal
// solver:
//   1. specificCourse / allOf   — mandatory courses claim first
//   2. oneOf                    — first listed option on the record wins
//   3. creditsFromList / creditsAtLevel — pools, scarcest first (least slack
//      between eligible credits on the record and credits required)
//   4. totalCredits / cumulativeAverage — never consume courses
//   5. moduleAverage            — computed over whatever 1–3 allocated
// Within a requirement, completed courses are taken before in-progress ones,
// in record order (course-key order), and allocation stops as soon as the
// requirement is covered. Known limitation: because allocation is greedy, a
// record that *could* satisfy every requirement under some assignment may be
// reported with an unmet pool if an earlier requirement claimed a course the
// pool needed and had an alternative. Tests pin the current behaviour.
//
// In exclusive mode (module scope) a course counts toward at most one
// requirement unless the requirements opt into sharing via `allowSharedWith`.
// In shared mode (degree scope: breadth, essay, senior credits, ...) every
// requirement sees every course.

const EPS = 1e-9;
const MAX_SUGGESTIONS = 25;

export interface EvaluationOptions {
  catalog: Catalog;
  record: AuditRecord;
  exclusive: boolean;
  /** Completed courses below this mark can't be counted toward any requirement here (honours module rule). */
  minMarkPerCourse?: number;
}

export interface EvaluationOutput {
  results: RequirementResult[];
  /** Distinct courses counted toward at least one requirement (exclusive mode only). */
  allocated: AuditCourse[];
}

type LeafRequirement = Exclude<RequirementNode, CountRequirement>;

const RANK: Record<LeafRequirement["type"], number> = {
  specificCourse: 0,
  allOf: 0,
  oneOf: 1,
  creditsFromList: 2,
  creditsAtLevel: 2,
  totalCredits: 3,
  cumulativeAverage: 3,
  moduleAverage: 4,
};

export function matchesCourse(m: CourseMatcher, c: CatalogCourse | AuditCourse): boolean {
  if (m.subject !== undefined && m.subject !== c.subject) return false;
  if (m.number !== undefined && m.number !== c.number) return false;
  const n = courseNumberValue(c);
  if (m.minLevel !== undefined && n < m.minLevel) return false;
  if (m.maxLevel !== undefined && n > m.maxLevel) return false;
  if (m.breadth !== undefined && m.breadth !== c.breadth) return false;
  if (m.essay !== undefined && m.essay !== c.essay) return false;
  return true;
}

function sumCredits(cs: readonly AuditCourse[]): number {
  return cs.reduce((s, c) => s + c.creditWeight, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

export function describeMatcher(m: CourseMatcher): string {
  if (m.number) return `${m.subject} ${m.number}`;
  const parts: string[] = [];
  if (m.breadth) parts.push(`Category ${m.breadth} breadth`);
  if (m.essay) parts.push("essay");
  if (m.essay === false) parts.push("non-essay");
  if (m.subject) parts.push(m.subject);
  let s = parts.join(" ") || "any";
  if (m.minLevel !== undefined && m.maxLevel !== undefined) s += ` ${m.minLevel}–${m.maxLevel}`;
  else if (m.minLevel !== undefined) s += ` ${m.minLevel}+`;
  else if (m.maxLevel !== undefined) s += ` up to ${m.maxLevel}`;
  return m.subject || m.minLevel !== undefined || m.maxLevel !== undefined ? s : `${s} courses`;
}

export function defaultLabel(r: RequirementNode): string {
  switch (r.type) {
    case "specificCourse":
      return courseKey(r.course);
    case "allOf":
      return `All of: ${r.courses.map(courseKey).join(", ")}`;
    case "oneOf":
      // A 0.5 `credits` on a list of half courses is still "one of" — only say "credits" when it's more than one course.
      return r.credits !== undefined && r.credits > 0.5
        ? `${fmt(r.credits)} credits from: ${r.courses.map(courseKey).join(", ")}`
        : `One of: ${r.courses.map(courseKey).join(", ")}`;
    case "creditsFromList":
      return `${fmt(r.credits)} credits from: ${r.list.map(describeMatcher).join(", ")}`;
    case "creditsAtLevel":
      return `${fmt(r.credits)} credits${r.subject ? ` in ${r.subject}` : ""} at the ${r.level} level or above`;
    case "totalCredits":
      return `${fmt(r.credits)} total credits`;
    case "moduleAverage":
      return `Module average of at least ${r.minAverage}%${r.minMarkPerCourse !== undefined ? ` (min ${r.minMarkPerCourse}% per course)` : ""}`;
    case "cumulativeAverage":
      return `Cumulative average of at least ${r.minAverage}%`;
    case "count":
      return `${r.n} of the following ${r.of.length}`;
  }
}

function statusFor(completed: number, inProgress: number, required: number): RequirementStatus {
  if (completed + EPS >= required) return "MET";
  if (completed + inProgress + EPS >= required) return "IN_PROGRESS";
  return "UNMET";
}

function weightedAverage(items: readonly { creditWeight: number; grade: number }[]): number | null {
  const w = items.reduce((s, i) => s + i.creditWeight, 0);
  if (w === 0) return null;
  return round2(items.reduce((s, i) => s + i.creditWeight * i.grade, 0) / w);
}

export function evaluateRequirements(nodes: readonly RequirementNode[], opts: EvaluationOptions): EvaluationOutput {
  const { catalog, record, exclusive } = opts;
  const flat = flattenRequirements(nodes);
  const usage = new Map<string, string[]>(); // course key -> requirement ids it counts toward
  const results = new Map<string, RequirementResult>();

  const sharePairs = new Set<string>();
  for (const r of flat) {
    for (const other of r.allowSharedWith ?? []) {
      sharePairs.add(`${r.id}\u0000${other}`);
      sharePairs.add(`${other}\u0000${r.id}`);
    }
  }

  const recordByKey = new Map(record.courses.map((c) => [c.key, c]));

  const canUse = (c: AuditCourse, reqId: string) =>
    !exclusive || (usage.get(c.key) ?? []).every((u) => u === reqId || sharePairs.has(`${u}\u0000${reqId}`));

  const markOk = (c: AuditCourse, r: RequirementNode, specMinMark?: number) => {
    if (c.status === "IN_PROGRESS") return true; // can't know yet — surfaces as IN_PROGRESS
    const min = Math.max(r.minMark ?? 0, specMinMark ?? 0, opts.minMarkPerCourse ?? 0);
    return (c.grade ?? 0) >= min;
  };

  const claim = (reqId: string, cs: readonly AuditCourse[]) => {
    if (!exclusive) return;
    for (const c of cs) {
      const users = usage.get(c.key) ?? [];
      if (!users.includes(reqId)) usage.set(c.key, [...users, reqId]);
    }
  };

  const eligibleForSpec = (spec: CourseRefSpec, r: RequirementNode): AuditCourse | undefined => {
    const c = recordByKey.get(courseKey(spec));
    return c && canUse(c, r.id) && markOk(c, r, spec.minMark) ? c : undefined;
  };

  const poolMatches = (r: LeafRequirement, c: AuditCourse | CatalogCourse): boolean => {
    switch (r.type) {
      case "creditsFromList":
        return r.list.some((m) => matchesCourse(m, c));
      case "creditsAtLevel":
        return matchesCourse({ subject: r.subject ?? undefined, minLevel: r.level }, c);
      case "oneOf":
        return r.courses.some((s) => courseKey(s) === courseKey(c));
      default:
        return false;
    }
  };

  const specMinMark = (r: LeafRequirement, c: AuditCourse): number | undefined =>
    r.type === "oneOf" ? r.courses.find((s) => courseKey(s) === c.key)?.minMark : undefined;

  /** Completed-first greedy take from `candidates` until `required` credits are covered. */
  const takeCredits = (candidates: readonly AuditCourse[], required: number) => {
    const done: AuditCourse[] = [];
    const ip: AuditCourse[] = [];
    let c = 0;
    for (const x of candidates) {
      if (x.status === "COMPLETED" && c + EPS < required) {
        done.push(x);
        c += x.creditWeight;
      }
    }
    let p = 0;
    for (const x of candidates) {
      if (x.status === "IN_PROGRESS" && c + p + EPS < required) {
        ip.push(x);
        p += x.creditWeight;
      }
    }
    return { done, ip };
  };

  const suggestFromSpecs = (specs: readonly CourseRefSpec[], exclude: ReadonlySet<string>): CourseRef[] =>
    specs
      .map((s) => catalog.get(courseKey(s)))
      .filter((e): e is CatalogCourse => !!e && !exclude.has(courseKey(e)) && !recordByKey.has(courseKey(e)))
      .slice(0, MAX_SUGGESTIONS)
      .map(toCourseRef);

  const suggestFromCatalog = (r: LeafRequirement): CourseRef[] => {
    const out: CourseRef[] = [];
    for (const e of catalog.values()) {
      if (out.length >= MAX_SUGGESTIONS) break;
      if (!recordByKey.has(courseKey(e)) && poolMatches(r, e)) out.push(toCourseRef(e));
    }
    return out;
  };

  const base = (r: RequirementNode) => ({
    id: r.id,
    label: r.label ?? defaultLabel(r),
    type: r.type,
    notes: r.notes ?? [],
  });

  const creditResult = (
    r: LeafRequirement,
    required: number,
    done: readonly AuditCourse[],
    ip: readonly AuditCourse[],
    status: RequirementStatus,
    suggestions: () => CourseRef[],
  ): RequirementResult => {
    const creditsCompleted = Math.min(sumCredits(done), required);
    return {
      ...base(r),
      status,
      creditsRequired: required,
      creditsCompleted: round2(creditsCompleted),
      creditsInProgress: round2(Math.min(sumCredits(ip), required - creditsCompleted)),
      satisfiedBy: done.map((c) => c.ref),
      inProgressBy: ip.map((c) => c.ref),
      suggestedCourses: status === "UNMET" ? suggestions() : [],
    };
  };

  const evaluateLeaf = (r: LeafRequirement): RequirementResult => {
    switch (r.type) {
      case "specificCourse":
      case "allOf": {
        const specs = r.type === "allOf" ? r.courses : [r.course];
        const found = specs.map((s) => eligibleForSpec(s, r));
        const done = found.filter((c): c is AuditCourse => c?.status === "COMPLETED");
        const ip = found.filter((c): c is AuditCourse => c?.status === "IN_PROGRESS");
        claim(r.id, [...done, ...ip]);
        const required =
          r.credits ?? specs.reduce((s, spec) => s + (catalog.get(courseKey(spec))?.creditWeight ?? 0.5), 0);
        const status: RequirementStatus = found.every((c) => c?.status === "COMPLETED")
          ? "MET"
          : found.every((c) => c !== undefined)
            ? "IN_PROGRESS"
            : "UNMET";
        const have = new Set(found.filter((c) => c).map((c) => c!.key));
        return creditResult(r, required, done, ip, status, () => suggestFromSpecs(specs, have));
      }

      case "oneOf": {
        const candidates = r.courses
          .map((s) => eligibleForSpec(s, r))
          .filter((c): c is AuditCourse => c !== undefined);
        if (r.credits !== undefined) {
          // Keep record order (completed first) so the result doesn't depend on YAML list order.
          const ordered = record.courses.filter((c) => candidates.includes(c));
          const { done, ip } = takeCredits(ordered, r.credits);
          claim(r.id, [...done, ...ip]);
          const status = statusFor(sumCredits(done), sumCredits(ip), r.credits);
          return creditResult(r, r.credits, done, ip, status, () => suggestFromSpecs(r.courses, new Set()));
        }
        const pick = candidates.find((c) => c.status === "COMPLETED") ?? candidates[0];
        claim(r.id, pick ? [pick] : []);
        const required =
          pick?.creditWeight ??
          Math.min(...r.courses.map((s) => catalog.get(courseKey(s))?.creditWeight ?? 0.5));
        const done = pick?.status === "COMPLETED" ? [pick] : [];
        const ip = pick?.status === "IN_PROGRESS" ? [pick] : [];
        const status: RequirementStatus = done.length ? "MET" : ip.length ? "IN_PROGRESS" : "UNMET";
        return creditResult(r, required, done, ip, status, () => suggestFromSpecs(r.courses, new Set()));
      }

      case "creditsFromList":
      case "creditsAtLevel": {
        const candidates = record.courses.filter((c) => poolMatches(r, c) && canUse(c, r.id) && markOk(c, r));
        const { done, ip } = takeCredits(candidates, r.credits);
        claim(r.id, [...done, ...ip]);
        const status = statusFor(sumCredits(done), sumCredits(ip), r.credits);
        return creditResult(r, r.credits, done, ip, status, () => suggestFromCatalog(r));
      }

      case "totalCredits": {
        const below = r.maxCreditsBelowLevel;
        let belowCounted = 0;
        const perSubject = new Map<string, number>();
        let done = 0;
        let ip = 0;
        const doneBy: AuditCourse[] = [];
        const ipBy: AuditCourse[] = [];
        for (const c of record.courses) {
          if (!markOk(c, r)) continue;
          let credit = c.creditWeight;
          if (below && courseNumberValue(c) < below.level) credit = Math.min(credit, below.credits - belowCounted);
          if (r.maxCreditsPerSubject !== undefined) {
            credit = Math.min(credit, r.maxCreditsPerSubject - (perSubject.get(c.subject) ?? 0));
          }
          if (credit <= EPS) continue;
          if (below && courseNumberValue(c) < below.level) belowCounted += credit;
          perSubject.set(c.subject, (perSubject.get(c.subject) ?? 0) + credit);
          if (c.status === "COMPLETED") {
            done += credit;
            doneBy.push(c);
          } else {
            ip += credit;
            ipBy.push(c);
          }
        }
        const creditsCompleted = Math.min(done, r.credits);
        return {
          ...base(r),
          status: statusFor(done, ip, r.credits),
          creditsRequired: r.credits,
          creditsCompleted: round2(creditsCompleted),
          creditsInProgress: round2(Math.min(ip, r.credits - creditsCompleted)),
          satisfiedBy: doneBy.map((c) => c.ref),
          inProgressBy: ipBy.map((c) => c.ref),
          suggestedCourses: [],
        };
      }

      case "cumulativeAverage": {
        const value = weightedAverage(record.gradedAttempts);
        return averageResult(r, value, r.minAverage, undefined, value === null ? "IN_PROGRESS" : value >= r.minAverage ? "MET" : "UNMET");
      }

      case "moduleAverage": {
        const graded = [...usage.keys()]
          .map((k) => recordByKey.get(k)!)
          .filter((c) => c.status === "COMPLETED" && c.grade !== null)
          .map((c) => ({ creditWeight: c.creditWeight, grade: c.grade! }));
        const value = weightedAverage(graded);
        const belowMin =
          r.minMarkPerCourse !== undefined && graded.some((g) => g.grade < r.minMarkPerCourse!);
        const status: RequirementStatus =
          value === null ? "IN_PROGRESS" : value >= r.minAverage && !belowMin ? "MET" : "UNMET";
        return averageResult(r, value, r.minAverage, r.minMarkPerCourse, status);
      }
    }
  };

  const averageResult = (
    r: RequirementNode,
    value: number | null,
    required: number,
    minMarkPerCourse: number | undefined,
    status: RequirementStatus,
  ): RequirementResult => ({
    ...base(r),
    status,
    creditsRequired: 0,
    creditsCompleted: 0,
    creditsInProgress: 0,
    satisfiedBy: [],
    inProgressBy: [],
    suggestedCourses: [],
    average: { value, required, ...(minMarkPerCourse !== undefined ? { minMarkPerCourse } : {}) },
  });

  // Slack = eligible credits on the record minus credits required; smaller = scarcer = allocate first.
  const slack = (r: LeafRequirement): number => {
    if (r.type !== "creditsFromList" && r.type !== "creditsAtLevel") return 0;
    return sumCredits(record.courses.filter((c) => poolMatches(r, c))) - r.credits;
  };

  const leaves = flat
    .map((r, i) => ({ r, i }))
    .filter((x): x is { r: LeafRequirement; i: number } => x.r.type !== "count")
    .map((x) => ({ ...x, rank: RANK[x.r.type], slack: slack(x.r) }))
    .sort((a, b) => a.rank - b.rank || a.slack - b.slack || a.i - b.i);

  for (const { r } of leaves) results.set(r.id, evaluateLeaf(r));

  const build = (n: RequirementNode): RequirementResult => {
    if (n.type !== "count") return results.get(n.id)!;
    const children = n.of.map(build);
    const met = children.filter((c) => c.status === "MET").length;
    const ipOrMet = children.filter((c) => c.status !== "UNMET").length;
    const byRequired = children.map((c) => c.creditsRequired).sort((a, b) => a - b);
    const byCompleted = children.map((c) => c.creditsCompleted).sort((a, b) => b - a);
    const creditsRequired = byRequired.slice(0, n.n).reduce((s, x) => s + x, 0);
    const creditsCompleted = Math.min(creditsRequired, byCompleted.slice(0, n.n).reduce((s, x) => s + x, 0));
    const inProgress = children.reduce((s, c) => s + c.creditsInProgress, 0);
    return {
      ...base(n),
      status: met >= n.n ? "MET" : ipOrMet >= n.n ? "IN_PROGRESS" : "UNMET",
      creditsRequired: round2(creditsRequired),
      creditsCompleted: round2(creditsCompleted),
      creditsInProgress: round2(Math.min(inProgress, creditsRequired - creditsCompleted)),
      satisfiedBy: children.flatMap((c) => c.satisfiedBy),
      inProgressBy: children.flatMap((c) => c.inProgressBy),
      suggestedCourses: [],
      children,
      countRequired: n.n,
    };
  };

  return {
    results: nodes.map(build),
    allocated: record.courses.filter((c) => usage.has(c.key)),
  };
}
