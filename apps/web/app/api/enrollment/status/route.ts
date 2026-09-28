import { NextResponse } from "next/server";
import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Not signed in as a student." }, { status: 401 });
  }
  const student = await prisma.student.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  if (!student) return NextResponse.json({ error: "No student record." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const term = searchParams.get("term");
  const year = searchParams.get("year");

  const intent = await prisma.enrollmentIntent.findFirst({
    where: {
      studentId: student.id,
      ...(term ? { term: term as never } : {}),
      ...(year ? { year: Number(year) } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { attempts: { orderBy: { createdAt: "asc" } }, preValidationResults: { orderBy: { computedAt: "desc" }, take: 1 } },
  });

  if (!intent) return NextResponse.json({ intent: null });

  const courseIds = [...new Set((intent.items as Array<{ courseId: string }>).map((i) => i.courseId))];
  const courses = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, subject: true, number: true } });
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return NextResponse.json({
    intent: {
      id: intent.id,
      term: intent.term,
      year: intent.year,
      status: intent.status,
      appointmentTime: intent.appointmentTime,
      preValidated: intent.preValidationResults.length > 0,
      attempts: intent.attempts.map((a) => ({
        outcome: a.outcome,
        reason: a.reason,
        createdAt: a.createdAt,
        course: a.courseId ? (courseById.get(a.courseId) ?? null) : null,
      })),
    },
  });
}
