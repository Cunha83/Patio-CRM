/* =====================================================================
   PÁTIO CRM — DASHBOARD OPERACIONAL: ALERTAS PRIORIZADOS E ENTREGAS DO DIA
   Submódulo extraído de js/dashboard_operacional.js (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  function _esc(str) {
    if (typeof esc === 'function') return esc(str);
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  function renderAlertasEntregasOp(alertas = [], entregas = {}, _filtroPrioridade = 'todas') {
    const esc = _esc;
    const formatarHoraSimples = (typeof window !== 'undefined' && window.formatarHoraSimples) || function(d) { return d ? String(d).slice(11,16) : '--:--'; };
    const formatarTempoOp = (typeof window !== 'undefined' && window.formatarTempoOp) || function(m) { return m + ' min'; };

    const alertasFiltrados = _filtroPrioridade === 'todas'
      ? alertas
      : alertas.filter(a => (a.prioridade || '').toUpperCase() === _filtroPrioridade.toUpperCase());

    return `
      <!-- 4. ALERTAS OPERACIONAIS PRIORIZADOS & ENTREGAS DO DIA (GRID 2 COLUNAS) -->
      <div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">
        <!-- COLUNA ESQUERDA: ALERTAS PRIORIZADOS (O QUE PRECISA DE ATENÇÃO) -->
        <div class="card card-p">
          <div class="entre" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:15px;font-weight:700">O que Precisa de Atenção Agora</h3>
              <div class="mini" style="color:var(--aco-500)">Alertas ordenados por severidade operacional e impacto no prazo</div>
            </div>
            <div class="filtro-prioridades-pills" style="display:flex;gap:4px">
              ${['todas', 'P1', 'P2', 'P3'].map(p => `
                <button class="btn-pilula-op ${_filtroPrioridade === p ? 'ativo' : ''}" data-act="filtro-pri-op" data-pri="${p}">
                  ${p.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="lista-alertas-op" style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto">
            ${alertasFiltrados.length === 0 ? `
              <div style="text-align:center;padding:32px 16px;color:var(--aco-400)">
                <div style="font-size:28px;margin-bottom:8px">✅</div>
                <div style="font-weight:600;font-size:13px">Nenhum alerta pendente</div>
                <div class="mini">A operação está fluindo sem gargalos ou riscos críticos</div>
              </div>
            ` : alertasFiltrados.map(a => {
              const corPri = a.prioridade === 'P1' ? '#ef4444' : a.prioridade === 'P2' ? '#f59e0b' : '#3b82f6';
              const bgPri = a.prioridade === 'P1' ? '#fef2f2' : a.prioridade === 'P2' ? '#fffbeb' : '#eff6ff';

              return `
              <div class="item-alerta-op" style="padding:10px 12px;background:${bgPri};border-left:4px solid ${corPri};border-radius:6px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
                <div style="flex:1">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="selo" style="background:${corPri};color:#fff;font-size:10px;font-weight:700">${a.prioridade}</span>
                    <span style="font-weight:700;font-size:13px">${esc(a.titulo || 'Alerta Operacional')}</span>
                  </div>
                  <div style="font-size:12px;color:var(--aco-700);margin-top:3px">${esc(a.mensagem || '')}</div>
                  <div class="mini" style="color:var(--aco-500);margin-top:4px">
                    ${a.placa ? `<span class="placa" style="font-size:10px">${esc(a.placa)}</span> • ` : ''}
                    ${a.tempoDecorridoMinutos ? `Detectado há ${formatarTempoOp(a.tempoDecorridoMinutos)}` : ''}
                  </div>
                </div>
                <div class="acoes-alerta-op" style="display:flex;gap:6px;justify-content:flex-end">
                  ${a.osId ? `
                    <button class="btn btn-pequeno btn-secundario" data-act="abrir-os-op" data-os="${esc(a.osId)}" style="font-size:11px;padding:3px 6px">
                      Ver OS
                    </button>
                  ` : ''}
                  <button class="btn btn-pequeno btn-neutro" data-act="reconhecer-alerta-op" data-id="${esc(a.id)}" title="Marcar como ciente" style="font-size:11px;padding:3px 6px">
                    ✓
                  </button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- COLUNA DIREITA: ENTREGAS DO DIA E COMPROMISSOS -->
        <div class="card card-p">
          <div class="entre" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:15px;font-weight:700">Entregas Previstas para Hoje</h3>
              <div class="mini" style="color:var(--aco-500)">Cronograma de liberação de veículos pesados</div>
            </div>
            <span class="selo" style="background:#f1f5f9;color:#334155"><b>${(entregas.lista && entregas.lista.length) || 0}</b> veículos</span>
          </div>

          <div class="lista-entregas-op" style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto">
            ${(!entregas.lista || entregas.lista.length === 0) ? `
              <div style="text-align:center;padding:32px 16px;color:var(--aco-400)">
                <div style="font-size:28px;margin-bottom:8px">📅</div>
                <div style="font-weight:600;font-size:13px">Nenhuma entrega prevista para hoje</div>
                <div class="mini">Consulte o quadro de serviços para datas futuras</div>
              </div>
            ` : entregas.lista.map(ent => {
              const stClass = ent.statusEntrega === 'atrasada' ? 'entrega-atrasada' : ent.statusEntrega === 'em_risco' ? 'entrega-risco' : 'entrega-ok';
              const stCor = ent.statusEntrega === 'atrasada' ? '#ef4444' : ent.statusEntrega === 'em_risco' ? '#f59e0b' : '#10b981';

              return `
              <div class="item-entrega-op ${stClass}" style="padding:10px 12px;background:#f8fafc;border-left:4px solid ${stCor};border-radius:6px;display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="placa" style="font-size:11px">${esc(ent.placa || 'Sem Placa')}</span>
                    <span style="font-weight:700;font-size:13px">${esc(ent.modelo || '')}</span>
                  </div>
                  <div class="mini" style="color:var(--aco-600);margin-top:2px">${esc(ent.cliente || '')} • OS #${esc(ent.numeroOS || ent.osId)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;font-size:13px;color:${stCor}">${formatarHoraSimples(ent.previsaoHorario)}</div>
                  <span class="selo" style="font-size:10px;font-weight:800;color:${stCor};background:#ffffff">
                    ${(ent.statusEntrega || 'prevista').toUpperCase()}
                  </span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  if (typeof window !== 'undefined') window.renderAlertasEntregasOp = renderAlertasEntregasOp;
  if (typeof globalThis !== 'undefined') globalThis.renderAlertasEntregasOp = renderAlertasEntregasOp;
})();

