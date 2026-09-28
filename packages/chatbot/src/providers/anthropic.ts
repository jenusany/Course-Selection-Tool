import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatModelProvider, ChatModelResponse, ToolCall, ToolSpec } from "@wcs/core";

const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Real Anthropic Messages API implementation. UNTESTED against the live API
 * in this environment — no ANTHROPIC_API_KEY is configured here (see
 * DATA_TODO.md); MockChatModelProvider is the default. Off by default
 * behind CHAT_MODEL_PROVIDER=anthropic, same "swap later" pattern as the
 * real Entra ID auth provider.
 *
 * ChatMessage's role set (system/user/assistant/tool) is deliberately
 * simpler than Anthropic's native shape — one top-level `system` string,
 * plus tool_use/tool_result content blocks tied together by id — so the
 * same interface also fits Ollama. Every "system" ChatMessage folds into
 * the one system field; a "tool" ChatMessage is sent as a plain user-role
 * text message rather than a native tool_result block. That's a real v1
 * simplification (see DATA_TODO.md), not a bug: Anthropic's own tool-use
 * guide will still work as a policy/personal-question loop, just without
 * native tool_result linkage.
 */
export class AnthropicChatModelProvider implements ChatModelProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatModelResponse> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: system || undefined,
      messages: conversation,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
      })),
    });

    let content: string | null = null;
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") content = (content ?? "") + block.text;
      if (block.type === "tool_use") toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
    }
    return { content, toolCalls };
  }
}
