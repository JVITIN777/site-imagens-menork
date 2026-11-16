"""Liga o site de imagens Menork e o mantem atualizado. Use iniciar.bat no dia a dia."""
import json
import os
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
os.chdir(AQUI)
sys.path.insert(0, str(AQUI))

if sys.stdout is None or sys.stderr is None:  # rodando escondido (pythonw)
    (AQUI / "dados").mkdir(exist_ok=True)
    saida = open(AQUI / "dados" / "servidor.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = saida

RELIGAR = 42  # o servidor sai com este codigo quando se atualizou e precisa ligar de novo


def servidor():
    import uvicorn
    from app import nucleo
    uvicorn.run("app.main:app", host=nucleo.CFG["host"], port=int(nucleo.CFG["porta"]), log_level="warning")


def buscar_atualizacao():
    from app import atualizar
    atualizar.ao_ligar()


if __name__ == "__main__":
    if "--servidor" in sys.argv:
        servidor()
    elif "--atualizar" in sys.argv:
        buscar_atualizacao()
    else:
        # Cada etapa roda num processo novo, para sempre usar os arquivos mais recentes.
        eu = [sys.executable, str(AQUI / "rodar.py")]
        while True:
            subprocess.call(eu + ["--atualizar"])
            try:
                porta = json.loads((AQUI / "config.json").read_text(encoding="utf-8-sig")).get("porta", 8765)
            except (OSError, ValueError):
                porta = 8765
            print(f"Site no ar em http://localhost:{porta}  (feche esta janela para desligar)", flush=True)
            if subprocess.call(eu + ["--servidor"]) != RELIGAR:
                break
            print("Religando o site com a versão nova…", flush=True)
