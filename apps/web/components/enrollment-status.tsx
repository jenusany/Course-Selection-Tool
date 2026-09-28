"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitEnrollmentPlan } from "@/lib/enrollment-actions";

interface AttemptDTO {
  outcome: string;
  reason: string | null;
  createdAt: string;
  course: { subject: string; number: string } | null;
}

interface IntentDTO {
  id: string;
  term: string;
  year: number;
  status: string;
  appointmentTime: string;
  preValidated: boolean;
  attempts: AttemptDTO[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued — waiting for your appointment",
  QUEUED: "Queued",
  VALIDATING: "Validating and committing seats…",
  ENROLLED: "Enrolled",
  PARTIALLY_ENROLLED: "Partially enrolled",
  FAILED: "Failed",
};

const TERMINAL = new Set(["ENROLLED", "PARTIALLY_ENROLLED", "FAILED"]);

export function EnrollmentStatus({ term, year, scheduleId, scheduleName, itemCount }: { term: string; year: number; scheduleId: string | null; scheduleName: string | null; itemCount: number }) {
  const [intent, setIntent] = useState<IntentDTO | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/enrollment/status?term=${term}&year=${year}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setIntent(data.intent);
        setLoaded(true);
        if (!data.intent || !TERMINAL.has(data.intent.status)) {
          timer = setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, year]);

  function handleSubmit() {
    if (!scheduleId) return;
    startTransition(async () => {
      try {
        setError(null);
        await submitEnrollmentPlan(scheduleId);
        setLoaded(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't submit.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">{term} {year}</h3>
      {scheduleName ? (
        <p className="mt-1 text-sm text-neutral-600">
          Enrollment plan: <span className="font-medium">{scheduleName}</span> ({itemCount} course{itemCount === 1 ? "" : "s"})
        </p>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">No schedule marked as your enrollment plan for this term yet.</p>
      )}

      {error && <p role="alert" className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">{error}</p>}

      {scheduleId && (
        <Button size="sm" className="mt-2" disabled={isPending} onClick={handleSubmit}>
          {intent ? "Re-submit enrollment intent" : "Submit enrollment intent"}
        </Button>
      )}

      {loaded && intent && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <p className="text-sm">
            Status: <span className="font-medium">{STATUS_LABEL[intent.status] ?? intent.status}</span>
            {intent.preValidated && !TERMINAL.has(intent.status) && <span className="ml-1 text-xs text-emerald-700">(pre-validated)</span>}
          </p>
          <p className="text-xs text-neutral-500">Appointment: {new Date(intent.appointmentTime).toLocaleString("en-CA")}</p>
          {intent.attempts.length > 0 && (
            <ul className="space-y-1 text-xs">
              {intent.attempts.map((a, i) => (
                <li key={i} className={a.outcome === "ENROLLED" ? "text-emerald-700" : "text-red-700"}>
                  {a.course ? `${a.course.subject} ${a.course.number}` : "Course"} — {a.outcome}
                  {a.reason && `: ${a.reason}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
