/* =====================================================================
   PÁTIO CRM — DASHBOARD OPERACIONAL: RENTABILIDADE E TABELA DE VEÍCULOS
   Submódulo extraído de js/dashboard_operacional.js (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  function _esc(str) {
    if (typeof esc === 'function') return esc(str);
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  function isPerfilMecanico() {
    if (typeof window !== 'undefined' && typeof window.isPerfilMecanico === 'function') {
      return window.isPerfilMecanico();
    }
    try {
      const u = (typeof S !== 'undefined' && S?.usuarioAtual) || {};
      const perfil = (u.perfil || u.role || '').toLowerCase();
      return perfil === 'mecanico' || perfil === 'mecânico';
    } catch (_) {
      return false;
    }
  }

  function renderRentabilidadeAssistidaOp(rentabilidade = {}) {
    if (isPerfilMecanico()) return '';
    const esc = _esc;
    return `
      <!-- 7.5 PAINEL DE RENTABILIDADE & PRECIFICAÇÃO ASSISTIDA -->
      <div class="card card-p" style="margin-bottom:20px;border-left:4px solid #10b981">
        <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:18px">💰</span>
              <h3 style="font-size:15px;font-weight:700">Rentabilidade & Proteção de Margem</h3>
            </div>
            <div class="mini" style="color:var(--aco-500);margin-top:2px">Precificação assistida e proteção determinística contra vendas abaixo do custo</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-pequeno btn-neutro" data-act="ver-rentabilidade-detalhe">
              📊 Relatório de Rentabilidade
            </button>
          </div>
        </div>

        <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px">
          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500);font-weight:600">Faturamento Estimado Pátio</div>
            <div style="font-size:16px;font-weight:800;color:var(--petroleo);margin-top:2px">${typeof brl === 'function' ? brl(rentabilidade.faturamentoEstimado || 0) : 'R$ ' + (rentabilidade.faturamentoEstimado || 0)}</div>
            <div class="mini" style="color:var(--aco-400);margin-top:4px">Baseado em OS ativas no pátio</div>
          </div>
          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500);font-weight:600">Custo Total Previsto (CPV)</div>
            <div style="font-size:16px;font-weight:800;color:var(--tijolo);margin-top:2px">${typeof brl === 'function' ? brl(rentabilidade.custoPrevisto || 0) : 'R$ ' + (rentabilidade.custoPrevisto || 0)}</div>
            <div class="mini" style="color:var(--aco-400);margin-top:4px">Peças + mão de obra apontada</div>
          </div>
          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500);font-weight:600">Lucro Bruto Projetado</div>
            <div style="font-size:16px;font-weight:800;color:var(--verde);margin-top:2px">${typeof brl === 'function' ? brl(rentabilidade.lucroBruto || 0) : 'R$ ' + (rentabilidade.lucroBruto || 0)}</div>
            <div class="mini" style="color:var(--aco-400);margin-top:4px">Margem agregada em tempo real</div>
          </div>
          <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-200)">
            <div class="mini" style="color:var(--aco-500);font-weight:600">Margem Bruta Média</div>
            <div style="font-size:16px;font-weight:800;color:${(rentabilidade.margemPercentual || 0) >= 30 ? 'var(--verde)' : 'var(--ouro)'};margin-top:2px">
              ${Math.round(rentabilidade.margemPercentual || 0)}%
            </div>
            <div class="mini" style="color:${(rentabilidade.margemPercentual || 0) >= 30 ? 'var(--verde)' : 'var(--ouro)'};margin-top:4px">
              ${(rentabilidade.margemPercentual || 0) >= 30 ? '✓ Meta operacional atingida' : '⚠️ Abaixo da meta de 30%'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTabelaVeiculosPatioOp(veiculosFiltrados = [], _buscaTexto = '') {
    const esc = _esc;
    return `
      <!-- 8. LISTA RÁPIDA DE VEÍCULOS NO PÁTIO (BUSCA E FILTRO) -->
      <div class="card card-p">
        <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:15px;font-weight:700">Veículos no Pátio (${veiculosFiltrados.length})</h3>
            <div class="mini" style="color:var(--aco-500)">Acesso rápido a todos os veículos com ordens de serviço ativas</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="text" class="campo-busca-op" placeholder="Buscar placa, modelo, cliente..." value="${esc(_buscaTexto)}" data-act="busca-op" style="padding:6px 12px;border-radius:6px;border:1px solid var(--aco-300);font-size:12.5px;width:240px">
          </div>
        </div>

        <div class="tabela-responsiva">
          <table class="tabela" style="width:100%">
            <thead>
              <tr>
                <th>Placa / OS</th>
                <th>Veículo & Cliente</th>
                <th>Box / Mecânico</th>
                <th>Estágio</th>
                <th>Previsão</th>
                <th>Avisos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${veiculosFiltrados.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align:center;padding:24px;color:var(--aco-400)">
                    Nenhum veículo encontrado para os filtros selecionados.
                  </td>
                </tr>
              ` : veiculosFiltrados.map(v => `
                <tr>
                  <td>
                    <span class="placa" style="color:#000000;font-weight:bold">${esc(v.placa)}</span>
                    <div class="mini" style="color:var(--aco-500);margin-top:2px">OS #${esc(v.num)}</div>
                  </td>
                  <td>
                    <div style="font-weight:600">${esc(v.modelo)}</div>
                    <div class="mini" style="color:var(--aco-600)">${esc(v.cliente)}</div>
                  </td>
                  <td>
                    <div style="font-weight:600">${esc(v.box)}</div>
                    <div class="mini" style="color:var(--aco-500)">${esc(v.mec)}</div>
                  </td>
                  <td>
                    <span class="selo selo-op-st" data-st="${esc(v.st)}">${esc(String(v.st || '').toUpperCase())}</span>
                  </td>
                  <td>
                    <div class="mini"><b>${esc(v.prev || '--')}</b> ${esc(v.horaPrev || '')}</div>
                  </td>
                  <td>
                    ${v.possivelGarantia ? '<span class="selo" style="background:#fef3c7;color:#b45309;font-size:10px">🛡️ Garantia</span> ' : ''}
                    ${v.alertasQtd > 0 ? `<span class="selo" style="background:#fee2e2;color:#b91c1c;font-size:10px">${v.alertasQtd} alerta(s)</span>` : ''}
                  </td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <button class="btn btn-secundario btn-pequeno" data-act="detalhe-item-op" data-os="${esc(v.osId)}" style="font-size:11px;padding:3px 6px">
                        Detalhes
                      </button>
                      <button class="btn btn-primario btn-pequeno" data-act="abrir-os-op" data-os="${esc(v.osId)}" style="font-size:11px;padding:3px 6px">
                        Abrir OS
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (typeof window !== 'undefined') {
    window.renderRentabilidadeAssistidaOp = renderRentabilidadeAssistidaOp;
    window.renderTabelaVeiculosPatioOp = renderTabelaVeiculosPatioOp;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.renderRentabilidadeAssistidaOp = renderRentabilidadeAssistidaOp;
    globalThis.renderTabelaVeiculosPatioOp = renderTabelaVeiculosPatioOp;
  }
})();

