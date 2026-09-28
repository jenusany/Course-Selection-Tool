import type { ToolSpec } from "../providers/chat-model.js";

export const GET_DEGREE_AUDIT_TOOL_NAME = "get_degree_audit";

export const GET_DEGREE_AUDIT_TOOL: ToolSpec = {
  name: GET_DEGREE_AUDIT_TOOL_NAME,
  description:
    "Returns the signed-in student's current degree audit: completed and in-progress courses, module and degree requirement progress, and any unmet requirements. Call this for any question about the student's own progress, remaining requirements, eligibility, or standing toward their specific program. Never guess or estimate a student's personal progress from general policy text — always call this instead.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

const PERSONAL_QUESTION_PATTERN =
  /\b(my|i'?m|i am|am i|will i|have i|do i|can i|when (will|do) i|what do i (still )?need)\b/i;

/**
 * Heuristic used only by the mock ChatModelProvider (packages/chatbot/src/providers/mock.ts)
 * to decide whether it would call GET_DEGREE_AUDIT_TOOL — standing in for
 * what a real model infers from the tool's description plus the question.
 */
export function looksPersonal(question: string): boolean {
  return PERSONAL_QUESTION_PATTERN.test(question);
}
