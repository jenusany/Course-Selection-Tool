"use client";

import { useState } from "react";

interface Citation {
  index: number;
  sourceRef: string;
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  outOfScope?: boolean;
}

export function ChatWidget() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(question: string) {
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsPending(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const answer = (await res.json()) as { content: string; citations: Citation[]; outOfScope: boolean };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer.content, citations: answer.citations, outOfScope: answer.outOfScope },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Ask about course prerequisites, module or degree requirements, or your own progress — e.g. &quot;What&apos;s the
            prerequisite for COMPSCI 2210A/B?&quot; or &quot;Am I on track for my module?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-western-purple text-white"
                  : m.outOfScope
                    ? "border border-amber-300 bg-amber-50 text-amber-900"
                    : "bg-neutral-100 text-neutral-900"
              }`}
            >
              {m.content}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                {m.citations.map((c) => (
                  <a key={c.index} href={c.sourceRef} target="_blank" rel="noreferrer" className="underline hover:text-western-purple">
                    [{c.index}] source
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {isPending && <div className="text-sm text-neutral-400">Thinking…</div>}
        {error && <div className="text-sm text-red-700">{error}</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = input.trim();
          if (!q || isPending) return;
          setInput("");
          void send(q);
        }}
        className="flex gap-2 border-t border-neutral-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="rounded-md bg-western-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
