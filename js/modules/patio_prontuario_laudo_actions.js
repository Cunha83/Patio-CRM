// js/modules/patio_prontuario_laudo_actions.js
// Ações Interativas e Listeners Delegados do Prontuário Técnico e Laudo SHA-256
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalProntuario() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  function abrirModalIntervencaoEixo(placa = '') {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalRegistrarIntervencaoEixoHtml === 'function') {
      root.abrirModalGenerico(root.modalRegistrarIntervencaoEixoHtml({ placa }));
    }
  }

  function abrirModalEmitirLaudoTecnico(placa = '') {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalEmitirLaudoTecnicoHtml === 'function') {
      root.abrirModalGenerico(root.modalEmitirLaudoTecnicoHtml({ placa }));
    }
  }

  async function consultarProntuarioPlacaAction(placaInput) {
    const placa = (placaInput || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!placa) {
      if (typeof root.torrar === 'function') root.torrar('Informe a placa do veículo para consultar o prontuário.');
      return null;
    }

    try {
      const res = await fetch(`/api/patio/veiculos/${placa}/prontuario`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar prontuário.');
      }

      if (typeof root.renderPainelProntuarioTecnicoPlacaHtml === 'function') {
        const container = document.getElementById('container-prontuario-tecnico');
        if (container) {
          container.innerHTML = root.renderPainelProntuarioTecnicoPlacaHtml(data.prontuario);
        }
      }

      return data.prontuario;
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao consultar prontuário.');
      return null;
    }
  }

  async function salvarIntervencaoEixoAction() {
    const elPlaca = document.getElementById('intervencao-placa');
    const elEixo = document.getElementById('intervencao-eixo-posicao');
    const elLado = document.getElementById('intervencao-lado');
    const elComp = document.getElementById('intervencao-componente');
    const elKm = document.getElementById('intervencao-km');
    const elDesc = document.getElementById('intervencao-descricao');
    const elGarKm = document.getElementById('intervencao-garantia-km');
    const elGarDias = document.getElementById('intervencao-garantia-dias');

    const placa = elPlaca ? elPlaca.value.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
    const eixoPosicao = elEixo ? elEixo.value : 'eixo_2_tracao';
    const lado = elLado ? elLado.value : 'direito_passageiro';
    const componenteSistema = elComp ? elComp.value : 'feixe_de_molas';
    const kmNaAplicacao = elKm ? Number(elKm.value) || 0 : 0;
    const descricaoItem = elDesc ? elDesc.value.trim() : 'Intervenção técnica em eixo';
    const garantiaKm = elGarKm ? Number(elGarKm.value) || 20000 : 20000;
    const garantiaDias = elGarDias ? Number(elGarDias.value) || 90 : 90;

    if (!placa) {
      if (typeof root.torrar === 'function') root.torrar('Placa do veículo é obrigatória.');
      return;
    }

    const payload = {
      eixoPosicao,
      lado,
      componenteSistema,
      kmNaAplicacao,
      descricaoItem,
      garantiaKm,
      garantiaDias
    };

    try {
      const res = await fetch(`/api/patio/veiculos/${placa}/intervencoes-eixo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar intervenção.');
      }

      fecharModalProntuario();
      if (typeof root.torrar === 'function') {
        root.torrar(`Intervenção registrada com sucesso para o veículo ${placa}!`);
      }

      await consultarProntuarioPlacaAction(placa);
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao registrar intervenção.');
    }
  }

  async function confirmarEmissaoLaudoTecnicoAction() {
    const elPlaca = document.getElementById('laudo-placa');
    const elKm = document.getElementById('laudo-km');
    const elParecer = document.getElementById('laudo-parecer');
    const elResp = document.getElementById('laudo-responsavel');
    const elConselho = document.getElementById('laudo-conselho');
    const elRecom = document.getElementById('laudo-recomendacoes');

    const placa = elPlaca ? elPlaca.value.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
    const kmInspecao = elKm ? Number(elKm.value) || 0 : 0;
    const parecerFinal = elParecer ? elParecer.value : 'apto_operacao_rodoviaria';
    const responsavelTecnico = elResp ? elResp.value.trim() : 'Eng. Técnico';
    const registroConselho = elConselho ? elConselho.value.trim() : '';
    const recomendacoesTecnicas = elRecom ? elRecom.value.trim() : '';

    if (!placa) {
      if (typeof root.torrar === 'function') root.torrar('Placa do veículo é obrigatória.');
      return;
    }

    const payload = {
      kmInspecao,
      parecerFinal,
      responsavelTecnico,
      registroConselho,
      recomendacoesTecnicas
    };

    try {
      const res = await fetch(`/api/patio/veiculos/${placa}/laudo-tecnico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao emitir laudo técnico.');
      }

      fecharModalProntuario();
      if (typeof root.torrar === 'function') {
        root.torrar(`Laudo técnico emitido e assinado digitalmente (SHA-256)!`);
      }

      await consultarProntuarioPlacaAction(placa);
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao emitir laudo técnico.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const placa = btn.getAttribute('data-placa');

      if (act === 'abrir-modal-intervencao-eixo') {
        abrirModalIntervencaoEixo(placa);
      } else if (act === 'abrir-modal-laudo-tecnico') {
        abrirModalEmitirLaudoTecnico(placa);
      } else if (act === 'fechar-modal-prontuario') {
        fecharModalProntuario();
      } else if (act === 'salvar-intervencao-eixo') {
        salvarIntervencaoEixoAction();
      } else if (act === 'salvar-laudo-tecnico') {
        confirmarEmissaoLaudoTecnicoAction();
      } else if (act === 'consultar-prontuario-placa' && placa) {
        consultarProntuarioPlacaAction(placa);
      }
    });
  }

  root.fecharModalProntuario = fecharModalProntuario;
  root.abrirModalIntervencaoEixo = abrirModalIntervencaoEixo;
  root.abrirModalEmitirLaudoTecnico = abrirModalEmitirLaudoTecnico;
  root.consultarProntuarioPlacaAction = consultarProntuarioPlacaAction;
  root.salvarIntervencaoEixoAction = salvarIntervencaoEixoAction;
  root.confirmarEmissaoLaudoTecnicoAction = confirmarEmissaoLaudoTecnicoAction;

})(typeof window !== 'undefined' ? window : globalThis);
