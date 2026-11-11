// js/modules/crm_preventiva_preditiva_actions.js
// Handlers e Ações Interativas da Manutenção Preventiva Preditiva de Frotas
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalPreventiva() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  function abrirModalPlanoPreventivo(placa) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalConfigurarPlanoPreventivoHtml === 'function') {
      root.abrirModalGenerico(root.modalConfigurarPlanoPreventivoHtml({ placa }));
    }
  }

  function abrirModalTelemetriaKm(placa) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalAtualizarKmTelemetriaHtml === 'function') {
      root.abrirModalGenerico(root.modalAtualizarKmTelemetriaHtml({ placa }));
    }
  }

  async function salvarPlanoPreventivoAction() {
    const elPlaca = document.getElementById('plano-placa');
    const elModelo = document.getElementById('plano-modelo');
    const elSistema = document.getElementById('plano-sistema');
    const elKmPadrao = document.getElementById('plano-km-padrao');
    const elSeveridade = document.getElementById('plano-severidade');
    const elKmUltima = document.getElementById('plano-km-ultima');
    const elValor = document.getElementById('plano-valor-estimado');

    const placa = elPlaca ? elPlaca.value.trim() : '';
    const modeloVeiculo = elModelo ? elModelo.value.trim() : '';
    const sistemaTecnico = elSistema ? elSistema.value : 'suspensao_traseira';
    const intervaloKmPadrao = elKmPadrao ? Number(elKmPadrao.value) || 20000 : 20000;
    const severidadeOperacao = elSeveridade ? elSeveridade.value : 'rodoviaria';
    const kmUltimaRevisao = elKmUltima ? Number(elKmUltima.value) || 0 : 0;
    const valorEstimadoRevisao = elValor ? Number(elValor.value) || 0 : 0;

    if (!placa) {
      if (typeof root.torrar === 'function') root.torrar('Informe a placa do veículo.');
      return;
    }

    if (typeof root.torrar === 'function') root.torrar('Salvando plano preventivo...');
    try {
      const res = await fetch('/api/crm/preventiva-preditiva/planos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placa,
          modeloVeiculo,
          sistemaTecnico,
          intervaloKmPadrao,
          severidadeOperacao,
          kmUltimaRevisao,
          valorEstimadoRevisao
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao configurar plano preventivo.');
        return;
      }

      if (typeof root.torrar === 'function') root.torrar('Plano preventivo configurado com sucesso!');
      fecharModalPreventiva();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao salvar plano preventivo.');
    }
  }

  async function atualizarTelemetriaKmAction() {
    const elPlaca = document.getElementById('telemetria-placa');
    const elKmAtual = document.getElementById('telemetria-km-atual');
    const elKmMedio = document.getElementById('telemetria-km-medio');

    const placa = elPlaca ? elPlaca.value.trim() : '';
    const kmAtual = elKmAtual ? Number(elKmAtual.value) || 0 : 0;
    const kmMedioDiarioEstimado = elKmMedio ? Number(elKmMedio.value) || 300 : 300;

    if (!placa || !kmAtual) {
      if (typeof root.torrar === 'function') root.torrar('Informe a placa e o KM atual.');
      return;
    }

    if (typeof root.torrar === 'function') root.torrar('Atualizando telemetria KM...');
    try {
      const res = await fetch('/api/crm/preventiva-preditiva/telemetria-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, kmAtual, kmMedioDiarioEstimado })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao atualizar telemetria.');
        return;
      }

      if (typeof root.torrar === 'function') root.torrar('Telemetria KM atualizada com sucesso!');
      fecharModalPreventiva();
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao atualizar telemetria.');
    }
  }

  async function dispararReguaPreventivaWhatsAppAction() {
    if (typeof root.torrar === 'function') root.torrar('Disparando régua preventiva WhatsApp...');
    try {
      const res = await fetch('/api/crm/preventiva-preditiva/disparar-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao disparar régua preventiva.');
        return;
      }

      const total = data.totalNotificados || 0;
      if (typeof root.torrar === 'function') {
        root.torrar(`Régua preventiva disparada! ${total} frotista(s) notificado(s).`);
      }
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao disparar régua preventiva.');
    }
  }

  async function converterAlertaPreventivoOSAction(alertaId) {
    if (!alertaId) return;

    if (typeof root.torrar === 'function') root.torrar('Convertendo alerta em Agendamento/OS...');
    try {
      const res = await fetch(`/api/crm/preventiva-preditiva/${encodeURIComponent(alertaId)}/converter-os`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof root.torrar === 'function') root.torrar(data.error || 'Erro ao converter alerta em OS.');
        return;
      }

      if (typeof root.torrar === 'function') {
        root.torrar(`OS Preventiva #${data.os ? data.os.id : 'Criada'} gerada com sucesso!`);
      }
      if (typeof root.carregarEstado === 'function') await root.carregarEstado();
      if (typeof root.render === 'function') root.render();
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar('Erro de rede ao converter alerta em OS.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const alertaId = btn.getAttribute('data-alerta-id');

      if (act === 'abrir-plano-preventivo') {
        abrirModalPlanoPreventivo();
      } else if (act === 'abrir-telemetria-km') {
        abrirModalTelemetriaKm();
      } else if (act === 'fechar-modal-preventiva') {
        fecharModalPreventiva();
      } else if (act === 'salvar-plano-preventivo') {
        salvarPlanoPreventivoAction();
      } else if (act === 'salvar-telemetria-km') {
        atualizarTelemetriaKmAction();
      } else if (act === 'disparar-regua-preventiva-whatsapp') {
        dispararReguaPreventivaWhatsAppAction();
      } else if (act === 'converter-alerta-preventivo-os' && alertaId) {
        converterAlertaPreventivoOSAction(alertaId);
      }
    });
  }

  root.fecharModalPreventiva = fecharModalPreventiva;
  root.abrirModalPlanoPreventivo = abrirModalPlanoPreventivo;
  root.abrirModalTelemetriaKm = abrirModalTelemetriaKm;
  root.salvarPlanoPreventivoAction = salvarPlanoPreventivoAction;
  root.atualizarTelemetriaKmAction = atualizarTelemetriaKmAction;
  root.dispararReguaPreventivaWhatsAppAction = dispararReguaPreventivaWhatsAppAction;
  root.converterAlertaPreventivoOSAction = converterAlertaPreventivoOSAction;

})(typeof window !== 'undefined' ? window : globalThis);
