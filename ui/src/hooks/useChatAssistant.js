import { nanoid } from "nanoid";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiClient } from "../services/apiClient";
export const useChatAssistant = () => {
    const [messages, setMessages] = useState([]);
    const mutation = useMutation({
        mutationFn: async (payload) => {
            return apiClient.post("/api/assistant/chat", payload);
        },
        onSuccess: (data) => {
            setMessages((prev) => [...prev, ...data.messages]);
        }
    });
    const sendMessage = useCallback((content) => {
        const userMessage = {
            id: nanoid(),
            role: "user",
            content,
            timestamp: Date.now()
        };
        setMessages((prev) => [...prev, userMessage]);
        mutation.mutate({
            messages: [...messages.map(({ role, content: value }) => ({ role, content: value })), { role: "user", content }]
        });
    }, [messages, mutation]);
    return {
        messages,
        sendMessage,
        isSending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error : null
    };
};
