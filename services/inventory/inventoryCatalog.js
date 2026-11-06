'use strict';

const {
  arredondar,
  gerarId,
  garantirColecoesEstoque,
  registrarMovimentacao
} = require('./inventoryLedger');

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
    cod: codigoInterno,
    codigoFabricante: partData.codigoFabricante ? String(partData.codigoFabricante).trim().toUpperCase() : null,
    descricao,
    nome: descricao,
    categoria: partData.categoria || 'geral',
    fabricante: partData.fabricante || null,
    unidade: (partData.unidade || 'UN').toUpperCase(),
    custoMedio,
    custo: custoMedio,
    precoVendaPadrao,
    venda: precoVendaPadrao,
    estoqueMinimo,
    min: estoqueMinimo,
    estoqueMaximo,
    qtd: 0,
    referencias,
    ativo: partData.ativo !== false,
    loc: partData.loc || 'Almoxarifado Principal',
    forn: partData.forn || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.pecas.push(novaPeca);

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

module.exports = {
  calcularSaldos,
  cadastrarPeca,
  atualizarPeca,
  obterPeca,
  buscarPecas
};

