"""Modelos de eventos emitidos pelo ETL durante a execução.

São serializados como `event: <type>\\ndata: <json>\\n\\n` no stream SSE. O
frontend assina cada `event` por nome via `EventSource.addEventListener`.
"""

from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel


class PhaseEvent(BaseModel):
    """Mudança de fase do pipeline (load-polygons, load-cameras, …)."""

    type: Literal["phase"] = "phase"
    phase: str


class LlmEvent(BaseModel):
    """Chamada LLM em curso — uma das 27 (9 áreas × 3 seções)."""

    type: Literal["llm"] = "llm"
    section: str        # 'resumo executivo' | 'dinâmica criminal' | 'plano de ação'
    area: str           # nome canônico da área
    index: int          # 1-based: 1..27
    total: int          # total esperado de chamadas LLM


class LogEvent(BaseModel):
    """Linha de log textual (espelha o que o script antigo cuspia em stderr)."""

    type: Literal["log"] = "log"
    line: str


class DoneEvent(BaseModel):
    """Pipeline terminou com sucesso. O payload fica em memória; o front busca via GET /result."""

    type: Literal["done"] = "done"
    duration_seconds: float
    reference_date: str
    area_count: int


class ErrorEvent(BaseModel):
    """Pipeline falhou. `message` é a mensagem curta para a UI."""

    type: Literal["error"] = "error"
    message: str


Event = Union[PhaseEvent, LlmEvent, LogEvent, DoneEvent, ErrorEvent]
