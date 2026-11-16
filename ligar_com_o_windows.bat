@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (echo Rode o instalar.bat primeiro. & pause & exit /b 1)
set "ALVO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ImagensMenork.vbs"
> "%ALVO%" echo CreateObject("WScript.Shell").Run """%~dp0.venv\Scripts\pythonw.exe"" ""%~dp0rodar.py""", 0, False
wscript "%ALVO%"
echo O site agora liga sozinho, escondido, sempre que voce entrar no Windows.
echo Ja esta no ar em http://localhost:8765
pause
