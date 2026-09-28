import { prisma } from "@wcs/db";
import { mockLoginEnabled, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function mockSignIn(formData: FormData) {
  "use server";
  const email = formData.get("email");
  if (typeof email !== "string") return;
  await signIn("mock-login", { email, redirectTo: "/dashboard" });
}

export default async function LoginPage() {
  if (!mockLoginEnabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <h1 className="mb-4 text-2xl font-semibold text-western-purple">Sign in</h1>
        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-western-purple px-4 py-2 font-medium text-white hover:opacity-90"
          >
            Sign in with Western Microsoft 365
          </button>
        </form>
      </main>
    );
  }

  const [students, counsellors, admins] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT" },
      include: { student: { include: { programs: { include: { program: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { role: "COUNSELLOR" }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-western-purple">Western Course Selection — Dev Login</h1>
      <p className="mt-1 text-sm text-neutral-600">
        No real Western SSO in this environment. Pick a seeded identity to sign in as. (Set{" "}
        <code className="rounded bg-neutral-200 px-1">AUTH_MODE=entra</code> to use real Microsoft Entra ID instead.)
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Students</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {students.map((u) => {
            const primaryProgram = u.student?.programs.find((p) => p.isPrimary)?.program.name;
            return (
              <form action={mockSignIn} key={u.id}>
                <input type="hidden" name="email" value={u.email} />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-western-purple hover:shadow"
                >
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-neutral-500">{u.email}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Year {u.student?.year} · {primaryProgram ?? "Undeclared"}
                  </div>
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Counsellors &amp; Admin</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[...counsellors, ...admins].map((u) => (
            <form action={mockSignIn} key={u.id}>
              <input type="hidden" name="email" value={u.email} />
              <button
                type="submit"
                className="w-full rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-western-purple hover:shadow"
              >
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-neutral-500">
                  {u.email} · {u.role}
                </div>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
