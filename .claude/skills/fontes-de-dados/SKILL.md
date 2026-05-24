---
name: fontes-de-dados
description: Use sempre que precisar ler, filtrar ou analisar qualquer fonte de dado do CompStat Rio — ocorrências criminais (roubos, furtos), Disque Denúncia (denúncias anônimas), RELINTs da Força Municipal (relatórios de inteligência), fatores urbanos (iluminação deficiente, vegetação, pessoas em situação de rua, obstrução de calçada, lixo, comércio irregular, esconderijos), polígonos das 9 áreas FM, ou câmeras municipais. Documenta encoding (latin1 vs utf-8), separadores (`;` vs `,`), decimal (`,` vs `.`), axis swaps (coord_x = latitude no fatores_urbanos!), reprojeção EPSG:4326 → 31983 para distâncias, e como filtrar registros por polígono de área FM. Acione quando o usuário pedir contagens, distribuições, listagens, hotspots, mapeamentos espaciais, ou qualquer manipulação dos CSVs/shapefile do projeto.
---

# Fontes de dados do CompStat Rio

Este projeto tem 6 fontes de dado distintas, com formatos heterogêneos e gotchas conhecidos. Antes de manipular qualquer arquivo, **leia o reference da fonte correspondente** — ele documenta schema, encoding e exemplos.

## Índice de fontes

| Fonte | Arquivo | Tipo | Reference |
|---|---|---|---|
| Ocorrências criminais | `dados/df_ocorrencias_tratado - Extração 1 .csv` | Quantitativo georreferenciado | `references/ocorrencias.md` |
| Disque Denúncia | `dados/disk_denuncia.csv` | Qualitativo (NLP) | `references/disque-denuncia.md` |
| RELINTs Força Municipal | `dados/relints/*.docx` | Qualitativo (NLP) | `references/relints.md` |
| Fatores urbanos | `dados/fatores_urbanos.csv` | Qualitativo estruturado | `references/fatores-urbanos.md` |
| Polígonos áreas FM | `dados/sh_area_forca/areas_forca_municipal.shp` | Geoespacial | `references/poligonos-fm.md` |
| Câmeras | `dados/cameras_areas_fm.csv` | Geoespacial | `references/cameras.md` |

> Todas as 6 fontes estão documentadas. **Não tente improvisar leitura sem ler o reference correspondente** — os gotchas (encoding, axis swap, decimal vírgula, espaço no filename) vão morder.

## Regras transversais

Vale para qualquer manipulação de dado neste projeto, antes de invocar qualquer reference:

1. **Sempre filtrar por área antes de agregar.** As 9 áreas FM são listadas em `references/poligonos-fm.md`. Resolver `nome → polígono` é o passo 0 de qualquer query.
2. **Geometrias estão em EPSG:4326 (WGS84)** — graus de lat/lng. Para qualquer distância, área, ou buffer **em metros**, reprojete para EPSG:31983 (SIRGAS 2000 UTM 23S). Operações de pertinência (point-in-polygon) podem ser feitas em 4326 sem reprojeção. Receita de aproximação esférica em `references/ocorrencias.md`.
3. **Encoding e separador NÃO é UTF-8 em todos os arquivos.** Cada reference declara o encoding e separador correto. Default `pd.read_csv` quebra silenciosamente em alguns.
4. **Não use pandas/geopandas presumindo que está instalado.** O ambiente padrão deste projeto só tem stdlib + bibliotecas listadas pelo `project/backend/etl/build_data.py` (pyshp, shapely). Antes de qualquer script, verifique com `python3 -c "import X"`.
5. **Os dados são read-only.** Nunca escrever em `dados/` (inclui `dados/relints/` e `dados/sh_area_forca/`).
6. **Lente de segurança pública:** fator urbano isolado ≠ problema de segurança. Sempre cruze com mancha criminal (`references/ocorrencias.md`) antes de afirmar que um fator é "relevante para o crime". Vegetação sem roubo em 100m é problema de jardinagem, não de segurança.

## Como rotear (decidindo qual reference ler)

Não carregue todos os references — leia só os necessários ao intent:

- **Pergunta sobre fatores urbanos / órgãos responsáveis** → `references/poligonos-fm.md` + `references/fatores-urbanos.md`.
- **Pergunta sobre volume / hotspots / horário de crimes** → `references/ocorrencias.md` (V2).
- **Pergunta sobre dinâmica criminal / modus operandi / fuga** → `references/disque-denuncia.md` + `references/relints.md` (V2).
- **Pergunta sobre cobertura de câmera** → `references/cameras.md` (V2).
- **Mapeamento área → metadado administrativo (AISP, bairro, DP)** → `references/poligonos-fm.md`.

Sempre comece resolvendo o polígono da área (etapa 0); depois carregue o(s) reference(s) do dado-fim.
