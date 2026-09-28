import type { PrismaClient } from "@prisma/client";

/**
 * Counsellor caseload assignment (CounsellorStudent), advising notes,
 * accommodation tickets, and petition/exception records for the seeded
 * personas. Fabricated fixture data (see DATA_TODO.md), not real advising
 * records — exists to exercise the counsellor portal end to end.
 *
 * Re-seeding resets these to the fixture baseline for exactly the personas
 * listed here (never a broader delete) so a repeat `pnpm db:seed` doesn't
 * accumulate duplicates but also never touches unrelated data.
 */

const CASELOADS: Record<string, string[]> = {
  "r.stevens@uwo.ca": ["priya.nakamura@uwo.ca", "marcus.chen@uwo.ca", "aisha.bello@uwo.ca", "derek.osei@uwo.ca", "jyogara@uwo.ca"],
  "t.abara@uwo.ca": ["sofia.marchetti@uwo.ca", "jordan.whitfield@uwo.ca", "grace.petrov@uwo.ca", "liam.fontaine@uwo.ca"],
};

const ADVISING_NOTES: Array<{
  studentEmail: string;
  counsellorEmail: string;
  faculty: string;
  topic: string;
  summary: string;
  followUps?: string;
}> = [
  {
    studentEmail: "marcus.chen@uwo.ca",
    counsellorEmail: "r.stevens@uwo.ca",
    faculty: "Science",
    topic: "Course selection — upcoming enrollment appointment",
    summary:
      "Reviewed second-year course load ahead of his Fall/Winter enrollment appointment. On track for the Computer Science HSp; discussed sequencing COMPSCI 2208A/B, 2209A/B, and 2210A/B together and confirmed MATH 1600A/B satisfies the linear algebra requirement.",
    followUps: "Check back after enrollment opens to confirm he got into his preferred sections.",
  },
  {
    studentEmail: "sofia.marchetti@uwo.ca",
    counsellorEmail: "t.abara@uwo.ca",
    faculty: "Science",
    topic: "Active hold — document missing",
    summary:
      "Student has an outstanding document-missing hold on file. Explained what's blocking enrollment and what needs to be submitted to Student Central to resolve it before her appointment.",
    followUps: "Follow up in two weeks if the hold hasn't cleared.",
  },
  {
    studentEmail: "liam.fontaine@uwo.ca",
    counsellorEmail: "t.abara@uwo.ca",
    faculty: "Science",
    topic: "Academic standing — honours average check-in",
    summary:
      "Proactive check-in near graduation. His module average is close to the 70% honours cutoff; walked through which remaining courses have the most room to move it and what happens if he finishes just under.",
  },
];

const ACCOMMODATION_TICKETS: Array<{ studentEmail: string; type: string; status: "REQUESTED" | "ACTIVE" | "EXPIRED" | "DENIED" }> = [
  { studentEmail: "grace.petrov@uwo.ca", type: "Extended time on exams", status: "ACTIVE" },
];

const PETITION_EXCEPTIONS: Array<{
  studentEmail: string;
  type: string;
  decision: string;
  decidedBy: string;
  date: Date;
}> = [
  {
    studentEmail: "jordan.whitfield@uwo.ca",
    type: "Antirequisite override request",
    decision: "Approved — both COMPSCI 2214A/B and MATH 2155F/G retained toward degree, petition on file.",
    decidedBy: "Tunde Abara",
    date: new Date(Date.UTC(2026, 8, 2)),
  },
];

export async function seedAcademicFile(prisma: PrismaClient) {
  const userByEmail = new Map<string, { id: string }>();
  const studentByUserEmail = new Map<string, { id: string }>();

  const allEmails = new Set<string>([
    ...Object.keys(CASELOADS),
    ...Object.values(CASELOADS).flat(),
    ...ADVISING_NOTES.map((n) => n.studentEmail),
    ...ADVISING_NOTES.map((n) => n.counsellorEmail),
    ...ACCOMMODATION_TICKETS.map((a) => a.studentEmail),
    ...PETITION_EXCEPTIONS.map((p) => p.studentEmail),
  ]);

  for (const email of allEmails) {
    const user = await prisma.user.findUnique({ where: { email }, include: { student: true } });
    if (!user) throw new Error(`seedAcademicFile: no seeded user for ${email} — run seedStudents first`);
    userByEmail.set(email, { id: user.id });
    if (user.student) studentByUserEmail.set(email, { id: user.student.id });
  }

  const studentIds = [...studentByUserEmail.values()].map((s) => s.id);

  // Reset exactly this fixture set's rows before recreating — never a broader delete (see CLAUDE.md's
  // "Manual DB verification hygiene").
  await prisma.counsellorStudent.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.advisingNote.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.accommodationTicket.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.petitionException.deleteMany({ where: { studentId: { in: studentIds } } });

  for (const [counsellorEmail, studentEmails] of Object.entries(CASELOADS)) {
    const counsellor = userByEmail.get(counsellorEmail);
    if (!counsellor) throw new Error(`seedAcademicFile: unknown counsellor ${counsellorEmail}`);
    for (const studentEmail of studentEmails) {
      const student = studentByUserEmail.get(studentEmail);
      if (!student) throw new Error(`seedAcademicFile: unknown student ${studentEmail}`);
      await prisma.counsellorStudent.create({
        data: { counsellorId: counsellor.id, studentId: student.id },
      });
    }
  }

  for (const note of ADVISING_NOTES) {
    const student = studentByUserEmail.get(note.studentEmail);
    const counsellor = userByEmail.get(note.counsellorEmail);
    if (!student || !counsellor) throw new Error(`seedAcademicFile: unknown participant in note for ${note.studentEmail}`);
    await prisma.advisingNote.create({
      data: {
        studentId: student.id,
        counsellorId: counsellor.id,
        faculty: note.faculty,
        topic: note.topic,
        summary: note.summary,
        followUps: note.followUps,
      },
    });
  }

  for (const ticket of ACCOMMODATION_TICKETS) {
    const student = studentByUserEmail.get(ticket.studentEmail);
    if (!student) throw new Error(`seedAcademicFile: unknown student ${ticket.studentEmail}`);
    await prisma.accommodationTicket.create({
      data: { studentId: student.id, type: ticket.type, status: ticket.status },
    });
  }

  for (const petition of PETITION_EXCEPTIONS) {
    const student = studentByUserEmail.get(petition.studentEmail);
    if (!student) throw new Error(`seedAcademicFile: unknown student ${petition.studentEmail}`);
    await prisma.petitionException.create({
      data: {
        studentId: student.id,
        type: petition.type,
        decision: petition.decision,
        decidedBy: petition.decidedBy,
        date: petition.date,
      },
    });
  }

  console.log(
    `Seeded academic-file fixtures: ${Object.keys(CASELOADS).length} caseloads, ${ADVISING_NOTES.length} advising notes, ${ACCOMMODATION_TICKETS.length} accommodation ticket(s), ${PETITION_EXCEPTIONS.length} petition/exception(s).`,
  );
}
