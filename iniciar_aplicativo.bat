@echo off
setlocal
title Patio CRM - Aplicativo
cd /d "%~dp0"

echo ============================================================
echo   PATIO CRM - INICIALIZADOR DO APLICATIVO
echo ============================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no PATH do sistema.
    echo Por favor, instale ou configure o Node.js.
    pause
    exit /b 1
)

echo [INFO] Verificando se o servidor esta ativo...
node -e "const s=require('net').connect(3000,'127.0.0.1',()=>{s.destroy();process.exit(0);}).on('error',()=>process.exit(1));" >nul 2>&1

if %errorlevel% neq 0 (
    echo [INFO] Servidor nao detectado. Iniciando servidor em nova janela...
    start "Patio CRM - Servidor" cmd /c "%~dp0iniciar_servidor.bat"
    echo [INFO] Aguardando o servidor carregar (porta 3000)...
    node -e "const net=require('net');const start=Date.now();function check(){const s=net.connect(3000,'127.0.0.1',()=>{s.destroy();process.exit(0);}).on('error',()=>{if(Date.now()-start>15000)process.exit(1);setTimeout(check,300);});}check();" >nul 2>&1
)

echo [INFO] Servidor ativo! Abrindo o Patio CRM no navegador...
start http://localhost:3000/

timeout /t 2 /nobreak >nul
exit
