# PRD — CompStat Rio: Plataforma de Inteligência Criminal

**Versão:** 1.1 · **Data:** 24/05/2026 · **Status:** Protótipo funcional (MVP) com síntese LLM (Claude Opus 4.7)
**Autores:** Equipe Impact Lab · **Stakeholder:** Prefeitura do Rio de Janeiro / Força Municipal

---

## 1. Visão Geral

### 1.1 Problema
As reuniões semanais do **CompStat Municipal** dependem de compilação manual de dados oriundos de cinco silos desarticulados (ocorrências criminais, denúncias anônimas, fatores ambientais, relatórios de inteligência da Força Municipal e polígonos operacionais). Cada relatório demanda horas de trabalho analítico antes da tomada de decisão, atrasando o redirecionamento de policiamento ostensivo e resoluções ambientais.

### 1.2 Solução
**CompStat Rio** é uma plataforma web que automatiza a integração geoespacial e temporal dessas cinco fontes, gerando **Relatórios Analíticos por Área de Atuação da Força Municipal (FM)** com:
- Mancha criminal georreferenciada (heatmap)
- Cruzamento com fatores urbanos catalogados (20 tipos, 8 órgãos responsáveis)
- Padrões temporais (dia/hora) e dinâmica criminal qualitativa
- Identificação de **coincidências de alto risco** (mancha + fator + janela horária + lacuna operacional)
- Plano de ação sugerido por órgão responsável e prioridade

### 1.3 Público-alvo
- **Analistas de inteligência** da Subsecretaria de Segurança Pública
- **Gestores da Força Municipal** (planejamento de QMD — Quadro de Movimento Diário)
- **Órgãos parceiros**: Comlurb, RioLuz, SEOP, SMAS, Seconserva, CET-Rio, GM-Rio, SMTR

### 1.4 Escopo do MVP
9 áreas prioritárias da Força Municipal (de 22 áreas-mãe do CompStat Municipal): Metrô Botafogo, Presidente Vargas, Rodoviária/Gentileza, Campo Grande, SFX Afonso Pena, Praia de Botafogo, Jardim de Alah, Bangu Calçadão, Lauro Müller/Severiano.

---

## 2. Arquitetura

```
┌───────────────────────────────────────────────────────────────┐
│  FRONTEND (React 18 + Vite 6)                                 │
│  • UploadScreen → 6 cards de ingestão                         │
│  • Dashboard → Sidebar (9 áreas) + 6 abas temáticas           │
└──────────────────┬────────────────────────────────────────────┘
                   │ fetch('/data/real.json') ou fallback mock
                   ▼
┌───────────────────────────────────────────────────────────────┐
│  ETL (Python — scripts/build_data.py)                         │
│  • Carrega 5 fontes brutas                                    │
│  • Point-in-polygon (shapely) p/ atribuição a áreas FM        │
│  • Agrega janelas 30/60/90d e por dia/hora                    │
│  • Detecta coincidências (scoring)                            │
│  • Síntese qualitativa via Claude Opus 4.7                    │
│    (scripts/llm_synthesis.py)                                 │
│  • Output: project/frontend/public/data/real.json             │
└──────────────────┬────────────────────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────────────────────┐
│  DADOS PRIMÁRIOS                                              │
│  • dados/df_ocorrencias_tratado.csv  (24 MB)                  │
│  • dados/disk_denuncia.csv           (19 MB, latin-1)         │
│  • dados/fatores_urbanos.csv         (1,3 MB)                 │
│  • relints/*.docx                    (8 RELINTs)              │
│  • sh_area_forca/*.shp               (8 polígonos FM)         │
│  • dados/cameras_areas_fm.csv        (opcional)               │
└───────────────────────────────────────────────────────────────┘
```

### 2.1 Stack
| Camada | Tecnologia |
|---|---|
| UI | React 18.3.1, Vite 6.4.2 |
| Mapa | react-leaflet 4.2.1, leaflet 1.9.4, leaflet.heat 0.2.0 |
| Gráficos | recharts 2.15.0 |
| Ícones | lucide-react 0.469.0 |
| ETL | Python 3.7+, shapely, pyshp |
| Síntese LLM | `anthropic` SDK (Python), Claude **Opus 4.7** com adaptive thinking + structured outputs (`output_config.format` + JSON schema) + prompt caching |
| Estado | React hooks (`useState`, `useMemo`) — sem Redux/Context |
| Dados | JSON estático servido pelo Vite |

---

## 3. Modelo de Dados

### 3.1 Entidade `Área` (unidade central de análise)
```js
{
  id: string,                 // "metro-botafogo"
  name: string,               // Nome completo
  shortName: string,          // Para sidebar
  aisp: string,               // "AISP 6"
  bairro: string,
  center: [lat, lng],         // Centróide
  zoom: number,               // Nível Leaflet
  polygon: [[lat,lng], ...],  // Ring do polígono FM
  risk: "critical"|"high"|"medium",
  kpis: { ocorrencias_30d, ocorrencias_var, fatores_urbanos, denuncias, coincidencias },
  crimePoints: [[lat,lng,intensity], ...],  // 90d para heatmap
  urbanFactors: [{ lat, lng, type, orgao, category }],
  cameras: [[lat,lng], ...],
  temporal: { byDay: [...], byHour: [...] },
  peakHours: string,          // "17h – 20h"
  peakDays: string,           // "Quarta a Sexta"
  executiveSummary: [{ q, a, sources }],
  dynamics: { modusOperandi, suspectProfile, escapeRoutes, receivingPoints, sources },
  coincidences: [...],
  actionPlan: [...]
}
```

### 3.2 Entidade `Coincidência` (output principal)
```js
{
  id: "COIN-001",
  location: string,
  crime: string,              // "18 roubos em 30d, 70% celular"
  factor: string,             // "Comércio irregular + Calçada estreita"
  timeWindow: string,         // "Seg–Sex, 17h–20h"
  operationalGap: string,     // "QMD cessa às 18h; sem câmera no acesso"
  risk: number                // 0–100
}
```
**Classificação:** `risk ≥ 85` crítico (vermelho) · `≥ 75` alto (laranja) · `< 75` médio (ouro).

### 3.3 Entidade `Ação` (plano)
```js
{ responsible, action, justification, priority: "alta"|"media"|"baixa" }
```

### 3.4 Matriz dos 20 Fatores Urbanos
Catálogo cobre 8 órgãos · 7 categorias: Vegetação · Iluminação · Refúgio · Obstrução · Trânsito · PSR (pessoa em situação de rua) · Drogas. Detalhamento completo em `README.md` da raiz e `src/data/mock.js`.

---

## 4. Funcionalidades

### 4.1 Tela de Ingestão — `UploadScreen.jsx`
**Propósito:** onboarding e seleção de modo de dados.

| Item | Detalhe |
|---|---|
| Fontes obrigatórias | Ocorrências (.csv) · Disque Denúncia (.csv) · Fatores Urbanos (.csv) · RELINTs (.docx múltiplos) · Polígonos FM (.shp/.zip/.geojson) |
| Fontes opcionais | Câmeras (.csv) |
| Interações | Drag-and-drop, file picker, remoção (X), barra de progresso |
| Botões | "Pular (mock)" · "Usar dados reais do projeto" (fetch `/data/real.json`) · "Iniciar análise" (habilitado quando obrigatórios completos) |
| Fallback | Se `/data/real.json` ausente → mock + toast informativo |

### 4.2 Dashboard — `App.jsx`
Layout 2 colunas: **Sidebar** (320px, lista das 9 áreas com KPI resumido + risk badge) + **Main** (AreaHeader + Tabs + painel ativo). Header global exibe pill de status do dataset e contagem de fontes.

**Estado global** (React hooks, sem Context/Redux):
- `dataset` ∈ {`'mock'`, `'real'`, `null`}
- `areas`, `sources`, `referenceDate`
- `selectedAreaId`, `activeTab`, `toast`

### 4.3 Aba 1 — Resumo Executivo (`ExecutiveSummary.jsx`)
Lista de 4 Q&A geradas por Claude Opus 4.7 a partir dos KPIs, coincidências, fatores e janela QMD da área. Cada item carrega tags de fontes consultadas. Ex. (Metrô Botafogo): *"O pico de criminalidade está sobreposto à QMD atual da FM? — Não. O pico se concentra entre 19h e 22h (Dom, Seg, Sáb), enquanto a QMD padrão da FM termina às 18h. As 5 coincidências críticas registram explicitamente 'janela noturna fora da QMD'. Fontes: Ocorrências, QMD FM."*

### 4.4 Aba 2 — Heatmap (`HeatmapView.jsx`)
Mapa interativo (Leaflet + CartoDB Voyager). 4 camadas toggleáveis:
1. **Heatmap** de ocorrências (90d) — gradiente azul→ciano→verde→amarelo→vermelho (leaflet.heat: radius 28, blur 22)
2. **Polígono FM** — contorno tracejado azul-marinho (fillOpacity 0.06)
3. **Fatores urbanos** — círculos coloridos por órgão responsável (Comlurb=verde, RioLuz=amarelo, SEOP=roxo, SMAS=rosa, CET-Rio=ciano, GM-Rio=azul royal, SMTR=roxo escuro, Seconserva=magenta) + tooltip com tipo/categoria/órgão
4. **Câmeras** — círculos brancos com borda preta

Strip de evidências no rodapé: contagem de fatores por órgão + total de câmeras + nº de coincidências.

### 4.5 Aba 3 — Análise Temporal (`TemporalAnalysis.jsx`)
**Callout** destacado: "Pico identificado em {peakHours}, principalmente {peakDays}".
**Gráficos (recharts)** lado-a-lado:
- BarChart por dia da semana (Roubo vermelho · Furto ciano)
- LineChart 24h (intervalos de 2h)

Recomendações textuais derivadas (reforço a pé, dupla motorizada, articulação com órgãos antes da janela crítica).

### 4.6 Aba 4 — Dinâmica Criminal (`CriminalDynamics.jsx`)
Grid de 4 cards qualitativos sintetizados por Claude Opus 4.7 a partir dos textos dos RELINTs + amostra de relatos do Disque Denúncia + métricas quantitativas (denúncias com menção a "moto"/"a pé", pico horário, top fatores):
1. **Modus Operandi** (Brain) — padrão de abordagem cruzando contagem de denúncias com texto dos RELINTs
2. **Perfil de Suspeitos** (Target) — explicitamente declara "dados insuficientes" quando RELINTs não detalham
3. **Rotas de Fuga** (Route) — rotas concretas citadas nos RELINTs (ruas, viadutos, acessos a transporte)
4. **Pontos de Receptação** (Store) — pontos concretos ou indicação de ausência de menção

Regra anti-hallucination: o system prompt impede generalização além dos dados do payload. Citações por código de RELINT (`RI_011_2026`, etc.) aparecem no texto.

Strip de evidências: nº de RELINTs, denúncias e ocorrências consultadas (do campo `dynamics.sources`).

### 4.7 Aba 5 — Coincidências (`CoincidencePanel.jsx`)
Cards por coincidência identificada. Cada card:
- Header: `{location} [COIN-NNN]` + risk badge (cor por nível)
- Grid 4 colunas: Mancha Criminal · Fator Urbano · Padrão Horário · Lacuna Operacional

### 4.8 Aba 6 — Plano de Ação (`ActionPlan.jsx`)
Botões: "Pré-popular planilha CompStat" · "Exportar .docx" (ambos mock — geram toast).
Chips de órgãos envolvidos no topo.
Tabela: **Responsável** (chip colorido — enum validado pelo schema: FM/Comlurb/RioLuz/SEOP/SMAS/Seconserva/CET-Rio/GM-Rio/SMTR) · **Ação sugerida** · **Justificativa** · **Prioridade** (chip Alta/Média/Baixa).

Plano gerado por Claude Opus 4.7 a partir das coincidências de alto risco + fatores agrupados por órgão. Regras impostas via system prompt: ≥2 ações da FM ligadas a coincidências críticas, 1 ação por órgão com 2+ fatores, justificativas citando IDs de coincidência (`COIN-XXX`) ou contagem específica de fatores. Prioridade calibrada por risco (≥85 → alta).

---

## 5. Pipeline ETL (`scripts/build_data.py`)

### 5.1 Fluxo
1. **`load_polygons()`** — lê shapefile, calcula bboxes, mapeia para nomes canônicos, gera polígono sintético para Bangu (sem shapefile).
2. **`load_cameras()`** — parse WKT `POINT (lng lat)`, agrupa por `nome_area_fm`.
3. **`load_ocorrencias()`** — descobre `max_date` no CSV, define janelas (30/60/90d), point-in-polygon, agrega por dia/hora/delito; gera contagem 30d e contagem 31–60d para calcular variação %.
4. **`load_denuncias()`** — encoding latin-1, regex para "moto" e "a pé", amostragem de até 3 relatos por área.
5. **`load_fatores()`** — filtra `tipo_ocorrencia_ativo == TRUE`, normaliza nome de órgão (`ORGAO_NORMALIZE`), classifica em 7 categorias.
6. **`load_relints()`** — descompacta DOCX (ZIP), extrai `word/document.xml`, strip de tags, mapeia código `RI_XXX` → `area_id` via `RELINT_AREA`.
7. **`detect_coincidences()`** — score 0–100: base = ocorrências 30d; +1 por fator a ≤60m de hotspot; +20 por lacuna operacional; ajuste por menções em denúncia/RELINT.
8. **Síntese qualitativa via LLM** — para cada área, chama `llm_synthesis.synthesize_executive_summary()`, `synthesize_dynamics()` e `synthesize_action_plan()` (Claude Opus 4.7). Wrappers `llm_or_template_*` em [build_data.py:659-715](scripts/build_data.py#L659-L715) caem para os templates antigos se a chamada falhar (rede, schema reject, sem API key).
9. **Serialização** → `project/frontend/public/data/real.json`.

### 5.2 Filtros geográficos
Descarta pontos fora de `(-23.1 < lat < -22.7, -43.8 < lng < -43.0)` (caixa do município).

### 5.3 Saída esperada
Estrutura final do JSON segue exatamente o schema da §3.1. Inclui também:
- `dataSources`: [{ id, label, records, updated }]
- `referenceDate`: data de referência do dataset

### 5.4 Síntese LLM (`scripts/llm_synthesis.py`)

**Modelo:** Claude **Opus 4.7** (`claude-opus-4-7`).

**Configuração por chamada:**
- `thinking: {type: "adaptive"}` — Opus 4.7 decide profundidade de raciocínio
- `output_config.format` com JSON Schema — formato garantido (frontend nunca recebe shape inválido)
- `output_config.effort: "high"` — recomendado para trabalho intelligence-sensitive
- `cache_control: ephemeral` no system prompt (matriz dos 20 fatores + contexto CompStat)
- `max_tokens: 16000` — folga para adaptive thinking

**System prompt (estável, ~575 tokens):**
- Papel: analista sênior de inteligência criminal do CompStat Rio
- Contexto operacional: FM, QMD, 9 áreas
- Matriz dos 20 fatores urbanos por órgão responsável
- 6 regras de redação: **só usar dados do payload** (anti-hallucination), declarar "dados insuficientes" quando aplicável, PT-BR técnico-operacional, citar órgão correto, RELINTs como fonte autoritativa para qualitativo.

**Schemas JSON enforced:**
| Função | Schema |
|---|---|
| `synthesize_dynamics()` | `{modusOperandi, suspectProfile, escapeRoutes, receivingPoints}` (4 strings obrigatórias) |
| `synthesize_executive_summary()` | `items: [{q, a, sources: [...]}]` |
| `synthesize_action_plan()` | `items: [{responsible (enum 9 órgãos), action, justification, priority (enum)}]` |

**Toggle:** variável de ambiente `COMPSTAT_LLM=0` desliga as chamadas e força o uso dos templates (útil em CI ou para builds offline).

**Custo observado (1 run completo):** 27 chamadas (9 áreas × 3 seções), ~$1-2 em créditos Opus 4.7. Prompt caching atualmente sem hit porque o system prompt (~575 tokens) está abaixo do mínimo cacheável do Opus 4.7 (4096 tokens) — pode ser expandido caso o volume cresça.

---

## 6. Fluxos de Usuário

### UC-1 · Analista carrega dados reais e investiga área crítica
1. Acessa o app → UploadScreen
2. "Usar dados reais do projeto" → carrega `real.json`
3. Sidebar: seleciona "Metrô Botafogo" (badge crítico)
4. Resumo Executivo lê as perguntas norteadoras
5. Heatmap: toggle isolando fatores RioLuz para entender hotspots noturnos
6. Temporal: confirma pico 17h–20h Qua-Sex
7. Coincidências: 4 cards com risks 92/87/81/74
8. Plano de Ação: revisa 8 ações distribuídas entre FM/Comlurb/RioLuz
9. Exporta .docx (mock)

### UC-2 · Gestor explora protótipo sem dados
1. "Pular (mock)" → mock.js carregado
2. Navega entre 9 áreas com dados sintéticos coerentes
3. Valida que os módulos cobrem a pauta do CompStat

### UC-3 · Pipeline diário (produção, não implementado)
1. Cron noturno roda `build_data.py`
2. Novo `real.json` é publicado
3. Analistas abrem o dashboard com dados do dia anterior

---

## 7. Requisitos Não-Funcionais

| Categoria | Requisito |
|---|---|
| Performance | Carregamento inicial < 3s · Heatmap renderiza < 1s para até 5k pontos |
| Compatibilidade | Chrome/Safari/Firefox recentes · Desktop-first (responsivo é "nice to have") |
| Acessibilidade | Contraste mínimo WCAG AA · Foco visível em controles |
| Localização | PT-BR (datas DD/MM/YYYY, decimais com vírgula) |
| Segurança | Dados sensíveis (denúncia) já redacted no CSV de entrada · sem auth no MVP |
| Observabilidade | Toasts informativos para erro de carregamento e sucesso de export |

---

## 8. Design System

| Token | Valor |
|---|---|
| `--color-primary` | `#1e3a5f` (azul-marinha institucional) |
| `--color-accent` | `#0ea5e9` (ciano) |
| `--color-risk-critical` | `#dc2626` |
| `--color-risk-high` | `#ea580c` |
| `--color-risk-medium` | `#d97706` |
| `--color-risk-low` | `#65a30d` |
| `--color-bg` | `#f1f5f9` |
| Layout | Grid 320px sidebar + 1fr main, header 60px |
| Tipografia | system-ui stack, base 14px, line-height 1.5 |

---

## 9. Estado Atual e Roadmap

### 9.1 Implementado (MVP)
- [x] UploadScreen com 6 fontes
- [x] Dashboard com 9 áreas e 6 abas
- [x] Heatmap interativo (leaflet.heat)
- [x] Gráficos temporais (recharts)
- [x] ETL Python ponta-a-ponta
- [x] Point-in-polygon p/ atribuição geoespacial
- [x] Detecção de coincidências (template scoring)
- [x] **Síntese qualitativa via Claude Opus 4.7** (Resumo Executivo, Dinâmica Criminal, Plano de Ação) com adaptive thinking + structured outputs + fallback automático para templates
- [x] Modo real/mock com fallback
- [x] Dados sintéticos consistentes (`mock.js`)

### 9.2 Não Implementado (Backlog)
- [ ] **Exportação .docx real** (atualmente toast)
- [ ] **Pré-população de planilha CompStat** (atualmente toast)
- [ ] **Backend API REST** para ingestão contínua (hoje JSON estático regerado pelo ETL)
- [ ] **Persistência** (banco de dados)
- [ ] **Autenticação/RBAC** (OAuth2/SAML da Prefeitura)
- [ ] **Detecção de migração de crime** (entre áreas adjacentes)
- [ ] **Inteligência de redes sociais** (desafio extra do briefing)
- [ ] **Relatório de permanência operacional** (cobertura QMD vs. ocorrências)
- [ ] **Otimização de cobertura de câmeras** (gap analysis)
- [ ] **Pipeline de scoring de coincidências por LLM** (hoje template heurístico)
- [ ] **Expandir system prompt LLM ≥4096 tokens** para ativar prompt caching (economia ~90% em runs recorrentes)

### 9.3 Marcos sugeridos para produção
1. **Fase 1 (4 sem.)** — Exportação .docx + auth + scheduler do ETL
2. **Fase 2 (6 sem.)** — Backend API + persistência + ingestão automatizada
3. **Fase 3 (8 sem.)** — Desafios extra (redes sociais, migração, permanência, câmeras)

---

## 10. Métricas de Sucesso

| KPI | Baseline | Meta |
|---|---|---|
| Tempo de compilação do Relatório Analítico | ~4h manual | < 5 min automatizado |
| Coincidências identificadas por reunião | N/A | ≥ 3 por área crítica |
| Adesão de órgãos parceiros ao plano de ação | N/A | ≥ 70% das ações com status atualizado em 14d |
| Redução de ocorrências em áreas críticas (90d após intervenção) | — | ≥ 15% |

---

## 11. Anexos

- **Briefing original:** `Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf`
- **Código-fonte:** [project/frontend/src/](project/frontend/src/) (React), [scripts/build_data.py](scripts/build_data.py) (ETL), [scripts/llm_synthesis.py](scripts/llm_synthesis.py) (síntese Claude Opus 4.7)
- **Dependências Python:** [requirements.txt](requirements.txt)
- **Catálogo completo dos 20 fatores urbanos:** `README.md` (raiz)
- **Dados de exemplo:** `dados/`, `relints/`, `sh_area_forca/`

### Como rodar o ETL com síntese LLM
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
.venv/bin/python scripts/build_data.py            # com LLM (custo ~$1-2 por run)
COMPSTAT_LLM=0 .venv/bin/python scripts/build_data.py  # só templates (sem custo)
```
