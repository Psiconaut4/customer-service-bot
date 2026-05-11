import { sessionManager } from "./sessions.js";

// Mensagens configuráveis
const MSGS = {
  saudacao: (nome) =>
    `Olá, ${nome}! 👋 Sou o atentende virtual da TechCore \n\n Para agilizarmos o seu atendimento, informe o seu dispositivo e o problema que está enfrentando.`,

  aguardando:
    "✅ Certo! Um momento, por favor. \n\nEm breve um de nossos atendentes entrará em contato.",

  humanoAssumiu:
    "👤 Um atendente está cuidando do seu atendimento agora.",

  foraDeHorario:
    "⏰ Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.\n\nDeixe sua mensagem e retornaremos em breve!",
};

export async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const texto =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    "[mídia recebida]";

  // Nome do contato
  const nomeContato =
    msg.pushName || jid.split("@")[0];

  // Registra/recupera a conversa
  const conversa = sessionManager.getOrCreateConversa(jid, nomeContato);

  // Adiciona a mensagem ao histórico
  sessionManager.addMensagem(jid, {
    de: "cliente",
    texto,
    hora: new Date().toISOString(),
  });

  const status = sessionManager.getStatus(jid);

  // Se já está com atendente humano, não faz nada (atendente responde pelo dashboard)
  if (status === "humano") return;

  // Se já está aguardando, só confirma
  if (status === "aguardando") {
    await enviarMensagem(sock, jid, MSGS.aguardando);
    return;
  }

  // Primeira mensagem — envia saudação e coloca na fila
  if (status === "bot") {
    await enviarMensagem(sock, jid, MSGS.saudacao(nomeContato));
    sessionManager.setStatus(jid, "aguardando");
    console.log(`📩 Nova conversa na fila: ${nomeContato} (${jid.split("@")[0]})`);
  }
}

async function enviarMensagem(sock, jid, texto) {
  try {
    await sock.sendMessage(jid, { text: texto });

    // Registra a mensagem do bot no histórico
    sessionManager.addMensagem(jid, {
      de: "bot",
      texto,
      hora: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.message);
  }
}
