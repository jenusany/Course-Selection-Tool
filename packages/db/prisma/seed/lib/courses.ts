import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { generateSections, termsForSuffix } from "./sections.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface RawCourse {
  subjectCode: string;
  subjectName: string;
  number: string;
  title: string;
  description: string | null;
  prerequisiteText: string | null;
  antirequisiteText: string | null;
  corequisiteText: string | null;
  extraInfo: string | null;
  creditWeight: number;
  level: number;
  breadth: "A" | "B" | "C" | null;
  essay: boolean;
}

const CURRENT_YEAR = 2026;
const ROMAN_NUMERALS = new Set(["I", "II", "III", "IV", "V", "VI"]);

function titleCase(allCaps: string): string {
  return allCaps
    .split(" ")
    .map((w) => {
      if (ROMAN_NUMERALS.has(w)) return w;
      const lower = w.toLowerCase();
      return lower.length ? lower[0]!.toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

export async function seedCourses(prisma: PrismaClient) {
  const raw: RawCourse[] = JSON.parse(
    readFileSync(path.join(__dirname, "../data/courses.json"), "utf-8"),
  );

  const courseIdByKey = new Map<string, string>();

  for (const c of raw) {
    const course = await prisma.course.upsert({
      where: { subject_number: { subject: c.subjectCode, number: c.number } },
      update: {},
      create: {
        subject: c.subjectCode,
        subjectName: c.subjectName,
        number: c.number,
        title: titleCase(c.title),
        description: c.description,
        creditWeight: c.creditWeight,
        essay: c.essay,
        breadth: c.breadth,
        level: c.level,
        prerequisiteText: c.prerequisiteText,
        antirequisiteText: c.antirequisiteText,
        corequisiteText: c.corequisiteText,
        extraInfo: c.extraInfo,
        sourceUrl: `https://westerncalendar.uwo.ca/Courses.cfm?Subject=${c.subjectCode}&SelectedCalendar=Live&ArchiveID=`,
        unverified: false,
      },
    });
    courseIdByKey.set(`${c.subjectCode} ${c.number}`, course.id);

    // Synthetic sections: skip for stub breadth-elective courses we barely
    // modelled (PSYCHOL/ECONOMIC) at the 4000+/graduate end, but these are
    // all intro courses so we generate normally.
    const terms = termsForSuffix(c.number);
    const includeLabOrTut = c.level <= 3000;
    for (const term of terms) {
      const specs = generateSections(`${c.subjectCode} ${c.number}`, term, CURRENT_YEAR, c.level, includeLabOrTut);
      for (const spec of specs) {
        const existing = await prisma.section.findFirst({
          where: { courseId: course.id, term: spec.term, year: spec.year, component: spec.component, sectionCode: spec.sectionCode },
        });
        if (existing) continue;
        await prisma.section.create({
          data: {
            courseId: course.id,
            term: spec.term,
            year: spec.year,
            component: spec.component,
            sectionCode: spec.sectionCode,
            meetingTimes: spec.meetingTimes,
            location: spec.location,
            instructor: spec.instructor,
            capacity: spec.capacity,
            enrolledCount: spec.enrolledCount,
            synthetic: true,
          },
        });
      }
    }
  }

  console.log(`Seeded ${raw.length} courses (+ synthetic sections).`);
  return courseIdByKey;
}
