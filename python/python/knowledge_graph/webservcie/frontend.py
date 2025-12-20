"""FastAPI router that exposes endpoints expected by the frontend UI."""

from __future__ import annotations

import hashlib
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from uuid import uuid4

import pyarrow as pa
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import extraction as kg_extraction
from ..component import KnowledgeGraphComponent
from ..config import KnowledgeGraphConfig
from ..extractors.base import ExtractedEntity, ExtractedRelationship
from ..llm import qa as llm_qa
from ..llm.llm_utils import load_llm_options


audit_logger = logging.getLogger("knowledge_graph.audit")


class GraphQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)


class GraphNodeModel(BaseModel):
    id: str
    label: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphEdgeModel(BaseModel):
    source: str
    target: str
    label: Optional[str] = None
    type: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphQueryMetadata(BaseModel):
    result_count: int
    elapsed_ms: Optional[float] = None


class GraphQueryResponseModel(BaseModel):
    nodes: List[GraphNodeModel]
    edges: List[GraphEdgeModel]
    metadata: Optional[GraphQueryMetadata] = None
    raw: Optional[List[Dict[str, Any]]] = None


class ExtractionResultModel(BaseModel):
    entity: str
    type: str
    confidence: Optional[float] = None
    context: Optional[str] = None


class ExtractionJobModel(BaseModel):
    id: str
    status: str
    message: Optional[str] = None
    results: List[ExtractionResultModel] = Field(default_factory=list)


class ExtractionRequest(BaseModel):
    text: str = Field(..., min_length=1)
    strategy: Optional[str] = None


class ExtractionResponse(BaseModel):
    job: ExtractionJobModel


class ChatMessageIn(BaseModel):
    role: str
    content: str


class ChatMessageOut(ChatMessageIn):
    id: str
    timestamp: int


class ChatRequest(BaseModel):
    messages: List[ChatMessageIn]


class ChatResponse(BaseModel):
    messages: List[ChatMessageOut]
    query_plan: List[Dict[str, Any]] = Field(default_factory=list)
    executed_queries: List[Dict[str, Any]] = Field(default_factory=list)


_NODE_ID_KEYS = ("entity_id", "id", "node_id", "vertex_id")
_EDGE_SOURCE_KEYS = (
    "source_entity_id",
    "source_id",
    "source",
    "src",
    "from",
)
_EDGE_TARGET_KEYS = (
    "target_entity_id",
    "target_id",
    "target",
    "dst",
    "to",
)


def create_frontend_router(component: KnowledgeGraphComponent) -> APIRouter:
    config = component.get_config()
    router = APIRouter(prefix="/api", tags=["frontend"])

    def _service():
        return component.get_service()

    @router.post("/graph/query", response_model=GraphQueryResponseModel)
    def run_graph_query(payload: GraphQueryRequest) -> GraphQueryResponseModel:  # noqa: D401 - FastAPI handler
        try:
            table = _service().query(payload.query)
        except Exception as exc:  # pragma: no cover - surfaced to client
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        rows = table.to_pylist() if hasattr(table, "to_pylist") else []
        nodes, edges = _rows_to_graph(rows)
        metadata = GraphQueryMetadata(result_count=len(rows))
        return GraphQueryResponseModel(
            nodes=[GraphNodeModel(**node) for node in nodes.values()],
            edges=[GraphEdgeModel(**edge) for edge in edges],
            metadata=metadata,
            raw=rows,
        )

    @router.post("/knowledge/query", response_model=GraphQueryResponseModel)
    def run_follow_up_query(payload: GraphQueryRequest) -> GraphQueryResponseModel:
        return run_graph_query(payload)

    @router.post("/knowledge/extract", response_model=ExtractionResponse)
    def extract_knowledge(payload: ExtractionRequest) -> ExtractionResponse:
        strategy = (payload.strategy or kg_extraction.DEFAULT_STRATEGY).lower()
        job_id = str(uuid4())

        llm_model = os.getenv("KNOWLEDGE_GRAPH_LLM_MODEL", "gpt-4o-mini")
        llm_temperature = float(os.getenv("KNOWLEDGE_GRAPH_LLM_TEMPERATURE", "0.2"))
        client_options = _load_llm_options(config)

        try:
            extractor = _resolve_extractor(
                strategy,
                llm_model=llm_model,
                llm_temperature=llm_temperature,
                client_options=client_options,
            )
        except Exception as exc:  # pragma: no cover - surfaced to client
            job = ExtractionJobModel(id=job_id, status="failed", message=str(exc))
            return ExtractionResponse(job=job)

        try:
            result = kg_extraction.preview_extraction(payload.text, extractor=extractor)
        except Exception as exc:  # pragma: no cover - surfaced to client
            job = ExtractionJobModel(id=job_id, status="failed", message=str(exc))
            return ExtractionResponse(job=job)

        service = _service()
        entity_rows, relationship_rows = _persist_extraction(service, result.entities, result.relationships)
        results = _format_extraction_results(result.entities, result.relationships)
        inserted_entities = len(entity_rows)
        inserted_relationships = len(relationship_rows)
        message_parts = []
        if inserted_entities:
            message_parts.append(f"upserted {inserted_entities} entities")
        if inserted_relationships:
            message_parts.append(f"upserted {inserted_relationships} relationships")
        message = ", ".join(message_parts) if message_parts else "extraction completed"
        job = ExtractionJobModel(id=job_id, status="succeeded", message=message, results=results)
        return ExtractionResponse(job=job)

    @router.post("/assistant/chat", response_model=ChatResponse)
    def assistant_chat(payload: ChatRequest) -> ChatResponse:
        last_user = _latest_user_message(payload.messages)
        if not last_user:
            return ChatResponse(messages=[])

        assistant_id = str(uuid4())
        timestamp_ms = int(time.time() * 1000)

        config_path = _resolve_llm_config_path(config)
        metadata: Dict[str, Any] = {"query_plan": [], "executed_queries": []}
        try:
            result = llm_qa.ask_question(
                last_user.content,
                _service(),
                llm_model=os.getenv("KNOWLEDGE_GRAPH_LLM_MODEL", "gpt-4o-mini"),
                llm_temperature=float(os.getenv("KNOWLEDGE_GRAPH_LLM_TEMPERATURE", "0.2")),
                llm_config_path=config_path,
                embedding_model=os.getenv("KNOWLEDGE_GRAPH_EMBEDDING_MODEL"),
                return_metadata=True,
            )
            if isinstance(result, tuple):
                answer, metadata = result
            else:
                answer = str(result).strip()
            audit_logger.info(
                "Assistant answer generated",
                extra={
                    "lance_graph": {
                        "question": last_user.content,
                        "query_plan": metadata.get("query_plan", []),
                        "executed_queries": metadata.get("executed_queries", []),
                    }
                },
            )
        except Exception as exc:  # pragma: no cover - depends on runtime credentials
            answer = (
                "Unable to complete the request automatically. "
                "Configure LLM access or submit a Cypher query directly. "
                f"Details: {exc}"
            )
            metadata = {"query_plan": [], "executed_queries": []}

        message = ChatMessageOut(id=assistant_id, role="assistant", content=answer, timestamp=timestamp_ms)
        return ChatResponse(messages=[message], query_plan=metadata.get("query_plan", []), executed_queries=metadata.get("executed_queries", []))

    return router


def _resolve_extractor(
    strategy: str,
    *,
    llm_model: str,
    llm_temperature: float,
    client_options: dict,
) -> kg_extraction.BaseExtractor:
    return kg_extraction.get_extractor(
        strategy,
        llm_model=llm_model,
        llm_temperature=llm_temperature,
        llm_options=client_options,
    )


def _persist_extraction(
    service,
    entities: Iterable[ExtractedEntity],
    relationships: Iterable[ExtractedRelationship],
) -> Tuple[List[dict[str, Any]], List[dict[str, Any]]]:
    entity_rows, name_to_id = _prepare_entity_rows(list(entities))
    relationship_rows = _prepare_relationship_rows(list(relationships), name_to_id)

    if entity_rows:
        table = pa.Table.from_pylist(entity_rows)
        service.upsert_table("Entity", table, merge=True)
    if relationship_rows:
        rel_table = pa.Table.from_pylist(relationship_rows)
        service.upsert_table("RELATIONSHIP", rel_table, merge=True)
    return entity_rows, relationship_rows


def _prepare_entity_rows(
    entities: List[ExtractedEntity],
) -> Tuple[List[dict[str, Any]], Dict[str, str]]:
    rows: List[dict[str, Any]] = []
    name_to_id: Dict[str, str] = {}
    for entity in entities:
        name = entity.name.strip()
        if not name:
            continue
        entity_type = (entity.entity_type or "UNKNOWN").strip() or "UNKNOWN"
        base = f"{name}|{entity_type}".encode("utf-8")
        entity_id = hashlib.md5(base).hexdigest()
        row = {
            "entity_id": entity_id,
            "name": name,
            "name_lower": name.lower(),
            "entity_type": entity_type,
            "context": entity.context,
            "confidence": entity.confidence,
        }
        rows.append(row)
        name_to_id.setdefault(name.lower(), entity_id)
    return rows, name_to_id


def _prepare_relationship_rows(
    relationships: List[ExtractedRelationship],
    name_to_id: Dict[str, str],
) -> List[dict[str, Any]]:
    rows: List[dict[str, Any]] = []
    for relation in relationships:
        source_name = relation.source.strip()
        target_name = relation.target.strip()
        if not (source_name and target_name):
            continue
        source_id = name_to_id.get(source_name.lower())
        target_id = name_to_id.get(target_name.lower())
        if not (source_id and target_id):
            continue
        row = {
            "source_entity_id": source_id,
            "target_entity_id": target_id,
            "source_entity_name": source_name,
            "target_entity_name": target_name,
            "relationship_type": (relation.relationship_type or "RELATED_TO").strip()
            or "RELATED_TO",
            "description": relation.description,
            "confidence": relation.confidence,
        }
        rows.append(row)
    return rows


def _format_extraction_results(
    entities: Iterable[ExtractedEntity],
    relationships: Iterable[ExtractedRelationship],
) -> List[ExtractionResultModel]:
    results: List[ExtractionResultModel] = []
    for entity in entities:
        results.append(
            ExtractionResultModel(
                entity=entity.name,
                type=entity.entity_type,
                confidence=entity.confidence,
                context=entity.context or None,
            )
        )
    for relation in relationships:
        display = f"{relation.source} -> {relation.target}"
        results.append(
            ExtractionResultModel(
                entity=display,
                type=relation.relationship_type,
                confidence=relation.confidence,
                context=relation.description or None,
            )
        )
    return results


def _latest_user_message(messages: Iterable[ChatMessageIn]) -> Optional[ChatMessageIn]:
    for message in reversed(list(messages)):
        if message.role == "user" and message.content.strip():
            return message
    return None


def _resolve_llm_config_path(config: KnowledgeGraphConfig) -> Optional[Path]:
    env_value = os.getenv("KNOWLEDGE_GRAPH_LLM_CONFIG")
    if env_value:
        env_path = Path(env_value)
        if env_path.exists():
            return env_path
        raise HTTPException(status_code=500, detail=f"LLM config path not found: {env_path}")

    candidate = config.storage_path / "llm_config.yaml"
    if candidate.exists():
        return candidate

    package_default = Path(__file__).resolve().parents[3] / "llm_config.yaml"
    if package_default.exists():
        return package_default
    return None


def _load_llm_options(config: KnowledgeGraphConfig) -> dict:
    config_path = _resolve_llm_config_path(config)
    if config_path is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "LLM configuration file not found. Set KNOWLEDGE_GRAPH_LLM_CONFIG or "
                "place llm_config.yaml alongside the knowledge graph data."
            ),
        )
    try:
        return load_llm_options(config_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive logging
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _rows_to_graph(rows: Iterable[Dict[str, Any]]) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    nodes: Dict[str, Dict[str, Any]] = {}
    edges: List[Dict[str, Any]] = []
    seen_edges: set[Tuple[str, str, Optional[str], Optional[str]]] = set()

    for row in rows:
        _collect_graph_items(row, nodes, edges, seen_edges)
        groups = _group_prefixed_fields(row)

        alias_node_ids: Dict[str, str] = {}
        for alias, data in groups.items():
            node = _node_from_mapping(data, alias)
            if node:
                _merge_node(nodes, node)
                alias_node_ids[alias] = node["id"]
            _collect_graph_items(data, nodes, edges, seen_edges, label_hint=alias)

        edge_count_before = len(edges)
        rel_alias = None
        for candidate in ("rel", "relationship"):
            if candidate in groups:
                rel_alias = candidate
                candidate_edge = _edge_from_mapping(groups[candidate], nodes, candidate)
                if candidate_edge:
                    _add_edge(edges, seen_edges, candidate_edge)
                break

        if len(edges) != edge_count_before:
            continue

        fallback_pairs: List[Tuple[str, str]] = []
        if "src" in alias_node_ids and "dst" in alias_node_ids:
            fallback_pairs.append(("src", "dst"))
        if "n" in alias_node_ids and "m" in alias_node_ids:
            fallback_pairs.append(("n", "m"))
        if not fallback_pairs and len(alias_node_ids) >= 2:
            sorted_aliases = sorted(alias_node_ids.keys())
            source_alias, target_alias = sorted_aliases[:2]
            fallback_pairs.append((source_alias, target_alias))

        if not fallback_pairs:
            continue

        rel_payload = groups.get(rel_alias) if rel_alias else None
        rel_label = None
        if isinstance(rel_payload, dict):
            label_value = rel_payload.get("relationship_type") or rel_payload.get("type")
            if isinstance(label_value, str) and label_value.strip():
                rel_label = label_value.strip()

        for source_alias, target_alias in fallback_pairs:
            source_id = alias_node_ids.get(source_alias)
            target_id = alias_node_ids.get(target_alias)
            if not (source_id and target_id):
                continue

            properties: Dict[str, Any] = {}
            source_group = groups.get(source_alias, {})
            target_group = groups.get(target_alias, {})
            if isinstance(source_group, dict):
                name_value = source_group.get("name") or source_group.get("entity_name")
                if name_value is not None:
                    properties.setdefault("source_name", name_value)
            if isinstance(target_group, dict):
                name_value = target_group.get("name") or target_group.get("entity_name")
                if name_value is not None:
                    properties.setdefault("target_name", name_value)

            edge = {
                "source": source_id,
                "target": target_id,
                "label": rel_label,
                "type": rel_label,
                "properties": properties,
            }
            _add_edge(edges, seen_edges, edge)
    return nodes, edges


def _collect_graph_items(
    value: Any,
    nodes: Dict[str, Dict[str, Any]],
    edges: List[Dict[str, Any]],
    seen_edges: set[Tuple[str, str, Optional[str], Optional[str]]],
    *,
    label_hint: Optional[str] = None,
) -> None:
    if isinstance(value, list):
        for item in value:
            _collect_graph_items(item, nodes, edges, seen_edges, label_hint=label_hint)
        return
    if isinstance(value, dict):
        edge = _edge_from_mapping(value, nodes, label_hint)
        if edge:
            _add_edge(edges, seen_edges, edge)
            # Continue traversing nested payload in case it contains additional nodes
            for nested in value.values():
                if isinstance(nested, (dict, list)):
                    _collect_graph_items(nested, nodes, edges, seen_edges, label_hint=label_hint)
            return

        node = _node_from_mapping(value, label_hint)
        if node and label_hint:
            _merge_node(nodes, node)
        for nested in value.values():
            if isinstance(nested, (dict, list)):
                _collect_graph_items(nested, nodes, edges, seen_edges, label_hint=label_hint)


def _group_prefixed_fields(row: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    groups: Dict[str, Dict[str, Any]] = {}
    for key, value in row.items():
        alias, field = _split_alias(key)
        if not alias:
            continue
        group = groups.setdefault(alias, {})
        group[field] = value
    return groups


def _split_alias(key: str) -> Tuple[Optional[str], str]:
    if "." in key:
        alias, field = key.split(".", 1)
        return alias, field
    if "__" in key:
        alias, field = key.split("__", 1)
        return alias, field
    return None, key


def _node_from_mapping(payload: Dict[str, Any], label_hint: Optional[str]) -> Optional[Dict[str, Any]]:
    node_id = _extract_node_id(payload)
    if not node_id:
        for candidate in ("name", "name_lower", "label"):
            value = payload.get(candidate)
            if isinstance(value, str) and value.strip():
                node_id = value.strip()
                break
    if not node_id and label_hint:
        candidate = payload.get(f"{label_hint}_entity_name") or payload.get(f"{label_hint}_name")
        if isinstance(candidate, str) and candidate.strip():
            node_id = candidate.strip()
    if not node_id:
        return None

    label = _extract_node_label(payload, label_hint)
    properties = _extract_node_properties(payload, node_id)
    return {
        "id": node_id,
        "label": label,
        "properties": properties,
    }


def _extract_node_id(payload: Dict[str, Any]) -> Optional[str]:
    for key in _NODE_ID_KEYS:
        value = payload.get(key)
        if value is not None:
            return str(value)
    for key, value in payload.items():
        if key.endswith("_id") and not key.startswith("source") and not key.startswith("target"):
            if value is not None:
                return str(value)
    return None


def _extract_node_label(payload: Dict[str, Any], label_hint: Optional[str]) -> Optional[str]:
    label = payload.get("label")
    if isinstance(label, str) and label.strip():
        return label
    labels = payload.get("labels")
    if isinstance(labels, list) and labels:
        for entry in labels:
            if isinstance(entry, str) and entry.strip():
                return entry
    return label_hint


def _extract_node_properties(payload: Dict[str, Any], node_id: str) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}
    direct_props = payload.get("properties")
    if isinstance(direct_props, dict):
        properties.update(direct_props)
    for key, value in payload.items():
        if key in {"label", "labels", "properties"}:
            continue
        if key in _NODE_ID_KEYS:
            continue
        if key.endswith("_id") and str(value) == node_id:
            continue
        if isinstance(value, (dict, list)):
            continue
        properties.setdefault(key, value)
    return properties


def _merge_node(nodes: Dict[str, Dict[str, Any]], node: Dict[str, Any]) -> None:
    existing = nodes.get(node["id"])
    if not existing:
        nodes[node["id"]] = node
        return
    if not existing.get("label") and node.get("label"):
        existing["label"] = node["label"]
    existing_props = existing.setdefault("properties", {})
    for key, value in node.get("properties", {}).items():
        existing_props.setdefault(key, value)


def _edge_from_mapping(
    payload: Dict[str, Any],
    nodes: Dict[str, Dict[str, Any]],
    label_hint: Optional[str],
) -> Optional[Dict[str, Any]]:
    source_id, source_node = _resolve_endpoint_data(
        payload,
        nodes,
        _EDGE_SOURCE_KEYS,
        label_hint or "source",
    )
    target_id, target_node = _resolve_endpoint_data(
        payload,
        nodes,
        _EDGE_TARGET_KEYS,
        label_hint or "target",
    )
    if not (source_id and target_id):
        return None

    if source_node:
        _merge_node(nodes, source_node)
    if target_node:
        _merge_node(nodes, target_node)

    edge_type = payload.get("relationship_type") or payload.get("type")
    label = payload.get("label") or edge_type or label_hint
    properties: Dict[str, Any] = {}
    for key, value in payload.items():
        if key in _EDGE_SOURCE_KEYS or key in _EDGE_TARGET_KEYS:
            continue
        if key in {"relationship_type", "type", "label"}:
            continue
        if isinstance(value, (dict, list)):
            continue
        properties.setdefault(key, value)
    return {
        "source": source_id,
        "target": target_id,
        "label": label,
        "type": edge_type,
        "properties": properties,
    }


def _resolve_endpoint_data(
    payload: Dict[str, Any],
    nodes: Dict[str, Dict[str, Any]],
    keys: Tuple[str, ...],
    label_hint: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    for key in keys:
        if key not in payload:
            continue
        value = payload[key]
        if isinstance(value, dict):
            node = _node_from_mapping(value, label_hint)
            if node:
                return node["id"], node
        elif value is not None:
            node_id = str(value)
            node = _build_endpoint_node(payload, key, node_id, label_hint)
            if node:
                return node_id, node
            return node_id, None
    return None, None


def _build_endpoint_node(
    payload: Dict[str, Any], key: str, node_id: str, label_hint: str
) -> Optional[Dict[str, Any]]:
    prefix = _normalize_prefix(key)
    if not prefix:
        return {
            "id": node_id,
            "label": label_hint or node_id,
            "properties": {},
        }

    label = _extract_endpoint_label(payload, prefix) or label_hint or node_id
    properties = _extract_endpoint_properties(payload, prefix, node_id)
    return {
        "id": node_id,
        "label": label,
        "properties": properties,
    }


def _normalize_prefix(key: str) -> Optional[str]:
    if "_" in key:
        prefix = key.split("_", 1)[0]
    else:
        prefix = key
    prefix = prefix.lower()
    if prefix in {"source", "target"}:
        return prefix
    if prefix in {"src", "dst"}:
        return "source" if prefix == "src" else "target"
    return None


def _extract_endpoint_label(payload: Dict[str, Any], prefix: str) -> Optional[str]:
    candidates = [
        f"{prefix}_entity_name",
        f"{prefix}_name",
        prefix,
    ]
    for key in candidates:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _extract_endpoint_properties(
    payload: Dict[str, Any], prefix: str, node_id: str
) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}
    type_keys = (
        f"{prefix}_entity_type",
        f"{prefix}_type",
        f"{prefix}_category",
    )
    for key in type_keys:
        if key in payload and payload[key] is not None:
            properties.setdefault("entity_type", payload[key])
            break

    id_keys = (
        f"{prefix}_entity_id",
        f"{prefix}_id",
    )
    for key in id_keys:
        if key in payload and payload[key] is not None:
            properties.setdefault("entity_id", payload[key])
            break

    name_key = f"{prefix}_entity_name"
    if payload.get(name_key) is not None:
        properties.setdefault("name", payload[name_key])

    for suffix in ("confidence", "description", "context"):
        candidate = f"{prefix}_{suffix}"
        if candidate in payload and payload[candidate] is not None:
            properties.setdefault(suffix, payload[candidate])

    if not properties:
        properties["id"] = node_id
    return properties


def _add_edge(
    edges: List[Dict[str, Any]],
    seen_edges: set[Tuple[str, str, Optional[str], Optional[str]]],
    edge: Dict[str, Any],
) -> None:
    key = (edge["source"], edge["target"], edge.get("label"), edge.get("type"))
    if key in seen_edges:
        return
    seen_edges.add(key)
    edges.append(edge)
