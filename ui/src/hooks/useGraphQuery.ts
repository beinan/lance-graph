import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "../services/apiClient";
import type { GraphNode, GraphEdge, GraphQueryResponse } from "../types";

interface ApiGraphResponse {
  nodes: Array<{ id: string; label?: string; properties?: Record<string, unknown> }>;
  edges: Array<{
    source: string;
    target: string;
    label?: string;
    type?: string;
    properties?: Record<string, unknown>;
  }>;
  metadata?: GraphQueryResponse["statistics"];
  raw?: unknown;
}

const transformResponse = (payload: ApiGraphResponse): GraphQueryResponse => {
  const nodes: GraphNode[] = payload.nodes.map((node) => ({
    id: String(node.id),
    label: node.label,
    properties: node.properties
  }));

  const links: GraphEdge[] = payload.edges.map((edge) => ({
    source: String(edge.source),
    target: String(edge.target),
    label: edge.label ?? edge.type,
    type: edge.type,
    properties: edge.properties
  }));

  return {
    nodes,
    links,
    statistics: payload.metadata,
    raw: payload.raw
  };
};

export const useGraphQuery = () => {
  const mutation = useMutation({
    mutationFn: async (query: string) => {
      const payload = await apiClient.post<ApiGraphResponse>("/api/graph/query", { query });
      return transformResponse(payload);
    }
  });

  return useMemo(
    () => ({
      data: mutation.data,
      isPending: mutation.isPending,
      isError: mutation.isError,
      error: mutation.error instanceof Error ? mutation.error : null,
      runQuery: mutation.mutate,
      reset: mutation.reset
    }),
    [mutation]
  );
};
