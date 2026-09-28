// Standalone worker process: `pnpm --filter @wcs/workers start`. Separate
// from apps/web on purpose — the commit queue's concurrency cap is the
// admission-control mechanism (see PLAN.md §9), and that only means
// anything if it's a fixed number of real OS processes/threads pulling
// jobs, not something serverless request handlers can enforce.
import { Worker } from "bullmq";
import { redisConnection } from "./connection.js";
import { COMMIT_QUEUE, PRE_VALIDATION_QUEUE } from "./queues.js";
import { processCommitJob, processPreValidationJob } from "./processors.js";
import { scheduleRecurringScan } from "./scheduler.js";

const COMMIT_CONCURRENCY = Number(process.env.WORKERS_COMMIT_CONCURRENCY ?? 10);
const PRE_VALIDATION_CONCURRENCY = Number(process.env.WORKERS_PREVALIDATION_CONCURRENCY ?? 20);
const SCAN_INTERVAL_MS = Number(process.env.WORKERS_SCAN_INTERVAL_MS ?? 60_000);

const preValidationWorker = new Worker(PRE_VALIDATION_QUEUE, processPreValidationJob, {
  connection: redisConnection,
  concurrency: PRE_VALIDATION_CONCURRENCY,
});

const commitWorker = new Worker(COMMIT_QUEUE, processCommitJob, {
  connection: redisConnection,
  concurrency: COMMIT_CONCURRENCY,
});

for (const [name, worker] of [
  ["pre-validation", preValidationWorker],
  ["commit", commitWorker],
] as const) {
  worker.on("completed", (job) => console.log(`[${name}] completed ${job.id} (${job.name})`));
  worker.on("failed", (job, err) => console.error(`[${name}] FAILED ${job?.id} (${job?.name}):`, err.message));
}

await scheduleRecurringScan(SCAN_INTERVAL_MS);

console.log(
  `Workers running — pre-validation concurrency=${PRE_VALIDATION_CONCURRENCY}, commit concurrency=${COMMIT_CONCURRENCY}, scan every ${SCAN_INTERVAL_MS}ms`,
);

async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all([preValidationWorker.close(), commitWorker.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
