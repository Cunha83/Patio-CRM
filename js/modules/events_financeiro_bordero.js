/**
 * Módulo: events_financeiro_bordero.js
 * Pátio-CRM — Handlers de Eventos: Faturamento de Frotas (Borderô), Comissões e Espelho
 * Arquitetura Modular (< 350 linhas).
 */

function tratarEventosFinanceiroBordero(a, b, e, o) {
  switch (a) {
    case 'toggle-os-bordero': {
      const osId = b.dataset.id;
      S.ui.borderoOsIds = S.ui.borderoOsIds || [];
      const idx = S.ui.borderoOsIds.indexOf(osId);
      if (idx >= 0) S.ui.borderoOsIds.splice(idx, 1);
      else S.ui.borderoOsIds.push(osId);
      render();
      return true;
    }

    case 'toggle-todas-os-bordero': {
      const osIds = (b.dataset.ids || '').split(',').filter(Boolean);
      if (S.ui.borderoOsIds && S.ui.borderoOsIds.length === osIds.length) {
        S.ui.borderoOsIds = [];
      } else {
        S.ui.borderoOsIds = osIds;
      }
      render();
      return true;
    }

    case 'toggle-retencao-iss':
      S.ui.borderoRetencaoISS = !S.ui.borderoRetencaoISS;
      render();
      return true;

    case 'toggle-retencao-irrf':
      S.ui.borderoRetencaoIRRF = !S.ui.borderoRetencaoIRRF;
      render();
      return true;

    case 'abrir-modal-bordero':
      if (typeof abrirModalDetalhesBordero === 'function') abrirModalDetalhesBordero(b.dataset.id);
      return true;

    case 'copiar-linha-digitavel':
      if (typeof copiar === 'function') copiar(b.dataset.linha);
      else if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.linha);
      torrar('Linha digitável copiada!', 'sucesso');
      return true;

    case 'copiar-pix-bordero':
      if (typeof copiar === 'function') copiar(b.dataset.pix);
      else if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.pix);
      torrar('Pix Copia e Cola copiado!', 'sucesso');
      return true;

    case 'imprimir-espelho-bordero':
      window.print();
      return true;

    case 'enviar-wa-bordero-modal': {
      const bordId = b.dataset.id;
      const bObj = (S.borderos || []).find(x => x.id === bordId);
      if (bObj && typeof gerarTextoWhatsAppBordero === 'function') {
        const txt = encodeURIComponent(gerarTextoWhatsAppBordero(bObj));
        window.open('https://api.whatsapp.com/send?text=' + txt, '_blank');
      }
      return true;
    }

    case 'cancelar-bordero-modal': {
      const bordId = b.dataset.id;
      if (confirm('Deseja realmente cancelar este borderô e reabrir as OSs vinculadas?')) {
        fetch(`/api/financeiro/bordero/${encodeURIComponent(bordId)}/cancelar`, { method: 'POST' })
          .then(r => r.json())
          .then(d => {
            if (d.ok || d.success) {
              torrar('Borderô cancelado com sucesso!', 'sucesso');
              if (typeof carregarEstado === 'function') carregarEstado().then(render);
              else render();
              if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
            } else { torrar(d.error || 'Erro ao cancelar borderô', 'alerta'); }
          })
          .catch(() => torrar('Erro de rede ao cancelar borderô', 'alerta'));
      }
      return true;
    }

    case 'executar-fechamento-bordero': {
      const cliId = S.ui.borderoClienteId;
      const osIds = S.ui.borderoOsIds || [];
      if (!cliId || osIds.length === 0) {
        torrar('Selecione uma transportadora e ao menos uma OS.', 'alerta');
        return true;
      }
      b.disabled = true;
      b.textContent = 'Gerando borderô...';
      const payload = {
        clienteId: cliId,
        osIds: osIds,
        condicaoPagamento: S.ui.borderoCondicao || '30ddl',
        descontoGeral: S.ui.borderoDesconto || 0,
        reterISS: !!S.ui.borderoRetencaoISS,
        reterIRRF: !!S.ui.borderoRetencaoIRRF
      };
      fetch('/api/financeiro/bordero/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(d => {
          b.disabled = false;
          b.textContent = 'Gerar Borderô e Duplicatas 📑';
          if (d.ok || d.success || d.bordero) {
            const nb = d.bordero || d;
            S.borderos = S.borderos || [];
            S.borderos.unshift(nb);
            S.ui.borderoOsIds = [];
            salvar(); render();
            torrar('Borderô gerado com sucesso!', 'sucesso');
            if (typeof abrirModalDetalhesBordero === 'function') abrirModalDetalhesBordero(nb.id);
          } else { torrar(d.error || 'Erro ao fechar borderô', 'alerta'); }
        })
        .catch(() => {
          b.disabled = false;
          b.textContent = 'Gerar Borderô e Duplicatas 📑';
          torrar('Erro de rede ao fechar borderô', 'alerta');
        });
      return true;
    }

    case 'mudar-subaba-bi':
      S.ui.biSubAba = b.dataset.subaba || 'indicadores';
      render();
      return true;

    case 'mudar-periodo-comissoes':
      S.ui.comissoesPeriodo = b.dataset.periodo || 'quinzena_1';
      render();
      return true;

    case 'copiar-extrato-comissoes': {
      const calc = typeof calcularExtratoComissoes === 'function' ? calcularExtratoComissoes(S) : null;
      if (calc && typeof gerarTextoExtratoComissoes === 'function') {
        const txt = gerarTextoExtratoComissoes(calc);
        if (typeof copiar === 'function') copiar(txt);
        else if (navigator.clipboard) navigator.clipboard.writeText(txt);
        torrar('Relatório de comissões copiado!', 'sucesso');
      }
      return true;
    }

    default:
      return false;
  }
}

function tratarChangeFinanceiroBordero(a, el, e, o) {
  if (a === 'filtro-bordero-cli') {
    S.ui.borderoClienteId = el.value;
    S.ui.borderoOsIds = [];
    render();
    return true;
  }
  if (a === 'campo-bordero-desconto') {
    S.ui.borderoDesconto = parseFloat(el.value) || 0;
    render();
    return true;
  }
  if (a === 'seletor-condicao-bordero') {
    S.ui.borderoCondicao = el.value;
    return true;
  }
  if (a === 'filtro-mecanico-comissao') {
    S.ui.comissoesMecanicoId = el.value;
    render();
    return true;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.tratarEventosFinanceiroBordero = tratarEventosFinanceiroBordero;
  window.tratarChangeFinanceiroBordero = tratarChangeFinanceiroBordero;
}
if (typeof globalThis !== 'undefined') {
  globalThis.tratarEventosFinanceiroBordero = tratarEventosFinanceiroBordero;
  globalThis.tratarChangeFinanceiroBordero = tratarChangeFinanceiroBordero;
}
