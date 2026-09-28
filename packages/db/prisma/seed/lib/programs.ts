import type { PrismaClient } from "@prisma/client";
import type { ModuleDefinition } from "@wcs/core";

/**
 * One Program row per module file in requirements/modules/ (already validated
 * by loadRequirementSet). requirementsRef is the module code, which is also
 * the YAML file name.
 */
export async function seedPrograms(
  prisma: PrismaClient,
  modules: Iterable<ModuleDefinition>,
): Promise<Record<string, string>> {
  const idByCode: Record<string, string> = {};
  let count = 0;

  for (const def of modules) {
    const data = {
      name: def.name,
      type: def.type,
      faculty: def.faculty,
      department: def.department,
      requirementsRef: def.code,
    };
    const program = await prisma.program.upsert({
      where: { code: def.code },
      update: data,
      create: { code: def.code, ...data },
    });
    idByCode[def.code] = program.id;
    count++;
  }

  console.log(`Seeded ${count} programs/modules.`);
  return idByCode;
}
