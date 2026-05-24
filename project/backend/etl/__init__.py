"""ETL CompStat Rio — pacote do backend.

Migrado de `scripts/build_data.py` + `scripts/llm_synthesis.py`. Exposto via
endpoints SSE em `routers/build.py`.

Entrypoint público:
    etl.runner.JobManager — gerencia execução única do pipeline e fan-out
    de eventos de progresso para subscribers SSE.

    etl.build_data.build(emit) — async, executa o pipeline completo emitindo
    eventos via callback. Devolve o payload JSON final em memória.
"""

from .events import (
    DoneEvent,
    ErrorEvent,
    Event,
    LlmEvent,
    LogEvent,
    PhaseEvent,
)
from .runner import JobManager, get_job_manager

__all__ = [
    "DoneEvent",
    "ErrorEvent",
    "Event",
    "JobManager",
    "LlmEvent",
    "LogEvent",
    "PhaseEvent",
    "get_job_manager",
]
