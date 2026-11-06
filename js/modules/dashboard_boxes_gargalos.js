/* =====================================================================
   PÁTIO CRM — DASHBOARD OPERACIONAL: BOXES E GARGALOS FÍSICOS
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

  function renderBoxesOp(boxes = []) {
    const esc = _esc;
    return `
      <!-- 3. BOXES DO PÁTIO EM TEMPO REAL (CHÃO DE OFICINA) -->
      <div class="card card-p" style="margin-bottom:20px">
        <div class="entre" style="margin-bottom:14px">
          <div>
            <h3 style="font-size:15px;font-weight:700">Boxes de Manutenção (${boxes.filter(b => b.status !== 'livre').length} Ocupados / ${boxes.filter(b => b.status === 'livre').length} Livres)</h3>
            <div class="mini" style="color:var(--aco-500)">Status físico das baias, mecânicos alocados e tempo de ocupação</div>
          </div>
        </div>

        <div class="grid-boxes-op" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px">
          ${boxes.map(b => {
            const isLivre = b.status === 'livre';
            const isBloq = b.status === 'bloqueado_peca';
            const isAtencao = b.status === 'atencao';
            const tagClass = isLivre ? 'box-livre' : isBloq ? 'box-bloqueado' : (isAtencao ? 'box-atencao' : 'box-ocupado');
            const tagCor = isLivre ? 'var(--verde)' : isBloq ? 'var(--tijolo)' : (isAtencao ? 'var(--ouro)' : 'var(--azul)');
            const tagLabel = isLivre ? 'LIVRE' : isBloq ? 'AGUARDANDO PEÇA' : (isAtencao ? 'ATENÇÃO' : 'EM EXECUÇÃO');

            return `
            <div class="card card-box-op ${tagClass}" style="border:1px solid var(--aco-200);border-top:4px solid ${tagCor};padding:12px">
              <div class="entre" style="margin-bottom:8px">
                <div style="font-weight:700;font-size:14px">${esc(b.nome || b.id)}</div>
                <span class="selo" style="font-size:10px;font-weight:700;color:${tagCor}">${tagLabel}</span>
              </div>

              ${isLivre ? `
                <div style="padding:16px 0;text-align:center;color:var(--aco-400);font-size:12px">
                  Baia disponível para alocação
                </div>
              ` : `
                <div style="margin-bottom:8px">
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <span class="placa" style="font-size:12px">${esc(b.placa || 'Sem Placa')}</span>
                    <span class="mini mono" style="font-weight:700">OS #${esc(b.numeroOS || b.osId)}</span>
                  </div>
                  <div style="font-size:12px;font-weight:600;color:var(--aco-700);margin-top:4px">${esc(b.modelo || 'Veículo')}</div>
                  <div class="mini" style="color:var(--aco-500)">${esc(b.cliente || '')}</div>
                </div>

                <div style="border-top:1px dashed var(--aco-150);padding-top:6px;margin-top:6px" class="entre mini">
                  <span>Mecânico: <b>${esc(b.mecanico || 'Não atribuído')}</b></span>
                  <span>${b.tempoNoBoxHoras ? `${b.tempoNoBoxHoras}h no box` : ''}</span>
                </div>

                ${b.servicoAtual ? `
                  <div class="mini" style="color:var(--aco-600);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    🔧 ${esc(b.servicoAtual)}
                  </div>
                ` : ''}

                ${b.gargaloAtivo ? `
                  <div class="alerta-gargalo-box" style="margin-top:6px;padding:4px 6px;background:#fef2f2;border-radius:4px;color:#991b1b;font-size:11px;font-weight:600">
                    ⚠️ ${esc(b.gargaloAtivo)}
                  </div>
                ` : ''}
              `}

              <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:4px">
                ${!isLivre ? `
                  <button class="btn btn-pequeno btn-secundario" data-act="detalhe-item-op" data-os="${esc(b.osId)}" style="font-size:11px;padding:3px 8px">
                    Detalhes
                  </button>
                  <button class="btn btn-pequeno btn-primario" data-act="abrir-os-op" data-os="${esc(b.osId)}" style="font-size:11px;padding:3px 8px">
                    Abrir OS
                  </button>
                ` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  if (typeof window !== 'undefined') window.renderBoxesOp = renderBoxesOp;
  if (typeof globalThis !== 'undefined') globalThis.renderBoxesOp = renderBoxesOp;
})();

