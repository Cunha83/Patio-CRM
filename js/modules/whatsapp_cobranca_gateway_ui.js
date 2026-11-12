/**
 * js/modules/whatsapp_cobranca_gateway_ui.js
 *
 * Componentes de UI: Cobrança Ativa & Acordos de Dívida, Gateway Real e Ciclo Autônomo 360º.
 * Teto Modular: <= 250 linhas
 */

(function(root) {
  'use strict';

  const esc = s => (!s ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  function renderPainelCobrancaGatewayAutonomoHtml(dados = {}) {
    const fila = dados.filaCobranca || [], acordos = dados.acordos || [], gw = dados.gatewayConfig || {}, filaOut = dados.filaOutbound || [], ciclos = dados.ciclosLogs || [];

    return `
      <div class="cobranca-gateway-container p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="mb-0">💳 Cobrança Ativa, Gateway WhatsApp Real & Ciclo Autônomo 360º</h5>
            <small class="text-muted">Inadimplência por cliente, acordos com desbloqueio e autopilot operacional.</small>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-act="abrir-config-gateway-whatsapp">⚙️ Gateway Evolution/Cloud</button>
            <button class="btn btn-sm btn-success" data-act="executar-ciclo-autonomo-360">⚡ Executar Ciclo Autônomo Diário</button>
          </div>
        </div>

        <ul class="nav nav-tabs mb-3" role="tablist">
          <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-cobranca-acordos">1. Cobrança & Acordos (${fila.length})</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-gateway-outbound">2. Gateway Real & Fila (${filaOut.length})</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-ciclo-autopilot">3. Ciclo Autônomo (${ciclos.length})</a></li>
        </ul>

        <div class="tab-content">
          <div class="tab-pane fade show active" id="tab-cobranca-acordos">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small text-muted">Fila de inadimplência no Cliente (clienteId)</span>
              <button class="btn btn-sm btn-primary" data-act="disparar-regua-cobranca-lote">📲 Disparar Régua WhatsApp</button>
            </div>
            ${fila.length === 0 ? '<div class="alert alert-light text-center py-3 text-muted">Nenhum cliente inadimplente na fila.</div>' : `
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle">
                  <thead><tr><th>Cliente</th><th>Aberto</th><th>Vencido</th><th>Atraso</th><th>Estágio</th><th class="text-end">Ações</th></tr></thead>
                  <tbody>
                    ${fila.map(c => `
                      <tr>
                        <td><strong>${esc(c.clienteNome)}</strong><br><small class="text-muted">${esc(c.clienteId)}</small></td>
                        <td>R$ ${(c.valorTotalExposicaoAbertaCliente || 0).toFixed(2)}</td>
                        <td class="${c.valorTotalExposicaoVencidaCliente > 0 ? 'text-danger fw-bold' : 'text-muted'}">R$ ${(c.valorTotalExposicaoVencidaCliente || 0).toFixed(2)}</td>
                        <td>${c.diasAtrasoMaximo > 0 ? `<span class="badge bg-danger">${c.diasAtrasoMaximo}d</span>` : '<span class="badge bg-success">Em dia</span>'}</td>
                        <td><span class="badge ${c.estagio.includes('bloqueio') || c.estagio.includes('acordo') ? 'bg-danger' : 'bg-warning text-dark'}">${esc(c.estagio)}</span></td>
                        <td class="text-end">
                          ${c.valorTotalExposicaoVencidaCliente > 0 ? `<button class="btn btn-xs btn-outline-danger" data-act="propor-acordo-renegociacao" data-cliente-id="${esc(c.clienteId)}" data-nome="${esc(c.clienteNome)}">📝 Acordo</button>` : ''}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}

            <h6 class="mt-3 mb-2">Termos de Acordo</h6>
            ${acordos.length === 0 ? '<div class="alert alert-light py-2 small text-muted">Nenhum termo de acordo registrado.</div>' : `
              <div class="table-responsive">
                <table class="table table-sm table-striped align-middle">
                  <thead><tr><th>ID</th><th>Cliente</th><th>Original</th><th>Acordo</th><th>Entrada</th><th>Status</th><th class="text-end">Ações</th></tr></thead>
                  <tbody>
                    ${acordos.map(a => `
                      <tr>
                        <td><code>${esc(a.id)}</code></td>
                        <td>${esc(a.clienteNome)}</td>
                        <td>R$ ${(a.valorTotalDividaOriginal || 0).toFixed(2)}</td>
                        <td>R$ ${(a.valorTotalAcordo || 0).toFixed(2)}</td>
                        <td class="fw-bold">R$ ${(a.valorEntrada || 0).toFixed(2)}</td>
                        <td><span class="badge ${a.status === 'ativo_em_dia' ? 'bg-success' : 'bg-warning text-dark'}">${esc(a.status)}</span></td>
                        <td class="text-end">
                          ${a.status === 'aguardando_pagamento_entrada' ? `<button class="btn btn-xs btn-success" data-act="liquidar-entrada-acordo-btn" data-id="${esc(a.id)}" data-valor="${a.valorEntrada}">💰 Liquidar Entrada</button>` : '<span class="text-success small">Crédito Liberado ✔</span>'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="tab-pane fade" id="tab-gateway-outbound">
            <div class="card p-2 mb-3 bg-light border">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <strong>Provedor: <span class="badge bg-primary">${esc(gw.provedor || 'evolution_api')}</span></strong>
                  <span class="small text-muted ms-2">${esc(gw.baseUrl || 'http://localhost:8080')} | ${esc(gw.instanceName || 'patio-crm-oficial')}</span>
                </div>
                <button class="btn btn-sm btn-outline-secondary" data-act="processar-fila-gateway-manual">🔄 Processar Fila</button>
              </div>
            </div>
            <h6>Fila Outbound</h6>
            ${filaOut.length === 0 ? '<div class="alert alert-light py-2 text-center text-muted small">Fila vazia.</div>' : `
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle">
                  <thead><tr><th>Destino</th><th>Mensagem</th><th>Status</th><th>Tentativas</th></tr></thead>
                  <tbody>
                    ${filaOut.map(i => `
                      <tr>
                        <td><strong>${esc(i.telefoneDestino)}</strong></td>
                        <td><small class="text-truncate d-inline-block" style="max-width: 320px;">${esc(i.mensagemTexto)}</small></td>
                        <td><span class="badge ${i.status === 'enviado' ? 'bg-success' : (i.status === 'dead_letter_falha_permanente' ? 'bg-danger' : 'bg-warning text-dark')}">${esc(i.status)}</span></td>
                        <td>${i.tentativas || 0}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="tab-pane fade" id="tab-ciclo-autopilot">
            <h6>Histórico do Autopilot Diário</h6>
            ${ciclos.length === 0 ? '<div class="alert alert-light py-3 text-center text-muted">Nenhum ciclo executado hoje.</div>' : `
              <div class="table-responsive">
                <table class="table table-sm table-hover align-middle">
                  <thead><tr><th>ID</th><th>Ref</th><th>Cobranças</th><th>Preditiva</th><th>Gateway</th><th>Briefing</th><th>Status</th></tr></thead>
                  <tbody>
                    ${ciclos.map(c => `
                      <tr>
                        <td><code>${esc(c.cicloId)}</code></td>
                        <td>${esc(c.dataReferencia)}</td>
                        <td><span class="badge bg-info">${c.clientesCobradosCount || 0}</span></td>
                        <td><span class="badge bg-warning text-dark">${c.alertasPreventivosDisparadosCount || 0}</span></td>
                        <td><span class="badge bg-primary">${c.mensagensGatewayProcessadasCount || 0}</span></td>
                        <td>${c.briefingExecutivoGerado ? '✔' : '—'}</td>
                        <td><span class="badge bg-success">${esc(c.statusCiclo)}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function modalFormalizarAcordoClienteHtml(cli = {}) {
    return `
      <div class="modal fade" id="modalFormalizarAcordoCliente" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Acordo: ${esc(cli.nome || cli.clienteId)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="acordoClienteId" value="${esc(cli.clienteId)}">
            <input type="hidden" id="acordoClienteNome" value="${esc(cli.nome)}">
            <div class="mb-2"><label class="form-label">Entrada (%):</label><input type="number" class="form-control" id="acordoPercentualEntrada" value="30"></div>
            <div class="mb-2"><label class="form-label">Parcelas:</label><input type="number" class="form-control" id="acordoQtdParcelas" value="3"></div>
            <div class="mb-2"><label class="form-label">Desconto Juros (%):</label><input type="number" class="form-control" id="acordoDescontoJuros" value="0"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger" data-act="confirmar-formalizacao-acordo">Gerar Termo & PIX</button>
          </div>
        </div></div>
      </div>
    `;
  }

  function modalConfigurarGatewayWhatsAppHtml(cfg = {}) {
    return `
      <div class="modal fade" id="modalConfigurarGatewayWhatsApp" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Gateway WhatsApp Real</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2"><label class="form-label">Provedor:</label>
              <select class="form-select" id="gwProvedor">
                <option value="evolution_api" ${cfg.provedor === 'evolution_api' ? 'selected' : ''}>Evolution API</option>
                <option value="meta_cloud_api" ${cfg.provedor === 'meta_cloud_api' ? 'selected' : ''}>Meta Cloud API</option>
              </select>
            </div>
            <div class="mb-2"><label class="form-label">Instância:</label><input type="text" class="form-control" id="gwInstanceName" value="${esc(cfg.instanceName || 'patio-crm-oficial')}"></div>
            <div class="mb-2"><label class="form-label">URL Base:</label><input type="text" class="form-control" id="gwBaseUrl" value="${esc(cfg.baseUrl || 'http://localhost:8080')}"></div>
            <div class="mb-2"><label class="form-label">API Key:</label><input type="password" class="form-control" id="gwApiKey" placeholder="Deixe em branco para manter"></div>
            <div class="mb-2"><label class="form-label">Segredo HMAC:</label><input type="text" class="form-control" id="gwWebhookSecret" value="${esc(cfg.webhookSecret || 'segredo-hmac-patio')}"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
            <button type="button" class="btn btn-primary" data-act="salvar-config-gateway-whatsapp">Salvar</button>
          </div>
        </div></div>
      </div>
    `;
  }

  root.renderPainelCobrancaGatewayAutonomoHtml = renderPainelCobrancaGatewayAutonomoHtml;
  root.modalFormalizarAcordoClienteHtml = modalFormalizarAcordoClienteHtml;
  root.modalConfigurarGatewayWhatsAppHtml = modalConfigurarGatewayWhatsAppHtml;
})(typeof window !== 'undefined' ? window : globalThis);
