import { sessionManager } from "./sessions.js";

// ── CONFIGURAÇÕES — edite aqui sem mexer na lógica ──────────────────────────

const EMPRESA = "Assistência Técnica";

const MARCAS = {
    celular: ["Samsung", "Apple (iPhone)", "Motorola", "Xiaomi", "LG", "Outro"],
    notebook: ["Dell", "Lenovo", "HP", "Asus", "Acer", "Apple (MacBook)", "Outro"],
    tablet: ["Samsung", "Apple (iPad)", "Lenovo", "Outro"],
    outro: ["Outro"],
};

const PROBLEMAS = {
    celular: [
        "Tela quebrada / manchada",
        "Não liga / bateria fraca",
        "Molhou / caiu na água",
        "Botão / câmera / som",
        "Lento / travando / software",
        "Conector de carga",
        "Outro problema",
    ],
    notebook: [
        "Não liga / sem imagem",
        "Tela quebrada / manchada",
        "Teclado / touchpad",
        "Superaquecendo / lento",
        "Conector de carga / bateria",
        "Vírus / formatação / software",
        "Outro problema",
    ],
    tablet: [
        "Tela quebrada / manchada",
        "Não liga / bateria",
        "Botão / câmera / som",
        "Lento / travando / software",
        "Outro problema",
    ],
    outro: ["Descreva o problema"],
};

// ── MENSAGENS ────────────────────────────────────────────────────────────────

const MSGS = {
    saudacao: (nome) =>
        `Olá, *${nome}*! 👋 Bem-vindo(a) à *${EMPRESA}*.\n\nComo posso te ajudar hoje?\n\n` +
        `1️⃣ Orçamento / Reparo\n` +
        `2️⃣ Acompanhar conserto em andamento\n` +
        `3️⃣ Retirada de aparelho pronto\n` +
        `4️⃣ Outras dúvidas\n\n` +
        `_Digite o número da opção desejada._`,

    menuDispositivo:
        `📱 Qual é o tipo do dispositivo?\n\n` +
        `1️⃣ Celular / Smartphone\n` +
        `2️⃣ Notebook / Computador\n` +
        `3️⃣ Tablet / iPad\n` +
        `4️⃣ Outro\n\n` +
        `_Digite o número da opção._`,

    menuMarca: (marcas) =>
        `🏷 Qual a marca?\n\n` +
        marcas.map((m, i) => `${i + 1}️⃣ ${m}`).join("\n") +
        `\n\n_Digite o número da opção._`,

    pedirModelo:
        `✏️ Qual o *modelo* do aparelho?\n\n_Ex: Galaxy S23, iPhone 14, Inspiron 15..._\n\nDigite o modelo:`,

    menuProblema: (problemas) =>
        `🔧 Qual o problema?\n\n` +
        problemas.map((p, i) => `${i + 1}️⃣ ${p}`).join("\n") +
        `\n\n_Digite o número da opção._`,

    pedirDescricao:
        `📝 Descreva o problema com mais detalhes:\n\n_Ex: "caiu no chão e a tela trincou, ainda liga mas não toca"_`,

    fichaCompleta: (ficha, nome) =>
        `✅ Perfeito, *${nome}*! Recebemos suas informações:\n\n` +
        `📱 *Dispositivo:* ${ficha.dispositivo}\n` +
        `🏷 *Marca:* ${ficha.marca}\n` +
        `📋 *Modelo:* ${ficha.modelo}\n` +
        `🔧 *Problema:* ${ficha.problema}\n` +
        `📝 *Descrição:* ${ficha.descricao}\n\n` +
        `Um de nossos técnicos analisará e entrará em contato em breve. ⏳`,

    pedirProtocolo:
        `🔍 Informe seu *nome* ou *número de protocolo* para localizarmos seu aparelho:`,

    pedirNomeRetirada:
        `📦 Informe seu *nome* para verificarmos se o aparelho está pronto para retirada:`,

    aguardandoAtendente: () =>
        `✅ Informações registradas! Um atendente já foi notificado e responderá em breve. 🙏`,

    aguardando:
        `⏳ Você já está em nossa fila! Um atendente responderá em breve.`,

    opcaoInvalida:
        `❌ Opção inválida. Digite apenas o *número* da opção desejada.`,
};

// ── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export async function handleMessage(sock, msg) {
    const jid = msg.key.remoteJid;
    const texto = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        ""
    ).trim();

    const nomeContato = msg.pushName || jid.split("@")[0];
    const conversa = sessionManager.getOrCreateConversa(jid, nomeContato);

    sessionManager.addMensagem(jid, {
        de: "cliente",
        texto: texto || "[mídia recebida]",
        hora: new Date().toISOString(),
    });

    if (conversa.status === "humano") return;

    if (conversa.status === "aguardando") {
        await enviar(sock, jid, MSGS.aguardando);
        return;
    }

    const etapa = conversa.etapa;

    // INÍCIO
    if (etapa === "inicio") {
        await enviar(sock, jid, MSGS.saudacao(nomeContato));
        sessionManager.setEtapa(jid, "menu_principal");
        return;
    }

    // MENU PRINCIPAL
    if (etapa === "menu_principal") {
        const op = parseInt(texto);
        if (op === 1) {
            await enviar(sock, jid, MSGS.menuDispositivo);
            sessionManager.setEtapa(jid, "menu_dispositivo");
            sessionManager.updateFicha(jid, { tipo: "orcamento" });
        } else if (op === 2) {
            await enviar(sock, jid, MSGS.pedirProtocolo);
            sessionManager.setEtapa(jid, "acompanhamento");
            sessionManager.updateFicha(jid, { tipo: "acompanhamento" });
        } else if (op === 3) {
            await enviar(sock, jid, MSGS.pedirNomeRetirada);
            sessionManager.setEtapa(jid, "retirada");
            sessionManager.updateFicha(jid, { tipo: "retirada" });
        } else if (op === 4) {
            await enviar(sock, jid, `💬 Descreva sua dúvida e um atendente responderá em breve:`);
            sessionManager.setEtapa(jid, "duvida_livre");
            sessionManager.updateFicha(jid, { tipo: "duvida" });
        } else {
            await enviar(sock, jid, MSGS.opcaoInvalida + "\n\n" + MSGS.saudacao(nomeContato));
        }
        return;
    }

    // MENU DISPOSITIVO
    if (etapa === "menu_dispositivo") {
        const mapa = { 1: "celular", 2: "notebook", 3: "tablet", 4: "outro" };
        const nomes = {
            celular: "Celular / Smartphone",
            notebook: "Notebook / Computador",
            tablet: "Tablet / iPad",
            outro: "Outro",
        };
        const op = parseInt(texto);
        const dispositivo = mapa[op];
        if (!dispositivo) {
            await enviar(sock, jid, MSGS.opcaoInvalida + "\n\n" + MSGS.menuDispositivo);
            return;
        }
        sessionManager.updateFicha(jid, { dispositivo: nomes[dispositivo], _dispositivoKey: dispositivo });
        await enviar(sock, jid, MSGS.menuMarca(MARCAS[dispositivo]));
        sessionManager.setEtapa(jid, "menu_marca");
        return;
    }

    // MENU MARCA
    if (etapa === "menu_marca") {
        const key = conversa.ficha._dispositivoKey || "celular";
        const marcas = MARCAS[key];
        const op = parseInt(texto);
        if (!op || op < 1 || op > marcas.length) {
            await enviar(sock, jid, MSGS.opcaoInvalida + "\n\n" + MSGS.menuMarca(marcas));
            return;
        }
        sessionManager.updateFicha(jid, { marca: marcas[op - 1] });
        await enviar(sock, jid, MSGS.pedirModelo);
        sessionManager.setEtapa(jid, "pedir_modelo");
        return;
    }

    // MODELO (resposta livre)
    if (etapa === "pedir_modelo") {
        if (!texto || texto.length < 2) {
            await enviar(sock, jid, `Por favor, informe o modelo do aparelho:`);
            return;
        }
        sessionManager.updateFicha(jid, { modelo: texto });
        const key = conversa.ficha._dispositivoKey || "celular";
        await enviar(sock, jid, MSGS.menuProblema(PROBLEMAS[key]));
        sessionManager.setEtapa(jid, "menu_problema");
        return;
    }

    // MENU PROBLEMA
    if (etapa === "menu_problema") {
        const key = conversa.ficha._dispositivoKey || "celular";
        const problemas = PROBLEMAS[key];
        const op = parseInt(texto);
        if (!op || op < 1 || op > problemas.length) {
            await enviar(sock, jid, MSGS.opcaoInvalida + "\n\n" + MSGS.menuProblema(problemas));
            return;
        }
        sessionManager.updateFicha(jid, { problema: problemas[op - 1] });
        await enviar(sock, jid, MSGS.pedirDescricao);
        sessionManager.setEtapa(jid, "pedir_descricao");
        return;
    }

    // DESCRIÇÃO LIVRE
    if (etapa === "pedir_descricao") {
        if (!texto || texto.length < 3) {
            await enviar(sock, jid, `Por favor, descreva o problema com um pouco mais de detalhes:`);
            return;
        }
        sessionManager.updateFicha(jid, { descricao: texto });
        await enviar(sock, jid, MSGS.fichaCompleta(conversa.ficha, nomeContato));
        await enviar(sock, jid, MSGS.aguardandoAtendente());
        encerrarBot(jid, nomeContato);
        return;
    }

    // ACOMPANHAMENTO
    if (etapa === "acompanhamento") {
        sessionManager.updateFicha(jid, { protocolo: texto });
        await enviar(sock, jid, MSGS.aguardandoAtendente());
        encerrarBot(jid, nomeContato);
        return;
    }

    // RETIRADA
    if (etapa === "retirada") {
        sessionManager.updateFicha(jid, { nomeRetirada: texto });
        await enviar(sock, jid, MSGS.aguardandoAtendente());
        encerrarBot(jid, nomeContato);
        return;
    }

    // DÚVIDA LIVRE
    if (etapa === "duvida_livre") {
        sessionManager.updateFicha(jid, { duvida: texto });
        await enviar(sock, jid, MSGS.aguardandoAtendente());
        encerrarBot(jid, nomeContato);
        return;
    }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function encerrarBot(jid, nomeContato) {
    sessionManager.setStatus(jid, "aguardando");
    sessionManager.setEtapa(jid, "aguardando");
    console.log(`📋 Ficha completa — ${nomeContato} (${jid.split("@")[0]})`);
}

async function enviar(sock, jid, texto) {
    try {
        await sock.sendMessage(jid, { text: texto });
        sessionManager.addMensagem(jid, {
            de: "bot",
            texto,
            hora: new Date().toISOString(),
        });
    } catch (err) {
        console.error("Erro ao enviar mensagem:", err.message);
    }
}