import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

// Each deployment can choose its own administrator without changing the code.
// The fallback keeps the original MediaSpace app working as it does today.
const adminLogin = process.env.ADMIN_GITHUB_LOGIN ?? "Vilguinvyhypca";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      return (profile as { login?: string } | undefined)?.login === adminLogin;
    },
    async jwt({ token, profile }) {
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
