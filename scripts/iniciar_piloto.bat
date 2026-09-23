@echo off
REM ======================================================
REM PÁTIO CRM — INICIALIZADOR SUPERVISIONADO DO PILOTO
REM Executa o servidor Node com supervisao e logs
REM ======================================================

setlocal
cd /d "%~dp0\.."

echo [Patio CRM] Verificando ambiente Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado no PATH do sistema.
    echo Instale o Node.js v20+ antes de iniciar.
    pause
    exit /b 1
)

echo [Patio CRM] Iniciando supervisor do piloto operacional...
node scripts\supervise_patio.cjs

pause
