import { sessionManager } from "./sessions.js";
import {
  getEtapa,
  getMsgAvulsa,
  getNumerosIgnorados,
  getOpcoesDinamicas,
  getEmpresa,
  render,
} from "./config.js";

// ── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;

  //usar senderPn para pegar número real, senão jid
  const senderJid = msg.key.senderPn || jid;
  const telefone = senderJid.split("@")[0];

  if (jid.endsWith("@newsletter")) return;
  if (jid === "status@broadcast") return;

  // Ignora números da lista de bloqueio (vem do config)
  if (getNumerosIgnorados().includes(telefone)) return;

  const texto = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ""
  ).trim();

  const nomeContato = msg.pushName || telefone;
  const conversa = sessionManager.getOrCreateConversa(jid, nomeContato);

  sessionManager.addMensagem(jid, {
    de: "cliente",
    texto: texto || "[mídia recebida]",
    hora: new Date().toISOString(),
  });

  // Atendente humano assumiu — bot não interfere
  if (conversa.status === "humano") return;

  // Aguardando atendente — avisa uma vez e para
  if (conversa.status === "aguardando") {
    if (!conversa.avisoEnviado) {
      await enviar(sock, jid, getMsgAvulsa("aguardando"));
      conversa.avisoEnviado = true;
    }
    return;
  }

  // ── INÍCIO: envia a primeira etapa do fluxo ────────────────────────────────
  if (conversa.etapa === "inicio") {
    const primeiraEtapa = getEtapa("menu_principal");
    if (primeiraEtapa) {
      await enviarEtapa(sock, jid, primeiraEtapa, conversa);
      sessionManager.setEtapa(jid, "menu_principal");
    }
    return;
  }

  // ── DISPATCHER DINÂMICO ────────────────────────────────────────────────────
  const etapaAtual = getEtapa(conversa.etapa);

  if (!etapaAtual) {
    // Etapa não encontrada no fluxo — segurança
    console.warn(`⚠️  Etapa desconhecida: ${conversa.etapa} (jid: ${jid})`);
    return;
  }

  switch (etapaAtual.tipo) {
    case "menu":
      await processarMenu(sock, jid, texto, etapaAtual, conversa, nomeContato);
      break;
    case "menu_dinamico":
      await processarMenuDinamico(sock, jid, texto, etapaAtual, conversa, nomeContato);
      break;
    case "texto_livre":
      await processarTextoLivre(sock, jid, texto, etapaAtual, conversa, nomeContato);
      break;
    default:
      console.warn(`⚠️  Tipo de etapa desconhecido: ${etapaAtual.tipo}`);
  }
}

// ── PROCESSADORES POR TIPO ───────────────────────────────────────────────────

async function processarMenu(sock, jid, texto, etapa, conversa, nomeContato) {
  const op = parseInt(texto);
  const opcao = etapa.opcoes?.[op - 1];

  if (!opcao) {
    await enviar(sock, jid, getMsgAvulsa("opcaoInvalida"));
    await enviarEtapa(sock, jid, etapa, conversa);
    return;
  }

  // Salva o texto da opção no campo da ficha
  if (etapa.campoFicha) {
    sessionManager.updateFicha(jid, { [etapa.campoFicha]: opcao.texto });
  }

  // Se a opção tiver uma chave (ex: "celular"), salva como _dispositivoKey
  // para que os menus dinâmicos de marca/problema saibam qual dicionário usar
  if (opcao.chave) {
    sessionManager.updateFicha(jid, { _dispositivoKey: opcao.chave });
  }

  await avancar(sock, jid, opcao.proximaEtapa, conversa, nomeContato);
}

async function processarMenuDinamico(sock, jid, texto, etapa, conversa, nomeContato) {
  // Busca as opções do dicionário correto usando fonte + filtro
  const chave = conversa.ficha[etapa.filtro] || "";
  const opcoes = getOpcoesDinamicas(etapa.fonte, chave);

  const op = parseInt(texto);

  if (!op || op < 1 || op > opcoes.length) {
    const msgInvalida = getMsgAvulsa("opcaoInvalida");
    await enviar(sock, jid, msgInvalida);
    await enviarEtapa(sock, jid, etapa, conversa); // reenvia o menu
    return;
  }

  const escolha = opcoes[op - 1];

  if (etapa.campoFicha) {
    sessionManager.updateFicha(jid, { [etapa.campoFicha]: escolha });
  }

  await avancar(sock, jid, etapa.proximaEtapa, conversa, nomeContato);
}

async function processarTextoLivre(sock, jid, texto, etapa, conversa, nomeContato) {
  if (!texto || texto.length < 2) {
    await enviar(sock, jid, render(etapa.mensagem, buildVars(conversa, nomeContato)));
    return;
  }

  if (etapa.campoFicha) {
    sessionManager.updateFicha(jid, { [etapa.campoFicha]: texto });
  }

  await avancar(sock, jid, etapa.proximaEtapa, conversa, nomeContato);
}

// ── AVANÇAR PARA PRÓXIMA ETAPA ────────────────────────────────────────────────

async function avancar(sock, jid, proximaEtapa, conversa, nomeContato) {
  if (!proximaEtapa || proximaEtapa === "fim") {
    // Fluxo concluído: envia confirmação e encerra bot
    const ficha = sessionManager.getConversa(jid)?.ficha || {};
    const msgFicha = getMsgAvulsa("fichaCompleta");
    const msgAguardando = getMsgAvulsa("aguardandoAtendente");

    if (msgFicha) {
      await enviar(sock, jid, render(msgFicha, { ...ficha, nome: nomeContato }));
    }
    if (msgAguardando) {
      await enviar(sock, jid, render(msgAguardando, { nome: nomeContato }));
    }

    encerrarBot(jid, nomeContato);
    return;
  }

  const proxEtapa = getEtapa(proximaEtapa);
  if (!proxEtapa) {
    console.warn(`⚠️  Próxima etapa não encontrada no fluxo: ${proximaEtapa}`);
    return;
  }

  // Atualiza etapa da sessão e envia a mensagem da próxima etapa
  sessionManager.setEtapa(jid, proximaEtapa);

  // Recarrega conversa para ter ficha atualizada antes de renderizar
  const conversaAtualizada = sessionManager.getConversa(jid);
  await enviarEtapa(sock, jid, proxEtapa, conversaAtualizada, nomeContato);
}

// ── ENVIAR ETAPA ──────────────────────────────────────────────────────────────
// Monta e envia a mensagem de uma etapa, incluindo opções numeradas se necessário

async function enviarEtapa(sock, jid, etapa, conversa, nomeContato) {
  let opcoesTexto = "";

  if (etapa.tipo === "menu" && etapa.opcoes) {
    opcoesTexto = etapa.opcoes
      .map((o, i) => `${i + 1}️⃣ ${o.texto}`)
      .join("\n");
  }

  if (etapa.tipo === "menu_dinamico") {
    const chave = conversa?.ficha?.[etapa.filtro] || "";
    const opcoes = getOpcoesDinamicas(etapa.fonte, chave);
    opcoesTexto = opcoes.map((o, i) => `${i + 1}️⃣ ${o}`).join("\n");
  }

  const vars = {
    ...buildVars(conversa, nomeContato),
    opcoes: opcoesTexto,
  };

  const mensagem = render(etapa.mensagem, vars);
  await enviar(sock, jid, mensagem);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function buildVars(conversa, nomeContato) {
  return {
    nome: nomeContato || conversa?.nome || "",
    empresa: getEmpresa(),
    ...conversa?.ficha,
  };
}

function encerrarBot(jid, nomeContato) {
  sessionManager.setStatus(jid, "aguardando");
  sessionManager.setEtapa(jid, "aguardando");
  console.log(`📋 Ficha completa — ${nomeContato} (${jid.split("@")[0]})`);
}

async function enviar(sock, jid, texto) {
  if (!texto) return;

  //delay para evitar flood
  const delay = Math.min(
    800 + texto.length * 25,
    3000
  );
  await new Promise((resolve) => setTimeout(resolve, delay));

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