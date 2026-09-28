// Composition root: the one place that picks concrete implementations of
// packages/core's provider interfaces. Swapping the mock for a real Western
// system (e.g. a PeopleSoft-backed StudentRecordProvider) happens here only.
import type { StudentRecordProvider } from "@wcs/core";
import { prisma } from "@wcs/db";
import { PrismaStudentRecordProvider } from "@wcs/db/server";

export const studentRecords: StudentRecordProvider = new PrismaStudentRecordProvider(prisma);
