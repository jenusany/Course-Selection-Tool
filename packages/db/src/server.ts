// Node-only entry point: reads requirement YAML from disk and wires Prisma-backed provider implementations.
// Keep "@wcs/db" (index.ts) free of these so edge-runtime code (Next middleware) can still import it.
export { PrismaStudentRecordProvider } from "./providers/student-record.js";
export { loadCatalog } from "./catalog.js";
export { findRequirementsDir, loadRequirementSet, type RequirementSet } from "./requirements.js";
