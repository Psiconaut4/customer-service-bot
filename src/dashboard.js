import "dotenv/config";
import express from "express";
import session from "express-session";
import { sessionManager } from "./sessions.js";
import { createServer } from "http";
import qrcode from "qrcode";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── SESSÃO ────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || "segredo-padrao-troque",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
  },
}));

// ── MIDDLEWARE DE AUTENTICAÇÃO ────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.logado) return next();
  if (req.path.startsWith("/api")) return res.status(401).json({ erro: "Não autorizado" });
  res.redirect("/login");
}

// ── ROTAS DE LOGIN ────────────────────────────────────────
app.get("/login", (req, res) => {
  if (req.session?.logado) return res.redirect("/");
  const erro = req.query.erro ? "Usuário ou senha incorretos." : "";
  res.send(getLoginHTML(erro));
});

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;
  if (
    usuario === (process.env.DASH_USER || "admin") &&
    senha === (process.env.DASH_PASS || "admin")
  ) {
    req.session.logado = true;
    return res.redirect("/");
  }
  res.redirect("/login?erro=1");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Aplica autenticação em todas as rotas abaixo
app.use(requireAuth);

// Impede cache em todas as rotas /api (essencial na Hostinger)
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// ── API REST ──────────────────────────────────────────────

// Status geral
app.get("/api/status", (req, res) => {
  res.json({
    connected: sessionManager.connected,
    numero: sessionManager.numeroConectado,
    stats: sessionManager.getStats(),
  });
});

// Desconectar e trocar de número
app.post("/api/desconectar", async (req, res) => {
  res.json({ ok: true }); // responde antes de desconectar para o cliente receber
  await sessionManager.desconectar();
});

// QR Code para conectar
app.get("/api/qr", async (req, res) => {
  if (!sessionManager.qrCode) {
    return res.json({ qr: null, connected: sessionManager.connected });
  }
  try {
    const qrDataUrl = await qrcode.toDataURL(sessionManager.qrCode);
    res.json({ qr: qrDataUrl, connected: false });
  } catch {
    res.json({ qr: null });
  }
});

// Lista todas as conversas
app.get("/api/conversas", (req, res) => {
  res.json(sessionManager.listarConversas());
});

// Detalhes de uma conversa
app.get("/api/conversas/:jid", (req, res) => {
  const conversa = sessionManager.getConversa(
    decodeURIComponent(req.params.jid)
  );
  if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada" });
  res.json(conversa);
});

// Atendente assume a conversa
app.post("/api/conversas/:jid/assumir", async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  sessionManager.assumirConversa(jid);

  // Avisa o cliente
  try {
    await sessionManager.socket?.sendMessage(jid, {
      text: "👤 Um atendente está cuidando do seu atendimento agora.",
    });
    sessionManager.addMensagem(jid, {
      de: "bot",
      texto: "👤 Um atendente está cuidando do seu atendimento agora.",
      hora: new Date().toISOString(),
    });
  } catch (e) {}

  res.json({ ok: true });
});

// Atendente envia mensagem para o cliente
app.post("/api/conversas/:jid/mensagem", async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ erro: "texto é obrigatório" });

  try {
    await sessionManager.socket?.sendMessage(jid, { text: texto });
    sessionManager.addMensagem(jid, {
      de: "atendente",
      texto,
      hora: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Encerra conversa
app.post("/api/conversas/:jid/encerrar", async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { mensagemFinal } = req.body;

  if (mensagemFinal) {
    try {
      await sessionManager.socket?.sendMessage(jid, { text: mensagemFinal });
      sessionManager.addMensagem(jid, {
        de: "atendente",
        texto: mensagemFinal,
        hora: new Date().toISOString(),
      });
    } catch (e) {}
  }

  sessionManager.encerrarConversa(jid);
  res.json({ ok: true });
});

// ── FRONTEND (HTML inline) ──────────────────────────────────
app.get("/", (req, res) => {
  res.send(getDashboardHTML());
});

export function startDashboard(port = 3000) {
  const server = createServer(app);
  server.listen(port, () => {
    console.log(`🌐 Dashboard iniciado em http://localhost:${port}`);
  });
}

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Central de Atendimento WhatsApp</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  :root {
    --bg: #0d0f0e;
    --surface: #161918;
    --surface2: #1e2220;
    --border: #2a2f2c;
    --green: #25d366;
    --green-dim: #1a9e4a;
    --green-glow: rgba(37,211,102,0.15);
    --yellow: #f0c040;
    --red: #e05555;
    --blue: #5599ee;
    --text: #e8ede9;
    --text-dim: #7a8a7d;
    --mono: 'IBM Plex Mono', monospace;
    --sans: 'IBM Plex Sans', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 13px;
    letter-spacing: 0.05em;
    color: var(--green);
  }

  .logo-icon {
    width: 28px; height: 28px;
    background: var(--green);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }

  .status-pill {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-family: var(--mono);
    font-size: 11px;
    border: 1px solid var(--border);
  }

  .status-pill.online { border-color: var(--green); color: var(--green); background: var(--green-glow); }
  .status-pill.offline { border-color: var(--text-dim); color: var(--text-dim); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  .stats {
    display: flex; gap: 1px;
    border-bottom: 1px solid var(--border);
    background: var(--border);
    flex-shrink: 0;
  }

  .stat {
    flex: 1; padding: 10px 16px;
    background: var(--surface);
    display: flex; align-items: center; justify-content: space-between;
  }

  .stat-label { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }
  .stat-value { font-size: 22px; font-weight: 600; font-family: var(--mono); }
  .stat-value.green { color: var(--green); }
  .stat-value.yellow { color: var(--yellow); }
  .stat-value.blue { color: var(--blue); }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* LISTA DE CONVERSAS */
  .sidebar {
    width: 300px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .filter-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }

  .filter-tab {
    flex: 1;
    padding: 8px;
    font-size: 10px;
    font-family: var(--mono);
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }

  .filter-tab.active { color: var(--green); border-bottom-color: var(--green); }
  .filter-tab:hover { color: var(--text); }

  .conversas-list {
    overflow-y: auto;
    flex: 1;
  }

  .conversa-item {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.1s;
    position: relative;
  }

  .conversa-item:hover { background: var(--surface2); }
  .conversa-item.active { background: var(--surface2); border-left: 3px solid var(--green); }

  .conversa-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .conversa-nome { font-size: 13px; font-weight: 500; }
  .conversa-hora { font-size: 10px; color: var(--text-dim); font-family: var(--mono); }

  .conversa-preview {
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 9px;
    font-family: var(--mono);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge.bot { background: rgba(85,153,238,0.2); color: var(--blue); }
  .badge.aguardando { background: rgba(240,192,64,0.2); color: var(--yellow); }
  .badge.humano { background: rgba(37,211,102,0.2); color: var(--green); }
  .badge.encerrado { background: rgba(122,138,125,0.2); color: var(--text-dim); }

  /* ÁREA DE CHAT */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    background: var(--surface);
  }

  .chat-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .chat-info { display: flex; flex-direction: column; gap: 2px; }
  .chat-nome { font-size: 15px; font-weight: 600; }
  .chat-tel { font-size: 11px; color: var(--text-dim); font-family: var(--mono); }

  .ficha-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ficha-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 20px;
    background: var(--surface2);
    border: 1px solid var(--border);
    font-size: 11px;
    font-family: var(--mono);
    white-space: nowrap;
  }

  .ficha-pill b { color: var(--text-dim); font-weight: 400; margin-right: 2px; }
  .ficha-pill span { color: var(--text); }

  .chat-actions { display: flex; gap: 8px; }

  .btn {
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--mono);
    cursor: pointer;
    border: 1px solid;
    transition: all 0.15s;
    font-weight: 500;
  }

  .btn-green { background: var(--green); color: #000; border-color: var(--green); }
  .btn-green:hover { background: #1eb859; }
  .btn-outline { background: transparent; color: var(--text-dim); border-color: var(--border); }
  .btn-outline:hover { color: var(--text); border-color: var(--text-dim); }
  .btn-red { background: transparent; color: var(--red); border-color: var(--red); }
  .btn-red:hover { background: rgba(224,85,85,0.1); }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .msg {
    max-width: 65%;
    padding: 9px 13px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    position: relative;
  }

  .msg.cliente {
    background: var(--surface2);
    border: 1px solid var(--border);
    align-self: flex-start;
    border-bottom-left-radius: 3px;
  }

  .msg.bot, .msg.atendente {
    background: var(--green-dim);
    align-self: flex-end;
    border-bottom-right-radius: 3px;
  }

  .msg.atendente { background: #1a4a7a; }

  .msg-meta {
    font-size: 10px;
    color: var(--text-dim);
    margin-top: 4px;
    font-family: var(--mono);
  }

  .msg-sender {
    font-size: 10px;
    font-family: var(--mono);
    font-weight: 500;
    margin-bottom: 3px;
    opacity: 0.7;
  }

  .input-area {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
    align-items: flex-end;
    flex-shrink: 0;
    background: var(--surface);
  }

  textarea {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: var(--sans);
    font-size: 13px;
    padding: 10px 12px;
    resize: none;
    min-height: 44px;
    max-height: 120px;
    outline: none;
    transition: border-color 0.15s;
  }

  textarea:focus { border-color: var(--green); }
  textarea::placeholder { color: var(--text-dim); }
  textarea:disabled { opacity: 0.4; cursor: not-allowed; }

  .send-btn {
    width: 44px; height: 44px;
    background: var(--green);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .send-btn:hover { background: #1eb859; }
  .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  /* EMPTY STATE */
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    gap: 12px;
  }

  .empty-icon { font-size: 48px; opacity: 0.3; }
  .empty-text { font-size: 14px; }

  /* QR Screen */
  .qr-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .qr-title { font-size: 18px; font-weight: 600; }
  .qr-sub { font-size: 13px; color: var(--text-dim); }
  .qr-img { border-radius: 12px; border: 3px solid var(--green); }
  .qr-loading { color: var(--text-dim); font-family: var(--mono); font-size: 13px; }

  .no-select { user-select: none; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-icon">💬</div>
    CENTRAL DE ATENDIMENTO
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <span id="numeroConectado" style="font-family:var(--mono);font-size:11px;color:var(--text-dim);display:none"></span>
    <button id="btnDesconectar" onclick="desconectar()" style="display:none" class="btn btn-red">⏏ Trocar número</button>
    <button onclick="logout()" class="btn btn-outline" title="Sair">⎋ Sair</button>
    <div id="statusPill" class="status-pill offline">
      <div class="dot"></div>
      <span id="statusText">Desconectado</span>
    </div>
  </div>
</header>

<div class="stats">
  <div class="stat">
    <div>
      <div class="stat-label">Total</div>
      <div class="stat-value" id="statTotal">0</div>
    </div>
    <span style="font-size:20px">📊</span>
  </div>
  <div class="stat">
    <div>
      <div class="stat-label">Na Fila</div>
      <div class="stat-value yellow" id="statFila">0</div>
    </div>
    <span style="font-size:20px">⏳</span>
  </div>
  <div class="stat">
    <div>
      <div class="stat-label">Em Atendimento</div>
      <div class="stat-value green" id="statHumano">0</div>
    </div>
    <span style="font-size:20px">👤</span>
  </div>
  <div class="stat">
    <div>
      <div class="stat-label">Encerrados</div>
      <div class="stat-value" id="statEncerrado">0</div>
    </div>
    <span style="font-size:20px">✅</span>
  </div>
</div>

<div class="main">
  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Conversas</span>
      <span id="sidebarCount" style="font-size:10px">0</span>
    </div>
    <div class="filter-tabs no-select">
      <button class="filter-tab active" onclick="setFiltro('todos')">Todos</button>
      <button class="filter-tab" onclick="setFiltro('aguardando')">Fila</button>
      <button class="filter-tab" onclick="setFiltro('humano')">Ativos</button>
      <button class="filter-tab" onclick="setFiltro('encerrado')">Enc.</button>
    </div>
    <div class="conversas-list" id="conversasList"></div>
  </div>

  <!-- ÁREA PRINCIPAL -->
  <div class="chat-area" id="chatArea">
    <div class="empty" id="emptyState">
      <div class="empty-icon">💬</div>
      <div class="empty-text">Selecione uma conversa</div>
    </div>
    <div id="qrScreen" style="display:none" class="qr-screen">
      <div class="qr-title">Conectar WhatsApp</div>
      <div class="qr-sub">Escaneie o QR code com seu celular</div>
      <img id="qrImg" class="qr-img" style="display:none" width="220" height="220">
      <div class="qr-loading" id="qrLoading">Aguardando QR code...</div>
    </div>
    <div id="chatView" style="display:none; flex:1; flex-direction:column; overflow:hidden; display:none">
      <div class="chat-header">
        <div class="chat-header-top">
          <div class="chat-info">
            <div class="chat-nome" id="chatNome">—</div>
            <div class="chat-tel" id="chatTel">—</div>
          </div>
          <div class="chat-actions" id="chatActions"></div>
        </div>
        <div class="ficha-pills" id="fichaPills" style="display:none"></div>
      </div>
      <div class="messages" id="messages"></div>
      <div class="input-area">
        <textarea id="msgInput" placeholder="Digite uma mensagem... (Enter para enviar)" rows="1" disabled
          onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
        <button class="send-btn" id="sendBtn" onclick="enviarMensagem()" disabled title="Enviar">➤</button>
      </div>
    </div>
  </div>
</div>

<script>
  let conversas = [];
  let conversaAtiva = null;
  let filtro = 'todos';
  let connected = false;

  // ── POLLING ────────────────────────────────────────────
  async function poll() {
    try {
      const [statusRes, conversasRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/conversas').then(r => r.json())
      ]);

      connected = statusRes.connected;
      conversas = conversasRes;

      updateStatus(statusRes);
      updateStats(statusRes.stats);
      renderSidebar();

      if (conversaAtiva) {
        const atualizada = conversas.find(c => c.jid === conversaAtiva.jid);
        if (atualizada) renderChat(atualizada);
      }

      if (!connected) {
        showQR();
      }
    } catch(e) {}
  }

  async function showQR() {
    if (conversaAtiva) return;
    const data = await fetch('/api/qr').then(r => r.json()).catch(() => null);
    if (!data) return;

    if (data.connected) return;

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('qrScreen').style.display = 'flex';
    document.getElementById('chatView').style.display = 'none';

    if (data.qr) {
      document.getElementById('qrImg').src = data.qr;
      document.getElementById('qrImg').style.display = 'block';
      document.getElementById('qrLoading').style.display = 'none';
    } else {
      document.getElementById('qrLoading').style.display = 'block';
    }
  }

  // ── ESTADO ────────────────────────────────────────────
  function updateStatus({ connected: c, stats, numero }) {
    const pill = document.getElementById('statusPill');
    const txt = document.getElementById('statusText');
    const numEl = document.getElementById('numeroConectado');
    const btnDesc = document.getElementById('btnDesconectar');

    pill.className = 'status-pill ' + (c ? 'online' : 'offline');
    txt.textContent = c ? 'Conectado' : 'Desconectado';

    if (c && numero) {
      numEl.textContent = '+' + numero;
      numEl.style.display = 'block';
      btnDesc.style.display = 'block';
    } else {
      numEl.style.display = 'none';
      btnDesc.style.display = 'none';
    }
  }

  async function desconectar() {
    if (!confirm('Desconectar o número atual e exibir novo QR code?')) return;
    document.getElementById('btnDesconectar').disabled = true;
    await fetch('/api/desconectar', { method: 'POST' });
    conversaAtiva = null;
    document.getElementById('chatView').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('qrScreen').style.display = 'flex';
    document.getElementById('qrImg').style.display = 'none';
    document.getElementById('qrLoading').style.display = 'block';
    document.getElementById('qrLoading').textContent = 'Desconectando... aguarde o QR code';
    document.getElementById('btnDesconectar').disabled = false;
  }

  function updateStats(stats) {
    if (!stats) return;
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statFila').textContent = stats.aguardando;
    document.getElementById('statHumano').textContent = stats.humano;
    document.getElementById('statEncerrado').textContent = stats.encerrado;
  }

  // ── SIDEBAR ───────────────────────────────────────────
  function setFiltro(f) {
    filtro = f;
    document.querySelectorAll('.filter-tab').forEach((el, i) => {
      el.classList.toggle('active', ['todos','aguardando','humano','encerrado'][i] === f);
    });
    renderSidebar();
  }

  function renderSidebar() {
    const lista = filtro === 'todos' ? conversas : conversas.filter(c => c.status === filtro);
    document.getElementById('sidebarCount').textContent = lista.length;
    document.getElementById('conversasList').innerHTML = lista.map(c => converItem(c)).join('');
  }

  function converItem(c) {
    const ultima = c.mensagens[c.mensagens.length - 1];
    const preview = ultima ? ultima.texto.slice(0, 40) : 'Sem mensagens';
    const hora = c.ultimaMensagem ? new Date(c.ultimaMensagem).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
    const ativo = conversaAtiva?.jid === c.jid ? 'active' : '';
    const badges = { bot: 'bot', aguardando: 'aguardando', humano: 'humano', encerrado: 'encerrado' };
    const tipoLabel = { orcamento: '🔧', acompanhamento: '🔍', retirada: '📦', duvida: '💬' };
    const tipoIcon = c.ficha?.tipo ? (tipoLabel[c.ficha.tipo] || '') : '';
    return \`<div class="conversa-item \${ativo}" onclick="abrirConversa('\${encodeURIComponent(c.jid)}')">
      <div class="conversa-top">
        <span class="conversa-nome">\${tipoIcon} \${c.nome}</span>
        <span class="conversa-hora">\${hora}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px">
        <span class="conversa-preview">\${c.ficha?.dispositivo ? c.ficha.dispositivo + (c.ficha.marca ? ' · ' + c.ficha.marca : '') : preview}</span>
        <span class="badge \${badges[c.status] || 'bot'}">\${c.status}</span>
      </div>
    </div>\`;
  }

  // ── CHAT ──────────────────────────────────────────────
  async function abrirConversa(jidEncoded) {
    const jid = decodeURIComponent(jidEncoded);
    const conversa = conversas.find(c => c.jid === jid);
    if (!conversa) return;
    conversaAtiva = conversa;
    renderSidebar();

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('qrScreen').style.display = 'none';
    const cv = document.getElementById('chatView');
    cv.style.display = 'flex';
    cv.style.flexDirection = 'column';
    cv.style.overflow = 'hidden';
    cv.style.flex = '1';

    renderChat(conversa);
  }

  function renderChat(conversa) {
    conversaAtiva = conversa;

    document.getElementById('chatNome').textContent = conversa.nome;
    document.getElementById('chatTel').textContent = '+' + conversa.telefone;

    // Ações conforme status
    const actions = document.getElementById('chatActions');
    if (conversa.status === 'aguardando') {
      actions.innerHTML = \`<button class="btn btn-green" onclick="assumirConversa()">▶ Assumir Atendimento</button>\`;
    } else if (conversa.status === 'humano') {
      actions.innerHTML = \`<button class="btn btn-red" onclick="encerrarConversa()">✕ Encerrar</button>\`;
    } else {
      actions.innerHTML = '';
    }

    // Input habilitado só para atendente
    const canType = conversa.status === 'humano';
    document.getElementById('msgInput').disabled = !canType;
    document.getElementById('msgInput').placeholder = canType
      ? 'Digite uma mensagem...'
      : 'Assuma o atendimento para enviar mensagens';
    document.getElementById('sendBtn').disabled = !canType;

    // Ficha técnica — pílulas no header
    const fichaPills = document.getElementById('fichaPills');
    const ficha = conversa.ficha || {};
    const tipoLabel = { orcamento: '🔧 Orçamento', acompanhamento: '🔍 Acompanhamento', retirada: '📦 Retirada', duvida: '💬 Dúvida' };
    const pills = [];
    if (ficha.tipo)         pills.push(\`<div class="ficha-pill"><b>tipo</b><span>\${tipoLabel[ficha.tipo] || ficha.tipo}</span></div>\`);
    if (ficha.dispositivo)  pills.push(\`<div class="ficha-pill"><b>dispositivo</b><span>\${ficha.dispositivo}</span></div>\`);
    if (ficha.marca)        pills.push(\`<div class="ficha-pill"><b>marca</b><span>\${ficha.marca}</span></div>\`);
    if (ficha.modelo)       pills.push(\`<div class="ficha-pill"><b>modelo</b><span>\${ficha.modelo}</span></div>\`);
    if (ficha.problema)     pills.push(\`<div class="ficha-pill"><b>problema</b><span>\${ficha.problema}</span></div>\`);
    if (ficha.protocolo)    pills.push(\`<div class="ficha-pill"><b>protocolo</b><span>\${ficha.protocolo}</span></div>\`);
    if (ficha.nomeRetirada) pills.push(\`<div class="ficha-pill"><b>nome</b><span>\${ficha.nomeRetirada}</span></div>\`);
    if (ficha.descricao)    pills.push(\`<div class="ficha-pill" title="\${ficha.descricao}"><b>descrição</b><span>\${ficha.descricao.slice(0,40)}\${ficha.descricao.length>40?'…':''}</span></div>\`);
    if (pills.length) {
      fichaPills.innerHTML = pills.join('');
      fichaPills.style.display = 'flex';
    } else {
      fichaPills.style.display = 'none';
    }

    // Mensagens
    const container = document.getElementById('messages');
    container.innerHTML = conversa.mensagens.map(m => {
      const hora = new Date(m.hora).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
      const senderLabel = { cliente: conversa.nome, bot: 'Bot', atendente: 'Atendente' }[m.de];
      return \`<div class="msg \${m.de}">
        <div class="msg-sender">\${senderLabel}</div>
        \${m.texto}
        <div class="msg-meta">\${hora}</div>
      </div>\`;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  async function assumirConversa() {
    if (!conversaAtiva) return;
    await fetch(\`/api/conversas/\${encodeURIComponent(conversaAtiva.jid)}/assumir\`, { method: 'POST' });
    await poll();
  }

  async function encerrarConversa() {
    if (!conversaAtiva) return;
    const msg = prompt('Mensagem de encerramento (opcional):');
    await fetch(\`/api/conversas/\${encodeURIComponent(conversaAtiva.jid)}/encerrar\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagemFinal: msg || '' })
    });
    conversaAtiva = null;
    document.getElementById('chatView').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
    await poll();
  }

  async function enviarMensagem() {
    if (!conversaAtiva) return;
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if (!texto) return;

    input.value = '';
    input.style.height = 'auto';

    await fetch(\`/api/conversas/\${encodeURIComponent(conversaAtiva.jid)}/mensagem\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto })
    });

    await poll();
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  async function logout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  // Redireciona para login se sessão expirar
  async function pollComAuth() {
    try {
      await poll();
    } catch (e) {
      if (e?.status === 401) window.location.href = '/login';
    }
  }

  // Inicia polling
  poll();
  setInterval(poll, 2000);
</script>
</body>
</html>`;
}

function getLoginHTML(erro = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login — Central de Atendimento</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

  :root {
    --bg: #0d0f0e;
    --surface: #161918;
    --surface2: #1e2220;
    --border: #2a2f2c;
    --green: #25d366;
    --green-glow: rgba(37,211,102,0.12);
    --red: #e05555;
    --text: #e8ede9;
    --text-dim: #7a8a7d;
    --mono: 'IBM Plex Mono', monospace;
    --sans: 'IBM Plex Sans', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 380px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--green);
    margin-bottom: 32px;
    letter-spacing: 0.05em;
  }

  .logo-icon {
    width: 32px; height: 32px;
    background: var(--green);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }

  h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .sub {
    font-size: 13px;
    color: var(--text-dim);
    margin-bottom: 28px;
  }

  label {
    display: block;
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }

  input {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    padding: 11px 14px;
    outline: none;
    margin-bottom: 16px;
    transition: border-color 0.15s;
  }

  input:focus { border-color: var(--green); }

  .btn-login {
    width: 100%;
    padding: 12px;
    background: var(--green);
    color: #000;
    border: none;
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 4px;
    transition: background 0.15s;
  }

  .btn-login:hover { background: #1eb859; }

  .erro {
    background: rgba(224,85,85,0.1);
    border: 1px solid var(--red);
    color: var(--red);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 20px;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">💬</div>
    CENTRAL DE ATENDIMENTO
  </div>
  <h1>Entrar</h1>
  <p class="sub">Acesso restrito a atendentes autorizados.</p>
  ${erro ? `<div class="erro">⚠ ${erro}</div>` : ""}
  <form method="POST" action="/login">
    <label>Usuário</label>
    <input type="text" name="usuario" autocomplete="username" autofocus required>
    <label>Senha</label>
    <input type="password" name="senha" autocomplete="current-password" required>
    <button type="submit" class="btn-login">Entrar →</button>
  </form>
</div>
</body>
</html>`;
}