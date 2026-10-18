/* =====================================================================
   PÁTIO CRM — VERÔNICA ANALISTA FINANCEIRA & ASSISTENTE GERENCIAL
   Gestão de Caixa Diário, Previsão (Forecast 7/15/30d), Controles Internos
   ===================================================================== */

function obterCaixaAbertoFrontend() {
  const caixas = Array.isArray(S.caixas) ? S.caixas : [];
  return caixas.find(c => c.status === 'aberto') || null;
}

function calcularPrevisaoFrontend(horizonteDias = 30) {
  const hojeRef = (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10));
  const saldoAtual = typeof saldoCaixa === 'function' ? saldoCaixa() : 0;
  const contas = Array.isArray(S.contas) ? S.contas : [];
  const osList = Array.isArray(S.os) ? S.os : [];
  const orcamentos = Array.isArray(S.quotations) ? S.quotations : (Array.isArray(S.orcamentos) ? S.orcamentos : []);
  const cfg = S.cfg || {};
  const caixaMinimo = Number(cfg.caixaMinimoSeguranca || 2000);

  const dataFim = typeof addDias === 'function' ? addDias(hojeRef, horizonteDias) : hojeRef;

  const recNoPeriodo = contas.filter(c => c.tipo === 'receber' && !c.pago && c.venc >= hojeRef && c.venc <= dataFim);
  const pagNoPeriodo = contas.filter(c => c.tipo === 'pagar' && !c.pago && c.venc >= hojeRef && c.venc <= dataFim);

  const totRec = recNoPeriodo.reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const totPag = pagNoPeriodo.reduce((a, b) => a + (Number(b.valor) || 0), 0);

  // OS no Pátio (não finalizadas e não canceladas)
  const osAtivas = osList.filter(o => o.st !== 'finalizada' && o.st !== 'cancelada');
  const valorOSAtivas = osAtivas.reduce((a, b) => a + (Number(b.total || b.valorTotal) || 0), 0);

  const orcPendentes = orcamentos.filter(q => ['enviado', 'pendente', 'aguardando_aprovacao', 'rascunho'].includes(String(q.status || '').toLowerCase()));
  const valorOrcPendentes = orcPendentes.reduce((a, b) => a + (Number(b.totalGeral || b.valorTotal) || 0), 0);

  const potencialProvavel = (valorOSAtivas * 0.8) + (valorOrcPendentes * 0.4);
  const potencialConservador = (valorOSAtivas * 0.5) + (valorOrcPendentes * 0.15);

  // Projeção dia a dia para marcos e diagnóstico
  let saldoAcum = saldoAtual;
  let menorSaldo = saldoAtual;
  let dataPrimeiroFuro = null;
  let temFuro = false;

  const marcos = { '7d': saldoAtual, '15d': saldoAtual, '30d': saldoAtual };

  for (let d = 0; d <= horizonteDias; d++) {
    const dt = typeof addDias === 'function' ? addDias(hojeRef, d) : hojeRef;
    const recD = recNoPeriodo.filter(c => (c.venc || '').slice(0, 10) === dt).reduce((a, b) => a + (Number(b.valor) || 0), 0);
    const pagD = pagNoPeriodo.filter(c => (c.venc || '').slice(0, 10) === dt).reduce((a, b) => a + (Number(b.valor) || 0), 0);
    saldoAcum = saldoAcum + recD - pagD;

    if (saldoAcum < menorSaldo) menorSaldo = saldoAcum;
    if (saldoAcum < caixaMinimo && !dataPrimeiroFuro) {
      dataPrimeiroFuro = dt;
      temFuro = true;
    }
    if (d === 7) marcos['7d'] = saldoAcum;
    if (d === 15) marcos['15d'] = saldoAcum;
    if (d === 30) marcos['30d'] = saldoAcum;
  }

  return {
    hojeRef,
    saldoAtual,
    caixaMinimo,
    totRec,
    totPag,
    saldoPrevisto30d: saldoAcum,
    marcos,
    potencialProvavel,
    potencialConservador,
    valorOSAtivas,
    valorOrcPendentes,
    temFuro,
    menorSaldo,
    dataPrimeiroFuro
  };
}

function calcularControlesInternosFrontend() {
  const contas = Array.isArray(S.contas) ? S.contas : [];
  const osList = Array.isArray(S.os) ? S.os : [];
  const movimentos = Array.isArray(S.movimentos) ? S.movimentos : [];
  const hojeRef = (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10));

  const anomalias = [];

  // 1. OS Finalizada sem financeiro
  const osSemFin = osList.filter(o => {
    if (o.st !== 'finalizada') return false;
    const temConta = contas.some(c => c.osId === o.id || c.osNum === o.num || (c.desc && c.desc.includes(`OS #${o.num}`)));
    const temMov = movimentos.some(m => m.osId === o.id || m.osNum === o.num || (m.desc && m.desc.includes(`OS #${o.num}`)));
    return !temConta && !temMov;
  });

  if (osSemFin.length > 0) {
    const valTotal = osSemFin.reduce((a, b) => a + (Number(b.total || b.valorTotal) || 0), 0);
    anomalias.push({
      severidade: 'critico',
      titulo: 'Vazamento de Receita: OS Finalizada sem Registro Financeiro',
      descricao: `${osSemFin.length} OS finalizadas no pátio somando ${typeof brl === 'function' ? brl(valTotal) : valTotal} não possuem título a receber ou lançamento de caixa vinculado.`,
      recomendacao: 'Fature as ordens pendentes ou gere o recebimento imediato para conciliação contábil.',
      itens: osSemFin.slice(0, 5).map(o => `OS #${o.num} (${typeof brl === 'function' ? brl(o.total || 0) : o.total})`)
    });
  }

  // 2. Inadimplência Crítica
  const titulosVencidos = contas.filter(c => c.tipo === 'receber' && !c.pago && c.venc < hojeRef);
  if (titulosVencidos.length > 0) {
    const valVenc = titulosVencidos.reduce((a, b) => a + (Number(b.valor) || 0), 0);
    anomalias.push({
      severidade: 'alerta',
      titulo: 'Inadimplência de Clientes: Títulos Vencidos',
      descricao: `${titulosVencidos.length} títulos de clientes vencidos totalizando ${typeof brl === 'function' ? brl(valVenc) : valVenc}.`,
      recomendacao: 'Acione a régua de cobrança automática via WhatsApp da Verônica para os devedores prioritários.',
      itens: titulosVencidos.slice(0, 5).map(c => `${c.parte || 'Cliente'}: ${typeof brl === 'function' ? brl(c.valor) : c.valor}`)
    });
  }

  // 3. Contas a pagar em atraso
  const pagarVencidos = contas.filter(c => c.tipo === 'pagar' && !c.pago && c.venc < hojeRef);
  if (pagarVencidos.length > 0) {
    const valPagVenc = pagarVencidos.reduce((a, b) => a + (Number(b.valor) || 0), 0);
    anomalias.push({
      severidade: 'alerta',
      titulo: 'Compromissos Fornecedores em Atraso',
      descricao: `${pagarVencidos.length} contas a pagar com vencimento ultrapassado, totalizando ${typeof brl === 'function' ? brl(valPagVenc) : valPagVenc}.`,
      recomendacao: 'Renegocie prazos ou priorize a liquidação para evitar juros e suspensão de crédito com fornecedores de autopeças.'
    });
  }

  return anomalias;
}

function blocoVeronicaAnalista() {
  const caixaAberto = obterCaixaAbertoFrontend();
  const prev = calcularPrevisaoFrontend(30);
  const anomalias = calcularControlesInternosFrontend();
  const movimentosCaixa = Array.isArray(S.movimentos) ? S.movimentos.slice(-8).reverse() : [];

  // Texto do Parecer para TTS
  const textoParecer = `Olá, gestor! Sou a Verônica, sua analista financeira. ` +
    `No momento temos ${typeof brl === 'function' ? brl(prev.saldoAtual) : prev.saldoAtual} em caixa disponível. ` +
    `Para os próximos 30 dias, projetamos ${typeof brl === 'function' ? brl(prev.marcos['30d']) : prev.marcos['30d']} considerando títulos, e potencial de mais ${typeof brl === 'function' ? brl(prev.potencialProvavel) : prev.potencialProvavel} das ordens em execução no pátio. ` +
    (prev.temFuro ? `Atenção: identifiquei risco de saldo abaixo da margem de segurança a partir de ${prev.dataPrimeiroFuro}. ` : `A liquidez está estável acima do caixa mínimo. `) +
    (anomalias.length > 0 ? `Identifiquei ${anomalias.length} alertas nos controles internos que requerem sua atenção.` : `Todos os controles operacionais e financeiros estão reconciliados.`);

  return `
  <div style="display:flex;flex-direction:column;gap:18px">
    
    <!-- BANNER EXECUTIVO VERÔNICA -->
    <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a8a 100%);color:#fff;border-radius:12px;padding:22px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.15);position:relative;overflow:hidden">
      <div style="position:absolute;right:-20px;bottom:-20px;font-size:120px;opacity:0.07;user-select:none">🤖</div>
      
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="background:#2563eb;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px">VERÔNICA AI</span>
            <span style="background:rgba(255,255,255,0.15);font-size:11px;padding:3px 8px;border-radius:20px">ANALISTA FINANCEIRA & GERENCIAL</span>
          </div>
          <h2 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px">Parecer Executivo & Inteligência de Caixa</h2>
        </div>
        
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primario" onclick="falarParecerVeronica('${esc(textoParecer)}')" style="background:#2563eb;border-color:#3b82f6;font-size:13px;display:inline-flex;align-items:center;gap:6px">
            🔊 Ouvir Parecer
          </button>
          <button class="btn btn-secundario" onclick="render()" style="background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2);font-size:13px">
            🔄 Atualizar
          </button>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:14px 18px;font-size:13.5px;line-height:1.6;color:#e2e8f0">
        💬 <b>Diagnóstico da Verônica:</b> Saldo disponível de <b>${brl(prev.saldoAtual)}</b>. Projeção financeira líquida para 30 dias em <b>${brl(prev.marcos['30d'])}</b>, reforçada por <b>${brl(prev.potencialProvavel)}</b> de receita potencial nas OSs em atendimento na oficina.
        ${prev.temFuro ? `<div style="margin-top:6px;color:#fca5a5">⚠️ <b>Alerta de Fluxo:</b> Risco de saldo abaixo do limite de segurança (${brl(prev.caixaMinimo)}) detectado a partir de ${dataBR(prev.dataPrimeiroFuro)}. Menor saldo previsto: <b>${brl(prev.menorSaldo)}</b>.</div>` : `<div style="margin-top:6px;color:#86efac">✅ <b>Saúde Financeira:</b> Sem risco de furo projetado nos próximos 30 dias. Reserva operacional mantida.</div>`}
      </div>
    </div>

    <!-- 1. GESTÃO DE CAIXA DIÁRIO (TESOURARIA) -->
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900);display:flex;align-items:center;gap:8px">
            💵 Gestão de Caixa Diário (Tesouraria & Turnos)
            <span class="selo ${caixaAberto ? 'selo-bom' : 'selo-neutro'}" style="font-size:11px">
              ${caixaAberto ? '● Caixa Aberto' : '○ Caixa Fechado'}
            </span>
          </div>
          <div class="mini">Abertura com saldo inicial, controle de entradas/saídas por forma de pagamento e conferência cega no fechamento.</div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${caixaAberto ? `
            <button class="btn btn-primario" onclick="abrirFolha(folhaLancamentoCaixaVeronica)" style="font-size:12.5px;font-weight:600">
              ➕ Lançar Movimentação
            </button>
            <button class="btn btn-perigo" onclick="abrirFolha(folhaFecharCaixaVeronica)" style="font-size:12.5px;font-weight:600">
              🔒 Fechar Caixa do Turno
            </button>
          ` : `
            <button class="btn btn-sucesso" onclick="abrirFolha(folhaAbrirCaixaVeronica)" style="font-size:13px;font-weight:700;padding:6px 16px">
              🔓 Abrir Caixa Diário Agora
            </button>
          `}
        </div>
      </div>

      ${caixaAberto ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
          <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px">
            <div class="mini" style="font-weight:600;color:var(--aco-600)">Operador / Turno</div>
            <div style="font-weight:700;font-size:15px;color:var(--aco-900)">${esc(caixaAberto.operador || 'Operador Principal')}</div>
            <div class="mini">Aberto em ${caixaAberto.dataAbertura ? dataBR(caixaAberto.dataAbertura.slice(0, 10)) : hoje()}</div>
          </div>
          <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px">
            <div class="mini" style="font-weight:600;color:var(--aco-600)">Saldo Inicial (Abertura)</div>
            <div style="font-weight:700;font-size:15px;color:var(--petroleo)" class="num">${brl(caixaAberto.saldoInicial || 0)}</div>
            <div class="mini">Fundo de troco inicial</div>
          </div>
          <div style="background:rgba(16, 185, 129, 0.05);border:1px solid rgba(16, 185, 129, 0.3);border-radius:8px;padding:12px">
            <div class="mini" style="font-weight:600;color:var(--verde)">Total de Entradas (+)</div>
            <div style="font-weight:700;font-size:15px;color:var(--verde)" class="num">+${brl(caixaAberto.totalEntradas || 0)}</div>
            <div class="mini">Receitas e suprimentos</div>
          </div>
          <div style="background:rgba(239, 68, 68, 0.05);border:1px solid rgba(239, 68, 68, 0.3);border-radius:8px;padding:12px">
            <div class="mini" style="font-weight:600;color:var(--tijolo)">Total de Saídas (−)</div>
            <div style="font-weight:700;font-size:15px;color:var(--tijolo)" class="num">-${brl(caixaAberto.totalSaidas || 0)}</div>
            <div class="mini">Despesas e sangrias</div>
          </div>
          <div style="background:rgba(37, 99, 235, 0.08);border:1px solid rgba(37, 99, 235, 0.3);border-radius:8px;padding:12px">
            <div class="mini" style="font-weight:600;color:var(--petroleo)">Saldo em Caixa Atual</div>
            <div style="font-weight:800;font-size:17px;color:#1d4ed8" class="num">${brl(caixaAberto.saldoAtual != null ? caixaAberto.saldoAtual : (saldoCaixa()))}</div>
            <div class="mini">Disponibilidade física/digital</div>
          </div>
        </div>
      ` : `
        <div style="background:var(--aco-50);border:1px dashed var(--aco-300);border-radius:8px;padding:24px;text-align:center;margin-bottom:14px">
          <div style="font-size:28px;margin-bottom:6px">🔒</div>
          <div style="font-weight:700;font-size:15px;color:var(--aco-800)">Nenhum Caixa Aberto no Momento</div>
          <div class="mini" style="max-width:460px;margin:4px auto 14px">Para registrar movimentações financeiras, recebimentos e despesas com conciliação por operador, abra o caixa informando o saldo inicial em dinheiro.</div>
          <button class="btn btn-sucesso" onclick="abrirFolha(folhaAbrirCaixaVeronica)">
            🔓 Abrir Caixa Diário Agora
          </button>
        </div>
      `}

      <!-- ÚLTIMOS LANÇAMENTOS DO CAIXA -->
      <div style="font-weight:700;font-size:13.5px;color:var(--aco-800);margin-bottom:8px">Últimas Movimentações Registradas:</div>
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição</th>
              <th style="width:130px">Origem</th>
              <th>Forma Pgto</th>
              <th style="text-align:right">Valor</th>
              <th style="text-align:center">Data</th>
              <th style="text-align:center">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${movimentosCaixa.length ? movimentosCaixa.map(m => {
              const isEnt = m.tipo === 'entrada' || m.tipo === 'receita' || m.tipo === 'suprimento';
              const isEstornado = Boolean(m.estornado);
              const isCompensatorio = Boolean(m.estornoDeId || m.subtipo === 'estorno');
              const podeEstornar = !isEstornado && !isCompensatorio;

              const rowStyle = isEstornado
                ? 'opacity:0.65;background:rgba(239, 68, 68, 0.04);'
                : isCompensatorio
                  ? 'background:rgba(245, 158, 11, 0.04);'
                  : '';

              return `
              <tr style="${rowStyle}">
                <td>
                  <span class="selo ${isEstornado ? 'selo-alerta' : isEnt ? 'selo-bom' : 'selo-alerta'}" style="font-size:10px">
                    ${isEstornado ? '⚠️ Estornado' : isEnt ? '▲ Entrada' : '▼ Saída'}
                  </span>
                </td>
                <td>
                  <div style="${isEstornado ? 'text-decoration:line-through;color:var(--aco-600)' : 'font-weight:700'}">
                    ${esc(m.desc || m.descricao || 'Movimentação')}
                  </div>
                  <div class="mini">${esc(m.cat || m.categoria || 'Geral')}</div>
                  ${isEstornado ? `
                    <div class="mini" style="color:var(--tijolo);font-weight:700;margin-top:2px">
                      ⚠️ ESTORNADO: ${esc(m.motivoEstorno || 'Estornado')}
                    </div>
                  ` : ''}
                  ${isCompensatorio ? `
                    <div class="mini" style="color:#d97706;font-weight:600;margin-top:2px">
                      ↩️ Compensatório de estorno
                    </div>
                  ` : ''}
                </td>
                <td>
                  ${m.origem === 'whatsapp' ? `
                    <div>
                      <span class="selo" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-size:10px;font-weight:700">
                        📱 WhatsApp
                      </span>
                      ${m.autorNumero ? `
                        <div class="mini mono" style="font-size:9.5px;color:var(--aco-600);margin-top:1px">
                          ${esc(m.autorNumero)}
                        </div>
                      ` : ''}
                    </div>
                  ` : `
                    <div>
                      <span class="selo" style="background:var(--aco-100);color:var(--aco-700);font-size:10px">
                        💻 Web
                      </span>
                    </div>
                  `}
                </td>
                <td><span class="mono">${esc((m.forma || m.formaPagamento || 'dinheiro').toUpperCase())}</span></td>
                <td style="text-align:right;font-weight:700;color:${isEstornado ? 'var(--aco-500)' : isEnt ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
                  <span style="${isEstornado ? 'text-decoration:line-through' : ''}">
                    ${isEnt ? '+' : '-'}${brl(m.valor)}
                  </span>
                </td>
                <td style="text-align:center" class="mono">${dataBR(m.data || hoje())}</td>
                <td style="text-align:center">
                  ${podeEstornar ? `
                    <button class="btn btn-secundario btn-pequeno"
                            onclick="solicitarEstornoMovimento('${m.id}')"
                            title="Estornar movimentação"
                            style="font-size:10.5px;padding:2px 8px;color:var(--tijolo);border-color:rgba(239, 68, 68, 0.4)">
                      ↩️ Estornar
                    </button>
                  ` : `
                    <span class="mini" style="color:var(--aco-400)">—</span>
                  `}
                </td>
              </tr>`;
            }).join('') : `
              <tr><td colspan="7" style="text-align:center;padding:16px;color:var(--aco-400)">Nenhuma movimentação lançada recentemente.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 2. FLUXO DE CAIXA & FORECAST 7/15/30 DIAS COM POTENCIAL DE PÁTIO -->
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900)">
            📈 Previsão de Fluxo de Caixa (Forecast 7, 15 e 30 Dias)
          </div>
          <div class="mini">Combina saldo de tesouraria, contas a receber/pagar e a <b>receita potencial das OSs em execução no pátio</b>.</div>
        </div>
        <span class="badge-periodo-atual">Horizonte: 30 Dias</span>
      </div>

      <!-- CARDS DE MARCOS TEMPORAIS -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:10px;padding:14px">
          <div class="entre">
            <span style="font-weight:700;font-size:13px;color:var(--aco-700)">🗓️ Em 7 Dias</span>
            <span class="selo ${prev.marcos['7d'] >= prev.caixaMinimo ? 'selo-bom' : 'selo-alerta'}" style="font-size:10px">
              ${prev.marcos['7d'] >= prev.caixaMinimo ? 'Margem Segura' : 'Alerta'}
            </span>
          </div>
          <div style="font-size:20px;font-weight:800;color:${prev.marcos['7d'] >= 0 ? 'var(--verde)' : 'var(--tijolo)'};margin:8px 0" class="num">
            ${brl(prev.marcos['7d'])}
          </div>
          <div class="mini">Saldo projetado após liquidações imediatas</div>
        </div>

        <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:10px;padding:14px">
          <div class="entre">
            <span style="font-weight:700;font-size:13px;color:var(--aco-700)">🗓️ Em 15 Dias</span>
            <span class="selo ${prev.marcos['15d'] >= prev.caixaMinimo ? 'selo-bom' : 'selo-alerta'}" style="font-size:10px">
              ${prev.marcos['15d'] >= prev.caixaMinimo ? 'Margem Segura' : 'Alerta'}
            </span>
          </div>
          <div style="font-size:20px;font-weight:800;color:${prev.marcos['15d'] >= 0 ? 'var(--verde)' : 'var(--tijolo)'};margin:8px 0" class="num">
            ${brl(prev.marcos['15d'])}
          </div>
          <div class="mini">Posição quinzenal consolidada</div>
        </div>

        <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:10px;padding:14px">
          <div class="entre">
            <span style="font-weight:700;font-size:13px;color:var(--aco-700)">🗓️ Em 30 Dias (Títulos)</span>
            <span class="selo ${prev.marcos['30d'] >= prev.caixaMinimo ? 'selo-bom' : 'selo-alerta'}" style="font-size:10px">
              ${prev.marcos['30d'] >= prev.caixaMinimo ? 'Margem Segura' : 'Alerta'}
            </span>
          </div>
          <div style="font-size:20px;font-weight:800;color:${prev.marcos['30d'] >= 0 ? 'var(--petroleo)' : 'var(--tijolo)'};margin:8px 0" class="num">
            ${brl(prev.marcos['30d'])}
          </div>
          <div class="mini">A Receber: +${brlCurto(prev.totRec)} | A Pagar: -${brlCurto(prev.totPag)}</div>
        </div>
      </div>

      <!-- POTENCIAL DE PÁTIO -->
      <div style="background:rgba(37, 99, 235, 0.05);border:1px solid rgba(37, 99, 235, 0.2);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:14px;color:#1e40af;margin-bottom:6px">
          🚛 Receita Potencial de Pátio (OS em Execução & Orçamentos Abertos):
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;font-size:13px">
          <div>
            <span class="mini">Ordens de Serviço em Andamento:</span>
            <div style="font-weight:700;font-size:15px;color:var(--aco-900)">${brl(prev.valorOSAtivas)}</div>
          </div>
          <div>
            <span class="mini">Orçamentos em Negociação:</span>
            <div style="font-weight:700;font-size:15px;color:var(--aco-900)">${brl(prev.valorOrcPendentes)}</div>
          </div>
          <div>
            <span class="mini" style="color:var(--verde);font-weight:700">Cenário Provável (+80% OS / +40% Orç):</span>
            <div style="font-weight:800;font-size:16px;color:var(--verde)">+${brl(prev.potencialProvavel)}</div>
            <div class="mini">Saldo Proj com Pátio: <b>${brl(prev.marcos['30d'] + prev.potencialProvavel)}</b></div>
          </div>
          <div>
            <span class="mini" style="color:#d97706;font-weight:700">Cenário Conservador (+50% OS / +15% Orç):</span>
            <div style="font-weight:800;font-size:16px;color:#d97706">+${brl(prev.potencialConservador)}</div>
            <div class="mini">Saldo Proj com Pátio: <b>${brl(prev.marcos['30d'] + prev.potencialConservador)}</b></div>
          </div>
        </div>
      </div>

      <!-- DIAGNÓSTICO DE RISCO DE FURO -->
      ${prev.temFuro ? `
        <div style="background:rgba(239, 68, 68, 0.08);border-left:4px solid var(--tijolo);border-radius:6px;padding:12px 14px;font-size:13px;color:#991b1b">
          🚨 <b>Risco de Furo de Caixa Identificado:</b> No dia <b>${dataBR(prev.dataPrimeiroFuro)}</b>, o saldo projetado atinge <b>${brl(prev.menorSaldo)}</b>, violando o caixa mínimo de segurança (${brl(prev.caixaMinimo)}).
          <div style="margin-top:4px">💡 <i>Recomendação da Verônica:</i> Antecipe a cobrança dos títulos vencidos ou priorize a entrega e faturamento das OSs prontas no pátio.</div>
        </div>
      ` : `
        <div style="background:rgba(16, 185, 129, 0.08);border-left:4px solid var(--verde);border-radius:6px;padding:12px 14px;font-size:13px;color:#065f46">
          ✅ <b>Fluxo de Caixa Equilibrado:</b> O saldo operacional projetado para os próximos 30 dias permanece com folga acima da margem de segurança de ${brl(prev.caixaMinimo)}.
        </div>
      `}
    </div>

    <!-- 3. CONTROLES INTERNOS & AUDITORIA GERENCIAL -->
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900)">
            🔍 Auditoria Gerencial & Controles Internos da Verônica
          </div>
          <div class="mini">Prevenção ativa de vazamentos de receita, detecção de OS sem financeiro e acompanhamento de inadimplência.</div>
        </div>
        <span class="selo ${anomalias.length === 0 ? 'selo-bom' : 'selo-alerta'}" style="font-size:11px">
          ${anomalias.length === 0 ? '● Controles Reconciliados' : `${anomalias.length} Alertas Ativos`}
        </span>
      </div>

      ${anomalias.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${anomalias.map(a => `
            <div style="background:${a.severidade === 'critico' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)'};border:1px solid ${a.severidade === 'critico' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'};border-radius:8px;padding:14px">
              <div class="entre" style="margin-bottom:4px">
                <b style="font-size:14px;color:${a.severidade === 'critico' ? 'var(--tijolo)' : '#b45309'}">
                  ${a.severidade === 'critico' ? '🚨' : '⚠️'} ${esc(a.titulo)}
                </b>
                <span class="selo ${a.severidade === 'critico' ? 'selo-alerta' : 'selo-aviso'}" style="font-size:10px">
                  ${a.severidade.toUpperCase()}
                </span>
              </div>
              <div style="font-size:13px;color:var(--aco-700);margin-bottom:6px">${esc(a.descricao)}</div>
              ${a.itens ? `<div class="mini" style="margin-bottom:6px;color:var(--aco-600)"><b>Itens:</b> ${a.itens.map(esc).join(' · ')}</div>` : ''}
              <div style="font-size:12.5px;color:var(--aco-800);background:#fff;padding:6px 10px;border-radius:4px;border:1px solid var(--aco-200)">
                💡 <b>Ação Recomendada:</b> ${esc(a.recomendacao)}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="padding:20px;text-align:center;color:var(--verde);background:rgba(16,185,129,0.04);border-radius:8px">
          <div style="font-size:28px;margin-bottom:6px">🛡️</div>
          <div style="font-weight:700;font-size:14.5px">Auditoria 100% Concluída — Nenhuma Anomalia Detectada</div>
          <div class="mini" style="color:var(--aco-600)">Todas as OS finalizadas possuem lançamento financeiro e a inadimplência está sob controle.</div>
        </div>
      `}
    </div>

  </div>`;
}

/* ---------------- Modais de Tesouraria e Caixa da Verônica ---------------- */

function folhaAbrirCaixaVeronica() {
  return `
  <div class="card card-p" style="max-width:480px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">🔓 Abertura de Caixa Diário</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="background:var(--aco-50);padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);color:var(--aco-700)">
        Informe o saldo inicial físico (fundo de troco) disponível no caixa para iniciar o turno de atendimento.
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Inicial em Dinheiro (R$):</label>
        <input type="number" id="cx-saldo-inicial" class="campo-texto" placeholder="0.00" value="0.00" step="1.00" style="width:100%;height:38px;font-size:16px;font-weight:700;color:var(--verde)">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Operador Responsável:</label>
        <input type="text" id="cx-operador" class="campo-texto" placeholder="Nome do operador" value="${esc((S.user && S.user.nome) || 'Caixa Principal')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Observações de Abertura:</label>
        <textarea id="cx-obs" class="campo-texto" placeholder="Ex: Turno da manhã, troco conferido" style="width:100%;height:60px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="
        const s = document.getElementById('cx-saldo-inicial').value;
        const op = document.getElementById('cx-operador').value;
        const obs = document.getElementById('cx-obs').value;
        abrirCaixaApi(s, obs, op);
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Confirmar Abertura
      </button>
    </div>
  </div>`;
}

function folhaLancamentoCaixaVeronica() {
  return `
  <div class="card card-p" style="max-width:520px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">➕ Lançamento no Caixa Ativo</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Movimento:</label>
          <select id="mov-tipo" class="campo-select" style="width:100%;height:36px;font-weight:700">
            <option value="receita">Receita (Entrada +)</option>
            <option value="suprimento">Suprimento de Caixa (+)</option>
            <option value="despesa">Despesa (Saída −)</option>
            <option value="sangria">Sangria de Caixa (−)</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" id="mov-valor" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:36px;font-weight:700;font-size:15px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Forma de Pagamento:</label>
          <select id="mov-forma" class="campo-select" style="width:100%;height:34px">
            <option value="dinheiro">Dinheiro (Espécie)</option>
            <option value="pix">PIX</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="boleto">Boleto Bancário</option>
            <option value="transferencia">Transferência / TED</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Custo:</label>
          <select id="mov-categoria" class="campo-select" style="width:100%;height:34px">
            <option value="Serviços">Serviços da Oficina</option>
            <option value="Peças">Venda de Peças</option>
            <option value="Combustível">Combustível / Deslocamento</option>
            <option value="Alimentação">Alimentação / Copa</option>
            <option value="Materiais">Materiais de Uso e Consumo</option>
            <option value="Geral">Outras Movimentações</option>
          </select>
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Lançamento:</label>
        <input type="text" id="mov-desc" class="campo-texto" placeholder="Ex: Adiantamento de cliente OS #12, compra de parafuso" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-primario" onclick="
        const tipo = document.getElementById('mov-tipo').value;
        const valor = document.getElementById('mov-valor').value;
        const forma = document.getElementById('mov-forma').value;
        const cat = document.getElementById('mov-categoria').value;
        const desc = document.getElementById('mov-desc').value;
        lancarMovimentoApi({ tipo, valor, formaPagamento: forma, categoria: cat, descricao: desc });
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Lançar no Caixa
      </button>
    </div>
  </div>`;
}

function folhaFecharCaixaVeronica() {
  return `
  <div class="card card-p" style="max-width:540px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">🔒 Fechamento e Conciliação Cega</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="background:var(--aco-50);padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);color:var(--aco-700)">
        <b>Conferência Cega:</b> Digite os totais reais apurados fisicamente e nos comprovantes de maquininhas/banco. O sistema fará a conciliação automática com o saldo registrado.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Dinheiro Físico (R$):</label>
          <input type="number" id="conf-dinheiro" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Comprovantes PIX (R$):</label>
          <input type="number" id="conf-pix" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Cartões Débito/Crédito (R$):</label>
          <input type="number" id="conf-cartao" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Boletos / TEDs (R$):</label>
          <input type="number" id="conf-outros" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Observações de Fechamento:</label>
        <textarea id="conf-obs" class="campo-texto" placeholder="Ex: Sobra de troco justificada, conferência conferida com gerente" style="width:100%;height:50px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-perigo" onclick="
        const din = document.getElementById('conf-dinheiro').value;
        const pix = document.getElementById('conf-pix').value;
        const car = document.getElementById('conf-cartao').value;
        const out = document.getElementById('conf-outros').value;
        const obs = document.getElementById('conf-obs').value;
        fecharCaixaApi({ dinheiro: din, pix, cartao: car, outros: out }, obs);
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Encerrar Caixa
      </button>
    </div>
  </div>`;
}

/* ---------------- Chamadas de API Financeira da Verônica ---------------- */

async function abrirCaixaApi(saldoInicial, observacoes, operador) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/financeiro/caixa/abrir', {
      method: 'POST',
      headers,
      body: JSON.stringify({ saldoInicial: Number(saldoInicial) || 0, observacoes, operador })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao abrir caixa');
    
    // Atualiza estado local
    if (data.caixa) {
      S.caixas = S.caixas || [];
      S.caixas.push(data.caixa);
    }
    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Caixa aberto com sucesso!');
  } catch (err) {
    alert(err.message);
  }
}

async function lancarMovimentoApi(payload) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/financeiro/movimentacoes', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao lançar movimentação');

    if (data.movimento) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimento);
    }
    if (data.caixa) {
      const idx = (S.caixas || []).findIndex(c => c.id === data.caixa.id);
      if (idx !== -1) S.caixas[idx] = data.caixa;
    }
    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Lançamento registrado com sucesso!');
  } catch (err) {
    alert(err.message);
  }
}

async function fecharCaixaApi(conferenciaCega, observacoes) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/financeiro/caixa/fechar', {
      method: 'POST',
      headers,
      body: JSON.stringify({ conferenciaCega, observacoes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao fechar caixa');

    if (data.fechamento && data.fechamento.caixaId) {
      const idx = (S.caixas || []).findIndex(c => c.id === data.fechamento.caixaId);
      if (idx !== -1) {
        S.caixas[idx].status = 'fechado';
        S.caixas[idx].fechamento = data.fechamento;
      }
    }
    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Caixa encerrado com sucesso!');
  } catch (err) {
    alert(err.message);
  }
}

async function estornarMovimentoApi(movimentoId, motivo) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/movimentacoes/${encodeURIComponent(movimentoId)}/estornar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar estorno contábil');

    if (data.movimentoEstornado) {
      const idx = (S.movimentos || []).findIndex(m => m.id === data.movimentoEstornado.id);
      if (idx !== -1) S.movimentos[idx] = data.movimentoEstornado;
    }
    if (data.movimentoCompensatorio) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimentoCompensatorio);
    }
    if (data.caixa) {
      const cIdx = (S.caixas || []).findIndex(c => c.id === data.caixa.id);
      if (cIdx !== -1) S.caixas[cIdx] = data.caixa;
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Estorno contábil realizado com sucesso!');
  } catch (err) {
    alert(`Falha no estorno: ${err.message}`);
  }
}

function falarParecerVeronica(texto) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const cleanText = (texto || '').replace(/[#*_`]/g, '');
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } else {
    alert(texto);
  }
}

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.obterCaixaAbertoFrontend = obterCaixaAbertoFrontend;
  window.calcularPrevisaoFrontend = calcularPrevisaoFrontend;
  window.calcularControlesInternosFrontend = calcularControlesInternosFrontend;
  window.blocoVeronicaAnalista = blocoVeronicaAnalista;
  window.folhaAbrirCaixaVeronica = folhaAbrirCaixaVeronica;
  window.folhaLancamentoCaixaVeronica = folhaLancamentoCaixaVeronica;
  window.folhaFecharCaixaVeronica = folhaFecharCaixaVeronica;
  window.abrirCaixaApi = abrirCaixaApi;
  window.lancarMovimentoApi = lancarMovimentoApi;
  window.fecharCaixaApi = fecharCaixaApi;
  window.estornarMovimentoApi = estornarMovimentoApi;
  window.falarParecerVeronica = falarParecerVeronica;
}
