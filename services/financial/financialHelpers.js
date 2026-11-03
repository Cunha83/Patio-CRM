'use strict';

const crypto = require('crypto');
const financialEngine = require('../financialEngine');

function gerarId(prefix = 'cx') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function hojeISO() {
  return financialEngine.obterAgoraSP().dataISO;
}

function agoraISO() {
  return new Date().toISOString();
}

/**
 * Normaliza meio de pagamento para chaves canônicas
 */
function normalizarFormaPagamento(forma = 'dinheiro') {
  const f = String(forma || '').toLowerCase().trim();
  if (f.includes('pix')) return 'pix';
  if (f.includes('debito') || f.includes('débito')) return 'cartao_debito';
  if (f.includes('credito') || f.includes('crédito')) return 'cartao_credito';
  if (f.includes('cartao') || f.includes('cartão')) return 'cartao';
  if (f.includes('boleto')) return 'boleto';
  if (f.includes('transferencia') || f.includes('transferência') || f.includes('ted') || f.includes('doc')) return 'transferencia';
  if (f.includes('cheque')) return 'cheque';
  return 'dinheiro';
}

/**
 * Normaliza tipo base de movimentação (entrada vs saida)
 */
function normalizarTipoMovimentacao(tipoRaw = 'receita') {
  const t = String(tipoRaw || '').toLowerCase().trim();
  if (['entrada', 'receita', 'suprimento', 'aporte', 'recebimento'].includes(t)) {
    return { tipoBase: 'entrada', subtipo: t || 'receita' };
  }
  return { tipoBase: 'saida', subtipo: t || 'despesa' };
}

/**
 * Localiza o caixa atualmente aberto no estado do tenant
 */
function obterCaixaAberto(state = {}, tenantId = 'default') {
  if (!Array.isArray(state.caixas)) return null;
  return state.caixas.find(c =>
    (c.status === 'aberto' || c.aberto === true) &&
    (c.tenantId === tenantId || !c.tenantId)
  ) || null;
}

/**
 * Normaliza e projeta uma movimentação preservando metadados de auditoria
 */
function projetarMovimentacao(m = {}) {
  if (!m || typeof m !== 'object') return {};
  const origem = m.origem || 'web';
  const nat = m.naturezaOperacao || (m.subtipo === 'sangria' ? 'sangria' : (m.subtipo === 'suprimento' ? 'suprimento' : (m.subtipo === 'estorno' || m.estornoDeId ? 'estorno' : 'operacional')));
  return {
    ...m,
    naturezaOperacao: nat,
    origem,
    canal: m.canal || (origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: m.autorNumero || null,
    confirmadoEm: m.confirmadoEm || null,
    estornado: Boolean(m.estornado),
    estornadoEm: m.estornadoEm || null,
    estornadoPor: m.estornadoPor || null,
    motivoEstorno: m.motivoEstorno || null,
    estornoDeId: m.estornoDeId || null,
    tituloId: m.tituloId || null
  };
}

/**
 * Normaliza e projeta um turno de caixa com metadados de auditoria
 */
function projetarCaixa(c = {}) {
  if (!c || typeof c !== 'object') return null;
  const origem = c.origem || 'sistema';
  return {
    ...c,
    origem,
    canal: c.canal || (origem === 'whatsapp' ? 'whatsapp' : 'web'),
    autorNumero: c.autorNumero || null,
    confirmadoEm: c.confirmadoEm || null,
    resumoPorOS: c.resumoPorOS || {}
  };
}

/**
 * Lista movimentações financeiras com filtros de origem, estorno e paginação
 */
function listarMovimentacoes(state = {}, filtros = {}) {
  const movsRaw = Array.isArray(state.movimentos) ? state.movimentos : [];
  let lista = movsRaw.map(projetarMovimentacao);

  const {
    tipo,
    subtipo,
    de,
    ate,
    forma,
    caixaId,
    origem,
    estornado,
    apenasAtivos,
    limit
  } = filtros;

  if (tipo) lista = lista.filter(m => m.tipo === tipo);
  if (subtipo) lista = lista.filter(m => m.subtipo === subtipo);
  if (caixaId) lista = lista.filter(m => m.caixaId === caixaId);

  const formaFiltro = forma || filtros.meioPagamento;
  if (formaFiltro && formaFiltro !== 'todos') {
    const fNorm = String(formaFiltro).toLowerCase().trim();
    lista = lista.filter(m => {
      const f = String(m.forma || m.formaPagamento || '').toLowerCase().trim();
      return f === fNorm || f.includes(fNorm);
    });
  }
  if (de) lista = lista.filter(m => (m.data || '').slice(0, 10) >= de);
  if (ate) lista = lista.filter(m => (m.data || '').slice(0, 10) <= ate);

  if (origem && origem !== 'todos') {
    const origNorm = String(origem).toLowerCase().trim();
    if (origNorm === 'estornados') {
      lista = lista.filter(m => Boolean(m.estornado));
    } else if (origNorm === 'web') {
      lista = lista.filter(m => String(m.origem || 'web').toLowerCase() !== 'whatsapp');
    } else {
      lista = lista.filter(m => String(m.origem || '').toLowerCase() === origNorm);
    }
  }

  if (estornado !== undefined && estornado !== null && estornado !== '') {
    const estBool = String(estornado) === 'true' || estornado === true;
    lista = lista.filter(m => Boolean(m.estornado) === estBool);
  } else if (apenasAtivos) {
    lista = lista.filter(m => !m.estornado);
  }

  const resumoOrigem = {
    totalWhatsapp: 0,
    qtdWhatsapp: 0,
    totalWeb: 0,
    qtdWeb: 0,
    totalEstornados: 0,
    qtdEstornados: 0
  };

  for (const m of lista) {
    const v = Number(m.valor) || 0;
    if (m.estornado) {
      resumoOrigem.qtdEstornados++;
      resumoOrigem.totalEstornados = arredondar(resumoOrigem.totalEstornados + v);
    }
    if (m.origem === 'whatsapp') {
      resumoOrigem.qtdWhatsapp++;
      resumoOrigem.totalWhatsapp = arredondar(resumoOrigem.totalWhatsapp + v);
    } else {
      resumoOrigem.qtdWeb++;
      resumoOrigem.totalWeb = arredondar(resumoOrigem.totalWeb + v);
    }
  }

  const resumoMeiosPagamento = {};
  for (const m of lista) {
    const v = Number(m.valor) || 0;
    const f = normalizarFormaPagamento(m.forma || m.formaPagamento);
    if (!resumoMeiosPagamento[f]) {
      resumoMeiosPagamento[f] = { total: 0, qtd: 0 };
    }
    resumoMeiosPagamento[f].qtd++;
    resumoMeiosPagamento[f].total = arredondar(resumoMeiosPagamento[f].total + v);
  }

  const resumoPorOS = {};
  for (const m of lista) {
    if (m.osId && !m.estornado && !m.estornoDeId && m.subtipo !== 'estorno') {
      const osKey = String(m.osId).replace(/^#/, '').trim();
      if (!resumoPorOS[osKey]) {
        resumoPorOS[osKey] = {
          osId: osKey,
          totalEntradasOS: 0,
          totalSaidasOS: 0,
          saldoLiquidoOS: 0,
          qtdLancamentos: 0,
          placasVinculadas: []
        };
      }
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada' || m.tipo === 'receita') {
        resumoPorOS[osKey].totalEntradasOS = arredondar(resumoPorOS[osKey].totalEntradasOS + v);
      } else {
        resumoPorOS[osKey].totalSaidasOS = arredondar(resumoPorOS[osKey].totalSaidasOS + v);
      }
      resumoPorOS[osKey].saldoLiquidoOS = arredondar(resumoPorOS[osKey].totalEntradasOS - resumoPorOS[osKey].totalSaidasOS);
      resumoPorOS[osKey].qtdLancamentos++;
      if (m.placa && !resumoPorOS[osKey].placasVinculadas.includes(String(m.placa).toUpperCase().trim())) {
        resumoPorOS[osKey].placasVinculadas.push(String(m.placa).toUpperCase().trim());
      }
    }
  }

  const max = Number(limit) > 0 ? Number(limit) : 200;
  return {
    total: lista.length,
    movimentacoes: lista.slice(0, max),
    resumoOrigem,
    resumoMeiosPagamento,
    resumoPorOS
  };
}

module.exports = {
  gerarId,
  arredondar,
  hojeISO,
  agoraISO,
  normalizarFormaPagamento,
  normalizarTipoMovimentacao,
  obterCaixaAberto,
  projetarMovimentacao,
  projetarCaixa,
  listarMovimentacoes
};
