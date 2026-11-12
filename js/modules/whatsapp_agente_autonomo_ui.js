// js/modules/whatsapp_agente_autonomo_ui.js
// Interface Visual do Agente WhatsApp Autônomo e Conexão Direta API Bancária
// Teto Modular: <= 280 linhas

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

  function renderPainelAgenteWhatsAppEBancoDiretoHtml(dados = {}) {
    const conexoes = Array.isArray(dados.conexoes) ? dados.conexoes : [];
    const cobrancas = Array.isArray(dados.cobrancas) ? dados.cobrancas : [];
    const logs = Array.isArray(dados.logs) ? dados.logs : [];

    const linhasConexoes = conexoes.length === 0
      ? '<tr><td colspan="4" class="text-center text-muted py-2">Nenhuma API bancária conectada.</td></tr>'
      : conexoes.map(c => `
          <tr>
            <td><strong>${esc(c.nomeBanco)}</strong> (${esc(c.codigoBanco)})</td>
            <td><span class="badge ${c.status === 'ativa' ? 'bg-success' : 'bg-warning'}">${esc(c.status)}</span></td>
            <td>${esc(c.ultimaSincronizacaoEm ? new Date(c.ultimaSincronizacaoEm).toLocaleString('pt-BR') : 'Pendente')}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary" data-act="sincronizar-api-banco" data-id="${esc(c.id)}">Sincronizar</button>
            </td>
          </tr>
        `).join('');

    const linhasCobrancas = cobrancas.length === 0
      ? '<tr><td colspan="5" class="text-center text-muted py-2">Nenhuma cobrança ativa registrada.</td></tr>'
      : cobrancas.slice(-5).reverse().map(c => `
          <tr>
            <td><code>${esc(c.txid || c.id)}</code></td>
            <td>${esc(c.clienteNome || 'Cliente')}</td>
            <td class="font-monospace">${moeda(c.valorCobrar)}</td>
            <td><span class="badge ${c.status.includes('liquidada') ? 'bg-success' : 'bg-info'}">${esc(c.status)}</span></td>
            <td><small class="text-muted">${esc(new Date(c.criadoEm).toLocaleDateString('pt-BR'))}</small></td>
          </tr>
        `).join('');

    return `
      <div class="card p-3 mb-4 shadow-sm">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="m-0 fw-bold">🤖 Agente WhatsApp Multi-Skill & Banco Direto</h5>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-success" data-act="abrir-modal-cobranca-pix-boleto">
              Emitir Cobrança PIX/Boleto
            </button>
            <button class="btn btn-sm btn-primary" data-act="abrir-modal-config-banco">
              Conectar API Bancária
            </button>
          </div>
        </div>

        <div class="row g-3">
          <div class="col-md-6">
            <div class="border rounded p-3 h-100 bg-light">
              <h6 class="fw-bold mb-2">💬 Console de Recepção Interativa (Pátio)</h6>
              <div class="mb-2">
                <input type="text" id="wpp_recepcao_placa" class="form-control form-control-sm mb-2" placeholder="Placa do Veículo (ex: ABC1D23)" />
                <textarea id="wpp_recepcao_mensagem" class="form-control form-control-sm" rows="2" placeholder="Ex: Solicitar triagem portaria / Fazer checkin"></textarea>
              </div>
              <button class="btn btn-sm btn-dark w-100" data-act="enviar-msg-recepcao">Simular Chat Recepção</button>
              <div id="wpp_recepcao_resposta" class="mt-2 p-2 bg-white rounded border small d-none" style="white-space:pre-line"></div>
            </div>
          </div>

          <div class="col-md-6">
            <div class="border rounded p-3 h-100 bg-light">
              <h6 class="fw-bold mb-2">📊 Console do Analista Financeiro (Gerência)</h6>
              <div class="mb-2">
                <select id="wpp_analista_perfil" class="form-select form-select-sm mb-2">
                  <option value="gerencia">Perfil: Gerência / Admin (Autorizado)</option>
                  <option value="mecanico">Perfil: Operacional (Bloqueio 403)</option>
                </select>
                <textarea id="wpp_analista_mensagem" class="form-control form-control-sm mb-2" rows="2" placeholder="Comando ou Cole o Extrato / Linhas CNAB"></textarea>
              </div>
              <button class="btn btn-sm btn-success w-100" data-act="enviar-comando-analista">Executar Comando Analista</button>
              <div id="wpp_analista_resposta" class="mt-2 p-2 bg-white rounded border small d-none" style="white-space:pre-line"></div>
            </div>
          </div>
        </div>

        <hr class="my-3"/>

        <div class="row g-3">
          <div class="col-md-6">
            <h6 class="fw-bold mb-2">🏦 Conexões Diretas API Bancária (Open Finance)</h6>
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr><th>Banco</th><th>Status</th><th>Última Sinc.</th><th>Ação</th></tr>
                </thead>
                <tbody>${linhasConexoes}</tbody>
              </table>
            </div>
          </div>

          <div class="col-md-6">
            <h6 class="fw-bold mb-2">⚡ Últimas Cobranças PIX / Boleto Emitidas</h6>
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr><th>TXID</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Data</th></tr>
                </thead>
                <tbody>${linhasCobrancas}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function modalGerarCobrancaPixBoletoHtml(dados = {}) {
    const clientes = Array.isArray(dados.clientes) ? dados.clientes : [];
    const borderos = Array.isArray(dados.borderos) ? dados.borderos : [];

    const optsClientes = clientes.map(c => `
      <option value="${esc(c.id)}">${esc(c.nome || c.razaoSocial)}</option>
    `).join('');

    const optsBorderos = borderos.map(b => `
      <option value="${esc(b.id)}">Borderô #${esc(b.num || b.id)} — ${moeda(b.saldoDevedor || b.valorTotal)}</option>
    `).join('');

    return `
      <div style="max-width:560px;margin:0 auto">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
          <h5 class="m-0 fw-bold">Gerar Cobrança PIX / Boleto (WhatsApp)</h5>
          <button type="button" class="btn-close" onclick="fecharModalGenerico()"></button>
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Cliente Frotista:</label>
          <select id="cobranca_cliente_id" class="form-select form-select-sm">
            <option value="">-- Selecione o Cliente --</option>
            ${optsClientes}
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Borderô Vinculado (Opcional):</label>
          <select id="cobranca_bordero_id" class="form-select form-select-sm">
            <option value="">-- Cobrança Avulsa / Geral --</option>
            ${optsBorderos}
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Forma de Cobrança:</label>
          <select id="cobranca_forma" class="form-select form-select-sm">
            <option value="pix_brcode_e_boleto">PIX BR Code + Boleto Bancário</option>
            <option value="pix_somente">Somente PIX Copia e Cola</option>
            <option value="boleto_somente">Somente Boleto Bancário</option>
          </select>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-4">
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="fecharModalGenerico()">Cancelar</button>
          <button type="button" class="btn btn-sm btn-success fw-bold" data-act="confirmar-gerar-cobranca-pix-boleto">
            Gerar e Enviar no Chat
          </button>
        </div>
      </div>
    `;
  }

  function modalConfigurarApiBancoDiretoHtml(conexao = {}) {
    return `
      <div style="max-width:540px;margin:0 auto">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
          <h5 class="m-0 fw-bold">Conectar API Bancária Direta</h5>
          <button type="button" class="btn-close" onclick="fecharModalGenerico()"></button>
        </div>

        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small fw-bold">Código Banco:</label>
            <input type="text" id="api_banco_codigo" class="form-control form-control-sm" value="${esc(conexao.codigoBanco || '756')}" />
          </div>
          <div class="col-md-8">
            <label class="form-label small fw-bold">Nome da Instituição:</label>
            <input type="text" id="api_banco_nome" class="form-control form-control-sm" value="${esc(conexao.nomeBanco || 'Sicoob / Inter API')}" />
          </div>
        </div>

        <div class="mb-2">
          <label class="form-label small fw-bold">Client ID (API):</label>
          <input type="text" id="api_banco_client_id" class="form-control form-control-sm" value="${esc(conexao.clientId || '')}" placeholder="Ex: cli_live_abc123" />
        </div>

        <div class="mb-2">
          <label class="form-label small fw-bold">Client Secret:</label>
          <input type="password" id="api_banco_client_secret" class="form-control form-control-sm" placeholder="••••••••••••••••" />
        </div>

        <div class="mb-3">
          <label class="form-label small fw-bold">Chave PIX Padrão:</label>
          <input type="text" id="api_banco_chave_pix" class="form-control form-control-sm" value="${esc(conexao.chavePixPadrao || 'financeiro@automolasfort.com.br')}" />
        </div>

        <div class="d-flex justify-content-end gap-2 mt-4">
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="fecharModalGenerico()">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary fw-bold" data-act="salvar-config-banco">
            Salvar Conexão
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelAgenteWhatsAppEBancoDiretoHtml = renderPainelAgenteWhatsAppEBancoDiretoHtml;
  root.modalGerarCobrancaPixBoletoHtml = modalGerarCobrancaPixBoletoHtml;
  root.modalConfigurarApiBancoDiretoHtml = modalConfigurarApiBancoDiretoHtml;

})(typeof window !== 'undefined' ? window : globalThis);

