import NextAuth, { DefaultSession } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import GithubProvider from "next-auth/providers/github"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    user?: DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubAccessToken?: string
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async session({ session, token }) {
      session.accessToken = token.githubAccessToken
      return session
    },
    async jwt({ token, account }) {
      if (account?.provider === "github") {
        token.githubAccessToken = account.access_token
      }
      return token
    }
  },
  secret: process.env.NEXTAUTH_SECRET
})

export { handler as GET, handler as POST }
