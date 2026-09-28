import { redirect } from "next/navigation";
import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { DegreeProgress } from "@/components/degree-progress";
import { getDegreeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null; // middleware already redirects; satisfies TS

  const { user } = session;

  if (user.role !== "STUDENT") redirect("/counsellor");

  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    include: {
      holds: { where: { resolvedAt: null } },
      enrollments: { where: { status: "IN_PROGRESS" }, include: { course: true } },
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

  const inProgress = student.enrollments;
  const audit = await getDegreeAudit(student.id);

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

        <section className="mt-6">
          <DegreeProgress audit={audit} />
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
          Course search and the schedule builder land in Phase 3.
        </p>
      </main>
    </>
  );
}
