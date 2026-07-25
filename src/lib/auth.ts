import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { saveRefreshToken } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
      checks: ["state"],
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.refresh_token) {
        // Googleカレンダー自動連携のためrefresh tokenをDBに永続保存
        try {
          await saveRefreshToken(account.refresh_token);
        } catch (e) {
          console.error("Failed to save refresh token:", e);
        }
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});
