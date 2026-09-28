import type { PrismaClient } from "@prisma/client";
import type {
  CompletedCourse,
  Hold,
  InProgressCourse,
  StudentProfile,
  StudentRecordProvider,
} from "@wcs/core";

/**
 * Mock StudentRecordProvider backed by the seeded Postgres data. Stands in
 * for PeopleSoft/Student Center; a real adapter implements the same
 * interface and is swapped in at apps/web/lib/providers.ts.
 */
export class PrismaStudentRecordProvider implements StudentRecordProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async getProfile(studentId: string): Promise<StudentProfile> {
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { user: true, programs: { include: { program: true }, orderBy: { declaredAt: "asc" } } },
    });
    return {
      studentId: s.id,
      name: s.user.name,
      year: s.year,
      standing: s.standing,
      programs: s.programs.map((sp) => ({
        code: sp.program.code,
        name: sp.program.name,
        type: sp.program.type,
        isPrimary: sp.isPrimary,
      })),
    };
  }

  async getCompletedCourses(studentId: string): Promise<CompletedCourse[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId, status: "COMPLETED" },
      include: { course: { select: { subject: true, number: true } } },
      orderBy: [{ year: "asc" }, { term: "asc" }, { id: "asc" }],
    });
    return rows.flatMap((e) =>
      // A COMPLETED row without a grade is a data error; skip rather than invent a mark.
      e.grade === null ? [] : [{ course: e.course, term: e.term, year: e.year, grade: e.grade }],
    );
  }

  async getInProgressCourses(studentId: string): Promise<InProgressCourse[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId, status: "IN_PROGRESS" },
      include: { course: { select: { subject: true, number: true } } },
      orderBy: [{ year: "asc" }, { term: "asc" }, { id: "asc" }],
    });
    return rows.map((e) => ({ course: e.course, term: e.term, year: e.year }));
  }

  async getHolds(studentId: string): Promise<Hold[]> {
    const rows = await this.prisma.hold.findMany({ where: { studentId }, orderBy: { placedAt: "asc" } });
    return rows.map((h) => ({
      id: h.id,
      type: h.type,
      reason: h.reason,
      placedAt: h.placedAt.toISOString(),
      resolvedAt: h.resolvedAt?.toISOString() ?? null,
    }));
  }

  async getEnrollmentAppointment(studentId: string): Promise<Date | null> {
    const s = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { enrollmentAppointment: true } });
    return s.enrollmentAppointment;
  }
}
