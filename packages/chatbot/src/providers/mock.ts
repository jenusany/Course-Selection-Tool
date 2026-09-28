import type { ChatMessage, ChatModelProvider, ChatModelResponse, ToolSpec } from "@wcs/core";
import { GET_DEGREE_AUDIT_TOOL_NAME, looksPersonal } from "@wcs/core";

interface ParsedContextChunk {
  index: number;
  sourceRef: string;
  content: string;
}

const CONTEXT_MARKER = "Relevant calendar excerpts:";

function parseContext(messages: ChatMessage[]): ParsedContextChunk[] {
  const ctxMsg = messages.find((m) => m.role === "system" && m.content.startsWith(CONTEXT_MARKER));
  if (!ctxMsg) return [];
  const chunks: ParsedContextChunk[] = [];
  const re = /\[(\d+)\] \(source: (.*?)\)\n([\s\S]*?)(?=\n\n\[\d+\]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ctxMsg.content))) {
    chunks.push({ index: Number(match[1]), sourceRef: match[2]!, content: match[3]!.trim() });
  }
  return chunks;
}

/**
 * Deterministic dev ChatModelProvider — no external API calls, no API key
 * needed. Mirrors the mock auth/mock student-record pattern used throughout
 * the app: runs out of the box so the chatbot (retrieval, citations, tool
 * routing, guardrails) is fully testable without a real provider. Swap for
 * AnthropicChatModelProvider or OllamaChatModelProvider (this directory's
 * other providers) via CHAT_MODEL_PROVIDER once one is configured.
 *
 * Simulates what a real model would do with the same system prompt and
 * tool description: calls get_degree_audit for a personal-sounding question
 * (via packages/core's looksPersonal heuristic), otherwise answers from the
 * first retrieved calendar excerpt with a citation.
 */
export class MockChatModelProvider implements ChatModelProvider {
  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatModelResponse> {
    const last = messages[messages.length - 1];

    // Second turn: the tool result was just appended — synthesize the final answer from it.
    if (last?.role === "tool") {
      return {
        content: `Here's where you stand, based on your current degree audit:\n\n${last.content}`,
        toolCalls: [],
      };
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = lastUser?.content ?? "";
    const auditTool = tools.find((t) => t.name === GET_DEGREE_AUDIT_TOOL_NAME);

    if (auditTool && looksPersonal(question)) {
      return { content: null, toolCalls: [{ name: auditTool.name, input: {} }] };
    }

    const chunks = parseContext(messages);
    if (chunks.length === 0) {
      return { content: "I don't have enough information from the calendar to answer that confidently.", toolCalls: [] };
    }
    const top = chunks[0]!;
    const excerpt = top.content.length > 240 ? `${top.content.slice(0, 240)}…` : top.content;
    return { content: `Based on the calendar: ${excerpt} [${top.index}]`, toolCalls: [] };
  }
}
