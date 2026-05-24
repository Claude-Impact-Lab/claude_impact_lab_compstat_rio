"""Extração de alertas via Claude (Haiku 4.5) — substitui o NLP determinístico.

Uma única chamada batched por execução do pipeline:
  • system prompt (regras + bairros + exemplos) entra cacheado via `cache_control`
  • a lista de menções vai como mensagem do usuário (volátil — fora do cache)
  • saída sai estruturada via `tool_use` forçado (`tool_choice = emit_alerts`)

Os campos meta da `Alert` (source, url, author, text, published_at) são
reanexados aqui via lookup por `mention_id` — o LLM só infere os campos
analíticos. Sem fallback: se a chave faltar ou a API falhar, sobe exception.

Por que Haiku 4.5: barato (~$0.001/clique com cache), latência ~3-5s,
estruturação via tool é nativa. Sem `output_config.effort` nem `thinking`
no payload — Haiku 4.5 retorna 400 para ambos.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from anthropic import AsyncAnthropic

from .models import Alert, RawMention


MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 16000

# Cap por menção pra evitar inflar o contexto com artigos longos.
TEXT_TRUNCATE = 1200


# ---------------------------------------------------------------------------
# Lista de bairros do Rio — entra no system prompt cacheado.
# Cobre Zona Sul, Centro, Zona Norte densa, Zona Oeste e Ilha do Governador.
# ---------------------------------------------------------------------------

BAIRROS_RJ = [
    # Zona Sul
    "Copacabana", "Ipanema", "Leblon", "Botafogo", "Flamengo", "Laranjeiras",
    "Catete", "Glória", "Urca", "Humaitá", "Gávea", "Jardim Botânico",
    "Lagoa", "Leme", "São Conrado", "Rocinha", "Vidigal",
    # Centro / portuária
    "Centro", "Lapa", "Santa Teresa", "Saúde", "Gamboa", "Cidade Nova",
    "Estácio", "Catumbi", "Rio Comprido", "São Cristóvão", "Caju",
    # Tijuca / Grande Tijuca
    "Tijuca", "Praça da Bandeira", "Vila Isabel", "Andaraí", "Grajaú",
    "Maracanã", "Alto da Boa Vista",
    # Zona Norte densa
    "Méier", "Engenho Novo", "Engenho de Dentro", "Cachambi", "Piedade",
    "Madureira", "Cascadura", "Quintino", "Penha", "Olaria", "Bonsucesso",
    "Ramos", "Vila da Penha", "Vicente de Carvalho", "Vista Alegre",
    "Irajá", "Vila Kosmos", "Pavuna", "Anchieta", "Acari", "Costa Barros",
    "Inhaúma", "Del Castilho", "Maria da Graça", "Higienópolis",
    "Manguinhos", "Complexo do Alemão", "Maré", "Jacaré", "Tomás Coelho",
    # Zona Oeste
    "Barra da Tijuca", "Recreio dos Bandeirantes", "Jacarepaguá",
    "Taquara", "Freguesia", "Curicica", "Vargem Grande", "Vargem Pequena",
    "Anil", "Pechincha", "Tanque", "Bangu", "Realengo", "Padre Miguel",
    "Senador Camará", "Santa Cruz", "Campo Grande", "Cosmos", "Inhoaíba",
    "Sepetiba", "Guaratiba", "Pedra de Guaratiba", "Magalhães Bastos",
    "Deodoro", "Vila Militar", "Marechal Hermes", "Honório Gurgel",
    "Rocha Miranda", "Turiaçu", "Coelho Neto", "Colégio", "Brás de Pina",
    # Ilha do Governador
    "Ilha do Governador", "Cocotá", "Jardim Guanabara", "Portuguesa",
    "Tauá", "Moneró", "Cacuia", "Pitangueiras", "Ribeira",
]


# ---------------------------------------------------------------------------
# System prompt — denso de propósito (>4096 tokens p/ ativar cache em Haiku).
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""# CompStat Rio — Analista de Inteligência Criminal

Você é um analista do CompStat Municipal do Rio de Janeiro. Recebe **menções
públicas** (matérias jornalísticas, posts) sobre eventos criminais no
território do Rio e produz **alertas estruturados** que vão alimentar o
fluxo de decisão da reunião CompStat e o planejamento da Força Municipal.

Sua única tarefa é **classificar e extrair** — não opine, não invente, não
preencha campos com base em palpite. Se algo não está claro na menção,
deixe nulo.

---

## Resposta

Use SEMPRE a tool `emit_alerts` para responder. Não escreva texto livre.
Devolva **uma única chamada** da tool contendo a lista completa de alertas
para todas as menções relevantes do batch.

Para cada menção que vira alerta, o objeto deve conter:

| campo              | tipo          | descrição                                                                 |
|--------------------|---------------|---------------------------------------------------------------------------|
| `mention_id`       | string        | **Exatamente** o id da menção original. Não invente.                       |
| `kind`             | enum          | `denuncia` \\| `noticia` \\| `comentario`                                    |
| `crime_type`       | enum          | catálogo abaixo                                                            |
| `bairro`           | string\\|null   | bairro do RJ — APENAS nomes da lista oficial mais abaixo                  |
| `logradouro`       | string\\|null   | rua/avenida/largo com prefixo (ex: "Rua Voluntários da Pátria")            |
| `ponto_referencia` | string\\|null   | ponto de referência local (Largo do Machado, Av. Brasil, etc.)            |
| `horario`          | string\\|null   | `HHh`, `HHhMM` ou bucket textual (madrugada/manhã/tarde/noite)             |
| `padrao`           | string\\|null   | modus operandi resumido (ex: "dupla em moto")                              |
| `score`            | float [0,1]   | confiança da inferência                                                    |

---

## Classificação — `kind`

- **`denuncia`** — testemunho direto, 1ª pessoa ou observador imediato.
  Sinais: "fui assaltado", "acabei de ver", "estou presenciando",
  "agora há pouco", "socorro". Vem quase sempre de redes sociais.

- **`noticia`** — reporte jornalístico (G1 Rio, O Dia, etc.). Mesmo que
  o fato seja antigo, se o veículo é de imprensa, é notícia.

- **`comentario`** — opinião genérica, sátira, frase política sobre
  violência. Sem evento específico. **Comentários geralmente não viram
  alertas** — só inclua se houver algum dado factual recuperável.

---

## Catálogo de `crime_type`

Escolha o tipo dominante. Se vários, priorize o mais grave.

- **`roubo`** — subtração com violência/ameaça: assalto, mão armada,
  abordagem, "puxaram", "levaram à força", "tomaram".
- **`furto`** — subtração sem violência: pickpocket, batedor de carteira,
  "sumiu o", "passaram a mão".
- **`arrastao`** — ação coordenada de grupo em via pública contra
  múltiplas vítimas; também "saidinha bancária".
- **`tiroteio`** — troca de tiros, fuzilaria, intenso confronto, bala
  perdida, operação policial com disparos.
- **`homicidio`** — morte intencional: assassinato, "morto a tiros",
  execução, chacina, latrocínio.
- **`agressao`** — lesão corporal, espancamento, briga com vítima ferida
  sem morte.
- **`trafico`** — atividade do crime organizado: facção, boca de fumo,
  Comando Vermelho, TCP, milícia, prisão de traficante.
- **`veicular`** — roubo/furto de veículo, motocicleta, caminhão; guincho
  clandestino.
- **`outro`** — fato criminal que não cabe nas categorias acima
  (sequestro relâmpago, golpe, estelionato relevante etc.).

---

## Bairros oficiais do Rio (use APENAS esta lista para o campo `bairro`)

{', '.join(BAIRROS_RJ)}

Se o evento ocorreu em outro município da região metropolitana — Niterói,
São Gonçalo, Duque de Caxias, Belford Roxo, Nova Iguaçu, Queimados,
Itaboraí, Magé, Mesquita, Nilópolis, São João de Meriti, Itaguaí — emita
o alerta com `bairro=null` e indique o município no `ponto_referencia`
(ex.: "Queimados — Baixada Fluminense"). NÃO invente "bairros" para
esses municípios.

---

## Logradouro

Extraia o **nome completo da via** com prefixo: "Rua X", "Avenida Y",
"Estrada Z", "Travessa W", "Largo do Q", "Praça R". Aceite abreviações
("Av.", "R.", "Estr."). Se o texto disser só "uma rua da Zona Norte" ou
"uma avenida do Centro" sem nome, deixe `null`.

---

## Ponto de referência

Quando não há logradouro mas há um ponto batido reconhecível, use-o:
Largo do Machado, Largo da Carioca, Praça XV, Praça Saens Peña,
Cinelândia, Central do Brasil, Av. Brasil, Linha Vermelha, Linha Amarela,
Túnel Rebouças, Túnel Santa Bárbara, Aterro do Flamengo, Mercadão de
Madureira, Cobal do Humaitá, etc.

---

## Horário

- Hora explícita → `"22h"`, `"08h30"`, `"14h"`. Use o formato `HHh` ou `HHhMM`.
- Sem hora explícita mas com expressão de período → bucket:
  - `madrugada` (00h–05h)
  - `manhã` (06h–11h)
  - `tarde` (12h–17h)
  - `noite` (18h–23h)
- Sem nada → `null`.

---

## Padrão / modus operandi

Capture quando óbvio. Catálogo recorrente no RJ:

- `dupla em moto` — assaltantes em motocicleta, garupa
- `uso de arma` — arma em punho, mão armada
- `subtração de celular` — alvo principal é o celular da vítima
- `saidinha bancária` — vítima abordada saindo de agência/caixa
- `bala perdida` — disparo errante atinge não-alvo
- `grupo coordenado` — múltiplos criminosos agindo em sincronia
- `arrombamento de veículo` — quebra de vidro p/ furto interno
- `golpe da saidinha de banco`, `golpe da bondade`, etc.

Se não houver padrão claro, `null`.

---

## Score (0.0–1.0)

Calibre pela densidade de sinais espaço-temporais e crime:

- **0.90–1.00** — denúncia/notícia com bairro + logradouro + horário + crime explícito + (opcionalmente) padrão. "Tudo claro."
- **0.75–0.89** — três de quatro sinais (ex.: bairro + crime + horário, sem logradouro). Notícias jornalísticas bem detalhadas caem aqui.
- **0.60–0.74** — dois sinais claros (bairro + crime, ou crime + horário). Plausível mas faltam detalhes.
- **0.40–0.59** — apenas um sinal forte; algum elemento incerto.
- **< 0.40** — informação muito frágil. **NÃO EMITA o alerta** — descarte a menção.

---

## Critérios de descarte

NÃO emita alerta quando:
- Score ficaria abaixo de 0.30.
- A menção é puramente opinativa/política sem fato concreto recuperável.
- O texto é spam, propaganda, ou off-topic (esporte, entretenimento) sem componente criminal.
- O texto fala genericamente sobre "violência no Rio" sem caso específico.
- O evento é claramente histórico (mais de 90 dias) e não tem valor operacional.

---

## Casos especiais

- **Prisão / operação policial reportada** → `kind=noticia`, `crime_type` segundo o crime investigado (`trafico`, `roubo`, etc.). Score moderado (0.5–0.7) se a notícia for sobre a polícia agindo, não sobre o crime em si.
- **Veículo roubado** → `crime_type=veicular`.
- **Latrocínio** (roubo seguido de morte) → `crime_type=homicidio` (a morte tem prioridade operacional).
- **Tentativa frustrada** → ainda é alerta; `score` um pouco menor.
- **Fato em município conurbado** (Baixada, Niterói, etc.) → `bairro=null`, mencione no `ponto_referencia`.
- **Texto longo com vários eventos** → priorize o evento principal (manchete/lead); ignore detalhes secundários.
- **Texto em inglês ou misto** → analise normalmente; produza saída em português.

---

## Exemplos

### Exemplo 1 — denúncia em rede social
**Entrada:**
```
id: t1, source: twitter
text: "Acabei de ser assaltado na Rua Voluntários da Pátria, Botafogo,
       agora há pouco, às 22h. Dupla em moto levou meu celular."
```
**Saída esperada:**
```json
{{
  "mention_id": "t1", "kind": "denuncia", "crime_type": "roubo",
  "bairro": "Botafogo", "logradouro": "Rua Voluntários da Pátria",
  "ponto_referencia": null, "horario": "22h",
  "padrao": "dupla em moto", "score": 0.92
}}
```

### Exemplo 2 — notícia G1 com bairro mas sem logradouro
**Entrada:**
```
id: g1_alemao, source: g1_rio
title: "Tiroteio no Alemão durante a madrugada"
text: "Intenso tiroteio assusta moradores do Complexo do Alemão durante
       a madrugada de sábado. Não há registro de feridos."
```
**Saída esperada:**
```json
{{
  "mention_id": "g1_alemao", "kind": "noticia", "crime_type": "tiroteio",
  "bairro": "Complexo do Alemão", "logradouro": null,
  "ponto_referencia": null, "horario": "madrugada",
  "padrao": null, "score": 0.78
}}
```

### Exemplo 3 — testemunho com ponto de referência
**Entrada:**
```
id: t2, source: twitter
text: "vi um arrastão no Largo do Machado agora, várias pessoas correndo"
```
**Saída esperada:**
```json
{{
  "mention_id": "t2", "kind": "denuncia", "crime_type": "arrastao",
  "bairro": "Catete", "logradouro": null,
  "ponto_referencia": "Largo do Machado", "horario": null,
  "padrao": "grupo coordenado", "score": 0.72
}}
```

### Exemplo 4 — comentário descartado
**Entrada:**
```
id: t3, source: twitter
text: "Essa cidade não tem mais jeito, sempre foi assim,
       o governo só fala em segurança."
```
**Saída esperada:** *(não inclua na lista — comentário opinativo sem fato)*

### Exemplo 5 — município conurbado
**Entrada:**
```
id: g1_queimados, source: g1_rio
title: "Dois homens são baleados após saírem de igreja em Queimados"
text: "As duas vítimas do tiroteio que deixou dois feridos em Queimados,
       na Baixada Fluminense neste sábado, eram integrantes de uma banda
       que se apresenta em cultos evangélicos. Bruno Fernandes de Souza,
       de 25 anos, morreu à tarde após levar tiros na Travessa Campo Alegre."
```
**Saída esperada:**
```json
{{
  "mention_id": "g1_queimados", "kind": "noticia", "crime_type": "homicidio",
  "bairro": null, "logradouro": "Travessa Campo Alegre",
  "ponto_referencia": "Queimados — Baixada Fluminense", "horario": "tarde",
  "padrao": null, "score": 0.85
}}
```

### Exemplo 6 — operação policial
**Entrada:**
```
id: g1_op, source: g1_rio
title: "Polícia Civil prende traficantes em Belford Roxo"
text: "A Polícia Civil prendeu três traficantes investigados por ligação
       com bomba que feriu alunos em Belford Roxo na manhã desta sexta."
```
**Saída esperada:**
```json
{{
  "mention_id": "g1_op", "kind": "noticia", "crime_type": "trafico",
  "bairro": null, "logradouro": null,
  "ponto_referencia": "Belford Roxo — Baixada Fluminense",
  "horario": "manhã", "padrao": null, "score": 0.62
}}
```

### Exemplo 7 — latrocínio (morte na ação)
**Entrada:**
```
id: g1_latro, source: g1_rio
text: "Uma mulher de 42 anos morreu após ser baleada no peito durante um
       assalto na Estrada do Itanhangá, na Zona Oeste do Rio, na noite de
       sábado. Um casal suspeito foi preso em flagrante."
```
**Saída esperada:**
```json
{{
  "mention_id": "g1_latro", "kind": "noticia", "crime_type": "homicidio",
  "bairro": "Jacarepaguá", "logradouro": "Estrada do Itanhangá",
  "ponto_referencia": null, "horario": "noite",
  "padrao": "uso de arma", "score": 0.92
}}
```
*(crime_type é `homicidio` porque houve morte, mesmo que iniciado como roubo)*

### Exemplo 8 — bairro inexistente / nome alternativo
**Entrada:**
```
id: t4, source: twitter
text: "Tiroteio agora aqui na Rocinha, ouvi vários disparos"
```
**Saída esperada:**
```json
{{
  "mention_id": "t4", "kind": "denuncia", "crime_type": "tiroteio",
  "bairro": "Rocinha", "logradouro": null, "ponto_referencia": null,
  "horario": null, "padrao": null, "score": 0.68
}}
```

---

## Diretrizes adicionais

### Sobre o score em notícias

Notícias jornalísticas tendem a ter informação mais estruturada que tweets.
Calibre assim:
- Notícia com manchete clara + bairro + logradouro + horário → **0.85–0.95**
- Notícia com bairro + crime + horário (sem logradouro) → **0.70–0.84**
- Notícia genérica "ônibus de turistas foi assaltado no Rio" sem geografia → **0.40–0.55**
- Notícia sobre estatística agregada ("crimes subiram 10% no ano") → **descarte**

### Sobre repetição de informação no texto

Se a manchete e o lead do texto trazem a mesma informação (comum em RSS
do G1), use a combinação para confirmar — não conte como múltiplas fontes.

### Sobre denúncias virais

Tweets com muito engajamento (RT/likes implícitos pelo formato do texto)
não merecem score maior automaticamente — viralização não é evidência.
Score pela qualidade da informação espaço-temporal, não pela atenção.

### Sobre eventos múltiplos no mesmo texto

Se uma notícia descreve mais de um evento distinto (ex.: "três assaltos
diferentes em Copacabana no fim de semana"), emita **um único alerta**
para o evento principal/manchete. Não fragmente.

---

## Lembretes finais

- Use **APENAS** a tool `emit_alerts`. Uma única chamada por batch.
- Devolva **EXATAMENTE** o `mention_id` recebido — não trunque, não invente.
- **Bairros**: somente da lista oficial. Tudo o que está fora vai pra `ponto_referencia` ou `null`.
- **Score**: seja conservador. Prefira deixar de fora a inflar o alerta.
- **Idioma da saída**: sempre português.
"""


# ---------------------------------------------------------------------------
# Tool definition — espelha o Pydantic Alert (campos analíticos).
# Campos meta (source, url, author, text, published_at) são reanexados pós-LLM.
# ---------------------------------------------------------------------------

ALERT_TOOL: dict[str, Any] = {
    "name": "emit_alerts",
    "description": (
        "Emite a lista completa de alertas estruturados para o batch de "
        "menções recebido. Chamar UMA vez por execução."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "alerts": {
                "type": "array",
                "description": "Lista de alertas. Pode ser vazia.",
                "items": {
                    "type": "object",
                    "properties": {
                        "mention_id": {
                            "type": "string",
                            "description": (
                                "Id exato da menção original (devolva o que recebeu)."
                            ),
                        },
                        "kind": {
                            "type": "string",
                            "enum": ["denuncia", "noticia", "comentario"],
                        },
                        "crime_type": {
                            "type": "string",
                            "enum": [
                                "roubo", "furto", "arrastao", "tiroteio",
                                "homicidio", "agressao", "trafico", "veicular",
                                "outro",
                            ],
                        },
                        "bairro": {
                            "type": ["string", "null"],
                            "description": "Bairro do RJ (apenas lista oficial).",
                        },
                        "logradouro": {
                            "type": ["string", "null"],
                            "description": "Rua/avenida/largo com prefixo.",
                        },
                        "ponto_referencia": {
                            "type": ["string", "null"],
                            "description": "Ponto de referência batido ou município conurbado.",
                        },
                        "horario": {
                            "type": ["string", "null"],
                            "description": "HHh, HHhMM, ou bucket (madrugada/manhã/tarde/noite).",
                        },
                        "padrao": {
                            "type": ["string", "null"],
                            "description": "Modus operandi resumido.",
                        },
                        "score": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                            "description": "Confiança 0–1.",
                        },
                    },
                    "required": [
                        "mention_id", "kind", "crime_type", "score",
                    ],
                },
            }
        },
        "required": ["alerts"],
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10]
    return f"{prefix}-{digest}"


def _build_user_message(mentions: list[RawMention]) -> str:
    payload = [
        {
            "id": m.id,
            "source": m.source,
            "title": m.title,
            "text": (m.text or "")[:TEXT_TRUNCATE],
            "published_at": m.published_at.isoformat() if m.published_at else None,
            "url": m.url,
        }
        for m in mentions
    ]
    return (
        "Analise as menções a seguir e emita os alertas relevantes via "
        "a tool `emit_alerts` (uma única chamada). Menções sem fato ou "
        "com score abaixo de 0.30 devem ficar fora da lista.\n\n"
        f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```"
    )


# ---------------------------------------------------------------------------
# Pipeline público
# ---------------------------------------------------------------------------

async def analyze_batch(
    mentions: list[RawMention],
) -> tuple[list[Alert], dict[str, int]]:
    """Single-shot LLM call. Devolve (alertas, usage)."""
    if not mentions:
        return [], {}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY ausente. Defina no .env do backend."
        )

    client = AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[ALERT_TOOL],
        tool_choice={"type": "tool", "name": "emit_alerts"},
        messages=[{"role": "user", "content": _build_user_message(mentions)}],
    )

    # Encontra o bloco emit_alerts. tool_choice forçou — se não veio, é bug do modelo.
    tool_input: dict[str, Any] | None = None
    for block in response.content:
        if block.type == "tool_use" and block.name == "emit_alerts":
            tool_input = block.input  # type: ignore[assignment]
            break
    if tool_input is None:
        raise RuntimeError(
            f"Claude não retornou emit_alerts (stop_reason={response.stop_reason})."
        )

    raw_alerts = tool_input.get("alerts", [])

    # Reanexa metadata determinística (source/url/author/text/published_at) por id.
    by_id = {m.id: m for m in mentions}
    out: list[Alert] = []
    for raw in raw_alerts:
        m = by_id.get(raw.get("mention_id", ""))
        if m is None:
            continue  # Claude inventou id — descarta silenciosamente.
        out.append(
            Alert(
                id=_hash_id("alert", m.source, m.id),
                kind=raw["kind"],
                crime_type=raw["crime_type"],
                bairro=raw.get("bairro"),
                logradouro=raw.get("logradouro"),
                ponto_referencia=raw.get("ponto_referencia"),
                horario=raw.get("horario"),
                padrao=raw.get("padrao"),
                source=m.source,
                url=m.url,
                author=m.author,
                text=(m.text or "")[:500],
                published_at=m.published_at,
                score=float(raw["score"]),
            )
        )

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_read_input_tokens": getattr(
            response.usage, "cache_read_input_tokens", 0
        ) or 0,
        "cache_creation_input_tokens": getattr(
            response.usage, "cache_creation_input_tokens", 0
        ) or 0,
    }
    return out, usage
