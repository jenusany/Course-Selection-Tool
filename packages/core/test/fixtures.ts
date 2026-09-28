// Test fixtures built from the real seed data: the scraped catalog, the
// requirement YAML, and the seeded student personas. packages/core never
// imports packages/db at runtime — tests read the same files the seed reads.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { PERSONAS } from "../../db/prisma/seed/students.js";
import {
  buildCatalog,
  buildModuleLookup,
  buildSubjectLookup,
  parseAntirequisiteText,
  parseDegreeDefinition,
  parseModuleDefinition,
  parsePrerequisiteText,
  runDegreeAudit,
  type Catalog,
  type CatalogCourse,
  type CompletedCourse,
  type DegreeAuditResult,
  type DegreeDefinition,
  type InProgressCourse,
  type ModuleDefinition,
  type ModuleType,
  type RequisiteParserOptions,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

export interface RawCourse {
  subjectCode: string;
  subjectName: string;
  number: string;
  title: string;
  prerequisiteText: string | null;
  antirequisiteText: string | null;
  creditWeight: number;
  level: number;
  breadth: "A" | "B" | "C" | null;
  essay: boolean;
}

export const rawCourses: RawCourse[] = JSON.parse(
  readFileSync(path.join(repoRoot, "packages/db/prisma/seed/data/courses.json"), "utf-8"),
);

export function loadYaml(rel: string): unknown {
  return parseYaml(readFileSync(path.join(repoRoot, rel), "utf-8"));
}

export const moduleFiles = readdirSync(path.join(repoRoot, "requirements/modules")).filter((f) => f.endsWith(".yaml"));

export const modules: Map<string, ModuleDefinition> = new Map(
  moduleFiles.map((f) => {
    const def = parseModuleDefinition(loadYaml(`requirements/modules/${f}`), f);
    return [def.code, def];
  }),
);

export const degree: DegreeDefinition = parseDegreeDefinition(
  loadYaml("requirements/degrees/honours-bachelor-of-science.yaml"),
  "honours-bachelor-of-science.yaml",
);

export const parserOptions: RequisiteParserOptions = {
  subjects: buildSubjectLookup(rawCourses.map((c) => ({ subject: c.subjectCode, subjectName: c.subjectName }))),
  modules: buildModuleLookup(modules.values()),
};

export const catalog: Catalog = buildCatalog(
  rawCourses.map(
    (c): CatalogCourse => ({
      subject: c.subjectCode,
      subjectName: c.subjectName,
      number: c.number,
      title: c.title,
      creditWeight: c.creditWeight,
      level: c.level,
      breadth: c.breadth,
      essay: c.essay,
      prerequisiteTree: parsePrerequisiteText(c.prerequisiteText, parserOptions).tree,
      antirequisiteTree: parseAntirequisiteText(c.antirequisiteText, parserOptions).tree,
    }),
  ),
);

function splitKey(key: string) {
  const i = key.indexOf(" ");
  return { subject: key.slice(0, i), number: key.slice(i + 1) };
}

export function auditPersona(email: string, now = new Date("2026-09-27T12:00:00Z")): DegreeAuditResult {
  const p = PERSONAS.find((x) => x.email === email);
  if (!p) throw new Error(`no persona ${email}`);
  const completed: CompletedCourse[] = p.completed.map((c) => ({
    course: splitKey(c.key),
    term: c.term,
    year: c.year,
    grade: c.grade,
  }));
  const inProgress: InProgressCourse[] = p.inProgress.map((c) => ({ course: splitKey(c.key), term: c.term, year: c.year }));
  return runDegreeAudit({
    studentId: email,
    programs: p.programs.map((pr) => {
      const def = modules.get(pr.code)!;
      return { code: pr.code, name: def.name, type: def.type as ModuleType, isPrimary: pr.isPrimary };
    }),
    completed,
    inProgress,
    catalog,
    degree,
    modules,
    now,
  });
}

export { PERSONAS };
