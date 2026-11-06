'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  requirePermission
} = require('../lib/serverContext');
const { salvarSnapshotDatabase } = require('../lib/persistence/jsonDatabase');

/* ── Utilitários Pix EMV (BR Code) ─────────────────────────── */
function calcularCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatarTLV(id, valor) {
  const v = String(valor ?? '');
  const len = String(Buffer.byteLength(v, 'utf8')).padStart(2, '0');
  return `${id}${len}${v}`;
}

function gerarPayloadPix({ chavePix, nomeRecebedor, cidadeRecebedor, valor, txid, descricao }) {
  const chaveNorm = String(chavePix || 'financeiro@oficina.com.br').trim();
  const nomeNorm = String(nomeRecebedor || 'PATIO CRM OFICINA')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 25);
  const cidadeNorm = String(cidadeRecebedor || 'SAO PAULO')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 15);
  const txidNorm = String(txid || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';
  const valNorm = (Number(valor) > 0) ? Number(valor).toFixed(2) : null;

  let merchantInfo = formatarTLV('00', 'br.gov.bcb.pix') + formatarTLV('01', chaveNorm);
  if (descricao) {
    merchantInfo += formatarTLV('02', String(descricao).slice(0, 40));
  }

  let raw = '';
  raw += formatarTLV('00', '01');
  raw += formatarTLV('26', merchantInfo);
  raw += formatarTLV('52', '0000');
  raw += formatarTLV('53', '986');
  if (valNorm) {
    raw += formatarTLV('54', valNorm);
  }
  raw += formatarTLV('58', 'BR');
  raw += formatarTLV('59', nomeNorm);
  raw += formatarTLV('60', cidadeNorm);
  raw += formatarTLV('62', formatarTLV('05', txidNorm));
  raw += '6304';

  const crc = calcularCRC16(raw);
  return raw + crc;
}

/* ── 1. White-Label: GET & POST /api/tenant/theme ──────────── */

router.post('/api/financeiro/pix/gerar', async (req, res) => {
  try {
    if (req.securityContext?.role === 'mecanico') {
      return res.status(403).json({ success: false, error: 'Acesso negado: perfil de mecânico não possui acesso ao financeiro.' });
    }
    const { osId, valor, descricao, cliente } = req.body || {};
    const state = await getOrLoadState(req);

    const cfg = state.cfg || {};
    const chavePix = cfg.chavePix || cfg.pix || 'financeiro@patiocrm.com.br';
    const empresaNome = cfg.empresa || 'PATIO CRM OFICINA';

    const txid = 'OS' + String(osId || '0').replace(/\D/g, '').slice(-8) + Date.now().toString(36).toUpperCase().slice(-6);
    const pixCopiaECola = gerarPayloadPix({
      chavePix,
      nomeRecebedor: empresaNome,
      cidadeRecebedor: 'SAO PAULO',
      valor: Number(valor) || 0,
      txid,
      descricao: descricao || `Pagamento OS #${osId}`
    });

    // Salva transação pendente no estado
    await mutateTenantState(req, (draft) => {
      draft.pix_transacoes = Array.isArray(draft.pix_transacoes) ? draft.pix_transacoes : [];
      draft.pix_transacoes.push({
        txid,
        osId,
        valor: Number(valor) || 0,
        cliente: cliente || '',
        status: 'PENDENTE',
        criadoEm: new Date().toISOString()
      });
    });

    res.json({
      success: true,
      txid,
      pixCopiaECola,
      chavePix,
      valor: Number(valor) || 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post(['/api/webhooks/pix', '/webhooks/pix'], async (req, res) => {
  try {
    const { txid, status, valor, pagoEm } = req.body || {};
    if (!txid) {
      return res.status(400).json({ success: false, error: 'txid é obrigatório.' });
    }

    let conciliado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      draft.pix_transacoes = Array.isArray(draft.pix_transacoes) ? draft.pix_transacoes : [];
      draft.os = Array.isArray(draft.os) ? draft.os : [];
      draft.contas = Array.isArray(draft.contas) ? draft.contas : [];
      draft.movimentos = Array.isArray(draft.movimentos) ? draft.movimentos : [];

      const tx = draft.pix_transacoes.find(t => t.txid === txid);
      if (tx) {
        tx.status = 'PAGO';
        tx.pagoEm = pagoEm || new Date().toISOString();
      }

      const osId = tx ? tx.osId : null;
      let targetOS = null;
      if (osId) {
        targetOS = draft.os.find(o => o.id === osId || String(o.num) === String(osId));
      } else {
        // Tenta achar pelo txid em campos da OS
        targetOS = draft.os.find(o => o.txid === txid);
      }

      const vlrPago = Number(valor || (tx ? tx.valor : (targetOS ? targetOS.total : 0))) || 0;

      if (targetOS) {
        targetOS.pago = true;
        targetOS.formaPgto = 'pix';
        targetOS.saldoPendente = 0;
        targetOS.txid = txid;
      }

      // Cria Conta a Receber Quitada
      const contaReceber = {
        id: 'rec_' + Date.now(),
        tipo: 'receita',
        desc: `Recebimento Pix OS #${targetOS ? (targetOS.num || targetOS.id) : txid}`,
        parte: targetOS ? targetOS.cliente : (tx ? tx.cliente : 'Cliente'),
        valor: vlrPago,
        venc: new Date().toISOString().slice(0, 10),
        pago: true,
        pagoEm: new Date().toISOString(),
        formaPgto: 'pix',
        cat: 'Ordem de Serviço',
        txid
      };
      draft.contas.push(contaReceber);

      // Registra entrada no Caixa
      const movCaixa = {
        id: 'mov_' + Date.now(),
        tipo: 'entrada',
        valor: vlrPago,
        desc: `Recebimento Pix OS #${targetOS ? (targetOS.num || targetOS.id) : txid}`,
        data: new Date().toISOString(),
        cat: 'OS',
        txid
      };
      draft.movimentos.push(movCaixa);

      conciliado = { txid, osId: targetOS ? targetOS.id : null, valor: vlrPago, status: 'PAGO' };
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao processar webhook Pix.' });
    }

    res.json({
      success: true,
      message: 'Pagamento Pix conciliado e liquidado com sucesso!',
      conciliado
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 8. Elo 5: Duplicar e Ações em Lote ────────────────────── */

module.exports = router;
