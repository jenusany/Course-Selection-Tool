import { createHash } from "node:crypto";
import { AUDIT_ENGINE_VERSION, runDegreeAudit, type DegreeAuditResult } from "@wcs/core";
import type { Prisma, PrismaClient } from "@prisma/client";
import { loadCatalog } from "./catalog.js";
import { loadRequirementSet } from "./requirements.js";
import { PrismaStudentRecordProvider } from "./providers/student-record.js";

// The only degree file so far. When requirements/degrees/ gains the 3-/4-year
// BSc, choose per student (from their programs) instead.
const DEGREE_CODE = "honours-bachelor-of-science";

/**
 * Runs (or reuses) the degree audit for a student. A DegreeAuditSnapshot is
 * reused only if its fingerprint — a hash of everything the audit reads —
 * still matches, so any change to the record, programs, catalog, requirement
 * YAML or engine version recomputes it. Each recompute appends a snapshot,
 * which doubles as audit history.
 *
 * Lives in packages/db (not apps/web) so both apps/web's dashboard/
 * counsellor pages and packages/chatbot's degree-audit tool call share one
 * implementation instead of duplicating the fingerprint/caching logic.
 */
export async function getDegreeAudit(prisma: PrismaClient, studentId: string): Promise<DegreeAuditResult> {
  const studentRecords = new PrismaStudentRecordProvider(prisma);
  const [profile, completed, inProgress, catalog] = await Promise.all([
    studentRecords.getProfile(studentId),
    studentRecords.getCompletedCourses(studentId),
    studentRecords.getInProgressCourses(studentId),
    loadCatalog(prisma),
  ]);
  const requirements = loadRequirementSet();
  const degree = requirements.degrees.get(DEGREE_CODE);
  if (!degree) throw new Error(`requirements/degrees has no "${DEGREE_CODE}" file`);

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        engine: AUDIT_ENGINE_VERSION,
        degree: DEGREE_CODE,
        programs: profile.programs,
        completed,
        inProgress,
        catalog: [...catalog.values()],
        requirements: [...requirements.sources.entries()],
      }),
    )
    .digest("hex");

  const cached = await prisma.degreeAuditSnapshot.findFirst({
    where: { studentId, fingerprint },
    orderBy: { generatedAt: "desc" },
  });
  if (cached) return cached.resultJson as unknown as DegreeAuditResult;

  const result = runDegreeAudit({
    studentId,
    programs: profile.programs,
    completed,
    inProgress,
    catalog,
    degree,
    modules: requirements.modules,
  });
  await prisma.degreeAuditSnapshot.create({
    data: {
      studentId,
      fingerprint,
      engineVersion: AUDIT_ENGINE_VERSION,
      generatedAt: new Date(result.generatedAt),
      resultJson: result as unknown as Prisma.InputJsonValue,
    },
  });
  return result;
}
