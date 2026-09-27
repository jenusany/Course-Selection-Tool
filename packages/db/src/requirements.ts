import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  parseDegreeDefinition,
  parseModuleDefinition,
  type DegreeDefinition,
  type ModuleDefinition,
} from "@wcs/core";

export interface RequirementSet {
  degrees: Map<string, DegreeDefinition>;
  modules: Map<string, ModuleDefinition>;
  /** Raw file contents keyed by relative path — hashed into audit snapshot fingerprints so a YAML edit invalidates them. */
  sources: Map<string, string>;
}

/**
 * Finds the repo's requirements/ directory: REQUIREMENTS_DIR if set, else the
 * nearest ancestor of the working directory that has one. Works from the repo
 * root, packages/db (seed), and apps/web (next dev/build) alike.
 */
export function findRequirementsDir(start = process.cwd()): string {
  if (process.env.REQUIREMENTS_DIR) return path.resolve(process.env.REQUIREMENTS_DIR);
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, "requirements");
    if (existsSync(path.join(candidate, "degrees")) && existsSync(path.join(candidate, "modules"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Couldn't find a requirements/ directory above ${start}; set REQUIREMENTS_DIR.`);
    dir = parent;
  }
}

/** Loads and validates every degree and module YAML file. Throws RequirementsValidationError on a bad file. */
export function loadRequirementSet(dir = findRequirementsDir()): RequirementSet {
  const sources = new Map<string, string>();
  const read = (sub: string) =>
    readdirSync(path.join(dir, sub))
      .filter((f) => f.endsWith(".yaml"))
      .sort()
      .map((f) => {
        const rel = `${sub}/${f}`;
        const text = readFileSync(path.join(dir, rel), "utf-8");
        sources.set(rel, text);
        return { rel, raw: parse(text) as unknown };
      });

  const degrees = new Map<string, DegreeDefinition>();
  for (const { rel, raw } of read("degrees")) {
    const d = parseDegreeDefinition(raw, rel);
    degrees.set(d.code, d);
  }
  const modules = new Map<string, ModuleDefinition>();
  for (const { rel, raw } of read("modules")) {
    const m = parseModuleDefinition(raw, rel);
    if (path.basename(rel, ".yaml") !== m.code) {
      throw new Error(`${rel}: module code "${m.code}" must match its file name (requirementsRef relies on it)`);
    }
    modules.set(m.code, m);
  }
  return { degrees, modules, sources };
}
