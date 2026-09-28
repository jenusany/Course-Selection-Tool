import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@wcs/db";

const UWO_EMAIL = /@uwo\.ca$/i;

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
    // Dev-only mock login: picks a seeded user by email, no password. Listed
    // on /login only when AUTH_MODE !== "entra". Real deployments should set
    // AUTH_MODE=entra and drop this provider entirely at build time.
    Credentials({
      id: "mock-login",
      name: "Mock Western Login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = credentials?.email;
        if (typeof email !== "string" || !UWO_EMAIL.test(email)) return null;
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
