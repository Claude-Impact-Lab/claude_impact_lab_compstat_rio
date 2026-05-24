"""Crawler de menções públicas para o CompStat Rio.

Coleta itens de RSS (G1 Rio) + scrape (O Dia), envia para o Claude Haiku
em uma única chamada batched, e devolve alertas estruturados.
"""
