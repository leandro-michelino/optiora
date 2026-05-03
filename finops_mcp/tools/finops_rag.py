"""Lightweight RAG retrieval for FinOps guidance.

This module retrieves contextual guidance from a curated CSV catalog.
It is deterministic and local-only (no external vector DB dependency).
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional


_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_+/-]{1,}")


@dataclass(frozen=True)
class RagEntry:
    doc_id: str
    analysis_type: str
    provider: str
    topic: str
    keywords: str
    guidance: str
    source: str


def _catalog_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "finops_rag_catalog.csv"


@lru_cache(maxsize=1)
def _load_catalog() -> List[RagEntry]:
    path = _catalog_path()
    if not path.exists():
        return []
    rows: List[RagEntry] = []
    with path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(
                RagEntry(
                    doc_id=str(row.get("id") or "").strip(),
                    analysis_type=str(row.get("analysis_type") or "all").strip().lower() or "all",
                    provider=str(row.get("provider") or "all").strip().lower() or "all",
                    topic=str(row.get("topic") or "").strip(),
                    keywords=str(row.get("keywords") or "").strip().lower(),
                    guidance=str(row.get("guidance") or "").strip(),
                    source=str(row.get("source") or "").strip(),
                )
            )
    return rows


def _flatten_context(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(_flatten_context(v) for v in value.values())
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten_context(v) for v in value)
    return str(value)


def _tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text.lower()))


def _score_entry(
    entry: RagEntry,
    *,
    analysis_type: str,
    cloud_provider: str,
    query_tokens: set[str],
) -> float:
    score = 0.0
    if entry.analysis_type == analysis_type:
        score += 3.0
    elif entry.analysis_type == "all":
        score += 1.5
    else:
        return 0.0

    if entry.provider == cloud_provider:
        score += 2.0
    elif entry.provider == "all" or cloud_provider == "all":
        score += 1.0
    else:
        return 0.0

    keyword_tokens = _tokenize(entry.keywords)
    overlap = query_tokens.intersection(keyword_tokens)
    score += float(len(overlap))
    if entry.topic and any(t in query_tokens for t in _tokenize(entry.topic)):
        score += 1.0
    return score


def retrieve_guidance(
    *,
    analysis_type: str,
    cloud_provider: str = "all",
    context: Optional[Dict[str, Any]] = None,
    top_k: int = 4,
) -> Dict[str, Any]:
    """Retrieve top FinOps guidance snippets for a given analytical context."""
    context = context or {}
    analysis_key = str(analysis_type or "all").strip().lower() or "all"
    provider_key = str(cloud_provider or "all").strip().lower() or "all"
    query_text = " ".join(
        [
            analysis_key.replace("_", " "),
            provider_key,
            _flatten_context(context),
        ]
    )
    query_tokens = _tokenize(query_text)

    scored: List[tuple[float, RagEntry]] = []
    for entry in _load_catalog():
        score = _score_entry(
            entry,
            analysis_type=analysis_key,
            cloud_provider=provider_key,
            query_tokens=query_tokens,
        )
        if score <= 0:
            continue
        scored.append((score, entry))
    scored.sort(key=lambda item: (-item[0], item[1].doc_id))

    top = scored[: max(1, min(top_k, 8))]
    docs = [
        {
            "id": entry.doc_id,
            "topic": entry.topic,
            "provider": entry.provider,
            "guidance": entry.guidance,
            "source": entry.source,
            "score": round(score, 3),
        }
        for score, entry in top
    ]

    rag_brief = "\n".join(
        f"- [{doc['id']}] {doc['guidance']} (source: {doc['source']})" for doc in docs
    )
    return {
        "analysis_type": analysis_key,
        "cloud_provider": provider_key,
        "retrieved_count": len(docs),
        "retrieved_docs": docs,
        "rag_brief": rag_brief,
    }
