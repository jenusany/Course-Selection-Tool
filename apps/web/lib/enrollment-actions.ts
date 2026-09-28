"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@wcs/db";
import { scheduleCommitJob } from "@wcs/workers";
import { auth } from "./auth";

async function requireStudent(): Promise<{ id: string; enrollmentAppointment: Date | null }> {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT") throw new Error("Not signed in as a student.");
  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    select: { id: true, enrollmentAppointment: true },
  });
  if (!student) throw new Error("No student record for this account.");
  return student;
}

/**
 * Turns a schedule marked as the enrollment plan into an EnrollmentIntent
 * and schedules its appointment-time commit job. Re-submitting (e.g. after
 * editing the plan) upserts the same intent — one per (student, term, year)
 * — and re-schedules the commit job, so the old delayed job is superseded
 * rather than duplicated (same BullMQ job id).
 */
export async function submitEnrollmentPlan(scheduleId: string): Promise<{ intentId: string }> {
  const student = await requireStudent();
  if (!student.enrollmentAppointment) {
    throw new Error("No enrollment appointment on file for your account yet.");
  }

  const schedule = await prisma.draftSchedule.findUnique({ where: { id: scheduleId }, include: { items: true } });
  if (!schedule || schedule.studentId !== student.id) throw new Error("Schedule not found.");
  if (!schedule.isEnrollmentPlan) throw new Error("Mark this schedule as your enrollment plan first.");
  if (schedule.items.length === 0) throw new Error("This schedule has no courses in it.");
  const missingSection = schedule.items.find((i) => !i.preferredSectionId);
  if (missingSection) throw new Error("Every course in your plan needs a preferred section.");

  const items = schedule.items.map((i) => ({
    courseId: i.courseId,
    preferredSectionId: i.preferredSectionId,
    fallbackSectionId: i.fallbackSectionId,
  }));

  const intent = await prisma.enrollmentIntent.upsert({
    where: { studentId_term_year: { studentId: student.id, term: schedule.term, year: schedule.year } },
    update: { items, appointmentTime: student.enrollmentAppointment, status: "PENDING" },
    create: {
      studentId: student.id,
      term: schedule.term,
      year: schedule.year,
      appointmentTime: student.enrollmentAppointment,
      items,
      status: "PENDING",
    },
  });

  await scheduleCommitJob(intent.id, intent.appointmentTime);
  revalidatePath("/enrollment");
  return { intentId: intent.id };
}
