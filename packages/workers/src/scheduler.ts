import { prisma } from "@wcs/db";
import { findIntentsDueForPreValidation } from "@wcs/db/server";
import { preValidationQueue } from "./queues.js";

const SCAN_JOB_ID = "prevalidation-scan";

/**
 * Repeatable BullMQ job: every `everyMs`, finds PENDING intents whose
 * appointment is within the pre-validation window and enqueues one
 * pre-validation job per intent. `preValidateIntent` itself is a no-op if
 * the intent's current fingerprint already has a stored result, so a tight
 * scan interval is cheap — it just re-checks, it doesn't re-validate
 * needlessly.
 */
export async function scheduleRecurringScan(everyMs: number) {
  await preValidationQueue.upsertJobScheduler(SCAN_JOB_ID, { every: everyMs }, { name: "scan", data: {} });
}

export async function runPreValidationScan(withinHours = 72) {
  const due = await findIntentsDueForPreValidation(prisma, withinHours);
  await Promise.all(
    due.map((intent) =>
      preValidationQueue.add(
        "pre-validate",
        { intentId: intent.id },
        { jobId: `prevalidate-${intent.id}`, removeOnComplete: true, removeOnFail: { age: 60 * 60 * 24 } },
      ),
    ),
  );
  return due.length;
}
