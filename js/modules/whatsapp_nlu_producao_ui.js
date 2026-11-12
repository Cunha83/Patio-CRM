/**
 * js/modules/whatsapp_nlu_producao_ui.js
 *
 * Componentes de UI: Motor NLU Ollama Local, Console de Tool Calling e Monitor de Stack Docker.
 * Teto Modular: <= 250 linhas
 */

(function(root) {
  'use strict';

  const esc = s => (!s ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  function renderPainelNluOllamaEStackProducaoHtml(dados = {}) {
    const nlu = dados.nluConfig || {};
    const diag = dados.healthcheck || { componentes: {}, scoreProntidaoInfra: 0 };
    const logsNlu = dados.logsNlu || [];
    const comps = diag.componentes || {};

    return `
      <div class="nlu-producao-container p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="mb-0">🧠 Motor NLU Híbrido (Ollama GPU) & Stack de Produção</h5>
            <small class="text-muted">Tool Calling estruturado local, fallback determinístico e monitor Docker.</small>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-act="abrir-config-nlu-ollama">⚙️ Configurar NLU</button>
            <button class="btn btn-sm btn-outline-secondary" data-act="abrir-docker-blueprint-btn">🐳 Docker Compose</button>
            <button class="btn btn-sm btn-info text-white" data-act="atualizar-healthcheck-stack-btn">🔄 Healthcheck Stack</button>
          </div>
        </div>

        <!-- CARDS DE SUBSISTEMAS DE PRODUÇÃO -->
        <div class="row g-2 mb-3">
          <div class="col-md-3">
            <div class="card p-2 border ${comps.coreErpDatabase?.status === 'operacional' ? 'border-success' : 'border-danger'}">
              <span class="small text-muted">Core ERP & DB</span>
              <div class="d-flex justify-content-between align-items-center">
                <strong>${esc(comps.coreErpDatabase?.status || 'operacional')}</strong>
                <span class="badge ${comps.coreErpDatabase?.status === 'operacional' ? 'bg-success' : 'bg-danger'}">${comps.coreErpDatabase?.score || 25} pts</span>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 border ${comps.evolutionGateway?.status === 'operacional' ? 'border-success' : 'border-warning'}">
              <span class="small text-muted">Evolution API (Gateway)</span>
              <div class="d-flex justify-content-between align-items-center">
                <strong>${esc(comps.evolutionGateway?.status || 'operacional')}</strong>
                <span class="badge ${comps.evolutionGateway?.status === 'operacional' ? 'bg-success' : 'bg-warning text-dark'}">${comps.evolutionGateway?.score || 25} pts</span>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 border ${comps.ollamaLocalNlu?.status === 'operacional' ? 'border-success' : 'border-secondary'}">
              <span class="small text-muted">Ollama NLU (Local GPU)</span>
              <div class="d-flex justify-content-between align-items-center">
                <strong>${esc(comps.ollamaLocalNlu?.status || 'operacional')}</strong>
                <span class="badge ${comps.ollamaLocalNlu?.status === 'operacional' ? 'bg-success' : 'bg-secondary'}">${comps.ollamaLocalNlu?.score || 25} pts</span>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 border border-info">
              <span class="small text-muted">Prontidão da Infraestrutura</span>
              <div class="d-flex justify-content-between align-items-center">
                <strong class="fs-6">${diag.scoreProntidaoInfra || 100}/100</strong>
                <span class="badge ${diag.prontoParaProducao !== false ? 'bg-success' : 'bg-danger'}">${diag.prontoParaProducao !== false ? 'Pronto' : 'Pendente'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- CONSOLE DE TESTES NLU INTERATIVO -->
        <div class="card p-3 mb-3 border bg-light">
          <h6>Testador de Tool Calling & NLU (Ollama / Fallback)</h6>
          <div class="input-group mb-2">
            <input type="text" id="nluInputMensagem" class="form-control" placeholder="Ex: Bom dia, caminhão ABC1D23 chegou na portaria com 380000 km para triagem">
            <select id="nluInputPerfil" class="form-select" style="max-width: 140px;">
              <option value="cliente">Cliente</option>
              <option value="gerencia">Gerência</option>
            </select>
            <button class="btn btn-primary" data-act="testar-nlu-mensagem-btn">🚀 Interpretar & Executar</button>
          </div>
          <div id="nluConsoleOutput" class="small p-2 bg-dark text-light font-monospace rounded" style="display:none; max-height: 180px; overflow-y: auto;"></div>
        </div>

        <!-- TELEMETRIA NLU -->
        <h6>Telemetria de Inferência NLU Recente</h6>
        ${logsNlu.length === 0 ? '<div class="alert alert-light py-2 text-center text-muted small">Nenhum log de inferência registrado.</div>' : `
          <div class="table-responsive">
            <table class="table table-sm table-hover align-middle">
              <thead><tr><th>Mensagem</th><th>Skill Alvo</th><th>Ação</th><th>Entidades Extraídas</th><th>Provedor</th><th>Status</th></tr></thead>
              <tbody>
                ${logsNlu.slice(-8).reverse().map(l => `
                  <tr>
                    <td><small class="text-truncate d-inline-block" style="max-width: 280px;">${esc(l.mensagem)}</small></td>
                    <td><code>${esc(l.skillAlvo)}</code></td>
                    <td><span class="badge bg-secondary">${esc(l.acaoEspecifica)}</span></td>
                    <td><small>${esc(JSON.stringify(l.entidadesExtraidas || {}))}</small></td>
                    <td><span class="badge bg-info">${esc(l.provedorExecutado)}</span></td>
                    <td><span class="badge ${l.fallbackAcionado ? 'bg-warning text-dark' : 'bg-success'}">${l.fallbackAcionado ? 'Fallback' : 'Ollama GPU'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  function modalConfigurarNluOllamaHtml(cfg = {}) {
    return `
      <div class="modal fade" id="modalConfigurarNluOllama" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Configurar NLU Local Ollama</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2"><label class="form-label">URL Base do Ollama:</label><input type="text" class="form-control" id="cfgOllamaBaseUrl" value="${esc(cfg.ollamaBaseUrl || 'http://127.0.0.1:11434')}"></div>
            <div class="mb-2"><label class="form-label">Modelo Local:</label><input type="text" class="form-control" id="cfgModeloOllama" value="${esc(cfg.modeloOllama || 'qwen2.5-coder:7b')}"></div>
            <div class="mb-2"><label class="form-label">Timeout (ms):</label><input type="number" class="form-control" id="cfgTimeoutMs" value="${cfg.timeoutMs || 4000}"></div>
            <div class="mb-2"><label class="form-label">Limiar de Confiança Mínimo:</label><input type="number" step="0.05" class="form-control" id="cfgLimiarConfianca" value="${cfg.limiarConfiancaMinimo || 0.75}"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
            <button type="button" class="btn btn-primary" data-act="salvar-config-nlu-btn">Salvar Configuração</button>
          </div>
        </div></div>
      </div>
    `;
  }

  function modalVisualizarDockerBlueprintHtml(bp = {}) {
    return `
      <div class="modal fade" id="modalVisualizarDockerBlueprint" tabindex="-1">
        <div class="modal-dialog modal-lg"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Blueprint da Stack Docker de Produção (v${esc(bp.versaoCompose || '3.8')})</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <h6>docker-compose.yml</h6>
            <pre class="bg-dark text-light p-2 rounded small" style="max-height: 250px; overflow-y: auto;">${esc(bp.dockerComposeYaml || '')}</pre>
            <h6 class="mt-2">Comandos de Inicialização:</h6>
            <pre class="bg-light p-2 border rounded small">${esc((bp.comandosSetup || []).join('\n'))}</pre>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
          </div>
        </div></div>
      </div>
    `;
  }

  root.renderPainelNluOllamaEStackProducaoHtml = renderPainelNluOllamaEStackProducaoHtml;
  root.modalConfigurarNluOllamaHtml = modalConfigurarNluOllamaHtml;
  root.modalVisualizarDockerBlueprintHtml = modalVisualizarDockerBlueprintHtml;
})(typeof window !== 'undefined' ? window : globalThis);

