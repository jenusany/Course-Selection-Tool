import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";

export const PRE_VALIDATION_QUEUE = "enrollment-prevalidation";
export const COMMIT_QUEUE = "enrollment-commit";

export interface PreValidationJobData {
  intentId: string;
}

/** The recurring scan job carries no payload — it looks up what's due itself. */
export interface ScanJobData {
  intentId?: undefined;
}

export interface CommitJobData {
  intentId: string;
}

const globalForQueues = globalThis as unknown as {
  wcsPreValidationQueue?: Queue<PreValidationJobData | ScanJobData>;
  wcsCommitQueue?: Queue<CommitJobData>;
};

export const preValidationQueue: Queue<PreValidationJobData | ScanJobData> =
  globalForQueues.wcsPreValidationQueue ?? new Queue<PreValidationJobData | ScanJobData>(PRE_VALIDATION_QUEUE, { connection: redisConnection });

export const commitQueue: Queue<CommitJobData> =
  globalForQueues.wcsCommitQueue ?? new Queue<CommitJobData>(COMMIT_QUEUE, { connection: redisConnection });

if (process.env.NODE_ENV !== "production") {
  globalForQueues.wcsPreValidationQueue = preValidationQueue;
  globalForQueues.wcsCommitQueue = commitQueue;
}

// BullMQ rejects custom job ids containing ":" (throws "Custom Id cannot
// contain :") — cuid()s never do, but keep these as one tested spot rather
// than inlined template strings, since it's an easy regression to reintroduce.
export const commitJobId = (intentId: string) => `commit-${intentId}`;
export const preValidationJobId = (intentId: string, at: number) => `prevalidate-${intentId}-${at}`;

/**
 * Schedules the appointment-time commit job. Delayed exactly to
 * `appointmentTime` — no seat is ever reserved before then (fairness). Job
 * id is the intent id, so re-scheduling (e.g. re-submitting a plan before
 * its appointment) replaces rather than duplicates the pending job.
 */
export async function scheduleCommitJob(intentId: string, appointmentTime: Date) {
  const delay = Math.max(0, appointmentTime.getTime() - Date.now());
  await commitQueue.add(
    "commit",
    { intentId },
    { jobId: commitJobId(intentId), delay, removeOnComplete: { age: 60 * 60 * 24 * 7 }, removeOnFail: { age: 60 * 60 * 24 * 7 } },
  );
}

export async function enqueuePreValidation(intentId: string) {
  await preValidationQueue.add(
    "pre-validate",
    { intentId },
    { jobId: preValidationJobId(intentId, Date.now()), removeOnComplete: true, removeOnFail: { age: 60 * 60 * 24 } },
  );
}
