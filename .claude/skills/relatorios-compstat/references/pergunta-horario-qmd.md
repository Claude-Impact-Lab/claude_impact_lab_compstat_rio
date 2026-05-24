# Pergunta norteadora P2: Horário de incidência × QMD

## Pergunta exata (briefing pg 12 / pg 7)

> *Horário de maior incidência criminal está coincidindo com a QMD (Quadro de Movimentação Diária)?*

E mais detalhado (briefing pg 7, seção 7.3):

> *Qual deve ser o horário de patrulhamento da FM, com base no horário de maior incidência criminal? A IA pode fazer sugestões de horários e dias que devem ser priorizados na cobertura.*

## Lente de segurança pública

O recurso da FM é finito (600 agentes para 22 áreas — briefing pg 7). A pergunta operacional é: **está coberto o horário onde efetivamente o crime ocorre?** Hora sem crime ≠ hora útil de patrulhamento.

## Input

Nome da área FM (ex: "Botafogo") **e opcionalmente** o QMD atual ("FM cobre 06h–22h hoje"). Se o usuário não informar QMD, assumir **default `06h–22h` todos os dias** e sinalizar a suposição no diagnóstico.

## Data references a consultar (ordem obrigatória)

1. **`fontes-de-dados/references/poligonos-fm.md`** — resolver nome → polígono.
2. **`fontes-de-dados/references/ocorrencias.md`** — carregar roubos 2020–2024 dentro do polígono; computar distribuição temporal dia × hora.

Não consultar Disque/RELINTs aqui — a P2 é puramente quantitativa. Para horário + dinâmica criminal, ver P3.

## Procedimento

### Passo 1: Resolver área → polígono

Use `poligonos-fm.md`.

### Passo 2: Carregar ocorrências e binar por dia × hora

```python
ocorrencias = carregar_ocorrencias(poly, ano_min=2020, ano_max=2024)
grid = temporal_dia_hora(ocorrencias)  # Counter[(dow, hora)] -> count
pico = pico_horario(grid)
```

### Passo 3: Identificar período predominante

A partir de `pico["top_horas"]`:

- **Período predominante** = janela contínua que acumula ≥60% das ocorrências. Ex: "17h–22h concentra 62% dos roubos".
- **Dia/horário crítico** = (dow, hora) com maior count absoluto. Converter dow para nome ("segunda", "terça", ...).
- **Sazonalidade semanal:** se algum dia da semana concentra >25% do total, destacar (ex: "sextas e sábados respondem por 31% — fim de semana com elevação noturna").

### Passo 4: Comparar com QMD informada (ou default)

```python
def cobertura_vs_pico(grid, qmd_horas={6,7,...,21,22}):
    """Soma ocorrências dentro vs fora da QMD."""
    dentro = sum(c for (dow, h), c in grid.items() if h in qmd_horas)
    fora = sum(c for (dow, h), c in grid.items() if h not in qmd_horas)
    return dentro, fora
```

Calcular:
- **% de crime dentro da janela QMD** (cobertura efetiva).
- **% fora** = janela onde FM não está patrulhando mas há crime.
- Identificar **horas críticas fora da QMD** (ex: "00h tem 8% do crime mas não tem cobertura").

### Passo 5: Diagnóstico

- **Sim** se ≥80% das ocorrências estão dentro da janela QMD **E** pico está coberto.
- **Parcialmente** se 60–80% dentro **ou** o pico não está coberto.
- **Não** se <60% dentro **ou** pico em horário sem cobertura.

### Passo 6: Recomendação de ajuste

- Sugerir **expansão ou deslocamento** da janela QMD para cobrir o pico real.
- Considerar **distribuição por dia**: se pico é nos fins de semana, sugerir reforço sex/sáb/dom em vez de uniforme.

## Formato de saída (markdown)

```markdown
# Pergunta P2 — Horário de Incidência × QMD

**Área:** [Nome amigável]
**Período analisado:** 2020–2024
**Ocorrências analisadas:** [N]
**QMD considerada:** [horário, ex: "06h–22h, todos os dias (default)" ou o informado]

## Diagnóstico

**Resposta:** [Sim / Parcialmente / Não]

[Parágrafo: pico está em X-Yh, dia Z; cobertura QMD captura W% do crime; janela crítica fora da QMD é A-Bh, com C% das ocorrências.]

## Heatmap textual: ocorrências por dia × hora

|       | 00 | 01 | ... | 22 | 23 |
|---|---|---|---|---|---|
| **Seg** | n | n | ... | n | n |
| **Ter** | ... | | | | |
| ... | | | | | |

(Pode ser uma matriz menor mostrando só as horas com volume relevante, se >50% das células forem zero.)

## Período predominante e críticos

- **Período predominante:** [HHh–HHh] (concentra X% das ocorrências)
- **Dia/horário crítico:** [Dia da semana], [HH]h (pico absoluto de N ocorrências)
- **Sazonalidade semanal:** [dias com elevação, se houver]

## Ações sugeridas

### Ajuste de QMD
- **Atual:** [janela]
- **Sugerida:** [nova janela]
- **Justificativa:** [N ocorrências/ano ficam fora da janela atual]

### Distribuição semanal
- [Reforço em dias específicos se aplicável]
```

## Critérios de qualidade

- Heatmap baseado em dados reais (não tabela vazia).
- Pico citado com dia E hora (não só "à noite").
- % dentro/fora QMD numéricos.
- Suposição de QMD default é sinalizada explicitamente; usuário pode reexecutar com outro valor.

## Notas

- 22 linhas (~0.02%) têm `data`/`hora` vazios e devem ser descartadas — não enviesa o resultado.
- 1% das ocorrências têm ano fora de 2020–2024 (ruído histórico) — já filtrado pelo `ano_min`/`ano_max`.
- Heatmap pode ser substituído por gráfico ASCII (`█▓▒░`) se o ambiente suportar.
