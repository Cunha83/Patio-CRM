'use strict';

/**
 * Pátio CRM — Motor de Cálculo Analítico de Borderô de Frotas
 * Arquitetura Modular (< 250 linhas).
 */

// Extrai e segrega valores de mão de obra e peças de uma OS, com suporte a veículos articulados
function extrairTotaisOS(os) {
  const servicos = Array.isArray(os.servicos) ? os.servicos : [];
  const pecas = Array.isArray(os.pecas) ? os.pecas : [];

  const totalMaoDeObra = servicos.reduce((acc, s) => acc + (Number(s.valor || s.preco || 0)), 0);
  const totalPecas = pecas.reduce((acc, p) => acc + (Number(p.total != null ? p.total : ((p.valor || p.preco || 0) * (p.qtd || 1)))), 0);
  const totalOS = Math.round((totalMaoDeObra + totalPecas) * 100) / 100;

  // Discriminação de conjuntos articulados (Cavalo vs Carreta)
  const discriminacaoArticulado = [];
  const cavaloSrvs = servicos.filter(s => s.alvo === 'cavalo' || (!s.alvo && os.veiculo?.tipo === 'articulado'));
  const carretaSrvs = servicos.filter(s => s.alvo === 'carreta');

  if (cavaloSrvs.length > 0) {
    const vCavalo = cavaloSrvs.reduce((acc, s) => acc + Number(s.valor || 0), 0);
    discriminacaoArticulado.push({
      alvo: 'cavalo',
      placa: cavaloSrvs[0]?.placaAlvo || os.conjuntoArticulado?.cavalo?.placa || os.veiculo?.placa || '',
      servicos: cavaloSrvs.map(s => ({ desc: s.desc, valor: s.valor })),
      total: Math.round(vCavalo * 100) / 100
    });
  }

  if (carretaSrvs.length > 0) {
    const vCarreta = carretaSrvs.reduce((acc, s) => acc + Number(s.valor || 0), 0);
    discriminacaoArticulado.push({
      alvo: 'carreta',
      placa: carretaSrvs[0]?.placaAlvo || os.conjuntoArticulado?.carretas?.[0]?.placa || '',
      servicos: carretaSrvs.map(s => ({ desc: s.desc, valor: s.valor })),
      total: Math.round(vCarreta * 100) / 100
    });
  }

  return {
    osId: os.id,
    num: os.num || os.numero,
    placa: os.veiculo?.placa || os.placa || 'SEM_PLACA',
    modelo: os.veiculo?.modelo || os.modelo || '',
    fechamento: os.fechamento || os.data || '',
    totalMaoDeObra: Math.round(totalMaoDeObra * 100) / 100,
    totalPecas: Math.round(totalPecas * 100) / 100,
    totalOS,
    discriminacaoArticulado
  };
}

// Calcula totais consolidados, descontos e retenções contratuais (ISSQN, IRRF, INSS)
function calcularResumoTotais({ itensOS = [], descontoGeral = 0, retencoes = {} }) {
  const totalMaoDeObra = itensOS.reduce((acc, it) => acc + it.totalMaoDeObra, 0);
  const totalPecas = itensOS.reduce((acc, it) => acc + it.totalPecas, 0);
  const subtotalBruto = Math.round((totalMaoDeObra + totalPecas) * 100) / 100;
  const desc = Math.min(subtotalBruto, Math.max(0, Number(descontoGeral) || 0));

  let totalRetencoes = 0;
  const retencoesDetalhadas = {};

  if (retencoes && typeof retencoes === 'object') {
    // ISS sobre mão de obra
    if (retencoes.iss) {
      const vIss = Math.round(totalMaoDeObra * (Number(retencoes.iss) / 100) * 100) / 100;
      retencoesDetalhadas.iss = vIss;
      totalRetencoes += vIss;
    }
    // IRRF sobre total bruto
    if (retencoes.irrf) {
      const vIrrf = Math.round(subtotalBruto * (Number(retencoes.irrf) / 100) * 100) / 100;
      retencoesDetalhadas.irrf = vIrrf;
      totalRetencoes += vIrrf;
    }
    // INSS sobre mão de obra
    if (retencoes.inss) {
      const vInss = Math.round(totalMaoDeObra * (Number(retencoes.inss) / 100) * 100) / 100;
      retencoesDetalhadas.inss = vInss;
      totalRetencoes += vInss;
    }
    // Retenção fixa em valor
    if (retencoes.outrasFixas) {
      const vOutras = Math.round(Number(retencoes.outrasFixas) * 100) / 100;
      retencoesDetalhadas.outrasFixas = vOutras;
      totalRetencoes += vOutras;
    }
  }

  totalRetencoes = Math.round(totalRetencoes * 100) / 100;
  const totalLiquido = Math.max(0, Math.round((subtotalBruto - desc - totalRetencoes) * 100) / 100);

  return {
    totalMaoDeObra: Math.round(totalMaoDeObra * 100) / 100,
    totalPecas: Math.round(totalPecas * 100) / 100,
    subtotalBruto,
    descontoGeral: desc,
    retencoes: retencoesDetalhadas,
    totalRetencoes,
    totalLiquido
  };
}

// Adiciona dias a uma data no formato YYYY-MM-DD
function adicionarDias(dataStr, dias) {
  const d = dataStr ? new Date(dataStr) : new Date();
  d.setDate(d.getDate() + Number(dias));
  return d.toISOString().split('T')[0];
}

// Desdobra parcelas com datas de vencimento e valores com ajuste de centavos
function gerarDesdobramentoParcelas({ totalLiquido, condicaoPagamento = '30ddl', dataBase = new Date().toISOString() }) {
  const total = Math.max(0, Number(totalLiquido) || 0);
  const baseStr = String(dataBase).split('T')[0];

  let intervalos = [30]; // default: 30 DDL
  const cond = String(condicaoPagamento).trim().toLowerCase();

  if (cond === 'a_vista' || cond === 'vista' || cond === '1x') {
    intervalos = [1];
  } else if (cond === '30ddl' || cond === '30_dias') {
    intervalos = [30];
  } else if (cond.includes('/')) {
    // Ex: "14/28/42" ou "30/60/90"
    intervalos = cond.split('/').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (intervalos.length === 0) intervalos = [30];
  }

  const numParcelas = intervalos.length;
  const valorBase = Math.floor((total / numParcelas) * 100) / 100;
  let diferenca = Math.round((total - (valorBase * numParcelas)) * 100) / 100;

  const parcelas = [];
  for (let i = 0; i < numParcelas; i++) {
    const dias = intervalos[i];
    // Adiciona resíduo de centavos na última parcela para soma exata
    let vParcela = valorBase;
    if (i === numParcelas - 1) {
      vParcela = Math.round((vParcela + diferenca) * 100) / 100;
    }
    parcelas.push({
      numero: i + 1,
      totalParcelas: numParcelas,
      dias,
      vencimento: adicionarDias(baseStr, dias),
      valor: vParcela
    });
  }

  return parcelas;
}

module.exports = {
  extrairTotaisOS,
  calcularResumoTotais,
  gerarDesdobramentoParcelas,
  adicionarDias
};

