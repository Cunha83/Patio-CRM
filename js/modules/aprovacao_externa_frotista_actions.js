// js/modules/aprovacao_externa_frotista_actions.js
// Handlers e Ações Interativas do Portal de Aprovação Externa B2B
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalAprovacaoExterna() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  function abrirModalGerarLinkAprovacao(osId) {
    if (typeof S === 'undefined') return;
    const osList = Array.isArray(S.os) ? S.os : [];
    const os = osList.find(o => o.id === osId || String(o.num) === String(osId)) || osList[0] || {};
    const clientes = Array.isArray(S.clientes) ? S.clientes : [];
    const cli = clientes.find(c => c.id === os.cli || c.id === os.clienteId) || {};
    const telefone = cli.telefone || cli.contatoTelefone || '';

    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalGerarLinkAprovacaoFrotistaHtml === 'function') {
      root.abrirModalGenerico(root.modalGerarLinkAprovacaoFrotistaHtml(os, { telefone }));
    }
  }

  async function confirmarGerarLinkAprovacaoAction() {
    const elOsId = document.getElementById('modal-link-os-id');
    const elTel = document.getElementById('modal-link-telefone');
    const elVal = document.getElementById('modal-link-validade');

    const osId = elOsId ? elOsId.value : null;
    const telefoneDestino = elTel ? elTel.value.trim() : null;
    const validadeHoras = elVal ? Number(elVal.value) || 48 : 48;

    if (!osId) {
      if (typeof root.torrar === 'function') root.torrar('Ordem de serviço não selecionada.');
      return;
    }

    if (typeof root.torrar === 'function') root.torrar('Gerando link tokenizado...');
    try {
      const res = await fetch(`/api/orcamentos/${osId}/link-aprovacao-externa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validadeHoras, telefoneDestino })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao gerar link de aprovação.');
        return;
      }

      if (typeof root.torrar === 'function') root.torrar('Link tokenizado gerado com sucesso!');
      fecharModalAprovacaoExterna();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao gerar link de aprovação.');
    }
  }

  function copiarLinkAprovacaoAction(token) {
    if (!token) return;
    const url = `${window.location.origin}/aprovacao-frotista.html?token=${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        if (typeof root.torrar === 'function') root.torrar('Link copiado para a área de transferência!');
      }).catch(() => {
        if (typeof root.torrar === 'function') root.torrar(`Link: ${url}`);
      });
    } else {
      if (typeof root.torrar === 'function') root.torrar(`Link: ${url}`);
    }
  }

  function enviarLinkWhatsAppAction(token, telefone) {
    if (!token) return;
    const url = `${window.location.origin}/aprovacao-frotista.html?token=${token}`;
    const texto = encodeURIComponent(`Olá! Segue o link para conferência e aprovação digital do orçamento da sua frota: ${url}`);
    const tel = (telefone || '').replace(/\D/g, '');
    const wppUrl = tel ? `https://wa.me/${tel}?text=${texto}` : `https://api.whatsapp.com/send?text=${texto}`;
    window.open(wppUrl, '_blank');
  }

  async function revogarLinkAprovacaoAction(tokenId) {
    if (!tokenId) return;
    if (!confirm('Deseja realmente revogar este link de aprovação?')) return;

    if (typeof root.torrar === 'function') root.torrar('Revogando link...');
    try {
      const res = await fetch(`/api/orcamentos/tokens/${tokenId}/revogar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Revogado pelo usuário no painel' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao revogar link.');
        return;
      }
      if (typeof root.torrar === 'function') root.torrar('Link revogado com sucesso!');
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao revogar link.');
    }
  }

  async function abrirPortalPublicoPreviewAction(token) {
    if (!token) return;
    if (typeof root.torrar === 'function') root.torrar('Abrindo portal de aprovação...');
    try {
      const res = await fetch(`/api/public/aprovacao-frotista/${token}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao carregar dados do portal.');
        return;
      }
      if (typeof root.abrirModalGenerico === 'function' && typeof root.modalPortalPublicoAprovacaoFrotistaHtml === 'function') {
        root.abrirModalGenerico(root.modalPortalPublicoAprovacaoFrotistaHtml(data));
      }
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao acessar portal.');
    }
  }

  async function submeterDecisaoPortalPublicoAction() {
    const elToken = document.getElementById('portal-token-publico');
    const elNome = document.getElementById('portal-aprovador-nome');
    const elDoc = document.getElementById('portal-aprovador-doc');
    const elCargo = document.getElementById('portal-aprovador-cargo');

    const token = elToken ? elToken.value : null;
    const aprovadorNome = elNome ? elNome.value.trim() : '';
    const aprovadorDocumento = elDoc ? elDoc.value.trim() : '';
    const aprovadorCargo = elCargo ? elCargo.value.trim() : '';

    if (!aprovadorNome || !aprovadorDocumento) {
      if (typeof root.torrar === 'function') root.torrar('Informe seu nome e documento para assinar digitalmente.');
      return;
    }

    const decisoesItens = [];
    const itemSelects = document.querySelectorAll('.portal-item-decisao');
    itemSelects.forEach(sel => {
      const id = sel.getAttribute('data-item-id');
      const statusItem = sel.value;
      if (id) {
        decisoesItens.push({ id, statusItem });
      }
    });

    if (typeof root.torrar === 'function') root.torrar('Processando decisão com assinatura digital...');
    try {
      const res = await fetch(`/api/public/aprovacao-frotista/${token}/decidir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprovadorNome,
          aprovadorDocumento,
          aprovadorCargo,
          decisoesItens
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao processar aprovação.');
        return;
      }

      if (typeof root.torrar === 'function') root.torrar('Orçamento processado com sucesso! Box de pátio destravado.');
      fecharModalAprovacaoExterna();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao submeter decisão.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const token = btn.getAttribute('data-token');
      const tokenId = btn.getAttribute('data-token-id');
      const telefone = btn.getAttribute('data-telefone');
      const osId = btn.getAttribute('data-os-id');

      if (act === 'abrir-modal-gerar-link-aprovacao') {
        abrirModalGerarLinkAprovacao(osId);
      } else if (act === 'confirmar-gerar-link-aprovacao') {
        confirmarGerarLinkAprovacaoAction();
      } else if (act === 'copiar-link-aprovacao' && token) {
        copiarLinkAprovacaoAction(token);
      } else if (act === 'enviar-link-whatsapp' && token) {
        enviarLinkWhatsAppAction(token, telefone);
      } else if (act === 'revogar-link-aprovacao' && tokenId) {
        revogarLinkAprovacaoAction(tokenId);
      } else if (act === 'abrir-portal-publico-preview' && token) {
        abrirPortalPublicoPreviewAction(token);
      } else if (act === 'submeter-decisao-portal-publico') {
        submeterDecisaoPortalPublicoAction();
      } else if (act === 'fechar-modal-aprovacao-externa') {
        fecharModalAprovacaoExterna();
      }
    });
  }

  root.fecharModalAprovacaoExterna = fecharModalAprovacaoExterna;
  root.abrirModalGerarLinkAprovacao = abrirModalGerarLinkAprovacao;
  root.confirmarGerarLinkAprovacaoAction = confirmarGerarLinkAprovacaoAction;
  root.copiarLinkAprovacaoAction = copiarLinkAprovacaoAction;
  root.enviarLinkWhatsAppAction = enviarLinkWhatsAppAction;
  root.revogarLinkAprovacaoAction = revogarLinkAprovacaoAction;
  root.abrirPortalPublicoPreviewAction = abrirPortalPublicoPreviewAction;
  root.submeterDecisaoPortalPublicoAction = submeterDecisaoPortalPublicoAction;

})(typeof window !== 'undefined' ? window : globalThis);

