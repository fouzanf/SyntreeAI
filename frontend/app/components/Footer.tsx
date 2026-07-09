"use client";

import { Terminal } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-neutral-900 bg-[#0A0A0B]/80 backdrop-blur-md py-12 px-6 z-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        {/* Left: Logo & Copyright */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight text-neutral-300">
            <div className="w-5 h-5 rounded bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-black font-mono font-bold text-[10px]">
              S
            </div>
            <span>Syntree<span className="text-blue-500 font-mono text-xs">AI</span></span>
          </div>
          <span className="text-[11px] font-mono text-neutral-600">
            © {currentYear} SyntreeAI Inc. All rights reserved.
          </span>
        </div>

        {/* Center: Text links */}
        <div className="flex items-center gap-8 text-xs font-mono text-neutral-500">
          <a href="#problem" className="hover:text-neutral-300 transition-colors">Friction</a>
          <a href="#how-it-works" className="hover:text-neutral-300 transition-colors">How it works</a>
          <a href="#features" className="hover:text-neutral-300 transition-colors">Features</a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-300 transition-colors"
          >
            GitHub
          </a>
        </div>

        {/* Right: Social icons */}
        <div className="flex items-center gap-4 text-neutral-650">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-full hover:bg-neutral-900 border border-transparent hover:border-neutral-800 text-neutral-500 hover:text-[#EDEDED] transition-all"
            aria-label="GitHub"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
          </a>
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-full hover:bg-neutral-900 border border-transparent hover:border-neutral-800 text-neutral-500 hover:text-[#EDEDED] transition-all"
            aria-label="Twitter"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
