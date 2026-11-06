/* =====================================================================
   PÁTIO CRM — RADAR OPERACIONAL DE BOXES E GARGALOS DE PÁTIO
   Submódulo extraído de js/modules/patio_render.js (< 350 linhas)
   ===================================================================== */

function radarGargalosPatioHtml() {
  const osLista = (typeof S !== 'undefined' && Array.isArray(S.os)) ? S.os : [];
  const boxes = (typeof S !== 'undefined' && Array.isArray(S.boxes)) ? S.boxes : [];
  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || ''));

  const ocupadosSet = new Set();
  const bloqueadosPecaSet = new Set();

  osLista.forEach(o => {
    const bId = o.box || o.boxId;
    if (bId && o.st !== 'finalizada') {
      ocupadosSet.add(bId);
      if (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca') {
        bloqueadosPecaSet.add(bId);
      }
    }
  });

  const totalBoxes = boxes.length;
  const bloqueadosPeca = bloqueadosPecaSet.size;
  const ocupadosExec = ocupadosSet.size - bloqueadosPeca;
  const livres = Math.max(0, totalBoxes - ocupadosSet.size);

  const osGargalos = osLista.filter(o => o.st !== 'finalizada' && (o.etapaPatio === 'pausado_gargalo' || o.st === 'peca'));
  const osProntasRetidas = osLista.filter(o => (o.etapaPatio === 'pronto_retirada' || o.st === 'finalizada') && o.statusLiberacaoPatio === 'retido_pendente');

  return `
  <div class="card card-p" style="margin-bottom:14px;background:#f8fafc;border:1px solid var(--aco-200)">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:8px;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">🚦</span>
        <span style="font-weight:700;font-size:14px;color:var(--aco-900)">Radar Operacional de Boxes & Gargalos de Pátio</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="selo" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-weight:700">Total: ${totalBoxes} boxes</span>
        <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-weight:700">🟢 ${livres} Livre(s)</span>
        <span class="selo" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;font-weight:700">⚙️ ${ocupadosExec} Em Execução</span>
        <span class="selo" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-weight:700">⏸️ ${bloqueadosPeca} Bloqueado(s) Peça</span>
      </div>
    </div>
    ${(osGargalos.length > 0 || osProntasRetidas.length > 0) ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:10px">
        ${osGargalos.length > 0 ? `
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;padding:8px 12px">
            <div style="font-weight:700;font-size:12px;color:#9f1239;margin-bottom:4px">⚠️ Gargalos de Peça (${osGargalos.length})</div>
            <div class="mini" style="color:#881337">
              ${osGargalos.slice(0, 3).map(o => `OS #${o.num || o.id} (${safeEsc(o.motivoPausa || 'Aguardando Peças')})`).join(' · ')}
              ${osGargalos.length > 3 ? ` e mais ${osGargalos.length - 3}...` : ''}
            </div>
          </div>
        ` : ''}
        ${osProntasRetidas.length > 0 ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px">
            <div style="font-weight:700;font-size:12px;color:#92400e;margin-bottom:4px">🟡 Mecânica Pronta / Retida no Financeiro (${osProntasRetidas.length})</div>
            <div class="mini" style="color:#78350f">
              ${osProntasRetidas.slice(0, 3).map(o => `OS #${o.num || o.id}`).join(' · ')}
              ${osProntasRetidas.length > 3 ? ` e mais ${osProntasRetidas.length - 3}...` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    ` : `
      <div class="mini" style="color:var(--aco-600)">✅ Fluxo operacional equilibrado: nenhum gargalo crítico detectado nos boxes ativos.</div>
    `}
  </div>`;
}

if (typeof window !== 'undefined') window.radarGargalosPatioHtml = radarGargalosPatioHtml;
if (typeof globalThis !== 'undefined') globalThis.radarGargalosPatioHtml = radarGargalosPatioHtml;

