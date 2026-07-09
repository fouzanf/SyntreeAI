"use client";

import React from "react";
import { motion } from "framer-motion";
import { GitBranch, Code2, Search, Terminal, ArrowRight, ShieldCheck } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      icon: <GitBranch className="w-5 h-5 text-blue-400" />,
      title: "Paste a GitHub URL or PR link",
      subtitle: "Instant Ingestion & Filtering",
      desc: "SyntreeAI clones the repo and filters relevant source files automatically",
      visual: (
        <div className="rounded-lg bg-black/50 border border-neutral-800 p-4 font-mono text-xs text-neutral-400 space-y-2 select-none h-48 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-neutral-500 pb-2 border-b border-neutral-900">
            <Terminal className="w-3.5 h-3.5" />
            <span>index-pipeline.log</span>
          </div>
          <div className="space-y-1">
            <p className="text-neutral-500">[14:32:01] <span className="text-blue-500">CLONE</span> git@github.com:syntree/auth-service.git</p>
            <p className="text-neutral-500">[14:32:02] <span className="text-green-500">DONE</span> Cloned 184 files (1.2 MB)</p>
            <p className="text-neutral-500">[14:32:03] <span className="text-yellow-500">INDEX</span> Building structure map...</p>
            <div className="flex items-center gap-1.5 pt-1 text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>Mapping 42 TypeScript modules</span>
            </div>
          </div>
        </div>
      )
    },
    {
      number: "02",
      icon: <Code2 className="w-5 h-5 text-blue-400" />,
      title: "AST-aware semantic indexing",
      subtitle: "Parsing syntax with Tree-sitter",
      desc: "tree-sitter parses every function and class into chunks. Gemini embeds them into pgvector for millisecond retrieval",
      visual: (
        <div className="rounded-lg bg-black/50 border border-neutral-800 p-4 font-mono text-xs text-neutral-400 space-y-3 h-48 overflow-hidden flex flex-col justify-center select-none">
          <div className="flex justify-between items-center text-neutral-500 text-[10px]">
            <span>abstract-syntax-tree.json</span>
            <span className="text-green-500">Tree-sitter: TS</span>
          </div>
          <div className="space-y-1.5 text-[11px] leading-relaxed">
            <div className="text-neutral-500">SourceFile: auth.ts</div>
            <div className="pl-3 border-l border-blue-500/20 text-neutral-300">
              <div className="text-blue-400 font-bold">ClassDeclaration <span className="text-neutral-500">("AuthHandler")</span></div>
              <div className="pl-4 border-l border-neutral-800 text-neutral-400">
                <div>Property: <span className="text-yellow-400">dbConnection</span></div>
                <div className="text-blue-400 font-bold">MethodDeclaration <span className="text-neutral-500">("verifyJWT")</span></div>
                <div className="pl-4 text-neutral-500 italic">// Bound context preserved</div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      number: "03",
      icon: <Search className="w-5 h-5 text-blue-400" />,
      title: "Ask anything, get cited answers",
      subtitle: "Tracing dependency context",
      desc: "Every answer is pinned to exact file paths and line numbers. Zero hallucinations.",
      visual: (
        <div className="rounded-lg bg-black/50 border border-neutral-800 p-4 font-mono text-xs text-neutral-400 h-48 flex flex-col justify-center select-none relative overflow-hidden">
          <div className="absolute top-3 left-3 flex items-center gap-1.5 text-neutral-500 text-[10px]">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Retriever Path Tracer</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 mt-2">
            <div className="flex items-center gap-3">
              <div className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-300">
                middleware/auth.ts
              </div>
              <ArrowRight className="w-3 h-3 text-blue-500 animate-pulse" />
              <div className="px-2 py-1 rounded bg-neutral-900 border border-blue-900 text-[10px] text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                utils/session.ts
              </div>
            </div>
            <div className="w-[1px] h-3 bg-blue-500/20" />
            <div className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-300">
              models/user.d.ts
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <section id="how-it-works" className="relative py-28 px-6 max-w-7xl mx-auto z-10">
      <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-xs font-mono font-semibold tracking-wider text-blue-400 uppercase"
        >
          How It Works
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-4xl font-extrabold tracking-tight text-gradient"
        >
          Engineered for syntax, not raw text
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-neutral-400 font-sans"
        >
          Other tools treat code as simple blocks of English. We treat it as
          structured logic, retaining accurate scoped context.
        </motion.p>
      </div>

      {/* Vertical Steps Timeline */}
      <div className="space-y-24 max-w-5xl mx-auto">
        {steps.map((step, idx) => {
          const isEven = idx % 2 === 0;
          return (
            <div
              key={idx}
              className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-12 items-center`}
            >
              {/* Text content side */}
              <motion.div
                initial={{ opacity: 0, x: isEven ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, type: "spring" }}
                className="w-full lg:w-1/2 space-y-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-extrabold text-blue-500/20 font-mono tracking-tight">{step.number}</span>
                  <div className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800">
                    {step.icon}
                  </div>
                </div>
                <h3 className="text-xl md:text-2xl font-bold tracking-tight text-neutral-200">
                  {step.title}
                </h3>
                <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider font-semibold">
                  {step.subtitle}
                </div>
                <p className="text-neutral-400 leading-relaxed font-sans">
                  {step.desc}
                </p>
              </motion.div>

              {/* Visual mockup side */}
              <motion.div
                initial={{ opacity: 0, x: isEven ? 40 : -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, type: "spring" }}
                className="w-full lg:w-1/2"
              >
                <div className="relative group p-1.5 rounded-2xl bg-gradient-to-br from-neutral-800/20 to-neutral-950/20 border border-neutral-800/80 shadow-[0_15px_35px_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-blue-500/20">
                  <div className="absolute inset-0 bg-blue-500/2 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  {step.visual}
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
