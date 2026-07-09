"use client"

import React, { useEffect } from "react"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import AppBackground from "../components/AppBackground"

export default function LoginPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/app")
    }
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] text-[#EDEDED]">
        <div className="animate-pulse text-sm font-mono text-neutral-400">Loading session...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative bg-[#0A0A0B] select-none overflow-hidden">
      {/* 3D Particle Background */}
      <AppBackground appState="ingest" />

      {/* Decorative Grid Lines backdrop */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" style={{ zIndex: 1 }} />
      <div className="absolute inset-0 glow-overlay pointer-events-none" style={{ zIndex: 1 }} />

      {/* Centered Login Card */}
      <div
        className="w-full flex flex-col justify-between"
        style={{
          background: "rgba(13, 13, 15, 0.9)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "16px",
          padding: "40px",
          width: "400px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          zIndex: 10,
        }}
      >
        {/* SyntreeAI Logo + Name */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-black font-mono font-bold text-lg mx-auto mb-3.5 shadow-lg shadow-blue-500/10">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1.5">
            Syntree<span className="text-blue-500 font-mono">AI</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium">
            Understand any codebase in seconds
          </p>
        </div>

        {/* OAuth Buttons Container */}
        <div className="space-y-3.5">
          {/* GitHub button */}
          <button
            onClick={() => signIn("github", { callbackUrl: "/app" })}
            className="flex items-center justify-center w-full transition-all cursor-pointer select-none"
            style={{
              background: "#24292e",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "white",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2f363d")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#24292e")}
          >
            <svg
              className="w-4 h-4 mr-2.5 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"
              />
            </svg>
            Continue with GitHub
          </button>

          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-neutral-800" />
            <span className="mx-3.5 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">or</span>
            <div className="flex-grow border-t border-neutral-800" />
          </div>

          {/* Google button */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/app" })}
            className="flex items-center justify-center w-full transition-all cursor-pointer select-none"
            style={{
              background: "#fff",
              color: "#1f1f1f",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
          >
            <svg
              className="w-4 h-4 mr-2.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer Terms */}
        <div className="mt-8 text-center text-[10px] text-neutral-500 leading-relaxed font-sans">
          By continuing, you agree to our{" "}
          <a href="#" className="underline text-neutral-400 hover:text-blue-400 transition-colors">
            Terms of Service
          </a>
          .
          <br />
          Your code is never stored permanently.
        </div>
      </div>
    </div>
  )
}
