import { PrismaClient } from "@prisma/client";
import { loadRequirementSet } from "../../src/requirements.js";
import { seedCourses } from "./lib/courses.js";
import { seedPrograms } from "./lib/programs.js";
import { seedStudents } from "./students.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Western Course Selection dev database...");
  // Validates every requirement YAML file up front — a bad file fails the seed with a readable error.
  const requirements = loadRequirementSet();
  const courseIdByKey = await seedCourses(prisma, requirements.modules.values());
  const programIdByCode = await seedPrograms(prisma, requirements.modules.values());
  await seedStudents(prisma, courseIdByKey, programIdByCode);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
