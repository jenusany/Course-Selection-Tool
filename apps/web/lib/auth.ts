import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@wcs/db";

const UWO_EMAIL = /@uwo\.ca$/i;

// Dev-only fixed password for every seeded mock account — there's no real
// credential store to check against (see CLAUDE.md's Auth section), so this
// is a shared password, not per-user hashed auth. Override via env if you
// want a different one for a shared/demo deployment.
const MOCK_LOGIN_PASSWORD = process.env.MOCK_LOGIN_PASSWORD ?? "test";

const entraConfigured =
  process.env.AUTH_MODE === "entra" &&
  !!process.env.AUTH_ENTRA_ID_TENANT_ID &&
  !!process.env.AUTH_ENTRA_ID_CLIENT_ID &&
  !!process.env.AUTH_ENTRA_ID_CLIENT_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    // Dev-only mock login: a typed @uwo.ca email + the shared MOCK_LOGIN_PASSWORD
    // against a seeded user. Listed on /login only when AUTH_MODE !== "entra".
    // Real deployments should set AUTH_MODE=entra and drop this provider
    // entirely at build time.
    Credentials({
      id: "mock-login",
      name: "Mock Western Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || !UWO_EMAIL.test(email)) return null;
        if (typeof password !== "string" || password !== MOCK_LOGIN_PASSWORD) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    ...(entraConfigured
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_ENTRA_ID_CLIENT_ID,
            clientSecret: process.env.AUTH_ENTRA_ID_CLIENT_SECRET,
            issuer: `https://login.microsoftonline.com/${process.env.AUTH_ENTRA_ID_TENANT_ID}/v2.0`,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || !UWO_EMAIL.test(user.email)) return false;
      if (account?.provider === "microsoft-entra-id") {
        // First real-SSO login: provision the User row if it doesn't exist yet.
        await prisma.user.upsert({
          where: { email: user.email },
          update: {},
          create: { email: user.email, name: user.name ?? user.email, role: "STUDENT" },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as "STUDENT" | "COUNSELLOR" | "ADMIN";
      }
      return session;
    },
  },
});

export const mockLoginEnabled = process.env.AUTH_MODE !== "entra";
