// Requires a live DATABASE_URL (packages/db/.env) — this proves the atomic
// conditional UPDATE actually prevents oversubscription under real
// concurrent connections, which a mock can't demonstrate.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { commitSeat } from "../src/enrollment.js";

const prisma = new PrismaClient();

let courseId: string;
const sectionIds: string[] = [];

beforeAll(async () => {
  const course = await prisma.course.create({
    data: {
      subject: "TESTCOMMIT",
      subjectName: "Test Commit",
      number: `${randomUUID().slice(0, 8)}A/B`,
      title: "Scratch course for enrollment-commit.test.ts",
      creditWeight: 0.5,
      level: 1000,
      unverified: true,
    },
  });
  courseId = course.id;
});

afterAll(async () => {
  await prisma.section.deleteMany({ where: { id: { in: sectionIds } } });
  await prisma.course.delete({ where: { id: courseId } });
  await prisma.$disconnect();
});

async function makeSection(capacity: number, enrolledCount = 0) {
  const section = await prisma.section.create({
    data: {
      courseId,
      term: "FALL",
      year: 2026,
      component: "LEC",
      sectionCode: "TEST",
      meetingTimes: [],
      capacity,
      enrolledCount,
    },
  });
  sectionIds.push(section.id);
  return section;
}

describe("commitSeat (atomic conditional UPDATE)", () => {
  it("commits when there's room and bumps enrolledCount + version", async () => {
    const section = await makeSection(5, 2);
    const result = await commitSeat(prisma, section.id);
    expect(result.committed).toBe(true);
    expect(result.section?.enrolledCount).toBe(3);
    expect(result.section?.version).toBe(2);
  });

  it("refuses when the section is already full", async () => {
    const section = await makeSection(3, 3);
    const result = await commitSeat(prisma, section.id);
    expect(result.committed).toBe(false);
    const fresh = await prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    expect(fresh.enrolledCount).toBe(3); // unchanged
  });

  it("under N concurrent commits against a 1-seat section, exactly 1 succeeds and the count never exceeds capacity", async () => {
    const section = await makeSection(1, 0);
    const CONCURRENCY = 25;
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => commitSeat(prisma, section.id)));

    const succeeded = results.filter((r) => r.committed);
    expect(succeeded).toHaveLength(1);

    const fresh = await prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    expect(fresh.enrolledCount).toBe(1); // never oversubscribed
    expect(fresh.enrolledCount).toBeLessThanOrEqual(fresh.capacity);
  });

  it("under N concurrent commits against a 10-seat section, exactly 10 succeed", async () => {
    const section = await makeSection(10, 0);
    const CONCURRENCY = 40;
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => commitSeat(prisma, section.id)));

    expect(results.filter((r) => r.committed)).toHaveLength(10);

    const fresh = await prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    expect(fresh.enrolledCount).toBe(10);
  });
});
