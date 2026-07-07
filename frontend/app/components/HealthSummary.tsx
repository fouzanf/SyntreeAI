import React from "react";

interface Metric {
  score: number;
  rating: string;
}

interface HealthData {
  overall_score: number;
  grade: string;
  metrics: {
    complexity: Metric;
    documentation: Metric;
    test_coverage: Metric;
    dependency_depth: Metric;
    [key: string]: Metric;
  };
}

interface HealthSummaryProps {
  healthData: HealthData;
  onOpenDashboard: () => void;
  onRunAnalysis: () => void;
  loading: boolean;
}

export default function HealthSummary({
  healthData,
  onOpenDashboard,
  onRunAnalysis,
  loading
}: HealthSummaryProps) {
  const overallScore = healthData.overall_score;
  const grade = healthData.grade;
  const metrics = healthData.metrics;

  // Green > 75, Amber 50-75, Red < 50
  const scoreColor =
    overallScore > 75
      ? "#10B981"
      : overallScore >= 50
      ? "#F59E0B"
      : "#EF4444";

  const metricLabel: Record<string, string> = {
    complexity: "Complexity",
    documentation: "Documentation",
    test_coverage: "Test Coverage",
    dependency_depth: "Dependency Depth"
  };

  const ratingColor = (rating: string) => {
    const r = rating.toLowerCase();
    if (r === "good" || r === "low" || r === "shallow") return "#10B981"; // positive
    if (r === "fair" || r === "medium" || r === "moderate") return "#F59E0B"; // warning
    return "#EF4444"; // danger / poor / high / deep
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid rgba(59,130,246,0.15)",
        background: "rgba(13,13,15,0.4)"
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px"
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: "#9CA3AF",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 600
          }}
        >
          Codebase Health
        </span>
        <button
          onClick={onOpenDashboard}
          style={{
            fontSize: "11px",
            color: "#3B82F6",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontWeight: 500
          }}
        >
          View Details →
        </button>
      </div>

      {/* Overall score - big number */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          marginBottom: "12px"
        }}
      >
        <div
          style={{
            fontSize: "36px",
            fontWeight: 700,
            color: scoreColor,
            lineHeight: 1
          }}
        >
          {overallScore}
        </div>
        <div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: scoreColor,
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            Grade {grade}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#6B7280"
            }}
          >
            Overall Health
          </div>
        </div>
      </div>

      {/* 4 mini metric bars */}
      {["complexity", "documentation", "test_coverage", "dependency_depth"].map(
        (key) => {
          const metric = metrics[key];
          if (!metric) return null;
          return (
            <div key={key} style={{ marginBottom: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "3px"
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    color: "#9CA3AF"
                  }}
                >
                  {metricLabel[key]}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: ratingColor(metric.rating)
                  }}
                >
                  {metric.rating}
                </span>
              </div>
              <div
                style={{
                  height: "4px",
                  background: "#1F2937",
                  borderRadius: "2px",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${metric.score}%`,
                    background: ratingColor(metric.rating),
                    borderRadius: "2px",
                    transition: "width 1s ease-out"
                  }}
                />
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}
