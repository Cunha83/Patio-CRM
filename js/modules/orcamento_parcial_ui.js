// js/modules/orcamento_parcial_ui.js
// Interface de Aprovação Parcial de Orçamentos, Conversão em CRM e Centros de Custo B2B
// Teto Modular: <= 250 linhas

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
      <div class="modal-aprovacao-parcial" style="max-width:820px;margin:0 auto">
        <div class="entre" style="border-bottom:1px solid var(--border-color,#e2e8f0);padding-bottom:12px;margin-bottom:14px">
          <div>
            <h3 style="margin:0;font-size:18px;font-weight:700">Aprovação de Orçamento — OS #${esc(os.num || os.id)}</h3>
            <div class="small text-muted">Cliente: <b>${esc(os.cliente || os.cliNome || 'Frotista')}</b> • Placa: <b>${esc(os.placa || 'N/A')}</b></div>
          </div>
          <button class="btn-fechar" onclick="fecharModalGenerico()">&times;</button>
        </div>

        <div class="row g-2 mb-3 align-items-center">
          <div class="col-md-6">
            <label class="form-label small fw-bold mb-1">Centro de Custo / Sub-frota (Opcional):</label>
            <select id="aprov_centro_custo_id" class="form-select form-select-sm">
              <option value="">-- Sem Centro de Custo Definido --</option>
              ${optionsCC}
            </select>
          </div>
          <div class="col-md-6 text-end">
            <span class="small text-muted">Valor Total Original:</span>
            <span class="fs-5 fw-bold text-primary ms-1">${moeda(totalOriginal)}</span>
          </div>
        </div>

        <h5 class="fw-bold mb-2">Serviços Apontados</h5>
        <div class="table-responsive mb-3 border rounded">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Descrição</th>
                <th class="text-end">Valor</th>
                <th>Decisão</th>
                <th>Classificação / Motivo</th>
              </tr>
            </thead>
            <tbody>${srvHtml}</tbody>
          </table>
        </div>

        <h5 class="fw-bold mb-2">Peças e Componentes</h5>
        <div class="table-responsive mb-3 border rounded">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Descrição</th>
                <th class="text-end">Total</th>
                <th>Decisão</th>
                <th>Classificação / Motivo</th>
              </tr>
            </thead>
            <tbody>${pecasHtml}</tbody>
          </table>
        </div>

        <div class="card p-3 bg-light mb-3 border">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <span class="text-muted small">Total Imediato Aprovado:</span>
              <strong id="resumo_total_aprovado" class="fs-5 text-success ms-1">${moeda(totalOriginal)}</strong>
            </div>
            <div>
              <span class="text-muted small">Total Adiado (Demanda Reprimida CRM):</span>
              <strong id="resumo_total_adiado" class="fs-5 text-warning ms-1">${moeda(0)}</strong>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-outline-secondary" onclick="fecharModalGenerico()">Cancelar</button>
          <button type="button" class="btn btn-primary fw-bold" data-act="confirmar-aprovacao-parcial" onclick="confirmarAprovacaoParcial('${esc(os.id)}')">
            Salvar e Atualizar OS
          </button>
        </div>
      </div>
    `;
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
  root.renderSeletorCentroCustoBorderoHtml = renderSeletorCentroCustoBorderoHtml;

})(typeof window !== 'undefined' ? window : globalThis);
