// Composition root for the chatbot's ChatModelProvider — the one place a
// concrete implementation is chosen, same pattern as lib/providers.ts and
// lib/auth.ts's entraConfigured check. CHAT_MODEL_PROVIDER defaults to
// "mock" (no external calls, no key needed) so the chatbot works out of the
// box; "anthropic"/"ollama" are real, off by default, and only selected
// when their required config is actually present.
import type { ChatModelProvider } from "@wcs/core";
import { AnthropicChatModelProvider, MockChatModelProvider, OllamaChatModelProvider } from "@wcs/chatbot";

function buildChatModelProvider(): ChatModelProvider {
  const mode = process.env.CHAT_MODEL_PROVIDER ?? "mock";

  if (mode === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicChatModelProvider(process.env.ANTHROPIC_API_KEY);
  }
  if (mode === "ollama" && process.env.OLLAMA_BASE_URL) {
    return new OllamaChatModelProvider(process.env.OLLAMA_BASE_URL);
  }
  return new MockChatModelProvider();
}

export const chatModelProvider: ChatModelProvider = buildChatModelProvider();
