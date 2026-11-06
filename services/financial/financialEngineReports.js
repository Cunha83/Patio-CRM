'use strict';

const {
  FUSO_HORARIO_PADRAO,
  formatarMoeda,
  obterAgoraSP
} = require('./engineHelpers');
const {
  calcularKPIsFinanceiros,
  calcularResumoOperacional
} = require('./financialEngineKpis');
const {
  gerarSeriesGraficos
} = require('./financialEngineCharts');

function obterDashboardFinanceiro(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const kpis = calcularKPIsFinanceiros(state, { ...options, dataRef: agoraSP.dataISO });
  const graficos = gerarSeriesGraficos(state, { ...options, dataRef: agoraSP.dataISO });
  const operacional = calcularResumoOperacional(state, { ...options, dataRef: agoraSP.dataISO });
  const cfg = state.cfg || {};

  return {
    empresa: cfg.empresa || 'Pátio Diesel & Hidráulica',
    cnpj: cfg.cnpj || '',
    kpis,
    resumoOrigem: kpis.resumoOrigem,
    graficos,
    operacional,
    meta: {
      geradoEm: new Date().toISOString(),
      fuso: FUSO_HORARIO_PADRAO,
      dataRef: agoraSP.dataISO,
      versao: state.versao || 1
    }
  };
}

function gerarRelatorioExecutivo(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const cfg = state.cfg || {};
  const fin = calcularKPIsFinanceiros(state, { ...options, dataRef: dHoje, filtro: 'hoje' });
  const op = calcularResumoOperacional(state, { ...options, dataRef: dHoje });

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let texto =
`📊 *PÁTIO CRM — RELATÓRIO EXECUTIVO MATINAL* 🚛⚙️
📅 *Data:* ${dataFormatada} às ${horaFormatada}
🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'}

════════════════════════════
💰 *1. POSIÇÃO DE CAIXA & FLUXO*
════════════════════════════
💵 *Saldo Consolidado:* *${formatarMoeda(fin.saldoConsolidado)}*

📅 *Vencimentos de Hoje (${dataFormatada.slice(0, 5)}):*
• 🟢 *A Receber:* ${formatarMoeda(fin.totalRecHoje)} (${fin.qtdRecHoje} títulos)
• 🔴 *A Pagar:* ${formatarMoeda(fin.totalPagHoje)} (${fin.qtdPagHoje} contas)
• ⚖️ *Resultado Líquido do Dia:* ${fin.liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(fin.liquidoHoje)}

🗓️ *Projeção dos Próximos 7 Dias (Semana):*
• 📈 *A Receber na Semana:* ${formatarMoeda(fin.totRec7d)} (${fin.totRec7d > 0 ? 'em aberto' : '0 títulos'})
• 📉 *A Pagar na Semana:* ${formatarMoeda(fin.totPag7d)} (${fin.totPag7d > 0 ? 'em aberto' : '0 contas'})
• 🏦 *Saldo Previsto ao Fim da Semana:* *${formatarMoeda(fin.saldoPrevisto7d)}*
`;

  if (fin.qtdRecVencidos > 0) {
    texto += `⚠️ *Atenção Cobrança:* ${fin.qtdRecVencidos} título(s) de clientes vencidos em aberto (${formatarMoeda(fin.totalRecVencidos)}).\n`;
  }

  texto +=
`\n════════════════════════════
🚛 *2. OCUPAÇÃO DO PÁTIO & BOXES*
════════════════════════════
• 🚚 *Total de Caminhões no Pátio:* ${op.totalOSAtivas}
• 🔧 *Boxes Ocupados:* ${op.boxesOcupados} de ${op.totalBoxes} (${op.percOcupacao}% capacidade)
• ⏳ *Aguardando na Fila de Triagem:* ${op.naFila}

════════════════════════════
🌅 *3. VEÍCULOS QUE AMANHECERAM NA OFICINA*
════════════════════════════
`;

  if (op.listaAmanhecidos.length === 0) {
    if (op.boxesOcupados === 0) {
      texto += `_Nenhum veículo amanheceu no pátio hoje. Capacidade 100% livre para novos atendimentos!_\n`;
    } else {
      texto += `_Nenhum veículo amanheceu no pátio nesta data. Ocupação atual: ${op.boxesOcupados} de ${op.totalBoxes} boxes ocupados (${op.percOcupacao}%)._\n`;
    }
  } else {
    op.listaAmanhecidos.forEach(item => {
      texto += `${item.idx}️⃣ *${item.placa}* — ${item.modelo} (${item.clienteNome})\n`;
      texto += `   📍 *Local:* ${item.boxNome} | 👨‍🔧 ${item.mecanico} | ⏳ *No pátio há:* ${item.diasNoPatio} dia(s)\n`;
      texto += `   🔧 *Serviço:* ${item.servico}\n`;
      texto += `   📌 *Status:* *${statusEmojis[item.status] || item.status}*\n`;
      if (item.obsPeca) {
        texto += `   🚨 *Atenção Fornecedor:* _${item.obsPeca}_\n`;
      }
      if (item.previsao) {
        texto += `   🎯 _Previsão de Entrega: ${item.previsao}_\n`;
      }
      texto += `\n`;
    });
  }

  texto +=
`════════════════════════════
_📱 Relatório gerado automaticamente pelo Pátio CRM._
_💡 Comandos rápidos para admin: *!relatorio*, *!caixa* ou *!patio*_`;

  return {
    texto,
    financeiro: fin,
    operacional: op,
    indicadores: {
      data: dHoje,
      saldoCaixa: fin.saldoConsolidado,
      totRecHoje: fin.totalRecHoje,
      totPagHoje: fin.totalPagHoje,
      liquidoHoje: fin.liquidoHoje,
      totRecSemana: fin.totRec7d,
      totPagSemana: fin.totPag7d,
      saldoPrevistoSemana: fin.saldoPrevisto7d,
      totVencidosRec: fin.totalRecVencidos,
      totalOSAtivas: op.totalOSAtivas,
      boxesOcupados: op.boxesOcupados,
      totalBoxes: op.totalBoxes,
      naFila: op.naFila,
      totalAmanhecidos: op.totalAmanhecidos
    }
  };
}

function gerarMensagensAdmin(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const rel = gerarRelatorioExecutivo(state, { ...options, dataRef: dHoje });
  const fin = rel.financeiro;
  const op = rel.operacional;
  const cfg = state.cfg || {};

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let msg1 = `📊 *[1/3] PÁTIO CRM — POSIÇÃO DE CAIXA & FLUXO* 💰\n` +
    `🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'} | 📅 *${dataFormatada}* às *${horaFormatada}*\n\n` +
    `💵 *Saldo Consolidado em Caixa:* *${formatarMoeda(fin.saldoConsolidado)}*\n\n` +
    `📅 *Vencimentos de Hoje (${dataFormatada.slice(0, 5)}):*\n` +
    `• 🟢 *A Receber:* ${formatarMoeda(fin.totalRecHoje)} (${fin.qtdRecHoje} títulos)\n` +
    `• 🔴 *A Pagar:* ${formatarMoeda(fin.totalPagHoje)} (${fin.qtdPagHoje} contas)\n` +
    `• ⚖️ *Resultado Líquido do Dia:* ${fin.liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(fin.liquidoHoje)}\n\n` +
    `🗓️ *Projeção dos Próximos 7 Dias (Semana):*\n` +
    `• 📈 *A Receber na Semana:* ${formatarMoeda(fin.totRec7d)}\n` +
    `• 📉 *A Pagar na Semana:* ${formatarMoeda(fin.totPag7d)}\n` +
    `• 🏦 *Saldo Previsto ao Fim da Semana:* *${formatarMoeda(fin.saldoPrevisto7d)}*\n`;
  if (fin.qtdRecVencidos > 0) {
    msg1 += `⚠️ *Atenção Cobrança:* Títulos de clientes vencidos em aberto: *${formatarMoeda(fin.totalRecVencidos)}*.\n`;
  }

  let msg2 = `🚛 *[2/3] PÁTIO CRM — OCUPAÇÃO DO PÁTIO & BOXES* ⚙️\n\n` +
    `• 🚚 *Total de Caminhões no Pátio:* ${op.totalOSAtivas}\n` +
    `• 🔧 *Boxes Ocupados:* ${op.boxesOcupados} de ${op.totalBoxes} (${op.percOcupacao}% da capacidade)\n` +
    `• ⏳ *Aguardando na Fila de Triagem:* ${op.naFila} caminhões\n`;

  let msg3 = `🌅 *[3/3] PÁTIO CRM — CAMINHÕES QUE AMANHECERAM* 🚛\n` +
    `Prioridades de atendimento para o dia de hoje:\n\n`;

  if (op.listaAmanhecidos.length === 0) {
    if (op.boxesOcupados === 0) {
      msg3 += `_Nenhum veículo amanheceu no pátio. Todos os boxes livres para novos atendimentos!_\n`;
    } else {
      msg3 += `_Nenhum veículo amanheceu no pátio. Ocupação atual: ${op.boxesOcupados} de ${op.totalBoxes} boxes ocupados (${op.percOcupacao}%)._\n`;
    }
  } else {
    op.listaAmanhecidos.forEach((item) => {
      msg3 += `${item.idx}️⃣ *${item.placa}* — ${item.modelo} (${item.clienteNome})\n` +
        `   📍 *Local:* ${item.boxNome} | 👨‍🔧 ${item.mecanico} | ⏳ *No pátio há:* ${item.diasNoPatio} dia(s)\n` +
        `   🔧 *Serviço:* ${item.servico}\n` +
        `   📌 *Status:* *${statusEmojis[item.status] || item.status}*\n`;

      if (item.obsPeca) {
        msg3 += `   🚨 *Atenção Fornecedor:* _${item.obsPeca}_\n`;
      }
      if (item.previsao) {
        msg3 += `   🎯 _Previsão de Entrega: ${item.previsao}_\n`;
      }
      msg3 += `\n`;
    });
  }
  msg3 += `════════════════════════════\n_💡 Comandos para Admin: *!relatorio*, *!caixa*, *!patio* ou *!ajuda*_`;

  return [msg1, msg2, msg3];
}

function gerarMensagensOperacao(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const op = calcularResumoOperacional(state, { ...options, dataRef: dHoje });
  const cfg = state.cfg || {};

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let msg1 = `🚛 *[1/2] PÁTIO OPERACIONAL — OCUPAÇÃO DOS BOXES* ⚙️\n` +
    `🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'} | 📅 *${dataFormatada}* às *${horaFormatada}*\n\n` +
    `• 🚚 *Total de Caminhões em Atendimento:* ${op.totalOSAtivas}\n` +
    `• 🔧 *Boxes Ocupados:* ${op.boxesOcupados} de ${op.totalBoxes} (${op.percOcupacao}% da capacidade produtiva)\n` +
    `• ⏳ *Aguardando na Fila de Triagem:* ${op.naFila} caminhões\n\n` +
    `_Lembrete equipe: mantenham os status dos boxes atualizados ao liberar veículos!_`;

  let msg2 = `🌅 *[2/2] PÁTIO OPERACIONAL — VEÍCULOS QUE AMANHECERAM* 🚛\n` +
    `Relação de veículos que passaram a noite na oficina para priorização do dia:\n\n`;

  if (op.listaAmanhecidos.length === 0) {
    if (op.boxesOcupados === 0) {
      msg2 += `_Nenhum veículo amanheceu no pátio. Todos os boxes livres para novas entradas!_\n`;
    } else {
      msg2 += `_Nenhum veículo amanheceu no pátio. Pátio operando com ${op.boxesOcupados} de ${op.totalBoxes} boxes ocupados (${op.percOcupacao}%)._\n`;
    }
  } else {
    op.listaAmanhecidos.forEach((item) => {
      msg2 += `${item.idx}️⃣ *${item.placa}* — ${item.modelo} (${item.clienteNome})\n` +
        `   📍 *Local:* ${item.boxNome} | 👨‍🔧 ${item.mecanico}\n` +
        `   ⏳ *No pátio há:* ${item.diasNoPatio} dia(s)\n` +
        `   🔧 *Serviço:* ${item.servico}\n` +
        `   📌 *Status:* *${statusEmojis[item.status] || item.status}*\n`;

      if (item.obsPeca) {
        msg2 += `   ⚠️ *Peça Pendente:* _${item.obsPeca}_\n`;
      }
      if (item.previsao) {
        msg2 += `   🎯 _Previsão de Entrega: ${item.previsao}_\n`;
      }
      msg2 += `\n`;
    });
  }

  msg2 += `════════════════════════════\n` +
    `_💡 Comandos no grupo: *!patio*, *Status [placa]*, *Abrir OS [placa]* ou envie foto da placa_`;

  return [msg1, msg2];
}

function gerarResumoCaixa(state = {}, options = {}) {
  const agoraSP = obterAgoraSP(options.dataRef);
  const rel = gerarRelatorioExecutivo(state, options);
  const fin = rel.financeiro;
  const d = agoraSP.dataBR;
  return `💰 *POSIÇÃO FINANCEIRA RÁPIDA (${d})* 🚛\n\n` +
    `💵 *Saldo em Caixa:* *${formatarMoeda(fin.saldoConsolidado)}*\n\n` +
    `📅 *Hoje:* A Receber ${formatarMoeda(fin.totalRecHoje)} | A Pagar ${formatarMoeda(fin.totalPagHoje)}\n` +
    `🗓️ *Semana (7d):* A Receber ${formatarMoeda(fin.totRec7d)} | A Pagar ${formatarMoeda(fin.totPag7d)}\n` +
    `🏦 *Saldo Projetado ao Fim da Semana:* *${formatarMoeda(fin.saldoPrevisto7d)}*\n\n` +
    `_Digite *!relatorio* para a visão executiva completa._`;
}

function gerarResumoPatio(state = {}, options = {}) {
  const rel = gerarRelatorioExecutivo(state, options);
  const op = rel.operacional;
  return `🚛 *OCUPAÇÃO ATUAL DO PÁTIO* ⚙️\n\n` +
    `• Total de Caminhões na Oficina: *${op.totalOSAtivas}*\n` +
    `• Boxes Ocupados: *${op.boxesOcupados} de ${op.totalBoxes}*\n` +
    `• Caminhões na Fila de Espera: *${op.naFila}*\n` +
    `• Amanheceram na Oficina: *${op.totalAmanhecidos}*\n\n` +
    `_Digite *!relatorio* para ver os detalhes de cada caminhão e serviços._`;
}

module.exports = {
  obterDashboardFinanceiro,
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio
};

