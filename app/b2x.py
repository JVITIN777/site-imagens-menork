"""Conversa com a API do B2X (o sistema do Menork).

O endereco e a chave ficam so no banco local (tabela ajustes), nunca no repositorio.
Regras da API seguidas aqui: toda escrita primeiro com simular/so_validar, depois a mesma chamada
com confirmar e o pedido_id devolvido; fotos sobem pelo POST /v1/fotos (link valido por 7 dias).
"""
import base64
import hashlib
import io
import json
import re
import secrets
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from PIL import Image

from . import nucleo as n

rota = APIRouter()
CANAIS = {"shopee": "Shopee", "mercadolivre": "Mercado Livre"}
_preparos = {}  # simulacoes de troca de fotos esperando o confirmar (ficam 30 min na memoria)


# ------------------------------------------------------------ conexao
def config():
    return {"nome": n.ajuste("integ_nome") or "B2X", "url": (n.ajuste("integ_url") or "").strip().rstrip("/"),
            "chave": n.ajuste("integ_chave") or ""}


def _base():
    c = config()
    if not c["url"] or not c["chave"]:
        raise HTTPException(400, f"Configure o endereço e a chave do {c['nome']} em Integrações.")
    url = c["url"]
    if url.endswith("/v1"):
        url = url[:-3]
    return url, c["chave"], c["nome"]


def chamar(metodo, caminho, corpo=None, timeout=90):
    """Devolve (status, resposta em dict). Erros de rede e de chave viram mensagem em portugues."""
    url, chave, nome = _base()
    dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8") if corpo is not None else None
    cab = {"Authorization": f"Bearer {chave}", "User-Agent": "site-imagens-menork", "Accept": "application/json",
           "X-Bot-Nome": "site-imagens-menork"}
    if dados is not None:
        cab["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url + caminho, data=dados, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, texto, espera = r.status, r.read().decode("utf-8", "replace"), r.headers.get("Retry-After")
    except urllib.error.HTTPError as e:
        status, texto, espera = e.code, e.read().decode("utf-8", "replace"), e.headers.get("Retry-After")
    except Exception as e:
        raise HTTPException(502, f"Não consegui falar com o {nome}: {e}")
    try:
        resp = json.loads(texto) if texto.strip() else {}
    except ValueError:
        raise HTTPException(502, f"O endereço configurado respondeu uma página, e não a API do {nome}. "
                                 "Confira o Endereço da API em Integrações (é o que termina em /api-b2x).")
    if status in (401, 403):
        raise HTTPException(502, f"O {nome} recusou a chave ({status}). Confira a chave em Integrações. "
                                 f"{texto_erro(resp)}".strip())
    if status == 429:
        raise HTTPException(429, f"O {nome} pediu para esperar {espera or 60} segundos (limite de chamadas). "
                                 "Tente de novo daqui a pouco; nada se perdeu.")
    if not isinstance(resp, dict):
        resp = {"dados": resp}
    return status, resp


def texto_erro(d):
    """Junta erro, correcao e a lista de erros/problemas de uma resposta do B2X numa frase."""
    if not isinstance(d, dict):
        return str(d)[:300]
    partes = [str(d.get(k)) for k in ("erro", "error", "mensagem", "message", "motivo") if d.get(k)]
    for k in ("erros", "erros_lista", "problemas", "recusados"):
        for i in (d.get(k) or [])[:6] if isinstance(d.get(k), list) else []:
            partes.append(_frase(i))
    if d.get("correcao"):
        partes.append("Como resolver: " + str(d["correcao"]))
    return " · ".join(p for p in partes if p)[:900]


def _frase(i):
    if isinstance(i, dict):
        campo = i.get("campo") or i.get("anuncio") or ""
        txt = i.get("motivo") or i.get("mensagem") or i.get("erro") or i.get("motivo_original") or json.dumps(i, ensure_ascii=False)
        cor = i.get("correcao")
        return (f"{campo}: " if campo else "") + str(txt) + (f" (como resolver: {cor})" if cor else "")
    if isinstance(i, (list, tuple)):
        return " · ".join(str(x) for x in i if x not in (None, ""))
    return str(i)


def _ok(status, d, acao):
    if 200 <= status < 300 and d.get("success", True) is not False:
        return d
    raise HTTPException(502 if status >= 500 else 400, f"{acao}: o {config()['nome']} respondeu {status}. {texto_erro(d)}")


def _sem_acento(t):
    return unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().strip().lower()


# ------------------------------------------------------------ fotos
def _arquivo_jpg(img):
    """A imagem do site em JPG (menor para subir; ML e Shopee aceitam)."""
    caminho = n.caminho_imagem(img)
    with Image.open(caminho) as im:
        im = im.convert("RGB")
        if max(im.size) > 2000:
            im.thumbnail((2000, 2000))
        b = io.BytesIO()
        im.save(b, "JPEG", quality=90, optimize=True)
        return b.getvalue()


def subir_fotos(imgs):
    """{id da imagem: link}. Reaproveita link guardado que ainda vale por mais de 1 dia."""
    with n.con() as c:
        guardados = {r["imagem_id"]: r for r in c.execute("SELECT * FROM b2x_fotos")}
    limite = (datetime.now() + timedelta(days=1)).isoformat(timespec="seconds")
    links, faltam, vistos = {}, [], set()
    for img in imgs:
        if img is None or img["id"] in vistos:
            continue
        img = dict(img)
        vistos.add(img["id"])
        g = guardados.get(img["id"])
        if g and g["sha"] == img.get("sha", g["sha"]) and (g["expira_em"] or "") > limite:
            links[img["id"]] = g["url"]
        else:
            faltam.append(img)
    lote, tamanho = [], 0
    for img in faltam + [None]:
        dados = _arquivo_jpg(img) if img else b""
        if img is None or len(lote) == 20 or tamanho + len(dados) > 14 * 1024 * 1024:
            if lote:
                _enviar_lote(lote, links)
            lote, tamanho = [], 0
        if img is not None:
            lote.append((img, dados))
            tamanho += len(dados)
    return links


def _enviar_lote(lote, links, tentativa=1):
    corpo = {"fotos": [{"arquivo_base64": base64.b64encode(d).decode("ascii")} for _, d in lote], "prazo_s": 90}
    status, r = chamar("POST", "/v1/fotos", corpo, timeout=150)
    if status >= 500 and tentativa < 3:
        time.sleep(5 * tentativa)
        return _enviar_lote(lote, links, tentativa + 1)
    itens = r.get("fotos") or []
    if not itens:
        raise HTTPException(502, f"Não consegui subir as fotos no {config()['nome']} ({status}). {texto_erro(r)}")
    pendentes, erros = [], []
    with n.con() as c:
        for i, (img, d) in enumerate(lote):
            item = next((x for x in itens if x.get("indice") == i), itens[i] if i < len(itens) else {})
            if item.get("situacao") == "ok" and item.get("url"):
                links[img["id"]] = item["url"]
                c.execute("INSERT OR REPLACE INTO b2x_fotos(imagem_id, sha, url, expira_em) VALUES(?,?,?,?)",
                          (img["id"], img.get("sha", ""), item["url"], str(item.get("expira_em") or "")[:19]))
            elif item.get("situacao") == "pendente" or item.get("temporario"):
                pendentes.append((img, d))
            else:
                erros.append(f"{img.get('nome_original') or img['id']}: {item.get('motivo') or 'recusada'}")
    if erros:
        raise HTTPException(400, "O B2X recusou foto(s): " + "; ".join(erros[:5]))
    if pendentes:
        if tentativa >= 4:
            raise HTTPException(502, "O B2X não terminou de receber as fotos. Tente de novo em 1 minuto.")
        _enviar_lote(pendentes, links, tentativa + 1)


# ------------------------------------------------------------ lojas e anuncios
@rota.get("/api/b2x/lojas")
def lojas(canal: str = ""):
    status, d = chamar("GET", "/v1/clientes")
    _ok(status, d, "Ler as lojas")
    fmt = d.get("formato_lojas") or ["id", "canal", "nome", "status", "aviso", "pj"]
    saida = []
    for cl in d.get("clientes") or []:
        for l in cl.get("lojas") or []:
            x = dict(zip(fmt, l)) if isinstance(l, list) else dict(l)
            if canal and x.get("canal") != canal:
                continue
            saida.append({"id": str(x.get("id") or ""), "canal": x.get("canal") or "", "nome": str(x.get("nome") or ""),
                          "status": x.get("status") or "", "aviso": x.get("aviso") or "", "pj": x.get("pj") or "",
                          "cliente": str(cl.get("nome") or ""), "cliente_id": str(cl.get("id") or "")})
    saida.sort(key=lambda x: (_sem_acento(x["cliente"]), _sem_acento(x["nome"])))
    fmt_pj = d.get("formato_pjs") or ["cnpj_id", "rotulo", "ordem", "cnpj"]
    info = [{"id": str(cl.get("id") or ""), "nome": str(cl.get("nome") or ""), "gestor": str(cl.get("gestor_nome") or ""),
             "pjs": [{"rotulo": str(x.get("rotulo") or ""), "cnpj": str(x.get("cnpj") or ""), "ordem": x.get("ordem"),
                      "codigo": f"PJ{int(x['ordem']):02d}" if str(x.get("ordem") or "").isdigit() else ""}
                     for x in ((dict(zip(fmt_pj, p)) if isinstance(p, list) else p) for p in (cl.get("pjs") or [])) if isinstance(x, dict)]}
            for cl in d.get("clientes") or []]
    return {"lojas": saida, "clientes": info, "sistema": config()["nome"]}


def _primeira_foto(x):
    for k in ("capa_url", "imagem_url", "foto_url"):
        if str(x.get(k) or "").startswith("http"):
            return x[k]
    for k in ("fotos_urls", "fotos_anuncio", "fotos"):
        for f in x.get(k) or []:
            u = f if isinstance(f, str) else (f.get("url") or "") if isinstance(f, dict) else ""
            if str(u).startswith("http"):
                return u
    return ""


@rota.get("/api/b2x/anuncios")
def anuncios(loja: str, busca: str = "", pagina: int = 1, fotos_ao_vivo: int = 0):
    """Anuncios de uma loja. Pede detalhe=1: so assim o B2X manda capa_url e fotos_urls (a lista curta nao tem foto).
    fotos_ao_vivo=1 (botao Atualizar) faz o B2X ler as fotos agora no marketplace (Shopee, ate 100)."""
    q = {"loja": loja, "pagina": max(1, pagina), "detalhe": 1}
    if busca.strip():
        q["busca"] = busca.strip()[:100]
    if fotos_ao_vivo:
        q["fotos_ao_vivo"] = 1
    status, d = chamar("GET", "/v1/anuncios?" + urllib.parse.urlencode(q), timeout=150)
    _ok(status, d, "Ler os anúncios")
    itens = []
    cols = d.get("colunas") or ["id", "preco", "promo", "estoque", "desconto_%", "variacoes_sem_estoque", "titulo", "alterado_em", "status"]
    for it in d.get("itens") or []:  # se o B2X devolver a lista curta mesmo assim (sem foto)
        x = dict(zip(cols, it)) if isinstance(it, list) else it
        itens.append({"id": str(x.get("id") or x.get("anuncio_id") or ""), "titulo": str(x.get("titulo") or x.get("titulo_completo") or ""),
                      "preco": x.get("preco"), "estoque": x.get("estoque"), "status": x.get("status") or "", "capa": _primeira_foto(x),
                      "url": x.get("url") or ""})
    for x in d.get("anuncios") or []:
        itens.append({"id": str(x.get("anuncio_id") or x.get("id") or ""), "titulo": str(x.get("titulo_completo") or x.get("titulo") or ""),
                      "preco": x.get("preco"), "estoque": x.get("estoque"), "status": x.get("status") or "",
                      "capa": _primeira_foto(x), "url": x.get("url") or ""})
    com = sum(bool(i["capa"]) for i in itens)
    return {"anuncios": itens, "total": d.get("total") or len(itens), "pagina": d.get("pagina") or pagina,
            "paginas": d.get("paginas") or 1, "lido_em": d.get("sincronizado_em_brasilia") or d.get("fotos_lidas_em_brasilia") or "",
            "diagnostico": {"formato": "detalhe" if d.get("anuncios") else "lista curta", "com_capa": com, "sem_capa": len(itens) - com,
                            "fotos_ao_vivo": bool(fotos_ao_vivo)}}


@rota.get("/api/b2x/foto")
def foto(u: str):
    """Passa a foto do marketplace pelo nosso servidor, para quando o navegador nao consegue abrir o link direto."""
    from fastapi.responses import Response
    if not re.match(r"^https://[A-Za-z0-9.-]+/", u) or len(u) > 1500:
        raise HTTPException(400, "Link de foto inválido.")
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (site-imagens-menork)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            tipo = r.headers.get("Content-Type") or ""
            if not tipo.startswith("image/"):
                raise HTTPException(400, "O link não é uma imagem.")
            dados = r.read(15 * 1024 * 1024)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Não consegui baixar a foto: {e}")
    return Response(dados, media_type=tipo, headers={"Cache-Control": "max-age=86400"})


def _detalhe(loja, anuncio):
    status, d = chamar("GET", "/v1/anuncios?" + urllib.parse.urlencode({"loja": loja, "anuncio": anuncio}))
    _ok(status, d, "Ler o anúncio")
    a = (d.get("anuncios") or [None])[0] or d.get("anuncio") or d
    return a if isinstance(a, dict) else {}, d


def _cores_do(a):
    cores = []
    for g in a.get("grade") or []:
        if _sem_acento(g.get("nome")).startswith("cor"):
            cores += [str(o.get("nome")) for o in g.get("opcoes") or [] if o.get("nome")]
    for v in a.get("variacoes") or []:
        if v.get("cor"):
            cores.append(str(v["cor"]))
    if a.get("cor"):
        cores.append(str(a["cor"]))
    vistos = set()
    return [c for c in cores if not (_sem_acento(c) in vistos or vistos.add(_sem_acento(c)))]


@rota.get("/api/b2x/anuncio")
def anuncio(loja: str, anuncio: str, canal: str = ""):
    a, bruto = _detalhe(loja, anuncio)
    familia = [str(x if not isinstance(x, (list, dict)) else (x[0] if isinstance(x, list) else x.get("anuncio") or x.get("id")))
               for x in (a.get("anuncios_da_familia") or bruto.get("anuncios_da_familia") or [])]
    cores, por_cor = _cores_do(a), {}
    if canal == "mercadolivre" and len(familia) > 1:  # conta user product: 1 MLB por cor/tamanho
        for i in range(0, min(len(familia), 150), 50):
            status, d = chamar("GET", "/v1/anuncios?" + urllib.parse.urlencode({"loja": loja, "anuncios": ",".join(familia[i:i + 50])}))
            for x in (d.get("anuncios") or []) if 200 <= status < 300 else []:
                for cor in _cores_do(x):
                    por_cor.setdefault(cor, str(x.get("anuncio_id") or ""))
        cores = list(por_cor) or cores
    fotos = []
    for f in (a.get("fotos_urls") or a.get("fotos_anuncio") or a.get("fotos") or a.get("imagens") or [])[:20]:
        u = f if isinstance(f, str) else (f.get("url") or f.get("link") or "") if isinstance(f, dict) else ""
        if str(u).startswith("http"):
            fotos.append(u)
    lista = [{"cor": str(v.get("cor") or ""), "tamanho": str(v.get("tamanho") or ""), "preco": v.get("preco"),
              "estoque": v.get("estoque"), "sku": str(v.get("sku") or v.get("seller_sku") or "")}
             for v in (a.get("variacoes") or [])[:150] if isinstance(v, dict)]
    desc = a.get("descricao") or a.get("descricao_texto") or ""
    return {"id": str(a.get("anuncio_id") or anuncio), "titulo": a.get("titulo_completo") or a.get("titulo") or "",
            "capa": _primeira_foto(a), "qtd_fotos": a.get("qtd_fotos"), "status": a.get("status") or "",
            "cores": cores, "familia": bool(por_cor) or len(familia) > 1, "anuncio_da_cor": por_cor,
            "variacoes": len(a.get("variacoes") or []) or len(familia), "url": a.get("url") or a.get("link") or "",
            "fotos": fotos, "lista_variacoes": lista, "descricao": str(desc)[:5000] if isinstance(desc, str) else "",
            "preco": a.get("preco"), "estoque": a.get("estoque")}


# ------------------------------------------------------------ trocar as fotos de um anuncio que ja existe
def _anuncio_local(aid):
    from .main import montagem
    with n.con() as c:
        m = montagem(c, aid)
    return m


@rota.post("/api/b2x/fotos/simular")
async def fotos_simular(request: Request):
    d = await request.json()
    aid, loja, anuncio_id, canal = int(d["aid"]), str(d["loja"]), str(d["anuncio"]), str(d.get("canal", ""))
    mapa = {str(k): str(v) for k, v in (d.get("mapa") or {}).items() if v}  # cor no marketplace -> cor no site
    if d.get("ajustar_modo") and canal in ("shopee", "mercadolivre"):  # troca em lote: o modo segue a loja escolhida
        with n.con() as c:
            c.execute("UPDATE anuncios SET modo=? WHERE id=?", ("ml" if canal == "mercadolivre" else "shopee", aid))
    m = _anuncio_local(aid)
    L = m["linhas"]
    variacoes = {v["cor"].lower(): v for v in L["variacoes"]}
    for cor_site in mapa.values():
        if cor_site.lower() not in variacoes:
            raise HTTPException(400, f"A cor {cor_site} não existe neste anúncio do site.")
    galeria = bool(d.get("galeria")) and canal == "shopee"
    if not mapa and not galeria:
        raise HTTPException(400, "Escolha pelo menos uma cor para trocar.")
    envios = []
    if canal == "shopee":
        fotos = ([L["capa"]] if L["capa"] else []) + L["galeria"]
        if galeria and not fotos:
            raise HTTPException(400, "Este anúncio do site não tem capa nem fotos para mandar.")
        imgs = (fotos[:9] if galeria else []) + [variacoes[c.lower()]["capa"] for c in mapa.values()]
        links = subir_fotos(imgs)
        corpo = {"loja": loja, "anuncio": anuncio_id}
        if galeria:
            corpo["fotos"] = [links[r["id"]] for r in fotos[:9]]
        if mapa:
            corpo["fotos_por_cor"] = {cor_mk: links[variacoes[cor_site.lower()]["capa"]["id"]] for cor_mk, cor_site in mapa.items()}
        envios.append({"rotulo": "Fotos do anúncio e capas das cores" if galeria and mapa else ("Fotos do anúncio" if galeria else "Capas das cores"),
                       "corpo": corpo})
    else:
        sem = [c for c in mapa.values() if not variacoes[c.lower()]["fotos"]]
        if sem:
            raise HTTPException(400, f"A cor {sem[0]} não tem fotos no modo Mercado Livre do site. Monte as fotos dela primeiro.")
        links = subir_fotos([r for c in mapa.values() for r in variacoes[c.lower()]["fotos"][:10]])
        fotos_de = lambda c: [links[r["id"]] for r in variacoes[c.lower()]["fotos"][:10]]
        info = anuncio(loja, anuncio_id, "mercadolivre")
        if info["familia"]:  # uma chamada por cor, para todos os tamanhos dela
            for cor_mk, cor_site in mapa.items():
                alvo = info["anuncio_da_cor"].get(cor_mk)
                if not alvo:
                    raise HTTPException(400, f"Não achei no Mercado Livre o anúncio da cor {cor_mk}.")
                envios.append({"rotulo": f"Cor {cor_mk} (todos os tamanhos)",
                               "corpo": {"loja": loja, "anuncio": alvo, "aplicar_em": "mesma_cor", "fotos": fotos_de(cor_site)}})
        else:
            envios.append({"rotulo": "Fotos de cada cor", "corpo": {"loja": loja, "anuncio": anuncio_id,
                                                                     "fotos_por_cor": {k: fotos_de(v) for k, v in mapa.items()}}})
    resultado = []
    for e in envios:
        status, r = chamar("POST", "/v1/anuncios/editar", dict(e["corpo"], simular=True), timeout=150)
        ok = 200 <= status < 300 and r.get("success", True) is not False
        e["pedido_id"] = r.get("pedido_id") or ""
        resultado.append({"rotulo": e["rotulo"], "ok": ok, "mudancas": _mudancas(r), "avisos": [_frase(x) for x in (r.get("avisos") or [])][:8],
                          "erro": "" if ok else (texto_erro(r) or f"respondeu {status}"), "pedido_id": e["pedido_id"]})
    token = secrets.token_hex(12)
    _limpar_preparos()
    _preparos[token] = {"aid": aid, "loja": loja, "anuncio": anuncio_id, "canal": canal, "envios": envios, "quando": time.time()}
    return {"token": token, "envios": resultado, "pode_confirmar": any(r["ok"] for r in resultado)}


def _mudancas(r):
    ms = r.get("mudancas") or (r.get("envio_previsto") or {}).get("mudancas") or []
    saida = []
    for x in ms[:20]:
        if isinstance(x, dict):
            campo = x.get("campo") or ""
            alvo = x.get("anuncio")
            saida.append(f"{campo}{' em ' + str(alvo) if alvo else ''}")
        else:
            saida.append(str(x)[:120])
    return saida


def _limpar_preparos():
    for k in [k for k, v in _preparos.items() if time.time() - v["quando"] > 1800]:
        _preparos.pop(k, None)


@rota.post("/api/b2x/editar/simular")
async def editar_simular(request: Request):
    """Muda titulo, descricao, preco ou estoque de um anuncio de qualquer loja. So o que veio preenchido muda."""
    d = await request.json()
    loja, anuncio_id = str(d["loja"]), str(d["anuncio"])
    corpo = {"loja": loja, "anuncio": anuncio_id}
    if str(d.get("titulo") or "").strip():
        corpo["titulo"] = str(d["titulo"]).strip()[:255]
    if str(d.get("descricao") or "").strip():
        corpo["descricao"] = str(d["descricao"]).strip()[:20000]
    if str(d.get("preco") or "").strip():
        p = _preco(d["preco"])
        if not p:
            raise HTTPException(400, "Preço inválido. Use por exemplo 49,90.")
        corpo["preco"] = p
    if str(d.get("estoque") or "").strip():
        try:
            corpo["estoque"] = int(str(d["estoque"]).strip())
        except ValueError:
            raise HTTPException(400, "Estoque inválido: use um número inteiro.")
    if len(corpo) == 2:
        raise HTTPException(400, "Preencha pelo menos um campo para mudar.")
    if d.get("familia") and ("preco" in corpo or "estoque" in corpo):
        corpo["aplicar_em"] = "familia"  # ML com um anuncio por cor/tamanho: o mesmo valor em todos
    status, r = chamar("POST", "/v1/anuncios/editar", dict(corpo, simular=True), timeout=150)
    ok = 200 <= status < 300 and r.get("success", True) is not False
    rot = "Mudar " + ", ".join({"titulo": "título", "descricao": "descrição", "preco": "preço", "estoque": "estoque"}[k]
                               for k in corpo if k in ("titulo", "descricao", "preco", "estoque"))
    envio = {"rotulo": rot, "corpo": corpo, "pedido_id": r.get("pedido_id") or ""}
    token = secrets.token_hex(12)
    _limpar_preparos()
    _preparos[token] = {"aid": None, "loja": loja, "anuncio": anuncio_id, "canal": d.get("canal", ""), "envios": [envio], "quando": time.time()}
    return {"token": token, "pode_confirmar": ok and bool(envio["pedido_id"]),
            "envios": [{"rotulo": rot, "ok": ok, "mudancas": _mudancas(r), "avisos": [_frase(x) for x in (r.get("avisos") or [])][:8],
                        "erro": "" if ok else (texto_erro(r) or f"respondeu {status}"), "pedido_id": envio["pedido_id"]}]}


@rota.post("/api/b2x/confirmar")
@rota.post("/api/b2x/fotos/confirmar")
async def fotos_confirmar(request: Request):
    d = await request.json()
    p = _preparos.get(str(d.get("token")))
    if not p:
        raise HTTPException(400, "A simulação venceu (passou de 30 minutos). Simule de novo.")
    saida = []
    for e in p["envios"]:
        if not e.get("pedido_id"):
            saida.append({"rotulo": e["rotulo"], "ok": False, "erro": "não passou na simulação; nada foi enviado"})
            continue
        corpo = dict(e["corpo"], confirmar=True, pedido_id=e["pedido_id"])
        status, r = chamar("POST", "/v1/anuncios/editar", corpo, timeout=180)
        ok = 200 <= status < 300 and r.get("success", True) is not False and r.get("situacao", "feito") != "recusado"
        conferido = r.get("conferido") or {}
        saida.append({"rotulo": e["rotulo"], "ok": ok, "situacao": r.get("situacao") or ("feito" if ok else "recusado"),
                      "erro": "" if ok else texto_erro(r), "ainda_antigos": conferido.get("campos_ainda_antigos") or [],
                      "desfazer": bool(r.get("desfazer_com"))})
        if p["aid"]:
            _registrar(p["aid"], ok, f"trocar fotos {p['anuncio']} ({e['rotulo']}): {saida[-1]['situacao']}", p["anuncio"],
                       r.get("desfazer_com"))
        else:
            n.registrar(f"B2X: {e['rotulo']} em {p['anuncio']} (loja {p['loja']}): {saida[-1]['situacao']}")
    _preparos.pop(str(d.get("token")), None)
    return {"envios": saida}


def _registrar(aid, ok, resposta, id_externo, desfazer=None):
    with n.con() as c:
        c.execute("INSERT INTO envios(anuncio_id,quando,por,ok,resposta,id_externo) VALUES(?,?,?,?,?,?)",
                  (aid, n.agora(), "você", int(ok), (resposta + (" | desfazer: " + json.dumps(desfazer, ensure_ascii=False) if desfazer else ""))[:1500],
                   str(id_externo or "")))


# ------------------------------------------------------------ historico de anuncios criados (para conferir o status depois)
def criacao_nova(aid, loja, canal, por, titulo, status, ids=(), pedido_b2x="", mensagem="", pedido_bot=None, promo=None):
    with n.con() as c:
        nome = c.execute("SELECT nome FROM anuncios WHERE id=?", (aid,)).fetchone() if aid else None
        return c.execute("INSERT INTO criacoes(quando,atualizado,anuncio_id,anuncio_nome,titulo,loja,canal,por,pedido_b2x,pedido_bot,status,"
                         "anuncio_ids,mensagem,promo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (n.agora(), n.agora(), aid, nome[0] if nome else "", str(titulo or "")[:200], str(loja), canal, por, str(pedido_b2x or ""),
                          pedido_bot, status, ",".join(map(str, ids)), str(mensagem or "")[:1500], f"{promo:.2f}" if promo else "")).lastrowid


def _promo_do_anuncio(c, aid):
    """Preco promocional que o Menork pos no anuncio do site (preco menor que o cheio); None se nao tem."""
    if not aid:
        return None
    a = c.execute("SELECT preco, preco_antigo FROM anuncios WHERE id=?", (aid,)).fetchone()
    if not a:
        return None
    preco, cheio = _preco(a["preco"]), _preco(a["preco_antigo"])
    return preco if preco and cheio and cheio > preco else None


def _falta_promo(c, r):
    """Shopee criado com preco cheio e ainda fora da promocao: devolve o preco promocional que falta colocar."""
    if r.get("canal") != "shopee" or r.get("promo_feita") or not r.get("anuncio_ids") or r.get("status") != "criado":
        return ""
    if r.get("promo"):
        return r["promo"]
    v = _promo_do_anuncio(c, r.get("anuncio_id"))
    return f"{v:.2f}" if v else ""


def criacao_mudar(pedido_b2x="", cid=None, **campos):
    if not campos or not (pedido_b2x or cid):
        return
    campos["atualizado"] = n.agora()
    with n.con() as c:
        c.execute(f"UPDATE criacoes SET {', '.join(k + '=?' for k in campos)} WHERE " + ("id=?" if cid else "pedido_b2x=?"),
                  [*campos.values(), cid or str(pedido_b2x)])


@rota.get("/api/criacoes")
def criacoes():
    with n.con() as c:
        # os criados antes do historico existir: vem dos envios do anuncio ("criar no Shopee: criado ...")
        ja = {r[0] for r in c.execute("SELECT anuncio_ids FROM criacoes")}
        for e in c.execute("SELECT e.*, a.nome, a.titulo FROM envios e LEFT JOIN anuncios a ON a.id=e.anuncio_id "
                           "WHERE e.ok=1 AND e.id_externo<>'' AND (e.resposta LIKE 'criar%' OR e.resposta='') ORDER BY e.id").fetchall():
            if e["id_externo"] in ja:
                continue
            perto = " ".join(r[0] or "" for r in c.execute("SELECT resposta FROM envios WHERE anuncio_id=? AND resposta LIKE 'criar%'",
                                                            (e["anuncio_id"],)))
            texto = (e["resposta"] or "") + " " + perto
            m = re.search(r'"loja": "([^"]+)"', texto)
            canal = "mercadolivre" if "Mercado Livre" in texto else "shopee" if "Shopee" in texto else ""
            c.execute("INSERT INTO criacoes(quando,atualizado,anuncio_id,anuncio_nome,titulo,loja,canal,por,status,anuncio_ids,mensagem) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?)", (e["quando"], e["quando"], e["anuncio_id"], e["nome"] or "", e["titulo"] or "",
                                                       m.group(1) if m else "", canal, e["por"] or "você", "criado", e["id_externo"], ""))
            ja.add(e["id_externo"])
        linhas = [dict(r) for r in c.execute("SELECT * FROM criacoes ORDER BY id DESC LIMIT 300")]
        # pedidos ao Grok que ainda nao viraram criacao
        com = {r["pedido_bot"] for r in linhas if r["pedido_bot"]}
        grok = []
        for p in c.execute("SELECT p.*, a.nome AS anuncio_nome, a.titulo FROM pedidos p LEFT JOIN anuncios a ON a.id=p.anuncio_id "
                           "WHERE p.tipo='publicar' ORDER BY p.id DESC LIMIT 200"):
            if p["id"] in com:
                continue
            dados = json.loads(p["dados"] or "{}")
            resp = str(p["resposta"] or "")
            criado_txt = p["status"] == "feito" and resp.lower().startswith("criado")
            grok.append({"id": f"g{p['id']}", "quando": p["criado_em"], "atualizado": p["atualizado"], "anuncio_id": p["anuncio_id"],
                         "anuncio_nome": p["anuncio_nome"] or "", "titulo": p["titulo"] or "", "loja": dados.get("loja", ""),
                         "canal": dados.get("canal", ""), "por": "Grok" + (f" ({p['bot']})" if p["bot"] else ""),
                         "status": "criado" if criado_txt else {"aberto": "esperando_grok", "pego": "grok_fazendo", "feito": "grok_terminou"}.get(p["status"], p["status"]),
                         "mensagem": resp, "pedido_bot": p["id"], "anuncio_ids": ",".join(re.findall(r"\b\d{5,}\b", resp)[:5]) if criado_txt else "", "pedido_b2x": "", "situacao_loja": "", "url": ""})
        for r in linhas + grok:
            r["falta_promo"] = _falta_promo(c, r)
    return {"criacoes": sorted(linhas + grok, key=lambda r: r["quando"] or "", reverse=True)}


@rota.post("/api/criacoes/{cid}/conferir")
def criacao_conferir(cid: int):
    """Pergunta ao B2X como esta: se ainda esta na fila, o andamento; se ja foi criado, a situacao do anuncio na loja."""
    with n.con() as c:
        r = c.execute("SELECT * FROM criacoes WHERE id=?", (cid,)).fetchone()
    if not r:
        raise HTTPException(404, "Não achei esse registro.")
    ids = [x for x in (r["anuncio_ids"] or "").split(",") if x]
    if r["pedido_b2x"] and (not ids or r["status"] in ("na_fila", "criando")):
        s = criar_status(r["pedido_b2x"], r["loja"])
        novos = [x.strip() for x in str(s["anuncio_id"] or "").split(",") if x.strip()]
        if s["final"] or s["parar"]:
            ok = bool(novos) and s["estado"] not in ("recusado", "apagado", "parado")
            criacao_mudar(cid=cid, status="criado" if ok else "erro", anuncio_ids=",".join(novos) or r["anuncio_ids"],
                          mensagem=(s["motivo"] or "; ".join(s["erros"][:3]) or s["etapa"] or s["estado"])[:1500])
            ids = novos or ids
        else:
            criacao_mudar(cid=cid, status="na_fila", mensagem=f"{s['etapa'] or s['estado']}"[:300])
    if ids:
        try:
            a = anuncio(r["loja"], ids[0], r["canal"])
            criacao_mudar(cid=cid, situacao_loja=str(a.get("status") or "")[:80], url=str(a.get("url") or "")[:400],
                          **({"titulo": a["titulo"][:200]} if a.get("titulo") else {}))
        except HTTPException as e:
            criacao_mudar(cid=cid, situacao_loja=f"não achei na loja: {e.detail}"[:200])
    with n.con() as c:
        return dict(c.execute("SELECT * FROM criacoes WHERE id=?", (cid,)).fetchone())


# ------------------------------------------------------------ criar anuncio novo
@rota.post("/api/b2x/categorias")
async def categorias(request: Request):
    d = await request.json()
    corpo = {"loja": str(d["loja"]), "titulo": str(d.get("titulo") or "")[:150]}
    if str(d.get("busca") or "").strip():
        corpo["busca"] = str(d["busca"]).strip()[:80]
    status, r = chamar("POST", "/v1/anuncios/criar/categoria", corpo)
    _ok(status, r, "Buscar categoria")
    lista, vistas = [], set()
    for x in (r.get("sugeridas") or []) + (r.get("busca") or []):
        cat = x[0] if isinstance(x, list) else x.get("categoria")
        if cat is not None and str(cat) not in vistas:
            vistas.add(str(cat))
            lista.append({"id": str(cat), "caminho": str((x[1] if isinstance(x, list) and len(x) > 1 else x.get("caminho")) or cat),
                          "motivo": str((x[2] if isinstance(x, list) and len(x) > 2 else (x.get("motivo_sugestao") if isinstance(x, dict) else "")) or "")})
    return {"categorias": lista[:15], "dica": r.get("dica") or ""}


@rota.get("/api/b2x/ficha")
def ficha(loja: str, categoria: str, marca: str = ""):
    q = {"loja": loja, "categoria": categoria}
    if marca.strip():
        q["marca"] = marca.strip()[:40]
    status, r = chamar("GET", "/v1/anuncios/criar/ficha?" + urllib.parse.urlencode(q))
    _ok(status, r, "Ler a ficha da categoria")
    def lista_attr(itens):
        saida = []
        for o in itens or []:
            if isinstance(o, list) and len(o) >= 2:  # formato compacto [id, nome, (opcoes)]
                o = {"id": o[0], "nome": o[1], "opcoes": o[2] if len(o) > 2 and isinstance(o[2], list) else []}
            if not isinstance(o, dict) or o.get("id") is None:
                continue
            opcoes = [{"id": str(x[0]), "nome": str(x[1])} if isinstance(x, list) else {"id": str(x.get("id")), "nome": str(x.get("nome"))}
                      for x in (o.get("opcoes") or o.get("valores") or [])[:400] if isinstance(x, (list, dict))]
            saida.append({"id": str(o.get("id")), "nome": str(o.get("nome") or o.get("id")), "opcoes": opcoes,
                          "texto": bool(o.get("aceita_texto")) or not opcoes, "multi": bool(o.get("multiplo") or o.get("multi")),
                          "unidades": [str(u) for u in (o.get("unidades") or [])][:10]})
        return saida
    obrig = lista_attr(r.get("obrigatorios"))
    ids_obrig = {o["id"] for o in obrig}
    # os que nao sao obrigatorios mas deixam o anuncio completo (a Shopee mostra "Complete: 1/9")
    opc = [o for k in ("opcionais", "recomendados", "atributos_opcionais", "outros_atributos", "atributos")
           for o in lista_attr(r.get(k) if isinstance(r.get(k), list) else []) if o["id"] not in ids_obrig]
    vistos, opcionais = set(), []
    for o in opc:
        if o["id"] not in vistos:
            vistos.add(o["id"]); opcionais.append(o)
    marca_ = r.get("marca") or {}
    lista = [{"id": str(x[0]), "nome": str(x[1])} if isinstance(x, list) else {"id": str(x.get("id")), "nome": str(x.get("nome"))}
             for x in (marca_.get("lista") or [])[:300]] if isinstance(marca_, dict) else []
    tipos = [{"id": str(x[0] if isinstance(x, list) else x.get("id")), "nome": str(x[1] if isinstance(x, list) else x.get("nome"))}
             for x in (r.get("tipos_anuncio") or [])] if isinstance(r.get("tipos_anuncio"), list) else []
    return {"canal": r.get("canal") or "", "obrigatorios": obrig, "opcionais": opcionais[:40], "campos_b2x": sorted(r.keys())[:60], "marcas": lista,
            "sem_marca": bool(marca_.get("sem_marca_aceita")) if isinstance(marca_, dict) else False,
            "tabela_exige": bool((r.get("tabela_medidas") or {}).get("exige")), "tipos_anuncio": tipos, "dica": r.get("dica") or ""}


def _preco(t):
    t = str(t or "").strip().replace("R$", "").replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return round(float(t), 2)
    except ValueError:
        return None


def _num(v, nome):
    try:
        x = float(str(v).replace(",", "."))
        if x <= 0:
            raise ValueError
        return x
    except ValueError:
        raise HTTPException(400, f"Preencha {nome} com um número maior que zero.")


@rota.post("/api/b2x/criar")
async def criar(request: Request):
    return criar_do_site(await request.json())


def criar_do_site(d, por="você"):
    """Cria na loja o anuncio do site (modo Shopee ou ML). Sem confirmar = so valida. O bot usa esta mesma funcao."""
    aid, loja, canal = int(d["aid"]), str(d["loja"]), str(d.get("canal") or "")
    m = _anuncio_local(aid)
    L, a = m["linhas"], m["anuncio"]
    preco = _preco(a["preco"])
    if not preco:
        raise HTTPException(400, "Preencha o preço do anúncio no site antes de criar.")
    cheio = _preco(a["preco_antigo"])
    promo_ml = preco if canal == "mercadolivre" and cheio and cheio > preco else None
    promo_shopee = preco if canal == "shopee" and cheio and cheio > preco else None
    if promo_ml or promo_shopee:  # sobe com o preco cheio; ML: desconto direto depois; Shopee: voce coloca numa promocao da loja
        preco = cheio
    if not (a["titulo"] or "").strip() or not (a["descricao"] or "").strip():
        raise HTTPException(400, "Preencha o título e a descrição do anúncio no site antes de criar.")
    tamanhos = m["tamanhos"]
    if not tamanhos:
        raise HTTPException(400, "Preencha os tamanhos (Variação 2) do anúncio no site antes de criar.")
    if not L["variacoes"]:
        raise HTTPException(400, "O anúncio do site ainda não tem cores (Variação 1).")
    estoque = int(_num(d.get("estoque") or 0, "o estoque de cada variação"))
    ml = canal == "mercadolivre"
    galeria = [] if ml else (([L["capa"]] if L["capa"] else []) + L["galeria"])[:9]
    por_cor = {v["cor"]: (v["fotos"][:10] if ml else [v["capa"]]) for v in L["variacoes"]}
    sem = [c for c, f in por_cor.items() if not f]
    if sem:
        raise HTTPException(400, f"A cor {sem[0]} ainda não tem foto no modo {'Mercado Livre' if ml else 'Shopee'} do site.")
    tabela = next((r for r in L["galeria"] + L["resto"] + [x for v in L["variacoes"] for x in v["fotos"]] if r["tipo"] == "tabela"), None) \
        if d.get("tabela") and not ml else None
    links = subir_fotos(galeria + [r for f in por_cor.values() for r in f] + ([tabela] if tabela else []))
    sku = re.sub(r"[^A-Za-z0-9-]+", "-", str(d.get("sku") or "").strip().upper()).strip("-")[:30]
    variacoes = [dict({"cor": cor, "tamanho": t, "preco": preco, "estoque": estoque, "fotos": [links[r["id"]] for r in f]},
                      **({"sku": f"{sku}-{re.sub(r'[^A-Za-z0-9]+', '', cor.upper())[:8]}-{re.sub(r'[^A-Za-z0-9]+', '', t)}"} if sku else {}))
                 for cor, f in por_cor.items() for t in tamanhos]
    atributos = []
    for x in d.get("atributos") or []:
        aid_ = str(x.get("id") or "").strip()
        opc, txt = str(x.get("opcao") or "").strip(), str(x.get("texto") or "").strip()
        if not aid_ or not (opc or txt):
            continue
        if ml:
            atributos.append({"id": aid_, "value_id": opc} if opc else {"id": aid_, "value_name": txt})
        else:
            iid = int(aid_) if aid_.isdigit() else aid_
            atributos.append({"id": iid, "valores": [{"id": int(opc) if opc.isdigit() else opc}] if opc else [{"nome": txt}]})
    corpo = {"loja": loja, "categoria": str(d["categoria"]), "titulo": a["titulo"].strip(), "descricao": a["descricao"].strip(),
             "condicao": "novo", "variacoes": variacoes,
             "peso_g": _num(d.get("peso_g"), "o peso"), "comprimento_cm": _num(d.get("comprimento_cm"), "o comprimento"),
             "largura_cm": _num(d.get("largura_cm"), "a largura"), "altura_cm": _num(d.get("altura_cm"), "a altura")}
    if atributos:
        corpo["atributos"] = atributos
    if galeria:
        corpo["fotos"] = [links[r["id"]] for r in galeria]
    video = (a["video"] if "video" in a.keys() else "") or ""
    if video and not ml and d.get("video", True) is not False:
        corpo["video_url"] = subir_video(video)
    if ml:
        corpo["ml"] = {"tipo_anuncio": str(d.get("tipo_anuncio") or "gold_special"), "titulo": a["titulo"].strip()[:60]}
    else:
        marca = d.get("marca") or {}
        corpo["marca"] = {"id": int(marca["id"]), "nome": str(marca.get("nome") or "")} if str(marca.get("id") or "").isdigit() and int(marca["id"]) else {"id": 0}
        if tabela:
            corpo["shopee"] = {"tabela_medidas": {"imagem_url": links[tabela["id"]]}}
    validar = not d.get("confirmar")
    if validar:
        corpo["so_validar"] = True
    if d.get("pedido_id"):
        corpo["pedido_id"] = str(d["pedido_id"])
    status, r = chamar("POST", "/v1/anuncios/criar", corpo, timeout=240)
    problemas = [_frase(x) for x in (r.get("problemas") or r.get("erros") or [])][:20]
    if not 200 <= status < 300 and not problemas:
        problemas = [texto_erro(r) or f"O {config()['nome']} respondeu {status}."]
    saida = {"validado": bool(r.get("validado")) and not problemas, "problemas": problemas,
             "avisos": [_frase(x) for x in (r.get("avisos") or [])][:12], "pedido_id": r.get("pedido_id") or d.get("pedido_id") or "",
             "variacoes": len(variacoes), "fotos": len(links), "video": bool(corpo.get("video_url")),
             "video_conferido": r.get("video_conferido")}
    if promo_ml and validar:
        saida["avisos"].insert(0, f"Mercado Livre: sobe com o preço cheio R$ {preco:.2f} e, depois de criado, entra a promoção de R$ {promo_ml:.2f}.")
    if promo_shopee:
        saida["promocao_shopee"] = promo_shopee
        if validar:
            saida["avisos"].insert(0, f"Shopee: sobe com o preço cheio R$ {preco:.2f}. Depois de criado, coloque numa promoção da loja com R$ {promo_shopee:.2f} (botão Colocar numa promoção).")
    if not validar:
        ids = r.get("anuncio_ids") or ([r["anuncio_id"]] if r.get("anuncio_id") else [])
        ok = 200 <= status < 300 and r.get("success", True) is not False and bool(ids)
        divergencias = (r.get("conferido") or {}).get("divergencias") or []
        saida.update(criado=ok, anuncio_ids=[str(x) for x in ids][:60], status=r.get("status") or "",
                     incerto=bool(r.get("incerto")), divergencias=[_frase(x) for x in divergencias][:10])
        if ok and promo_ml:
            saida["promocao"] = aplicar_desconto_ml(loja, [str(x) for x in ids][:100], promo_ml)
        if not ids and 200 <= status < 300 and saida["pedido_id"] and not problemas:  # foi para a fila do B2X
            saida["na_fila"] = True
            acompanhar(loja, saida["pedido_id"], promo_ml, d.get("_pedido_bot"), aid, promo_shopee)
        _registrar(aid, ok, f"criar no {CANAIS.get(canal, canal)}: {'criado ' + ', '.join(map(str, ids[:5])) if ok else (problemas[:1] or ['falhou'])[0]}",
                   ids[0] if ids else "", r.get("desfazer_com"))
        criacao_nova(aid, loja, canal, por, a["titulo"], "criado" if ok else "na_fila" if saida.get("na_fila") else "erro", ids, saida["pedido_id"],
                     "; ".join((problemas or saida["avisos"])[:3]) + (" " + saida["promocao"]["msg"] if saida.get("promocao") else ""),
                     d.get("_pedido_bot"), promo_shopee)
        if ok and promo_shopee and ids:
            saida["promocao"] = incluir_na_promo_do_modelo(loja, ids[0], aid, promo_shopee)
            if saida["promocao"]["ok"]:
                saida.pop("promocao_shopee", None)
    return saida


# ------------------------------------------------------------ duplicar (clonar) um anuncio para outra loja
def _resumo_payload(p):
    p = p or {}
    vs = p.get("variacoes") or []
    precos = sorted({v.get("preco") for v in vs if isinstance(v, dict) and v.get("preco") is not None})
    fotos = [f for f in (p.get("fotos") or []) if isinstance(f, str)][:10]
    if not fotos:
        for v in vs:
            for f in (v.get("fotos") or []) if isinstance(v, dict) else []:
                if isinstance(f, str) and f not in fotos:
                    fotos.append(f)
    return {"titulo": p.get("titulo") or "", "descricao": str(p.get("descricao") or "")[:600], "categoria": str(p.get("categoria") or ""),
            "variacoes": len(vs), "cores": sorted({str(v.get("cor")) for v in vs if isinstance(v, dict) and v.get("cor")})[:30],
            "tamanhos": sorted({str(v.get("tamanho")) for v in vs if isinstance(v, dict) and v.get("tamanho")})[:40],
            "preco_min": precos[0] if precos else None, "preco_max": precos[-1] if precos else None,
            "estoque_total": sum(int(v.get("estoque") or 0) for v in vs if isinstance(v, dict)), "fotos": fotos[:10],
            "peso_g": p.get("peso_g"), "medidas": [p.get("comprimento_cm"), p.get("largura_cm"), p.get("altura_cm")]}


@rota.get("/api/b2x/clonar/previa")
def clonar_previa(loja: str, anuncio: str, destino: str):
    q = {"loja": loja, "anuncio": anuncio, "destino": destino}
    status, r = chamar("GET", "/v1/anuncios/clonar-payload?" + urllib.parse.urlencode(q), timeout=150)
    _ok(status, r, "Montar a prévia da cópia")
    return {"origem": r.get("origem") or {}, "destino": r.get("destino") or {}, "resumo": _resumo_payload(r.get("payload")),
            "pendencias": [_frase(x) for x in (r.get("pendencias") or [])][:20], "avisos": [_frase(x) for x in (r.get("avisos") or [])][:12],
            "proximo": str(r.get("proximo") or ""), "chave": secrets.token_hex(16)}


@rota.post("/api/b2x/clonar")
async def clonar(request: Request):
    d = await request.json()
    corpo = {"loja_origem": str(d["loja_origem"]), "anuncio": str(d["anuncio"]), "loja_destino": str(d["loja_destino"])}
    if str(d.get("titulo") or "").strip():
        corpo["titulo"] = str(d["titulo"]).strip()[:255]
    if str(d.get("preco") or "").strip():
        p = _preco(d["preco"])
        if not p:
            raise HTTPException(400, "Preço inválido. Use por exemplo 49,90.")
        corpo["preco"] = p
    if str(d.get("estoque") or "").strip():
        try:
            corpo["estoque"] = max(0, int(str(d["estoque"]).strip()))
        except ValueError:
            raise HTTPException(400, "Estoque inválido: use um número inteiro.")
    if str(d.get("sku_sufixo") or "").strip():
        corpo["sku_sufixo"] = str(d["sku_sufixo"]).strip()[:30]
    for k in ("peso_g", "comprimento_cm", "largura_cm", "altura_cm"):
        if str(d.get(k) or "").strip():
            corpo[k] = _num(d[k], k.replace("_", " "))
    # a mesma chave da previa: clicar duas vezes devolve a mesma resposta, sem criar duas copias
    url, chave, nome = _base()
    req = urllib.request.Request(url + "/v1/anuncios/clonar", data=json.dumps(corpo, ensure_ascii=False).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {chave}", "Content-Type": "application/json; charset=utf-8",
                                          "Accept": "application/json", "User-Agent": "site-imagens-menork",
                                          "Idempotency-Key": str(d.get("chave") or secrets.token_hex(16))[:64]})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            status, texto = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, texto = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        raise HTTPException(502, f"Não consegui falar com o {nome}: {e}")
    try:
        r = json.loads(texto or "{}")
    except ValueError:
        raise HTTPException(502, f"O {nome} respondeu algo que não é JSON ({status}).")
    ids = [str(x) for x in (r.get("novos_ids") or [])]
    erros = [_frase(x) for x in (r.get("erros") or [])][:12]
    if not 200 <= status < 300 and not erros:
        erros = [texto_erro(r) or f"O {nome} respondeu {status}."]
    diverg = [f"{c.get('id')}: {_frase(x)}" for c in (r.get("conferencia") or []) if isinstance(c, dict) for x in (c.get("divergencias") or [])][:10]
    n.registrar(f"B2X: duplicar {corpo['anuncio']} para {corpo['loja_destino']}: {'criado ' + ', '.join(ids) if ids else 'falhou'}")
    return {"ok": bool(ids), "novos_ids": ids, "erros": erros, "avisos": [_frase(x) for x in (r.get("avisos") or [])][:12],
            "divergencias": diverg, "repetido": bool(r.get("repetido")),
            "depois": [_frase(x) for x in (r.get("depois_de_criar") or [])][:8]}


# ------------------------------------------------------------ criar anuncio novo direto na loja (sem anuncio do site)
@rota.post("/api/b2x/fotos/subir")
async def fotos_subir(request: Request):
    """Fotos do PC para o B2X: devolve os links (validos por 7 dias) na mesma ordem."""
    form = await request.form()
    arquivos = form.getlist("arquivos")
    if not arquivos:
        raise HTTPException(400, "Nenhuma foto recebida.")
    links, lote, tam = [], [], 0

    def mandar():
        nonlocal lote, tam
        if not lote:
            return
        status, r = chamar("POST", "/v1/fotos", {"fotos": [{"arquivo_base64": base64.b64encode(b).decode("ascii")} for _, b in lote],
                                                  "prazo_s": 90}, timeout=150)
        itens = r.get("fotos") or []
        for i, (nome, _) in enumerate(lote):
            it = next((x for x in itens if x.get("indice") == i), itens[i] if i < len(itens) else {})
            if not it.get("url"):
                raise HTTPException(400, f"O B2X recusou a foto {nome}: {it.get('motivo') or texto_erro(r) or status}")
            links.append({"nome": nome, "url": it["url"]})
        lote, tam = [], 0
    for a in arquivos:
        dados = await a.read()
        try:
            with Image.open(io.BytesIO(dados)) as im:
                im = im.convert("RGB")
                if max(im.size) > 2000:
                    im.thumbnail((2000, 2000))
                b = io.BytesIO(); im.save(b, "JPEG", quality=90, optimize=True); dados = b.getvalue()
        except Exception:
            raise HTTPException(400, f"{a.filename}: não é uma imagem válida.")
        if len(lote) == 20 or tam + len(dados) > 14 * 1024 * 1024:
            mandar()
        lote.append((a.filename or "foto.jpg", dados)); tam += len(dados)
    mandar()
    return {"fotos": links}


@rota.post("/api/b2x/fotos/do-site")
async def fotos_do_site(request: Request):
    """Pega as fotos de um anuncio do site (no modo do marketplace de destino) e sobe para o B2X."""
    d = await request.json()
    m = _anuncio_local(int(d["aid"]))
    L, a = m["linhas"], m["anuncio"]
    ml = d.get("canal") == "mercadolivre"
    galeria = [] if ml else (([L["capa"]] if L["capa"] else []) + L["galeria"])[:9]
    # ML: as fotos de cada cor (ou a capa da cor, se ainda nao montou); Shopee: a capa da variacao de cada cor
    cores = [(v["cor"], (v["fotos"][:10] or [v["capa"]]) if ml else [v["capa"]]) for v in L["variacoes"]]
    links = subir_fotos(galeria + [r for _, f in cores for r in f])
    return {"titulo": a["titulo"] or "", "descricao": a["descricao"] or "", "preco": a["preco"] or "", "tamanhos": m["tamanhos"],
            "galeria": [links[r["id"]] for r in galeria], "cores": [{"cor": c, "fotos": [links[r["id"]] for r in f]} for c, f in cores]}


@rota.get("/api/b2x/envio")
def envio(loja: str):
    status, r = chamar("GET", "/v1/anuncios/criar/envio?" + urllib.parse.urlencode({"loja": loja}))
    _ok(status, r, "Ler as formas de envio")
    return {"modos": [{"id": str(x[0]), "nome": str(x[1]), "aceito": bool(x[2])} if isinstance(x, list) else x for x in (r.get("modos_da_conta") or [])],
            "logisticas": [" · ".join(str(y) for y in x[:3] if y) if isinstance(x, list) else _frase(x) for x in (r.get("logisticas") or [])][:8],
            "usa": r.get("criar_usa_nome") or r.get("criar_usa") or "", "o_que_fazer": _frase(r.get("o_que_fazer")) if r.get("o_que_fazer") else "",
            "obs": str(r.get("obs") or "")[:400]}


@rota.post("/api/b2x/criar-loja")
async def criar_loja(request: Request):
    """Cria um anuncio novo numa loja a partir do passo a passo da tela da loja. so_validar primeiro; depois o mesmo
    corpo com o pedido_id. Grande ou lento: o B2X devolve pedido_id e a tela acompanha pelo /criar/status."""
    d = await request.json()
    loja, canal = str(d["loja"]), str(d.get("canal") or "")
    ml = canal == "mercadolivre"
    titulo, descricao = str(d.get("titulo") or "").strip(), str(d.get("descricao") or "").strip()
    if not titulo or not descricao:
        raise HTTPException(400, "Preencha o título e a descrição.")
    variacoes = []
    for v in d.get("variacoes") or []:
        p = _preco(v.get("preco"))
        if not p:
            raise HTTPException(400, f"Preço inválido na variação {v.get('cor', '')} {v.get('tamanho', '')}.")
        try:
            est = max(0, int(str(v.get("estoque") or "0").strip()))
        except ValueError:
            raise HTTPException(400, f"Estoque inválido na variação {v.get('cor', '')} {v.get('tamanho', '')}.")
        item = {"preco": p, "estoque": est}
        for k in ("cor", "tamanho", "sku"):
            if str(v.get(k) or "").strip():
                item[k] = str(v[k]).strip()[:60]
        fotos = [f for f in (v.get("fotos") or []) if str(f).startswith("http")][:10]
        if fotos:
            item["fotos"] = fotos
        variacoes.append(item)
    if not variacoes:
        raise HTTPException(400, "Monte pelo menos uma variação (cor/tamanho com preço e estoque).")
    atributos = []
    for x in d.get("atributos") or []:
        aid_, opc, txt = str(x.get("id") or "").strip(), str(x.get("opcao") or "").strip(), str(x.get("texto") or "").strip()
        if not aid_ or not (opc or txt):
            continue
        if ml:
            atributos.append({"id": aid_, "value_id": opc} if opc else {"id": aid_, "value_name": txt})
        else:
            atributos.append({"id": int(aid_) if aid_.isdigit() else aid_,
                              "valores": [{"id": int(opc) if opc.isdigit() else opc}] if opc else [{"nome": txt}]})
    corpo = {"loja": loja, "categoria": str(d["categoria"]), "titulo": titulo[:255], "descricao": descricao[:20000], "condicao": "novo",
             "variacoes": variacoes, "peso_g": _num(d.get("peso_g"), "o peso"), "comprimento_cm": _num(d.get("comprimento_cm"), "o comprimento"),
             "largura_cm": _num(d.get("largura_cm"), "a largura"), "altura_cm": _num(d.get("altura_cm"), "a altura")}
    fotos = [f for f in (d.get("fotos") or []) if str(f).startswith("http")][:9]
    if fotos:
        corpo["fotos"] = fotos
    if atributos:
        corpo["atributos"] = atributos
    if str(d.get("sku_pai") or "").strip():
        corpo["sku_pai"] = str(d["sku_pai"]).strip()[:100]
    if ml:
        bloco = {"tipo_anuncio": str(d.get("tipo_anuncio") or "gold_special"), "titulo": titulo[:60]}
        if d.get("envio") in ("me2", "not_specified"):
            bloco["envio"] = d["envio"]
        if d.get("frete_gratis"):
            bloco["frete_gratis"] = True
        linhas = [{"tamanho": str(k), "comprimento_cm": float(str(v).replace(",", "."))}
                  for k, v in (d.get("medidas_pe") or {}).items() if str(v).strip()]
        if linhas:
            bloco["tabela_medidas"] = {"linhas": linhas}
        corpo["ml"] = bloco
    elif canal == "shopee":
        marca = d.get("marca") or {}
        corpo["marca"] = {"id": int(marca["id"]), "nome": str(marca.get("nome") or "")} if str(marca.get("id") or "").isdigit() and int(marca["id"]) else {"id": 0}
        if str(d.get("tabela_url") or "").startswith("http"):
            corpo["shopee"] = {"tabela_medidas": {"imagem_url": d["tabela_url"]}}
    elif str((d.get("marca") or {}).get("nome") or "").strip():
        corpo["marca"] = {"nome": str(d["marca"]["nome"]).strip()}
    validar = not d.get("confirmar")
    if validar:
        corpo["so_validar"] = True
    if d.get("pedido_id"):
        corpo["pedido_id"] = str(d["pedido_id"])
    status, r = chamar("POST", "/v1/anuncios/criar", corpo, timeout=280)
    problemas = [_frase(x) for x in (r.get("problemas") or r.get("erros") or [])][:25]
    if not 200 <= status < 300 and not problemas:
        problemas = [texto_erro(r) or f"O {config()['nome']} respondeu {status}."]
    ids = [str(x) for x in (r.get("anuncio_ids") or ([r["anuncio_id"]] if r.get("anuncio_id") else []))]
    promo = _preco(d.get("preco_promocional")) if ml else None
    saida = {"validado": bool(r.get("validado")) and not problemas, "problemas": problemas, "pedido_id": r.get("pedido_id") or d.get("pedido_id") or "",
             "avisos": [_frase(x) for x in (r.get("avisos") or [])][:12], "variacoes": len(variacoes),
             "estado": r.get("estado") or "", "anuncio_ids": ids, "status": r.get("status") or "", "incerto": bool(r.get("incerto")),
             "na_fila": bool(r.get("fila") or r.get("estado") in ("fila", "em_andamento")) and not ids}
    if promo and validar:
        saida["avisos"].insert(0, f"Depois de criado entra a promoção de R$ {promo:.2f} (desconto direto do Mercado Livre).")
    if not validar:
        saida["criado"] = bool(ids) and 200 <= status < 300
        if saida["criado"] and promo:
            saida["promocao"] = aplicar_desconto_ml(loja, ids, promo)
        if not ids and 200 <= status < 300 and saida["pedido_id"] and not problemas:
            saida["na_fila"] = True
            acompanhar(loja, saida["pedido_id"], promo)
        n.registrar(f"B2X: criar na loja {loja}: {'criado ' + ', '.join(ids) if ids else (problemas[:1] or ['enviado, acompanhando'])[0]}")
        criacao_nova(None, loja, str(d.get("canal") or ""), "você (tela Lojas)", str(d.get("titulo") or ""),
                     "criado" if saida["criado"] else "na_fila" if saida.get("na_fila") else "erro", ids, saida["pedido_id"],
                     "; ".join((problemas or saida["avisos"])[:3]) + (" " + saida["promocao"]["msg"] if saida.get("promocao") else ""))
    return saida


@rota.get("/api/b2x/criar/status")
def criar_status(pedido_id: str, loja: str = ""):
    q = {"pedido_id": pedido_id}
    if loja:
        q["loja"] = loja
    status, r = chamar("GET", "/v1/anuncios/criar/status?" + urllib.parse.urlencode(q))
    _ok(status, r, "Ver o andamento")
    return {"estado": r.get("estado") or "", "final": bool(r.get("final")), "etapa": r.get("etapa_texto") or r.get("etapa") or "",
            "anuncio_id": str(r.get("anuncio_id") or ""), "motivo": _frase(r.get("motivo")) if r.get("motivo") else "",
            "erros": [_frase(x) for x in (r.get("erros") or [])][:12], "avisos": [_frase(x) for x in (r.get("avisos") or [])][:8],
            "de_novo_em": int(r.get("consultar_de_novo_em_s") or 8), "parar": bool(r.get("parar_de_consultar"))}


@rota.post("/api/b2x/criar/cancelar")
async def criar_cancelar(request: Request):
    d = await request.json()
    corpo = {"pedido_id": str(d["pedido_id"])}
    if d.get("loja"):
        corpo["loja"] = str(d["loja"])
    status, r = chamar("POST", "/v1/anuncios/criar/cancelar", dict(corpo, **({"confirmar": True} if d.get("confirmar") else {"simular": True})))
    _ok(status, r, "Cancelar a criação")
    return {"estado_antes": r.get("estado_antes") or "", "estado_depois": r.get("estado_depois") or "", "motivo": _frase(r.get("motivo")) if r.get("motivo") else "",
            "pode_criar_de_novo": bool(r.get("pode_criar_de_novo")), "confirmado": bool(d.get("confirmar"))}


# ------------------------------------------------------------ Mercado Livre: preco cheio no anuncio + desconto direto (promocao)
def desconto_ml(loja, anuncios, preco_promo, simular=True, pedido_id=""):
    """Desconto direto do ML (POST /v1/promocoes sem tipo): o anuncio fica com o preco cheio e o cliente paga o promocional,
    com o riscado e o % OFF. Renovacao automatica a cada 30 dias para a promocao nao acabar sozinha."""
    agora = int(time.time())
    corpo = {"loja": loja, "nome": f"Desconto {anuncios[0]}"[:60], "inicio": agora + 120, "fim": agora + 30 * 86400,
             "renovacao_automatica": {"duracao_dias": 30, "dias_antes": 2},
             "itens": [{"produto_id": str(a), "variacoes": [{"id": None, "preco_promocional": preco_promo}]} for a in anuncios]}
    if simular:
        corpo["simular"] = True
    if pedido_id:
        corpo["pedido_id"] = pedido_id
    status, r = chamar("POST", "/v1/promocoes", corpo, timeout=150)
    problemas = [_frase(x) for x in (r.get("problemas") or r.get("falhas") or [])][:12]
    ok = 200 <= status < 300 and r.get("success", True) is not False and not (simular and r.get("validado") is False)
    if not ok and not problemas:
        problemas = [texto_erro(r) or f"O B2X respondeu {status}."]
    itens = [{"anuncio": str(x[0]), "preco_atual": x[3], "preco_promocional": x[4], "desconto": x[5]} if isinstance(x, list) and len(x) > 5 else x
             for x in (r.get("itens_resolvidos") or [])][:20]
    return {"ok": ok and not (not simular and problemas and not r.get("confirmados")), "simulado": simular, "pedido_id": r.get("pedido_id") or "",
            "problemas": problemas, "avisos": [_frase(x) for x in (r.get("avisos") or [])][:8], "itens": itens,
            "confirmados": r.get("confirmados"), "renovacao": bool(r.get("renovacao_automatica"))}


def aplicar_desconto_ml(loja, ids, preco_promo):
    """Depois de criar no ML: simula e confirma o desconto direto. Nunca derruba a criacao: devolve o que aconteceu."""
    try:
        s = desconto_ml(loja, ids, preco_promo, simular=True)
        if not s["ok"]:
            return {"ok": False, "msg": "A promoção não entrou: " + "; ".join(s["problemas"][:3]), "problemas": s["problemas"]}
        f = desconto_ml(loja, ids, preco_promo, simular=False, pedido_id=s["pedido_id"])
        return {"ok": f["ok"], "msg": (f"Promoção de R$ {preco_promo:.2f} aplicada (renova sozinha a cada 30 dias)." if f["ok"]
                                       else "A promoção não entrou: " + "; ".join(f["problemas"][:3])), "problemas": f["problemas"]}
    except HTTPException as e:
        return {"ok": False, "msg": f"A promoção não entrou: {e.detail}", "problemas": [str(e.detail)]}


@rota.post("/api/b2x/desconto-ml")
async def rota_desconto_ml(request: Request):
    d = await request.json()
    p = _preco(d.get("preco"))
    if not p:
        raise HTTPException(400, "Preço promocional inválido. Use por exemplo 49,90.")
    ids = [str(x) for x in (d.get("anuncios") or []) if str(x).strip()][:100]
    if not ids:
        raise HTTPException(400, "Diga o anúncio.")
    if d.get("confirmar"):
        r = desconto_ml(str(d["loja"]), ids, p, simular=False, pedido_id=str(d.get("pedido_id") or ""))
        n.registrar(f"B2X: desconto ML R$ {p} em {', '.join(ids[:5])}: {'ok' if r['ok'] else 'falhou'}")
        return r
    return desconto_ml(str(d["loja"]), ids, p, simular=True)



# ------------------------------------------------------------ criacao que foi para a fila: o site acompanha sozinho
_acompanhando = set()


def acompanhar(loja, pedido_id, promo=None, pedido_bot=None, aid=None, promo_shopee=None):
    """Consulta o /criar/status ate o fim (no maximo 40 min). No fim: aplica a promocao do ML (se houver),
    marca o pedido do bot como feito e registra no historico do anuncio."""
    import threading
    if not pedido_id or pedido_id in _acompanhando:
        return
    _acompanhando.add(pedido_id)

    def rodar():
        try:
            fim = time.time() + 40 * 60
            while time.time() < fim:
                try:
                    s = criar_status(pedido_id, loja)
                except HTTPException:
                    time.sleep(30)
                    continue
                if s["final"] or s["parar"]:
                    ids = [x.strip() for x in str(s["anuncio_id"] or "").split(",") if x.strip()]
                    ok = bool(ids) and s["estado"] not in ("recusado", "apagado", "parado")
                    promo_txt = ""
                    if ok and promo:
                        promo_txt = " " + aplicar_desconto_ml(loja, ids, promo)["msg"]
                    if ok and promo_shopee:
                        criacao_mudar(pedido_id, status="criado", anuncio_ids=",".join(ids))
                        promo_txt = " " + incluir_na_promo_do_modelo(loja, ids[0], aid, promo_shopee)["msg"]
                    resposta = (f"criado {', '.join(ids)} ({s['estado']})" if ok else
                                f"não subiu ({s['estado']}): {s['motivo'] or '; '.join(s['erros'][:2])}") + promo_txt
                    with n.con() as c:
                        if pedido_bot:
                            c.execute("UPDATE pedidos SET status='feito', resposta=?, atualizado=? WHERE id=?", (resposta[:1500], n.agora(), pedido_bot))
                    if aid:
                        _registrar(aid, ok, "criar (fila): " + resposta, ids[0] if ids else "")
                    criacao_mudar(pedido_id, status="criado" if ok else "erro", anuncio_ids=",".join(ids), mensagem=resposta[:1500])
                    n.registrar(f"B2X: pedido {pedido_id}: {resposta}")
                    return
                time.sleep(max(5, min(60, s["de_novo_em"])))
        finally:
            _acompanhando.discard(pedido_id)
    threading.Thread(target=rodar, daemon=True).start()


# ------------------------------------------------------------ Shopee: colocar o anuncio numa promocao que a loja ja tem
# Na Shopee o anuncio sobe com o preco cheio e entra numa promocao existente (desconto ou relampago) com o preco promocional.
# GET /v1/promocoes lista as promocoes; POST /v1/promocoes/editar com mudancas.incluir (simular -> pedido_id -> confirmar).
TIPO_PROMO = {"desconto": "Desconto", "relampago": "Relâmpago", "oferta_relampago": "Relâmpago"}


@rota.get("/api/b2x/promocoes-loja")
def promocoes_loja(loja: str, aid: int = 0):
    status, d = chamar("GET", "/v1/promocoes?" + urllib.parse.urlencode({"loja": loja}), timeout=120)
    _ok(status, d, "Ler as promoções da loja")
    lista = []
    for p in d.get("promocoes") or []:
        if not isinstance(p, dict):
            continue
        tipo = str(p.get("tipo") or "")
        if tipo not in TIPO_PROMO:
            continue  # cupom, combo e campanha nao recebem anuncio com preco proprio por aqui
        pode = p.get("pode") or {}
        obs = (p.get("pode_obs") or {}).get("incluir") if isinstance(p.get("pode_obs"), dict) else ""
        vagas = p.get("vagas") or {}
        lista.append({"id": str(p.get("id") or ""), "tipo": "relampago" if "relampago" in tipo else tipo,
                      "tipo_nome": TIPO_PROMO[tipo], "nome": p.get("nome") or p.get("tipo_nome") or "",
                      "status": str(p.get("status") or ""), "inicio": p.get("inicio_brasilia") or "", "fim": p.get("fim_brasilia") or "",
                      "produtos": p.get("produtos"), "pode_incluir": pode.get("incluir") is not False,
                      "motivo": _frase(obs) if obs else "", "vagas_livres": vagas.get("livres") if isinstance(vagas, dict) else None,
                      "renova": bool(p.get("renovacao_automatica"))})
    lista.sort(key=lambda x: (not x["pode_incluir"], x["tipo"] != "desconto", x["inicio"]))
    sug = promo_do_modelo(lista, *_ref_kit(aid)) if aid else None
    return {"promocoes": lista, "avisos": [_frase(x) for x in (d.get("avisos") or [])][:5], "sugerida": sug["id"] if sug else ""}


def _ref_kit(aid):
    with n.con() as c:
        a = c.execute("SELECT nome, titulo FROM anuncios WHERE id=?", (aid,)).fetchone() if aid else None
    nome = (a["nome"] if a else "") or ""
    ref = (nome.strip().split() or [""])[0].upper()
    return ref, bool(re.search(r"\bkit\b", unicodedata.normalize("NFKD", nome + " " + ((a["titulo"] if a else "") or "")).lower()))


def promo_do_modelo(promocoes, ref, kit=False):
    """A promocao de desconto da loja que leva o nome do modelo (ex.: "PROMO TJ01 02" para o TJ01).
    Kit vai na promocao de kit; unitario na que nao e de kit. So devolve se houver UMA melhor (sem empate)."""
    if not ref or len(ref) < 3:
        return None
    achadas = []
    for p in promocoes:
        nome = unicodedata.normalize("NFKD", str(p.get("nome") or "")).upper()
        if p.get("tipo") != "desconto" or not p.get("pode_incluir") or not re.search(rf"(?<![A-Z0-9]){re.escape(ref)}(?![A-Z0-9])", nome):
            continue
        achadas.append((("KIT" in nome.split()) == kit, p))
    certas = [p for ok, p in achadas if ok] or ([] if kit else [p for ok, p in achadas])
    return certas[0] if len(certas) == 1 else None


def incluir_na_promo_do_modelo(loja, anuncio_, aid, preco):
    """Depois de criar na Shopee: coloca sozinho na promocao do mesmo modelo (simula e, se a Shopee aceitar, confirma)."""
    try:
        ref, kit = _ref_kit(aid)
        p = promo_do_modelo(promocoes_loja(loja)["promocoes"], ref, kit)
        if not p:
            return {"ok": False, "msg": f"Não achei uma promoção com o nome do modelo {ref}: escolha a promoção na tela."}
        base = {"loja": loja, "id": p["id"], "tipo": "desconto", "mudancas": {"incluir": [{"produto_id": str(anuncio_), "variacoes": [{"id": None, "preco_promocional": preco}]}]}}
        cores = _cores_do(_detalhe(loja, str(anuncio_))[0])
        if cores:
            base["mudancas"]["incluir"][0]["variacoes"] = [{"cor": c_, "preco_promocional": preco} for c_ in cores]
        st, r = chamar("POST", "/v1/promocoes/editar", dict(base, simular=True), timeout=180)
        prob = [_frase(x) for x in (r.get("problemas") or r.get("erros") or [])][:3]
        if not 200 <= st < 300 or prob or r.get("validado") is False or not r.get("pedido_id"):
            return {"ok": False, "msg": f"A Shopee não aceitou na {p['nome']}: {'; '.join(prob) or texto_erro(r) or st}"}
        st, r = chamar("POST", "/v1/promocoes/editar", dict(base, pedido_id=r["pedido_id"]), timeout=180)
        falhas = [_frase(x) for x in (r.get("falhas") or [])][:3]
        ok = 200 <= st < 300 and r.get("success", True) is not False and not (falhas and not r.get("aplicadas"))
        if ok:
            with n.con() as c:
                c.execute("UPDATE criacoes SET promo_feita=?, atualizado=? WHERE ','||anuncio_ids||',' LIKE ?",
                          (f"{p['nome']} R$ {preco:.2f}", n.agora(), f"%,{anuncio_},%"))
        n.registrar(f"B2X: anúncio {anuncio_} {'entrou sozinho' if ok else 'não entrou'} na promoção {p['nome']} da loja {loja}")
        return {"ok": ok, "promocao": p["nome"], "msg": f"Entrou na promoção {p['nome']} por R$ {preco:.2f}".replace(".", ",") + "." if ok
                else f"Não entrou na {p['nome']}: {'; '.join(falhas) or texto_erro(r) or st}"}
    except HTTPException as e:
        return {"ok": False, "msg": f"Não consegui colocar na promoção: {e.detail}"}


@rota.post("/api/b2x/promocao-incluir")
async def promocao_incluir(request: Request):
    """Coloca um anuncio numa promocao que ja existe. Sem confirmar = simula (nada muda)."""
    d = await request.json()
    loja, pid, tipo, anuncio_ = str(d["loja"]), str(d["id"]), str(d.get("tipo") or "desconto"), str(d["anuncio"])
    preco = _preco(d.get("preco"))
    if not preco:
        raise HTTPException(400, "Digite o preço promocional. Ex.: 49,90")
    por_cor = {str(k): _preco(v) for k, v in (d.get("precos_cor") or {}).items() if _preco(v)}
    a, _ = _detalhe(loja, anuncio_)
    cores = _cores_do(a)
    relampago = tipo == "relampago"
    try:
        estoque = max(1, int(str(d.get("estoque_promocional") or "10").strip()))
    except ValueError:
        raise HTTPException(400, "Estoque da relâmpago inválido.")

    def var(base):
        return dict(base, **({"estoque_promocional": estoque} if relampago else {}))
    variacoes = [var({"cor": c, "preco_promocional": por_cor.get(c, preco)}) for c in cores] or [var({"id": None, "preco_promocional": preco})]
    corpo = {"loja": loja, "id": pid, "tipo": tipo, "mudancas": {"incluir": [{"produto_id": anuncio_, "variacoes": variacoes}]}}
    if relampago and d.get("forcar"):
        corpo["forcar"] = True
    confirmar = bool(d.get("confirmar"))
    if confirmar:
        corpo["pedido_id"] = str(d.get("pedido_id") or "")
    else:
        corpo["simular"] = True
    status, r = chamar("POST", "/v1/promocoes/editar", corpo, timeout=180)
    problemas = [_frase(x) for x in (r.get("problemas") or r.get("erros") or [])][:12]
    falhas = [_frase(x) for x in (r.get("falhas") or [])][:12]
    if not 200 <= status < 300 and not problemas:
        problemas = [texto_erro(r) or f"O {config()['nome']} respondeu {status}."]
    itens = []
    for x in (r.get("itens_resolvidos") or [])[:80]:
        if isinstance(x, list) and len(x) > 5:
            itens.append({"variacao": x[2], "preco_atual": x[3], "preco_promocional": x[4], "desconto": x[5]})
        elif isinstance(x, dict):
            itens.append({"variacao": x.get("variacao") or x.get("cor") or "", "preco_atual": x.get("preco_atual"),
                          "preco_promocional": x.get("preco_promocional"), "desconto": x.get("desconto") or x.get("desconto_%")})
    ok = 200 <= status < 300 and r.get("success", True) is not False and not problemas and not (not confirmar and r.get("validado") is False)
    if confirmar:
        ok = ok and not (falhas and not r.get("aplicadas"))
        n.registrar(f"B2X: anúncio {anuncio_} {'entrou' if ok else 'não entrou'} na promoção {pid} ({tipo}) da loja {loja}")
        if ok:
            with n.con() as c:
                c.execute("UPDATE criacoes SET promo_feita=?, atualizado=? WHERE ','||anuncio_ids||',' LIKE ?",
                          (f"{pid} ({tipo}) R$ {preco:.2f}", n.agora(), f"%,{anuncio_},%"))
    return {"ok": ok, "simulado": not confirmar, "pedido_id": r.get("pedido_id") or "", "problemas": problemas + falhas,
            "avisos": [_frase(x) for x in (r.get("avisos") or [])][:8], "itens": itens, "cores": cores,
            "criterios": r.get("criterios_shopee") if relampago else None}


# ------------------------------------------------------------ memoria da ficha: o que o Menork preencheu fica para a proxima vez
def _memoria():
    try:
        return json.loads(n.ajuste("ficha_memoria", "{}") or "{}")
    except ValueError:
        return {}


@rota.get("/api/b2x/memoria")
def memoria_ler(canal: str, categoria: str = "", chave: str = "", produto: str = ""):
    """ficha_produto/envio_produto = o que voce preencheu para ESTE produto (cada produto tem o seu);
    ficha/envio = o da ultima vez na categoria (so serve para campos que sao iguais para todos, como pais e marca)."""
    m, produto = _memoria(), produto.strip().upper()
    return {"ficha": m.get("ficha", {}).get(f"{canal}:{categoria}") if categoria else None,
            "ficha_produto": m.get("ficha_prod", {}).get(f"{canal}:{categoria}:{produto}") if categoria and produto else None,
            "envio": m.get("envio", {}).get(canal), "envio_produto": m.get("envio_prod", {}).get(produto) if produto else None,
            "categoria": m.get("cat", {}).get(f"{canal}:{chave}") if chave else None}


@rota.post("/api/b2x/memoria")
async def memoria_gravar(request: Request):
    d = await request.json()
    canal, categoria = str(d.get("canal") or ""), str(d.get("categoria") or "")
    if not canal or not categoria:
        raise HTTPException(400, "Falta o canal ou a categoria.")
    m = _memoria()
    m.setdefault("ficha", {})[f"{canal}:{categoria}"] = {"attr": d.get("attr") or {}, "marca": d.get("marca"), "tipo_anuncio": d.get("tipo_anuncio")}
    m.setdefault("envio", {})[canal] = {k: d.get(k) for k in ("peso_g", "comprimento_cm", "largura_cm", "altura_cm", "estoque")}
    produto = str(d.get("produto") or "").strip().upper()
    if produto:
        m.setdefault("ficha_prod", {})[f"{canal}:{categoria}:{produto}"] = {"attr": d.get("attr") or {}, "marca": d.get("marca")}
        m.setdefault("envio_prod", {})[produto] = {k: d.get(k) for k in ("peso_g", "comprimento_cm", "largura_cm", "altura_cm", "estoque")}
        if len(m["ficha_prod"]) > 800:
            m["ficha_prod"] = dict(list(m["ficha_prod"].items())[-800:])
    if d.get("chave"):
        m.setdefault("cat", {})[f"{canal}:{d['chave']}"] = {"id": categoria, "caminho": str(d.get("caminho") or "")}
    if len(m["ficha"]) > 300:  # nao deixa crescer sem fim
        m["ficha"] = dict(list(m["ficha"].items())[-300:])
    n.gravar_ajuste("ficha_memoria", json.dumps(m, ensure_ascii=False))
    return {"ok": True}


# ------------------------------------------------------------ video do anuncio (Shopee e TikTok aceitam pelo B2X; o ML descarta)
VIDEO_MAX_MB = 100


def pasta_videos():
    p = n.pasta_dados() / "videos"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _multipart(caminho, campo, nome, dados, tipo="video/mp4", timeout=300):
    url, chave, nome_sis = _base()
    limite = "----menork" + secrets.token_hex(12)
    corpo = (f"--{limite}\r\nContent-Disposition: form-data; name=\"{campo}\"; filename=\"{nome}\"\r\n"
             f"Content-Type: {tipo}\r\n\r\n").encode() + dados + f"\r\n--{limite}--\r\n".encode()
    req = urllib.request.Request(url + caminho, data=corpo, method="POST", headers={
        "Authorization": f"Bearer {chave}", "User-Agent": "site-imagens-menork", "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={limite}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, texto = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, texto = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        raise HTTPException(502, f"Não consegui mandar o vídeo para o {nome_sis}: {e}")
    try:
        return status, json.loads(texto or "{}")
    except ValueError:
        return status, {"erro": texto[:200]}


def subir_video(arquivo):
    """Hospeda o video no B2X (link https de 7 dias para video_url). Guarda o link e reaproveita enquanto vale."""
    p = pasta_videos() / arquivo
    if not p.exists():
        raise HTTPException(400, "O arquivo do vídeo deste anúncio sumiu da pasta de dados. Coloque o vídeo de novo.")
    dados = p.read_bytes()
    chave = "video_b2x:" + hashlib.sha256(dados).hexdigest()[:32]
    try:
        guardado = json.loads(n.ajuste(chave, "") or "{}")
    except ValueError:
        guardado = {}
    if guardado.get("url") and guardado.get("vale_ate", 0) > time.time() + 3600:
        return guardado["url"]
    mb = len(dados) / 1048576
    if mb <= 24:
        status, r = _multipart("/v1/videos", "arquivo", p.name, dados)
    else:  # grande: pede um link de envio, manda o arquivo e registra
        status, r = chamar("POST", "/v1/videos/link-envio", {"tamanho_mb": round(mb, 1)})
        _ok(status, r, "Preparar o envio do vídeo")
        req = urllib.request.Request(r["upload_url"], data=dados, method="PUT", headers={"Content-Type": "video/mp4"})
        try:
            urllib.request.urlopen(req, timeout=600).read()
        except Exception as e:
            raise HTTPException(502, f"Não consegui enviar o vídeo grande: {e}")
        status, r = chamar("POST", "/v1/videos", {"caminho": r.get("caminho")}, timeout=300)
    _ok(status, r, "Enviar o vídeo")
    url = r.get("url") or ""
    if not url:
        raise HTTPException(502, "O B2X não devolveu o link do vídeo.")
    n.gravar_ajuste(chave, json.dumps({"url": url, "vale_ate": time.time() + 6 * 86400}))
    return url
