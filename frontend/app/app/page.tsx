"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  Folder,
  FolderOpen,
  FileCode,
  ChevronDown,
  ChevronRight,
  Send,
  RefreshCw,
  Terminal,
  MessageSquare,
  AlertTriangle,
  Code2,
  Sparkles,
  GitCompare
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

import dynamic from "next/dynamic";
import DependencyGraph from "../components/DependencyGraph";
import CodeSmellDetector from "../components/CodeSmellDetector";
import SemanticDiffViewer from "../components/SemanticDiffViewer";
import HealthSummary from "../components/HealthSummary";
import HealthDashboard from "../components/HealthDashboard";

import { ingestRepo, streamQuery, reviewPR, Citation, runHealthCheck, getHealthReport } from "../lib/api";

const AppBackground = dynamic(() => import("../components/AppBackground"), {
  ssr: false,
});

// --- TYPES ---
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isLoading?: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: TreeNode[];
}

// --- UTILITIES ---

/**
 * Infer a file's language badge based on its extension.
 */
function getLanguageFromPath(filePath: string): { label: string; bg: string; text: string } {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "py":
      return { label: "py", bg: "bg-blue-500/10 border border-blue-500/20", text: "text-blue-400" };
    case "js":
    case "jsx":
      return { label: ext || "js", bg: "bg-yellow-500/10 border border-yellow-500/20", text: "text-yellow-400" };
    case "ts":
      return { label: "ts", bg: "bg-yellow-500/10 border border-yellow-500/20", text: "text-yellow-400" };
    case "tsx":
      return { label: "tsx", bg: "bg-cyan-500/10 border border-cyan-500/20", text: "text-cyan-400" };
    default:
      return { label: ext || "code", bg: "bg-neutral-500/10 border border-neutral-500/20", text: "text-neutral-400" };
  }
}

/**
 * Builds a hierarchical directory tree from flat citation filepaths.
 */
function buildTreeFromCitations(citations: Citation[]): TreeNode[] {
  const root: TreeNode[] = [];

  citations.forEach((cit) => {
    const parts = cit.file_path.split("/");
    let currentLevel = root;
    let accumulatedPath = "";

    parts.forEach((part, index) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isLast = index === parts.length - 1;

      if (isLast) {
        const exists = currentLevel.some((node) => node.path === accumulatedPath && node.type === "file");
        if (!exists) {
          currentLevel.push({
            name: part,
            path: accumulatedPath,
            type: "file"
          });
        }
      } else {
        let dirNode = currentLevel.find((node) => node.path === accumulatedPath && node.type === "directory");
        if (!dirNode) {
          dirNode = {
            name: part,
            path: accumulatedPath,
            type: "directory",
            children: []
          };
          currentLevel.push(dirNode);
        }
        currentLevel = dirNode.children!;
      }
    });
  });

  const sortTree = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map((node) => {
        if (node.children) {
          node.children = sortTree(node.children);
        }
        return node;
      });
  };

  return sortTree(root);
}

// --- SUB-COMPONENTS ---

interface TreeNodeProps {
  node: TreeNode;
  onSelectFile: (filePath: string) => void;
  activeFilePath: string | null;
}

function TreeNodeItem({ node, onSelectFile, activeFilePath }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (node.type === "directory") {
    const FolderIcon = isOpen ? FolderOpen : Folder;
    return (
      <div className="space-y-0.5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-2 py-1 px-1.5 text-xs font-mono text-neutral-300 hover:text-white hover:bg-neutral-900/40 rounded transition-colors text-left cursor-pointer"
        >
          <span className="text-neutral-600 shrink-0">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <FolderIcon className="w-3.5 h-3.5 text-blue-500/60 shrink-0" />
          <span className="truncate">{node.name}/</span>
        </button>

        {isOpen && node.children && node.children.length > 0 && (
          <div className="pl-3 border-l border-neutral-900 ml-3 space-y-0.5">
            {node.children.map((child, idx) => (
              <TreeNodeItem
                key={idx}
                node={child}
                onSelectFile={onSelectFile}
                activeFilePath={activeFilePath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // It's a file
  const isActive = activeFilePath === node.path;
  const langInfo = getLanguageFromPath(node.path);

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={`w-full flex items-center justify-between gap-2 py-1 px-1.5 text-xs font-mono rounded transition-colors text-left cursor-pointer ${
        isActive
          ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
          : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40 border border-transparent"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileCode className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
      <span className={`px-1 rounded font-mono text-[9px] uppercase shrink-0 ${langInfo.bg} ${langInfo.text}`}>
        {langInfo.label}
      </span>
    </button>
  );
}

// --- MAIN PAGE ---

export default function AppPage() {
  // Page States
  const [pageState, setPageState] = useState<"INGEST" | "CHAT">("INGEST");
  const [ingestStatus, setIngestStatus] = useState<"idle" | "ingesting" | "error">("idle");
  const [ingestError, setIngestError] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [ingestMode, setIngestMode] = useState<"repo" | "pr">("repo");
  const [repoInfo, setRepoInfo] = useState<{ id: number; name: string; chunkCount: number; type: "repo" | "pr_review" } | null>(null);
  const [showCodeSmell, setShowCodeSmell] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [healthData, setHealthData] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showHealthDashboard, setShowHealthDashboard] = useState(false);

  // Loading indicator states (Ingesting)
  const [progressStep, setProgressStep] = useState(0);
  const loadingLogs = [
    "Cloning repository...",
    "Parsing AST with tree-sitter...",
    "Generating embeddings...",
    "Storing in vector database..."
  ];

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [queryText, setQueryText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  // Left Panel Sub-tab state
  const [leftTab, setLeftTab] = useState<"citations" | "files" | "graph" | "changed_files">("citations");

  // Citations / Highlight state
  const [accumulatedCitations, setAccumulatedCitations] = useState<Citation[]>([]);
  const [hasCompletedFirstQuery, setHasCompletedFirstQuery] = useState(false);
  const [isCitationsExpanded, setIsCitationsExpanded] = useState(false);
  const [activeCitationId, setActiveCitationId] = useState<number | null>(null);

  // References
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derive background state
  const backgroundState =
    ingestStatus === "ingesting"
      ? "loading"
      : pageState === "INGEST"
        ? "ingest"
        : isStreaming
          ? "streaming"
          : "chat";

  // Cycle progress indicator logs on a timer during ingestion
  useEffect(() => {
    if (ingestStatus !== "ingesting") return;
    const interval = setInterval(() => {
      setProgressStep((prev) => (prev + 1) % loadingLogs.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [ingestStatus]);

  // Autoscroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, firstTokenReceived]);

  // Suggestions (dynamically adjust for PR review)
  const suggestions = repoInfo?.type === "pr_review"
    ? [
        "Are there any security vulnerabilities?",
        "What are the potential breaking changes?",
        "Is the test coverage adequate?"
      ]
    : [
        "How is this project structured?",
        "What are the main classes and functions?",
        "How does error handling work in this codebase?"
      ];

  // Ingestion Submission
  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngestError("");

    if (ingestMode === "pr") {
      const prRegex = /^(https:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)\/pull\/(\d+)(\/)?$/;
      const match = githubUrl.trim().match(prRegex);
      if (!match) {
        setIngestError("Please enter a valid GitHub Pull Request URL, e.g. https://github.com/owner/repo/pull/123");
        return;
      }
      const owner = match[3];
      const repo = match[4].replace(/\.git$/, "");

      setIngestStatus("ingesting");
      setProgressStep(0);

      try {
        setPrUrl(githubUrl.trim());
        const generator = reviewPR(githubUrl.trim(), "Is this PR safe to merge?", chatHistory);
        
        let repoId: number | null = null;
        const userMsgId = Math.random().toString();
        const assistantMsgId = Math.random().toString();
        let fullAssistantResponse = "";

        for await (const event of generator) {
          if (event.type === "repo_id") {
            repoId = event.data;
            setRepoInfo({
              id: repoId,
              name: `${owner}/${repo}`,
              chunkCount: 0,
              type: "pr_review"
            });
            // Transition to chat state immediately
            setPageState("CHAT");
            setIngestStatus("idle");
            try {
              getHealthReport(repoId).then((cached) => {
                setHealthData(cached);
              }).catch(() => {});
            } catch (e) {}
            
            // Add initial messages
            setMessages([
              { id: userMsgId, role: "user", content: "Is this PR safe to merge?" },
              { id: assistantMsgId, role: "assistant", content: "", isLoading: true }
            ]);
            setIsStreaming(true);
          } else if (event.type === "citation") {
            addUniqueCitations(event.data);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, citations: event.data }
                  : msg
              )
            );
          } else if (event.type === "token") {
            fullAssistantResponse += event.data;
            setFirstTokenReceived(true);
            setHasCompletedFirstQuery(true);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: msg.content + event.data, isLoading: false }
                  : msg
              )
            );
          } else if (event.type === "done") {
            setHasCompletedFirstQuery(true);
            setChatHistory((prev) => [
              ...prev,
              { role: "user", content: "Is this PR safe to merge?" },
              { role: "assistant", content: fullAssistantResponse }
            ]);
            break;
          }
        }
      } catch (err: any) {
        console.error(err);
        setIngestStatus("error");
        const errMsg = err.message || "";
        if (
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("429") ||
          errMsg.toLowerCase().includes("quota")
        ) {
          setIngestError("Embedding quota exceeded. The free tier allows 1000 requests per day. Please wait until midnight Pacific time for the quota to reset, or upgrade to the Gemini paid tier for unlimited access.");
        } else if (errMsg.includes("Failed to fetch")) {
          setIngestError("Cannot connect to backend. Make sure the server is running on port 8001.");
        } else {
          setIngestError(errMsg || "Failed to review Pull Request. Please check URL and try again.");
        }
      } finally {
        setIsStreaming(false);
        setFirstTokenReceived(false);
      }
      return;
    }

    // Standard Ingest Mode (Repository Analysis)
    const githubRegex = /^(https:\/\/)?(www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(\/)?$/;
    const match = githubUrl.trim().match(githubRegex);

    if (!match) {
      setIngestError("Please enter a valid GitHub repository URL, e.g. https://github.com/owner/repo");
      return;
    }

    const owner = match[3];
    const repo = match[4].replace(/\.git$/, "");

    setIngestStatus("ingesting");
    setProgressStep(0);

    try {
      const res = await ingestRepo(githubUrl.trim());
      setRepoInfo({
        id: res.repo_id,
        name: `${owner}/${repo}`,
        chunkCount: res.chunk_count,
        type: "repo"
      });
      setPageState("CHAT");
      setIngestStatus("idle");
      try {
        const cachedReport = await getHealthReport(res.repo_id);
        setHealthData(cachedReport);
      } catch (e) {
        // No report cached yet
      }
    } catch (err: any) {
      console.error(err);
      setIngestStatus("error");
      const errMsg = err.message || "";
      if (
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("quota")
      ) {
        setIngestError("Embedding quota exceeded. The free tier allows 1000 requests per day. Please wait until midnight Pacific time for the quota to reset, or upgrade to the Gemini paid tier for unlimited access.");
      } else if (errMsg.includes("Failed to fetch")) {
        setIngestError("Cannot connect to backend. Make sure the server is running on port 8001.");
      } else {
        setIngestError(errMsg || "Failed to analyze repository. Please check URL and try again.");
      }
    }
  };

  // Helper to add unique citations to accumulated citations list
  const addUniqueCitations = (newCitations: Citation[]) => {
    setAccumulatedCitations((prev) => {
      const updated = [...prev];
      newCitations.forEach((newCit) => {
        const exists = updated.some(
          (c) => c.file_path === newCit.file_path && c.start_line === newCit.start_line
        );
        if (!exists) {
          updated.push({
            id: updated.length + 1,
            file_path: newCit.file_path,
            start_line: newCit.start_line,
            end_line: newCit.end_line
          });
        }
      });
      return updated;
    });
  };

  // Chat Query Submission
  const handleQuerySubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const textToSend = (overrideText || queryText).trim();
    if (!textToSend || isStreaming || !repoInfo) return;

    setQueryText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMessageId = Math.random().toString();
    const assistantMessageId = Math.random().toString();

    // 1. Add User Message
    const userMsg: Message = {
      id: userMessageId,
      role: "user",
      content: textToSend
    };

    // 2. Add empty pending Assistant Message
    const assistantMsg: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isLoading: true
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setFirstTokenReceived(false);

    let fullAssistantResponse = "";
    try {
      const generator = streamQuery(repoInfo.id, textToSend, chatHistory);

      for await (const event of generator) {
        if (event.type === "citation") {
          addUniqueCitations(event.data);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, citations: event.data }
                : msg
            )
          );
        } else if (event.type === "token") {
          fullAssistantResponse += event.data;
          setFirstTokenReceived(true);
          setHasCompletedFirstQuery(true);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + event.data, isLoading: false }
                : msg
            )
          );
        } else if (event.type === "done") {
          setHasCompletedFirstQuery(true);
          setChatHistory((prev) => [
            ...prev,
            { role: "user", content: textToSend },
            { role: "assistant", content: fullAssistantResponse }
          ]);
          break;
        }
      }
    } catch (err: any) {
      console.error(err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: "Something went wrong. Try again.",
                isLoading: false
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      setFirstTokenReceived(false);
    }
  };

  const selectCitation = (citationId: number) => {
    setSelectedFilePath(null);
    setActiveCitationId(citationId);
    setLeftTab("citations");
    setTimeout(() => {
      const element = document.getElementById(`citation-${citationId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  };

  const selectCitationByPathAndLine = (filePath: string, startLine: number) => {
    setSelectedFilePath(null);
    const target = accumulatedCitations.find(
      (c) => c.file_path === filePath && c.start_line === startLine
    );
    if (target) {
      setActiveCitationId(target.id);
      setLeftTab("citations");
      setTimeout(() => {
        const element = document.getElementById(`citation-${target.id}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
    }
  };

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const handleSelectFile = (filePath: string) => {
    setSelectedFilePath(filePath);
    setLeftTab(repoInfo?.type === "pr_review" ? "changed_files" : "files");

    const firstCit = accumulatedCitations.find((c) => c.file_path === filePath);
    if (firstCit) {
      setActiveCitationId(firstCit.id);
    } else {
      setActiveCitationId(null);
    }
  };

  const handleStartOver = () => {
    setPageState("INGEST");
    setMessages([]);
    setAccumulatedCitations([]);
    setHasCompletedFirstQuery(false);
    setIsCitationsExpanded(false);
    setActiveCitationId(null);
    setSelectedFilePath(null);
    setGithubUrl("");
    setRepoInfo(null);
    setShowCodeSmell(false);
    setShowDiff(false);
    setPrUrl("");
    setIngestStatus("idle");
    setIngestError("");
    setChatHistory([]);
    setHealthData(null);
    setHealthLoading(false);
    setShowHealthDashboard(false);
  };

  const fileTree = buildTreeFromCitations(accumulatedCitations);
  const activeCitation = accumulatedCitations.find((c) => c.id === activeCitationId);
  const activeFilePath = selectedFilePath || (activeCitation ? activeCitation.file_path : null);

  const visibleCitations = isCitationsExpanded
    ? accumulatedCitations
    : accumulatedCitations.slice(0, 8);

  const isQuotaError = ingestStatus === "error" && ingestError.includes("Embedding quota exceeded");

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0B] text-[#EDEDED] font-sans relative overflow-hidden" style={{ background: "#0A0A0B", position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, pointerEvents: "none" }}>
        <AppBackground appState={backgroundState} />
      </div>

      {/* Decorative Grid Lines backdrop */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" style={{ zIndex: 0 }} />
      <div className="absolute inset-0 glow-overlay pointer-events-none" style={{ zIndex: 0 }} />

      {/* Header */}
      <header className="h-16 border-b border-[#1F1F23]/60 flex items-center justify-between px-6 bg-black/40 backdrop-blur-md relative" style={{ zIndex: 10 }}>
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight select-none">
          <div className="w-6 h-6 rounded bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-black font-mono font-bold text-xs">
            S
          </div>
          <span>
            Syntree<span className="text-blue-500 font-mono">AI</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="text-xs font-mono text-neutral-400">FastAPI Backend Connected</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow relative flex items-center justify-center" style={{ zIndex: 10 }}>
        <AnimatePresence mode="wait">
          {pageState === "INGEST" ? (
            /* --- INGEST VIEW --- */
            <motion.div
              key="ingest"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-xl p-4"
            >
              <div className="p-8 rounded-2xl glass-panel border border-[#1F1F23]/80 shadow-[0_30px_60px_rgba(0,0,0,0.6)] relative overflow-hidden bg-black/20" style={{ zIndex: 1 }}>
                {/* Decorative glow inside card */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-500/10 blur-[50px] rounded-full pointer-events-none" />

                <div className="flex flex-col items-center justify-center text-center space-y-6 relative z-10">
                  {/* Logo wordmark */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-black font-mono font-black text-base shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                      S
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
                      Syntree<span className="text-blue-500 font-mono">AI</span> Workspace
                    </h1>
                    <p className="text-xs text-neutral-400 max-w-md font-sans">
                      Enter a public GitHub repository link below to build an AST-aware semantic index.
                    </p>
                  </div>

                  <AnimatePresence mode="wait">
                    {isQuotaError ? (
                      /* --- QUOTA EXCEEDED ERROR STATE --- */
                      <motion.div
                        key="quota-error"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full flex flex-col items-center justify-center space-y-6 text-center"
                      >
                        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                          <AlertTriangle className="w-6 h-6 animate-pulse" />
                        </div>
                        
                        <div className="space-y-2 max-w-md">
                          <h3 className="text-sm font-semibold font-mono text-neutral-300 uppercase tracking-wider">
                            Quota Limit Reached
                          </h3>
                          <p className="text-xs text-neutral-400 font-sans leading-relaxed">
                            {ingestError}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              setIngestStatus("idle");
                              setIngestError("");
                              handleIngestSubmit(e);
                            }}
                            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-200 transform active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setIngestStatus("idle");
                              setIngestError("");
                            }}
                            className="px-6 py-2.5 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 text-xs font-mono font-medium hover:text-white transition-colors cursor-pointer"
                          >
                            Go Back
                          </button>
                        </div>
                      </motion.div>
                    ) : ingestStatus === "idle" || ingestStatus === "error" ? (
                      <motion.form
                        key="ingest-form"
                        onSubmit={handleIngestSubmit}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full space-y-4"
                      >
                        {/* Tab toggle */}
                        <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-900 w-full mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIngestMode("repo");
                              setIngestError("");
                            }}
                            className={`flex-1 py-2 text-center text-xs font-mono font-semibold rounded-md transition-all cursor-pointer ${
                              ingestMode === "repo"
                                ? "bg-blue-600 text-white shadow-lg font-bold"
                                : "text-neutral-500 hover:text-neutral-350"
                            }`}
                          >
                            Analyze Repository
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIngestMode("pr");
                              setIngestError("");
                            }}
                            className={`flex-1 py-2 text-center text-xs font-mono font-semibold rounded-md transition-all cursor-pointer ${
                              ingestMode === "pr"
                                ? "bg-blue-600 text-white shadow-lg font-bold"
                                : "text-neutral-500 hover:text-neutral-350"
                            }`}
                          >
                            Review PR
                          </button>
                        </div>

                        <div className="space-y-1.5 text-left">
                          <label className="text-xs font-mono text-neutral-400 pl-1">
                            {ingestMode === "repo" ? "GitHub Repository URL" : "GitHub Pull Request URL"}
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-neutral-500">
                              <svg
                                viewBox="0 0 24 24"
                                width="18"
                                height="18"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="w-4.5 h-4.5"
                              >
                                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                                <path d="M9 18c-4.51 2-5-2-7-2" />
                              </svg>
                            </div>
                            <input
                              type="text"
                              value={githubUrl}
                              onChange={(e) => setGithubUrl(e.target.value)}
                              placeholder={ingestMode === "repo" ? "https://github.com/owner/repo" : "https://github.com/owner/repo/pull/123"}
                              className="w-full pl-11 pr-4 py-3.5 rounded-lg border border-[#1F1F23] bg-black/50 text-sm text-[#EDEDED] font-mono placeholder-neutral-600 focus-neon transition-colors"
                            />
                          </div>
                          {ingestError && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-xs text-red-400 mt-2 flex items-start gap-1.5 pl-1"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>{ingestError}</span>
                            </motion.div>
                          )}
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-sm text-white shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:shadow-[0_0_30px_rgba(59,130,246,0.45)] transition-all duration-300 transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>{ingestMode === "repo" ? "Analyze Repository" : "Review Pull Request"}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </motion.form>
                    ) : (
                      /* --- INGESTING / LOADING STATE --- */
                      <motion.div
                        key="ingesting-status"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full py-6 flex flex-col items-center justify-center space-y-5"
                      >
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        
                        <div className="h-6 flex items-center justify-center">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={progressStep}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.25 }}
                              className="text-sm font-mono text-neutral-400"
                            >
                              {loadingLogs[progressStep]}
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        <div className="w-64 h-1 bg-neutral-900 rounded-full overflow-hidden relative">
                          <motion.div
                            className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                            initial={{ width: "0%" }}
                            animate={{ width: "95%" }}
                            transition={{ duration: 12, ease: "linear" }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : (
            /* --- CHAT STATE VIEW --- */
            <motion.div
              key="chat-dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full max-w-7xl mx-auto md:h-[calc(100vh-4rem)] p-4 grid grid-cols-1 md:grid-cols-12 gap-4"
            >
              {/* LEFT PANEL: Repo Info + Citations / File Tree (40% width) */}
              <div
                className="md:col-span-5 flex flex-col rounded-xl overflow-hidden glass-panel h-[500px] md:h-full relative"
                style={{
                  background: "rgba(10, 10, 11, 0.85)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  zIndex: 1
                }}
              >
                {/* Repo Info Header */}
                <div className="p-4 border-b border-[#1F1F23]/60 bg-black/20 space-y-3 shrink-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                        {repoInfo?.type === "pr_review" ? "PR Review Mode" : "Active Project"}
                      </span>
                      {repoInfo?.type === "pr_review" ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/5 text-[9px] text-amber-400 font-mono font-bold uppercase shrink-0">
                            PR
                          </span>
                          <h2 className="text-base font-bold text-neutral-200 truncate font-mono select-all">
                            {repoInfo?.name}
                          </h2>
                        </div>
                      ) : (
                        <h2 className="text-base font-bold text-neutral-200 truncate font-mono">
                          {repoInfo?.name}
                        </h2>
                      )}
                    </div>
                    <button
                      onClick={handleStartOver}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 text-xs font-mono font-medium hover:text-white transition-colors cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Start Over</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/5 text-[10px] text-blue-400 font-mono">
                        {repoInfo?.type === "pr_review" ? "PR Chunks" : `${repoInfo?.chunkCount} Chunks`} Indexed
                      </span>
                    </div>

                    <button
                      onClick={() => setShowCodeSmell(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 font-bold font-mono text-[9px] text-amber-400 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span>Code Analysis</span>
                    </button>
                  </div>

                  {repoInfo?.type === "pr_review" && (
                    <button
                      onClick={() => setShowDiff(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-blue-500 hover:border-blue-400 bg-transparent hover:bg-blue-500/10 text-xs font-mono font-bold text-blue-400 hover:text-blue-300 transition-all cursor-pointer shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                      <span>View Diff</span>
                    </button>
                  )}

                  <div style={{ marginTop: "10px", width: "100%" }}>
                    {healthLoading ? (
                      <button
                        disabled
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#10B981]/50 bg-[#10B981]/5 text-xs font-mono font-bold text-[#10B981] opacity-70"
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing...</span>
                      </button>
                    ) : (
                      !healthData && (
                        <button
                          onClick={async () => {
                            if (!repoInfo) return;
                            try {
                              setHealthLoading(true);
                              const res = await runHealthCheck(repoInfo.id);
                              setHealthData(res);
                            } catch (err: any) {
                              alert(`Health check failed: ${err.message || err}`);
                            } finally {
                              setHealthLoading(false);
                            }
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#10B981] hover:border-[#10B981]/80 bg-transparent hover:bg-[#10B981]/10 text-xs font-mono font-bold text-[#10B981] hover:text-[#10B981]/90 transition-all cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                        >
                          <span style={{ fontSize: "14px" }}>🏥</span>
                          <span>Run Health Check</span>
                        </button>
                      )
                    )}
                  </div>

                  {healthData && (
                    <HealthSummary
                      healthData={healthData}
                      onOpenDashboard={() => setShowHealthDashboard(true)}
                      onRunAnalysis={async () => {
                        if (!repoInfo) return;
                        try {
                          setHealthLoading(true);
                          const res = await runHealthCheck(repoInfo.id);
                          setHealthData(res);
                        } catch (err: any) {
                          alert(`Health check failed: ${err.message || err}`);
                        } finally {
                          setHealthLoading(false);
                        }
                      }}
                      loading={healthLoading}
                    />
                  )}
                </div>

                {/* Left Panel Tabs Toggle */}
                {!hasCompletedFirstQuery ? (
                  <div className="px-4 py-3 border-b border-[#1F1F23]/60 bg-black/10 shrink-0">
                    <span className="text-xs font-mono font-semibold text-neutral-400">Citations</span>
                  </div>
                ) : (
                  <div className="flex border-b border-[#1F1F23]/60 bg-black/10 shrink-0 overflow-x-auto no-scrollbar">
                    <button
                      onClick={() => setLeftTab("citations")}
                      className={`flex-1 min-w-[90px] py-2 text-center text-xs font-mono border-b-2 font-semibold transition-colors cursor-pointer ${
                        leftTab === "citations"
                          ? "border-blue-500 text-blue-400 bg-blue-500/[0.02]"
                          : "border-transparent text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      Citations ({accumulatedCitations.length})
                    </button>
                    <button
                      onClick={() => setLeftTab("files")}
                      className={`flex-1 min-w-[90px] py-2 text-center text-xs font-mono border-b-2 font-semibold transition-colors cursor-pointer ${
                        leftTab === "files"
                          ? "border-blue-500 text-blue-400 bg-blue-500/[0.02]"
                          : "border-transparent text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      File Tree
                    </button>
                    <button
                      onClick={() => setLeftTab("graph")}
                      className={`flex-1 min-w-[125px] py-2 text-center text-xs font-mono border-b-2 font-semibold transition-colors cursor-pointer ${
                        leftTab === "graph"
                          ? "border-blue-500 text-blue-400 bg-blue-500/[0.02]"
                          : "border-transparent text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      Dependency Graph
                    </button>
                    {repoInfo?.type === "pr_review" && (
                      <button
                        onClick={() => setLeftTab("changed_files")}
                        className={`flex-1 min-w-[110px] py-2 text-center text-xs font-mono border-b-2 font-semibold transition-colors cursor-pointer ${
                          leftTab === "changed_files"
                            ? "border-blue-500 text-blue-400 bg-blue-500/[0.02]"
                            : "border-transparent text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        Changed Files
                      </button>
                    )}
                  </div>
                )}

                {/* Left Panel Content Body */}
                <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                  <AnimatePresence mode="wait">
                    {leftTab === "citations" ? (
                      /* --- CITATIONS LIST TAB --- */
                      <motion.div
                        key="citations-tab"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-3"
                      >
                        {accumulatedCitations.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                            <Sparkles className="w-10 h-10 text-neutral-600 animate-pulse-slow" />
                            <p className="text-sm font-sans text-[#6b7280]">
                              Citations will appear here as you ask questions
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {visibleCitations.map((cit) => {
                              const isHighlighted = activeCitationId === cit.id;
                              const langInfo = getLanguageFromPath(cit.file_path);
                              return (
                                <div
                                  key={cit.id}
                                  id={`citation-${cit.id}`}
                                  onClick={() => setActiveCitationId(cit.id)}
                                  className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                                    isHighlighted
                                      ? "bg-blue-600/[0.06] border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                                      : "bg-black/20 border-neutral-800/80 hover:border-blue-500/30 hover:shadow-[0_0_10px_rgba(59,130,246,0.06)]"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="font-mono text-xs text-neutral-200 truncate select-all pr-2">
                                      {cit.file_path}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] uppercase shrink-0 ${langInfo.bg} ${langInfo.text}`}>
                                      {langInfo.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
                                    <span>Lines {cit.start_line} – {cit.end_line}</span>
                                    <span className="text-[10px] text-blue-500 font-semibold">Citation #{cit.id}</span>
                                  </div>
                                </div>
                              );
                            })}

                            {accumulatedCitations.length > 8 && (
                              <button
                                onClick={() => setIsCitationsExpanded(!isCitationsExpanded)}
                                className="w-full py-2 text-center text-xs font-mono text-blue-400 hover:text-blue-300 border border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-900/20 rounded-lg transition-colors cursor-pointer mt-2"
                              >
                                {isCitationsExpanded
                                  ? "Show Less"
                                  : `Show all ${accumulatedCitations.length} citations`}
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ) : leftTab === "files" ? (
                      /* --- FILE TREE TAB --- */
                      <motion.div
                        key="files-tab"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                      >
                        {fileTree.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                            <Code2 className="w-8 h-8 text-neutral-700" />
                            <p className="text-xs text-neutral-500 font-mono">No files indexed yet.</p>
                            <p className="text-[11px] text-neutral-600 max-w-[200px]">
                              Ask a question to discover files retrieved from vector storage.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {fileTree.map((node, idx) => (
                              <TreeNodeItem
                                key={idx}
                                node={node}
                                onSelectFile={handleSelectFile}
                                activeFilePath={activeFilePath}
                              />
                            ))}
                          </div>
                        )}
                      </motion.div>
                    ) : leftTab === "graph" && repoInfo ? (
                      /* --- DEPENDENCY GRAPH TAB --- */
                      <motion.div
                        key="graph-tab"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="w-full h-full min-h-[380px]"
                      >
                        <DependencyGraph
                          repoId={repoInfo.id}
                          accumulatedCitations={accumulatedCitations}
                          onSelectCitation={selectCitation}
                        />
                      </motion.div>
                    ) : (
                      /* --- PR CHANGED FILES TAB --- */
                      <motion.div
                        key="changed-files-tab"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                      >
                        {fileTree.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                            <Code2 className="w-8 h-8 text-neutral-700" />
                            <p className="text-xs text-neutral-500 font-mono">No PR files detected.</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {fileTree.map((node, idx) => (
                              <TreeNodeItem
                                key={idx}
                                node={node}
                                onSelectFile={handleSelectFile}
                                activeFilePath={activeFilePath}
                              />
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Code Smell slide-up overlay */}
                {showCodeSmell && repoInfo && (
                  <CodeSmellDetector
                    repoId={repoInfo.id}
                    repoName={repoInfo.name}
                    onClose={() => setShowCodeSmell(false)}
                    onSelectFile={(filePath) => {
                      setShowCodeSmell(false);
                      handleSelectFile(filePath);
                    }}
                  />
                )}

                {showDiff && repoInfo && (
                  <SemanticDiffViewer
                    repoId={repoInfo.id}
                    prUrl={prUrl}
                    onClose={() => setShowDiff(false)}
                  />
                )}

                {showHealthDashboard && healthData && (
                  <HealthDashboard
                    healthData={healthData}
                    onClose={() => setShowHealthDashboard(false)}
                    onRerun={async () => {
                      if (!repoInfo) return;
                      try {
                        setHealthLoading(true);
                        const res = await runHealthCheck(repoInfo.id);
                        setHealthData(res);
                      } catch (err: any) {
                        alert(`Health check failed: ${err.message || err}`);
                      } finally {
                        setHealthLoading(false);
                      }
                    }}
                    loading={healthLoading}
                  />
                )}
              </div>

              {/* RIGHT PANEL: Chat interface (60% width) */}
              <div
                className="md:col-span-7 flex flex-col rounded-xl overflow-hidden glass-panel h-[600px] md:h-full relative"
                style={{
                  background: "rgba(10, 10, 11, 0.85)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  zIndex: 1
                }}
              >
                {/* Chat History Panel */}
                <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-md mx-auto pt-16">
                      <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-bold text-neutral-200">
                        Query Ingested Codebase
                      </h3>
                      <p className="text-xs text-neutral-400 font-sans leading-relaxed">
                        SyntreeAI has finished index compilation. You can now query variables, classes, imports, or general architectural structure.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                        >
                          {/* Message Bubble Container */}
                          <div
                            className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                              msg.role === "user"
                                ? "bg-blue-600 text-white font-medium shadow-[0_0_15px_rgba(59,130,246,0.15)] rounded-br-none"
                                : "bg-black/35 border border-[#1F1F23] text-neutral-200 rounded-bl-none"
                            }`}
                          >
                            {msg.role === "user" ? (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            ) : (
                              <div className="markdown-body prose prose-invert max-w-none text-neutral-200">
                                {msg.content ? (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                  >
                                    {msg.content}
                                  </ReactMarkdown>
                                ) : (
                                  msg.isLoading && (
                                    <div className="flex items-center gap-2 py-1 text-neutral-500 font-mono text-xs">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                                      <span>Analyzing codebase...</span>
                                    </div>
                                  )
                                )}

                                {/* Blinking cursor logic while streaming this exact message */}
                                {isStreaming && messages[messages.length - 1].id === msg.id && firstTokenReceived && (
                                  <span className="inline-block cursor-blink w-1 h-3.5 ml-1" />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Citations tags attached below assistant message */}
                          {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[85%]">
                              <span className="text-[10px] font-mono text-neutral-500 self-center mr-1">
                                References:
                              </span>
                              {msg.citations.map((cit) => (
                                <button
                                  key={cit.id}
                                  onClick={() => selectCitationByPathAndLine(cit.file_path, cit.start_line)}
                                  className="px-2 py-0.5 rounded border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 font-mono text-[10px] text-neutral-400 hover:text-white transition-colors cursor-pointer max-w-[200px] truncate"
                                >
                                  {cit.file_path.split("/").pop()}:{cit.start_line}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Suggestion Chips & Message Input Panel */}
                <div className="p-4 border-t border-[#1F1F23]/60 bg-black/20 space-y-4 shrink-0">
                  {/* Suggestion Chips (Visible when chat starts or idle) */}
                  {messages.length === 0 && !isStreaming && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono text-neutral-500 pl-0.5">Suggested Questions:</span>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuerySubmit(undefined, suggestion)}
                            className="px-3 py-1.5 rounded-lg border border-neutral-800/80 bg-[#0C0C0E] hover:border-blue-500/40 hover:text-white text-xs text-neutral-400 font-sans text-left transition-all cursor-pointer hover:shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Memory Active Indicator */}
                  {chatHistory.length > 0 && (
                    <div className="text-[10px] font-mono text-[#6b7280] pl-0.5 flex items-center gap-1 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Memory: {chatHistory.length / 2} turns</span>
                    </div>
                  )}

                  {/* Input area */}
                  <form onSubmit={handleQuerySubmit} className="flex gap-2.5 items-end">
                    <div className="relative flex-grow">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={queryText}
                        disabled={isStreaming}
                        onChange={(e) => {
                          setQueryText(e.target.value);
                          // Auto-grow
                          const textarea = e.target;
                          textarea.style.height = "auto";
                          textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleQuerySubmit(e);
                          }
                        }}
                        placeholder={isStreaming ? "AI is generating response..." : "Ask a question about the codebase..."}
                        className="w-full py-3.5 pl-4 pr-12 rounded-lg border border-[#1F1F23] bg-black/60 text-sm text-[#EDEDED] font-sans placeholder-neutral-600 focus-neon transition-colors resize-none overflow-y-auto max-h-[180px] custom-scrollbar disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isStreaming || !queryText.trim()}
                      className="p-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-white shadow-[0_0_15px_rgba(59,130,246,0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:shadow-none transition-all duration-200 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Embedded CSS for clean scrollbars */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1F1F23;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3B82F6;
        }
        
        .markdown-body pre {
          background: #080809 !important;
          border: 1px solid #1c1c1f;
          border-radius: 6px;
          padding: 12px;
          margin: 10px 0;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .markdown-body code {
          font-family: var(--font-mono);
        }
        .markdown-body p {
          margin-bottom: 8px;
        }
        .markdown-body p:last-child {
          margin-bottom: 0;
        }
        .markdown-body ul, .markdown-body ol {
          margin: 8px 0;
          padding-left: 20px;
          list-style-type: disc;
        }
        .markdown-body ol {
          list-style-type: decimal;
        }
        .markdown-body li {
          margin-bottom: 4px;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
          font-weight: 700;
          color: #ffffff;
          margin-top: 12px;
          margin-bottom: 6px;
        }
        .markdown-body h1 { font-size: 1.25rem; }
        .markdown-body h2 { font-size: 1.15rem; }
        .markdown-body h3 { font-size: 1.05rem; }
        
        /* Blinking cursor style */
        @keyframes cursor-blink-anim {
          50% { opacity: 0; }
        }
        .cursor-blink {
          background-color: #3B82F6;
          animation: cursor-blink-anim 1s step-start infinite;
          vertical-align: middle;
        }
      `}</style>
    </div>
  );
}
