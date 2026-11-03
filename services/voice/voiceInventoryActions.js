'use strict';

const inventoryService = require('../inventoryService');

async function handleInventoryAction({ intencao, interpretado, input, context = {}, state = {} }) {
  if (intencao === 'reservar_peca_os') {
    const tenantId = context.tenantId || 'default';
    const osNum = interpretado.reserva?.osNum;
    let osAlvo = null;
    if (osNum) osAlvo = state.os.find(o => (o.num === osNum || o.id === String(osNum)) && (o.tenantId === tenantId || !o.tenantId));
    if (!osAlvo && context.activeOsId) osAlvo = state.os.find(o => o.id === context.activeOsId);
    if (!osAlvo && state.os.length > 0) osAlvo = state.os.find(o => o.st !== 'finalizada');

    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual Ordem de Serviço deve receber a reserva.' };
    }

    const tLower = ((input && (input.text || input.texto)) || '').toLowerCase();
    let pecaAlvo = null;
    if (Array.isArray(state.pecas)) {
      pecaAlvo = state.pecas.find(p => (p.tenantId === tenantId || !p.tenantId) && (
        tLower.includes((p.descricao || '').toLowerCase()) ||
        tLower.includes((p.nome || '').toLowerCase()) ||
        (p.codigoInterno && tLower.includes(p.codigoInterno.toLowerCase()))
      ));
    }

    if (!pecaAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não encontrei no cadastro a peça mencionada para realizar a reserva.' };
    }

    const qtd = interpretado.reserva?.quantidade || 1;
    const resReserva = inventoryService.reservarParaOS({
      tenantId,
      state,
      osId: osAlvo.id,
      partId: pecaAlvo.id,
      quantity: qtd,
      actorId: context.actorId || 'operador_voz'
    });

    return {
      ok: true,
      acao: intencao,
      reserva: resReserva,
      resposta: `Reserva processada para a OS #${osAlvo.num || osAlvo.id}: ${resReserva.reservedQuantity} unidade(s) de "${pecaAlvo.descricao}" reservada(s)${resReserva.missingQuantity > 0 ? `, e ${resReserva.missingQuantity} colocada(s) em necessidade de compra.` : '.'}`
    };
  }

  if (intencao === 'consultar_os_aguardando_pecas') {
    const tenantId = context.tenantId || 'default';
    const reqs = (state.partRequirements || []).filter(r => r.tenantId === tenantId && (r.status === 'aguardando_compra' || r.missingQuantity > 0));
    const osIds = [...new Set(reqs.map(r => r.osId))];
    const oss = state.os.filter(o => osIds.includes(o.id));

    if (oss.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há nenhuma ordem de serviço retida aguardando peças no momento.' };
    }
    const lista = oss.map(o => `OS #${o.num || o.id} (${o.placa || 'Sem placa'})`).join(', ');
    return {
      ok: true,
      acao: intencao,
      total: oss.length,
      resposta: `Temos ${oss.length} OS(s) aguardando peças no momento: ${lista}.`
    };
  }

  if (intencao === 'consultar_compras_pendentes') {
    const tenantId = context.tenantId || 'default';
    const reqs = (state.partRequirements || []).filter(r => r.tenantId === tenantId && (r.status === 'aguardando_compra' || r.missingQuantity > 0));
    if (reqs.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há pendências de compras de peças registradas no sistema.' };
    }
    const pecasMap = new Map();
    for (const r of reqs) {
      const p = (state.pecas || []).find(it => it.id === r.partId);
      const desc = p ? p.descricao : 'Item sem código';
      pecasMap.set(desc, (pecasMap.get(desc) || 0) + (r.missingQuantity || 1));
    }
    const itensTxt = Array.from(pecasMap.entries()).map(([k, v]) => `${v} un de ${k}`).join(', ');
    return {
      ok: true,
      acao: intencao,
      totalItens: reqs.length,
      resposta: `Estão pendentes de compra: ${itensTxt}.`
    };
  }

  if (intencao === 'consultar_pedidos_atrasados') {
    const tenantId = context.tenantId || 'default';
    const agora = new Date();
    const atrasados = (state.purchaseOrders || []).filter(o => {
      if (o.tenantId !== tenantId) return false;
      if (o.status !== 'pedido_realizado' && o.status !== 'parcialmente_recebido') return false;
      return o.expectedAt && new Date(o.expectedAt) < agora;
    });
    if (atrasados.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Todos os pedidos de compra estão dentro do prazo previsto de entrega.' };
    }
    const txt = atrasados.map(o => `Pedido ${o.codigo} (${o.supplierNome})`).join(', ');
    return {
      ok: true,
      acao: intencao,
      total: atrasados.length,
      resposta: `Existem ${atrasados.length} pedido(s) de compra atrasado(s): ${txt}.`
    };
  }

  if (intencao === 'consultar_fornecedor_peca') {
    const tenantId = context.tenantId || 'default';
    const fornecedores = (state.suppliers || []).filter(s => s.tenantId === tenantId && s.ativo !== false);
    if (fornecedores.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Nenhum fornecedor cadastrado para esse tenant.' };
    }
    const lista = fornecedores.map(f => `${f.nome} (prazo médio: ${f.prazoMedioDias} dias)`).join(', ');
    return {
      ok: true,
      acao: intencao,
      resposta: `Fornecedores cadastrados disponíveis: ${lista}.`
    };
  }

  if (intencao === 'consultar_estoque_peca') {
    const tenantId = context.tenantId || 'default';
    const tLower = ((input && (input.text || input.texto)) || '').toLowerCase();

    // 1. Verifica se mencionou placa
    const matchPlaca = tLower.match(/\b([a-z]{3}[0-9][a-z0-9][0-9]{2}|[a-z]{3}[0-9]{4})\b/i);
    if (matchPlaca) {
      const placa = matchPlaca[1].toUpperCase();
      const veiculo = (state.veiculos || []).find(v => v.placa === placa);
      const os = (state.os || []).find(o => (o.placa === placa || o.vei === veiculo?.id) && o.st !== 'finalizada');
      if (os && Array.isArray(os.pecas) && os.pecas.length > 0) {
        const pecasOS = os.pecas.map(p => {
          const saldos = p.partId ? inventoryService.calcularSaldos({ tenantId, state, partId: p.partId }) : null;
          return `${p.desc || p.nome}: ${saldos ? `${saldos.estoqueDisponivel} disponível(eis)` : (p.qtdReservada ? `${p.qtdReservada} reservada(s)` : 'status ' + (p.statusEstoque || 'pendente'))}`;
        }).join(', ');
        return {
          ok: true,
          acao: intencao,
          resposta: `Para o veículo placa ${placa} (OS #${os.num || os.id}), situação das peças: ${pecasOS}.`
        };
      }
    }

    // 2. Busca peça pelo nome no cadastro
    let peca = null;
    if (Array.isArray(state.pecas)) {
      peca = state.pecas.find(p => {
        if (p.tenantId !== tenantId && p.tenantId) return false;
        const desc = (p.descricao || p.nome || '').toLowerCase();
        const cod = (p.codigoInterno || p.cod || '').toLowerCase();
        if (cod && tLower.includes(cod)) return true;
        if (desc && tLower.includes(desc)) return true;
        const palavras = desc.split(/[\s-]+/).filter(w => w.length >= 4);
        return palavras.some(w => tLower.includes(w));
      });
    }

    if (!peca) {
      const totalItens = (state.pecas || []).filter(p => p.tenantId === tenantId).length;
      return {
        ok: true,
        acao: intencao,
        resposta: `Temos ${totalItens} variedade(s) de peças cadastradas no almoxarifado.`
      };
    }

    const saldos = inventoryService.calcularSaldos({ tenantId, state, partId: peca.id });
    return {
      ok: true,
      acao: intencao,
      peca,
      saldos,
      resposta: `Para "${peca.descricao}" (${peca.codigoInterno}): temos ${saldos.estoqueFisico} unidade(s) físicas, sendo ${saldos.estoqueReservado} reservada(s) e ${saldos.estoqueDisponivel} disponível(eis) no almoxarifado.`
    };
  }

  if (intencao === 'consultar_estoque') {
    const pecas = Array.isArray(state.pecas) ? state.pecas : [];
    const criticas = pecas.filter(p => {
      const qtd = Number(p.qtd) || 0;
      const min = Number(p.min) || 1;
      return qtd <= min;
    });

    let resp = '';
    if (criticas.length === 0) {
      resp = 'O estoque está regular. Nenhuma peça está abaixo do estoque mínimo de segurança.';
    } else {
      const lista = criticas.slice(0, 4).map(p => `${p.nome || p.cod || 'Peça'} (${p.qtd} em estoque, mín. ${p.min || 1})`).join(', ');
      resp = `Atenção: temos ${criticas.length} item(ns) com estoque baixo ou crítico para reposição: ${lista}.`;
    }

    return {
      ok: true,
      acao: 'consultar_estoque',
      totalCriticas: criticas.length,
      criticas,
      resposta: resp
    };
  }

  return null;
}

module.exports = {
  handleInventoryAction
};

