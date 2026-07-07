import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, ArrowUpDown, ChevronRight } from "lucide-react";

interface FileComplexity {
  file_path: string;
  average_complexity: number;
  rating: string;
  chunk_count: number;
}

interface FileDoc {
  file_path: string;
  has_docstrings: boolean;
  doc_ratio: number;
}

interface Metric {
  score: number;
  rating: string;
  average?: number;
  density_percent?: number;
  max_depth?: number;
  avg_depth?: number;
  files?: any[];
}

interface HealthIssue {
  severity: "critical" | "warning" | "info";
  message: string;
}

interface HealthData {
  repo_id: number;
  overall_score: number;
  grade: string;
  metrics: {
    complexity: Metric & { files: FileComplexity[] };
    documentation: Metric & { files: FileDoc[] };
    test_coverage: Metric & { ratio_percent: number; test_files: number; source_files: number; test_file_list: string[] };
    dependency_depth: Metric;
  };
  top_issues: HealthIssue[];
}

interface HealthDashboardProps {
  healthData: HealthData;
  onClose: () => void;
  onRerun: () => void;
  loading: boolean;
}

export default function HealthDashboard({
  healthData,
  onClose,
  onRerun,
  loading
}: HealthDashboardProps) {
  const [mounted, setMounted] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sort State
  const [sortColumn, setSortColumn] = useState<"file_path" | "complexity" | "docs" | "chunks">("complexity");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape key close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Overall Score Counting Animation
  useEffect(() => {
    let start = 0;
    const end = healthData.overall_score;
    if (start === end) return;
    const duration = 1000; // 1 second
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress * (2 - progress); // easeOutQuad
      setAnimatedScore(Math.floor(ease * end));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setAnimatedScore(end);
      }
    };

    requestAnimationFrame(animate);
  }, [healthData.overall_score]);

  // Merge complexity & docs per file
  const mergedFiles = useMemo(() => {
    const compFiles = healthData.metrics.complexity.files || [];
    const docFiles = healthData.metrics.documentation.files || [];
    
    const filesMap: Record<string, any> = {};
    
    compFiles.forEach(f => {
      filesMap[f.file_path] = {
        file_path: f.file_path,
        average_complexity: f.average_complexity,
        complexity_rating: f.rating,
        chunk_count: f.chunk_count,
        has_docstrings: false,
        doc_ratio: 0.0
      };
    });

    docFiles.forEach(f => {
      if (filesMap[f.file_path]) {
        filesMap[f.file_path].has_docstrings = f.has_docstrings;
        filesMap[f.file_path].doc_ratio = f.doc_ratio;
      } else {
        filesMap[f.file_path] = {
          file_path: f.file_path,
          average_complexity: 1.0,
          complexity_rating: "Low",
          chunk_count: 1,
          has_docstrings: f.has_docstrings,
          doc_ratio: f.doc_ratio
        };
      }
    });

    return Object.values(filesMap);
  }, [healthData]);

  // Filter & Sort files
  const processedFiles = useMemo(() => {
    let result = mergedFiles.filter(f =>
      f.file_path.toLowerCase().includes(searchTerm.toLowerCase())
    );

    result.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];

      if (sortColumn === "complexity") {
        valA = a.average_complexity;
        valB = b.average_complexity;
      } else if (sortColumn === "docs") {
        valA = a.doc_ratio;
        valB = b.doc_ratio;
      } else if (sortColumn === "chunks") {
        valA = a.chunk_count;
        valB = b.chunk_count;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [mergedFiles, searchTerm, sortColumn, sortDirection]);

  if (!mounted) return null;

  const scoreColor =
    healthData.overall_score > 75
      ? "#10B981"
      : healthData.overall_score >= 50
      ? "#F59E0B"
      : "#EF4444";

  const ratingColor = (rating: string) => {
    const r = rating.toLowerCase();
    if (r === "good" || r === "low" || r === "shallow") return "#10B981";
    if (r === "fair" || r === "medium" || r === "moderate") return "#F59E0B";
    return "#EF4444";
  };

  const handleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  };

  // SVG Gauge variables
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  // Language badge helper
  const getLanguageBadge = (filePath: string) => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "py":
        return { label: "Python", color: "#3572A5", bg: "rgba(53,114,165,0.15)" };
      case "js":
      case "jsx":
        return { label: "JS", color: "#F1E05A", bg: "rgba(241,224,90,0.15)" };
      case "ts":
      case "tsx":
        return { label: "TS/TSX", color: "#3178C6", bg: "rgba(49,120,198,0.15)" };
      default:
        return { label: ext?.toUpperCase() || "Code", color: "#9CA3AF", bg: "rgba(156,163,175,0.15)" };
    }
  };

  // Find top issue files for left panel cards
  const highCompFiles = mergedFiles
    .filter(f => f.average_complexity >= 6)
    .sort((a, b) => b.average_complexity - a.average_complexity)
    .slice(0, 3);

  const lowDocFiles = mergedFiles
    .filter(f => f.doc_ratio < 0.4 && !f.file_path.split("/").pop()?.toLowerCase().includes("test"))
    .sort((a, b) => a.doc_ratio - b.doc_ratio)
    .slice(0, 3);

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
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif"
      }}
    >
      <div
        style={{
          width: "96vw",
          height: "94vh",
          background: "#0A0A0B",
          border: "1px solid rgba(59,130,246,0.3)",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 80px rgba(0,0,0,0.9)"
        }}
      >
        {/* HEADER */}
        <div
          style={{
            height: "72px",
            minHeight: "72px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            background: "#111118",
            borderBottom: "1px solid rgba(59,130,246,0.2)",
            gap: "20px"
          }}
        >
          <span style={{ color: "#EDEDED", fontWeight: 700, fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            🏥 Codebase Health Dashboard
          </span>
          
          <div style={{ flex: 1 }} />

          {/* Mini gauge inside header */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ position: "relative", width: "50px", height: "50px", display: "flex", alignItems: "center", justifyItems: "center" }}>
              <svg width="50" height="50" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#1F2937" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke={scoreColor}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
                />
              </svg>
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: scoreColor,
                fontWeight: 700,
                fontSize: "13px"
              }}>
                {animatedScore}
              </div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#EDEDED" }}>Overall Score</span>
              <span style={{ fontSize: "11px", color: scoreColor, fontWeight: 700 }}>Grade {healthData.grade}</span>
            </div>
          </div>

          <button
            onClick={onRerun}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid rgba(59,130,246,0.4)",
              color: "#3B82F6",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : "🔄"}
            <span>Rerun Analysis</span>
          </button>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#9CA3AF",
              borderRadius: "6px",
              width: "36px",
              height: "36px",
              cursor: "pointer",
              fontSize: "22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            ×
          </button>
        </div>

        {/* BODY PANEL */}
        <div
          style={{
            display: "flex",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            padding: "24px",
            gap: "24px"
          }}
        >
          {/* LEFT COLUMN - Metric Cards */}
          <div
            style={{
              width: "420px",
              minWidth: "420px",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              paddingRight: "8px"
            }}
          >
            {/* 1. Complexity */}
            <div
              style={{
                background: "#0D0D0F",
                border: "1px solid rgba(59,130,246,0.1)",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#EDEDED", display: "flex", alignItems: "center", gap: "6px" }}>
                  🔄 Complexity
                </span>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: ratingColor(healthData.metrics.complexity.rating) + "22",
                  color: ratingColor(healthData.metrics.complexity.rating)
                }}>
                  {healthData.metrics.complexity.rating}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "28px", fontWeight: 700, color: ratingColor(healthData.metrics.complexity.rating) }}>
                  {healthData.metrics.complexity.score}
                </span>
                <span style={{ fontSize: "11px", color: "#6B7280" }}>/ 100</span>
              </div>
              <div style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "12px" }}>
                Average complexity per chunk: <strong>{healthData.metrics.complexity.average}</strong>
              </div>

              {/* Progress bar */}
              <div style={{ height: "4px", background: "#1F2937", borderRadius: "2px", overflow: "hidden", marginBottom: "12px" }}>
                <div style={{ height: "100%", width: `${healthData.metrics.complexity.score}%`, background: ratingColor(healthData.metrics.complexity.rating) }} />
              </div>

              {/* High complexity files */}
              {highCompFiles.length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: "#EF4444", fontWeight: 600, marginBottom: "6px" }}>Needs Attention:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {highCompFiles.map(f => (
                      <div key={f.file_path} style={{ display: "flex", justifyContent: "space-between", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: "4px", padding: "4px 8px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#EF4444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "260px" }} title={f.file_path}>
                          {f.file_path}
                        </span>
                        <span style={{ fontSize: "11px", color: "#EF4444", fontFamily: "monospace", fontWeight: 600 }}>
                          Avg: {f.average_complexity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Documentation */}
            <div
              style={{
                background: "#0D0D0F",
                border: "1px solid rgba(59,130,246,0.1)",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#EDEDED", display: "flex", alignItems: "center", gap: "6px" }}>
                  📝 Documentation
                </span>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: ratingColor(healthData.metrics.documentation.rating) + "22",
                  color: ratingColor(healthData.metrics.documentation.rating)
                }}>
                  {healthData.metrics.documentation.rating}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "28px", fontWeight: 700, color: ratingColor(healthData.metrics.documentation.rating) }}>
                  {healthData.metrics.documentation.score}
                </span>
                <span style={{ fontSize: "11px", color: "#6B7280" }}>/ 100</span>
              </div>
              <div style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "12px" }}>
                Documentation density: <strong>{healthData.metrics.documentation.density_percent}%</strong>
              </div>

              {/* Progress bar */}
              <div style={{ height: "4px", background: "#1F2937", borderRadius: "2px", overflow: "hidden", marginBottom: "12px" }}>
                <div style={{ height: "100%", width: `${healthData.metrics.documentation.score}%`, background: ratingColor(healthData.metrics.documentation.rating) }} />
              </div>

              {/* Undocumented files */}
              {lowDocFiles.length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: "#F59E0B", fontWeight: 600, marginBottom: "6px" }}>Low Documentation:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {lowDocFiles.map(f => (
                      <div key={f.file_path} style={{ display: "flex", justifyContent: "space-between", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)", borderRadius: "4px", padding: "4px 8px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#F59E0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "260px" }} title={f.file_path}>
                          {f.file_path}
                        </span>
                        <span style={{ fontSize: "11px", color: "#F59E0B", fontFamily: "monospace", fontWeight: 600 }}>
                          {int(f.doc_ratio * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Test Coverage */}
            <div
              style={{
                background: "#0D0D0F",
                border: "1px solid rgba(59,130,246,0.1)",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#EDEDED", display: "flex", alignItems: "center", gap: "6px" }}>
                  🧪 Test Coverage Signal
                </span>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: ratingColor(healthData.metrics.test_coverage.rating) + "22",
                  color: ratingColor(healthData.metrics.test_coverage.rating)
                }}>
                  {healthData.metrics.test_coverage.rating}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "28px", fontWeight: 700, color: ratingColor(healthData.metrics.test_coverage.rating) }}>
                  {healthData.metrics.test_coverage.score}
                </span>
                <span style={{ fontSize: "11px", color: "#6B7280" }}>/ 100</span>
              </div>
              <div style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "12px" }}>
                Ratio: <strong>{healthData.metrics.test_coverage.ratio_percent}%</strong> ({healthData.metrics.test_coverage.test_files} test files / {healthData.metrics.test_coverage.source_files} source files)
              </div>

              {/* Progress bar */}
              <div style={{ height: "4px", background: "#1F2937", borderRadius: "2px", overflow: "hidden", marginBottom: "12px" }}>
                <div style={{ height: "100%", width: `${healthData.metrics.test_coverage.score}%`, background: ratingColor(healthData.metrics.test_coverage.rating) }} />
              </div>

              {/* Test file list chips */}
              {healthData.metrics.test_coverage.test_files > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 600, marginBottom: "6px" }}>Test Files Found:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {healthData.metrics.test_coverage.test_file_list.slice(0, 3).map(f => (
                      <span key={f} style={{ fontFamily: "monospace", fontSize: "10px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "4px", padding: "2px 6px", color: "#8EACFC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }} title={f}>
                        {f.split("/").pop()}
                      </span>
                    ))}
                    {healthData.metrics.test_coverage.test_file_list.length > 3 && (
                      <span style={{ fontSize: "10px", color: "#6B7280", alignSelf: "center", paddingLeft: "4px" }}>
                        +{healthData.metrics.test_coverage.test_file_list.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Dependency Depth */}
            <div
              style={{
                background: "#0D0D0F",
                border: "1px solid rgba(59,130,246,0.1)",
                borderRadius: "8px",
                padding: "16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#EDEDED", display: "flex", alignItems: "center", gap: "6px" }}>
                  🕸️ Dependency Depth
                </span>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: ratingColor(healthData.metrics.dependency_depth.rating) + "22",
                  color: ratingColor(healthData.metrics.dependency_depth.rating)
                }}>
                  {healthData.metrics.dependency_depth.rating}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "28px", fontWeight: 700, color: ratingColor(healthData.metrics.dependency_depth.rating) }}>
                  {healthData.metrics.dependency_depth.score}
                </span>
                <span style={{ fontSize: "11px", color: "#6B7280" }}>/ 100</span>
              </div>
              <div style={{ fontSize: "12px", color: "#9CA3AF" }}>
                Max import chain: <strong>{healthData.metrics.dependency_depth.max_depth}</strong> files
              </div>
              <div style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "12px" }}>
                Average import depth: <strong>{healthData.metrics.dependency_depth.avg_depth}</strong> files
              </div>

              {/* Progress bar */}
              <div style={{ height: "4px", background: "#1F2937", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${healthData.metrics.dependency_depth.score}%`, background: ratingColor(healthData.metrics.dependency_depth.rating) }} />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - File breakdown table */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              background: "#0D0D0F",
              border: "1px solid rgba(59,130,246,0.1)",
              borderRadius: "8px",
              padding: "20px"
            }}
          >
            {/* Search Input */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexShrink: 0 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#4B5563"
                  }}
                />
                <input
                  type="text"
                  placeholder="Search file breakdowns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    background: "#070709",
                    border: "1px solid #1F2937",
                    borderRadius: "6px",
                    color: "#EDEDED",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Table Area */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#111118", borderBottom: "1px solid #1F2937", position: "sticky", top: 0, zIndex: 10 }}>
                    <th onClick={() => handleSort("file_path")} style={{ padding: "12px 16px", color: "#9CA3AF", cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        File Path <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th onClick={() => handleSort("complexity")} style={{ padding: "12px 16px", color: "#9CA3AF", cursor: "pointer", fontWeight: 600, userSelect: "none", textAlign: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                        Complexity <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th onClick={() => handleSort("docs")} style={{ padding: "12px 16px", color: "#9CA3AF", cursor: "pointer", fontWeight: 600, userSelect: "none", textAlign: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                        Docs <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th style={{ padding: "12px 16px", color: "#9CA3AF", fontWeight: 600 }}>Language</th>
                    <th onClick={() => handleSort("chunks")} style={{ padding: "12px 16px", color: "#9CA3AF", cursor: "pointer", fontWeight: 600, userSelect: "none", textAlign: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                        Chunks <ArrowUpDown size={12} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {processedFiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "40px 0", textAlign: "center", color: "#6B7280" }}>
                        No files match the search term.
                      </td>
                    </tr>
                  ) : (
                    processedFiles.map((file) => {
                      const lang = getLanguageBadge(file.file_path);
                      return (
                        <tr key={file.file_path} style={{ borderBottom: "1px solid #1F2937", transition: "background 0.15s" }}>
                          <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "12px", color: "#EDEDED", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "340px" }} title={file.file_path}>
                            {file.file_path}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "center" }}>
                            <span style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: ratingColor(file.complexity_rating) + "18",
                              color: ratingColor(file.complexity_rating)
                            }}>
                              {file.average_complexity.toFixed(1)} ({file.complexity_rating})
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "center", fontFamily: "monospace", color: file.doc_ratio >= 0.8 ? "#10B981" : file.doc_ratio >= 0.4 ? "#F59E0B" : "#EF4444" }}>
                            {Math.round(file.doc_ratio * 100)}%
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: lang.bg,
                              color: lang.color,
                              border: `1px solid ${lang.color}33`
                            }}>
                              {lang.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "center", fontFamily: "monospace", color: "#9CA3AF" }}>
                            {file.chunk_count}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* TOP ISSUES FOOTER SECTION */}
        {healthData.top_issues && healthData.top_issues.length > 0 && (
          <div
            style={{
              height: "130px",
              minHeight: "130px",
              flexShrink: 0,
              background: "#0D0D0F",
              borderTop: "1px solid rgba(59,130,246,0.15)",
              padding: "16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}
          >
            <div style={{ fontSize: "12px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Top Codebase Health Issues
            </div>
            
            <div
              style={{
                display: "flex",
                gap: "12px",
                overflowX: "auto",
                paddingBottom: "4px"
              }}
              className="no-scrollbar"
            >
              {healthData.top_issues.map((issue, idx) => {
                const isCrit = issue.severity === "critical";
                const isWarn = issue.severity === "warning";
                
                const borderColor = isCrit ? "#EF4444" : isWarn ? "#F59E0B" : "#3B82F6";
                const bgColor = isCrit ? "rgba(239,68,68,0.04)" : isWarn ? "rgba(245,158,11,0.04)" : "rgba(59,130,246,0.04)";
                const icon = isCrit ? "🚨" : isWarn ? "⚠️" : "ℹ️";
                
                return (
                  <div
                    key={idx}
                    style={{
                      flexShrink: 0,
                      width: "360px",
                      background: bgColor,
                      border: `1px solid ${borderColor}55`,
                      borderRadius: "6px",
                      padding: "10px 14px",
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-start"
                    }}
                  >
                    <span style={{ fontSize: "16px", flexShrink: 0 }}>{icon}</span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: borderColor, textTransform: "uppercase" }}>
                        {issue.severity}
                      </span>
                      <span style={{ fontSize: "12px", color: "#EDEDED", lineHeight: "16px", marginTop: "2px" }}>
                        {issue.message}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>,
    document.body
  );
}

// Inline helper for converting float to int for display purposes
function int(val: number): number {
  return Math.floor(val);
}
