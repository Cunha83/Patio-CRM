// js/modules/fiscal_b2b_actions.js
// Handlers e Ações Interativas da Central de Fechamento Fiscal B2B
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalFiscal() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  function abrirModalEspelhoFiscalB2B(origem = {}) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalGerarEspelhoFiscalB2BHtml === 'function') {
      root.abrirModalGenerico(root.modalGerarEspelhoFiscalB2BHtml(origem));
    }
  }

  function abrirModalEmitirNotasB2B(espelhoId) {
    if (typeof S === 'undefined') return;
    const lista = Array.isArray(S.fiscalClosings) ? S.fiscalClosings : [];
    const espelho = lista.find(f => f.id === espelhoId) || { id: espelhoId };

    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalRegistrarEmissaoNotasHtml === 'function') {
      root.abrirModalGenerico(root.modalRegistrarEmissaoNotasHtml(espelho));
    }
  }

  async function gerarEspelhoFiscalB2BAction() {
    const elTipo = document.getElementById('espelho-tipo-fonte');
    const elOrigem = document.getElementById('espelho-origem-id');
    const elRegime = document.getElementById('espelho-regime');
    const elIss = document.getElementById('espelho-reter-iss');
    const elIrrf = document.getElementById('espelho-reter-irrf');
    const elCsrf = document.getElementById('espelho-reter-csrf');
    const elObs = document.getElementById('espelho-obs');

    const tipo = elTipo ? elTipo.value : 'bordero';
    const origemId = elOrigem ? elOrigem.value.trim() : '';
    const regimeTributario = elRegime ? elRegime.value : 'simples_nacional';
    const reterISS = elIss ? elIss.checked : true;
    const reterIRRF = elIrrf ? elIrrf.checked : false;
    const reterCSRF = elCsrf ? elCsrf.checked : false;
    const observacoesFiscais = elObs ? elObs.value.trim() : '';

    if (!origemId) {
      if (typeof root.torrar === 'function') root.torrar('Informe o ID ou número da OS / Borderô.');
      return;
    }

    const payload = {
      osId: tipo === 'os' ? origemId : undefined,
      borderoId: tipo === 'bordero' ? origemId : undefined,
      regimeTributario,
      reterISS,
      reterIRRF,
      reterCSRF,
      observacoesFiscais
    };

    if (typeof root.torrar === 'function') root.torrar('Calculando espelho fiscal...');
    try {
      const res = await fetch('/api/fiscal/espelho-b2b/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao gerar espelho fiscal.');
        return;
      }

      if (typeof root.torrar === 'function') root.torrar('Espelho fiscal B2B gerado com sucesso!');
      fecharModalFiscal();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao gerar espelho fiscal.');
    }
  }

  async function confirmarEmissaoNotasB2BAction() {
    const elId = document.getElementById('emissao-espelho-id');
    const elNfeNum = document.getElementById('emissao-nfe-num');
    const elNfeChave = document.getElementById('emissao-nfe-chave');
    const elNfseNum = document.getElementById('emissao-nfse-num');
    const elNfseCod = document.getElementById('emissao-nfse-cod');

    const espelhoId = elId ? elId.value : null;
    const numeroNFePecas = elNfeNum ? elNfeNum.value.trim() : null;
    const chaveAcessoNFe = elNfeChave ? elNfeChave.value.trim() : null;
    const numeroNFSeServicos = elNfseNum ? elNfseNum.value.trim() : null;
    const codigoVerificacaoNFSe = elNfseCod ? elNfseCod.value.trim() : null;

    if (!espelhoId) {
      if (typeof root.torrar === 'function') root.torrar('Fechamento fiscal não informado.');
      return;
    }

    if (typeof root.torrar === 'function') root.torrar('Registrando emissão de notas fiscais...');
    try {
      const res = await fetch(`/api/fiscal/espelho-b2b/${encodeURIComponent(espelhoId)}/emitir-notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroNFePecas,
          chaveAcessoNFe,
          numeroNFSeServicos,
          codigoVerificacaoNFSe,
          atualizarLiquidoReceber: true
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao emitir notas fiscais.');
        return;
      }

      if (typeof root.torrar === 'function') root.torrar('Notas registradas e saldo líquido ajustado com sucesso!');
      fecharModalFiscal();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao registrar emissão de notas.');
    }
  }

  async function exportarLoteContabilAction(competencia) {
    const compQuery = competencia ? `?competencia=${encodeURIComponent(competencia)}` : '';
    if (typeof root.torrar === 'function') root.torrar('Buscando lote contábil da competência...');
    try {
      const res = await fetch(`/api/fiscal/lote-contabil${compQuery}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao buscar lote contábil.');
        return;
      }

      const csv = data.lote?.csvExportString;
      if (!csv) {
        if (typeof root.torrar === 'function') root.torrar('Nenhum registro para exportar.');
        return;
      }

      if (typeof window !== 'undefined' && typeof window.Blob === 'function' && typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lote_contabil_fiscal_${data.lote.competencia || 'mes'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      if (typeof root.torrar === 'function') root.torrar(`Lote contábil exportado: ${data.lote.quantidadeFechamentos} registro(s).`);
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro ao exportar lote contábil.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const espelhoId = btn.getAttribute('data-espelho-id');
      const comp = btn.getAttribute('data-competencia');

      if (act === 'abrir-espelho-fiscal-b2b') {
        abrirModalEspelhoFiscalB2B();
      } else if (act === 'fechar-modal-fiscal') {
        fecharModalFiscal();
      } else if (act === 'confirmar-espelho-fiscal-b2b') {
        gerarEspelhoFiscalB2BAction();
      } else if (act === 'abrir-emitir-notas-b2b' && espelhoId) {
        abrirModalEmitirNotasB2B(espelhoId);
      } else if (act === 'confirmar-emitir-notas-b2b') {
        confirmarEmissaoNotasB2BAction();
      } else if (act === 'exportar-lote-contabil-fiscal') {
        exportarLoteContabilAction(comp);
      }
    });
  }

  root.fecharModalFiscal = fecharModalFiscal;
  root.abrirModalEspelhoFiscalB2B = abrirModalEspelhoFiscalB2B;
  root.gerarEspelhoFiscalB2BAction = gerarEspelhoFiscalB2BAction;
  root.abrirModalEmitirNotasB2B = abrirModalEmitirNotasB2B;
  root.confirmarEmissaoNotasB2BAction = confirmarEmissaoNotasB2BAction;
  root.exportarLoteContabilAction = exportarLoteContabilAction;

})(typeof window !== 'undefined' ? window : globalThis);
