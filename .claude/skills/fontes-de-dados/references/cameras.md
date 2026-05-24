# Reference: Câmeras municipais

As câmeras são o **proxy operacional da rota da FM** — onde há câmera, presume-se que a Força Municipal tem capacidade de monitorar e responder. A distribuição de câmeras define implicitamente a "rota" e os pontos cegos.

## Localização e formato

- **Arquivo:** `dados/cameras_areas_fm.csv`
- **Encoding:** UTF-8
- **Separador:** `,`
- **985 linhas** distribuídas em **9 áreas FM**.

## Schema

| Coluna | Tipo | Descrição |
|---|---|---|
| `id_ponto` | str (UUID) | ID único da câmera |
| `nome_area_fm` | str | **Nome canônico da área** (idem ao shapefile + Bangu + Lauro Müller) |
| `id_trecho` | int (str) | ID do trecho urbano coberto pela câmera (mapeia para "trechos críticos" do anexo) |
| `geometry` | str | WKT `POINT (lng lat)` — **note o espaço antes do parêntese**, diferente de `df_ocorrencias` |

## Distribuição por área

| Área | Câmeras |
|---|---|
| Rodoviária - Terminal Gentileza - Estação Leopoldina | 310 |
| Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia | 230 |
| Praia de Botafogo - Rua Marquês de Abrantes | 150 |
| Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria | 80 |
| Estações São Francisco Xavier - Afonso Pena | 60 |
| Rua Lauro Müller – Avenida General Severiano – Avenida Venceslau Brás | 50 |
| Campo Grande: Estação de Trem - Calçadão | 45 |
| Jardim de Alah | 30 |
| Bangu: Calçadão - Bangu Shopping | 30 |

**Total: 985 câmeras nas 9 áreas FM.**

## Receita: carregar câmeras de uma área

```python
import csv, re

def parse_point(wkt):
    """Parse 'POINT (lng lat)' → (lng, lat). Robust to extra spaces."""
    m = re.match(r"POINT\s*\(([-\d.]+)\s+([-\d.]+)\)", wkt.strip())
    if not m: return None
    return float(m.group(1)), float(m.group(2))

def carregar_cameras_da_area(nome_canonico, csv_path="dados/cameras_areas_fm.csv"):
    """nome_canonico tem que bater com nome_area_fm — use `poligonos-fm.md` para resolver alias."""
    out = []
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["nome_area_fm"] != nome_canonico:
                continue
            ponto = parse_point(row["geometry"])
            if not ponto:
                continue
            lng, lat = ponto
            out.append({
                "id_ponto": row["id_ponto"],
                "id_trecho": row["id_trecho"],
                "lat": lat,
                "lng": lng,
            })
    return out
```

## Receita: cobertura de câmera × hotspots (cálculo central da P1)

```python
import math

def crimes_cobertos_por_cameras(ocorrencias, cameras, raio_m=100):
    """
    Para cada ocorrência, verifica se está dentro do raio de QUALQUER câmera.
    Retorna (cobertas, descobertas) — listas de ocorrências.
    """
    cos_lat = math.cos(math.radians(-22.9))  # aprox Rio
    dlat = raio_m / 111_000
    dlng = raio_m / (111_000 * cos_lat)
    r2 = raio_m * raio_m

    cobertas, descobertas = [], []
    for o in ocorrencias:
        try:
            olat = float(o["latitude"])
            olng = float(o["longitude"])
        except (ValueError, KeyError):
            continue
        coberta = False
        for c in cameras:
            if abs(c["lat"] - olat) > dlat: continue
            if abs(c["lng"] - olng) > dlng: continue
            dy = (c["lat"] - olat) * 111_000
            dx = (c["lng"] - olng) * 111_000 * cos_lat
            if dy*dy + dx*dx <= r2:
                coberta = True
                break
        (cobertas if coberta else descobertas).append(o)
    return cobertas, descobertas
```

## Decisões de proxy

- **"Rota da FM" = posição de câmeras + raio de 100m**. Usar 100m como raio de cobertura é um chute conservador (na realidade, a visibilidade depende de altura e orientação da câmera; sem esses metadados, 100m é razoável).
- **"Trechos críticos" do anexo** podem ser derivados agrupando câmeras por `id_trecho` ou via grid de hotspots; a coluna `id_trecho` mapeia diretamente para os "5 trechos críticos" mencionados no relatório-modelo da Lauro Müller (5 trechos = ranking top 5 de `id_trecho` por ocorrências).

## Perguntas que esta fonte responde (ou alimenta)

- Quantas câmeras tem a área X?
- % de crime coberto vs. em ponto cego (P1)
- Trechos críticos por `id_trecho` (top-N hotspots)

Não responde: tipo de câmera (PTZ vs fixa), horário de operação, qualidade de imagem.
