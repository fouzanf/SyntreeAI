"use client";

import React from "react";
import { Terminal, Database, Sparkles, Code2, Server, Boxes, Activity, Zap, Lock, Code } from "lucide-react";

export default function TechStackStrip() {
  const techItems = [
    { name: "Next.js", icon: <Code2 className="w-4 h-4 text-neutral-400" /> },
    { name: "FastAPI", icon: <Server className="w-4 h-4 text-neutral-400" /> },
    { name: "pgvector", icon: <Database className="w-4 h-4 text-neutral-400" /> },
    { name: "Gemini 3.5 Flash", icon: <Sparkles className="w-4 h-4 text-blue-400" /> },
    { name: "tree-sitter", icon: <Terminal className="w-4 h-4 text-neutral-400" /> },
    { name: "React Three Fiber", icon: <Boxes className="w-4 h-4 text-neutral-400" /> },
    { name: "D3.js", icon: <Activity className="w-4 h-4 text-neutral-400" /> },
    { name: "Neon", icon: <Zap className="w-4 h-4 text-neutral-400" /> },
    { name: "NextAuth.js", icon: <Lock className="w-4 h-4 text-neutral-400" /> },
    { name: "Monaco Editor", icon: <Code className="w-4 h-4 text-neutral-400" /> },
  ];

  // Double the list to make an infinite marquee
  const marqueeItems = [...techItems, ...techItems, ...techItems];

  return (
    <section className="relative py-12 border-t border-b border-neutral-900/60 bg-black/20 backdrop-blur-sm z-10 overflow-hidden select-none">
      <div className="max-w-7xl mx-auto px-6 mb-6 flex justify-between items-center">
        <span className="text-[10px] font-mono font-semibold tracking-wider text-neutral-500 uppercase">
          Powered By High-Performance Tech Stack
        </span>
        <span className="h-[1px] flex-grow mx-6 bg-neutral-900" />
      </div>

      {/* Marquee Wrapper */}
      <div className="relative w-full flex overflow-hidden no-scrollbar">
        {/* Shadow Overlays for smooth edges */}
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0A0A0B] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0A0A0B] to-transparent z-10 pointer-events-none" />

        {/* Scrolling track */}
        <div className="flex animate-marquee gap-16 whitespace-nowrap min-w-full">
          {marqueeItems.map((tech, idx) => (
            <div 
              key={idx}
              className="flex items-center gap-2.5 text-neutral-400 hover:text-neutral-200 transition-colors duration-200 text-sm font-mono font-medium"
            >
              <span className="p-1 rounded bg-neutral-900 border border-neutral-850/60 group-hover:border-neutral-700">
                {tech.icon}
              </span>
              <span>{tech.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
