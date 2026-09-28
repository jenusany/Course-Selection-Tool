import Link from "next/link";
import { signOut } from "@/lib/auth";

export function Nav({ name, role }: { name: string; role: string }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="font-semibold text-western-purple">Western Course Selection</div>
          {role === "STUDENT" && (
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
              <Link href="/dashboard" className="hover:text-western-purple">Dashboard</Link>
              <Link href="/plan" className="hover:text-western-purple">Course selection</Link>
              <Link href="/enrollment" className="hover:text-western-purple">Enrollment</Link>
              <Link href="/academic-file" className="hover:text-western-purple">Academic file</Link>
              <Link href="/chat" className="hover:text-western-purple">Ask an advisor</Link>
            </nav>
          )}
          {(role === "COUNSELLOR" || role === "ADMIN") && (
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
              <Link href="/counsellor" className="hover:text-western-purple">
                {role === "ADMIN" ? "All students" : "Your caseload"}
              </Link>
            </nav>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-neutral-600">
            {name} · <span className="uppercase text-neutral-600">{role}</span>
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-neutral-500 hover:text-western-purple">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
