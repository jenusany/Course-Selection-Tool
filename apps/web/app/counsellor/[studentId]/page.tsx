import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { DegreeProgress } from "@/components/degree-progress";
import { getDegreeAudit } from "@/lib/audit";
import { assertCanViewAcademicFile, getAcademicFile, getAccessLog, recordAccess, viewerFromSession } from "@/lib/academic-file";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddAdvisingNoteForm } from "@/components/add-advising-note-form";

export const dynamic = "force-dynamic";

export default async function StudentAcademicFilePage({ params }: { params: { studentId: string } }) {
  const session = await auth();
  if (!session) return null;
  if (session.user.role === "STUDENT") redirect("/academic-file");

  const viewer = viewerFromSession(session);
  await assertCanViewAcademicFile(viewer, params.studentId);
  await recordAccess(viewer.id, params.studentId, "academic-file", "VIEW");

  const [file, accessLog, audit] = await Promise.all([
    getAcademicFile(params.studentId),
    getAccessLog(params.studentId),
    getDegreeAudit(params.studentId),
  ]);

  const completed = file.enrollments.filter((e) => e.status === "COMPLETED");
  const inProgress = file.enrollments.filter((e) => e.status === "IN_PROGRESS");

  return (
    <>
      <Nav name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-xl font-semibold text-western-purple">{file.user.name}</h1>
        <p className="text-sm text-neutral-600">
          {file.user.email} · Year {file.year} · {file.standing.replace(/_/g, " ").toLowerCase()}
        </p>

        {file.holds.filter((h) => !h.resolvedAt).length > 0 && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <strong>{file.holds.filter((h) => !h.resolvedAt).length} active hold(s):</strong>
            <ul className="mt-1 list-inside list-disc">
              {file.holds
                .filter((h) => !h.resolvedAt)
                .map((h) => (
                  <li key={h.id}>
                    {h.type.replace(/_/g, " ")} — {h.reason}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="notes">Advising notes</TabsTrigger>
            <TabsTrigger value="accommodations">Accommodations &amp; petitions</TabsTrigger>
            <TabsTrigger value="access-log">Access log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Programs</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {file.programs.map((p) => (
                  <li key={p.id}>
                    {p.program.name} {p.isPrimary && <span className="text-xs text-neutral-500">(primary)</span>}
                  </li>
                ))}
                {file.programs.length === 0 && <li className="text-neutral-500">Undeclared</li>}
              </ul>
            </div>
            <div className="mt-4">
              <DegreeProgress audit={audit} />
            </div>
          </TabsContent>

          <TabsContent value="courses">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Completed</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {completed.map((e) => (
                    <li key={e.id}>
                      {e.course.subject} {e.course.number} — {e.term} {e.year}
                      {e.grade != null && <span className="text-neutral-500"> · {e.grade}%</span>}
                    </li>
                  ))}
                  {completed.length === 0 && <li className="text-neutral-500">None</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">In progress</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {inProgress.map((e) => (
                    <li key={e.id}>
                      {e.course.subject} {e.course.number} — {e.term} {e.year}
                    </li>
                  ))}
                  {inProgress.length === 0 && <li className="text-neutral-500">None</li>}
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <div className="space-y-3">
              {file.advisingNotes.map((n) => (
                <div key={n.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{n.topic}</span>
                    <span className="text-xs text-neutral-600">{n.date.toLocaleDateString()}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{n.summary}</p>
                  {n.followUps && <p className="mt-1 text-xs text-neutral-500">Follow-up: {n.followUps}</p>}
                  <p className="mt-1 text-xs text-neutral-600">— {n.counsellor.name}</p>
                </div>
              ))}
              {file.advisingNotes.length === 0 && <p className="text-sm text-neutral-500">No advising notes on file</p>}

              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Add a note</h3>
                <AddAdvisingNoteForm studentId={file.id} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="accommodations">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Accommodations</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {file.accommodationTickets.map((t) => (
                    <li key={t.id}>
                      {t.type} — <span className="text-neutral-500">{t.status.toLowerCase()}</span>
                    </li>
                  ))}
                  {file.accommodationTickets.length === 0 && <li className="text-neutral-500">None on file</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Petitions &amp; exceptions</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {file.petitionExceptions.map((p) => (
                    <li key={p.id}>
                      <div className="font-medium">{p.type}</div>
                      <div className="text-neutral-600">{p.decision}</div>
                      <div className="text-xs text-neutral-600">
                        Decided by {p.decidedBy} · {p.date.toLocaleDateString()}
                      </div>
                    </li>
                  ))}
                  {file.petitionExceptions.length === 0 && <li className="text-neutral-500">None on file</li>}
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="access-log">
            <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500">Every view or edit of this student&apos;s file, visible to them too.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {accessLog.map((entry) => (
                  <li key={entry.id} className="text-neutral-600">
                    {entry.viewer.name} ({entry.viewer.role.toLowerCase()}) — {entry.action.toLowerCase()} {entry.resourceType} —{" "}
                    <span className="text-neutral-600">{entry.createdAt.toLocaleString()}</span>
                  </li>
                ))}
                {accessLog.length === 0 && <li className="text-neutral-500">No recorded views yet</li>}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
