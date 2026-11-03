'use strict';

function matchLaborTracking(t) {
  if (t.includes('vou começar') || t.includes('começar o') || t.includes('comeca o') || t.includes('comece o') || t.includes('começar a') || t.includes('iniciar serviço') || t.includes('inicia o') || t.includes('iniciar o') || t.includes('começar')) {
    return {
      intencao: 'iniciar_servico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Iniciando apontamento de serviço.'
    };
  }

  if (t.includes('pausa') || t.includes('pausar')) {
    return {
      intencao: 'pausar_servico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Pausando serviço do mecânico.'
    };
  }

  if (t.includes('retomar') || t.includes('retoma') || t.includes('pode retomar')) {
    return {
      intencao: 'retomar_servico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Retomando apontamento de serviço.'
    };
  }

  if (t.includes('finalizei') || t.includes('finalizar serviço') || t.includes('terminei') || t.includes('concluí o serviço') || t.includes('conclui o serviço')) {
    return {
      intencao: 'encerrar_servico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Encerrando serviço e registrando duração final.'
    };
  }

  if (t.includes('quem está livre') || t.includes('quem ta livre') || t.includes('mecanicos livres') || t.includes('mecânicos livres')) {
    return {
      intencao: 'consultar_equipe_livre',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando colaboradores livres no momento.'
    };
  }

  if (t.includes('trabalhando') && (t.includes('em que') || t.includes('o que') || t.includes('onde') || t.includes('qual os'))) {
    return {
      intencao: 'consultar_mecanico_trabalho',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando atividade atual do colaborador.'
    };
  }

  if (t.includes('quem está no box') || t.includes('quem tá no box') || t.includes('quem ta no box')) {
    return {
      intencao: 'consultar_box_mecanico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando ocupação do box selecionado.'
    };
  }

  if (t.includes('quanto tempo gastamos na os') || t.includes('quanto tempo na os') || t.includes('tempo gasto na os') || (t.includes('quanto tempo') && t.includes('nessa os'))) {
    return {
      intencao: 'consultar_tempo_os',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Calculando tempo total acumulado de mão de obra na ordem de serviço.'
    };
  }

  if (t.includes('mais horas produtivas') || t.includes('mais produtivo')) {
    return {
      intencao: 'consultar_mecanico_mais_produtivo',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando dados de produtividade da equipe.'
    };
  }

  if (t.includes('retrabalho')) {
    return {
      intencao: 'consultar_retrabalho',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando indicadores de retrabalho da oficina.'
    };
  }

  if (t.includes('custo real de mão de obra') || t.includes('custo de mão de obra') || t.includes('custo da mão de obra')) {
    return {
      intencao: 'consultar_custo_mao_obra_os',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Calculando custo real de mão de obra da OS.'
    };
  }

  if (t.includes('margem da os') || t.includes('quanto essa os custou de verdade') || t.includes('custou de verdade') || t.includes('qual a margem') || t.includes('custo real da os')) {
    return {
      intencao: 'consultar_custo_real_os',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Calculando custo real consolidado e margem da ordem de serviço.'
    };
  }

  return null;
}

function matchPricingAndProfitability(t) {
  if (t.includes('desconto sem cair') || t.includes('desconto seguro') || t.includes('quanto posso dar de desconto') || t.includes('quanto de desconto posso dar') || (t.includes('desconto') && t.includes('margem'))) {
    return {
      intencao: 'consultar_desconto_seguro',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Calculando desconto máximo seguro sem romper a margem mínima.'
    };
  }

  if (t.includes('quanto deveríamos cobrar') || t.includes('quanto deveriamos cobrar') || t.includes('quanto cobrar') || t.includes('sugestão de preço') || t.includes('sugestao de preco') || t.includes('preço sugerido')) {
    return {
      intencao: 'consultar_sugestao_preco',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Calculando recomendação de preço com base no histórico real.'
    };
  }

  if (t.includes('qual a margem desse orçamento') || t.includes('qual a margem do orçamento') || t.includes('margem desse orçamento') || t.includes('margem do orcamento') || (t.includes('margem') && t.includes('orçamento'))) {
    return {
      intencao: 'consultar_margem_orcamento',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Analisando margem estimada do orçamento.'
    };
  }

  if (t.includes('pouca margem') || t.includes('menor margem') || t.includes('menos rentáveis') || t.includes('menos rentaveis')) {
    return {
      intencao: 'consultar_servicos_pouca_margem',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando serviços com menor margem recente.'
    };
  }

  if (t.includes('mais retrabalho') || t.includes('maior retrabalho')) {
    return {
      intencao: 'consultar_servico_mais_retrabalho',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando serviços com maior índice de retrabalho.'
    };
  }

  if (t.includes('quanto custa em média') || t.includes('quanto custa em media') || t.includes('custo médio de fazer') || t.includes('custo medio de fazer') || (t.includes('quanto custa') && t.includes('serviço'))) {
    return {
      intencao: 'consultar_custo_medio_servico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Calculando custo médio histórico para este serviço.'
    };
  }

  if (t.includes('cobrando barato') || t.includes('preço está bom') || t.includes('preco esta bom') || t.includes('preço tá bom')) {
    return {
      intencao: 'consultar_adequacao_preco_servico',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Avaliando adequação do preço em relação ao custo esperado.'
    };
  }

  if ((t.includes('altera o') || t.includes('alterar o') || t.includes('muda o') || t.includes('coloca r$') || t.includes('colocar r$')) && (t.includes('r$') || t.includes('reais') || /\b\d{3,5}\b/.test(t))) {
    return {
      intencao: 'alterar_preco_servico',
      risco: 'medio',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Validando proposta de alteração de preço contra política de margem.'
    };
  }

  return null;
}

module.exports = {
  matchLaborTracking,
  matchPricingAndProfitability
};

