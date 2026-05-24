# Pergunta norteadora P3: Dinâmica criminal × Modelo de emprego da FM

## Pergunta exata (briefing pg 12 / pg 7)

> *Dinâmica criminal coincide com o modelo de emprego da FM (moto, a pé ou viatura)?*

E mais detalhado (briefing pg 7, seção 7.3):

> *Qual deve ser o modelo de emprego da FM com base na dinâmica criminal? A IA pode fazer sugestão de modalidade (moto, a pé ou viatura) e quantidade de efetivo, considerando que o total de 600 agentes para as 22 áreas. Por exemplo: se na dinâmica criminal é apontado que os roubos acontecem majoritariamente por meio do uso de motocicletas, o emprego de efetivo a pé não resolverá o problema.*

## Lente de segurança pública

Esta é a pergunta **mais qualitativa** das 4. O conceito central é: **modalidade do crime define modalidade da resposta**. Agente a pé não persegue moto; viatura não acessa beco. A síntese tem que ser fiel ao dado, não vaga.

## Input

Nome da área FM (ex: "Botafogo") **e opcionalmente** o modelo de emprego atual ("FM atual: 80% pé, 20% moto, 0% viatura"). Se o usuário não informar, **assumir composição genérica `60% pé, 30% moto, 10% viatura`** e sinalizar a suposição.

## Data references a consultar (ordem obrigatória)

1. **`fontes-de-dados/references/poligonos-fm.md`** — resolver nome → polígono + nome canônico.
2. **`fontes-de-dados/references/disque-denuncia.md`** — denúncias dentro do polígono; extrair indicadores de modalidade textual.
3. **`fontes-de-dados/references/relints.md`** — RELINT da área (se houver — Lauro Müller e Bangu não têm); extrair indicadores de modalidade.
4. **`fontes-de-dados/references/ocorrencias.md`** — opcional, para validar volume e cruzar com modalidade (ex: "celular" → moto provável).

## Procedimento

### Passo 1: Resolver área → polígono + nome canônico

Use `poligonos-fm.md`. Guarde o nome canônico para encontrar o RELINT.

### Passo 2: Coletar inteligência qualitativa

```python
denuncias = carregar_denuncias(poly)  # disque-denuncia.md
dinamica_denuncia = analisar_dinamica(denuncias)

relint_paths = caminho_relint(nome_canonico)  # relints.md
relints_analise = []
for path in relint_paths:
    texto = ler_relint(path)
    relints_analise.append(analisar_relint(texto))
```

### Passo 3: Consolidar indicadores de modalidade

Combinar sinais de Disque + RELINTs:

```python
def consolidar_modalidade(dinamica_denuncia, relints_analise):
    # Pesos: RELINT > Disque (oficial > anônimo)
    sinais = {
        "moto": dinamica_denuncia["modalidade_indicadores"]["moto"],
        "a_pe": dinamica_denuncia["modalidade_indicadores"]["a_pe"],
        "grupo": dinamica_denuncia["modalidade_indicadores"]["grupo"],
        "armado": dinamica_denuncia["modalidade_indicadores"]["armado"],
    }
    # boost por RELINT (multiplicar por 3 se algum RELINT confirma)
    for r in relints_analise:
        if r["menciona_moto"]: sinais["moto"] *= 3
        if r["menciona_a_pe"]: sinais["a_pe"] *= 3
        if r["menciona_grupo"]: sinais["grupo"] *= 3
        if r["menciona_armado"]: sinais["armado"] *= 3
    total = sum(sinais.values()) or 1
    return {k: 100 * v / total for k, v in sinais.items()}
```

### Passo 4: Modus operandi + alvos

Extrair de RELINTs + Disque (`amostra_relatos`):
- **Alvo predominante:** transeunte / celular / coletivo (cruzar com `desc_delito` das ocorrências para validar — `ocorrencias.md`).
- **Modus operandi:** abordagem direta, distração, encurralamento, etc. (citar trechos textuais quando possível).
- **Rotas de fuga:** trechos textuais dos RELINTs em `fuga_textos`.

### Passo 5: Comparar com modelo atual

```python
def comparar_emprego(modalidade_pct, emprego_atual_pct):
    """
    modalidade_pct = {"moto": 70, "a_pe": 20, "grupo": 5, "armado": 5}
    emprego_atual_pct = {"pé": 60, "moto": 30, "viatura": 10}
    Mapeia recomendação:
      - Crime moto → resposta moto (FM)
      - Crime grupo/armado → viatura ou patrulha em dupla
      - Crime a pé / oportunista → patrulha a pé
    """
    rec = {"pé": 0, "moto": 0, "viatura": 0}
    rec["moto"] += modalidade_pct.get("moto", 0)
    rec["pé"] += modalidade_pct.get("a_pe", 0)
    rec["viatura"] += modalidade_pct.get("armado", 0) + modalidade_pct.get("grupo", 0)
    # normalizar
    s = sum(rec.values()) or 1
    return {k: round(100 * v / s) for k, v in rec.items()}
```

### Passo 6: Diagnóstico

- **Sim** se modalidade dominante do crime corresponde à modalidade dominante do emprego FM (gap ≤15pp).
- **Parcialmente** se gap entre 15–30pp ou existe modalidade do crime com <10% do emprego.
- **Não** se gap >30pp (ex: 70% do crime usa moto, mas FM tem 80% a pé — clássico mismatch).

### Passo 7: Recomendação operacional

- **Composição sugerida** da FM na área (% pé / moto / viatura).
- **Justificativa**: 1 frase ligando modalidade do crime à modalidade da resposta.
- **Alvo de efetivo**: se o usuário informar quantidade base, sugerir N agentes por modalidade.

## Formato de saída (markdown)

```markdown
# Pergunta P3 — Dinâmica Criminal × Modelo de Emprego da FM

**Área:** [Nome amigável]
**Fontes consultadas:** [N denúncias do Disque, M RELINTs]
**Emprego atual considerado:** [composição informada ou default "60% pé, 30% moto, 10% viatura"]

## Diagnóstico

**Resposta:** [Sim / Parcialmente / Não]

[Parágrafo: modalidade dominante do crime é X (Y% dos indícios); emprego atual é Z; gap operacional é W. Cita exemplo textual concreto do RELINT ou Disque.]

## Síntese da dinâmica criminal

**Modalidade predominante:**
- Moto / motocicleta: [X%] dos indícios
- A pé: [X%]
- Grupo organizado: [X%]
- Armado: [X%]

**Alvo predominante:** [transeunte / celular / coletivo] — validado com `desc_delito` das ocorrências.

**Modus operandi típico:** [parágrafo descritivo, citando trechos dos RELINTs]

**Rotas de fuga citadas:** [trechos relevantes dos RELINTs]

## Modelo de emprego sugerido

| Modalidade | Atual | Sugerido | Δ |
|---|---|---|---|
| A pé | [%] | [%] | [+/-pp] |
| Moto | [%] | [%] | [+/-pp] |
| Viatura | [%] | [%] | [+/-pp] |

**Justificativa:** [1–2 frases conectando crime ↔ resposta]

## Citações dos dados (auditoria)

> [Trecho do RELINT mencionando modalidade]
— `RI_NNN_*.docx`

> [Trecho do Disque relevante]
— `disk_denuncia` id [N]
```

## Critérios de qualidade

- Indicadores quantitativos vêm de Disque + RELINT, não invenção.
- Cita trechos textuais para auditoria (não só "RELINT diz que...").
- Recomendação tem números (% por modalidade), não vago.
- Se a área não tem RELINT (Lauro Müller, Bangu), sinaliza limitação e usa só Disque com confiança reduzida.

## Cruzamento com mancha criminal (segurança pública)

Antes de finalizar, valide:
- Se a denúncia menciona modalidade que **não bate com a ocorrência registrada**, sinalize discrepância.
  - Ex: Disque diz "tráfico de drogas", mas as ocorrências são roubos de celular → tráfico não é o problema operacional dominante; foque em roubo.
- O foco final é **o tipo de crime que efetivamente acontece** (ocorrências), informado pela inteligência sobre como acontece (RELINTs/Disque). Não invertra.
