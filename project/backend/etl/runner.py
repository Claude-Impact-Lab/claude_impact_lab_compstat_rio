"""Gerenciamento de execução única do ETL com fan-out de eventos para SSE.

Um único `JobManager` por processo (singleton via `get_job_manager`). Garante
que só rode um job por vez — concorrente vira 409. Mantém:

- `state.status`: idle / running / done / error
- `state.last_payload`: payload final do último run bem-sucedido (servido por
  `GET /api/build/result`).
- buffer de eventos do job em curso (para replay quando o SSE conecta tarde).
- lista de subscribers (filas async) que recebem eventos em tempo real.

Sem persistência em disco — reinicia o processo, perde-se tudo. Suficiente
para uma POC.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Literal

from .build_data import build
from .events import ErrorEvent, Event

log = logging.getLogger(__name__)

JobStatus = Literal["idle", "running", "done", "error"]


@dataclass
class JobState:
    status: JobStatus = "idle"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    last_payload: dict[str, Any] | None = None
    # Buffer de eventos do JOB ATUAL — limpo a cada start. Permite replay
    # para clientes SSE que conectam depois do start.
    event_buffer: list[Event] = field(default_factory=list)


class JobManager:
    """Singleton de execução do ETL CompStat."""

    def __init__(self) -> None:
        self._state = JobState()
        self._task: asyncio.Task | None = None
        self._subscribers: list[asyncio.Queue[Event | None]] = []
        self._lock = asyncio.Lock()

    # -- introspecção ----------------------------------------------------------

    @property
    def status(self) -> JobStatus:
        return self._state.status

    @property
    def last_payload(self) -> dict[str, Any] | None:
        return self._state.last_payload

    def snapshot(self) -> dict[str, Any]:
        """Resumo serializável para `GET /api/build/status`."""
        ev = self._state.event_buffer
        last_phase = next(
            (e.phase for e in reversed(ev) if e.type == "phase"),
            None,
        )
        last_llm = next(
            (e for e in reversed(ev) if e.type == "llm"),
            None,
        )
        return {
            "status": self._state.status,
            "startedAt": self._state.started_at.isoformat() if self._state.started_at else None,
            "finishedAt": self._state.finished_at.isoformat() if self._state.finished_at else None,
            "error": self._state.error,
            "phase": last_phase,
            "calls": last_llm.index if last_llm else 0,
            "totalCalls": last_llm.total if last_llm else 27,
            "areaCurrent": last_llm.area if last_llm else None,
            "sectionCurrent": last_llm.section if last_llm else None,
        }

    # -- start -----------------------------------------------------------------

    async def start(self) -> dict[str, Any]:
        """Dispara um novo job. Returns dict com job_id/started_at, ou levanta RuntimeError."""
        async with self._lock:
            if self._state.status == "running":
                raise RuntimeError("already_running")
            if not os.environ.get("ANTHROPIC_API_KEY"):
                raise RuntimeError("missing_api_key")

            self._state = JobState(
                status="running",
                started_at=datetime.utcnow(),
            )
            self._task = asyncio.create_task(self._run())
            return {
                "status": "started",
                "startedAt": self._state.started_at.isoformat(),
            }

    async def _run(self) -> None:
        try:
            payload = await build(emit=self._emit)
            self._state.last_payload = payload
            self._state.status = "done"
            self._state.finished_at = datetime.utcnow()
        except asyncio.CancelledError:
            self._state.status = "error"
            self._state.error = "cancelled"
            self._state.finished_at = datetime.utcnow()
            await self._emit(ErrorEvent(message="cancelled"))
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("ETL falhou")
            self._state.status = "error"
            self._state.error = f"{type(exc).__name__}: {exc}"
            self._state.finished_at = datetime.utcnow()
            await self._emit(ErrorEvent(message=self._state.error))
        finally:
            # Fecha streams ativos — sentinel `None` faz os subscribers sairem.
            for q in self._subscribers:
                q.put_nowait(None)
            self._subscribers.clear()

    # -- pub/sub ---------------------------------------------------------------

    async def _emit(self, event: Event) -> None:
        self._state.event_buffer.append(event)
        for q in self._subscribers:
            q.put_nowait(event)

    async def subscribe(self) -> AsyncIterator[Event]:
        """Stream de eventos do job atual (ou do último, se já terminou)."""
        # Replay do buffer (eventos perdidos entre o POST /run e o GET /stream).
        for ev in self._state.event_buffer:
            yield ev

        # Se o job já terminou, retorna sem assinar — o cliente fecha o EventSource.
        if self._state.status != "running":
            return

        q: asyncio.Queue[Event | None] = asyncio.Queue()
        self._subscribers.append(q)
        try:
            while True:
                ev = await q.get()
                if ev is None:  # sentinel — job terminou
                    return
                yield ev
        finally:
            if q in self._subscribers:
                self._subscribers.remove(q)


_singleton: JobManager | None = None


def get_job_manager() -> JobManager:
    global _singleton
    if _singleton is None:
        _singleton = JobManager()
    return _singleton
