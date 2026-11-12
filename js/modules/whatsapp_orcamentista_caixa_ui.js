/**
 * js/modules/whatsapp_orcamentista_caixa_ui.js
 *
 * Componentes de UI: Orçamentista Técnico IA WhatsApp e Fechamento de Caixa Diário
 * Teto Modular: <= 270 linhas
 */

(function(root) {
  'use strict';

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderPainelOrcamentistaECaixaDiarioHtml(dados = {}) {
    const preOrcamentos = dados.preOrcamentos || [];
    const fechamento = dados.fechamento || {};
    const previa = dados.previa || {};

    return `
      <div class="orcamentista-caixa-container p-4" style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <!-- Painel Orçamentista Técnico IA -->
        <div class="card p-3 shadow-sm border rounded">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">🤖 Orçamentista Técnico IA (WhatsApp)</h5>
            <button class="btn btn-sm btn-primary" data-act="abrir-pre-orcamento-whatsapp">
              ➕ Novo Pré-Orçamento
            </button>
          </div>
          <p class="text-muted small">Cotação rápida de feixes e molas com piso de margem CMP e validação de crédito frotista.</p>

          <div class="pre-orcamentos-lista" style="max-height: 420px; overflow-y: auto;">
            ${preOrcamentos.length === 0 ? '<div class="alert alert-light text-center py-4 text-muted">Nenhum pré-orçamento recente gerado.</div>' : ''}
            ${preOrcamentos.map(q => `
              <div class="border rounded p-2 mb-2 bg-light">
                <div class="d-flex justify-content-between">
                  <strong>${esc(q.placa || 'Sem Placa')} — ${esc(q.clienteNome || 'Cliente')}</strong>
                  <span class="badge ${q.status === 'convertido_os' ? 'bg-success' : 'bg-primary'}">${esc(q.status)}</span>
                </div>
                <div class="small text-muted mt-1">
                  Total: <strong>R$ ${(q.valorTotalPreOrcamento || 0).toFixed(2)}</strong> | Condição: 
                  <span class="badge ${q.condicaoPagamentoPermitida === 'somente_a_vista_pix' ? 'bg-danger' : 'bg-info'}">
                    ${q.condicaoPagamentoPermitida === 'somente_a_vista_pix' ? 'À Vista (PIX)' : 'Faturado'}
                  </span>
                </div>
                <div class="small mt-1">
                  Itens: ${q.itens ? q.itens.map(i => `${i.quantidade}x ${esc(i.descricao)} ${i.ajusteMargemCMPAtivado ? '<span class="badge bg-warning text-dark">CMP Protegido</span>' : ''}`).join(', ') : 'N/A'}
                </div>
                ${q.status !== 'convertido_os' ? `
                  <div class="mt-2 text-end">
                    <button class="btn btn-xs btn-outline-success" data-act="converter-pre-orcamento-os" data-id="${esc(q.id)}">
                      ⚡ Converter em OS
                    </button>
                  </div>
                ` : `<div class="mt-1 small text-success">Convertido na OS #${esc(q.osGeradaId || '')}</div>`}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Painel Fechamento de Caixa Diário -->
        <div class="card p-3 shadow-sm border rounded">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">💼 Fechamento de Caixa Diário Auditado</h5>
            <button class="btn btn-sm btn-success" data-act="abrir-fechar-caixa-diario">
              🔒 Fechar Caixa do Dia
            </button>
          </div>
          <p class="text-muted small">Apuração em tempo real por PIX, Boleto e Dinheiro com carimbo criptográfico SHA-256.</p>

          <div class="resumo-caixa p-3 border rounded mb-3 bg-white">
            <div class="row text-center">
              <div class="col-4">
                <div class="text-muted small">Entradas Dia</div>
                <h4 class="text-success mb-0">R$ ${(fechamento.totalEntradasDia ?? previa.totalEntradasDia ?? 0).toFixed(2)}</h4>
              </div>
              <div class="col-4">
                <div class="text-muted small">Saídas Dia</div>
                <h4 class="text-danger mb-0">R$ ${(fechamento.totalSaidasDia ?? previa.totalSaidasDia ?? 0).toFixed(2)}</h4>
              </div>
              <div class="col-4">
                <div class="text-muted small">Saldo Final</div>
                <h4 class="text-primary mb-0">R$ ${(fechamento.saldoFinalEsperado ?? previa.saldoFinalEsperado ?? 0).toFixed(2)}</h4>
              </div>
            </div>
            <hr class="my-2"/>
            <div class="small d-flex justify-content-between">
              <span>PIX: R$ ${((fechamento.detalhamentoMeios || previa.detalhamentoMeios)?.PIX || 0).toFixed(2)}</span>
              <span>Boleto: R$ ${((fechamento.detalhamentoMeios || previa.detalhamentoMeios)?.BOLETO || 0).toFixed(2)}</span>
              <span>Dinheiro: R$ ${((fechamento.detalhamentoMeios || previa.detalhamentoMeios)?.DINHEIRO || 0).toFixed(2)}</span>
            </div>
          </div>

          ${fechamento.hashFechamentoCaixa ? `
            <div class="alert alert-success p-2 small">
              <strong>Status Auditoria:</strong> ${esc(fechamento.statusAuditoria)}<br/>
              <strong>Hash SHA-256:</strong> <code>${esc(fechamento.hashFechamentoCaixa.substring(0, 36))}...</code>
            </div>
          ` : `
            <div class="alert alert-warning p-2 small">
              Caixa aberto em apuração. Realize a conferência física para encerramento formal.
            </div>
          `}

          <div class="text-end mt-2">
            <button class="btn btn-sm btn-outline-primary" data-act="enviar-fechamento-caixa-whatsapp">
              📲 Enviar Boletim no WhatsApp
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function modalGerarPreOrcamentoWhatsAppHtml(dados = {}) {
    return `
      <div class="modal-pre-orcamento p-3">
        <h6>🤖 Gerar Pré-Orçamento Técnico IA</h6>
        <div class="mb-2">
          <label class="form-label small">Cliente (Frotista ou Avulso):</label>
          <select id="orc-cliente-id" class="form-select form-select-sm">
            <option value="">Selecione ou deixe em branco...</option>
            ${(dados.clientes || []).map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <label class="form-label small">Placa do Veículo:</label>
            <input type="text" id="orc-placa" class="form-control form-control-sm" placeholder="Ex: ABC-1234"/>
          </div>
          <div class="col-6">
            <label class="form-label small">Markup Mínimo CMP (%):</label>
            <input type="number" id="orc-markup" class="form-control form-control-sm" value="35"/>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small">Mensagem / Solicitação de Peças e Serviços:</label>
          <textarea id="orc-mensagem-itens" class="form-control form-control-sm" rows="3" placeholder="Ex: 2 feixes de mola traseiro e 2 pinos de centro"></textarea>
        </div>
        <div class="text-end">
          <button class="btn btn-sm btn-secondary me-2" onclick="window.app?.fecharFolha?.()">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="confirmar-pre-orcamento-whatsapp">Gerar e Enviar</button>
        </div>
      </div>
    `;
  }

  function modalFecharCaixaDiarioHtml(previa = {}) {
    return `
      <div class="modal-fechar-caixa p-3">
        <h6>🔒 Fechamento de Caixa Diário Auditado</h6>
        <div class="alert alert-info py-2 small mb-3">
          Total Entradas Esperadas: <strong>R$ ${(previa.totalEntradasDia || 0).toFixed(2)}</strong> | Saídas: <strong>R$ ${(previa.totalSaidasDia || 0).toFixed(2)}</strong>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-4">
            <label class="form-label small">Total PIX:</label>
            <input type="number" step="0.01" id="cx-conf-pix" class="form-control form-control-sm" value="${(previa.detalhamentoMeios?.PIX || 0).toFixed(2)}"/>
          </div>
          <div class="col-4">
            <label class="form-label small">Total Boleto:</label>
            <input type="number" step="0.01" id="cx-conf-boleto" class="form-control form-control-sm" value="${(previa.detalhamentoMeios?.BOLETO || 0).toFixed(2)}"/>
          </div>
          <div class="col-4">
            <label class="form-label small">Total Dinheiro:</label>
            <input type="number" step="0.01" id="cx-conf-dinheiro" class="form-control form-control-sm" value="${(previa.detalhamentoMeios?.DINHEIRO || 0).toFixed(2)}"/>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small">Justificativa de Divergência (obrigatório se houver diferença):</label>
          <input type="text" id="cx-justificativa" class="form-control form-control-sm" placeholder="Ex: Tarifas de máquina ou estorno"/>
        </div>
        <div class="text-end">
          <button class="btn btn-sm btn-secondary me-2" onclick="window.app?.fecharFolha?.()">Cancelar</button>
          <button class="btn btn-sm btn-success" data-act="confirmar-fechar-caixa-diario">Homologar Fechamento</button>
        </div>
      </div>
    `;
  }

  root.renderPainelOrcamentistaECaixaDiarioHtml = renderPainelOrcamentistaECaixaDiarioHtml;
  root.modalGerarPreOrcamentoWhatsAppHtml = modalGerarPreOrcamentoWhatsAppHtml;
  root.modalFecharCaixaDiarioHtml = modalFecharCaixaDiarioHtml;

})(typeof window !== 'undefined' ? window : globalThis);

