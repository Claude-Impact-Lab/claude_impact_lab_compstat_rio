# Reference: CPSR — Censo de Pessoas em Situação de Rua

Censo municipal trienal de PSR (Pessoas em Situação de Rua), com coordenadas georreferenciadas. Alimenta a análise qualitativa e quantitativa do fator urbano **"Pessoas em situação de rua"** (P4) e enriquece o mapeamento de pontos de PSR em hotspots criminais.

## Localização e formato

- **Arquivo:** `dados/outros dados/CPSR_2020_2022_2024.xlsx`
- **Formato:** Excel `.xlsx` (não há CSV equivalente).
- **23.333 linhas** de registros individuais — 3 anos de censo combinados (2020, 2022, 2024).
- **~166 colunas** (A–FK): demografia, localização, situação de moradia, serviços acessados.

## ⚠ Gotchas

1. **`openpyxl` pode não estar instalado.** Verifique com `python3 -c "import openpyxl"` antes de usar. Se ausente, extraia via `zipfile` + parsing de `xl/worksheets/sheet1.xml` e `xl/sharedStrings.xml`.
2. **Latitude (col G) e Longitude (col H) podem estar vazias** para registros coletados em hospitais/CAPS/abrigos (apenas entrevistas "em rua" têm coordenadas).
3. **Sem coluna `ano` explícita** — o ano do censo precisa ser derivado da coluna `Chave_única` (col A) ou por filtragem por lote de coleta.
4. **Coluna `Bairro_7_dias` (col BG)** é o campo de localização mais confiável para análise espacial quando lat/lng estão vazios.

## Colunas-chave (subset útil para o CompStat)

| Coluna | Nome | Descrição |
|---|---|---|
| A | `Chave_única` | ID do registro — codifica o ano do censo |
| G | `Latitude` | Lat WGS84 (float, pode estar vazia) |
| H | `Longitude` | Lng WGS84 (float, pode estar vazia) |
| I | `Situação_entrevista` | `SIM` (entrevistado) / `Possível` / `Impossível` |
| K | `Classificação idade` | `Criança`, `Adulto`, `Não identificado` |
| N | `Sexo` | `Masculino`, `Feminino`, `Não identificado` |
| P | `Cor_raça` | Branca, Parda, Preta, Indígena, etc. |
| M | `Dormiu_rua` | Se dormiu na rua no período |
| BG | `Bairro_7_dias` | Bairro onde dormiu nos últimos 7 dias |
| BD | `Local_dormitório` | Tipo de local (rua, abrigo, hospital...) |

## Receita: carregar com openpyxl

```python
# Verificar disponibilidade antes:
# python3 -c "import openpyxl; print(openpyxl.__version__)"

import openpyxl

def carregar_cpsr(path="dados/outros dados/CPSR_2020_2022_2024.xlsx"):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    headers = [str(h) if h is not None else "" for h in next(rows)]
    out = []
    for row in rows:
        r = dict(zip(headers, row))
        out.append(r)
    wb.close()
    return out
```

## Receita: filtrar PSR com coordenadas dentro de uma área FM

```python
from shapely.geometry import Point

def psr_na_area(registros, poly_area):
    """
    Filtra registros do CPSR com lat/lng dentro do polígono da área FM.
    Usa apenas entrevistas com coordenadas válidas (Situação_entrevista = 'SIM').
    """
    out = []
    for r in registros:
        if r.get("Situação_entrevista") != "SIM":
            continue
        try:
            lat = float(r["Latitude"])
            lng = float(r["Longitude"])
        except (TypeError, ValueError):
            continue
        if poly_area.contains(Point(lng, lat)):
            out.append(r)
    return out
```

## Receita: contar PSR por bairro (fallback sem coordenadas)

```python
from collections import Counter

def psr_por_bairro(registros):
    """
    Conta PSR por bairro onde dormiu (Bairro_7_dias).
    Útil quando lat/lng está vazio.
    """
    return Counter(
        r["Bairro_7_dias"]
        for r in registros
        if r.get("Bairro_7_dias") and r.get("Dormiu_rua") == "Sim"
    ).most_common()
```

## Como usar em P4 (fatores urbanos / PSR)

1. Filtre fatores com `tipo_ocorrencia_descricao == "Pessoas em situação de rua"` via `fatores-urbanos.md`.
2. Para cada fator PSR, conte registros CPSR em raio de 100m usando `psr_na_area()` → quantifica o problema.
3. Reporte: "X pontos de PSR mapeados no fator urbano, confirmados por Y registros CPSR no raio".

## Perguntas que esta fonte responde

- Quantas pessoas em situação de rua foram censitadas em uma área FM?
- Qual a distribuição demográfica (sexo, faixa etária) de PSR em hotspots?
- Os pontos de PSR identificados em `fatores_urbanos.csv` têm confirmação censitária?
- Tendência de crescimento de PSR entre 2020, 2022, 2024 em uma área?

Não responde: dinâmica criminal, horário de crime, rotas de facção. Combine com `ocorrencias.md` para validar sobreposição PSR × mancha criminal antes de afirmar que o PSR é fator criminógeno relevante.
