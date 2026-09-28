import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { getAllStudents, getCounsellorCaseload, viewerFromSession } from "@/lib/academic-file";

export const dynamic = "force-dynamic";

export default async function CounsellorRosterPage() {
  const session = await auth();
  if (!session) return null;
  if (session.user.role === "STUDENT") redirect("/dashboard");

  const viewer = viewerFromSession(session);
  const students = viewer.role === "ADMIN" ? await getAllStudents() : await getCounsellorCaseload(viewer.id);

  return (
    <>
      <Nav name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold text-western-purple">
          {viewer.role === "ADMIN" ? "All students" : "Your caseload"}
        </h1>
        <p className="text-sm text-neutral-600">
          {viewer.role === "ADMIN"
            ? "Administrators can view any student's academic file."
            : "You can only view students with an active advising relationship assigned to you."}
        </p>

        <ul className="mt-6 space-y-2">
          {students.map((s) => {
            const primaryProgram = s.programs[0]?.program.name;
            return (
              <li key={s.id}>
                <Link
                  href={`/counsellor/${s.id}`}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 shadow-sm hover:border-western-purple hover:shadow"
                >
                  <div>
                    <div className="font-medium">{s.user.name}</div>
                    <div className="text-xs text-neutral-500">{s.user.email}</div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Year {s.year} · {primaryProgram ?? "Undeclared"} · {s.standing.replace(/_/g, " ").toLowerCase()}
                    </div>
                  </div>
                  {s.holds.length > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-600/20">
                      {s.holds.length} hold{s.holds.length > 1 ? "s" : ""}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {students.length === 0 && <li className="text-sm text-neutral-500">No students assigned to you yet.</li>}
        </ul>
      </main>
    </>
  );
}
