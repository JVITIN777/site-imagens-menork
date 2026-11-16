@echo off
cd /d "%~dp0"
echo === Instalando o site de imagens Menork ===
set "PY=py -3"
%PY% --version >nul 2>nul || set "PY=python"
%PY% --version >nul 2>nul || (
  echo.
  echo Python nao foi encontrado neste PC.
  echo Instale em https://www.python.org/downloads/ marcando "Add python.exe to PATH" e rode este arquivo de novo.
  pause
  exit /b 1
)
%PY% -m venv .venv || (echo Nao consegui criar o ambiente. & pause & exit /b 1)
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt || (echo A instalacao falhou. Confira a internet e tente de novo. & pause & exit /b 1)
echo.
echo Pronto. Agora abra o iniciar.bat.
pause
