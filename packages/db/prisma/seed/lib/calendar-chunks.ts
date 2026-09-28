import type { PrismaClient } from "@prisma/client";
import { embedText, type DegreeDefinition, type ModuleDefinition, type RequirementNode, type CourseMatcher, type CourseRefSpec } from "@wcs/core";

/**
 * Populates CalendarChunk for the chatbot's RAG retrieval
 * (packages/chatbot/src/retrieve.ts). Every chunk's content is built from
 * real scraped data already in the database/requirement YAML (course
 * catalog text, module/degree requirement rules) — nothing here is
 * fabricated — and sourceRef is the real westerncalendar.uwo.ca page it came
 * from, taken from Course.sourceUrl or the requirement YAML files' own
 * "Source:" header comments. The embedding vector is a deterministic
 * hashing-trick mock (see packages/core/src/chatbot/embed.ts), not a real ML
 * embedding — flagged there and in DATA_TODO.md.
 *
 * Full rebuild every run (delete all, then reinsert) — chunks aren't
 * user-editable state like AdvisingNote, so there's nothing to preserve.
 */

const MODULE_SOURCE_URL: Record<string, string> = {
  "hsp-biology": "https://westerncalendar.uwo.ca/Modules.cfm?ModuleID=21135",
  "hsp-computer-science": "https://westerncalendar.uwo.ca/Modules.cfm?ModuleID=21123",
  "major-computer-science": "https://westerncalendar.uwo.ca/Modules.cfm?ModuleID=21112",
  "major-mathematics": "https://westerncalendar.uwo.ca/Modules.cfm?ModuleID=21058",
};

const DEGREE_SOURCE_URL: Record<string, string> = {
  "honours-bachelor-of-science": "https://westerncalendar.uwo.ca/PolicyPages.cfm?PolicyCategoryID=4",
};

function describeCourseRef(c: CourseRefSpec): string {
  return `${c.subject} ${c.number}${c.minMark ? ` (minimum ${c.minMark}%)` : ""}`;
}

function describeMatcher(m: CourseMatcher): string {
  if (m.subject && m.number) return describeCourseRef({ subject: m.subject, number: m.number });
  const parts: string[] = [];
  if (m.subject) parts.push(`subject ${m.subject}`);
  if (m.minLevel != null) parts.push(`level ${m.minLevel} or above`);
  if (m.maxLevel != null) parts.push(`level ${m.maxLevel} or below`);
  if (m.breadth) parts.push(`Breadth Category ${m.breadth}`);
  if (m.essay != null) parts.push(m.essay ? "essay courses" : "non-essay courses");
  return parts.length ? parts.join(", ") : "any course";
}

function describeRequirement(node: RequirementNode): string {
  switch (node.type) {
    case "specificCourse":
      return `Must complete ${describeCourseRef(node.course)}.`;
    case "allOf":
      return `Must complete all of: ${node.courses.map(describeCourseRef).join(", ")}.`;
    case "oneOf":
      return node.credits
        ? `Must complete ${node.credits} credits' worth from: ${node.courses.map(describeCourseRef).join(", ")}.`
        : `Must complete one of: ${node.courses.map(describeCourseRef).join(", ")}.`;
    case "creditsFromList":
      return `Must complete ${node.credits} credits from courses matching: ${node.list.map(describeMatcher).join("; or ")}.`;
    case "creditsAtLevel":
      return `Must complete ${node.credits} credits at the ${node.level} level or above${node.subject ? ` in ${node.subject}` : ""}.`;
    case "totalCredits": {
      let s = `Requires ${node.credits} total credits in the module.`;
      if (node.maxCreditsBelowLevel) {
        s += ` At most ${node.maxCreditsBelowLevel.credits} of these may be below the ${node.maxCreditsBelowLevel.level} level.`;
      }
      if (node.maxCreditsPerSubject) s += ` At most ${node.maxCreditsPerSubject} credits may come from a single subject.`;
      return s;
    }
    case "moduleAverage":
      return `Requires a module average of at least ${node.minAverage}%${node.minMarkPerCourse ? `, with no counted course below ${node.minMarkPerCourse}%` : ""}.`;
    case "cumulativeAverage":
      return `Requires a cumulative average of at least ${node.minAverage}% across the full academic record.`;
    case "count":
      return `At least ${node.n} of the following ${node.of.length} must be satisfied: ${node.of.map(describeRequirement).join(" ")}`;
  }
}

const MODULE_HEADER = (m: ModuleDefinition) =>
  `${m.name} (${m.type.replace(/_/g, " ").toLowerCase()}), ${m.faculty} — ${m.department}.`;

/**
 * Several focused chunks per module rather than one long blob — a long
 * chunk's bag-of-words vector dilutes across so much vocabulary that it
 * stops ranking near short, topically-narrow queries even when it's the
 * right answer (measured directly: retrieval for "Computer Science Honours
 * Specialization requirements" ranked several single-course chunks above
 * the HSp-CS module chunk before this split). Real chunking pipelines keep
 * chunks small for the same reason — this isn't just working around the
 * mock embedding's limits.
 */
function moduleChunks(m: ModuleDefinition): string[] {
  const chunks: string[] = [];

  if (m.admission) {
    const lines = [MODULE_HEADER(m), "Admission requirements:"];
    if (m.admission.minAverage) {
      lines.push(
        `Requires an admission average of at least ${m.admission.minAverage}% over ${m.admission.averageOverCredits ?? "the relevant"} credits${m.admission.minMarkPerCourse ? `, no course below ${m.admission.minMarkPerCourse}%` : ""}.`,
      );
    }
    lines.push(...m.admission.requirements.map(describeRequirement));
    lines.push(...(m.admission.notes ?? []));
    chunks.push(lines.join("\n"));
  }

  const reqLines = m.module.requirements.map(describeRequirement);
  const GROUP_SIZE = 4;
  for (let i = 0; i < reqLines.length; i += GROUP_SIZE) {
    const group = reqLines.slice(i, i + GROUP_SIZE);
    chunks.push([MODULE_HEADER(m), `Module requirements (${m.module.totalCredits} credits total):`, ...group].join("\n"));
  }

  if (m.module.notes && m.module.notes.length > 0) {
    chunks.push([MODULE_HEADER(m), "Module notes:", ...m.module.notes].join("\n"));
  }

  return chunks;
}

function degreeChunks(d: DegreeDefinition): string[] {
  const overview = [
    `${d.name} — Faculty of Science degree requirements.`,
    `Total credits required: ${d.totalCredits}. Senior credit minimum (2000-4999 level): ${d.seniorCreditMinimum}. Maximum first-year credits: ${d.maxFirstYearCredits}. Maximum credits in one subject: ${d.maxCreditsInOneSubject}.`,
    `Residency minimum (credits completed through Western or an affiliated college): ${d.residencyMinimumCredits}. Minimum credits from the Faculty of Science: ${d.scienceFacultyMinimumCredits}.`,
  ].join("\n");

  const breadthEssay = [
    `${d.name} — breadth and essay requirements.`,
    `Breadth: at least ${d.breadth.minCreditsPerCategory} credit(s) from each of Category ${d.breadth.categories.join(", ")}.`,
    `Essay: at least ${d.essay.minCredits} essay credits overall, of which at least ${d.essay.minSeniorCredits} must be senior (2000+ level).`,
  ].join("\n");

  const grading = [
    `${d.name} — grading and honours average requirements.`,
    `Minimum mark to pass a course: ${d.grading.minMarkPerCourse}%. Minimum overall average: ${d.grading.minOverallAverage}%.`,
    `Honours module minimum average: ${d.grading.honoursModuleMinAverage}%, with no course below ${d.grading.honoursModuleMinMarkPerCourse}%.`,
    d.grading.honoursModuleExceptionalAverage
      ? `In exceptional circumstances, a student averaging at least ${d.grading.honoursModuleExceptionalAverage}% (still no course below ${d.grading.honoursModuleMinMarkPerCourse}%) may graduate with the Dean's permission.`
      : "",
    `Additional Major/Minor modules beyond the primary one require at least a ${d.grading.additionalModuleMinAverage}% average.`,
    ...(d.notes ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  return [overview, breadthEssay, grading];
}

export async function seedCalendarChunks(prisma: PrismaClient, modules: Iterable<ModuleDefinition>, degrees: Iterable<DegreeDefinition>) {
  await prisma.$executeRaw`DELETE FROM "CalendarChunk"`;

  const moduleList = [...modules];
  const degreeList = [...degrees];

  type Chunk = { sourceRef: string; content: string; metadata: Record<string, unknown> };
  const chunks: Chunk[] = [];

  const courses = await prisma.course.findMany({
    select: {
      subject: true,
      number: true,
      title: true,
      description: true,
      prerequisiteText: true,
      antirequisiteText: true,
      corequisiteText: true,
      creditWeight: true,
      essay: true,
      breadth: true,
      sourceUrl: true,
    },
  });
  for (const c of courses) {
    const content = [
      `${c.subject} ${c.number} — ${c.title} (${c.creditWeight} credit${c.creditWeight === 1 ? "" : "s"}${c.essay ? ", essay course" : ""}${c.breadth ? `, Breadth Category ${c.breadth}` : ""}).`,
      c.description ?? "",
      `Prerequisite(s): ${c.prerequisiteText ?? "None listed."}`,
      `Antirequisite(s): ${c.antirequisiteText ?? "None listed."}`,
      c.corequisiteText ? `Corequisite(s): ${c.corequisiteText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    chunks.push({
      sourceRef: c.sourceUrl ?? `https://westerncalendar.uwo.ca/Courses.cfm?Subject=${c.subject}&SelectedCalendar=Live&ArchiveID=`,
      content,
      metadata: { type: "course", subject: c.subject, number: c.number },
    });
  }

  for (const m of moduleList) {
    for (const content of moduleChunks(m)) {
      chunks.push({
        sourceRef: MODULE_SOURCE_URL[m.code] ?? "https://westerncalendar.uwo.ca/",
        content,
        metadata: { type: "module", code: m.code },
      });
    }
  }

  for (const d of degreeList) {
    for (const content of degreeChunks(d)) {
      chunks.push({
        sourceRef: DEGREE_SOURCE_URL[d.code] ?? "https://westerncalendar.uwo.ca/",
        content,
        metadata: { type: "degree", code: d.code },
      });
    }
  }

  for (const chunk of chunks) {
    const embedding = embedText(chunk.content);
    const vectorLiteral = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      INSERT INTO "CalendarChunk" (id, "sourceRef", content, embedding, metadata, "createdAt")
      VALUES (gen_random_uuid()::text, ${chunk.sourceRef}, ${chunk.content}, ${vectorLiteral}::vector, ${JSON.stringify(chunk.metadata)}::jsonb, now())
    `;
  }

  console.log(`Seeded ${chunks.length} calendar chunks (${courses.length} courses, ${moduleList.length} modules, ${degreeList.length} degree file(s)).`);
}
