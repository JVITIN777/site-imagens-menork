"""Conversa com a API do B2X (o sistema do Menork).

O endereco e a chave ficam so no banco local (tabela ajustes), nunca no repositorio.
Regras da API seguidas aqui: toda escrita primeiro com simular/so_validar, depois a mesma chamada
com confirmar e o pedido_id devolvido; fotos sobem pelo POST /v1/fotos (link valido por 7 dias).
"""
import base64
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
    obrig = []
    for o in r.get("obrigatorios") or []:
        opcoes = [{"id": str(x[0]), "nome": str(x[1])} if isinstance(x, list) else {"id": str(x.get("id")), "nome": str(x.get("nome"))}
                  for x in (o.get("opcoes") or [])[:400]]
        obrig.append({"id": str(o.get("id")), "nome": str(o.get("nome") or o.get("id")), "opcoes": opcoes,
                      "texto": bool(o.get("aceita_texto")) or not opcoes})
    marca_ = r.get("marca") or {}
    lista = [{"id": str(x[0]), "nome": str(x[1])} if isinstance(x, list) else {"id": str(x.get("id")), "nome": str(x.get("nome"))}
             for x in (marca_.get("lista") or [])[:300]] if isinstance(marca_, dict) else []
    tipos = [{"id": str(x[0] if isinstance(x, list) else x.get("id")), "nome": str(x[1] if isinstance(x, list) else x.get("nome"))}
             for x in (r.get("tipos_anuncio") or [])] if isinstance(r.get("tipos_anuncio"), list) else []
    return {"canal": r.get("canal") or "", "obrigatorios": obrig, "marcas": lista,
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
    d = await request.json()
    aid, loja, canal = int(d["aid"]), str(d["loja"]), str(d.get("canal") or "")
    m = _anuncio_local(aid)
    L, a = m["linhas"], m["anuncio"]
    preco = _preco(a["preco"])
    if not preco:
        raise HTTPException(400, "Preencha o preço do anúncio no site antes de criar.")
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
             "variacoes": len(variacoes), "fotos": len(links)}
    if not validar:
        ids = r.get("anuncio_ids") or ([r["anuncio_id"]] if r.get("anuncio_id") else [])
        ok = 200 <= status < 300 and r.get("success", True) is not False and bool(ids)
        divergencias = (r.get("conferido") or {}).get("divergencias") or []
        saida.update(criado=ok, anuncio_ids=[str(x) for x in ids][:60], status=r.get("status") or "",
                     incerto=bool(r.get("incerto")), divergencias=[_frase(x) for x in divergencias][:10])
        _registrar(aid, ok, f"criar no {CANAIS.get(canal, canal)}: {'criado ' + ', '.join(map(str, ids[:5])) if ok else (problemas[:1] or ['falhou'])[0]}",
                   ids[0] if ids else "", r.get("desfazer_com"))
    return saida
