import { FormEvent, useState } from "react";
import { useKnowledgeExtraction } from "../../hooks/useKnowledgeExtraction";

export function KnowledgeWorkbench() {
  const [input, setInput] = useState("");
  const [followUp, setFollowUp] = useState("");
  const {
    submitExtraction,
    extractionJob,
    isSubmitting,
    error,
    runFollowUpQuery,
    followUpResult
  } = useKnowledgeExtraction();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    submitExtraction(input);
  };

  const handleFollowUp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!followUp.trim()) {
      return;
    }
    runFollowUpQuery(followUp);
  };

  return (
    <section className="panel">
      <h2>Knowledge Workbench</h2>
      <p className="status">
        Extract structured knowledge from text, enrich your Lance Graph store, and run follow-up
        queries to validate the new facts.
      </p>
      <form className="input-group" onSubmit={handleSubmit}>
        <label htmlFor="extraction-input">Source Text</label>
        <textarea
          id="extraction-input"
          rows={8}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste notes, meeting summaries, or documents to extract entities and relationships."
        />
        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Extracting..." : "Extract Knowledge"}
        </button>
      </form>
      {error && <p className="status">{error.message}</p>}
      {extractionJob && (
        <div className="panel" style={{ marginTop: "1.5rem", background: "#f8fafc" }}>
          <h3>Extraction Status</h3>
          <p className="status">
            {extractionJob.status.toUpperCase()} — {extractionJob.message ?? "Awaiting results"}
          </p>
          {extractionJob.results && extractionJob.results.length > 0 && (
            <ul>
              {extractionJob.results.map((result) => (
                <li key={result.entity}>
                  <strong>{result.entity}</strong> ({result.type})
                  {result.confidence ? ` — ${(result.confidence * 100).toFixed(1)}%` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <form className="input-group" onSubmit={handleFollowUp} style={{ marginTop: "2rem" }}>
        <label htmlFor="follow-up">Follow-up Graph Query</label>
        <input
          id="follow-up"
          type="text"
          value={followUp}
          onChange={(event) => setFollowUp(event.target.value)}
          placeholder="MATCH (n)-[:MENTIONS]->(m) RETURN n, m LIMIT 5"
        />
        <button className="button secondary" type="submit">
          Run Query
        </button>
      </form>
      {followUpResult && (
        <pre
          style={{
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: "0.75rem",
            padding: "1rem",
            overflowX: "auto"
          }}
        >
          {JSON.stringify(followUpResult, null, 2)}
        </pre>
      )}
    </section>
  );
}
