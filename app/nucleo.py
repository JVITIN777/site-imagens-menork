"""Nucleo do site de imagens Menork: configuracao, banco, leitor da pasta de entrada."""
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import threading
import time
import traceback
import unicodedata
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(os.environ.get("MENORK_CONFIG", BASE / "config.json"))

PADRAO = {
    "pasta_entrada": "",
    "pasta_repositorio": "",
    "pasta_dados": "",
    "modo_entrada": "copiar",
    "apagar_original_ao_reprovar": True,
    "importar_a_partir_de": "",
    "pastas_ignoradas": ["REPROVADAS"],
    "host": "127.0.0.1",
    "porta": 8765,
    "intervalo_segundos": 10,
    "segundos_para_desfazer": 60,
    "backups_guardados": 14,
    "clickup_token": "",
    "clickup_lista": "",
    "atualizar_repo": "JVITIN777/site-imagens-menork",
    "atualizar_ramo": "main",
    "atualizar_sozinho": True,
    "atualizar_a_cada_horas": 6,
    "atualizar_endereco": "",
    "chave_bots": "",
}

EXTENSOES = {".png", ".jpg", ".jpeg", ".webp"}

TIPOS = [
    ("fb", "Fundo branco"),
    ("kit2_fb", "Kit 2 fundo branco"),
    ("kit3_fb", "Kit 3 fundo branco"),
    ("kit4_fb", "Kit 4 fundo branco"),
    ("ia", "Foto IA"),
    ("informativo", "Informativo"),
    ("tabela", "Tabela de medidas"),
    ("capa", "Capa"),
    ("capa_kit2", "Capa kit 2"),
    ("capa_kit3", "Capa kit 3"),
    ("capa_kit4", "Capa kit 4"),
    ("cena", "Cena real"),
]
TIPO_NOME = dict(TIPOS)
TIPOS_CAPA = ("capa", "capa_kit2", "capa_kit3", "capa_kit4")
PASTA_ZIP = {
    "fb": "FB", "kit2_fb": "FB", "kit3_fb": "FB", "kit4_fb": "FB", "ia": "IA",
    "informativo": "Informativo", "tabela": "Tabela",
    "capa": "Capa", "capa_kit2": "Capa", "capa_kit3": "Capa", "capa_kit4": "Capa",
}
STATUS_NOME = {
    "gerada": "Gerada (falta classificar)",
    "conferencia": "Em conferência",
    "aprovada": "Aprovada",
    "reprovada": "Reprovada / apagada",
}
PENDENTES = ("gerada", "conferencia")

estado = {"ultima_leitura": None, "erro": "", "importadas": 0}
_trava = threading.Lock()


# ---------------------------------------------------------------- configuracao
def carregar_config():
    cfg = dict(PADRAO)
    exemplo = CONFIG_PATH.with_name("config.exemplo.json")
    if not CONFIG_PATH.exists() and exemplo.exists():  # primeira vez: cria o config.json a partir do exemplo
        shutil.copyfile(exemplo, CONFIG_PATH)
    if CONFIG_PATH.exists():
        cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig")))
    return cfg


CFG = carregar_config()


def pasta_dados():
    p = Path(CFG["pasta_dados"]) if CFG["pasta_dados"] else BASE / "dados"
    p.mkdir(parents=True, exist_ok=True)
    return p


def pasta_repo():
    return Path(CFG["pasta_repositorio"]) if CFG["pasta_repositorio"] else BASE / "repositorio"


def pasta_miniaturas():
    p = pasta_dados() / "miniaturas"
    p.mkdir(parents=True, exist_ok=True)
    return p


def registrar(msg):
    linha = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n"
    try:
        with open(pasta_dados() / "site.log", "a", encoding="utf-8") as f:
            f.write(linha)
    except OSError:
        pass


def agora():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ----------------------------------------------------------------------- banco
def con():
    c = sqlite3.connect(pasta_dados() / "menork.db", timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def iniciar_banco():
    with con() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS imagens(
              id INTEGER PRIMARY KEY, sha256 TEXT UNIQUE, arquivo TEXT, nome_original TEXT,
              origem TEXT, produto TEXT DEFAULT '', cor TEXT DEFAULT '', tipo TEXT DEFAULT '',
              status TEXT, largura INTEGER, altura INTEGER, bytes INTEGER,
              criado_em TEXT, decidido_em TEXT, apagar_em REAL);
            CREATE INDEX IF NOT EXISTS i_status ON imagens(status);
            CREATE TABLE IF NOT EXISTS anuncios(
              id INTEGER PRIMARY KEY, nome TEXT UNIQUE COLLATE NOCASE, formato TEXT DEFAULT 'unitario',
              obs TEXT DEFAULT '', criado_em TEXT);
            CREATE TABLE IF NOT EXISTS imagem_anuncio(
              imagem_id INTEGER REFERENCES imagens(id) ON DELETE CASCADE,
              anuncio_id INTEGER REFERENCES anuncios(id) ON DELETE CASCADE,
              criado_em TEXT, PRIMARY KEY(imagem_id, anuncio_id));
            CREATE TABLE IF NOT EXISTS anuncio_cores(
              anuncio_id INTEGER REFERENCES anuncios(id) ON DELETE CASCADE,
              cor TEXT COLLATE NOCASE, imagem_id INTEGER REFERENCES imagens(id) ON DELETE CASCADE,
              posicao INTEGER DEFAULT 0, PRIMARY KEY(anuncio_id, cor));
            CREATE TABLE IF NOT EXISTS vistos(caminho TEXT PRIMARY KEY, tamanho INTEGER, mtime REAL);
            CREATE TABLE IF NOT EXISTS demandas(
              id INTEGER PRIMARY KEY, tarefa_id TEXT UNIQUE, tarefa TEXT, produto TEXT, info TEXT DEFAULT '',
              pasta TEXT DEFAULT '', marketplaces TEXT DEFAULT '[]', status TEXT DEFAULT '', metas TEXT DEFAULT '{}',
              url TEXT DEFAULT '', criado_em TEXT);
            CREATE TABLE IF NOT EXISTS pacotes(
              id INTEGER PRIMARY KEY, anuncio_id INTEGER REFERENCES anuncios(id) ON DELETE CASCADE,
              marketplace TEXT DEFAULT '', criado_em TEXT, por TEXT DEFAULT '', status TEXT DEFAULT 'completo',
              arquivos TEXT DEFAULT '[]', zip TEXT DEFAULT '');
            CREATE TABLE IF NOT EXISTS pedidos(
              id INTEGER PRIMARY KEY, anuncio_id INTEGER REFERENCES anuncios(id) ON DELETE CASCADE,
              criado_em TEXT, texto TEXT, status TEXT DEFAULT 'aberto', bot TEXT DEFAULT '', atualizado TEXT);
            CREATE TABLE IF NOT EXISTS medidas(produto TEXT, pos INTEGER, numero TEXT, cm TEXT);
            CREATE TABLE IF NOT EXISTS bots(nome TEXT PRIMARY KEY COLLATE NOCASE, status TEXT, detalhe TEXT, atualizado TEXT);
            CREATE TABLE IF NOT EXISTS contas(nome TEXT PRIMARY KEY COLLATE NOCASE, limite TEXT DEFAULT '', atualizado TEXT);
            CREATE TABLE IF NOT EXISTS ajustes(chave TEXT PRIMARY KEY, valor TEXT);
            """
        )
        novas = {"anuncios": [("titulo", "TEXT DEFAULT ''"), ("preco", "TEXT DEFAULT ''"),
                              ("preco_antigo", "TEXT DEFAULT ''"), ("descricao", "TEXT DEFAULT ''")],
                 "imagem_anuncio": [("papel", "TEXT DEFAULT ''"), ("posicao", "INTEGER DEFAULT 0")]}
        novas["anuncios"] += [("demanda_id", "INTEGER"), ("meta_ia", "INTEGER"), ("meta_capa", "INTEGER")]
        novas["imagens"] = [("motivo", "TEXT DEFAULT ''"), ("origem_decisao", "TEXT DEFAULT ''"), ("alertas", "TEXT DEFAULT ''"),
                            ("ref", "INTEGER DEFAULT 0"), ("conta", "TEXT DEFAULT ''"), ("dhash", "TEXT DEFAULT ''"),
                            ("estilo", "TEXT DEFAULT ''")]
        for tabela, colunas in novas.items():
            tem = {r["name"] for r in c.execute(f"PRAGMA table_info({tabela})")}
            for nome, tipo in colunas:
                if nome not in tem:
                    c.execute(f"ALTER TABLE {tabela} ADD COLUMN {nome} {tipo}")


def ajuste(chave, padrao=None):
    with con() as c:
        r = c.execute("SELECT valor FROM ajustes WHERE chave=?", (chave,)).fetchone()
    return r["valor"] if r else padrao


def gravar_ajuste(chave, valor):
    with con() as c:
        c.execute("INSERT INTO ajustes(chave,valor) VALUES(?,?) "
                  "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor", (chave, str(valor)))


# ----------------------------------------------------------------------- senha
def _hash_senha(senha, sal):
    return hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), 200_000).hex()


def tem_senha():
    return ajuste("senha") is not None


def definir_senha(senha):
    sal = secrets.token_hex(16)
    gravar_ajuste("senha", f"{sal}${_hash_senha(senha, sal)}")
    gravar_ajuste("segredo", secrets.token_hex(32))  # derruba sessoes antigas


def conferir_senha(senha):
    guardado = ajuste("senha")
    if not guardado:
        return False
    sal, h = guardado.split("$")
    return hmac.compare_digest(h, _hash_senha(senha, sal))


def _segredo():
    s = ajuste("segredo")
    if not s:
        s = secrets.token_hex(32)
        gravar_ajuste("segredo", s)
    return s.encode()


def criar_sessao(dias=30):
    validade = str(int(time.time()) + dias * 86400)
    return validade + "." + hmac.new(_segredo(), validade.encode(), "sha256").hexdigest()


def sessao_valida(cookie):
    try:
        validade, assinatura = (cookie or "").split(".")
        certo = hmac.new(_segredo(), validade.encode(), "sha256").hexdigest()
        return hmac.compare_digest(assinatura, certo) and int(validade) > time.time()
    except ValueError:
        return False


# ------------------------------------------------- classificacao pelo nome
def _limpo(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.lower().strip()


def _cor(s):
    return re.sub(r"[_\-\s]+", " ", s).strip().title()


_PASTAS_GENERICAS = {
    "ia": "ia", "fotos ia": "ia", "foto ia": "ia", "fb": "fb", "fundo branco": "fb",
    "capa": "capa", "capas": "capa", "informativo": "informativo", "informativos": "informativo",
    "tabela": "tabela", "tabelas": "tabela",
}
_RUIDO = {"1111", "ia", "fb", "info", "informativo", "tabela", "medidas", "de", "capa", "kit",
          "fundo", "branco", "fundobranco", "final", "novo", "nova"}


def classificar(nome, pastas=()):
    """Tenta descobrir produto, cor, tipo e anuncio pelo nome do arquivo e pelas subpastas."""
    r = {"produto": "", "cor": "", "tipo": "", "anuncio": ""}
    base = _limpo(Path(nome).stem)
    for p in pastas:
        pl = _limpo(p)
        if pl in _PASTAS_GENERICAS:
            r["tipo"] = r["tipo"] or _PASTAS_GENERICAS[pl]
        elif not r["produto"]:
            r["produto"] = p.strip().upper()
    kit = re.search(r"kit[\s_\-]?([234])", base)

    m = re.match(r"^capa[_\-](.+)$", base)
    if m:
        partes = [p for p in re.split(r"[_]+", m.group(1)) if p and p != "1111"]
        r["tipo"] = f"capa_kit{kit.group(1)}" if kit else "capa"
        if len(partes) >= 2:
            r["anuncio"] = " ".join(partes[:-1]).upper()
            r["cor"] = _cor(partes[-1])
        elif partes:
            r["anuncio"] = partes[0].upper()
        return r

    m = re.match(r"^([a-z0-9]+?)ia[_\-]([^_]+)[_\-]\d+(?:[_\-]r\d+)?(?:[_\-]1111)?$", base)
    if m:
        r.update(produto=m.group(1).upper(), cor=_cor(m.group(2)), tipo="ia")
        return r

    fichas = [t for t in re.split(r"[_\-\s]+", base) if t]
    tipo = ""
    if "informativo" in base or "info" in fichas:
        tipo = "informativo"
    elif "tabela" in base:
        tipo = "tabela"
    elif "fb" in fichas or "fundo branco" in base.replace("_", " ") or "fundobranco" in base:
        tipo = f"kit{kit.group(1)}_fb" if kit else "fb"
    if tipo:
        r["tipo"] = tipo
        resto = [t for t in fichas if t not in _RUIDO and not re.fullmatch(r"r?\d+|kit\d", t)]
        if resto and not r["produto"] and len(resto) > 1 and re.search(r"\d", resto[0]):
            r["produto"] = resto.pop(0).upper()
        if resto:
            r["cor"] = _cor(" ".join(resto))
        return r

    m = re.match(r"^([^\W\d_][^_]*?)[_\-](\d{1,2})$", base)  # <COR>_<n>
    if m and not re.match(r"(img|dsc|image|imagem|foto|screenshot|whatsapp|captura)", base):
        r["cor"] = _cor(m.group(1))
        r["tipo"] = r["tipo"] or "ia"
    return r


def status_inicial(produto, tipo):
    return "conferencia" if produto and tipo else "gerada"


# -------------------------------------------------------------- importacao
def _sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def _miniatura(origem, imagem_id):
    with Image.open(origem) as im:
        im.thumbnail((520, 520))
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            fundo = Image.new("RGB", im.size, "white")
            fundo.paste(im, mask=im.split()[-1])
            im = fundo
        else:
            im = im.convert("RGB")
        im.save(pasta_miniaturas() / f"{imagem_id}.jpg", "JPEG", quality=82)


def _nome_seguro(nome):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", nome)[:120]


def dhash(caminho):
    """Impressao digital visual da imagem (64 bits), para achar capas quase iguais."""
    with Image.open(caminho) as im:
        px = list(im.convert("L").resize((9, 8)).getdata())
    bits = "".join("1" if px[r * 9 + k] > px[r * 9 + k + 1] else "0" for r in range(8) for k in range(8))
    return "%016x" % int(bits, 2)


def parecenca(a, b):
    """Porcentagem de semelhanca entre duas impressoes digitais."""
    if not a or not b:
        return 0
    return round(100 - bin(int(a, 16) ^ int(b, 16)).count("1") / 64 * 100)


def importar(caminho, nome=None, pastas=(), origem="", mover=False, anuncio_nome="",
             dados=None, conta="", alertas=None):
    """Guarda UMA copia do arquivo no repositorio e cadastra. Devolve (id, novo)."""
    caminho = Path(caminho)
    nome = nome or caminho.name
    sha = _sha256(caminho)
    with con() as c:
        ja = c.execute("SELECT id FROM imagens WHERE sha256=?", (sha,)).fetchone()
    if ja:
        return ja["id"], False
    with Image.open(caminho) as im:
        im.verify()
    with Image.open(caminho) as im:
        largura, altura = im.size
    rel = Path("arquivos") / datetime.date.today().strftime("%Y-%m") / f"{sha[:12]}_{_nome_seguro(nome)}"
    destino = pasta_repo() / rel
    destino.parent.mkdir(parents=True, exist_ok=True)
    if mover:
        shutil.move(str(caminho), str(destino))
    else:
        shutil.copy2(str(caminho), str(destino))
    info = classificar(nome, pastas)
    info.update({k: v.strip() for k, v in (dados or {}).items() if v and v.strip()})
    info["produto"] = info["produto"].upper()
    if info["tipo"] not in TIPO_NOME:
        info["tipo"] = ""
    try:
        digital = dhash(destino)
    except Exception:
        digital = ""
    with con() as c:
        if not info["produto"] and info["anuncio"]:  # capa_ci9unitario_... -> produto CI9
            conhecidos = [r[0] for r in c.execute("SELECT DISTINCT produto FROM imagens WHERE produto<>''")]
            achados = [p for p in conhecidos if info["anuncio"].replace(" ", "").startswith(p.replace(" ", ""))]
            if achados:
                info["produto"] = max(achados, key=len)
        cur = c.execute(
            "INSERT INTO imagens(sha256,arquivo,nome_original,origem,produto,cor,tipo,status,"
            "largura,altura,bytes,criado_em,conta,alertas,dhash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (sha, rel.as_posix(), nome, origem, info["produto"], info["cor"], info["tipo"],
             status_inicial(info["produto"], info["tipo"]), largura, altura,
             destino.stat().st_size, agora(), conta, json.dumps(alertas, ensure_ascii=False) if alertas is not None else "",
             digital))
        imagem_id = cur.lastrowid
        alvo = anuncio_nome or info["anuncio"]
        if alvo:
            vincular(c, [imagem_id], obter_anuncio(c, alvo))
    try:
        _miniatura(destino, imagem_id)
    except Exception as e:  # miniatura e refeita sob demanda
        registrar(f"miniatura falhou para {nome}: {e}")
    return imagem_id, True


def obter_anuncio(c, nome):
    nome = nome.strip()
    r = c.execute("SELECT id FROM anuncios WHERE nome=?", (nome,)).fetchone()
    if r:
        return r["id"]
    chave = re.sub(r"[^a-z0-9]", "", _limpo(nome))  # "CI9UNITARIO" e o mesmo anuncio que "CI9 unitário"
    for a in c.execute("SELECT id, nome FROM anuncios").fetchall():
        if chave and re.sub(r"[^a-z0-9]", "", _limpo(a["nome"])) == chave:
            return a["id"]
    kit = re.search(r"kit\s*([234])", nome.lower())
    formato = f"kit{kit.group(1)}" if kit else "unitario"
    return c.execute("INSERT INTO anuncios(nome,formato,criado_em) VALUES(?,?,?)",
                     (nome, formato, agora())).lastrowid


def vincular(c, ids, anuncio_id):
    c.executemany("INSERT OR IGNORE INTO imagem_anuncio(imagem_id,anuncio_id,criado_em) VALUES(?,?,?)",
                  [(i, anuncio_id, agora()) for i in ids])


# ------------------------------------------------------ demandas (ClickUp)
FORMATO_NOME = {"unitario": "unitário", "kit2": "kit 2", "kit3": "kit 3", "kit4": "kit 4"}


def ler_pedido(texto):
    """Le o texto livre do campo INFO JOAO e tira dele as metas e as medidas."""
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()

    def numero(rx):
        m = re.search(rx, t)
        return int(m.group(1)) if m else 0

    formatos = ["unitario"] + [f"kit{k}" for k in (2, 3, 4) if re.search(rf"kit\s*{k}", t)]
    capas = {f: 0 for f in formatos}
    for m in re.finditer(r"(\d+)\s*capas?\s*(unitario|kit\s*\d)?", t):
        f = re.sub(r"\s+", "", m.group(2) or "unitario")
        if f in capas:
            capas[f] = int(m.group(1))
    medidas = [[a, b.replace(".", ",")] for a, b in
               re.findall(r"^\s*(\d{2}(?:/\d{2})?)\s*[-–:]\s*(\d{2}(?:[.,]\d)?)\s*$", texto, re.M)]
    return {"formatos": formatos, "ia": numero(r"(\d+)\s*ia\b"), "informativo": numero(r"(\d+)\s*informativ"),
            "tabela": 1 if "tabela" in t else 0, "capas": capas, "medidas": medidas}


def nova_demanda(c, tarefa_id, tarefa, info, pasta="", marketplaces=(), status="", url="", produto=""):
    """Cadastra (ou atualiza) uma tarefa do ClickUp e cria os anuncios dela. Devolve (id, nova)."""
    metas = ler_pedido(info)
    ja = c.execute("SELECT * FROM demandas WHERE tarefa_id=?", (str(tarefa_id),)).fetchone()
    if ja:
        campos = {"tarefa": tarefa, "pasta": pasta, "status": status, "url": url,
                  "marketplaces": json.dumps(list(marketplaces))}
        if ja["info"] != info:  # o pedido mudou no ClickUp: le de novo
            campos.update(info=info, metas=json.dumps(metas))
        c.execute(f"UPDATE demandas SET {','.join(k + '=?' for k in campos)} WHERE id=?", [*campos.values(), ja["id"]])
        did, produto, nova = ja["id"], ja["produto"], False
    else:
        produto = (produto or tarefa).strip().upper()
        did = c.execute("INSERT INTO demandas(tarefa_id,tarefa,produto,info,pasta,marketplaces,status,metas,url,criado_em) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?)", (str(tarefa_id), tarefa, produto, info, pasta,
                                                        json.dumps(list(marketplaces)), status, json.dumps(metas), url, agora())).lastrowid
        nova = True
        if metas["medidas"] and not c.execute("SELECT 1 FROM medidas WHERE produto=?", (produto,)).fetchone():
            c.executemany("INSERT INTO medidas VALUES(?,?,?,?)", [(produto, k, a, b) for k, (a, b) in enumerate(metas["medidas"])])
    for f in metas["formatos"]:
        if not c.execute("SELECT 1 FROM anuncios WHERE demanda_id=? AND formato=?", (did, f)).fetchone():
            certo = f"{produto} {FORMATO_NOME[f]}"
            aid = obter_anuncio(c, certo)  # pode achar um criado antes pelo nome do arquivo (ex.: CI9UNITARIO)
            c.execute("UPDATE anuncios SET demanda_id=?, formato=?, nome=? WHERE id=?", (did, f, certo, aid))
    return did, nova


def buscar_clickup():
    """Le a lista DEMANDAS (so leitura) e cadastra as tarefas com Link Pasta e INFO JOAO."""
    import urllib.request
    token = str(CFG["clickup_token"]).strip()
    if not token:
        raise RuntimeError("Falta a chave do ClickUp. Coloque em clickup_token no config.json e ligue o site de novo.")
    novas, ignoradas, pagina = [], 0, 0
    while True:
        req = urllib.request.Request(
            f"https://api.clickup.com/api/v2/list/{CFG['clickup_lista']}/task?page={pagina}&subtasks=false",
            headers={"Authorization": token})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                dados = json.loads(r.read().decode("utf-8"))
        except Exception as e:
            raise RuntimeError(f"Não consegui falar com o ClickUp: {e}")
        with con() as c:
            for t in dados.get("tasks", []):
                campos = {str(f.get("name", "")).strip().upper(): f for f in t.get("custom_fields", [])}
                info = str((campos.get("INFO JOAO") or {}).get("value") or "").strip()
                pasta = str((campos.get("LINK PASTA") or {}).get("value") or "").strip()
                if not info or not pasta:
                    ignoradas += 1
                    continue
                mk = campos.get("MARKETPLACES") or {}
                rotulos = {o["id"]: o.get("label") or o.get("name") for o in (mk.get("type_config") or {}).get("options", [])}
                marcados = [rotulos[v] for v in (mk.get("value") or []) if v in rotulos]
                _, nova = nova_demanda(c, t["id"], t["name"].strip(), info, pasta, marcados,
                                       (t.get("status") or {}).get("status", ""), t.get("url", ""))
                if nova:
                    novas.append(t["name"].strip())
        if dados.get("last_page", True) or not dados.get("tasks"):
            break
        pagina += 1
    return novas, ignoradas


def chave_bots():
    chave = str(CFG["chave_bots"]).strip() or ajuste("chave_bots")
    if not chave:
        chave = secrets.token_urlsafe(24)
        gravar_ajuste("chave_bots", chave)
    return chave


def caminho_imagem(linha):
    return pasta_repo() / linha["arquivo"]


def caminho_miniatura(linha):
    p = pasta_miniaturas() / f"{linha['id']}.jpg"
    if not p.exists():
        _miniatura(caminho_imagem(linha), linha["id"])
    return p


# ------------------------------------------------------- leitor da entrada
def _corte():
    txt = str(CFG["importar_a_partir_de"]).strip().lower()
    if txt == "tudo":
        return 0.0
    if txt:
        return datetime.datetime.strptime(txt, "%Y-%m-%d").timestamp()
    v = ajuste("corte")
    if v is None:
        v = time.time()
        gravar_ajuste("corte", v)
    return float(v)


def ler_entrada():
    """Procura arquivos novos na pasta de entrada."""
    if not CFG["pasta_entrada"]:
        return 0
    entrada = Path(CFG["pasta_entrada"])
    if not entrada.is_dir():
        raise RuntimeError(f"Pasta de entrada inacessível: {entrada}")
    corte = _corte()
    ignoradas = {_limpo(p) for p in CFG["pastas_ignoradas"]}
    try:
        repo = pasta_repo().resolve()
    except OSError:
        repo = pasta_repo()
    with con() as c:
        vistos = {r["caminho"]: (r["tamanho"], r["mtime"]) for r in c.execute("SELECT * FROM vistos")}
    novas = 0
    for raiz, pastas, arquivos in os.walk(entrada):
        raiz_p = Path(raiz)
        pastas[:] = [d for d in pastas if _limpo(d) not in ignoradas
                     and (raiz_p / d).resolve() != repo]
        rel = raiz_p.relative_to(entrada).parts
        for nome in arquivos:
            if Path(nome).suffix.lower() not in EXTENSOES:
                continue
            if _limpo(nome).startswith(("conferencia", "relatorio")):
                continue  # folhas de conferencia do gerador
            p = raiz_p / nome
            try:
                st = p.stat()
            except OSError:
                continue
            if max(st.st_mtime, st.st_ctime) < corte:
                continue
            if time.time() - st.st_mtime < 5:
                continue  # ainda pode estar sendo gravado
            if vistos.get(str(p)) == (st.st_size, st.st_mtime):
                continue
            try:
                _, novo = importar(p, nome, rel, origem=str(p),
                                   mover=CFG["modo_entrada"] == "mover")
                novas += int(novo)
            except Exception as e:
                registrar(f"nao consegui importar {p}: {e}")
            with con() as c:
                c.execute("INSERT OR REPLACE INTO vistos VALUES(?,?,?)",
                          (str(p), st.st_size, st.st_mtime))
    return novas


def apagar_reprovadas():
    """Apaga de vez os arquivos reprovados, depois do prazo para desfazer."""
    with con() as c:
        linhas = c.execute("SELECT * FROM imagens WHERE status='reprovada' AND arquivo<>'' "
                           "AND apagar_em<=?", (time.time(),)).fetchall()
    for l in linhas:
        try:
            caminho_imagem(l).unlink(missing_ok=True)
            if CFG["apagar_original_ao_reprovar"] and l["origem"] and os.path.isfile(l["origem"]):
                if os.path.getsize(l["origem"]) == l["bytes"]:
                    os.remove(l["origem"])
            with con() as c:
                c.execute("UPDATE imagens SET arquivo='' WHERE id=?", (l["id"],))
                c.execute("DELETE FROM imagem_anuncio WHERE imagem_id=?", (l["id"],))
                c.execute("DELETE FROM anuncio_cores WHERE imagem_id=?", (l["id"],))
        except OSError as e:
            registrar(f"nao consegui apagar a imagem {l['id']}: {e}")


def fazer_backup():
    hoje = datetime.date.today().isoformat()
    if ajuste("ultimo_backup") == hoje:
        return
    pasta = pasta_repo() / "backup_banco"
    pasta.mkdir(parents=True, exist_ok=True)
    destino = sqlite3.connect(pasta / f"menork_{hoje}.db")
    with con() as origem:
        origem.backup(destino)
    destino.close()
    antigos = sorted(pasta.glob("menork_*.db"))
    for velho in antigos[: -int(CFG["backups_guardados"])]:
        velho.unlink(missing_ok=True)
    gravar_ajuste("ultimo_backup", hoje)


def rodada():
    with _trava:
        try:
            estado["importadas"] = ler_entrada()
            apagar_reprovadas()
            fazer_backup()
            estado["erro"] = ""
        except Exception as e:
            estado["erro"] = str(e)
            registrar("erro na leitura: " + traceback.format_exc(limit=3))
        estado["ultima_leitura"] = agora()
    return estado


def _laco():
    while True:
        rodada()
        time.sleep(max(3, int(CFG["intervalo_segundos"])))


def ligar_leitor():
    threading.Thread(target=_laco, daemon=True).start()
