@echo off
REM Inicia o app Flask + o tunel Cloudflare (sem precisar de browser)
cd /d "%~dp0"
echo Davila Beauty:
echo   Agendamento:  http://127.0.0.1:5000
echo   Painel (PIN):  http://127.0.0.1:5000/painel
echo   LAN:           http://192.168.5.100:5000
echo.
echo Iniciando Flask...
start "" "python" "app.py"
echo Iniciando tunel Cloudflare (gera uma URL pública nova cada vez)...
start "" "C:\Users\paulo\AppData\Local\Temp\opencode\cloudflared.exe" "--no-autoupdate" "tunnel" "--url" "http://127.0.0.1:5000"
pause
