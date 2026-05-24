# Reference: Polígonos das áreas da Força Municipal

## Localização

```
dados/sh_area_forca/
├── areas_forca_municipal.shp       # geometrias (LineString → Polygon)
├── areas_forca_municipal.shx       # índice
├── areas_forca_municipal.dbf       # atributos
├── areas_forca_municipal.prj       # CRS (EPSG:4326)
├── areas_forca_municipal.cpg       # encoding
└── areas_forca_municipal.qmd       # metadata QGIS
```

## Schema do DBF

| Coluna | Tipo | Descrição |
|---|---|---|
| `fid` | N(20) | ID numérico da área (sparso: 2, 9, 10, 11, 12, 14, 19, 20) |
| `nome_subar` | C(254) | Nome canônico da área (string com acentos UTF-8) |

**8 registros** no shapefile. As 9 áreas FM canônicas vêm da combinação shapefile + câmeras (Bangu não tem polígono físico — é sintético, derivado dos pontos de câmera).

## As 9 áreas canônicas

| nome_subar (shapefile) | ID curto | AISP | Bairro |
|---|---|---|---|
| `Rodoviária - Terminal Gentileza - Estação Leopoldina` | `rodoviaria-gentileza` | AISP 5 | São Cristóvão / Santo Cristo |
| `Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria` | `metro-botafogo` | AISP 6 | Botafogo |
| `Jardim de Alah` | `jardim-alah` | AISP 23 | Ipanema / Leblon |
| `Campo Grande: Estação de Trem - Calçadão` | `campo-grande` | AISP 9 | Campo Grande |
| `Rio Sul` (= entorno Botafogo) | (mapeado para `metro-botafogo`) | — | — |
| `Praia de Botafogo - Rua Marquês de Abrantes` | `praia-botafogo` | AISP 2 | Botafogo / Flamengo |
| `Estações São Francisco Xavier - Afonso Pena` | `sfx-afonso-pena` | AISP 6 | Tijuca / Maracanã |
| `Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia` | `presidente-vargas` | AISP 5 | Centro |
| (sintético) `Bangu: Calçadão - Bangu Shopping` | `bangu-calcadao` | AISP 14 | Bangu |
| (não no shapefile) `Rua Lauro Müller – Avenida General Severiano – Avenida Venceslau Brás` | `lauro-muller` | AISP 2 | Botafogo / Urca |

> **Aliases comuns do usuário** que devem ser resolvidos para o nome canônico:
> - "Botafogo" → `metro-botafogo` (a área mais central; se ambíguo, perguntar)
> - "Centro" → `presidente-vargas`
> - "Lauro Müller" / "Lauro Muller" → `lauro-muller`
> - "Bangu" → `bangu-calcadao`
> - "SFX" / "Afonso Pena" → `sfx-afonso-pena`

A fonte autoritativa do mapeamento nome→AISP→bairro está em `project/backend/etl/build_data.py` (`AREA_SHORT`, `AREA_ID`, `AREA_META`). Quando precisar de metadados completos, consulte esse arquivo.

## CRS

- Shapefile: **EPSG:4326** (WGS84, graus de lat/lng).
- Para distâncias/áreas/buffers em **metros**: reprojete para **EPSG:31983** (SIRGAS 2000 UTM 23S).
- Operações de pertinência (`contains`, `within`, `intersects`) podem ser feitas em 4326 sem reprojeção.

⚠ **Convenção de eixos no shapefile:** os pontos são armazenados como `(longitude, latitude)` — convenção shapely/ESRI. Não confunda com `fatores_urbanos.csv`, que tem axis swap (`coordenada_x` é latitude!).

## Bibliotecas disponíveis

Verifique antes de usar (não assuma instaladas):

```bash
python3 -c "import shapefile, shapely; print(shapefile.__version__, shapely.__version__)"
```

O `project/backend/etl/build_data.py` confirma que `pyshp` (módulo `shapefile`) e `shapely` estão disponíveis. `geopandas` **não está instalado**.

## Receita: resolver nome de área → polígono

```python
import shapefile
from shapely.geometry import Polygon, Point

# 1. Carregar shapefile
sf = shapefile.Reader("dados/sh_area_forca/areas_forca_municipal.shp")
fields = [f[0] for f in sf.fields[1:]]  # pular o deletion flag

# 2. Construir índice nome → polygon
polys = {}
for sr in sf.shapeRecords():
    rec = dict(zip(fields, sr.record))
    nome = rec["nome_subar"].strip()
    pts = sr.shape.points  # lista de (lng, lat)
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
    polys[nome] = poly

# 3. Resolver alias do usuário → nome canônico do shapefile
def resolver_area(query: str) -> str:
    """
    Mapeia entrada do usuário ('Botafogo', 'metro-botafogo', etc.) para
    a chave do dict polys. Use os aliases listados acima.
    """
    q = query.lower().strip()
    if "botafogo" in q and "praia" not in q:
        return "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria"
    if "praia" in q and "botafogo" in q:
        return "Praia de Botafogo - Rua Marquês de Abrantes"
    if "campo grande" in q:
        return "Campo Grande: Estação de Trem - Calçadão"
    if "rodoviária" in q or "gentileza" in q:
        return "Rodoviária - Terminal Gentileza - Estação Leopoldina"
    if "jardim" in q and "alah" in q:
        return "Jardim de Alah"
    if "centro" in q or "presidente vargas" in q or "cinelândia" in q:
        return "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia"
    if "sfx" in q or "afonso pena" in q or "francisco xavier" in q:
        return "Estações São Francisco Xavier - Afonso Pena"
    # Bangu e Lauro Müller não estão no shapefile — tratar à parte
    raise KeyError(f"Área '{query}' não tem polígono no shapefile. Use synthetic do build_data.py.")
```

## Receita: filtrar pontos (lat, lng) por polígono

```python
from shapely.geometry import Point

def pontos_dentro(lat_lng_list, poly):
    """Filtra lista de (lat, lng) mantendo só os que estão dentro do polígono."""
    out = []
    for lat, lng in lat_lng_list:
        # Shapely Point é (x, y) = (lng, lat)
        if poly.contains(Point(lng, lat)):
            out.append((lat, lng))
    return out
```

## Perguntas que esta fonte responde

- Quais são as 9 áreas FM e seus nomes canônicos?
- Em qual área um ponto (lat, lng) cai?
- Quais são os metadados administrativos (AISP, bairro) de uma área?
- Qual o polígono de uma área para filtrar outras fontes?

Não responde sozinha nenhuma pergunta de negócio — é sempre etapa 0 de outras queries.
