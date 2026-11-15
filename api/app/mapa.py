"""Ônibus em volta do pátio para o mapa do front.

Com SPTRANS_TOKEN configurado, consulta a SPTrans Olho Vivo ao vivo (mesma lógica do DAG patio_coleta)
e guarda o resultado por MAPA_CACHE_S segundos, para não chamar a SPTrans a cada atualização da tela.
Sem token, ou se a SPTrans falhar, devolve a última coleta real do pipeline de Big Data
(data/mapa/onibus_ultima_coleta.json), marcada como "ultima_coleta".
"""
import json
import logging
import math
import time
from datetime import datetime, timezone

import httpx

from . import config
from .layout import CENTRO

log = logging.getLogger(__name__)
OLHO_VIVO = "https://api.olhovivo.sptrans.com.br/v2.1"
RAIO_COLETA_M = 1500  # o mesmo raio da coleta no Airflow
_cache: dict = {"em": 0.0, "dados": None}


def _dist_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def _onibus(prefixo, linha, lat, lon, data_hora) -> dict | None:
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    d = round(_dist_m(CENTRO["lat"], CENTRO["lon"], lat, lon))  # a mesma distância (em metros inteiros) no texto e na cor
    if d > RAIO_COLETA_M:
        return None
    return {"prefixo": str(prefixo), "linha": linha, "lat": lat, "lon": lon, "data_hora": data_hora,
            "distancia_m": d, "no_patio": d <= CENTRO["raio_m"]}


def _resposta(fonte: str, onibus: list, atualizado: str | None) -> dict:
    onibus = sorted(onibus, key=lambda o: o["distancia_m"])
    return {"fonte": fonte, "atualizado": atualizado, "centro": CENTRO, "raio_coleta_m": RAIO_COLETA_M,
            "total": len(onibus), "no_patio": sum(o["no_patio"] for o in onibus), "onibus": onibus}


async def _ao_vivo() -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{OLHO_VIVO}/Login/Autenticar", params={"token": config.SPTRANS_TOKEN})
        r.raise_for_status()
        if r.text.strip().lower() != "true":
            raise RuntimeError("autenticação da Olho Vivo recusada")
        r = await c.get(f"{OLHO_VIVO}/Posicao")
        r.raise_for_status()
        dados = r.json()
    onibus = [o for linha in dados.get("l", []) for v in linha.get("vs", [])
              if (o := _onibus(v.get("p"), linha.get("c"), v.get("py"), v.get("px"), v.get("ta")))]
    return _resposta("ao_vivo", onibus, datetime.now(timezone.utc).isoformat())


def _ultima_coleta() -> dict:
    arq = config.MAPA_SNAPSHOT
    if not arq.exists():
        return _resposta("indisponivel", [], None)
    linhas = json.loads(arq.read_text(encoding="utf-8"))
    onibus = [o for l in linhas if (o := _onibus(l.get("prefixo"), l.get("letreiro"), l.get("lat"), l.get("lon"), l.get("data_hora")))]
    atualizado = max((l.get("data_hora") for l in linhas if l.get("data_hora")), default=None)
    return _resposta("ultima_coleta", onibus, atualizado)


async def onibus_mapa() -> dict:
    if config.SPTRANS_TOKEN:
        if _cache["dados"] and time.monotonic() - _cache["em"] < config.MAPA_CACHE_S:
            return _cache["dados"]
        try:
            dados = await _ao_vivo()
            _cache.update(em=time.monotonic(), dados=dados)
            return dados
        except Exception as e:  # SPTrans fora do ar ou token inválido: cai para a última coleta, sem derrubar a tela
            log.warning("Olho Vivo indisponível, usando a última coleta: %s", e)
    return _ultima_coleta()
