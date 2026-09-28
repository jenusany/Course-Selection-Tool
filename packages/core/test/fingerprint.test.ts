import { describe, expect, it } from "vitest";
import { computeEnrollmentFingerprint } from "../src/enrollment/fingerprint.js";

describe("computeEnrollmentFingerprint", () => {
  const base = {
    studentRecordVersion: 1,
    holds: [{ id: "h1", version: 1 }],
    sections: [
      { id: "s1", version: 1 },
      { id: "s2", version: 1 },
    ],
  };

  it("is deterministic for the same input", () => {
    expect(computeEnrollmentFingerprint(base)).toBe(computeEnrollmentFingerprint(base));
  });

  it("is independent of holds/sections array order", () => {
    const reordered = { ...base, sections: [...base.sections].reverse() };
    expect(computeEnrollmentFingerprint(base)).toBe(computeEnrollmentFingerprint(reordered));
  });

  it("changes when the student record version changes", () => {
    expect(computeEnrollmentFingerprint(base)).not.toBe(computeEnrollmentFingerprint({ ...base, studentRecordVersion: 2 }));
  });

  it("changes when a hold's version changes", () => {
    const changed = { ...base, holds: [{ id: "h1", version: 2 }] };
    expect(computeEnrollmentFingerprint(base)).not.toBe(computeEnrollmentFingerprint(changed));
  });

  it("changes when a hold is added or removed", () => {
    const added = { ...base, holds: [...base.holds, { id: "h2", version: 1 }] };
    expect(computeEnrollmentFingerprint(base)).not.toBe(computeEnrollmentFingerprint(added));
    expect(computeEnrollmentFingerprint(base)).not.toBe(computeEnrollmentFingerprint({ ...base, holds: [] }));
  });

  it("changes when a section's version changes (e.g. a seat was taken)", () => {
    const changed = { ...base, sections: [{ id: "s1", version: 2 }, { id: "s2", version: 1 }] };
    expect(computeEnrollmentFingerprint(base)).not.toBe(computeEnrollmentFingerprint(changed));
  });
});
