"""Atualizacao automatica: o site busca a versao nova no GitHub, troca os proprios arquivos e religa.

Nunca toca em config.json, na pasta dados, na .venv nem nas imagens.
"""
import filecmp
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

from . import nucleo as n

PRESERVAR = {"config.json", "dados", ".venv", "repositorio", ".git", ".gitignore"}
CODIGO_RELIGAR = 42
info = {"remota": "", "checada_em": "", "erro": ""}


def versao_local(raiz=None):
    p = Path(raiz or n.BASE) / "versao.txt"
    return p.read_text(encoding="utf-8").strip() if p.exists() else "0"


def _numero(v):
    return tuple(int(x) for x in re.findall(r"\d+", v))


def _baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "site-imagens-menork", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def _enderecos():
    repo, ramo = str(n.CFG["atualizar_repo"]).strip(), str(n.CFG["atualizar_ramo"]).strip() or "main"
    base = str(n.CFG["atualizar_endereco"]).strip().rstrip("/")
    if base:  # endereco proprio (testes ou outro lugar que nao o GitHub)
        return f"{base}/versao.txt", f"{base}/site.zip"
    if not repo:
        return None, None
    return (f"https://raw.githubusercontent.com/{repo}/{ramo}/versao.txt?t={int(time.time())}",
            f"https://codeload.github.com/{repo}/zip/refs/heads/{ramo}")


def versao_remota():
    url, _ = _enderecos()
    info.update(checada_em=n.agora(), erro="")
    if not url:
        info["erro"] = "Atualização desligada: falta atualizar_repo no config.json."
        return ""
    try:
        info["remota"] = _baixar(url).decode("utf-8").strip()[:40]
    except Exception as e:
        info["erro"] = f"Não consegui consultar a versão nova: {e}"
        return ""
    return info["remota"]


def tem_nova():
    r = versao_remota()
    return bool(r) and r != n.ajuste("pular_versao") and _numero(r) > _numero(versao_local())


def _arquivos(raiz):
    raiz = Path(raiz)
    for p in sorted(raiz.rglob("*")):
        rel = p.relative_to(raiz)
        if p.is_file() and rel.parts[0] not in PRESERVAR and "__pycache__" not in rel.parts:
            yield rel


def _copias():
    pasta = n.pasta_dados() / "versoes"
    pasta.mkdir(parents=True, exist_ok=True)
    return sorted((d for d in pasta.iterdir() if d.is_dir()), key=lambda d: d.stat().st_mtime)


def anterior():
    c = _copias()
    return c[-1].name if c else ""


def _guardar_atual():
    destino = n.pasta_dados() / "versoes" / re.sub(r"[^\w.\-]", "_", versao_local())
    shutil.rmtree(destino, ignore_errors=True)
    for rel in _arquivos(n.BASE):
        (destino / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(n.BASE / rel, destino / rel)
    for velha in _copias()[:-3]:
        shutil.rmtree(velha, ignore_errors=True)


def _aplicar(origem):
    """Copia os arquivos do programa de `origem` por cima da instalacao."""
    origem = Path(origem)
    novos = set(_arquivos(origem))
    if Path("app/main.py") not in novos or Path("versao.txt") not in novos:
        raise RuntimeError("O pacote baixado não parece ser o site (faltam arquivos).")
    mudou_requisitos = not (n.BASE / "requirements.txt").exists() or not filecmp.cmp(
        origem / "requirements.txt", n.BASE / "requirements.txt", shallow=False)
    for rel in novos:
        destino = n.BASE / rel
        if destino.exists() and filecmp.cmp(origem / rel, destino, shallow=False):
            continue
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origem / rel, destino)
    for rel in _arquivos(n.BASE):  # arquivo do programa que deixou de existir na versao nova
        if rel.parts[0] == "app" and rel not in novos:
            (n.BASE / rel).unlink(missing_ok=True)
    if mudou_requisitos:
        subprocess.call([sys.executable, "-m", "pip", "install", "-q", "-r", str(n.BASE / "requirements.txt")])


def atualizar():
    """Baixa e aplica a versao nova, se houver. Devolve a versao instalada ou None."""
    if not tem_nova():
        return None
    antiga = versao_local()
    pacote = _baixar(_enderecos()[1])
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(io.BytesIO(pacote)).extractall(tmp)
        raizes = [d for d in Path(tmp).iterdir() if d.is_dir()]
        origem = raizes[0] if len(raizes) == 1 and not (Path(tmp) / "versao.txt").exists() else Path(tmp)
        _guardar_atual()
        _aplicar(origem)
    n.registrar(f"site atualizado da versão {antiga} para a {versao_local()}")
    return versao_local()


def voltar():
    """Volta para a ultima versao guardada e nao busca de novo a versao desfeita."""
    copias = _copias()
    if not copias:
        raise RuntimeError("Não há versão anterior guardada.")
    desfeita = versao_local()
    _aplicar(copias[-1])
    shutil.rmtree(copias[-1], ignore_errors=True)
    n.gravar_ajuste("pular_versao", desfeita)
    n.registrar(f"site voltou da versão {desfeita} para a {versao_local()}")
    return versao_local()


def religar(espera=1.5):
    """Encerra o servidor com o codigo que faz o rodar.py ligar de novo."""
    threading.Timer(espera, lambda: os._exit(CODIGO_RELIGAR)).start()


def ao_ligar():
    """Chamado pelo rodar.py antes de ligar o servidor."""
    n.iniciar_banco()
    if not n.CFG["atualizar_sozinho"]:
        return
    try:
        nova = atualizar()
        if nova:
            print(f"Site atualizado para a versão {nova}.")
    except Exception as e:
        n.registrar(f"atualização ao ligar falhou: {e}")


def _vigia():
    while True:
        time.sleep(max(1, float(n.CFG["atualizar_a_cada_horas"])) * 3600)
        try:
            if n.CFG["atualizar_sozinho"] and atualizar():
                religar()
        except Exception as e:
            n.registrar(f"atualização automática falhou: {e}")


def ligar_vigia():
    threading.Thread(target=_vigia, daemon=True).start()


def situacao():
    return {"atual": versao_local(), "remota": info["remota"], "checada_em": info["checada_em"], "erro": info["erro"],
            "anterior": anterior(), "sozinho": bool(n.CFG["atualizar_sozinho"])}
