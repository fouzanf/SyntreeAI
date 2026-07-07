export interface Citation {
  id: number;
  file_path: string;
  start_line: number;
  end_line: number;
}

export interface IngestResponse {
  repo_id: number;
  status: string;
  chunk_count: number;
}

export type QueryStreamEvent =
  | { type: "citation"; data: Citation[] }
  | { type: "token"; data: string }
  | { type: "done" };

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

/**
 * Sends a POST request to /ingest to index a GitHub repository.
 */
export async function ingestRepo(githubUrl: string): Promise<IngestResponse> {
  const response = await fetch(`${BACKEND_URL}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ github_url: githubUrl }),
  });

  if (!response.ok) {
    let errorDetail = "Failed to ingest repository";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore JSON parse error if response is not JSON
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Sends a POST request to /query and yields SSE stream events.
 */
export async function* streamQuery(
  repoId: number,
  question: string,
  messages?: { role: string; content: string }[]
): AsyncGenerator<QueryStreamEvent, void, unknown> {
  const response = await fetch(`${BACKEND_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo_id: repoId, question, messages }),
  });

  if (!response.ok) {
    let errorDetail = "Failed to query repository";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body stream available.");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      // Save the last incomplete line to process in the next chunk
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("data: ")) {
          const dataContent = trimmed.slice(6).trim();

          if (dataContent === "[DONE]") {
            yield { type: "done" };
            return;
          }

          try {
            const parsed = JSON.parse(dataContent);
            
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            
            if (parsed.citations) {
              yield { type: "citation", data: parsed.citations };
            } else if (parsed.token !== undefined) {
              yield { type: "token", data: parsed.token };
            }
          } catch (e) {
            // Re-throw parsed or streaming errors to trigger failure UI state
            if (e instanceof Error) {
              throw e;
            }
            throw new Error("Error parsing SSE data stream.");
          }
        }
      }
    }
    
    // Process any remaining text in the buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const dataContent = trimmed.slice(6).trim();
        if (dataContent === "[DONE]") {
          yield { type: "done" };
          return;
        }
        try {
          const parsed = JSON.parse(dataContent);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.citations) {
            yield { type: "citation", data: parsed.citations };
          } else if (parsed.token !== undefined) {
            yield { type: "token", data: parsed.token };
          }
        } catch {
          // Ignore trailing parsing errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Sends a POST request to /review-pr to analyze a Pull Request and streams response events.
 */
export async function* reviewPR(
  prUrl: string,
  question: string = "Is this PR safe to merge?",
  messages?: { role: string; content: string }[]
): AsyncGenerator<
  | { type: "repo_id"; data: number }
  | { type: "citation"; data: Citation[] }
  | { type: "token"; data: string }
  | { type: "done" },
  void,
  unknown
> {
  const response = await fetch(`${BACKEND_URL}/review-pr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pr_url: prUrl, question, messages }),
  });

  if (!response.ok) {
    let errorDetail = "Failed to review pull request";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body stream available.");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
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
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(dataContent);
          
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          
          if (parsed.repo_id !== undefined) {
            yield { type: "repo_id", data: parsed.repo_id };
          }
          if (parsed.citations) {
            yield { type: "citation", data: parsed.citations };
          } else if (parsed.token !== undefined) {
            yield { type: "token", data: parsed.token };
          }
        } catch (e) {
          if (e instanceof Error) {
            throw e;
          }
          throw new Error("Error parsing SSE data stream.");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetches the parsed PR diff for a given repository.
 */
export async function getPRDiff(repoId: number): Promise<{ pr_url: string; files: any[] }> {
  const response = await fetch(`${BACKEND_URL}/diff/${repoId}`);
  if (!response.ok) {
    let errorDetail = "Failed to fetch PR diff";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.error || errorJson.detail || errorDetail;
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

/**
 * Requests AI annotations for a specific file's diff.
 */
export async function annotateDiff(repoId: number, filename: string): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/annotate-diff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo_id: repoId, filename }),
  });
  if (!response.ok) {
    let errorDetail = "Failed to annotate diff";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.error || errorJson.detail || errorDetail;
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

/**
 * Triggers computing of health metrics for a repository.
 */
export async function runHealthCheck(repoId: number): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/health/${repoId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    let errorDetail = "Failed to run health check";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Fetches the cached health report for a repository.
 */
export async function getHealthReport(repoId: number): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/health/${repoId}`);
  if (!response.ok) {
    let errorDetail = "Failed to fetch health report";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore
    }
    throw new Error(errorDetail);
  }
  return response.json();
}
