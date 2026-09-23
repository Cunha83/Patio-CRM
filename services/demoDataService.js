'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE DADOS DEMONSTRATIVOS E ONBOARDING
 * Permite que um novo tenant experimente o sistema com dados de teste
 * e os remova de forma 100% segura e limpa, sem misturar com dados reais.
 */

function carregarDadosDemonstracao({ tenantId, state, ator = 'administrador' }) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');

  const prefix = `demo_${tenantId.slice(0, 6)}`;
  const agora = new Date().toISOString();
  const hojeStr = agora.slice(0, 10);

  // 1. Cliente Demo
  const cliId = `${prefix}_cli_1`;
  const clienteDemo = {
    id: cliId,
    tenantId,
    nome: 'Transportadora Modelo Diesel (Demo)',
    nomeFantasia: 'Expresso Modelo Demo',
    documento: '12.345.678/0001-90',
    tipo: 'frotista',
    fone: '11988887777',
    email: 'contato@expressomodelo.demo',
    contato: 'Carlos Gestor de Frota',
    _isDemo: true,
    criadoEm: agora
  };

  // 2. Veículo Demo
  const veiId = `${prefix}_vei_1`;
  const veiculoDemo = {
    id: veiId,
    tenantId,
    clienteId: cliId,
    cli: cliId,
    placa: 'DEM1A23',
    marca: 'Scania',
    modelo: 'R 450 6x2',
    ano: 2021,
    km: 245000,
    _isDemo: true,
    criadoEm: agora
  };

  // 3. Peça Demo
  const pecaId = `${prefix}_peca_1`;
  const pecaDemo = {
    id: pecaId,
    tenantId,
    nome: 'Filtro de Combustível Separador Racor (Demo)',
    cod: 'RAC-2026',
    qtd: 8,
    preco: 280.00,
    custo: 160.00,
    custoMedio: 160.00,
    _isDemo: true
  };

  // 4. Serviço Demo
  const srvId = `${prefix}_srv_1`;
  const servicoDemo = {
    id: srvId,
    tenantId,
    nome: 'Revisão do Sistema de Injeção e Filtros (Demo)',
    categoria: 'motor',
    preco: 650.00,
    valor: 650.00,
    tempoEstimadoMinutos: 180,
    _isDemo: true
  };

  // 5. Ordem de Serviço Demo
  const osId = `${prefix}_os_1`;
  const osDemo = {
    id: osId,
    num: 9001,
    tenantId,
    cli: cliId,
    vei: veiId,
    abertura: hojeStr,
    st: 'em_andamento',
    queixa: 'Revisão preventiva programada de filtros e conferência de bicos.',
    servicos: [
      { id: srvId, nome: servicoDemo.nome, valor: 650.00, preco: 650.00, autorizado: true, status: 'aprovado' }
    ],
    pecas: [
      { id: pecaId, partId: pecaId, nome: pecaDemo.nome, qtd: 1, preco: 280.00, valorTotal: 280.00, reservada: true }
    ],
    total: 930.00,
    _isDemo: true
  };

  // Insere nas coleções garantindo que não duplicará caso já exista
  if (!state.clientes) state.clientes = [];
  if (!state.veiculos) state.veiculos = [];
  if (!state.pecas) state.pecas = [];
  if (!state.servicos) state.servicos = [];
  if (!state.os) state.os = [];

  state.clientes = state.clientes.filter(c => c.id !== cliId);
  state.clientes.push(clienteDemo);

  state.veiculos = state.veiculos.filter(v => v.id !== veiId);
  state.veiculos.push(veiculoDemo);

  state.pecas = state.pecas.filter(p => p.id !== pecaId);
  state.pecas.push(pecaDemo);

  state.servicos = state.servicos.filter(s => s.id !== srvId);
  state.servicos.push(servicoDemo);

  state.os = state.os.filter(o => o.id !== osId);
  state.os.push(osDemo);

  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: `aud_demo_${Date.now()}`,
    timestamp: agora,
    action: 'demo_data_seeded',
    actorId: ator,
    tenantId,
    details: { itensCriados: 5 }
  });

  return {
    ok: true,
    mensagem: 'Dados de demonstração carregados com sucesso!',
    clienteId: cliId,
    veiculoId: veiId,
    osId
  };
}

function removerDadosDemonstracao({ tenantId, state, ator = 'administrador' }) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');

  const colecoes = [
    'clientes', 'veiculos', 'pecas', 'servicos', 'os',
    'quotations', 'maintenancePlans', 'opportunities', 'appointments', 'afterSales', 'preOS'
  ];

  let totalRemovidos = 0;
  for (const col of colecoes) {
    if (Array.isArray(state[col])) {
      const antes = state[col].length;
      state[col] = state[col].filter(item => !item._isDemo);
      totalRemovidos += (antes - state[col].length);
    }
  }

  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: `aud_demo_clean_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'demo_data_purged',
    actorId: ator,
    tenantId,
    details: { totalRemovidos }
  });

  return {
    ok: true,
    mensagem: 'Dados de demonstração removidos com sucesso.',
    totalRemovidos
  };
}

module.exports = {
  carregarDadosDemonstracao,
  removerDadosDemonstracao
};
