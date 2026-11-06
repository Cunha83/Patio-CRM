/* PÁTIO CRM — ANALISTA FINANCEIRA: COMPONENTES & CARDS DE KPI (Caixa Diário, Forecast e DRE) */

function renderCardGestaoCaixaVeronica(caixaAberto, movimentosCaixa) {
  return `
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
            <div style="font-weight:800;font-size:17px;color:#1d4ed8" class="num">${brl(caixaAberto.saldoAtual != null ? caixaAberto.saldoAtual : (typeof saldoCaixa === 'function' ? saldoCaixa() : 0))}</div>
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
  `;
}

function renderCardPrevisaoVeronica(prev) {
  return `
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900)">
            📈 Previsão de Fluxo de Caixa (7, 15 e 30 Dias)
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
  `;
}

function renderCardDREVeronica(dre) {
  return `
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
  `;
}

if (typeof window !== 'undefined') {
  window.renderCardGestaoCaixaVeronica = renderCardGestaoCaixaVeronica;
  window.renderCardPrevisaoVeronica = renderCardPrevisaoVeronica;
  window.renderCardDREVeronica = renderCardDREVeronica;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderCardGestaoCaixaVeronica = renderCardGestaoCaixaVeronica;
  globalThis.renderCardPrevisaoVeronica = renderCardPrevisaoVeronica;
  globalThis.renderCardDREVeronica = renderCardDREVeronica;
}
