# Lance Graph Studio UI

Web interface for exploring, enriching, and conversing with Lance-backed knowledge graphs.  
The application is built with React, TypeScript, Vite, and React Query, and lives alongside the core Rust + Python engine.

## Features

- **Graph Explorer** – run Cypher queries against the Lance Graph engine and visualise nodes/relationships.
- **Knowledge Workbench** – submit unstructured text for extraction workflows, inspect status, and issue follow-up Cypher queries.
- **Graph Assistant** – chat experience that routes questions through Cypher generation and summarises answers.

## Getting Started

```bash
cd ui
npm install    # or pnpm install / yarn install
npm run dev
```

Environment variables (set via `.env` or the shell) control backend targets:

- `VITE_API_BASE_URL` – base URL for the Lance Graph HTTP service (defaults to `http://localhost:8000`).

## Project Structure

```
ui/
├── src/
│   ├── features/
│   │   ├── graph/GraphExplorer.tsx
│   │   ├── knowledge/KnowledgeWorkbench.tsx
│   │   └── assistant/Assistant.tsx
│   ├── hooks/               # React Query hooks for API access
│   ├── services/apiClient.ts
│   ├── types/               # Shared TypeScript types and module declarations
│   ├── App.tsx              # Shell + routing
│   ├── main.tsx             # Entrypoint
│   └── styles.css           # Minimal styling
├── index.html
├── package.json
└── vite.config.ts
```

## Backend Expectations

The UI calls REST endpoints exposed by the Lance Graph service:

- `POST /api/graph/query` – accepts `{ query: string }`, returns graph data (`nodes`, `edges`).
- `POST /api/knowledge/extract` – accepts `{ text: string }`, returns extraction job metadata.
- `POST /api/knowledge/query` – Cypher follow-up for extraction results.
- `POST /api/assistant/chat` – accepts chat history and returns assistant messages.

Adapt `apiClient.ts` if your backend uses different routes or authentication.

## Scripts

- `npm run dev` – start Vite dev server with hot reload.
- `npm run build` – type-check (via `tsc --build`) and produce production assets.
- `npm run preview` – preview build output locally.
- `npm run lint` – run ESLint on `src`.

## Next Steps

- Wire the API routes to the Python FastAPI service (`knowledge_graph.webservice`) or a custom gateway.
- Enhance graph visualisation (tooltips, metadata panes, filters).
- Add websocket/Server-Sent Events for long-running extraction jobs.
- Integrate authentication if exposing the UI publicly.
