import { describe, expect, it } from "vitest";
import { checkScope } from "../src/chatbot/guardrails.js";

describe("checkScope", () => {
  it.each([
    "What's the prerequisite for Computer Science 2210A/B?",
    "How many senior credits do I need for an Honours degree?",
    "Am I on track to graduate from the Computer Science HSp?",
    "What courses count toward Breadth Category B?",
  ])("treats a policy/progress question as in scope: %s", (question) => {
    expect(checkScope(question)).toEqual({ inScope: true });
  });

  it.each([
    ["I want to petition to override an antirequisite conflict", "petitions"],
    ["How do I appeal a grade?", "appeals"],
    ["Can I get an accommodation for extended exam time?", "accommodations"],
    ["Am I at risk of being required to withdraw?", "academic standing"],
    ["I'm dealing with a mental health issue affecting my courses", "medical"],
    ["Can I get a bursary or financial aid?", "financial aid"],
  ])("redirects an out-of-scope question to a counsellor: %s", (question) => {
    const result = checkScope(question);
    expect(result.inScope).toBe(false);
    expect(result.redirectMessage).toMatch(/academic counsellor/i);
  });
});
