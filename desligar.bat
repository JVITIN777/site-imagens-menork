@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ImagensMenork.vbs" >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul
echo Site desligado e retirado da inicializacao do Windows.
pause
