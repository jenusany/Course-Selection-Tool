-- Snapshots are a cache (recomputable from the record); clear any pre-existing rows so the NOT NULL columns can be added.
DELETE FROM "DegreeAuditSnapshot";

-- AlterTable
ALTER TABLE "DegreeAuditSnapshot" ADD COLUMN     "engineVersion" TEXT NOT NULL,
ADD COLUMN     "fingerprint" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "DegreeAuditSnapshot_studentId_fingerprint_idx" ON "DegreeAuditSnapshot"("studentId", "fingerprint");

