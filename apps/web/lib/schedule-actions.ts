"use server";

import { revalidatePath } from "next/cache";
import { prisma, type Term } from "@wcs/db";
import { auth } from "./auth";
import { PLANNING_YEAR, type DraftScheduleDTO, type ScheduleItemDTO } from "./schedule-data";

/** Resolves the acting student from the session, or throws. Every action re-derives this — never trust a client-supplied studentId. */
async function requireStudentId(): Promise<string> {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT") throw new Error("Not signed in as a student.");
  const student = await prisma.student.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  if (!student) throw new Error("No student record for this account.");
  return student.id;
}

function toDraftScheduleDTO(s: {
  id: string;
  term: Term;
  year: number;
  name: string;
  isEnrollmentPlan: boolean;
  items: ScheduleItemDTO[];
}): DraftScheduleDTO {
  return s;
}

export async function createDraftSchedule(term: Term, name: string): Promise<DraftScheduleDTO> {
  const studentId = await requireStudentId();
  const created = await prisma.draftSchedule.create({
    data: { studentId, term, year: PLANNING_YEAR, name, isEnrollmentPlan: false },
    include: { items: true },
  });
  revalidatePath("/plan");
  return toDraftScheduleDTO(created);
}

export async function renameDraftSchedule(scheduleId: string, name: string): Promise<void> {
  const studentId = await requireStudentId();
  const result = await prisma.draftSchedule.updateMany({ where: { id: scheduleId, studentId }, data: { name } });
  if (result.count === 0) throw new Error("Schedule not found.");
  revalidatePath("/plan");
}

export async function deleteDraftSchedule(scheduleId: string): Promise<void> {
  const studentId = await requireStudentId();
  const schedule = await prisma.draftSchedule.findUnique({ where: { id: scheduleId }, select: { studentId: true } });
  if (!schedule || schedule.studentId !== studentId) throw new Error("Schedule not found.");
  await prisma.scheduleItem.deleteMany({ where: { scheduleId } });
  await prisma.draftSchedule.delete({ where: { id: scheduleId } });
  revalidatePath("/plan");
}

/** Marks one schedule as *the* enrollment plan for its term, unmarking any other schedule in that same term (app-level exclusivity — see schema.prisma). */
export async function setEnrollmentPlan(scheduleId: string): Promise<void> {
  const studentId = await requireStudentId();
  const schedule = await prisma.draftSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.studentId !== studentId) throw new Error("Schedule not found.");
  await prisma.$transaction([
    prisma.draftSchedule.updateMany({
      where: { studentId, term: schedule.term, year: schedule.year, NOT: { id: scheduleId } },
      data: { isEnrollmentPlan: false },
    }),
    prisma.draftSchedule.update({ where: { id: scheduleId }, data: { isEnrollmentPlan: true } }),
  ]);
  revalidatePath("/plan");
}

export async function addScheduleItem(
  scheduleId: string,
  courseId: string,
  preferredSectionId: string | null,
  fallbackSectionId: string | null,
): Promise<ScheduleItemDTO> {
  const studentId = await requireStudentId();
  const schedule = await prisma.draftSchedule.findUnique({ where: { id: scheduleId }, select: { studentId: true } });
  if (!schedule || schedule.studentId !== studentId) throw new Error("Schedule not found.");
  const item = await prisma.scheduleItem.create({
    data: { scheduleId, courseId, preferredSectionId, fallbackSectionId },
  });
  revalidatePath("/plan");
  return {
    id: item.id,
    courseId: item.courseId,
    preferredSectionId: item.preferredSectionId,
    fallbackSectionId: item.fallbackSectionId,
  };
}

export async function removeScheduleItem(itemId: string): Promise<void> {
  const studentId = await requireStudentId();
  const item = await prisma.scheduleItem.findUnique({ where: { id: itemId }, include: { schedule: { select: { studentId: true } } } });
  if (!item || item.schedule.studentId !== studentId) throw new Error("Item not found.");
  await prisma.scheduleItem.delete({ where: { id: itemId } });
  revalidatePath("/plan");
}

export async function updateScheduleItemSections(
  itemId: string,
  preferredSectionId: string | null,
  fallbackSectionId: string | null,
): Promise<void> {
  const studentId = await requireStudentId();
  const item = await prisma.scheduleItem.findUnique({ where: { id: itemId }, include: { schedule: { select: { studentId: true } } } });
  if (!item || item.schedule.studentId !== studentId) throw new Error("Item not found.");
  await prisma.scheduleItem.update({ where: { id: itemId }, data: { preferredSectionId, fallbackSectionId } });
  revalidatePath("/plan");
}
