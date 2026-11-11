// js/modules/crm_conversao_oportunidades_actions.js
// Ações de Conversão de Demanda Reprimida & Follow-up Comercial B2B
// Teto Modular: <= 250 linhas

(function (root) {
  'use strict';

  function abrirModalConverterOportunidade(oportunidadeId) {
    const S = root.S;
    if (typeof S === 'undefined' || !S.opportunities) return;
    const opp = S.opportunities.find(o => o.id === oportunidadeId);
    if (!opp) {
      if (typeof root.torrar === 'function') root.torrar('Oportunidade não encontrada.');
      return;
    }

    const centrosCusto = (S.costCenters || []).filter(c => !c.clienteId || c.clienteId === opp.clienteId);
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalConverterOportunidadeHtml === 'function') {
      root.abrirModalGenerico(root.modalConverterOportunidadeHtml(opp, centrosCusto));
    }
  }

  async function confirmarConversaoOportunidade(oportunidadeId) {
    const chks = document.querySelectorAll('.chk-item-conversao:checked');
    const itensSelecionadosIds = Array.from(chks).map(c => c.value);
    const selCC = document.getElementById('sel-cc-conversao');
    const centroCustoId = selCC ? selCC.value : null;
    const chkAlcada = document.getElementById('chk-alcada-override');
    const autorizarEstouroAlcada = Boolean(chkAlcada && chkAlcada.checked);

    if (typeof root.torrar === 'function') root.torrar('Convertendo oportunidade em OS...');
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
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao converter oportunidade em OS.');
        return;
      }
      if (typeof root.torrar === 'function') root.torrar(`OS #${data.novaOS.num} criada com sucesso!`);
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao converter oportunidade.');
    }
  }

  function abrirModalRegistrarFollowUp(oportunidadeId) {
    const S = root.S;
    if (typeof S === 'undefined' || !S.opportunities) return;
    const opp = S.opportunities.find(o => o.id === oportunidadeId);
    if (!opp) {
      if (typeof root.torrar === 'function') root.torrar('Oportunidade não encontrada.');
      return;
    }
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalRegistrarFollowUpHtml === 'function') {
      root.abrirModalGenerico(root.modalRegistrarFollowUpHtml(opp));
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

    if (typeof root.torrar === 'function') root.torrar('Salvando interação...');
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
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao registrar interação.');
        return;
      }
      if (typeof root.torrar === 'function') root.torrar('Follow-up registrado com sucesso!');
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao salvar follow-up.');
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

  const actions = {
    abrirModalConverterOportunidade,
    confirmarConversaoOportunidade,
    abrirModalRegistrarFollowUp,
    confirmarRegistroFollowUp,
    salvarOrcamentoCentroCusto
  };

  if (typeof window !== 'undefined') Object.assign(window, actions);
  if (typeof globalThis !== 'undefined') Object.assign(globalThis, actions);

})(typeof window !== 'undefined' ? window : globalThis);

