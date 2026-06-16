import "dotenv/config";
import express from "express";
import session from "express-session";
import { sessionManager } from "./sessions.js";
import { getConfig, saveConfig, resetConfig } from "./config.js";
import { createServer } from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import qrcode from "qrcode";
import rateLimit from "express-rate-limit";
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // janela de 15 minutos
  max: 7,                   // máximo 7 tentativas por IP
  message: { erro: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure: process.env.NODE_ENV === "production", // HTTPS apenas em produção
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

function requireAuth(req, res, next) {
  if (req.session?.logado) return next();
  if (req.path.startsWith("/api")) return res.status(401).json({ erro: "Não autorizado" });
  res.redirect("/login");
}

app.get("/login", (req, res) => {
  if (req.session?.logado) return res.redirect("/");
  res.sendFile(resolve(__dirname, "public", "login.html"));
});

app.post("/login", loginLimiter, (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === (process.env.DASH_USER) && senha === (process.env.DASH_PASS)) {
    req.session.logado = true;
    return res.redirect("/");
  }
  res.redirect("/login?erro=1");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.use('/assets', express.static(resolve(__dirname, 'public/assets')));

app.use(requireAuth);

app.use(express.static(resolve(__dirname, "public")));


app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// STATUS / QR
app.get("/api/status", (req, res) => {
  res.json({ connected: sessionManager.connected, numero: sessionManager.numeroConectado, stats: sessionManager.getStats() });
});

app.post("/api/desconectar", async (req, res) => {
  res.json({ ok: true });
  await sessionManager.desconectar();
});

app.get("/api/qr", async (req, res) => {
  if (!sessionManager.qrCode) return res.json({ qr: null, connected: sessionManager.connected });
  try {
    const qrDataUrl = await qrcode.toDataURL(sessionManager.qrCode);
    res.json({ qr: qrDataUrl, connected: false });
  } catch { res.json({ qr: null }); }
});

// CONVERSAS
app.get("/api/conversas", (req, res) => { res.json(sessionManager.listarConversas()); });

app.get("/api/conversas/:jid", (req, res) => {
  const conversa = sessionManager.getConversa(decodeURIComponent(req.params.jid));
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada" });
  res.json(conversa);
});

app.post("/api/conversas/:jid/assumir", async (req, res) => {
  const jid = decodeURIComponent(req.params.jid).replace(/:\d+@/, "@");
  sessionManager.assumirConversa(jid);
  try {
    const texto = "👤 Um atendente está cuidando do seu atendimento agora.";
    await sessionManager.socket?.sendMessage(jid, { text: texto });
    sessionManager.addMensagem(jid, { de: "bot", texto, hora: new Date().toISOString() });
  } catch { }
  res.json({ ok: true });
});

app.post("/api/conversas/:jid/mensagem", async (req, res) => {
  const jid = decodeURIComponent(req.params.jid).replace(/:\d+@/, "@");
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ erro: "texto é obrigatório" });
  try {
    await sessionManager.socket?.sendMessage(jid, { text: texto });
    sessionManager.addMensagem(jid, { de: "atendente", texto, hora: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/api/conversas/:jid/encerrar", async (req, res) => {
  const jid = decodeURIComponent(req.params.jid).replace(/:\d+@/, "@");
  const { mensagemFinal } = req.body;
  if (mensagemFinal) {
    try {
      await sessionManager.socket?.sendMessage(jid, { text: mensagemFinal });
      sessionManager.addMensagem(jid, { de: "atendente", texto: mensagemFinal, hora: new Date().toISOString() });
    } catch { }
  }
  sessionManager.encerrarConversa(jid);
  res.json({ ok: true });
});

// CONFIG
app.get("/api/config", (req, res) => { res.json(getConfig()); });

app.post("/api/config", async (req, res) => {
  try { await saveConfig(req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});

app.delete("/api/config", async (req, res) => {
  try { await resetConfig(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ erro: err.message }); }
});


app.get("/", (req, res) => { res.sendFile(resolve(__dirname, "public", "index.html")); });

export function startDashboard(port = process.env.PORT || 3000) {
  const server = createServer(app);
  server.listen(port, () => { console.log(`🌐 Dashboard iniciado na porta ${port}`); });
}
