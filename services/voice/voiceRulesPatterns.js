'use strict';

const { BASE_CONHECIMENTO_SISTEMA } = require('./voiceSecurity');

function matchConfirmationAndCancel(t, context) {
  if (/^(sim|confirmar|confirmo|pode confirmar|pode fazer|autorizado|ok)$/i.test(t) ||
      t.startsWith('confirmar') || t.startsWith('confirmo') ||
      (context.confirmToken && /confirm/i.test(t))) {
    return {
      intencao: 'confirmar_acao',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Confirmando ação autorizada.'
    };
  }

  if (/^(não|cancelar|cancela|deixa|esquece|abortar)$/i.test(t) ||
      t.startsWith('cancelar') || t.startsWith('cancela') ||
      (context.confirmToken && /cancel/i.test(t))) {
    return {
      intencao: 'cancelar_acao_pendente',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Ação cancelada com sucesso.'
    };
  }

  return null;
}

function matchTrainingHelp(t) {
  const isPerguntaAjuda = /^(?:qual o passo a passo|passo a passo|me explica|me ensina|ajuda|manual|tutorial|o que é|o que e)\b/i.test(t) ||
                          t.includes('como faço') || t.includes('como faco') ||
                          t.includes('como abrir') || t.includes('como cadastrar') ||
                          t.includes('como emitir') || t.includes('como faturar') ||
                          t.includes('como lançar') || t.includes('como lancar') ||
                          t.includes('como adicionar') || t.includes('como colocar') ||
                          t.includes('como funciona') || t.includes('como configurar') ||
                          t.includes('onde clico');

  if (!isPerguntaAjuda) return null;

  let topico = 'geral';
  if (t.includes('cliente') || t.includes('transportadora')) {
    topico = 'cliente';
  } else if (t.includes('os') || t.includes('ordem de serviço') || t.includes('ordem de servico') || t.includes('pátio') || t.includes('patio')) {
    topico = 'os';
  } else if (t.includes('peça') || t.includes('peca') || t.includes('serviço') || t.includes('servico')) {
    topico = 'pecas_servicos';
  } else if (t.includes('faturar') || t.includes('faturamento') || t.includes('fechar')) {
    topico = 'faturamento';
  } else if (t.includes('nota') || t.includes('fiscal') || t.includes('nfe') || t.includes('nf-e') || t.includes('nfse') || t.includes('tribut')) {
    topico = 'fiscal';
  } else if (t.includes('assistente') || t.includes('voz') || t.includes('sofia') || t.includes('veronica')) {
    topico = 'assistente';
  } else if (t.includes('financeiro') || t.includes('caixa') || t.includes('pagar') || t.includes('receber')) {
    topico = 'financeiro';
  } else if (t.includes('whatsapp') || t.includes('zap') || t.includes('mensagem')) {
    topico = 'whatsapp';
  } else if (t.includes('regra') || t.includes('cfop')) {
    topico = 'regras_tributarias';
  }

  return {
    intencao: 'ajuda_sistema_treinamento',
    risco: 'baixo',
    topico,
    cliente: null,
    veiculo: null,
    os: null,
    correcoes: [],
    itens_solicitados: { servicos: [], pecas: [] },
    resposta_falada: BASE_CONHECIMENTO_SISTEMA[topico] || BASE_CONHECIMENTO_SISTEMA.geral
  };
}

function matchCashRegister(t) {
  if (/(?:abrir|iniciar)\s*(?:o\s+)?caixa/i.test(t)) {
    const matchVal = t.match(/(?:com|saldo\s+de|valor\s+de)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i) ||
                     t.match(/(?:r\$\s*)(\d+(?:[.,]\d{1,2})?)/i) ||
                     t.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais)/i);
    let valorInicial = 0;
    if (matchVal) {
      valorInicial = parseFloat(matchVal[1].replace(',', '.'));
    }
    return {
      intencao: 'abrir_caixa',
      risco: 'baixo',
      saldoInicial: isNaN(valorInicial) ? 0 : valorInicial,
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: `Abrindo caixa diário com saldo inicial de ${valorInicial} reais.`
    };
  }

  if (/(?:fechar|encerrar)\s*(?:o\s+)?caixa/i.test(t)) {
    return {
      intencao: 'fechar_caixa',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Encerrando o turno de caixa e consolidando valores.'
    };
  }

  if (/(?:lançar|lancar|registrar)\s*(?:uma\s+)?(?:despesa|saída|saida|sangria|retirada|entrada|receita|suprimento)/i.test(t) ||
      /(?:fazer\s+uma\s+)?sangria\s+de/i.test(t) ||
      /(?:fazer\s+um\s+)?suprimento\s+de/i.test(t)) {
    let tipoMov = 'despesa';
    if (t.includes('entrada') || t.includes('receita') || t.includes('suprimento')) {
      tipoMov = t.includes('suprimento') ? 'suprimento' : 'receita';
    } else if (t.includes('sangria')) {
      tipoMov = 'sangria';
    }

    const matchVal = t.match(/(?:de\s+)?(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais)?/i);
    let valor = 0;
    if (matchVal) {
      valor = parseFloat(matchVal[1].replace(',', '.'));
    }

    const matchDesc = t.match(/(?:com|referente\s+a|motivo|para|descrição|descricao)\s+(.+)$/i);
    const descricao = matchDesc ? matchDesc[1].trim() : `${tipoMov} avulsa via voz`;

    return {
      intencao: 'registrar_movimentacao_caixa',
      risco: 'baixo',
      tipo: tipoMov,
      valor: isNaN(valor) ? 0 : valor,
      descricao,
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: `Registrando ${tipoMov} de ${valor} reais no caixa.`
    };
  }

  return null;
}

function matchFinancialForecastAndAudit(t) {
  if (t.includes('previsão de fluxo') || t.includes('previsao de fluxo') || t.includes('previsão do fluxo') ||
      t.includes('previsao do fluxo') || t.includes('forecast') || t.includes('previsão de caixa') || t.includes('previsao de caixa')) {
    return {
      intencao: 'consultar_previsao_caixa',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando previsão e projeção de fluxo de caixa da oficina.'
    };
  }

  if (t.includes('auditoria financeira') || t.includes('controles internos') || t.includes('parecer financeiro') ||
      t.includes('vazamento de receita') || t.includes('anomalias financeiras')) {
    return {
      intencao: 'consultar_auditoria_financeira',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Executando auditoria e avaliação dos controles internos financeiros.'
    };
  }

  return null;
}

function matchFinancialGeneral(t) {
  const isConsultaFin = t.includes('vencimento') || t.includes('a pagar') || t.includes('contas a pagar') ||
                        t.includes('a receber') || t.includes('contas a receber') || t.includes('receber de clientes') ||
                        t.includes('saldo atual') || t.includes('saldo do caixa') || t.includes('saldo de caixa') ||
                        t.includes('saldo em caixa') || t.includes('posição do caixa') || t.includes('posicao do caixa') ||
                        (t.includes('saldo') && (t.includes('caixa') || t.includes('atual') || t.includes('hoje'))) ||
                        (t.includes('caixa') && (t.includes('saldo') || t.includes('quanto temos'))) ||
                        t.includes('faturamento') || t.includes('quanto faturamos');

  if (!isConsultaFin) return null;

  let subtipo = 'geral';
  if (t.includes('pagar') || t.includes('vencimento') || t.includes('despesa')) {
    subtipo = 'pagar';
  } else if (t.includes('receber') || t.includes('cliente')) {
    subtipo = 'receber';
  } else if (t.includes('saldo') || t.includes('caixa')) {
    subtipo = 'saldo';
  } else if (t.includes('faturamento') || t.includes('faturamos')) {
    subtipo = 'faturamento';
  }

  return {
    intencao: 'consultar_financeiro',
    risco: 'baixo',
    subtipo,
    cliente: null,
    veiculo: null,
    os: null,
    correcoes: [],
    itens_solicitados: { servicos: [], pecas: [] },
    resposta_falada: 'Consultando informações financeiras no sistema.'
  };
}

function matchInventoryCritical(t) {
  if (t.includes('estoque baixo') || t.includes('estoque crítico') || t.includes('estoque critico') ||
      t.includes('peças em falta') || t.includes('pecas em falta') ||
      t.includes('repor') || t.includes('para repor') || t.includes('pra repor') ||
      t.includes('peças acabando') || t.includes('pecas acabando')) {
    return {
      intencao: 'consultar_estoque',
      risco: 'baixo',
      subtipo: 'critico',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando itens com estoque baixo ou crítico para reposição.'
    };
  }
  return null;
}

function matchExecutive360(t) {
  if (t.includes('relatório gerencial 360') || t.includes('relatorio gerencial 360') ||
      t.includes('gestão 360') || t.includes('gestao 360') ||
      t.includes('raio x da oficina') || t.includes('raio-x da oficina') ||
      t.includes('raio x') || t.includes('raio-x') ||
      t.includes('visão 360') || t.includes('visao 360') ||
      t.includes('diagnóstico 360') || t.includes('diagnostico 360')) {
    return {
      intencao: 'consultar_gestao_360',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Gerando relatório e raio-x gerencial 360 da oficina.'
    };
  }

  if (t.includes('o que precisa comprar') || t.includes('sugestão de compras') || t.includes('sugestao de compras') ||
      t.includes('compras sugeridas') || t.includes('o que comprar') ||
      t.includes('comprar no estoque') || t.includes('precisa comprar no estoque') ||
      t.includes('peças para comprar') || t.includes('pecas para comprar')) {
    return {
      intencao: 'consultar_compras_sugeridas',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Analisando estoque crítico, demanda de ordens de serviço e sugestões de compras.'
    };
  }

  if (t.includes('produtividade da equipe') || t.includes('produtividade dos mecânicos') || t.includes('produtividade dos mecanicos') ||
      t.includes('ranking dos mecânicos') || t.includes('ranking dos mecanicos') ||
      t.includes('desempenho da equipe') || t.includes('produtividade da oficina')) {
    return {
      intencao: 'consultar_produtividade_equipe',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando produtividade da equipe técnica e desempenho dos boxes.'
    };
  }

  return null;
}

module.exports = {
  matchConfirmationAndCancel,
  matchTrainingHelp,
  matchCashRegister,
  matchFinancialForecastAndAudit,
  matchFinancialGeneral,
  matchInventoryCritical,
  matchExecutive360
};

