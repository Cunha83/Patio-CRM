'use strict';

const {
  dataISO,
  formatarDataBR,
  formatarMoeda,
  obterIntervaloFiltro
} = require('./engineHelpers');

/**
 * Consolida o Demonstrativo do Resultado do Exercício (DRE Operacional Simplificado)
 */
function calcularDRESimplificado(state = {}, options = {}) {
  const filtro = options.filtro || '30d';
  const dataRef = options.dataRef || dataISO();
  const { de, ate } = obterIntervaloFiltro(filtro, dataRef, options.customDe, options.customAte);

  const movimentos = Array.isArray(state.movimentos) ? state.movimentos : [];

  let receitaOperacionalBruta = 0;
  let despesasOperacionais = 0;
  let totalSuprimentos = 0;
  let totalSangrias = 0;
  let totalEstornosCompensatorios = 0;
  let qtdReceitas = 0;
  let qtdDespesas = 0;

  for (const m of movimentos) {
    const d = (m.data || '').slice(0, 10);
    if (d && (d < de || d > ate)) continue;

    if (m.estornado) continue;

    const val = Number(m.valor) || 0;
    const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));

    if (nat === 'suprimento' || m.subtipo === 'suprimento') {
      totalSuprimentos = +(totalSuprimentos + val).toFixed(2);
    } else if (nat === 'sangria' || m.subtipo === 'sangria') {
      totalSangrias = +(totalSangrias + val).toFixed(2);
    } else if (nat === 'estorno' || m.estornoDeId || m.subtipo === 'estorno') {
      totalEstornosCompensatorios = +(totalEstornosCompensatorios + val).toFixed(2);
    } else {
      if (m.tipo === 'entrada' || m.tipo === 'receita') {
        receitaOperacionalBruta = +(receitaOperacionalBruta + val).toFixed(2);
        qtdReceitas++;
      } else if (m.tipo === 'saida' || m.tipo === 'despesa') {
        despesasOperacionais = +(despesasOperacionais + val).toFixed(2);
        qtdDespesas++;
      } else if ((m.cat || m.categoria) && Array.isArray(state.cfg?.planoDeContas)) {
        const catNome = String(m.cat || m.categoria).toLowerCase();
        const conta = state.cfg.planoDeContas.find(c => typeof c === 'object' && c.nome && c.nome.toLowerCase() === catNome);
        if (conta?.tipo === 'receita') {
          receitaOperacionalBruta = +(receitaOperacionalBruta + val).toFixed(2);
          qtdReceitas++;
        } else {
          despesasOperacionais = +(despesasOperacionais + val).toFixed(2);
          qtdDespesas++;
        }
      }
    }
  }

  const resultadoOperacionalLiquido = +(receitaOperacionalBruta - despesasOperacionais).toFixed(2);
  const margemOperacionalPercentual = receitaOperacionalBruta > 0
    ? +((resultadoOperacionalLiquido / receitaOperacionalBruta) * 100).toFixed(2)
    : 0;

  return {
    periodo: { de, ate, filtro },
    receitaOperacionalBruta,
    despesasOperacionais,
    resultadoOperacionalLiquido,
    margemOperacionalPercentual,
    lucro: resultadoOperacionalLiquido >= 0,
    qtdReceitas,
    qtdDespesas,
    movimentacaoTesourariaNeutra: {
      totalSuprimentos,
      totalSangrias,
      saldoTesouraria: +(totalSuprimentos - totalSangrias).toFixed(2)
    }
  };
}

/**
 * Formata o DRE simplificado para exibição elegante no WhatsApp
 */
function formatarDREWhatsapp(dre, state = {}) {
  const nomeAssistente = state.cfg?.assistente?.displayName || 'Verônica';
  const rec = formatarMoeda(dre.receitaOperacionalBruta);
  const desp = formatarMoeda(dre.despesasOperacionais);
  const res = formatarMoeda(dre.resultadoOperacionalLiquido);
  const margem = (Number(dre.margemOperacionalPercentual) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const sup = formatarMoeda(dre.movimentacaoTesourariaNeutra.totalSuprimentos);
  const sang = formatarMoeda(dre.movimentacaoTesourariaNeutra.totalSangrias);
  const iconeResultado = dre.lucro ? '🟢 *LUCRO OPERACIONAL*' : '🔴 *PREJUÍZO OPERACIONAL*';
  const linhaPecas = (Number(dre.custoPecasAplicadasOS) > 0) ? `📦 *Custo de Peças em OSs Ativas:* ${formatarMoeda(dre.custoPecasAplicadasOS)}\n` : '';

  return `📊 *DEMONSTRATIVO DE RESULTADO OPERACIONAL (DRE)*\n` +
    `🤖 *Assistente:* ${nomeAssistente}\n` +
    `📅 *Período:* ${formatarDataBR(dre.periodo.de)} até ${formatarDataBR(dre.periodo.ate)}\n` +
    `════════════════════════════\n\n` +
    `➕ *Receita Operacional Bruta:* ${rec} (${dre.qtdReceitas} entradas)\n` +
    `➖ *Despesas Operacionais:* ${desp} (${dre.qtdDespesas} saídas)\n` +
    linhaPecas +
    `────────────────────────────\n` +
    `${iconeResultado}: *${res}*\n` +
    `📈 *Margem Operacional:* *${margem}*\n\n` +
    `🏦 *Movimentação de Tesouraria (Neutra):*\n` +
    `• Suprimentos (Aportes): ${sup}\n` +
    `• Sangrias (Retiradas): ${sang}\n` +
    `_(Valores de tesouraria não afetam o resultado das operações.)_`;
}

/**
 * Gera mensagem padronizada amigável para envio de cobrança / lembrete de pendência via WhatsApp
 */
function gerarTextoCobrancaOS(state = {}, osId, options = {}) {
  const osNorm = String(osId || '').replace(/^#/, '').trim();
  if (!osNorm) {
    return { ok: false, error: 'OS_ID_OBRIGATORIO', message: 'Identificador da OS não informado.' };
  }

  const osList = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];

  const o = osList.find(x => {
    const id = String(x.id || '').replace(/^#/, '').trim();
    const num = String(x.num || x.numero || '').replace(/^#/, '').trim();
    return id === osNorm || num === osNorm;
  }) || {};
  const v = veiculos.find(x => x && (x.id === o.vei || x.placa === o.placa)) || {};
  const c = clientes.find(x => x && (x.id === o.cli || x.nome === o.cliente)) || {};

  const clienteNome = options.clienteNome || c.fantasia || c.nome || o.cliente || 'Cliente';
  const veiculoInfo = options.veiculo || [v.marca, v.modelo, (v.placa || o.placa ? `Placa ${v.placa || o.placa}` : '')].filter(Boolean).join(' ') || (v.placa || o.placa ? `Placa ${v.placa || o.placa}` : 'Veículo');
  const nomeOficina = state.cfg?.nomeOficina || state.cfg?.empresa || state.cfg?.nomeFantasia || 'Oficina';
  const chavePix = options.chavePix || state.cfg?.chavePix || state.cfg?.pix || state.cfg?.financeiro?.chavePix || 'financeiro@oficina.com.br';

  let valorTotal = Number(options.totalOrcado);
  let saldoPendente = Number(options.saldoRestante);

  if (isNaN(valorTotal) || isNaN(saldoPendente)) {
    valorTotal = Number(o.total || o.valorTotal || o.totalGeral || 0);
    const movs = Array.isArray(state.movimentos) ? state.movimentos : [];
    const movsOS = movs.filter(m => !m.estornado && (
      String(m.osId) === osNorm || String(m.osNum) === osNorm || (m.desc && m.desc.includes(`OS #${osNorm}`))
    ));
    const totalPago = movsOS.filter(m => m.tipo === 'entrada' || m.tipo === 'receita').reduce((a, b) => a + (Number(b.valor) || 0), 0);
    saldoPendente = Math.max(0, +(valorTotal - totalPago).toFixed(2));
  }

  const texto = `Olá, *${clienteNome}*! Aqui é da oficina *${nomeOficina}*.\n` +
    `Constatamos pendência financeira referente à OS *#${osNorm}* (*${veiculoInfo}*).\n` +
    `Valor total: ${formatarMoeda(valorTotal)} | Saldo pendente: ${formatarMoeda(saldoPendente)}.\n` +
    `Chave Pix para quitação rápida: *${chavePix}*\n` +
    `Qualquer dúvida estamos à disposição!`;

  return {
    ok: true,
    osId: osNorm,
    clienteNome,
    veiculoInfo,
    nomeOficina,
    chavePix,
    valorTotal,
    saldoRestante: saldoPendente,
    textoCobranca: texto
  };
}

module.exports = {
  calcularDRESimplificado,
  formatarDREWhatsapp,
  gerarTextoCobrancaOS
};

