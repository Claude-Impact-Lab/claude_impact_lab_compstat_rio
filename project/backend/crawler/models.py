"""Schemas Pydantic do pipeline de monitoramento.

Um `RawMention` é o item bruto vindo de uma fonte; o NLP o promove a
`Alert` quando consegue extrair os campos mínimos exigidos pelo CompStat.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

SourceKind = Literal["g1_rio", "o_dia"]
MentionKind = Literal["denuncia", "comentario", "noticia"]
CrimeType = Literal[
    "roubo",
    "furto",
    "arrastao",
    "tiroteio",
    "homicidio",
    "agressao",
    "trafico",
    "veicular",
    "outro",
]


class RawMention(BaseModel):
    """Item normalizado vindo de qualquer fonte, antes do NLP."""

    id: str
    source: SourceKind
    url: Optional[str] = None
    author: Optional[str] = None
    text: str
    title: Optional[str] = None
    published_at: Optional[datetime] = None
    fetched_at: datetime = Field(default_factory=datetime.utcnow)


class Alert(BaseModel):
    """Saída estruturada que o frontend consome.

    `score` é o índice de confiança (0–1) — combina presença de localização,
    horário, palavras-chave de crime e estilo de denúncia.
    """

    id: str
    kind: MentionKind
    crime_type: CrimeType
    bairro: Optional[str] = None
    logradouro: Optional[str] = None
    ponto_referencia: Optional[str] = None
    horario: Optional[str] = None
    padrao: Optional[str] = None
    source: SourceKind
    url: Optional[str] = None
    author: Optional[str] = None
    text: str
    published_at: Optional[datetime] = None
    score: float


class LLMUsage(BaseModel):
    """Telemetria do Claude — útil pra validar que o prompt caching está ativo.

    `cache_read_input_tokens > 0` em chamadas subsequentes indica que o
    system prompt está sendo reusado (custa ~0.1× o normal).
    """

    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


class CrawlerRunStats(BaseModel):
    fetched: dict[SourceKind, int]
    errors: dict[SourceKind, str]
    duration_seconds: float
    llm: Optional[LLMUsage] = None


class CrawlerRunResponse(BaseModel):
    run_id: str
    generated_at: datetime
    stats: CrawlerRunStats
    alerts: list[Alert]
