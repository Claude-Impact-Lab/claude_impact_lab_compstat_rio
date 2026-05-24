"""Orquestração — coleta as fontes em paralelo, manda tudo pro Claude, agrega.

A coleta (RSS + scrape) roda em paralelo via `asyncio.gather`. Em seguida,
**uma única** chamada ao Claude (`llm.analyze_batch`) classifica todas as
menções de uma vez — caching do system prompt amortiza o custo entre
chamadas. Sem cache local: cada clique do botão refaz tudo.
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid
from datetime import datetime

from .llm import analyze_batch
from .models import (
    Alert,
    CrawlerRunResponse,
    CrawlerRunStats,
    LLMUsage,
    RawMention,
    SourceKind,
)
from .sources.rss import fetch_g1_rio, fetch_o_dia


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


async def _safe(source: SourceKind, coro) -> tuple[SourceKind, list[RawMention], str]:
    """Encapsula uma fonte: nunca propaga exception, devolve (source, mentions, err)."""
    try:
        mentions = await coro
        return source, mentions, ""
    except Exception as exc:  # noqa: BLE001 — borda do mundo externo
        return source, [], f"{type(exc).__name__}: {exc}"


async def run() -> CrawlerRunResponse:
    started = time.perf_counter()
    max_rss = _env_int("MAX_RSS_ITEMS", 30)
    max_age = _env_int("MAX_AGE_HOURS", 72)

    results = await asyncio.gather(
        _safe("g1_rio", fetch_g1_rio(max_rss, max_age)),
        _safe("o_dia", fetch_o_dia(max_rss, max_age)),
    )

    fetched: dict[SourceKind, int] = {}
    errors: dict[SourceKind, str] = {}
    all_mentions: list[RawMention] = []
    for source, mentions, err in results:
        fetched[source] = len(mentions)
        if err:
            errors[source] = err
        all_mentions.extend(mentions)

    # Dedup por (source, id) — uma menção pode aparecer em múltiplos feeds.
    seen: set[tuple[SourceKind, str]] = set()
    deduped: list[RawMention] = []
    for m in all_mentions:
        key = (m.source, m.id)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(m)

    # Chamada única ao LLM. Erros sobem — main.py converte em 503.
    alerts, usage = await analyze_batch(deduped)

    # Ordena: score desc, depois publicação mais recente primeiro.
    alerts.sort(
        key=lambda a: (a.score, a.published_at or datetime.min),
        reverse=True,
    )

    duration = round(time.perf_counter() - started, 3)
    return CrawlerRunResponse(
        run_id=f"run-{uuid.uuid4().hex[:8]}",
        generated_at=datetime.utcnow(),
        stats=CrawlerRunStats(
            fetched=fetched,
            errors=errors,
            duration_seconds=duration,
            llm=LLMUsage(**usage) if usage else None,
        ),
        alerts=alerts,
    )
