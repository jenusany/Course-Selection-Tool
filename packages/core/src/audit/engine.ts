import { courseKey, type Catalog } from "../catalog.js";
import { collectCourseRefs } from "../prereq/evaluate.js";
import type { DegreeDefinition, ModuleDefinition, RequirementNode } from "../requirements/schema.js";
import type {
  AuditAdvisory,
  AuditWarning,
  CompletedCourse,
  DegreeAuditResult,
  InProgressCourse,
  ModuleAuditResult,
  RequirementResult,
  RequirementStatus,
  StudentProfile,
} from "../types/domain.js";
import { evaluateRequirements } from "./evaluate.js";
import { normalizeRecord, type AuditRecord } from "./record.js";

/** Bump when a change to the engine would change results for the same input (invalidates cached snapshots). */
export const AUDIT_ENGINE_VERSION = "2.0.0";

export interface DegreeAuditInput {
  studentId: string;
  programs: StudentProfile["programs"];
  completed: readonly CompletedCourse[];
  inProgress: readonly InProgressCourse[];
  catalog: Catalog;
  degree: DegreeDefinition;
  /** Module definitions by module code. Every program on the student's record must be present. */
  modules: ReadonlyMap<string, ModuleDefinition>;
  now?: Date;
}

const MODULE_AVERAGE_ID = "module-average";

export function combineStatuses(statuses: readonly RequirementStatus[]): RequirementStatus {
  if (statuses.every((s) => s === "MET")) return "MET";
  if (statuses.every((s) => s !== "UNMET")) return "IN_PROGRESS";
  return "UNMET";
}

/**
 * Honours module thresholds apply to the modules that make up the honours
 * degree: the Honours Specialization, or — when there's no HSp — each Major
 * of a Double Major. Every other module gets the "additional module" average.
 */
function isHonoursModule(def: ModuleDefinition, programs: DegreeAuditInput["programs"]): boolean {
  if (def.type === "HONOURS_SPECIALIZATION") return true;
  const hasHsp = programs.some((p) => p.type === "HONOURS_SPECIALIZATION");
  const majors = programs.filter((p) => p.type === "MAJOR").length;
  return def.type === "MAJOR" && !hasHsp && majors >= 2;
}

function evaluateModule(
  def: ModuleDefinition,
  isPrimary: boolean,
  honours: boolean,
  input: DegreeAuditInput,
  record: AuditRecord,
): { result: ModuleAuditResult; advisories: AuditAdvisory[] } {
  const g = input.degree.grading;
  const requirements: RequirementNode[] = [...def.module.requirements];
  // The degree regulations set the module average rule; a module file may state its own instead.
  if (!requirements.some((r) => r.type === "moduleAverage")) {
    requirements.push(
      honours
        ? {
            id: MODULE_AVERAGE_ID,
            type: "moduleAverage",
            label: `Module average of at least ${g.honoursModuleMinAverage}% (no mark below ${g.honoursModuleMinMarkPerCourse}%)`,
            minAverage: g.honoursModuleMinAverage,
            minMarkPerCourse: g.honoursModuleMinMarkPerCourse,
          }
        : {
            id: MODULE_AVERAGE_ID,
            type: "moduleAverage",
            label: `Module average of at least ${g.additionalModuleMinAverage}%`,
            minAverage: g.additionalModuleMinAverage,
          },
    );
  }

  const { results, allocated } = evaluateRequirements(requirements, {
    catalog: input.catalog,
    record,
    exclusive: true,
    // In an honours module a course below the per-course minimum can't count toward the module at all.
    minMarkPerCourse: honours ? g.honoursModuleMinMarkPerCourse : undefined,
  });

  const done = allocated.filter((c) => c.status === "COMPLETED").reduce((s, c) => s + c.creditWeight, 0);
  const ip = allocated.filter((c) => c.status === "IN_PROGRESS").reduce((s, c) => s + c.creditWeight, 0);
  const creditsCompleted = Math.min(done, def.module.totalCredits);

  const advisories: AuditAdvisory[] = [];
  const avg = results.find((r) => r.type === "moduleAverage")?.average;
  if (
    honours &&
    g.honoursModuleExceptionalAverage !== undefined &&
    avg?.value != null &&
    avg.value < avg.required &&
    avg.value >= g.honoursModuleExceptionalAverage
  ) {
    advisories.push({
      source: def.code,
      message:
        `${def.name}: module average is ${avg.value.toFixed(1)}%, below the ${avg.required}% requirement but at least ` +
        `${g.honoursModuleExceptionalAverage}%. In exceptional circumstances the Dean may permit graduation with an ` +
        `average of at least ${g.honoursModuleExceptionalAverage}% — speak with an academic counsellor.`,
    });
  }

  return {
    result: {
      code: def.code,
      name: def.name,
      type: def.type,
      isPrimary,
      status: combineStatuses(results.map((r) => r.status)),
      creditsRequired: def.module.totalCredits,
      creditsCompleted: Math.round(creditsCompleted * 100) / 100,
      creditsInProgress: Math.round(Math.min(ip, def.module.totalCredits - creditsCompleted) * 100) / 100,
      requirements: results,
      notes: def.module.notes ?? [],
    },
    advisories,
  };
}

/** Degree-level rules from the degree YAML, expressed as requirement nodes and evaluated in shared mode. */
function degreeRequirementNodes(d: DegreeDefinition): RequirementNode[] {
  return [
    {
      id: "degree-total-credits",
      type: "totalCredits",
      label: `${d.totalCredits.toFixed(1)} credits (max ${d.maxFirstYearCredits.toFixed(1)} first-year, max ${d.maxCreditsInOneSubject.toFixed(1)} in one subject)`,
      credits: d.totalCredits,
      maxCreditsBelowLevel: { level: 2000, credits: d.maxFirstYearCredits },
      maxCreditsPerSubject: d.maxCreditsInOneSubject,
    },
    {
      id: "degree-senior-credits",
      type: "creditsAtLevel",
      label: `${d.seniorCreditMinimum.toFixed(1)} senior credits (2000 level or above)`,
      credits: d.seniorCreditMinimum,
      level: 2000,
    },
    ...d.breadth.categories.map(
      (cat): RequirementNode => ({
        id: `degree-breadth-${cat}`,
        type: "creditsFromList",
        label: `Breadth: ${d.breadth.minCreditsPerCategory.toFixed(1)} credit from Category ${cat}`,
        credits: d.breadth.minCreditsPerCategory,
        list: [{ breadth: cat }],
      }),
    ),
    {
      id: "degree-essay",
      type: "creditsFromList",
      label: `${d.essay.minCredits.toFixed(1)} essay credits`,
      credits: d.essay.minCredits,
      list: [{ essay: true }],
    },
    {
      id: "degree-essay-senior",
      type: "creditsFromList",
      label: `${d.essay.minSeniorCredits.toFixed(1)} senior essay credit (2000 level or above)`,
      credits: d.essay.minSeniorCredits,
      list: [{ essay: true, minLevel: 2000 }],
    },
    {
      id: "degree-cumulative-average",
      type: "cumulativeAverage",
      label: `Cumulative average of at least ${d.grading.minOverallAverage}%`,
      minAverage: d.grading.minOverallAverage,
    },
  ];
}

function moduleCombinationResult(programs: DegreeAuditInput["programs"]): RequirementResult {
  const hsp = programs.filter((p) => p.type === "HONOURS_SPECIALIZATION").length;
  const majors = programs.filter((p) => p.type === "MAJOR").length;
  const ok = hsp >= 1 || majors >= 2;
  return {
    id: "degree-module-combination",
    label: "Honours Specialization or Double Major",
    type: "moduleCombination",
    status: ok ? "MET" : "UNMET",
    creditsRequired: 0,
    creditsCompleted: 0,
    creditsInProgress: 0,
    satisfiedBy: [],
    inProgressBy: [],
    suggestedCourses: [],
    notes:
      programs.length === 0
        ? ["No module declared yet."]
        : ok
          ? []
          : ["The Honours Bachelor of Science requires at least an Honours Specialization module or Double Major modules."],
  };
}

function antirequisiteWarnings(record: AuditRecord): AuditWarning[] {
  const onRecord = new Map(record.courses.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const warnings: AuditWarning[] = [];
  for (const c of record.courses) {
    if (!c.antirequisiteTree) continue;
    for (const ref of collectCourseRefs(c.antirequisiteTree)) {
      const other = onRecord.get(courseKey(ref));
      if (!other || other.key === c.key) continue;
      const pair = [c.key, other.key].sort().join(" | ");
      if (seen.has(pair)) continue;
      seen.add(pair);
      warnings.push({
        type: "ANTIREQUISITE_CONFLICT",
        message:
          `${c.key} and ${other.key} are antirequisites — credit can only be kept for one of them. ` +
          `Both are currently counted in this audit; a counsellor should confirm which one stands.`,
        courses: [c.ref, other.ref],
      });
    }
  }
  return warnings;
}

export function runDegreeAudit(input: DegreeAuditInput): DegreeAuditResult {
  const { degree } = input;
  const record = normalizeRecord(input.completed, input.inProgress, input.catalog, degree.grading.minMarkPerCourse);

  const advisories: AuditAdvisory[] = [];
  const modules: ModuleAuditResult[] = [];
  const programs = [...input.programs].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  for (const p of programs) {
    const def = input.modules.get(p.code);
    if (!def) throw new Error(`No requirements file loaded for module "${p.code}"`);
    const { result, advisories: a } = evaluateModule(def, p.isPrimary, isHonoursModule(def, input.programs), input, record);
    modules.push(result);
    advisories.push(...a);
  }

  const { results: degreeResults } = evaluateRequirements(degreeRequirementNodes(degree), {
    catalog: input.catalog,
    record,
    exclusive: false,
  });
  const degreeRequirements = [moduleCombinationResult(input.programs), ...degreeResults];
  const total = degreeResults.find((r) => r.id === "degree-total-credits")!;

  return {
    studentId: input.studentId,
    generatedAt: (input.now ?? new Date()).toISOString(),
    engineVersion: AUDIT_ENGINE_VERSION,
    degree: { code: degree.code, name: degree.name },
    status: combineStatuses([...modules.map((m) => m.status), ...degreeRequirements.map((r) => r.status)]),
    creditsRequired: degree.totalCredits,
    creditsCompleted: total.creditsCompleted,
    creditsInProgress: total.creditsInProgress,
    modules,
    degreeRequirements,
    advisories,
    warnings: [...record.warnings, ...antirequisiteWarnings(record)],
    notEvaluated: [
      `Residency (at least ${degree.residencyMinimumCredits.toFixed(1)} credits taken at Western): transfer credit isn't modelled, so every course on the record is treated as a Western course.`,
      `Faculty of Science minimum (${degree.scienceFacultyMinimumCredits.toFixed(1)} credits from Science offerings): needs a subject-to-faculty mapping the seed data doesn't have yet.`,
    ],
  };
}
