// Requires a live, seeded DATABASE_URL (`pnpm db:seed` must have run,
// including CalendarChunk ingestion) — proves real pgvector `<=>` retrieval
// actually surfaces the relevant chunk, which a mock can't demonstrate.
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { retrieveRelevantChunks } from "../src/retrieve.js";

const prisma = new PrismaClient();

describe("retrieveRelevantChunks", () => {
  it("surfaces the COMPSCI 2210A/B chunk for a question naming that course", async () => {
    const results = await retrieveRelevantChunks(prisma, "What is the prerequisite for COMPSCI 2210A/B?", 4);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.content.includes("COMPSCI 2210A/B"))).toBe(true);
  });

  it("surfaces the Honours Specialization in Computer Science module chunk for a module question", async () => {
    const results = await retrieveRelevantChunks(prisma, "What are the requirements for the Computer Science Honours Specialization?", 4);
    expect(results.some((r) => r.sourceRef.includes("ModuleID=21123"))).toBe(true);
  });

  it("orders results by ascending cosine distance", async () => {
    const results = await retrieveRelevantChunks(prisma, "Breadth Category B essay requirement", 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.distance).toBeGreaterThanOrEqual(results[i - 1]!.distance);
    }
  });
});
