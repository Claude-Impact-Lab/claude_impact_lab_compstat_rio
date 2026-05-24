# Reference: RELINTs da Força Municipal

Os **Relatórios de Inteligência** (RELINTs) são a camada qualitativa **estruturada e oficial** — produzidos pela equipe de inteligência da FM, descrevem modus operandi, fluxos de fuga, pontos de receptação, perfil dos infratores. Junto com Disque Denúncia, alimentam o módulo de dinâmica criminal (P3).

## Localização e formato

- **Diretório:** `dados/relints/`
- **8 arquivos** `.docx` (Word).
- ⚠ **Nomes prefixados `Cópia de RI_NNN_...docx`** — apesar do `README.md` listar sem o prefixo. Não confie em listing por nome exato; faça match pelo sufixo (`RI_NNN_<area>.docx`).

## Mapeamento RI → área FM

Derivado de `project/backend/etl/build_data.py` (`RELINT_AREA`):

| Arquivo | Área canônica |
|---|---|
| `Cópia de RI_010_2026_Rodoviaria_Terminal_Gentileza.docx` | Rodoviária - Terminal Gentileza - Estação Leopoldina |
| `Cópia de RI_011_2026_Metro_Botafogo_Sao_Clemente.docx` | Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria |
| `Cópia de RI_012_2026_Jardim_de_Alah.docx` | Jardim de Alah |
| `Cópia de RI_013_2026_Campo_Grande_Estacao_Calcadao.docx` | Campo Grande: Estação de Trem - Calçadão |
| `Cópia de RI_014_2026_Rio_Sul.docx` | **Sem polígono dedicado** — mapeado para Metrô Botafogo (entorno) |
| `Cópia de RI_015_2026_Praia_Botafogo_Marques_Abrantes.docx` | Praia de Botafogo - Rua Marquês de Abrantes |
| `Cópia de RI_016_2026_Estacoes_SFX_Afonso_Pena.docx` | Estações São Francisco Xavier - Afonso Pena |
| `Cópia de RI_017_2026_Presidente_Vargas_Campo_Santana.docx` | Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia |

Áreas **sem RELINT**: Lauro Müller, Bangu (informar usuário se solicitado).

## ⚠ Gotchas

1. **`python-docx` não está instalado.** Extrair texto via stdlib `zipfile` + regex sobre `word/document.xml`.
2. **Conteúdo é narrativo em pt-BR**, com seções típicas: contexto, dinâmica criminal, rotas de fuga, recomendações.
3. **Não tem coordenadas** — referenciam logradouros e bairros por texto. Cruzamento espacial é via nome de rua.
4. **Texto curto** (5–7 KB por documento) — pode ser lido inteiro no contexto.

## Receita: extrair texto de um RELINT

```python
import zipfile, re, html

def ler_relint(path):
    """Extrai texto plano de um .docx via stdlib (sem python-docx)."""
    with zipfile.ZipFile(path) as z:
        with z.open("word/document.xml") as f:
            xml = f.read().decode("utf-8")
    text = re.sub(r"<[^>]+>", " ", xml)
    text = re.sub(r"\s+", " ", text)
    text = html.unescape(text).strip()
    return text
```

## Receita: mapear área canônica → caminho do RELINT

```python
import glob

RELINT_AREA = {
    "Rodoviária - Terminal Gentileza - Estação Leopoldina": "RI_010",
    "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria": "RI_011",
    "Jardim de Alah": "RI_012",
    "Campo Grande: Estação de Trem - Calçadão": "RI_013",
    # Rio Sul vai para Metrô Botafogo (entorno) — RI_014
    "Praia de Botafogo - Rua Marquês de Abrantes": "RI_015",
    "Estações São Francisco Xavier - Afonso Pena": "RI_016",
    "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia": "RI_017",
}

def caminho_relint(area_canonica):
    """Retorna lista de arquivos .docx mapeados para essa área (pode ser 0, 1 ou 2)."""
    prefixos = []
    if area_canonica == "Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria":
        prefixos = ["RI_011", "RI_014"]  # Rio Sul é entorno desta
    elif area_canonica in RELINT_AREA:
        prefixos = [RELINT_AREA[area_canonica]]

    out = []
    for p in prefixos:
        matches = glob.glob(f"dados/relints/*{p}*.docx")
        out.extend(matches)
    return out
```

## Receita: extrair indicadores de dinâmica criminal

Os RELINTs têm linguagem padronizada. Esses padrões cobrem ~80% dos casos:

```python
import re

def analisar_relint(texto):
    """
    Retorna dict com sinais quantitativos extraídos do texto do RELINT.
    Foco em segurança pública: modalidade, fluxos, alvos.
    """
    t = texto.lower()
    return {
        "menciona_moto": bool(re.search(r"motocicleta|\bmoto\b|motoqueiro", t)),
        "menciona_a_pe": bool(re.search(r"\ba p[eé]\b|caminhada", t)),
        "menciona_grupo": bool(re.search(r"\bgrupo\b|bando|dupla|trio", t)),
        "menciona_armado": bool(re.search(r"\barmado\b|\barma\b|pistola|revólver|simulacro", t)),
        "menciona_celular": "celular" in t,
        "menciona_transeunte": "transeunte" in t,
        "menciona_coletivo": "coletivo" in t,
        "menciona_fuga": bool(re.search(r"fuga|escapou|rota de dispersão|dispersão", t)),
        "menciona_receptacao": bool(re.search(r"recepta[çc][aã]o|escoamento|comercializ", t)),
        "menciona_drogas": bool(re.search(r"\bdrogas?\b|tr[áa]fico|entorpecente", t)),
        "menciona_horario_noturno": bool(re.search(r"noturno|22h|23h|00h|madrugada", t)),
        "menciona_horario_pico": bool(re.search(r"07h|08h|09h|17h|18h|19h|hor[áa]rio de pico", t)),
        "modus_operandi_textos": extrair_paragrafos(texto, "DINÂMICA CRIMINAL|MODUS|MODALIDADE"),
        "fuga_textos": extrair_paragrafos(texto, "FUGA|DISPERSÃO|ROTA"),
    }

def extrair_paragrafos(texto, palavras_chave):
    """Retorna até 3 trechos de 300 chars contendo as palavras-chave (case-insensitive)."""
    out = []
    for m in re.finditer(f"({palavras_chave})", texto, re.I):
        start = max(0, m.start() - 50)
        end = min(len(texto), m.end() + 300)
        out.append(texto[start:end].strip())
        if len(out) >= 3:
            break
    return out
```

## ⚠ Lente de segurança pública

RELINTs são **filtrados** pela inteligência da FM — quase tudo é relevante para segurança. Não há ruído de "lixo" ou "perturbação" como no Disque. Mas:

- **Cruze com hotspots de ocorrência.** Um RELINT pode mencionar "rota de fuga pela Av. X"; só vale destacar se há crimes registrados na Av. X. Use `ocorrencias.md` para validar.
- **Diferencie observação de recomendação.** O RELINT termina com seções de "recomendação". Cite-as como input, mas o relatório CompStat tem que **gerar suas próprias** com base nos dados consolidados.

## Perguntas que esta fonte responde (ou alimenta)

- Qual o modus operandi dominante na área? (a pé / moto / armado)
- Quais são as rotas de fuga citadas pela inteligência?
- Há pontos de receptação conhecidos?
- Síntese de dinâmica criminal (input direto para P3 e seção "Dinâmica Criminal" do relatório)

Não responde: volume quantitativo (use `ocorrencias.md`), denúncias da população (use `disque-denuncia.md`).
