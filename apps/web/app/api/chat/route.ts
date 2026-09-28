import { NextResponse } from "next/server";
import { answerQuestion, type ChatTurn } from "@wcs/chatbot";
import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";
import { chatModelProvider } from "@/lib/chat-providers";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Not signed in as a student." }, { status: 401 });
  }
  const student = await prisma.student.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  if (!student) return NextResponse.json({ error: "No student record." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { question?: unknown; history?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "A question is required." }, { status: 400 });

  const history: ChatTurn[] = Array.isArray(body?.history)
    ? body.history.filter(
        (h): h is ChatTurn =>
          typeof h === "object" && h !== null && (h.role === "user" || h.role === "assistant") && typeof h.content === "string",
      )
    : [];

  const answer = await answerQuestion({
    prisma,
    provider: chatModelProvider,
    studentId: student.id,
    question,
    history,
  });

  return NextResponse.json(answer);
}
