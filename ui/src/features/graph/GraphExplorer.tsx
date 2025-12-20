import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useGraphQuery } from "../../hooks/useGraphQuery";
import type { GraphEdge, GraphNode } from "../../types";

const DEFAULT_QUERY = "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 25";

interface ForceNode {
  id: string;
  name: string;
  x?: number;
  y?: number;
}

interface ForceLink {
  source: string;
  target: string;
  label?: string;
}

export function GraphExplorer() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const { data, isPending, isError, error, runQuery, reset } = useGraphQuery();
  type GraphInstance = {
    zoomToFit: (duration?: number, padding?: number) => void;
    d3Force?: (forceName: string) => any;
    d3ReheatSimulation?: () => void;
  };
  const graphRef = useRef<GraphInstance | null>(null);

  const graphData = useMemo(() => {
    if (!data) {
      return { nodes: [] as GraphNode[], links: [] as GraphEdge[] };
    }
    return data;
  }, [data]);

  const forceData = useMemo(() => {
    const resolveName = (node: GraphNode) => {
      const properties = node.properties ?? {};
      if (typeof properties.name === "string" && properties.name.trim()) {
        return properties.name;
      }
      if (node.label && node.label.trim()) {
        return node.label;
      }
      if (typeof properties.label === "string" && properties.label.trim()) {
        return properties.label;
      }
      return node.id;
    };

    const nodes: ForceNode[] = graphData.nodes.map((node) => ({
      id: node.id,
      name: resolveName(node)
    }));

    const links: ForceLink[] = graphData.links.map((edge) => ({
      source: edge.source,
      target: edge.target,
      label: edge.label ?? edge.type ?? ""
    }));

    return { nodes, links };
  }, [graphData]);

  useEffect(() => {
    const instance = graphRef.current;
    if (!instance || forceData.nodes.length === 0) {
      return;
    }

    const linkForce = instance.d3Force?.("link");
    if (linkForce && typeof linkForce.distance === "function") {
      linkForce.distance(140);
    }

    const chargeForce = instance.d3Force?.("charge");
    if (chargeForce && typeof chargeForce.strength === "function") {
      chargeForce.strength(-220);
    }

    instance.d3ReheatSimulation?.();
    const timeout = window.setTimeout(() => {
      instance.zoomToFit(300, 60);
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [forceData.nodes.length, forceData.links.length]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHighlightNodeId(null);
    runQuery(query);
  };

  const handleReset = () => {
    setQuery(DEFAULT_QUERY);
    setHighlightNodeId(null);
    reset();
    const instance = graphRef.current;
    if (instance) {
      instance.zoomToFit(300, 60);
    }
  };

  const drawNode = useCallback(
    (nodeObject: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObject as ForceNode;
      if (typeof node.x !== "number" || typeof node.y !== "number") {
        return;
      }
      const isHighlighted = highlightNodeId === node.id;
      const radius = isHighlighted ? 7 : 5;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isHighlighted ? "#f97316" : "#38bdf8";
      ctx.fill();

      const fontSize = Math.max(8, 12 / globalScale);
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "#0f172a";
      ctx.fillText(node.name, node.x + radius + 4, node.y + fontSize / 2);
    },
    [highlightNodeId]
  );

  const drawNodePointerArea = useCallback(
    (nodeObject: unknown, color: string, ctx: CanvasRenderingContext2D) => {
      const node = nodeObject as ForceNode;
      if (typeof node.x !== "number" || typeof node.y !== "number") {
        return;
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const handleNodeClick = useCallback(
    (node: unknown) => {
      const candidate = node as { id?: unknown };
      if (!candidate?.id) {
        return;
      }
      setHighlightNodeId((prev) => {
        const nodeId = String(candidate.id);
        return prev === nodeId ? null : nodeId;
      });
    },
    []
  );

  return (
    <section className="panel">
      <h2>Graph Explorer</h2>
      <form className="input-group" onSubmit={handleSubmit}>
        <label htmlFor="cypher-query">Cypher Query</label>
        <textarea
          id="cypher-query"
          rows={3}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="MATCH (p:Person)-[r:KNOWS]->(f) RETURN p, r, f LIMIT 25"
        />
        <div className="actions">
          <button className="button" type="submit" disabled={isPending}>
            {isPending ? "Running..." : "Run Query"}
          </button>
          <button className="button secondary" type="button" onClick={handleReset}>
            Reset
          </button>
        </div>
      </form>
      {isError && <p className="status">{error?.message ?? "Query failed."}</p>}
      {!data && !isPending && (
        <p className="status">
          Run a Cypher query to load nodes and relationships from your Lance Graph backend.
        </p>
      )}
      <div style={{ height: 520, borderRadius: "1rem", overflow: "hidden", background: "#ffffff" }}>
        <ForceGraph2D
          ref={(instance) => {
            graphRef.current = instance ?? null;
          }}
          graphData={forceData}
          nodeId="id"
          enableNodeDrag={false}
          linkDirectionalArrowLength={5}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={0}
          linkLabel={(link) => (link as ForceLink).label ?? ""}
          linkColor={() => "#94a3b8"}
          backgroundColor="#ffffff"
          onNodeClick={handleNodeClick}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={drawNodePointerArea}
          minZoom={0.3}
          maxZoom={6}
        />
      </div>
    </section>
  );
}
