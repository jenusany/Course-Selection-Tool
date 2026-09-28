import type { PrismaClient } from "@prisma/client";
import { checkScope, GET_DEGREE_AUDIT_TOOL, GET_DEGREE_AUDIT_TOOL_NAME, type ChatMessage, type ChatModelProvider } from "@wcs/core";
import { getDegreeAudit } from "@wcs/db/server";
import { retrieveRelevantChunks, type RetrievedChunk } from "./retrieve.js";
import { summarizeAuditForTool } from "./summarize-audit.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Citation {
  index: number;
  sourceRef: string;
}

export interface ChatAnswer {
  content: string;
  citations: Citation[];
  toolInvoked: boolean;
  outOfScope: boolean;
}

const SYSTEM_PROMPT = `You are the Western Course Selection advisor chatbot, helping a Faculty of Science student with policy questions about courses, modules, and degree requirements, and with questions about their own progress.

Rules:
- For a question about the student's own progress, eligibility, or what they still need, call the get_degree_audit tool rather than guessing — never estimate a student's personal progress from general policy text.
- For a general policy/calendar question, answer only using the "Relevant calendar excerpts" provided, and cite the excerpt number(s) you used, like [1]. If the excerpts don't cover the question, say you're not sure rather than guessing.
- Keep answers concise and specific.`;

function buildContextMessage(chunks: RetrievedChunk[]): ChatMessage {
  const body = chunks.map((c, i) => `[${i + 1}] (source: ${c.sourceRef})\n${c.content}`).join("\n\n");
  return { role: "system", content: `Relevant calendar excerpts:\n\n${body}` };
}

/**
 * The chatbot's single entry point: applies scope guardrails, retrieves
 * calendar context, and — if the model asks for it — calls the real degree
 * audit engine before producing a final answer. Framework-agnostic aside
 * from taking a Prisma client (this package is Node-only, matching
 * packages/db; see CLAUDE.md).
 */
export async function answerQuestion(opts: {
  prisma: PrismaClient;
  provider: ChatModelProvider;
  studentId: string;
  question: string;
  history?: ChatTurn[];
}): Promise<ChatAnswer> {
  const { prisma, provider, studentId, question, history = [] } = opts;

  const scope = checkScope(question);
  if (!scope.inScope) {
    return { content: scope.redirectMessage ?? "", citations: [], toolInvoked: false, outOfScope: true };
  }

  const chunks = await retrieveRelevantChunks(prisma, question, 4);
  const citations: Citation[] = chunks.map((c, i) => ({ index: i + 1, sourceRef: c.sourceRef }));

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    buildContextMessage(chunks),
    ...history.map((h): ChatMessage => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];

  const tools = [GET_DEGREE_AUDIT_TOOL];
  let response = await provider.complete(messages, tools);
  let toolInvoked = false;

  const auditCall = response.toolCalls.find((t) => t.name === GET_DEGREE_AUDIT_TOOL_NAME);
  if (auditCall) {
    toolInvoked = true;
    const audit = await getDegreeAudit(prisma, studentId);
    messages.push({ role: "assistant", content: response.content ?? "" });
    messages.push({ role: "tool", content: summarizeAuditForTool(audit) });
    response = await provider.complete(messages, tools);
  }

  return {
    content: response.content ?? "",
    citations: toolInvoked ? [] : citations,
    toolInvoked,
    outOfScope: false,
  };
}
