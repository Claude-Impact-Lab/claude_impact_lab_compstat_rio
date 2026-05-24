---
name: relatorios-compstat
description: Use sempre que o usuário pedir para gerar, montar ou produzir um Relatório Analítico de Área CompStat, Resumo Executivo CompStat, análise de área da Força Municipal (FM), ou responder qualquer pergunta norteadora do briefing — rota da FM vs hotspots criminais, horário de patrulhamento vs QMD, modelo de emprego (moto/pé/viatura) vs dinâmica criminal, fatores urbanos relevantes vs órgãos responsáveis (Comlurb, RioLuz, Seconserva, SEOP, SMAS, CET-Rio, SMTR, GM-Rio). Cobre fraseados como "gere o relatório CompStat", "monte análise da área X", "responda P4", "quais fatores urbanos tem em Botafogo", "qual o plano de ação para área Y", "quais órgãos devem agir em Z".
---

# Relatórios e perguntas CompStat

Este skill é o ponto de entrada para gerar **qualquer artefato analítico** do CompStat Municipal: Relatórios Analíticos de Área, Resumos Executivos, ou respostas individuais às perguntas norteadoras do briefing.

## Dois tipos de output

### (A) Relatório Analítico de Área completo
Documento markdown seguindo o template do anexo do briefing (pgs 11–16). Tem 11 seções: identificação, indicadores, distribuição por tipo, análise temporal, dinâmica criminal, efetivo FM, fatores urbanos, câmeras, plano de ação, resumo executivo + heatmap.
**Reference:** `references/relatorio-analitico-area.md` (**TODO** — orquestra as 4 perguntas + seções de detalhe)

### (B) Resposta a uma pergunta norteadora individual
As 4 perguntas que compõem o Resumo Executivo (briefing pg 12):

| # | Pergunta | Reference |
|---|---|---|
| P1 | Locais de maior incidência criminal coincidem com a rota da FM? | `references/pergunta-rota-fm.md` |
| P2 | Horário de maior incidência criminal coincide com a QMD? | `references/pergunta-horario-qmd.md` |
| P3 | Dinâmica criminal coincide com o modelo de emprego da FM (moto/pé/viatura)? | `references/pergunta-modelo-emprego.md` |
| P4 | Fatores relevantes para o crime estão sendo resolvidos pelos órgãos complementares? | `references/pergunta-fatores-orgaos.md` |

> Todas as 4 perguntas estão implementadas e seguem a **lente de segurança pública**: cruzamento com mancha criminal é obrigatório. Fator isolado, horário isolado, modalidade isolada não viram resposta — só importa o que sobrepõe a hotspots reais.

## Workflow obrigatório

Toda invocação deste skill segue 4 passos:

1. **Identificar o tipo de output.** O usuário quer (A) relatório completo, (B) uma pergunta específica, ou outra variação? Use o vocabulário do prompt para classificar:
   - "relatório", "análise da área", "resumo executivo" → (A) relatório completo
   - "fatores", "órgãos", "Comlurb/RioLuz/etc.", "iluminação", "vegetação", "PSR" → (B) P4
   - "rota", "patrulhamento", "ponto cego", "câmera", "trecho crítico", "facção", "ORCrim", "CV", "milícia", "TCP", "ADA" → (B) P1
   - "horário", "QMD", "cobertura", "pico", "noturno" → (B) P2
   - "moto", "modelo de emprego", "modalidade", "efetivo", "dinâmica criminal", "modus operandi" → (B) P3
   - Se ambíguo, peça uma frase para desambiguar antes de prosseguir.

2. **Ler o reference correspondente.** Apenas o que casa com o intent — não pré-carregue todos.

3. **Seguir a ordem de data references que o reference enumera.** Cada reference lista explicitamente quais arquivos da skill `fontes-de-dados` consultar e em que ordem. Não pule etapas (etapa 0 é sempre resolver o polígono da área).

4. **Aplicar a lente de segurança pública.** Toda síntese precisa cruzar o objeto da pergunta com a mancha criminal:
   - Fator urbano só vira problema se há crime em 100m.
   - Câmera/rota só é cobertura se contém hotspot.
   - Horário/modalidade só é relevante se sobrepõe ocorrência registrada.
   Se a sobreposição for vazia, sinalize "fator/horário/modalidade existe mas não afeta segurança operacional".

5. **Sintetizar e formatar.** Markdown puro. Tabelas seguem o formato do anexo do briefing. Cite a área pelo nome amigável (não pelo `id-curto`). Sempre cite números (X% cobertura, Y crimes em 100m, Z roubos no pico).

## Como rotear (decidindo qual reference ler)

| Intent detectado no prompt | Reference a ler |
|---|---|
| "relatório completo", "análise da área", "documento", "resumo executivo" | `relatorio-analitico-area.md` (TODO) |
| "fatores", "órgão", "responsável", "Comlurb", "RioLuz", "PSR", "iluminação", "vegetação", "plano de ação" | `pergunta-fatores-orgaos.md` |
| "rota", "patrulhamento", "trecho crítico", "ponto cego", "câmera", "hotspot", "facção", "ORCrim", "CV", "milícia" | `pergunta-rota-fm.md` |
| "horário", "pico", "QMD", "cobertura", "noturno", "turno" | `pergunta-horario-qmd.md` |
| "moto", "modalidade", "modelo de emprego", "efetivo", "dinâmica criminal", "modus operandi", "viatura" | `pergunta-modelo-emprego.md` |

## Resolução de área

Antes de ler qualquer reference, certifique-se de ter a **área** identificada. Se o usuário mencionou "Botafogo", "Bangu", "Centro" etc., resolva para o nome canônico via `fontes-de-dados/references/poligonos-fm.md` (seção "Aliases comuns").

Se o usuário não citou área, peça antes de prosseguir — não invente nem use a primeira área da lista.

## Limites de escopo

- **As 4 perguntas norteadoras estão implementadas** (P1, P2, P3, P4).
- **Relatório completo (A) ainda não tem orquestrador (`relatorio-analitico-area.md` é TODO)** — quando o usuário pedir o relatório completo, execute as 4 perguntas em sequência e monte um documento sintetizando-as no formato do anexo (ou avise que o orquestrador estruturado ainda virá).
- Output é markdown — não gera `.docx` nem `.pdf`.
- Não gera mapas/heatmaps (continuam no `project/backend/etl/build_data.py` + frontend).
