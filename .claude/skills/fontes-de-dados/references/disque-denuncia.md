# Reference: Disque Denúncia

Camada **qualitativa anônima** — denúncias da população sobre dinâmica criminal, modus operandi, suspeitos, pontos de uso de drogas, receptação. Junto com RELINTs, é a base da análise de "dinâmica criminal".

## Localização e formato

- **Arquivo:** `dados/disk_denuncia.csv`
- **Encoding:** **`latin1`** (ISO-8859, **NÃO UTF-8**). Default `pd.read_csv` gera mojibake (`SUBST�NCIAS`).
- **Separador:** **`;`** (não vírgula).
- **Decimal:** **`,`** (vírgula em `latitude`/`longitude` — ex: `-22,899555`).
- **83.549 linhas**, 48 colunas (várias duplicadas como alias).

## ⚠ Gotchas

1. **Triple-gotcha de loading:** sem `encoding='latin1'`, `sep=';'`, e tratamento de decimal vírgula nas coordenadas, o parsing quebra silenciosamente.
2. **Colunas duplicadas:** `assuntos.classe`, `classe`, `id_classe` são o mesmo dado em formatos diferentes. Use o set "flat" (`classe`, `tipo`, `assunto_principal`) na maior parte dos casos. As colunas com prefixo `assuntos.tipos.` e `envolvidos.` são para drill-down.
3. **Coordenadas com vírgula como decimal** — converta antes de usar:
   ```python
   lat = float(row["latitude"].replace(",", "."))
   lng = float(row["longitude"].replace(",", "."))
   ```
4. **Não há `id_area_fm`** — filtre por proximidade ao polígono da área (ponto-em-polígono).
5. **Data como string `M/D/YYYY HH:MM:SS`** — formato US, não pt-BR.
6. **`relato_redacted` é o coração da denúncia** — texto livre, em pt-BR, com substituições `[NOME]` para PII. É a fonte de informação qualitativa.

## Schema (resumo do que importa)

| Coluna | Descrição |
|---|---|
| `numero_denuncia` | Identificador externo (formato `NNNN.MM.YYYY`) |
| `id_denuncia` | ID interno numérico |
| `data_denuncia` | `M/D/YYYY HH:MM:SS` — data da denúncia |
| `data_difusao` | `M/D/YYYY HH:MM:SS` — quando foi difundida ao órgão |
| `logradouro`, `bairro_logradouro`, `tipo_logradouro` (`R`/`AV`/etc.) | Localização textual |
| `latitude`, `longitude` | **String com vírgula como decimal** |
| `orgaos.nome` | Órgão de destino (ex: "5 BPM") |
| `classe` (e duplicatas) | Categoria principal: `SUBSTÂNCIAS ENTORPECENTES`, `CRIMES CONTRA O PATRIMÔNIO`, etc. |
| `tipo` (e duplicatas) | Subcategoria: `CONSUMO DE DROGAS`, `TRÁFICO`, `ROUBO`, etc. |
| `envolvidos.*` | Perfil de suspeitos (sexo, idade, vulgo) — frequentemente vazio |
| **`relato_redacted`** | **Texto livre da denúncia em pt-BR** — fonte primária para análise qualitativa |

## Categorias principais (`classe`)

Distribuição aproximada (verificar com query antes de citar exato):

- `SUBSTÂNCIAS ENTORPECENTES` (tráfico, consumo)
- `CRIMES CONTRA O PATRIMÔNIO` (roubo, furto, receptação)
- `MEIO AMBIENTE` (lixo, animais)
- `CONTRA A PESSOA` (ameaça, lesão)
- `OUTROS` (vandalismo, perturbação)

Para **P3 (dinâmica criminal)**, foque em `CRIMES CONTRA O PATRIMÔNIO` + relatos que mencionam "moto", "celular", "transeunte", "fuga".

## Receita: carregar denúncias de uma área

```python
import csv
from shapely.geometry import Point

def carregar_denuncias(poly, csv_path="dados/disk_denuncia.csv"):
    """Filtra denúncias por polígono (poly resolvido via poligonos-fm.md)."""
    out = []
    with open(csv_path, encoding="latin1") as f:    # ← latin1!
        for row in csv.DictReader(f, delimiter=";"):  # ← sep=';'
            try:
                lat = float(row["latitude"].replace(",", "."))   # ← decimal=','
                lng = float(row["longitude"].replace(",", "."))
            except (ValueError, AttributeError):
                continue
            if poly.contains(Point(lng, lat)):
                out.append(row)
    return out
```

## Receita: agregação para dinâmica criminal

Para responder "qual a dinâmica criminal da área X?" (peça-chave da P3):

```python
import re
from collections import Counter

def analisar_dinamica(denuncias):
    """
    Agrupa denúncias e extrai padrões textuais relevantes para segurança pública.
    Foco em CRIMES CONTRA O PATRIMÔNIO + dicas de modus operandi.
    """
    # 1. Filtrar para patrimônio + relatos relevantes
    patrimonio = [d for d in denuncias if "PATRIMÔNIO" in d.get("classe", "")]

    # 2. Contagens
    classes = Counter(d["classe"] for d in denuncias if d.get("classe"))
    tipos = Counter(d["tipo"] for d in denuncias if d.get("tipo"))

    # 3. Sinais textuais em relato_redacted (modalidade criminal)
    relatos = [d["relato_redacted"] for d in denuncias if d.get("relato_redacted")]
    sinais = {
        "moto": sum(1 for r in relatos if re.search(r"\bmoto", r, re.I)),
        "celular": sum(1 for r in relatos if re.search(r"celular", r, re.I)),
        "a_pe": sum(1 for r in relatos if re.search(r"\ba p[eé]\b", r, re.I)),
        "grupo": sum(1 for r in relatos if re.search(r"\bgrupo\b|bando|dupla", r, re.I)),
        "fuga": sum(1 for r in relatos if re.search(r"\bfuga\b|fugir|escapou", r, re.I)),
        "armado": sum(1 for r in relatos if re.search(r"\barmado\b|\barma\b|pistola|revólver", r, re.I)),
        "drogas": sum(1 for r in relatos if re.search(r"\bdrogas?\b|tr[áa]fico", r, re.I)),
    }

    return {
        "total_denuncias": len(denuncias),
        "classes": classes.most_common(),
        "tipos": tipos.most_common(10),
        "modalidade_indicadores": sinais,
        "patrimonio_count": len(patrimonio),
        "amostra_relatos": relatos[:5],  # para citação direta no relatório
    }
```

## ⚠ Lente de segurança pública

Nem toda denúncia é problema de segurança. Denúncias de `MEIO AMBIENTE` (lixo) ou perturbação **não viram problema de segurança** isoladamente. Para a P3 e o relatório, filtre para:

- `CRIMES CONTRA O PATRIMÔNIO` (sempre)
- `CONTRA A PESSOA` (sempre)
- `SUBSTÂNCIAS ENTORPECENTES` **só se** tipo for `TRÁFICO` (consumo isolado é problema de saúde, não segurança operacional)
- **Cruzamento obrigatório:** só destaque dinâmica que sobrepõe à mancha criminal (use `ocorrencias.md` para validar).

## Perguntas que esta fonte responde (ou alimenta)

- Qual a dinâmica criminal da área? (modalidade: pé / moto / armado / grupo)
- Há indícios de receptação? (palavras-chave em `relato_redacted`)
- Rotas de fuga citadas pela população?
- Pontos de uso/tráfico de drogas próximos a hotspots de roubo? (cruzar com `ocorrencias.md`)

Não responde sozinha: localização exata de hotspots (qualitativo ≠ quantitativo), volumes de crime.
