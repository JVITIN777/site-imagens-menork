@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (echo Rode o instalar.bat primeiro. & pause & exit /b 1)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8765"
".venv\Scripts\python.exe" rodar.py
pause
