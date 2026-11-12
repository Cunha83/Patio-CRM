/**
 * js/modules/whatsapp_nlu_producao_actions.js
 *
 * Ações e Delegação Global de Eventos DOM para NLU Ollama e Stack Docker de Produção.
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

  function abrirModalConfigurarNluOllama() {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalConfigurarNluOllamaHtml === 'function') {
      root.abrirModalGenerico(root.modalConfigurarNluOllamaHtml(root._ultimoNluConfig || {}));
    }
  }

  async function salvarConfiguracaoNluOllamaAction() {
    const ollamaBaseUrl = document.getElementById('cfgOllamaBaseUrl')?.value;
    const modeloOllama = document.getElementById('cfgModeloOllama')?.value;
    const timeoutMs = Number(document.getElementById('cfgTimeoutMs')?.value || 4000);
    const limiarConfiancaMinimo = Number(document.getElementById('cfgLimiarConfianca')?.value || 0.75);

    try {
      const data = await apiFetchJson('/api/whatsapp/nlu/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollamaBaseUrl, modeloOllama, timeoutMs, limiarConfiancaMinimo })
      });
      root._ultimoNluConfig = data.config;
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('NLU configurado com sucesso!', 'success');
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro ao configurar NLU: ${err.message}`, 'error');
      throw err;
    }
  }

  async function testarMensagemNluWhatsAppAction() {
    const mensagem = document.getElementById('nluInputMensagem')?.value;
    const perfilRemetente = document.getElementById('nluInputPerfil')?.value || 'cliente';
    const outputEl = document.getElementById('nluConsoleOutput');

    if (!mensagem || !mensagem.trim()) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Informe uma mensagem para testar.', 'warning');
      return;
    }

    try {
      if (outputEl) {
        outputEl.style.display = 'block';
        outputEl.textContent = 'Processando NLU e despachando Skill...';
      }

      const data = await apiFetchJson('/api/whatsapp/nlu/interpretar-executar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem, perfilRemetente })
      });

      if (outputEl) {
        outputEl.textContent = JSON.stringify(data, null, 2);
      }
      return data;
    } catch (err) {
      if (outputEl) outputEl.textContent = `Erro: ${err.message}`;
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro no teste NLU: ${err.message}`, 'error');
      throw err;
    }
  }

  async function executarHealthcheckStackProducaoAction() {
    try {
      const data = await apiFetchJson('/api/ops/producao/healthcheck-stack');
      if (typeof root.mostrarNotificacao === 'function') {
        const d = data.diagnostico || {};
        root.mostrarNotificacao(`Healthcheck executado! Score: ${d.scoreProntidaoInfra}/100 (${d.nivelProntidao})`, 'info');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro no healthcheck: ${err.message}`, 'error');
      throw err;
    }
  }

  async function abrirModalDockerBlueprint() {
    try {
      const data = await apiFetchJson('/api/ops/producao/docker-blueprint');
      if (typeof root.abrirModalGenerico === 'function' && typeof root.modalVisualizarDockerBlueprintHtml === 'function') {
        root.abrirModalGenerico(root.modalVisualizarDockerBlueprintHtml(data.blueprint || {}));
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro ao obter blueprint Docker: ${err.message}`, 'error');
      throw err;
    }
  }

  // Listener delegado global
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'abrir-config-nlu-ollama') {
        abrirModalConfigurarNluOllama();
      } else if (act === 'salvar-config-nlu-btn') {
        salvarConfiguracaoNluOllamaAction();
      } else if (act === 'testar-nlu-mensagem-btn') {
        testarMensagemNluWhatsAppAction();
      } else if (act === 'atualizar-healthcheck-stack-btn') {
        executarHealthcheckStackProducaoAction();
      } else if (act === 'abrir-docker-blueprint-btn') {
        abrirModalDockerBlueprint();
      }
    });
  }

  root.abrirModalConfigurarNluOllama = abrirModalConfigurarNluOllama;
  root.salvarConfiguracaoNluOllamaAction = salvarConfiguracaoNluOllamaAction;
  root.testarMensagemNluWhatsAppAction = testarMensagemNluWhatsAppAction;
  root.executarHealthcheckStackProducaoAction = executarHealthcheckStackProducaoAction;
  root.abrirModalDockerBlueprint = abrirModalDockerBlueprint;
})(typeof window !== 'undefined' ? window : globalThis);

