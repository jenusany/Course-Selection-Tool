import Link from "next/link";
import { prisma } from "@wcs/db";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { getDegreeAudit } from "@/lib/audit";
import { studentRecords } from "@/lib/providers";
import { getDraftSchedules, getPlanningCourses } from "@/lib/schedule-data";
import { SchedulePlanner } from "@/components/schedule-planner";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const session = await auth();
  if (!session) return null; // middleware already redirects; satisfies TS

  const { user } = session;

  if (user.role !== "STUDENT") {
    return (
      <>
        <Nav name={user.name ?? user.email ?? ""} role={user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-xl font-semibold">Course selection is student-only</h1>
          <p className="mt-2 text-neutral-600">Signed in as {user.name} ({user.email}), role {user.role}.</p>
        </main>
      </>
    );
  }

  const student = await prisma.student.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!student) {
    return (
      <>
        <Nav name={user.name ?? user.email ?? ""} role={user.role} />
        <main className="mx-auto max-w-3xl px-4 py-12">No student record found for this account.</main>
      </>
    );
  }

  const [courses, schedules, completed, inProgress, profile, audit] = await Promise.all([
    getPlanningCourses(),
    getDraftSchedules(student.id),
    studentRecords.getCompletedCourses(student.id),
    studentRecords.getInProgressCourses(student.id),
    studentRecords.getProfile(student.id),
    getDegreeAudit(student.id),
  ]);

  return (
    <>
      <Nav name={user.name ?? user.email ?? ""} role={user.role} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Course selection</h1>
            <p className="text-sm text-neutral-600">Search, preview on the calendar, and build a draft schedule.</p>
          </div>
          <Link href="/dashboard" className="text-sm text-western-purple underline">
            Full degree progress →
          </Link>
        </div>
        <SchedulePlanner
          courses={courses}
          initialSchedules={schedules}
          completed={completed.map((c) => ({ course: c.course, grade: c.grade }))}
          inProgress={inProgress.map((c) => c.course)}
          moduleCodes={profile.programs.map((p) => p.code)}
          audit={audit}
        />
      </main>
    </>
  );
}
