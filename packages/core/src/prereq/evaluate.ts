import { courseKey, courseNumberValue, type Catalog } from "../catalog.js";
import type { CourseRef, RequisiteNode } from "../types/domain.js";

export type RequisiteOutcome = "SATISFIED" | "NOT_SATISFIED" | "UNKNOWN";

export interface RequisiteContext {
  catalog: Catalog;
  completed: readonly { course: CourseRef; grade: number }[];
  inProgress: readonly CourseRef[];
  moduleCodes: readonly string[];
  /** Count in-progress courses as satisfying (the usual assumption when planning next term). Default true. */
  countInProgress?: boolean;
  passMark?: number;
}

/** Every course mentioned anywhere in a requisite tree (used for antirequisite conflict checks). */
export function collectCourseRefs(node: RequisiteNode): CourseRef[] {
  switch (node.type) {
    case "course":
      return [{ subject: node.subject, number: node.number }];
    case "and":
    case "or":
    case "creditsFrom":
      return node.nodes.flatMap(collectCourseRefs);
    default:
      return [];
  }
}

/**
 * Three-valued evaluation: anything we can't check from the record
 * (high-school courses, departmental permission, unparsed text) is UNKNOWN
 * rather than guessed, and UNKNOWN propagates through AND/OR the usual way.
 */
export function evaluateRequisite(node: RequisiteNode, ctx: RequisiteContext): RequisiteOutcome {
  const passMark = ctx.passMark ?? 50;
  const countIp = ctx.countInProgress ?? true;
  const best = new Map<string, number>();
  for (const c of ctx.completed) {
    const k = courseKey(c.course);
    best.set(k, Math.max(best.get(k) ?? -1, c.grade));
  }
  const ip = new Set(ctx.inProgress.map(courseKey));

  const weight = (n: RequisiteNode) =>
    n.type === "course" ? (ctx.catalog.get(courseKey(n))?.creditWeight ?? 0.5) : 0.5;

  const ev = (n: RequisiteNode): RequisiteOutcome => {
    switch (n.type) {
      case "course": {
        const k = courseKey(n);
        const grade = best.get(k);
        if (grade !== undefined && grade >= Math.max(passMark, n.minGrade ?? 0)) return "SATISFIED";
        if (countIp && ip.has(k)) return n.minGrade !== undefined ? "UNKNOWN" : "SATISFIED";
        return "NOT_SATISFIED";
      }
      case "and": {
        const rs = n.nodes.map(ev);
        if (rs.includes("NOT_SATISFIED")) return "NOT_SATISFIED";
        return rs.every((r) => r === "SATISFIED") ? "SATISFIED" : "UNKNOWN";
      }
      case "or": {
        const rs = n.nodes.map(ev);
        if (rs.includes("SATISFIED")) return "SATISFIED";
        return rs.every((r) => r === "NOT_SATISFIED") ? "NOT_SATISFIED" : "UNKNOWN";
      }
      case "creditsFrom": {
        let sure = 0;
        let maybe = 0;
        for (const child of n.nodes) {
          const r = ev(child);
          if (r === "SATISFIED") sure += weight(child);
          else if (r === "UNKNOWN") maybe += weight(child);
        }
        if (sure + 1e-9 >= n.credits) return "SATISFIED";
        return sure + maybe + 1e-9 >= n.credits ? "UNKNOWN" : "NOT_SATISFIED";
      }
      case "creditsAtLevel": {
        let credits = 0;
        const consider = (ref: CourseRef) => {
          const e = ctx.catalog.get(courseKey(ref));
          if (!e) return;
          if (n.subject && e.subject !== n.subject) return;
          if (courseNumberValue(e) < n.level) return;
          credits += e.creditWeight;
        };
        for (const [k, g] of best) if (g >= passMark) consider(ctx.catalog.get(k) ?? { subject: "", number: "" });
        if (countIp) for (const ref of ctx.inProgress) if (!best.has(courseKey(ref))) consider(ref);
        return credits + 1e-9 >= n.credits ? "SATISFIED" : "NOT_SATISFIED";
      }
      case "registrationIn":
        return ctx.moduleCodes.includes(n.moduleCode) ? "SATISFIED" : "NOT_SATISFIED";
      case "externalRequirement":
        return "UNKNOWN";
    }
  };

  return ev(node);
}
