"use client";

import { useRef, useState, useTransition } from "react";
import { addAdvisingNote } from "@/lib/counsellor-actions";

export function AddAdvisingNoteForm({ studentId }: { studentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          try {
            await addAdvisingNote(studentId, formData);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save note.");
          }
        });
      }}
      className="mt-2 space-y-2"
    >
      <input
        name="topic"
        placeholder="Topic"
        required
        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      />
      <textarea
        name="summary"
        placeholder="Summary"
        required
        rows={3}
        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      />
      <input
        name="followUps"
        placeholder="Follow-ups (optional)"
        className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-western-purple px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add note"}
      </button>
    </form>
  );
}
