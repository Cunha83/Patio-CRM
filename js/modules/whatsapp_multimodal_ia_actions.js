/**
 * js/modules/whatsapp_multimodal_ia_actions.js
 *
 * Ações e Delegação Global de Eventos DOM para Motores Multimodais WhatsApp.
 * Teto Modular: <= 250 linhas
 */

(function(root) {
  'use strict';

  async function apiFetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  function abrirModalConfigurarMultimodal() {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalConfigurarMultimodalHtml === 'function') {
      root.abrirModalGenerico(root.modalConfigurarMultimodalHtml(root._ultimoMultimodalConfig || {}));
    }
  }

  function abrirModalSimularAudio() {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalSimularAudioHtml === 'function') {
      root.abrirModalGenerico(root.modalSimularAudioHtml());
    }
  }

  function abrirModalSimularOcr() {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalSimularOcrHtml === 'function') {
      root.abrirModalGenerico(root.modalSimularOcrHtml());
    }
  }

  async function salvarConfiguracaoMultimodalAction() {
    const audioProvider = document.getElementById('cfgAudioProvider')?.value;
    const whisperBaseUrl = document.getElementById('cfgWhisperBaseUrl')?.value;
    const visionProvider = document.getElementById('cfgVisionProvider')?.value;
    const visionModel = document.getElementById('cfgVisionModel')?.value;

    try {
      const data = await apiFetchJson('/api/whatsapp/multimodal/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioProvider, whisperBaseUrl, visionProvider, visionModel })
      });
      root._ultimoMultimodalConfig = data.config;
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Motores multimodais configurados com sucesso!', 'success');
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(err.message, 'error');
    }
  }

  async function executarSimulacaoAudioAction() {
    const perfil = document.getElementById('simAudioPerfil')?.value || 'cliente';
    const texto = document.getElementById('simAudioTexto')?.value || '';
    const resEl = document.getElementById('simAudioResultado');

    if (!texto.trim()) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Informe o áudio/transcrição para simular', 'warning');
      return;
    }

    try {
      const data = await apiFetchJson('/api/whatsapp/multimodal/processar-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textoTranscrito: texto, perfilRemetente: perfil, duracaoSegundos: 4 })
      });

      if (resEl) {
        resEl.classList.remove('d-none');
        resEl.innerHTML = `<strong>Transcrição & Roteamento:</strong><pre class="mb-0 mt-1">${JSON.stringify(data, null, 2)}</pre>`;
      }
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Áudio processado e roteado via NLU!', 'success');
      return data;
    } catch (err) {
      if (resEl) {
        resEl.classList.remove('d-none');
        resEl.innerHTML = `<span class="text-danger"><strong>Erro:</strong> ${err.message}</span>`;
      }
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(err.message, 'error');
    }
  }

  async function executarSimulacaoOcrAction() {
    const tipo = document.getElementById('simOcrTipo')?.value || 'comprovante_pagamento_pix';
    const perfil = document.getElementById('simOcrPerfil')?.value || 'cliente';
    const texto = document.getElementById('simOcrTexto')?.value || '';
    const resEl = document.getElementById('simOcrResultado');

    try {
      const data = await apiFetchJson('/api/whatsapp/multimodal/processar-imagem-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipoDocumento: tipo, textoBrutoOcr: texto, perfilRemetente: perfil })
      });

      if (resEl) {
        resEl.classList.remove('d-none');
        resEl.innerHTML = `<strong>Resultado OCR:</strong><pre class="mb-0 mt-1">${JSON.stringify(data, null, 2)}</pre>`;
      }
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Documento OCR processado com sucesso!', 'success');
      return data;
    } catch (err) {
      if (resEl) {
        resEl.classList.remove('d-none');
        resEl.innerHTML = `<span class="text-danger"><strong>Erro (${err.status || 400}):</strong> ${err.message}</span>`;
      }
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(err.message, 'error');
    }
  }

  async function atualizarTelemetriaMultimodalAction() {
    try {
      const data = await apiFetchJson('/api/whatsapp/multimodal/telemetria');
      root._ultimaTelemetriaMultimodal = data.telemetria;
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Telemetria multimodal atualizada!', 'info');
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(err.message, 'error');
    }
  }

  function initDelegacaoEventosMultimodal() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'abrir-config-multimodal-btn') abrirModalConfigurarMultimodal();
      else if (act === 'simular-audio-modal-btn') abrirModalSimularAudio();
      else if (act === 'simular-ocr-modal-btn') abrirModalSimularOcr();
      else if (act === 'salvar-config-multimodal-action') salvarConfiguracaoMultimodalAction();
      else if (act === 'executar-simulacao-audio-action') executarSimulacaoAudioAction();
      else if (act === 'executar-simulacao-ocr-action') executarSimulacaoOcrAction();
      else if (act === 'atualizar-telemetria-multimodal-btn') atualizarTelemetriaMultimodalAction();
    });
  }

  initDelegacaoEventosMultimodal();

  root.abrirModalConfigurarMultimodal = abrirModalConfigurarMultimodal;
  root.abrirModalSimularAudio = abrirModalSimularAudio;
  root.abrirModalSimularOcr = abrirModalSimularOcr;
  root.salvarConfiguracaoMultimodalAction = salvarConfiguracaoMultimodalAction;
  root.executarSimulacaoAudioAction = executarSimulacaoAudioAction;
  root.executarSimulacaoOcrAction = executarSimulacaoOcrAction;
  root.atualizarTelemetriaMultimodalAction = atualizarTelemetriaMultimodalAction;

})(typeof window !== 'undefined' ? window : globalThis);

