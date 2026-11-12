/**
 * js/modules/whatsapp_compras_cotacoes_actions.js
 *
 * Handlers e Listener Delegado Global para Cotações Automatizadas com Fornecedores via WhatsApp
 * Teto Modular: <= 265 linhas
 */

(function(root) {
  'use strict';

  function abrirModalNovaCotacaoWhatsApp(dados = {}) {
    if (typeof root.abrirFolha === 'function') {
      const html = typeof root.modalAbrirCotacaoFornecedoresHtml === 'function'
        ? root.modalAbrirCotacaoFornecedoresHtml(dados)
        : '<p>Carregando formulário de cotação...</p>';
      root.abrirFolha(html, 'Nova Cotação B2B de Peças');
    }
  }

  async function confirmarAbrirCotacaoWhatsAppAction() {
    const tituloCotacao = document.getElementById('cot-titulo')?.value || 'Cotação de Peças';
    const osVinculadaId = document.getElementById('cot-os-id')?.value || null;
    const gargaloVinculadoId = document.getElementById('cot-gargalo-id')?.value || null;
    const prioridadeUrgenciaBox = Boolean(document.getElementById('cot-urgencia-box')?.checked);

    try {
      const res = await fetch('/api/suprimentos/cotacoes-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tituloCotacao,
          osVinculadaId,
          gargaloVinculadoId,
          prioridadeUrgenciaBox,
          itens: [{ descricao: 'Feixes de Molas e Grampos U', quantidade: 2 }]
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro ao disparar cotação');

      if (data.cotacao?.status === 'aguardando_indicacao_fornecedores') {
        root.app?.toast?.(`Cotação aberta! ${data.cotacao.perguntaFornecedorFaltante}`, 'warning');
      } else {
        root.app?.toast?.('Cotação enviada via WhatsApp para os 3 fornecedores da memória!', 'success');
      }
      root.app?.fecharFolha?.();
      if (typeof root.carregarPainelCotacoesCompras === 'function') {
        root.carregarPainelCotacoesCompras();
      }
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  function abrirModalComplementarFornecedores(cotacaoId) {
    if (typeof root.abrirFolha === 'function') {
      const html = typeof root.modalComplementarFornecedoresHtml === 'function'
        ? root.modalComplementarFornecedoresHtml({ id: cotacaoId, faltamFornecedoresCount: 2 })
        : '<p>Carregando formulário...</p>';
      root.abrirFolha(html, 'Indicar Fornecedores');
    }
  }

  async function confirmarComplementarFornecedoresAction() {
    const cotacaoId = document.getElementById('comp-cotacao-id')?.value;
    const nome1 = document.getElementById('comp-nome-1')?.value?.trim();
    const tel1 = document.getElementById('comp-tel-1')?.value?.trim();
    const nome2 = document.getElementById('comp-nome-2')?.value?.trim();
    const tel2 = document.getElementById('comp-tel-2')?.value?.trim();

    const novos = [];
    if (nome1) novos.push({ nome: nome1, telefone: tel1 });
    if (nome2) novos.push({ nome: nome2, telefone: tel2 });

    if (novos.length === 0) {
      root.app?.toast?.('Informe ao menos 1 fornecedor para complementar.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/suprimentos/cotacoes-whatsapp/${cotacaoId}/complementar-fornecedores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novosFornecedores: novos })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao complementar fornecedores');

      root.app?.toast?.('Fornecedores complementados! Cotações disparadas via WhatsApp.', 'success');
      root.app?.fecharFolha?.();
      if (typeof root.carregarPainelCotacoesCompras === 'function') {
        root.carregarPainelCotacoesCompras();
      }
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  function abrirModalPropostaFornecedor(cotacaoId) {
    if (typeof root.abrirFolha === 'function') {
      const html = typeof root.modalRegistrarPropostaFornecedorHtml === 'function'
        ? root.modalRegistrarPropostaFornecedorHtml({ id: cotacaoId })
        : '<p>Carregando formulário...</p>';
      root.abrirFolha(html, 'Registrar Proposta de Fornecedor');
    }
  }

  async function salvarPropostaFornecedorAction() {
    const cotacaoId = document.getElementById('prop-cotacao-id')?.value;
    const fornecedorNome = document.getElementById('prop-fornecedor')?.value || '';
    const valorTotalOfertado = Number(document.getElementById('prop-valor')?.value || 0);
    const prazoEntregaHoras = Number(document.getElementById('prop-prazo')?.value || 24);

    if (!fornecedorNome || valorTotalOfertado <= 0) {
      root.app?.toast?.('Preencha o fornecedor e o valor da proposta.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/suprimentos/cotacoes-whatsapp/${cotacaoId}/propostas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedorNome, valorTotalOfertado, prazoEntregaHoras })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao registrar proposta');

      root.app?.toast?.('Proposta registrada e auditada contra o histórico!', 'success');
      root.app?.fecharFolha?.();
      if (typeof root.carregarPainelCotacoesCompras === 'function') {
        root.carregarPainelCotacoesCompras();
      }
    } catch (err) {
      root.app?.toast?.(err.message, 'danger');
    }
  }

  async function aprovarPropostaCotacaoAction(cotacaoId, propostaId) {
    if (!cotacaoId) return;
    if (!confirm('Deseja aprovar esta proposta e gerar automaticamente o Pedido de Compra?')) return;

    try {
      const res = await fetch(`/api/suprimentos/cotacoes-whatsapp/${cotacaoId}/aprovar-gerar-pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propostaId })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro na aprovação');

      root.app?.toast?.(`Pedido de Compra #${data.pedidoCompra?.id} gerado com sucesso!`, 'success');
      if (typeof root.carregarPainelCotacoesCompras === 'function') {
        root.carregarPainelCotacoesCompras();
      }
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

      if (act === 'abrir-nova-cotacao-whatsapp') {
        e.preventDefault();
        abrirModalNovaCotacaoWhatsApp();
      } else if (act === 'confirmar-abrir-cotacao-whatsapp') {
        e.preventDefault();
        confirmarAbrirCotacaoWhatsAppAction();
      } else if (act === 'abrir-complementar-fornecedores') {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        abrirModalComplementarFornecedores(id);
      } else if (act === 'confirmar-complementar-fornecedores') {
        e.preventDefault();
        confirmarComplementarFornecedoresAction();
      } else if (act === 'abrir-proposta-fornecedor') {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        abrirModalPropostaFornecedor(id);
      } else if (act === 'salvar-proposta-fornecedor') {
        e.preventDefault();
        salvarPropostaFornecedorAction();
      } else if (act === 'aprovar-proposta-cotacao') {
        e.preventDefault();
        const cotacaoId = btn.getAttribute('data-id');
        const propostaId = btn.getAttribute('data-proposta-id');
        aprovarPropostaCotacaoAction(cotacaoId, propostaId);
      }
    });
  }

  root.abrirModalNovaCotacaoWhatsApp = abrirModalNovaCotacaoWhatsApp;
  root.confirmarAbrirCotacaoWhatsAppAction = confirmarAbrirCotacaoWhatsAppAction;
  root.abrirModalComplementarFornecedores = abrirModalComplementarFornecedores;
  root.confirmarComplementarFornecedoresAction = confirmarComplementarFornecedoresAction;
  root.abrirModalPropostaFornecedor = abrirModalPropostaFornecedor;
  root.salvarPropostaFornecedorAction = salvarPropostaFornecedorAction;
  root.aprovarPropostaCotacaoAction = aprovarPropostaCotacaoAction;

})(typeof window !== 'undefined' ? window : globalThis);

