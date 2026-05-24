# CompStat Rio — Backend (Crawler de Menções)

Coleta menções públicas relacionadas à **Força Municipal** e a relatos de crime
no território do Rio em duas fontes — G1 Rio (RSS) e O Dia (scrape HTML) —
classifica via **Claude Haiku 4.5** (uma única chamada batched por execução,
com prompt caching ativo), e devolve **alertas estruturados** ao frontend
CompStat. Cada alerta carrega bairro, logradouro, ponto de referência,
horário, padrão de modus operandi, tipo de crime, e um score de confiança.

> **Twitter foi removido da POC.** Tanto `twikit` quanto `tweety-ns` dependem
> da extração do `x-client-transaction-id` do bundle JS do X, que quebrou em
> 18/mar/2026 — ambas libs retornam `Couldn't get KEY_BYTE indices` e o
> upstream não tem fix publicado. Quando o ecossistema estabilizar, adicionar
> uma nova fonte é uma função em `crawler/sources/` + uma linha no pipeline.

## Stack

- **FastAPI** + Uvicorn (Python 3.13)
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) via `anthropic` Python SDK
  - Single batched call por execução (cache do system prompt entre chamadas)
  - Saída estruturada via `tool_use` forçado (`tool_choice = emit_alerts`)
  - Sem fallback: se a chave faltar ou a API falhar, sobe exception → 503
- `feedparser` para G1 Rio
- `httpx` + `BeautifulSoup` para O Dia (RSS oficial está estagnado em 2018)

## Instalação

A venv já existe na raiz do repo. Do diretório raiz:

```bash
.venv/bin/pip install -r project/backend/requirements.txt
```

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

| Método | Path                 | O que faz                                            |
|:------:|----------------------|------------------------------------------------------|
| GET    | `/health`            | Sanity check.                                         |
| POST   | `/api/crawler/run`   | Dispara o pipeline; devolve `CrawlerRunResponse`.    |

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
