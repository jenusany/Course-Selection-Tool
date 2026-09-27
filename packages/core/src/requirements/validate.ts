import { courseKey, type Catalog } from "../catalog.js";
import { flattenRequirements, type ModuleDefinition, type RequirementNode } from "./schema.js";

export interface CatalogReferenceProblem {
  moduleCode: string;
  requirementId: string;
  section: "module" | "admission";
  message: string;
}

function refsOf(r: RequirementNode): string[] {
  switch (r.type) {
    case "specificCourse":
      return [courseKey(r.course)];
    case "allOf":
    case "oneOf":
      return r.courses.map(courseKey);
    case "creditsFromList":
      return r.list.filter((m) => m.number && m.subject).map((m) => `${m.subject} ${m.number}`);
    default:
      return [];
  }
}

/**
 * Cross-checks a module file against the catalog: every exact course it
 * names should exist, and an allOf/specificCourse `credits` figure should
 * match the catalog weights. Schema validation can't do this (it has no
 * catalog), so this runs in tests and at seed time.
 */
export function checkModuleAgainstCatalog(def: ModuleDefinition, catalog: Catalog): CatalogReferenceProblem[] {
  const problems: CatalogReferenceProblem[] = [];
  const sections: ["module" | "admission", RequirementNode[]][] = [["module", def.module.requirements]];
  if (def.admission) sections.push(["admission", def.admission.requirements]);

  for (const [section, reqs] of sections) {
    for (const r of flattenRequirements(reqs)) {
      for (const key of refsOf(r)) {
        if (!catalog.has(key)) {
          problems.push({ moduleCode: def.code, requirementId: r.id, section, message: `${key} is not in the catalog` });
        }
      }
      if ((r.type === "allOf" || r.type === "specificCourse") && r.credits !== undefined) {
        const specs = r.type === "allOf" ? r.courses : [r.course];
        const sum = specs.reduce((s, c) => s + (catalog.get(courseKey(c))?.creditWeight ?? 0), 0);
        if (Math.abs(sum - r.credits) > 1e-9) {
          problems.push({
            moduleCode: def.code,
            requirementId: r.id,
            section,
            message: `credits is ${r.credits} but the listed courses total ${sum} in the catalog`,
          });
        }
      }
    }
  }
  return problems;
}
