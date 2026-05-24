# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

Data and reference materials for the **Claude Impact Lab Rio — CompStat Rio** hackathon. There is **no application code** in this repo: no build system, no tests, no package manifest. The expected work is exploratory analysis, data integration, and prototyping over the provided datasets to support automated generation of CompStat "Relatórios Analíticos de Área".

`README.md` (in Portuguese) is the authoritative briefing — read it before answering domain questions. `Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf` is the full challenge brief.

## The CompStat domain model (what the data describes)

The municipal CompStat operates over **22 priority areas** assigned to the Força Municipal (FM). Solutions must cross-reference five data layers to find **"coincidências de alto risco"** — where crime, urban factors, and criminal dynamics overlap:

1. **Mancha criminal (quantitative):** `dados/df_ocorrencias_tratado - Extração 1 .csv` — georeferenced theft/robbery occurrences.
2. **Dinâmica criminal (qualitative):** `dados/disk_denuncia.csv` (anonymous tips) + `relints/*.docx` (intelligence reports).
3. **Fatores urbanos (environmental):** `dados/fatores_urbanos.csv` — 20 mapped factors (lighting, vegetation, obstructions, etc.) each tied to a responsible municipal agency (Comlurb, RioLuz, Seconserva, SEOP, SMAS, CET-Rio, SMTR, GM-Rio). See the matrix in `README.md` to route recommendations to the correct agency.
4. **Polígonos da FM:** `sh_area_forca/areas_forca_municipal.*` — ESRI shapefile in **EPSG:4326 (WGS84)**.
5. **Câmeras:** `dados/cameras_areas_fm.csv` — camera positions per FM area (WKT `POINT`, lon/lat).

The data dictionary for every column is in `dados/Dicionário de dados.xlsx` — **consult it first** when interpreting any field.

## Gotchas in the data (verified, not assumed)

These bite anyone who reads the files naïvely with default `pandas.read_csv`:

- **`disk_denuncia.csv`** is **semicolon-separated**, uses **comma as decimal separator** in `latitude`/`longitude` (e.g. `-22,899555`), and is **not UTF-8** (contains mojibake like `SUBST�NCIAS`); load with `sep=';'`, `decimal=','`, and `encoding='latin1'` (or `cp1252`). Several "assuntos.*" / "tipos.*" columns are duplicated under flattened aliases — pick one set.
- **`df_ocorrencias_tratado - Extração 1 .csv`** has a **trailing space in the filename** (before `.csv`). `delito` is a numeric code; `desc_delito` is its label. `data` and `hora` can be empty — don't assume completeness. `geometria` is a WKT `POINT(lon lat)`.
- **`fatores_urbanos.csv`** swaps the usual axis names: **`coordenada_x` holds latitude and `coordenada_y` holds longitude** — verify by sign (Rio latitudes are ~ -22.x, longitudes ~ -43.x) before any spatial join.
- **`dados/outros dados/dominio_territorial - Extração 1.csv`** stores polygons as WKT in a column named `geometria`.
- **`relints/`** files are prefixed `Cópia de RI_…docx` on disk even though `README.md` lists them without the prefix — match by suffix, not exact name.
- All geometries are **EPSG:4326**. Reproject to a metric CRS (e.g. EPSG:31983 / SIRGAS 2000 UTM 23S) before computing distances, buffers, or areas.

## Working in this repo

- There are no commands to build, lint, or test — the repository is a dataset bundle. If you add analysis code (notebooks or scripts), place it where it does not collide with the shipped `dados/`, `relints/`, and `sh_area_forca/` directories, and treat those three as read-only inputs.
- Communicate with the user in **Portuguese (pt-BR)** by default — all source materials and the user's stakeholders work in Portuguese.
- Generated "Relatórios Analíticos de Área" are expected in **`.docx`** following the format implied by the existing `relints/` documents (executive summary, temporal analysis, criminal dynamics, action plan with responsible agency per item).
