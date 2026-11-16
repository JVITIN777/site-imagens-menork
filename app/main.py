"""Telas e API do site de imagens Menork."""
import io
import json
import re
import secrets
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
LOGOS = ("logo.png", "logo.jpg", "logo.jpeg", "logo.webp", "logo.svg")


def arquivo_logo():
    """A logo fica em dados/ (so no PC do usuario, nunca no repositorio)."""
    return next((n.pasta_dados() / nome for nome in LOGOS if (n.pasta_dados() / nome).exists()), None)


def versao_logo():
    p = arquivo_logo()
    return int(p.stat().st_mtime) if p else 0


tpl.env.globals["versao_logo"] = versao_logo

LIVRES = ("/static", "/entrar", "/criar-senha", "/logo")
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
@app.get("/marca-mk/{qual}")
def marca_mk(qual: str):
    """Logo de marketplace que o Menork colocou em dados/ (logo_ml.png, logo_shopee.png). Nunca vai para o repositorio."""
    if qual not in ("ml", "shopee"):
        raise HTTPException(404)
    p = next((n.pasta_dados() / f"logo_{qual}{e}" for e in (".png", ".svg", ".webp", ".jpg", ".jpeg")
              if (n.pasta_dados() / f"logo_{qual}{e}").exists()), None)
    if not p:
        raise HTTPException(404)
    return FileResponse(p, headers={"Cache-Control": "max-age=3600"})


@app.get("/logo")
def logo():
    p = arquivo_logo()
    if not p:
        raise HTTPException(404)
    return FileResponse(p, headers={"Cache-Control": "max-age=86400"})


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
                 "ref": bool(l["ref"]), "estilo": l["estilo"] or "", "parecida": parecidas.get(l["id"]),
                 "caminho": str(n.caminho_imagem(l)) if l["arquivo"] else ""} for l in linhas]
        anuncios = [{"id": a["id"], "nome": a["nome"], "formato": a["formato"], "titulo": a["titulo"], "preco": a["preco"],
                     "preco_antigo": a["preco_antigo"], "descricao": a["descricao"], "demanda": a["demanda_id"],
                     "meta_ia": a["meta_ia"], "meta_capa": a["meta_capa"], "familia": a["familia"],
                     "modo": _modo(a["modo"]), "tamanhos": a["tamanhos"] or ""}
                    for a in c.execute("SELECT * FROM anuncios ORDER BY id")]
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
        envios = {}
        for p in c.execute("SELECT * FROM envios ORDER BY id DESC"):
            lista = envios.setdefault(p["anuncio_id"], [])
            if len(lista) < 5:
                lista.append({"quando": p["quando"], "por": p["por"], "ok": bool(p["ok"]), "id": p["id_externo"],
                              "resposta": p["resposta"][:200] if not p["ok"] else ""})
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
            "bots": bots, "contas": contas, "faltas": faltas, "pacotes": pacotes, "pedidos": pedidos, "envios": envios, "integracao": integracao_ver(), "versao": atu.situacao(), "leitor": n.estado, "clickup": bool(str(n.CFG["clickup_token"]).strip()),
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


def copiar_fotos(c, origem, destino, levar_capa):
    """Leva as fotos (e as cores) de um anuncio para outro. Nao toca em titulo, preco, descricao nem metas."""
    papeis = ("'capa','galeria'" if levar_capa else "'galeria'")
    c.execute(f"UPDATE imagem_anuncio SET papel='', posicao=0 WHERE anuncio_id=? AND papel IN ({papeis})", (destino,))
    for r in c.execute("SELECT imagem_id, papel, posicao FROM imagem_anuncio WHERE anuncio_id=? AND papel IN "
                       f"({papeis})", (origem,)).fetchall():
        n.vincular(c, [r["imagem_id"]], destino)
        c.execute("UPDATE imagem_anuncio SET papel=?, posicao=? WHERE imagem_id=? AND anuncio_id=?",
                  (r["papel"], r["posicao"], r["imagem_id"], destino))
    c.execute("DELETE FROM anuncio_cores WHERE anuncio_id=?", (destino,))
    for r in c.execute("SELECT cor, imagem_id, posicao FROM anuncio_cores WHERE anuncio_id=?", (origem,)).fetchall():
        n.vincular(c, [r["imagem_id"]], destino)
        c.execute("INSERT INTO anuncio_cores(anuncio_id,cor,imagem_id,posicao) VALUES(?,?,?,?)",
                  (destino, r["cor"], r["imagem_id"], r["posicao"]))
    c.execute("DELETE FROM fotos_cor WHERE anuncio_id=?", (destino,))
    for r in c.execute("SELECT cor, imagem_id, posicao FROM fotos_cor WHERE anuncio_id=?", (origem,)).fetchall():
        n.vincular(c, [r["imagem_id"]], destino)
        c.execute("INSERT INTO fotos_cor(anuncio_id,cor,imagem_id,posicao) VALUES(?,?,?,?)",
                  (destino, r["cor"], r["imagem_id"], r["posicao"]))


@app.post("/api/anuncio-copiar")
async def anuncio_copiar(request: Request):
    """Cria copias de um anuncio e/ou aplica as fotos dele em anuncios que ja existem."""
    d = await request.json()
    origem = int(d["id"])
    levar_capa = bool(d.get("capa"))
    with n.con() as c:
        a = c.execute("SELECT * FROM anuncios WHERE id=?", (origem,)).fetchone()
        if not a:
            raise HTTPException(404)
        familia = a["familia"] or a["id"]
        c.execute("UPDATE anuncios SET familia=? WHERE id=?", (familia, origem))
        feitos, novos = [], []
        for destino in [int(x) for x in d.get("destinos", []) if int(x) != origem]:
            if c.execute("SELECT 1 FROM anuncios WHERE id=?", (destino,)).fetchone():
                copiar_fotos(c, origem, destino, levar_capa)  # anuncio que ja existe: so as imagens
                c.execute("UPDATE anuncios SET familia=? WHERE id=?", (familia, destino))
                feitos.append(destino)
        base = re.sub(r"\s+\d{1,3}$", "", a["nome"]).strip()
        numero = 2
        for _ in range(max(0, min(50, int(d.get("novos", 0))))):
            while c.execute("SELECT 1 FROM anuncios WHERE lower(nome)=lower(?)", (f"{base} {numero:02d}",)).fetchone():
                numero += 1
            nome = f"{base} {numero:02d}"
            aid = c.execute("INSERT INTO anuncios(nome,formato,titulo,preco,preco_antigo,descricao,criado_em,demanda_id,"
                            "meta_ia,meta_capa,familia) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                            (nome, a["formato"], a["titulo"] if d.get("titulo") else "", a["preco"], a["preco_antigo"],
                             a["descricao"], n.agora(), a["demanda_id"], a["meta_ia"], a["meta_capa"], familia)).lastrowid
            copiar_fotos(c, origem, aid, levar_capa)
            novos.append(nome)
            numero += 1
    return {"novos": novos, "atualizados": len(feitos)}


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


# Como cada marketplace entende as variacoes de um calcado:
#  Shopee: ate 9 fotos do anuncio (a 1a e a capa). Variacao 1 = Cor, cada cor com a sua capa da variacao
#          (1 foto, aparece quando o cliente toca na cor). Variacao 2 = Tamanho. A Shopee cruza as duas.
#  Mercado Livre: cada cor e uma variacao com as SUAS fotos (ate 10, a 1a e a principal daquela cor).
#          O tamanho e o segundo atributo. O titulo vai ate 60 caracteres.
MODOS = {"shopee": {"nome": "Shopee", "fotos": 9}, "ml": {"nome": "Mercado Livre", "fotos": 10, "titulo": 60}}


def _modo(valor):
    v = str(valor or "").strip().lower()
    if v in ("ml", "mercado livre", "mercadolivre", "meli"):
        return "ml"
    return "shopee"


def _modo_mk(mk, padrao):
    k = str(mk or "").strip().upper()
    if k in ("ML", "MERCADO LIVRE", "MERCADOLIVRE", "MELI"):
        return "ml"
    if k in ("SHP", "SHOPEE"):
        return "shopee"
    return _modo(padrao)


def lista_tamanhos(texto):
    """'33 a 36, 38' -> ['33','34','35','36','38']; aceita virgula, espaco e faixa com 'a' ou '-'."""
    texto = re.sub(r"(\d{1,2})\s*(?:-|a|até|ate)\s*(\d{1,2})\b", r"\1~\2", str(texto or ""), flags=re.I)
    saida = []
    for parte in re.split(r"[,;\s]+", texto):  # 33/34 de chinelo e um tamanho so
        faixa = re.fullmatch(r"(\d{1,2})~(\d{1,2})", parte)
        if faixa and int(faixa[1]) < int(faixa[2]) <= int(faixa[1]) + 20:
            saida += [str(x) for x in range(int(faixa[1]), int(faixa[2]) + 1)]
        elif parte:
            saida.append(parte.replace("~", "-")[:12])
    vistos = set()
    return [t for t in saida if not (t.lower() in vistos or vistos.add(t.lower()))][:40]


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
    por_cor = {}
    for r in c.execute(f"SELECT {CAMPOS_IMG}, f.cor AS nome_cor, f.posicao AS pos_cor FROM fotos_cor f "
                       "JOIN imagens i ON i.id=f.imagem_id WHERE f.anuncio_id=? AND i.status='aprovada' "
                       "AND i.arquivo<>'' ORDER BY f.posicao", (aid,)).fetchall():
        por_cor.setdefault(r["nome_cor"].lower(), []).append(r)
    variacoes = [{"cor": r["nome_cor"], "capa": r, "fotos": por_cor.get(r["nome_cor"].lower(), [])} for r in cores]
    usados |= {r["id"] for v in variacoes for r in v["fotos"]}
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
        "anuncio": dict({k: a[k] for k in ("id", "nome", "formato", "titulo", "preco", "preco_antigo", "descricao")},
                        modo=_modo(a["modo"]), tamanhos=a["tamanhos"] or ""),
        "modo": _modo(a["modo"]),
        "tamanhos": lista_tamanhos(a["tamanhos"]),
        "variacoes": [{"cor": v["cor"], "capa": _img(v["capa"]), "fotos": [_img(r) for r in v["fotos"]]} for v in variacoes],
        "produto": produto,
        "capa": _img(capa) if capa else None,
        "galeria": [_img(r) for r in galeria],
        "cores": [dict(_img(r), nome_cor=r["nome_cor"]) for r in cores],
        "disponiveis": [_img(r) for r in ligadas if r["id"] not in usados],
        "todas": [_img(r) for r in ligadas if ok(r)],
        "sugestoes": [_img(r) for r in sugestoes],
        "linhas": {"capa": capa, "galeria": galeria, "cores": cores, "sugestoes": list(sugestoes), "variacoes": variacoes,
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

        modo = _modo(c.execute("SELECT modo FROM anuncios WHERE id=?", (aid,)).fetchone()[0])
        limite = MODOS["shopee"]["fotos"] - 1  # fotos alem da capa no modo Shopee

        def fotos_da_cor(cor, ids):
            ids = [int(i) if i else None for i in ids[:MODOS["ml"]["fotos"]]]
            for i in ids:
                if i:
                    aprovada(i)
            c.execute("DELETE FROM fotos_cor WHERE anuncio_id=? AND cor=?", (aid, cor))
            for pos, i in enumerate(x for x in ids if x):
                c.execute("INSERT OR REPLACE INTO fotos_cor(anuncio_id,cor,imagem_id,posicao) VALUES(?,?,?,?)",
                          (aid, cor, i, pos))

        def cor_existe(cor):
            r = c.execute("SELECT cor FROM anuncio_cores WHERE anuncio_id=? AND cor=?", (aid, str(cor).strip())).fetchone()
            if not r:
                raise HTTPException(400, f"Este anúncio não tem a cor {cor!r}.")
            return r[0]

        if oque == "dados":
            for campo in ("titulo", "preco", "preco_antigo", "descricao", "tamanhos"):
                if campo in d:
                    c.execute(f"UPDATE anuncios SET {campo}=? WHERE id=?", (str(d[campo]).strip()[:4000], aid))
        elif oque == "modo":
            c.execute("UPDATE anuncios SET modo=? WHERE id=?", (_modo(d.get("modo")), aid))
        elif oque == "capa":
            aprovada(int(d["imagem"]))
            c.execute("UPDATE imagem_anuncio SET papel='' WHERE anuncio_id=? AND papel='capa'", (aid,))
            papel(int(d["imagem"]), "capa")
        elif oque == "foto":
            aprovada(int(d["imagem"]))
            if c.execute("SELECT COUNT(*) FROM imagem_anuncio WHERE anuncio_id=? AND papel='galeria'",
                         (aid,)).fetchone()[0] >= limite:
                raise HTTPException(400, f"As {limite + 1} fotos já estão preenchidas. Tire uma para colocar outra.")
            papel(int(d["imagem"]), "galeria", proxima())
        elif oque == "tirar":
            papel(int(d["imagem"]), "")
        elif oque == "ordenar":
            for pos, iid in enumerate(d["ids"], 1):
                c.execute("UPDATE imagem_anuncio SET posicao=? WHERE imagem_id=? AND anuncio_id=? "
                          "AND papel='galeria'", (pos, int(iid), aid))
        elif oque == "slots":  # as fotos do anuncio: a primeira e a capa, as outras seguem a ordem
            ids = [int(i) if i else None for i in d["ids"][:limite + 1]]
            for i in ids:
                if i:
                    aprovada(i)
            c.execute("UPDATE imagem_anuncio SET papel='', posicao=0 WHERE anuncio_id=? "
                      "AND papel IN ('capa','galeria')", (aid,))
            for pos, i in enumerate(ids):
                if i:
                    papel(i, "capa" if pos == 0 else "galeria", pos)
        elif oque == "cor":  # nova cor, ou troca a capa da variacao de uma cor
            img = aprovada(int(d["imagem"]))
            por_cor(img, d.get("cor", ""))
            nome = (d.get("cor") or img["cor"] or "").strip()
            if nome and not c.execute("SELECT 1 FROM fotos_cor WHERE anuncio_id=? AND cor=?", (aid, nome)).fetchone():
                c.execute("INSERT INTO fotos_cor(anuncio_id,cor,imagem_id,posicao) VALUES(?,?,?,0)", (aid, nome, img["id"]))
        elif oque == "slots_cor":  # Mercado Livre: as fotos de uma cor, a 1a e a principal
            fotos_da_cor(cor_existe(d["cor"]), d.get("ids", []))
        elif oque == "foto_cor":
            cor = cor_existe(d["cor"])
            atuais = [r[0] for r in c.execute("SELECT imagem_id FROM fotos_cor WHERE anuncio_id=? AND cor=? ORDER BY posicao",
                                              (aid, cor))]
            if len(atuais) >= MODOS["ml"]["fotos"]:
                raise HTTPException(400, f"As 10 fotos da cor {cor} já estão preenchidas. Tire uma para colocar outra.")
            fotos_da_cor(cor, atuais + [int(d["imagem"])])
        elif oque == "tirar_foto_cor":
            cor = cor_existe(d["cor"])
            fotos_da_cor(cor, [r[0] for r in c.execute("SELECT imagem_id FROM fotos_cor WHERE anuncio_id=? AND cor=? "
                                                         "AND imagem_id<>? ORDER BY posicao", (aid, cor, int(d["imagem"])))])
        elif oque == "tirar_cor":
            c.execute("DELETE FROM anuncio_cores WHERE anuncio_id=? AND cor=?", (aid, d["cor"]))
            c.execute("DELETE FROM fotos_cor WHERE anuncio_id=? AND cor=?", (aid, d["cor"]))
        elif oque == "renomear_cor":
            novo = str(d.get("novo", "")).strip()
            if novo and novo.lower() != d["cor"].lower():
                if c.execute("SELECT 1 FROM anuncio_cores WHERE anuncio_id=? AND cor=?", (aid, novo)).fetchone():
                    raise HTTPException(400, "Já existe uma cor com esse nome neste anúncio.")
            if novo:
                c.execute("UPDATE anuncio_cores SET cor=? WHERE anuncio_id=? AND cor=?", (novo, aid, d["cor"]))
                c.execute("UPDATE fotos_cor SET cor=? WHERE anuncio_id=? AND cor=?", (novo, aid, d["cor"]))
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
                for pos, r in enumerate(fotos[:limite], 1):
                    usar(r, "galeria", pos)
            if not m["cores"] and formato == "unitario":
                vistas = set()
                capa_ = montagem(c, aid)["linhas"]["capa"]  # a capa do anuncio tambem serve para a cor dela
                for r in sorted(livres + ([capa_] if capa_ else []), key=lambda r: (r["tipo"] != "capa", r["id"])):
                    if r["tipo"] in ("capa", "fb") and r["cor"] and r["cor"].lower() not in vistas:
                        vistas.add(r["cor"].lower())
                        n.vincular(c, [r["id"]], aid)
                        por_cor(r)
            # Mercado Livre: cada cor recebe as suas fotos (principal, fundo branco, IA, informativos, tabela)
            todas = m["linhas"]["resto"] + m["linhas"]["sugestoes"] + m["linhas"]["galeria"] + \
                ([m["linhas"]["capa"]] if m["linhas"]["capa"] else [])
            ordem_cor = {"capa": 0, "fb": 1, "ia": 2, "informativo": 3, "tabela": 4}
            for v in montagem(c, aid)["linhas"]["variacoes"]:
                if v["fotos"]:
                    continue
                cor = v["cor"].lower()
                daqui = [r for r in todas if r["tipo"] in ordem_cor and r["status"] == "aprovada"
                         and ((r["cor"] or "").lower() == cor or (r["tipo"] == "tabela" and not r["cor"]))]
                daqui.sort(key=lambda r: (ordem_cor[r["tipo"]], r["id"]))
                ids, vistos_ = [], set()
                for r in [v["capa"]] + daqui:
                    if r["id"] not in vistos_:
                        vistos_.add(r["id"]); ids.append(r["id"])
                fotos_da_cor(v["cor"], ids)
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


def checagem(c, aid, m=None, modo=None):
    """A lista unica do que falta num anuncio. O pacote e o comando faltas usam esta mesma resposta.
    modo: 'shopee' ou 'ml'; sem modo, vale o modo escolhido no anuncio."""
    a = c.execute("SELECT * FROM anuncios WHERE id=?", (aid,)).fetchone()
    if not a:
        raise HTTPException(404)
    d, metas = _metas(c, a)
    m = m or montagem(c, aid)
    modo = _modo(modo or a["modo"])
    ml = modo == "ml"
    L, produto, kit = m["linhas"], m["produto"], a["formato"] != "unitario"
    V = L["variacoes"]
    fotos_ml = [r for v in V for r in v["fotos"]]
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
    if ml:
        if not V:
            falta("cores", "Falta pelo menos 1 cor (no Mercado Livre cada cor é uma variação com as suas fotos)",
                  esperando=sum(r["tipo"] == "fb" for r in pend))
        for v in V:
            if not v["fotos"]:
                falta("fotos_cor", f"Falta a foto principal da cor {v['cor']} (espaço 1 da cor)", v["cor"])
    elif not L["capa"]:
        falta(tipo_capa, "Falta escolher a capa (espaço 1)", esperando=sum(r["status"] in n.PENDENTES for r in capas))
    nas_fotos = {r["id"] for r in L["galeria"]}
    if kit:
        fb = a["formato"] + "_fb"
        if not any(r["tipo"] == fb for r in L["galeria"] + L["cores"] + fotos_ml):
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
        if ml:  # no Mercado Livre as metas valem dentro das fotos de cada cor
            cores = [v["cor"] for v in V] or cores
        da_cor = {v["cor"].lower(): v["fotos"] for v in V}
        for cor in cores:
            onde = da_cor.get(cor.lower(), []) if ml else L["galeria"]
            nas = {r["id"] for r in onde}
            for tipo, (um, varios) in nomes.items():
                q = metas[tipo] - sum(r["tipo"] == tipo and (ml or (r["cor"] or "").lower() == cor.lower()) for r in onde)
                if q > 0:
                    fora = sum(r["id"] not in nas for r in do_produto(tipo, cor, ("aprovada",)))
                    qtos = 'Falta 1 ' + um if q == 1 else f'Faltam {q} ' + varios
                    falta(tipo, f"{qtos} nas fotos da cor {cor}" if ml else f"{qtos} da cor {cor} nas fotos do anúncio",
                          cor, q, len(do_produto(tipo, cor, n.PENDENTES)), fora)
        por_cor_ = metas["ia"] + metas["informativo"] + metas["tabela"]
        cabe = MODOS["ml"]["fotos"] - 1 if ml else MODOS["shopee"]["fotos"] - 1
        precisa = por_cor_ if ml else len(cores) * por_cor_
        if precisa > cabe:
            falta("limite", (f"As metas pedem {precisa} fotos por cor além da principal, mas o Mercado Livre aceita {cabe}. "
                             "Diminua as metas deste anúncio") if ml else
                  (f"As metas pedem {precisa} fotos além da capa, mas a Shopee aceita {cabe}. "
                   "Diminua as metas, faça um anúncio por cor ou use o modo Mercado Livre, que tem fotos por cor"),
                  faltam=precisa - cabe)
        if not ml:
            com_capa = {r["nome_cor"].lower() for r in L["cores"]} | {(r["cor"] or "").lower() for r in L["cores"]}
            if not L["cores"]:
                falta("cores", "Falta a capa da variação de pelo menos 1 cor (Variação 1: Cor)",
                      esperando=sum(r["tipo"] == "fb" for r in pend))
            else:
                for cor in cores:
                    if cor.lower() not in com_capa:
                        falta("cores", f"Falta a capa da variação da cor {cor}", cor)
    for campo, nome in (("titulo", "o título"), ("preco", "o preço"), ("descricao", "a descrição")):
        if not (a[campo] or "").strip():
            falta(campo, f"Falta preencher {nome}")
    if not m["tamanhos"]:
        falta("tamanhos", "Falta preencher os tamanhos (Variação 2: Tamanho)")
    if ml and len((a["titulo"] or "").strip()) > MODOS["ml"]["titulo"]:
        falta("titulo", f"O título tem {len(a['titulo'].strip())} caracteres; no Mercado Livre o limite é {MODOS['ml']['titulo']}")
    if not ml and len(L["galeria"]) > MODOS["shopee"]["fotos"] - 1:
        falta("limite", f"A Shopee aceita {MODOS['shopee']['fotos']} fotos e este anúncio tem {len(L['galeria']) + 1}: tire "
                        f"{len(L['galeria']) + 1 - MODOS['shopee']['fotos']}", faltam=len(L["galeria"]) + 1 - MODOS["shopee"]["fotos"])
    principal = (V[0]["fotos"][0] if V and V[0]["fotos"] else None) if ml else L["capa"]
    if principal:  # a mesma capa em dois anuncios
        outros = [r[0] for r in c.execute("SELECT an.nome FROM imagem_anuncio x JOIN anuncios an ON an.id=x.anuncio_id "
                                          "WHERE x.imagem_id=? AND x.papel='capa' AND x.anuncio_id<>? UNION "
                                          "SELECT an.nome FROM fotos_cor f JOIN anuncios an ON an.id=f.anuncio_id "
                                          "WHERE f.imagem_id=? AND f.posicao=0 AND f.anuncio_id<>?",
                                          (principal["id"], aid, principal["id"], aid))]
        if outros:
            falta("capa_repetida", f"A capa é a mesma do anúncio {', '.join(outros[:3])}: troque a capa")
    if (a["titulo"] or "").strip():
        iguais = [r[0] for r in c.execute("SELECT nome FROM anuncios WHERE id<>? AND lower(trim(titulo))=lower(trim(?))",
                                          (aid, a["titulo"]))]
        if iguais:
            falta("titulo_repetido", f"O título é igual ao do anúncio {', '.join(iguais[:3])}: troque o título")
    if pend:
        falta("conferencia", f"{len(pend)} imagem(ns) do anúncio ainda em conferência: aprove ou reprove", faltam=len(pend))
    return {"anuncio": a["nome"], "id": aid, "formato": a["formato"], "produto": produto, "tarefa": d["tarefa"] if d else "",
            "modo": modo, "marketplace": MODOS[modo]["nome"], "tamanhos": m["tamanhos"],
            "variacoes": [{"cor": v["cor"], "fotos": len(v["fotos"])} for v in V],
            "completo": not itens, "faltas": itens, "metas": metas,
            "capas_a_produzir": {"meta": metas["capa"], "aprovadas": sum(r["status"] == "aprovada" for r in capas),
                                 "esperando_aprovacao": sum(r["status"] in n.PENDENTES for r in capas)}}


def pacote(aid, mk="", por="você", forcar=False):
    """ZIP do anuncio no jeito do marketplace. So sai se a checagem passar.
    Shopee: 01 = capa ate 09, variacoes/ com a capa de cada cor. Mercado Livre: uma pasta por cor, 01 = principal."""
    with n.con() as c:
        m = montagem(c, aid)
        modo = _modo_mk(mk, m["modo"])
        chk = checagem(c, aid, m, modo)
    L, a = m["linhas"], m["anuncio"]
    ordem = ([L["capa"]] if L["capa"] else []) + L["galeria"]
    if not chk["completo"] and not forcar:
        raise HTTPException(409, {"erro": f"Anúncio incompleto para {MODOS[modo]['nome']}. O pacote NÃO foi montado.",
                                  "faltas": [i["texto"] for i in chk["faltas"]]})
    if not ordem and not L["cores"]:
        raise HTTPException(409, {"erro": "Este anúncio não tem nenhuma imagem aprovada colocada.", "faltas": []})
    prefixo = (_pedaco(mk).lower() + "_" if mk else "") + _pedaco(a["nome"]).lower()
    ext = lambda r: Path(r["arquivo"]).suffix.lower()
    tam = m["tamanhos"]
    mem, nomes = io.BytesIO(), []
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_STORED) as z:
        if modo == "ml":
            for v in L["variacoes"]:
                pasta = _pedaco(v["cor"]).lower()
                for pos, r in enumerate(v["fotos"], 1):
                    nomes.append(f"{pasta}/{prefixo}_{pasta}_{pos:02d}{'_principal' if pos == 1 else ''}{ext(r)}")
                    z.write(n.caminho_imagem(r), nomes[-1])
            variacoes = [f"{v['cor']} / {t}" for v in L["variacoes"] for t in (tam or ["(sem tamanho)"])]
            texto = [f"Anúncio: {a['nome']}", "Marketplace: Mercado Livre", f"Título: {a['titulo']}",
                     f"Preço: {a['preco']}", f"Preço antigo: {a['preco_antigo']}", "",
                     "Variações (Cor x Tamanho). As fotos de cada cor estão na pasta com o nome da cor:",
                     *[f"- {x}" for x in variacoes], "", "Descrição:", a["descricao"]]
        else:
            for pos, r in enumerate(ordem, 1):
                capa = "_capa" if L["capa"] and pos == 1 else ""
                nomes.append(f"{prefixo}_{pos:02d}{capa}{ext(r)}")
                z.write(n.caminho_imagem(r), nomes[-1])
            for r in L["cores"]:
                nomes.append(f"variacoes/{prefixo}_capa_variacao_{_pedaco(r['nome_cor']).lower()}{ext(r)}")
                z.write(n.caminho_imagem(r), nomes[-1])
            texto = [f"Anúncio: {a['nome']}", "Marketplace: Shopee", f"Título: {a['titulo']}", f"Preço: {a['preco']}",
                     f"Preço antigo: {a['preco_antigo']}", "",
                     "Variação 1 - Cor (cada uma com a sua capa na pasta variacoes): " + ", ".join(r["nome_cor"] for r in L["cores"]),
                     "Variação 2 - Tamanho: " + (", ".join(tam) or "(sem tamanho)"),
                     f"Combinações: {len(L['cores'])} cor(es) x {len(tam) or 1} tamanho(s) = {len(L['cores']) * (len(tam) or 1)}",
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


# ------------------------------------- integracao com o sistema do usuario (B2X)
# A chave fica so no banco local (dados/menork.db), nunca no repositorio. Formato do envio: INTEGRACAO.md
def integ():
    return {"nome": n.ajuste("integ_nome") or "B2X", "url": (n.ajuste("integ_url") or "").rstrip("/"),
            "chave": n.ajuste("integ_chave") or "", "rascunho": (n.ajuste("integ_rascunho") or "1") == "1"}


def _chamar(metodo, url, chave, corpo=None, tipo=None, timeout=60):
    import urllib.error
    import urllib.request
    cab = {"Authorization": f"Bearer {chave}", "User-Agent": "site-imagens-menork", "Accept": "application/json"}
    if tipo:
        cab["Content-Type"] = tipo
    req = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        raise HTTPException(502, f"Não consegui falar com o {integ()['nome']}: {e}")


def _multipart(dados, arquivos):
    limite = "menork" + secrets.token_hex(12)
    partes = io.BytesIO()
    escrever = lambda t: partes.write(t.encode("utf-8"))
    escrever(f'--{limite}\r\nContent-Disposition: form-data; name="dados"\r\n'
             f'Content-Type: application/json; charset=utf-8\r\n\r\n')
    escrever(json.dumps(dados, ensure_ascii=False))
    escrever("\r\n")
    for nome, caminho in arquivos:
        tipo = {".png": "image/png", ".webp": "image/webp"}.get(Path(nome).suffix.lower(), "image/jpeg")
        escrever(f'--{limite}\r\nContent-Disposition: form-data; name="arquivos"; filename="{nome}"\r\n'
                 f"Content-Type: {tipo}\r\n\r\n")
        partes.write(Path(caminho).read_bytes())
        escrever("\r\n")
    escrever(f"--{limite}--\r\n")
    return partes.getvalue(), f"multipart/form-data; boundary={limite}"


@app.get("/api/integracao")
def integracao_ver():
    i = integ()
    return {"nome": i["nome"], "url": i["url"], "tem_chave": bool(i["chave"]), "rascunho": i["rascunho"]}


@app.post("/api/integracao")
async def integracao_salvar(request: Request):
    d = await request.json()
    url = str(d.get("url", "")).strip().rstrip("/")
    if url and not re.match(r"^https?://", url):
        raise HTTPException(400, "O endereço precisa começar com https:// (ou http://).")
    n.gravar_ajuste("integ_nome", (str(d.get("nome", "")).strip() or "B2X")[:30])
    n.gravar_ajuste("integ_url", url)
    n.gravar_ajuste("integ_rascunho", "1" if d.get("rascunho", True) else "0")
    if str(d.get("chave", "")).strip():
        n.gravar_ajuste("integ_chave", str(d["chave"]).strip())
    if d.get("apagar_chave"):
        n.gravar_ajuste("integ_chave", "")
    return integracao_ver()


@app.post("/api/integracao/testar")
def integracao_testar():
    i = integ()
    if not i["url"] or not i["chave"]:
        raise HTTPException(400, "Preencha o endereço e a chave e salve antes de testar.")
    status, texto = _chamar("GET", i["url"] + "/menork/ping", i["chave"], timeout=20)
    if 200 <= status < 300:
        try:
            json.loads(texto or "{}")
        except ValueError:
            return {"ok": False, "msg": f"O endereço respondeu uma página do site, e não a API do {i['nome']}. "
                                        "Confira o Endereço da API (não é o endereço do painel)."}
        return {"ok": True, "msg": f"Conexão com o {i['nome']} funcionando."}
    dica = {401: "a chave foi recusada", 403: "a chave não tem permissão", 404: "o endereço /menork/ping não existe lá"}
    return {"ok": False, "msg": f"O {i['nome']} respondeu {status}: {dica.get(status, texto[:160] or 'erro')}."}


def enviar_anuncio(aid, por="você", forcar=False):
    i = integ()
    if not i["url"] or not i["chave"]:
        raise HTTPException(400, f"Configure o {i['nome']} em Integrações antes de enviar.")
    with n.con() as c:
        m = montagem(c, aid)
        chk = checagem(c, aid, m)
        dem = c.execute("SELECT * FROM demandas WHERE id=(SELECT demanda_id FROM anuncios WHERE id=?)", (aid,)).fetchone()
        id_externo = c.execute("SELECT id_externo FROM anuncios WHERE id=?", (aid,)).fetchone()[0] or ""
    if not chk["completo"] and not forcar:
        raise HTTPException(409, {"erro": f"Anúncio incompleto. Nada foi enviado ao {i['nome']}.",
                                  "faltas": [x["texto"] for x in chk["faltas"]]})
    L, a = m["linhas"], m["anuncio"]
    ordem = ([L["capa"]] if L["capa"] else []) + L["galeria"]
    arquivos, fotos, cores = [], [], []
    for pos, r in enumerate(ordem, 1):
        nome = f"{pos:02d}{'_capa' if L['capa'] and pos == 1 else ''}{Path(r['arquivo']).suffix.lower()}"
        arquivos.append((nome, n.caminho_imagem(r)))
        fotos.append({"posicao": pos, "capa": bool(L["capa"]) and pos == 1, "arquivo": nome, "tipo": r["tipo"], "cor": r["cor"]})
    for r in L["cores"]:
        nome = f"cor_{_pedaco(r['nome_cor']).lower()}{Path(r['arquivo']).suffix.lower()}"
        arquivos.append((nome, n.caminho_imagem(r)))
        cores.append({"nome": r["nome_cor"], "arquivo": nome})
    dados = {"versao": 1, "origem": "site-imagens-menork", "id_menork": aid, "id_externo": id_externo,
             "rascunho": i["rascunho"], "nome": a["nome"], "formato": a["formato"], "produto": m["produto"],
             "titulo": a["titulo"], "preco": a["preco"], "preco_antigo": a["preco_antigo"], "descricao": a["descricao"],
             "marketplaces": json.loads(dem["marketplaces"] or "[]") if dem else [],
             "tarefa_clickup": dem["url"] if dem else "", "completo": chk["completo"], "fotos": fotos, "cores": cores}
    corpo, tipo = _multipart(dados, arquivos)
    status, texto = _chamar("POST", i["url"] + "/menork/anuncios", i["chave"], corpo, tipo, timeout=180)
    try:
        resp = json.loads(texto) if texto else {}
    except ValueError:
        resp = {}
    ok = 200 <= status < 300
    novo_id = str(resp.get("id") or resp.get("id_externo") or "") if ok else ""
    with n.con() as c:
        if novo_id:
            c.execute("UPDATE anuncios SET id_externo=? WHERE id=?", (novo_id, aid))
        c.execute("INSERT INTO envios(anuncio_id,quando,por,ok,resposta,id_externo) VALUES(?,?,?,?,?,?)",
                  (aid, n.agora(), por, int(ok), (texto or "")[:500], novo_id or id_externo))
    if not ok:
        raise HTTPException(502, f"O {i['nome']} recusou o envio ({status}): {texto[:200]}")
    acao = "atualizado" if id_externo else "criado"
    return {"ok": True, "id_externo": novo_id or id_externo,
            "msg": f"Anúncio {acao} no {i['nome']}" + (" como rascunho" if i["rascunho"] else "") + "."}


@app.post("/api/anuncios/{aid}/enviar")
async def enviar(aid: int, request: Request):
    d = await request.json()
    return enviar_anuncio(aid, "você", bool(d.get("forcar")))


# ------------------------------------- lojas dos clientes (lidas do sistema do usuario)
def _ler_sistema(caminho):
    i = integ()
    if not i["url"] or not i["chave"]:
        raise HTTPException(400, f"Configure o {i['nome']} em Integrações para ver as lojas dos clientes.")
    status, texto = _chamar("GET", i["url"] + caminho, i["chave"], timeout=40)
    if status == 404:
        raise HTTPException(502, f"O {i['nome']} ainda não tem o endereço {caminho.split('?')[0]}. Veja o INTEGRACAO.md.")
    if status in (401, 403):
        raise HTTPException(502, f"O {i['nome']} recusou a chave ({status}).")
    if not 200 <= status < 300:
        raise HTTPException(502, f"O {i['nome']} respondeu {status}: {texto[:160]}")
    try:
        return json.loads(texto)
    except ValueError:
        raise HTTPException(502, f"O endereço {i['url']} respondeu uma página do site, e não a API do {i['nome']}. "
                                 "Confira o Endereço da API em Integrações: ele não é o endereço do painel.")


def _txt(v, limite=200):
    return str(v if v is not None else "").strip()[:limite]


def _link(v):
    v = _txt(v, 600)
    return v if re.match(r"^https?://", v) else ""


@app.get("/api/lojas")
def lojas():
    d = _ler_sistema("/menork/clientes")
    clientes = []
    for cl in (d.get("clientes") or [])[:500]:
        lojas_ = [{"id": _txt(l.get("id"), 80), "nome": _txt(l.get("nome")), "marketplace": _txt(l.get("marketplace"), 20).upper(),
                   "url": _link(l.get("url")), "anuncios": l.get("anuncios") if isinstance(l.get("anuncios"), int) else None}
                  for l in (cl.get("lojas") or [])[:100] if _txt(l.get("id"))]
        clientes.append({"id": _txt(cl.get("id"), 80), "nome": _txt(cl.get("nome")), "lojas": lojas_})
    return {"sistema": integ()["nome"], "clientes": clientes}


@app.get("/api/lojas/{loja}/anuncios")
def lojas_anuncios(loja: str, pagina: int = 1, busca: str = ""):
    import urllib.parse
    q = urllib.parse.urlencode({"pagina": max(1, pagina), "por_pagina": 48, "busca": busca.strip()[:100]})
    d = _ler_sistema(f"/menork/lojas/{urllib.parse.quote(loja, safe='')}/anuncios?{q}")
    def num(v):
        return v if isinstance(v, (int, float)) else None
    anuncios = [{"id": _txt(a.get("id"), 80), "titulo": _txt(a.get("titulo"), 300), "preco": _txt(a.get("preco"), 30),
                 "status": _txt(a.get("status"), 30), "foto": _link(a.get("foto")), "link": _link(a.get("link")),
                 "vendas": num(a.get("vendas")), "estoque": num(a.get("estoque"))}
                for a in (d.get("anuncios") or [])[:200]]
    return {"anuncios": anuncios, "total": d.get("total") if isinstance(d.get("total"), int) else len(anuncios),
            "pagina": max(1, pagina)}


@app.post("/bot/enviar-sistema")
async def bot_enviar_sistema(request: Request):
    d = await request.json()
    with n.con() as c:
        aid = _anuncio_por_nome(c, str(d.get("anuncio", "")))
    return enviar_anuncio(aid, (str(d.get("bot", "")) or "bot").strip())  # bot nao pode forcar envio incompleto


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
                      (" ".join(str(q.get("motivo") or "Sem motivo").split())[:200], (q.get("bot") or "bot").strip(), n.agora(), time.time(), iid))
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
def bot_referencias(tipo: str = "", produto: str = "", estilo: str = "", max: int = 5):
    q, args = "SELECT * FROM imagens WHERE ref=1 AND status='aprovada' AND arquivo<>''", []
    if tipo:
        q += " AND tipo LIKE ?"
        args.append(tipo + "%" if tipo == "capa" else tipo)
    if estilo.strip():
        q += " AND lower(estilo)=lower(?)"
        args.append(" ".join(estilo.split()))
    with n.con() as c:
        linhas = c.execute(q + " ORDER BY (produto=?) DESC, id DESC", [*args, produto.strip().upper()]).fetchall()
    linhas = linhas[: min(5, max)]
    arquivos = [{"id": l["id"], "tipo": l["tipo"], "estilo": l["estilo"] or "", "produto": l["produto"], "cor": l["cor"],
                 "caminho": str(n.caminho_imagem(l))} for l in linhas]
    with n.con() as c:
        estilos = [r[0] for r in c.execute("SELECT DISTINCT estilo FROM imagens WHERE ref=1 AND status='aprovada' "
                                           "AND estilo<>'' ORDER BY 1")]
    return {"arquivos": arquivos, "estilos_existentes": estilos,
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
                if len(nas_fotos) < MODOS["shopee"]["fotos"] - 1 and ja < metas[r["tipo"]]:  # so ate a meta da cor, e enquanto couber
                    c.execute("UPDATE imagem_anuncio SET papel='galeria', posicao=? WHERE imagem_id=? AND anuncio_id=?",
                              (max((f["posicao"] for f in nas_fotos), default=0) + 1, r["id"], r["anuncio_id"]))
                # Mercado Livre: entra tambem nas fotos da cor dela, se a cor ja existe no anuncio
                da_cor = c.execute("SELECT i.tipo, f.posicao, f.imagem_id FROM fotos_cor f JOIN imagens i ON i.id=f.imagem_id "
                                   "WHERE f.anuncio_id=? AND f.cor=? ORDER BY f.posicao", (r["anuncio_id"], r["cor"])).fetchall()
                if r["cor"] and da_cor and len(da_cor) < MODOS["ml"]["fotos"] and r["id"] not in {f["imagem_id"] for f in da_cor} \
                        and sum(f["tipo"] == r["tipo"] for f in da_cor) < metas[r["tipo"]]:
                    c.execute("INSERT OR IGNORE INTO fotos_cor(anuncio_id,cor,imagem_id,posicao) VALUES(?,"
                              "(SELECT cor FROM anuncio_cores WHERE anuncio_id=? AND cor=?),?,?)",
                              (r["anuncio_id"], r["anuncio_id"], r["cor"], r["id"], da_cor[-1]["posicao"] + 1))
        elif oque == "reprovar":
            c.execute(f"UPDATE imagens SET status='reprovada', decidido_em=?, apagar_em=?, motivo=?, "
                      f"origem_decisao='você' WHERE id IN ({marcas})",
                      [n.agora(), time.time() + int(n.CFG["segundos_para_desfazer"]),
                       " ".join(str(d.get("motivo") or "Sem motivo").split())[:200], *ids])
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
        elif oque in ("ref_sim", "ref_nao"):
            c.execute(f"UPDATE imagens SET ref=? WHERE id IN ({marcas}) AND status='aprovada'",
                      [1 if oque == "ref_sim" else 0, *ids])
        elif oque == "estilo":
            estilo = " ".join(str(d.get("estilo", "")).split())[:40]
            estilo = estilo[:1].upper() + estilo[1:]
            c.execute(f"UPDATE imagens SET estilo=? WHERE id IN ({marcas})", [estilo, *ids])
        elif oque == "desvincular":
            c.execute(f"DELETE FROM imagem_anuncio WHERE anuncio_id=? AND imagem_id IN ({marcas})",
                      [int(d["anuncio_id"]), *ids])
            c.execute(f"DELETE FROM anuncio_cores WHERE anuncio_id=? AND imagem_id IN ({marcas})",
                      [int(d["anuncio_id"]), *ids])
            c.execute(f"DELETE FROM fotos_cor WHERE anuncio_id=? AND imagem_id IN ({marcas})",
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
