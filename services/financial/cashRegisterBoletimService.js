'use strict';

const financialEngine = require('../financialEngine');
const { arredondar, normalizarFormaPagamento, obterCaixaAberto } = require('./financialHelpers');

/**
 * Formata o texto do boletim de fechamento (ou resumo parcial) para WhatsApp
 */
function formatarBoletimFechamentoWhatsapp({
  caixaId,
  operadorNome,
  saldoInicial = 0,
  totalEntradas = 0,
  totalSaidas = 0,
  totalSangrias = 0,
  qtdSangrias = 0,
  totalSuprimentos = 0,
  qtdSuprimentos = 0,
  saldoEsperado = 0,
  diferenca = 0,
  statusConferencia = 'sem_conferencia_cega',
  resumoOrigem = {},
  totaisPorForma = {},
  dataFechamento,
  horaFechamento,
  isParcial = false
} = {}) {
  const agoraSP = financialEngine.obterAgoraSP();
  const d = dataFechamento || agoraSP.dataBR;
  const h = horaFechamento || agoraSP.horaBR;

  const titulo = isParcial ? 'FECHAMENTO PARCIAL DE CAIXA' : 'BOLETIM DE FECHAMENTO DE CAIXA';
  const iconeStatus = isParcial ? '⏳' : '🔒';

  let txt = `${iconeStatus} *${titulo}* ${iconeStatus}\n\n`;
  txt += `• *Turno:* #${caixaId || 'N/A'}\n`;
  txt += `• *Data/Hora:* ${d} às ${h}\n`;
  txt += `• *Operador:* ${operadorNome || 'Operador'}\n\n`;

  txt += `💰 *MOVIMENTAÇÃO FINANCEIRA:*\n`;
  txt += `• Fundo Inicial: ${financialEngine.formatarMoeda(saldoInicial)}\n`;
  txt += `• (+) Entradas: ${financialEngine.formatarMoeda(totalEntradas)}\n`;
  txt += `• (-) Saídas: ${financialEngine.formatarMoeda(totalSaidas)}\n`;
  txt += `• (=) Saldo Final: *${financialEngine.formatarMoeda(saldoEsperado)}*\n\n`;

  if (totalSuprimentos > 0 || totalSangrias > 0) {
    txt += `🏦 *TESOURARIA & MOVIMENTAÇÃO DE CAIXA:*\n`;
    if (totalSuprimentos > 0) {
      txt += `• 🪙 Suprimentos / Aportes: ${financialEngine.formatarMoeda(totalSuprimentos)} (${qtdSuprimentos || 1}x)\n`;
    }
    if (totalSangrias > 0) {
      txt += `• 🏦 Sangrias / Retiradas: ${financialEngine.formatarMoeda(totalSangrias)} (${qtdSangrias || 1}x)\n`;
    }
    txt += `\n`;
  }

  if (statusConferencia === 'quebra') {
    txt += `⚠️ *Conferência Cega:* Quebra de ${financialEngine.formatarMoeda(Math.abs(diferenca))}\n\n`;
  } else if (statusConferencia === 'sobra') {
    txt += `ℹ️ *Conferência Cega:* Sobra de ${financialEngine.formatarMoeda(diferenca)}\n\n`;
  } else if (statusConferencia === 'conferido') {
    txt += `✅ *Conferência Cega:* Valores 100% conciliados!\n\n`;
  }

  txt += `📊 *QUEBRA POR ORIGEM:*\n`;
  txt += `• 📱 *WhatsApp:* ${resumoOrigem.qtdWhatsapp || 0} lançamentos (${financialEngine.formatarMoeda(resumoOrigem.totalWhatsapp || 0)})\n`;
  txt += `• 💻 *Web / Balcão:* ${resumoOrigem.qtdWeb || 0} lançamentos (${financialEngine.formatarMoeda(resumoOrigem.totalWeb || 0)})\n`;
  if (resumoOrigem.qtdEstornados > 0) {
    txt += `• ↩️ *Estornos Realizados:* ${resumoOrigem.qtdEstornados} (${financialEngine.formatarMoeda(resumoOrigem.totalEstornados || 0)})\n`;
  }
  txt += `\n`;

  txt += `💳 *MEIOS DE PAGAMENTO:*\n`;
  const formasValidas = [
    { k: 'pix', l: 'Pix' },
    { k: 'dinheiro', l: 'Dinheiro' },
    { k: 'cartao_credito', l: 'Cartão de Crédito' },
    { k: 'cartao_debito', l: 'Cartão de Débito' },
    { k: 'boleto', l: 'Boleto' },
    { k: 'transferencia', l: 'Transferência' }
  ];

  let temForma = false;
  formasValidas.forEach(({ k, l }) => {
    const val = totaisPorForma[k];
    if (val !== undefined && Math.abs(val) > 0) {
      txt += `• ${l}: ${financialEngine.formatarMoeda(val)}\n`;
      temForma = true;
    }
  });
  if (!temForma) {
    txt += `• Em espécie / Saldo consolidado\n`;
  }

  txt += `─────────────────────────\n`;
  txt += isParcial ? `_Status: Caixa em operação._` : `_Status: Turno encerrado e imutável._`;

  return txt;
}

/**
 * Computa o resumo / fechamento parcial do turno de caixa atualmente aberto
 */
function obterResumoFechamentoParcial(state = {}, tenantId = 'default') {
  const caixaAberto = obterCaixaAberto(state, tenantId);
  if (!caixaAberto) {
    return { ok: false, code: 'CAIXA_FECHADO', error: 'Não há nenhum turno de caixa aberto no momento.' };
  }

  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];
  const movsCaixa = movimentos.filter(m =>
    (m.caixaId === caixaAberto.id) ||
    (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id))
  );

  const totaisPorForma = {
    dinheiro: 0,
    pix: 0,
    cartao: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    boleto: 0,
    transferencia: 0,
    outros: 0
  };

  let totalEntradas = 0;
  let totalSaidas = 0;
  let totalSangrias = 0;
  let qtdSangrias = 0;
  let totalSuprimentos = 0;
  let qtdSuprimentos = 0;
  const resumoOrigem = {
    totalWhatsapp: 0,
    qtdWhatsapp: 0,
    totalWeb: 0,
    qtdWeb: 0,
    totalEstornados: 0,
    qtdEstornados: 0
  };

  for (const m of movsCaixa) {
    const val = Number(m.valor) || 0;
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);
    const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));

    if (!m.estornado) {
      if (nat === 'sangria' || m.subtipo === 'sangria') {
        qtdSangrias++;
        totalSangrias = arredondar(totalSangrias + val);
      } else if (nat === 'suprimento' || m.subtipo === 'suprimento') {
        qtdSuprimentos++;
        totalSuprimentos = arredondar(totalSuprimentos + val);
      }
    }

    if (m.tipo === 'entrada') {
      totalEntradas = arredondar(totalEntradas + val);
      totaisPorForma[f] = arredondar((totaisPorForma[f] || 0) + val);
    } else {
      totalSaidas = arredondar(totalSaidas + val);
      totaisPorForma[f] = arredondar((totaisPorForma[f] || 0) - val);
    }

    if (m.estornado) {
      resumoOrigem.qtdEstornados++;
      resumoOrigem.totalEstornados = arredondar(resumoOrigem.totalEstornados + val);
    }
    if (m.origem === 'whatsapp') {
      resumoOrigem.qtdWhatsapp++;
      resumoOrigem.totalWhatsapp = arredondar(resumoOrigem.totalWhatsapp + val);
    } else {
      resumoOrigem.qtdWeb++;
      resumoOrigem.totalWeb = arredondar(resumoOrigem.totalWeb + val);
    }
  }

  const saldoInicial = Number(caixaAberto.saldoInicial) || 0;
  const saldoEsperado = arredondar(saldoInicial + totalEntradas - totalSaidas);
  const agoraInfo = financialEngine.obterAgoraSP();

  const boletimTexto = formatarBoletimFechamentoWhatsapp({
    caixaId: caixaAberto.id,
    operadorNome: caixaAberto.abertoPorNome || caixaAberto.abertoPor || 'Operador',
    saldoInicial,
    totalEntradas,
    totalSaidas,
    totalSangrias,
    qtdSangrias,
    totalSuprimentos,
    qtdSuprimentos,
    saldoEsperado,
    diferenca: 0,
    statusConferencia: 'parcial',
    resumoOrigem,
    totaisPorForma,
    dataFechamento: agoraInfo.dataBR,
    horaFechamento: agoraInfo.horaBR,
    isParcial: true
  });

  return {
    ok: true,
    caixa: caixaAberto,
    saldoInicial,
    totalEntradas,
    totalSaidas,
    totalSangrias,
    qtdSangrias,
    totalSuprimentos,
    qtdSuprimentos,
    saldoAtual: saldoEsperado,
    resumoOrigem,
    totaisPorForma,
    resumoTextoWhatsapp: boletimTexto
  };
}

module.exports = {
  formatarBoletimFechamentoWhatsapp,
  obterResumoFechamentoParcial
};
