export type NodeProperties = Record<string, unknown>;

export interface GraphNode {
  id: string;
  label?: string;
  properties?: NodeProperties;
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GraphQueryResponse {
  nodes: GraphNode[];
  links: GraphEdge[];
  statistics?: {
    resultCount?: number;
    elapsedMs?: number;
  };
  raw?: unknown;
}

export interface ExtractionJob {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  message?: string;
  results?: Array<{ entity: string; type: string; confidence?: number }>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface QueryPlanStep {
  cypher?: string;
  description?: string;
}

export interface ExecutedQuery {
  cypher?: string;
  description?: string;
  rows?: unknown;
  truncated?: boolean;
  error?: string;
}
