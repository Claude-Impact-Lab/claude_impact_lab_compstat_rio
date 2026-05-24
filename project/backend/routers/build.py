"""Endpoints /api/build/* — orquestram o ETL CompStat e expõem via SSE.

Substitui o antigo plugin compstatEtlPlugin do Vite que executava
`scripts/build_data.py` por `child_process.spawn`.

Endpoints:
- POST /api/build/run     — inicia o job (202) ou retorna 409 se já roda
- GET  /api/build/stream  — stream SSE com eventos do job (heartbeat 15s)
- GET  /api/build/status  — polling-fallback para clientes sem SSE
- GET  /api/build/result  — payload final em memória (404 se nunca rodou)
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from etl.runner import JobManager, get_job_manager

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/build", tags=["build"])


def _manager() -> JobManager:
    return get_job_manager()


@router.post("/run", status_code=202)
async def run() -> dict:
    """Inicia o ETL. 202 se aceito; 409 se já rodando; 400 sem API key."""
    try:
        return await _manager().start()
    except RuntimeError as exc:
        code = str(exc)
        if code == "already_running":
            raise HTTPException(status_code=409, detail="already_running") from exc
        if code == "missing_api_key":
            raise HTTPException(
                status_code=400,
                detail=(
                    "ANTHROPIC_API_KEY ausente. Defina no .env do backend antes "
                    "de iniciar o uvicorn."
                ),
            ) from exc
        raise HTTPException(status_code=500, detail=code) from exc


@router.get("/status")
async def status() -> dict:
    """Snapshot do estado atual (polling-fallback)."""
    return _manager().snapshot()


@router.get("/result")
async def result() -> dict:
    """Devolve o último payload completo (o `real.json` que o frontend ingere)."""
    payload = _manager().last_payload
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="nenhum ETL concluído ainda nesta sessão do backend",
        )
    return payload


@router.get("/stream")
async def stream() -> EventSourceResponse:
    """Stream SSE de eventos do job atual.

    Cada evento sai formatado como `event: <type>\\ndata: <json>\\n\\n`.
    Tipos: phase / llm / log / done / error. Frontend assina por nome via
    `EventSource.addEventListener('llm', cb)` etc.
    """
    manager = _manager()

    async def _stream() -> AsyncIterator[dict]:
        async for ev in manager.subscribe():
            payload = ev.model_dump()
            payload.pop("type", None)  # já vai no campo `event`
            yield {
                "event": ev.type,
                "data": json.dumps(payload, ensure_ascii=False),
            }

    return EventSourceResponse(_stream(), ping=15)
