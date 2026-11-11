// js/modules/orcamento_parcial_actions.js
// Ações e Handlers de Aprovação Parcial de Orçamentos e Centros de Custo B2B
// Teto Modular: <= 250 linhas

(function (root) {
  'use strict';

  function moeda(v) {
    if (typeof root.fmtMoeda === 'function') return root.fmtMoeda(v);
    const n = Number(v) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function atualizarCalculoAprovacaoParcial() {
    let totalAprovado = 0;
    let totalAdiado = 0;

    const rows = document.querySelectorAll('.item-aprovacao-row');
    rows.forEach(row => {
      const valor = Number(row.getAttribute('data-valor') || 0);
      const selStatus = row.querySelector('.select-status-item');
      const boxCampos = row.querySelector('.campos-adiamento');
      const status = selStatus ? selStatus.value : 'aprovado';

      if (status === 'aprovado') {
        totalAprovado += valor;
        if (boxCampos) boxCampos.classList.add('d-none');
      } else {
        totalAdiado += valor;
        if (boxCampos) boxCampos.classList.remove('d-none');
      }
    });

    const elAprov = document.getElementById('resumo_total_aprovado');
    if (elAprov) elAprov.textContent = moeda(totalAprovado);

    const elAdiado = document.getElementById('resumo_total_adiado');
    if (elAdiado) elAdiado.textContent = moeda(totalAdiado);
  }

  async function abrirModalAprovacaoParcial(osId) {
    if (!osId) return;
    const state = root.S || {};
    const os = (state.os || []).find(o => o.id === osId || String(o.num) === String(osId));
    if (!os) {
      if (typeof root.toast === 'function') root.toast('Ordem de serviço não encontrada.', 'warning');
      return;
    }

    const clienteId = os.cli || os.clienteId;
    const cliente = (state.clientes || []).find(c => c.id === clienteId);
    const centrosCusto = (cliente && Array.isArray(cliente.centrosCusto)) ? cliente.centrosCusto : (state.costCenters || []);

    if (typeof root.modalAprovacaoParcialHtml === 'function') {
      const html = root.modalAprovacaoParcialHtml(os, centrosCusto);
      if (typeof root.abrirModalGenerico === 'function') {
        root.abrirModalGenerico(html);
      } else if (typeof root.abrirFolha === 'function') {
        root.abrirFolha(html);
      }
    }
    atualizarCalculoAprovacaoParcial();
  }

  async function confirmarAprovacaoParcial(osId) {
    if (!osId) return;
    const rows = document.querySelectorAll('.item-aprovacao-row');
    const itens = [];

    rows.forEach(row => {
      const id = row.getAttribute('data-id');
      const tipo = row.getAttribute('data-tipo');
      const selStatus = row.querySelector('.select-status-item');
      const selCrit = row.querySelector('.select-criticidade');
      const inputMotivo = row.querySelector('.input-motivo');

      const statusItem = selStatus ? selStatus.value : 'aprovado';
      const criticidade = selCrit ? selCrit.value : 'media';
      const motivo = inputMotivo ? inputMotivo.value.trim() : '';

      itens.push({
        id,
        tipo,
        statusItem,
        criticidade,
        motivo,
        prazoDias: criticidade === 'alta' ? 15 : (criticidade === 'media' ? 30 : 45)
      });
    });

    const selCC = document.getElementById('aprov_centro_custo_id');
    const centroCustoId = selCC ? selCC.value : null;

    try {
      const res = await fetch(`/api/os/${encodeURIComponent(osId)}/aprovacao-parcial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens,
          centroCustoId,
          observacoes: 'Aprovação parcial registrada pelo painel web'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar aprovação parcial.');
      }

      if (typeof root.toast === 'function') {
        root.toast('Aprovação parcial concluída com sucesso! Demanda reprimida enviada ao CRM.', 'success');
      }

      if (typeof root.fecharModalGenerico === 'function') {
        root.fecharModalGenerico();
      } else if (typeof root.fecharFolha === 'function') {
        root.fecharFolha();
      }

      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.toast === 'function') {
        root.toast(err.message, 'danger');
      } else {
        alert(err.message);
      }
    }
  }

  root.atualizarCalculoAprovacaoParcial = atualizarCalculoAprovacaoParcial;
  root.abrirModalAprovacaoParcial = abrirModalAprovacaoParcial;
  root.confirmarAprovacaoParcial = confirmarAprovacaoParcial;

})(typeof window !== 'undefined' ? window : globalThis);

