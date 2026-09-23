'use strict';

const crypto = require('crypto');

/**
 * PÁTIO CRM — MOTOR DE GESTÃO DE ESTOQUE, ALMOXARIFADO & RESERVAS
 * Separação rigorosa de conceitos:
 * Peça Cadastrada != Estoque Físico != Estoque Reservado != Estoque Disponível != Consumo na OS
 */

function arredondar(valor, decimais = 2) {
  const n = Number(valor) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
}

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

/**
 * Inicializa coleções de estoque no estado caso ausentes
 */
function garantirColecoesEstoque(state) {
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];
  state.inventoryMovements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  state.partRequirements = Array.isArray(state.partRequirements) ? state.partRequirements : [];
  state.auditoria = Array.isArray(state.auditoria) ? state.auditoria : [];
  state.os = Array.isArray(state.os) ? state.os : [];
}

/**
 * Calcula saldos determinísticos em tempo real para uma peça:
 * estoqueFisico: saldo real existente no almoxarifado
 * estoqueReservado: quantidade comprometida com OSs ativas
 * estoqueDisponivel: saldo livre para novas reservas (físico - reservado, mínimo 0)
 */
function calcularSaldos({ tenantId, state, partId }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && (!p.tenantId || p.tenantId === tenantId));
  if (!peca) {
    return { estoqueFisico: 0, estoqueReservado: 0, estoqueDisponivel: 0 };
  }

  const estoqueFisico = Math.max(0, Number(peca.qtd) || 0);

  // Considera apenas reservas de OSs ativas (não finalizadas e não canceladas)
  const osAtivasIds = new Set(
    state.os
      .filter(o => o.tenantId === tenantId || !o.tenantId)
      .filter(o => o.st !== 'finalizada' && o.st !== 'cancelada')
      .map(o => o.id)
  );

  let estoqueReservado = 0;
  for (const req of state.partRequirements) {
    if (req.tenantId === tenantId && req.partId === partId) {
      if (['atendida', 'parcial', 'reservada'].includes(req.status)) {
        if (!req.osId || osAtivasIds.has(req.osId)) {
          estoqueReservado += Math.max(0, Number(req.reservedQuantity || req.qtdReservada) || 0);
        }
      }
    }
  }

  const estoqueDisponivel = Math.max(0, estoqueFisico - estoqueReservado);

  return {
    estoqueFisico,
    estoqueReservado,
    estoqueDisponivel
  };
}

/**
 * Cadastra uma nova peça no estoque com códigos e referências alternativas
 */
function cadastrarPeca({ tenantId, state, partData = {}, actorId = 'sistema' }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para cadastrar peça.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  garantirColecoesEstoque(state);

  const descricao = String(partData.descricao || partData.nome || '').trim();
  if (!descricao) {
    throw new Error('Descrição ou nome da peça é obrigatório.');
  }

  const codigoInterno = String(partData.codigoInterno || partData.cod || '').trim().toUpperCase();
  if (!codigoInterno) {
    throw new Error('Código interno da peça é obrigatório.');
  }

  // Validação de colisão de código interno no mesmo tenant
  const duplicada = state.pecas.find(
    p => p.tenantId === tenantId && (p.codigoInterno === codigoInterno || p.cod === codigoInterno)
  );
  if (duplicada) {
    throw new Error('Já existe uma peça cadastrada com o código interno "' + codigoInterno + '" neste tenant.');
  }

  const id = partData.id || gerarId('peca');
  const custoMedio = arredondar(partData.custoMedio != null ? partData.custoMedio : (partData.custo || 0));
  const precoVendaPadrao = arredondar(partData.precoVendaPadrao != null ? partData.precoVendaPadrao : (partData.venda || 0));
  const estoqueMinimo = Math.max(0, Number(partData.estoqueMinimo != null ? partData.estoqueMinimo : (partData.min || 0)));
  const estoqueMaximo = Math.max(0, Number(partData.estoqueMaximo != null ? partData.estoqueMaximo : (partData.max || 0)));
  const estoqueInicial = Math.max(0, Number(partData.qtd || partData.estoqueInicial || 0));

  const referencias = Array.isArray(partData.referencias)
    ? partData.referencias.map(r => String(r).trim().toUpperCase()).filter(Boolean)
    : [];

  const novaPeca = {
    id,
    tenantId,
    codigoInterno,
    cod: codigoInterno, // compatibilidade com frontend legado
    codigoFabricante: partData.codigoFabricante ? String(partData.codigoFabricante).trim().toUpperCase() : null,
    descricao,
    nome: descricao, // compatibilidade com frontend legado
    categoria: partData.categoria || 'geral',
    fabricante: partData.fabricante || null,
    unidade: (partData.unidade || 'UN').toUpperCase(),
    custoMedio,
    custo: custoMedio, // compatibilidade
    precoVendaPadrao,
    venda: precoVendaPadrao, // compatibilidade
    estoqueMinimo,
    min: estoqueMinimo, // compatibilidade
    estoqueMaximo,
    qtd: 0, // saldo físico inicializado a 0 (registrarMovimentacao adicionará estoqueInicial)
    referencias,
    ativo: partData.ativo !== false,
    loc: partData.loc || 'Almoxarifado Principal',
    forn: partData.forn || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.pecas.push(novaPeca);

  // Se houver estoque físico inicial > 0, grava no ledger imutável
  if (estoqueInicial > 0) {
    registrarMovimentacao({
      tenantId,
      state,
      partId: id,
      type: 'ajuste_positivo',
      quantity: estoqueInicial,
      unitCost: custoMedio,
      reason: 'Saldo inicial de implantação de cadastro',
      actorId
    });
  }

  return {
    ok: true,
    part: novaPeca,
    saldos: calcularSaldos({ tenantId, state, partId: id })
  };
}

/**
 * Atualiza campos de cadastro de uma peça existente
 */
function atualizarPeca({ tenantId, state, partId, partData = {}, actorId = 'sistema' }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça não encontrada para atualização.');
  }

  if (partData.codigoInterno) {
    const novoCod = String(partData.codigoInterno).trim().toUpperCase();
    const colidiu = state.pecas.find(
      p => p.tenantId === tenantId && p.id !== partId && (p.codigoInterno === novoCod || p.cod === novoCod)
    );
    if (colidiu) {
      throw new Error('Código interno "' + novoCod + '" já está em uso por outra peça.');
    }
    peca.codigoInterno = novoCod;
    peca.cod = novoCod;
  }

  if (partData.descricao || partData.nome) {
    const d = String(partData.descricao || partData.nome).trim();
    peca.descricao = d;
    peca.nome = d;
  }

  if (partData.codigoFabricante !== undefined) {
    peca.codigoFabricante = partData.codigoFabricante ? String(partData.codigoFabricante).trim().toUpperCase() : null;
  }
  if (partData.categoria !== undefined) peca.categoria = partData.categoria;
  if (partData.fabricante !== undefined) peca.fabricante = partData.fabricante;
  if (partData.unidade !== undefined) peca.unidade = String(partData.unidade).toUpperCase();
  if (partData.loc !== undefined) peca.loc = partData.loc;
  if (partData.forn !== undefined) peca.forn = partData.forn;
  if (partData.ativo !== undefined) peca.ativo = Boolean(partData.ativo);

  if (partData.precoVendaPadrao != null || partData.venda != null) {
    const v = arredondar(partData.precoVendaPadrao != null ? partData.precoVendaPadrao : partData.venda);
    peca.precoVendaPadrao = v;
    peca.venda = v;
  }

  if (partData.estoqueMinimo != null || partData.min != null) {
    const m = Math.max(0, Number(partData.estoqueMinimo != null ? partData.estoqueMinimo : partData.min));
    peca.estoqueMinimo = m;
    peca.min = m;
  }

  if (partData.estoqueMaximo != null) {
    peca.estoqueMaximo = Math.max(0, Number(partData.estoqueMaximo));
  }

  if (Array.isArray(partData.referencias)) {
    peca.referencias = partData.referencias.map(r => String(r).trim().toUpperCase()).filter(Boolean);
  }

  peca.updatedAt = new Date().toISOString();

  return {
    ok: true,
    part: peca,
    saldos: calcularSaldos({ tenantId, state, partId })
  };
}

/**
 * Obtém os detalhes de uma peça com saldos calculados
 */
function obterPeca({ tenantId, state, partId }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && (!p.tenantId || p.tenantId === tenantId));
  if (!peca) return null;

  const saldos = calcularSaldos({ tenantId, state, partId });
  return {
    ...peca,
    ...saldos
  };
}

/**
 * Busca peças por código, descrição, referências ou fabricante
 */
function buscarPecas({ tenantId, state, query = '' }) {
  garantirColecoesEstoque(state);

  const q = String(query || '').toLowerCase().trim();
  const pecasTenant = state.pecas.filter(p => !p.tenantId || p.tenantId === tenantId);

  if (!q) {
    return pecasTenant.map(p => ({
      ...p,
      ...calcularSaldos({ tenantId, state, partId: p.id })
    }));
  }

  return pecasTenant
    .filter(p => {
      const matchDesc = (p.descricao || p.nome || '').toLowerCase().includes(q);
      const matchCodInt = (p.codigoInterno || p.cod || '').toLowerCase().includes(q);
      const matchCodFab = (p.codigoFabricante || '').toLowerCase().includes(q);
      const matchFab = (p.fabricante || '').toLowerCase().includes(q);
      const matchCat = (p.categoria || '').toLowerCase().includes(q);
      const matchRef = Array.isArray(p.referencias) && p.referencias.some(r => r.toLowerCase().includes(q));
      return matchDesc || matchCodInt || matchCodFab || matchFab || matchCat || matchRef;
    })
    .map(p => ({
      ...p,
      ...calcularSaldos({ tenantId, state, partId: p.id })
    }));
}

/**
 * Registra movimentação no ledger imutável de estoque
 */
function registrarMovimentacao({
  tenantId,
  state,
  partId,
  type,
  quantity,
  osId = null,
  purchaseOrderId = null,
  reason = '',
  actorId = 'sistema',
  mechanicId = null,
  unitCost = null
}) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça "' + partId + '" não encontrada no tenant para movimentação.');
  }

  const qtdMov = Number(quantity);
  if (!qtdMov || qtdMov <= 0) {
    throw new Error('Quantidade para movimentação deve ser maior que zero.');
  }

  const tiposValidos = [
    'entrada_compra',
    'saida_os',
    'reserva',
    'liberacao_reserva',
    'devolucao_os',
    'ajuste_positivo',
    'ajuste_negativo',
    'transferencia'
  ];

  if (!tiposValidos.includes(type)) {
    throw new Error('Tipo de movimentação inválido: "' + type + '".');
  }

  const qtdFisicaAnterior = Math.max(0, Number(peca.qtd) || 0);
  let novaQtdFisica = qtdFisicaAnterior;

  // Atualização de saldo físico conforme o tipo
  if (['entrada_compra', 'ajuste_positivo', 'devolucao_os'].includes(type)) {
    novaQtdFisica = qtdFisicaAnterior + qtdMov;

    // Recálculo do custo médio ponderado por entrada de compra ou ajuste com valor
    if ((type === 'entrada_compra' || type === 'ajuste_positivo') && unitCost != null && Number(unitCost) >= 0) {
      const custoAtual = Number(peca.custoMedio != null ? peca.custoMedio : peca.custo) || 0;
      const novoCustoEntrada = arredondar(unitCost);

      if (novaQtdFisica > 0) {
        const valorTotalExistente = qtdFisicaAnterior * custoAtual;
        const valorTotalEntrada = qtdMov * novoCustoEntrada;
        const novoCustoMedio = arredondar((valorTotalExistente + valorTotalEntrada) / novaQtdFisica);
        peca.custoMedio = novoCustoMedio;
        peca.custo = novoCustoMedio;
      } else {
        peca.custoMedio = novoCustoEntrada;
        peca.custo = novoCustoEntrada;
      }
    }
  } else if (['saida_os', 'ajuste_negativo'].includes(type)) {
    if (qtdFisicaAnterior < qtdMov) {
      throw new Error('Saldo físico insuficiente no almoxarifado. Atual: ' + qtdFisicaAnterior + ', Solicitado: ' + qtdMov + '.');
    }
    novaQtdFisica = Math.max(0, qtdFisicaAnterior - qtdMov);
  }
  // 'reserva' e 'liberacao_reserva' não alteram o estoque físico imediatamente, apenas alocam/desalocam

  peca.qtd = novaQtdFisica;
  peca.updatedAt = new Date().toISOString();

  const movement = {
    id: gerarId('mov'),
    tenantId,
    partId,
    type,
    quantity: qtdMov,
    osId,
    purchaseOrderId,
    reason: String(reason || '').trim(),
    actorId,
    mechanicId,
    unitCost: unitCost != null ? arredondar(unitCost) : null,
    saldoAnterior: qtdFisicaAnterior,
    saldoNovo: novaQtdFisica,
    saldoFisicoApos: novaQtdFisica,
    createdAt: new Date().toISOString()
  };

  state.inventoryMovements.unshift(movement);

  // Registro na auditoria para rastreabilidade estrita
  state.auditoria.unshift({
    id: gerarId('aud'),
    tenantId,
    dataHora: new Date().toISOString(),
    usuario: actorId,
    intencao: 'estoque_' + type,
    resumo: 'Movimentação de estoque [' + type + '] da peça "' + peca.descricao + '" (' + qtdMov + ' un). Saldo físico: ' + novaQtdFisica + '.',
    osId
  });

  return movement;
}

/**
 * Reserva peças para uma Ordem de Serviço com resolução atômica de concorrência.
 * Se o estoque disponível for parcial ou nulo, registra a necessidade de compra do saldo restante.
 */
function reservarParaOS({
  tenantId,
  state,
  osId,
  quotationId = null,
  quotationItemId = null,
  partId,
  quantity,
  permitirParcial = true,
  actorId = 'sistema'
}) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça "' + partId + '" não encontrada para reserva.');
  }

  const qtdNecessaria = Math.max(1, Number(quantity) || 1);
  const saldos = calcularSaldos({ tenantId, state, partId });
  const disponivel = saldos.estoqueDisponivel;

  if (permitirParcial === false && disponivel < qtdNecessaria) {
    throw new Error('Saldo em estoque disponível insuficiente para reserva total. Disponível: ' + disponivel + ', Solicitado: ' + qtdNecessaria);
  }

  let qtdReservada = 0;
  let qtdFaltante = 0;
  let status = 'aguardando_compra';

  if (disponivel >= qtdNecessaria) {
    qtdReservada = qtdNecessaria;
    qtdFaltante = 0;
    status = 'atendida';
  } else if (disponivel > 0) {
    qtdReservada = disponivel;
    qtdFaltante = qtdNecessaria - disponivel;
    status = 'parcial';
  } else {
    qtdReservada = 0;
    qtdFaltante = qtdNecessaria;
    status = 'aguardando_compra';
  }

  // Se foi possível reservar alguma quantidade física, grava movimento de reserva
  if (qtdReservada > 0) {
    registrarMovimentacao({
      tenantId,
      state,
      partId,
      type: 'reserva',
      quantity: qtdReservada,
      osId,
      reason: 'Reserva para OS #' + osId + ' (Item: ' + peca.descricao + ')',
      actorId
    });
  }

  const requirement = {
    id: gerarId('req'),
    tenantId,
    osId,
    quotationId,
    quotationItemId,
    partId,
    requiredQuantity: qtdNecessaria,
    reservedQuantity: qtdReservada,
    missingQuantity: qtdFaltante,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.partRequirements.push(requirement);

  // Sincroniza badge de peça na OS
  const os = state.os.find(o => o.id === osId && (o.tenantId === tenantId || !o.tenantId));
  if (os && Array.isArray(os.pecas)) {
    let itemOS = os.pecas.find(p => p.id === quotationItemId || p.partId === partId || p.pecaId === partId || p.desc === peca.descricao);
    if (itemOS) {
      itemOS.partId = partId;
      itemOS.pecaId = partId;
      itemOS.requirementId = requirement.id;
      itemOS.statusEstoque = status; // atendida | parcial | aguardando_compra
      itemOS.status = status === 'atendida' ? 'reservada' : status;
      itemOS.st = itemOS.status;
      itemOS.qtdReservada = qtdReservada;
      itemOS.qtdFaltante = qtdFaltante;
    } else {
      itemOS = {
        id: quotationItemId || gerarId('item'),
        partId,
        pecaId: partId,
        nome: peca.descricao,
        desc: peca.descricao,
        qtd: qtdNecessaria,
        status: status === 'atendida' ? 'reservada' : status,
        st: status === 'atendida' ? 'reservada' : status,
        statusEstoque: status,
        qtdReservada,
        qtdFaltante
      };
      os.pecas.push(itemOS);
    }
  }

  return {
    ok: true,
    reservedQuantity: qtdReservada,
    quantidadeReservada: qtdReservada,
    missingQuantity: qtdFaltante,
    requirement,
    saldos: calcularSaldos({ tenantId, state, partId }),
    resumo: 'OS #' + osId + ': ' + qtdReservada + ' reservada(s), ' + qtdFaltante + ' aguardando compra.'
  };
}

/**
 * Libera reserva previamente associada a uma OS
 */
function liberarReserva({ tenantId, state, osId, partId, quantity = null, reason = '', actorId = 'sistema' }) {
  garantirColecoesEstoque(state);

  const reqs = state.partRequirements.filter(
    r => r.tenantId === tenantId && r.osId === osId && (partId ? r.partId === partId : true) && r.reservedQuantity > 0
  );

  if (reqs.length === 0) {
    return { ok: false, error: 'Nenhuma reserva ativa encontrada para esta OS/peça.' };
  }

  let totalLiberado = 0;
  for (const req of reqs) {
    const qtdALiberar = quantity != null ? Math.min(Number(quantity), req.reservedQuantity) : req.reservedQuantity;
    if (qtdALiberar <= 0) continue;

    req.reservedQuantity -= qtdALiberar;
    req.missingQuantity += qtdALiberar;
    req.status = req.reservedQuantity > 0 ? 'parcial' : 'cancelada';
    req.updatedAt = new Date().toISOString();

    registrarMovimentacao({
      tenantId,
      state,
      partId: req.partId,
      type: 'liberacao_reserva',
      quantity: qtdALiberar,
      osId,
      reason: reason || 'Cancelamento ou liberação de reserva operacional',
      actorId
    });

    totalLiberado += qtdALiberar;
    if (quantity != null && totalLiberado >= quantity) break;
  }

  return {
    ok: true,
    totalLiberado,
    saldos: partId ? calcularSaldos({ tenantId, state, partId }) : null
  };
}

/**
 * Registra o consumo de uma peça pelo mecânico na OS
 */
function consumirPecaOS({ tenantId, state, osId, partId, quantity, mechanicId = null, actorId = 'mecanico' }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça não encontrada para consumo.');
  }

  const os = state.os.find(o => o.id === osId && (o.tenantId === tenantId || !o.tenantId));
  if (!os) {
    throw new Error('Ordem de serviço não encontrada.');
  }

  const qtdConsumo = Math.max(1, Number(quantity) || 1);

  // Localiza a reserva vinculada à OS
  const req = state.partRequirements.find(
    r => r.tenantId === tenantId && r.osId === osId && r.partId === partId && ['atendida', 'parcial', 'reservada'].includes(r.status)
  );

  // Registra a saída física do almoxarifado vinculando mecânico e OS
  const mov = registrarMovimentacao({
    tenantId,
    state,
    partId,
    type: 'saida_os',
    quantity: qtdConsumo,
    osId,
    mechanicId: mechanicId || os.mecanico || null,
    reason: 'Consumo aplicado pelo mecânico na OS #' + (os.num || os.id),
    actorId
  });

  // Se havia reserva vinculada, desconta da reserva
  if (req) {
    req.reservedQuantity = Math.max(0, req.reservedQuantity - qtdConsumo);
    if (req.reservedQuantity === 0 && req.missingQuantity === 0) {
      req.status = 'consumida';
    }
    req.updatedAt = new Date().toISOString();
  }

  // Atualiza item na OS para marcar como consumido
  if (Array.isArray(os.pecas)) {
    const itemOS = os.pecas.find(p => p.partId === partId || p.pecaId === partId || p.id === req?.quotationItemId);
    if (itemOS) {
      itemOS.status = 'consumida';
      itemOS.st = 'consumida';
      itemOS.consumida = true;
      itemOS.consumidaPor = mechanicId || actorId;
      itemOS.consumidaEm = new Date().toISOString();
    }
  }

  return {
    ok: true,
    movement: mov,
    saldos: calcularSaldos({ tenantId, state, partId })
  };
}

/**
 * Devolução de peça não utilizada na OS ao almoxarifado
 */
function devolverPecaOS({ tenantId, state, osId, partId, quantity, reason = '', actorId = 'mecanico' }) {
  garantirColecoesEstoque(state);

  const qtdDev = Math.max(1, Number(quantity) || 1);

  const mov = registrarMovimentacao({
    tenantId,
    state,
    partId,
    type: 'devolucao_os',
    quantity: qtdDev,
    osId,
    reason: reason || 'Devolução de peça sobressalente da OS #' + osId,
    actorId
  });

  return {
    ok: true,
    movement: mov,
    saldos: calcularSaldos({ tenantId, state, partId })
  };
}

/**
 * Ajuste manual de estoque (Ação de Alto Risco sujeita a permissão e auditoria)
 */
function ajustarEstoque({ tenantId, state, partId, novaQuantidade, reason = '', actorId = 'gerente' }) {
  garantirColecoesEstoque(state);

  const peca = state.pecas.find(p => p.id === partId && p.tenantId === tenantId);
  if (!peca) {
    throw new Error('Peça não encontrada para ajuste.');
  }

  const novaQtd = Math.max(0, Number(novaQuantidade));
  const atual = Math.max(0, Number(peca.qtd) || 0);
  const diff = novaQtd - atual;

  if (diff === 0) {
    return { ok: true, diferenca: 0, novaQuantidade: atual, mensagem: 'Saldo já está correto.' };
  }

  const type = diff > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
  const mov = registrarMovimentacao({
    tenantId,
    state,
    partId,
    type,
    quantity: Math.abs(diff),
    reason: reason || 'Ajuste manual de inventário realizado por ' + actorId,
    actorId
  });

  return {
    ok: true,
    diferenca: diff,
    novaQuantidade: novaQtd,
    movement: mov,
    saldos: calcularSaldos({ tenantId, state, partId })
  };
}

module.exports = {
  arredondar,
  garantirColecoesEstoque,
  calcularSaldos,
  cadastrarPeca,
  atualizarPeca,
  obterPeca,
  buscarPecas,
  registrarMovimentacao,
  reservarParaOS,
  liberarReserva,
  consumirPecaOS,
  devolverPecaOS,
  ajustarEstoque
};
