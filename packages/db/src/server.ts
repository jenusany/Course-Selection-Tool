// Node-only entry point: reads requirement YAML from disk and wires Prisma-backed provider implementations.
// Keep "@wcs/db" (index.ts) free of these so edge-runtime code (Next middleware) can still import it.
export { PrismaStudentRecordProvider } from "./providers/student-record.js";
export { loadCatalog } from "./catalog.js";
export { getDegreeAudit } from "./audit.js";
export { findRequirementsDir, loadRequirementSet, type RequirementSet } from "./requirements.js";
export {
  commitEnrollmentIntent,
  commitSeat,
  findIntentsDueForPreValidation,
  loadFingerprintInput,
  preValidateIntent,
  runEnrollmentValidation,
  type CommitIntentResult,
  type ItemCommitOutcome,
  type SeatCommitResult,
} from "./enrollment.js";
