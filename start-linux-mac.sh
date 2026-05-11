#!/bin/bash

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        BOT WHATSAPP — INSTALADOR         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Verifica se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "[!] Node.js não encontrado. Instalando via nvm..."
    echo ""

    # Instala nvm (Node Version Manager)
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

    # Carrega nvm na sessão atual
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Instala Node.js LTS
    nvm install --lts
    nvm use --lts

    if ! command -v node &> /dev/null; then
        echo "[ERRO] Falha ao instalar Node.js."
        echo "Instale manualmente em: https://nodejs.org"
        exit 1
    fi

    echo "[OK] Node.js instalado: $(node --version)"
else
    echo "[OK] Node.js já instalado: $(node --version)"
fi

echo ""
echo "Instalando dependências do bot..."
npm install --omit=dev

if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao instalar dependências."
    echo "Verifique sua conexão com a internet."
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Instalação concluída! Iniciando bot...  ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Dashboard: http://localhost:3000"
echo "Pressione Ctrl+C para parar o bot."
echo ""

# Abre o dashboard no navegador após 3 segundos
(sleep 4 && (
    if command -v xdg-open &> /dev/null; then xdg-open http://localhost:3000
    elif command -v open &> /dev/null; then open http://localhost:3000
    fi
)) &

node src/index.js