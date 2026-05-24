"""Caminhos canônicos para os dados do CompStat Rio.

Centralizar aqui evita drift entre `build_data.py`, `llm_synthesis.py` e
qualquer outro consumidor. Todos resolvidos a partir do repo root, três níveis
acima deste arquivo (`project/backend/etl/paths.py` → repo root).
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DADOS = ROOT / "dados"
RELINTS = DADOS / "relints"
SHAPES = DADOS / "sh_area_forca"

# Arquivos individuais (filenames têm gotchas — espaços, acentos)
OCORRENCIAS_CSV = DADOS / "df_ocorrencias_tratado - Extração 1 .csv"
DISQUE_CSV = DADOS / "disk_denuncia.csv"
FATORES_CSV = DADOS / "fatores_urbanos.csv"
CAMERAS_CSV = DADOS / "cameras_areas_fm.csv"
SHAPEFILE = SHAPES / "areas_forca_municipal.shp"
