export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON schema
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ChatModelResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

/**
 * Boundary interface for the advisor chatbot's underlying model. Two
 * implementations: Anthropic API (default) and a local Ollama model for
 * offline dev — selected via CHAT_MODEL_PROVIDER.
 */
export interface ChatModelProvider {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatModelResponse>;
}
