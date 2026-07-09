"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { Code, GitPullRequest, Network, Split, Activity, MessageSquare } from "lucide-react";

export default function FeatureShowcase() {
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 70, damping: 15 }
    }
  };

  const features = [
    {
      title: "AST-Aware Chunking",
      icon: <Code className="w-5 h-5 text-purple-400" />,
      desc: "tree-sitter parses Python, TypeScript, and JavaScript into complete functions and classes — the same engine powering GitHub Copilot and Sourcegraph",
      tag: "Core Feature",
      tagBg: "bg-[#7C3AED] text-white"
    },
    {
      title: "Semantic PR Review",
      icon: <GitPullRequest className="w-5 h-5 text-blue-400" />,
      desc: "Paste any GitHub PR URL. SyntreeAI fetches the diff, analyzes changed files with AI, and tells you if it's safe to merge — with exact line citations",
      tag: "New",
      tagBg: "bg-[#3B82F6] text-white",
      accent: true
    },
    {
      title: "Dependency Graph",
      icon: <Network className="w-5 h-5 text-cyan-400" />,
      desc: "Interactive D3 force-directed graph showing every internal import relationship. Hover nodes to explore connections. Filter by language.",
      tag: "Visual",
      tagBg: "bg-[#06B6D4] text-neutral-950 font-bold"
    },
    {
      title: "Semantic Diff Viewer",
      icon: <Split className="w-5 h-5 text-blue-400" />,
      desc: "Side-by-side and unified diff views with AI annotations pinned inline to changed lines. Click 'Annotate with AI' for instant code review.",
      tag: "New",
      tagBg: "bg-[#3B82F6] text-white"
    },
    {
      title: "Codebase Health Dashboard",
      icon: <Activity className="w-5 h-5 text-emerald-400" />,
      desc: "Cyclomatic complexity, documentation density, test coverage signal, and dependency depth — all computed from the AST and visualized with an animated score gauge.",
      tag: "Analytics",
      tagBg: "bg-[#10B981] text-white"
    },
    {
      title: "Multi-turn Memory",
      icon: <MessageSquare className="w-5 h-5 text-amber-400" />,
      desc: "Ask follow-up questions that reference previous answers. SyntreeAI maintains conversation context across up to 6 turns per session.",
      tag: "AI",
      tagBg: "bg-[#F59E0B] text-neutral-950 font-bold"
    }
  ];

  return (
    <section id="features" className="relative py-28 px-6 max-w-7xl mx-auto z-10">
      <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-xs font-mono font-semibold tracking-wider text-blue-400 uppercase"
        >
          Product Features
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-4xl font-extrabold tracking-tight text-gradient"
        >
          Built for modern code discovery
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-neutral-400 font-sans"
        >
          SyntreeAI indexes the structure, semantics, and relationships of your
          workspace, giving you IDE-grade reference tracing in seconds.
        </motion.p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            variants={cardVariants}
            whileHover={{
              y: -6,
              borderColor: feature.accent ? "rgba(59, 130, 246, 0.5)" : "rgba(59, 130, 246, 0.2)",
              boxShadow: feature.accent ? "0 15px 35px rgba(59, 130, 246, 0.08)" : "0 15px 35px rgba(59, 130, 246, 0.04)"
            }}
            className={`flex flex-col justify-between p-8 rounded-xl bg-neutral-900/30 backdrop-blur-sm border transition-all duration-300 relative group overflow-hidden ${
              feature.accent
                ? "border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] bg-neutral-900/40"
                : "border-neutral-800/80"
            }`}
          >
            {/* Tag pill in top right */}
            <div className="absolute top-4 right-4">
              <span className={`inline-block text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-white/10 ${feature.tagBg}`}>
                {feature.tag}
              </span>
            </div>

            {/* Ambient light corner accent */}
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl rounded-bl-full pointer-events-none transition-all duration-300 ${
              feature.accent
                ? "from-blue-500/20 group-hover:from-blue-500/30"
                : "from-blue-500/5 group-hover:from-blue-500/10"
            }`} />

            <div className="space-y-4">
              {/* Icon block */}
              <div className={`inline-flex p-2.5 rounded-lg bg-neutral-950/80 border ${
                feature.accent ? "border-blue-500/30 text-blue-400" : "border-neutral-800"
              }`}>
                {feature.icon}
              </div>

              {/* Title */}
              <h3 className="text-base font-bold text-neutral-200 font-sans tracking-tight pr-20">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                {feature.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
