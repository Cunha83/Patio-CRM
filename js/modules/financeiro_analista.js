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

function calcularDREFrontend() {
  const movs = Array.isArray(S.movimentos) ? S.movimentos : [];
  let recBruta = 0;
  let despOper = 0;
  let sup = 0;
  let sang = 0;
  let qtdRec = 0;
  let qtdDesp = 0;

  movs.forEach(m => {
    if (m.estornado) return;
    const v = Number(m.valor) || 0;
    const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));
    if (nat === 'suprimento' || m.subtipo === 'suprimento') {
      sup += v;
    } else if (nat === 'sangria' || m.subtipo === 'sangria') {
      sang += v;
    } else if (nat === 'estorno' || m.estornoDeId || m.subtipo === 'estorno') {
      // neutro
    } else {
      if (m.tipo === 'entrada' || m.tipo === 'receita') {
        recBruta += v;
        qtdRec++;
      } else if (m.tipo === 'saida' || m.tipo === 'despesa') {
        despOper += v;
        qtdDesp++;
      }
    }
  });

  const lucro = +(recBruta - despOper).toFixed(2);
  const margem = recBruta > 0 ? +((lucro / recBruta) * 100).toFixed(2) : 0;

  let custoPecasAplicadasOS = 0;
  const osLista = Array.isArray(S.os) ? S.os : [];
  for (const o of osLista) {
    if (o.st !== 'cancelada') {
      const pecas = Array.isArray(o.pecasUtilizadas) ? o.pecasUtilizadas : [];
      for (const p of pecas) {
        custoPecasAplicadasOS = +(custoPecasAplicadasOS + Number(p.subtotal || (p.quantidade * (p.valorUnitario || 0)))).toFixed(2);
      }
    }
  }

  return {
    recBruta,
    despOper,
    custoPecasAplicadasOS,
    lucro,
    margem,
    sup,
    sang,
    saldoTesouraria: +(sup - sang).toFixed(2),
    qtdRec,
    qtdDesp
  };
}

function blocoVeronicaAnalista() {
  const caixaAberto = obterCaixaAbertoFrontend();
  const prev = calcularPrevisaoFrontend(30);
  const anomalias = calcularControlesInternosFrontend();
  const dre = calcularDREFrontend();
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
                  ${(m.osId || m.placa) ? `
                    <div style="display:flex;gap:4px;margin-top:2px;align-items:center;flex-wrap:wrap">
                      ${m.osId ? `<span class="selo" style="background:#e0e7ff;color:#3730a3;font-size:9.5px;padding:1px 5px">OS #${esc(m.osId)}</span>` : ''}
                      ${m.placa ? `<span class="selo mono" style="background:#fef3c7;color:#92400e;font-size:9.5px;padding:1px 5px">🚗 ${esc(m.placa)}</span>` : ''}
                    </div>
                  ` : ''}
                  <div class="mini">
                    ${(m.naturezaOperacao === 'sangria' || m.subtipo === 'sangria') ? `<span class="selo" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:9.5px;padding:1px 5px;font-weight:700;margin-right:3px">🏦 Sangria</span>` : ''}
                    ${(m.naturezaOperacao === 'suprimento' || m.subtipo === 'suprimento') ? `<span class="selo" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;font-size:9.5px;padding:1px 5px;font-weight:700;margin-right:3px">🪙 Suprimento</span>` : ''}
                    ${esc(m.cat || m.categoria || 'Geral')}
                  </div>
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
                <td>
                  ${typeof renderBadgeMeioPagamento === 'function'
                    ? renderBadgeMeioPagamento(m.forma || m.formaPagamento)
                    : `<span class="mono">${esc((m.forma || m.formaPagamento || 'dinheiro').toUpperCase())}</span>`}
                </td>
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

    <!-- 3. DRE OPERACIONAL (VISÃO GERENCIAL) -->
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900)">
            📊 DRE Operacional (Visão Gerencial)
          </div>
          <div class="mini">Demonstrativo de receitas e despesas operacionais puras, expurgando aportes e sangrias de tesouraria.</div>
        </div>
        <span class="selo ${dre.lucro >= 0 ? 'selo-bom' : 'selo-alerta'}" style="font-size:11px">
          ${dre.lucro >= 0 ? '🟢 Lucro Operacional' : '🔴 Prejuízo Operacional'}
        </span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:12px">
        <div style="background:rgba(16, 185, 129, 0.06);border:1px solid rgba(16, 185, 129, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:var(--verde)">Receita Operacional Bruta</div>
          <div style="font-size:18px;font-weight:800;color:var(--verde)" class="num">${typeof brl === 'function' ? brl(dre.recBruta) : dre.recBruta}</div>
          <div class="mini">${dre.qtdRec} entrada(s) operacionai(s)</div>
        </div>

        <div style="background:rgba(239, 68, 68, 0.06);border:1px solid rgba(239, 68, 68, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:var(--tijolo)">Despesas Operacionais</div>
          <div style="font-size:18px;font-weight:800;color:var(--tijolo)" class="num">${typeof brl === 'function' ? brl(dre.despOper) : dre.despOper}</div>
          <div class="mini">${dre.qtdDesp} saída(s) operacionai(s)</div>
        </div>

        <div style="background:rgba(245, 158, 11, 0.06);border:1px solid rgba(245, 158, 11, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:var(--alerta)">📦 Peças em OSs Ativas</div>
          <div style="font-size:18px;font-weight:800;color:var(--alerta)" class="num">${typeof brl === 'function' ? brl(dre.custoPecasAplicadasOS) : dre.custoPecasAplicadasOS}</div>
          <div class="mini">Custo alocado em OSs em curso</div>
        </div>

        <div style="background:${dre.lucro >= 0 ? 'rgba(37, 99, 235, 0.06)' : 'rgba(239, 68, 68, 0.06)'};border:1px solid ${dre.lucro >= 0 ? 'rgba(37, 99, 235, 0.3)' : 'rgba(239, 68, 68, 0.3)'};border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:${dre.lucro >= 0 ? '#1d4ed8' : 'var(--tijolo)'}">Resultado Líquido Operacional</div>
          <div style="font-size:18px;font-weight:800;color:${dre.lucro >= 0 ? '#1d4ed8' : 'var(--tijolo)'}" class="num">${typeof brl === 'function' ? brl(dre.lucro) : dre.lucro}</div>
          <div class="mini">Margem Operacional: <b>${dre.margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</b></div>
        </div>

        <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:var(--aco-700)">🏦 Tesouraria Neutra</div>
          <div style="font-size:13px;color:var(--aco-800);margin-top:2px">
            Suprimentos: <b class="num" style="color:var(--verde)">+${typeof brl === 'function' ? brl(dre.sup) : dre.sup}</b><br>
            Sangrias: <b class="num" style="color:var(--tijolo)">-${typeof brl === 'function' ? brl(dre.sang) : dre.sang}</b>
          </div>
          <div class="mini" style="margin-top:4px;color:var(--aco-500)">Saldo Líquido Tesouraria: ${typeof brl === 'function' ? brl(dre.saldoTesouraria) : dre.saldoTesouraria}</div>
        </div>
      </div>
    </div>

    <!-- 4. CONTROLES INTERNOS & AUDITORIA GERENCIAL -->
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

    <!-- 4. RADAR DE PENDÊNCIAS DE OS & LIBERAÇÃO FINANCEIRA DE PÁTIO -->
    ${typeof radarLiberacaoPatioHtml === 'function' ? radarLiberacaoPatioHtml() : ''}

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

/* ---------------- Radar de Liberação Financeira de Pátio & Faturamento de OS ---------------- */

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
  return { status: 'retido_pendente', label: '🟡 Retido (Saldo Pendente)', cor: '#854d0e', bg: '#fef9c3', borda: '#fef08a', total, totalPago, saldoRestante, totalFaturadoPrazo, titulosOS, liberacaoExcepcional: null };
}

function renderBadgeLiberacaoPatio(o) {
  const lib = calcularStatusLiberacaoOSFrontend(o);
  if (lib.total <= 0 && lib.status !== 'liberado_excepcional') return '';
  const tooltip = (lib.status === 'liberado_excepcional' && lib.liberacaoExcepcional)
    ? `Liberação Excepcional Auditada: ${typeof esc === 'function' ? esc(lib.liberacaoExcepcional.justificativa || 'Autorizado') : (lib.liberacaoExcepcional.justificativa || 'Autorizado')} (por ${typeof esc === 'function' ? esc(lib.liberacaoExcepcional.autorizadoPor || 'Admin') : (lib.liberacaoExcepcional.autorizadoPor || 'Admin')})`
    : `Total: ${typeof brl === 'function' ? brl(lib.total) : lib.total} | Pago: ${typeof brl === 'function' ? brl(lib.totalPago) : lib.totalPago} | Saldo: ${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}`;
  return `<span class="selo" style="background:${lib.bg};color:${lib.cor};border:1px solid ${lib.borda};font-size:10px;font-weight:700" title="${tooltip}">${lib.label}</span>`;
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

function folhaFaturarOS(osId) {
  const osList = Array.isArray(S.os) ? S.os : [];
  const o = osList.find(x => String(x.id) === String(osId) || String(x.num) === String(osId));
  if (!o) {
    return `<div class="card card-p"><p>OS #${esc(osId)} não encontrada.</p><button class="btn btn-secundario" onclick="fecharFolha()">Voltar</button></div>`;
  }

  const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
  const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
  const lib = calcularStatusLiberacaoOSFrontend(o);
  const hojeStr = typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10);
  const dataVencPadrao = typeof addDias === 'function' ? addDias(hojeStr, 30) : hojeStr;

  return `
  <div class="card card-p" style="max-width:540px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">📄 Faturar a Prazo — OS #${esc(o.num || o.id)}</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span><b>Cliente:</b> ${esc(c.fantasia || c.nome || 'Geral')}</span>
        <span><b>Veículo / Placa:</b> ${esc(v.placa || '—')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span>Total Orçado: <b>${typeof brl === 'function' ? brl(lib.total) : lib.total}</b></span>
        <span style="color:var(--verde)">Total Pago: <b>${typeof brl === 'function' ? brl(lib.totalPago) : lib.totalPago}</b></span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;border-top:1px dashed var(--aco-200);padding-top:6px;margin-top:6px">
        <span style="font-weight:700;color:var(--tijolo)">Saldo a Faturar:</span>
        <span style="font-weight:800;color:var(--tijolo)" class="num">${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Parcelas:</label>
          <select id="fat-parcelas" class="campo-select" style="width:100%;height:36px;font-weight:700">
            <option value="1">1x (Parcela Única)</option>
            <option value="2">2x Quinzenal / Mensal</option>
            <option value="3">3x Mensal</option>
            <option value="4">4x Mensal</option>
            <option value="6">6x Mensal</option>
            <option value="12">12x Mensal</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Meio de Pagamento:</label>
          <select id="fat-meio" class="campo-select" style="width:100%;height:36px;font-weight:700">
            <option value="boleto">Boleto Bancário</option>
            <option value="pix">PIX Parcelado</option>
            <option value="promissoria">Nota Promissória</option>
            <option value="cheque">Cheque Pré-datado</option>
            <option value="cartao_credito">Cartão de Crédito</option>
          </select>
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Data do Primeiro Vencimento:</label>
        <input type="date" id="fat-venc-inicial" class="campo-texto" value="${dataVencPadrao}" style="width:100%;height:36px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Observações / Condições Comerciais:</label>
        <textarea id="fat-obs" class="campo-texto" placeholder="Ex: Faturado para 30/60 dias conforme aprovação da diretoria" style="width:100%;height:54px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="
        const parc = document.getElementById('fat-parcelas').value;
        const meio = document.getElementById('fat-meio').value;
        const venc = document.getElementById('fat-venc-inicial').value;
        const obs = document.getElementById('fat-obs').value;
        faturarOSApi('${o.id || o.num}', parc, meio, venc, obs);
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Confirmar Faturamento a Prazo
      </button>
    </div>
  </div>`;
}

async function faturarOSApi(osId, parcelas, meioPagamento, vencimentoInicial, observacao) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/faturar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parcelas: Number(parcelas) || 1,
        meioPagamento: meioPagamento || 'boleto',
        vencimentoInicial,
        observacao
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao faturar OS a prazo');

    if (Array.isArray(data.titulos)) {
      S.contas = S.contas || [];
      data.titulos.forEach(tit => {
        const jaExiste = S.contas.some(c => c.id === tit.id);
        if (!jaExiste) S.contas.push(tit);
      });
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Faturamento a prazo concluído com sucesso!');
  } catch (err) {
    alert(`Falha no faturamento: ${err.message}`);
  }
}

function folhaBaixarTituloVeronica(contaId) {
  const contas = Array.isArray(S.contas) ? S.contas : [];
  const c = contas.find(x => String(x.id) === String(contaId));
  if (!c) {
    return `<div class="card card-p"><p>Título #${esc(contaId)} não encontrado.</p><button class="btn btn-secundario" onclick="fecharFolha()">Voltar</button></div>`;
  }

  const isReceber = c.tipo === 'receber';
  const hojeStr = typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10);

  return `
  <div class="card card-p" style="max-width:480px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">
        ${isReceber ? '🟢 Baixa de Título a Receber' : '🔴 Liquidação de Conta a Pagar'}
      </h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="font-weight:700;color:var(--aco-900);font-size:14px;margin-bottom:4px">
        ${esc(c.desc || c.descricao || 'Título Financeiro')}
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--aco-700);margin-bottom:4px">
        <span>Parte: <b>${esc(c.parte || '—')}</b></span>
        <span>Vencimento: <b>${typeof dataBR === 'function' ? dataBR(c.venc) : c.venc}</b></span>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--aco-200);padding-top:6px;margin-top:6px;font-size:15px">
        <span style="font-weight:700">Valor a Liquidar:</span>
        <span style="font-weight:800;color:${isReceber ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
          ${typeof brl === 'function' ? brl(c.valor) : c.valor}
        </span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Meio de Pagamento Utilizado:</label>
        <select id="liq-meio" class="campo-select" style="width:100%;height:36px;font-weight:700">
          <option value="dinheiro">Dinheiro Físico (Caixa)</option>
          <option value="pix" selected>PIX</option>
          <option value="cartao_debito">Cartão de Débito</option>
          <option value="cartao_credito">Cartão de Crédito</option>
          <option value="transferencia">Transferência Bancária (TED/DOC)</option>
          <option value="boleto">Boleto Liquidado</option>
        </select>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Data da Liquidação:</label>
        <input type="date" id="liq-data" class="campo-texto" value="${hojeStr}" style="width:100%;height:36px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="
        const meio = document.getElementById('liq-meio').value;
        const dt = document.getElementById('liq-data').value;
        liquidarTituloApi('${c.id}', meio, dt);
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Confirmar Liquidação no Caixa
      </button>
    </div>
  </div>`;
}

async function liquidarTituloApi(tituloId, meioPagamento, dataPagamento) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/titulos/${encodeURIComponent(tituloId)}/liquidar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        meioPagamento: meioPagamento || 'dinheiro',
        dataPagamento: dataPagamento || (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10))
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao liquidar título');

    if (data.titulo) {
      const idx = (S.contas || []).findIndex(c => String(c.id) === String(data.titulo.id));
      if (idx !== -1) S.contas[idx] = data.titulo;
    }
    if (data.movimentacao) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimentacao);
    }
    if (data.saldoCaixaAtual != null && Array.isArray(S.caixas)) {
      const cx = S.caixas.find(c => c.status === 'aberto');
      if (cx) cx.saldoAtual = data.saldoCaixaAtual;
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Título liquidado com sucesso!');
  } catch (err) {
    alert(`Falha na liquidação: ${err.message}`);
  }
}

function folhaLiberarSaidaExcepcional(osId) {
  const osList = Array.isArray(S.os) ? S.os : [];
  const o = osList.find(x => String(x.id) === String(osId) || String(x.num) === String(osId));
  if (!o) {
    return `<div class="card card-p"><p>OS #${typeof esc === 'function' ? esc(osId) : osId} não encontrada.</p><button class="btn btn-secundario" onclick="fecharFolha()">Voltar</button></div>`;
  }

  const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
  const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
  const lib = calcularStatusLiberacaoOSFrontend(o);

  return `
  <div class="card card-p" style="max-width:520px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">
        🔓 Liberação Excepcional de Pátio — OS #${typeof esc === 'function' ? esc(o.num || o.id) : (o.num || o.id)}
      </h3>
      <button class="btn-fechar" onclick="fecharFolha()">${typeof ico === 'function' ? ico('x', 18) : '✕'}</button>
    </div>

    <div style="background:rgba(147, 51, 234, 0.06);border:1px solid rgba(147, 51, 234, 0.3);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span><b>Cliente:</b> ${typeof esc === 'function' ? esc(c.fantasia || c.nome || 'Geral') : (c.fantasia || c.nome || 'Geral')}</span>
        <span><b>Veículo / Placa:</b> ${typeof esc === 'function' ? esc(v.placa || '—') : (v.placa || '—')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px dashed rgba(147, 51, 234, 0.3);padding-top:6px;margin-top:6px;font-size:14px">
        <span style="font-weight:700;color:var(--tijolo)">Saldo Pendente no Pátio:</span>
        <span style="font-weight:800;color:var(--tijolo)" class="num">${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="background:var(--aco-50);padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);color:var(--aco-700)">
        ⚠️ <b>Atenção RBAC:</b> Esta operação autoriza a saída física do veículo do pátio mesmo com saldo devedor. É restrita a <b>Donos e Administradores</b> e será registrada na trilha de auditoria contábil.
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Justificativa da Liberação (mínimo 5 caracteres):</label>
        <textarea id="lib-justificativa" class="campo-texto" placeholder="Ex: Autorizado pelo gestor para faturamento mensal no dia 25" style="width:100%;height:80px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="
        const just = document.getElementById('lib-justificativa').value;
        liberarSaidaPatioExcepcionalApi('${o.id || o.num}', just);
      " style="background:#6b21a8;border-color:#581c87;font-weight:700;padding:0 20px">
        ${typeof ico === 'function' ? ico('check', 14) : '✓'} Conceder Liberação Excepcional
      </button>
    </div>
  </div>`;
}

async function liberarSaidaPatioExcepcionalApi(osId, justificativa) {
  try {
    if (!justificativa || justificativa.trim().length < 5) {
      alert('A justificativa para liberação excepcional deve ter no mínimo 5 caracteres.');
      return;
    }
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/liberar-saida`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ forcarLiberacao: true, justificativa: justificativa.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Erro ao conceder liberação excepcional');

    const osList = Array.isArray(S.os) ? S.os : [];
    const target = osList.find(x => String(x.id || x.num) === String(osId));
    if (target) {
      target.statusLiberacaoPatio = 'liberado_excepcional';
      target.liberacaoExcepcional = data.liberacaoExcepcional;
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Liberação excepcional de pátio concedida com sucesso!');
  } catch (err) {
    alert(`Falha na liberação excepcional: ${err.message}`);
  }
}

function gerarTextoCobrancaFrontend(osId) {
  const osList = Array.isArray(S.os) ? S.os : [];
  const o = osList.find(x => String(x.id || x.num) === String(osId)) || {};
  const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
  const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
  const lib = calcularStatusLiberacaoOSFrontend(o);
  const cfg = S.cfg || {};

  const clienteNome = c.fantasia || c.nome || 'Cliente';
  const veiculoInfo = [v.marca, v.modelo, (v.placa ? `Placa ${v.placa}` : '')].filter(Boolean).join(' ') || (v.placa ? `Placa ${v.placa}` : 'Veículo');
  const nomeOficina = cfg.nomeOficina || cfg.empresa || cfg.nomeFantasia || 'Oficina';
  const chavePix = cfg.chavePix || cfg.pix || (cfg.financeiro && cfg.financeiro.chavePix) || 'financeiro@oficina.com.br';

  return `Olá, *${clienteNome}*! Aqui é da oficina *${nomeOficina}*.\n` +
    `Constatamos pendência financeira referente à OS *#${o.num || o.id || osId}* (*${veiculoInfo}*).\n` +
    `Valor total: ${typeof brl === 'function' ? brl(lib.total) : lib.total} | Saldo pendente: ${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}.\n` +
    `Chave Pix para quitação rápida: *${chavePix}*\n` +
    `Qualquer dúvida estamos à disposição!`;
}

function copiarAvisoCobranca(osId) {
  const texto = gerarTextoCobrancaFrontend(osId);
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(texto).then(() => {
      alert('📲 Texto de cobrança copiado com sucesso para a área de transferência! Cole no WhatsApp do cliente.');
    }).catch(() => {
      prompt('Copie o texto de cobrança abaixo:', texto);
    });
  } else {
    prompt('Copie o texto de cobrança abaixo:', texto);
  }
}

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.obterCaixaAbertoFrontend = obterCaixaAbertoFrontend;
  window.calcularPrevisaoFrontend = calcularPrevisaoFrontend;
  window.calcularControlesInternosFrontend = calcularControlesInternosFrontend;
  window.calcularDREFrontend = calcularDREFrontend;
  window.blocoVeronicaAnalista = blocoVeronicaAnalista;
  window.folhaAbrirCaixaVeronica = folhaAbrirCaixaVeronica;
  window.folhaLancamentoCaixaVeronica = folhaLancamentoCaixaVeronica;
  window.folhaFecharCaixaVeronica = folhaFecharCaixaVeronica;
  window.abrirCaixaApi = abrirCaixaApi;
  window.lancarMovimentoApi = lancarMovimentoApi;
  window.fecharCaixaApi = fecharCaixaApi;
  window.estornarMovimentoApi = estornarMovimentoApi;
  window.falarParecerVeronica = falarParecerVeronica;
  window.calcularStatusLiberacaoOSFrontend = calcularStatusLiberacaoOSFrontend;
  window.renderBadgeLiberacaoPatio = renderBadgeLiberacaoPatio;
  window.radarLiberacaoPatioHtml = radarLiberacaoPatioHtml;
  window.folhaFaturarOS = folhaFaturarOS;
  window.faturarOSApi = faturarOSApi;
  window.folhaBaixarTituloVeronica = folhaBaixarTituloVeronica;
  window.liquidarTituloApi = liquidarTituloApi;
  window.folhaLiberarSaidaExcepcional = folhaLiberarSaidaExcepcional;
  window.liberarSaidaPatioExcepcionalApi = liberarSaidaPatioExcepcionalApi;
  window.gerarTextoCobrancaFrontend = gerarTextoCobrancaFrontend;
  window.copiarAvisoCobranca = copiarAvisoCobranca;
}
