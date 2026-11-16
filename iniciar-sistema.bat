@echo off
setlocal enabledelayedexpansion
title Pátio-CRM v2.1.0 Enterprise - Inicializador do Sistema
chcp 65001 >nul
cd /d "%~dp0"

cls
echo ===================================================================
echo   PÁTIO-CRM v2.1.0 AUTONOMOUS ENTERPRISE
echo   Inicializador Operacional de Produção
echo ===================================================================
echo.

:: 1. Verifica se o Docker Desktop está em execução
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Docker Desktop não está rodando. Tentando inicializar...
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo [ALERTA] Executável do Docker Desktop não localizado no caminho padrão.
        echo          Inicie o Docker Desktop manualmente antes de continuar.
    )

    echo [INFO] Aguardando o Docker inicializar (isso pode levar alguns instantes)...
    set /a TENTATIVAS=0
    :ESPERAR_DOCKER_INICIAR
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        set /a TENTATIVAS+=1
        if !TENTATIVAS! geq 15 (
            echo [ERRO] O Docker demorou muito para responder.
            echo        Verifique se o Docker Desktop está aberto e tente novamente.
            pause
            exit /b 1
        )
        echo        Aguardando daemon Docker... (!TENTATIVAS!/15)
        goto ESPERAR_DOCKER_INICIAR
    )
    echo [OK] Docker daemon pronto!
)

:: 2. Inicia os containers da Stack de Produção
echo [INFO] Subindo containers da Stack Enterprise...
docker compose -f docker-compose.production.yml up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir os containers Docker.
    pause
    exit /b %errorlevel%
)

:: 3. Aguarda 3 segundos e abre o navegador
echo [INFO] Aguardando estabilização dos serviços...
timeout /t 3 /nobreak >nul

echo [INFO] Abrindo o painel web no navegador padrão...
start http://localhost:3000

echo.
echo ===================================================================
echo   SERVIÇOS EM PRODUÇÃO OPERACIONAIS:
echo ===================================================================
echo   - Pátio-CRM Web:        http://localhost:3000
echo   - Evolution API:        http://localhost:8080
echo   - Ollama Local (IA):    http://localhost:11434
echo ===================================================================
echo   O sistema está rodando em segundo plano.
echo   Você pode fechar esta janela com segurança.
echo ===================================================================
echo.
pause
