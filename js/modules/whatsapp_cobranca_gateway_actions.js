/**
 * js/modules/whatsapp_cobranca_gateway_actions.js
 *
 * Ações e Delegação Global de Eventos DOM para Cobrança Ativa, Gateway Real e Ciclo Autônomo.
 * Teto Modular: <= 250 linhas
 */

(function(root) {
  'use strict';

  async function apiPost(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  async function dispararReguaCobrancaClientesAction(options = {}) {
    try {
      const data = await apiPost('/api/financeiro/cobranca-ativa/disparar-regua', options);
      if (typeof root.mostrarNotificacao === 'function') {
        root.mostrarNotificacao(`Régua disparada com sucesso! ${data.totalClientesCobrados || 0} clientes cobrados.`, 'success');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Falha ao disparar régua: ${err.message}`, 'error');
      throw err;
    }
  }

  function abrirModalAcordoCliente(clienteId, nome) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalFormalizarAcordoClienteHtml === 'function') {
      root.abrirModalGenerico(root.modalFormalizarAcordoClienteHtml({ clienteId, nome }));
    }
  }

  async function confirmarAcordoRenegociacaoAction() {
    const clienteId = document.getElementById('acordoClienteId')?.value;
    const clienteNome = document.getElementById('acordoClienteNome')?.value;
    const percentualEntradaMinima = Number(document.getElementById('acordoPercentualEntrada')?.value || 30);
    const quantidadeParcelasRestantes = Number(document.getElementById('acordoQtdParcelas')?.value || 3);
    const descontoJurosMultaPercentual = Number(document.getElementById('acordoDescontoJuros')?.value || 0);

    try {
      const data = await apiPost('/api/financeiro/cobranca-ativa/acordos', {
        clienteId,
        clienteNome,
        percentualEntradaMinima,
        quantidadeParcelasRestantes,
        descontoJurosMultaPercentual
      });
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.mostrarNotificacao === 'function') {
        root.mostrarNotificacao(`Acordo gerado! Entrada: R$ ${data.acordo.valorEntrada.toFixed(2)}. PIX gerado.`, 'success');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro ao gerar acordo: ${err.message}`, 'error');
      throw err;
    }
  }

  async function liquidarEntradaAcordoAction(acordoId, valor) {
    if (!confirm(`Confirmar liquidação de entrada de R$ ${Number(valor || 0).toFixed(2)} e desbloqueio imediato do cliente?`)) return;
    try {
      const data = await apiPost(`/api/financeiro/cobranca-ativa/acordos/${acordoId}/liquidar-entrada`, {
        valorPagoEntrada: valor,
        meioPagamento: 'PIX'
      });
      if (typeof root.mostrarNotificacao === 'function') {
        root.mostrarNotificacao('Entrada liquidada com sucesso! Crédito do cliente desbloqueado.', 'success');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Falha na liquidação: ${err.message}`, 'error');
      throw err;
    }
  }

  function abrirModalConfigurarGatewayWhatsApp() {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalConfigurarGatewayWhatsAppHtml === 'function') {
      root.abrirModalGenerico(root.modalConfigurarGatewayWhatsAppHtml(root._ultimoGatewayConfig || {}));
    }
  }

  async function salvarConfiguracaoGatewayWhatsAppAction() {
    const provedor = document.getElementById('gwProvedor')?.value;
    const instanceName = document.getElementById('gwInstanceName')?.value;
    const baseUrl = document.getElementById('gwBaseUrl')?.value;
    const apiKey = document.getElementById('gwApiKey')?.value;
    const webhookSecret = document.getElementById('gwWebhookSecret')?.value;

    try {
      const data = await apiPost('/api/whatsapp/gateway/configurar', {
        provedor, instanceName, baseUrl, apiKey, webhookSecret, ativo: true
      });
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.mostrarNotificacao === 'function') {
        root.mostrarNotificacao('Gateway configurado com sucesso!', 'success');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Falha ao configurar gateway: ${err.message}`, 'error');
      throw err;
    }
  }

  async function processarFilaGatewayAction() {
    try {
      const data = await apiPost('/api/whatsapp/gateway/processar-fila', {});
      if (typeof root.mostrarNotificacao === 'function') {
        root.mostrarNotificacao(`Fila processada! ${data.enviadosCount || 0} enviados, ${data.deadLetterCount || 0} falhas permanentes.`, 'info');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro na fila: ${err.message}`, 'error');
      throw err;
    }
  }

  async function executarCicloAutonomoDiarioAction() {
    if (!confirm('Deseja acionar o Ciclo Autônomo Diário 360º (Cobrança + Preditiva + Gateway + Briefing)?')) return;
    try {
      const data = await apiPost('/api/whatsapp/agente/ciclo-autonomo-diario', {});
      if (typeof root.mostrarNotificacao === 'function') {
        root.mostrarNotificacao(`Ciclo concluído 100%! Cobranças: ${data.ciclo?.clientesCobradosCount || 0}, Preditiva: ${data.ciclo?.alertasPreventivosDisparadosCount || 0}`, 'success');
      }
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Erro no ciclo autônomo: ${err.message}`, 'error');
      throw err;
    }
  }

  // Listener delegado global
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'disparar-regua-cobranca-lote') {
        dispararReguaCobrancaClientesAction();
      } else if (act === 'propor-acordo-renegociacao') {
        abrirModalAcordoCliente(btn.getAttribute('data-cliente-id'), btn.getAttribute('data-nome'));
      } else if (act === 'confirmar-formalizacao-acordo') {
        confirmarAcordoRenegociacaoAction();
      } else if (act === 'liquidar-entrada-acordo-btn') {
        liquidarEntradaAcordoAction(btn.getAttribute('data-id'), btn.getAttribute('data-valor'));
      } else if (act === 'abrir-config-gateway-whatsapp') {
        abrirModalConfigurarGatewayWhatsApp();
      } else if (act === 'salvar-config-gateway-whatsapp') {
        salvarConfiguracaoGatewayWhatsAppAction();
      } else if (act === 'processar-fila-gateway-manual') {
        processarFilaGatewayAction();
      } else if (act === 'executar-ciclo-autonomo-360') {
        executarCicloAutonomoDiarioAction();
      }
    });
  }

  root.dispararReguaCobrancaClientesAction = dispararReguaCobrancaClientesAction;
  root.abrirModalAcordoCliente = abrirModalAcordoCliente;
  root.confirmarAcordoRenegociacaoAction = confirmarAcordoRenegociacaoAction;
  root.liquidarEntradaAcordoAction = liquidarEntradaAcordoAction;
  root.abrirModalConfigurarGatewayWhatsApp = abrirModalConfigurarGatewayWhatsApp;
  root.salvarConfiguracaoGatewayWhatsAppAction = salvarConfiguracaoGatewayWhatsAppAction;
  root.processarFilaGatewayAction = processarFilaGatewayAction;
  root.executarCicloAutonomoDiarioAction = executarCicloAutonomoDiarioAction;
})(typeof window !== 'undefined' ? window : globalThis);

