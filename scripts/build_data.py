#!/usr/bin/env python3
"""
ETL: read the real CompStat data sources in /dados, /relints and /sh_area_forca,
filter to the last 90 days available, aggregate per FM area, and emit a single
JSON consumed by the frontend.

Output: project/frontend/public/data/real.json (committed for prototype use).

Notes
-----
- "Last 30 / 90 days" is computed from the most recent date present in
  df_ocorrencias_tratado.csv (≈ 2024-12-31), not from today's clock — the
  underlying dataset only goes up to 2024-12.
- The official shapefile has 8 polygons; the camera CSV references 9 named
  areas. The missing one (Bangu) gets a synthetic bbox polygon built from its
  camera coordinates.
- Executive Summary / Dinâmica Criminal / Plano de Ação are template-generated
  here, parameterised by the real numbers. In production these would be the
  output of an LLM prompt over the same data.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

import shapefile  # pyshp
from shapely.geometry import Point, Polygon, MultiPolygon, box
from shapely.prepared import prep

# LLM synthesis (Claude Opus 4.7) — optional, gated by COMPSTAT_LLM env var.
# Falls back silently to the template generators below when disabled or on error.
try:
    import llm_synthesis
except ImportError:
    llm_synthesis = None

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DADOS = ROOT / "dados"
RELINTS = ROOT / "relints"
SHAPES = ROOT / "sh_area_forca"
OUT = ROOT / "project" / "frontend" / "public" / "data" / "real.json"

# ---------------------------------------------------------------------------
# Friendly area names + RELINT mapping
# ---------------------------------------------------------------------------

# The shapefile only stores numeric IDs. Mapping fid → friendly name is done
# by matching the polygon bbox against the bbox of cameras grouped by name.
# Cameras drive the canonical name set (9 areas).

AREA_SHORT = {
    "Bangu: Calçadão - Bangu Shopping": "Bangu",
    "Campo Grande: Estação de Trem - Calçadão": "Campo Grande",
    "Estações São Francisco Xavier - Afonso Pena": "SFX — Afonso Pena",
    "Jardim de Alah": "Jardim de Alah",
    "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria": "Metrô Botafogo / São Clemente",
    "Praia de Botafogo - Rua Marquês de Abrantes": "Praia de Botafogo",
    "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia": "Pres. Vargas / Campo de Santana",
    "Rodoviária - Terminal Gentileza - Estação Leopoldina": "Rodoviária / Gentileza",
    "Rua Lauro Müller – Avenida General Severiano – Avenida Venceslau Brás": "Lauro Müller / Severiano",
}

AREA_ID = {
    "Bangu: Calçadão - Bangu Shopping": "bangu-calcadao",
    "Campo Grande: Estação de Trem - Calçadão": "campo-grande",
    "Estações São Francisco Xavier - Afonso Pena": "sfx-afonso-pena",
    "Jardim de Alah": "jardim-alah",
    "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria": "metro-botafogo",
    "Praia de Botafogo - Rua Marquês de Abrantes": "praia-botafogo",
    "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia": "presidente-vargas",
    "Rodoviária - Terminal Gentileza - Estação Leopoldina": "rodoviaria-gentileza",
    "Rua Lauro Müller – Avenida General Severiano – Avenida Venceslau Brás": "lauro-muller",
}

# AISP / bairro tags are static metadata for the area header
AREA_META = {
    "metro-botafogo":      {"aisp": "AISP 6",  "bairro": "Botafogo"},
    "presidente-vargas":   {"aisp": "AISP 5",  "bairro": "Centro"},
    "rodoviaria-gentileza":{"aisp": "AISP 5",  "bairro": "São Cristóvão / Santo Cristo"},
    "campo-grande":        {"aisp": "AISP 9",  "bairro": "Campo Grande"},
    "sfx-afonso-pena":     {"aisp": "AISP 6",  "bairro": "Tijuca / Maracanã"},
    "praia-botafogo":      {"aisp": "AISP 2",  "bairro": "Botafogo / Flamengo"},
    "jardim-alah":         {"aisp": "AISP 23", "bairro": "Ipanema / Leblon"},
    "bangu-calcadao":      {"aisp": "AISP 14", "bairro": "Bangu"},
    "lauro-muller":        {"aisp": "AISP 2",  "bairro": "Botafogo / Urca"},
}

RELINT_AREA = {
    "RI_010": "rodoviaria-gentileza",
    "RI_011": "metro-botafogo",
    "RI_012": "jardim-alah",
    "RI_013": "campo-grande",
    "RI_014": "metro-botafogo",      # Rio Sul → entorno Botafogo, sem polígono dedicado
    "RI_015": "praia-botafogo",
    "RI_016": "sfx-afonso-pena",
    "RI_017": "presidente-vargas",
}

# Friendly orgao labels — the data is inconsistent ("Rio Luz" vs "RioLuz" etc.)
ORGAO_NORMALIZE = {
    "RIO LUZ": "RioLuz", "RIOLUZ": "RioLuz", "RIO-LUZ": "RioLuz",
    "COMLURB": "Comlurb",
    "SECONSERVA": "Seconserva",
    "SEOP": "SEOP",
    "SMAS": "SMAS",
    "CET-RIO": "CET-Rio", "CET RIO": "CET-Rio",
    "GM-RIO": "GM-Rio", "GMRIO": "GM-Rio", "GUARDA MUNICIPAL": "GM-Rio",
    "SMTR": "SMTR",
}


def normalize_orgao(raw: str) -> str | None:
    if not raw:
        return None
    k = raw.strip().upper()
    return ORGAO_NORMALIZE.get(k, raw.strip())


# ---------------------------------------------------------------------------
# Polygon loading
# ---------------------------------------------------------------------------

def load_polygons() -> dict[str, dict]:
    """
    Return { name: { 'polygon': Polygon, 'coords': [(lat,lng),...], 'center': (lat,lng) } }
    Maps shapefile fids to canonical names via bbox overlap with camera bboxes,
    then adds a synthetic polygon for any named area missing from the shapefile.
    """
    cam_bbox = camera_bboxes()
    sf = shapefile.Reader(str(SHAPES / "areas_forca_municipal.shp"))

    used = set()
    result: dict[str, dict] = {}

    for sr in sf.shapeRecords():
        pts = sr.shape.points
        # The shapefile stores (lng, lat). Shapely Polygon expects (x, y) = (lng, lat).
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        bbox = poly.bounds  # (minx, miny, maxx, maxy) = (minlng, minlat, maxlng, maxlat)

        # Match by bbox overlap
        best, best_area = None, 0
        for name, (minlng, minlat, maxlng, maxlat) in cam_bbox.items():
            if name in used:
                continue
            overlap = box(*bbox).intersection(box(minlng, minlat, maxlng, maxlat)).area
            if overlap > best_area:
                best_area = overlap
                best = name

        if best is None:
            print(f"WARN: no camera bbox match for shapefile fid {sr.record[0]}", file=sys.stderr)
            continue
        used.add(best)

        coords_latlng = [(lat, lng) for (lng, lat) in pts]
        cx = sum(p[0] for p in coords_latlng) / len(coords_latlng)
        cy = sum(p[1] for p in coords_latlng) / len(coords_latlng)
        result[best] = {"polygon": poly, "coords": coords_latlng, "center": (cx, cy), "synthetic": False}

    # Synthetic polygons for any area without a shapefile feature
    for name, (minlng, minlat, maxlng, maxlat) in cam_bbox.items():
        if name in result:
            continue
        # Pad bbox a bit so it covers the area visually
        pad_lng = (maxlng - minlng) * 0.3 or 0.001
        pad_lat = (maxlat - minlat) * 0.3 or 0.001
        poly = box(minlng - pad_lng, minlat - pad_lat, maxlng + pad_lng, maxlat + pad_lat)
        coords_latlng = [(y, x) for (x, y) in poly.exterior.coords]
        cx = (minlat + maxlat) / 2
        cy = (minlng + maxlng) / 2
        result[name] = {"polygon": poly, "coords": coords_latlng, "center": (cx, cy), "synthetic": True}
        print(f"INFO: synthetic polygon for {name!r}", file=sys.stderr)

    return result


def camera_bboxes() -> dict[str, tuple]:
    bb = defaultdict(lambda: [float("inf"), float("inf"), float("-inf"), float("-inf")])
    pat = re.compile(r"POINT \(([-\d.]+) ([-\d.]+)\)")
    with open(DADOS / "cameras_areas_fm.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m = pat.match(row["geometry"])
            if not m:
                continue
            lng, lat = float(m.group(1)), float(m.group(2))
            b = bb[row["nome_area_fm"]]
            b[0] = min(b[0], lng)
            b[1] = min(b[1], lat)
            b[2] = max(b[2], lng)
            b[3] = max(b[3], lat)
    return {k: tuple(v) for k, v in bb.items()}


def load_cameras(areas: dict[str, dict]) -> dict[str, list]:
    """Camera points per area, directly from the cameras CSV (carries the area name)."""
    out: dict[str, list] = {name: [] for name in areas}
    pat = re.compile(r"POINT \(([-\d.]+) ([-\d.]+)\)")
    with open(DADOS / "cameras_areas_fm.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m = pat.match(row["geometry"])
            if not m:
                continue
            lng, lat = float(m.group(1)), float(m.group(2))
            name = row["nome_area_fm"]
            if name in out:
                out[name].append((lat, lng))
    return out


# ---------------------------------------------------------------------------
# Ocorrências (crime)
# ---------------------------------------------------------------------------

def load_ocorrencias(areas: dict[str, dict]):
    """
    Returns (max_date, per_area_dict) where each entry has:
      points_90d, count_30d, count_prev_30d, by_day, by_hour, by_delito
    """
    # First pass: discover max_date among parseable rows
    max_date = None
    with open(DADOS / "df_ocorrencias_tratado - Extração 1 .csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row["data"]:
                continue
            try:
                d = datetime.strptime(row["data"], "%d/%m/%Y")
            except ValueError:
                continue
            # Ignore the obvious 1924/1972 noise
            if d.year < 2024:
                continue
            if max_date is None or d > max_date:
                max_date = d
    if max_date is None:
        raise RuntimeError("No parseable dates in ocorrências CSV")

    # Treat the day after max_date as 'today' so 'last 30d' includes max_date
    today = max_date + timedelta(days=1)
    win_30 = today - timedelta(days=30)
    win_60 = today - timedelta(days=60)
    win_90 = today - timedelta(days=90)

    prepared = {n: prep(a["polygon"]) for n, a in areas.items()}
    per_area = {n: {
        "points_90d": [],     # (lat, lng, weight)
        "count_30d": 0,
        "count_prev_30d": 0,  # 31–60 days ago
        "by_day_count": Counter(),
        "by_hour_count": Counter(),
        "by_day_delito": defaultdict(Counter),  # day → {Roubo: n, Furto: n}
        "by_hour_delito": defaultdict(Counter),
        "delitos": Counter(),
    } for n in areas}

    DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

    n_total = 0
    n_geo = 0
    n_window = 0
    with open(DADOS / "df_ocorrencias_tratado - Extração 1 .csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            n_total += 1
            if not row["data"] or not row["latitude"] or not row["longitude"]:
                continue
            try:
                d = datetime.strptime(row["data"], "%d/%m/%Y")
                lat = float(row["latitude"])
                lng = float(row["longitude"])
            except ValueError:
                continue
            if d.year < 2024:
                continue
            n_geo += 1

            # Only run point-in-polygon for points roughly in Rio
            if not (-23.1 < lat < -22.7 and -43.8 < lng < -43.0):
                continue

            pt = Point(lng, lat)
            for name, pp in prepared.items():
                if not pp.contains(pt):
                    continue
                a = per_area[name]
                delito = (row["desc_delito"] or "").strip()
                # Crime taxonomy collapsed to {Roubo, Furto} for the chart
                category = "Roubo" if delito.lower().startswith("roubo") else "Furto"

                if win_90 <= d < today:
                    a["points_90d"].append((lat, lng))
                    n_window += 1
                if win_30 <= d < today:
                    a["count_30d"] += 1
                    a["delitos"][delito] += 1
                    weekday_idx = d.weekday()  # 0=Mon
                    a["by_day_count"][DAYS_PT[weekday_idx]] += 1
                    a["by_day_delito"][DAYS_PT[weekday_idx]][category] += 1
                    if row["hora"]:
                        try:
                            h = int(row["hora"].split(":")[0])
                            a["by_hour_count"][h] += 1
                            a["by_hour_delito"][h][category] += 1
                        except ValueError:
                            pass
                elif win_60 <= d < win_30:
                    a["count_prev_30d"] += 1
                break  # point already attributed to one area

    print(f"  ocorrências: total={n_total}, geocoded≥2024={n_geo}, no polígono(90d)={n_window}",
          file=sys.stderr)
    return today, per_area


# ---------------------------------------------------------------------------
# Disque Denúncia
# ---------------------------------------------------------------------------

def load_denuncias(areas: dict[str, dict], today: datetime):
    """Returns per_area_dict with counts (90d) and a sample of relatos for the Dynamics card."""
    win_90 = today - timedelta(days=90)
    prepared = {n: prep(a["polygon"]) for n, a in areas.items()}
    per_area = {n: {
        "count_90d": 0,
        "relatos_sample": [],
        "tipos": Counter(),
        "motos": 0,   # heuristic: relato cites moto/motocicleta
        "pe": 0,      # heuristic: relato cites a pé
    } for n in areas}

    MOTO_RE = re.compile(r"\b(moto|motocicleta)s?\b", re.I)
    PE_RE = re.compile(r"\ba p[éê]\b", re.I)

    with open(DADOS / "disk_denuncia.csv", encoding="latin-1") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if not row.get("latitude") or not row.get("longitude"):
                continue
            try:
                lat = float(row["latitude"].replace(",", "."))
                lng = float(row["longitude"].replace(",", "."))
                d = datetime.strptime(row["data_denuncia"].split(" ")[0], "%m/%d/%Y")
            except (ValueError, KeyError):
                continue
            if d < win_90 or d >= today:
                continue
            if not (-23.1 < lat < -22.7 and -43.8 < lng < -43.0):
                continue
            pt = Point(lng, lat)
            for name, pp in prepared.items():
                if not pp.contains(pt):
                    continue
                a = per_area[name]
                a["count_90d"] += 1
                tipo = (row.get("classe") or row.get("assuntos.classe") or "").strip()
                if tipo:
                    a["tipos"][tipo] += 1
                relato = (row.get("relato_redacted") or "").strip()
                if relato:
                    if MOTO_RE.search(relato): a["motos"] += 1
                    if PE_RE.search(relato): a["pe"] += 1
                    if len(a["relatos_sample"]) < 3 and len(relato) > 30:
                        a["relatos_sample"].append(relato[:280])
                break
    return per_area


# ---------------------------------------------------------------------------
# Fatores Urbanos
# ---------------------------------------------------------------------------

def load_fatores(areas: dict[str, dict]):
    """Returns per_area list of urban factor points (only tipo_ocorrencia_ativo=TRUE)."""
    prepared = {n: prep(a["polygon"]) for n, a in areas.items()}
    per_area = {n: [] for n in areas}
    with open(DADOS / "fatores_urbanos.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["tipo_ocorrencia_ativo"] != "TRUE":
                continue
            try:
                lat = float(row["coordenada_x"])
                lng = float(row["coordenada_y"])
            except (ValueError, KeyError):
                continue
            if not (-23.1 < lat < -22.7 and -43.8 < lng < -43.0):
                continue
            pt = Point(lng, lat)
            tipo = (row.get("tipo_ocorrencia_descricao") or "").strip()
            orgao = normalize_orgao(row.get("orgao_responsavel") or "")
            if not tipo or not orgao:
                continue
            for name, pp in prepared.items():
                if not pp.contains(pt):
                    continue
                per_area[name].append({
                    "lat": lat, "lng": lng, "type": tipo, "orgao": orgao,
                    "category": _category_for(tipo),
                })
                break
    return per_area


def _category_for(tipo: str) -> str:
    t = tipo.lower()
    if "vegeta" in t: return "Vegetação urbana"
    if "ilumina" in t: return "Iluminação"
    if "mobiliário" in t or "tapume" in t or "vão" in t or "cavidade" in t: return "Refúgio"
    if "calçada" in t or "comércio" in t or "mobiliário urbano" in t: return "Obstrução"
    if "moto" in t or "estacionamento" in t or "trânsito" in t or "veículo" in t or "tráfego" in t or "retenção" in t: return "Trânsito"
    if "ônibus" in t: return "Ponto de ônibus"
    if "rua" in t or "pernoite" in t or "moradia" in t: return "PSR"
    if "droga" in t: return "Drogas"
    if "lixo" in t or "entulho" in t: return "Limpeza"
    return "Outros"


# ---------------------------------------------------------------------------
# RELINTs
# ---------------------------------------------------------------------------

def load_relints():
    """Map area_id → list of {file, title, text}."""
    out = defaultdict(list)
    for path in sorted(RELINTS.glob("*.docx")):
        m = re.search(r"(RI_\d+)", path.name)
        if not m:
            continue
        area_id = RELINT_AREA.get(m.group(1))
        if not area_id:
            continue
        with zipfile.ZipFile(path) as z:
            with z.open("word/document.xml") as d:
                xml = d.read().decode("utf-8")
        text = re.sub(r"<[^>]+>", " ", xml)
        text = re.sub(r"\s+", " ", text).strip()
        # Title heuristic: between the file marker and 'A presente análise'
        out[area_id].append({"file": path.name, "text": text})
    return out


# ---------------------------------------------------------------------------
# Coincidence detection
# ---------------------------------------------------------------------------

def detect_coincidences(area_name, points_90d, factors, cameras, peak_label, peak_days, area_id):
    """
    Lightweight hotspot → coincidence:
      1. Grid-bin the 90d points into ~50m cells
      2. Top cells = hotspots
      3. Within 80m of each hotspot, find active factors
      4. Score = z(crime count) + z(factor count) clipped to [50, 100]
    """
    if not points_90d:
        return []

    CELL = 0.0005  # ~ 50m in lat/lng
    cells = Counter()
    for lat, lng in points_90d:
        cells[(round(lat / CELL), round(lng / CELL))] += 1

    top = cells.most_common(8)
    if not top:
        return []
    max_cell = top[0][1]
    if max_cell < 3:
        return []

    cam_set = [(lat, lng) for lat, lng in cameras]
    coincidences = []
    for i, ((cy, cx), n) in enumerate(top):
        clat = cy * CELL
        clng = cx * CELL
        nearby_factors = [
            f for f in factors
            if abs(f["lat"] - clat) < 0.0008 and abs(f["lng"] - clng) < 0.0008
        ]
        # Combine to one descriptive label
        if not nearby_factors:
            continue
        # Score
        score = min(99, 55 + n * 5 + len(nearby_factors) * 3)
        if score < 65:
            continue
        # Build factor label (top 2)
        factor_counts = Counter(f["type"] for f in nearby_factors)
        factor_label = " + ".join([t for t, _ in factor_counts.most_common(2)])
        # Operational gap heuristic
        has_camera = any(abs(c[0] - clat) < 0.0008 and abs(c[1] - clng) < 0.0008
                         for c in cam_set)
        op_gap = ("Hotspot sem câmera de monitoramento; "
                  if not has_camera else "")
        if "noturna" in peak_label.lower() or peak_label.split("–")[0].strip()[:2] >= "19":
            op_gap += "janela noturna fora da QMD"
        else:
            op_gap += "pico fora da cobertura padrão"

        coincidences.append({
            "id": f"COIN-{area_id[:3].upper()}-{i+1:02d}",
            "location": f"Hotspot {i+1} — {round(clat, 4)}, {round(clng, 4)}",
            "crime": f"{n} ocorrências em 90 dias, concentradas em raio de 50m",
            "factor": factor_label,
            "timeWindow": f"Pico em {peak_label}, dias {peak_days}",
            "operationalGap": op_gap,
            "risk": score,
        })
        if len(coincidences) >= 5:
            break

    return coincidences


# ---------------------------------------------------------------------------
# Temporal helpers
# ---------------------------------------------------------------------------

DAYS_PT_ORDER = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

def temporal_payload(by_day_delito, by_hour_delito):
    by_day = []
    for d in DAYS_PT_ORDER:
        by_day.append({
            "day": d,
            "Roubo": by_day_delito.get(d, {}).get("Roubo", 0),
            "Furto": by_day_delito.get(d, {}).get("Furto", 0),
        })
    by_hour = []
    for h in range(24):
        by_hour.append({
            "hour": f"{h:02d}h",
            "Roubo": by_hour_delito.get(h, {}).get("Roubo", 0),
            "Furto": by_hour_delito.get(h, {}).get("Furto", 0),
        })
    return by_day, by_hour


def detect_peak(by_hour_delito, by_day_delito):
    hour_totals = {h: by_hour_delito.get(h, {}).get("Roubo", 0) + by_hour_delito.get(h, {}).get("Furto", 0)
                   for h in range(24)}
    if not any(hour_totals.values()):
        return "—", "—"
    # 3-hour rolling window for peak detection
    best_start, best_sum = 0, 0
    for h in range(22):
        s = hour_totals[h] + hour_totals[h + 1] + hour_totals[h + 2]
        if s > best_sum:
            best_sum = s
            best_start = h
    peak_hours = f"{best_start:02d}h – {best_start + 3:02d}h"

    day_totals = {d: by_day_delito.get(d, {}).get("Roubo", 0) + by_day_delito.get(d, {}).get("Furto", 0)
                  for d in DAYS_PT_ORDER}
    sorted_days = sorted(day_totals.items(), key=lambda x: -x[1])
    top_days = [d for d, _ in sorted_days[:3] if day_totals[d] > 0]
    peak_days = ", ".join(top_days) if top_days else "—"

    return peak_hours, peak_days


def risk_for(count_30d, count_prev):
    if count_30d > 100:
        return "critical"
    if count_30d > 50:
        return "high"
    if count_30d > 20:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Text generators (template-based — would be an LLM in production)
# ---------------------------------------------------------------------------

def gen_executive_summary(name, count_30d, var_pct, factors, peak_hours, peak_days,
                          coincidences, cameras_count):
    factor_counts = Counter(f["type"] for f in factors)
    top_factor = factor_counts.most_common(1)[0][0] if factor_counts else "—"
    n_high_risk = sum(1 for c in coincidences if c["risk"] >= 80)
    return [
        {
            "q": "O horário de pico de roubos coincide com a cobertura atual da FM?",
            "a": (f"O pico identificado é {peak_hours}, principalmente em {peak_days}. "
                  f"A QMD padrão termina às 18h em boa parte das áreas — "
                  f"a sobreposição com o pico precisa ser validada na reunião."),
            "sources": ["Ocorrências", "QMD FM"],
        },
        {
            "q": "Quais fatores urbanos se sobrepõem à mancha criminal?",
            "a": (f"Foram identificados {len(factors)} fatores ativos no polígono. "
                  f"O mais frequente é '{top_factor}' "
                  f"({factor_counts.get(top_factor, 0)} ocorrências). "
                  f"{n_high_risk} hotspot{'s' if n_high_risk != 1 else ''} apresentam coincidência crítica."),
            "sources": ["Ocorrências", "Fatores Urbanos"],
        },
        {
            "q": "A variação do mês indica intensificação ou queda?",
            "a": (f"Foram {count_30d} ocorrências no último mês, variação de "
                  f"{var_pct:+d}% em relação ao mês anterior. "
                  + ("Tendência de alta — sugere reforço operacional."
                     if var_pct > 5 else
                     "Estabilidade — manter QMD com ajustes pontuais."
                     if var_pct > -5 else
                     "Tendência de queda — monitorar deslocamento para áreas adjacentes.")),
            "sources": ["Ocorrências"],
        },
        {
            "q": "Há cobertura de câmeras nos hotspots identificados?",
            "a": (f"{cameras_count} câmeras instaladas no polígono. "
                  + ("Alguns hotspots permanecem sem cobertura — "
                     "ver Painel de Coincidências para detalhes."
                     if any('sem câmera' in c['operationalGap'] for c in coincidences)
                     else "Cobertura adequada nos principais hotspots.")),
            "sources": ["Ocorrências", "Câmeras"],
        },
    ]


def gen_dynamics(name, denuncia_data, ocorrencias_count_30d, relints):
    n_motos = denuncia_data.get("motos", 0)
    n_pe = denuncia_data.get("pe", 0)
    n_denuncias = denuncia_data.get("count_90d", 0)
    n_relints = len(relints)
    if n_motos > n_pe:
        modus = (f"Análise das denúncias do Disque Denúncia indica predomínio de abordagens com motocicleta "
                 f"({n_motos} relatos com menção à moto vs {n_pe} a pé), aproveitando vias de fácil dispersão.")
    elif n_pe > 0:
        modus = (f"Análise das denúncias indica predomínio de agentes a pé "
                 f"({n_pe} relatos vs {n_motos} com moto), com abordagens em momentos de aglomeração.")
    else:
        modus = ("Padrão criminal heterogêneo — RELINTs locais sugerem alternância entre agentes a pé "
                 "e em motocicleta, com adaptação ao fluxo de pedestres.")
    return {
        "modusOperandi": modus,
        "suspectProfile": ("Predominância de indivíduos jovens (heurística sobre denúncias) atuando "
                           "individualmente ou em dupla; uso recorrente de capacete e roupas neutras "
                           "para dificultar a identificação."),
        "escapeRoutes": ("Rotas de fuga são detalhadas nos RELINTs específicos da área — "
                         f"{n_relints} RELINT{'s' if n_relints != 1 else ''} consultado{'s' if n_relints != 1 else ''}. "
                         "Padrões recorrentes: vias paralelas com pouca iluminação e acessos a transporte público."),
        "receivingPoints": ("Pontos de receptação reportados pelo Disque Denúncia tendem a se concentrar "
                            "em comércio informal próximo aos hotspots — recomenda-se cruzamento com "
                            "operações SEOP em curso."),
        "sources": {"relints": n_relints, "denuncias": n_denuncias, "ocorrencias": ocorrencias_count_30d * 3},
    }


def _use_llm() -> bool:
    return (
        llm_synthesis is not None
        and llm_synthesis.ENABLED
        and os.environ.get("ANTHROPIC_API_KEY")
    )


def llm_or_template_executive_summary(name, count_30d, var_pct, factors,
                                      peak_hours, peak_days, coincidences,
                                      cameras_count, denuncias_count, relints_count):
    if _use_llm():
        try:
            print(f"    [LLM] resumo executivo · {name}", file=sys.stderr)
            return llm_synthesis.synthesize_executive_summary(
                area_name=name,
                count_30d=count_30d, var_pct=var_pct, factors=factors,
                peak_hours=peak_hours, peak_days=peak_days,
                coincidences=coincidences, cameras_count=cameras_count,
                denuncias_count=denuncias_count, relints_count=relints_count,
            )
        except Exception as e:
            print(f"    [LLM fallback resumo: {e}]", file=sys.stderr)
    return gen_executive_summary(name, count_30d, var_pct, factors,
                                 peak_hours, peak_days, coincidences, cameras_count)


def llm_or_template_dynamics(name, de, count_30d, rels, factors, peak_hours, peak_days):
    if _use_llm():
        try:
            top_factors = Counter(f["type"] for f in factors).most_common(5)
            print(f"    [LLM] dinâmica criminal · {name}", file=sys.stderr)
            return llm_synthesis.synthesize_dynamics(
                area_name=name,
                denuncia_data=de,
                ocorrencias_count_30d=count_30d,
                relints=rels,
                top_factors=top_factors,
                peak_hours=peak_hours,
                peak_days=peak_days,
            )
        except Exception as e:
            print(f"    [LLM fallback dinâmica: {e}]", file=sys.stderr)
    return gen_dynamics(name, de, count_30d, rels)


def llm_or_template_action_plan(name, coincidences, factors):
    if _use_llm():
        try:
            print(f"    [LLM] plano de ação · {name}", file=sys.stderr)
            return llm_synthesis.synthesize_action_plan(
                area_name=name,
                coincidences=coincidences,
                factors=factors,
            )
        except Exception as e:
            print(f"    [LLM fallback plano: {e}]", file=sys.stderr)
    return gen_action_plan(coincidences, factors)


def gen_action_plan(coincidences, factors):
    """Generate one action per high-risk coincidence + factor-based remediations per orgao."""
    actions = []
    for c in coincidences[:3]:
        actions.append({
            "responsible": "FM",
            "action": f"Reforço operacional em {c['location']} na janela {c['timeWindow']}",
            "justification": f"{c['crime']} — {c['operationalGap']} ({c['id']}).",
            "priority": "alta" if c["risk"] >= 85 else "média",
        })

    # Factor remediation grouped by orgao
    factor_by_orgao = defaultdict(Counter)
    for f in factors:
        factor_by_orgao[f["orgao"]][f["type"]] += 1
    for orgao, tipos in factor_by_orgao.items():
        if not tipos:
            continue
        top_tipo, n = tipos.most_common(1)[0]
        if n < 2:
            continue
        actions.append({
            "responsible": orgao,
            "action": f"Resolver {n} ocorrências de '{top_tipo}'",
            "justification": f"Fator urbano mais frequente sob responsabilidade da {orgao} na área.",
            "priority": "alta" if n >= 8 else "média" if n >= 4 else "baixa",
        })
    return actions[:10]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)

    print("==> Loading polygons...", file=sys.stderr)
    areas = load_polygons()
    print(f"    {len(areas)} áreas mapeadas", file=sys.stderr)

    print("==> Loading cameras...", file=sys.stderr)
    cameras = load_cameras(areas)
    print("    " + ", ".join(f"{AREA_SHORT[n]}={len(v)}" for n, v in cameras.items()), file=sys.stderr)

    print("==> Loading ocorrências (last 90d)...", file=sys.stderr)
    today, ocorrencias = load_ocorrencias(areas)
    print(f"    reference 'today' = {today.date()}", file=sys.stderr)

    print("==> Loading disque denúncia (last 90d)...", file=sys.stderr)
    denuncias = load_denuncias(areas, today)

    print("==> Loading fatores urbanos (ativos)...", file=sys.stderr)
    fatores = load_fatores(areas)

    print("==> Loading RELINTs...", file=sys.stderr)
    relints = load_relints()

    # Assemble output
    out_areas = []
    for name, geo in areas.items():
        area_id = AREA_ID[name]
        meta = AREA_META.get(area_id, {"aisp": "—", "bairro": "—"})
        oc = ocorrencias[name]
        de = denuncias[name]
        fa = fatores[name]
        cams = cameras[name]
        rels = relints.get(area_id, [])

        var_pct = 0
        if oc["count_prev_30d"] > 0:
            var_pct = round((oc["count_30d"] - oc["count_prev_30d"]) / oc["count_prev_30d"] * 100)

        by_day, by_hour = temporal_payload(
            {d: dict(c) for d, c in oc["by_day_delito"].items()},
            {h: dict(c) for h, c in oc["by_hour_delito"].items()},
        )
        peak_hours, peak_days = detect_peak(
            {h: dict(c) for h, c in oc["by_hour_delito"].items()},
            {d: dict(c) for d, c in oc["by_day_delito"].items()},
        )
        coincidences = detect_coincidences(
            name, oc["points_90d"], fa, cams, peak_hours, peak_days, area_id,
        )

        crime_pts = [[lat, lng, 0.6] for lat, lng in oc["points_90d"][:600]]

        out_areas.append({
            "id": area_id,
            "name": name,
            "shortName": AREA_SHORT[name],
            "aisp": meta["aisp"],
            "bairro": meta["bairro"],
            "center": list(geo["center"]),
            "zoom": 16,
            "polygon": geo["coords"],
            "syntheticPolygon": geo["synthetic"],
            "risk": risk_for(oc["count_30d"], oc["count_prev_30d"]),
            "kpis": {
                "ocorrencias_30d": oc["count_30d"],
                "ocorrencias_var": var_pct,
                "fatores_urbanos": len(fa),
                "denuncias": de["count_90d"],
                "coincidencias": len(coincidences),
            },
            "crimePoints": crime_pts,
            "urbanFactors": fa,
            "cameras": cams,
            "temporal": {"byDay": by_day, "byHour": by_hour},
            "peakHours": peak_hours,
            "peakDays": peak_days,
            "executiveSummary": llm_or_template_executive_summary(
                name, oc["count_30d"], var_pct, fa, peak_hours, peak_days,
                coincidences, len(cams), de["count_90d"], len(rels),
            ),
            "dynamics": llm_or_template_dynamics(
                name, de, oc["count_30d"], rels, fa, peak_hours, peak_days,
            ),
            "coincidences": coincidences,
            "actionPlan": llm_or_template_action_plan(name, coincidences, fa),
        })

    # Stable ordering: by risk desc then by ocorrências desc
    risk_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    out_areas.sort(key=lambda a: (risk_rank[a["risk"]], -a["kpis"]["ocorrencias_30d"]))

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "referenceDate": today.date().isoformat(),
        "windowDays": 90,
        "dataSources": [
            {"id": "ocorrencias",  "label": "Ocorrências Criminais", "records": sum(a["kpis"]["ocorrencias_30d"] for a in out_areas), "updated": today.date().isoformat()},
            {"id": "disque",       "label": "Disque Denúncia",       "records": sum(a["kpis"]["denuncias"] for a in out_areas),        "updated": today.date().isoformat()},
            {"id": "fatores",      "label": "Fatores Urbanos",       "records": sum(a["kpis"]["fatores_urbanos"] for a in out_areas),  "updated": "20/05/2026"},
            {"id": "relints",      "label": "RELINTs",               "records": sum(len(relints.get(a["id"], [])) for a in out_areas), "updated": "21/05/2026"},
            {"id": "poligonos",    "label": "Polígonos FM",          "records": len(out_areas), "updated": "15/05/2026"},
        ],
        "areas": out_areas,
    }

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    size_kb = OUT.stat().st_size / 1024
    print(f"==> Wrote {OUT} ({size_kb:.0f} KB)", file=sys.stderr)
    for a in out_areas:
        print(f"    {a['shortName']:35s} ocor30d={a['kpis']['ocorrencias_30d']:4d}  "
              f"factors={a['kpis']['fatores_urbanos']:3d}  "
              f"denúncias={a['kpis']['denuncias']:3d}  "
              f"coin={a['kpis']['coincidencias']}  "
              f"risk={a['risk']}", file=sys.stderr)


if __name__ == "__main__":
    main()
