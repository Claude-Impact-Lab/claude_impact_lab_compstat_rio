# Reference: Fatores urbanos de incidência criminal

## Localização e formato

- **Arquivo:** `dados/fatores_urbanos.csv`
- **Encoding:** UTF-8
- **Separador:** `,` (vírgula padrão)
- **Decimal:** `.` (ponto)
- **2085 linhas** no dataset atual.

## ⚠ Gotchas críticos

1. **Axis swap em `coordenada_x` e `coordenada_y`:**
   - `coordenada_x` armazena a **latitude** (valores ~ `-22.8` a `-23.0`).
   - `coordenada_y` armazena a **longitude** (valores ~ `-43.1` a `-43.7`).
   - Validação rápida: latitudes do Rio são negativas perto de -22 a -23; longitudes negativas perto de -43.
   - Para shapely `Point(x=lng, y=lat)` use `Point(row["coordenada_y"], row["coordenada_x"])`.

2. **Todos os registros têm `tipo_ocorrencia_ativo = "TRUE"` no dataset atual** (string, não boolean). Filtro `== "TRUE"` é defensivo e idempotente; mantenha por robustez se o dataset evoluir.

3. **`orgao_responsavel` precisa de normalização** — o CSV tem inconsistências de casing: `"COMLURB"`, `"Rio Luz"`, `"RIOLUZ"`, `"CET-Rio"`, etc. Use a tabela de normalização abaixo. Há 91 linhas com `orgao_responsavel` vazio.

## Schema completo

| Coluna | Tipo | Descrição |
|---|---|---|
| `id_resposta_ocorrencia` | int | ID único da observação |
| `logradouro` | str | Rua/avenida (não-vazio) |
| `numero_porta` | str | Número (pode ser vazio) |
| `referencia` | str | Ponto de referência (frequentemente vazio) |
| `coordenada_x` | float | **LATITUDE** (axis swap!) |
| `coordenada_y` | float | **LONGITUDE** (axis swap!) |
| `observacao` | str | Observações livres (geralmente vazio) |
| `endereco_informado` | str | `TRUE`/`FALSE` |
| `valido` | str | Status de validação |
| `id_bairro`, `bairro_nome` | int/str | Bairro administrativo |
| `id_subarea`, `subarea_nome` | int/str | Subárea operacional (não-padronizada com `nome_subar` do shapefile) |
| `id_tipo_pessoa`, `tipo_pessoa_descricao` | int/str | Perfil de pessoa em situação de rua (PSR) — só preenchido em fatores PSR |
| `id_ocupacao_pessoa`, `ocupacao_pessoa_descricao` | int/str | Ocupação observada (PSR) |
| `id_tipo_frequencia`, `tipo_frequencia_descricao` | int/str | Frequência da ocupação |
| `ocupacao_drogas`, `ocupacao_drogas_descricao` | str | Indicador de uso de drogas |
| `id_item_praca`, `item_praca_descricao` | int/str | Item urbano (banco, lixeira) |
| `id_tipo_ocorrencia` | int | Código do tipo de fator |
| **`tipo_ocorrencia_descricao`** | str | Categoria do fator (texto humano) — **use esta para classificar** |
| `tipo_ocorrencia_ativo` | str | `"TRUE"` (sempre, no dataset atual) |
| **`orgao_responsavel`** | str | Órgão municipal responsável — **precisa de normalização** |
| `ocorrencia_informacao` | str | Instrução textual para o agente de campo (longa, HTML embutido) |
| `id_orgao_ocorrencia`, `ocorrencia_orgao_nome`, `codigo_ocorrencia_orgao` | int/str | Identificadores de protocolo |

## Categorias (`tipo_ocorrencia_descricao`) — frequência no dataset

Top 20 categorias (das ~30 distintas):

| # | Qtd | Categoria |
|---|---|---|
| 1 | 327 | Vegetação encobrindo iluminação pública |
| 2 | 285 | Pessoas em situação de rua |
| 3 | 213 | Vegetação obstruindo a visibilidade do passeio |
| 4 | 204 | Área mal iluminada com circulação de pedestres |
| 5 | 191 | Ponto de retenção do tráfego |
| 6 | 140 | Comércio irregular obstruindo a visibilidade do passeio |
| 7 | 100 | Estacionamento irregular forçando pedestres à pista |
| 8 | 84 | Motocicletas trafegando no passeio |
| 9 | 68 | Veículos de grande porte obstruindo a visibilidade |
| 10 | 63 | Calçada estreita forçando pedestres à pista |
| 11 | 62 | Sem ocorrência |
| 12 | 56 | Cena de uso de drogas |
| 13 | 49 | Vãos ou cavidades usados como esconderijo |
| 14 | 40 | Ponto de ônibus com histórico de vandalismo |
| 15 | 36 | Mobiliário/estrutura servindo de esconderijo |
| 16 | 29 | Praças e Parques |
| 17 | 27 | Área mal iluminada com parada de veículos |
| 18 | 25 | Lixo/entulho forçando pedestres à pista |
| 19 | 25 | Mobiliário urbano desviando pedestres para a pista |
| 20 | 24 | Mobiliário abandonado servindo de esconderijo |

### Agrupamento para as 8 categorias do anexo (briefing pg 15)

O anexo do briefing usa **8 famílias** de fator. Mapeie cada `tipo_ocorrencia_descricao` para uma:

| Família do anexo | `tipo_ocorrencia_descricao` que entra |
|---|---|
| **Pessoas em situação de rua** | "Pessoas em situação de rua" |
| **Vegetação** | "Vegetação encobrindo iluminação pública", "Vegetação obstruindo a visibilidade do passeio" |
| **Iluminação Pública** | "Área mal iluminada com circulação de pedestres", "Área mal iluminada com parada de veículos" |
| **Obstrução de via** | "Calçada estreita forçando pedestres à pista", "Estacionamento irregular forçando pedestres à pista", "Mobiliário urbano desviando pedestres para a pista", "Veículos de grande porte obstruindo a visibilidade" |
| **Retenção do tráfego** | "Ponto de retenção do tráfego", "Motocicletas trafegando no passeio" |
| **Esconderijos** | "Vãos ou cavidades usados como esconderijo", "Mobiliário/estrutura servindo de esconderijo", "Mobiliário abandonado servindo de esconderijo" |
| **Lixo e Entulho** | "Lixo/entulho forçando pedestres à pista" (procurar variantes de "lixo" e "entulho") |
| **Comércio irregular** | "Comércio irregular obstruindo a visibilidade do passeio" |

Outras categorias ("Cena de uso de drogas", "Praças e Parques", "Sem ocorrência", etc.) ficam fora das 8 famílias do anexo — incluir em seção complementar ou ignorar conforme contexto.

## Órgãos — normalização

```python
ORGAO_NORMALIZE = {
    "RIO LUZ": "RioLuz", "RIOLUZ": "RioLuz", "RIO-LUZ": "RioLuz", "Rio Luz": "RioLuz",
    "COMLURB": "Comlurb",
    "SECONSERVA": "Seconserva",
    "SEOP": "SEOP",
    "SMAS": "SMAS",
    "CET-RIO": "CET-Rio", "CET RIO": "CET-Rio", "CET-Rio": "CET-Rio",
    "GM-RIO": "GM-Rio", "GMRIO": "GM-Rio", "GUARDA MUNICIPAL": "GM-Rio", "GM-Rio": "GM-Rio",
    "SMTR": "SMTR",
}

def normalize_orgao(raw: str) -> str | None:
    if not raw or not raw.strip():
        return None
    return ORGAO_NORMALIZE.get(raw.strip().upper(), raw.strip())
```

Distribuição no dataset (após normalização):
- Comlurb: 583
- SMAS: 341
- SEOP: 308
- RioLuz: 231
- Seconserva: 216
- CET-Rio: 191
- (vazio): 91
- GM-Rio: 84
- SMTR: 40

## Receita: filtrar fatores por área FM

```python
import csv
import shapefile
from shapely.geometry import Polygon, Point

# Pré-requisito: já resolveu o polígono da área (ver poligonos-fm.md)
# Exemplo: poly = polys["Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria"]

def filtrar_fatores_por_poligono(poly, csv_path="dados/fatores_urbanos.csv"):
    """Retorna lista de dicts dos fatores ativos dentro do polígono."""
    resultados = []
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["tipo_ocorrencia_ativo"] != "TRUE":
                continue
            try:
                lat = float(row["coordenada_x"])  # ← axis swap
                lng = float(row["coordenada_y"])  # ← axis swap
            except (ValueError, KeyError):
                continue
            if poly.contains(Point(lng, lat)):    # Shapely: (x=lng, y=lat)
                resultados.append(row)
    return resultados
```

## Receita: agrupar fatores filtrados por órgão

```python
from collections import defaultdict

def agrupar_por_orgao(fatores: list[dict]) -> dict[str, list[dict]]:
    out = defaultdict(list)
    for f in fatores:
        orgao = normalize_orgao(f["orgao_responsavel"])
        if orgao:
            out[orgao].append(f)
    return dict(out)
```

## Receita: agrupar por família do anexo

```python
FAMILIA_PSR = {"Pessoas em situação de rua"}
FAMILIA_VEGETACAO = {
    "Vegetação encobrindo iluminação pública",
    "Vegetação obstruindo a visibilidade do passeio",
}
FAMILIA_ILUMINACAO = {
    "Área mal iluminada com circulação de pedestres",
    "Área mal iluminada com parada de veículos",
}
FAMILIA_OBSTRUCAO_VIA = {
    "Calçada estreita forçando pedestres à pista",
    "Estacionamento irregular forçando pedestres à pista",
    "Mobiliário urbano desviando pedestres para a pista",
    "Veículos de grande porte obstruindo a visibilidade",
}
FAMILIA_RETENCAO = {
    "Ponto de retenção do tráfego",
    "Motocicletas trafegando no passeio",
}
FAMILIA_ESCONDERIJOS = {
    "Vãos ou cavidades usados como esconderijo",
    "Mobiliário/estrutura servindo de esconderijo",
    "Mobiliário abandonado servindo de esconderijo",
}
FAMILIA_COMERCIO = {"Comércio irregular obstruindo a visibilidade do passeio"}
# Lixo: procurar por substring porque a categoria exata pode variar

FAMILIAS = {
    "Pessoas em situação de rua": FAMILIA_PSR,
    "Vegetação": FAMILIA_VEGETACAO,
    "Iluminação Pública": FAMILIA_ILUMINACAO,
    "Obstrução de via": FAMILIA_OBSTRUCAO_VIA,
    "Retenção do tráfego": FAMILIA_RETENCAO,
    "Esconderijos": FAMILIA_ESCONDERIJOS,
    "Comércio irregular": FAMILIA_COMERCIO,
}

def classificar_familia(tipo_descricao: str) -> str | None:
    if "lixo" in tipo_descricao.lower() or "entulho" in tipo_descricao.lower():
        return "Lixo e Entulho"
    for familia, cats in FAMILIAS.items():
        if tipo_descricao in cats:
            return familia
    return None  # categoria fora das 8 do anexo
```

## Perguntas que esta fonte responde

- Quais fatores urbanos estão presentes em uma área FM?
- Quais órgãos municipais são responsáveis por mitigar fatores criminógenos em uma área?
- Quais ruas têm pontos críticos de iluminação / vegetação / PSR / etc.?
- Plano de ação por órgão (lista de fatores que cada órgão precisa resolver).

Não responde sozinha: dinâmica criminal, hotspots de crime, rotas de fuga. Para esses, combine com Disque Denúncia / RELINTs / ocorrências (V2).
