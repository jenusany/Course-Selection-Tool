import type { ModuleDefinition } from "../requirements/schema.js";

/**
 * Abbreviations the calendar text uses for *seeded* subjects, on top of
 * their full names. Deliberately limited to subjects in our catalog: for any
 * other subject we don't know the real Western subject code with certainty,
 * so the parser records those mentions as `outOfCatalog` external nodes
 * instead of inventing a code.
 */
const SUBJECT_ABBREVIATIONS: Record<string, string> = {
  nmm: "NMM",
};

/** Lowercased subject name → subject code, from the catalog's own subject names plus known abbreviations. */
export function buildSubjectLookup(courses: Iterable<{ subject: string; subjectName?: string }>): Map<string, string> {
  const map = new Map<string, string>(Object.entries(SUBJECT_ABBREVIATIONS));
  for (const c of courses) {
    if (c.subjectName) map.set(c.subjectName.toLowerCase(), c.subject);
  }
  return map;
}

/** Lowercased module name → module code, for "registration in the Honours Specialization in Computer Science". */
export function buildModuleLookup(modules: Iterable<Pick<ModuleDefinition, "code" | "name">>): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of modules) map.set(m.name.toLowerCase(), m.code);
  return map;
}
