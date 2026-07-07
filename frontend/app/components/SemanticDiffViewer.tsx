import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { getPRDiff, annotateDiff } from "../lib/api";

// Register languages for SyntaxHighlighter
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";

SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);

interface SemanticDiffViewerProps {
  repoId: number;
  prUrl: string;
  onClose: () => void;
}

interface DiffLine {
  type: "added" | "removed" | "context";
  old_line_num: number | null;
  new_line_num: number | null;
  content: string;
}

interface DiffChunk {
  header: string;
  old_start: number;
  new_start: number;
  lines: DiffLine[];
}

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  chunks: DiffChunk[];
}

interface AIAnnotation {
  line_num: number;
  type: "bug" | "security" | "improvement" | "info" | "positive";
  message: string;
}

interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export default function SemanticDiffViewer({ repoId, prUrl, onClose }: SemanticDiffViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"unified" | "sidebyside">("unified");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [activeFilename, setActiveFilename] = useState<string>("");
  
  // Annotation states
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, AIAnnotation[]>>({});

  // Sync scroll refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollRef = useRef<"left" | "right" | null>(null);

  const activeFile = activeFilename;
  const annotatingFile = annotating;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Fetch Diff Data
  useEffect(() => {
    async function loadDiff() {
      try {
        setLoading(true);
        setError(null);
        const data = await getPRDiff(repoId);
        setFiles(data.files || []);
        if (data.files && data.files.length > 0) {
          setActiveFilename(data.files[0].filename);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load PR diff.");
      } finally {
        setLoading(false);
      }
    }
    loadDiff();
  }, [repoId]);

  // Scroll to file helper
  const scrollToFile = (filename: string) => {
    setActiveFilename(filename);
    const id = `file-${filename.replace(/\//g, "-")}`;
    if (viewMode === "unified") {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      const leftElement = document.getElementById(`${id}-left`);
      if (leftElement) {
        leftElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  // Synchronized scroll handlers
  const handleLeftScroll = () => {
    if (activeScrollRef.current === "right") return;
    activeScrollRef.current = "left";
    if (leftScrollRef.current && rightScrollRef.current) {
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
    }
  };

  const handleRightScroll = () => {
    if (activeScrollRef.current === "left") return;
    activeScrollRef.current = "right";
    if (rightScrollRef.current && leftScrollRef.current) {
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
    }
  };

  // AI Annotation Trigger
  const handleAnnotate = async (filename: string) => {
    if (annotating === filename) return;
    try {
      setAnnotating(filename);
      const result = await annotateDiff(repoId, filename);
      setAnnotations(prev => ({ ...prev, [filename]: result }));
    } catch (err: unknown) {
      alert(`AI Annotation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAnnotating(null);
    }
  };

  // Language Resolver
  const getLanguage = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "py") return "python";
    if (ext === "ts" || ext === "tsx") return "typescript";
    if (ext === "js" || ext === "jsx") return "javascript";
    return "text";
  };

  // Annotation Style Helper
  const getAnnotationStyles = (type: string) => {
    switch (type) {
      case "bug":
        return { bg: "rgba(239, 68, 68, 0.08)", color: "#EF4444", icon: "⚠️" };
      case "security":
        return { bg: "rgba(249, 115, 22, 0.08)", color: "#F97316", icon: "🔒" };
      case "improvement":
        return { bg: "rgba(59, 130, 246, 0.08)", color: "#3B82F6", icon: "💡" };
      case "positive":
        return { bg: "rgba(16, 185, 129, 0.08)", color: "#10B981", icon: "✅" };
      case "info":
      default:
        return { bg: "rgba(107, 114, 128, 0.08)", color: "#9CA3AF", icon: "ℹ️" };
    }
  };

  // Side-by-side row pairing logic memoized
  const fileRows = useMemo(() => {
    const map: Record<string, SideBySideRow[][]> = {};
    files.forEach(file => {
      map[file.filename] = file.chunks.map(chunk => {
        const rows: SideBySideRow[] = [];
        let i = 0;
        const lines = chunk.lines;
        while (i < lines.length) {
          if (lines[i].type === "context") {
            rows.push({ left: lines[i], right: lines[i] });
            i++;
          } else {
            const removals: DiffLine[] = [];
            while (i < lines.length && lines[i].type === "removed") {
              removals.push(lines[i]);
              i++;
            }
            const additions: DiffLine[] = [];
            while (i < lines.length && lines[i].type === "added") {
              additions.push(lines[i]);
              i++;
            }
            const maxLen = Math.max(removals.length, additions.length);
            for (let j = 0; j < maxLen; j++) {
              rows.push({
                left: removals[j] || null,
                right: additions[j] || null
              });
            }
          }
        }
        return rows;
      });
    });
    return map;
  }, [files]);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 99999,
        background: "rgba(0,0,0,0.95)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div style={{
        width: "96vw",
        height: "94vh",
        background: "#0A0A0B",
        border: "1px solid rgba(59,130,246,0.3)",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.9)"
      }}>
        {/* HEADER - always visible at top */}
        <div style={{
          height: "56px",
          minHeight: "56px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          background: "#111118",
          borderBottom: "1px solid rgba(59,130,246,0.2)",
          gap: "12px"
        }}>
          <span style={{
            color: "#EDEDED",
            fontWeight: 600,
            fontSize: "16px"
          }}>
            🔀 Semantic Diff Viewer
          </span>
          
          <div style={{flex: 1}} />
          
          <a href={prUrl} target="_blank" rel="noreferrer"
            style={{
              color: "#3B82F6",
              fontSize: "13px",
              textDecoration: "none",
              padding: "5px 12px",
              border: "1px solid rgba(59,130,246,0.4)",
              borderRadius: "5px"
            }}>
            PR Link ↗
          </a>
          
          <div style={{
            display: "flex",
            background: "#1a1a2e",
            border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: "6px",
            padding: "2px"
          }}>
            <button onClick={() => setViewMode("unified")}
              style={{
                padding: "5px 16px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                background: viewMode === "unified"
                  ? "#3B82F6" : "transparent",
                color: viewMode === "unified"
                  ? "#fff" : "#9CA3AF"
              }}>
              Unified
            </button>
            <button onClick={() => setViewMode("sidebyside")}
              style={{
                padding: "5px 16px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                background: viewMode === "sidebyside"
                  ? "#3B82F6" : "transparent",
                color: viewMode === "sidebyside"
                  ? "#fff" : "#9CA3AF"
              }}>
              Side-by-side
            </button>
          </div>
          
          <button onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#9CA3AF",
              borderRadius: "6px",
              width: "34px",
              height: "34px",
              cursor: "pointer",
              fontSize: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
            ×
          </button>
        </div>

        {/* BODY */}
        <div style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          minHeight: 0
        }}>
          {/* File sidebar */}
          <div style={{
            width: "220px",
            minWidth: "220px",
            flexShrink: 0,
            borderRight: "1px solid rgba(59,130,246,0.15)",
            overflowY: "auto",
            background: "#0D0D0F",
            padding: "8px 0"
          }}>
            {files.map(file => (
              <div key={file.filename}
                onClick={() => scrollToFile(file.filename)}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  borderLeft: activeFile === file.filename
                    ? "3px solid #3B82F6"
                    : "3px solid transparent",
                  background: activeFile === file.filename
                    ? "rgba(59,130,246,0.08)"
                    : "transparent"
                }}>
                <div style={{
                  fontFamily: "monospace",
                  fontSize: "12px",
                  color: "#EDEDED",
                  marginBottom: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}>
                  {file.filename}
                </div>
                <div style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "center"
                }}>
                  <span style={{
                    fontSize: "10px",
                    padding: "1px 6px",
                    borderRadius: "3px",
                    background: "#1F2937",
                    color: "#9CA3AF"
                  }}>
                    {file.status}
                  </span>
                  <span style={{
                    color: "#10B981",
                    fontSize: "11px"
                  }}>
                    +{file.additions}
                  </span>
                  <span style={{
                    color: "#EF4444",
                    fontSize: "11px"
                  }}>
                    -{file.deletions}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Diff content */}
          <div style={{
            flex: 1,
            overflow: viewMode === "unified" ? "auto" : "hidden",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative"
          }}>
            {loading && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", height: "100%" }}>
                <Loader2 className="animate-spin" size={32} style={{ color: "#3B82F6" }} />
                <span style={{ color: "#9CA3AF", fontSize: "14px" }}>Parsing Pull Request patches...</span>
              </div>
            )}

            {error && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "40px", height: "100%" }}>
                <AlertCircle size={48} style={{ color: "#EF4444" }} />
                <span style={{ color: "#EF4444", fontSize: "16px", fontWeight: "bold", textAlign: "center" }}>{error}</span>
                <button
                  onClick={onClose}
                  style={{
                    padding: "8px 20px",
                    backgroundColor: "#1F2937",
                    color: "#FFF",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#374151")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1F2937")}
                >
                  Close Viewer
                </button>
              </div>
            )}

            {!loading && !error && files.length === 0 && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <span style={{ color: "#6B7280" }}>No files changed in this PR.</span>
              </div>
            )}

            {!loading && !error && files.length > 0 && (
              <>
                {/* UNIFIED VIEW */}
                <div
                  style={{
                    display: viewMode === "unified" ? "block" : "none",
                    flex: 1,
                  }}
                >
                  {files.map((file) => {
                    const fileAnnotations = annotations[file.filename] || [];

                    return (
                      <div
                        key={file.filename}
                        id={`file-${file.filename.replace(/\//g, "-")}`}
                        style={{ borderBottom: "1px solid #1F2937" }}
                      >
                        {/* File header with Annotate button */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "8px 16px",
                          background: "#111118",
                          borderTop: "1px solid #1F2937",
                          borderBottom: "1px solid #1F2937",
                          position: "sticky",
                          top: 0,
                          zIndex: 2,
                          gap: "10px"
                        }}>
                          <span style={{
                            fontFamily: "monospace",
                            fontSize: "13px",
                            color: "#EDEDED",
                            fontWeight: 600,
                            flex: 1
                          }}>
                            {file.filename}
                          </span>
                          <span style={{
                            color: "#10B981",
                            fontSize: "12px"
                          }}>
                            +{file.additions}
                          </span>
                          <span style={{
                            color: "#EF4444",
                            fontSize: "12px"
                          }}>
                            -{file.deletions}
                          </span>
                          <button
                            onClick={() => handleAnnotate(file.filename)}
                            disabled={annotatingFile === file.filename}
                            style={{
                              padding: "4px 12px",
                              background: "transparent",
                              border: "1px solid #F59E0B",
                              color: "#F59E0B",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              opacity: annotatingFile === file.filename
                                ? 0.6 : 1
                            }}>
                            {annotatingFile === file.filename
                              ? "Annotating..."
                              : "✨ Annotate with AI"}
                          </button>
                        </div>

                        {/* Diff lines */}
                        <div style={{
                          fontFamily: "monospace",
                          fontSize: "13px",
                          lineHeight: "20px"
                        }}>
                          {file.chunks.map((chunk, cIdx) => (
                            <div key={cIdx}>
                              {/* Chunk Header */}
                              <div
                                style={{
                                  backgroundColor: "#161B22",
                                  color: "#8B949E",
                                  padding: "6px 20px",
                                  fontSize: "12px",
                                  userSelect: "none",
                                  fontFamily: "monospace",
                                  whiteSpace: "pre",
                                }}
                              >
                                {chunk.header}
                              </div>

                              {/* Chunk Lines */}
                              {chunk.lines.map((line, lIdx) => {
                                const isAdded = line.type === "added";
                                const isRemoved = line.type === "removed";

                                const lineBg = isAdded
                                  ? "rgba(16, 185, 129, 0.06)"
                                  : isRemoved
                                  ? "rgba(239, 68, 68, 0.06)"
                                  : "transparent";

                                const borderLeftStyle = isAdded
                                  ? "3px solid #10B981"
                                  : isRemoved
                                  ? "3px solid #EF4444"
                                  : "3px solid transparent";

                                // Find matching annotation
                                const annotation = line.new_line_num !== null
                                  ? fileAnnotations.find(a => a.line_num === line.new_line_num)
                                  : null;

                                return (
                                  <React.Fragment key={lIdx}>
                                    <div
                                      style={{
                                        display: "flex",
                                        whiteSpace: "pre",
                                        minWidth: "max-content",
                                        backgroundColor: lineBg,
                                        borderLeft: borderLeftStyle,
                                      }}
                                    >
                                      {/* Old Line Number */}
                                      <div
                                        style={{
                                          minWidth: "48px",
                                          padding: "0 12px",
                                          color: "#4B5563",
                                          borderRight: "1px solid #1F2937",
                                          userSelect: "none",
                                          flexShrink: 0,
                                          textAlign: "right",
                                        }}
                                      >
                                        {line.old_line_num || ""}
                                      </div>
                                      {/* New Line Number */}
                                      <div
                                        style={{
                                          minWidth: "48px",
                                          padding: "0 12px",
                                          color: "#4B5563",
                                          borderRight: "1px solid #1F2937",
                                          userSelect: "none",
                                          flexShrink: 0,
                                          textAlign: "right",
                                        }}
                                      >
                                        {line.new_line_num || ""}
                                      </div>
                                      {/* Code */}
                                      <div style={{ flex: 1, padding: "0 16px", whiteSpace: "pre" }}>
                                        <SyntaxHighlighter
                                          language={getLanguage(file.filename)}
                                          style={atomOneDark}
                                          customStyle={{
                                            margin: 0,
                                            padding: 0,
                                            background: "transparent",
                                            fontSize: "13px",
                                            lineHeight: "20px",
                                          }}
                                        >
                                          {line.content}
                                        </SyntaxHighlighter>
                                      </div>
                                    </div>

                                    {/* AI Annotation Badge */}
                                    {annotation && (() => {
                                      const styles = getAnnotationStyles(annotation.type);
                                      return (
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "flex-start",
                                            padding: "6px 16px 6px 76px",
                                            backgroundColor: styles.bg,
                                            borderLeft: `3px solid ${styles.color}`,
                                            fontSize: "12px",
                                            lineHeight: "18px",
                                            gap: "8px",
                                            animation: "slideDown 0.2s ease-out",
                                          }}
                                        >
                                          <span style={{ flexShrink: 0 }}>{styles.icon}</span>
                                          <span style={{ color: styles.color }}>
                                            <strong style={{ textTransform: "capitalize" }}>{annotation.type}:</strong>{" "}
                                            {annotation.message}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* SIDE-BY-SIDE VIEW */}
                <div
                  style={{
                    display: viewMode === "sidebyside" ? "flex" : "none",
                    flex: 1,
                    width: "100%",
                    overflow: "hidden",
                  }}
                >
                  {/* Left Column (Old File) */}
                  <div
                    ref={leftScrollRef}
                    onScroll={handleLeftScroll}
                    onMouseEnter={() => (activeScrollRef.current = "left")}
                    style={{
                      flex: 1,
                      minWidth: "50%",
                      overflowY: "auto",
                      overflowX: "auto",
                      backgroundColor: "#070709",
                      borderRight: "1px solid #1F2937",
                    }}
                  >
                    {files.map((file) => {
                      const chunks = file.chunks;
                      const pairedChunks = fileRows[file.filename] || [];

                      return (
                        <div key={file.filename} id={`file-${file.filename.replace(/\//g, "-")}-left`}>
                          {/* Column Header */}
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "8px 16px",
                            background: "#111118",
                            borderBottom: "1px solid #1F2937",
                            borderTop: "1px solid #1F2937",
                            position: "sticky",
                            top: 0,
                            zIndex: 2,
                            gap: "12px"
                          }}>
                            <span style={{
                              fontFamily: "monospace",
                              fontSize: "13px",
                              color: "#EDEDED",
                              flex: 1
                            }}>
                              {file.filename} (Original)
                            </span>
                          </div>

                          {chunks.map((chunk, cIdx) => {
                            const rows = pairedChunks[cIdx] || [];
                            const fileAnnotations = annotations[file.filename] || [];

                            return (
                              <div key={cIdx} style={{
                                fontFamily: "monospace",
                                fontSize: "13px",
                                lineHeight: "20px"
                              }}>
                                <div
                                  style={{
                                    backgroundColor: "#161B22",
                                    color: "#8B949E",
                                    padding: "6px 16px",
                                    fontSize: "12px",
                                    fontFamily: "monospace",
                                    whiteSpace: "pre",
                                  }}
                                >
                                  {chunk.header}
                                </div>

                                {rows.map((row, rIdx) => {
                                  const hasAnnot = row.right?.new_line_num !== null &&
                                    fileAnnotations.some(a => a.line_num === row.right?.new_line_num);

                                  return (
                                    <React.Fragment key={rIdx}>
                                      <div
                                        style={{
                                          display: "flex",
                                          whiteSpace: "pre",
                                          minWidth: "max-content",
                                          backgroundColor: row.left?.type === "removed" ? "rgba(239, 68, 68, 0.06)" : "transparent",
                                          borderLeft: row.left?.type === "removed" ? "3px solid #EF4444" : "3px solid transparent",
                                        }}
                                      >
                                        <div
                                          style={{
                                            minWidth: "48px",
                                            padding: "0 12px",
                                            color: "#4B5563",
                                            borderRight: "1px solid #1F2937",
                                            userSelect: "none",
                                            flexShrink: 0,
                                            textAlign: "right",
                                          }}
                                        >
                                          {row.left?.old_line_num || ""}
                                        </div>
                                        <div style={{ flex: 1, padding: "0 16px", whiteSpace: "pre" }}>
                                          {row.left && (
                                            <SyntaxHighlighter
                                              language={getLanguage(file.filename)}
                                              style={atomOneDark}
                                              customStyle={{
                                                margin: 0,
                                                padding: 0,
                                                background: "transparent",
                                                fontSize: "13px",
                                                lineHeight: "20px",
                                              }}
                                            >
                                              {row.left.content}
                                            </SyntaxHighlighter>
                                          )}
                                        </div>
                                      </div>

                                      {/* Spacer to match right column annotation */}
                                      {hasAnnot && (
                                        <div style={{ height: "30px" }} />
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Column (New File) */}
                  <div
                    ref={rightScrollRef}
                    onScroll={handleRightScroll}
                    onMouseEnter={() => (activeScrollRef.current = "right")}
                    style={{
                      flex: 1,
                      minWidth: "50%",
                      overflowY: "auto",
                      overflowX: "auto",
                      backgroundColor: "#0A0A0B",
                    }}
                  >
                    {files.map((file) => {
                      const chunks = file.chunks;
                      const pairedChunks = fileRows[file.filename] || [];

                      return (
                        <div key={file.filename} id={`file-${file.filename.replace(/\//g, "-")}-right`}>
                          {/* Column Header with Annotate button */}
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "8px 16px",
                            background: "#111118",
                            borderBottom: "1px solid #1F2937",
                            borderTop: "1px solid #1F2937",
                            position: "sticky",
                            top: 0,
                            zIndex: 2,
                            gap: "12px"
                          }}>
                            <span style={{
                              fontFamily: "monospace",
                              fontSize: "13px",
                              color: "#EDEDED",
                              flex: 1
                            }}>
                              {file.filename} (Modified)
                            </span>
                            <span style={{ color: "#10B981", fontSize: "12px" }}>
                              +{file.additions}
                            </span>
                            <span style={{ color: "#EF4444", fontSize: "12px" }}>
                              -{file.deletions}
                            </span>
                            <button
                              onClick={() => handleAnnotate(file.filename)}
                              disabled={annotatingFile === file.filename}
                              style={{
                                padding: "4px 12px",
                                background: "transparent",
                                border: "1px solid #F59E0B",
                                color: "#F59E0B",
                                borderRadius: "4px",
                                fontSize: "12px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                opacity: annotatingFile === file.filename ? 0.6 : 1
                              }}
                            >
                              {annotatingFile === file.filename
                                ? "Annotating..."
                                : "✨ Annotate with AI"}
                            </button>
                          </div>

                          {chunks.map((chunk, cIdx) => {
                            const rows = pairedChunks[cIdx] || [];
                            const fileAnnotations = annotations[file.filename] || [];

                            return (
                              <div key={cIdx} style={{
                                fontFamily: "monospace",
                                fontSize: "13px",
                                lineHeight: "20px"
                              }}>
                                <div
                                  style={{
                                    backgroundColor: "#161B22",
                                    color: "#8B949E",
                                    padding: "6px 16px",
                                    fontSize: "12px",
                                    fontFamily: "monospace",
                                    whiteSpace: "pre",
                                  }}
                                >
                                  {chunk.header}
                                </div>

                                {rows.map((row, rIdx) => {
                                  const isAdded = row.right?.type === "added";
                                  const annot = row.right?.new_line_num !== null
                                    ? fileAnnotations.find(a => a.line_num === row.right?.new_line_num)
                                    : null;

                                  return (
                                    <React.Fragment key={rIdx}>
                                      <div
                                        style={{
                                          display: "flex",
                                          whiteSpace: "pre",
                                          minWidth: "max-content",
                                          backgroundColor: isAdded ? "rgba(16, 185, 129, 0.06)" : "transparent",
                                          borderLeft: isAdded ? "3px solid #10B981" : "3px solid transparent",
                                        }}
                                      >
                                        <div
                                          style={{
                                            minWidth: "48px",
                                            padding: "0 12px",
                                            color: "#4B5563",
                                            borderRight: "1px solid #1F2937",
                                            userSelect: "none",
                                            flexShrink: 0,
                                            textAlign: "right",
                                          }}
                                        >
                                          {row.right?.new_line_num || ""}
                                        </div>
                                        <div style={{ flex: 1, padding: "0 16px", whiteSpace: "pre" }}>
                                          {row.right && (
                                            <SyntaxHighlighter
                                              language={getLanguage(file.filename)}
                                              style={atomOneDark}
                                              customStyle={{
                                                margin: 0,
                                                padding: 0,
                                                background: "transparent",
                                                fontSize: "13px",
                                                lineHeight: "20px",
                                              }}
                                            >
                                              {row.right.content}
                                            </SyntaxHighlighter>
                                          )}
                                        </div>
                                      </div>

                                      {/* AI Annotation Badge */}
                                      {annot && (() => {
                                        const styles = getAnnotationStyles(annot.type);
                                        return (
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "flex-start",
                                              padding: "6px 16px 6px 76px",
                                              backgroundColor: styles.bg,
                                              borderLeft: `3px solid ${styles.color}`,
                                              fontSize: "12px",
                                              lineHeight: "18px",
                                              gap: "8px",
                                              animation: "slideDown 0.2s ease-out",
                                            }}
                                          >
                                            <span style={{ flexShrink: 0 }}>{styles.icon}</span>
                                            <span style={{ color: styles.color }}>
                                              <strong style={{ textTransform: "capitalize" }}>{annot.type}:</strong>{" "}
                                              {annot.message}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
