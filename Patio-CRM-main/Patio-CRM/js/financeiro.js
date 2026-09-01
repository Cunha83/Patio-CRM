/* =====================================================================
   PÁTIO CRM — MÓDULO FINANCEIRO COMPLETO (CONTAS, FLUXO, DRE & BANCO)
===================================================================== */

function viewFinanceiro() {
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const vencidasR = rec.filter(c => c.venc < hoje());
  const vencidasP = pag.filter(c => c.venc < hoje());
  const mes = mesRef(hoje());
  const entradaMes = soma(S.movimentos.filter(m => m.tipo === 'entrada' && mesRef(m.data) === mes), m => m.valor);
  const saidaMes = soma(S.movimentos.filter(m => m.tipo === 'saida' && mesRef(m.data) === mes), m => m.valor);
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const abas = [
    ['dashboard', 'Dashboard'],
    ['receber', 'A Receber (' + rec.length + ')'],
    ['pagar', 'A Pagar (' + pag.length + ')'],
    ['caixa', 'Fluxo de Caixa'],
    ['dre', 'DRE Gerencial'],
    ['banco', 'Conciliação Bancária']
  ];
  const a = S.ui.abaFin || 'dashboard';

  let corpo = '';
  if (a === 'dashboard') corpo = blocoDashboardFin();
  else if (a === 'receber') corpo = blocoContasReceber();
  else if (a === 'pagar') corpo = blocoContasPagar();
  else if (a === 'caixa') corpo = blocoFluxoCaixa();
  else if (a === 'dre') corpo = blocoDRE();
  else corpo = blocoBanco();

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Saldo atual consolidado</div>
    </div>
    <div class="kpi ${vencidasR.length ? 'alerta' : 'neutro'}">
      <div class="r">${ico('doc', 14)} Total A Receber</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} títulos${vencidasR.length ? ' · <b style="color:var(--tijolo)">' + vencidasR.length + ' vencidos</b>' : ''}</div>
    </div>
    <div class="kpi ${vencidasP.length ? 'alerta' : 'aviso'}">
      <div class="r">${ico('caixa', 14)} Total A Pagar</div>
      <div class="v">${brlCurto(totalPag)}</div>
      <div class="d">${pag.length} contas${vencidasP.length ? ' · <b style="color:var(--tijolo)">' + vencidasP.length + ' vencidas</b>' : ''}</div>
    </div>
    <div class="kpi ${entradaMes - saidaMes >= 0 ? 'bom' : 'alerta'}">
      <div class="r">${ico('relatorios', 14)} Resultado do Mês</div>
      <div class="v">${brlCurto(entradaMes - saidaMes)}</div>
      <div class="d">Entradas: ${brlCurto(entradaMes)} | Saídas: ${brlCurto(saidaMes)}</div>
    </div>
  </div>

  <div class="abas" style="margin-bottom:14px">
    ${abas.map(([k, r]) => `<button data-act="aba-fin" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
  </div>

  ${corpo}`;
}

/* ===== DASHBOARD FINANCEIRO ===== */
function blocoDashboardFin() {
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const totalRec = soma(rec, c => c.valor), totalPag = soma(pag, c => c.valor);
  const vencidasR = rec.filter(c => c.venc < hoje()), vencidasP = pag.filter(c => c.venc < hoje());
  const previsto = saldoCaixa() + totalRec - totalPag;
  const aging = agingReceber();
  const catPagar = categorizarContas('pagar');

  return `
  <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Saldo Projetado (30 Dias)</div>
      <div class="num" style="font-size:26px;font-weight:700;margin-top:6px;color:${previsto >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(previsto)}</div>
      <div class="mini" style="margin-top:4px">Caixa + A Receber − A Pagar</div>
    </div>
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Total Inadimplente</div>
      <div class="num" style="font-size:26px;font-weight:700;margin-top:6px;color:var(--tijolo)">${brl(soma(vencidasR, c => c.valor))}</div>
      <div class="mini" style="margin-top:4px">${vencidasR.length} títulos vencidos aguardando cobrança</div>
    </div>
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">A Pagar em Atraso</div>
      <div class="num" style="font-size:26px;font-weight:700;margin-top:6px;color:var(--sinal)">${brl(soma(vencidasP, c => c.valor))}</div>
      <div class="mini" style="margin-top:4px">${vencidasP.length} contas vencidas</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">Aging de Contas a Receber (Vencimentos)</div>
      <div class="mini" style="margin-bottom:12px">Distribuição dos títulos a receber por prazo</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="entre" style="font-size:13px">
          <span style="color:var(--tijolo);font-weight:600">Vencidas / Em Atraso:</span>
          <b class="num" style="color:var(--tijolo)">${brl(aging.vencido)}</b>
        </div>
        <div class="entre" style="font-size:13px">
          <span>A Vencer (Próximos 7 dias):</span>
          <b class="num">${brl(aging.ate7d)}</b>
        </div>
        <div class="entre" style="font-size:13px">
          <span>A Vencer (8 a 30 dias):</span>
          <b class="num">${brl(aging.ate30d)}</b>
        </div>
        <div class="entre" style="font-size:13px">
          <span>A Vencer (> 30 dias):</span>
          <b class="num">${brl(aging.mais30d)}</b>
        </div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">Categorias de Despesas A Pagar</div>
      <div class="mini" style="margin-bottom:12px">Compromissos agrupados por centro de custo</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${catPagar.map(c => `
          <div class="entre" style="font-size:13px">
            <span>${esc(c.cat)}:</span>
            <b class="num">${brl(c.total)}</b>
          </div>
        `).join('')}
      </div>
    </div>
  </div>`;
}

function agingReceber() {
  const dH = hoje();
  const rec = emAberto('receber');
  let vencido = 0, ate7d = 0, ate30d = 0, mais30d = 0;

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    if (diff < 0) vencido += c.valor;
    else if (diff <= 7) ate7d += c.valor;
    else if (diff <= 30) ate30d += c.valor;
    else mais30d += c.valor;
  });

  return { vencido, ate7d, ate30d, mais30d };
}

function categorizarContas(tipo) {
  const contas = emAberto(tipo);
  const mapa = {};
  contas.forEach(c => {
    const cat = c.cat || 'Outros';
    mapa[cat] = (mapa[cat] || 0) + c.valor;
  });
  return Object.entries(mapa).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

/* ===== CONTAS A RECEBER ===== */
function blocoContasReceber() {
  const contas = S.contas.filter(c => c.tipo === 'receber');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Títulos a Receber (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="receber" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Novo Título
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Cliente / Sacado</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:160px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;
            const venceHoje = !c.pago && c.venc === dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Serviços')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Recebido (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo selo-peca" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : venceHoje ? `
                  <span class="selo selo-aprovacao">Vence Hoje</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  ${!c.pago ? `
                    <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Dar Baixa / Receber">
                      ${ico('check', 12)} Receber
                    </button>
                    <button class="btn btn-secundario" data-act="cobrar-titulo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Cobrar no WhatsApp">
                      ${ico('zap', 12)}
                    </button>
                  ` : `
                    <button class="btn btn-secundario" data-act="imprimir-recibo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Imprimir Recibo">
                      ${ico('imprimir', 12)} Recibo
                    </button>
                  `}
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum título a receber registrado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== CONTAS A PAGAR ===== */
function blocoContasPagar() {
  const contas = S.contas.filter(c => c.tipo === 'pagar');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Contas a Pagar (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="pagar" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Nova Conta
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Fornecedor / Favorecido</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Geral')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Pago (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                ${!c.pago ? `
                  <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 10px;font-size:12px">
                    ${ico('check', 12)} Baixar Pagamento
                  </button>
                ` : `
                  <span class="mini" style="color:var(--verde)">Quitado</span>
                `}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma conta a pagar cadastrada.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== FLUXO DE CAIXA ===== */
function blocoFluxoCaixa() {
  const movs = (S.movimentos || []).slice().reverse();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Extrato e Movimentação de Caixa</div>
      <div class="mini">Saldo Atual: <b style="color:var(--verde)">${brl(saldoCaixa())}</b></div>
    </div>
    <button class="btn btn-primario" data-act="novo-mov" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Movimento Avulso
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:100px">Data</th>
            <th>Descrição do Lançamento</th>
            <th>Categoria</th>
            <th>Forma</th>
            <th style="width:130px;text-align:right">Valor</th>
            <th style="width:80px;text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${movs.length ? movs.map(m => {
            const isEntrada = m.tipo === 'entrada';
            return `
            <tr>
              <td class="mono">${dataBRfull(m.data)}</td>
              <td><b>${esc(m.desc)}</b></td>
              <td><span class="selo">${esc(m.cat || 'Geral')}</span></td>
              <td class="mini">${esc(m.forma || 'Pix/Conta')}</td>
              <td style="text-align:right;font-weight:700;color:${isEntrada ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                ${isEntrada ? '+' : '−'} ${brl(m.valor)}
              </td>
              <td style="text-align:center">
                <span class="selo ${m.conc ? 'selo-finalizada' : 'selo-fila'}" style="font-size:10px">
                  ${m.conc ? 'Conciliado' : 'Manual'}
                </span>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma movimentação de caixa recente.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== DRE GERENCIAL SIMPLIFICADO ===== */
function blocoDRE() {
  const mes = mesRef(hoje());
  const movsMes = S.movimentos.filter(m => mesRef(m.data) === mes);
  const recMes = soma(movsMes.filter(m => m.tipo === 'entrada'), m => m.valor);
  const despesasPecas = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Fornecedores Peças'), m => m.valor);
  const despesasPessoal = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Pessoal & Salários'), m => m.valor);
  const despesasFixas = soma(movsMes.filter(m => m.tipo === 'saida' && ['Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const outrasDesp = soma(movsMes.filter(m => m.tipo === 'saida' && !['Fornecedores Peças', 'Pessoal & Salários', 'Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const totalDesp = despesasPecas + despesasPessoal + despesasFixas + outrasDesp;
  const lucroLiq = recMes - totalDesp;
  const margemLiq = recMes > 0 ? ((lucroLiq / recMes) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:2px solid var(--aco-900);padding-bottom:10px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700">DRE — Demonstrativo de Resultado Gerencial</h3>
        <div class="mini">Competência: <b>Mês Atual (${dataBR(hoje())})</b></div>
      </div>
      <div class="num" style="font-size:22px;font-weight:700;color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(lucroLiq)} <span style="font-size:13px">(${margemLiq}%)</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px">
      <div class="entre" style="font-weight:700;font-size:14.5px;color:var(--aco-900);background:var(--aco-050);padding:8px">
        <span>(+) RECEITA BRUTA OPERACIONAL</span>
        <span class="num">${brl(recMes)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Custos de Peças e Insumos Aplicados (CMV)</span>
        <span class="num">${brl(despesasPecas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas com Folha de Pagamento / Mecânicos</span>
        <span class="num">${brl(despesasPessoal)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas Fixas (Aluguel, Luz, Água, Internet)</span>
        <span class="num">${brl(despesasFixas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Outras Despesas Operacionais e Administrativas</span>
        <span class="num">${brl(outrasDesp)}</span>
      </div>

      <div class="entre" style="font-weight:700;font-size:15px;border-top:2px solid var(--aco-300);padding-top:12px;margin-top:8px">
        <span>(=) RESULTADO LÍQUIDO DO EXERCÍCIO</span>
        <span class="num" style="color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(lucroLiq)}</span>
      </div>
    </div>
  </div>`;
}

/* ===== CONCILIAÇÃO BANCÁRIA ===== */
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
                <td style="text-align:right;font-weight:700;color:${l.valor >= 0 ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                  ${brl(l.valor)}
                </td>
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

function baixarConta(c, dataPgto) {
  if (!c || c.pago) return;
  c.pago = true;
  c.dataPgto = dataPgto || hoje();

  S.movimentos.push({
    id: uid('mv'),
    data: c.dataPgto,
    tipo: c.tipo === 'receber' ? 'entrada' : 'saida',
    desc: `Baixa: ${c.desc} (${c.parte})`,
    valor: c.valor,
    cat: c.cat || 'Geral',
    conc: true,
    forma: 'Baixa Financeira'
  });

  salvar();
}

function imprimirRecibo(contaId) {
  const c = S.contas.find(x => x.id === contaId);
  if (!c) return;

  const cfg = S.cfg;
  const janela = window.open('', '_blank');
  if (!janela) return;

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Recibo de Pagamento — ${cfg.empresa}</title>
    <style>
      body { font-family: sans-serif; font-size: 13px; max-width: 600px; margin: 20px auto; padding: 20px; border: 2px solid #334155; border-radius: 8px; }
      .topo { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; }
      .valor { font-size: 24px; font-weight: bold; color: #10b981; margin: 14px 0; text-align: right; }
      .corpo { line-height: 1.6; margin-bottom: 24px; }
      .ass { margin-top: 40px; text-align: center; border-top: 1px solid #000; width: 60%; margin-left: auto; margin-right: auto; padding-top: 6px; }
    </style>
  </head>
  <body>
    <div class="topo">
      <h2>${esc(cfg.empresa)}</h2>
      <div>CNPJ: ${esc(cfg.cnpj)} · ${esc(cfg.endereco)}</div>
    </div>
    <div class="valor">RECIBO: ${brl(c.valor)}</div>
    <div class="corpo">
      Recebemos de <b>${esc(c.parte)}</b> a quantia de <b>${brl(c.valor)}</b> referente a <b>${esc(c.desc)}</b> (${esc(c.doc || 'Doc S/N')}).<br>
      Para clareza e fins de direito, firmamos o presente recibo dando plena e geral quitação.
    </div>
    <div style="text-align:right">Campinas, ${dataBRfull(c.dataPgto || hoje())}.</div>
    <div class="ass">${esc(cfg.empresa)}<br><small>Assinatura Autorizada</small></div>
    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}

function folhaConta() {
  const tipo = S.ui.contaTipo || 'receber';
  const r = S.ui.rascConta = S.ui.rascConta || { venc: hoje(), valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançar Título — Contas a ${tipo === 'receber' ? 'Receber' : 'Pagar'}</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Título:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Manutenção Preventiva / Compra de Peças" data-act="rct" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">${tipo === 'receber' ? 'Cliente / Devedor' : 'Fornecedor / Favorecido'}:</label>
        <input type="text" class="campo-texto" placeholder="Nome da empresa ou pessoa" data-act="rct" data-c="parte" value="${esc(r.parte || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rct" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data de Vencimento:</label>
          <input type="date" class="campo-texto" data-act="rct" data-c="venc" value="${r.venc || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Centro de Custo:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Serviços & Peças, Fornecedores Peças, Aluguel" data-act="rct" data-c="cat" value="${esc(r.cat || '')}" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-conta" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Lançar Conta
      </button>
    </div>
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

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
        <input type="number" class="campo-texto" placeholder="0.00" data-act="rmv" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
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

/* =====================================================================
   IMPRESSÃO DE FECHAMENTO DE CAIXA
===================================================================== */
function imprimirFechamentoCaixa() {
  const h = hoje();
  const movHoje = (S.movimentos || []).filter(m => m.data === h);
  const ent = soma(movHoje.filter(m => m.tipo === 'entrada'), m => m.valor);
  const sai = soma(movHoje.filter(m => m.tipo === 'saida'), m => m.valor);
  const linhas = movHoje.map(m =>
    `<tr><td>${m.desc || '—'}</td><td>${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td><td style="text-align:right;font-weight:600;color:${m.tipo === 'entrada' ? 'var(--verde)' : 'var(--tijolo)'}">${brl(m.valor)}</td></tr>`
  ).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="text-align:center;margin-bottom:4px">Fechamento de Caixa</h2>
      <p style="text-align:center;color:#64748b;font-size:13px;margin-bottom:16px">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="flex:1;background:#ecfdf5;padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#64748b">Total Entradas</div>
          <div style="font-size:18px;font-weight:700;color:#059669">${brl(ent)}</div>
        </div>
        <div style="flex:1;background:#fef2f2;padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#64748b">Total Saídas</div>
          <div style="font-size:18px;font-weight:700;color:#dc2626">${brl(sai)}</div>
        </div>
        <div style="flex:1;background:#eff6ff;padding:12px;border-radius:8px;text-align:center">
          <div style="font-size:11px;color:#64748b">Saldo do Dia</div>
          <div style="font-size:18px;font-weight:700;color:#2563eb">${brl(ent - sai)}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:8px">Descrição</th><th style="text-align:left;padding:8px">Tipo</th><th style="text-align:right;padding:8px">Valor</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">Nenhum movimento hoje</td></tr>'}</tbody>
      </table>
      <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:20px">Saldo em caixa: ${brl(saldoCaixa())} · Gerado em ${new Date().toLocaleTimeString('pt-BR')}</p>
    </div>`;

  const win = window.open('', '_blank', 'width=700,height=600');
  win.document.write(html);
  win.document.close();
  win.print();
}
