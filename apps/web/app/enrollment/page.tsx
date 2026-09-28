import Link from "next/link";
import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { EnrollmentStatus } from "@/components/enrollment-status";
import { PLANNING_YEAR } from "@/lib/schedule-data";

export const dynamic = "force-dynamic";

const TERMS = ["FALL", "WINTER"] as const;

export default async function EnrollmentPage() {
  const session = await auth();
  if (!session) return null;
  const { user } = session;

  if (user.role !== "STUDENT") {
    return (
      <>
        <Nav name={user.name ?? user.email ?? ""} role={user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">Student-only page.</main>
      </>
    );
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    select: { id: true, enrollmentAppointment: true },
  });
  if (!student) {
    return (
      <>
        <Nav name={user.name ?? user.email ?? ""} role={user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">No student record found for this account.</main>
      </>
    );
  }

  const plans = await prisma.draftSchedule.findMany({
    where: { studentId: student.id, year: PLANNING_YEAR, isEnrollmentPlan: true },
    include: { _count: { select: { items: true } } },
  });
  const planByTerm = new Map(plans.map((p) => [p.term, p]));

  return (
    <>
      <Nav name={user.name ?? user.email ?? ""} role={user.role} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Enrollment</h1>
            <p className="text-sm text-neutral-600">
              Submitting queues your plan for automatic commit at your appointment time
              {student.enrollmentAppointment && ` (${new Date(student.enrollmentAppointment).toLocaleString("en-CA")})`}.
            </p>
          </div>
          <Link href="/plan" className="text-sm text-western-purple underline">
            Edit draft schedules →
          </Link>
        </div>

        {!student.enrollmentAppointment && (
          <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            No enrollment appointment is on file for your account yet — check back once one is assigned.
          </p>
        )}

        <div className="space-y-4">
          {TERMS.map((term) => {
            const plan = planByTerm.get(term);
            return (
              <EnrollmentStatus
                key={term}
                term={term}
                year={PLANNING_YEAR}
                scheduleId={plan?.id ?? null}
                scheduleName={plan?.name ?? null}
                itemCount={plan?._count.items ?? 0}
              />
            );
          })}
        </div>
      </main>
    </>
  );
}
