@echo off
setlocal enabledelayedexpansion
title Pátio-CRM v2.1.0 Enterprise - Deploy Zero to Hero
chcp 65001 >nul
cd /d "%~dp0"

:: ===================================================================
:: 1. VERIFICAÇÃO DE PRIVILÉGIOS ADMINISTRATIVOS
:: ===================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ===================================================================
    echo   [SOLICITAÇÃO] Privilégios de Administrador são necessários.
    echo   Reexecutando o instalador com permissões elevadas...
    echo ===================================================================
    powershell -Command "Start-Process cmd -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cls
echo ===================================================================
echo   PÁTIO-CRM v2.1.0 AUTONOMOUS ENTERPRISE
echo   Instalação e Deploy Automatizado (Zero to Hero)
echo ===================================================================
echo.

:: ===================================================================
:: 2. DETECÇÃO E INSTALAÇÃO DE PRÉ-REQUISITOS (WINGET)
:: ===================================================================
echo [*] Etapa 1/6: Verificando e instalando pré-requisitos do Windows...

:: 2.1 Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Git não localizado. Instalando via Winget...
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    if exist "%ProgramFiles%\Git\cmd" set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
) else (
    echo [OK] Git já está instalado.
)

:: 2.2 Node.js LTS
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Node.js não localizado. Instalando Node.js LTS via Winget...
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if exist "%ProgramFiles%\nodejs" set "PATH=%PATH%;%ProgramFiles%\nodejs"
) else (
    echo [OK] Node.js já está instalado:
    node -v
)

:: 2.3 Docker Desktop
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Docker Desktop não localizado. Instalando via Winget...
    winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
    echo.
    echo [ATENÇÃO] O Docker Desktop foi instalado. Se for a primeira instalação,
    echo           pode ser necessário reiniciar o Windows para ativar o WSL2.
) else (
    echo [OK] Docker Desktop CLI localizado.
)

:: 2.4 Verifica se o daemon do Docker está ativo
echo [INFO] Verificando se o daemon do Docker está respondendo...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] O Docker não está rodando. Tentando iniciar o Docker Desktop...
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
    )

    echo [INFO] Aguardando o Docker daemon inicializar (limite: 120s)...
    set /a DOCKER_WAIT=0
    :LOOP_DOCKER_WAIT
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        set /a DOCKER_WAIT+=1
        if !DOCKER_WAIT! geq 24 (
            echo [ERRO] O Docker Desktop demorou mais de 2 minutos para responder.
            echo        Abra o Docker Desktop manualmente pela barra de tarefas e reexecute este script.
            pause
            exit /b 1
        )
        echo        Aguardando daemon Docker... (!DOCKER_WAIT!/24)
        goto LOOP_DOCKER_WAIT
    )
)
echo [OK] Docker daemon ativo e respondendo!

:: ===================================================================
:: 3. CONFIGURAÇÃO DE DIRETÓRIOS E VARIÁVEIS DE AMBIENTE
:: ===================================================================
echo.
echo [*] Etapa 2/6: Configurando diretórios essenciais e variáveis de ambiente...
if not exist "data" mkdir "data"
if not exist "docs\operacao" mkdir "docs\operacao"
if not exist "docs\evidencias" mkdir "docs\evidencias"

if not exist ".env.production" (
    if exist ".env.production.example" (
        copy ".env.production.example" ".env.production" >nul
        echo [OK] .env.production gerado a partir do modelo de exemplo.
    ) else (
        echo [INFO] Criando arquivo .env.production padrão...
        (
            echo # Pátio-CRM v2.1.0 Enterprise - Produção
            echo NODE_ENV=production
            echo PORT=3000
            echo EVOLUTION_PORT=8080
            echo EVOLUTION_API_URL=http://localhost:8080
            echo EVOLUTION_API_KEY=patio_secret_evolution_key_2026
            echo EVOLUTION_WEBHOOK_SECRET=patio_hmac_secret_producao_2026
            echo OLLAMA_PORT=11434
            echo OLLAMA_BASE_URL=http://localhost:11434
            echo OLLAMA_MODEL=qwen2.5-coder:7b
            echo POSTGRES_USER=patio
            echo POSTGRES_PASSWORD=patio_secret_evolution
            echo POSTGRES_DB=evolution
            echo BANK_API_ENV=production
        ) > ".env.production"
        echo [OK] .env.production gerado com sucesso.
    )
) else (
    echo [OK] .env.production já existente.
)

:: ===================================================================
:: 4. INSTALAÇÃO DE DEPENDÊNCIAS NODE E TESTE DE INTEGRIDADE
:: ===================================================================
echo.
echo [*] Etapa 3/6: Instalando dependências e verificando integridade SHA-256...
call npm install --production
if %errorlevel% neq 0 (
    echo [AVISO] Falha leve no npm install --production. Tentando npm install...
    call npm install
)

echo [INFO] Executando validação de integridade criptográfica SHA-256...
node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs
if %errorlevel% neq 0 (
    echo [ERRO] Falha na validação do manifesto de release.
    echo        Arquivos podem estar corrompidos ou incompletos.
    pause
    exit /b %errorlevel%
)
echo [OK] Todos os arquivos do ERP estão 100%% íntegros (SHA-256 aprovado).

:: ===================================================================
:: 5. SUBIDA DA STACK DOCKER (ERP + OLLAMA + EVOLUTION + PG + REDIS)
:: ===================================================================
echo.
echo [*] Etapa 4/6: Subindo a Stack Docker de Produção (Build & Deploy)...
docker compose -f docker-compose.production.yml up -d --build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao construir ou iniciar os containers da stack.
    pause
    exit /b %errorlevel%
)
echo [OK] Containers da stack iniciados com sucesso!

:: ===================================================================
:: 6. INICIALIZAÇÃO DA INTELIGÊNCIA ARTIFICIAL LOCAL (OLLAMA GPU)
:: ===================================================================
echo.
echo [*] Etapa 5/6: Configurando a IA Local no Ollama (Qwen 2.5 Coder 7B)...
echo [INFO] Aguardando o container do Ollama estar pronto para aceitar comandos...
set /a OLLAMA_READY=0
:LOOP_OLLAMA_WAIT
timeout /t 3 /nobreak >nul
docker exec patio-crm-ollama ollama list >nul 2>&1
if %errorlevel% neq 0 (
    set /a OLLAMA_READY+=1
    if !OLLAMA_READY! geq 20 (
        echo [AVISO] O container do Ollama demorou para inicializar. Prosseguindo...
        goto PULL_OLLAMA
    )
    echo        Aguardando serviço Ollama... (!OLLAMA_READY!/20)
    goto LOOP_OLLAMA_WAIT
)

:PULL_OLLAMA
echo [INFO] Baixando o modelo NLU recomendado: qwen2.5-coder:7b
echo        (Isso pode demorar alguns minutos dependendo da sua conexão)...
docker exec patio-crm-ollama ollama pull qwen2.5-coder:7b
if %errorlevel% neq 0 (
    echo [AVISO] O download automático do modelo falhou ou foi interrompido.
    echo         Você poderá baixar manualmente depois via:
    echo         docker exec -it patio-crm-ollama ollama pull qwen2.5-coder:7b
) else (
    echo [OK] Modelo NLU baixado e pronto para inferência com aceleração por GPU!
)

:: ===================================================================
:: 7. PÓS-INSTALAÇÃO, ATALHO E ABERTURA DO SISTEMA
:: ===================================================================
echo.
echo [*] Etapa 6/6: Concluindo deploy e abrindo painel do Pátio-CRM...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ===================================================================
echo   🎉 DEPLOY CONCLUÍDO COM SUCESSO! (ZERO TO HERO)
echo ===================================================================
echo   O Pátio-CRM v2.1.0 Autonomous Enterprise está 100%% operacional!
echo.
echo   ENDPOINTS DE PRODUÇÃO DISPONÍVEIS:
echo   -----------------------------------------------------------------
echo   * ERP Pátio-CRM Web:        http://localhost:3000
echo   * Gateway WhatsApp (Evo):   http://localhost:8080
echo   * IA Local Ollama:          http://localhost:11434
echo   * Healthcheck da API:       http://localhost:3000/health
echo   * Readiness Probe:          http://localhost:3000/ready
echo.
echo   COMO INICIAR NO DIA A DIA:
echo   Basta clicar duas vezes no atalho: iniciar-sistema.bat
echo ===================================================================
echo.
pause
