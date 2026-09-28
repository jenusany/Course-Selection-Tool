// Requires a live, seeded DATABASE_URL — proves the three Phase 6 acceptance
// criteria for real: (a) a policy question answered with a citation, (b) a
// personal question invoking the audit tool rather than guessing, (c) an
// out-of-scope question politely redirected. Uses MockChatModelProvider so
// the test is deterministic and needs no real API key.
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { answerQuestion } from "../src/orchestrate.js";
import { MockChatModelProvider } from "../src/providers/mock.js";

const prisma = new PrismaClient();
const provider = new MockChatModelProvider();

let marcusStudentId: string;

beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "marcus.chen@uwo.ca" }, include: { student: true } });
  marcusStudentId = user.student!.id;
});

describe("answerQuestion", () => {
  it("(a) answers a policy question using retrieved calendar context with a citation", async () => {
    const result = await answerQuestion({
      prisma,
      provider,
      studentId: marcusStudentId,
      question: "What is the prerequisite for COMPSCI 2210A/B?",
    });
    expect(result.outOfScope).toBe(false);
    expect(result.toolInvoked).toBe(false);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.content).toMatch(/\[\d+\]/);
  });

  it("(b) invokes the degree audit tool for a personal-progress question instead of guessing", async () => {
    const result = await answerQuestion({
      prisma,
      provider,
      studentId: marcusStudentId,
      question: "Am I on track to finish my Computer Science module?",
    });
    expect(result.outOfScope).toBe(false);
    expect(result.toolInvoked).toBe(true);
    expect(result.content).toMatch(/Degree:/);
    expect(result.content).toMatch(/Module:/);
  });

  it("(c) redirects an out-of-scope question to a real counsellor", async () => {
    const result = await answerQuestion({
      prisma,
      provider,
      studentId: marcusStudentId,
      question: "Can I petition for an antirequisite exception?",
    });
    expect(result.outOfScope).toBe(true);
    expect(result.toolInvoked).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.content).toMatch(/academic counsellor/i);
  });
});
