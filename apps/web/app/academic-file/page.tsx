import { redirect } from "next/navigation";
import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { assertCanViewAcademicFile, getAcademicFile, getAccessLog, recordAccess, viewerFromSession } from "@/lib/academic-file";

export const dynamic = "force-dynamic";

export default async function AcademicFilePage() {
  const session = await auth();
  if (!session) return null;
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const viewer = viewerFromSession(session);
  const student = await prisma.student.findUnique({ where: { userId: viewer.id }, select: { id: true } });
  if (!student) {
    return (
      <>
        <Nav name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">No student record found for this account.</main>
      </>
    );
  }

  await assertCanViewAcademicFile(viewer, student.id);
  await recordAccess(viewer.id, student.id, "academic-file", "VIEW");

  const [file, accessLog] = await Promise.all([getAcademicFile(student.id), getAccessLog(student.id)]);

  const completed = file.enrollments.filter((e) => e.status === "COMPLETED");
  const inProgress = file.enrollments.filter((e) => e.status === "IN_PROGRESS");

  return (
    <>
      <Nav name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold text-western-purple">Your academic file</h1>
        <p className="text-sm text-neutral-600">
          Year {file.year} · {file.standing.replace(/_/g, " ").toLowerCase()}
        </p>

        <Section title="Programs">
          <ul className="mt-2 space-y-1 text-sm">
            {file.programs.map((p) => (
              <li key={p.id}>
                {p.program.name} {p.isPrimary && <span className="text-xs text-neutral-500">(primary)</span>}
              </li>
            ))}
            {file.programs.length === 0 && <li className="text-neutral-500">Undeclared</li>}
          </ul>
        </Section>

        <Section title="Holds">
          <ul className="mt-2 space-y-1 text-sm">
            {file.holds.map((h) => (
              <li key={h.id}>
                {h.type.replace(/_/g, " ")} — {h.reason}
                {h.resolvedAt ? (
                  <span className="text-xs text-neutral-500"> (resolved)</span>
                ) : (
                  <span className="text-xs text-red-700"> (active)</span>
                )}
              </li>
            ))}
            {file.holds.length === 0 && <li className="text-neutral-500">None</li>}
          </ul>
        </Section>

        <Section title="Completed courses">
          <ul className="mt-2 space-y-1 text-sm">
            {completed.map((e) => (
              <li key={e.id}>
                {e.course.subject} {e.course.number} — {e.term} {e.year}
                {e.grade != null && <span className="text-neutral-500"> · {e.grade}%</span>}
              </li>
            ))}
            {completed.length === 0 && <li className="text-neutral-500">None</li>}
          </ul>
        </Section>

        <Section title="In progress">
          <ul className="mt-2 space-y-1 text-sm">
            {inProgress.map((e) => (
              <li key={e.id}>
                {e.course.subject} {e.course.number} — {e.term} {e.year}
              </li>
            ))}
            {inProgress.length === 0 && <li className="text-neutral-500">None</li>}
          </ul>
        </Section>

        <Section title="Accommodations">
          <ul className="mt-2 space-y-1 text-sm">
            {file.accommodationTickets.map((t) => (
              <li key={t.id}>
                {t.type} — <span className="text-neutral-500">{t.status.toLowerCase()}</span>
              </li>
            ))}
            {file.accommodationTickets.length === 0 && <li className="text-neutral-500">None on file</li>}
          </ul>
        </Section>

        <Section title="Petitions & exceptions">
          <ul className="mt-2 space-y-2 text-sm">
            {file.petitionExceptions.map((p) => (
              <li key={p.id}>
                <div className="font-medium">{p.type}</div>
                <div className="text-neutral-600">{p.decision}</div>
                <div className="text-xs text-neutral-400">Decided by {p.decidedBy} · {p.date.toLocaleDateString()}</div>
              </li>
            ))}
            {file.petitionExceptions.length === 0 && <li className="text-neutral-500">None on file</li>}
          </ul>
        </Section>

        <Section title="Advising notes">
          <ul className="mt-2 space-y-3 text-sm">
            {file.advisingNotes.map((n) => (
              <li key={n.id} className="rounded-md border border-neutral-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{n.topic}</span>
                  <span className="text-xs text-neutral-400">{n.date.toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-neutral-600">{n.summary}</p>
                {n.followUps && <p className="mt-1 text-xs text-neutral-500">Follow-up: {n.followUps}</p>}
                <p className="mt-1 text-xs text-neutral-400">— {n.counsellor.name}</p>
              </li>
            ))}
            {file.advisingNotes.length === 0 && <li className="text-neutral-500">No advising notes on file</li>}
          </ul>
        </Section>

        <Section title="Who has viewed your file">
          <p className="mt-1 text-xs text-neutral-500">Every view or edit of your academic file is logged here.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {accessLog.map((entry) => (
              <li key={entry.id} className="text-neutral-600">
                {entry.viewer.name} ({entry.viewer.role.toLowerCase()}) — {entry.action.toLowerCase()} {entry.resourceType} —{" "}
                <span className="text-neutral-400">{entry.createdAt.toLocaleString()}</span>
              </li>
            ))}
            {accessLog.length === 0 && <li className="text-neutral-500">No recorded views yet</li>}
          </ul>
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}
