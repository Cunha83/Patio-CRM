'use strict';

/**
 * services/finance/bankStatementReconciliationService.js
 *
 * Motor de Conciliação Bancária Multi-Formato: PDF, OFX/CNAB e API.
 * Identifica créditos, liquida borderôs B2B em cascata e baixa contas a pagar no débito.
 *
 * Teto Modular: <= 350 linhas
 */

const crypto = require('crypto');
const fleetBorderoSettlementService = require('../billing/fleetBorderoSettlementService');

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function gerarId(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
}

function parseMoedaBR(str) {
  if (!str) return 0;
  const limpo = String(str).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  return Math.abs(round2(parseFloat(limpo) || 0));
}

function parseDataBR(str) {
  if (!str) return new Date().toISOString().slice(0, 10);
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const mIso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return mIso[0];
  const mOfx = str.match(/(\d{4})(\d{2})(\d{2})/);
  if (mOfx) return `${mOfx[1]}-${mOfx[2]}-${mOfx[3]}`;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normaliza e processa extratos bancários brutos de PDF, OFX/CNAB ou API JSON.
 */
function parseExtratoBancarioInput({ formato = 'api_json', conteudoRaw = '', lancamentos = [] } = {}) {
  const transacoes = [];

  if (formato === 'api_json' || formato === 'webhook_open_finance') {
    let lista = lancamentos;
    if (typeof conteudoRaw === 'string' && conteudoRaw.trim().startsWith('[')) {
      try { lista = JSON.parse(conteudoRaw); } catch (_) {}
    }
    if (Array.isArray(lista)) {
      for (const item of lista) {
        transacoes.push({
          idTransacaoBanco: item.idTransacaoBanco || item.id || gerarId('trx'),
          data: parseDataBR(item.data),
          tipo: String(item.tipo || 'CREDITO').toUpperCase().includes('DEB') ? 'DEBITO' : 'CREDITO',
          valor: round2(item.valor || 0),
          documentoPagador: item.documentoPagador || '',
          descricao: item.descricao || item.memo || '',
          nossoNumero: item.nossoNumero || '',
          borderoRef: item.borderoRef || null
        });
      }
    }
    return transacoes;
  }

  if (formato === 'ofx_cnab') {
    const raw = String(conteudoRaw || '');
    // Verifica formato OFX
    if (raw.includes('<STMTTRN>')) {
      const blocos = raw.split(/<STMTTRN>/i).slice(1);
      for (const b of blocos) {
        const trnType = (b.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1] || 'CREDIT').trim().toUpperCase();
        const dtPosted = (b.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1] || '').trim();
        const trnAmt = parseFloat((b.match(/<TRNAMT>([^<\r\n]+)/i)?.[1] || '0').trim());
        const fitId = (b.match(/<FITID>([^<\r\n]+)/i)?.[1] || gerarId('ofx')).trim();
        const memo = (b.match(/<MEMO>([^<\r\n]+)/i)?.[1] || '').trim();

        const isDebito = trnAmt < 0 || trnType.includes('DEBIT') || trnType.includes('PAYMENT');
        const borderoMatch = memo.match(/BORD(?:ERO)?[-_ ]?([A-Za-z0-9_-]+)/i);

        transacoes.push({
          idTransacaoBanco: fitId,
          data: parseDataBR(dtPosted),
          tipo: isDebito ? 'DEBITO' : 'CREDITO',
          valor: Math.abs(round2(trnAmt)),
          descricao: memo,
          borderoRef: borderoMatch ? borderoMatch[0] : null
        });
      }
      return transacoes;
    }

    // Formato CNAB / CSV delimitado por ponto e vírgula
    const linhas = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const linha of linhas) {
      if (linha.startsWith('#') || linha.toLowerCase().includes('data;')) continue;
      const partes = linha.split(';').map(p => p.trim());
      if (partes.length >= 3) {
        const dt = parseDataBR(partes[0]);
        const tp = partes[1].toUpperCase().includes('DEB') ? 'DEBITO' : 'CREDITO';
        const v = parseMoedaBR(partes[2]);
        const doc = partes[3] || '';
        const hist = partes[4] || partes[3] || '';
        const borderoMatch = hist.match(/BORD(?:ERO)?[-_ ]?([A-Za-z0-9_-]+)/i);

        transacoes.push({
          idTransacaoBanco: doc || gerarId('cnab'),
          data: dt,
          tipo: tp,
          valor: v,
          descricao: hist,
          borderoRef: borderoMatch ? borderoMatch[0] : null
        });
      }
    }
    return transacoes;
  }

  if (formato === 'pdf_texto') {
    const linhas = String(conteudoRaw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const linha of linhas) {
      const matchData = linha.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      if (!matchData) continue;

      const dataStr = parseDataBR(matchData[1]);
      const isDebito = /PAGTO|DEBITO|TARIFA|ENVIAD[AO]|\s-\s/i.test(linha);
      const isCredito = /RECEBID[AO]|CREDITO|LIQ|\s\+\s/i.test(linha);

      const matchValor = linha.match(/[-+]?\s*(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+\.[0-9]{2})/);
      if (!matchValor) continue;

      const valor = parseMoedaBR(matchValor[1]);
      const borderoMatch = linha.match(/BORD(?:ERO)?[-_ ]?([A-Za-z0-9_-]+)/i);

      transacoes.push({
        idTransacaoBanco: gerarId('pdf_tx'),
        data: dataStr,
        tipo: isDebito && !isCredito ? 'DEBITO' : 'CREDITO',
        valor,
        descricao: linha,
        borderoRef: borderoMatch ? borderoMatch[0] : null
      });
    }
  }

  return transacoes;
}

/**
 * Executa a conciliação automática das transações bancárias no estado financeiro.
 */
function conciliarExtratoBancarioAutomatico(state, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');

  state.bankReconciliations = Array.isArray(state.bankReconciliations) ? state.bankReconciliations : [];
  state.contas = Array.isArray(state.contas) ? state.contas : [];

  const transacoes = parseExtratoBancarioInput(options);
  const borderosLiquidadosIds = [];
  const contasBaixadasIds = [];
  const pendentesRevisaoHumana = [];

  let valorTotalConciliadoCredito = 0;
  let valorTotalConciliadoDebito = 0;

  const borderosLista = [
    ...(Array.isArray(state.borderosFrotistas) ? state.borderosFrotistas : []),
    ...(Array.isArray(state.borderos) ? state.borderos : [])
  ];

  for (const t of transacoes) {
    if (t.tipo === 'CREDITO') {
      let borderoMatch = null;

      // 1. Procura por referência explícita (num ou id)
      if (t.borderoRef) {
        const refNorm = t.borderoRef.replace(/^BORDERO[-_ ]?/i, '').replace(/^BORD[-_ ]?/i, '').toLowerCase();
        borderoMatch = borderosLista.find(b =>
          b.status !== 'liquidado' && b.status !== 'pago' &&
          (String(b.id).toLowerCase().includes(refNorm) || String(b.num).toLowerCase().includes(refNorm))
        );
      }

      // 2. Procura na descrição textual por número do borderô
      if (!borderoMatch && t.descricao) {
        borderoMatch = borderosLista.find(b =>
          b.status !== 'liquidado' && b.status !== 'pago' &&
          (t.descricao.includes(b.num) || t.descricao.includes(b.id))
        );
      }

      // 3. Procura por valor exato de saldo pendente
      if (!borderoMatch) {
        borderoMatch = borderosLista.find(b => {
          if (b.status === 'liquidado' || b.status === 'pago') return false;
          const saldo = b.saldoDevedor !== undefined ? Number(b.saldoDevedor) : Number(b.valorTotal || b.totais?.totalLiquido || 0);
          return Math.abs(saldo - t.valor) < 0.02;
        });
      }

      if (borderoMatch) {
        fleetBorderoSettlementService.liquidarBorderoB2B(state, borderoMatch.id, {
          valorRecebido: t.valor,
          formaPagamento: 'conciliacao_extrato',
          dataLiquidacao: t.data,
          responsavel: options.responsavel || 'conciliador_automatico'
        });
        borderosLiquidadosIds.push(borderoMatch.id);
        valorTotalConciliadoCredito = round2(valorTotalConciliadoCredito + t.valor);
        continue;
      }

      // 4. Procura conta a receber em state.contas
      const ctaRec = state.contas.find(c =>
        c.tipo === 'receber' && c.status !== 'pago' && Math.abs(Number(c.valor) - t.valor) < 0.02
      );
      if (ctaRec) {
        ctaRec.status = 'pago';
        ctaRec.pago = true;
        ctaRec.dataPagamento = t.data;
        ctaRec.conciliadoExtrato = true;
        contasBaixadasIds.push(ctaRec.id);
        valorTotalConciliadoCredito = round2(valorTotalConciliadoCredito + t.valor);
        continue;
      }

      pendentesRevisaoHumana.push(t);
    } else {
      // DÉBITO: procura conta a pagar (fornecedor de peças, folha, boleto)
      const ctaPag = state.contas.find(c => {
        if (c.tipo !== 'pagar' || c.status === 'pago') return false;
        const vDiff = Math.abs(Number(c.valor) - t.valor);
        if (vDiff < 0.02) return true;
        if (c.numeroNF && t.descricao && t.descricao.includes(c.numeroNF) && vDiff < 0.50) return true;
        return false;
      });

      if (ctaPag) {
        ctaPag.status = 'pago';
        ctaPag.pago = true;
        ctaPag.dataPagamento = t.data;
        ctaPag.conciliadoExtrato = true;
        contasBaixadasIds.push(ctaPag.id);
        valorTotalConciliadoDebito = round2(valorTotalConciliadoDebito + t.valor);
      } else {
        pendentesRevisaoHumana.push(t);
      }
    }
  }

  const lote = {
    id: gerarId('lote_rec'),
    tenantId: state.tenantId || 'default',
    origemCanal: options.origemCanal || 'painel_web',
    dataProcessamento: options.timestamp || new Date().toISOString(),
    totalTransacoes: transacoes.length,
    conciliadasAutomaticamenteCount: borderosLiquidadosIds.length + contasBaixadasIds.length,
    borderosLiquidadosIds,
    contasBaixadasIds,
    pendentesRevisaoHumana,
    valorTotalConciliadoCredito,
    valorTotalConciliadoDebito,
    responsavel: options.responsavel || 'sistema'
  };

  state.bankReconciliations.push(lote);
  return lote;
}

module.exports = {
  parseExtratoBancarioInput,
  conciliarExtratoBancarioAutomatico
};

