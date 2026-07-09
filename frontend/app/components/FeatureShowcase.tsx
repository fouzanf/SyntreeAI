"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { Layers, Network, FileText, CheckCircle2, ArrowRight } from "lucide-react";

export default function FeatureShowcase() {
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15
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
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
      >
        {/* Feature 1: Tree-sitter chunking */}
        <motion.div
          variants={cardVariants}
          whileHover={{ y: -6, borderColor: "rgba(59, 130, 246, 0.2)", boxShadow: "0 15px 35px rgba(59, 130, 246, 0.04)" }}
          className="flex flex-col rounded-xl bg-neutral-900/30 backdrop-blur-sm border border-neutral-800/80 transition-all duration-300 overflow-hidden"
        >
          {/* Mockup Top */}
          <div className="p-4 bg-neutral-950/60 border-b border-neutral-900 flex items-center justify-between font-mono text-[10px] text-neutral-500">
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-blue-500" /> AST Chunking</span>
            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">AST</span>
          </div>

          {/* Interactive AST Mockup */}
          <div className="p-5 flex-grow font-mono text-xs text-neutral-400 space-y-4">
            <div className="rounded border border-neutral-800 bg-neutral-950/40 overflow-hidden text-left">
              <div className="px-3 py-1.5 bg-neutral-900/60 text-[10px] text-neutral-500 border-b border-neutral-800 flex justify-between">
                <span>parser.ts</span>
                <span className="text-green-500 font-bold">Scoped</span>
              </div>
              <div className="p-3 text-[11px] space-y-2 leading-relaxed">
                <div>
                  <span className="text-blue-400">export function</span> <span className="text-yellow-400">parseTree</span>(node) &#123;
                </div>
                <div className="pl-4 text-blue-400/80 bg-blue-500/5 border-l-2 border-blue-500 px-2 py-0.5 my-1 rounded-r">
                  <span className="text-blue-400">const</span> ast = treeSitter.<span className="text-yellow-400">init</span>();{"\n"}
                  <span className="text-blue-400">return</span> ast.<span className="text-yellow-400">walk</span>();
                </div>
                <div>&#125;</div>
              </div>
            </div>
            <div className="text-xs text-neutral-500 flex items-center gap-1.5 pl-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Lexical boundaries preserved. No split statements.</span>
            </div>
          </div>

          {/* Text Content */}
          <div className="p-6 border-t border-neutral-900 text-left space-y-2">
            <h3 className="text-base font-bold text-neutral-200 font-sans">AST-Aware Chunking</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Instead of slicing code into arbitrary token chunks, SyntreeAI compiles files using Tree-sitter to preserve complete, logical blocks (functions, classes, interfaces) with import metadata.
            </p>
          </div>
        </motion.div>

        {/* Feature 2: Scope Graph Traversal */}
        <motion.div
          variants={cardVariants}
          whileHover={{ y: -6, borderColor: "rgba(59, 130, 246, 0.2)", boxShadow: "0 15px 35px rgba(59, 130, 246, 0.04)" }}
          className="flex flex-col rounded-xl bg-neutral-900/30 backdrop-blur-sm border border-neutral-800/80 transition-all duration-300 overflow-hidden"
        >
          {/* Mockup Top */}
          <div className="p-4 bg-neutral-950/60 border-b border-neutral-900 flex items-center justify-between font-mono text-[10px] text-neutral-500">
            <span className="flex items-center gap-1.5"><Network className="w-3.5 h-3.5 text-blue-500" /> Graph-RAG Scope</span>
            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">Graph</span>
          </div>

          {/* Interactive Graph-RAG Mockup */}
          <div className="p-5 flex-grow font-mono text-xs text-neutral-400 space-y-4">
            <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-[11px] text-left space-y-3 h-32 flex flex-col justify-center">
              <div className="flex justify-between text-neutral-500 border-b border-neutral-900 pb-1.5 mb-1.5">
                <span>Dependency Linker</span>
                <span className="text-blue-500">Linked</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-300">app/page.tsx</span>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-600" />
                <span className="text-neutral-400 font-semibold">components/Hero.tsx</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 pl-4">└─ imports</span>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-600" />
                <span className="text-blue-400 font-semibold">hooks/useScroll.ts</span>
              </div>
            </div>
            <div className="text-xs text-neutral-500 flex items-center gap-1.5 pl-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Traces reference dependencies up to 4 layers deep.</span>
            </div>
          </div>

          {/* Text Content */}
          <div className="p-6 border-t border-neutral-900 text-left space-y-2">
            <h3 className="text-base font-bold text-neutral-200 font-sans">Scope Graph Traversal</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Retrieve related code, even when it is directories away. Our retriever traces exports, class inheritance, and module imports to construct an interactive scope graph for your queries.
            </p>
          </div>
        </motion.div>

        {/* Feature 3: Citations */}
        <motion.div
          variants={cardVariants}
          whileHover={{ y: -6, borderColor: "rgba(59, 130, 246, 0.2)", boxShadow: "0 15px 35px rgba(59, 130, 246, 0.04)" }}
          className="flex flex-col rounded-xl bg-neutral-900/30 backdrop-blur-sm border border-neutral-800/80 transition-all duration-300 overflow-hidden"
        >
          {/* Mockup Top */}
          <div className="p-4 bg-neutral-950/60 border-b border-neutral-900 flex items-center justify-between font-mono text-[10px] text-neutral-500">
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-500" /> Citation UI</span>
            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">Citations</span>
          </div>

          {/* Interactive Citation Mockup */}
          <div className="p-5 flex-grow font-mono text-xs text-neutral-400 space-y-4">
            <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-[11px] text-left space-y-2.5">
              <p className="text-neutral-400">"The database pool is initialized in..."</p>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 cursor-pointer self-start w-fit text-[10px]">
                <FileText className="w-3 h-3" />
                <span>lib/db.ts • Line 12-16</span>
              </div>
              <div className="pl-3 border-l-2 border-neutral-800 text-neutral-500 text-[10px] pt-1">
                export const db = new Pool(&#123; max: 20 &#125;);
              </div>
            </div>
            <div className="text-xs text-neutral-500 flex items-center gap-1.5 pl-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Full audit trail. Verify every AI explanation instantly.</span>
            </div>
          </div>

          {/* Text Content */}
          <div className="p-6 border-t border-neutral-900 text-left space-y-2">
            <h3 className="text-base font-bold text-neutral-200 font-sans">AST-Linked Citations</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Never guess which file is referenced. Every answer is backed by exact file references, complete with line numbers, code snippets, and direct links so you can verify answers instantly.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
