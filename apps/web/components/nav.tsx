import { signOut } from "@/lib/auth";

export function Nav({ name, role }: { name: string; role: string }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="font-semibold text-western-purple">Western Course Selection</div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-neutral-600">
            {name} · <span className="uppercase text-neutral-400">{role}</span>
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
