import { PrismaClient } from "@prisma/client";
import { seedCourses } from "./lib/courses.js";
import { seedPrograms } from "./lib/programs.js";
import { seedStudents } from "./students.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Western Course Selection dev database...");
  const courseIdByKey = await seedCourses(prisma);
  const programIdByCode = await seedPrograms(prisma);
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
