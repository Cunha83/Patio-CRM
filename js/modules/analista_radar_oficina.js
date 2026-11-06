/* =====================================================================
   PÁTIO CRM — ANALISTA FINANCEIRA: RADAR DE LIBERAÇÃO DE PÁTIO
   Cálculo de Status de Saída, Badges de Portaria e Síntese de Voz
   ===================================================================== */

function falarParecerVeronica(texto) {
  const cleanText = (texto || '').replace(/[#*_`]/g, '');
  if (typeof window !== 'undefined' && typeof window.falarTexto === 'function') {
    window.falarTexto(cleanText, { forcar: true });
  } else if (typeof PatioVoz !== 'undefined' && typeof PatioVoz.falarTexto === 'function') {
    PatioVoz.falarTexto(cleanText, { forcar: true });
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } else {
    alert(texto);
  }
}

function calcularStatusLiberacaoOSFrontend(o) {
  if (!o) return { status: 'retido_pendente', label: '🟡 Retido (Saldo Pendente)', cor: '#854d0e', bg: '#fef9c3', borda: '#fef08a', total: 0, totalPago: 0, saldoRestante: 0, totalFaturadoPrazo: 0, titulosOS: [], liberacaoExcepcional: null };
  const total = Number(o.total || o.valorTotal || (typeof totOS === 'function' ? totOS(o) : 0)) || 0;
  const osId = String(o.id || o.num || '');
  const osNumStr = String(o.num || o.id || '');

  const movs = Array.isArray(S.movimentos) ? S.movimentos : [];
  const movsOS = movs.filter(m => !m.estornado && (
    String(m.osId) === osId || String(m.osNum) === osId || String(m.osId) === osNumStr || (m.desc && m.desc.includes(`OS #${osNumStr}`))
  ));
  const totalPago = movsOS.filter(m => m.tipo === 'entrada' || m.tipo === 'receita').reduce((a, b) => a + (Number(b.valor) || 0), 0);

  const contas = Array.isArray(S.contas) ? S.contas : [];
  const titulosOS = contas.filter(c => c.tipo === 'receber' && (
    String(c.osId) === osId || String(c.osNum) === osId || String(c.osId) === osNumStr || (c.desc && c.desc.includes(`OS #${osNumStr}`))
  ));
  const totalFaturadoPrazo = titulosOS.reduce((a, b) => a + (Number(b.valor) || 0), 0);

  const saldoRestante = Math.max(0, +(total - totalPago).toFixed(2));

  if (total > 0 && saldoRestante <= 0.01) {
    return { status: 'liberado_quitado', label: '🟢 Liberado (Quitado)', cor: '#166534', bg: '#dcfce7', borda: '#bbf7d0', total, totalPago, saldoRestante, totalFaturadoPrazo, titulosOS, liberacaoExcepcional: o.liberacaoExcepcional || null };
  }
  if (totalFaturadoPrazo > 0 && totalFaturadoPrazo >= (saldoRestante - 0.01)) {
    return { status: 'liberado_faturado', label: '🔵 Liberado (Faturado)', cor: '#1e40af', bg: '#dbeafe', borda: '#bfdbfe', total, totalPago, saldoRestante, totalFaturadoPrazo, titulosOS, liberacaoExcepcional: o.liberacaoExcepcional || null };
  }
  if (o.liberacaoExcepcional || o.statusLiberacaoPatio === 'liberado_excepcional') {
    return {
      status: 'liberado_excepcional',
      label: '🟣 Liberado (Exceção Auditada)',
      cor: '#6b21a8',
      bg: '#f3e8ff',
      borda: '#d8b4fe',
      total,
      totalPago,
      saldoRestante,
      totalFaturadoPrazo,
      titulosOS,
      liberacaoExcepcional: o.liberacaoExcepcional || null
    };
  }
  if (o.isRetornoGarantia || o.statusLiberacaoPatio === 'liberado_garantia') {
    return {
      status: 'liberado_garantia',
      label: '🛡️ Liberado (Garantia)',
      cor: '#0e7490',
      bg: '#cffafe',
      borda: '#a5f3fc',
      total,
      totalPago,
      saldoRestante: 0,
      totalFaturadoPrazo,
      titulosOS,
      liberacaoExcepcional: null
    };
  }
  return { status: 'retido_pendente', label: '🟡 Retido (Saldo Pendente)', cor: '#854d0e', bg: '#fef9c3', borda: '#fef08a', total, totalPago, saldoRestante, totalFaturadoPrazo, titulosOS, liberacaoExcepcional: null };
}

function renderBadgeLiberacaoPatio(o) {
  const lib = calcularStatusLiberacaoOSFrontend(o);
  if (lib.total <= 0 && lib.status !== 'liberado_excepcional' && lib.status !== 'liberado_garantia') return '';
  const tooltip = (lib.status === 'liberado_excepcional' && lib.liberacaoExcepcional)
    ? `Liberação Excepcional Auditada: ${typeof esc === 'function' ? esc(lib.liberacaoExcepcional.justificativa || 'Autorizado') : (lib.liberacaoExcepcional.justificativa || 'Autorizado')} (por ${typeof esc === 'function' ? esc(lib.liberacaoExcepcional.autorizadoPor || 'Admin') : (lib.liberacaoExcepcional.autorizadoPor || 'Admin')})`
    : (lib.status === 'liberado_garantia'
      ? `Retorno de Garantia (Isento): OS Origem #${o.osOrigemGarantiaId || 'N/A'}`
      : `Total: ${typeof brl === 'function' ? brl(lib.total) : lib.total} | Pago: ${typeof brl === 'function' ? brl(lib.totalPago) : lib.totalPago} | Saldo: ${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}`);
  return `<span class="selo ${lib.status === 'liberado_garantia' ? 'selo-liberado-garantia' : ''}" style="background:${lib.bg};color:${lib.cor};border:1px solid ${lib.borda};font-size:10px;font-weight:700" title="${tooltip}">${lib.label}</span>`;
}

function radarLiberacaoPatioHtml() {
  const osList = Array.isArray(S.os) ? S.os : [];
  if (!osList.length) {
    return `
      <div style="padding:16px;text-align:center;color:var(--aco-500);background:var(--aco-50);border-radius:8px;margin-top:16px">
        Nenhuma Ordem de Serviço cadastrada no sistema.
      </div>`;
  }

  const dadosOS = osList.map(o => ({
    os: o,
    lib: calcularStatusLiberacaoOSFrontend(o)
  }));

  const quitadas = dadosOS.filter(d => d.lib.status === 'liberado_quitado');
  const faturadas = dadosOS.filter(d => d.lib.status === 'liberado_faturado');
  const excepcionais = dadosOS.filter(d => d.lib.status === 'liberado_excepcional');
  const garantias = dadosOS.filter(d => d.lib.status === 'liberado_garantia');
  const retidas = dadosOS.filter(d => d.lib.status === 'retido_pendente');
  const totalRetido = retidas.reduce((a, b) => a + (b.lib.saldoRestante || 0), 0);

  return `
    <div class="card card-p" style="margin-top:16px">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900)">
            🚗 Radar de Liberação Financeira de Pátio & Faturamento de OS
          </div>
          <div class="mini">Classifica as ordens de serviço quanto à quitação e faturamento formal para autorização de saída dos veículos da oficina.</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-weight:700">🟢 ${quitadas.length} Quitado(s)</span>
          <span class="selo" style="background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;font-weight:700">🔵 ${faturadas.length} Faturado(s)</span>
          <span class="selo" style="background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;font-weight:700">🟣 ${excepcionais.length} Exceção</span>
          ${garantias.length > 0 ? `<span class="selo" style="background:#cffafe;color:#0e7490;border:1px solid #a5f3fc;font-weight:700">🛡️ ${garantias.length} Garantia</span>` : ''}
          <span class="selo" style="background:#fef9c3;color:#854d0e;border:1px solid #fef08a;font-weight:700">🟡 ${retidas.length} Retido(s)</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:rgba(16, 185, 129, 0.06);border:1px solid rgba(16, 185, 129, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:var(--verde)">Liberados à Vista / Quitados</div>
          <div style="font-size:18px;font-weight:800;color:var(--verde)" class="num">${quitadas.length} OS(s)</div>
          <div class="mini">100% recebido no caixa</div>
        </div>
        <div style="background:rgba(37, 99, 235, 0.06);border:1px solid rgba(37, 99, 235, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#1d4ed8">Liberados com Faturamento a Prazo</div>
          <div style="font-size:18px;font-weight:800;color:#1d4ed8" class="num">${faturadas.length} OS(s)</div>
          <div class="mini">Formalizado em títulos a receber</div>
        </div>
        ${excepcionais.length > 0 ? `
        <div style="background:rgba(147, 51, 234, 0.06);border:1px solid rgba(147, 51, 234, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#6b21a8">Liberados por Exceção Auditada</div>
          <div style="font-size:18px;font-weight:800;color:#6b21a8" class="num">${excepcionais.length} OS(s)</div>
          <div class="mini">Autorização excepcional de diretoria</div>
        </div>
        ` : ''}
        ${garantias.length > 0 ? `
        <div style="background:rgba(14, 116, 144, 0.06);border:1px solid rgba(14, 116, 144, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#0e7490">Liberados em Garantia</div>
          <div style="font-size:18px;font-weight:800;color:#0e7490" class="num">${garantias.length} OS(s)</div>
          <div class="mini">Retorno sem custo de portaria</div>
        </div>
        ` : ''}
        <div style="background:rgba(234, 179, 8, 0.08);border:1px solid rgba(234, 179, 8, 0.4);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#a16207">Retidos com Saldo Devedor</div>
          <div style="font-size:18px;font-weight:800;color:#a16207" class="num">${retidas.length} OS(s) (${typeof brl === 'function' ? brl(totalRetido) : totalRetido})</div>
          <div class="mini">Exige quitação, faturamento ou override</div>
        </div>
      </div>

      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>OS / Placa / Cliente</th>
              <th style="text-align:right">Total Orçado</th>
              <th style="text-align:right">Recebido (Caixa)</th>
              <th style="text-align:right">Títulos (Prazo)</th>
              <th style="text-align:right">Saldo Pendente</th>
              <th style="text-align:center">Liberação de Pátio</th>
              <th style="text-align:center">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${dadosOS.slice(0, 15).map(({ os, lib }) => {
              const v = typeof V === 'function' ? V(os.vei) : (os.veiculo || {});
              const c = typeof C === 'function' ? C(os.cli) : (os.cliente || {});
              const podeFaturar = lib.saldoRestante > 0;

              return `
              <tr>
                <td>
                  <div style="font-weight:700;color:var(--aco-900)">OS #${esc(os.num || os.id)} · ${esc(v.placa || 'Sem Placa')}</div>
                  <div class="mini">${esc(c.fantasia || c.nome || 'Cliente Geral')} · ${esc(v.modelo || '')}</div>
                </td>
                <td style="text-align:right;font-weight:700" class="num">${typeof brl === 'function' ? brl(lib.total) : lib.total}</td>
                <td style="text-align:right;color:var(--verde);font-weight:700" class="num">${typeof brl === 'function' ? brl(lib.totalPago) : lib.totalPago}</td>
                <td style="text-align:right;color:#1e40af;font-weight:700" class="num">${typeof brl === 'function' ? brl(lib.totalFaturadoPrazo) : lib.totalFaturadoPrazo}</td>
                <td style="text-align:right;font-weight:800;color:${lib.saldoRestante > 0 ? 'var(--tijolo)' : 'var(--aco-400)'}" class="num">
                  ${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}
                </td>
                <td style="text-align:center">
                  <span class="selo" style="background:${lib.bg};color:${lib.cor};border:1px solid ${lib.borda};font-size:10px;font-weight:700" title="${lib.status === 'liberado_excepcional' && lib.liberacaoExcepcional ? `Liberação Excepcional: ${esc(lib.liberacaoExcepcional.justificativa || '')} (por ${esc(lib.liberacaoExcepcional.autorizadoPor || '')})` : ''}">
                    ${lib.label}
                  </span>
                </td>
                <td style="text-align:center;white-space:nowrap">
                  <div style="display:inline-flex;gap:4px;align-items:center;justify-content:center">
                    ${podeFaturar ? `
                      <button class="btn btn-primario btn-pequeno"
                              onclick="abrirFolha(() => folhaFaturarOS('${os.id || os.num}'))"
                              style="font-size:11px;padding:3px 8px;white-space:nowrap"
                              title="Faturar saldo a prazo em Contas a Receber">
                        📄 Faturar
                      </button>
                    ` : ''}
                    ${lib.status === 'retido_pendente' ? `
                      <button class="btn btn-secundario btn-pequeno"
                              onclick="abrirFolha(() => folhaLiberarSaidaExcepcional('${os.id || os.num}'))"
                              style="font-size:11px;padding:3px 8px;white-space:nowrap;color:#6b21a8;border-color:#d8b4fe"
                              title="Autorizar liberação excepcional de pátio com justificativa auditada (apenas Dono/Admin)">
                        🔓 Liberar c/ Justificativa
                      </button>
                    ` : ''}
                    ${lib.saldoRestante > 0 ? `
                      <button class="btn btn-secundario btn-pequeno"
                              onclick="copiarAvisoCobranca('${os.id || os.num}')"
                              style="font-size:11px;padding:3px 8px;white-space:nowrap"
                              title="Copiar mensagem amigável de cobrança para WhatsApp">
                        📲 Copiar Aviso
                      </button>
                    ` : (lib.status !== 'retido_pendente' ? `
                      <span class="mini" style="color:var(--verde);font-weight:600">✓ Liberada</span>
                    ` : '')}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

if (typeof window !== 'undefined') {
  window.falarParecerVeronica = falarParecerVeronica;
  window.calcularStatusLiberacaoOSFrontend = calcularStatusLiberacaoOSFrontend;
  window.renderBadgeLiberacaoPatio = renderBadgeLiberacaoPatio;
  window.radarLiberacaoPatioHtml = radarLiberacaoPatioHtml;
}

