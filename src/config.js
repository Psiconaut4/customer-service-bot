import { readFile, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";

const CONFIG_PATH = "config.json";

// ── DEFAULTS ─────────────────────────────────────────────────────────────────
// Estrutura já preparada para fluxo dinâmico futuro.
// "fluxo" descreve cada etapa: mensagem, tipo, opções e próxima etapa.
// "mensagensAvulsas" são textos fora do fluxo principal (erros, confirmações).

export const DEFAULTS = {
  empresa: "Assistência Técnica",
  numerosIgnorados: [
    "5547996523892",
    "5547999769485",
    "5547997363466",
    "5547992746062",
    "5547920002910",
  ],
  marcas: {
    celular:  ["Samsung", "Apple (iPhone)", "Motorola", "Xiaomi", "LG", "Outro"],
    notebook: ["Dell", "Lenovo", "HP", "Asus", "Acer", "Apple (MacBook)", "Outro"],
    tablet:   ["Samsung", "Apple (iPad)", "Lenovo", "Outro"],
    outro:    ["Outro"],
  },
  problemas: {
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
  },
  fluxo: [
    {
      etapa: "menu_principal",
      mensagem: "Olá, {{nome}}! 👋 Bem-vindo(a) à *{{empresa}}*.\n\nComo posso te ajudar hoje?\n\n1️⃣ Orçamento / Reparo\n2️⃣ Acompanhar conserto em andamento\n3️⃣ Retirada de aparelho pronto\n4️⃣ Outras dúvidas\n\n_Digite o número da opção desejada._",
      tipo: "menu",
      opcoes: [
        { texto: "Orçamento / Reparo",             proximaEtapa: "menu_dispositivo" },
        { texto: "Acompanhar conserto em andamento", proximaEtapa: "acompanhamento"  },
        { texto: "Retirada de aparelho pronto",      proximaEtapa: "retirada"        },
        { texto: "Outras dúvidas",                   proximaEtapa: "duvida_livre"    },
      ],
    },
    {
      etapa: "menu_dispositivo",
      mensagem: "📱 Qual é o tipo do dispositivo?\n\n1️⃣ Celular / Smartphone\n2️⃣ Notebook / Computador\n3️⃣ Tablet / iPad\n4️⃣ Outro\n\n_Digite o número da opção._",
      tipo: "menu",
      campoFicha: "dispositivo",
      opcoes: [
        { texto: "Celular / Smartphone",  chave: "celular",   proximaEtapa: "menu_marca" },
        { texto: "Notebook / Computador", chave: "notebook",  proximaEtapa: "menu_marca" },
        { texto: "Tablet / iPad",         chave: "tablet",    proximaEtapa: "menu_marca" },
        { texto: "Outro",                 chave: "outro",     proximaEtapa: "menu_marca" },
      ],
    },
    {
      etapa: "menu_marca",
      mensagem: "🏷 Qual a marca?\n\n{{opcoes}}\n\n_Digite o número da opção._",
      tipo: "menu_dinamico",
      fonte: "marcas",
      filtro: "_dispositivoKey",
      campoFicha: "marca",
      proximaEtapa: "pedir_modelo",
    },
    {
      etapa: "pedir_modelo",
      mensagem: "✏️ Qual o *modelo* do aparelho?\n\n_Ex: Galaxy S23, iPhone 14, Inspiron 15..._\n\nDigite o modelo:",
      tipo: "texto_livre",
      campoFicha: "modelo",
      proximaEtapa: "menu_problema",
    },
    {
      etapa: "menu_problema",
      mensagem: "🔧 Qual o problema?\n\n{{opcoes}}\n\n_Digite o número da opção._",
      tipo: "menu_dinamico",
      fonte: "problemas",
      filtro: "_dispositivoKey",
      campoFicha: "problema",
      proximaEtapa: "pedir_descricao",
    },
    {
      etapa: "pedir_descricao",
      mensagem: "📝 Descreva o problema com mais detalhes:\n\n_Ex: \"caiu no chão e a tela trincou, ainda liga mas não toca\"_",
      tipo: "texto_livre",
      campoFicha: "descricao",
      proximaEtapa: "fim",
    },
    {
      etapa: "acompanhamento",
      mensagem: "🔍 Informe seu *nome* ou *número de protocolo* para localizarmos seu aparelho:",
      tipo: "texto_livre",
      campoFicha: "protocolo",
      proximaEtapa: "fim",
    },
    {
      etapa: "retirada",
      mensagem: "📦 Informe seu *nome* para verificarmos se o aparelho está pronto para retirada:",
      tipo: "texto_livre",
      campoFicha: "nomeRetirada",
      proximaEtapa: "fim",
    },
    {
      etapa: "duvida_livre",
      mensagem: "💬 Descreva sua dúvida e um atendente responderá em breve:",
      tipo: "texto_livre",
      campoFicha: "duvida",
      proximaEtapa: "fim",
    },
  ],
  mensagensAvulsas: {
    fichaCompleta:
      "✅ Perfeito, *{{nome}}*! Recebemos suas informações:\n\n📱 *Dispositivo:* {{dispositivo}}\n🏷 *Marca:* {{marca}}\n📋 *Modelo:* {{modelo}}\n🔧 *Problema:* {{problema}}\n📝 *Descrição:* {{descricao}}\n\nUm de nossos técnicos analisará e entrará em contato em breve. ⏳",
    aguardandoAtendente:
      "✅ Informações registradas! Um atendente já foi notificado e responderá em breve. 🙏",
    aguardando:
      "⏳ Você já está em nossa fila! Um atendente responderá em breve.",
    opcaoInvalida:
      "❌ Opção inválida. Digite apenas o *número* da opção desejada.",
  },
};

// ── ESTADO EM MEMÓRIA ─────────────────────────────────────────────────────────
let _config = null;

// ── CARREGAR ──────────────────────────────────────────────────────────────────
export async function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, "utf-8");
      // Merge com defaults para garantir campos novos
      _config = deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
      console.log("⚙️  Configurações carregadas do config.json");
    } catch (e) {
      console.warn("⚠️  Erro ao ler config.json, usando defaults:", e.message);
      _config = structuredClone(DEFAULTS);
    }
  } else {
    _config = structuredClone(DEFAULTS);
    console.log("⚙️  Usando configurações padrão");
  }
  return _config;
}

// ── SALVAR ────────────────────────────────────────────────────────────────────
export async function saveConfig(novaConfig) {
  _config = novaConfig;
  await writeFile(CONFIG_PATH, JSON.stringify(novaConfig, null, 2), "utf-8");
}

// ── RESETAR ───────────────────────────────────────────────────────────────────
export async function resetConfig() {
  if (existsSync(CONFIG_PATH)) {
    await rm(CONFIG_PATH, { force: true });
  }
  _config = structuredClone(DEFAULTS);
}

// ── GETTERS ───────────────────────────────────────────────────────────────────
export function getConfig() {
  return _config || structuredClone(DEFAULTS);
}

export function getEtapa(nomeEtapa) {
  const cfg = getConfig();
  return cfg.fluxo.find((e) => e.etapa === nomeEtapa) || null;
}

export function getMsgAvulsa(chave) {
  return getConfig().mensagensAvulsas?.[chave] || "";
}

export function getEmpresa() {
  return getConfig().empresa || "Assistência Técnica";
}

export function getNumerosIgnorados() {
  return getConfig().numerosIgnorados || [];
}

// Retorna as opções de um menu_dinamico dado o nome da fonte e a chave de filtro
// Ex: getOpcoesDinamicas("marcas", "celular") => ["Samsung", "Apple", ...]
export function getOpcoesDinamicas(fonte, chave) {
  const cfg = getConfig();
  return cfg[fonte]?.[chave] || [];
}

// ── SUBSTITUIR PLACEHOLDERS ───────────────────────────────────────────────────
// Substitui {{variavel}} pelos valores do objeto `vars`
export function render(template, vars = {}) {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}