import { describe, expect, it } from "vitest";
import { cosineSimilarity, EMBEDDING_DIMENSIONS, embedText } from "../src/chatbot/embed.js";

describe("embedText", () => {
  it("produces a unit-length vector of the configured dimension", () => {
    const v = embedText("Prerequisite: Computer Science 1026A/B or 1027A/B");
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("is deterministic for the same input", () => {
    const text = "Honours Specialization in Computer Science module requirements";
    expect(embedText(text)).toEqual(embedText(text));
  });

  it("returns a zero vector for text with no tokens", () => {
    expect(embedText("   ---   ")).toEqual(new Array(EMBEDDING_DIMENSIONS).fill(0));
  });

  it("places texts that share vocabulary closer together than unrelated texts", () => {
    const a = embedText("Prerequisite: Computer Science 1026A/B, 1027A/B, or 1032A/B");
    const b = embedText("Antirequisite: Computer Science 1026A/B or 1027A/B");
    const c = embedText("Honours Specialization in Biology requires Biology 1001A and 1002B");

    const related = cosineSimilarity(a, b);
    const unrelated = cosineSimilarity(a, c);
    expect(related).toBeGreaterThan(unrelated);
  });
});
