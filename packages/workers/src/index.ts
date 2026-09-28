// Producer-side exports — safe to import from apps/web (only needs ioredis
// to enqueue). The consumer side (Worker instances) only runs in run.ts,
// the standalone worker process — except processCommitJob/redisConnection,
// also exported for scripts/load-simulator, which runs its own temporary
// Worker to measure the commit path under controlled concurrency.
export { COMMIT_QUEUE, PRE_VALIDATION_QUEUE, commitQueue, enqueuePreValidation, preValidationQueue, scheduleCommitJob } from "./queues.js";
export { getLoadSnapshot, type LoadSnapshot, type QueueLoad } from "./metrics.js";
export { redisConnection } from "./connection.js";
export { processCommitJob, processPreValidationJob } from "./processors.js";
