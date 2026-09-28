// Load simulator (PLAN.md §9): simulates N students hitting their
// enrollment appointment simultaneously, with and without pre-validation,
// and reports p50/p95/p99 latency + throughput for each — so the benefit of
// off-peak pre-processing is measured, not asserted.
//
// Usage: pnpm --filter @wcs/load-simulator simulate [N] [commitConcurrency]
// Requires: a seeded Postgres (DATABASE_URL) and Redis (REDIS_URL). Stop any
// already-running `pnpm --filter @wcs/workers start` process first — this
// script runs its own temporary Worker so concurrency numbers aren't shared
// with (and skewed by) another consumer on the same queue.
import { randomUUID } from "node:crypto";
import { QueueEvents, Worker } from "bullmq";
import { prisma } from "@wcs/db";
import { COMMIT_QUEUE, commitQueue, processCommitJob, redisConnection } from "@wcs/workers";

const N = Number(process.argv[2] ?? 500);
const COMMIT_CONCURRENCY = Number(process.argv[3] ?? 10);
const RUN_TAG = randomUUID().slice(0, 8);

interface ScenarioResult {
  label: string;
  n: number;
  enrolled: number;
  failed: number;
  totalWallMs: number;
  throughputPerSec: number;
  latenciesMs: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function report(r: ScenarioResult) {
  const sorted = [...r.latenciesMs].sort((a, b) => a - b);
  console.log(`\n=== ${r.label} ===`);
  console.log(`  students:        ${r.n}`);
  console.log(`  enrolled:        ${r.enrolled}`);
  console.log(`  failed:          ${r.failed} (section only has room for ${Math.floor(r.n / 2)})`);
  console.log(`  total wall time: ${r.totalWallMs.toFixed(0)}ms`);
  console.log(`  throughput:      ${r.throughputPerSec.toFixed(1)} commits/sec`);
  console.log(`  latency p50:     ${percentile(sorted, 50).toFixed(0)}ms`);
  console.log(`  latency p95:     ${percentile(sorted, 95).toFixed(0)}ms`);
  console.log(`  latency p99:     ${percentile(sorted, 99).toFixed(0)}ms`);
}

async function setup() {
  const course = await prisma.course.create({
    data: {
      subject: "LOADSIM",
      subjectName: "Load Simulator",
      number: `${RUN_TAG}A/B`,
      title: "Load simulator scratch course",
      creditWeight: 0.5,
      level: 1000,
      unverified: true,
    },
  });
  const section = await prisma.section.create({
    data: {
      courseId: course.id,
      term: "FALL",
      year: 2026,
      component: "LEC",
      sectionCode: "SIM",
      meetingTimes: [],
      capacity: Math.floor(N / 2), // deliberate contention: only half can get a seat
      enrolledCount: 0,
    },
  });

  const studentIds = Array.from({ length: N }, () => randomUUID());
  await prisma.user.createMany({
    data: studentIds.map((id, i) => ({ id: `u-${id}`, email: `loadsim-${RUN_TAG}-${i}@uwo.ca`, name: `Load Sim ${i}`, role: "STUDENT" })),
  });
  await prisma.student.createMany({
    data: studentIds.map((id, i) => ({ id, userId: `u-${id}`, year: 2, recordVersion: 1 })),
  });

  return { course, section, studentIds };
}

async function makeIntents(studentIds: string[], sectionId: string, courseId: string) {
  const appointmentTime = new Date(); // everyone's appointment "opens" right now
  const intents = await Promise.all(
    studentIds.map((studentId) =>
      prisma.enrollmentIntent.create({
        data: {
          studentId,
          term: "FALL",
          year: 2026,
          status: "PENDING",
          appointmentTime,
          items: [{ courseId, preferredSectionId: sectionId, fallbackSectionId: null }],
        },
      }),
    ),
  );
  return intents.map((i) => i.id);
}

async function runScenario(label: string, intentIds: string[]): Promise<ScenarioResult> {
  const worker = new Worker(COMMIT_QUEUE, processCommitJob, { connection: redisConnection, concurrency: COMMIT_CONCURRENCY });
  const events = new QueueEvents(COMMIT_QUEUE, { connection: redisConnection });
  await worker.waitUntilReady();
  await events.waitUntilReady();

  const enqueuedAt = new Map<string, number>();
  const latencies = new Map<string, number>();
  const done = new Promise<void>((resolve) => {
    let remaining = intentIds.length;
    const settle = (jobId: string) => {
      const start = enqueuedAt.get(jobId);
      if (start !== undefined) latencies.set(jobId, performance.now() - start);
      remaining--;
      if (remaining <= 0) resolve();
    };
    events.on("completed", ({ jobId }) => settle(jobId));
    events.on("failed", ({ jobId }) => settle(jobId));
  });

  const wallStart = performance.now();
  for (const intentId of intentIds) {
    enqueuedAt.set(intentId, performance.now());
    await commitQueue.add("commit", { intentId }, { jobId: intentId, removeOnComplete: true, removeOnFail: true });
  }
  await done;
  const totalWallMs = performance.now() - wallStart;

  await worker.close();
  await events.close();

  const results = await prisma.enrollmentIntent.findMany({ where: { id: { in: intentIds } }, select: { status: true } });
  const enrolled = results.filter((r) => r.status === "ENROLLED").length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  return {
    label,
    n: intentIds.length,
    enrolled,
    failed,
    totalWallMs,
    throughputPerSec: (intentIds.length / totalWallMs) * 1000,
    latenciesMs: [...latencies.values()],
  };
}

async function resetForRerun(intentIds: string[], sectionId: string) {
  await prisma.enrollmentAttempt.deleteMany({ where: { intentId: { in: intentIds } } });
  await prisma.enrollment.deleteMany({ where: { sectionId } });
  await prisma.section.update({ where: { id: sectionId }, data: { enrolledCount: 0 } });
  await prisma.enrollmentIntent.updateMany({ where: { id: { in: intentIds } }, data: { status: "PENDING" } });
}

async function cleanup(courseId: string, sectionId: string, studentIds: string[], intentIds: string[]) {
  await prisma.enrollmentAttempt.deleteMany({ where: { intentId: { in: intentIds } } });
  await prisma.preValidationResult.deleteMany({ where: { intentId: { in: intentIds } } });
  await prisma.enrollmentIntent.deleteMany({ where: { id: { in: intentIds } } });
  await prisma.enrollment.deleteMany({ where: { sectionId } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.user.deleteMany({ where: { id: { in: studentIds.map((id) => `u-${id}`) } } });
  await prisma.section.delete({ where: { id: sectionId } });
  await prisma.course.delete({ where: { id: courseId } });
}

async function main() {
  console.log(`Load simulator: N=${N} students, commit concurrency=${COMMIT_CONCURRENCY}, section capacity=${Math.floor(N / 2)}`);
  const { course, section, studentIds } = await setup();
  const intentIds = await makeIntents(studentIds, section.id, course.id);

  const withoutPreValidation = await runScenario("WITHOUT pre-validation (full validation at appointment time)", intentIds);

  await resetForRerun(intentIds, section.id);

  const preValStart = performance.now();
  // Simulates the ~72h-ahead off-peak worker — NOT counted in appointment-time latency below.
  const { preValidateIntent } = await import("@wcs/db/server");
  for (const intentId of intentIds) await preValidateIntent(prisma, intentId);
  console.log(`\n(pre-validated all ${N} intents off-peak in ${(performance.now() - preValStart).toFixed(0)}ms — not counted below)`);

  const withPreValidation = await runScenario("WITH pre-validation (cached fingerprint match at appointment time)", intentIds);

  report(withoutPreValidation);
  report(withPreValidation);

  const speedup = withoutPreValidation.totalWallMs / withPreValidation.totalWallMs;
  console.log(`\n=== Summary ===`);
  console.log(`  Pre-validation made appointment-time commit ${speedup.toFixed(2)}x faster in wall time`);
  console.log(
    `  (${withoutPreValidation.totalWallMs.toFixed(0)}ms -> ${withPreValidation.totalWallMs.toFixed(0)}ms for the same ${N} arrivals)`,
  );

  await cleanup(course.id, section.id, studentIds, intentIds);
  await prisma.$disconnect();
  await redisConnection.quit();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
