# Pergunta norteadora P1: Hotspots × Rota da FM

## Pergunta exata (briefing pg 12 / pg 6)

> *Locais de maior incidência criminal estão coincidindo com a rota da FM?*

E mais detalhado (briefing pg 6, seção 7.3):

> *Qual deve ser a rota da FM, com base nos locais de maior incidência criminal? A IA pode sugerir uma rota, pontuando os trechos mais críticos.*

## Lente de segurança pública

A pergunta **só faz sentido sobre a sobreposição** entre hotspots de crime e a capacidade de monitoramento/patrulhamento da FM. Câmera num lugar sem crime ≠ problema. Hotspot sem câmera ≠ ponto cego.

## Input

Nome da área FM (ex: "Botafogo", "Centro", "Bangu").

## Data references a consultar (ordem obrigatória)

1. **`fontes-de-dados/references/poligonos-fm.md`** — resolver nome → polígono + nome canônico.
2. **`fontes-de-dados/references/ocorrencias.md`** — carregar roubos 2020–2024 dentro do polígono; computar hotspots por grid 50m.
3. **`fontes-de-dados/references/cameras.md`** — carregar câmeras da área (por `nome_area_fm` canônico); usar como proxy de rota.

## Proxy adotado para "Rota da FM"

A coluna `id_trecho` da câmera identifica trechos urbanos cobertos. A "rota" é definida operacionalmente pela distribuição das câmeras:

- **Rota = polígono da área filtrado por trechos com câmera** (raio de 100m por câmera, união de buffers).
- Trechos sem câmera = pontos cegos da rota.
- Hotspot dentro de raio de câmera = "coberto"; fora = "descoberto".

## Procedimento

### Passo 1: Resolver área → polígono + nome canônico

Use `poligonos-fm.md` (seção "Aliases comuns"). Guarde o nome canônico — `cameras.md` precisa dele para filtrar.

### Passo 2: Carregar e binar ocorrências

```python
ocorrencias = carregar_ocorrencias(poly, ano_min=2020, ano_max=2024)
bins = hotspots_grid(ocorrencias, cell_size_m=50)
# top 10 células = trechos críticos
top_hotspots = bins[:10]
```

Para cada célula no top-N, recupere o **logradouro mais frequente** das ocorrências dentro dela (informa qual rua é).

### Passo 3: Carregar câmeras da área

```python
cameras = carregar_cameras_da_area(nome_canonico)
```

### Passo 4: Cruzar — coberto vs descoberto

```python
cobertas, descobertas = crimes_cobertos_por_cameras(ocorrencias, cameras, raio_m=100)
pct_cobertura = 100 * len(cobertas) / len(ocorrencias) if ocorrencias else 0
```

E para cada hotspot top-N:
- distância ao câmera mais próxima
- classificar como **coberto** (≤100m), **borda** (100–200m), **ponto cego** (>200m).

### Passo 5: Diagnóstico

Resposta para a pergunta "rota coincide com hotspots?":

- **Sim** se ≥80% das ocorrências estão a ≤100m de uma câmera **E** os top-5 hotspots não são pontos cegos.
- **Parcialmente** se 60–80% de cobertura **ou** 1–2 top-hotspots são pontos cegos.
- **Não** se <60% de cobertura **ou** ≥3 top-hotspots são pontos cegos.

Sempre cite números: "X% das ocorrências cobertas, Y top-hotspots em ponto cego (Rua Z)".

### Passo 6: Recomendação operacional

Para cada ponto cego no top-5, sugira:
- **Curto prazo (FM):** patrulha dirigida no trecho (citar dia/hora se análise temporal apontar — pode complementar com P2).
- **Médio prazo (infra):** instalação de nova câmera no trecho descoberto.

## Formato de saída (markdown)

```markdown
# Pergunta P1 — Hotspots × Rota da FM

**Área:** [Nome amigável]
**Período analisado:** 2020–2024
**Ocorrências analisadas:** [N] roubos
**Câmeras instaladas:** [M]

## Diagnóstico

**Resposta:** [Sim / Parcialmente / Não]

[Parágrafo com X% de cobertura, número de hotspots em ponto cego, exemplos concretos com nome de rua.]

## Top 5 trechos críticos

| Rank | Logradouro principal | Ocorrências | Câmera ≤100m | Status |
|---|---|---|---|---|
| 1 | [Rua / Av] | [N] | [Sim/Não] | [Coberto / Borda / Ponto cego] |
| 2 | ... | ... | ... | ... |
| ... | | | | |

## Ações sugeridas para pontos cegos

### Patrulhamento (FM)
- [Logradouro, com referência ao horário de pico se relevante]
- ...

### Infraestrutura
- Instalar câmeras em [trechos] — prioridade [alta/média] com base em volume de crime.
```

## Critérios de qualidade

- Cita logradouros reais (não diz só "trecho crítico 1").
- Cobertura % é numérica e fundamentada.
- Hotspots ranqueados por volume de crime, não por área geográfica.
- Recomendação cita órgão (FM para patrulha, Secretaria de Segurança/concessionária para câmera).

## Notas

- O raio de 100m por câmera é proxy conservador. Se o usuário quiser ajustar, parametrizar `raio_m`.
- Para áreas sem polígono real (Bangu, Lauro Müller): usar bounding box das próprias câmeras como polígono sintético. Avisar o usuário desta limitação no diagnóstico.
