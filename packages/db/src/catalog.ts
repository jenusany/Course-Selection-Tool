import type { PrismaClient } from "@prisma/client";
import { buildCatalog, type Catalog, type RequisiteNode } from "@wcs/core";

/** The whole seeded course catalog, shaped for the audit engine and requisite evaluator. */
export async function loadCatalog(prisma: PrismaClient): Promise<Catalog> {
  const rows = await prisma.course.findMany({
    select: {
      subject: true,
      subjectName: true,
      number: true,
      title: true,
      creditWeight: true,
      level: true,
      breadth: true,
      essay: true,
      prerequisiteTree: true,
      antirequisiteTree: true,
    },
    orderBy: [{ subject: "asc" }, { number: "asc" }],
  });
  return buildCatalog(
    rows.map((r) => ({
      ...r,
      // Written by the seed from packages/core's parser, so the JSON has RequisiteNode's shape.
      prerequisiteTree: (r.prerequisiteTree as RequisiteNode | null) ?? null,
      antirequisiteTree: (r.antirequisiteTree as RequisiteNode | null) ?? null,
    })),
  );
}
