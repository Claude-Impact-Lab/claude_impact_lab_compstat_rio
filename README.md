# 🏙️ Claude Impact Lab Rio — CompStat Rio

> Plataforma de inteligência criminal construída sobre o Claude para automatizar a produção dos Relatórios Analíticos de Área do CompStat Municipal do Rio de Janeiro.

---

## 👥 Equipe

- **Nome da equipe:** Afya de Guerra
- **Membros:** Daniel Rocha, Ronaldo Faria, Yuri Lima e Rafael Torres
- **Tema:** Segurança

## 📝 Resumo

Hoje, cada Relatório Analítico de Área do CompStat consome horas de trabalho manual: o analista precisa abrir cinco fontes heterogêneas (ocorrências georreferenciadas, denúncias do Disque Denúncia, RELINTs em `.docx`, fatores urbanos cadastrados e polígonos da Força Municipal), reconciliar formatos divergentes, cruzar evidência quantitativa com qualitativa e, só então, redigir o documento que subsidia a reunião semanal de alta gestão.

Nossa solução transforma esse fluxo em um pipeline automatizado. Em uma única execução, a plataforma:

1. **Integra as cinco fontes do CompStat** em uma estrutura geoespacial unificada (EPSG:4326 → SIRGAS 2000 UTM 23S para cálculos métricos);
2. **Identifica "coincidências de alto risco"** — pontos onde mancha criminal, fator urbano e dinâmica criminal se sobrepõem em raios de até 80m, priorizando recomendações operacionais;
3. **Sintetiza Resumo Executivo, Dinâmica Criminal e Plano de Ação** para cada uma das áreas prioritárias com o Claude Opus 4.7, sempre ancorada nas evidências reais agregadas pelo ETL;
4. **Monitora fontes abertas em tempo real (diferencial da solução).** Enquanto o CompStat tradicional opera apenas sobre dados oficiais com defasagem de semanas, nossa plataforma incorpora uma camada de OSINT (open-source intelligence) que varre continuamente G1 Rio e O Dia com o Claude Haiku 4.5, classificando cada menção em `denuncia | noticia | comentario`, geolocalizando por bairro/logradouro, extraindo modus operandi e atribuindo score de confiança. Isso permite **antecipar tendências antes que cheguem ao banco oficial**, capturar a **percepção pública sobre a atuação da FM** e cruzar narrativa da mídia com a mancha criminal — uma fonte de evidência que hoje simplesmente não existe no fluxo do analista;
5. **Entrega tudo num dashboard interativo** com heatmap, análise temporal, painel de coincidências e plano de ação por órgão responsável (Comlurb, RioLuz, Seconserva, SEOP, SMAS, CET-Rio, SMTR, GM-Rio).

O resultado: o analista deixa de ser compilador de planilhas e passa a ser revisor de evidência sintetizada — com ganho de escala (todas as áreas prioritárias em paralelo), consistência (mesmo template, mesmo rigor) e rastreabilidade (cada afirmação ligada a registros de origem).

## 🏗️ Arquitetura e abordagem

A plataforma é composta por três camadas que se comunicam por contratos estáveis — backend FastAPI, frontend React + Vite e uma camada de inteligência ancorada no Claude.

### Visão geral

```
┌─────────────────────────┐        ┌──────────────────────────────────────┐
│  Frontend (React/Vite)  │ ──SSE──┤   FastAPI Backend (Python 3.13)      │
│  • UploadScreen         │        │                                      │
│  • Dashboard por área   │        │   ┌────────────────────────────┐     │
│  • Heatmap (Leaflet)    │        │   │  ETL CompStat              │     │
│  • Coincidências        │        │   │  ─ Shapefile FM            │     │
│  • Plano de Ação        │        │   │  ─ Ocorrências (point-in-  │     │
└─────────────────────────┘        │   │     polygon, janela 90d)   │     │
                                   │   │  ─ Disque Denúncia (NLP)   │     │
                                   │   │  ─ RELINTs (.docx → texto) │     │
                                   │   │  ─ Fatores urbanos (axis-  │     │
                                   │   │     fix, normalização)     │     │
                                   │   │  ─ Câmeras                 │     │
                                   │   └────────────┬───────────────┘     │
                                   │                ▼                     │
                                   │   ┌────────────────────────────┐     │
                                   │   │  Síntese com Claude        │     │
                                   │   │  ─ Opus 4.7 (relatórios)   │     │
                                   │   │  ─ Haiku 4.5 (alertas web) │     │
                                   │   │  ─ Prompt caching          │     │
                                   │   │  ─ Structured tool_use     │     │
                                   │   └────────────────────────────┘     │
                                   └──────────────────────────────────────┘
```

### Como o Claude foi usado

O Claude é o motor cognitivo da plataforma — não um wrapper de chamada única, e sim uma cadeia de raciocínio orquestrada com práticas de produção:

- **Síntese qualitativa por área com Claude Opus 4.7.** Para cada área prioritária, três seções narrativas (Resumo Executivo, Dinâmica Criminal, Plano de Ação) são produzidas pelo Claude a partir do dossiê agregado pelo ETL — em uma orquestração paralela de múltiplas chamadas por execução. O Claude recebe as evidências já reconciliadas (top fatores urbanos por órgão, distribuição temporal, hotspots de coincidência, padrões extraídos do Disque Denúncia e RELINTs) e devolve a narrativa final ancorada em números reais, no formato e tom dos relatórios produzidos hoje pela equipe.

- **Saídas estruturadas via `tool_use` forçado.** Em vez de parsear texto livre, o Claude é instruído a emitir resposta exclusivamente através de uma ferramenta declarada (`tool_choice` forçado), com schema que casa byte-a-byte com o contrato consumido pelo frontend. Isso elimina parsing frágil e garante que cada execução produza um payload válido.

- **Prompt caching para escala e custo.** O system prompt — que carrega o briefing CompStat, a matriz de órgãos responsáveis e o template do relatório — é marcado como cacheável. A partir da segunda chamada da execução, o Claude reutiliza o contexto cacheado, reduzindo o custo do prompt em ~90% e mantendo a latência baixa ao longo de toda a varredura das áreas.

- **Crawler de inteligência aberta com Claude Haiku 4.5.** O monitoramento de menções públicas (G1 Rio + O Dia) usa uma única chamada batched do Claude Haiku 4.5 — também com caching ativo e `tool_use` forçado — para classificar cada menção em `denuncia | noticia | comentario`, extrair bairro, logradouro, horário, padrão de modus operandi e atribuir um score de confiança. O modelo certo para o problema certo: Haiku para classificação de alto volume e baixa latência; Opus para síntese narrativa de alto valor.

- **Streaming em tempo real via SSE.** O frontend assina `GET /api/build/stream` (Server-Sent Events) e recebe eventos `phase` / `llm` / `log` / `done` à medida que cada chamada do Claude completa, exibindo a barra de processamento ao vivo com contagem dinâmica das chamadas. O usuário enxerga o progresso da inteligência, não uma tela travada.

- **Claude Code Skills no fluxo de desenvolvimento.** O repositório embarca duas skills (`relatorios-compstat` e `fontes-de-dados`) em `.claude/skills/`, que documentam o domínio CompStat — armadilhas dos CSVs (encoding `latin1`, decimal `,`, axis swap em `fatores_urbanos.csv`), regras de reprojeção espacial e o template de relatório. Isso transforma a documentação operacional em capacidades acionáveis pelo próprio Claude durante o desenvolvimento.

### Stack técnica

| Camada       | Tecnologia                                                                 |
|--------------|----------------------------------------------------------------------------|
| Inteligência | **Claude Opus 4.7** (síntese), **Claude Haiku 4.5** (classificação) via SDK `anthropic` |
| Backend      | FastAPI + Uvicorn (Python 3.13), `asyncio` com `to_thread` para chamadas Claude, SSE para progresso |
| Geoespacial  | `shapely` (point-in-polygon, prepared geometries), `pyshp`, reprojeção EPSG:4326 → 31983 |
| ETL          | Parsing nativo (`csv`, `zipfile` + XML strip para `.docx`), normalização de encoding `latin1` e separadores não-padrão |
| Crawler      | `feedparser` (G1 RSS) + `httpx` + `BeautifulSoup` (scrape O Dia)            |
| Frontend     | React + Vite, Leaflet + `leaflet.heat`, Recharts                            |

### Princípios de engenharia

- **Sem persistência prematura.** O backend mantém o último payload em memória e o frontend re-dispara o ETL sob demanda — POC honesta, sem banco que precise migrar.
- **Sem fallback silencioso.** Se o `ANTHROPIC_API_KEY` falta ou a API retorna erro, o endpoint devolve 400/503 com mensagem clara — preferimos falhar visível a entregar resultado mockado.
- **Domínio documentado em skills, não em código.** As armadilhas dos dados (encoding, axis swap, naming inconsistente) vivem nas skills do Claude Code, ficando disponíveis para qualquer pessoa que abrir o repositório com o Claude.

## 🎥 Vídeo demo

> **TODO**


**CompStat Rio** | Claude Impact Lab Rio 2026
