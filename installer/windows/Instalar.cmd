@echo off
setlocal
cd /d "%~dp0"
"runtime\node.exe" "setup.cjs"
if errorlevel 1 echo Instalacao nao concluida. Consulte a mensagem acima.
pause
