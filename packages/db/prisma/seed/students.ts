import type { PrismaClient } from "@prisma/client";

type CourseKey = string; // "SUBJECT NUMBER", e.g. "COMPSCI 2210A/B"

interface CompletedRef {
  key: CourseKey;
  term: "FALL" | "WINTER" | "SUMMER";
  year: number;
  grade: number;
}

interface InProgressRef {
  key: CourseKey;
  term: "FALL" | "WINTER" | "SUMMER";
  year: number;
}

interface StudentPersona {
  email: string;
  name: string;
  year: number;
  standing?: "GOOD_STANDING" | "ON_PROBATION" | "REQUIRED_TO_WITHDRAW";
  programs: Array<{ code: string; isPrimary: boolean }>;
  completed: CompletedRef[];
  inProgress: InProgressRef[];
  holds?: Array<{ type: "FINANCIAL" | "ADVISING" | "MEDICAL_CLEARANCE" | "DISCIPLINARY" | "DOCUMENT_MISSING"; reason: string }>;
  fixtureNote: string;
}

const c = (key: CourseKey, term: CompletedRef["term"], year: number, grade: number): CompletedRef => ({ key, term, year, grade });
const p = (key: CourseKey, term: InProgressRef["term"], year: number): InProgressRef => ({ key, term, year });

export const PERSONAS: StudentPersona[] = [
  {
    email: "priya.nakamura@uwo.ca",
    name: "Priya Nakamura",
    year: 1,
    programs: [],
    completed: [],
    inProgress: [
      p("COMPSCI 1020A/B", "FALL", 2026),
      p("CALCULUS 1000A/B", "FALL", 2026),
      p("BIOLOGY 1001A", "FALL", 2026),
      p("ECONOMIC 1021A/B", "FALL", 2026),
      p("PSYCHOL 1000", "FALL", 2026),
    ],
    fixtureNote: "First-year, undeclared — exploring Science before choosing a module.",
  },
  {
    email: "marcus.chen@uwo.ca",
    name: "Marcus Chen",
    year: 2,
    programs: [{ code: "hsp-computer-science", isPrimary: true }],
    completed: [
      c("COMPSCI 1020A/B", "FALL", 2025, 78),
      c("COMPSCI 1025A/B", "FALL", 2025, 80),
      c("COMPSCI 1027A/B", "WINTER", 2026, 82),
      c("CALCULUS 1000A/B", "FALL", 2025, 75),
      c("CALCULUS 1301A/B", "WINTER", 2026, 73),
      c("PSYCHOL 1000", "WINTER", 2026, 74),
      c("ECONOMIC 1021A/B", "FALL", 2025, 70),
    ],
    inProgress: [
      p("COMPSCI 2208A/B", "FALL", 2026),
      p("COMPSCI 2209A/B", "FALL", 2026),
      p("COMPSCI 2210A/B", "FALL", 2026),
      p("MATH 1600A/B", "FALL", 2026),
      p("WRITING 2101F/G", "FALL", 2026),
    ],
    fixtureNote: "Second-year, Honours Specialization in Computer Science, on track.",
  },
  {
    email: "aisha.bello@uwo.ca",
    name: "Aisha Bello",
    year: 4,
    programs: [{ code: "hsp-computer-science", isPrimary: true }],
    completed: [
      c("COMPSCI 1020A/B", "FALL", 2023, 82),
      c("COMPSCI 1025A/B", "FALL", 2023, 85),
      c("COMPSCI 1027A/B", "WINTER", 2024, 84),
      c("CALCULUS 1000A/B", "FALL", 2023, 79),
      c("CALCULUS 1301A/B", "WINTER", 2024, 77),
      c("COMPSCI 2208A/B", "FALL", 2024, 80),
      c("COMPSCI 2209A/B", "FALL", 2024, 78),
      c("COMPSCI 2210A/B", "FALL", 2024, 83),
      c("COMPSCI 2211A/B", "WINTER", 2025, 81),
      c("COMPSCI 2212A/B/Y", "WINTER", 2025, 79),
      c("COMPSCI 2214A/B", "FALL", 2024, 85),
      c("MATH 1600A/B", "FALL", 2024, 80),
      c("WRITING 2101F/G", "WINTER", 2025, 76),
      c("COMPSCI 3305A/B", "FALL", 2025, 82),
      c("COMPSCI 3307A/B/Y", "FALL", 2025, 80),
      c("COMPSCI 3331A/B", "WINTER", 2026, 79),
      c("COMPSCI 3340A/B", "WINTER", 2026, 81),
      c("COMPSCI 3342A/B", "FALL", 2025, 78),
      c("COMPSCI 3350A/B", "WINTER", 2026, 80),
      c("STATS 2857A/B", "WINTER", 2026, 77),
      c("PSYCHOL 1000", "WINTER", 2025, 75),
      c("ECONOMIC 1021A/B", "FALL", 2023, 72),
      c("BIOLOGY 1001A", "WINTER", 2025, 74),
      c("CHEM 1301A/B", "FALL", 2024, 73),
      c("MATH 1120A/B", "FALL", 2023, 76),
    ],
    inProgress: [
      p("COMPSCI 4490Z", "FALL", 2026),
      p("COMPSCI 4451A/B", "FALL", 2026),
      p("COMPSCI 4413A/B", "FALL", 2026),
      p("COMPSCI 3388A/B", "FALL", 2026),
    ],
    fixtureNote: "Fourth-year, near graduation — module core essentially complete, finishing electives + thesis.",
  },
  {
    email: "derek.osei@uwo.ca",
    name: "Derek Osei",
    year: 3,
    programs: [{ code: "hsp-computer-science", isPrimary: true }],
    completed: [
      c("COMPSCI 1020A/B", "FALL", 2024, 75),
      c("COMPSCI 1025A/B", "FALL", 2024, 78),
      c("COMPSCI 1027A/B", "WINTER", 2025, 76),
      c("CALCULUS 1000A/B", "FALL", 2024, 71),
      c("CALCULUS 1301A/B", "WINTER", 2025, 70),
      c("COMPSCI 2208A/B", "FALL", 2025, 74),
      c("COMPSCI 2209A/B", "FALL", 2025, 73),
      c("COMPSCI 2210A/B", "FALL", 2025, 76),
      c("COMPSCI 2211A/B", "WINTER", 2026, 75),
      c("COMPSCI 2212A/B/Y", "WINTER", 2026, 74),
      c("COMPSCI 2214A/B", "FALL", 2025, 77),
      c("MATH 1600A/B", "FALL", 2025, 72),
      c("WRITING 2101F/G", "WINTER", 2026, 73),
      c("COMPSCI 3380F/G/Z", "FALL", 2026, 68),
    ],
    inProgress: [
      // Antirequisite conflict, by design: COMPSCI 4490Z lists 3380F/G/Z as an
      // antirequisite, and Derek already has credit for 3380F/G/Z above.
      p("COMPSCI 4490Z", "WINTER", 2027),
    ],
    fixtureNote: "Antirequisite conflict fixture: attempting COMPSCI 4490Z after already completing its antirequisite COMPSCI 3380F/G/Z.",
  },
  {
    email: "sofia.marchetti@uwo.ca",
    name: "Sofia Marchetti",
    year: 3,
    programs: [{ code: "major-computer-science", isPrimary: true }],
    completed: [
      c("COMPSCI 1020A/B", "FALL", 2024, 70),
      c("COMPSCI 1025A/B", "FALL", 2024, 72),
      c("COMPSCI 1027A/B", "WINTER", 2025, 71),
      c("CALCULUS 1000A/B", "FALL", 2024, 68),
      c("CALCULUS 1301A/B", "WINTER", 2025, 66),
      c("COMPSCI 2208A/B", "FALL", 2025, 70),
      c("COMPSCI 2209A/B", "FALL", 2025, 69),
      c("COMPSCI 2210A/B", "FALL", 2025, 71),
      c("COMPSCI 2211A/B", "WINTER", 2026, 70),
      c("COMPSCI 2212A/B/Y", "WINTER", 2026, 68),
      c("COMPSCI 2214A/B", "FALL", 2025, 70),
      c("MATH 1600A/B", "FALL", 2025, 67),
    ],
    inProgress: [p("COMPSCI 3305A/B", "FALL", 2026)],
    holds: [
      {
        type: "FINANCIAL",
        reason: "Outstanding tuition balance for Winter 2026 term — enrollment blocked until Student Accounts clears the hold.",
      },
    ],
    fixtureNote: "Active financial hold blocking further enrollment despite an otherwise clean record.",
  },
  {
    email: "jordan.whitfield@uwo.ca",
    name: "Jordan Whitfield",
    year: 3,
    programs: [
      { code: "major-computer-science", isPrimary: true },
      { code: "major-mathematics", isPrimary: false },
    ],
    completed: [
      c("COMPSCI 1020A/B", "FALL", 2024, 80),
      c("COMPSCI 1025A/B", "FALL", 2024, 82),
      c("COMPSCI 1027A/B", "WINTER", 2025, 81),
      c("CALCULUS 1000A/B", "FALL", 2024, 84),
      c("CALCULUS 1301A/B", "WINTER", 2025, 83),
      c("COMPSCI 2208A/B", "FALL", 2025, 78),
      c("COMPSCI 2209A/B", "FALL", 2025, 80),
      c("COMPSCI 2210A/B", "FALL", 2025, 82),
      c("COMPSCI 2211A/B", "WINTER", 2026, 79),
      c("COMPSCI 2212A/B/Y", "WINTER", 2026, 81),
      c("COMPSCI 2214A/B", "FALL", 2025, 83),
      c("MATH 2155F/G", "FALL", 2025, 80),
      c("MATH 2156A/B", "WINTER", 2026, 78),
      c("APPLMATH 2402A/B", "WINTER", 2026, 82),
    ],
    inProgress: [
      p("COMPSCI 3305A/B", "FALL", 2026),
      p("MATH 3020A/B", "FALL", 2026),
      p("STATS 2857A/B", "FALL", 2026),
      p("APPLMATH 3811A/B", "FALL", 2026),
    ],
    fixtureNote: "Double-module student: Major in Computer Science + Major in Mathematics, testing multi-module audit aggregation.",
  },
  {
    email: "grace.petrov@uwo.ca",
    name: "Grace Petrov",
    year: 3,
    programs: [{ code: "hsp-biology", isPrimary: true }],
    completed: [
      c("BIOLOGY 1001A", "FALL", 2024, 76),
      c("BIOLOGY 1002B", "WINTER", 2025, 74),
      c("CHEM 1301A/B", "FALL", 2024, 73),
      c("CHEM 1302A/B", "WINTER", 2025, 71),
      c("PHYSICS 1201A/B", "FALL", 2024, 70),
      c("CALCULUS 1000A/B", "FALL", 2024, 72),
      c("BIOCHEM 2280A", "FALL", 2025, 75),
      c("BIOLOGY 2290F/G", "FALL", 2025, 77),
      c("BIOLOGY 2382A/B", "FALL", 2025, 74),
      c("BIOLOGY 2483A/B", "WINTER", 2026, 78),
      c("BIOLOGY 2581A/B", "WINTER", 2026, 76),
      c("CHEM 2213A/B", "FALL", 2025, 72),
      c("BIOLOGY 2601A/B", "WINTER", 2026, 75),
      c("BIOLOGY 2244A/B", "WINTER", 2026, 73),
    ],
    inProgress: [
      p("BIOLOGY 3316A/B", "FALL", 2026),
      p("BIOLOGY 3338A/B", "FALL", 2026),
      p("BIOLOGY 3440A/B", "FALL", 2026),
    ],
    fixtureNote: "Mid-way through Honours Specialization in Biology — module core complete, working through upper-year electives.",
  },
  {
    email: "liam.fontaine@uwo.ca",
    name: "Liam Fontaine",
    year: 4,
    programs: [{ code: "hsp-computer-science", isPrimary: true }],
    completed: [
      c("COMPSCI 1020A/B", "FALL", 2023, 74),
      c("COMPSCI 1025A/B", "FALL", 2023, 76),
      c("COMPSCI 1027A/B", "WINTER", 2024, 75),
      c("CALCULUS 1000A/B", "FALL", 2023, 71),
      c("CALCULUS 1301A/B", "WINTER", 2024, 70),
      c("COMPSCI 2208A/B", "FALL", 2024, 71),
      c("COMPSCI 2209A/B", "FALL", 2024, 69),
      c("COMPSCI 2210A/B", "FALL", 2024, 70),
      c("COMPSCI 2211A/B", "WINTER", 2025, 68),
      c("COMPSCI 2212A/B/Y", "WINTER", 2025, 72),
      c("COMPSCI 2214A/B", "FALL", 2024, 70),
      c("MATH 1600A/B", "FALL", 2024, 74),
      c("WRITING 2101F/G", "WINTER", 2025, 69),
      c("COMPSCI 3305A/B", "FALL", 2025, 70),
      c("COMPSCI 3307A/B/Y", "FALL", 2025, 69),
      c("COMPSCI 3331A/B", "WINTER", 2026, 71),
      c("COMPSCI 3340A/B", "WINTER", 2026, 68),
      c("COMPSCI 3342A/B", "FALL", 2025, 70),
      c("COMPSCI 3350A/B", "WINTER", 2026, 70),
      c("STATS 2857A/B", "WINTER", 2026, 71),
    ],
    inProgress: [p("COMPSCI 4490Z", "FALL", 2026)],
    fixtureNote:
      "Borderline honours-average fixture: the module average over every course counted toward the HSp (core-11 plus the discrete-math, writing and stats choices) is 69.86% — just under the 70% cutoff, above the 68% Dean's-permission floor, no mark below 60%. A pinned edge case for the audit engine's average calculation.",
  },
];

const COUNSELLORS = [
  { email: "r.stevens@uwo.ca", name: "Rebecca Stevens" },
  { email: "t.abara@uwo.ca", name: "Tunde Abara" },
];

const ADMINS = [{ email: "admin@uwo.ca", name: "System Administrator" }];

export async function seedStudents(prisma: PrismaClient, courseIdByKey: Map<string, string>, programIdByCode: Record<string, string>) {
  const missingCourseKeys = new Set<string>();

  for (const persona of PERSONAS) {
    const user = await prisma.user.upsert({
      where: { email: persona.email },
      update: {},
      create: { email: persona.email, name: persona.name, role: "STUDENT" },
    });

    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: { year: persona.year, standing: persona.standing ?? "GOOD_STANDING" },
      create: {
        userId: user.id,
        year: persona.year,
        standing: persona.standing ?? "GOOD_STANDING",
        enrollmentAppointment: new Date(Date.UTC(2026, 9, 15, 9, 0, 0)),
      },
    });

    for (const prog of persona.programs) {
      const programId = programIdByCode[prog.code];
      if (!programId) throw new Error(`Unknown program code in persona ${persona.email}: ${prog.code}`);
      await prisma.studentProgram.upsert({
        where: { studentId_programId: { studentId: student.id, programId } },
        update: { isPrimary: prog.isPrimary },
        create: { studentId: student.id, programId, isPrimary: prog.isPrimary },
      });
    }

    // Re-seeding replaces the fixture's record rather than appending duplicate enrollments/holds.
    await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
    await prisma.hold.deleteMany({ where: { studentId: student.id } });

    for (const ref of persona.completed) {
      const courseId = courseIdByKey.get(ref.key);
      if (!courseId) {
        missingCourseKeys.add(ref.key);
        continue;
      }
      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          courseId,
          term: ref.term,
          year: ref.year,
          grade: ref.grade,
          status: "COMPLETED",
        },
      });
    }

    for (const ref of persona.inProgress) {
      const courseId = courseIdByKey.get(ref.key);
      if (!courseId) {
        missingCourseKeys.add(ref.key);
        continue;
      }
      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          courseId,
          term: ref.term,
          year: ref.year,
          status: "IN_PROGRESS",
        },
      });
    }

    for (const hold of persona.holds ?? []) {
      await prisma.hold.create({
        data: { studentId: student.id, type: hold.type, reason: hold.reason },
      });
    }
  }

  if (missingCourseKeys.size > 0) {
    throw new Error(`Seed fixtures reference courses not present in the catalog: ${[...missingCourseKeys].join(", ")}`);
  }

  for (const cAcct of COUNSELLORS) {
    await prisma.user.upsert({
      where: { email: cAcct.email },
      update: {},
      create: { email: cAcct.email, name: cAcct.name, role: "COUNSELLOR" },
    });
  }

  for (const aAcct of ADMINS) {
    await prisma.user.upsert({
      where: { email: aAcct.email },
      update: {},
      create: { email: aAcct.email, name: aAcct.name, role: "ADMIN" },
    });
  }

  console.log(`Seeded ${PERSONAS.length} student fixtures, ${COUNSELLORS.length} counsellors, ${ADMINS.length} admin.`);
}
