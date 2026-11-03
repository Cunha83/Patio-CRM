/* =====================================================================
   PÁTIO CRM — FLUXO DE CAIXA, CONCILIAÇÃO BANCÁRIA & LANÇAMENTOS
===================================================================== */

function formatarHoraSimples(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(11, 16);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(iso).slice(11, 16);
  }
}

function renderBadgeMeioPagamento(forma = 'dinheiro') {
  const f = String(forma || '').toLowerCase().trim();
  let rotulo = 'Dinheiro', icone = '💵';
  let estilo = 'background:#f1f5f9;color:#334155;border:1px solid #cbd5e1';

  if (f.includes('pix')) {
    rotulo = 'Pix'; icone = '⚡';
    estilo = 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0';
  } else if (f.includes('credito') || f.includes('crédito')) {
    rotulo = 'Cartão Crédito'; icone = '💳';
    estilo = 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe';
  } else if (f.includes('debito') || f.includes('débito')) {
    rotulo = 'Cartão Débito'; icone = '💳';
    estilo = 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0';
  } else if (f.includes('cartao') || f.includes('cartão')) {
    rotulo = 'Cartão'; icone = '💳';
    estilo = 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe';
  } else if (f.includes('boleto')) {
    rotulo = 'Boleto'; icone = '📄';
    estilo = 'background:#fffbeb;color:#b45309;border:1px solid #fde68a';
  } else if (f.includes('transferencia') || f.includes('transferência') || f.includes('ted') || f.includes('doc')) {
    rotulo = 'Transferência'; icone = '🏦';
    estilo = 'background:#faf5ff;color:#7e22ce;border:1px solid #e9d5ff';
  }

  return `<span class="selo" style="${estilo};font-size:10px;padding:2px 7px;font-weight:600">${icone} ${rotulo}</span>`;
}

function blocoFluxoCaixa() {
  const filtroOrigem = (S.ui && S.ui.filtroOrigemMov) || 'todos';
  const filtroMeio = (S.ui && S.ui.filtroMeioPagamentoMov) || 'todos';
  const todosMovs = (S.movimentos || []).slice().reverse();

  const movsFiltrados = todosMovs.filter(m => {
    if (filtroOrigem === 'whatsapp' && m.origem !== 'whatsapp') return false;
    if (filtroOrigem === 'web' && (m.origem || 'web') === 'whatsapp') return false;
    if (filtroOrigem === 'estornados' && !m.estornado) return false;

    if (filtroMeio !== 'todos') {
      const f = String(m.forma || m.formaPagamento || '').toLowerCase();
      if (filtroMeio === 'pix' && !f.includes('pix')) return false;
      if (filtroMeio === 'dinheiro' && !f.includes('dinheiro')) return false;
      if (filtroMeio === 'cartao' && !f.includes('cartao') && !f.includes('cartão') && !f.includes('credito') && !f.includes('debito')) return false;
      if (filtroMeio === 'boleto' && !f.includes('boleto')) return false;
    }
    return true;
  });

  const qtdWhatsapp = todosMovs.filter(m => m.origem === 'whatsapp').length;
  const qtdWeb = todosMovs.filter(m => (m.origem || 'web') !== 'whatsapp').length;
  const qtdEstornados = todosMovs.filter(m => Boolean(m.estornado)).length;

  const filtrosOrigem = [
    ['todos', `Todas as Origens (${todosMovs.length})`],
    ['whatsapp', `📱 WhatsApp (${qtdWhatsapp})`],
    ['web', `💻 Painel Web (${qtdWeb})`],
    ['estornados', `⚠️ Estornados (${qtdEstornados})`]
  ];

  const filtrosMeio = [
    ['todos', 'Todos os Meios'],
    ['pix', '⚡ PIX'],
    ['dinheiro', '💵 Dinheiro'],
    ['cartao', '💳 Cartão'],
    ['boleto', '📄 Boleto']
  ];

  return `
  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div>
      <div style="font-weight:700;font-size:15px">Extrato e Movimentação de Caixa</div>
      <div class="mini">Saldo Atual: <b style="color:var(--verde)">${brl(saldoCaixa())}</b></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secundario" data-act="exportar-csv-financeiro" style="font-size:13px;padding:6px 14px" title="Exportar movimentações em CSV auditado com assinatura SHA-256">📥 Exportar CSV Auditado</button>
      <button class="btn btn-secundario" onclick="abrirBoletimFechamentoModal()" style="font-size:13px;padding:6px 14px">📜 Boletim de Fechamento</button>
      <button class="btn btn-primario" data-act="novo-mov" style="font-size:13px;padding:6px 14px">${ico('mais', 14)} Lançar Movimento Avulso</button>
    </div>
  </div>

  <!-- Barra de Filtros Rápidos (Origem e Meio de Pagamento) -->
  <div class="card card-p" style="margin-bottom:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--aco-050);border:1px solid var(--aco-200)">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="mini" style="font-weight:700;color:var(--aco-700);min-width:90px">Canal / Origem:</span>
      <div class="grupo-chips-filtro" style="display:inline-flex;gap:6px;flex-wrap:wrap">
        ${filtrosOrigem.map(([k, label]) => `<button class="chip-filtro ${filtroOrigem === k ? 'ativo' : ''}" data-act="filtro-origem-mov" data-o="${k}" style="font-size:11.5px;padding:4px 10px;cursor:pointer">${label}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="mini" style="font-weight:700;color:var(--aco-700);min-width:90px">Meio de Pgto:</span>
      <div class="grupo-chips-filtro" style="display:inline-flex;gap:6px;flex-wrap:wrap">
        ${filtrosMeio.map(([k, label]) => `<button class="chip-filtro ${filtroMeio === k ? 'ativo' : ''}" data-act="filtro-meio-mov" data-m="${k}" style="font-size:11.5px;padding:4px 10px;cursor:pointer">${label}</button>`).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:95px">Data</th>
            <th>Descrição do Lançamento</th>
            <th style="width:135px">Origem / Canal</th>
            <th>Categoria</th>
            <th>Meio de Pgto</th>
            <th style="width:125px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status / Ação</th>
          </tr>
        </thead>
        <tbody>
          ${movsFiltrados.length ? movsFiltrados.map(m => {
            const isEntrada = m.tipo === 'entrada' || m.tipo === 'receita';
            const isEstornado = Boolean(m.estornado);
            const isCompensatorio = Boolean(m.estornoDeId || m.subtipo === 'estorno');
            const podeEstornar = !isEstornado && !isCompensatorio;
            const rowStyle = isEstornado ? 'opacity:0.65;background:rgba(239, 68, 68, 0.04);' : isCompensatorio ? 'background:rgba(245, 158, 11, 0.04);' : '';

            return `
            <tr style="${rowStyle}">
              <td class="mono">${dataBRfull(m.data)}</td>
              <td>
                <div style="${isEstornado ? 'text-decoration:line-through;color:var(--aco-600)' : 'font-weight:700'}">${esc(m.desc || m.descricao || 'Movimento')}</div>
                ${(m.osId || m.placa) ? `
                  <div style="display:flex;gap:6px;margin-top:3px;align-items:center;flex-wrap:wrap">
                    ${m.osId ? `<span class="selo" style="background:#e0e7ff;color:#3730a3;font-size:10px;padding:1px 6px">OS #${esc(m.osId)}</span>` : ''}
                    ${m.placa ? `<span class="selo mono" style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 6px">🚗 ${esc(m.placa)}</span>` : ''}
                  </div>
                ` : ''}
                ${isEstornado ? `<div class="mini" style="color:var(--tijolo);font-weight:700;margin-top:2px">⚠️ ESTORNADO: ${esc(m.motivoEstorno || 'Estornado')} ${m.estornadoPor ? `· por ${esc(m.estornadoPor)}` : ''}</div>` : ''}
                ${isCompensatorio ? `<div class="mini" style="color:#d97706;font-weight:600;margin-top:2px">↩️ Lançamento Compensatório de Estorno</div>` : ''}
              </td>
              <td>
                ${m.origem === 'whatsapp' ? `
                  <div>
                    <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-size:10.5px;font-weight:700">📱 WhatsApp</span>
                    ${m.autorNumero ? `<div class="mini mono" style="font-size:10px;color:var(--aco-600);margin-top:2px" title="Número autor: ${esc(m.autorNumero)}">📞 ${esc(m.autorNumero)}</div>` : ''}
                    ${m.confirmadoEm ? `<div class="mini" style="font-size:9.5px;color:var(--aco-400)">✓ ${formatarHoraSimples(m.confirmadoEm)}</div>` : ''}
                  </div>
                ` : `<div><span class="selo" style="background:var(--aco-100);color:var(--aco-700);font-size:10.5px">💻 Painel Web</span></div>`}
              </td>
              <td>
                ${(m.naturezaOperacao === 'sangria' || m.subtipo === 'sangria') ? `<span class="selo" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:10px;font-weight:700;margin-right:4px">🏦 Sangria</span>` : ''}
                ${(m.naturezaOperacao === 'suprimento' || m.subtipo === 'suprimento') ? `<span class="selo" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;font-size:10px;font-weight:700;margin-right:4px">🪙 Suprimento</span>` : ''}
                <span class="selo">${esc(m.cat || m.categoria || 'Geral')}</span>
              </td>
              <td>${renderBadgeMeioPagamento(m.forma || m.formaPagamento)}</td>
              <td style="text-align:right;font-weight:700;color:${isEstornado ? 'var(--aco-500)' : isEntrada ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                <span style="${isEstornado ? 'text-decoration:line-through' : ''}">${isEntrada ? '+' : '−'} ${brl(m.valor)}</span>
              </td>
              <td style="text-align:center">
                <div><span class="selo ${isEstornado ? 'selo-alerta' : isCompensatorio ? 'selo-aviso' : m.conc ? 'selo-finalizada' : 'selo-fila'}" style="font-size:10px">${isEstornado ? 'Estornado' : isCompensatorio ? 'Compensação' : m.conc ? 'Conciliado' : 'Manual'}</span></div>
                ${podeEstornar ? `
                  <button class="btn btn-secundario btn-pequeno"
                          data-act="estornar-mov"
                          data-id="${m.id}"
                          onclick="solicitarEstornoMovimento('${m.id}')"
                          title="Estornar contabilmente esta movimentação"
                          style="font-size:10.5px;padding:2px 8px;margin-top:4px;color:var(--tijolo);border-color:rgba(239, 68, 68, 0.4)">
                    ↩️ Estornar
                  </button>
                ` : ''}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="7" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma movimentação de caixa encontrada para o filtro selecionado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function blocoBanco() {
  const extrato = S.extrato || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Conciliação Bancária com Extrato OFX / CSV</div>
      <div class="mini">Importe o arquivo do seu banco para cruzar lançamentos automaticamente</div>
    </div>
    <div style="display:flex;gap:8px">
      ${extrato.length ? `<button class="btn btn-secundario" data-act="limpar-extrato">Limpar Extrato</button>` : ''}
      <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px">
        ${ico('upload', 14)} Importar Arquivo OFX/CSV
        <input type="file" accept=".ofx,.csv,.txt" data-act="arquivo-extrato" multiple style="display:none">
      </label>
    </div>
  </div>

  <div class="card card-p">
    ${extrato.length ? `
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr><th>Data</th><th>Descrição no Extrato</th><th style="width:120px;text-align:right">Valor</th><th style="width:180px;text-align:center">Ação</th></tr>
          </thead>
          <tbody>
            ${extrato.map(l => `
              <tr style="${l.ok ? 'opacity:0.5' : ''}">
                <td class="mono">${dataBR(l.data)}</td>
                <td><b>${esc(l.desc)}</b></td>
                <td style="text-align:right;font-weight:700;color:${l.valor >= 0 ? 'var(--verde)' : 'var(--tijolo)'}" class="num">${brl(l.valor)}</td>
                <td style="text-align:center">
                  ${l.ok ? `<span class="selo selo-finalizada">Conciliado</span>` : `
                    <button class="btn btn-secundario" data-act="conciliar-avulso" data-id="${l.id}" style="font-size:12px;padding:4px 8px">
                      Lançar no Caixa
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div style="text-align:center;padding:40px;color:var(--aco-400)">
        <div style="margin-bottom:10px">${ico('fin', 32)}</div>
        <b>Nenhum extrato importado</b><br>
        Envie o arquivo OFX exportado pelo Internet Banking da oficina para conciliar saldos.
      </div>
    `}
  </div>`;
}

function folhaMov() {
  const r = S.ui.rascMov = S.ui.rascMov || { data: hoje(), tipo: 'entrada', valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançamento Avulso no Caixa</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Movimento:</label>
          <select class="campo-select" data-act="rmv" data-c="tipo" style="width:100%;height:34px;font-weight:600">
            <option value="entrada" ${r.tipo === 'entrada' ? 'selected' : ''}>Entrada (+) Receita</option>
            <option value="saida" ${r.tipo === 'saida' ? 'selected' : ''}>Saída (−) Despesa</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data:</label>
          <input type="date" class="campo-texto" data-act="rmv" data-c="data" value="${r.data || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Lançamento:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Pagamento de Frete / Compra de Material de Limpeza" data-act="rmv" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Categoria / Centro de Custo:</label>
          <select class="campo-select" data-act="rmv" data-c="cat" style="width:100%;height:34px">
            ${typeof renderOptionsPlanoDeContas === 'function' ? renderOptionsPlanoDeContas(r.cat, r.tipo === 'entrada' ? 'receita' : 'despesa') : `<option value="${esc(r.cat || 'Geral')}">${esc(r.cat || 'Geral')}</option>`}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rmv" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-mov" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Salvar Movimento
      </button>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.formatarHoraSimples = formatarHoraSimples;
  window.renderBadgeMeioPagamento = renderBadgeMeioPagamento;
  window.blocoFluxoCaixa = blocoFluxoCaixa;
  window.blocoBanco = blocoBanco;
  window.folhaMov = folhaMov;
}
if (typeof globalThis !== 'undefined') {
  globalThis.formatarHoraSimples = formatarHoraSimples;
  globalThis.renderBadgeMeioPagamento = renderBadgeMeioPagamento;
  globalThis.blocoFluxoCaixa = blocoFluxoCaixa;
  globalThis.blocoBanco = blocoBanco;
  globalThis.folhaMov = folhaMov;
}
