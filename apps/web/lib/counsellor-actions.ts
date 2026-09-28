"use server";

import { revalidatePath } from "next/cache";
import { canEditAcademicFile } from "@wcs/core";
import { prisma } from "@wcs/db";
import { auth } from "./auth";
import { recordAccess, viewerFromSession } from "./academic-file";

/** Resolves the acting counsellor/admin from the session and re-checks the advising relationship server-side — never trust a client-supplied studentId for authorization. */
async function requireEditAccess(studentId: string) {
  const session = await auth();
  if (!session) throw new Error("Not signed in.");
  const viewer = viewerFromSession(session);

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } });
  if (!student) throw new Error("Student not found.");

  const links = await prisma.counsellorStudent.findMany({ where: { studentId }, select: { counsellorId: true } });
  const allowed = canEditAcademicFile({
    viewerRole: viewer.role,
    viewerUserId: viewer.id,
    targetStudentUserId: student.userId,
    assignedCounsellorUserIds: links.map((l) => l.counsellorId),
  });
  if (!allowed) throw new Error("Not authorized to edit this student's academic file.");

  return viewer;
}

export async function addAdvisingNote(studentId: string, formData: FormData) {
  const viewer = await requireEditAccess(studentId);

  const topic = String(formData.get("topic") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const followUps = String(formData.get("followUps") ?? "").trim();
  if (!topic || !summary) throw new Error("Topic and summary are required.");

  await prisma.advisingNote.create({
    data: {
      studentId,
      counsellorId: viewer.id,
      faculty: "Science",
      topic,
      summary,
      followUps: followUps || null,
    },
  });
  await recordAccess(viewer.id, studentId, "advising-note", "EDIT");

  revalidatePath(`/counsellor/${studentId}`);
}
