/**
 * js/modules/whatsapp_multimodal_ia_ui.js
 *
 * Componentes de UI: Motor Multimodal de Áudio/Voz (ASR Whisper) & Visão/OCR WhatsApp.
 * Teto Modular: <= 250 linhas
 */

(function(root) {
  'use strict';

  const esc = s => (!s ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  function renderPainelMultimodalIaHtml(dados = {}) {
    const telem = dados.telemetria || {};
    const ocrPorTipo = telem.ocrPorTipo || {};
    const logsAudio = dados.logsAudio || [];
    const logsOcr = dados.logsOcr || [];

    return `
      <div class="multimodal-ia-container p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="mb-0">🎙️ IA Multimodal WhatsApp (Áudio Whisper & Visão OCR)</h5>
            <small class="text-muted">Transcrição de voz NLU, leitura técnica de DANFE, PIX, Portaria e Box.</small>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-act="abrir-config-multimodal-btn">⚙️ Provedores</button>
            <button class="btn btn-sm btn-outline-info" data-act="simular-audio-modal-btn">🎤 Testar Áudio</button>
            <button class="btn btn-sm btn-success text-white" data-act="simular-ocr-modal-btn">📷 Testar OCR</button>
            <button class="btn btn-sm btn-outline-secondary" data-act="atualizar-telemetria-multimodal-btn">🔄 Atualizar</button>
          </div>
        </div>

        <!-- CARDS DE TELEMETRIA -->
        <div class="row g-2 mb-3">
          <div class="col-md-3">
            <div class="card p-2 text-center border-primary shadow-sm">
              <span class="text-muted small">ASR Whisper (Voz)</span>
              <h5 class="text-primary my-1">${esc(telem.whisperModel || 'whisper-base-pt')}</h5>
              <span class="badge bg-success">Status: ${telem.whisperPronto ? 'Online' : 'Standby'}</span>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 text-center border-info shadow-sm">
              <span class="text-muted small">Visão/OCR (Fotos)</span>
              <h5 class="text-info my-1">${esc(telem.visionModel || 'llava:7b')}</h5>
              <span class="badge bg-success">Status: ${telem.visionPronto ? 'Online' : 'Standby'}</span>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 text-center border-warning shadow-sm">
              <span class="text-muted small">Transcrições de Voz</span>
              <h4 class="text-warning my-1">${Number(telem.totalAudiosTranscritos || 0)}</h4>
              <small class="text-muted">Latência ~${telem.latenciaMediaMs || 240}ms</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 text-center border-success shadow-sm">
              <span class="text-muted small">Fotos/OCR Processados</span>
              <h4 class="text-success my-1">${Number(telem.totalImagensOcrProcessadas || 0)}</h4>
              <small class="text-muted">DANFE, PIX, Portaria, Box</small>
            </div>
          </div>
        </div>

        <!-- QUADRO OPERACIONAL DE FLUXOS OCR -->
        <div class="card p-3 mb-3 shadow-sm">
          <h6 class="mb-2">📋 Fluxos de Visão Computacional & Automação</h6>
          <div class="row g-2">
            <div class="col-md-3">
              <div class="p-2 border rounded bg-light">
                <strong>💵 Comprovante PIX:</strong>
                <span class="badge bg-primary float-end">${ocrPorTipo.comprovante_pagamento_pix || 0}</span>
                <p class="small text-muted mb-0 mt-1">Baixa instantânea de título e liberação de borderô.</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="p-2 border rounded bg-light">
                <strong>📦 DANFE Peças:</strong>
                <span class="badge bg-info float-end">${ocrPorTipo.danfe_nf_compra_pecas || 0}</span>
                <p class="small text-muted mb-0 mt-1">Entrada no estoque, recálculo CMP e baixa de gargalo.</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="p-2 border rounded bg-light">
                <strong>🚛 Placa/Km Portaria:</strong>
                <span class="badge bg-warning text-dark float-end">${ocrPorTipo.placa_hodometro_portaria || 0}</span>
                <p class="small text-muted mb-0 mt-1">Fast check-in 360º cruzando garantia e crédito.</p>
              </div>
            </div>
            <div class="col-md-3">
              <div class="p-2 border rounded bg-light">
                <strong>🔩 Peça Condenada Box:</strong>
                <span class="badge bg-danger float-end">${ocrPorTipo.evidencia_peca_condenada_box || 0}</span>
                <p class="small text-muted mb-0 mt-1">Item na OS, bloqueio de pátio e laudo técnico.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- LOGS RECENTES -->
        <div class="row g-3">
          <div class="col-md-6">
            <div class="card p-2 shadow-sm">
              <h6 class="border-bottom pb-1 mb-2">🎙️ Últimas Transcrições de Voz</h6>
              <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
                <table class="table table-sm table-hover small mb-0">
                  <thead><tr><th>Remetente</th><th>Texto Transcrito</th><th>Duração</th></tr></thead>
                  <tbody>
                    ${logsAudio.length === 0 ? '<tr><td colspan="3" class="text-muted text-center">Nenhum áudio recebido</td></tr>' : logsAudio.map(l => `
                      <tr>
                        <td>${esc(l.telefoneRemetente)}</td>
                        <td>${esc(l.textoTranscrito)}</td>
                        <td>${l.duracaoSegundos}s</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card p-2 shadow-sm">
              <h6 class="border-bottom pb-1 mb-2">📷 Últimos Documentos OCR</h6>
              <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
                <table class="table table-sm table-hover small mb-0">
                  <thead><tr><th>Tipo</th><th>Remetente</th><th>Confiança</th></tr></thead>
                  <tbody>
                    ${logsOcr.length === 0 ? '<tr><td colspan="3" class="text-muted text-center">Nenhum documento processado</td></tr>' : logsOcr.map(l => `
                      <tr>
                        <td><span class="badge bg-secondary">${esc(l.tipoDocumento)}</span></td>
                        <td>${esc(l.telefoneRemetente)}</td>
                        <td>${Math.round((l.confianca || 0.9) * 100)}%</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function modalConfigurarMultimodalHtml(cfg = {}) {
    return `
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">⚙️ Configurar Motores Multimodais</h5><button type="button" class="btn-close" data-act="fechar-modal-generico-btn"></button></div>
        <div class="modal-body">
          <div class="mb-2"><label class="form-label small">Provedor de Áudio (ASR)</label>
            <select id="cfgAudioProvider" class="form-select form-select-sm">
              <option value="whisper_local" ${cfg.audioProvider === 'whisper_local' ? 'selected' : ''}>Whisper Local (Fast-Whisper)</option>
              <option value="whisper_api" ${cfg.audioProvider === 'whisper_api' ? 'selected' : ''}>Whisper OpenAI API</option>
            </select>
          </div>
          <div class="mb-2"><label class="form-label small">URL Whisper ASR</label><input id="cfgWhisperBaseUrl" type="text" class="form-control form-control-sm" value="${esc(cfg.whisperBaseUrl || 'http://127.0.0.1:8000')}"></div>
          <div class="mb-2"><label class="form-label small">Provedor de Visão / OCR</label>
            <select id="cfgVisionProvider" class="form-select form-select-sm">
              <option value="vision_llm_local" ${cfg.visionProvider === 'vision_llm_local' ? 'selected' : ''}>Ollama Vision Local (LLaVA / Qwen2-VL)</option>
              <option value="gemini_vision" ${cfg.visionProvider === 'gemini_vision' ? 'selected' : ''}>Google Gemini Vision</option>
            </select>
          </div>
          <div class="mb-2"><label class="form-label small">Modelo de Visão</label><input id="cfgVisionModel" type="text" class="form-control form-control-sm" value="${esc(cfg.visionModel || 'llava:7b')}"></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary btn-sm" data-act="fechar-modal-generico-btn">Cancelar</button><button type="button" class="btn btn-primary btn-sm" data-act="salvar-config-multimodal-action">Salvar</button></div>
      </div></div>
    `;
  }

  function modalSimularAudioHtml() {
    return `
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">🎤 Testar Entrada de Áudio/Voz (WhatsApp)</h5><button type="button" class="btn-close" data-act="fechar-modal-generico-btn"></button></div>
        <div class="modal-body">
          <div class="mb-2"><label class="form-label small">Perfil do Remetente</label>
            <select id="simAudioPerfil" class="form-select form-select-sm">
              <option value="cliente">Cliente / Motorista</option><option value="gerencia">Gerência / Diretoria</option><option value="mecanico">Mecânico de Pátio</option>
            </select>
          </div>
          <div class="mb-2"><label class="form-label small">Texto Falado / Transcrição Simulada</label><textarea id="simAudioTexto" class="form-control form-control-sm" rows="3" placeholder="Ex: Triagem portaria placa ABC1D23 km 412500"></textarea></div>
          <div id="simAudioResultado" class="p-2 border rounded bg-light small d-none"></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary btn-sm" data-act="fechar-modal-generico-btn">Fechar</button><button type="button" class="btn btn-primary btn-sm" data-act="executar-simulacao-audio-action">Transcrever e Rotear</button></div>
      </div></div>
    `;
  }

  function modalSimularOcrHtml() {
    return `
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">📷 Testar Visão/OCR (WhatsApp)</h5><button type="button" class="btn-close" data-act="fechar-modal-generico-btn"></button></div>
        <div class="modal-body">
          <div class="mb-2"><label class="form-label small">Tipo de Documento</label>
            <select id="simOcrTipo" class="form-select form-select-sm">
              <option value="comprovante_pagamento_pix">Comprovante de Pagamento PIX</option><option value="danfe_nf_compra_pecas">DANFE / NF de Peças</option><option value="placa_hodometro_portaria">Placa e Hodômetro (Portaria)</option><option value="evidencia_peca_condenada_box">Evidência de Peça Condenada (Box)</option>
            </select>
          </div>
          <div class="mb-2"><label class="form-label small">Perfil Remetente</label>
            <select id="simOcrPerfil" class="form-select form-select-sm">
              <option value="cliente">Cliente / Motorista</option><option value="gerencia">Gerência / Diretoria</option><option value="compras">Compras / Almoxarifado</option><option value="mecanico">Mecânico de Box</option>
            </select>
          </div>
          <div class="mb-2"><label class="form-label small">Texto Bruto / Dados Extraídos (Simulado)</label><textarea id="simOcrTexto" class="form-control form-control-sm" rows="3" placeholder="Ex: PIX recebido valor R$ 850,00 txid PIX998877665544"></textarea></div>
          <div id="simOcrResultado" class="p-2 border rounded bg-light small d-none"></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary btn-sm" data-act="fechar-modal-generico-btn">Fechar</button><button type="button" class="btn btn-success btn-sm" data-act="executar-simulacao-ocr-action">Processar OCR</button></div>
      </div></div>
    `;
  }

  root.renderPainelMultimodalIaHtml = renderPainelMultimodalIaHtml;
  root.modalConfigurarMultimodalHtml = modalConfigurarMultimodalHtml;
  root.modalSimularAudioHtml = modalSimularAudioHtml;
  root.modalSimularOcrHtml = modalSimularOcrHtml;

})(typeof window !== 'undefined' ? window : globalThis);
