/* =====================================================================
   PÁTIO CRM — FATURAMENTO EM LOTE DE FROTAS (BORDERÔ B2B)
   Submódulo Frontend do Módulo Financeiro
   Arquitetura Modular (< 280 linhas).
   ===================================================================== */

/**
 * Calcula totais de faturamento e retenções das OSs selecionadas no frontend
 * @param {Array<string>} osIds
 * @param {number} descontoGeral
 * @param {Object} retencoes
 * @returns {Object}
 */
function calcularTotaisBorderoFrontend(osIds = [], descontoGeral = 0, retencoes = {}) {
  const osList = (typeof S !== 'undefined' && Array.isArray(S.os)) ? S.os : [];
  const idsSet = new Set(osIds);
  const selecionadas = osList.filter(o => idsSet.has(o.id));

  let totalMaoDeObra = 0;
  let totalPecas = 0;

  selecionadas.forEach(o => {
    const srvs = Array.isArray(o.servicos) ? o.servicos : [];
    const pecs = Array.isArray(o.pecas) ? o.pecas : [];
    totalMaoDeObra += srvs.reduce((acc, s) => acc + Number(s.valor || s.preco || 0) * (s.qtd || 1), 0);
    totalPecas += pecs.reduce((acc, p) => acc + Number(p.valor || p.preco || p.total || 0) * (p.qtd || 1), 0);
  });

  const subtotalBruto = Math.round((totalMaoDeObra + totalPecas) * 100) / 100;
  const desc = Math.min(subtotalBruto, Math.max(0, Number(descontoGeral) || 0));

  let totalRetencoes = 0;
  if (retencoes && typeof retencoes === 'object') {
    if (retencoes.iss) {
      totalRetencoes += Math.round(totalMaoDeObra * (Number(retencoes.iss) / 100) * 100) / 100;
    }
    if (retencoes.irrf) {
      totalRetencoes += Math.round(subtotalBruto * (Number(retencoes.irrf) / 100) * 100) / 100;
    }
  }

  totalRetencoes = Math.round(totalRetencoes * 100) / 100;
  const totalLiquido = Math.max(0, Math.round((subtotalBruto - desc - totalRetencoes) * 100) / 100);

  return {
    qtdOS: selecionadas.length,
    totalMaoDeObra: Math.round(totalMaoDeObra * 100) / 100,
    totalPecas: Math.round(totalPecas * 100) / 100,
    subtotalBruto,
    descontoGeral: desc,
    totalRetencoes,
    totalLiquido
  };
}

/**
 * Renderiza o bloco principal da aba de Faturamento de Frotas
 * @returns {string} HTML
 */
function blocoBorderoFrotas() {
  const ui = (typeof S !== 'undefined' && S && S.ui) ? S.ui : {};
  const clientes = (typeof S !== 'undefined' && Array.isArray(S.clientes)) ? S.clientes : [];
  const borderos = (typeof S !== 'undefined' && Array.isArray(S.borderos)) ? S.borderos : [];
  const osList = (typeof S !== 'undefined' && Array.isArray(S.os)) ? S.os : [];

  const cliSelId = ui.borderoClienteId || (clientes[0] ? clientes[0].id : '');
  const osSelIds = ui.borderoOsIds || [];
  const condicaoPag = ui.borderoCondicao || '30ddl';
  const descGeral = Number(ui.borderoDesconto) || 0;
  const retIss = Boolean(ui.borderoRetIss);
  const retIrrf = Boolean(ui.borderoRetIrrf);

  const fnEsc = typeof esc === 'function' ? esc : (x => String(x || ''));
  const fnBrl = typeof brl === 'function' ? brl : (n => `R$ ${Number(n || 0).toFixed(2)}`);

  // Filtra OSs finalizadas do cliente que não estejam em borderô
  const faturaveis = osList.filter(o => {
    const cId = o.cli || o.clienteId;
    if (cId !== cliSelId) return false;
    const st = String(o.st || '').toLowerCase();
    if (!['finalizada', 'entregue', 'concluida', 'pronto'].includes(st)) return false;
    if (o.borderoId || o.statusBordero === 'faturado') return false;
    return true;
  });

  const totais = calcularTotaisBorderoFrontend(osSelIds, descGeral, {
    iss: retIss ? 2.0 : 0,
    irrf: retIrrf ? 1.5 : 0
  });

  return `
  <div class="card card-p" style="margin-top:14px;background:#fff;border:1px solid var(--aco-200)">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:17px;font-weight:700;display:flex;align-items:center;gap:6px">
          <span>🚛</span> Faturamento de Frotas & Fechamento em Lote (Borderô)
        </h2>
        <div class="mini">Consolidação de OSs finalizadas por transportadora com desdobramento de duplicatas e emissão de boletos Febraban.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label class="mini" style="font-weight:700">Transportadora:</label>
        <select class="campo-select" data-act="filtro-bordero-cli" style="height:32px;font-weight:600">
          ${clientes.map(c => `<option value="${c.id}" ${c.id === cliSelId ? 'selected' : ''}>${fnEsc(c.nome)} (${fnEsc(c.doc || c.cnpj || 'PJ')})</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- GRID PRINCIPAL: TABELA DE OSs À ESQUERDA vs PAINEL LATERAL DE RESUMO À DIREITA -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;align-items:start">
      <!-- Coluna Principal: Checklist de OSs Elegíveis -->
      <div>
        <div class="entre" style="margin-bottom:8px">
          <div style="font-weight:700;font-size:13px;color:var(--aco-800)">
            Ordens de Serviço Finalizadas Pendentes (${faturaveis.length})
          </div>
          ${faturaveis.length ? `
            <button class="btn btn-secundario" data-act="toggle-todas-os-bordero" style="font-size:11px;padding:3px 8px">
              ${osSelIds.length === faturaveis.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
            </button>
          ` : ''}
        </div>

        <div class="tabela-responsiva">
          <table class="tabela">
            <thead>
              <tr>
                <th style="width:36px;text-align:center">Sel</th>
                <th style="width:70px">OS #</th>
                <th>Veículo / Placa</th>
                <th style="width:90px;text-align:right">Mão de Obra</th>
                <th style="width:90px;text-align:right">Peças</th>
                <th style="width:100px;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${faturaveis.length ? faturaveis.map(o => {
                const isSel = osSelIds.includes(o.id);
                const srvs = Array.isArray(o.servicos) ? o.servicos : [];
                const pecs = Array.isArray(o.pecas) ? o.pecas : [];
                const mob = srvs.reduce((a, s) => a + Number(s.valor || 0) * (s.qtd || 1), 0);
                const pec = pecs.reduce((a, p) => a + Number(p.valor || p.total || 0) * (p.qtd || 1), 0);
                const tot = mob + pec;
                const v = o.veiculo || {};

                return `
                <tr style="${isSel ? 'background:#f0fdf4;' : ''}">
                  <td style="text-align:center">
                    <input type="checkbox" data-act="toggle-os-bordero" data-id="${o.id}" ${isSel ? 'checked' : ''} style="cursor:pointer">
                  </td>
                  <td><b>#${fnEsc(o.num || o.id)}</b></td>
                  <td>
                    <div style="font-weight:600;display:flex;align-items:center;gap:4px">
                      <span class="placa">${fnEsc(v.placa || o.placa || '—')}</span>
                      ${o.conjuntoArticulado ? '<span class="selo" style="font-size:10px;background:#fef3c7;color:#92400e">Articulado</span>' : ''}
                    </div>
                    <div class="mini">${fnEsc(v.modelo || 'Caminhão')}</div>
                  </td>
                  <td style="text-align:right">${fnBrl(mob)}</td>
                  <td style="text-align:right">${fnBrl(pec)}</td>
                  <td style="text-align:right;font-weight:700">${fnBrl(tot)}</td>
                </tr>`;
              }).join('') : `
                <tr>
                  <td colspan="6" style="text-align:center;color:var(--aco-500);padding:24px">
                    Nenhuma Ordem de Serviço finalizada aguardando faturamento para este cliente.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Histórico de Borderôs Emitidos -->
        <div style="margin-top:24px">
          <div style="font-weight:700;font-size:13px;color:var(--aco-800);margin-bottom:8px">
            Borderôs e Fechamentos Já Emitidos (${borderos.length})
          </div>
          <div class="tabela-responsiva">
            <table class="tabela">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Transportadora</th>
                  <th>Data</th>
                  <th style="text-align:right">Total Líquido</th>
                  <th>Status</th>
                  <th style="width:120px;text-align:center">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${borderos.length ? borderos.map(b => `
                  <tr>
                    <td><b>${fnEsc(b.num)}</b></td>
                    <td>${fnEsc(b.clienteNome)}</td>
                    <td class="mini">${(b.criadoEm || '').slice(0, 10)}</td>
                    <td style="text-align:right;font-weight:700">${fnBrl(b.totais?.totalLiquido || 0)}</td>
                    <td>
                      <span class="selo" style="${b.status === 'cancelado' ? 'background:#fee2e2;color:#991b1b' : 'background:#dcfce7;color:#166534'}">
                        ${(b.status || 'faturado').toUpperCase()}
                      </span>
                    </td>
                    <td style="text-align:center">
                      <button class="btn btn-secundario" data-act="abrir-modal-bordero" data-id="${b.id}" style="padding:2px 8px;font-size:11px" title="Ver Espelho e Boletos">
                        📄 Espelho
                      </button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" style="text-align:center;color:var(--aco-500);padding:14px">
                      Nenhum borderô gerado até o momento.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Coluna Lateral: Resumo em Tempo Real e Ação de Fechamento -->
      <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:14px">
        <div style="font-weight:700;font-size:14px;color:var(--aco-900);border-bottom:1px solid var(--aco-200);padding-bottom:8px;margin-bottom:12px">
          Resumo do Lote (${totais.qtdOS} OSs selecionadas)
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;margin-bottom:14px">
          <div class="entre">
            <span>Mão de Obra Total:</span>
            <b>${fnBrl(totais.totalMaoDeObra)}</b>
          </div>
          <div class="entre">
            <span>Peças Total:</span>
            <b>${fnBrl(totais.totalPecas)}</b>
          </div>
          <div class="entre" style="border-top:1px dashed var(--aco-200);padding-top:6px">
            <span>Subtotal Bruto:</span>
            <b style="font-size:14px">${fnBrl(totais.subtotalBruto)}</b>
          </div>

          <!-- Desconto Geral de Frota -->
          <div style="margin-top:6px">
            <label class="mini" style="font-weight:600;display:block;margin-bottom:2px">Desconto Geral de Frota (R$):</label>
            <input type="number" class="campo-texto" data-act="campo-bordero-desconto" value="${descGeral}" min="0" step="10" style="width:100%;height:30px;font-size:13px">
          </div>

          <!-- Retenções Tributárias -->
          <div style="margin-top:6px;border-top:1px dashed var(--aco-200);padding-top:8px">
            <label class="mini" style="font-weight:700;display:block;margin-bottom:4px">Retenções Contratuais:</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;cursor:pointer">
              <input type="checkbox" data-act="toggle-retencao-iss" ${retIss ? 'checked' : ''}>
              <span>ISSQN (2% sobre Mão de Obra)</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
              <input type="checkbox" data-act="toggle-retencao-irrf" ${retIrrf ? 'checked' : ''}>
              <span>IRRF (1.5% sobre Total Bruto)</span>
            </label>
          </div>

          <div class="entre" style="border-top:1px solid var(--aco-200);padding-top:8px;margin-top:6px">
            <span style="font-weight:700;font-size:14px;color:var(--verde)">TOTAL LÍQUIDO:</span>
            <b style="font-size:17px;font-weight:800;color:var(--verde)" class="num">${fnBrl(totais.totalLiquido)}</b>
          </div>
        </div>

        <!-- Condição de Pagamento -->
        <div style="margin-bottom:14px">
          <label class="mini" style="font-weight:700;display:block;margin-bottom:3px">Condição de Pagamento:</label>
          <select class="campo-select" data-act="seletor-condicao-bordero" style="width:100%;height:32px;font-weight:600">
            <option value="30ddl" ${condicaoPag === '30ddl' ? 'selected' : ''}>30 DDL (Parcela única a 30 dias)</option>
            <option value="14/28/42" ${condicaoPag === '14/28/42' ? 'selected' : ''}>14 / 28 / 42 dias (3x quinzenais)</option>
            <option value="a_vista" ${condicaoPag === 'a_vista' ? 'selected' : ''}>À vista / Contra apresentação</option>
          </select>
        </div>

        <button class="btn btn-primario" data-act="executar-fechamento-bordero" 
                style="width:100%;height:38px;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px"
                ${totais.qtdOS === 0 ? 'disabled style="opacity:0.6;cursor:not-allowed"' : ''}>
          <span>🚀</span> Gerar Borderô e Boletos
        </button>
      </div>
    </div>
  </div>`;
}

// Binds no escopo global
const exportsBorderoUi = {
  calcularTotaisBorderoFrontend,
  blocoBorderoFrotas
};
if (typeof window !== 'undefined') Object.assign(window, exportsBorderoUi);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsBorderoUi);

