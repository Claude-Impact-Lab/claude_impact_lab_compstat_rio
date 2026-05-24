# CompStat Rio — Backend (FastAPI)

Dois pipelines convivendo em uma única API FastAPI:

1. **Crawler de menções** (`/api/crawler/run`) — coleta G1 Rio + O Dia,
   classifica com **Claude Haiku 4.5** e devolve alertas estruturados.
2. **ETL CompStat** (`/api/build/{run,stream,status,result}`) — cruza
   ocorrências, Disque Denúncia, RELINTs, fatores urbanos e polígonos FM,
   sintetiza Resumo Executivo / Dinâmica Criminal / Plano de Ação com
   **Claude Opus 4.7** (27 chamadas — 9 áreas × 3 seções) e expõe o progresso
   via **SSE** (`text/event-stream`) para o frontend renderizar a barra de
   processamento ao vivo. Migrado do antigo `scripts/build_data.py` que
   rodava como subprocesso do Vite.

## Crawler — alertas

Coleta menções públicas relacionadas à **Força Municipal** e a relatos de crime
no território do Rio em duas fontes — G1 Rio (RSS) e O Dia (scrape HTML) —
classifica via **Claude Haiku 4.5** (uma única chamada batched por execução,
com prompt caching ativo), e devolve **alertas estruturados** ao frontend
CompStat. Cada alerta carrega bairro, logradouro, ponto de referência,
horário, padrão de modus operandi, tipo de crime, e um score de confiança.

## Stack

- **FastAPI** + Uvicorn (Python 3.13)
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) via `anthropic` Python SDK
  - Single batched call por execução (cache do system prompt entre chamadas)
  - Saída estruturada via `tool_use` forçado (`tool_choice = emit_alerts`)
  - Sem fallback: se a chave faltar ou a API falhar, sobe exception → 503
- `feedparser` para G1 Rio
- `httpx` + `BeautifulSoup` para O Dia (RSS oficial está estagnado em 2018)

## Instalação

Do diretório raiz do repo. Crie a venv (se ainda não existir) e instale as
dependências:

```bash
python3.13 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r project/backend/requirements.txt
```

> Requer Python 3.13. O `.venv/` está no `.gitignore`, então cada clone precisa
> criar a sua localmente.

## Configuração

```bash
cp project/backend/.env.example project/backend/.env
```

Edite o `.env` e preencha `ANTHROPIC_API_KEY`. Sem ela, o endpoint devolve
**400** com `ANTHROPIC_API_KEY ausente. Defina no .env do backend.`

Gere sua chave em <https://console.anthropic.com/settings/keys>.

## Rodar

```bash
cd project/backend
../../.venv/bin/uvicorn main:app --port 8000 --reload
```

Endpoints:

| Método | Path                  | O que faz                                                                   |
|:------:|-----------------------|-----------------------------------------------------------------------------|
| GET    | `/health`             | Sanity check.                                                               |
| POST   | `/api/crawler/run`    | Dispara o crawler; devolve `CrawlerRunResponse`.                            |
| POST   | `/api/build/run`      | Inicia o ETL CompStat. 202 com `started_at`; 409 se já roda; 400 sem chave. |
| GET    | `/api/build/stream`   | SSE: eventos `phase` / `llm` / `log` / `done` / `error` (heartbeat 15s).    |
| GET    | `/api/build/status`   | Snapshot textual do job atual (polling-fallback para clientes sem SSE).     |
| GET    | `/api/build/result`   | Payload completo do último ETL bem-sucedido (404 se nunca rodou).           |

### Fluxo do ETL pelo frontend

```
UploadScreen ──POST /api/build/run────────────────────► JobManager (singleton)
            │                                                  │
            ├─new EventSource('/api/build/stream')             │ asyncio.Task
            │   event: phase  (load-polygons, …, llm, wrote)   │
            │   event: llm    {area, section, index/27}        │
            │   event: log    (linhas auxiliares)              │
            │   event: done   ─────►  GET /api/build/result ◄──┴── payload em memória
            └─renderiza ProcessingOverlay com calls/27 em tempo real
```

Eventos do job atual ficam num ring buffer no `JobManager`; se o `EventSource`
conecta depois do `POST /run`, recebe replay antes de entrar em tempo real.
Sem persistência: ao restart do uvicorn, o último payload se perde — basta
clicar **Usar dados reais** de novo no front.

## Estrutura do Alert

```jsonc
{
  "id": "alert-xxxxxxxxxx",
  "kind": "denuncia" | "noticia" | "comentario",
  "crime_type": "roubo" | "furto" | "tiroteio" | "...",
  "bairro": "Botafogo",
  "logradouro": "Rua Voluntários da Pátria",
  "ponto_referencia": "Largo do Machado",
  "horario": "22h" | "madrugada" | "noite",
  "padrao": "dupla em moto",
  "source": "g1_rio" | "o_dia",
  "url": "...",
  "author": "...",
  "text": "...",
  "published_at": "2026-05-24T13:41:37Z",
  "score": 0.0..1.0
}
```

A resposta inclui `stats.llm` com `input_tokens`, `output_tokens`,
`cache_read_input_tokens` e `cache_creation_input_tokens`. Se
`cache_read_input_tokens > 0` em chamadas após a primeira, o caching
está economizando ~90% do custo do system prompt.

## Integração com o frontend

O Vite (`project/frontend`) tem proxy de `/api/*` para `http://localhost:8000`.
Basta rodar `npm run dev` no frontend e o botão **Analisar agora** na aba
**Monitor Web** dispara `POST /api/crawler/run`.

## Custo e latência (estimativas POC)

- Volume típico: 30 itens G1 + 3 itens O Dia = ~33 menções/clique
- Input: ~6K tokens (system + menções), Output: ~3K tokens (alertas)
- Primeira chamada (cache miss): ~$0.012 + ~4-6s
- Chamadas subsequentes (cache hit, dentro de 5 min): ~$0.003 + ~3-5s

Para baixar mais custo: trocar `claude-haiku-4-5-20251001` por uma
versão menor (não disponível ainda) ou ativar o cache de 1h via
`cache_control={"type":"ephemeral","ttl":"1h"}` em `crawler/llm.py`.

## Limitações conhecidas (POC)

- O Dia RSS oficial está parado em 2018 — usamos scrape da seção
  `/rio-de-janeiro`. Mudança de HTML quebra o parser; ajuste em
  `crawler/sources/rss.py:_parse_odia_listing`.
- Sem cache local: cada clique do botão refaz tudo (~3-5s). O caching do
  prompt da Anthropic já amortiza o LLM; o que pesa é a coleta + a chamada.
- LLM pode inventar IDs que não correspondem a menções enviadas — esses
  são silenciosamente descartados em `llm.analyze_batch`.
