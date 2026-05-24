# CompStat Rio em harness Claude

> **Status: Prova de Conceito (POC).** As skills leem CSVs e shapefiles versionados em `dados/`. A arquitetura-alvo substitui esses arquivos por **MCP tools sobre o data lake municipal**, sem reescrever uma linha das skills.

---

## O problema

O analista da Força Municipal precisa cruzar manualmente **6 fontes heterogêneas** — ocorrências georreferenciadas, Disque Denúncia (latin1, separador `;`, decimal `,`), RELINTs em `.docx`, fatores urbanos (com axis swap entre `coordenada_x` e latitude), polígonos shapefile e câmeras — para responder as **4 perguntas norteadoras** de cada área. Isso significa dias de planilha, ETL improvisado e formatação manual antes de chegar à decisão operacional.

## A virada

O modo antigo de usar IA: descrever o procedimento passo a passo ("primeiro carregue o CSV com `sep=';'`, depois reprojete para EPSG:31983, depois faça o `sjoin`…"). Você vira o gargalo — toda pergunta nova exige um novo roteiro.

O modo novo: dar o **problema** (pergunta em pt-BR) e as **capacidades** (skills que sabem ler as fontes, references que documentam o domínio). O Claude **monta o plano**.

Uma pergunta entra. As skills declaram quais intents resolvem e quais references carregar. O harness aplica a **lente de segurança pública** (fator urbano isolado não conta — só importa o que sobrepõe hotspot criminal) e devolve a síntese.

**Dias por área → minutos por pergunta.** É POC, mas a unidade de trabalho do CompStat muda de "compilar planilha" para "ler resposta e decidir".

---

## A demo (faça isto primeiro)

Cole no harness, depois de carregar as skills:

```
Qual é a melhor alocação das FMs?
```

Pergunta aberta de propósito. O harness deve:

1. Identificar que precisa rotear pelas **4 perguntas norteadoras** (P1 rota vs hotspots, P2 horário vs QMD, P3 modelo de emprego vs dinâmica, P4 fatores vs órgãos).
2. Resolver os polígonos das áreas da Força Municipal e cruzar com a mancha criminal de cada uma.
3. Aplicar a lente de segurança pública em cada cruzamento.
4. Sintetizar uma recomendação operacional — não um relatório por área, mas uma leitura comparativa entre áreas.

Não há resposta única. O "uau" está em **observar o plano que o Claude monta** sem fluxo fixo, escolhendo references conforme o intent.

---

> **Tese arquitetural:** as skills são a camada **estável** de domínio — modelo de áreas da FM, perguntas norteadoras, lente de segurança pública. As fontes são **plugáveis**. Hoje (POC) leem CSV. Amanhã leem MCP tools apontando para o data lake municipal. A interface de domínio não muda. Mesma pergunta passa a refletir a operação corrente, não um snapshot do hackathon.

---

## O que está empacotado

Duas skills em `.claude/skills/`:

| Skill | O que resolve | Depende de |
|---|---|---|
| `fontes-de-dados` | Lê, filtra e cruza as 6 fontes do projeto. Documenta encoding, separadores, axis swaps, reprojeção EPSG. | — |
| `relatorios-compstat` | Gera Relatório Analítico de Área ou responde individualmente às 4 perguntas norteadoras (P1 rota, P2 horário, P3 modelo de emprego, P4 fatores/órgãos). | `fontes-de-dados` |

Cada skill tem um `SKILL.md` (a entrada que o harness lê) e uma pasta `references/` com o detalhamento por fonte ou por pergunta. **Só os references relevantes ao intent são carregados** — não é tudo de uma vez.

---

## Reproduzindo a demo

Dois harnesses, mesma demo. Escolha o que couber no seu setup.

### Opção A — Claude Cowork (navegador, sem instalar nada)

**1. Clone o repositório.**

```bash
git clone <repo-url> compstat-rio
cd compstat-rio
```

**2. Empacote cada skill em um zip.**

```bash
cd .claude/skills
zip -r fontes-de-dados.zip fontes-de-dados/
zip -r relatorios-compstat.zip relatorios-compstat/
```

**3. Faça upload das skills no Cowork.**

Em `claude.ai`, abra **Settings → Capabilities → Skills** e suba os dois zips. Ative-os.

**4. Anexe os dados ao chat.** Mínimo para a demo:

- `dados/df_ocorrencias_tratado - Extração 1 .csv` (ocorrências — atenção ao espaço antes do `.csv`)
- `dados/disk_denuncia.csv` (denúncias)
- `dados/fatores_urbanos.csv` (fatores urbanos)
- `dados/cameras_areas_fm.csv` (câmeras)
- `dados/sh_area_forca/` (shapefile — zipe a pasta inteira)
- `dados/relints/` (RELINTs — zipe a pasta inteira)

**5. Cole a pergunta-demo** (acima) ou uma das variações dirigidas (abaixo).

### Opção B — Claude Code CLI (terminal, acesso nativo ao filesystem)

**1. Clone e entre no diretório.**

```bash
git clone <repo-url> compstat-rio
cd compstat-rio
```

**2. Rode `claude`.**

```bash
claude
```

As skills em `.claude/skills/` são descobertas automaticamente. Os arquivos em `dados/` ficam acessíveis pelas ferramentas nativas — nada para anexar.

**3. Cole a pergunta-demo.**

### Quando preferir cada um

| | Cowork | Claude Code |
|---|---|---|
| Setup | Upload manual de zips e dados | `git clone` + `claude` |
| Iteração | Boa para 1 demo apresentada | Melhor para múltiplas perguntas em sequência |
| Acesso a dados | Limitado ao que foi anexado | Filesystem inteiro |
| Bom para | Avaliador visual, sem ambiente | Avaliador técnico, quer abrir o motor |

---

## Variações dirigidas

Se quiser testar caminhos específicos ao invés da pergunta aberta:

```
Gere o relatório analítico completo da área Botafogo.
```

```
Quais fatores urbanos em Bangu deveriam ser priorizados pelos órgãos
complementares (Comlurb, RioLuz, SEOP, etc.)?
```

```
O horário de patrulhamento da área Centro coincide com o pico de roubos
registrados? Justifique com números.
```

> **Improvise.** A POC mostra que o harness roteia pelo intent, não por palavras-chave fixas. Pergunte do jeito do operador da FM.

---

## POC vs arquitetura-alvo

| Hoje (POC) | Arquitetura-alvo |
|---|---|
| Dados estáticos versionados em `dados/` (snapshot do período do hackathon). | Dados ao vivo via **MCP tools** conectadas ao **data lake municipal** — ocorrências, denúncias e fatores urbanos atualizados em tempo quase-real. |
| Skills carregadas manualmente (zip no Cowork, `.claude/skills/` no Claude Code). | Mesmas skills, lendo via tool em vez de CSV. **Interface de domínio inalterada.** |
| Cada CSV tem seu gotcha de encoding/separador documentado no reference. | Dado normalizado upstream pelo data lake; reference da skill descreve o modelo de domínio, não o formato do arquivo. |
| Sem auditoria de qual skill/reference o harness escolheu. | Telemetria de roteamento exposta para auditoria pelos gestores da FM. |
| Output em markdown. | Mesmo output alimentando um gerador `.docx` no template do anexo do briefing. |

**O que essa POC prova:** o problema do CompStat é resolvível **como composição de skills + tools**, sem ETL monolítico no meio. Skills são a camada de domínio estável; as fontes mudam de CSV para MCP sem reescrever a skill.

---

## Limitações conhecidas

- **Dados são um snapshot** do período do hackathon — não refletem operação corrente.
- **Sem geração de mapa/heatmap** pelas skills. Visualizações continuam em `project/backend/etl/build_data.py` + frontend Vite/React em `project/frontend/`.
- **Output é markdown.** Geração de `.docx` no formato do anexo do briefing ainda não está implementada.
- **Subset territorial.** Skills cobrem apenas as áreas da Força Municipal mapeadas em `dados/sh_area_forca/`.
- **Relatório completo (A)** é orquestrado executando as 4 perguntas em sequência — o orquestrador estruturado dedicado ainda é TODO em `relatorios-compstat/references/`.

---

## Referências internas

- Briefing completo: `Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf`
- Domínio e gotchas dos dados: `CLAUDE.md` e `README.md`
- Implementação das skills: `.claude/skills/fontes-de-dados/SKILL.md`, `.claude/skills/relatorios-compstat/SKILL.md`
