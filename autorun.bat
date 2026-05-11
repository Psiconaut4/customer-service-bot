@echo off
chcp 65001 > nul
title Bot WhatsApp — Instalador

echo.
echo ╔══════════════════════════════════════════╗
echo ║        BOT WHATSAPP — INSTALADOR         ║
echo ╚══════════════════════════════════════════╝
echo.

:: Verifica se Node.js está instalado
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js não encontrado. Instalando automaticamente...
    echo.

    :: Detecta arquitetura
    if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
        set NODE_URL=https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi
        set NODE_FILE=node-installer.msi
    ) else (
        set NODE_URL=https://nodejs.org/dist/v20.11.0/node-v20.11.0-x86.msi
        set NODE_FILE=node-installer.msi
    )

    echo Baixando Node.js...
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_FILE%'"

    echo Instalando Node.js (pode pedir permissão de administrador)...
    msiexec /i %NODE_FILE% /quiet /norestart
    del %NODE_FILE%

    :: Atualiza PATH da sessão atual
    set "PATH=%ProgramFiles%\nodejs;%PATH%"

    node --version > nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar Node.js.
        echo Instale manualmente em: https://nodejs.org
        pause
        exit /b 1
    )
    echo [OK] Node.js instalado com sucesso!
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
    echo [OK] Node.js já instalado: %NODE_VER%
)

echo.
echo Instalando dependências do bot...
call npm install --omit=dev

if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependências.
    echo Verifique sua conexão com a internet e tente novamente.
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════╗
echo ║  Instalação concluída! Iniciando bot...  ║
echo ╚══════════════════════════════════════════╝
echo.
echo O dashboard abrirá em: http://localhost:3000
echo Feche esta janela para parar o bot.
echo.

:: Abre o dashboard no navegador após 3 segundos
start "" cmd /c "timeout /t 4 > nul && start http://localhost:3000"

node src/index.js

pause