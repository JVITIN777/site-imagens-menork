"""Gasto das IAs (Grok pela xAI e ChatGPT pela OpenAI), mostrado pequeno no canto da tela.

So LE o gasto: nenhuma chamada aqui gera resposta nem gasta credito. As chaves sao de gerenciamento/admin
(xAI: Management Key; OpenAI: Admin Key) e ficam so no banco local (tabela ajustes), nunca no repositorio
nem no /api/estado. O site le de 30 em 30 minutos ou quando o Menork clica em atualizar.
"""
import json
import secrets
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request

from . import nucleo as n

rota = APIRouter()
SERVICOS = {"xai": "Grok (xAI)", "openai": "ChatGPT (OpenAI)"}
CACHE = {"quando": 0.0, "contas": [], "lendo": False}
_trava = threading.Lock()
INTERVALO = 30 * 60
BR = timezone(timedelta(hours=-3))


def contas():
    try:
        lista = json.loads(n.ajuste("gastos_contas", "[]") or "[]")
    except ValueError:
        lista = []
    return [c for c in lista if isinstance(c, dict) and c.get("servico") in SERVICOS]


def _http(metodo, url, chave, corpo=None, timeout=40):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    cab = {"Authorization": f"Bearer {chave}", "Accept": "application/json", "User-Agent": "site-imagens-menork"}
    if dados is not None:
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=dados, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        texto = e.read().decode("utf-8", "replace")
        try:
            corpo = json.loads(texto)
        except ValueError:
            corpo = {"erro": texto[:200]}
        return e.code, corpo


def _erro(status, r):
    if status in (401, 403):
        return "chave recusada (use a chave de gerenciamento/admin, não a chave normal)"
    msg = r.get("error") if isinstance(r, dict) else ""
    if isinstance(msg, dict):
        msg = msg.get("message")
    return f"respondeu {status}{': ' + str(msg)[:120] if msg else ''}"


def _xai(c):
    base = "https://management-api.x.ai"
    time_ = str(c.get("time") or "").strip()
    if not time_:
        st, r = _http("GET", base + "/auth/management-keys/validation", c["chave"])
        if st != 200:
            raise ValueError(_erro(st, r))
        time_ = str(r.get("teamId") or r.get("team_id") or "")
        if not time_:
            raise ValueError("não achei o ID do time; cole o Team ID (console.x.ai > Settings > Team)")
    agora = datetime.now(BR)
    ini = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fim = (agora + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    corpo = {"analyticsRequest": {"timeRange": {"startTime": ini.strftime("%Y-%m-%d %H:%M:%S"), "endTime": fim.strftime("%Y-%m-%d %H:%M:%S"),
                                                "timezone": "America/Sao_Paulo"},
                                  "timeUnit": "TIME_UNIT_DAY", "values": [{"name": "usd", "aggregation": "AGGREGATION_SUM"}],
                                  "groupBy": [], "filters": []}}
    st, r = _http("POST", f"{base}/v1/billing/teams/{time_}/usage", c["chave"], corpo)
    if st != 200:
        raise ValueError(_erro(st, r))
    hoje_txt, mes, hoje = agora.strftime("%Y-%m-%d"), 0.0, 0.0
    for serie in r.get("timeSeries") or []:
        for p in serie.get("dataPoints") or []:
            v = float((p.get("values") or [0])[0] or 0)
            mes += v
            if str(p.get("timestamp", "")).startswith(hoje_txt):
                hoje += v
    return hoje, mes


def _openai(c):
    agora = datetime.now(BR)
    ini = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    hoje_ini = agora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    url = f"https://api.openai.com/v1/organization/costs?start_time={int(ini.timestamp())}&bucket_width=1d&limit=31"
    mes = hoje = 0.0
    for _ in range(4):
        st, r = _http("GET", url, c["chave"])
        if st != 200:
            raise ValueError(_erro(st, r))
        for b in r.get("data") or []:
            v = sum(float((x.get("amount") or {}).get("value") or 0) for x in b.get("results") or [])
            mes += v
            if float(b.get("start_time") or 0) >= hoje_ini - 3 * 3600:  # o balde do dia e em UTC
                hoje += v
        if not r.get("has_more") or not r.get("next_page"):
            break
        url = url.split("&page=")[0] + "&page=" + r["next_page"]
    return hoje, mes


def ler():
    with _trava:
        if CACHE["lendo"]:
            return
        CACHE["lendo"] = True
    saida = []
    try:
        for c in contas():
            item = {"id": c["id"], "nome": c.get("nome") or SERVICOS[c["servico"]], "servico": c["servico"],
                    "limite": c.get("limite") or None}
            try:
                hoje, mes = (_xai if c["servico"] == "xai" else _openai)(c)
                item.update(hoje=round(hoje, 2), mes=round(mes, 2))
            except Exception as e:  # noqa: BLE001 - mostra o motivo pequeno na tela
                item["erro"] = str(e)[:160]
            saida.append(item)
    finally:
        CACHE.update(quando=time.time(), contas=saida, lendo=False)


def _publico():
    return {"contas": CACHE["contas"], "lido_em": datetime.fromtimestamp(CACHE["quando"], BR).strftime("%H:%M") if CACHE["quando"] else "",
            "lendo": CACHE["lendo"], "configurado": bool(contas())}


@rota.get("/api/gastos")
def gastos():
    if contas() and time.time() - CACHE["quando"] > INTERVALO and not CACHE["lendo"]:
        threading.Thread(target=ler, daemon=True).start()
    return _publico()


@rota.post("/api/gastos/atualizar")
def gastos_atualizar():
    if time.time() - CACHE["quando"] < 60:
        return _publico()
    ler()
    return _publico()


@rota.get("/api/gastos/contas")
def gastos_contas():
    return {"contas": [{"id": c["id"], "nome": c.get("nome", ""), "servico": c["servico"], "time": c.get("time", ""),
                        "limite": c.get("limite") or "", "tem_chave": bool(c.get("chave"))} for c in contas()],
            "servicos": SERVICOS}


@rota.post("/api/gastos/contas")
async def gastos_contas_salvar(request: Request):
    d = await request.json()
    lista = contas()
    if d.get("apagar"):
        lista = [c for c in lista if c["id"] != d["apagar"]]
    else:
        servico = str(d.get("servico") or "")
        if servico not in SERVICOS:
            raise HTTPException(400, "Escolha Grok (xAI) ou ChatGPT (OpenAI).")
        cid = str(d.get("id") or "") or secrets.token_hex(4)
        atual = next((c for c in lista if c["id"] == cid), None)
        chave = str(d.get("chave") or "").strip() or (atual or {}).get("chave", "")
        if not chave:
            raise HTTPException(400, "Cole a chave de gerenciamento (xAI) ou a chave Admin (OpenAI).")
        limite = str(d.get("limite") or "").replace(",", ".").strip()
        try:
            limite = round(float(limite), 2) if limite else None
        except ValueError:
            raise HTTPException(400, "Limite inválido. Ex.: 50")
        novo = {"id": cid, "servico": servico, "nome": str(d.get("nome") or "").strip()[:30] or SERVICOS[servico],
                "chave": chave, "time": str(d.get("time") or "").strip()[:80], "limite": limite}
        lista = [novo if c["id"] == cid else c for c in lista] if atual else lista + [novo]
    n.gravar_ajuste("gastos_contas", json.dumps(lista))
    CACHE["quando"] = 0
    return gastos_contas()
