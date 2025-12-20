import { NavLink, Route, Routes } from "react-router-dom";
import { GraphExplorer } from "./features/graph/GraphExplorer";
import { KnowledgeWorkbench } from "./features/knowledge/KnowledgeWorkbench";
import { Assistant } from "./features/assistant/Assistant";

const routes = [
  { path: "/", label: "Graph Explorer", element: <GraphExplorer /> },
  { path: "/knowledge", label: "Knowledge Workbench", element: <KnowledgeWorkbench /> },
  { path: "/assistant", label: "Graph Assistant", element: <Assistant /> }
];

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Lance Graph Studio</h1>
        <nav>
          {routes.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                ["nav-link", isActive ? "active" : ""].join(" ").trim()
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Routes>
          {routes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
          <Route path="*" element={<GraphExplorer />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
