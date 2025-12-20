import { FormEvent, useEffect, useRef, useState } from "react";
import { useChatAssistant } from "../../hooks/useChatAssistant";
import type { ChatMessage } from "../../types";

export function Assistant() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isSending, error, queryPlan, executedQueries } = useChatAssistant();
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    sendMessage(input);
    setInput("");
  };

  const renderMessage = (message: ChatMessage) => (
    <div key={message.id} className={`chat-message ${message.role}`}>
      <div>
        <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
      </div>
      <div>{message.content}</div>
    </div>
  );

  return (
    <section className="panel">
      <h2>Graph Assistant</h2>
      <p className="status">
        Ask questions about your knowledge graph. The assistant can translate questions into Cypher,
        execute them, and summarize answers with helpful context.
      </p>
      <div className="chat-container">
        <div className="chat-history" ref={chatRef}>
          {messages.map(renderMessage)}
          {messages.length === 0 && (
            <p className="status">Start a conversation to see responses from the assistant.</p>
          )}
        </div>
        {error && <p className="status">{error.message}</p>}
        <form className="input-group" onSubmit={handleSubmit}>
          <label htmlFor="chat-input">Ask a question</label>
          <input
            id="chat-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Who are the most connected people in the Presto project?"
          />
          <button className="button" type="submit" disabled={isSending}>
            {isSending ? "Thinking..." : "Send"}
          </button>
        </form>
      </div>
      {(queryPlan.length > 0 || executedQueries.length > 0) && (
        <div className="panel" style={{ marginTop: "1.5rem", background: "#f8fafc" }}>
          <h3>Generated Cypher Plan</h3>
          {queryPlan.length === 0 && <p className="status">No plan produced for the last answer.</p>}
          {queryPlan.length > 0 && (
            <ol style={{ paddingLeft: "1.5rem" }}>
              {queryPlan.map((step, index) => (
                <li key={`${step.cypher ?? index}-${index}`} style={{ marginBottom: "0.75rem" }}>
                  {step.description && <div style={{ fontWeight: 600 }}>{step.description}</div>}
                  {step.cypher && (
                    <pre
                      style={{
                        background: "#0f172a",
                        color: "#e2e8f0",
                        borderRadius: "0.5rem",
                        padding: "0.75rem",
                        overflowX: "auto",
                        marginTop: step.description ? "0.25rem" : 0
                      }}
                    >
                      {step.cypher}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
          {executedQueries.length > 0 && (
            <details style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer" }}>Execution Summary</summary>
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.75rem" }}>
                {executedQueries.map((entry, index) => (
                  <div key={`${entry.cypher ?? index}-${index}`} style={{ background: "#fff", borderRadius: "0.5rem", padding: "0.75rem" }}>
                    {entry.description && <div style={{ fontWeight: 600 }}>{entry.description}</div>}
                    {entry.cypher && (
                      <pre
                        style={{
                          background: "#0f172a",
                          color: "#e2e8f0",
                          borderRadius: "0.5rem",
                          padding: "0.5rem",
                          overflowX: "auto",
                          marginTop: "0.5rem"
                        }}
                      >
                        {entry.cypher}
                      </pre>
                    )}
                    {Array.isArray(entry.rows) && entry.rows.length > 0 && (
                      <pre
                        style={{
                          background: "#0f172a",
                          color: "#e2e8f0",
                          borderRadius: "0.5rem",
                          padding: "0.5rem",
                          overflowX: "auto",
                          marginTop: "0.5rem"
                        }}
                      >
                        {JSON.stringify(entry.rows, null, 2)}
                      </pre>
                    )}
                    {entry.error && <p className="status">{entry.error}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
