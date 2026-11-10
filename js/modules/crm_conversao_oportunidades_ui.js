'use strict';

/**
 * Pátio CRM — UI de Conversão de Demanda Reprimida & Fila Ativa de Follow-up
 * Módulo de interface (< 300 linhas) para operação comercial B2B.
 */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatMoeda(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderFilaFollowUpHtml(fila = [], resumo = {}) {
  const badgeClasses = {
    vencida: 'background:#fee2e2;color:#991b1b;border:1px solid #f87171',
    hoje: 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d',
    futura: 'background:#e0f2fe;color:#075985;border:1px solid #7dd3fc'
  };
  const badgeLabels = { vencida: '🚨 Vencida', hoje: '⚡ Para Hoje', futura: '📅 Agendada' };

  const total = fila.length;
  if (total === 0) {
    return `
      <div class="card card-p text-center" style="padding:32px;color:var(--aco-500)">
        <p style="font-size:15px;font-weight:600;margin-bottom:6px">Nenhum follow-up pendente na fila ativa.</p>
        <p style="font-size:13px">Todas as demandas reprimidas e orçamentos adiados estão em dia.</p>
      </div>
    `;
  }

  const cardsHtml = fila.map(item => {
    const stBadge = badgeClasses[item.statusFollowUp] || badgeClasses.futura;
    const stLabel = badgeLabels[item.statusFollowUp] || item.statusFollowUp;
    const critBadge = item.criticidadeMaxima === 'alta' ? 'color:#dc2626;font-weight:700' : (item.criticidadeMaxima === 'media' ? 'color:#d97706;font-weight:600' : 'color:#16a34a');

    return `
      <div class="card card-p" style="margin-bottom:12px;border-left:4px solid ${item.statusFollowUp === 'vencida' ? '#ef4444' : (item.statusFollowUp === 'hoje' ? '#f59e0b' : '#3b82f6')}">
        <div class="entre" style="margin-bottom:8px">
          <div>
            <span class="badge" style="padding:3px 8px;border-radius:12px;font-size:11px;${stBadge}">${stLabel}</span>
            <strong style="margin-left:8px;font-size:14px">${escapeHtml(item.clienteNome || 'Cliente')}</strong>
            <span style="color:var(--aco-500);font-size:12px;margin-left:6px">• Placa: <b>${escapeHtml(item.placa || 'N/A')}</b></span>
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--azul-600)">
            ${formatMoeda(item.valorTotalEstimado)}
          </div>
        </div>
        <div style="font-size:12px;color:var(--aco-600);margin-bottom:10px">
          <span>OS Origem: <b>#${escapeHtml(item.origemOSNum || item.origemOSId || 'N/A')}</b></span>
          <span style="margin-left:12px">Criticidade: <span style="${critBadge}">${escapeHtml((item.criticidadeMaxima || 'normal').toUpperCase())}</span></span>
          <span style="margin-left:12px">Agendado para: <b>${escapeHtml(item.dataFollowUp || 'Imediato')}</b></span>
        </div>
        <div class="entre" style="gap:8px">
          <div style="font-size:11px;color:var(--aco-500)">
            ${(item.itensAdiados || []).length} item(ns) pendente(s)
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" data-act="abrir-modal-followup-oportunidade" data-id="${item.id}">
              Registrar Contato
            </button>
            <button class="btn btn-sm btn-primario" data-act="abrir-modal-converter-oportunidade" data-id="${item.id}">
              Converter em OS
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="fila-followup-wrapper">
      <div style="margin-bottom:14px;display:flex;gap:12px;align-items:center">
        <span style="font-size:13px;color:var(--aco-600)">Total na Fila: <b>${total}</b></span>
        ${resumo.vencidas ? `<span class="badge" style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:11px">${resumo.vencidas} Vencidas</span>` : ''}
        ${resumo.hoje ? `<span class="badge" style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:11px">${resumo.hoje} Hoje</span>` : ''}
      </div>
      <div class="fila-cards-list">${cardsHtml}</div>
    </div>
  `;
}

function modalConverterOportunidadeHtml(opp, centrosCusto = [], consumoCC = null) {
  const itens = Array.isArray(opp.itensAdiados) ? opp.itensAdiados : [];
  const optionsCC = (centrosCusto || []).map(cc => `
    <option value="${cc.id}" ${opp.centroCustoId === cc.id ? 'selected' : ''}>
      ${escapeHtml(cc.codigo ? `[${cc.codigo}] ` : '')}${escapeHtml(cc.nome)}
    </option>
  `).join('');

  let avisoOrcamentoHtml = '';
  if (consumoCC && consumoCC.limiteMensal > 0) {
    const estourado = consumoCC.consumoTotal > consumoCC.limiteMensal;
    avisoOrcamentoHtml = `
      <div style="margin:10px 0;padding:10px;border-radius:6px;font-size:12px;${estourado ? 'background:#fef2f2;border:1px solid #f87171;color:#991b1b' : 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af'}">
        <div style="font-weight:700;margin-bottom:4px">Orçamento do Centro de Custo:</div>
        <div>Limite: <b>${formatMoeda(consumoCC.limiteMensal)}</b> | Consumido: <b>${formatMoeda(consumoCC.consumoTotal)}</b> (${consumoCC.percentualUtilizado}%)</div>
        <div>Saldo Disponível: <b>${formatMoeda(consumoCC.saldoDisponivel)}</b></div>
        ${estourado ? `
          <div style="margin-top:6px">
            <label style="font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="chk-alcada-override" value="1">
              Autorizar estouro de alçada do Centro de Custo
            </label>
          </div>
        ` : ''}
      </div>
    `;
  }

  const itensChecklist = itens.map(it => `
    <label style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--aco-150);cursor:pointer;font-size:13px">
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" class="chk-item-conversao" value="${it.id}" checked>
        <span>${escapeHtml(it.nome || 'Item')}</span>
        <span style="font-size:11px;color:var(--aco-500)">(${escapeHtml(it.tipo || 'item')})</span>
      </div>
      <div><b>${formatMoeda(it.valor)}</b></div>
    </label>
  `).join('');

  return `
    <div class="modal-conversao-os" style="max-width:540px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-200);padding-bottom:10px;margin-bottom:12px">
        <h3 style="font-size:16px;font-weight:700">Converter Oportunidade em Nova OS</h3>
        <button class="btn-fechar" onclick="fecharModalGenerico()">&times;</button>
      </div>
      <p style="font-size:12px;color:var(--aco-600);margin-bottom:12px">
        Cliente: <b>${escapeHtml(opp.clienteNome || 'Cliente')}</b> | Veículo: <b>${escapeHtml(opp.placa || 'Sem placa')}</b>
      </p>

      <div style="margin-bottom:12px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Centro de Custo (Opcional):</label>
        <select id="sel-cc-conversao" class="input input-sm" style="width:100%">
          <option value="">-- Nenhum Centro de Custo --</option>
          ${optionsCC}
        </select>
      </div>

      ${avisoOrcamentoHtml}

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px">Selecione os itens a converter:</label>
        <div style="border:1px solid var(--aco-200);border-radius:6px;max-height:180px;overflow-y:auto">
          ${itensChecklist}
        </div>
      </div>

      <div class="entre" style="justify-content:flex-end;gap:8px">
        <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
        <button class="btn btn-primario" data-act="confirmar-conversao-oportunidade" data-id="${opp.id}">
          Gerar Ordem de Serviço
        </button>
      </div>
    </div>
  `;
}

function modalRegistrarFollowUpHtml(opp) {
  return `
    <div class="modal-followup-registro" style="max-width:480px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-200);padding-bottom:10px;margin-bottom:12px">
        <h3 style="font-size:16px;font-weight:700">Registrar Contato de Follow-up</h3>
        <button class="btn-fechar" onclick="fecharModalGenerico()">&times;</button>
      </div>
      <p style="font-size:12px;color:var(--aco-600);margin-bottom:12px">
        ${escapeHtml(opp.clienteNome || 'Cliente')} • Placa: <b>${escapeHtml(opp.placa || 'N/A')}</b>
      </p>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Canal de Contato:</label>
        <select id="sel-follow-canal" class="input input-sm" style="width:100%">
          <option value="whatsapp">WhatsApp</option>
          <option value="telefone">Telefone</option>
          <option value="email">E-mail</option>
          <option value="presencial">Presencial no Pátio</option>
        </select>
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Resultado:</label>
        <select id="sel-follow-resultado" class="input input-sm" style="width:100%">
          <option value="contatado">Contatado (Em negociação)</option>
          <option value="reagendado">Reagendado para outra data</option>
          <option value="sem_contato">Tentativa sem sucesso</option>
          <option value="perdida">Perdida / Recusada definitivamente</option>
        </select>
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Próxima Data de Follow-up:</label>
        <input type="date" id="txt-follow-nova-data" class="input input-sm" style="width:100%">
      </div>

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Observações / Parecer do Cliente:</label>
        <textarea id="txt-follow-obs" class="input" rows="3" style="width:100%;font-size:13px" placeholder="Ex: Gestor solicitou ligar na próxima semana..."></textarea>
      </div>

      <div class="entre" style="justify-content:flex-end;gap:8px">
        <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
        <button class="btn btn-primario" data-act="confirmar-followup-oportunidade" data-id="${opp.id}">
          Salvar Interação
        </button>
      </div>
    </div>
  `;
}

function abrirModalConverterOportunidade(oportunidadeId) {
  if (typeof S === 'undefined' || !S.opportunities) return;
  const opp = S.opportunities.find(o => o.id === oportunidadeId);
  if (!opp) {
    if (typeof torrar === 'function') torrar('Oportunidade não encontrada.');
    return;
  }

  const centrosCusto = (S.costCenters || []).filter(c => !c.clienteId || c.clienteId === opp.clienteId);
  if (typeof abrirModalGenerico === 'function') {
    abrirModalGenerico(modalConverterOportunidadeHtml(opp, centrosCusto));
  }
}

async function confirmarConversaoOportunidade(oportunidadeId) {
  const chks = document.querySelectorAll('.chk-item-conversao:checked');
  const itensSelecionadosIds = Array.from(chks).map(c => c.value);
  const selCC = document.getElementById('sel-cc-conversao');
  const centroCustoId = selCC ? selCC.value : null;
  const chkAlcada = document.getElementById('chk-alcada-override');
  const autorizarEstouroAlcada = Boolean(chkAlcada && chkAlcada.checked);

  if (typeof torrar === 'function') torrar('Convertendo oportunidade em OS...');
  try {
    const res = await fetch(`/api/crm/oportunidades-adiadas/${encodeURIComponent(oportunidadeId)}/converter-os`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itensSelecionadosIds,
        centroCustoId: centroCustoId || null,
        autorizarEstouroAlcada
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao converter oportunidade em OS.');
      return;
    }
    if (typeof torrar === 'function') torrar(`OS #${data.novaOS.num} criada com sucesso!`);
    if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao converter oportunidade.');
  }
}

function abrirModalRegistrarFollowUp(oportunidadeId) {
  if (typeof S === 'undefined' || !S.opportunities) return;
  const opp = S.opportunities.find(o => o.id === oportunidadeId);
  if (!opp) {
    if (typeof torrar === 'function') torrar('Oportunidade não encontrada.');
    return;
  }
  if (typeof abrirModalGenerico === 'function') {
    abrirModalGenerico(modalRegistrarFollowUpHtml(opp));
  }
}

async function confirmarRegistroFollowUp(oportunidadeId) {
  const selCanal = document.getElementById('sel-follow-canal');
  const selResultado = document.getElementById('sel-follow-resultado');
  const txtData = document.getElementById('txt-follow-nova-data');
  const txtObs = document.getElementById('txt-follow-obs');

  const canal = selCanal ? selCanal.value : 'whatsapp';
  const resultado = selResultado ? selResultado.value : 'contatado';
  const novaDataFollowUp = txtData ? txtData.value : null;
  const observacao = txtObs ? txtObs.value : '';

  if (typeof torrar === 'function') torrar('Salvando interação...');
  try {
    const res = await fetch(`/api/crm/oportunidades-adiadas/${encodeURIComponent(oportunidadeId)}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canal,
        resultado,
        novaDataFollowUp: novaDataFollowUp || null,
        observacao
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao registrar interação.');
      return;
    }
    if (typeof torrar === 'function') torrar('Follow-up registrado com sucesso!');
    if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao salvar follow-up.');
  }
}

async function salvarOrcamentoCentroCusto(clienteId, centroCustoId, orcamentoData = {}) {
  try {
    const res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/centros-custo/${encodeURIComponent(centroCustoId)}/orcamento`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orcamentoData)
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const apiExports = {
  renderFilaFollowUpHtml,
  modalConverterOportunidadeHtml,
  modalRegistrarFollowUpHtml,
  abrirModalConverterOportunidade,
  confirmarConversaoOportunidade,
  abrirModalRegistrarFollowUp,
  confirmarRegistroFollowUp,
  salvarOrcamentoCentroCusto
};

if (typeof window !== 'undefined') Object.assign(window, apiExports);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, apiExports);
