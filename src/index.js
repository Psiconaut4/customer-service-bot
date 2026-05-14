import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { startDashboard } from "./dashboard.js";
import { sessionManager } from "./sessions.js";
import { handleMessage } from "./handler.js";
import { loadConfig } from "./config.js";
import { rm } from "fs/promises";

const logger = pino({ level: "silent" });

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ["Bot Atendimento", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // Expõe o socket para o dashboard poder enviar mensagens
  sessionManager.setSocket(sock);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.clear();
      console.log("╔══════════════════════════════════════╗");
      console.log("║   BOT WHATSAPP — ESCANEIE O QR CODE  ║");
      console.log("╚══════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
      console.log("\nAbra o WhatsApp > Aparelhos conectados > Conectar aparelho");
      // Salva o QR para o dashboard mostrar também
      sessionManager.setQR(qr);
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        "Conexão encerrada. Motivo:",
        lastDisconnect?.error?.message || "desconhecido"
      );

      if (shouldReconnect) {
        console.log("Reconectando em 3 segundos...");
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log("Sessão encerrada. Deletando sessão e aguardando novo QR...");
        await rm("auth_info_baileys", { recursive: true, force: true });
        sessionManager.setConnected(false);
        sessionManager.setQR(null);
        setTimeout(connectToWhatsApp, 3000);
      }
    }

    if (connection === "open") {
      console.clear();
      const numero = sock.user?.id?.split(":")[0];
      console.log("✅ Bot conectado ao WhatsApp!");
      console.log(`📱 Número: ${numero}`);
      console.log(`🌐 Dashboard: http://localhost:3000`);
      console.log("─".repeat(40));
      sessionManager.setQR(null);
      sessionManager.setConnected(true);
      sessionManager.setNumero(numero);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue; // ignora mensagens enviadas pelo bot
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // ignora grupos

      if (msg.key.remoteJid === "status@broadcast") continue; // ignora status
      if (msg.key.remoteJid?.includes("@broadcast")) continue; // ignora broadcasts/canais
      if (msg.message?.reactionMessage) continue; // ignora reações
      if (msg.message?.call) continue; // ignora chamadas

      await handleMessage(sock, msg);
    }
  });
}

// Inicia o dashboard web e depois conecta ao WhatsApp
async function main() {
  await loadConfig();
  startDashboard();
  sessionManager.setReconnectFn(connectToWhatsApp);
  connectToWhatsApp();
}

main();