// js/modules/whatsapp_agente_autonomo_actions.js
// Handlers de Ações e Delegação de Eventos para Agente WhatsApp e API Bancária
// Teto Modular: <= 280 linhas

(function (root) {
  'use strict';

  async function enviarMensagemRecepcaoWhatsAppAction() {
    const elPlaca = document.getElementById('wpp_recepcao_placa');
    const elMsg = document.getElementById('wpp_recepcao_mensagem');
    const elResp = document.getElementById('wpp_recepcao_resposta');
    const placa = elPlaca ? elPlaca.value.trim() : '';
    const mensagem = elMsg ? elMsg.value.trim() : '';

    try {
      const res = await fetch('/api/whatsapp/agente/recepcao-interativa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, mensagem })
      });
      const data = await res.json();
      if (elResp) {
        elResp.textContent = data.respostaTextoWhatsApp || data.error || 'Sem resposta do agente';
        elResp.classList.remove('d-none');
      }
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (elResp) {
        elResp.textContent = 'Erro ao conectar ao Agente de Recepção: ' + err.message;
        elResp.classList.remove('d-none');
      }
    }
  }

  async function enviarComandoAnalistaFinanceiroAction() {
    const elPerfil = document.getElementById('wpp_analista_perfil');
    const elMsg = document.getElementById('wpp_analista_mensagem');
    const elResp = document.getElementById('wpp_analista_resposta');
    const perfilRemetente = elPerfil ? elPerfil.value : 'gerencia';
    const mensagem = elMsg ? elMsg.value.trim() : '';

    try {
      const res = await fetch('/api/whatsapp/agente/analista-financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perfilRemetente, mensagem })
      });
      const data = await res.json();
      if (elResp) {
        elResp.textContent = data.respostaTextoWhatsApp || data.error || 'Sem resposta';
        elResp.classList.remove('d-none');
      }
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (elResp) {
        elResp.textContent = 'Erro ao processar comando financeiro: ' + err.message;
        elResp.classList.remove('d-none');
      }
    }
  }

  function abrirModalCobrancaPixBoleto() {
    const state = root.S || {};
    const clientes = state.clientes || [];
    const borderos = [...(state.borderosFrotistas || []), ...(state.borderos || [])].filter(b => b.status !== 'liquidado');
    if (typeof root.abrirModalGenerico === 'function') {
      root.abrirModalGenerico(root.modalGerarCobrancaPixBoletoHtml({ clientes, borderos }));
    }
  }

  async function confirmarGerarCobrancaPixBoletoAction() {
    const selCli = document.getElementById('cobranca_cliente_id');
    const selBord = document.getElementById('cobranca_bordero_id');
    const selForma = document.getElementById('cobranca_forma');

    const clienteId = selCli ? selCli.value : null;
    const borderoId = selBord ? selBord.value : null;
    const formaCobranca = selForma ? selForma.value : 'pix_brcode_e_boleto';

    try {
      const res = await fetch('/api/whatsapp/agente/cobranca-pix-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, borderoId, formaCobranca })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao gerar cobrança.');

      if (typeof root.toast === 'function') root.toast('Cobrança gerada com sucesso!', 'success');
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.toast === 'function') root.toast(err.message, 'danger');
    }
  }

  function abrirModalConfigurarApiBanco() {
    if (typeof root.abrirModalGenerico === 'function') {
      root.abrirModalGenerico(root.modalConfigurarApiBancoDiretoHtml({}));
    }
  }

  async function salvarConfiguracaoApiBancoAction() {
    const elCod = document.getElementById('api_banco_codigo');
    const elNome = document.getElementById('api_banco_nome');
    const elCli = document.getElementById('api_banco_client_id');
    const elSec = document.getElementById('api_banco_client_secret');
    const elPix = document.getElementById('api_banco_chave_pix');

    const codigoBanco = elCod ? elCod.value.trim() : '756';
    const nomeBanco = elNome ? elNome.value.trim() : 'Sicoob / Inter API';
    const clientId = elCli ? elCli.value.trim() : '';
    const clientSecret = elSec ? elSec.value.trim() : '';
    const chavePixPadrao = elPix ? elPix.value.trim() : '';

    try {
      const res = await fetch('/api/financeiro/banco-direto/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigoBanco, nomeBanco, clientId, clientSecret, chavePixPadrao })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao conectar API bancária.');

      if (typeof root.toast === 'function') root.toast('Conexão bancária configurada com sucesso!', 'success');
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.toast === 'function') root.toast(err.message, 'danger');
    }
  }

  async function sincronizarExtratoApiBancoAction(conexaoId) {
    try {
      const res = await fetch('/api/financeiro/banco-direto/sincronizar-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conexaoId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro na sincronização bancária.');

      if (typeof root.toast === 'function') {
        root.toast(`Extrato sincronizado! ${data.conciliacao?.conciliadasAutomaticamenteCount || 0} lançamentos baixados.`, 'success');
      }
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.toast === 'function') root.toast(err.message, 'danger');
    }
  }

  // Listener Delegado para ações do Agente WhatsApp e Banco
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'enviar-msg-recepcao') {
        enviarMensagemRecepcaoWhatsAppAction();
      } else if (act === 'enviar-comando-analista') {
        enviarComandoAnalistaFinanceiroAction();
      } else if (act === 'abrir-modal-cobranca-pix-boleto') {
        abrirModalCobrancaPixBoleto();
      } else if (act === 'confirmar-gerar-cobranca-pix-boleto') {
        confirmarGerarCobrancaPixBoletoAction();
      } else if (act === 'abrir-modal-config-banco') {
        abrirModalConfigurarApiBanco();
      } else if (act === 'salvar-config-banco') {
        salvarConfiguracaoApiBancoAction();
      } else if (act === 'sincronizar-api-banco') {
        const id = btn.getAttribute('data-id');
        sincronizarExtratoApiBancoAction(id);
      }
    });
  }

  root.enviarMensagemRecepcaoWhatsAppAction = enviarMensagemRecepcaoWhatsAppAction;
  root.enviarComandoAnalistaFinanceiroAction = enviarComandoAnalistaFinanceiroAction;
  root.abrirModalCobrancaPixBoleto = abrirModalCobrancaPixBoleto;
  root.confirmarGerarCobrancaPixBoletoAction = confirmarGerarCobrancaPixBoletoAction;
  root.abrirModalConfigurarApiBanco = abrirModalConfigurarApiBanco;
  root.salvarConfiguracaoApiBancoAction = salvarConfiguracaoApiBancoAction;
  root.sincronizarExtratoApiBancoAction = sincronizarExtratoApiBancoAction;

})(typeof window !== 'undefined' ? window : globalThis);

