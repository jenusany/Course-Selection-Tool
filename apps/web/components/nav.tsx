"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/nav-actions";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, pathname, children }: { href: string; pathname: string; children: React.ReactNode }) {
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 pb-0.5 transition-colors ${
        active ? "border-western-purple font-semibold text-western-purple" : "border-transparent hover:text-western-purple"
      }`}
    >
      {children}
    </Link>
  );
}

export function Nav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="font-semibold text-western-purple">Western Course Selection</div>
          {role === "STUDENT" && (
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
              <NavLink href="/dashboard" pathname={pathname}>Dashboard</NavLink>
              <NavLink href="/plan" pathname={pathname}>Course selection</NavLink>
              <NavLink href="/enrollment" pathname={pathname}>Enrollment</NavLink>
              <NavLink href="/academic-file" pathname={pathname}>Academic file</NavLink>
              <NavLink href="/chat" pathname={pathname}>Ask an advisor</NavLink>
            </nav>
          )}
          {(role === "COUNSELLOR" || role === "ADMIN") && (
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
              <NavLink href="/counsellor" pathname={pathname}>
                {role === "ADMIN" ? "All students" : "Your caseload"}
              </NavLink>
            </nav>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-neutral-600">
            {name} · <span className="uppercase text-neutral-600">{role}</span>
          </span>
          <form action={signOutAction}>
            <button type="submit" className="text-neutral-500 hover:text-western-purple">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
