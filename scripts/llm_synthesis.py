"""
LLM synthesis for CompStat Rio: turns raw aggregated data into the qualitative
narrative blocks consumed by the frontend (Resumo Executivo, Dinâmica Criminal,
Plano de Ação).

Called from build_data.py. Each call uses Claude Opus 4.7 with adaptive
thinking and structured outputs so the JSON shape matches the frontend schema.

Setup:
    pip install anthropic
    export ANTHROPIC_API_KEY=sk-ant-...

Toggle:
    Set COMPSTAT_LLM=0 to skip LLM and let build_data.py keep its template
    fallback (useful for offline runs / CI without a key).
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

try:
    from anthropic import Anthropic, APIError
except ImportError:
    Anthropic = None
    APIError = Exception

MODEL = "claude-opus-4-7"
MAX_TOKENS = 16000
ENABLED = os.environ.get("COMPSTAT_LLM", "1") not in ("0", "false", "no")

_client = None


def _get_client():
    global _client
    if _client is None:
        if Anthropic is None:
            raise RuntimeError("anthropic SDK not installed (pip install anthropic)")
        _client = Anthropic()
    return _client


# ---------------------------------------------------------------------------
# Shared system prompt (stable → cached via prompt-caching breakpoint).
# Keep this deterministic: changing it byte-for-byte busts the cache.
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Você é um analista sênior de inteligência criminal trabalhando no \
CompStat Rio, uma plataforma da Prefeitura do Rio de Janeiro que integra cinco \
fontes de dados (ocorrências georreferenciadas, denúncias do Disque Denúncia, \
fatores urbanos cadastrados, RELINTs da Força Municipal e polígonos operacionais) \
para subsidiar as reuniões semanais de CompStat Municipal.

CONTEXTO OPERACIONAL
- A Força Municipal (FM) tem ~600 agentes para policiamento ostensivo em 9 áreas \
prioritárias.
- A QMD (Quadro de Movimento Diário) padrão cobre até as 18h em boa parte das áreas.
- Reuniões CompStat são semanais; relatórios precisam ser objetivos, factuais e \
acionáveis.

MATRIZ DE 20 FATORES URBANOS (órgão responsável → tipo de fator)
- Comlurb: vegetação encobrindo iluminação/visibilidade; lixo/entulho obstruindo \
visibilidade ou forçando pedestres à pista.
- RioLuz: iluminação deficiente em área de circulação ou estacionamento.
- SEOP: comércio irregular obstruindo passeio; estacionamento irregular; veículos \
de grande porte; cenas de uso de drogas (eventual/crônica).
- SMAS: pessoa em situação de rua (adultos/crianças/famílias); pontos de venda de \
drogas próximos.
- Seconserva: mobiliário desviando pedestres; calçada estreita; mobiliário \
abandonado / tapumes / vãos servindo de refúgio.
- CET-Rio / GM-Rio: pontos de retenção do tráfego; motocicletas no passeio.
- SMTR: pontos de ônibus com histórico de vandalismo.

REGRAS DE REDAÇÃO
1. Use apenas os dados fornecidos no payload do usuário. NÃO invente locais, \
nomes, ruas, números ou padrões que não estejam explicitamente nos dados.
2. Quando os dados são insuficientes para uma afirmação, diga isso explicitamente \
("dados insuficientes para...") em vez de generalizar.
3. Português brasileiro, tom técnico-operacional, sem floreios. Frases curtas.
4. Cite o órgão responsável correto quando recomendar resolução de fator urbano.
5. Quando RELINTs ou amostras de denúncia forem fornecidas, baseie a síntese \
qualitativa neles — eles são a fonte autoritativa para modus operandi, perfil \
de suspeitos e rotas de fuga.
6. Para o plano de ação: cada ação deve ter um RESPONSÁVEL claro (FM, Comlurb, \
RioLuz, SEOP, SMAS, Seconserva, CET-Rio, GM-Rio ou SMTR), uma AÇÃO concreta e \
uma JUSTIFICATIVA vinculada a coincidência ou fator específico dos dados."""


# ---------------------------------------------------------------------------
# Schemas (structured outputs guarantee shape)
# ---------------------------------------------------------------------------

_DYNAMICS_SCHEMA = {
    "type": "object",
    "properties": {
        "modusOperandi": {"type": "string"},
        "suspectProfile": {"type": "string"},
        "escapeRoutes": {"type": "string"},
        "receivingPoints": {"type": "string"},
    },
    "required": ["modusOperandi", "suspectProfile", "escapeRoutes", "receivingPoints"],
    "additionalProperties": False,
}

_EXEC_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "a": {"type": "string"},
                    "sources": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["q", "a", "sources"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

_ACTION_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "responsible": {
                        "type": "string",
                        "enum": ["FM", "Comlurb", "RioLuz", "SEOP", "SMAS",
                                 "Seconserva", "CET-Rio", "GM-Rio", "SMTR"],
                    },
                    "action": {"type": "string"},
                    "justification": {"type": "string"},
                    "priority": {"type": "string", "enum": ["alta", "media", "baixa"]},
                },
                "required": ["responsible", "action", "justification", "priority"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Core call (centralizes Opus 4.7 config + caching + error handling)
# ---------------------------------------------------------------------------

def _call(user_message: str, schema: dict) -> dict:
    """Single Claude call with prompt caching, adaptive thinking, structured output."""
    client = _get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=[{
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        thinking={"type": "adaptive"},
        output_config={
            "format": {"type": "json_schema", "schema": schema},
            "effort": "high",
        },
        messages=[{"role": "user", "content": user_message}],
    )
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


# ---------------------------------------------------------------------------
# Public API — one function per frontend section
# ---------------------------------------------------------------------------

def synthesize_dynamics(
    area_name: str,
    denuncia_data: dict,
    ocorrencias_count_30d: int,
    relints: list[dict],
    top_factors: list[tuple[str, int]],
    peak_hours: str,
    peak_days: str,
) -> dict[str, Any]:
    """
    Returns a dict with keys: modusOperandi, suspectProfile, escapeRoutes,
    receivingPoints, sources.
    """
    relint_excerpts = "\n\n".join(
        f"### RELINT {r.get('file', '?')}\n{r.get('text', '')[:2500]}"
        for r in relints[:4]
    ) or "(sem RELINTs nesta área)"

    relatos = denuncia_data.get("relatos_sample") or []
    relato_excerpts = "\n".join(f"- {r[:400]}" for r in relatos[:5]) or "(sem amostra de relatos)"

    top_factor_lines = "\n".join(f"- {t} ({n} ocorrências)" for t, n in top_factors[:5]) \
        or "(sem fatores ativos)"

    user_msg = f"""Sintetize a DINÂMICA CRIMINAL da área "{area_name}" usando os dados abaixo.

DADOS QUANTITATIVOS (últimos 30/90 dias)
- Ocorrências (30d): {ocorrencias_count_30d}
- Denúncias Disque Denúncia (90d): {denuncia_data.get('count_90d', 0)}
  - Relatos com menção a "moto": {denuncia_data.get('motos', 0)}
  - Relatos com menção a "a pé": {denuncia_data.get('pe', 0)}
- Pico identificado: {peak_hours}, principalmente em {peak_days}

TOP FATORES URBANOS ATIVOS
{top_factor_lines}

AMOSTRA DE RELATOS DO DISQUE DENÚNCIA (redacted)
{relato_excerpts}

RELINTS DA FORÇA MUNICIPAL (texto bruto extraído)
{relint_excerpts}

Produza JSON com 4 campos:
- modusOperandi: padrão de abordagem (a pé vs moto, individual vs em grupo, \
horário, tipo de alvo). Cruze contagem de denúncias com texto dos RELINTs.
- suspectProfile: perfil demográfico/operacional dos suspeitos conforme RELINTs \
e denúncias. Se dados insuficientes, diga.
- escapeRoutes: rotas de fuga concretas mencionadas nos RELINTs (ruas, \
viadutos, acessos a transporte). Se nenhum RELINT mencionar, indicar.
- receivingPoints: pontos de receptação concretos. Se nenhum dado mencionar, \
indicar."""

    try:
        result = _call(user_msg, _DYNAMICS_SCHEMA)
    except Exception as e:
        print(f"    [LLM dynamics fail for {area_name}: {e}]", file=sys.stderr)
        raise

    result["sources"] = {
        "relints": len(relints),
        "denuncias": denuncia_data.get("count_90d", 0),
        "ocorrencias": ocorrencias_count_30d,
    }
    return result


def synthesize_executive_summary(
    area_name: str,
    count_30d: int,
    var_pct: int,
    factors: list[dict],
    peak_hours: str,
    peak_days: str,
    coincidences: list[dict],
    cameras_count: int,
    denuncias_count: int,
    relints_count: int,
) -> list[dict[str, Any]]:
    """Returns the executiveSummary array: [{q, a, sources}, ...]."""
    from collections import Counter
    factor_counts = Counter(f["type"] for f in factors)
    top_factors = factor_counts.most_common(5)
    top_factor_lines = "\n".join(f"- {t}: {n}" for t, n in top_factors) or "(nenhum)"

    coin_lines = "\n".join(
        f"- [{c['id']}] {c['location']} (risco {c['risk']}): {c['crime']} | "
        f"fator: {c['factor']} | janela: {c['timeWindow']} | lacuna: {c['operationalGap']}"
        for c in coincidences[:5]
    ) or "(nenhuma coincidência identificada)"

    n_high_risk = sum(1 for c in coincidences if c["risk"] >= 80)
    gap_without_camera = any("sem câmera" in c.get("operationalGap", "").lower()
                             for c in coincidences)

    user_msg = f"""Produza o RESUMO EXECUTIVO de 4 perguntas norteadoras para a \
área "{area_name}".

DADOS DA ÁREA
- Ocorrências (30d): {count_30d}, variação vs mês anterior: {var_pct:+d}%
- Pico: {peak_hours}, principalmente em {peak_days}
- Fatores urbanos ativos: {len(factors)} ({len(factor_counts)} tipos distintos)
- Top fatores:
{top_factor_lines}
- Denúncias Disque Denúncia (90d): {denuncias_count}
- RELINTs consultados: {relints_count}
- Câmeras instaladas: {cameras_count}
- Coincidências críticas (risco ≥ 80): {n_high_risk} de {len(coincidences)}
- Há hotspot sem cobertura de câmera: {"sim" if gap_without_camera else "não"}

COINCIDÊNCIAS IDENTIFICADAS
{coin_lines}

Gere EXATAMENTE 4 itens no array "items". As perguntas devem cobrir:
1. Sobreposição do pico de crime com a QMD da FM (mencionar que a QMD padrão \
termina às 18h se relevante).
2. Quais fatores urbanos se sobrepõem à mancha criminal e qual o mais \
problemático.
3. Tendência (variação % do mês) — alta / estável / queda — com recomendação \
operacional sucinta.
4. Cobertura de câmeras nos hotspots e lacunas.

Cada item: {{ "q": "<pergunta>", "a": "<resposta de 1-3 frases, factual, com \
números do payload>", "sources": ["Ocorrências", "Fatores Urbanos", ...] }}.
Fontes válidas: "Ocorrências", "Disque Denúncia", "Fatores Urbanos", "RELINTs", \
"Câmeras", "QMD FM"."""

    result = _call(user_msg, _EXEC_SUMMARY_SCHEMA)
    return result["items"][:4]


def synthesize_action_plan(
    area_name: str,
    coincidences: list[dict],
    factors: list[dict],
) -> list[dict[str, Any]]:
    """Returns the actionPlan array: [{responsible, action, justification, priority}, ...]."""
    from collections import Counter, defaultdict

    coin_lines = "\n".join(
        f"- [{c['id']}] {c['location']} (risco {c['risk']}): {c['crime']} | "
        f"fator: {c['factor']} | janela: {c['timeWindow']} | lacuna: {c['operationalGap']}"
        for c in coincidences[:6]
    ) or "(nenhuma coincidência identificada)"

    factor_by_orgao: dict[str, Counter] = defaultdict(Counter)
    for f in factors:
        factor_by_orgao[f["orgao"]][f["type"]] += 1
    factor_lines = []
    for orgao, tipos in factor_by_orgao.items():
        top = tipos.most_common(3)
        factor_lines.append(f"- {orgao}: " + "; ".join(f"{t}={n}" for t, n in top))
    factor_summary = "\n".join(factor_lines) or "(sem fatores ativos)"

    user_msg = f"""Produza o PLANO DE AÇÃO para a área "{area_name}" — uma lista \
de 5 a 10 ações concretas, distribuídas entre os órgãos responsáveis.

COINCIDÊNCIAS CRÍTICAS
{coin_lines}

FATORES URBANOS POR ÓRGÃO
{factor_summary}

REGRAS
- Pelo menos 2 ações da FM ligadas a coincidências de alto risco (reforço \
operacional, ajuste de QMD, cobertura adicional).
- Uma ação por órgão de resolução ambiental que tenha 2+ fatores na área \
(Comlurb, RioLuz, SEOP, SMAS, Seconserva, etc.).
- Cada justificativa deve citar a coincidência (COIN-XXX) ou o número de \
fatores específicos da área. Sem genéricos como "melhorar segurança".
- priority="alta" para coincidências com risco ≥ 85 ou órgão com 8+ fatores; \
"media" para 4-7 fatores; "baixa" caso contrário.

Retorne JSON com array "items"."""

    result = _call(user_msg, _ACTION_PLAN_SCHEMA)
    items = result["items"]
    # Frontend currently spells the medium tier as "media" (no accent); enforce it.
    for it in items:
        if it["priority"] == "média":
            it["priority"] = "media"
    return items[:10]
