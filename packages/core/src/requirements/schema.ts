import { z } from "zod";

// ── Requirement DSL ──────────────────────────────────────────────────────
//
// Degree and module requirements are data (requirements/**/*.yaml), validated
// here at load time. Adding a module or reacting to a calendar change should
// only ever need a YAML edit — if a new calendar rule can't be expressed with
// these node types, add a node type here (and to the engine), don't special-case
// a module in code.

const markSchema = z.number().min(0).max(100);

export const courseRefSchema = z
  .object({
    subject: z.string().min(1),
    number: z.string().min(1),
    /** Minimum mark in this specific course for it to count (e.g. "Calculus 1301A/B with at least 85%"). */
    minMark: markSchema.optional(),
  })
  .strict();

/**
 * Pattern for pool requirements. Every field given must match; `{}` matches
 * any course. `number` pins one exact course and requires `subject`.
 */
export const courseMatcherSchema = z
  .object({
    subject: z.string().min(1).optional(),
    number: z.string().min(1).optional(),
    minLevel: z.number().int().min(0).optional(),
    maxLevel: z.number().int().min(0).optional(),
    breadth: z.enum(["A", "B", "C"]).optional(),
    essay: z.boolean().optional(),
  })
  .strict()
  .refine((m) => !(m.number && !m.subject), { message: "a matcher with `number` must also give `subject`" });

const credits = z.number().positive().multipleOf(0.5);

const baseFields = {
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  notes: z.array(z.string()).optional(),
  /** Minimum mark for any course counted by this requirement. */
  minMark: markSchema.optional(),
  /**
   * Ids of sibling requirements (same module) that may reuse courses already
   * counted here. By default a course counts toward at most one requirement
   * per module; this is the explicit opt-in. Sharing is symmetric.
   */
  allowSharedWith: z.array(z.string().min(1)).optional(),
};

const specificCourseSchema = z
  .object({ ...baseFields, type: z.literal("specificCourse"), course: courseRefSchema, credits: credits.optional() })
  .strict();

const allOfSchema = z
  .object({ ...baseFields, type: z.literal("allOf"), courses: z.array(courseRefSchema).min(1), credits: credits.optional() })
  .strict();

/** Without `credits`: any one listed course. With `credits`: that many credits' worth of the listed courses. */
const oneOfSchema = z
  .object({ ...baseFields, type: z.literal("oneOf"), courses: z.array(courseRefSchema).min(1), credits: credits.optional() })
  .strict();

const creditsFromListSchema = z
  .object({ ...baseFields, type: z.literal("creditsFromList"), credits, list: z.array(courseMatcherSchema).min(1) })
  .strict();

/** `credits` at `level` or above, optionally restricted to one subject (null/omitted = any subject). */
const creditsAtLevelSchema = z
  .object({
    ...baseFields,
    type: z.literal("creditsAtLevel"),
    credits,
    level: z.number().int().min(0),
    subject: z.string().min(1).nullable().optional(),
  })
  .strict();

/**
 * Total passed credits on the record. Doesn't consume courses (every course
 * counts toward the total regardless of where else it's used).
 */
const totalCreditsSchema = z
  .object({
    ...baseFields,
    type: z.literal("totalCredits"),
    credits,
    /** At most `credits` from courses below `level` count (e.g. max 7.0 first-year credits). */
    maxCreditsBelowLevel: z.object({ level: z.number().int(), credits }).strict().optional(),
    maxCreditsPerSubject: credits.optional(),
  })
  .strict();

/** Credit-weighted average of graded courses counted toward this module's other requirements. */
const moduleAverageSchema = z
  .object({
    ...baseFields,
    type: z.literal("moduleAverage"),
    minAverage: markSchema,
    minMarkPerCourse: markSchema.optional(),
  })
  .strict();

/** Credit-weighted average of every graded course on the record, failures included. */
const cumulativeAverageSchema = z
  .object({ ...baseFields, type: z.literal("cumulativeAverage"), minAverage: markSchema })
  .strict();

export type RequirementNode =
  | z.infer<typeof specificCourseSchema>
  | z.infer<typeof allOfSchema>
  | z.infer<typeof oneOfSchema>
  | z.infer<typeof creditsFromListSchema>
  | z.infer<typeof creditsAtLevelSchema>
  | z.infer<typeof totalCreditsSchema>
  | z.infer<typeof moduleAverageSchema>
  | z.infer<typeof cumulativeAverageSchema>
  | CountRequirement;

/** n-of-m composite: at least `n` of the nested requirements must be met. */
export interface CountRequirement {
  id: string;
  label?: string;
  notes?: string[];
  minMark?: number;
  allowSharedWith?: string[];
  type: "count";
  n: number;
  of: RequirementNode[];
}

export const requirementSchema: z.ZodType<RequirementNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    specificCourseSchema,
    allOfSchema,
    oneOfSchema,
    creditsFromListSchema,
    creditsAtLevelSchema,
    totalCreditsSchema,
    moduleAverageSchema,
    cumulativeAverageSchema,
    // `n <= of.length` is checked in checkRequirements (discriminatedUnion members can't carry refinements)
    z
      .object({
        ...baseFields,
        type: z.literal("count"),
        n: z.number().int().positive(),
        of: z.array(requirementSchema).min(1),
      })
      .strict(),
  ]),
);

export type RequirementType = RequirementNode["type"];
export type CourseRefSpec = z.infer<typeof courseRefSchema>;
export type CourseMatcher = z.infer<typeof courseMatcherSchema>;

/** Every requirement id in a tree (including nested `count` children), in document order. */
export function flattenRequirements(nodes: readonly RequirementNode[]): RequirementNode[] {
  const out: RequirementNode[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.type === "count") out.push(...flattenRequirements(n.of));
  }
  return out;
}

function checkRequirements(nodes: readonly RequirementNode[], ctx: z.RefinementCtx, path: (string | number)[]) {
  const all = flattenRequirements(nodes);
  const ids = new Set<string>();
  for (const r of all) {
    if (ids.has(r.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `duplicate requirement id "${r.id}"` });
    ids.add(r.id);
    if (r.type === "count" && r.n > r.of.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `requirement "${r.id}": n (${r.n}) exceeds the number of nested requirements (${r.of.length})`,
      });
    }
  }
  for (const r of all) {
    for (const other of r.allowSharedWith ?? []) {
      if (!ids.has(other)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `requirement "${r.id}" allowSharedWith unknown requirement "${other}"`,
        });
      }
    }
  }
}

const requirementListSchema = z.array(requirementSchema);

// ── Module file (requirements/modules/*.yaml) ───────────────────────────────

export const moduleTypeSchema = z.enum(["HONOURS_SPECIALIZATION", "MAJOR", "MINOR", "SPECIALIZATION", "GENERAL"]);

export const moduleDefinitionSchema = z
  .object({
    code: z.string().regex(/^[a-z0-9-]+$/, "module code must be kebab-case"),
    name: z.string().min(1),
    type: moduleTypeSchema,
    faculty: z.string().min(1),
    department: z.string().min(1),
    admission: z
      .object({
        minAverage: markSchema.optional(),
        minMarkPerCourse: markSchema.optional(),
        averageOverCredits: credits.optional(),
        requirements: requirementListSchema,
        notes: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    module: z
      .object({
        totalCredits: credits,
        requirements: requirementListSchema.min(1),
        notes: z.array(z.string()).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((m, ctx) => {
    checkRequirements(m.module.requirements, ctx, ["module", "requirements"]);
    if (m.admission) checkRequirements(m.admission.requirements, ctx, ["admission", "requirements"]);
  });

export type ModuleDefinition = z.infer<typeof moduleDefinitionSchema>;

// ── Degree file (requirements/degrees/*.yaml) ───────────────────────────────

export const degreeDefinitionSchema = z
  .object({
    code: z.string().regex(/^[a-z0-9-]+$/, "degree code must be kebab-case"),
    name: z.string().min(1),
    totalCredits: credits,
    seniorCreditMinimum: credits,
    maxFirstYearCredits: credits,
    maxCreditsInOneSubject: credits,
    residencyMinimumCredits: credits,
    scienceFacultyMinimumCredits: credits,
    breadth: z
      .object({ categories: z.array(z.enum(["A", "B", "C"])).min(1), minCreditsPerCategory: credits })
      .strict(),
    essay: z.object({ minCredits: credits, minSeniorCredits: credits }).strict(),
    grading: z
      .object({
        minMarkPerCourse: markSchema,
        minOverallAverage: markSchema,
        honoursModuleMinAverage: markSchema,
        honoursModuleMinMarkPerCourse: markSchema,
        honoursModuleExceptionalAverage: markSchema.optional(),
        additionalModuleMinAverage: markSchema,
      })
      .strict(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

export type DegreeDefinition = z.infer<typeof degreeDefinitionSchema>;

// ── Parsing helpers with readable errors ────────────────────────────────────

export class RequirementsValidationError extends Error {
  constructor(
    readonly source: string,
    readonly issues: z.ZodIssue[],
  ) {
    super(
      `Invalid requirements file ${source}:\n` +
        issues.map((i) => `  - ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`).join("\n"),
    );
    this.name = "RequirementsValidationError";
  }
}

export function parseModuleDefinition(raw: unknown, source = "<module>"): ModuleDefinition {
  const r = moduleDefinitionSchema.safeParse(raw);
  if (!r.success) throw new RequirementsValidationError(source, r.error.issues);
  return r.data;
}

export function parseDegreeDefinition(raw: unknown, source = "<degree>"): DegreeDefinition {
  const r = degreeDefinitionSchema.safeParse(raw);
  if (!r.success) throw new RequirementsValidationError(source, r.error.issues);
  return r.data;
}
