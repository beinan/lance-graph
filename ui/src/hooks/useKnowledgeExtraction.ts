import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { apiClient } from "../services/apiClient";
import type { ExtractionJob, GraphQueryResponse } from "../types";

interface ExtractionResponse {
  job: ExtractionJob;
}

export const useKnowledgeExtraction = () => {
  const [followUpResult, setFollowUpResult] = useState<GraphQueryResponse | null>(null);

  const extractionMutation = useMutation({
    mutationFn: async (text: string) => {
      return apiClient.post<ExtractionResponse>("/api/knowledge/extract", { text });
    }
  });

  const followUpMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiClient.post<GraphQueryResponse>("/api/knowledge/query", { query });
      return response;
    },
    onSuccess: (data) => {
      setFollowUpResult(data);
    }
  });

  const submitExtraction = useCallback(
    (text: string) => {
      setFollowUpResult(null);
      extractionMutation.mutate(text);
    },
    [extractionMutation]
  );

  const runFollowUpQuery = useCallback(
    (query: string) => {
      followUpMutation.mutate(query);
    },
    [followUpMutation]
  );

  return useMemo(
    () => ({
      submitExtraction,
      extractionJob: extractionMutation.data?.job,
      isSubmitting: extractionMutation.isPending,
      error: (extractionMutation.error ?? followUpMutation.error) as Error | null,
      runFollowUpQuery,
      followUpResult
    }),
    [
      submitExtraction,
      extractionMutation.data?.job,
      extractionMutation.isPending,
      extractionMutation.error,
      followUpMutation.error,
      runFollowUpQuery,
      followUpResult
    ]
  );
};
