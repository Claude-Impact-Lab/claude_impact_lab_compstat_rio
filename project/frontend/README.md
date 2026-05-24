# CompStat Rio — Frontend (Protótipo)

React + Vite. Pode rodar com **dados reais** (extraídos de `/dados`, `/relints` e
`/sh_area_forca` via ETL Python) ou com **dados mockados** embutidos.

## Como rodar

### Opção 1 — Com dados reais (recomendado)

A partir da raiz do repo:

```bash
# 1. Subir o backend FastAPI (com .venv ativa e ANTHROPIC_API_KEY no .env)
python3 -m venv .venv
.venv/bin/pip install -r project/backend/requirements.txt
cd project/backend
../../.venv/bin/uvicorn main:app --port 8000 --reload

# 2. Em outro terminal, subir o frontend
cd project/frontend
npm install
npm run dev
```

Na tela inicial, clique em **"Usar dados reais do projeto"** — o app chama
`POST /api/build/run`, assina `GET /api/build/stream` (SSE) para mostrar o
progresso ao vivo (27 chamadas LLM = 9 áreas × 3 seções), e ao receber o
evento `done` faz `GET /api/build/result` pra ingerir o payload. Sem
arquivo em disco — o backend guarda o último payload em memória.

### Opção 2 — Só com mock

```bash
cd project/frontend
npm install
npm run dev
```

Na tela inicial, clique em **"Pular (mock)"** — usa o `src/data/mock.js`,
dados sintéticos. Útil se você não rodou o ETL.

## O fluxo

1. **Tela de upload** (etapa 1) — cards explicando cada fonte de dados (o que é, pra que serve, formato esperado).
   - "Usar dados reais do projeto" → fetch `/data/real.json`
   - "Pular (mock)" → usa dados sintéticos
   - "Iniciar análise" (após upload de todos os obrigatórios) → também carrega `real.json` (no protótipo, os arquivos enviados não são processados em runtime — o backend que faria isso)
2. **Dashboard** — sidebar com as 9 áreas da FM + 6 abas:
   Resumo Executivo, Heatmap, Análise Temporal, Dinâmica Criminal, Coincidências, Plano de Ação.

## O que é real vs mock no modo "dados reais"

| Campo                  | Origem                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Polígonos da FM        | **Real** — `sh_area_forca/areas_forca_municipal.shp` (8 polígonos; Bangu sintético por bbox)    |
| Ocorrências / heatmap  | **Real** — `df_ocorrencias_tratado.csv`, janela de 90 dias, point-in-polygon por área           |
| KPIs (30d, variação)   | **Real** — agregação Dec/2024 vs Nov/2024                                                       |
| Análise temporal       | **Real** — distribuição por dia da semana + hora, com detecção de pico por janela móvel 3h      |
| Fatores urbanos        | **Real** — `fatores_urbanos.csv`, apenas `tipo_ocorrencia_ativo=TRUE`, normalizado por órgão    |
| Disque Denúncia        | **Real** — `disk_denuncia.csv`, agregado por área, com heurísticas para MO (moto/a pé)          |
| RELINTs                | **Real** — `relints/*.docx`, extraídos via zipfile + XML strip                                  |
| Câmeras                | **Real** — `cameras_areas_fm.csv`                                                               |
| Coincidências          | **Algorítmico** — grid 50m + fatores num raio de 80m, score baseado em volume × proximidade     |
| Resumo Executivo       | **Template parametrizado** — usa números reais, mas o texto é template (não LLM)                |
| Dinâmica Criminal      | **Template parametrizado** — heurística simples sobre relatos de denúncia                       |
| Plano de Ação          | **Template parametrizado** — uma ação por coincidência alta + uma remediação por órgão          |

Em produção, os 3 últimos seriam saída de um prompt LLM consumindo as
mesmas evidências. O ETL deixa toda essa estrutura pronta para esse
substituição.

## Janela temporal

Como os dados de `df_ocorrencias_tratado.csv` vão só até 2024-12-31, o
script usa essa data como referência. "Últimos 30 dias" = dezembro/2024,
"últimos 90 dias" = outubro–dezembro/2024.

## Estrutura

```
src/
├── App.jsx                       # Estado dataset (mock/real), fetch de real.json
├── main.jsx
├── data/
│   └── mock.js                   # Fallback mock data
├── components/
│   ├── UploadScreen.jsx          # Tela inicial: 6 cards de fonte + CTAs
│   ├── Header.jsx                # Pill mostra "Dados reais" vs "demonstração"
│   ├── Sidebar.jsx
│   ├── AreaHeader.jsx
│   ├── Tabs.jsx
│   ├── ExecutiveSummary.jsx
│   ├── HeatmapView.jsx           # Leaflet + leaflet.heat
│   ├── TemporalAnalysis.jsx      # Recharts
│   ├── CriminalDynamics.jsx
│   ├── CoincidencePanel.jsx
│   ├── ActionPlan.jsx
│   └── Toast.jsx
└── styles/
    └── index.css
```

> O antigo `public/data/real.json` foi removido. O frontend agora consome o
> payload via `GET /api/build/result` (servido em memória pelo backend após
> o ETL terminar).


## Próximos passos

1. Substituir os 3 textos template-generated por chamadas LLM com prompt sobre as evidências.
2. Implementar o backend para realmente parsear os arquivos enviados na tela de upload (hoje os bytes são ignorados — o app sempre lê `real.json`).
3. Implementar export `.docx` real.
4. Refinar polígono de Bangu (hoje sintético — falta no shapefile fornecido).
