"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, ShieldAlert, Loader2, Sparkles } from "lucide-react";

export default function CTASection() {
  const [repoUrl, setRepoUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [logMessage, setLogMessage] = useState("");

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;

    if (!repoUrl.includes("github.com/")) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    setLogMessage("Connecting to GitHub API...");

    // Simulate indexing logs
    const logs = [
      "Cloning repository metadata...",
      "Parsing file structures with Tree-sitter...",
      "Resolving workspace imports and references...",
      "Building cross-file context graph...",
      "Repository indexed successfully!"
    ];

    logs.forEach((msg, index) => {
      setTimeout(() => {
        setLogMessage(msg);
        if (index === logs.length - 1) {
          setTimeout(() => {
            setStatus("success");
          }, 800);
        }
      }, (index + 1) * 800);
    });
  };

  return (
    <section id="cta" className="relative py-32 px-6 max-w-5xl mx-auto z-10 text-center">
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Decorative Badge */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/5 text-xs text-blue-400 font-mono"
        >
          <Sparkles className="w-3 h-3 text-blue-400" />
          <span>Beta Access Open</span>
        </motion.div>

        {/* Headline */}
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-5xl font-extrabold tracking-tighter text-gradient leading-[1.1]"
        >
          Your codebase. Fully understood.
        </motion.h2>

        {/* Subtitle */}
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-neutral-400 text-sm md:text-base max-w-xl mx-auto font-sans"
        >
          From onboarding to PR reviews to health diagnostics — SyntreeAI gives you the tools senior engineers wish they had.
        </motion.p>

        {/* Input Card Container */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 p-6 rounded-2xl glass-panel border border-neutral-800/80 shadow-[0_30px_60px_rgba(0,0,0,0.6)] relative overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {status === "idle" && (
              <motion.form 
                key="form"
                onSubmit={handleScan}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col sm:flex-row gap-3 items-stretch justify-center"
              >
                <div className="relative flex-grow">
                  <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-neutral-500">
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5"
                    >
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    required
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="w-full pl-11 pr-4 py-3.5 rounded-lg border border-neutral-800 bg-black/40 text-sm text-[#EDEDED] font-mono placeholder-neutral-600 focus-neon transition-colors"
                  />
                </div>
                 <button
                  type="submit"
                  className="px-6 py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-sm text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all duration-300 transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <span>Analyze Repository</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.form>
            )}

            {status === "loading" && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-6 flex flex-col items-center justify-center space-y-4"
              >
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <div className="text-sm font-mono text-neutral-400">
                  {logMessage}
                </div>
                <div className="w-64 h-1 bg-neutral-900 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-blue-500"
                    initial={{ width: "0%" }}
                    animate={{ width: "95%" }}
                    transition={{ duration: 4, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            )}

            {status === "success" && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="py-4 flex flex-col items-center justify-center space-y-3"
              >
                <CheckCircle2 className="w-10 h-10 text-green-500 animate-bounce" />
                <h3 className="text-lg font-bold text-neutral-200">Index Built Successfully!</h3>
                <p className="text-xs text-neutral-400 font-mono">{repoUrl}</p>
                <button
                  onClick={() => {
                    setStatus("idle");
                    setRepoUrl("");
                  }}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300 font-mono hover:underline"
                >
                  Index another repository
                </button>
              </motion.div>
            )}

            {status === "error" && (
              <motion.div 
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-4 flex flex-col items-center justify-center space-y-3"
              >
                <ShieldAlert className="w-10 h-10 text-red-500" />
                <h3 className="text-lg font-bold text-neutral-200">Invalid Repository URL</h3>
                <p className="text-xs text-neutral-400 font-sans">Please enter a valid GitHub URL, e.g. https://github.com/owner/repo</p>
                <button
                  onClick={() => setStatus("idle")}
                  className="mt-2 px-4 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs font-mono text-neutral-300 transition-colors"
                >
                  Try Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
