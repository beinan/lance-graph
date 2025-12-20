import { nanoid } from "nanoid";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiClient } from "../services/apiClient";
import type { ChatMessage, ExecutedQuery, QueryPlanStep } from "../types";

interface ChatRequest {
  messages: Array<Pick<ChatMessage, "role" | "content">>;
}

interface ChatResponse {
  messages: ChatMessage[];
  query_plan?: QueryPlanStep[];
  executed_queries?: ExecutedQuery[];
}

export const useChatAssistant = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [queryPlan, setQueryPlan] = useState<QueryPlanStep[]>([]);
  const [executedQueries, setExecutedQueries] = useState<ExecutedQuery[]>([]);

  const mutation = useMutation({
    mutationFn: async (payload: ChatRequest) => {
      return apiClient.post<ChatResponse>("/api/assistant/chat", payload);
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, ...data.messages]);
      setQueryPlan(data.query_plan ?? []);
      setExecutedQueries(data.executed_queries ?? []);
    }
  });

  const sendMessage = useCallback(
    (content: string) => {
      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, userMessage]);
      setQueryPlan([]);
      setExecutedQueries([]);
      mutation.mutate({
        messages: [...messages.map(({ role, content: value }) => ({ role, content: value })), { role: "user", content }]
      });
    },
    [messages, mutation]
  );

  return {
    messages,
    sendMessage,
    isSending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error : null,
    queryPlan,
    executedQueries
  };
};
