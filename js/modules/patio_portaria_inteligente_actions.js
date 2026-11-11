// js/modules/patio_portaria_inteligente_actions.js
// Ações Interativas e Listeners Delegados da Portaria Inteligente & Fast Check-in 360º
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalPortaria() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  async function carregarPainelPortariaAction() {
    try {
      const res = await fetch('/api/patio/portaria/movimentacoes');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar movimentações da portaria.');
      }

      if (typeof root.renderPainelPortariaInteligenteHtml === 'function') {
        const container = document.getElementById('container-portaria-inteligente');
        if (container) {
          container.innerHTML = root.renderPainelPortariaInteligenteHtml(data);
        }
      }
      return data;
    } catch (err) {
      if (typeof root.torrar === 'function') {
        root.torrar(err.message || 'Falha ao carregar painel de portaria.');
      }
      return null;
    }
  }

  async function consultarTriagemPlacaPortariaAction(placaParam, kmParam) {
    try {
      let placa = placaParam;
      let km = kmParam;

      if (!placa) {
        const elPlaca = document.getElementById('input-triagem-placa');
        placa = elPlaca ? elPlaca.value.trim().toUpperCase() : '';
      }
      if (km === undefined || km === null || km === '') {
        const elKm = document.getElementById('input-triagem-km');
        km = elKm ? Number(elKm.value) : 0;
      }

      if (!placa) {
        if (typeof root.torrar === 'function') root.torrar('Informe a placa para realizar a triagem.');
        return null;
      }

      const res = await fetch('/api/patio/portaria/triagem-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, kmEntrada: Number(km) || 0 })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao consultar triagem da placa.');
      }

      abrirModalFastCheckinPortaria(data.triagem);
      return data.triagem;
    } catch (err) {
      if (typeof root.torrar === 'function') {
        root.torrar(err.message || 'Falha na triagem da placa.');
      }
      return null;
    }
  }

  function abrirModalFastCheckinPortaria(triagem = {}) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalFastCheckinPortaria360Html === 'function') {
      root.abrirModalGenerico(root.modalFastCheckinPortaria360Html(triagem));
    }
  }

  async function confirmarFastCheckinPortariaAction() {
    try {
      const elPlaca = document.getElementById('fast-checkin-placa');
      const elClienteId = document.getElementById('fast-checkin-cliente-id');
      const elClienteNome = document.getElementById('fast-checkin-cliente-nome');
      const elKm = document.getElementById('fast-checkin-km');
      const elMotorista = document.getElementById('fast-checkin-motorista');
      const elTelefone = document.getElementById('fast-checkin-telefone');
      const elMotivo = document.getElementById('fast-checkin-motivo');
      const elBoxId = document.getElementById('fast-checkin-box-id');
      const elAbrirOS = document.getElementById('fast-checkin-abrir-os');
      const elAlocarBox = document.getElementById('fast-checkin-alocar-box');
      const elOverrideCredito = document.getElementById('fast-checkin-override-credito');
      const elMotivoOverride = document.getElementById('fast-checkin-motivo-override');

      const placa = elPlaca ? elPlaca.value.trim().toUpperCase() : '';
      if (!placa) {
        if (typeof root.torrar === 'function') root.torrar('Placa é obrigatória para o check-in.');
        return;
      }

      const payload = {
        placa,
        clienteId: elClienteId ? elClienteId.value : undefined,
        clienteNome: elClienteNome ? elClienteNome.value.trim() : '',
        kmEntrada: elKm ? Number(elKm.value) || 0 : 0,
        motorista: elMotorista ? elMotorista.value.trim() : '',
        telefoneMotorista: elTelefone ? elTelefone.value.trim() : '',
        motivoEntrada: elMotivo ? elMotivo.value.trim() : '',
        boxId: elBoxId ? elBoxId.value.trim() : undefined,
        abrirOSAutomatica: elAbrirOS ? elAbrirOS.checked : true,
        alocarBoxAutomaticamente: elAlocarBox ? elAlocarBox.checked : true,
        overrideCredito: elOverrideCredito ? elOverrideCredito.checked : false,
        motivoOverrideCredito: elMotivoOverride ? elMotivoOverride.value.trim() : ''
      };

      const res = await fetch('/api/patio/portaria/fast-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao realizar fast check-in.');
      }

      fecharModalPortaria();
      if (typeof root.torrar === 'function') {
        root.torrar(`Check-in realizado! Veículo ${placa} liberado para o pátio.`);
      }
      await carregarPainelPortariaAction();
      return data;
    } catch (err) {
      if (typeof root.torrar === 'function') {
        root.torrar(err.message || 'Falha ao confirmar fast check-in.');
      }
      return null;
    }
  }

  async function abrirModalSaidaPortaria(portariaLogId) {
    try {
      let log = null;
      const res = await fetch('/api/patio/portaria/movimentacoes');
      const data = await res.json();
      if (data && Array.isArray(data.movimentacoes)) {
        log = data.movimentacoes.find(m => m.id === portariaLogId);
      }
      if (!log) {
        log = { id: portariaLogId };
      }

      if (typeof root.abrirModalGenerico === 'function' && typeof root.modalRegistrarSaidaPortariaHtml === 'function') {
        root.abrirModalGenerico(root.modalRegistrarSaidaPortariaHtml(log));
      }
    } catch (err) {
      if (typeof root.torrar === 'function') {
        root.torrar('Falha ao abrir modal de saída.');
      }
    }
  }

  async function registrarSaidaVeiculoPortariaAction() {
    try {
      const elLogId = document.getElementById('saida-log-id');
      const elKm = document.getElementById('saida-km');
      const elQualidade = document.getElementById('saida-exigir-qualidade');
      const elObs = document.getElementById('saida-observacao');

      const logId = elLogId ? elLogId.value : '';
      if (!logId) {
        if (typeof root.torrar === 'function') root.torrar('Registro de portaria não identificado.');
        return;
      }

      const payload = {
        kmSaida: elKm ? Number(elKm.value) || 0 : undefined,
        exigirInspecaoQualidade: elQualidade ? elQualidade.checked : true,
        observacao: elObs ? elObs.value.trim() : ''
      };

      const res = await fetch(`/api/patio/portaria/${encodeURIComponent(logId)}/saida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao registrar saída de veículo.');
      }

      fecharModalPortaria();
      if (typeof root.torrar === 'function') {
        root.torrar('Saída autorizada na cancela com sucesso!');
      }
      await carregarPainelPortariaAction();
      return data;
    } catch (err) {
      if (typeof root.torrar === 'function') {
        root.torrar(err.message || 'Falha ao registrar saída.');
      }
      return null;
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const logId = btn.getAttribute('data-log-id');

      if (act === 'triagem-placa-portaria') {
        consultarTriagemPlacaPortariaAction();
      } else if (act === 'abrir-fast-checkin-portaria') {
        abrirModalFastCheckinPortaria();
      } else if (act === 'confirmar-fast-checkin-portaria') {
        confirmarFastCheckinPortariaAction();
      } else if (act === 'abrir-saida-portaria') {
        abrirModalSaidaPortaria(logId);
      } else if (act === 'confirmar-saida-portaria') {
        registrarSaidaVeiculoPortariaAction();
      } else if (act === 'fechar-modal-portaria') {
        fecharModalPortaria();
      } else if (act === 'atualizar-painel-portaria') {
        carregarPainelPortariaAction();
      }
    });
  }

  root.fecharModalPortaria = fecharModalPortaria;
  root.carregarPainelPortariaAction = carregarPainelPortariaAction;
  root.consultarTriagemPlacaPortariaAction = consultarTriagemPlacaPortariaAction;
  root.abrirModalFastCheckinPortaria = abrirModalFastCheckinPortaria;
  root.confirmarFastCheckinPortariaAction = confirmarFastCheckinPortariaAction;
  root.abrirModalSaidaPortaria = abrirModalSaidaPortaria;
  root.registrarSaidaVeiculoPortariaAction = registrarSaidaVeiculoPortariaAction;

})(typeof window !== 'undefined' ? window : globalThis);

