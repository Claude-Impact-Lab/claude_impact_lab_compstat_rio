# Reference: Domínio territorial de ORCrim

Camada de **dinâmica criminal geoespacial** — mapeia quais territórios (comunidades, favelas) estão sob controle de cada organização criminosa (ORCrim). Essencial para contextualizar hotspots de crime e orientar a rota da FM (P1): um trecho crítico em território de facção exige abordagem tática diferente de uma área de Milícia.

## Localização e formato

- **Arquivo:** `dados/outros dados/dominio_territorial - Extração 1.csv`
- **Encoding:** UTF-8
- **Separador:** `,` (vírgula padrão)
- **Decimal:** `.` (ponto)
- **1.628 linhas** (territórios mapeados no Estado do RJ).

## ⚠ Gotchas

1. **`geometria` é WKT POLYGON**, não POINT — use `shapely.wkt.loads()`, não `Point()`.
2. **Cobertura estadual**, não só Rio capital — sempre filtre os polígonos que intersectam o polígono da área FM antes de qualquer análise.
3. **Sem axis swap** — a `geometria` WKT tem a ordem correta `(lng lat)` como padrão WKT.
4. **Reprojete antes de calcular interseções precisas** — `poly.intersection()` em EPSG:4326 funciona para point-in-polygon, mas para área de sobreposição (%) use EPSG:31983.

## Schema

| Coluna | Tipo | Descrição |
|---|---|---|
| `nome_territorio` | str | Nome da comunidade/morro (caixa alta) |
| `dominio_orcrim` | str | Organização criminosa dominante |
| `geometria` | str | WKT `POLYGON(lng lat, ...)` — EPSG:4326 |

## Distribuição por ORCrim (dataset completo)

| ORCrim | Territórios |
|---|---|
| CV (Comando Vermelho) | 903 |
| Milícia | 423 |
| TCP (Terceiro Comando Puro) | 229 |
| ADA (Amigos dos Amigos) | 73 |

## Receita: carregar territórios que intersectam uma área FM

```python
import csv
from shapely.wkt import loads as wkt_loads

def carregar_territorios_da_area(poly_area, csv_path="dados/outros dados/dominio_territorial - Extração 1.csv"):
    """
    Retorna territórios de ORCrim que intersectam o polígono da área FM.
    poly_area: Shapely Polygon (EPSG:4326) da área FM (de poligonos-fm.md).
    """
    resultado = []
    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                poly_terr = wkt_loads(row["geometria"])
            except Exception:
                continue
            if poly_area.intersects(poly_terr):
                resultado.append({
                    "nome": row["nome_territorio"],
                    "orcrim": row["dominio_orcrim"],
                    "poly": poly_terr,
                })
    return resultado
```

## Receita: classificar um hotspot por ORCrim

```python
from shapely.geometry import Point

def orcrim_do_hotspot(lat, lng, territorios):
    """
    Retorna a ORCrim que controla o ponto (lat, lng), ou None se fora de territórios mapeados.
    territorios: lista retornada por carregar_territorios_da_area().
    """
    pt = Point(lng, lat)  # Shapely: (x=lng, y=lat)
    for t in territorios:
        if t["poly"].contains(pt):
            return t["orcrim"], t["nome"]
    return None, None
```

## Receita: resumo de ORCrim por área FM

```python
from collections import Counter

def resumo_orcrim(territorios):
    """Conta territórios por ORCrim dentro da área FM."""
    c = Counter(t["orcrim"] for t in territorios)
    return c.most_common()
```

## Como usar em P1 (rota FM × hotspots)

Para cada hotspot top-N identificado em `ocorrencias.md`:

```python
for hotspot_lat, hotspot_lng in top_hotspots:
    orcrim, nome_terr = orcrim_do_hotspot(hotspot_lat, hotspot_lng, territorios)
    # adicionar coluna "ORCrim" na tabela de trechos críticos
```

Hotspot em território de facção → recomendar patrulha com apoio e inteligência prévia.
Hotspot em área sem ORCrim mapeado → abordagem padrão.

## Perguntas que esta fonte responde

- Qual facção controla o entorno de um hotspot de crime?
- Há sobreposição de territórios de ORCrim com a mancha criminal da área FM?
- O patrulhamento da FM passa por territórios dominados por qual organização criminosa?
- Qual a distribuição de ORCrim dentro de cada área FM?

Não responde sozinha: volume de crime, modus operandi, horário. Sempre combine com `ocorrencias.md` para validar sobreposição real com a mancha criminal.
