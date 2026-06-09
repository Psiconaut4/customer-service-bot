// ── CONFIG ───────────────────────────────────────────────────────────────────
async function carregarConfig() {
  try {
    configAtual = await fetch('/api/config').then(r => r.json());
    renderConfig(configAtual);
  } catch { toast('Erro ao carregar configurações', 'err'); }
}

function renderConfig(cfg) {
  // Geral
  document.getElementById('cfgEmpresa').value = cfg.empresa || '';

  // Mensagens avulsas
  const msgLabels = {
    fichaCompleta: 'Ficha completa (resumo enviado ao cliente)',
    aguardandoAtendente: 'Aguardando atendente (após fluxo concluído)',
    aguardando: 'Aviso de fila (se cliente insistir)',
    opcaoInvalida: 'Opção inválida',
  };
  const msgContainer = document.getElementById('cfgMensagensAvulsas');
  msgContainer.innerHTML = Object.entries(msgLabels).map(([chave, label]) => `
    <div class="field">
      <label>${label}</label>
      <textarea id="msg_${chave}" rows="3">${cfg.mensagensAvulsas?.[chave] || ''}</textarea>
      <span class="field-hint">Variáveis disponíveis: {{nome}}, {{empresa}}, {{dispositivo}}, {{marca}}, {{modelo}}, {{problema}}, {{descricao}}</span>
    </div>
  `).join('');

  // Fluxo — só texto das mensagens (modo simples)
  const fluxoContainer = document.getElementById('cfgFluxo');
  fluxoContainer.innerHTML = (cfg.fluxo || []).map((etapa, idx) => `
    <div class="etapa-card">
      <div class="etapa-header">
        <span class="etapa-label">${etapa.etapa}</span>
        <span class="etapa-tipo">${etapa.tipo}</span>
      </div>
      <div class="etapa-body">
        <div class="field">
          <label>Mensagem</label>
          <textarea id="etapa_msg_${idx}" rows="4">${etapa.mensagem || ''}</textarea>
          <span class="field-hint">{{opcoes}} é substituído pela lista numerada automaticamente.</span>
        </div>
      </div>
    </div>
  `).join('');

  // no final de renderConfig():
  document.querySelectorAll('.config-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.config-section').classList.toggle('collapsed');
    });
  });

  // Marcas
  renderDictGrid('cfgMarcas', cfg.marcas || {});

  // Problemas
  renderDictGrid('cfgProblemas', cfg.problemas || {});

  // Números ignorados
  renderNumerosIgnorados(cfg.numerosIgnorados || []);
}

function renderDictGrid(containerId, dict) {
  const container = document.getElementById(containerId);
  container.innerHTML = Object.entries(dict).map(([tipo, lista]) => `
    <div>
      <div class="dict-col-title">${tipo}</div>
      <div class="dict-col-body" id="${containerId}_${tipo}">
        ${lista.map((item, i) => dictItemRow(containerId, tipo, i, item)).join('')}
      </div>
      <button class="btn btn-outline" style="margin-top:8px;font-size:11px;padding:5px 10px"
        onclick="addDictItem('${containerId}','${tipo}')">+ Adicionar</button>
    </div>
  `).join('');
}

function dictItemRow(containerId, tipo, idx, value) {
  return `<div class="dict-item-row" id="${containerId}_${tipo}_row${idx}">
    <input type="text" value="${escHtml(value)}" id="${containerId}_${tipo}_${idx}">
    <button class="icon-btn red" onclick="removeDictItem('${containerId}','${tipo}',${idx})" title="Remover">✕</button>
  </div>`;
}

function addDictItem(containerId, tipo) {
  const colBody = document.getElementById(`${containerId}_${tipo}`);
  const rows = colBody.querySelectorAll('.dict-item-row');
  const idx = rows.length;
  const div = document.createElement('div');
  div.innerHTML = dictItemRow(containerId, tipo, idx, '');
  colBody.appendChild(div.firstElementChild);
  document.getElementById(`${containerId}_${tipo}_${idx}`)?.focus();
}

function removeDictItem(containerId, tipo, idx) {
  const row = document.getElementById(`${containerId}_${tipo}_row${idx}`);
  if (row) row.remove();
  // renumera IDs
  const colBody = document.getElementById(`${containerId}_${tipo}`);
  colBody.querySelectorAll('.dict-item-row').forEach((row, i) => {
    row.id = `${containerId}_${tipo}_row${i}`;
    const input = row.querySelector('input');
    if (input) input.id = `${containerId}_${tipo}_${i}`;
    const btn = row.querySelector('button');
    if (btn) btn.setAttribute('onclick', `removeDictItem('${containerId}','${tipo}',${i})`);
  });
}

function getDictValues(containerId, tiposList) {
  const result = {};
  tiposList.forEach(tipo => {
    const colBody = document.getElementById(`${containerId}_${tipo}`);
    if (!colBody) return;
    result[tipo] = Array.from(colBody.querySelectorAll('input'))
      .map(i => i.value.trim())
      .filter(Boolean);
  });
  return result;
}

// Números ignorados
function renderNumerosIgnorados(lista) {
  const tagList = document.getElementById('cfgNumerosTagList');
  tagList.innerHTML = lista.map((n, i) => `
    <div class="tag" id="num_tag_${i}">
      ${escHtml(n)}
      <button class="tag-remove" onclick="removerNumero(${i})" title="Remover">✕</button>
    </div>
  `).join('');
}

function adicionarNumero() {
  const input = document.getElementById('cfgNovoNumero');
  const val = input.value.trim().replace(/\D/g, '');
  if (!val) return;
  if (!configAtual.numerosIgnorados) configAtual.numerosIgnorados = [];
  configAtual.numerosIgnorados.push(val);
  renderNumerosIgnorados(configAtual.numerosIgnorados);
  input.value = '';
}

function removerNumero(idx) {
  configAtual.numerosIgnorados.splice(idx, 1);
  renderNumerosIgnorados(configAtual.numerosIgnorados);
}

// Coleta tudo do formulário e monta o objeto de config
function coletarConfig() {
  const cfg = JSON.parse(JSON.stringify(configAtual)); // deep clone

  cfg.empresa = document.getElementById('cfgEmpresa').value.trim();

  // Mensagens avulsas
  ['fichaCompleta', 'aguardandoAtendente', 'aguardando', 'opcaoInvalida'].forEach(chave => {
    const el = document.getElementById(`msg_${chave}`);
    if (el) cfg.mensagensAvulsas[chave] = el.value;
  });

  // Fluxo — só mensagens
  (cfg.fluxo || []).forEach((etapa, idx) => {
    const el = document.getElementById(`etapa_msg_${idx}`);
    if (el) etapa.mensagem = el.value;
  });

  // Marcas
  const tiposMarcas = Object.keys(cfg.marcas || {});
  cfg.marcas = getDictValues('cfgMarcas', tiposMarcas);

  // Problemas
  const tiposProblemas = Object.keys(cfg.problemas || {});
  cfg.problemas = getDictValues('cfgProblemas', tiposProblemas);

  // Números ignorados — já estão em configAtual.numerosIgnorados
  cfg.numerosIgnorados = configAtual.numerosIgnorados || [];

  return cfg;
}

async function salvarConfig() {
  const cfg = coletarConfig();
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    const data = await res.json();
    if (data.ok) {
      configAtual = cfg;
      toast('Configurações salvas!', 'ok');
    } else {
      toast('Erro: ' + (data.erro || 'desconhecido'), 'err');
    }
  } catch { toast('Erro ao salvar', 'err'); }
}

async function resetarConfig() {
  if (!confirm('Resetar todas as configurações para o padrão? O arquivo config.json será apagado.')) return;
  try {
    const res = await fetch('/api/config', { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      await carregarConfig();
      toast('Configurações resetadas para o padrão.', 'ok');
    } else {
      toast('Erro: ' + (data.erro || 'desconhecido'), 'err');
    }
  } catch { toast('Erro ao resetar', 'err'); }
}
