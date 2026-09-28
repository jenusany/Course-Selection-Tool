/**
 * Detects whether anything the pre-validation worker read has changed by
 * the time the commit worker runs. Deliberately *not* cryptographic (no
 * node:crypto) — packages/core is imported by client components too
 * (e.g. the schedule builder), so it stays dependency-free and portable.
 * Collision risk is irrelevant here: this only needs to catch "did this
 * specific input change", not resist a forged fingerprint.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface FingerprintInput {
  /** Student.recordVersion — bumped whenever the student's own record changes. */
  studentRecordVersion: number;
  holds: readonly { id: string; version: number }[];
  /** One entry per section referenced by the intent (preferred + fallback). */
  sections: readonly { id: string; version: number }[];
}

/** Order-independent: sorts everything by id before hashing so caller order never matters. */
export function computeEnrollmentFingerprint(input: FingerprintInput): string {
  const holds = [...input.holds].sort((a, b) => a.id.localeCompare(b.id));
  const sections = [...input.sections].sort((a, b) => a.id.localeCompare(b.id));
  const canonical = JSON.stringify({
    v: input.studentRecordVersion,
    h: holds.map((x) => `${x.id}:${x.version}`),
    s: sections.map((x) => `${x.id}:${x.version}`),
  });
  return fnv1a(canonical);
}
