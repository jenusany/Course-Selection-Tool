import type { ChatMessage, ChatModelProvider, ChatModelResponse, ToolCall, ToolSpec } from "@wcs/core";

const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

interface OllamaChatResponse {
  message: {
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  };
}

/**
 * Real local-Ollama implementation via its /api/chat endpoint (OpenAI-style
 * tool calling, supported by tool-capable Ollama models like llama3.1).
 * UNTESTED in this environment — no local Ollama server is running (see
 * DATA_TODO.md). Off by default behind CHAT_MODEL_PROVIDER=ollama.
 */
export class OllamaChatModelProvider implements ChatModelProvider {
  constructor(
    private baseUrl: string,
    private model = DEFAULT_MODEL,
  ) {}

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatModelResponse> {
    const body = {
      model: this.model,
      stream: false,
      messages: messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })),
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as OllamaChatResponse;
    const toolCalls: ToolCall[] = (data.message.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      input: tc.function.arguments,
    }));
    return { content: data.message.content || null, toolCalls };
  }
}
