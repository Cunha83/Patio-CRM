// js/modules/orcamento_parcial_ui.js
// Interface de Aprovação Parcial de Orçamentos, Conversão em CRM e Centros de Custo B2B

(function (root) {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function moeda(v) {
    if (typeof root.fmtMoeda === 'function') return root.fmtMoeda(v);
    const n = Number(v) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function renderBadgeStatusItemHtml(status) {
    const st = String(status || 'aprovado').toLowerCase();
    if (st === 'aprovado') {
      return '<span class="badge badge-success" style="background:#10b981;color:#fff;font-weight:600;padding:3px 8px;border-radius:4px;">Aprovado</span>';
    }
    if (st === 'adiado') {
      return '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;font-weight:600;padding:3px 8px;border-radius:4px;">Adiado (CRM)</span>';
    }
    return '<span class="badge badge-danger" style="background:#ef4444;color:#fff;font-weight:600;padding:3px 8px;border-radius:4px;">Recusado</span>';
  }

  function renderBadgeCriticidadeHtml(crit) {
    const c = String(crit || 'media').toLowerCase();
    if (c === 'alta') {
      return '<span class="badge badge-danger" style="background:#b91c1c;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px;">Alta (D+15)</span>';
    }
    if (c === 'media') {
      return '<span class="badge badge-warning" style="background:#d97706;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px;">Média (D+30)</span>';
    }
    return '<span class="badge badge-secondary" style="background:#4b5563;color:#fff;font-weight:600;padding:2px 6px;border-radius:3px;">Baixa (D+45)</span>';
  }

  function modalAprovacaoParcialHtml(os, centrosCusto = []) {
    if (!os) return '<div class="p-4 text-center text-muted">Ordem de serviço não selecionada.</div>';

    const servicos = Array.isArray(os.servicos) ? os.servicos : [];
    const pecas = Array.isArray(os.pecas) ? os.pecas : [];
    const totalOriginal = Number(os.total || os.valorTotal || 0);

    const optionsCC = (centrosCusto || []).map(cc => `
      <option value="${esc(cc.id)}" ${os.centroCustoId === cc.id ? 'selected' : ''}>
        ${esc(cc.codigo)} - ${esc(cc.nome)}
      </option>
    `).join('');

    let srvHtml = '';
    if (servicos.length === 0) {
      srvHtml = '<tr><td colspan="4" class="text-muted text-center py-2">Nenhum serviço apontado.</td></tr>';
    } else {
      srvHtml = servicos.map((s, idx) => {
        const val = Number(s.valor || s.preco || s.total || 0);
        const st = s.statusItem || 'aprovado';
        return `
          <tr class="item-aprovacao-row" data-tipo="servico" data-id="${esc(s.id)}" data-valor="${val}">
            <td><strong>${idx + 1}. ${esc(s.desc || s.nome || 'Serviço')}</strong></td>
            <td class="text-end font-monospace">${moeda(val)}</td>
            <td style="width:140px">
              <select class="form-select form-select-sm select-status-item" data-id="${esc(s.id)}" onchange="atualizarCalculoAprovacaoParcial()">
                <option value="aprovado" ${st === 'aprovado' ? 'selected' : ''}>Aprovar</option>
                <option value="adiado" ${st === 'adiado' ? 'selected' : ''}>Adiar (CRM)</option>
                <option value="recusado" ${st === 'recusado' ? 'selected' : ''}>Recusar</option>
              </select>
            </td>
            <td style="width:200px">
              <div class="campos-adiamento ${st === 'aprovado' ? 'd-none' : ''}">
                <select class="form-select form-select-sm select-criticidade mb-1">
                  <option value="alta" ${s.criticidade === 'alta' ? 'selected' : ''}>Urgente (D+15)</option>
                  <option value="media" ${s.criticidade === 'media' || !s.criticidade ? 'selected' : ''}>Preventiva (D+30)</option>
                  <option value="baixa" ${s.criticidade === 'baixa' ? 'selected' : ''}>Opcional (D+45)</option>
                </select>
                <input type="text" class="form-control form-control-sm input-motivo" placeholder="Motivo do adiamento" value="${esc(s.motivo || '')}" />
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    let pecasHtml = '';
    if (pecas.length === 0) {
      pecasHtml = '<tr><td colspan="4" class="text-muted text-center py-2">Nenhuma peça apontada.</td></tr>';
    } else {
      pecasHtml = pecas.map((p, idx) => {
        const val = Number(p.total != null ? p.total : ((p.valor || p.preco || 0) * (p.qtd || 1)));
        const st = p.statusItem || 'aprovado';
        return `
          <tr class="item-aprovacao-row" data-tipo="peca" data-id="${esc(p.id)}" data-valor="${val}">
            <td>
              <strong>${idx + 1}. ${esc(p.nome || p.descricao || 'Peça')}</strong>
              <div class="small text-muted">${Number(p.qtd || 1)}x un. ${moeda(p.valor || p.preco || 0)}</div>
            </td>
            <td class="text-end font-monospace">${moeda(val)}</td>
            <td style="width:140px">
              <select class="form-select form-select-sm select-status-item" data-id="${esc(p.id)}" onchange="atualizarCalculoAprovacaoParcial()">
                <option value="aprovado" ${st === 'aprovado' ? 'selected' : ''}>Aprovar</option>
                <option value="adiado" ${st === 'adiado' ? 'selected' : ''}>Adiar (CRM)</option>
                <option value="recusado" ${st === 'recusado' ? 'selected' : ''}>Recusar</option>
              </select>
            </td>
            <td style="width:200px">
              <div class="campos-adiamento ${st === 'aprovado' ? 'd-none' : ''}">
                <select class="form-select form-select-sm select-criticidade mb-1">
                  <option value="alta" ${p.criticidade === 'alta' ? 'selected' : ''}>Urgente (D+15)</option>
                  <option value="media" ${p.criticidade === 'media' || !p.criticidade ? 'selected' : ''}>Preventiva (D+30)</option>
                  <option value="baixa" ${p.criticidade === 'baixa' ? 'selected' : ''}>Opcional (D+45)</option>
                </select>
                <input type="text" class="form-control form-control-sm input-motivo" placeholder="Motivo do adiamento" value="${esc(p.motivo || '')}" />
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    return `
      <div class="p-3">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
          <div>
            <h5 class="mb-0 font-weight-bold">Aprovação Parcial de Orçamento — OS #${esc(os.num || os.id)}</h5>
            <small class="text-muted">Placa: <strong>${esc(os.placa || 'N/A')}</strong> | Cliente: <strong>${esc(os.cliente || os.cli || 'Cliente')}</strong></small>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-act="fechar-modal">✕</button>
        </div>

        <div class="card bg-light p-2 mb-3">
          <div class="row align-items-center">
            <div class="col-md-6">
              <label class="form-label small font-weight-bold mb-1">Centro de Custo do Frotista:</label>
              <select id="aprov_centro_custo_id" class="form-select form-select-sm">
                <option value="">-- Sem Centro de Custo Vinculado --</option>
                ${optionsCC}
              </select>
            </div>
            <div class="col-md-6 text-end">
              <div class="small text-muted">Total Orçado Original: <strong>${moeda(totalOriginal)}</strong></div>
              <div class="small text-success">Total Aprovado Imediato: <strong id="resumo_total_aprovado">${moeda(totalOriginal)}</strong></div>
              <div class="small text-warning">Demanda Reprimida (CRM): <strong id="resumo_total_adiado">R$ 0,00</strong></div>
            </div>
          </div>
        </div>

        <h6 class="font-weight-bold text-primary mt-2">Mão de Obra e Serviços</h6>
        <div class="table-responsive mb-3">
          <table class="table table-sm table-bordered align-middle">
            <thead class="table-light small">
              <tr>
                <th>Serviço</th>
                <th class="text-end">Valor</th>
                <th>Decisão</th>
                <th>Gestão de Demanda (CRM)</th>
              </tr>
            </thead>
            <tbody>${srvHtml}</tbody>
          </table>
        </div>

        <h6 class="font-weight-bold text-primary mt-2">Peças e Componentes de Suspensão</h6>
        <div class="table-responsive mb-3">
          <table class="table table-sm table-bordered align-middle">
            <thead class="table-light small">
              <tr>
                <th>Peça / Lote</th>
                <th class="text-end">Subtotal</th>
                <th>Decisão</th>
                <th>Gestão de Demanda (CRM)</th>
              </tr>
            </thead>
            <tbody>${pecasHtml}</tbody>
          </table>
        </div>

        <div class="alert alert-info py-2 small mb-3">
          ℹ️ <strong>Rastreabilidade de Estoque:</strong> Peças marcadas como <em>Adiado</em> ou <em>Recusado</em> terão suas reservas atômicas canceladas imediatamente, recompondo o saldo disponível do almoxarifado.
        </div>

        <div class="d-flex justify-content-end gap-2 border-top pt-2">
          <button type="button" class="btn btn-secondary btn-sm" data-act="fechar-modal">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm font-weight-bold" data-act="confirmar-aprovacao-parcial" data-os-id="${esc(os.id)}">
            💾 Confirmar Aprovação e Gerar CRM
          </button>
        </div>
      </div>
    `;
  }

  function atualizarCalculoAprovacaoParcial() {
    const rows = document.querySelectorAll('.item-aprovacao-row');
    let totalAprovado = 0;
    let totalAdiado = 0;

    rows.forEach(row => {
      const val = Number(row.getAttribute('data-valor') || 0);
      const sel = row.querySelector('.select-status-item');
      const camposAdiado = row.querySelector('.campos-adiamento');
      const st = sel ? sel.value : 'aprovado';

      if (camposAdiado) {
        if (st === 'aprovado') {
          camposAdiado.classList.add('d-none');
        } else {
          camposAdiado.classList.remove('d-none');
        }
      }

      if (st === 'aprovado') {
        totalAprovado += val;
      } else {
        totalAdiado += val;
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

    const html = modalAprovacaoParcialHtml(os, centrosCusto);
    if (typeof root.abrirModalGenerico === 'function') {
      root.abrirModalGenerico(html);
    } else if (typeof root.abrirFolha === 'function') {
      root.abrirFolha(html);
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

  function renderSeletorCentroCustoBorderoHtml(centrosCusto = []) {
    const opts = (centrosCusto || []).map(cc => `
      <option value="${esc(cc.id)}">${esc(cc.codigo)} - ${esc(cc.nome)}</option>
    `).join('');

    return `
      <select id="filtro_bordero_centro_custo" class="form-select form-select-sm" style="max-width:220px">
        <option value="">Todos os Centros de Custo</option>
        ${opts}
      </select>
    `;
  }

  // Exportações no escopo global
  root.renderBadgeStatusItemHtml = renderBadgeStatusItemHtml;
  root.renderBadgeCriticidadeHtml = renderBadgeCriticidadeHtml;
  root.modalAprovacaoParcialHtml = modalAprovacaoParcialHtml;
  root.atualizarCalculoAprovacaoParcial = atualizarCalculoAprovacaoParcial;
  root.abrirModalAprovacaoParcial = abrirModalAprovacaoParcial;
  root.confirmarAprovacaoParcial = confirmarAprovacaoParcial;
  root.renderSeletorCentroCustoBorderoHtml = renderSeletorCentroCustoBorderoHtml;

})(typeof window !== 'undefined' ? window : globalThis);

