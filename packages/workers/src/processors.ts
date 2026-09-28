import type { Job } from "bullmq";
import { prisma } from "@wcs/db";
import { commitEnrollmentIntent, preValidateIntent } from "@wcs/db/server";
import { runPreValidationScan } from "./scheduler.js";
import type { CommitJobData, PreValidationJobData, ScanJobData } from "./queues.js";

export async function processPreValidationJob(job: Job<PreValidationJobData | ScanJobData>): Promise<void> {
  if (job.name === "scan") {
    await runPreValidationScan();
    return;
  }
  await preValidateIntent(prisma, (job.data as PreValidationJobData).intentId);
}

export async function processCommitJob(job: Job<CommitJobData>) {
  return commitEnrollmentIntent(prisma, job.data.intentId);
}
