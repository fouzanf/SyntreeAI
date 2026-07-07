"use client";

import React, { useEffect, useState, useRef } from "react";
import { X, Play, Loader2, Download, AlertCircle, AlertOctagon, Info, FileCode, CheckCircle2 } from "lucide-react";

interface Issue {
  severity: "critical" | "warning" | "info";
  category: "bug" | "security" | "anti-pattern" | "performance" | "testing";
  file_path: string;
  start_line: number;
  end_line: number;
  title: string;
  description: string;
  suggestion: string;
}

interface CodeSmellDetectorProps {
  repoId: number;
  repoName: string;
  onClose: () => void;
  onSelectFile: (filePath: string) => void;
}

export default function CodeSmellDetector({
  repoId,
  repoName,
  onClose,
  onSelectFile
}: CodeSmellDetectorProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<"all" | "critical" | "warning" | "info">("all");

  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Trigger analysis on mount
  useEffect(() => {
    runAnalysis();
    return () => {
      // Clean up / abort stream reader if component unmounts
      if (streamReaderRef.current) {
        streamReaderRef.current.cancel().catch(() => {});
      }
    };
  }, [repoId]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setErrorMsg("");
    setIssues([]);
    setCurrentBatch(0);
    setTotalBatches(0);

    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";
    try {
      const response = await fetch(`${BACKEND_URL}/analyze/${repoId}`, {
        method: "POST"
      });

      if (!response.ok) {
        let errText = "Failed to start analysis";
        try {
          const errJson = await response.json();
          errText = errJson.detail || errText;
        } catch {}
        throw new Error(errText);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to read response body stream");
      }
      streamReaderRef.current = reader;

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const dataContent = trimmed.slice(6).trim();
          if (dataContent === "[DONE]") {
            setIsAnalyzing(false);
            break;
          }

          try {
            const parsed = JSON.parse(dataContent);
            if (parsed.status === "started") {
              setTotalBatches(parsed.total_batches || 1);
            } else if (parsed.status === "processing") {
              setCurrentBatch(parsed.batch_index || 0);
              // Append new unique issues
              if (parsed.issues && parsed.issues.length > 0) {
                setIssues((prev) => {
                  const updated = [...prev];
                  parsed.issues.forEach((newIssue: Issue) => {
                    const exists = updated.some(
                      (c) =>
                        c.file_path === newIssue.file_path &&
                        c.start_line === newIssue.start_line &&
                        c.title === newIssue.title
                    );
                    if (!exists) {
                      updated.push(newIssue);
                    }
                  });
                  // Sort: critical first, then warning, then info
                  const ranks = { critical: 0, warning: 1, info: 2 };
                  updated.sort((a, b) => ranks[a.severity] - ranks[b.severity]);
                  return updated;
                });
              }
            } else if (parsed.status === "completed") {
              if (parsed.issues) {
                setIssues(parsed.issues);
              }
              setIsAnalyzing(false);
            } else if (parsed.status === "error") {
              console.error("Batch review error:", parsed.message);
            }
          } catch (e) {
            console.error("Error parsing JSON block:", e);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to analyze codebase. Ensure the server is online.");
      setIsAnalyzing(false);
    }
  };

  const handleExportReport = () => {
    if (issues.length === 0) return;

    const criticals = issues.filter((i) => i.severity === "critical");
    const warnings = issues.filter((i) => i.severity === "warning");
    const infos = issues.filter((i) => i.severity === "info");

    let md = `# SyntreeAI Code Diagnostics Report\n\n`;
    md += `**Repository**: ${repoName}\n`;
    md += `**Date**: ${new Date().toLocaleString()}\n\n`;
    md += `## Summary of Findings\n\n`;
    md += `- 🔴 **Critical Issues**: ${criticals.length}\n`;
    md += `- 🟡 **Warnings**: ${warnings.length}\n`;
    md += `- 🔵 **Info Items**: ${infos.length}\n`;
    md += `- **Total issues**: ${issues.length}\n\n`;
    md += `---\n\n`;
    md += `## Detailed Analysis\n\n`;

    issues.forEach((issue, idx) => {
      const severityEmoji =
        issue.severity === "critical" ? "🔴 [CRITICAL]" : issue.severity === "warning" ? "🟡 [WARNING]" : "🔵 [INFO]";
      md += `### ${idx + 1}. ${severityEmoji} ${issue.title}\n\n`;
      md += `- **File**: \`${issue.file_path}\` (Lines ${issue.start_line}-${issue.end_line})\n`;
      md += `- **Category**: \`${issue.category}\`\n\n`;
      md += `#### Description\n${issue.description}\n\n`;
      md += `#### Suggestion\n${issue.suggestion}\n\n`;
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `syntree_analysis_report_${repoName.replace("/", "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Severity counts
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  // Filtered issues
  const filteredIssues = issues.filter((issue) => {
    if (filterSeverity === "all") return true;
    return issue.severity === filterSeverity;
  });

  return (
    <div className="absolute inset-0 bg-[#0C0C0E]/98 z-30 flex flex-col p-4 animate-[slideUp_0.3s_ease-out] select-none">
      {/* Top Header Row */}
      <div className="flex items-center justify-between border-b border-neutral-900/60 pb-3 shrink-0">
        <div>
          <span className="text-[9px] font-mono text-amber-500 uppercase tracking-wider font-semibold">Diagnostics Panel</span>
          <h2 className="text-sm font-bold text-neutral-200 font-sans">Code Smell Analyzer</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-neutral-900 text-neutral-500 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress & Status Indicators */}
      {isAnalyzing && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg my-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs font-mono text-amber-400">
            <span className="flex items-center gap-1.5 font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Analyzing code chunks...</span>
            </span>
            <span>Batch {currentBatch} of {totalBatches}</span>
          </div>
          <div className="w-full h-1 bg-neutral-900 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-amber-500 transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              style={{ width: `${totalBatches ? (currentBatch / totalBatches) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-mono text-red-400 my-3 shrink-0 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p>{errorMsg}</p>
            <button
              onClick={runAnalysis}
              className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-[10px] text-white cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Results Summary Bar */}
      {issues.length > 0 && (
        <div className="flex items-center justify-between py-2 border-b border-neutral-900/60 shrink-0">
          <div className="flex items-center gap-2.5 text-xs font-mono">
            <span className="text-neutral-400 text-[10px]">Findings:</span>
            <span className="text-red-400 font-semibold">{criticalCount} Critical</span>
            <span className="text-amber-400 font-semibold">{warningCount} Warning</span>
            <span className="text-blue-400 font-semibold">{infoCount} Info</span>
          </div>
          <button
            onClick={handleExportReport}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 font-semibold text-[10px] text-white transition-colors cursor-pointer shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          >
            <Download className="w-3 h-3" />
            <span>Export Report</span>
          </button>
        </div>
      )}

      {/* Severity Filter Tabs */}
      {issues.length > 0 && (
        <div className="flex gap-1.5 bg-neutral-950 p-1.5 rounded-lg border border-neutral-900/80 my-3 shrink-0">
          {(["all", "critical", "warning", "info"] as const).map((sev) => {
            const count = sev === "all" ? issues.length : sev === "critical" ? criticalCount : sev === "warning" ? warningCount : infoCount;
            const isActive = filterSeverity === sev;
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`flex-1 py-1 rounded text-[10px] font-mono font-bold capitalize transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#1E1B18] border border-amber-500/20 text-amber-500 shadow-inner"
                    : "text-neutral-500 border border-transparent hover:text-neutral-300"
                }`}
              >
                {sev} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Issues Cards Area */}
      <div className="flex-grow overflow-y-auto space-y-3 custom-scrollbar pr-1">
        {!isAnalyzing && issues.length === 0 && !errorMsg && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-bounce" />
            <p className="text-xs text-neutral-400 font-sans">Code review completed! No code smells identified.</p>
          </div>
        )}

        {filteredIssues.map((issue, idx) => {
          // Border color based on severity
          const borderClass =
            issue.severity === "critical"
              ? "border-l-4 border-l-red-500"
              : issue.severity === "warning"
              ? "border-l-4 border-l-amber-500"
              : "border-l-4 border-l-blue-500";

          // Icon based on severity
          const SeverityIcon =
            issue.severity === "critical" ? AlertOctagon : issue.severity === "warning" ? AlertCircle : Info;

          const severityColor =
            issue.severity === "critical"
              ? "text-red-400 bg-red-500/10 border-red-500/20"
              : issue.severity === "warning"
              ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
              : "text-blue-400 bg-blue-500/10 border-blue-500/20";

          return (
            <div
              key={idx}
              className={`p-3.5 rounded-lg bg-black/20 border border-neutral-900/80 hover:border-neutral-800 transition-colors flex flex-col gap-2.5 relative select-text ${borderClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-900/60 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase border flex items-center gap-1 ${severityColor}`}>
                    <SeverityIcon className="w-3 h-3" />
                    <span>{issue.severity}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded font-mono text-[9px] uppercase bg-neutral-900 border border-neutral-800 text-neutral-400">
                    {issue.category}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">#{idx + 1}</span>
              </div>

              {/* Title & Description */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-neutral-200">{issue.title}</h4>
                <p className="text-xs text-neutral-400 leading-relaxed font-sans">{issue.description}</p>
              </div>

              {/* Clickable File Path */}
              <button
                onClick={() => onSelectFile(issue.file_path)}
                className="self-start flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 hover:text-blue-400 transition-colors text-left bg-neutral-950 p-1.5 rounded border border-neutral-900 cursor-pointer max-w-full"
              >
                <FileCode className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                <span className="truncate pr-1 select-all">{issue.file_path}</span>
                <span className="text-neutral-600 shrink-0">lines {issue.start_line}–{issue.end_line}</span>
              </button>

              {/* Suggestion block */}
              <div className="p-2.5 rounded bg-emerald-500/[0.03] border border-emerald-500/10 text-emerald-400 text-xs font-sans space-y-1">
                <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-emerald-500 block">Suggestion</span>
                <p className="leading-relaxed">{issue.suggestion}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
