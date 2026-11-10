// js/modules/financeiro_bordero_conciliacao_ui.js
// Templates e componentes visuais para Conciliação de Borderôs B2B e Trava de Inadimplência

(function (root) {
  'use strict';

  function fmtMoeda(val) {
    return 'R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtData(val) {
    if (!val) return '—';
    const s = String(val).slice(0, 10);
    const [y, m, d] = s.split('-');
    return (d && m && y) ? `${d}/${m}/${y}` : s;
  }

  function renderPainelConciliacaoBorderoHtml(state, options = {}) {
    const borderos = [
      ...(Array.isArray(state?.borderosFrotistas) ? state.borderosFrotistas : []),
      ...(Array.isArray(state?.borderos) ? state.borderos : [])
    ];
    const vistos = new Set();
    const borderosUnicos = [];
    for (const b of borderos) {
      if (b && b.id && !vistos.has(b.id)) {
        vistos.add(b.id);
        borderosUnicos.push(b);
      }
    }

    let totalGeral = 0;
    let totalQuitado = 0;
    let totalPendente = 0;
    let qtdEmAtraso = 0;

    const dataHoje = new Date().toISOString().slice(0, 10);

    for (const b of borderosUnicos) {
      const vTotal = Number(b.totais?.totalLiquido || b.valorTotal || 0);
      const saldo = b.saldoDevedor !== undefined ? Number(b.saldoDevedor) : (vTotal - Number(b.valorPagoAcumulado || 0));
      totalGeral += vTotal;
      totalQuitado += Number(b.valorPagoAcumulado || 0);
      totalPendente += Math.max(0, saldo);

      if (saldo > 0.01 && b.dataVencimento && String(b.dataVencimento).slice(0, 10) < dataHoje) {
        qtdEmAtraso++;
      }
    }

    return `
      <div class="conciliacao-bordero-container" style="padding: 16px; font-family: inherit;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; font-size: 1.4rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
              <span>📑</span> Conciliação & Baixa em Cascata de Borderôs B2B
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 0.88rem;">
              Liquidação atômica de faturamento quinzenal/mensal com liberação de comissões técnicas.
            </p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 24px;">
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Total Faturado</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #0f172a; margin-top: 4px;">${fmtMoeda(totalGeral)}</div>
          </div>
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #16a34a; text-transform: uppercase;">Total Liquidado</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #16a34a; margin-top: 4px;">${fmtMoeda(totalQuitado)}</div>
          </div>
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #ea580c; text-transform: uppercase;">Saldo Pendente</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #ea580c; margin-top: 4px;">${fmtMoeda(totalPendente)}</div>
          </div>
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #dc2626; text-transform: uppercase;">Borderôs em Atraso</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #dc2626; margin-top: 4px;">${qtdEmAtraso}</div>
          </div>
        </div>

        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #334155;">
            Borderôs Faturados & Histórico de Liquidações
          </div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; color: #475569; border-bottom: 1px solid #cbd5e1;">
                  <th style="padding: 10px 14px;">Nº Borderô</th>
                  <th style="padding: 10px 14px;">Cliente / Transportadora</th>
                  <th style="padding: 10px 14px;">Vencimento</th>
                  <th style="padding: 10px 14px;">Valor Total</th>
                  <th style="padding: 10px 14px;">Saldo Devedor</th>
                  <th style="padding: 10px 14px;">Status</th>
                  <th style="padding: 10px 14px; text-align: right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${borderosUnicos.length === 0 ? `
                  <tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8;">Nenhum borderô gerado no sistema.</td></tr>
                ` : borderosUnicos.map(b => {
                  const saldo = b.saldoDevedor !== undefined ? Number(b.saldoDevedor) : (Number(b.totais?.totalLiquido || b.valorTotal || 0) - Number(b.valorPagoAcumulado || 0));
                  const isLiquidado = b.status === 'liquidado' || b.status === 'pago' || saldo <= 0.01;
                  const isAtrasado = !isLiquidado && b.dataVencimento && String(b.dataVencimento).slice(0, 10) < dataHoje;

                  let badgeBg = '#e2e8f0';
                  let badgeColor = '#475569';
                  let badgeTxt = b.status || 'faturado';

                  if (isLiquidado) {
                    badgeBg = '#dcfce7'; badgeColor = '#15803d'; badgeTxt = 'Quitado';
                  } else if (isAtrasado) {
                    badgeBg = '#fee2e2'; badgeColor = '#b91c1c'; badgeTxt = 'Em Atraso';
                  } else if (b.status === 'parcialmente_pago') {
                    badgeBg = '#ffedd5'; badgeColor = '#c2410c'; badgeTxt = 'Parcial';
                  }

                  return `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 10px 14px; font-weight: 600;">${b.num || b.id}</td>
                      <td style="padding: 10px 14px;">${b.clienteNome || b.clienteId || '—'}</td>
                      <td style="padding: 10px 14px;">${fmtData(b.dataVencimento)}</td>
                      <td style="padding: 10px 14px;">${fmtMoeda(b.totais?.totalLiquido || b.valorTotal)}</td>
                      <td style="padding: 10px 14px; font-weight: 600; color: ${saldo > 0 ? '#ea580c' : '#16a34a'};">${fmtMoeda(saldo)}</td>
                      <td style="padding: 10px 14px;">
                        <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">
                          ${badgeTxt}
                        </span>
                      </td>
                      <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
                        ${!isLiquidado ? `
                          <button class="btn btn-sm btn-primary" data-act="abrir-modal-liquidar-bordero" data-bordero-id="${b.id}" style="padding: 4px 10px; font-size: 0.8rem; margin-right: 4px;">
                            💵 Baixar / Liquidar
                          </button>
                        ` : `
                          <button class="btn btn-sm btn-outline-danger" data-act="estornar-liquidacao-bordero" data-bordero-id="${b.id}" style="padding: 4px 10px; font-size: 0.8rem; margin-right: 4px;">
                            ↩ Estornar
                          </button>
                        `}
                        <button class="btn btn-sm btn-outline-secondary" data-act="abrir-modal-politica-credito" data-cliente-id="${b.clienteId}" style="padding: 4px 10px; font-size: 0.8rem;">
                          🛡 Crédito
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function modalLiquidarBorderoB2BHtml(bordero, contas = []) {
    const vTotal = Number(bordero?.totais?.totalLiquido || bordero?.valorTotal || 0);
    const saldo = bordero?.saldoDevedor !== undefined ? Number(bordero.saldoDevedor) : (vTotal - Number(bordero?.valorPagoAcumulado || 0));
    const dataHoje = new Date().toISOString().slice(0, 10);

    return `
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 1.25rem;">
          💵 Baixa / Liquidação de Borderô B2B (${bordero?.num || bordero?.id})
        </h3>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 16px;">
          Cliente: <strong>${bordero?.clienteNome || bordero?.clienteId || '—'}</strong> | 
          Saldo a Liquidar: <strong style="color: #ea580c;">${fmtMoeda(saldo)}</strong>
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.84rem; color: #475569;">
          ℹ Ao confirmar, o valor recebido liquidará as OSs filhas em cascata e liberará as comissões técnicas retidas dos mecânicos.
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Valor Recebido (R$):</label>
            <input type="number" step="0.01" id="txt-liq-valor" value="${saldo.toFixed(2)}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Forma de Pagamento:</label>
            <select id="sel-liq-forma" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
              <option value="ted">TED / Transferência Bancária</option>
              <option value="pix">PIX Instantâneo</option>
              <option value="boleto">Boleto Bancário (Compensado)</option>
              <option value="cheque">Cheque Frotista</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Data da Liquidação:</label>
            <input type="date" id="txt-liq-data" value="${dataHoje}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Observações / Autenticação:</label>
            <input type="text" id="txt-liq-obs" placeholder="Ex: TED banco Itaú doc 98213" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary" data-act="fechar-modal-generico" style="padding: 8px 16px;">Cancelar</button>
          <button class="btn btn-success" data-act="confirmar-liquidacao-bordero" data-bordero-id="${bordero?.id}" style="padding: 8px 18px; font-weight: 600;">
            ✔ Confirmar Liquidação em Cascata
          </button>
        </div>
      </div>
    `;
  }

  function modalPoliticaCreditoFrotistaHtml(cliente, politica = {}, risco = {}) {
    const isBloqueado = risco?.aprovadoParaNovosServicos === false;

    return `
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 1.25rem;">
          🛡 Governança de Crédito & Trava de Inadimplência
        </h3>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 16px;">
          Cliente: <strong>${cliente?.nome || cliente?.id || '—'}</strong>
        </p>

        <div style="padding: 12px; border-radius: 6px; margin-bottom: 16px; background: ${isBloqueado ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${isBloqueado ? '#fecaca' : '#bbf7d0'};">
          <div style="font-weight: 600; color: ${isBloqueado ? '#b91c1c' : '#15803d'}; font-size: 0.92rem;">
            ${isBloqueado ? '🚫 FROTISTA COM RESTRIÇÃO ATIVA' : '🟢 SITUAÇÃO DE CRÉDITO REGULAR'}
          </div>
          <div style="font-size: 0.82rem; color: #475569; margin-top: 4px;">
            ${risco?.motivoBloqueio || 'Cliente apto para emissão de novas ordens de serviço faturadas.'}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; font-size: 0.82rem;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
            <div style="color: #64748b;">Limite Total</div>
            <div style="font-weight: 700; font-size: 1.1rem; color: #0f172a;">${fmtMoeda(risco?.limiteCredito || politica?.limiteCredito)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
            <div style="color: #ea580c;">Saldo Devedor</div>
            <div style="font-weight: 700; font-size: 1.1rem; color: #ea580c;">${fmtMoeda(risco?.saldoDevedorTotal)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
            <div style="color: #16a34a;">Limite Disponível</div>
            <div style="font-weight: 700; font-size: 1.1rem; color: #16a34a;">${fmtMoeda(risco?.limiteDisponivel)}</div>
          </div>
        </div>

        <h4 style="font-size: 0.95rem; margin: 16px 0 8px 0; color: #334155;">Parâmetros da Política</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Limite de Crédito Global (R$):</label>
            <input type="number" step="100" id="txt-pol-limite" value="${Number(politica?.limiteCredito || 0)}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Tolerância de Atraso (Dias):</label>
            <input type="number" id="txt-pol-tolerancia" value="${Number(politica?.diasToleranciaAtraso ?? 5)}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #334155;">
            <input type="checkbox" id="chk-pol-bloqueio" ${politica?.bloqueioAutomatico !== false ? 'checked' : ''}>
            Bloquear automaticamente abertura de novas OSs faturadas em caso de inadimplência
          </label>
        </div>

        ${isBloqueado ? `
          <div style="border-top: 1px dashed #cbd5e1; padding-top: 14px; margin-top: 14px;">
            <h4 style="font-size: 0.92rem; color: #b91c1c; margin: 0 0 8px 0;">Liberar Exceção / Override Gerencial</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 0.8rem; color: #475569;">Valor do Novo Serviço (R$):</label>
                <input type="number" id="txt-ovr-valor" placeholder="0.00" class="form-control" style="width: 100%; padding: 6px 8px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px;">
              </div>
              <div>
                <label style="display: block; font-size: 0.8rem; color: #475569;">Usuário / Autorizador:</label>
                <input type="text" id="txt-ovr-usuario" placeholder="Nome do Gerente/Diretor" class="form-control" style="width: 100%; padding: 6px 8px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px;">
              </div>
            </div>
            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 0.8rem; color: #475569;">Motivo / Justificativa da Liberação:</label>
              <input type="text" id="txt-ovr-motivo" placeholder="Ex: Acordo com transportadora para carga em trânsito" class="form-control" style="width: 100%; padding: 6px 8px; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px;">
            </div>
            <button class="btn btn-warning btn-sm" data-act="confirmar-override-credito" data-cliente-id="${cliente?.id}" style="width: 100%; font-weight: 600; padding: 7px;">
              ⚡ Aplicar Override e Liberar Nova OS
            </button>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary" data-act="fechar-modal-generico" style="padding: 8px 16px;">Fechar</button>
          <button class="btn btn-primary" data-act="salvar-politica-credito" data-cliente-id="${cliente?.id}" style="padding: 8px 18px; font-weight: 600;">
            💾 Salvar Política de Crédito
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelConciliacaoBorderoHtml = renderPainelConciliacaoBorderoHtml;
  root.modalLiquidarBorderoB2BHtml = modalLiquidarBorderoB2BHtml;
  root.modalPoliticaCreditoFrotistaHtml = modalPoliticaCreditoFrotistaHtml;

})(typeof window !== 'undefined' ? window : globalThis);

