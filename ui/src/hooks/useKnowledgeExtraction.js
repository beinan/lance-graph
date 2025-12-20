import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { apiClient } from "../services/apiClient";
export const useKnowledgeExtraction = () => {
    const [followUpResult, setFollowUpResult] = useState(null);
    const extractionMutation = useMutation({
        mutationFn: async (text) => {
            return apiClient.post("/api/knowledge/extract", { text });
        }
    });
    const followUpMutation = useMutation({
        mutationFn: async (query) => {
            const response = await apiClient.post("/api/knowledge/query", { query });
            return response;
        },
        onSuccess: (data) => {
            setFollowUpResult(data);
        }
    });
    const submitExtraction = useCallback((text) => {
        setFollowUpResult(null);
        extractionMutation.mutate(text);
    }, [extractionMutation]);
    const runFollowUpQuery = useCallback((query) => {
        followUpMutation.mutate(query);
    }, [followUpMutation]);
    return useMemo(() => ({
        submitExtraction,
        extractionJob: extractionMutation.data?.job,
        isSubmitting: extractionMutation.isPending,
        error: (extractionMutation.error ?? followUpMutation.error),
        runFollowUpQuery,
        followUpResult
    }), [
        submitExtraction,
        extractionMutation.data?.job,
        extractionMutation.isPending,
        extractionMutation.error,
        followUpMutation.error,
        runFollowUpQuery,
        followUpResult
    ]);
};
