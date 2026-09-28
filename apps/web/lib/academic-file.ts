import { notFound } from "next/navigation";
import { canViewAcademicFile, type ViewerRole } from "@wcs/core";
import { prisma } from "@wcs/db";
import type { Session } from "next-auth";

export interface Viewer {
  id: string;
  role: ViewerRole;
}

export function viewerFromSession(session: Session): Viewer {
  return { id: session.user.id, role: session.user.role as ViewerRole };
}

/**
 * Loads which counsellors are assigned to a student (by user id, matching
 * core's AcademicFileAccessInput shape).
 */
async function getAssignedCounsellorUserIds(studentId: string): Promise<string[]> {
  const links = await prisma.counsellorStudent.findMany({
    where: { studentId },
    select: { counsellor: { select: { id: true } } },
  });
  return links.map((l) => l.counsellor.id);
}

/**
 * Enforces the academic-file access rule (see packages/core/src/access/scope.ts)
 * and throws Next's notFound() rather than leaking whether the student
 * exists when access is denied. Every call site should follow this
 * immediately with a recordAccess() call for the VIEW/EDIT it's guarding.
 */
export async function assertCanViewAcademicFile(viewer: Viewer, studentId: string): Promise<{ targetStudentUserId: string }> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } });
  if (!student) notFound();

  const assignedCounsellorUserIds = await getAssignedCounsellorUserIds(studentId);
  const allowed = canViewAcademicFile({
    viewerRole: viewer.role,
    viewerUserId: viewer.id,
    targetStudentUserId: student.userId,
    assignedCounsellorUserIds,
  });
  if (!allowed) notFound();

  return { targetStudentUserId: student.userId };
}

export async function recordAccess(viewerId: string, studentId: string, resourceType: string, action: "VIEW" | "EDIT") {
  await prisma.accessLogEntry.create({ data: { viewerId, studentId, resourceType, action } });
}

export async function getAcademicFile(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      programs: { include: { program: true } },
      holds: { orderBy: { placedAt: "desc" } },
      enrollments: { include: { course: true }, orderBy: [{ year: "desc" }, { term: "asc" }] },
      advisingNotes: { include: { counsellor: true }, orderBy: { date: "desc" } },
      accommodationTickets: { orderBy: { createdAt: "desc" } },
      petitionExceptions: { orderBy: { date: "desc" } },
    },
  });
  if (!student) notFound();
  return student;
}

export async function getAccessLog(studentId: string, limit = 50) {
  return prisma.accessLogEntry.findMany({
    where: { studentId },
    include: { viewer: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getCounsellorCaseload(counsellorUserId: string) {
  const links = await prisma.counsellorStudent.findMany({
    where: { counsellorId: counsellorUserId },
    include: {
      student: {
        include: {
          user: true,
          programs: { include: { program: true }, where: { isPrimary: true } },
          holds: { where: { resolvedAt: null } },
        },
      },
    },
    orderBy: { student: { user: { name: "asc" } } },
  });
  return links.map((l) => l.student);
}

export async function getAllStudents() {
  return prisma.student.findMany({
    include: {
      user: true,
      programs: { include: { program: true }, where: { isPrimary: true } },
      holds: { where: { resolvedAt: null } },
    },
    orderBy: { user: { name: "asc" } },
  });
}
