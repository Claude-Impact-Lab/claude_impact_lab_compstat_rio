"""
Renderiza o mapa de calor da área para embutir no relatório .docx.

Layout: polígono da FM (azul-marinho tracejado) + heatmap das ocorrências
(hexbin gradiente quente) + câmeras (círculos brancos) sobre tile base
do CartoDB Voyager (mesmo provider do Leaflet no frontend).

Se a internet falhar (CartoDB inacessível), o fallback é fundo branco —
o mapa ainda mostra polígono, heatmap e câmeras, só sem o basemap.
"""

from __future__ import annotations

import io
import logging

import matplotlib

matplotlib.use("Agg")  # backend headless (sem display)

import contextily as ctx  # noqa: E402
import matplotlib.patches as mpatches  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from pyproj import Transformer  # noqa: E402

log = logging.getLogger(__name__)

# EPSG:4326 (lat/lng WGS84) → EPSG:3857 (Web Mercator, padrão dos tiles)
_TO_MERCATOR = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def _project(latlng_list):
    """Recebe lista de [lat, lng] e retorna (xs, ys) em Web Mercator."""
    if not latlng_list:
        return [], []
    lats = [p[0] for p in latlng_list]
    lngs = [p[1] for p in latlng_list]
    xs, ys = _TO_MERCATOR.transform(lngs, lats)
    # transform retorna tuplas/arrays; normaliza para listas
    return list(xs), list(ys)


def render_map(area: dict) -> bytes | None:
    """
    Renderiza o mapa da área e retorna bytes PNG. Retorna None se o polígono
    estiver ausente (sem o que mapear).
    """
    polygon = area.get("polygon") or []
    crime_pts = area.get("crimePoints") or []
    cameras = area.get("cameras") or []
    if not polygon:
        return None

    poly_x, poly_y = _project(polygon)
    cp_x, cp_y = _project([[p[0], p[1]] for p in crime_pts])
    cam_x, cam_y = _project(cameras)

    fig, ax = plt.subplots(figsize=(11, 7), dpi=140)

    # Bbox do polígono + 8% de padding em cada eixo
    min_x, max_x = min(poly_x), max(poly_x)
    min_y, max_y = min(poly_y), max(poly_y)
    pad_x = max((max_x - min_x) * 0.08, 50)  # mínimo 50m
    pad_y = max((max_y - min_y) * 0.08, 50)
    ax.set_xlim(min_x - pad_x, max_x + pad_x)
    ax.set_ylim(min_y - pad_y, max_y + pad_y)

    # 1. Tile base (CartoDB Voyager) — mesmo do app Leaflet.
    # Se a internet falhar, segue sem o basemap.
    try:
        ctx.add_basemap(
            ax,
            source=ctx.providers.CartoDB.Voyager,
            zoom="auto",
            attribution_size=6,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("basemap indisponível, seguindo sem tile: %s", exc)

    # 2. Heatmap (hexbin) das ocorrências dos últimos 90 dias.
    heatmap_handle = None
    if cp_x:
        hb = ax.hexbin(
            cp_x,
            cp_y,
            gridsize=22,
            cmap="YlOrRd",
            alpha=0.55,
            mincnt=1,
            linewidths=0.3,
            edgecolors="white",
        )
        heatmap_handle = hb

    # 3. Polígono da FM — contorno tracejado azul-marinho + fill leve.
    closed_x = list(poly_x) + [poly_x[0]]
    closed_y = list(poly_y) + [poly_y[0]]
    ax.plot(closed_x, closed_y, color="#1E3A5F", linewidth=2.2, linestyle="--",
            zorder=4)
    ax.fill(poly_x, poly_y, color="#1E3A5F", alpha=0.04, zorder=2)

    # 4. Câmeras — círculos brancos com borda escura.
    if cam_x:
        ax.scatter(
            cam_x, cam_y, s=22, c="white",
            edgecolors="#0F172A", linewidths=0.9,
            zorder=6, label="Câmeras",
        )

    ax.set_axis_off()
    ax.set_aspect("equal")

    # Legenda (compõe handles para todos os layers presentes)
    legend_items = [
        Line2D([0], [0], color="#1E3A5F", linewidth=2, linestyle="--",
               label="Polígono FM"),
    ]
    if heatmap_handle is not None:
        legend_items.append(
            mpatches.Patch(facecolor="#EA580C", edgecolor="white", alpha=0.6,
                           label="Concentração de ocorrências (90d)")
        )
    if cam_x:
        legend_items.append(
            Line2D([0], [0], marker="o", linestyle="", markerfacecolor="white",
                   markeredgecolor="#0F172A", markersize=7, label="Câmeras")
        )
    legend = ax.legend(
        handles=legend_items, loc="lower right",
        framealpha=0.92, fontsize=8, frameon=True,
        edgecolor="#94A3B8",
    )
    legend.get_frame().set_linewidth(0.6)

    # Título embutido no canto
    title = area.get("shortName") or area.get("name") or "Área"
    ax.set_title(
        f"Mancha criminal e cobertura — {title}",
        loc="left", fontsize=10, color="#1E3A5F", fontweight="bold", pad=8,
    )

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=140,
                facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()
