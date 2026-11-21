"""Aba ClickUp dentro do site: ver os espacos, pastas e listas do workspace, o quadro por status
e mexer nas tarefas (mudar status, comentar, criar). Nunca apaga nada.

Usa a mesma chave do ClickUp que o site ja usa para as demandas (clickup_token no config.json).
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException, Request

from . import nucleo as n

rota = APIRouter()
API = "https://api.clickup.com/api/v2"
_cache = {}


def _token():
    t = str(n.ajuste("clickup_chave", "") or n.CFG.get("clickup_token") or "").strip()
    if not t:
        raise HTTPException(400, "SEM_CHAVE")
    return t


@rota.get("/api/clickup/chave")
def chave_estado():
    return {"tem": bool(str(n.ajuste("clickup_chave", "") or n.CFG.get("clickup_token") or "").strip())}


@rota.post("/api/clickup/chave")
async def chave_salvar(request: Request):
    """Guarda a chave pessoal do ClickUp so no banco local (nunca no repositorio nem no /api/estado) e testa."""
    d = await request.json()
    t = str(d.get("chave") or "").strip()
    if len(t) < 20 or " " in t:
        raise HTTPException(400, "Isso não parece um token do ClickUp. Copie o token inteiro que o ClickUp mostrou (em geral começa com pk_).")
    antiga = n.ajuste("clickup_chave", "")
    n.gravar_ajuste("clickup_chave", t)
    _cache.clear()
    try:
        u = _chamar("GET", "/user").get("user") or {}
    except HTTPException:
        n.gravar_ajuste("clickup_chave", antiga or "")
        raise
    return {"ok": True, "usuario": u.get("username") or u.get("email") or ""}


def _chamar(metodo, caminho, corpo=None, timeout=40):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(API + caminho, data=dados, method=metodo, headers={
        "Authorization": _token(), "Accept": "application/json", "User-Agent": "site-imagens-menork",
        **({"Content-Type": "application/json"} if dados is not None else {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode() or "{}").get("err") or ""
        except ValueError:
            msg = ""
        if e.code in (401, 403):
            raise HTTPException(400, "O ClickUp recusou a chave (clickup_token). Confira a chave no config.json.")
        if e.code == 429:
            raise HTTPException(429, "O ClickUp pediu para esperar um pouco (muitas chamadas). Tente em 1 minuto.")
        raise HTTPException(502, f"O ClickUp respondeu {e.code}{': ' + msg if msg else ''}")
    except Exception as e:  # sem internet etc.
        raise HTTPException(502, f"Não consegui falar com o ClickUp: {e}")


def _guardado(chave, segundos, fazer):
    agora = time.time()
    if chave in _cache and agora - _cache[chave][0] < segundos:
        return _cache[chave][1]
    v = fazer()
    _cache[chave] = (agora, v)
    return v


def _lista_curta(l):
    return {"id": l["id"], "nome": l.get("name", ""), "tarefas": l.get("task_count")}


@rota.get("/api/clickup/arvore")
def arvore(atualizar: int = 0):
    """Workspaces > espacos > pastas > listas (e listas soltas no espaco)."""
    if atualizar:
        _cache.pop("arvore", None)

    def fazer():
        saida = []
        for t in _chamar("GET", "/team").get("teams") or []:
            espacos = []
            for s in _chamar("GET", f"/team/{t['id']}/space?archived=false").get("spaces") or []:
                pastas = [{"id": f["id"], "nome": f.get("name", ""), "listas": [_lista_curta(l) for l in f.get("lists") or []]}
                          for f in _chamar("GET", f"/space/{s['id']}/folder?archived=false").get("folders") or []]
                soltas = [_lista_curta(l) for l in _chamar("GET", f"/space/{s['id']}/list?archived=false").get("lists") or []]
                espacos.append({"id": s["id"], "nome": s.get("name", ""), "cor": s.get("color") or "", "pastas": pastas, "listas": soltas})
            saida.append({"id": t["id"], "nome": t.get("name", ""), "espacos": espacos})
        return {"workspaces": saida}
    return _guardado("arvore", 300, fazer)


def _tarefa_curta(t):
    st = t.get("status") or {}
    return {"id": t["id"], "nome": t.get("name", ""), "status": st.get("status", ""), "cor": st.get("color") or "#87909e",
            "responsaveis": [{"nome": a.get("username") or a.get("email") or "", "iniciais": a.get("initials") or "",
                              "cor": a.get("color") or "#555", "foto": a.get("profilePicture") or ""} for a in t.get("assignees") or []],
            "prazo": t.get("due_date"), "prioridade": (t.get("priority") or {}).get("priority") if t.get("priority") else None,
            "etiquetas": [{"nome": g.get("name", ""), "cor": g.get("tag_bg") or "#444"} for g in t.get("tags") or []],
            "url": t.get("url", ""), "atualizada": t.get("date_updated"), "pai": t.get("parent"),
            "subtarefas": len(t.get("subtasks") or [])}


def _campos_def(lid):
    """Campos personalizados da lista: id -> {nome, tipo, opcoes{id/orderindex: (nome, cor)}}."""
    defs = {}
    for f in _chamar("GET", f"/list/{urllib.parse.quote(lid)}/field").get("fields") or []:
        ops = {}
        for o in (f.get("type_config") or {}).get("options") or []:
            v = (o.get("name") or o.get("label") or "", o.get("color") or "#555")
            ops[str(o.get("id"))] = v
            if o.get("orderindex") is not None:
                ops["#" + str(o.get("orderindex"))] = v
        defs[f["id"]] = {"nome": f.get("name", ""), "tipo": f.get("type", ""), "opcoes": ops}
    return defs


NOMES_COLUNA = {"priority": "Prioridade", "status": "Status", "assignee": "Responsável", "dueDate": "Prazo",
                "dateUpdated": "Data de atualização", "dateCreated": "Criado", "tag": "Etiquetas", "startDate": "Início"}


def _colunas_da_visao(lid, defs):
    """As colunas visíveis da visão Lista do próprio ClickUp (a mesma ordem que o Menork usa lá)."""
    try:
        r = _chamar("GET", f"/list/{urllib.parse.quote(lid)}/view")
        # a visao "Lista" padrao do ClickUp vem em required_views, nao em views
        views = list(r.get("views") or []) + [v for v in (r.get("required_views") or {}).values() if isinstance(v, dict)]
    except HTTPException:
        views = []
    v = next((x for x in views if x.get("type") == "list" and str(x.get("name", "")).lower() == "lista"), None) \
        or next((x for x in views if x.get("type") == "list"), None)
    campos = ((v or {}).get("columns") or {}).get("fields") or []
    cols = []
    for c in campos:
        if c.get("hidden"):
            continue
        f = str(c.get("field") or "")
        if f in ("name",):
            continue
        if f.startswith("cf_"):
            d = defs.get(f[3:])
            if d:
                cols.append({"chave": f, "nome": c.get("name") or d["nome"], "tipo": d["tipo"], "largura": c.get("width")})
        elif f in NOMES_COLUNA:
            cols.append({"chave": f, "nome": c.get("name") or NOMES_COLUNA[f], "tipo": f, "largura": c.get("width")})
    if not cols:  # sem visao lida: prioridade, status, todos os campos da lista e a data de atualizacao
        cols = [{"chave": k, "nome": NOMES_COLUNA[k], "tipo": k} for k in ("priority", "status")] + \
               [{"chave": "cf_" + i, "nome": d["nome"], "tipo": d["tipo"]} for i, d in defs.items()] + \
               [{"chave": "dateUpdated", "nome": NOMES_COLUNA["dateUpdated"], "tipo": "dateUpdated"}]
    return cols, bool(((v or {}).get("settings") or {}).get("show_closed") or ((v or {}).get("filters") or {}).get("show_closed"))


def _valor_campo(f, d):
    """Valor de um campo personalizado pronto para a tela: lista de {texto, cor}."""
    val = f.get("value")
    if val in (None, "", []):
        return []
    tipo = f.get("type") or (d or {}).get("tipo")
    ops = (d or {}).get("opcoes") or {}
    if tipo == "drop_down":
        o = ops.get(str(val)) or ops.get("#" + str(val))
        return [{"texto": o[0], "cor": o[1]}] if o else [{"texto": str(val), "cor": ""}]
    if tipo == "labels":
        return [{"texto": ops[str(x)][0], "cor": ops[str(x)][1]} if str(x) in ops else {"texto": str(x), "cor": ""} for x in val]
    if tipo == "date":
        try:
            return [{"texto": time.strftime("%d/%m/%Y", time.localtime(int(val) / 1000)), "cor": ""}]
        except (TypeError, ValueError):
            return []
    if tipo == "checkbox":
        return [{"texto": "✓" if str(val).lower() in ("true", "1") else "", "cor": ""}]
    if tipo in ("users", "people"):
        return [{"texto": x.get("username", ""), "cor": ""} for x in val if isinstance(x, dict)]
    if isinstance(val, (dict, list)):
        return [{"texto": json.dumps(val, ensure_ascii=False)[:80], "cor": ""}]
    return [{"texto": str(val), "cor": ""}]


@rota.get("/api/clickup/lista/{lid}")
def lista(lid: str, fechadas: int = 1):
    info = _chamar("GET", f"/list/{urllib.parse.quote(lid)}")
    try:
        defs = _guardado(f"campos:{lid}", 300, lambda: _campos_def(lid))
    except HTTPException:
        defs = {}
    colunas, fech_visao = _guardado(f"colunas:{lid}", 300, lambda: _colunas_da_visao(lid, defs))
    tarefas, pagina = [], 0
    while pagina < 6:
        r = _chamar("GET", f"/list/{urllib.parse.quote(lid)}/task?page={pagina}&subtasks=true&include_closed={'true' if fechadas else 'false'}")
        for t in r.get("tasks") or []:
            x = _tarefa_curta(t)
            x["campos"] = {"cf_" + f["id"]: _valor_campo(f, defs.get(f["id"])) for f in t.get("custom_fields") or [] if f.get("value") not in (None, "", [])}
            x["criada"] = t.get("date_created")
            tarefas.append(x)
        if r.get("last_page", True) or not r.get("tasks"):
            break
        pagina += 1
    status = [{"nome": s.get("status", ""), "cor": s.get("color") or "#87909e", "tipo": s.get("type", "")}
              for s in sorted(info.get("statuses") or [], key=lambda s: s.get("orderindex", 0))]
    return {"id": lid, "nome": info.get("name", ""), "status": status, "tarefas": tarefas, "colunas": colunas, "fechadas_visao": fech_visao,
            "pasta": (info.get("folder") or {}).get("name", ""), "espaco": (info.get("space") or {}).get("name", "")}


@rota.get("/api/clickup/tarefa/{tid}")
def tarefa(tid: str):
    t = _chamar("GET", f"/task/{urllib.parse.quote(tid)}?include_markdown_description=true")
    c = _chamar("GET", f"/task/{urllib.parse.quote(tid)}/comment").get("comments") or []
    saida = _tarefa_curta(t)
    saida.update(descricao=t.get("markdown_description") or t.get("text_content") or t.get("description") or "",
                 lista=(t.get("list") or {}).get("id", ""), criada=t.get("date_created"),
                 campos=[{"nome": f.get("name", ""), "valores": _valor_campo(f, None if f.get("type") not in ("drop_down", "labels") else
                         {"tipo": f.get("type"), "opcoes": {**{str(o.get("id")): (o.get("name") or o.get("label") or "", o.get("color") or "#555") for o in (f.get("type_config") or {}).get("options") or []},
                                                           **{"#" + str(o.get("orderindex")): (o.get("name") or o.get("label") or "", o.get("color") or "#555") for o in (f.get("type_config") or {}).get("options") or []}}})}
                        for f in t.get("custom_fields") or [] if f.get("value") not in (None, "", [])][:30],
                 comentarios=[{"texto": x.get("comment_text", ""), "quem": (x.get("user") or {}).get("username", ""),
                               "quando": x.get("date")} for x in c[:50]])
    return saida


@rota.post("/api/clickup/tarefa/{tid}/status")
async def mudar_status(tid: str, request: Request):
    d = await request.json()
    st = str(d.get("status") or "").strip()
    if not st:
        raise HTTPException(400, "Escolha o status.")
    t = _chamar("PUT", f"/task/{urllib.parse.quote(tid)}", {"status": st})
    n.registrar(f"ClickUp: tarefa {t.get('name', tid)} foi para {st}")
    return _tarefa_curta(t)


@rota.post("/api/clickup/tarefa/{tid}/comentario")
async def comentar(tid: str, request: Request):
    d = await request.json()
    texto = str(d.get("texto") or "").strip()
    if not texto:
        raise HTTPException(400, "Escreva o comentário.")
    _chamar("POST", f"/task/{urllib.parse.quote(tid)}/comment", {"comment_text": texto[:5000], "notify_all": False})
    n.registrar(f"ClickUp: comentário na tarefa {tid}")
    return {"ok": True}


@rota.post("/api/clickup/lista/{lid}/tarefa")
async def criar_tarefa(lid: str, request: Request):
    d = await request.json()
    nome = str(d.get("nome") or "").strip()
    if not nome:
        raise HTTPException(400, "Dê um nome para a tarefa.")
    corpo = {"name": nome[:300], "description": str(d.get("descricao") or "")[:10000]}
    if d.get("status"):
        corpo["status"] = str(d["status"])
    t = _chamar("POST", f"/list/{urllib.parse.quote(lid)}/task", corpo)
    n.registrar(f"ClickUp: tarefa nova {nome}")
    return _tarefa_curta(t)
