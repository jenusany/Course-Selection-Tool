import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { ChatWidget } from "@/components/chat-widget";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await auth();
  if (!session) return null;
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  return (
    <>
      <Nav name={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold text-western-purple">Ask an advisor</h1>
        <p className="mb-4 text-sm text-neutral-600">
          Answers about policy cite the calendar; personal questions use your live degree audit. Anything about
          petitions, appeals, accommodations, or academic standing gets redirected to a real counsellor.
        </p>
        <ChatWidget />
      </main>
    </>
  );
}
