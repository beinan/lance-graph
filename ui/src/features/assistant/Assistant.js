import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useChatAssistant } from "../../hooks/useChatAssistant";
export function Assistant() {
    const [input, setInput] = useState("");
    const { messages, sendMessage, isSending, error } = useChatAssistant();
    const chatRef = useRef(null);
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [messages]);
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!input.trim()) {
            return;
        }
        sendMessage(input);
        setInput("");
    };
    const renderMessage = (message) => (_jsxs("div", { className: `chat-message ${message.role}`, children: [_jsx("div", { children: _jsx("strong", { children: message.role === "user" ? "You" : "Assistant" }) }), _jsx("div", { children: message.content })] }, message.id));
    return (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Graph Assistant" }), _jsx("p", { className: "status", children: "Ask questions about your knowledge graph. The assistant can translate questions into Cypher, execute them, and summarize answers with helpful context." }), _jsxs("div", { className: "chat-container", children: [_jsxs("div", { className: "chat-history", ref: chatRef, children: [messages.map(renderMessage), messages.length === 0 && (_jsx("p", { className: "status", children: "Start a conversation to see responses from the assistant." }))] }), error && _jsx("p", { className: "status", children: error.message }), _jsxs("form", { className: "input-group", onSubmit: handleSubmit, children: [_jsx("label", { htmlFor: "chat-input", children: "Ask a question" }), _jsx("input", { id: "chat-input", type: "text", value: input, onChange: (event) => setInput(event.target.value), placeholder: "Who are the most connected people in the Presto project?" }), _jsx("button", { className: "button", type: "submit", disabled: isSending, children: isSending ? "Thinking..." : "Send" })] })] })] }));
}
