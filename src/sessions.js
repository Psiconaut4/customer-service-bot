// Gerenciador de sessões e filas de atendimento

class SessionManager {
  constructor() {
    this.socket = null;
    this.qrCode = null;
    this.connected = false;
    this.numeroConectado = null;
    this.reconnectFn = null; // função para reconectar após desconexão

    // Mapa de conversas: jid -> { jid, nome, telefone, mensagens[], status, iniciadoEm }
    this.conversas = new Map();
  }

  setSocket(sock) {
    this.socket = sock;
  }

  setQR(qr) {
    this.qrCode = qr;
  }

  setConnected(val) {
    this.connected = val;
    if (!val) this.numeroConectado = null;
  }

  setNumero(numero) {
    this.numeroConectado = numero;
  }

  setReconnectFn(fn) {
    this.reconnectFn = fn;
  }

  async desconectar() {
    try { await this.socket?.logout(); } catch { }
    const { rm } = await import("fs/promises");
    await rm("auth_info_baileys", { recursive: true, force: true });
    this.connected = false;
    this.numeroConectado = null;
    this.socket = null;
    this.conversas.clear();
    if (this.reconnectFn) setTimeout(this.reconnectFn, 1000);
  }

  // Cria ou retorna conversa existente
  getOrCreateConversa(jid, nomeContato, telefone) {
    if (!this.conversas.has(jid)) {
      const telefoneFallback = telefone || jid.split("@")[0];  // fallback se não vier
      this.conversas.set(jid, {
        jid,
        nome: nomeContato || telefoneFallback,
        telefone: telefoneFallback,  // ← usa o real
        mensagens: [],
        status: "bot",
        etapa: "inicio",        // controla em qual passo do fluxo o cliente está
        ficha: {},              // dados coletados: tipo, dispositivo, marca, modelo, problema
        iniciadoEm: new Date().toISOString(),
        ultimaMensagem: new Date().toISOString(),
        avisoEnviado: false,
      });
    }
    return this.conversas.get(jid);
  }

  addMensagem(jid, mensagem) {
    const conversa = this.conversas.get(jid);
    if (!conversa) return;
    conversa.mensagens.push(mensagem);
    conversa.ultimaMensagem = new Date().toISOString();
  }

  setStatus(jid, status) {
    const conversa = this.conversas.get(jid);
    if (conversa) conversa.status = status;
  }

  setEtapa(jid, etapa) {
    const conversa = this.conversas.get(jid);
    if (conversa) conversa.etapa = etapa;
  }

  updateFicha(jid, dados) {
    const conversa = this.conversas.get(jid);
    if (conversa) conversa.ficha = { ...conversa.ficha, ...dados };
  }

  getStatus(jid) {
    return this.conversas.get(jid)?.status || "bot";
  }

  // Lista todas as conversas para o dashboard
  listarConversas() {
    return Array.from(this.conversas.values())
      .sort((a, b) => new Date(b.ultimaMensagem) - new Date(a.ultimaMensagem));
  }

  getConversa(jid) {
    return this.conversas.get(jid) || null;
  }

  // Atendente assume a conversa
  assumirConversa(jid) {
    this.setStatus(jid, "humano");
    const conversa = this.conversas.get(jid);
    if (conversa) conversa.assumidoEm = new Date().toISOString();
  }

  // Devolve para fila
  devolverParaFila(jid) {
    this.setStatus(jid, "aguardando");
  }

  // Fecha a conversa
  encerrarConversa(jid) {
    this.setStatus(jid, "encerrado");
  }

  getStats() {
    const conversas = this.listarConversas();
    return {
      total: conversas.length,
      bot: conversas.filter((c) => c.status === "bot").length,
      aguardando: conversas.filter((c) => c.status === "aguardando").length,
      humano: conversas.filter((c) => c.status === "humano").length,
      encerrado: conversas.filter((c) => c.status === "encerrado").length,
    };
  }
}

export const sessionManager = new SessionManager();