import { describe, expect, it } from "vitest";
import { commitJobId, preValidationJobId } from "../src/queues.js";

// BullMQ throws "Custom Id cannot contain :" — this pins the fix for a real
// bug hit during Phase 4 verification (scheduleCommitJob crashed on every
// call until the job id stopped using `:` as a separator).
describe("job id helpers never contain a colon", () => {
  it("commitJobId", () => {
    const id = commitJobId("abc123");
    expect(id).not.toContain(":");
    expect(id).toBe("commit-abc123");
  });

  it("preValidationJobId", () => {
    const id = preValidationJobId("abc123", 1700000000000);
    expect(id).not.toContain(":");
    expect(id).toBe("prevalidate-abc123-1700000000000");
  });
});
