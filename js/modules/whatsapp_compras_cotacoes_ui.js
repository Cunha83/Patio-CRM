/**
 * js/modules/whatsapp_compras_cotacoes_ui.js
 *
 * Componentes de UI: Cotação de Fornecedores WhatsApp, Memória de Preços e Mapa Comparativo
 * Teto Modular: <= 265 linhas
 */

(function(root) {
  'use strict';

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderPainelCotacoesFornecedoresWhatsAppHtml(dados = {}) {
    const cotacoes = dados.cotacoes || [];

    return `
      <div class="compras-cotacoes-container p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="mb-0">🛒 Cotações Automatizadas com Fornecedores (WhatsApp)</h5>
            <small class="text-muted">Memória de compras, regra de mínimo 3 fornecedores e mapa comparativo ponderado.</small>
          </div>
          <button class="btn btn-sm btn-primary" data-act="abrir-nova-cotacao-whatsapp">
            ➕ Nova Cotação B2B
          </button>
        </div>

        ${cotacoes.length === 0 ? '<div class="alert alert-light text-center py-4 text-muted">Nenhuma cotação de compras ativa no momento.</div>' : ''}

        ${cotacoes.map(c => `
          <div class="card p-3 shadow-sm border rounded mb-3">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="mb-1">${esc(c.tituloCotacao)}</h6>
                <div class="small text-muted">
                  Itens: <strong>${(c.itens || []).map(i => `${i.quantidade || 1}x ${esc(i.descricao || 'Item')}`).join(', ')}</strong> |
                  Status: <span class="badge ${c.status === 'aprovada_pedido_gerado' ? 'bg-success' : (c.status === 'aguardando_indicacao_fornecedores' ? 'bg-warning text-dark' : 'bg-info')}">${esc(c.status)}</span>
                  ${c.prioridadeUrgenciaBox ? '<span class="badge bg-danger ms-1">🚨 Urgência Box</span>' : ''}
                </div>
              </div>
              <div class="text-end">
                ${c.status === 'aguardando_indicacao_fornecedores' ? `
                  <button class="btn btn-sm btn-warning" data-act="abrir-complementar-fornecedores" data-id="${esc(c.id)}">
                    ⚠️ Indicar +${c.faltamFornecedoresCount || 2} Fornecedores
                  </button>
                ` : ''}
                ${c.status !== 'aprovada_pedido_gerado' ? `
                  <button class="btn btn-sm btn-outline-primary ms-1" data-act="abrir-proposta-fornecedor" data-id="${esc(c.id)}">
                    📩 Registrar Proposta
                  </button>
                ` : `<span class="badge bg-success">Pedido #${esc(c.pedidoCompraId || '')}</span>`}
              </div>
            </div>

            ${c.perguntaFornecedorFaltante ? `
              <div class="alert alert-warning p-2 mt-2 mb-2 small">
                ${esc(c.perguntaFornecedorFaltante).replace(/\n/g, '<br/>')}
              </div>
            ` : ''}

            <!-- Mapa Comparativo de Propostas -->
            ${(c.propostas && c.propostas.length > 0) ? `
              <div class="mt-3 table-responsive">
                <table class="table table-sm table-bordered align-middle mb-0">
                  <thead class="table-light small">
                    <tr>
                      <th>Fornecedor</th>
                      <th>Valor Ofertado</th>
                      <th>Vs Última Compra</th>
                      <th>Prazo Entrega</th>
                      <th>Score</th>
                      <th class="text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody class="small">
                    ${c.propostas.map(p => {
                      const h = p.analiseHistoricoCompras || {};
                      const varPct = h.variacaoPercentualVsUltimaCompra || 0;
                      return `
                        <tr>
                          <td><strong>${esc(p.fornecedorNome)}</strong></td>
                          <td>R$ ${(p.valorTotalProposta || 0).toFixed(2)}</td>
                          <td>
                            <span class="badge ${varPct <= 0 ? 'bg-success' : 'bg-danger'}">
                              ${varPct <= 0 ? 'Economia ' : '+'}${varPct}%
                            </span>
                            <span class="text-muted ms-1">(Ref: R$ ${(h.somaUltimaCompraReferencia || 0).toFixed(2)})</span>
                          </td>
                          <td>${p.prazoEntregaHoras || 24}h</td>
                          <td><strong>${p.scoreFinal || '--'}</strong></td>
                          <td class="text-center">
                            ${c.status !== 'aprovada_pedido_gerado' ? `
                              <button class="btn btn-xs btn-success" data-act="aprovar-proposta-cotacao" data-id="${esc(c.id)}" data-proposta-id="${esc(p.id)}">
                                ✅ Aprovar e Comprar
                              </button>
                            ` : 'Homologado'}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<div class="small text-muted mt-2">Aguardando envio das propostas pelos fornecedores convidados.</div>'}
          </div>
        `).join('')}
      </div>
    `;
  }

  function modalAbrirCotacaoFornecedoresHtml(dados = {}) {
    return `
      <div class="modal-cotacao p-3">
        <h6>🛒 Abertura de Cotação B2B de Peças</h6>
        <div class="mb-2">
          <label class="form-label small">Título / Descrição da Cotação:</label>
          <input type="text" id="cot-titulo" class="form-control form-control-sm" value="Cotação de Feixes e Grampos U"/>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <label class="form-label small">OS Vinculada (opcional):</label>
            <input type="text" id="cot-os-id" class="form-control form-control-sm" placeholder="Ex: os_104_1"/>
          </div>
          <div class="col-6">
            <label class="form-label small">Gargalo do Box (opcional):</label>
            <input type="text" id="cot-gargalo-id" class="form-control form-control-sm" value="aguardando_peca"/>
          </div>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="cot-urgencia-box"/>
          <label class="form-check-label small" for="cot-urgencia-box">
            🚨 Prioridade Máxima: Box Parado na Oficina (pesa mais o menor prazo de entrega)
          </label>
        </div>
        <div class="text-end">
          <button class="btn btn-sm btn-secondary me-2" onclick="window.app?.fecharFolha?.()">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="confirmar-abrir-cotacao-whatsapp">Disparar Cotação</button>
        </div>
      </div>
    `;
  }

  function modalComplementarFornecedoresHtml(cotacao = {}) {
    return `
      <div class="modal-complementar p-3">
        <h6>⚠️ Indicação de Fornecedores Faltantes</h6>
        <p class="small text-muted">A regra de compras exige no mínimo 3 fornecedores. Faltam ${cotacao.faltamFornecedoresCount || 2} fornecedor(es).</p>
        <div class="mb-2">
          <label class="form-label small">Fornecedor 1 (Nome e Telefone WhatsApp):</label>
          <div class="row g-1">
            <div class="col-7"><input type="text" id="comp-nome-1" class="form-control form-control-sm" placeholder="Nome da Distribuidora"/></div>
            <div class="col-5"><input type="text" id="comp-tel-1" class="form-control form-control-sm" placeholder="11999998888"/></div>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small">Fornecedor 2 (Nome e Telefone WhatsApp):</label>
          <div class="row g-1">
            <div class="col-7"><input type="text" id="comp-nome-2" class="form-control form-control-sm" placeholder="Nome da Distribuidora"/></div>
            <div class="col-5"><input type="text" id="comp-tel-2" class="form-control form-control-sm" placeholder="11999997777"/></div>
          </div>
        </div>
        <input type="hidden" id="comp-cotacao-id" value="${esc(cotacao.id)}"/>
        <div class="text-end">
          <button class="btn btn-sm btn-secondary me-2" onclick="window.app?.fecharFolha?.()">Cancelar</button>
          <button class="btn btn-sm btn-warning" data-act="confirmar-complementar-fornecedores">Adicionar e Disparar</button>
        </div>
      </div>
    `;
  }

  function modalRegistrarPropostaFornecedorHtml(cotacao = {}) {
    return `
      <div class="modal-proposta p-3">
        <h6>📩 Registrar Proposta de Fornecedor</h6>
        <div class="mb-2">
          <label class="form-label small">Fornecedor:</label>
          <input type="text" id="prop-fornecedor" class="form-control form-control-sm" placeholder="Ex: Molas Brasil Peças"/>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <label class="form-label small">Valor Total Ofertado (R$):</label>
            <input type="number" step="0.01" id="prop-valor" class="form-control form-control-sm" placeholder="Ex: 350.00"/>
          </div>
          <div class="col-6">
            <label class="form-label small">Prazo Entrega (Horas):</label>
            <input type="number" id="prop-prazo" class="form-control form-control-sm" value="24"/>
          </div>
        </div>
        <input type="hidden" id="prop-cotacao-id" value="${esc(cotacao.id)}"/>
        <div class="text-end">
          <button class="btn btn-sm btn-secondary me-2" onclick="window.app?.fecharFolha?.()">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="salvar-proposta-fornecedor">Gravar Proposta</button>
        </div>
      </div>
    `;
  }

  root.renderPainelCotacoesFornecedoresWhatsAppHtml = renderPainelCotacoesFornecedoresWhatsAppHtml;
  root.modalAbrirCotacaoFornecedoresHtml = modalAbrirCotacaoFornecedoresHtml;
  root.modalComplementarFornecedoresHtml = modalComplementarFornecedoresHtml;
  root.modalRegistrarPropostaFornecedorHtml = modalRegistrarPropostaFornecedorHtml;

})(typeof window !== 'undefined' ? window : globalThis);

