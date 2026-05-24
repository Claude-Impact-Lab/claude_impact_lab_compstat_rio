"""Coleta de fontes web — G1 Rio (RSS) e O Dia (HTML scrape).

G1 Rio mantém RSS atualizado (`g1.globo.com/rss/g1/rio-de-janeiro/`).
O Dia publica RSS mas o conteúdo está parado em 2018 — coletamos via
HTML scrape da seção `/rio-de-janeiro`, que tem estrutura estável:
cada artigo é um `<a>` com `title=` e `href` em formato datado.

Roda com feedparser/httpx síncronos via `asyncio.to_thread`.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Iterable

import feedparser
import httpx
from bs4 import BeautifulSoup

from ..models import RawMention, SourceKind


# -- G1 Rio ----------------------------------------------------------------

G1_RIO_FEEDS = [
    "https://g1.globo.com/rss/g1/rio-de-janeiro/",
    "https://g1.globo.com/rss/g1/rj/rio-de-janeiro/",
]

# -- O Dia (HTML scrape) ---------------------------------------------------

O_DIA_SECTIONS = [
    "https://odia.ig.com.br/rio-de-janeiro",
]

# URL do artigo do O Dia: /rio-de-janeiro/YYYY/MM/NNNNNNN-slug.html
O_DIA_ARTICLE_RE = re.compile(
    r"^https?://odia\.ig\.com\.br/rio-de-janeiro/(\d{4})/(\d{2})/\d+[\w\-]*\.html$"
)


HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
}

# Pré-filtro grosseiro — economiza NLP em itens claramente off-topic.
TOPIC_KEYWORDS = re.compile(
    r"(roubo|assalto|furto|tiroteio|arrast[aã]o|homic[ií]dio|"
    r"facç[aã]o|tráfico|trafico|operaç[aã]o|polícia|policia|"
    r"força\s+municipal|guarda\s+municipal|gm-rio|seop|gmrio|"
    r"baleado|baleada|morto|morta\s+a\s+tiros|assassinad|chacina)",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# G1 Rio — RSS
# ---------------------------------------------------------------------------

def _strip_html(html: str) -> str:
    if not html:
        return ""
    return BeautifulSoup(html, "html.parser").get_text(" ", strip=True)


def _parse_dt(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        struct = entry.get(key)
        if struct:
            return datetime(*struct[:6], tzinfo=timezone.utc)
    return None


def _fetch_feed(url: str) -> list[dict]:
    parsed = feedparser.parse(url, request_headers=HTTP_HEADERS)
    return list(parsed.entries)


async def _collect_rss(
    feeds: Iterable[str],
    source: SourceKind,
    max_items: int,
    max_age_hours: int,
) -> list[RawMention]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    out: list[RawMention] = []
    seen: set[str] = set()

    for url in feeds:
        try:
            entries = await asyncio.to_thread(_fetch_feed, url)
        except Exception:
            continue

        for e in entries:
            link = e.get("link") or ""
            if link in seen:
                continue
            seen.add(link)

            title = e.get("title", "")
            summary = _strip_html(e.get("summary", "") or e.get("description", ""))
            combined = f"{title} {summary}"

            if not TOPIC_KEYWORDS.search(combined):
                continue

            published = _parse_dt(e)
            if published and published < cutoff:
                continue

            out.append(
                RawMention(
                    id=link or title,
                    source=source,
                    url=link or None,
                    author=e.get("author") or None,
                    text=summary or title,
                    title=title,
                    published_at=published,
                )
            )
            if len(out) >= max_items:
                return out
    return out


async def fetch_g1_rio(max_items: int, max_age_hours: int) -> list[RawMention]:
    return await _collect_rss(G1_RIO_FEEDS, "g1_rio", max_items, max_age_hours)


# ---------------------------------------------------------------------------
# O Dia — HTML scrape (RSS oficial está estagnado)
# ---------------------------------------------------------------------------

def _fetch_html(url: str) -> str:
    with httpx.Client(headers=HTTP_HEADERS, follow_redirects=True, timeout=15) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.text


def _odia_published_from_url(url: str) -> datetime | None:
    """Extrai YYYY/MM da URL; sem dia, assume meio do mês — bom o bastante p/ a janela."""
    m = O_DIA_ARTICLE_RE.match(url)
    if not m:
        return None
    year, month = int(m.group(1)), int(m.group(2))
    return datetime(year, month, 15, tzinfo=timezone.utc)


def _parse_odia_listing(html: str) -> list[tuple[str, str, str]]:
    """Retorna [(url, title, chapeu)]; `chapeu` é o badge editorial (ex.: 'luto e tristeza')."""
    soup = BeautifulSoup(html, "html.parser")
    items: list[tuple[str, str, str]] = []
    seen: set[str] = set()

    for a in soup.select('a[href*="/rio-de-janeiro/2"]'):
        href = a.get("href", "")
        if not O_DIA_ARTICLE_RE.match(href) or href in seen:
            continue
        title = (a.get("title") or "").strip()
        if not title:
            continue
        seen.add(href)
        chapeu_el = a.select_one(".chapeu")
        chapeu = chapeu_el.get_text(strip=True) if chapeu_el else ""
        items.append((href, title, chapeu))
    return items


async def fetch_o_dia(max_items: int, max_age_hours: int) -> list[RawMention]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    out: list[RawMention] = []
    seen: set[str] = set()

    for section_url in O_DIA_SECTIONS:
        try:
            html = await asyncio.to_thread(_fetch_html, section_url)
        except Exception:
            continue

        for url, title, chapeu in _parse_odia_listing(html):
            if url in seen:
                continue
            seen.add(url)

            combined = f"{chapeu} {title}"
            if not TOPIC_KEYWORDS.search(combined):
                continue

            published = _odia_published_from_url(url)
            # Mês corrente é o caso interessante; meses antigos viram cutoff.
            if published and published < cutoff and (datetime.now(timezone.utc) - published).days > 31:
                continue

            text = f"{chapeu}. {title}" if chapeu else title
            out.append(
                RawMention(
                    id=url,
                    source="o_dia",
                    url=url,
                    author=None,
                    text=text,
                    title=title,
                    published_at=published,
                )
            )
            if len(out) >= max_items:
                return out
    return out
