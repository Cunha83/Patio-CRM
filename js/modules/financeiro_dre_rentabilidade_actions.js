// js/modules/financeiro_dre_rentabilidade_actions.js
// Handlers e Ações Interativas do DRE Gerencial, Break-Even e Rentabilidade
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalSimuladorPE() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  async function carregarPainelDreGerencialAction() {
    if (typeof root.torrar === 'function') root.torrar('Atualizando indicadores de DRE e Break-Even...');
    try {
      const [resDre, resPe, resRank] = await Promise.all([
        fetch('/api/financeiro/dre-gerencial').then(r => r.json()),
        fetch('/api/financeiro/ponto-equilibrio').then(r => r.json()),
        fetch('/api/financeiro/rentabilidade-frotas-boxes').then(r => r.json())
      ]);

      const container = document.getElementById('painel-dre-gerencial-container');
      if (container && typeof root.renderPainelDreERentabilidadeHtml === 'function') {
        container.innerHTML = root.renderPainelDreERentabilidadeHtml({
          dre: resDre,
          pontoEquilibrio: resPe,
          rankingFrotas: resRank.rankingFrotas,
          rankingBoxes: resRank.rankingBoxes
        });
      }

      if (typeof root.torrar === 'function') root.torrar('DRE Gerencial atualizado com sucesso!');
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao carregar DRE Gerencial.');
    }
  }

  async function abrirModalSimuladorPontoEquilibrio() {
    if (typeof root.torrar === 'function') root.torrar('Carregando parâmetros do simulador...');
    try {
      const resPe = await fetch('/api/financeiro/ponto-equilibrio').then(r => r.json());
      if (typeof root.abrirModalGenerico === 'function' && typeof root.modalSimuladorMetaPontoEquilibrioHtml === 'function') {
        root.abrirModalGenerico(root.modalSimuladorMetaPontoEquilibrioHtml({
          competencia: resPe.competencia,
          pontoEquilibrio: resPe
        }));
      }
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro ao abrir simulador de Break-Even.');
    }
  }

  async function calcularSimulacaoPontoEquilibrioAction() {
    const elMeta = document.getElementById('simulador-meta-lucro');
    const elComp = document.getElementById('simulador-competencia');

    const metaLucroDesejado = elMeta ? Number(elMeta.value) || 0 : 0;
    const competencia = elComp ? elComp.value : null;

    if (typeof root.torrar === 'function') root.torrar('Calculando Ponto de Equilíbrio com a meta...');
    try {
      const url = `/api/financeiro/ponto-equilibrio?metaLucroDesejado=${metaLucroDesejado}${competencia ? `&competencia=${competencia}` : ''}`;
      const res = await fetch(url).then(r => r.json());

      if (!res.success) {
        if (typeof root.torrar === 'function') root.torrar(res.error || 'Erro no cálculo do simulador.');
        return;
      }

      fecharModalSimuladorPE();
      const formatado = Number(res.pontoEquilibrioEconomico || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      if (typeof root.torrar === 'function') {
        root.torrar(`Ponto de Equilíbrio Econômico para a meta: ${formatado} (${res.statusEquilibrio})`);
      }
      await carregarPainelDreGerencialAction();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao simular Break-Even.');
    }
  }

  async function dispararBriefingDreWhatsAppAction() {
    if (typeof root.torrar === 'function') root.torrar('Enviando briefing executivo no WhatsApp...');
    try {
      const res = await fetch('/api/financeiro/dre-gerencial/briefing-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao disparar briefing.');
        return;
      }
      if (typeof root.torrar === 'function') root.torrar('Briefing de DRE & Break-Even enviado para a gerência!');
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao enviar briefing WhatsApp.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      if (act === 'atualizar-dre-gerencial') {
        carregarPainelDreGerencialAction();
      } else if (act === 'abrir-simulador-ponto-equilibrio') {
        abrirModalSimuladorPontoEquilibrio();
      } else if (act === 'confirmar-simulacao-ponto-equilibrio') {
        calcularSimulacaoPontoEquilibrioAction();
      } else if (act === 'enviar-briefing-dre-whatsapp') {
        dispararBriefingDreWhatsAppAction();
      } else if (act === 'fechar-modal-simulador-pe') {
        fecharModalSimuladorPE();
      }
    });
  }

  root.fecharModalSimuladorPE = fecharModalSimuladorPE;
  root.carregarPainelDreGerencialAction = carregarPainelDreGerencialAction;
  root.abrirModalSimuladorPontoEquilibrio = abrirModalSimuladorPontoEquilibrio;
  root.calcularSimulacaoPontoEquilibrioAction = calcularSimulacaoPontoEquilibrioAction;
  root.dispararBriefingDreWhatsAppAction = dispararBriefingDreWhatsAppAction;

})(typeof window !== 'undefined' ? window : globalThis);

