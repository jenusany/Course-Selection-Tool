import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";
import type { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REQUIREMENTS_ROOT = path.join(__dirname, "../../../../../requirements");

const MODULE_FILES = [
  "hsp-computer-science.yaml",
  "major-computer-science.yaml",
  "hsp-biology.yaml",
  "major-mathematics.yaml",
];

export async function seedPrograms(prisma: PrismaClient): Promise<Record<string, string>> {
  const idByCode: Record<string, string> = {};

  for (const file of MODULE_FILES) {
    const raw = readFileSync(path.join(REQUIREMENTS_ROOT, "modules", file), "utf-8");
    const doc = parse(raw) as { code: string; name: string; type: string; faculty: string; department: string };

    const program = await prisma.program.upsert({
      where: { code: doc.code },
      update: {},
      create: {
        code: doc.code,
        name: doc.name,
        type: doc.type as never,
        faculty: doc.faculty,
        department: doc.department,
        requirementsRef: doc.code,
      },
    });
    idByCode[doc.code] = program.id;
  }

  console.log(`Seeded ${MODULE_FILES.length} programs/modules.`);
  return idByCode;
}
