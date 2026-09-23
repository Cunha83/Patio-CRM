@echo off
setlocal
cd /d "%~dp0"
"runtime\node.exe" "start.cjs"
pause
