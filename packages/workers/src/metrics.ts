import { commitQueue, preValidationQueue } from "./queues.js";

export interface QueueLoad {
  waiting: number;
  active: number;
  delayed: number;
}

export interface LoadSnapshot {
  preValidation: QueueLoad;
  commit: QueueLoad;
}

function toLoad(counts: Partial<Record<"waiting" | "active" | "delayed", number>>): QueueLoad {
  return { waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0 };
}

/** Queue depth as a proxy for system load — the "low-load period" signal pre-validation scheduling favors. */
export async function getLoadSnapshot(): Promise<LoadSnapshot> {
  const [preValidation, commit] = await Promise.all([
    preValidationQueue.getJobCounts("waiting", "active", "delayed"),
    commitQueue.getJobCounts("waiting", "active", "delayed"),
  ]);
  return { preValidation: toLoad(preValidation), commit: toLoad(commit) };
}
