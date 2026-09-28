import type { PrismaClient } from "@prisma/client";
import {
  computeEnrollmentFingerprint,
  validateEnrollmentIntent,
  type EnrollmentIntentItem,
  type EnrollmentIntentValidation,
  type FingerprintInput,
} from "@wcs/core";
import { loadCatalog } from "./catalog.js";
import { PrismaStudentRecordProvider } from "./providers/student-record.js";

interface RawIntentItem {
  courseId: string;
  preferredSectionId: string | null;
  fallbackSectionId: string | null;
}

function sectionIdsOf(items: RawIntentItem[]): string[] {
  return [...new Set(items.flatMap((i) => [i.preferredSectionId, i.fallbackSectionId].filter((x): x is string => !!x)))];
}

/** Everything the fingerprint reads, freshly loaded — used both to pre-validate and to detect drift at commit time. */
export async function loadFingerprintInput(prisma: PrismaClient, studentId: string, items: RawIntentItem[]): Promise<FingerprintInput> {
  const [student, holds, sections] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { recordVersion: true } }),
    prisma.hold.findMany({ where: { studentId, resolvedAt: null }, select: { id: true, version: true } }),
    prisma.section.findMany({ where: { id: { in: sectionIdsOf(items) } }, select: { id: true, version: true } }),
  ]);
  return { studentRecordVersion: student.recordVersion, holds, sections };
}

/**
 * Runs the full intent validation from scratch: loads the catalog, the
 * student's record, and every referenced section, then delegates to
 * packages/core's validateEnrollmentIntent. Shared by the pre-validation
 * worker (which only stores the result) and the commit worker (when no
 * fresh-enough cached result exists).
 */
export async function runEnrollmentValidation(
  prisma: PrismaClient,
  studentId: string,
  items: RawIntentItem[],
): Promise<EnrollmentIntentValidation> {
  const provider = new PrismaStudentRecordProvider(prisma);
  const [catalog, completed, inProgress, profile, holds, sections, courses] = await Promise.all([
    loadCatalog(prisma),
    provider.getCompletedCourses(studentId),
    provider.getInProgressCourses(studentId),
    provider.getProfile(studentId),
    prisma.hold.findMany({ where: { studentId, resolvedAt: null } }),
    prisma.section.findMany({ where: { id: { in: sectionIdsOf(items) } } }),
    prisma.course.findMany({ where: { id: { in: items.map((i) => i.courseId) } } }),
  ]);

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const resolvedItems: EnrollmentIntentItem[] = items.flatMap((item) => {
    const course = courseById.get(item.courseId);
    if (!course) return []; // course was removed from the catalog since the intent was created; skip rather than crash
    const toSectionInfo = (id: string | null) => {
      const s = id ? sectionById.get(id) : undefined;
      return s ? { id: s.id, meetingTimes: s.meetingTimes as never, capacity: s.capacity, enrolledCount: s.enrolledCount } : null;
    };
    return [
      {
        courseId: item.courseId,
        course: {
          subject: course.subject,
          number: course.number,
          title: course.title,
          creditWeight: course.creditWeight,
          level: course.level,
          breadth: course.breadth,
          essay: course.essay,
          prerequisiteTree: course.prerequisiteTree as never,
          antirequisiteTree: course.antirequisiteTree as never,
        },
        preferredSection: toSectionInfo(item.preferredSectionId),
        fallbackSection: toSectionInfo(item.fallbackSectionId),
      },
    ];
  });

  return validateEnrollmentIntent({
    items: resolvedItems,
    completed,
    inProgress: inProgress.map((i) => i.course),
    catalog,
    moduleCodes: profile.programs.map((p) => p.code),
    hasUnresolvedHold: holds.length > 0,
  });
}

export interface SeatCommitResult {
  committed: boolean;
  section: { id: string; capacity: number; enrolledCount: number; version: number } | null;
}

/**
 * Atomic conditional UPDATE — the only place a seat is actually taken. No
 * application-level locking: the WHERE clause is the concurrency control,
 * so two commit workers racing on the same section can never both succeed
 * past capacity (see packages/db/test/enrollment-commit.test.ts).
 */
export async function commitSeat(prisma: PrismaClient, sectionId: string): Promise<SeatCommitResult> {
  const rows = await prisma.$queryRaw<Array<{ id: string; capacity: number; enrolledCount: number; version: number }>>`
    UPDATE "Section"
    SET "enrolledCount" = "enrolledCount" + 1, "version" = "version" + 1, "updatedAt" = now()
    WHERE id = ${sectionId} AND "enrolledCount" < "capacity"
    RETURNING id, capacity, "enrolledCount", version
  `;
  return { committed: rows.length > 0, section: rows[0] ?? null };
}

export interface ItemCommitOutcome {
  courseId: string;
  sectionId: string | null;
  outcome: "ENROLLED" | "FAILED";
  reason: string | null;
}

export interface CommitIntentResult {
  status: "ENROLLED" | "PARTIALLY_ENROLLED" | "FAILED";
  usedCachedValidation: boolean;
  items: ItemCommitOutcome[];
}

/**
 * The appointment-time commit path. Recomputes the fingerprint and reuses a
 * matching PreValidationResult if one exists (the fast path pre-validation
 * exists to enable); otherwise validates fresh. Then commits seats one item
 * at a time via the atomic conditional UPDATE, writes an EnrollmentAttempt
 * per item (the audit log), and an Enrollment row per success — guarded by
 * Enrollment's (studentId, courseId, term, year) unique constraint, so a
 * retried job that already succeeded no-ops instead of double-enrolling.
 */
export async function commitEnrollmentIntent(prisma: PrismaClient, intentId: string): Promise<CommitIntentResult> {
  const intent = await prisma.enrollmentIntent.findUniqueOrThrow({ where: { id: intentId } });
  await prisma.enrollmentIntent.update({ where: { id: intentId }, data: { status: "VALIDATING" } });

  const items = intent.items as unknown as RawIntentItem[];
  const fingerprint = computeEnrollmentFingerprint(await loadFingerprintInput(prisma, intent.studentId, items));

  const cached = await prisma.preValidationResult.findFirst({
    where: { intentId, fingerprint },
    orderBy: { computedAt: "desc" },
  });
  const validation = cached
    ? (cached.resultJson as unknown as EnrollmentIntentValidation)
    : await runEnrollmentValidation(prisma, intent.studentId, items);

  const outcomes: ItemCommitOutcome[] = [];

  if (validation.blockedByHold) {
    for (const item of validation.items) {
      await prisma.enrollmentAttempt.create({
        data: { intentId, courseId: item.courseId, sectionId: null, outcome: "FAILED", reason: "Blocked by an unresolved hold on your account." },
      });
      outcomes.push({ courseId: item.courseId, sectionId: null, outcome: "FAILED", reason: "hold" });
    }
  } else {
    for (const item of validation.items) {
      if (item.chosen === "none" || !item.chosenSectionId) {
        const reason = (item.preferredConflicts[0]?.message ?? "No committable section.");
        await prisma.enrollmentAttempt.create({
          data: { intentId, courseId: item.courseId, sectionId: null, outcome: "FAILED", reason },
        });
        outcomes.push({ courseId: item.courseId, sectionId: null, outcome: "FAILED", reason });
        continue;
      }

      // Idempotency: a retried job that already committed this course finds it here and skips re-committing a seat.
      const already = await prisma.enrollment.findUnique({
        where: { studentId_courseId_term_year: { studentId: intent.studentId, courseId: item.courseId, term: intent.term, year: intent.year } },
      });
      if (already) {
        outcomes.push({ courseId: item.courseId, sectionId: already.sectionId, outcome: "ENROLLED", reason: null });
        continue;
      }

      const seat = await commitSeat(prisma, item.chosenSectionId);
      if (!seat.committed) {
        const reason = "The section filled between pre-validation and your appointment.";
        await prisma.enrollmentAttempt.create({
          data: { intentId, courseId: item.courseId, sectionId: item.chosenSectionId, outcome: "FAILED", reason },
        });
        outcomes.push({ courseId: item.courseId, sectionId: item.chosenSectionId, outcome: "FAILED", reason });
        continue;
      }

      await prisma.enrollment.create({
        data: {
          studentId: intent.studentId,
          courseId: item.courseId,
          sectionId: item.chosenSectionId,
          term: intent.term,
          year: intent.year,
          status: "IN_PROGRESS",
        },
      });
      await prisma.enrollmentAttempt.create({
        data: { intentId, courseId: item.courseId, sectionId: item.chosenSectionId, outcome: "ENROLLED", reason: null },
      });
      outcomes.push({ courseId: item.courseId, sectionId: item.chosenSectionId, outcome: "ENROLLED", reason: null });
    }
  }

  const enrolledCount = outcomes.filter((o) => o.outcome === "ENROLLED").length;
  const status = enrolledCount === 0 ? "FAILED" : enrolledCount === outcomes.length ? "ENROLLED" : "PARTIALLY_ENROLLED";

  await prisma.$transaction([
    prisma.enrollmentIntent.update({ where: { id: intentId }, data: { status } }),
    prisma.student.update({ where: { id: intent.studentId }, data: { recordVersion: { increment: 1 } } }),
  ]);

  return { status, usedCachedValidation: !!cached, items: outcomes };
}

/** Runs pre-validation for one intent and stores the result, keyed by the current fingerprint. */
export async function preValidateIntent(prisma: PrismaClient, intentId: string): Promise<void> {
  const intent = await prisma.enrollmentIntent.findUniqueOrThrow({ where: { id: intentId } });
  const items = intent.items as unknown as RawIntentItem[];
  const fingerprint = computeEnrollmentFingerprint(await loadFingerprintInput(prisma, intent.studentId, items));
  const existing = await prisma.preValidationResult.findFirst({ where: { intentId, fingerprint } });
  if (existing) return; // already validated against this exact state
  const result = await runEnrollmentValidation(prisma, intent.studentId, items);
  await prisma.preValidationResult.create({
    data: { intentId, fingerprint, resultJson: result as unknown as never },
  });
}

/** Intents whose appointment is within the pre-validation window and haven't been validated against their current state yet. */
export async function findIntentsDueForPreValidation(prisma: PrismaClient, withinHours = 72) {
  const cutoff = new Date(Date.now() + withinHours * 60 * 60 * 1000);
  return prisma.enrollmentIntent.findMany({
    where: { status: "PENDING", appointmentTime: { lte: cutoff } },
    select: { id: true },
  });
}
