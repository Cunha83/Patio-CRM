/**
 * Módulo: events_patio_os_crm_delegate.js
 * Pátio-CRM — Handlers Delegados de CRM, Orçamentos Parciais e Apontamento de Pátio
 * Arquitetura Modular (< 250 linhas).
 */

(function (root) {
  'use strict';

  function textoOrcamento(o) {
    if (!o) return '';
    const v = typeof root.V === 'function' ? root.V(o.vei) : (o.veiculo || {});
    const brl = typeof root.brl === 'function' ? root.brl : (n => 'R$ ' + Number(n || 0).toFixed(2));
    const totOS = typeof root.totOS === 'function' ? root.totOS : (x => x.total || 0);
    const dataBR = typeof root.dataBR === 'function' ? root.dataBR : (d => String(d || ''));

    const pecas = (o.pecas || []).map(p => `• ${p.nome} (${p.qtd}x ${brl(p.valor)}) = ${brl(p.qtd * p.valor)}`).join('\n');
    const servicos = (o.servicos || []).map(s => `• ${s.nome} = ${brl(s.valor)}`).join('\n');
    return `*ORÇAMENTO — OS #${o.num}*
*Veículo:* ${v.marca || ''} ${v.modelo || ''} (Placa: ${v.placa || ''})
${pecas ? `\n*Peças:*\n${pecas}` : ''}
${servicos ? `\n*Serviços:*\n${servicos}` : ''}
\n*Total:* ${brl(totOS(o))}
*Previsão de Entrega:* ${dataBR(o.prev)}`;
  }

  function tratarEventosPatioOSCrmEDelegados(a, b, e, o) {
    const S = root.S || {};
    const torrar = typeof root.torrar === 'function' ? root.torrar : () => {};

    switch (a) {
      case 'copiar-orc': {
        if (!o) { torrar('Nenhuma OS selecionada.', 'alerta'); return true; }
        if (typeof root.copiar === 'function') root.copiar(textoOrcamento(o));
        torrar('Orçamento copiado para a área de transferência!', 'sucesso');
        return true;
      }
      case 'checkout-pix': {
        const osId = b.dataset.osId || (o && o.id);
        const vlr = b.dataset.valor || (o && (o.total || (typeof root.totOS === 'function' ? root.totOS(o) : 0)));
        const cli = b.dataset.cliente || (o && o.cliente);
        if (typeof root.abrirModalCheckoutPix === 'function') root.abrirModalCheckoutPix(osId, vlr, cli);
        return true;
      }
      case 'simular-webhook-pix': {
        const txid = b.dataset.txid;
        const osId = b.dataset.osId;
        b.disabled = true;
        b.textContent = 'Processando liquidação via webhook...';
        fetch('/api/webhooks/pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txid, status: 'PAGO' })
        })
          .then(r => r.json())
          .then(d => {
            if (d.success) {
              if (o) { o.pago = true; o.formaPgto = 'pix'; o.saldoPendente = 0; }
              if (osId && Array.isArray(S.os)) {
                const target = S.os.find(x => x.id === osId || String(x.num) === String(osId));
                if (target) { target.pago = true; target.formaPgto = 'pix'; target.saldoPendente = 0; }
              }
              if (typeof root.salvar === 'function') root.salvar();
              document.getElementById('modal-checkout-pix-overlay')?.remove();
              if (typeof root.render === 'function') root.render();
              torrar('⚡ Pagamento Pix conciliado e liquidado com sucesso!', 'sucesso');
            } else {
              torrar(d.error || 'Erro na conciliação Pix.', 'erro');
              b.disabled = false;
              b.textContent = '⚡ Simular Confirmação Webhook Pix';
            }
          })
          .catch(() => {
            torrar('Falha de conexão com webhook Pix.', 'erro');
            b.disabled = false;
            b.textContent = '⚡ Simular Confirmação Webhook Pix';
          });
        return true;
      }
      case 'duplicar-os': {
        const osId = b.dataset.id || (o && o.id);
        if (!osId) return true;
        fetch('/api/os/duplicar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: osId }) })
          .then(r => r.json())
          .then(d => {
            if (d.success && d.item) {
              S.os = S.os || [];
              S.os.push(d.item);
              if (typeof root.salvar === 'function') root.salvar();
              if (typeof root.render === 'function') root.render();
              torrar(`OS duplicada com sucesso! Nova OS #${d.item.num}`, 'sucesso');
            } else { torrar(d.error || 'Erro ao duplicar OS.', 'erro'); }
          }).catch(() => torrar('Erro de rede ao duplicar OS.', 'erro'));
        return true;
      }
      case 'abrir-aprovacao-parcial': {
        const osId = b.dataset.osId || (o && o.id);
        if (typeof root.abrirModalAprovacaoParcial === 'function') root.abrirModalAprovacaoParcial(osId);
        return true;
      }
      case 'confirmar-aprovacao-parcial': {
        const osId = b.dataset.osId || (o && o.id);
        if (typeof root.confirmarAprovacaoParcial === 'function') root.confirmarAprovacaoParcial(osId);
        return true;
      }
      case 'abrir-modal-converter-oportunidade':
        if (typeof root.abrirModalConverterOportunidade === 'function') root.abrirModalConverterOportunidade(b.dataset.id);
        return true;
      case 'confirmar-conversao-oportunidade':
        if (typeof root.confirmarConversaoOportunidade === 'function') root.confirmarConversaoOportunidade(b.dataset.id);
        return true;
      case 'abrir-modal-followup-oportunidade':
        if (typeof root.abrirModalRegistrarFollowUp === 'function') root.abrirModalRegistrarFollowUp(b.dataset.id);
        return true;
      case 'confirmar-followup-oportunidade':
        if (typeof root.confirmarRegistroFollowUp === 'function') root.confirmarRegistroFollowUp(b.dataset.id);
        return true;
      case 'salvar-orcamento-centro-custo':
        if (typeof root.salvarOrcamentoCentroCusto === 'function') root.salvarOrcamentoCentroCusto(b.dataset.cliente, b.dataset.id);
        return true;
      case 'abrir-modal-iniciar-apontamento':
        if (typeof root.abrirModalIniciarApontamento === 'function') root.abrirModalIniciarApontamento(b.dataset.id || b.dataset.os);
        return true;
      case 'iniciar-apontamento-servico':
        if (typeof root.confirmarIniciarApontamento === 'function') root.confirmarIniciarApontamento(b.dataset.os);
        return true;
      case 'pausar-apontamento-servico':
        if (typeof root.pausarApontamento === 'function') root.pausarApontamento(b.dataset.id);
        return true;
      case 'retomar-apontamento-servico':
        if (typeof root.retomarApontamento === 'function') root.retomarApontamento(b.dataset.id);
        return true;
      case 'concluir-apontamento-servico':
        if (typeof root.concluirApontamento === 'function') root.concluirApontamento(b.dataset.id);
        return true;
      case 'abrir-modal-config-comissao':
        if (typeof root.abrirModalConfigurarComissaoMecanico === 'function') root.abrirModalConfigurarComissaoMecanico(b.dataset.mecanico || b.dataset.id);
        return true;
      case 'salvar-regra-comissao-mecanico':
        if (typeof root.salvarRegraComissaoMecanico === 'function') root.salvarRegraComissaoMecanico(b.dataset.mecanico);
        return true;
      default:
        return false;
    }
  }

  const delegateExports = {
    textoOrcamento,
    tratarEventosPatioOSCrmEDelegados
  };

  if (typeof window !== 'undefined') Object.assign(window, delegateExports);
  if (typeof globalThis !== 'undefined') Object.assign(globalThis, delegateExports);

})(typeof window !== 'undefined' ? window : globalThis);
