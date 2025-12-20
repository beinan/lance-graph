import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Route, Routes } from "react-router-dom";
import { GraphExplorer } from "./features/graph/GraphExplorer";
import { KnowledgeWorkbench } from "./features/knowledge/KnowledgeWorkbench";
import { Assistant } from "./features/assistant/Assistant";
const routes = [
    { path: "/", label: "Graph Explorer", element: _jsx(GraphExplorer, {}) },
    { path: "/knowledge", label: "Knowledge Workbench", element: _jsx(KnowledgeWorkbench, {}) },
    { path: "/assistant", label: "Graph Assistant", element: _jsx(Assistant, {}) }
];
function App() {
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h1", { children: "Lance Graph Studio" }), _jsx("nav", { children: routes.map(({ path, label }) => (_jsx(NavLink, { to: path, end: path === "/", className: ({ isActive }) => ["nav-link", isActive ? "active" : ""].join(" ").trim(), children: label }, path))) })] }), _jsx("main", { className: "content", children: _jsxs(Routes, { children: [routes.map(({ path, element }) => (_jsx(Route, { path: path, element: element }, path))), _jsx(Route, { path: "*", element: _jsx(GraphExplorer, {}) })] }) })] }));
}
export default App;
