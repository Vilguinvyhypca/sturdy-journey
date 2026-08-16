import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { createHash, timingSafeEqual } from "crypto";

// Each deployment can choose its own administrator without changing the code.
// The fallback keeps the original MediaSpace app working as it does today.
const adminLogin = process.env.ADMIN_GITHUB_LOGIN ?? "Vilguinvyhypca";
const adminPassword = process.env.ADMIN_PASSWORD;

function passwordMatches(value: string) {
  if (!adminPassword) return false;

  const expected = createHash("sha256").update(adminPassword).digest();
  const supplied = createHash("sha256").update(value).digest();
  return timingSafeEqual(expected, supplied);
}

const providers = adminPassword
  ? [
      CredentialsProvider({
        name: "Admin password",
        credentials: {
          password: { label: "Admin password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.password || !passwordMatches(credentials.password)) return null;
          return { id: "password-admin", name: "Administrator" };
        },
      }),
    ]
  : [
      GitHubProvider({
        clientId: process.env.GITHUB_ID ?? "",
        clientSecret: process.env.GITHUB_SECRET ?? "",
      }),
    ];

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "credentials") return user?.id === "password-admin";
      return (profile as { login?: string } | undefined)?.login === adminLogin;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "credentials") token.isAdmin = user?.id === "password-admin";
      if (profile) token.isAdmin = (profile as { login?: string }).login === adminLogin;
      return token;
    },
    async session({ session, token }) {
      (session.user as { isAdmin?: boolean }).isAdmin = token.isAdmin === true;
      return session;
    },
  },
};

export function isAdmin(user: { isAdmin?: boolean } | null | undefined) {
  return user?.isAdmin === true;
}
