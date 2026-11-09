// js/modules/estoque_pesado_ui.js
// Visualização de Curva ABC, Saldos Triplos (Físico vs. Reservado vs. Disponível) e Rastreabilidade de Lotes

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

  function renderBadgeClasseAbcHtml(classe) {
    const cl = String(classe || 'C').toUpperCase();
    if (cl === 'A') {
      return '<span class="badge badge-success" style="background:#10b981;color:#fff;font-weight:700;padding:3px 7px;border-radius:4px;">Classe A</span>';
    }
    if (cl === 'B') {
      return '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;font-weight:700;padding:3px 7px;border-radius:4px;">Classe B</span>';
    }
    return '<span class="badge badge-secondary" style="background:#6b7280;color:#fff;font-weight:600;padding:3px 7px;border-radius:4px;">Classe C</span>';
  }

  function renderSaldosTriplosHtml(saldos) {
    if (!saldos) return '<span class="text-muted">-</span>';
    const fis = Number(saldos.saldoFisico || saldos.estoqueFisico || 0);
    const res = Number(saldos.saldoReservado || saldos.estoqueReservado || 0);
    const disp = Number(saldos.saldoDisponivel || saldos.estoqueDisponivel || (fis - res));

    return `
      <div class="d-inline-flex align-items-center gap-1 small">
        <span class="badge badge-dark" title="Estoque Físico em Prateleira" style="background:#334155;color:#fff">Fís: ${fis}</span>
        <span class="badge badge-warning" title="Estoque Comprometido com OSs" style="background:#f59e0b;color:#fff">Res: ${res}</span>
        <span class="badge badge-success" title="Saldo Livre para Novas OSs" style="background:#10b981;color:#fff;font-weight:700">Disp: ${disp}</span>
      </div>
    `;
  }

  function modalRastreioLoteHtml(rastreio) {
    if (!rastreio || !rastreio.lote) {
      return '<div class="p-4 text-center text-muted">Lote não localizado no estoque.</div>';
    }

    const l = rastreio.lote;
    const utilizacoes = Array.isArray(rastreio.utilizacoes) ? rastreio.utilizacoes : [];

    let rowsUtilizacao = '';
    if (utilizacoes.length === 0) {
      rowsUtilizacao = '<tr><td colspan="6" class="text-center text-muted py-3">Nenhum consumo registrado para este lote em Ordens de Serviço.</td></tr>';
    } else {
      rowsUtilizacao = utilizacoes.map(u => `
        <tr>
          <td class="font-weight-bold">#${esc(u.osNum || u.osId)}</td>
          <td><span class="badge badge-dark">${esc(u.placa)}</span></td>
          <td>${esc(u.veiculo)}</td>
          <td>${esc(u.cliente)}</td>
          <td class="text-center font-weight-bold text-primary">${u.quantidadeConsumida} un</td>
          <td class="small text-muted">${esc((u.dataConsumo || '').slice(0, 10))}</td>
        </tr>
      `).join('');
    }

    return `
      <div class="modal-rastreio-container" style="max-width: 800px; margin: 0 auto;">
        <div class="d-flex justify-content-between align-items-center pb-3 border-bottom mb-3">
          <div>
            <h4 class="mb-0 text-primary">🔍 Auditoria de Lote & Recall: <strong>${esc(l.loteCodigo)}</strong></h4>
            <div class="text-muted small mt-1">
              Peça: <strong>${esc(l.pecaNome)}</strong> &bull; Fabricante: ${esc(l.fabricante || 'Geral')} &bull; Status: <span class="badge ${l.status === 'ativo' ? 'badge-success' : 'badge-secondary'}">${esc(l.status)}</span>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="fecharModalGenerico()">&times; Fechar</button>
        </div>

        <div class="row mb-3">
          <div class="col-md-3 mb-2">
            <div class="p-2 bg-light border rounded">
              <span class="small text-muted d-block">Qtd Inicial</span>
              <strong>${l.quantidadeInicial} un</strong>
            </div>
          </div>
          <div class="col-md-3 mb-2">
            <div class="p-2 bg-light border rounded">
              <span class="small text-muted d-block">Saldo em Estoque</span>
              <strong class="text-success">${l.quantidadeAtual} un</strong>
            </div>
          </div>
          <div class="col-md-3 mb-2">
            <div class="p-2 bg-light border rounded">
              <span class="small text-muted d-block">Total Aplicado</span>
              <strong class="text-primary">${rastreio.totalUtilizado || (l.quantidadeInicial - l.quantidadeAtual)} un</strong>
            </div>
          </div>
          <div class="col-md-3 mb-2">
            <div class="p-2 bg-light border rounded">
              <span class="small text-muted d-block">Custo Unitário</span>
              <strong>${moeda(l.custoUnitario)}</strong>
            </div>
          </div>
        </div>

        <h6 class="text-secondary font-weight-bold border-bottom pb-2 mb-2">🚛 Veículos e Frotas que Receberam este Lote (${utilizacoes.length})</h6>
        <div class="table-responsive border rounded" style="max-height: 280px; overflow-y: auto;">
          <table class="table table-sm table-hover mb-0">
            <thead class="thead-light">
              <tr>
                <th>OS</th>
                <th>Placa</th>
                <th>Veículo</th>
                <th>Cliente / Transportadora</th>
                <th class="text-center">Qtd</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${rowsUtilizacao}
            </tbody>
          </table>
        </div>

        <div class="d-flex justify-content-end mt-4 pt-3 border-top">
          <button type="button" class="btn btn-secondary btn-sm" onclick="fecharModalGenerico()">Fechar</button>
        </div>
      </div>
    `;
  }

  function modalEntradaLoteHtml(partId, pecaNome) {
    return `
      <div class="modal-entrada-lote-container" style="max-width: 550px; margin: 0 auto;">
        <div class="d-flex justify-content-between align-items-center pb-2 border-bottom mb-3">
          <h5 class="mb-0 text-primary">📦 Registrar Entrada de Lote Rastreável</h5>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="fecharModalGenerico()">&times;</button>
        </div>
        <div class="alert alert-info py-2 small mb-3">
          Peça: <strong>${esc(pecaNome || 'Peça Selecionada')}</strong>
        </div>

        <input type="hidden" id="lote_part_id" value="${esc(partId)}">

        <div class="form-group mb-2">
          <label class="small font-weight-bold">Código do Lote / Corrida de Aço *</label>
          <input type="text" class="form-control form-control-sm" id="lote_codigo" placeholder="Ex: LOT-2026-M4140" required>
        </div>

        <div class="row">
          <div class="col-md-6 form-group mb-2">
            <label class="small font-weight-bold">Fabricante / Usina</label>
            <input type="text" class="form-control form-control-sm" id="lote_fabricante" placeholder="Ex: Tupã Molas">
          </div>
          <div class="col-md-6 form-group mb-2">
            <label class="small font-weight-bold">Fornecedor / Distribuidor</label>
            <input type="text" class="form-control form-control-sm" id="lote_fornecedor" placeholder="Ex: Aço Forte Distribuidora">
          </div>
        </div>

        <div class="row">
          <div class="col-md-6 form-group mb-2">
            <label class="small font-weight-bold">Quantidade Entrada *</label>
            <input type="number" step="1" min="1" class="form-control form-control-sm" id="lote_qtd" placeholder="Ex: 10" required>
          </div>
          <div class="col-md-6 form-group mb-2">
            <label class="small font-weight-bold">Custo Unitário (R$)</label>
            <input type="number" step="0.01" min="0" class="form-control form-control-sm" id="lote_custo" placeholder="Ex: 180.00">
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="small font-weight-bold">Nota Fiscal / Danfe</label>
          <input type="text" class="form-control form-control-sm" id="lote_nf" placeholder="Ex: NF-e 10540">
        </div>

        <div class="d-flex justify-content-end gap-2 pt-2 border-top">
          <button type="button" class="btn btn-outline-secondary btn-sm mr-2" onclick="fecharModalGenerico()">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" data-act="salvar-entrada-lote">Salvar Entrada de Lote</button>
        </div>
      </div>
    `;
  }

  function abrirModalRastreioLote(loteCodigo) {
    if (!loteCodigo) {
      if (typeof root.torrar === 'function') root.torrar('Informe o código do lote.', 'alerta');
      return;
    }

    fetch(`/api/estoque/lotes/rastreio/${encodeURIComponent(loteCodigo)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.rastreio) {
          if (typeof root.abrirModalGenerico === 'function') {
            root.abrirModalGenerico(modalRastreioLoteHtml(d.rastreio));
          }
        } else {
          if (typeof root.torrar === 'function') root.torrar(d.error || 'Lote não localizado.', 'alerta');
        }
      })
      .catch(() => {
        if (typeof root.torrar === 'function') root.torrar('Erro de rede ao buscar lote.', 'alerta');
      });
  }

  function abrirModalEntradaLote(partId, pecaNome) {
    if (typeof root.abrirModalGenerico === 'function') {
      root.abrirModalGenerico(modalEntradaLoteHtml(partId, pecaNome));
    }
  }

  // Exportações públicas
  root.renderBadgeClasseAbcHtml = renderBadgeClasseAbcHtml;
  root.renderSaldosTriplosHtml = renderSaldosTriplosHtml;
  root.modalRastreioLoteHtml = modalRastreioLoteHtml;
  root.modalEntradaLoteHtml = modalEntradaLoteHtml;
  root.abrirModalRastreioLote = abrirModalRastreioLote;
  root.abrirModalEntradaLote = abrirModalEntradaLote;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      renderBadgeClasseAbcHtml,
      renderSaldosTriplosHtml,
      modalRastreioLoteHtml,
      modalEntradaLoteHtml,
      abrirModalRastreioLote,
      abrirModalEntradaLote
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

