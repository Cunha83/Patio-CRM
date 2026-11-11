// js/modules/torre_controle_executiva_actions.js
// Ações Interativas e Listeners Delegados da Torre de Controle Executiva
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalTorre() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  async function atualizarTorreControleAction(competencia) {
    try {
      const compParam = competencia || (document.getElementById('filtro-competencia-torre') ? document.getElementById('filtro-competencia-torre').value : '');
      const url = compParam ? `/api/executivo/torre-controle?competencia=${compParam}` : '/api/executivo/torre-controle';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar dados da Torre de Controle.');
      }

      if (typeof root.renderPainelTorreControleExecutivaHtml === 'function') {
        const container = document.getElementById('container-torre-controle-executiva');
        if (container) {
          container.innerHTML = root.renderPainelTorreControleExecutivaHtml(data.torreControle);
        }
      }

      return data.torreControle;
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao atualizar Torre de Controle.');
      return null;
    }
  }

  function abrirModalBriefingExecutivo(dados = {}) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalDispararBriefingExecutivoHtml === 'function') {
      root.abrirModalGenerico(root.modalDispararBriefingExecutivoHtml(dados));
    }
  }

  async function confirmarDisparoBriefingWhatsAppAction() {
    const elTurno = document.getElementById('briefing-turno');
    const elComp = document.getElementById('briefing-competencia');

    const turno = elTurno ? elTurno.value : 'matinal';
    const competencia = elComp ? elComp.value.trim() : '';

    try {
      const res = await fetch('/api/executivo/torre-controle/briefing-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turno, competencia })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao disparar briefing.');
      }

      fecharModalTorre();
      if (typeof root.torrar === 'function') {
        root.torrar('Briefing diário enviado com sucesso para o WhatsApp da diretoria!');
      }

      await atualizarTorreControleAction(competencia);
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao disparar briefing.');
    }
  }

  async function filtrarAlertasCriticosTorreAction(categoria = '', severidade = '') {
    try {
      let url = '/api/executivo/torre-controle/alertas-criticos?';
      if (categoria) url += `categoria=${categoria}&`;
      if (severidade) url += `severidade=${severidade}&`;

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao filtrar alertas.');
      }
      return data.alertas;
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao filtrar alertas.');
      return [];
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const cat = btn.getAttribute('data-categoria');
      const sev = btn.getAttribute('data-severidade');

      if (act === 'atualizar-torre-controle') {
        atualizarTorreControleAction();
      } else if (act === 'abrir-modal-briefing-executivo') {
        abrirModalBriefingExecutivo();
      } else if (act === 'fechar-modal-torre') {
        fecharModalTorre();
      } else if (act === 'confirmar-disparo-briefing-whatsapp') {
        confirmarDisparoBriefingWhatsAppAction();
      } else if (act === 'filtrar-alertas-torre') {
        filtrarAlertasCriticosTorreAction(cat, sev);
      }
    });
  }

  root.fecharModalTorre = fecharModalTorre;
  root.atualizarTorreControleAction = atualizarTorreControleAction;
  root.abrirModalBriefingExecutivo = abrirModalBriefingExecutivo;
  root.confirmarDisparoBriefingWhatsAppAction = confirmarDisparoBriefingWhatsAppAction;
  root.filtrarAlertasCriticosTorreAction = filtrarAlertasCriticosTorreAction;

})(typeof window !== 'undefined' ? window : globalThis);
