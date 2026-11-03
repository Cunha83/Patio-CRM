'use strict';

function matchQuotationsAndPricing(t) {
  if ((t.includes('orçamento') || t.includes('orcamento') || t.includes('aprovação') || t.includes('aprovacao') || t.includes('quem não aprovou') || t.includes('quem nao aprovou') || t.includes('orçamentos pendentes') || t.includes('orcamentos pendentes')) && !t.includes('margem') && !t.includes('desconto')) {
    if ((t.includes('adicionar') || t.includes('incluir') || t.includes('colocar')) && (t.includes('r$') || t.includes('reais') || t.includes('peça') || t.includes('peca') || t.includes('serviço') || t.includes('servico'))) {
      return {
        intencao: 'adicionar_item_orcamento',
        risco: 'alto',
        cliente: null,
        veiculo: null,
        os: null,
        correcoes: [],
        itens_solicitados: { servicos: [], pecas: [] },
        resposta_falada: 'Atenção: Adicionar item com valor financeiro altera o orçamento a ser aprovado pelo cliente. Deseja realmente confirmar?'
      };
    }
    return {
      intencao: 'consultar_orcamento',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando situação dos orçamentos da oficina.'
    };
  }
  return null;
}

function matchInventoryProcurementActions(t) {
  if (t.includes('ajustar estoque') || t.includes('ajuste de estoque') || t.includes('mudar estoque') || t.includes('cancelar pedido') || t.includes('cancela pedido') || t.includes('aprovar compra') || t.includes('aprova compra')) {
    let intencao = 'ajustar_estoque';
    if (t.includes('cancelar pedido') || t.includes('cancela pedido')) {
      intencao = 'cancelar_pedido_compra';
    } else if (t.includes('aprovar compra') || t.includes('aprova compra')) {
      intencao = 'aprovar_compra';
    }
    return {
      intencao,
      risco: 'alto',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Atenção: Esta é uma operação crítica de almoxarifado/compras e exige confirmação explícita. Deseja realmente confirmar?'
    };
  }

  if ((t.includes('reserva') || t.includes('reservar')) && (t.includes('para a os') || t.includes('para o os') || t.includes('pra os') || t.includes('na os') || t.includes('para os'))) {
    const matchQtd = t.match(/\b(\d+)\b/);
    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i);
    return {
      intencao: 'reservar_peca_os',
      risco: 'baixo',
      reserva: {
        quantidade: matchQtd ? parseInt(matchQtd[1], 10) : 1,
        osNum: matchOS ? parseInt(matchOS[1], 10) : null
      },
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Processando reserva de peça no almoxarifado para a ordem de serviço.'
    };
  }

  if (t.includes('aguardando peças') || t.includes('aguardando pecas') || t.includes('esperando peça') || t.includes('esperando peca') || t.includes('falta de peças')) {
    return {
      intencao: 'consultar_os_aguardando_pecas',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando ordens de serviço aguardando peças.'
    };
  }

  if (t.includes('faltando comprar') || t.includes('falta comprar') || t.includes('precisa comprar') || t.includes('o que falta comprar') || t.includes('peças para comprar') || t.includes('compras pendentes')) {
    return {
      intencao: 'consultar_compras_pendentes',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Verificando a lista de necessidades de peças aguardando compra.'
    };
  }

  if (t.includes('pedidos atrasados') || t.includes('pedido atrasado') || t.includes('compras atrasadas') || t.includes('peça atrasada')) {
    return {
      intencao: 'consultar_pedidos_atrasados',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Verificando se há pedidos de compra com prazo prometido em atraso.'
    };
  }

  if (t.includes('qual fornecedor tem') || t.includes('quem tem essa peça') || t.includes('fornecedor tem') || t.includes('fornecedor de')) {
    return {
      intencao: 'consultar_fornecedor_peca',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando fornecedores que fornecem esse componente.'
    };
  }

  if (t.includes('temos') || t.includes('quanto temos de estoque') || t.includes('quantas buchas') || t.includes('quantos terminais') || t.includes('quanto de estoque') || t.includes('saldo da peça') || t.includes('tem estoque') || t.includes('estoque de') || t.includes('estoque da') || t.includes('estoque do')) {
    return {
      intencao: 'consultar_estoque_peca',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando saldo físico e disponível no almoxarifado.'
    };
  }

  return null;
}

function matchCRMAndFleet(t) {
  if (t.includes('perto da revisão') || t.includes('perto da revisao') || t.includes('manutenção vencida') || t.includes('manutencao vencida') || t.includes('revisão vencida') || t.includes('revisao vencida') || t.includes('próximos de manutenção') || t.includes('proximos de manutencao')) {
    return {
      intencao: 'consultar_preventiva_frota',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando manutenções preventivas próximas e vencidas.'
    };
  }

  if (t.includes('quantos veículos') || t.includes('quantos veiculos') || t.includes('quantos caminhões') || t.includes('quantos caminhoes') || t.includes('veículos dela') || t.includes('veiculos dela') || (t.includes('frota') && t.includes('oficina'))) {
    return {
      intencao: 'consultar_frota_cliente',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando veículos da frota no cadastro e na oficina.'
    };
  }

  if (t.includes('precisam de contato') || t.includes('precisam ser contatados') || t.includes('mais tempo sem retornar') || t.includes('frotistas inativos')) {
    return {
      intencao: 'consultar_contatos_crm',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando oportunidades de contato e clientes com retorno pendente.'
    };
  }

  if (t.includes('última manutenção') || t.includes('ultima manutencao') || t.includes('próxima revisão') || t.includes('proxima revisao') || t.includes('próxima manutenção') || t.includes('proxima manutencao')) {
    return {
      intencao: 'consultar_manutencao_veiculo',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando histórico e previsão de manutenção para este veículo.'
    };
  }

  if (t.includes('pós-venda pendente') || t.includes('pos-venda pendente') || t.includes('pos venda pendente') || t.includes('pós venda pendente')) {
    return {
      intencao: 'consultar_pos_venda',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Verificando acompanhamentos de pós-venda pendentes para hoje.'
    };
  }

  if (t.includes('agenda a') || t.includes('agendar a') || t.includes('agende a') || (t.includes('agenda') && (t.includes('terça') || t.includes('segunda') || t.includes('quarta') || t.includes('quinta') || t.includes('sexta') || t.includes('sábado') || t.includes('amanhã') || t.includes('manha') || t.includes('tarde')))) {
    return {
      intencao: 'agendar_veiculo',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Processando agendamento solicitado.'
    };
  }

  return null;
}

function matchGeneralStatus(t) {
  if (t.includes('status') || t.includes('como tá') || t.includes('como esta') || t.includes('onde tá') || t.includes('onde esta') || t.includes('saldo') || t.includes('caixa')) {
    return {
      intencao: 'consultar_status',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando informações solicitadas no sistema.'
    };
  }
  return null;
}

module.exports = {
  matchQuotationsAndPricing,
  matchInventoryProcurementActions,
  matchCRMAndFleet,
  matchGeneralStatus
};

