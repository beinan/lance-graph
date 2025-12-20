import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useKnowledgeExtraction } from "../../hooks/useKnowledgeExtraction";
export function KnowledgeWorkbench() {
    const [input, setInput] = useState("");
    const [followUp, setFollowUp] = useState("");
    const { submitExtraction, extractionJob, isSubmitting, error, runFollowUpQuery, followUpResult } = useKnowledgeExtraction();
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!input.trim()) {
            return;
        }
        submitExtraction(input);
    };
    const handleFollowUp = (event) => {
        event.preventDefault();
        if (!followUp.trim()) {
            return;
        }
        runFollowUpQuery(followUp);
    };
    return (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Knowledge Workbench" }), _jsx("p", { className: "status", children: "Extract structured knowledge from text, enrich your Lance Graph store, and run follow-up queries to validate the new facts." }), _jsxs("form", { className: "input-group", onSubmit: handleSubmit, children: [_jsx("label", { htmlFor: "extraction-input", children: "Source Text" }), _jsx("textarea", { id: "extraction-input", rows: 8, value: input, onChange: (event) => setInput(event.target.value), placeholder: "Paste notes, meeting summaries, or documents to extract entities and relationships." }), _jsx("button", { className: "button", type: "submit", disabled: isSubmitting, children: isSubmitting ? "Extracting..." : "Extract Knowledge" })] }), error && _jsx("p", { className: "status", children: error.message }), extractionJob && (_jsxs("div", { className: "panel", style: { marginTop: "1.5rem", background: "#f8fafc" }, children: [_jsx("h3", { children: "Extraction Status" }), _jsxs("p", { className: "status", children: [extractionJob.status.toUpperCase(), " \u2014 ", extractionJob.message ?? "Awaiting results"] }), extractionJob.results && extractionJob.results.length > 0 && (_jsx("ul", { children: extractionJob.results.map((result) => (_jsxs("li", { children: [_jsx("strong", { children: result.entity }), " (", result.type, ")", result.confidence ? ` — ${(result.confidence * 100).toFixed(1)}%` : ""] }, result.entity))) }))] })), _jsxs("form", { className: "input-group", onSubmit: handleFollowUp, style: { marginTop: "2rem" }, children: [_jsx("label", { htmlFor: "follow-up", children: "Follow-up Graph Query" }), _jsx("input", { id: "follow-up", type: "text", value: followUp, onChange: (event) => setFollowUp(event.target.value), placeholder: "MATCH (n)-[:MENTIONS]->(m) RETURN n, m LIMIT 5" }), _jsx("button", { className: "button secondary", type: "submit", children: "Run Query" })] }), followUpResult && (_jsx("pre", { style: {
                    background: "#0f172a",
                    color: "#e2e8f0",
                    borderRadius: "0.75rem",
                    padding: "1rem",
                    overflowX: "auto"
                }, children: JSON.stringify(followUpResult, null, 2) }))] }));
}
