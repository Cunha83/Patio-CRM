/* =====================================================================
   PÁTIO CRM — UI DE CONJUNTOS ARTICULADOS (LINHA PESADA)
   Submódulo para Check-in, Triagem e Apontamento (Cavalo + Carreta)
   Arquitetura Modular (< 200 linhas).
   ===================================================================== */

/**
 * Verifica se uma Ordem de Serviço ou veículo é do tipo conjunto articulado
 * @param {Object} os
 * @returns {boolean}
 */
function isOSArticulada(os) {
  if (!os) return false;
  return os.tipoEntrada === 'articulado' ||
         os.veiculo?.tipo === 'articulado' ||
         Boolean(os.conjuntoArticulado) ||
         (Array.isArray(os.servicos) && os.servicos.some(s => s.alvo === 'carreta')) ||
         (Array.isArray(os.pecas) && os.pecas.some(p => p.alvo === 'carreta'));
}

/**
 * Renderiza o seletor de tipo de entrada (Individual vs Articulado) na folha de Nova OS
 * @param {Object} rasc Rascunho da nova OS (S.ui.rascunho)
 * @returns {string} HTML
 */
function renderSeletorArticuladoHtml(rasc = {}) {
  const isArticulado = rasc.tipoEntrada === 'articulado';
  const fnEsc = typeof esc === 'function' ? esc : (x => String(x || ''));

  return `
  <div style="border:1px solid var(--aco-200);border-radius:8px;padding:10px 12px;background:var(--aco-50);margin-bottom:12px">
    <label style="font-weight:700;display:block;margin-bottom:6px;font-size:12.5px;color:var(--aco-800)">
      Tipo de Entrada / Composição:
    </label>
    <div style="display:flex;gap:8px;margin-bottom:${isArticulado ? '10px' : '0'}">
      <button type="button" class="btn ${!isArticulado ? 'btn-primario' : 'btn-secundario'}" 
              data-act="toggle-tipo-entrada" data-tipo="simples" 
              style="flex:1;font-size:12px;padding:6px 10px;font-weight:600">
        🚛 Veículo Individual
      </button>
      <button type="button" class="btn ${isArticulado ? 'btn-primario' : 'btn-secundario'}" 
              data-act="toggle-tipo-entrada" data-tipo="articulado" 
              style="flex:1;font-size:12px;padding:6px 10px;font-weight:600">
        🚜 Conjunto Articulado (Cavalo + Carreta)
      </button>
    </div>

    ${isArticulado ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:8px;border-top:1px dashed var(--aco-200)">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:3px;font-size:12px">
            Placa da Carreta / Semirreboque:
          </label>
          <input type="text" class="campo-texto" placeholder="Ex: CAR1A22" 
                 data-act="rasc" data-c="carretaPlaca" 
                 value="${fnEsc(rasc.carretaPlaca || '')}" 
                 style="width:100%;height:32px;text-transform:uppercase;font-family:var(--mono);font-size:12.5px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:3px;font-size:12px">
            Modelo / Tipo da Carreta:
          </label>
          <input type="text" class="campo-texto" placeholder="Ex: Randon Graneleiro 3 Eixos" 
                 data-act="rasc" data-c="carretaModelo" 
                 value="${fnEsc(rasc.carretaModelo || '')}" 
                 style="width:100%;height:32px;font-size:12.5px">
        </div>
      </div>
    ` : ''}
  </div>`;
}

/**
 * Renderiza o seletor/badge de alvo (Cavalo vs Carreta) para um item de serviço ou peça na OS
 * @param {Object} item
 * @param {string} tipo 'servicos' | 'pecas'
 * @param {Object} os
 * @returns {string} HTML
 */
function renderAlvoItemBadge(item, tipo, os) {
  if (!isOSArticulada(os)) return '';

  const alvoAtual = item.alvo === 'carreta' ? 'carreta' : 'cavalo';

  return `
  <div style="display:inline-flex;align-items:center;margin-left:6px">
    <select class="campo-select" data-act="mudar-alvo-item" data-t="${tipo}" data-i="${item.id}"
            style="height:22px;font-size:11px;padding:1px 4px;border-radius:4px;font-weight:600;background:${alvoAtual === 'carreta' ? '#fef3c7;color:#92400e;border-color:#fde68a' : '#e0e7ff;color:#3730a3;border-color:#c7d2fe'}">
      <option value="cavalo" ${alvoAtual === 'cavalo' ? 'selected' : ''}>🚛 Cavalo</option>
      <option value="carreta" ${alvoAtual === 'carreta' ? 'selected' : ''}>🚜 Carreta</option>
    </select>
  </div>`;
}

/**
 * Renderiza o card com subtotais segregados do conjunto articulado (Cavalo vs Carreta)
 * @param {Object} os
 * @returns {string} HTML
 */
function renderSubtotaisArticuladoOS(os) {
  if (!isOSArticulada(os)) return '';

  const servicos = Array.isArray(os.servicos) ? os.servicos : [];
  const pecas = Array.isArray(os.pecas) ? os.pecas : [];
  const fnBrl = typeof brl === 'function' ? brl : (n => `R$ ${Number(n || 0).toFixed(2)}`);

  let mobCavalo = 0;
  let mobCarreta = 0;
  servicos.forEach(s => {
    const v = Number(s.valor || s.preco || 0) * (s.qtd || 1);
    if (s.alvo === 'carreta') mobCarreta += v;
    else mobCavalo += v;
  });

  let pecCavalo = 0;
  let pecCarreta = 0;
  pecas.forEach(p => {
    const v = Number(p.valor || p.preco || p.total || 0) * (p.qtd || 1);
    if (p.alvo === 'carreta') pecCarreta += v;
    else pecCavalo += v;
  });

  const totCavalo = mobCavalo + pecCavalo;
  const totCarreta = mobCarreta + pecCarreta;

  return `
  <div class="card card-p" style="margin-bottom:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px">
    <div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:8px;display:flex;align-items:center;gap:6px">
      <span>🚛</span> <b>Discriminação do Conjunto Articulado</b>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px">
        <div class="mini" style="font-weight:700;color:#3730a3">🚛 Cavalo Mecânico</div>
        <div style="font-size:15px;font-weight:800;color:#1e1b4b" class="num">${fnBrl(totCavalo)}</div>
        <div class="mini" style="color:#64748b">Mão de obra: ${fnBrl(mobCavalo)} | Peças: ${fnBrl(pecCavalo)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px">
        <div class="mini" style="font-weight:700;color:#92400e">🚜 Semirreboque / Carreta</div>
        <div style="font-size:15px;font-weight:800;color:#451a03" class="num">${fnBrl(totCarreta)}</div>
        <div class="mini" style="color:#64748b">Mão de obra: ${fnBrl(mobCarreta)} | Peças: ${fnBrl(pecCarreta)}</div>
      </div>
    </div>
  </div>`;
}

// Binds no escopo global
const exportsArticulado = {
  isOSArticulada,
  renderSeletorArticuladoHtml,
  renderAlvoItemBadge,
  renderSubtotaisArticuladoOS
};
if (typeof window !== 'undefined') Object.assign(window, exportsArticulado);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsArticulado);

