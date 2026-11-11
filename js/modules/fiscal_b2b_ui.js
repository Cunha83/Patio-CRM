// js/modules/fiscal_b2b_ui.js
// Interface Visual da Central de Fechamento Fiscal B2B (NF-e Peças vs NFS-e Serviços)
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function renderPainelFechamentoFiscalB2BHtml(dados = {}) {
    const totalPecas = Number(dados.totalNFePecasEmitidas || 0);
    const totalServicos = Number(dados.totalNFSeServicosEmitidas || 0);
    const totalRetencoes = Number((dados.totalISSRetido || 0) + (dados.totalIRRFRetido || 0) + (dados.totalCSRFRetido || 0));
    const totalLiquido = Number(dados.totalLiquidoFaturado || 0);
    const registros = Array.isArray(dados.registrosContabeis) ? dados.registrosContabeis : [];

    return `
      <div class="card p-3" style="background:var(--bg-card,#1e293b);border-radius:8px;border:1px solid #334155;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h4 style="margin:0;font-size:1.15rem;color:#38bdf8;">
              <i class="fas fa-file-invoice-dollar"></i> Central de Fechamento Fiscal B2B
            </h4>
            <small style="color:#94a3b8;">Segregação NF-e (Peças mod 55) vs NFS-e (Serviços LC 116) e Retenções na Fonte</small>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline-info" data-act="abrir-espelho-fiscal-b2b">
              <i class="fas fa-calculator"></i> Novo Espelho Fiscal
            </button>
            <button class="btn btn-sm btn-success" data-act="exportar-lote-contabil-fiscal">
              <i class="fas fa-file-export"></i> Exportar Lote Contábil
            </button>
          </div>
        </div>

        <!-- Cards de Totalizadores Fiscais -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:16px;">
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #38bdf8;">
            <span style="font-size:0.8rem;color:#bae6fd;">NF-e Peças (Mod 55)</span>
            <div style="font-size:1.35rem;font-weight:bold;color:#38bdf8;">${formatarMoeda(totalPecas)}</div>
          </div>
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #a855f7;">
            <span style="font-size:0.8rem;color:#e9d5ff;">NFS-e Serviços (LC 116)</span>
            <div style="font-size:1.35rem;font-weight:bold;color:#c084fc;">${formatarMoeda(totalServicos)}</div>
          </div>
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #ef4444;">
            <span style="font-size:0.8rem;color:#fca5a5;">Retenções (ISS/IRRF/CSRF)</span>
            <div style="font-size:1.35rem;font-weight:bold;color:#ef4444;">-${formatarMoeda(totalRetencoes)}</div>
          </div>
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #22c55e;">
            <span style="font-size:0.8rem;color:#86efac;">Líquido a Faturar / Receber</span>
            <div style="font-size:1.35rem;font-weight:bold;color:#22c55e;">${formatarMoeda(totalLiquido)}</div>
          </div>
        </div>

        <!-- Tabela de Fechamentos Fiscais Emitidos -->
        <div class="table-responsive" style="max-height:420px;overflow-y:auto;">
          <table class="table table-dark table-hover table-sm" style="margin:0;font-size:0.85rem;">
            <thead>
              <tr style="background:#0f172a;color:#94a3b8;">
                <th>ID / Origem</th>
                <th>Cliente Frotista</th>
                <th>Base Peças (NF-e)</th>
                <th>Base Serviços (NFS-e)</th>
                <th>Retenções</th>
                <th>Valor Líquido</th>
                <th>Notas Emitidas</th>
                <th style="text-align:right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${registros.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:16px;color:#64748b;">Nenhum fechamento fiscal emitido na competência.</td></tr>' : registros.map(r => `
                <tr>
                  <td><strong>${r.id}</strong> <small style="color:#94a3b8;">(${r.borderoId ? `Bord. #${r.borderoId}` : `OS #${r.osId}`})</small></td>
                  <td>${r.clienteNome || '-'}</td>
                  <td>${formatarMoeda(r.baseCalculoPecasTotal)}</td>
                  <td>${formatarMoeda(r.baseCalculoServicosTotal)}</td>
                  <td style="color:#ef4444;">-${formatarMoeda(r.retencoes?.totalRetencoesNaFonte)}</td>
                  <td><strong style="color:#22c55e;">${formatarMoeda(r.valorLiquidoAReceber)}</strong></td>
                  <td>
                    ${r.status === 'notas_emitidas' ? `
                      <span class="badge" style="background:#166534;color:#bbf7d0;">
                        NF-e: ${r.notasEmitidas?.numeroNFePecas || '-'} | NFS-e: ${r.notasEmitidas?.numeroNFSeServicos || '-'}
                      </span>
                    ` : '<span class="badge" style="background:#854d0e;color:#fef08a;">Pendente Emissão</span>'}
                  </td>
                  <td style="text-align:right;">
                    ${r.status !== 'notas_emitidas' ? `
                      <button class="btn btn-xs btn-primary" data-act="abrir-emitir-notas-b2b" data-espelho-id="${r.id}">
                        <i class="fas fa-file-invoice"></i> Emitir Notas
                      </button>
                    ` : '<span style="color:#94a3b8;font-size:0.75rem;"><i class="fas fa-check-circle text-success"></i> Concluído</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function modalGerarEspelhoFiscalB2BHtml(dados = {}) {
    return `
      <div class="modal-dialog-b2b" style="max-width:540px;background:#1e293b;border-radius:10px;padding:20px;color:#f8fafc;box-shadow:0 10px 25px rgba(0,0,0,0.6);border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h4 style="margin:0;font-size:1.1rem;color:#38bdf8;">
            <i class="fas fa-calculator"></i> Gerar Espelho Fiscal B2B
          </h4>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-fiscal" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Origem do Faturamento:</label>
            <select id="espelho-tipo-fonte" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border:1px solid #475569;">
              <option value="bordero">Borderô B2B Consolidado</option>
              <option value="os">Ordem de Serviço Individual</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">ID / Número da Origem:</label>
            <input type="text" id="espelho-origem-id" class="form-control form-control-sm" placeholder="Ex: BORD-101 ou os_123" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
        </div>

        <div style="margin-bottom:10px;">
          <label style="font-size:0.8rem;color:#cbd5e1;">Regime Tributário da Oficina:</label>
          <select id="espelho-regime" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border:1px solid #475569;">
            <option value="simples_nacional">Simples Nacional (Dispensa IRRF/CSRF)</option>
            <option value="lucro_presumido">Lucro Presumido (Retenção Completa)</option>
            <option value="lucro_real">Lucro Real (Retenção Completa)</option>
          </select>
        </div>

        <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;margin-bottom:10px;">
          <span style="font-size:0.8rem;color:#38bdf8;font-weight:bold;">Retenções Tributárias na Fonte (exclusivas s/ Serviços):</span>
          <div style="display:flex;gap:16px;margin-top:6px;font-size:0.85rem;">
            <label style="cursor:pointer;"><input type="checkbox" id="espelho-reter-iss" checked> Reter ISS (5%)</label>
            <label style="cursor:pointer;"><input type="checkbox" id="espelho-reter-irrf"> Reter IRRF (1,5%)</label>
            <label style="cursor:pointer;"><input type="checkbox" id="espelho-reter-csrf"> Reter CSRF (4,65%)</label>
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:0.8rem;color:#cbd5e1;">Observações Fiscais:</label>
          <textarea id="espelho-obs" class="form-control form-control-sm" rows="2" placeholder="Informações de retenção e dados bancários..." style="background:#0f172a;color:#fff;border:1px solid #475569;"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-fiscal">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="confirmar-espelho-fiscal-b2b">
            <i class="fas fa-check"></i> Calcular e Gerar Espelho
          </button>
        </div>
      </div>
    `;
  }

  function modalRegistrarEmissaoNotasHtml(espelho = {}) {
    return `
      <div class="modal-dialog-b2b" style="max-width:500px;background:#1e293b;border-radius:10px;padding:20px;color:#f8fafc;box-shadow:0 10px 25px rgba(0,0,0,0.6);border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h4 style="margin:0;font-size:1.1rem;color:#38bdf8;">
            <i class="fas fa-file-invoice"></i> Registrar Emissão de Notas Fiscais
          </h4>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-fiscal" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        <input type="hidden" id="emissao-espelho-id" value="${espelho.id || ''}">

        <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;margin-bottom:12px;font-size:0.85rem;">
          <div><strong>Base Peças:</strong> ${formatarMoeda(espelho.baseCalculoPecasTotal)} | <strong>Base Serviços:</strong> ${formatarMoeda(espelho.baseCalculoServicosTotal)}</div>
          <div><strong>Valor Líquido a Receber:</strong> <span style="color:#22c55e;font-weight:bold;">${formatarMoeda(espelho.valorLiquidoAReceber)}</span></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Número NF-e (Peças):</label>
            <input type="text" id="emissao-nfe-num" class="form-control form-control-sm" placeholder="Ex: 5501" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Chave de Acesso (44 dígitos):</label>
            <input type="text" id="emissao-nfe-chave" class="form-control form-control-sm" placeholder="3526..." style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Número NFS-e (Serviços):</label>
            <input type="text" id="emissao-nfse-num" class="form-control form-control-sm" placeholder="Ex: 202601" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Código de Verificação:</label>
            <input type="text" id="emissao-nfse-cod" class="form-control form-control-sm" placeholder="Ex: ABC-123" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-fiscal">Cancelar</button>
          <button class="btn btn-sm btn-success" data-act="confirmar-emitir-notas-b2b">
            <i class="fas fa-check-circle"></i> Confirmar Emissão e Ajustar Líquido
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelFechamentoFiscalB2BHtml = renderPainelFechamentoFiscalB2BHtml;
  root.modalGerarEspelhoFiscalB2BHtml = modalGerarEspelhoFiscalB2BHtml;
  root.modalRegistrarEmissaoNotasHtml = modalRegistrarEmissaoNotasHtml;

})(typeof window !== 'undefined' ? window : globalThis);
