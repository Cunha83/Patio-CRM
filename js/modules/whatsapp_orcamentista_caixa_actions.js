/**
 * js/modules/whatsapp_orcamentista_caixa_actions.js
 *
 * Handlers e Listener Delegado Global para Orçamentista Técnico IA e Fechamento de Caixa Diário
 * Teto Modular: <= 270 linhas
 */

(function(root) {
  'use strict';

  function abrirModalPreOrcamentoWhatsApp(dados = {}) {
    if (typeof root.abrirFolha === 'function') {
      const html = typeof root.modalGerarPreOrcamentoWhatsAppHtml === 'function'
        ? root.modalGerarPreOrcamentoWhatsAppHtml(dados)
        : '<p>Carregando formulário...</p>';
      root.abrirFolha(html, 'Novo Pré-Orçamento IA');
    }
  }

  async function gerarPreOrcamentoWhatsAppAction() {
    const clienteId = document.getElementById('orc-cliente-id')?.value || '';
    const placa = document.getElementById('orc-placa')?.value || '';
    const markupMinimoPercentual = Number(document.getElementById('orc-markup')?.value || 35);
    const mensagemItens = document.getElementById('orc-mensagem-itens')?.value || '';

    if (!mensagemItens.trim()) {
      root.app?.toast?.('Informe os itens ou mensagem para cotação.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/whatsapp/agente/orcamentista-tecnico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, placa, markupMinimoPercentual, mensagemItens })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro ao gerar pré-orçamento');

      root.app?.toast?.('Pré-orçamento gerado e registrado no WhatsApp!', 'success');
      root.app?.fecharFolha?.();
      if (typeof root.carregarPainelOrcamentistaCaixa === 'function') {
        root.carregarPainelOrcamentistaCaixa();
      }
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  async function converterPreOrcamentoOSAction(preOrcamentoId) {
    if (!preOrcamentoId) return;
    if (!confirm('Deseja converter este pré-orçamento em Ordem de Serviço com reserva de peças?')) return;

    try {
      const res = await fetch(`/api/whatsapp/agente/pre-orcamentos/${preOrcamentoId}/converter-os`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservarPecasDisponiveis: true, gerarLinkPortalB2B: true })
      });
      const data = await res.json();
      if (!data.success) {
        if (data.code === 'CLIENT_CREDIT_BLOCKED_FOR_QUOTATION') {
          const override = confirm('Cliente com crédito bloqueado por inadimplência! Deseja autorizar com override gerencial?');
          if (override) {
            const just = prompt('Justificativa para liberação do crédito:') || 'Liberação gerencial';
            const resOver = await fetch(`/api/whatsapp/agente/pre-orcamentos/${preOrcamentoId}/converter-os`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ autorizarOverrideCreditoCliente: true, justificativaOverride: just })
            });
            const dataOver = await resOver.json();
            if (dataOver.success) {
              root.app?.toast?.(`OS #${dataOver.novaOS?.num || dataOver.novaOS?.id} gerada com sucesso sob override!`, 'success');
              return;
            }
          }
        }
        throw new Error(data.error || 'Falha na conversão');
      }

      root.app?.toast?.(`OS #${data.novaOS?.num || data.novaOS?.id} gerada com sucesso!`, 'success');
      if (typeof root.carregarPainelOrcamentistaCaixa === 'function') {
        root.carregarPainelOrcamentistaCaixa();
      }
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  async function abrirModalFecharCaixaDiario() {
    try {
      const res = await fetch('/api/financeiro/caixa-diario/previa');
      const data = await res.json();
      const previa = data.previa || {};

      if (typeof root.abrirFolha === 'function') {
        const html = typeof root.modalFecharCaixaDiarioHtml === 'function'
          ? root.modalFecharCaixaDiarioHtml(previa)
          : '<p>Carregando conferência...</p>';
        root.abrirFolha(html, 'Fechamento de Caixa Diário');
      }
    } catch (err) {
      root.app?.toast?.('Erro ao carregar prévia do caixa: ' + err.message, 'danger');
    }
  }

  async function confirmarFechamentoCaixaDiarioAction() {
    const pix = Number(document.getElementById('cx-conf-pix')?.value || 0);
    const boleto = Number(document.getElementById('cx-conf-boleto')?.value || 0);
    const dinheiro = Number(document.getElementById('cx-conf-dinheiro')?.value || 0);
    const justificativaDivergencia = document.getElementById('cx-justificativa')?.value || '';

    try {
      const res = await fetch('/api/financeiro/caixa-diario/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valoresConferidosPorMeio: { PIX: pix, BOLETO: boleto, DINHEIRO: dinheiro },
          justificativaDivergencia
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro ao homologar fechamento');

      root.app?.toast?.('Caixa diário homologado com carimbo SHA-256!', 'success');
      root.app?.fecharFolha?.();
      if (typeof root.carregarPainelOrcamentistaCaixa === 'function') {
        root.carregarPainelOrcamentistaCaixa();
      }
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  async function enviarFechamentoCaixaWhatsAppAction() {
    try {
      const res = await fetch('/api/financeiro/caixa-diario/relatorio-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro ao enviar boletim');

      root.app?.toast?.('Boletim de fechamento enviado ao WhatsApp da gerência!', 'success');
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  // Listener Delegado para Zero Cliques Mortos
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'abrir-pre-orcamento-whatsapp') {
        e.preventDefault();
        abrirModalPreOrcamentoWhatsApp();
      } else if (act === 'confirmar-pre-orcamento-whatsapp') {
        e.preventDefault();
        gerarPreOrcamentoWhatsAppAction();
      } else if (act === 'converter-pre-orcamento-os') {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        converterPreOrcamentoOSAction(id);
      } else if (act === 'abrir-fechar-caixa-diario') {
        e.preventDefault();
        abrirModalFecharCaixaDiario();
      } else if (act === 'confirmar-fechar-caixa-diario') {
        e.preventDefault();
        confirmarFechamentoCaixaDiarioAction();
      } else if (act === 'enviar-fechamento-caixa-whatsapp') {
        e.preventDefault();
        enviarFechamentoCaixaWhatsAppAction();
      }
    });
  }

  root.abrirModalPreOrcamentoWhatsApp = abrirModalPreOrcamentoWhatsApp;
  root.gerarPreOrcamentoWhatsAppAction = gerarPreOrcamentoWhatsAppAction;
  root.converterPreOrcamentoOSAction = converterPreOrcamentoOSAction;
  root.abrirModalFecharCaixaDiario = abrirModalFecharCaixaDiario;
  root.confirmarFechamentoCaixaDiarioAction = confirmarFechamentoCaixaDiarioAction;
  root.enviarFechamentoCaixaWhatsAppAction = enviarFechamentoCaixaWhatsAppAction;

})(typeof window !== 'undefined' ? window : globalThis);

