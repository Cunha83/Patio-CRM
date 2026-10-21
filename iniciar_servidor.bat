@echo off
setlocal
title Patio CRM - Servidor Backend
cd /d "%~dp0"

echo ============================================================
echo   PATIO CRM - SERVIDOR BACKEND
echo ============================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no PATH do sistema.
    echo Por favor, certifique-se de que o Node.js esta instalado.
    echo.
    pause
    exit /b 1
)

echo [INFO] Iniciando o servidor Patio CRM...
echo [INFO] Endereco local: http://localhost:3000/
echo [INFO] Mantenha esta janela aberta enquanto o sistema estiver em uso.
echo [INFO] Para encerrar o servidor, pressione Ctrl + C ou feche esta janela.
echo.
echo ------------------------------------------------------------
echo.

node server.js

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] O servidor encerrou com codigo %errorlevel%.
    pause
)
