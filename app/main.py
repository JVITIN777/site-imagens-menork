"""Telas e API do site de imagens Menork."""
import io
import json
import re
import tempfile
import time
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import atualizar as atu
from . import nucleo as n

app = FastAPI(title="Imagens Menork", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=n.BASE / "app" / "static"), name="static")
tpl = Jinja2Templates(directory=n.BASE / "app" / "templates")

LIVRES = ("/static", "/entrar", "/criar-senha")
LOCAIS = ("127.0.0.1", "::1", "localhost")


@app.on_event("startup")
def _ligar():
    n.iniciar_banco()
    (n.pasta_dados() / "chave_bots.txt").write_text(n.chave_bots(), encoding="ascii")  # lida pelo menork.ps1
    n.ligar_leitor()
    atu.ligar_vigia()


@app.middleware("http")
async def porteiro(request: Request, call_next):
    caminho = request.url.path
    if caminho.startswith("/bot"):
        chave = request.headers.get("x-chave") or request.query_params.get("chave") or ""
        if not n.hmac.compare_digest(chave, n.chave_bots()):
            return JSONResponse({"erro": "Chave dos bots ausente ou errada."}, 401)
    elif not caminho.startswith(LIVRES):
        if not n.tem_senha():
            return RedirectResponse("/criar-senha", 303)
        if not n.sessao_valida(request.cookies.get("sessao")):
            if caminho.startswith("/api"):
                return JSONResponse({"erro": "Entre de novo com a senha."}, 401)
            return RedirectResponse("/entrar", 303)
    resp = await call_next(request)
    if resp.headers.get("content-type") == "application/json":  # o PowerShell antigo precisa do charset
        resp.headers["content-type"] = "application/json; charset=utf-8"
    return resp


# ---------------------------------------------------------------------- senha
@app.get("/criar-senha")
def criar_senha_tela(request: Request):
    if n.tem_senha():
        return RedirectResponse("/entrar", 303)
    return tpl.TemplateResponse(request, "senha.html", {"criar": True, "erro": ""})


@app.post("/criar-senha")
def criar_senha(request: Request, senha: str = Form(...), repetir: str = Form(...)):
    if n.tem_senha():
        return RedirectResponse("/entrar", 303)
    erro = ""
    if request.client.host not in LOCAIS:
        erro = "A primeira senha só pode ser criada no próprio PC onde o site está instalado."
    elif len(senha) < 6:
        erro = "Use pelo menos 6 caracteres."
    elif senha != repetir:
        erro = "As duas senhas não são iguais."
    if erro:
        return tpl.TemplateResponse(request, "senha.html", {"criar": True, "erro": erro})
    n.definir_senha(senha)
    return _entrar_ok()


def _entrar_ok():
    resp = RedirectResponse("/", 303)
    resp.set_cookie("sessao", n.criar_sessao(), max_age=30 * 86400, httponly=True, samesite="strict")
    return resp


@app.get("/entrar")
def entrar_tela(request: Request):
    if not n.tem_senha():
        return RedirectResponse("/criar-senha", 303)
    return tpl.TemplateResponse(request, "senha.html", {"criar": False, "erro": ""})


@app.post("/entrar")
def entrar(request: Request, senha: str = Form(...)):
    if n.conferir_senha(senha):
        return _entrar_ok()
    time.sleep(1.5)
    return tpl.TemplateResponse(request, "senha.html", {"criar": False, "erro": "Senha incorreta."})


@app.get("/sair")
def sair():
    resp = RedirectResponse("/entrar", 303)
    resp.delete_cookie("sessao")
    return resp


# ----------------------------------------------------------------------- tela
@app.get("/")
def inicio(request: Request):
    return tpl.TemplateResponse(request, "app.html", {"tipos": n.TIPOS, "desfazer": int(n.CFG["segundos_para_desfazer"]),
                                                      "versao": int((n.BASE / "app" / "static" / "site.js").stat().st_mtime)})


def _alertas(texto):
    try:
        return json.loads(texto) if texto else None
    except ValueError:
        return None


def _parecidas(c):
    """Capas pendentes que ficaram quase iguais a uma capa ja aprovada."""
    aprovadas = c.execute("SELECT id, dhash FROM imagens WHERE status='aprovada' AND tipo LIKE 'capa%' AND dhash<>''").fetchall()
    achados = {}
    for p in c.execute("SELECT id, dhash FROM imagens WHERE status IN ('gerada','conferencia') AND tipo LIKE 'capa%' AND dhash<>''"):
        melhor = max(((n.parecenca(p["dhash"], a["dhash"]), a["id"]) for a in aprovadas), default=(0, 0))
        if melhor[0] >= 88:
            achados[p["id"]] = {"id": melhor[1], "pct": melhor[0]}
    return achados


@app.get("/api/estado")
def estado(request: Request):
    hoje = n.agora()[:10]
    with n.con() as c:
        parecidas = _parecidas(c)
        linhas = c.execute("SELECT * FROM imagens WHERE (status<>'reprovada' AND arquivo<>'') ORDER BY id").fetchall()
        linhas += c.execute("SELECT * FROM (SELECT * FROM imagens WHERE status='reprovada' ORDER BY id DESC LIMIT 400) ORDER BY id").fetchall()
        imgs = [{"id": l["id"], "produto": l["produto"], "cor": l["cor"], "tipo": l["tipo"], "status": l["status"],
                 "nome_original": l["nome_original"], "largura": l["largura"], "altura": l["altura"], "criado_em": l["criado_em"],
                 "motivo": l["motivo"] or "", "origem": l["origem_decisao"] or "", "alertas": _alertas(l["alertas"]),
                 "ref": bool(l["ref"]), "parecida": parecidas.get(l["id"]),
                 "caminho": str(n.caminho_imagem(l)) if l["arquivo"] else ""} for l in linhas]
        anuncios = [{"id": a["id"], "nome": a["nome"], "formato": a["formato"], "titulo": a["titulo"], "preco": a["preco"],
                     "preco_antigo": a["preco_antigo"], "descricao": a["descricao"], "demanda": a["demanda_id"],
                     "meta_ia": a["meta_ia"], "meta_capa": a["meta_capa"]} for a in c.execute("SELECT * FROM anuncios ORDER BY id")]
        links = [{"img": r[0], "an": r[1], "papel": r[2], "pos": r[3]} for r in
                 c.execute("SELECT imagem_id, anuncio_id, papel, posicao FROM imagem_anuncio")]
        cores = [{"an": r[0], "cor": r[1], "img": r[2], "pos": r[3]} for r in
                 c.execute("SELECT anuncio_id, cor, imagem_id, posicao FROM anuncio_cores ORDER BY posicao, rowid")]
        demandas = [{"id": d["id"], "tarefa": d["tarefa"], "produto": d["produto"], "info": d["info"], "pasta": d["pasta"],
                     "marketplaces": json.loads(d["marketplaces"] or "[]"), "status": d["status"], "url": d["url"],
                     "metas": json.loads(d["metas"] or "{}")} for d in c.execute("SELECT * FROM demandas ORDER BY id")]
        faltas, pacotes = {}, {}
        for a in anuncios:
            k = checagem(c, a["id"])
            faltas[a["id"]] = {"produto": k["produto"], "itens": [i["texto"] for i in k["faltas"]], "metaIA": k["metas"]["ia"],
                               "metaCapa": k["metas"]["capa"], "info": k["metas"]["informativo"], "tab": k["metas"]["tabela"],
                               "kit": a["formato"] != "unitario", "tarefa": k["tarefa"], "capas": k["capas_a_produzir"]}
        for p in c.execute("SELECT * FROM pacotes ORDER BY id DESC"):
            lista = pacotes.setdefault(p["anuncio_id"], [])
            if len(lista) < 5:
                lista.append({"id": p["id"], "mk": p["marketplace"], "quando": p["criado_em"], "por": p["por"], "status": p["status"],
                              "arquivos": len(json.loads(p["arquivos"] or "[]")), "tem_zip": bool(p["zip"])})
        pedidos = {}
        for p in c.execute("SELECT * FROM pedidos WHERE status<>'substituido' ORDER BY id"):
            pedidos[p["anuncio_id"]] = {"id": p["id"], "status": p["status"], "bot": p["bot"], "quando": p["criado_em"],
                                        "atualizado": p["atualizado"], "texto": p["texto"]}
        medidas = {}
        for m in c.execute("SELECT * FROM medidas ORDER BY produto, pos"):
            medidas.setdefault(m["produto"], []).append([m["numero"], m["cm"]])
        bots = [[b["nome"], b["status"], b["detalhe"], b["atualizado"]] for b in c.execute("SELECT * FROM bots ORDER BY nome")]
        usadas = {r[0]: (r[1], r[2]) for r in c.execute(
            "SELECT conta, COUNT(*), SUM(status='reprovada') FROM imagens WHERE conta<>'' AND criado_em LIKE ? GROUP BY 1", (hoje + "%",))}
        limites = {r["nome"]: r["limite"] for r in c.execute("SELECT * FROM contas")}
        contas = [[nome, usadas.get(nome, (0, 0))[0], usadas.get(nome, (0, 0))[1] or 0, limites.get(nome) or "Disponível"]
                  for nome in sorted(set(usadas) | set(limites))]
    porta = n.CFG["porta"]
    return {"imgs": imgs, "anuncios": anuncios, "links": links, "cores": cores, "demandas": demandas, "medidas": medidas,
            "bots": bots, "contas": contas, "faltas": faltas, "pacotes": pacotes, "pedidos": pedidos, "versao": atu.situacao(), "leitor": n.estado, "clickup": bool(str(n.CFG["clickup_token"]).strip()),
            "bot": {"endereco": f"http://localhost:{porta}", "chave": n.chave_bots()}}


@app.post("/api/anuncio-novo")
async def anuncio_novo(request: Request):
    d = await request.json()
    nome = str(d.get("nome", "")).strip()
    if not nome:
        raise HTTPException(400, "Dê um nome ao anúncio.")
    with n.con() as c:
        aid = n.obter_anuncio(c, nome)
        if d.get("formato") in n.FORMATO_NOME:
            c.execute("UPDATE anuncios SET formato=? WHERE id=?", (d["formato"], aid))
    return {"id": aid}


@app.post("/api/anuncio-excluir")
async def anuncio_excluir(request: Request):
    d = await request.json()
    with n.con() as c:
        c.execute("DELETE FROM anuncios WHERE id=?", (int(d["id"]),))
    return {"ok": True}


@app.post("/api/meta")
async def meta(request: Request):
    d = await request.json()
    chave, valor = str(d["chave"]), max(0, int(d["valor"]))
    with n.con() as c:
        dem = d.get("dem")
        a = None
        if not dem:
            a = c.execute("SELECT * FROM anuncios WHERE id=?", (int(d["an"]),)).fetchone()
            dem = a["demanda_id"]
            if chave == "capa" and dem:
                chave = "capa:" + a["formato"]
        if dem:
            linha = c.execute("SELECT metas FROM demandas WHERE id=?", (int(dem),)).fetchone()
            metas = json.loads(linha["metas"])
            if chave.startswith("capa:"):
                metas.setdefault("capas", {})[chave[5:]] = valor
            elif chave in ("ia", "informativo", "tabela"):
                metas[chave] = valor
            c.execute("UPDATE demandas SET metas=? WHERE id=?", (json.dumps(metas), int(dem)))
        elif chave in ("ia", "capa"):
            c.execute(f"UPDATE anuncios SET meta_{chave}=? WHERE id=?", (valor, a["id"]))
    return {"ok": True}


@app.post("/api/medidas")
async def medidas(request: Request):
    d = await request.json()
    produto = str(d["produto"]).strip().upper()
    with n.con() as c:
        c.execute("DELETE FROM medidas WHERE produto=?", (produto,))
        c.executemany("INSERT INTO medidas VALUES(?,?,?,?)",
                      [(produto, k, str(a).strip(), str(b).strip()) for k, (a, b) in enumerate(d.get("linhas", []))])
    return {"ok": True}


@app.post("/api/demanda-produto")
async def demanda_produto(request: Request):
    d = await request.json()
    produto = str(d["produto"]).strip().upper()
    if not produto:
        raise HTTPException(400, "O código do produto não pode ficar vazio.")
    with n.con() as c:
        c.execute("UPDATE demandas SET produto=? WHERE id=?", (produto, int(d["id"])))
    return {"ok": True}


@app.post("/api/atualizar")
async def atualizar_site(request: Request):
    d = await request.json()
    try:
        if d.get("acao") == "voltar":
            v = atu.voltar()
            atu.religar()
            return {"msg": f"Voltando para a versão {v}. O site religa em alguns segundos.", "religando": True}
        nova = atu.atualizar()
    except Exception as e:
        raise HTTPException(400, f"Não deu para atualizar: {e}")
    if nova:
        atu.religar()
        return {"msg": f"Versão {nova} instalada. O site religa em alguns segundos.", "religando": True}
    return {"msg": atu.info["erro"] or f"Você já está na versão mais nova ({atu.versao_local()}).", "religando": False}


@app.post("/api/clickup")
def clickup():
    try:
        novas, ignoradas = n.buscar_clickup()
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    if novas:
        return {"msg": f"{len(novas)} tarefa(s) cadastrada(s): {', '.join(novas[:6])}{'…' if len(novas) > 6 else ''}."}
    return {"msg": f"Nenhuma tarefa nova. {ignoradas} sem Link Pasta ou INFO JOAO foram ignoradas."}


def _pedaco(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", n._limpo(s)).strip("-") or "x"


CAMPOS_IMG = "i.id, i.produto, i.cor, i.tipo, i.status, i.arquivo, i.nome_original"
ORDEM_AUTO = {"ia": 0, "informativo": 1, "tabela": 2}


def _img(r):
    d = {k: r[k] for k in ("id", "produto", "cor", "tipo", "status")}
    d["tipo_nome"] = n.TIPO_NOME.get(r["tipo"], "Sem tipo")
    return d


def montagem(c, aid):
    """Estrutura completa de um anuncio: capa, fotos em ordem, cores e o que sobra."""
    a = c.execute("SELECT * FROM anuncios WHERE id=?", (aid,)).fetchone()
    if not a:
        raise HTTPException(404)
    ligadas = c.execute(
        f"SELECT {CAMPOS_IMG}, x.papel, x.posicao FROM imagens i JOIN imagem_anuncio x ON x.imagem_id=i.id "
        "WHERE x.anuncio_id=? AND i.status<>'reprovada' AND i.arquivo<>'' ORDER BY x.posicao, i.id",
        (aid,)).fetchall()
    ok = lambda r: r["status"] == "aprovada"
    capa = next((r for r in ligadas if r["papel"] == "capa" and ok(r)), None)
    galeria = [r for r in ligadas if r["papel"] == "galeria" and ok(r)]
    usados = {r["id"] for r in galeria} | ({capa["id"]} if capa else set())
    cores = c.execute(
        f"SELECT {CAMPOS_IMG}, ac.cor AS nome_cor FROM anuncio_cores ac JOIN imagens i ON i.id=ac.imagem_id "
        "WHERE ac.anuncio_id=? AND i.status='aprovada' AND i.arquivo<>'' ORDER BY ac.posicao, ac.rowid",
        (aid,)).fetchall()
    usados |= {r["id"] for r in cores}
    produtos = [r["produto"] for r in ligadas if r["produto"]]
    produto = max(set(produtos), key=produtos.count) if produtos else ""
    if a["demanda_id"]:  # anuncio vindo de tarefa: o produto e o da tarefa
        dem = c.execute("SELECT produto FROM demandas WHERE id=?", (a["demanda_id"],)).fetchone()
        produto = dem["produto"] if dem else produto
    sugestoes = []
    if produto:
        sugestoes = c.execute(
            f"SELECT {CAMPOS_IMG} FROM imagens i WHERE i.produto=? AND i.status='aprovada' AND i.arquivo<>'' "
            "AND i.id NOT IN (SELECT imagem_id FROM imagem_anuncio WHERE anuncio_id=?) "
            "ORDER BY i.tipo, i.cor, i.id LIMIT 60", (produto, aid)).fetchall()
    return {
        "anuncio": {k: a[k] for k in ("id", "nome", "formato", "titulo", "preco", "preco_antigo", "descricao")},
        "produto": produto,
        "capa": _img(capa) if capa else None,
        "galeria": [_img(r) for r in galeria],
        "cores": [dict(_img(r), nome_cor=r["nome_cor"]) for r in cores],
        "disponiveis": [_img(r) for r in ligadas if r["id"] not in usados],
        "sugestoes": [_img(r) for r in sugestoes],
        "linhas": {"capa": capa, "galeria": galeria, "cores": cores, "sugestoes": list(sugestoes),
                   "resto": [r for r in ligadas if r["id"] not in usados and ok(r)]},
    }


def _sem_linhas(m):
    m.pop("linhas", None)
    return m


@app.get("/api/anuncios/{aid}")
def api_anuncio(aid: int):
    with n.con() as c:
        return _sem_linhas(montagem(c, aid))


@app.post("/api/anuncios/{aid}")
async def api_montar(aid: int, request: Request):
    d = await request.json()
    oque = d.get("acao")
    with n.con() as c:
        if not c.execute("SELECT 1 FROM anuncios WHERE id=?", (aid,)).fetchone():
            raise HTTPException(404)

        def aprovada(iid):
            r = c.execute("SELECT * FROM imagens WHERE id=? AND status='aprovada' AND arquivo<>''",
                          (iid,)).fetchone()
            if not r:
                raise HTTPException(400, "Só imagem aprovada entra na estrutura do anúncio.")
            n.vincular(c, [iid], aid)
            return r

        def papel(iid, valor, pos=0):
            c.execute("UPDATE imagem_anuncio SET papel=?, posicao=? WHERE imagem_id=? AND anuncio_id=?",
                      (valor, pos, iid, aid))

        def proxima():
            return c.execute("SELECT COALESCE(MAX(posicao),0)+1 FROM imagem_anuncio WHERE anuncio_id=? "
                             "AND papel='galeria'", (aid,)).fetchone()[0]

        def por_cor(img, nome=""):
            nome = (nome or img["cor"] or "").strip()
            if not nome:
                q = c.execute("SELECT COUNT(*) FROM anuncio_cores WHERE anuncio_id=?", (aid,)).fetchone()[0]
                nome = f"Cor {q + 1}"
            pos = c.execute("SELECT COALESCE(MAX(posicao),0)+1 FROM anuncio_cores WHERE anuncio_id=?",
                            (aid,)).fetchone()[0]
            c.execute("INSERT INTO anuncio_cores(anuncio_id,cor,imagem_id,posicao) VALUES(?,?,?,?) "
                      "ON CONFLICT(anuncio_id,cor) DO UPDATE SET imagem_id=excluded.imagem_id",
                      (aid, nome, img["id"], pos))

        if oque == "dados":
            for campo in ("titulo", "preco", "preco_antigo", "descricao"):
                if campo in d:
                    c.execute(f"UPDATE anuncios SET {campo}=? WHERE id=?", (str(d[campo]).strip(), aid))
        elif oque == "capa":
            aprovada(int(d["imagem"]))
            c.execute("UPDATE imagem_anuncio SET papel='' WHERE anuncio_id=? AND papel='capa'", (aid,))
            papel(int(d["imagem"]), "capa")
        elif oque == "foto":
            aprovada(int(d["imagem"]))
            if c.execute("SELECT COUNT(*) FROM imagem_anuncio WHERE anuncio_id=? AND papel='galeria'",
                         (aid,)).fetchone()[0] >= 9:
                raise HTTPException(400, "As 10 fotos já estão preenchidas. Tire uma para colocar outra.")
            papel(int(d["imagem"]), "galeria", proxima())
        elif oque == "tirar":
            papel(int(d["imagem"]), "")
        elif oque == "ordenar":
            for pos, iid in enumerate(d["ids"], 1):
                c.execute("UPDATE imagem_anuncio SET posicao=? WHERE imagem_id=? AND anuncio_id=? "
                          "AND papel='galeria'", (pos, int(iid), aid))
        elif oque == "slots":  # as 10 fotos: a primeira e a capa, as outras seguem a ordem
            ids = [int(i) if i else None for i in d["ids"][:10]]
            for i in ids:
                if i:
                    aprovada(i)
            c.execute("UPDATE imagem_anuncio SET papel='', posicao=0 WHERE anuncio_id=? "
                      "AND papel IN ('capa','galeria')", (aid,))
            for pos, i in enumerate(ids):
                if i:
                    papel(i, "capa" if pos == 0 else "galeria", pos)
        elif oque == "cor":
            por_cor(aprovada(int(d["imagem"])), d.get("cor", ""))
        elif oque == "tirar_cor":
            c.execute("DELETE FROM anuncio_cores WHERE anuncio_id=? AND cor=?", (aid, d["cor"]))
        elif oque == "renomear_cor":
            novo = str(d.get("novo", "")).strip()
            if novo and novo.lower() != d["cor"].lower():
                if c.execute("SELECT 1 FROM anuncio_cores WHERE anuncio_id=? AND cor=?", (aid, novo)).fetchone():
                    raise HTTPException(400, "Já existe uma cor com esse nome neste anúncio.")
            if novo:
                c.execute("UPDATE anuncio_cores SET cor=? WHERE anuncio_id=? AND cor=?", (novo, aid, d["cor"]))
        elif oque == "auto":
            m = montagem(c, aid)
            formato = m["anuncio"]["formato"]
            livres = m["linhas"]["resto"] + m["linhas"]["sugestoes"]  # do anuncio primeiro, depois as do produto

            def usar(r, valor, pos=0):
                n.vincular(c, [r["id"]], aid)
                papel(r["id"], valor, pos)

            if not m["capa"]:
                tipo_capa = "capa" if formato == "unitario" else "capa_" + formato
                capas = [r for r in livres if r["tipo"] == tipo_capa]
                if capas:
                    usar(capas[0], "capa")
            if not m["galeria"] and formato == "unitario":
                fotos = sorted((r for r in livres if r["tipo"] in ORDEM_AUTO),
                               key=lambda r: (ORDEM_AUTO[r["tipo"]], r["cor"], r["id"]))
                for pos, r in enumerate(fotos[:9], 1):
                    usar(r, "galeria", pos)
            if not m["cores"] and formato == "unitario":
                vistas = set()
                for r in livres:
                    if r["tipo"] == "fb" and r["cor"] and r["cor"].lower() not in vistas:
                        vistas.add(r["cor"].lower())
                        n.vincular(c, [r["id"]], aid)
                        por_cor(r)
        else:
            raise HTTPException(400, "Ação desconhecida.")
        return _sem_linhas(montagem(c, aid))


# ------------------------------------------- checagem do anuncio (o que falta)
def _metas(c, a):
    d = c.execute("SELECT * FROM demandas WHERE id=?", (a["demanda_id"],)).fetchone() if a["demanda_id"] else None
    if d:
        mt = json.loads(d["metas"])
        return d, {"ia": mt.get("ia", 0), "informativo": mt.get("informativo", 0), "tabela": mt.get("tabela", 0),
                   "capa": mt.get("capas", {}).get(a["formato"], 0)}
    return None, {"ia": a["meta_ia"] if a["meta_ia"] is not None else 3, "informativo": 3, "tabela": 1,
                  "capa": a["meta_capa"] if a["meta_capa"] is not None else 1}


def checagem(c, aid, m=None):
    """A lista unica do que falta num anuncio. O pacote e o comando faltas usam esta mesma resposta."""
    a = c.execute("SELECT * FROM anuncios WHERE id=?", (aid,)).fetchone()
    if not a:
        raise HTTPException(404)
    d, metas = _metas(c, a)
    m = m or montagem(c, aid)
    L, produto, kit = m["linhas"], m["produto"], a["formato"] != "unitario"
    ligadas = c.execute(f"SELECT {CAMPOS_IMG} FROM imagens i JOIN imagem_anuncio x ON x.imagem_id=i.id "
                        "WHERE x.anuncio_id=? AND i.status<>'reprovada' AND i.arquivo<>''", (aid,)).fetchall()
    pend = [r for r in ligadas if r["status"] in n.PENDENTES]
    itens = []

    def falta(tipo, texto, cor="", faltam=1, esperando=0, fora=0):
        sobra = [f"{esperando} esperando sua aprovação"] if esperando else []
        sobra += [f"{fora} aprovada(s) ainda fora das fotos do anúncio"] if fora else []
        itens.append({"tipo": tipo, "tipo_nome": n.TIPO_NOME.get(tipo, tipo), "cor": cor, "faltam": faltam,
                      "esperando_aprovacao": esperando, "aprovadas_fora_do_anuncio": fora,
                      "texto": texto + (f" ({'; '.join(sobra)})" if sobra else "")})

    def do_produto(tipo, cor, estados):
        if not produto:
            return [r for r in ligadas if r["tipo"] == tipo and r["cor"] == cor and r["status"] in estados]
        return c.execute(f"SELECT id FROM imagens WHERE produto=? AND tipo=? AND cor=? AND arquivo<>'' "
                         f"AND status IN ({','.join('?' * len(estados))})", [produto, tipo, cor, *estados]).fetchall()

    tipo_capa = "capa_" + a["formato"] if kit else "capa"
    capas = [r for r in ligadas if r["tipo"] == tipo_capa]
    if not L["capa"]:
        falta(tipo_capa, "Falta escolher a capa (espaço 1)", esperando=sum(r["status"] in n.PENDENTES for r in capas))
    nas_fotos = {r["id"] for r in L["galeria"]}
    if kit:
        fb = a["formato"] + "_fb"
        if not any(r["tipo"] == fb for r in L["galeria"] + L["cores"]):
            falta(fb, f"Falta o fundo branco do {n.FORMATO_NOME[a['formato']]} nas fotos ou em Cores",
                  esperando=sum(r["tipo"] == fb for r in pend))
    else:
        cores = sorted({r["cor"] for r in ligadas if r["cor"]} | {r["cor"] for r in L["cores"] if r["cor"]})
        if not cores and produto:  # anuncio ainda vazio: usa as cores do fundo branco do produto
            cores = [r[0] for r in c.execute("SELECT DISTINCT cor FROM imagens WHERE produto=? AND tipo='fb' AND cor<>'' "
                                             "AND status<>'reprovada' AND arquivo<>'' ORDER BY 1", (produto,))]
        if not cores:
            falta("cor", "Nenhuma cor definida: coloque neste anúncio imagens com produto e cor preenchidos")
        nomes = {"ia": ("foto IA", "fotos IA"), "informativo": ("informativo", "informativos"),
                 "tabela": ("tabela de medidas", "tabelas de medidas")}
        for cor in cores:
            for tipo, (um, varios) in nomes.items():
                q = metas[tipo] - sum(r["tipo"] == tipo and r["cor"] == cor for r in L["galeria"])
                if q > 0:
                    fora = sum(r["id"] not in nas_fotos for r in do_produto(tipo, cor, ("aprovada",)))
                    falta(tipo, f"{'Falta 1 ' + um if q == 1 else f'Faltam {q} ' + varios} da cor {cor} nas fotos do anúncio",
                          cor, q, len(do_produto(tipo, cor, n.PENDENTES)), fora)
        precisa = len(cores) * (metas["ia"] + metas["informativo"] + metas["tabela"])
        if precisa > 9:
            falta("limite", f"As metas pedem {precisa} fotos além da capa, mas o anúncio comporta 9. "
                            "Diminua as metas deste anúncio ou faça um anúncio por cor", faltam=precisa - 9)
        if not L["cores"]:
            falta("cores", "Falta pelo menos 1 foto em Cores (variações)",
                  esperando=sum(r["tipo"] == "fb" for r in pend))
    for campo, nome in (("titulo", "o título"), ("preco", "o preço"), ("descricao", "a descrição")):
        if not (a[campo] or "").strip():
            falta(campo, f"Falta preencher {nome}")
    if pend:
        falta("conferencia", f"{len(pend)} imagem(ns) do anúncio ainda em conferência: aprove ou reprove", faltam=len(pend))
    return {"anuncio": a["nome"], "id": aid, "formato": a["formato"], "produto": produto, "tarefa": d["tarefa"] if d else "",
            "completo": not itens, "faltas": itens, "metas": metas,
            "capas_a_produzir": {"meta": metas["capa"], "aprovadas": sum(r["status"] == "aprovada" for r in capas),
                                 "esperando_aprovacao": sum(r["status"] in n.PENDENTES for r in capas)}}


def pacote(aid, mk="", por="você", forcar=False):
    """ZIP do anuncio: fotos na ordem (01 = capa), cores e o texto. So sai se a checagem passar."""
    with n.con() as c:
        m = montagem(c, aid)
        chk = checagem(c, aid, m)
    L, a = m["linhas"], m["anuncio"]
    ordem = ([L["capa"]] if L["capa"] else []) + L["galeria"]
    if not chk["completo"] and not forcar:
        raise HTTPException(409, {"erro": "Anúncio incompleto. O pacote NÃO foi montado.",
                                  "faltas": [i["texto"] for i in chk["faltas"]]})
    if not ordem and not L["cores"]:
        raise HTTPException(409, {"erro": "Este anúncio não tem nenhuma imagem aprovada colocada.", "faltas": []})
    prefixo = (_pedaco(mk).lower() + "_" if mk else "") + _pedaco(a["nome"]).lower()
    mem, nomes = io.BytesIO(), []
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_STORED) as z:
        for pos, r in enumerate(ordem, 1):
            capa = "_capa" if L["capa"] and pos == 1 else ""
            nomes.append(f"{prefixo}_{pos:02d}{capa}{Path(r['arquivo']).suffix.lower()}")
            z.write(n.caminho_imagem(r), nomes[-1])
        for r in L["cores"]:
            nomes.append(f"cores/{prefixo}_cor_{_pedaco(r['nome_cor']).lower()}{Path(r['arquivo']).suffix.lower()}")
            z.write(n.caminho_imagem(r), nomes[-1])
        texto = [f"Anúncio: {a['nome']}", f"Marketplace: {mk or 'geral'}", f"Título: {a['titulo']}", f"Preço: {a['preco']}",
                 f"Preço antigo: {a['preco_antigo']}", "Cores: " + ", ".join(r["nome_cor"] for r in L["cores"]),
                 "", "Descrição:", a["descricao"]]
        z.writestr("anuncio.txt", "\r\n".join(texto))
        nomes.append("anuncio.txt")
    guardado = ""
    try:  # guarda o ZIP na pasta do site (TrueNAS) para abrir depois pela tela
        rel = Path("pacotes") / _pedaco(a["nome"]).lower() / f"{prefixo}_{time.strftime('%Y%m%d-%H%M%S')}.zip"
        (n.pasta_repo() / rel).parent.mkdir(parents=True, exist_ok=True)
        (n.pasta_repo() / rel).write_bytes(mem.getvalue())
        guardado = rel.as_posix()
    except OSError as e:
        n.registrar(f"não consegui guardar o pacote de {a['nome']}: {e}")
    with n.con() as c:
        c.execute("INSERT INTO pacotes(anuncio_id,marketplace,criado_em,por,status,arquivos,zip) VALUES(?,?,?,?,?,?,?)",
                  (aid, mk, n.agora(), por, "completo" if chk["completo"] else "incompleto",
                   json.dumps(nomes, ensure_ascii=False), guardado))
    mem.seek(0)
    return StreamingResponse(mem, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{prefixo}.zip"'})


@app.get("/anuncios/{aid}/zip")
def exportar(aid: int, mk: str = "", forcar: int = 0):
    return pacote(aid, mk, "você", bool(forcar))


# ------------------------------------------------ pedidos para os bots
def texto_pedido(k, pid):
    linhas = [f'PEDIDO DO MENORK nº {pid}: completar o anúncio "{k["anuncio"]}"' + (f' (produto {k["produto"]})' if k["produto"] else ""),
              "O que falta:"] + [f"- {i['texto']}" for i in k["faltas"]]
    linhas += ["", "Como fazer:",
               "1. Antes de gerar, rode menork.ps1 referencias e menork.ps1 erros.",
               f'2. Mande cada imagem com menork.ps1 enviar, dizendo -Produto, -Cor, -Tipo e -Anuncio "{k["anuncio"]}".',
               "3. Título, preço, descrição e aprovação são do Menork: não invente.",
               f'4. Ao começar: menork.ps1 pedido -Id {pid} -Status pego -Bot "SEU NOME". Ao terminar: -Status feito.']
    return "\n".join(linhas)


@app.post("/api/pedido")
async def pedir(request: Request):
    d = await request.json()
    aid = int(d["an"])
    with n.con() as c:
        k = checagem(c, aid)
        if k["completo"]:
            raise HTTPException(400, "Este anúncio não tem nada faltando.")
        c.execute("UPDATE pedidos SET status='substituido', atualizado=? WHERE anuncio_id=? AND status IN ('aberto','pego')",
                  (n.agora(), aid))
        pid = c.execute("INSERT INTO pedidos(anuncio_id,criado_em,texto,atualizado) VALUES(?,?,'',?)",
                        (aid, n.agora(), n.agora())).lastrowid
        texto = texto_pedido(k, pid)
        c.execute("UPDATE pedidos SET texto=? WHERE id=?", (texto, pid))
    return {"id": pid, "texto": texto}


@app.get("/bot/pedidos")
def bot_pedidos():
    with n.con() as c:
        abertos = c.execute("SELECT * FROM pedidos WHERE status IN ('aberto','pego') ORDER BY id").fetchall()
        return {"pedidos": [{"id": p["id"], "status": p["status"], "bot": p["bot"], "pedido_em": p["criado_em"],
                             "texto_original": p["texto"], "agora": checagem(c, p["anuncio_id"])} for p in abertos]}


@app.post("/bot/pedido")
async def bot_pedido(request: Request):
    d = await request.json()
    status = str(d.get("status", "")).strip().lower()
    if status not in ("pego", "feito"):
        raise HTTPException(400, "Status do pedido: pego ou feito.")
    with n.con() as c:
        p = c.execute("SELECT * FROM pedidos WHERE id=?", (int(d["id"]),)).fetchone()
        if not p:
            raise HTTPException(404, "Pedido não encontrado.")
        c.execute("UPDATE pedidos SET status=?, bot=?, atualizado=? WHERE id=?",
                  (status, str(d.get("bot", "")).strip() or p["bot"], n.agora(), p["id"]))
        return {"ok": True, "ainda_falta": [i["texto"] for i in checagem(c, p["anuncio_id"])["faltas"]]}


@app.get("/pacotes/{pid}/zip")
def pacote_guardado(pid: int):
    with n.con() as c:
        p = c.execute("SELECT * FROM pacotes WHERE id=?", (pid,)).fetchone()
    if not p or not p["zip"] or not (n.pasta_repo() / p["zip"]).exists():
        raise HTTPException(404, "O arquivo deste pacote não está mais guardado.")
    return FileResponse(n.pasta_repo() / p["zip"], filename=Path(p["zip"]).name)


# ----------------------------------------------------- entradas dos bots
async def _receber(request, reprovada=False):
    q = request.query_params
    nome = Path(q.get("nome") or "imagem.png").name
    if Path(nome).suffix.lower() not in n.EXTENSOES:
        raise HTTPException(400, "Mande PNG, JPG ou WEBP e diga o nome do arquivo em ?nome=.")
    corpo = await request.body()
    if not corpo:
        raise HTTPException(400, "O arquivo chegou vazio.")
    alertas = [a.strip() for a in (q.get("alertas") or "").split("|") if a.strip()]
    if not alertas and (q.get("conferida") or "") not in ("1", "sim", "true"):
        alertas = None  # ninguem conferiu ainda
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "arquivo"
        p.write_bytes(corpo)
        try:
            iid, novo = n.importar(p, nome, origem=q.get("origem", ""), anuncio_nome=(q.get("anuncio") or "").strip(),
                                   dados={k: q.get(k, "") for k in ("produto", "cor", "tipo")},
                                   conta=(q.get("conta") or "").strip(), alertas=alertas)
        except Exception as e:
            raise HTTPException(400, f"Não consegui ler a imagem: {e}")
    atualizada = False
    with n.con() as c:
        if not novo:  # ja existia (ex.: entrou pela pasta vigiada sem produto, cor e tipo): completa os dados
            antes = c.execute("SELECT * FROM imagens WHERE id=?", (iid,)).fetchone()
            if antes["status"] != "reprovada":
                novos = {k: (q.get(k) or "").strip() for k in ("produto", "cor", "tipo", "conta")}
                novos["produto"] = novos["produto"].upper()
                if novos["tipo"] and novos["tipo"] not in n.TIPO_NOME:
                    raise HTTPException(400, f"Tipo desconhecido: {novos['tipo']}")
                for campo, valor in novos.items():
                    if valor and valor != antes[campo]:
                        c.execute(f"UPDATE imagens SET {campo}=? WHERE id=?", (valor, iid))
                        atualizada = True
                if alertas is not None:
                    c.execute("UPDATE imagens SET alertas=? WHERE id=?", (json.dumps(alertas, ensure_ascii=False), iid))
                    atualizada = True
                c.execute("UPDATE imagens SET status=CASE WHEN produto<>'' AND tipo<>'' THEN 'conferencia' ELSE 'gerada' END "
                          "WHERE id=? AND status IN ('gerada','conferencia')", (iid,))
                alvo = (q.get("anuncio") or "").strip()
                if alvo:
                    aid = n.obter_anuncio(c, alvo)
                    if not c.execute("SELECT 1 FROM imagem_anuncio WHERE imagem_id=? AND anuncio_id=?", (iid, aid)).fetchone():
                        n.vincular(c, [iid], aid)
                        atualizada = True
        if reprovada and novo:
            c.execute("UPDATE imagens SET status='reprovada', motivo=?, origem_decisao=?, decidido_em=?, apagar_em=? WHERE id=?",
                      (str(q.get("motivo") or "Sem motivo")[:80], (q.get("bot") or "bot").strip(), n.agora(), time.time(), iid))
        linha = c.execute("SELECT status FROM imagens WHERE id=?", (iid,)).fetchone()
        linha = c.execute("SELECT * FROM imagens WHERE id=?", (iid,)).fetchone()
    aviso = "" if novo else ("Esta imagem já existia no site: os dados foram atualizados." if atualizada
                             else "Esta imagem já existia no site com estes mesmos dados; nada mudou.")
    return {"id": iid, "nova": novo, "atualizada": atualizada, "status": linha["status"], "produto": linha["produto"],
            "cor": linha["cor"], "tipo": linha["tipo"], "aviso": aviso}


@app.post("/bot/imagem")
async def bot_imagem(request: Request):
    return await _receber(request)


@app.post("/bot/reprovada")
async def bot_reprovada(request: Request):
    return await _receber(request, reprovada=True)


@app.get("/bot/referencias")
def bot_referencias(tipo: str = "", produto: str = "", max: int = 5):
    q, args = "SELECT * FROM imagens WHERE ref=1 AND status='aprovada' AND arquivo<>''", []
    if tipo:
        q += " AND tipo LIKE ?"
        args.append(tipo + "%" if tipo == "capa" else tipo)
    with n.con() as c:
        linhas = c.execute(q + " ORDER BY (produto=?) DESC, id DESC", [*args, produto.strip().upper()]).fetchall()
    linhas = linhas[: min(5, max)]
    arquivos = [{"id": l["id"], "tipo": l["tipo"], "produto": l["produto"], "cor": l["cor"],
                 "caminho": str(n.caminho_imagem(l))} for l in linhas]
    return {"arquivos": arquivos,
            "comando": "-Referencias " + ",".join(f'"{a["caminho"]}"' for a in arquivos) if arquivos else ""}


@app.get("/bot/erros")
def bot_erros(produto: str = "", limite: int = 100):
    q, args = "SELECT * FROM imagens WHERE status='reprovada'", []
    if produto:
        q += " AND produto=?"
        args.append(produto.strip().upper())
    with n.con() as c:
        linhas = c.execute(q + " ORDER BY id DESC LIMIT ?", [*args, min(500, limite)]).fetchall()
    resumo = {}
    for l in linhas:
        resumo[l["motivo"] or "Sem motivo"] = resumo.get(l["motivo"] or "Sem motivo", 0) + 1
    return {"resumo": dict(sorted(resumo.items(), key=lambda x: -x[1])),
            "erros": [{"produto": l["produto"], "cor": l["cor"], "tipo": l["tipo"], "motivo": l["motivo"] or "Sem motivo",
                       "reprovada_por": l["origem_decisao"] or "você", "quando": l["decidido_em"]} for l in linhas]}


@app.get("/bot/anuncios")
def bot_anuncios():
    with n.con() as c:
        return {"anuncios": [checagem(c, a["id"]) for a in c.execute("SELECT id FROM anuncios ORDER BY id").fetchall()]}


def _anuncio_por_nome(c, nome):
    a = c.execute("SELECT id FROM anuncios WHERE nome=?", (nome.strip(),)).fetchone()
    if not a:
        chave = re.sub(r"[^a-z0-9]", "", n._limpo(nome))
        a = next((r for r in c.execute("SELECT id, nome FROM anuncios").fetchall()
                  if re.sub(r"[^a-z0-9]", "", n._limpo(r["nome"])) == chave), None)
    if not a:
        raise HTTPException(404, f"Não existe anúncio chamado {nome!r}. Veja os nomes em /bot/anuncios.")
    return a["id"]


@app.get("/bot/faltas")
def bot_faltas(anuncio: str):
    with n.con() as c:
        return checagem(c, _anuncio_por_nome(c, anuncio))


@app.get("/bot/capas")
def bot_capas(produto: str = ""):
    q, args = "SELECT * FROM imagens WHERE status='aprovada' AND tipo LIKE 'capa%' AND arquivo<>''", []
    if produto:
        q += " AND produto=?"
        args.append(produto.strip().upper())
    with n.con() as c:
        return {"capas": [{"id": l["id"], "produto": l["produto"], "cor": l["cor"], "tipo": l["tipo"],
                           "caminho": str(n.caminho_imagem(l))} for l in c.execute(q + " ORDER BY id DESC LIMIT 200", args)]}


@app.get("/bot/pacote")
def bot_pacote(anuncio: str, mk: str = "", bot: str = ""):
    with n.con() as c:
        aid = _anuncio_por_nome(c, anuncio)
    return pacote(aid, mk, (bot or "bot").strip())  # bot nao pode forcar pacote incompleto


@app.post("/bot/status")
async def bot_status(request: Request):
    d = await request.json()
    with n.con() as c:
        c.execute("INSERT INTO bots VALUES(?,?,?,?) ON CONFLICT(nome) DO UPDATE SET status=excluded.status, "
                  "detalhe=excluded.detalhe, atualizado=excluded.atualizado",
                  (str(d["bot"]).strip(), str(d.get("status", "ok")).strip().lower(), str(d.get("detalhe", ""))[:200], n.agora()))
    return {"ok": True}


@app.post("/bot/conta")
async def bot_conta(request: Request):
    d = await request.json()
    with n.con() as c:
        c.execute("INSERT INTO contas VALUES(?,?,?) ON CONFLICT(nome) DO UPDATE SET limite=excluded.limite, "
                  "atualizado=excluded.atualizado", (str(d["conta"]).strip(), str(d.get("limite", ""))[:80], n.agora()))
    return {"ok": True}


@app.post("/bot/demanda")
async def bot_demanda(request: Request):
    d = await request.json()
    tarefa = str(d.get("tarefa", "")).strip()
    if not tarefa or not str(d.get("info", "")).strip():
        raise HTTPException(400, "Mande pelo menos tarefa (nome) e info (o texto do pedido).")
    with n.con() as c:
        did, nova = n.nova_demanda(c, d.get("tarefa_id") or tarefa, tarefa, str(d["info"]), str(d.get("pasta", "")),
                                   [str(m).upper() for m in d.get("marketplaces", [])], str(d.get("status", "")),
                                   str(d.get("url", "")), str(d.get("produto", "")))
        nomes = [r[0] for r in c.execute("SELECT nome FROM anuncios WHERE demanda_id=?", (did,))]
    return {"id": did, "nova": nova, "anuncios": nomes}


# ------------------------------------------------------------------- arquivos
def _linha(iid):
    with n.con() as c:
        l = c.execute("SELECT * FROM imagens WHERE id=?", (iid,)).fetchone()
    if not l or not l["arquivo"]:
        raise HTTPException(404)
    return l


@app.get("/img/{iid}")
def img(iid: int):
    l = _linha(iid)
    p = n.caminho_imagem(l)
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, filename=l["nome_original"], content_disposition_type="inline")


@app.get("/mini/{iid}")
def mini(iid: int):
    pronta = n.pasta_miniaturas() / f"{iid}.jpg"  # a miniatura fica mesmo depois de a reprovada ser apagada
    try:
        return FileResponse(pronta if pronta.exists() else n.caminho_miniatura(_linha(iid)),
                            headers={"Cache-Control": "max-age=86400"})
    except OSError:
        raise HTTPException(404)


# ------------------------------------------------------------------------ API
@app.get("/api/imagens/{iid}")
def detalhe(iid: int):
    with n.con() as c:
        l = c.execute("SELECT * FROM imagens WHERE id=?", (iid,)).fetchone()
        if not l:
            raise HTTPException(404)
        d = dict(l)
        d["anuncios"] = [dict(r) for r in c.execute(
            "SELECT a.id, a.nome FROM anuncios a JOIN imagem_anuncio x ON x.anuncio_id=a.id "
            "WHERE x.imagem_id=?", (iid,))]
        fb = []
        if l["produto"]:
            fb = c.execute("SELECT id, cor, status FROM imagens WHERE tipo='fb' AND produto=? "
                           "AND status<>'reprovada' AND id<>? ORDER BY (cor=?) DESC, "
                           "(status='aprovada') DESC, id DESC LIMIT 12",
                           (l["produto"], iid, l["cor"])).fetchall()
        d["fundo_branco"] = [dict(r) for r in fb]
        d["parecida"] = _parecidas(c).get(iid) if l["status"] in n.PENDENTES and l["tipo"].startswith("capa") else None
    d["tipo_nome"] = n.TIPO_NOME.get(d["tipo"], "")
    d["status_nome"] = n.STATUS_NOME.get(d["status"], d["status"])
    d["alertas"] = _alertas(d["alertas"])
    d["origem"] = d.pop("origem_decisao") or ""
    d["ref"] = bool(d["ref"])
    for campo in ("sha256", "dhash", "apagar_em"):
        d.pop(campo, None)
    return d


@app.post("/api/acao")
async def acao(request: Request):
    d = await request.json()
    ids = [int(i) for i in d.get("ids", [])]
    oque = d.get("acao")
    if not ids:
        return {"ok": True, "feitas": 0}
    marcas = ",".join("?" * len(ids))
    with n.con() as c:
        if oque == "aprovar":
            c.execute(f"UPDATE imagens SET status='aprovada', decidido_em=?, apagar_em=NULL "
                      f"WHERE id IN ({marcas}) AND arquivo<>''", [n.agora(), *ids])
            for r in c.execute(
                    f"SELECT x.imagem_id, x.anuncio_id FROM imagem_anuncio x JOIN imagens i ON i.id=x.imagem_id "
                    f"WHERE i.id IN ({marcas}) AND i.tipo LIKE 'capa%' AND i.status='aprovada'", ids).fetchall():
                if not c.execute("SELECT 1 FROM imagem_anuncio WHERE anuncio_id=? AND papel='capa'",
                                 (r["anuncio_id"],)).fetchone():
                    c.execute("UPDATE imagem_anuncio SET papel='capa' WHERE imagem_id=? AND anuncio_id=?",
                              (r["imagem_id"], r["anuncio_id"]))
            for r in c.execute(
                    f"SELECT i.id, i.tipo, i.cor, x.anuncio_id FROM imagem_anuncio x JOIN imagens i ON i.id=x.imagem_id "
                    f"JOIN anuncios a ON a.id=x.anuncio_id WHERE i.id IN ({marcas}) AND i.status='aprovada' AND x.papel='' "
                    f"AND a.formato='unitario' AND i.tipo IN ('ia','informativo','tabela') ORDER BY i.id", ids).fetchall():
                _, metas = _metas(c, c.execute("SELECT * FROM anuncios WHERE id=?", (r["anuncio_id"],)).fetchone())
                nas_fotos = c.execute(
                    "SELECT i.tipo, i.cor, x.posicao FROM imagem_anuncio x JOIN imagens i ON i.id=x.imagem_id "
                    "WHERE x.anuncio_id=? AND x.papel='galeria' AND i.status='aprovada' AND i.arquivo<>''",
                    (r["anuncio_id"],)).fetchall()
                ja = sum(f["tipo"] == r["tipo"] and f["cor"] == r["cor"] for f in nas_fotos)
                if len(nas_fotos) < 9 and ja < metas[r["tipo"]]:  # so ate a meta daquela cor, e enquanto couber
                    c.execute("UPDATE imagem_anuncio SET papel='galeria', posicao=? WHERE imagem_id=? AND anuncio_id=?",
                              (max((f["posicao"] for f in nas_fotos), default=0) + 1, r["id"], r["anuncio_id"]))
        elif oque == "reprovar":
            c.execute(f"UPDATE imagens SET status='reprovada', decidido_em=?, apagar_em=?, motivo=?, "
                      f"origem_decisao='você' WHERE id IN ({marcas})",
                      [n.agora(), time.time() + int(n.CFG["segundos_para_desfazer"]),
                       str(d.get("motivo") or "Sem motivo")[:80], *ids])
        elif oque == "desfazer":
            for l in c.execute(f"SELECT * FROM imagens WHERE id IN ({marcas}) AND arquivo<>''", ids).fetchall():
                c.execute("UPDATE imagens SET status=?, decidido_em=NULL, apagar_em=NULL, motivo='', "
                          "origem_decisao='' WHERE id=?",
                          (n.status_inicial(l["produto"], l["tipo"]), l["id"]))
        elif oque == "classificar":
            for campo in ("produto", "cor", "tipo"):
                if campo in d and (d[campo] or d.get("limpar")):
                    valor = d[campo].strip()
                    if campo == "produto":
                        valor = valor.upper()
                    if campo == "tipo" and valor and valor not in n.TIPO_NOME:
                        raise HTTPException(400, "Tipo desconhecido.")
                    c.execute(f"UPDATE imagens SET {campo}=? WHERE id IN ({marcas})", [valor, *ids])
            c.execute(f"UPDATE imagens SET status=CASE WHEN produto<>'' AND tipo<>'' THEN 'conferencia' "
                      f"ELSE 'gerada' END WHERE id IN ({marcas}) AND status IN ('gerada','conferencia')", ids)
            if d.get("anuncio", "").strip():
                aid = n.obter_anuncio(c, d["anuncio"])
                n.vincular(c, ids, aid)
        elif oque == "referencia":
            c.execute(f"UPDATE imagens SET ref=1-ref WHERE id IN ({marcas}) AND status='aprovada'", ids)
        elif oque == "desvincular":
            c.execute(f"DELETE FROM imagem_anuncio WHERE anuncio_id=? AND imagem_id IN ({marcas})",
                      [int(d["anuncio_id"]), *ids])
            c.execute(f"DELETE FROM anuncio_cores WHERE anuncio_id=? AND imagem_id IN ({marcas})",
                      [int(d["anuncio_id"]), *ids])
        else:
            raise HTTPException(400, "Ação desconhecida.")
    return {"ok": True, "feitas": len(ids)}


@app.post("/api/enviar")
async def enviar(arquivos: list[UploadFile] = File(...), anuncio: str = Form("")):
    novas, repetidas, erros = 0, 0, []
    for a in arquivos:
        nome = Path(a.filename or "imagem").name
        if Path(nome).suffix.lower() not in n.EXTENSOES:
            erros.append(nome)
            continue
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "arquivo"
            p.write_bytes(await a.read())
            try:
                _, novo = n.importar(p, nome, origem="", anuncio_nome=anuncio.strip())
                novas += int(novo); repetidas += int(not novo)
            except Exception:
                erros.append(nome)
    return {"novas": novas, "repetidas": repetidas, "erros": erros}


@app.post("/api/ler-agora")
def ler_agora():
    return n.rodada()
