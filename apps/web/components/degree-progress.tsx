import type {
  CourseRef,
  DegreeAuditResult,
  ModuleAuditResult,
  RequirementResult,
  RequirementStatus,
} from "@wcs/core";

const STATUS: Record<RequirementStatus, { label: string; badge: string; dot: string }> = {
  MET: { label: "Met", badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", dot: "bg-emerald-600" },
  IN_PROGRESS: { label: "In progress", badge: "bg-amber-50 text-amber-800 ring-amber-600/20", dot: "bg-amber-500" },
  UNMET: { label: "Not met", badge: "bg-neutral-100 text-neutral-700 ring-neutral-500/20", dot: "bg-neutral-400" },
};

const MODULE_TYPE: Record<ModuleAuditResult["type"], string> = {
  HONOURS_SPECIALIZATION: "Honours Specialization",
  MAJOR: "Major",
  MINOR: "Minor",
  SPECIALIZATION: "Specialization",
  GENERAL: "General",
};

const code = (c: CourseRef) => `${c.subject} ${c.number}`;
const credits = (n: number) => n.toFixed(1);

function StatusBadge({ status }: { status: RequirementStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

function ProgressBar({ completed, inProgress, required, label }: { completed: number; inProgress: number; required: number; label: string }) {
  const pct = (n: number) => `${Math.min(100, (n / required) * 100)}%`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={required}
      aria-valuenow={completed}
      aria-valuetext={`${credits(completed)} of ${credits(required)} credits completed, ${credits(inProgress)} in progress`}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
    >
      <div className="h-full bg-western-purple" style={{ width: pct(completed) }} />
      <div className="h-full bg-western-purple/35" style={{ width: pct(inProgress) }} />
    </div>
  );
}

function CourseChips({ courses, tone }: { courses: CourseRef[]; tone: "done" | "ip" | "suggest" }) {
  const cls = {
    done: "bg-western-purple/10 text-western-purple",
    ip: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-600/20",
    suggest: "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-300",
  }[tone];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {courses.map((c) => (
        <li key={code(c)} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${cls}`}>
          {code(c)}
        </li>
      ))}
    </ul>
  );
}

function RequirementRow({ r }: { r: RequirementResult }) {
  const measure = r.average
    ? r.average.value === null
      ? `— / ${r.average.required}%`
      : `${r.average.value.toFixed(1)}% / ${r.average.required}%`
    : r.countRequired
      ? `${r.children?.filter((c) => c.status === "MET").length ?? 0} of ${r.countRequired}`
      : r.creditsRequired > 0
        ? `${credits(r.creditsCompleted)}${r.creditsInProgress > 0 ? ` (+${credits(r.creditsInProgress)})` : ""} / ${credits(r.creditsRequired)}`
        : null;
  const hasDetail =
    r.satisfiedBy.length > 0 || r.inProgressBy.length > 0 || r.suggestedCourses.length > 0 || r.notes.length > 0 || !!r.children;

  const summary = (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1 text-sm text-neutral-800">{r.label}</div>
      {measure && <div className="shrink-0 pt-0.5 text-xs tabular-nums text-neutral-500">{measure}</div>}
      <StatusBadge status={r.status} />
    </div>
  );

  if (!hasDetail) return <li className="px-4">{summary}</li>;

  return (
    <li className="px-4">
      <details className="group">
        <summary className="cursor-pointer list-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-western-purple [&::-webkit-details-marker]:hidden">
          {summary}
        </summary>
        <div className="space-y-2 pb-3 pl-1 text-xs text-neutral-600">
          {r.satisfiedBy.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-neutral-500">Counted</div>
              <CourseChips courses={r.satisfiedBy} tone="done" />
            </div>
          )}
          {r.inProgressBy.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-neutral-500">In progress</div>
              <CourseChips courses={r.inProgressBy} tone="ip" />
            </div>
          )}
          {r.suggestedCourses.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-neutral-500">Courses that would count</div>
              <CourseChips courses={r.suggestedCourses} tone="suggest" />
            </div>
          )}
          {r.children && (
            <ul className="divide-y divide-neutral-100 rounded border border-neutral-100">
              {r.children.map((c) => (
                <RequirementRow key={c.id} r={c} />
              ))}
            </ul>
          )}
          {r.notes.map((n) => (
            <p key={n} className="text-neutral-500">
              {n}
            </p>
          ))}
        </div>
      </details>
    </li>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">{children}</section>;
}

function ModuleCard({ m }: { m: ModuleAuditResult }) {
  return (
    <Card>
      <div className="space-y-2 border-b border-neutral-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">{m.name}</h3>
            <p className="text-xs text-neutral-500">
              {MODULE_TYPE[m.type]} · {m.isPrimary ? "primary module" : "additional module"}
            </p>
          </div>
          <StatusBadge status={m.status} />
        </div>
        <ProgressBar completed={m.creditsCompleted} inProgress={m.creditsInProgress} required={m.creditsRequired} label={`${m.name} progress`} />
        <p className="text-xs tabular-nums text-neutral-500">
          {credits(m.creditsCompleted)} of {credits(m.creditsRequired)} module credits
          {m.creditsInProgress > 0 && ` · ${credits(m.creditsInProgress)} in progress`}
        </p>
      </div>
      <ul className="divide-y divide-neutral-100">
        {m.requirements.map((r) => (
          <RequirementRow key={r.id} r={r} />
        ))}
      </ul>
      {m.notes.length > 0 && (
        <div className="space-y-1 border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
          {m.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

export function DegreeProgress({ audit }: { audit: DegreeAuditResult }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Degree progress</h2>
              <p className="text-base font-semibold text-neutral-900">{audit.degree.name}</p>
            </div>
            <StatusBadge status={audit.status} />
          </div>
          <ProgressBar
            completed={audit.creditsCompleted}
            inProgress={audit.creditsInProgress}
            required={audit.creditsRequired}
            label="Degree credit progress"
          />
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Completed", audit.creditsCompleted],
              ["In progress", audit.creditsInProgress],
              ["Required", audit.creditsRequired],
            ].map(([label, n]) => (
              <div key={label as string}>
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums text-western-purple">{credits(n as number)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {audit.warnings.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {audit.warnings.map((w) => (
            <p key={w.message}>{w.message}</p>
          ))}
        </div>
      )}
      {audit.advisories.length > 0 && (
        <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {audit.advisories.map((a) => (
            <p key={a.message}>{a.message}</p>
          ))}
        </div>
      )}

      {audit.modules.length === 0 ? (
        <Card>
          <p className="px-4 py-3 text-sm text-neutral-600">
            No module declared yet — your degree-level progress is below. Module requirements will appear here once you
            declare one.
          </p>
        </Card>
      ) : (
        audit.modules.map((m) => <ModuleCard key={m.code} m={m} />)
      )}

      <Card>
        <div className="border-b border-neutral-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">Degree requirements</h3>
          <p className="text-xs text-neutral-500">Breadth, essay, senior-credit and average rules for the whole degree.</p>
        </div>
        <ul className="divide-y divide-neutral-100">
          {audit.degreeRequirements.map((r) => (
            <RequirementRow key={r.id} r={r} />
          ))}
        </ul>
      </Card>

      <details className="text-xs text-neutral-600">
        <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-western-purple">Not checked by this audit</summary>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          {audit.notEvaluated.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-1">Generated {new Date(audit.generatedAt).toLocaleString("en-CA")} · engine v{audit.engineVersion}</p>
      </details>
    </div>
  );
}
