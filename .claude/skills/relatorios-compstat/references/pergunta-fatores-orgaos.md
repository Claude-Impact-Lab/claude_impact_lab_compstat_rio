# Pergunta norteadora P4: Fatores urbanos × Órgãos responsáveis

## Pergunta exata (briefing pg 12 / anexo pg 15)

> *Fatores relevantes para o crime estão sendo resolvidos pelos órgãos complementares?*

E mais detalhado (briefing pg 7, seção 7.3):

> *Como os órgãos devem resolver os fatores urbanos relevantes? A IA pode sugerir ações a serem tomadas pelos órgãos municipais para resolver os fatores urbanos (ex: Comlurb deve realizar podas na Rua X; SECONSERVA deve substituir o tapume por gradil para aumentar a visibilidade na Praça Y), priorizando aqueles que são mais relevantes para o crime.*

## Lente de segurança pública (crítica)

**Fator urbano isolado não é problema de segurança.** Iluminação ruim numa rua sem ocorrências é problema de iluminação, não de segurança pública. O que importa é a **sobreposição** entre fator urbano e mancha criminal.

A palavra-chave do briefing é "**fatores relevantes para o crime**" — ou seja, **só os que coincidem com hotspots**. Listar todos os fatores diluiria a prioridade operacional e desviaria recursos dos órgãos. Esta versão de P4 (V2) sempre **prioriza por sobreposição com ocorrências**.

## Input

Uma área FM (string em linguagem natural — ex: "Botafogo", "Bangu", "Lauro Müller").

## Data references a consultar (ordem obrigatória)

1. **`fontes-de-dados/references/poligonos-fm.md`** — resolver nome da área → polígono. Etapa 0.
2. **`fontes-de-dados/references/fatores-urbanos.md`** — filtrar registros de `fatores_urbanos.csv` dentro do polígono; normalizar órgão; classificar por família do anexo.
3. **`fontes-de-dados/references/ocorrencias.md`** — carregar roubos 2020–2024 dentro do polígono. **Usado para overlay**: para cada fator, contar crimes dentro de 100m.

## Procedimento

### Passo 1: Resolver área → polígono

Use a receita "resolver nome de área → polígono" de `poligonos-fm.md`. Se a área for `bangu-calcadao` ou `lauro-muller` (sem polígono no shapefile), avise o usuário que para essas áreas não tem polígono real e pergunte se aceita seguir com bbox sintético (ou pule).

### Passo 2: Filtrar fatores E ocorrências dentro do polígono

```python
fatores = filtrar_fatores_por_poligono(poly)               # fatores-urbanos.md
ocorrencias = carregar_ocorrencias(poly, ano_min=2020)     # ocorrencias.md
```

Se `fatores` vier vazio, reportar e parar — área sem cobertura do levantamento de fatores.
Se `ocorrencias` vier vazio (improvável mas possível), reportar e marcar diagnóstico como "baixíssima incidência criminal — fatores listados são informativos, não prioridade".

### Passo 3: Score de relevância criminal por fator

Para cada fator, computa quantos roubos ocorreram em 100m. **Este é o critério de prioridade** — fator com 0 crimes próximos não é problema de segurança.

```python
def pontuar_fator(fator, ocorrencias, raio_m=100):
    """Conta ocorrências de roubo dentro de raio_m do fator."""
    lat = float(fator["coordenada_x"])  # axis swap!
    lng = float(fator["coordenada_y"])
    return conta_crimes_no_raio(lat, lng, ocorrencias, raio_m=raio_m)

for f in fatores:
    f["_score_crime"] = pontuar_fator(f, ocorrencias)
```

### Passo 4: Agrupar por família + órgão, mantendo o score

Para cada fator:
- `classificar_familia(row["tipo_ocorrencia_descricao"])` → família do anexo.
- `normalize_orgao(row["orgao_responsavel"])` → órgão canônico.
- Manter `_score_crime` agregado por família.

```python
# família → {órgão, contagem_total, contagem_relevante, score_total, logradouros_top}
por_familia = {
    "Vegetação": {
        "orgao": "Comlurb",
        "total": 48,
        "relevantes": 31,  # com ≥1 crime em 100m
        "score": 280,      # soma de _score_crime
        "logradouros": [("Rua Voluntários da Pátria", 18), ...],
    },
    # ...
}
```

### Passo 5: Priorizar e filtrar

Antes de sintetizar:
- **Inclua** famílias com `score > 0` (algum fator tem crime próximo).
- **Inclua** famílias com `relevantes / total >= 0.3` (≥30% dos fatores afetam segurança).
- **Marque como "informativa"** (não-prioritária) qualquer família com `score == 0` — mantém na tabela mas sinaliza baixa prioridade.

### Passo 6: Sintetizar descrição por família

Para cada família **relevante** (score > 0 ou ≥30% dos fatores próximos a crime), escrever 1 parágrafo curto que:
- Cite quantos pontos do fator foram identificados e **quantos estão a ≤100m de roubos** (foco em segurança).
- Liste os 2–3 logradouros mais frequentes (ranqueados por número de crimes próximos, não só quantidade do fator).
- Use prosa em pt-BR.

Exemplo: *"Identificados 48 pontos de vegetação encobrindo iluminação pública na área; **31 deles concentram 280 roubos em 100m**. Os trechos mais críticos estão em Rua Voluntários da Pátria, Rua Nelson Mandela e Rua Real Grandeza, onde a vegetação cria zonas de baixa visibilidade noturna sobrepostas à mancha criminal."*

Para famílias **informativas** (score = 0), parágrafo curto: *"Sem sobreposição com mancha criminal — fator existe mas não impacta segurança."*

### Passo 7: Inferir ação sugerida por órgão

Use a matriz padrão (a mesma do CLAUDE.md / anexo pg 15):

| Família | Ação típica | Órgão |
|---|---|---|
| Pessoas em situação de rua | Abordagem social e assistência à PSR | SMAS |
| Iluminação Pública | Manutenção de postes apagados, instalação de novas luminárias | RioLuz |
| Vegetação | Poda nos trechos definidos | Comlurb |
| Obstrução de via | Remoção de estruturas irregulares, fiscalização de estacionamento e comércio | Seconserva, SEOP |
| Retenção do tráfego | Fiscalização e ordenamento de circulação | CET-Rio, GM-Rio, SEOP |
| Esconderijos | Apresentação de alternativas (gradil, fechamento de vãos) | Seconserva |
| Lixo e Entulho | Retirada de lixo e entulho | Comlurb |
| Comércio irregular | Remoção de ambulantes, ordenamento | SEOP |

A ação sugerida deve ser **específica**: cite logradouros que têm score de crime alto e a métrica ("31 pontos com 280 roubos em 100m", "5 luminárias críticas", etc.). Vago não ajuda; ação em rua sem crime tampouco.

## Formato de saída (markdown)

Estrutura final que você deve devolver ao usuário:

```markdown
# Pergunta P4 — Fatores Urbanos × Órgãos Responsáveis

**Área:** [Nome amigável]
**Fatores identificados:** [N] pontos ativos.
**Sobreposição com mancha criminal:** [M] fatores (=[X%]) coincidem com hotspots de roubo (≤100m).
**Ocorrências analisadas:** [K] roubos 2020–2024.

## Diagnóstico

**Resposta:** [Sim / Parcialmente / Não]

[Parágrafo de 3-5 frases: os fatores que de fato afetam segurança (com crime próximo) estão sendo endereçados? Lembre que o CSV mostra fatores ATIVOS = não-resolvidos. Cite qual órgão tem maior demanda CRÍTICA (score alto, não só volume bruto). Diferencie "fator existe" de "fator é problema de segurança".]

## Tabela de fatores relevantes para segurança

(ordenada por score de crime descendente; só famílias com score > 0 entram aqui)

| Fator identificado | Descrição | Crimes próximos | Responsável |
|---|---|---|---|
| Vegetação | [Texto: N pontos, M com crime ≤100m, top logradouros] | [score] | Comlurb |
| Iluminação Pública | [Texto] | [score] | RioLuz |
| Pessoas em situação de rua | [Texto] | [score] | SMAS |
| ... | | | |

## Fatores informativos (sem sobreposição com crime)

| Família | N pontos | Observação |
|---|---|---|
| [Família] | [N] | Sem hotspot em 100m — fator existe mas não é prioridade de segurança. |

## Ações sugeridas por órgão (prioridade por sobreposição)

### Comlurb (prioridade [alta/média])
- [Ação específica com logradouro de score alto + N crimes próximos]
- ...

### RioLuz (prioridade [alta/média])
- ...

### [outros órgãos relevantes]
```

## Critérios de qualidade

- Cita pontos concretos (rua, quantidade, crimes próximos) — não generalidades.
- Diagnóstico distingue **fator existe** de **fator é problema de segurança** (sobreposição com crime).
- Tabela de relevantes ordenada por score; fatores sem crime próximo vão para tabela separada.
- Órgãos seguem normalização (Comlurb, RioLuz, etc.).
- Se a área não tem polígono real (Bangu, Lauro Müller), sinaliza limitação no diagnóstico.

## Notas de implementação

- Use stdlib + `pyshp` + `shapely` (já disponíveis). **Não tente `pandas`/`geopandas`** — não estão instalados.
- O filtro espacial pode ser feito em EPSG:4326 sem reprojeção (point-in-polygon não precisa de unidades métricas).
- Para o overlay (passo 3): a função `conta_crimes_no_raio` em `ocorrencias.md` é O(n_fatores × n_ocorrencias). Em áreas com 100k ocorrências e 200 fatores, isso pode levar segundos — aceitável. Se ficar lento, use STRtree do shapely.
