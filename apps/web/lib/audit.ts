import type { DegreeAuditResult } from "@wcs/core";
import { prisma } from "@wcs/db";
import { getDegreeAudit as getDegreeAuditForPrisma } from "@wcs/db/server";

/** Thin wrapper binding the shared packages/db implementation to this app's Prisma client — see @wcs/db/server for the real logic. */
export async function getDegreeAudit(studentId: string): Promise<DegreeAuditResult> {
  return getDegreeAuditForPrisma(prisma, studentId);
}
