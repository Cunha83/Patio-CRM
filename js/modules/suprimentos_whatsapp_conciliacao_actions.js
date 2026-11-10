// js/modules/suprimentos_whatsapp_conciliacao_actions.js
// Ações e orquestração de suprimentos, conciliação bancária e agente WhatsApp

(function (root) {
  'use strict';

  function encontrarPedido(pedidoId) {
    if (typeof S === 'undefined' || !Array.isArray(S.purchaseOrders)) return null;
    return S.purchaseOrders.find(p => p.id === pedidoId) || null;
  }

  function abrirModalReceberNotaCompra(pedidoId) {
    const pedido = encontrarPedido(pedidoId);
    if (!pedido) {
      if (typeof torrar === 'function') torrar('Pedido de compra não encontrado.');
      return;
    }
    if (typeof abrirModalGenerico === 'function' && typeof modalReceberNotaCompraHtml === 'function') {
      abrirModalGenerico(modalReceberNotaCompraHtml(pedido));
    }
  }

  async function receberNotaCompraAction(pedidoId) {
    const inNF = document.getElementById('txt-rcv-nf');
    const inData = document.getElementById('txt-rcv-data');
    const inChave = document.getElementById('txt-rcv-chave');
    const chkReserva = document.getElementById('chk-rcv-reserva');

    const numeroNF = inNF?.value?.trim() || '';
    const dataRecebimento = inData?.value || new Date().toISOString();
    const chaveAcessoNF = inChave?.value?.trim() || '';
    const reservarAutomaticamenteParaOS = chkReserva ? chkReserva.checked : true;

    if (!numeroNF) {
      if (typeof torrar === 'function') torrar('Informe o número da Nota Fiscal.');
      return;
    }

    if (typeof torrar === 'function') torrar('Processando entrada de NF e recálculo do CMP...');

    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${encodeURIComponent(pedidoId)}/receber-nf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroNF, dataRecebimento, chaveAcessoNF, reservarAutomaticamenteParaOS })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao receber nota fiscal.');
        return;
      }

      if (typeof torrar === 'function') torrar('NF recebida! CMP recalculado, parcelas criadas e Box destravado.');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao receber nota fiscal.');
    }
  }

  function abrirModalImportarExtrato() {
    if (typeof abrirModalGenerico === 'function' && typeof modalImportarExtratoBancarioHtml === 'function') {
      abrirModalGenerico(modalImportarExtratoBancarioHtml());
    }
  }

  async function processarExtratoBancarioAction() {
    const selFormato = document.getElementById('sel-ext-formato');
    const txtConteudo = document.getElementById('txt-ext-conteudo');

    const formato = selFormato?.value || 'pdf_texto';
    const conteudoRaw = txtConteudo?.value?.trim() || '';

    if (!conteudoRaw) {
      if (typeof torrar === 'function') torrar('Cole o conteúdo do extrato bancário.');
      return;
    }

    if (typeof torrar === 'function') torrar('Processando conciliação bancária...');

    try {
      const res = await fetch('/api/financeiro/conciliacao-bancaria/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formato, conteudoRaw })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro na conciliação bancária.');
        return;
      }

      const msg = `Conciliação concluída: ${data.conciliadasAutomaticamenteCount || 0} transações conciliadas.`;
      if (typeof torrar === 'function') torrar(msg);
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede na conciliação.');
    }
  }

  function abrirModalSimuladorAgenteWhatsApp() {
    if (typeof abrirModalGenerico === 'function' && typeof modalSimuladorAgenteWhatsAppHtml === 'function') {
      abrirModalGenerico(modalSimuladorAgenteWhatsAppHtml());
    }
  }

  async function enviarComandoAgenteWhatsAppAction() {
    const selPerfil = document.getElementById('sel-wpp-perfil');
    const inRemetente = document.getElementById('txt-wpp-remetente');
    const inMsg = document.getElementById('txt-wpp-mensagem');
    const divResp = document.getElementById('wpp-simulador-resposta');

    const perfilRemetente = selPerfil?.value || 'cliente';
    const remetente = inRemetente?.value || '5511999990000';
    const mensagem = inMsg?.value?.trim() || '';

    if (!mensagem) {
      if (typeof torrar === 'function') torrar('Digite uma mensagem.');
      return;
    }

    if (typeof torrar === 'function') torrar('Enviando mensagem ao Agente WhatsApp...');

    try {
      const res = await fetch('/api/whatsapp/agente/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perfilRemetente, remetente, mensagem })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const erroMsg = data.error || 'Erro no Agente WhatsApp.';
        if (divResp) {
          divResp.style.display = 'block';
          divResp.style.background = '#fef2f2';
          divResp.style.borderColor = '#fecaca';
          divResp.style.color = '#b91c1c';
          divResp.textContent = `❌ ${erroMsg}`;
        }
        if (typeof torrar === 'function') torrar(erroMsg);
        return;
      }

      if (divResp) {
        divResp.style.display = 'block';
        divResp.style.background = '#f0fdf4';
        divResp.style.borderColor = '#bbf7d0';
        divResp.style.color = '#15803d';
        divResp.textContent = data.respostaTextoWhatsApp || 'Mensagem processada pelo agente.';
      }
      if (typeof torrar === 'function') torrar('Resposta recebida do Agente WhatsApp!');
      if (typeof carregarEstado === 'function') await carregarEstado();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede no Agente WhatsApp.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const pedidoId = btn.getAttribute('data-pedido-id');

      if (act === 'abrir-receber-nf-compra' && pedidoId) {
        abrirModalReceberNotaCompra(pedidoId);
      } else if (act === 'confirmar-receber-nf-compra' && pedidoId) {
        receberNotaCompraAction(pedidoId);
      } else if (act === 'abrir-importar-extrato') {
        abrirModalImportarExtrato();
      } else if (act === 'processar-extrato-bancario') {
        processarExtratoBancarioAction();
      } else if (act === 'abrir-simulador-agente-whatsapp') {
        abrirModalSimuladorAgenteWhatsApp();
      } else if (act === 'enviar-comando-agente-whatsapp') {
        enviarComandoAgenteWhatsAppAction();
      } else if (act === 'fechar-modal-generico') {
        if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      }
    });
  }

  root.abrirModalReceberNotaCompra = abrirModalReceberNotaCompra;
  root.receberNotaCompraAction = receberNotaCompraAction;
  root.abrirModalImportarExtrato = abrirModalImportarExtrato;
  root.processarExtratoBancarioAction = processarExtratoBancarioAction;
  root.abrirModalSimuladorAgenteWhatsApp = abrirModalSimuladorAgenteWhatsApp;
  root.enviarComandoAgenteWhatsAppAction = enviarComandoAgenteWhatsAppAction;

})(typeof window !== 'undefined' ? window : globalThis);

