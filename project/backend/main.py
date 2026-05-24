"""Entrypoint FastAPI do CompStat Rio.

Roda com: `uvicorn main:app --reload --port 8000`
(do diretório `project/backend`, com .venv ativo).

Endpoints:
  GET  /health              — sanidade.
  POST /api/crawler/run     — executa o pipeline de monitor web (G1, O Dia).
  POST /api/build/run       — dispara o ETL CompStat (uma execução por vez).
  GET  /api/build/stream    — stream SSE com progresso do ETL.
  GET  /api/build/status    — snapshot textual do estado (polling-fallback).
  GET  /api/build/result    — payload final do último ETL bem-sucedido.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Carrega .env antes de importar módulos que leem env (twitter, anthropic).
load_dotenv()

from crawler.models import CrawlerRunResponse  # noqa: E402
from crawler.pipeline import run as run_pipeline  # noqa: E402
from routers.build import router as build_router  # noqa: E402


def _allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="CompStat Rio — Crawler", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(build_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/crawler/run", response_model=CrawlerRunResponse)
async def crawler_run() -> CrawlerRunResponse:
    try:
        return await run_pipeline()
    except RuntimeError as exc:
        # Credenciais ausentes / configuração — vira 400 pra UI tratar.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"crawler failed: {exc}") from exc
