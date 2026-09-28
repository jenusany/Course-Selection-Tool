import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { prisma } from "@wcs/db";
import { mockLoginEnabled, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function credentialsSignIn(formData: FormData) {
  "use server";
  try {
    await signIn("mock-login", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold text-western-purple">Western Course Selection</h1>
      <p className="mt-1 text-sm text-neutral-600">
        No real Western SSO in this environment — sign in with a seeded @uwo.ca account below. (Set{" "}
        <code className="rounded bg-neutral-200 px-1 text-neutral-800">AUTH_MODE=entra</code> to use real Microsoft Entra ID instead.)
      </p>

      <form action={credentialsSignIn} className="mt-6 space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
            UWO email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="you@uwo.ca"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        {searchParams.error && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
            Invalid email or password.
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-md bg-western-purple px-4 py-2 font-medium text-white hover:opacity-90"
        >
          Sign in
        </button>
      </form>

      <section className="mt-10 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Demo accounts</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Every seeded account signs in with the password <code className="rounded bg-neutral-200 px-1 text-neutral-800">test</code>.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-neutral-700">
          {students.map((u) => {
            const primaryProgram = u.student?.programs.find((p) => p.isPrimary)?.program.name;
            return (
              <li key={u.id}>
                {u.name} — <span className="text-neutral-500">{u.email} · Year {u.student?.year} · {primaryProgram ?? "Undeclared"}</span>
              </li>
            );
          })}
          {[...counsellors, ...admins].map((u) => (
            <li key={u.id}>
              {u.name} — <span className="text-neutral-500">{u.email} · {u.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
