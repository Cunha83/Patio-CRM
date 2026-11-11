'use strict';

/**
 * services/fiscal/b2bFiscalClosingService.js
 *
 * Motor de Fechamento Fiscal B2B:
 * - Segregação Automática NF-e (Peças) vs NFS-e (Serviços)
 * - Retenções Tributárias na Fonte (ISS / IRRF / CSRF) sobre serviços
 * - Ajuste Líquido no Borderô B2B e Contas a Receber
 * - Exportação de Lote Contábil e CSV da competência
 *
 * Teto Modular: <= 250 linhas
 */

const { garantirColecoes, exportarLoteContabilFiscal } = require('./b2bFiscalAccountingExportHelper');

function criarErro(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function buscarBordero(state, borderoId) {
  const lista = [...state.borderosFrotistas, ...state.borderos];
  return lista.find(b => b.id === borderoId || String(b.num) === String(borderoId));
}

function buscarOS(state, osId) {
  return state.os.find(o => o.id === osId || String(o.num) === String(osId));
}

function configurarPerfilTributarioOficina(state, payload = {}) {
  garantirColecoes(state);
  const cfg = state.fiscalConfig;

  state.fiscalConfig = {
    regimeTributario: payload.regimeTributario || cfg.regimeTributario || 'simples_nacional',
    aliquotaISSPadrao: Number(payload.aliquotaISSPadrao != null ? payload.aliquotaISSPadrao : (cfg.aliquotaISSPadrao ?? 5)),
    aliquotaIRRFPadrao: Number(payload.aliquotaIRRFPadrao != null ? payload.aliquotaIRRFPadrao : (cfg.aliquotaIRRFPadrao ?? 1.5)),
    aliquotaCSRFPadrao: Number(payload.aliquotaCSRFPadrao != null ? payload.aliquotaCSRFPadrao : (cfg.aliquotaCSRFPadrao ?? 4.65)),
    cfopPecasPadrao: String(payload.cfopPecasPadrao || cfg.cfopPecasPadrao || '5405'),
    ncmSuspensaoPadrao: String(payload.ncmSuspensaoPadrao || cfg.ncmSuspensaoPadrao || '8708.80.00'),
    codigoServicoLC116: String(payload.codigoServicoLC116 || cfg.codigoServicoLC116 || '14.01'),
    atualizadoEm: new Date().toISOString()
  };

  return { ok: true, fiscalConfig: state.fiscalConfig };
}

function extrairItensParaEspelho(state, { osId, borderoId }) {
  const pecas = [];
  const servicos = [];
  let clienteId = null;
  let clienteNome = '';

  if (osId) {
    const os = buscarOS(state, osId);
    if (!os) throw criarErro('FISCAL_SOURCE_NOT_FOUND', `Ordem de Serviço "${osId}" não encontrada.`, 404);
    clienteId = os.clienteId || os.cli || null;
    clienteNome = os.clienteNome || os.cliNome || 'Cliente Frotista';

    const pecasOS = Array.isArray(os.pecas) ? os.pecas : (Array.isArray(os.itens) ? os.itens.filter(i => i.tipo === 'peca') : []);
    const servicosOS = Array.isArray(os.servicos) ? os.servicos : (Array.isArray(os.itens) ? os.itens.filter(i => i.tipo === 'servico' || !i.tipo) : []);
    pecas.push(...pecasOS);
    servicos.push(...servicosOS);
  } else if (borderoId) {
    const bordero = buscarBordero(state, borderoId);
    if (!bordero) throw criarErro('FISCAL_SOURCE_NOT_FOUND', `Borderô "${borderoId}" não encontrado.`, 404);
    clienteId = bordero.clienteId || null;
    clienteNome = bordero.clienteNome || 'Cliente Frotista';

    if (Array.isArray(bordero.itensOS) && bordero.itensOS.length > 0) {
      for (const it of bordero.itensOS) {
        if (it.totalPecas > 0) pecas.push({ desc: it.desc || `Peças da OS ${it.num || it.osId || ''}`, total: it.totalPecas });
        if (it.totalMaoDeObra > 0) servicos.push({ desc: it.desc || `Mão de obra da OS ${it.num || it.osId || ''}`, valor: it.totalMaoDeObra });
      }
    } else if (Array.isArray(bordero.osIds) && bordero.osIds.length > 0) {
      for (const id of bordero.osIds) {
        const os = buscarOS(state, id);
        if (os) {
          if (Array.isArray(os.pecas)) pecas.push(...os.pecas);
          if (Array.isArray(os.servicos)) servicos.push(...os.servicos);
        }
      }
    } else {
      if (bordero.totalPecas > 0) pecas.push({ desc: 'Peças consolidadas do borderô', total: bordero.totalPecas });
      if (bordero.totalMaoDeObra > 0) servicos.push({ desc: 'Serviços consolidados do borderô', valor: bordero.totalMaoDeObra });
    }
  } else {
    throw criarErro('FISCAL_SOURCE_NOT_FOUND', 'Fonte fiscal (osId ou borderoId) não informada.', 404);
  }

  return { clienteId, clienteNome, pecas, servicos };
}

function gerarEspelhoFiscalOSOuBordero(state, payload = {}) {
  garantirColecoes(state);
  const cfg = state.fiscalConfig;
  const agora = payload.timestamp || new Date().toISOString();

  const { clienteId, clienteNome, pecas, servicos } = extrairItensParaEspelho(state, payload);

  const ncmDefault = cfg.ncmSuspensaoPadrao || '8708.80.00';
  const cfopDefault = cfg.cfopPecasPadrao || '5405';
  const lc116Default = cfg.codigoServicoLC116 || '14.01';

  const pecasItens = pecas.map((p, idx) => {
    const qtd = Number(p.qtd || p.quantidade || 1);
    const vUnit = Number(p.valor || p.preco || (p.total ? p.total / qtd : 0));
    const total = Math.round(Number(p.total != null ? p.total : vUnit * qtd) * 100) / 100;
    return {
      itemIndex: idx + 1,
      descricao: p.desc || p.descricao || 'Peça Pesada Automotiva',
      ncm: p.ncm || ncmDefault,
      cfop: p.cfop || cfopDefault,
      qtd,
      valorUnitario: vUnit,
      total
    };
  });

  const servicosItens = servicos.map((s, idx) => {
    const valor = Math.round(Number(s.valor || s.preco || s.total || 0) * 100) / 100;
    return {
      itemIndex: idx + 1,
      descricao: s.desc || s.descricao || 'Serviço de Manutenção e Reparação de Veículos',
      codigoServicoLC116: s.codigoServicoLC116 || lc116Default,
      valor
    };
  });

  const baseCalculoPecasTotal = Math.round(pecasItens.reduce((sum, p) => sum + p.total, 0) * 100) / 100;
  const baseCalculoServicosTotal = Math.round(servicosItens.reduce((sum, s) => sum + s.valor, 0) * 100) / 100;
  const valorBrutoTotal = Math.round((baseCalculoPecasTotal + baseCalculoServicosTotal) * 100) / 100;

  const regimeTributario = payload.regimeTributario || cfg.regimeTributario || 'simples_nacional';
  const aliquotaISS = Number(payload.aliquotaISS != null ? payload.aliquotaISS : (cfg.aliquotaISSPadrao ?? 5));
  const aliquotaIRRF = Number(payload.aliquotaIRRF != null ? payload.aliquotaIRRF : (cfg.aliquotaIRRFPadrao ?? 1.5));
  const aliquotaCSRF = Number(payload.aliquotaCSRF != null ? payload.aliquotaCSRF : (cfg.aliquotaCSRFPadrao ?? 4.65));

  const reterISS = Boolean(payload.reterISS);
  const reterIRRF = Boolean(payload.reterIRRF);
  const reterCSRF = Boolean(payload.reterCSRF);
  const forcarFederal = Boolean(payload.forcarRetencaoFederalSimples);

  const valorISSRetido = reterISS ? Math.round(baseCalculoServicosTotal * (aliquotaISS / 100) * 100) / 100 : 0;
  let valorIRRFRetido = 0;
  let valorCSRFRetido = 0;
  let dispensaRetencaoFederalSimples = false;

  if (regimeTributario === 'simples_nacional' && !forcarFederal) {
    dispensaRetencaoFederalSimples = true;
  } else {
    if (reterIRRF) valorIRRFRetido = Math.round(baseCalculoServicosTotal * (aliquotaIRRF / 100) * 100) / 100;
    if (reterCSRF) valorCSRFRetido = Math.round(baseCalculoServicosTotal * (aliquotaCSRF / 100) * 100) / 100;
  }

  const totalRetencoesNaFonte = Math.round((valorISSRetido + valorIRRFRetido + valorCSRFRetido) * 100) / 100;
  const valorLiquidoAReceber = Math.max(0, Math.round((valorBrutoTotal - totalRetencoesNaFonte) * 100) / 100);

  const espelho = {
    id: `fisc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId: payload.tenantId || state.tenantId || 'default',
    osId: payload.osId || null,
    borderoId: payload.borderoId || null,
    clienteId,
    clienteNome,
    dataEmissaoEspelho: agora,
    status: 'espelho_gerado',
    regimeTributario,
    dispensaRetencaoFederalSimples,
    baseCalculoPecasTotal,
    baseCalculoServicosTotal,
    valorBrutoTotal,
    retencoes: {
      reterISS,
      aliquotaISS,
      valorISSRetido,
      reterIRRF,
      aliquotaIRRF,
      valorIRRFRetido,
      reterCSRF,
      aliquotaCSRF,
      valorCSRFRetido,
      totalRetencoesNaFonte
    },
    valorLiquidoAReceber,
    espelhoNFePecas: {
      modelo: '55',
      cfopPadrao: cfopDefault,
      totalBaseCalculo: baseCalculoPecasTotal,
      itens: pecasItens
    },
    espelhoNFSeServicos: {
      codigoServicoLC116: lc116Default,
      totalBaseCalculo: baseCalculoServicosTotal,
      itens: servicosItens
    },
    observacoesFiscais: payload.observacoesFiscais || '',
    notasEmitidas: null,
    criadoEm: agora
  };

  state.fiscalClosings.push(espelho);
  return { ok: true, espelhoFiscal: espelho };
}

function emitirLoteNotasFiscaisB2B(state, espelhoFiscalId, payload = {}) {
  garantirColecoes(state);
  const espelho = state.fiscalClosings.find(f => f.id === espelhoFiscalId);
  if (!espelho) throw criarErro('FISCAL_CLOSING_NOT_FOUND', `Fechamento fiscal "${espelhoFiscalId}" não encontrado.`, 404);
  if (espelho.status === 'notas_emitidas') {
    throw criarErro('FISCAL_CLOSING_ALREADY_ISSUED', `Fechamento fiscal "${espelhoFiscalId}" já possui notas emitidas.`, 409);
  }

  if (espelho.baseCalculoPecasTotal > 0 && !payload.numeroNFePecas) {
    throw criarErro('MISSING_INVOICE_NUMBERS', 'Número da NF-e de peças é obrigatório quando há peças faturadas.', 400);
  }
  if (espelho.baseCalculoServicosTotal > 0 && !payload.numeroNFSeServicos) {
    throw criarErro('MISSING_INVOICE_NUMBERS', 'Número da NFS-e de serviços é obrigatório quando há serviços faturados.', 400);
  }

  const agora = payload.timestamp || new Date().toISOString();
  espelho.status = 'notas_emitidas';
  espelho.notasEmitidas = {
    numeroNFePecas: payload.numeroNFePecas || null,
    serieNFePecas: payload.serieNFePecas || '1',
    chaveAcessoNFe: payload.chaveAcessoNFe || null,
    numeroNFSeServicos: payload.numeroNFSeServicos || null,
    codigoVerificacaoNFSe: payload.codigoVerificacaoNFSe || null,
    responsavel: payload.responsavel || 'Operador Fiscal',
    emitidoEm: agora
  };

  if (payload.atualizarLiquidoReceber !== false && espelho.retencoes.totalRetencoesNaFonte > 0) {
    if (espelho.borderoId) {
      const bordero = buscarBordero(state, espelho.borderoId);
      if (bordero) {
        bordero.valorBrutoOriginal = bordero.valorBrutoOriginal || bordero.valorTotal;
        bordero.totalRetencoesFiscais = espelho.retencoes.totalRetencoesNaFonte;
        bordero.valorTotal = espelho.valorLiquidoAReceber;
        bordero.saldoDevedor = Math.max(0, Math.round((espelho.valorLiquidoAReceber - Number(bordero.valorPagoAcumulado || 0)) * 100) / 100);
        bordero.dadosFiscaisB2B = { ...espelho.notasEmitidas, retencoes: espelho.retencoes };
      }
    }

    if (espelho.osId) {
      const os = buscarOS(state, espelho.osId);
      if (os) {
        os.valorBrutoOriginal = os.valorBrutoOriginal || os.total;
        os.totalRetencoesFiscais = espelho.retencoes.totalRetencoesNaFonte;
        os.valorLiquidoAReceber = espelho.valorLiquidoAReceber;
        os.dadosFiscaisB2B = { ...espelho.notasEmitidas, retencoes: espelho.retencoes };
      }
    }

    for (const c of state.contas) {
      if (c.tipo === 'receber' && c.status !== 'pago') {
        if ((espelho.borderoId && (c.borderoId === espelho.borderoId || c.origemRef === espelho.borderoId)) ||
            (espelho.osId && (c.osId === espelho.osId || c.origemRef === espelho.osId))) {
          c.valorBrutoOriginal = c.valorBrutoOriginal || c.valor;
          c.retencoesFiscais = espelho.retencoes.totalRetencoesNaFonte;
          c.valor = espelho.valorLiquidoAReceber;
        }
      }
    }
  }

  return { ok: true, espelhoFiscal: espelho };
}

module.exports = {
  configurarPerfilTributarioOficina,
  gerarEspelhoFiscalOSOuBordero,
  emitirLoteNotasFiscaisB2B,
  exportarLoteContabilFiscal
};
