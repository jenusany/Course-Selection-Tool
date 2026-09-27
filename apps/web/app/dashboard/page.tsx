import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null; // middleware already redirects; satisfies TS

  const { user } = session;

  if (user.role !== "STUDENT") {
    return (
      <>
        <Nav name={user.name ?? user.email ?? ""} role={user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-xl font-semibold">{user.role === "COUNSELLOR" ? "Counsellor" : "Admin"} portal</h1>
          <p className="mt-2 text-neutral-600">
            Coming in a later phase. Signed in as {user.name} ({user.email}).
          </p>
        </main>
      </>
    );
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    include: {
      programs: { include: { program: true } },
      holds: { where: { resolvedAt: null } },
      enrollments: { include: { course: true } },
    },
  });

  if (!student) {
    return (
      <>
        <Nav name={user.name ?? user.email ?? ""} role={user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">No student record found for this account.</main>
      </>
    );
  }

  const completed = student.enrollments.filter((e) => e.status === "COMPLETED");
  const inProgress = student.enrollments.filter((e) => e.status === "IN_PROGRESS");
  const creditsCompleted = completed.reduce((sum, e) => sum + e.course.creditWeight, 0);
  const creditsInProgress = inProgress.reduce((sum, e) => sum + e.course.creditWeight, 0);

  return (
    <>
      <Nav name={user.name ?? user.email ?? ""} role={user.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold">Welcome back, {user.name}</h1>
        <p className="text-sm text-neutral-600">
          Year {student.year} · {student.standing.replace(/_/g, " ").toLowerCase()}
        </p>

        {student.holds.length > 0 && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <strong>{student.holds.length} active hold(s):</strong>
            <ul className="mt-1 list-inside list-disc">
              {student.holds.map((h) => (
                <li key={h.id}>
                  {h.type.replace(/_/g, " ")} — {h.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-2xl font-semibold text-western-purple">{creditsCompleted.toFixed(1)}</div>
            <div className="text-xs text-neutral-500">Credits completed</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-2xl font-semibold text-western-purple">{creditsInProgress.toFixed(1)}</div>
            <div className="text-xs text-neutral-500">Credits in progress</div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-2xl font-semibold text-western-purple">20.0</div>
            <div className="text-xs text-neutral-500">Required for Honours BSc</div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Program(s)</h2>
          {student.programs.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">Undeclared</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {student.programs.map((sp) => (
                <li key={sp.id}>
                  {sp.program.name} {sp.isPrimary ? "" : "(secondary)"}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">In progress this term</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {inProgress.map((e) => (
              <li key={e.id}>
                {e.course.subject} {e.course.number} — {e.course.title}
              </li>
            ))}
            {inProgress.length === 0 && <li className="text-neutral-500">None</li>}
          </ul>
        </section>

        <p className="mt-10 text-xs text-neutral-400">
          Degree audit, course search, and the schedule builder land in later phases — this dashboard is Phase 1
          scaffolding only.
        </p>
      </main>
    </>
  );
}
