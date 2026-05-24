# Reference: Ocorrências criminais (mancha criminal)

Esta é a **camada quantitativa** do CompStat — a "mancha criminal". Todas as outras camadas (fatores urbanos, dinâmica, câmeras) só viram problema de segurança pública **quando sobrepõem a esta camada**.

## Localização e formato

- **Arquivo:** `dados/df_ocorrencias_tratado - Extração 1 .csv` (⚠ **espaço antes do `.csv`** — não esqueça nas chamadas).
- **Encoding:** UTF-8
- **Separador:** `,`
- **Decimal:** `.`
- **115.354 linhas** (extração atual).

## ⚠ Gotchas

1. **Filename tem espaço antes da extensão** — use exatamente `"df_ocorrencias_tratado - Extração 1 .csv"`. Wildcard ou rstrip mata silenciosamente.
2. **`data` e `hora` estão preenchidos em 99.98% dos registros**, mas 22 linhas (~0.02%) têm os dois vazios — filtrar antes de análise temporal.
3. **Datas com ruído histórico:** alguns registros têm `data` em anos antigos (1924, 1972, etc — provavelmente bugs no preenchimento original). 99% dos dados são 2020–2024. **Sempre filtre `ano >= 2020`** antes de agregar; o campo `ano` é mais confiável que extrair de `data`.
4. **Só há 3 tipos de delito** no dataset, todos "Roubo" (apesar do briefing falar em "furtos e roubos"). Não há registros de "Furto" — declarar isso ao usuário se ele perguntar.
5. **`dia_semana` está vazio.** Calcule a partir de `data` se precisar.
6. **Não tem axis swap** — `latitude` e `longitude` são colunas explícitas e corretas. `geometria` é WKT `POINT(lng lat)` (ordem padrão).

## Schema

| Coluna | Tipo | Descrição |
|---|---|---|
| `id_criptografado` | str | ID hash do registro |
| `ano` | int (str) | Ano da ocorrência (use este, não extraia de `data`) |
| `data` | str | `DD/MM/YYYY` (alguns registros têm anos espúrios) |
| `mes` | int (str) | Mês 1–12 |
| `hora` | str | `HH:MM:SS` (alguns vazios) |
| `delito` | int (str) | Código numérico (15, 16, 19) |
| `desc_delito` | str | **Use este para classificar.** Veja categorias abaixo. |
| `longitude` | float | Longitude WGS84 |
| `latitude` | float | Latitude WGS84 |
| `aisp` | int | Área Integrada de Segurança Pública (estadual) |
| `risp` | int | Região Integrada de Segurança Pública |
| `locf` | str | Logradouro (livre, com erros ortográficos comuns) |
| `dia_semana` | str | **Sempre vazio** — derive de `data` |
| `geometria` | str | WKT `POINT(lng lat)` — redundante com `longitude`/`latitude` |

## Categorias (`desc_delito`)

Distribuição no dataset completo:

| Código | Categoria | Qtd | % |
|---|---|---|---|
| 15 | Roubo a transeunte | 69.697 | 60.4% |
| 19 | Roubo de aparelho celular | 33.288 | 28.9% |
| 16 | Roubo em coletivo | 12.369 | 10.7% |

> O briefing pede análise de "roubos e furtos", mas o CSV só tem roubos. Para o relatório, classifique como "Roubo a transeunte / Roubo de celular / Roubo em coletivo".

## Bibliotecas

Stdlib `csv` + `datetime` resolvem 95% dos casos. Para hotspots espaciais use `shapely` (já instalado).

```bash
python3 -c "import shapefile, shapely; print('ok')"
```

## Receita: carregar ocorrências de uma área

```python
import csv
from datetime import datetime
from shapely.geometry import Point

def carregar_ocorrencias(poly, ano_min=2020, ano_max=2024):
    """
    Filtra df_ocorrencias_tratado por polígono (etapa 0: resolva poly via poligonos-fm.md).
    Retorna lista de dicts.
    """
    fname = "dados/df_ocorrencias_tratado - Extração 1 .csv"  # ← espaço antes do .csv!
    out = []
    with open(fname, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                ano = int(row["ano"])
                if not (ano_min <= ano <= ano_max):
                    continue
                lng = float(row["longitude"])
                lat = float(row["latitude"])
            except (ValueError, KeyError):
                continue
            if poly.contains(Point(lng, lat)):  # Shapely: (x=lng, y=lat)
                out.append(row)
    return out
```

## Receita: hotspots por grid (binning 50m)

```python
from collections import Counter
from shapely.geometry import Point
import math

def hotspots_grid(ocorrencias, cell_size_m=50):
    """
    Bina ocorrências em células de cell_size_m × cell_size_m.
    Como estamos em EPSG:4326 (graus), conversão aproximada:
    1° lat ≈ 111.000m ; 1° lng ≈ 111.000m * cos(lat)
    Para o Rio (lat ≈ -22.9), 1° lng ≈ 102.000m.
    """
    cell_lat = cell_size_m / 111_000          # ≈ 0.00045 para 50m
    cell_lng = cell_size_m / (111_000 * math.cos(math.radians(-22.9)))  # ≈ 0.00049

    bins = Counter()
    for o in ocorrencias:
        lat = float(o["latitude"])
        lng = float(o["longitude"])
        bx = int(lng / cell_lng)
        by = int(lat / cell_lat)
        bins[(bx, by)] += 1
    # ordena por densidade
    return bins.most_common()  # [((bx, by), count), ...]
```

Para precisão maior, **reprojete para EPSG:31983** (UTM 23S) e use células métricas reais. Para hackathon, a aproximação acima é suficiente.

## Receita: distribuição temporal (heatmap dia × hora)

```python
from datetime import datetime
from collections import Counter

def temporal_dia_hora(ocorrencias):
    """Conta por (dia_da_semana, hora). Retorna matriz 7×24."""
    grid = Counter()
    for o in ocorrencias:
        if not o["data"].strip() or not o["hora"].strip():
            continue
        try:
            dt = datetime.strptime(o["data"], "%d/%m/%Y")
            hora = int(o["hora"].split(":")[0])
            dow = dt.weekday()  # 0=segunda, 6=domingo
            grid[(dow, hora)] += 1
        except (ValueError, IndexError):
            continue
    return grid

def pico_horario(grid):
    """Retorna (dia, hora, count) da célula mais quente + faixa horária predominante."""
    if not grid: return None
    peak = max(grid.items(), key=lambda kv: kv[1])
    # faixa: somar por hora ignorando dia
    por_hora = Counter()
    for (dow, h), c in grid.items():
        por_hora[h] += c
    hs = sorted(por_hora.items(), key=lambda kv: -kv[1])
    return {"pico_cell": peak, "top_horas": hs[:5]}
```

## Receita: sobreposição mancha criminal × ponto qualquer

Esta é **a operação central** do CompStat — usada por P1, P4, e qualquer pergunta sobre coincidência.

```python
import math
from shapely.geometry import Point

def conta_crimes_no_raio(ponto_lat, ponto_lng, ocorrencias, raio_m=100):
    """
    Conta ocorrências dentro de `raio_m` metros de um ponto.
    Usa aproximação esférica (suficiente para distâncias <500m no Rio).
    """
    # 1° lat ≈ 111000m ; 1° lng ≈ 111000 * cos(lat)
    cos_lat = math.cos(math.radians(ponto_lat))
    dlat = raio_m / 111_000
    dlng = raio_m / (111_000 * cos_lat)
    n = 0
    for o in ocorrencias:
        try:
            olat = float(o["latitude"])
            olng = float(o["longitude"])
        except ValueError:
            continue
        # bbox check rápido
        if abs(olat - ponto_lat) > dlat or abs(olng - ponto_lng) > dlng:
            continue
        # distância haversine aproximada
        dy = (olat - ponto_lat) * 111_000
        dx = (olng - ponto_lng) * 111_000 * cos_lat
        if dy*dy + dx*dx <= raio_m*raio_m:
            n += 1
    return n
```

Para volumes grandes (filtrar 100k pontos para 100 lookups), use índice espacial: `from shapely.strtree import STRtree`. Não vou expandir aqui; só ative se a query base ficar >5s.

## Perguntas que esta fonte responde (ou alimenta)

- Quantos roubos/dia ocorreram numa área?
- Quais ruas concentram maior incidência? (hotspots por logradouro / grid)
- Qual horário de pico de crime? (P2)
- Quais fatores urbanos coincidem com hotspots? (P4 — overlay)
- Quais hotspots estão na rota de câmeras? (P1)

Não responde sozinha: motivação criminal, modus operandi, perfil do infrator (use Disque + RELINTs).
