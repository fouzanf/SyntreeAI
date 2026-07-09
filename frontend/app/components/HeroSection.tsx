"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Terminal, ArrowRight, Play, Server, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function HeroSection() {
  const [terminalText, setTerminalText] = useState("");
  const [stage, setStage] = useState(0); // 0: query typing, 1: processing, 2: response rendering

  const query = "syntree ask 'Where is authorization verified, and does it attach the user context?'";

  const processingSteps = [
    { text: "Initializing repository context (AST-index: 100%)...", delay: 100 },
    { text: "Traversing tree-sitter AST nodes for 'authorization'...", delay: 600 },
    { text: "Tracing cross-file import graph: auth.ts → session.ts...", delay: 1100 },
    { text: "Assembling Graph-RAG context (3 files, 84 lines)...", delay: 1600 }
  ];

  const responseLines = [
    "Authorization is verified in middleware/auth.ts (L14-22).",
    "It attaches the verified user payload directly to the request context:",
    "",
    "// middleware/auth.ts",
    "export async function middleware(req: NextRequest) {",
    "  const token = req.headers.get('authorization')?.split(' ')[1];",
    "  const session = await verifySession(token); // imports from session.ts",
    "  req.ctx.user = session.user; // Attaches user object",
    "  return NextResponse.next();",
    "}"
  ];

  useEffect(() => {
    if (stage === 0) {
      let charIdx = 0;
      const interval = setInterval(() => {
        setTerminalText((prev) => prev + query[charIdx]);
        charIdx++;
        if (charIdx === query.length) {
          clearInterval(interval);
          setTimeout(() => setStage(1), 500);
        }
      }, 40);
      return () => clearInterval(interval);
    }
  }, [stage]);

  return (
    <section className="relative min-h-screen flex flex-col justify-center items-center pt-28 pb-20 px-6 max-w-7xl mx-auto overflow-hidden">
      {/* Header / Nav inside section or top of page */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-2 font-semibold text-lg tracking-tight select-none">
          <div className="w-6 h-6 rounded bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-black font-mono font-bold text-xs">
            S
          </div>
          <span>Syntree<span className="text-blue-500 font-mono">AI</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
          <a href="#problem" className="hover:text-white transition-colors">Friction</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <Link href="/app" className="hover:text-white transition-colors">Connect Repo</Link>
        </div>
        <div>
          <a
            href="#cta"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 hover:border-neutral-700 transition-all text-xs font-mono font-medium"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
            <span>Star on GitHub</span>
          </a>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full mt-8 z-10">
        <div className="lg:col-span-7 flex flex-col justify-center text-left space-y-6">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex self-start items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/5 text-xs text-blue-400 font-mono"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span>AST-indexed Repository Search</span>
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tighter text-gradient leading-[1.1]"
          >
            Understand any <br className="hidden sm:inline" />
            codebase in <span className="text-gradient-accent">seconds</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base md:text-lg text-neutral-400 max-w-xl font-sans"
          >
            Stop wasting hours tracing import chains and reading outdated docs.
            SyntreeAI uses Tree-sitter AST parsing and cross-file graph traversal
            to let you query code in plain English.
          </motion.p>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link
              href="/app"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-sm text-white shadow-[0_0_20px_rgba(59,130,246,0.35)] hover:shadow-[0_0_30px_rgba(59,130,246,0.55)] transition-all duration-300 transform active:scale-98"
            >
              <span>Query Your Repository</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how-it-works"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900/60 hover:border-neutral-700 font-semibold text-sm text-neutral-300 transition-all duration-300"
            >
              <Play className="w-4 h-4 text-blue-500 fill-blue-500/20" />
              <span>See How it Works</span>
            </a>
          </motion.div>

          {/* Mini-features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="pt-6 grid grid-cols-3 gap-4 border-t border-neutral-900 text-xs font-mono text-neutral-500"
          >
            <div>
              <span className="block text-neutral-300 font-semibold text-sm">100% Local AST</span>
              Tree-sitter parsing
            </div>
            <div>
              <span className="block text-neutral-300 font-semibold text-sm">Graph-RAG</span>
              Cross-file tracking
            </div>
            <div>
              <span className="block text-neutral-300 font-semibold text-sm">Offline first</span>
              Safe & secure
            </div>
          </motion.div>
        </div>

        {/* Right column: Interactive Terminal Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="lg:col-span-5 w-full max-w-lg mx-auto"
        >
          <div className="w-full rounded-xl glass-panel shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden border border-neutral-800/80">
            {/* Terminal Title Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-950/80 border-b border-neutral-900 select-none">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
              </div>
              <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-500">
                <Terminal className="w-3.5 h-3.5 text-neutral-600" />
                <span>syntree-shell</span>
              </div>
              <div className="w-12" /> {/* Spacer */}
            </div>

            {/* Terminal Content */}
            <div className="p-5 font-mono text-xs md:text-[13px] leading-relaxed min-h-[340px] flex flex-col justify-between overflow-x-auto text-left">
              <div className="space-y-4">
                {/* User input query */}
                <div>
                  <span className="text-blue-500 font-bold mr-2">$</span>
                  <span className={stage === 0 ? "cursor-blink" : ""}>{terminalText}</span>
                </div>

                {/* Processing Steps */}
                {stage >= 1 && (
                  <div className="space-y-1.5 text-neutral-400 border-l-2 border-blue-500/20 pl-3">
                    {processingSteps.map((step, idx) => (
                      <StepText key={idx} text={step.text} delay={step.delay} onComplete={idx === processingSteps.length - 1 ? () => setStage(2) : undefined} />
                    ))}
                  </div>
                )}

                {/* Response Block */}
                {stage >= 2 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-3 pt-2 text-[#EDEDED] border-t border-neutral-900"
                  >
                    <div className="flex items-start gap-1.5">
                      <Server className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        {responseLines.slice(0, 3).map((line, idx) => (
                          <p key={idx} className={idx === 0 ? "text-neutral-200 font-medium" : "text-neutral-400 mt-1"}>{line}</p>
                        ))}
                      </div>
                    </div>

                    {/* Simulated Code Editor */}
                    <div className="rounded-lg bg-black/40 border border-neutral-900 overflow-hidden font-mono text-xs">
                      <div className="px-3 py-1.5 bg-neutral-950/80 border-b border-neutral-900/60 text-neutral-500 flex items-center justify-between">
                        <span>middleware/auth.ts</span>
                        <span className="text-blue-400 text-[10px]">TypeScript</span>
                      </div>
                      <pre className="p-3 text-neutral-300 overflow-x-auto text-left leading-relaxed">
                        <code>
                          <span className="text-blue-400">export async function</span> <span className="text-yellow-400">middleware</span>(req: NextRequest) &#123;{"\n"}
                          {"  "}<span className="text-blue-400">const</span> token = req.headers.<span className="text-yellow-400">get</span>(<span className="text-green-400">'authorization'</span>)?.<span className="text-yellow-400">split</span>(<span className="text-green-400">' '</span>)[1];{"\n"}
                          {"  "}<span className="text-blue-400">const</span> session = <span className="text-blue-400">await</span> <span className="text-yellow-400">verifySession</span>(token); <span className="text-neutral-600">// session.ts:42</span>{"\n"}
                          {"  "}req.ctx.user = session.user; <span className="text-neutral-600">// Attaches context</span>{"\n"}
                          {"  "}<span className="text-blue-400">return</span> NextResponse.<span className="text-yellow-400">next</span>();{"\n"}
                          &#125;
                        </code>
                      </pre>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Rerun Button inside mockup for interactivity */}
              {stage === 2 && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => {
                    setTerminalText("");
                    setStage(0);
                  }}
                  className="mt-4 self-end text-[10px] px-2 py-1 rounded bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition-all flex items-center gap-1 select-none"
                >
                  <span>Replay Demo</span>
                  <ChevronRight className="w-3 h-3" />
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Sub-component to trigger lines sequentially
function StepText({ text, delay, onComplete }: { text: string; delay: number; onComplete?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
      if (onComplete) {
        // Trigger completion slightly after the step text renders
        setTimeout(onComplete, 400);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, onComplete]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-1.5 text-neutral-500 font-mono"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60" />
      <span>{text}</span>
    </motion.div>
  );
}
