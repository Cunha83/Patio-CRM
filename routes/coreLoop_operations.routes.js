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

router.post('/api/patio/box-update', async (req, res) => {
  try {
    const { boxId, osId, placa, status, observacoes } = req.body || {};
    if (!boxId && !osId) {
      return res.status(400).json({ success: false, error: 'boxId ou osId é obrigatório.' });
    }

    let boxAtualizado = null;
    let osAtualizada = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      draft.boxes = Array.isArray(draft.boxes) ? draft.boxes : [];
      draft.os = Array.isArray(draft.os) ? draft.os : [];
      draft.auditoria = Array.isArray(draft.auditoria) ? draft.auditoria : [];

      // Atualiza Box
      if (boxId) {
        let b = draft.boxes.find(x => x.id === boxId);
        if (!b) {
          b = { id: boxId, nome: `Box ${boxId.toUpperCase()}`, tipo: 'Mecânica Geral' };
          draft.boxes.push(b);
        }
        b.veiculo = placa || b.veiculo || null;
        b.osId = osId || b.osId || null;
        b.status = status || b.status || 'ocupado';
        b.atualizadoEm = new Date().toISOString();
        boxAtualizado = b;
      }

      // Atualiza OS
      if (osId) {
        const o = draft.os.find(x => x.id === osId || String(x.num) === String(osId));
        if (o) {
          if (boxId) o.box = boxId;
          if (status) {
            o.st = status;
            if (status === 'executando') o.etapaPatio = 'em_execucao';
            else if (status === 'peca') o.etapaPatio = 'pausado_gargalo';
            else if (status === 'finalizada') o.etapaPatio = 'pronto_retirada';
          }
          if (placa) o.placa = placa;
          if (observacoes) o.observacoes = observacoes;
          o.atualizadoEm = new Date().toISOString();
          osAtualizada = o;
        }
      }

      // Auditoria
      draft.auditoria.push({
        id: 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        tipo: 'BOX_UPDATE',
        boxId,
        osId,
        placa,
        status,
        observacoes,
        timestamp: new Date().toISOString(),
        usuario: req.securityContext?.actorId || 'operador'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao persistir atualização do box.' });
    }

    res.json({
      success: true,
      box: boxAtualizado,
      os: osAtualizada
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 4. Elo 2: Movimentação Atômica de Estoque (POST /api/estoque/movimentar) ── */
router.post('/api/estoque/movimentar', async (req, res) => {
  try {
    const { tipo, osId, produtoId, qtd, motivo } = req.body || {};
    const quantidade = Number(qtd);

    if (!tipo || !produtoId || isNaN(quantidade)) {
      return res.status(400).json({ success: false, error: 'Parâmetros tipo, produtoId e qtd são obrigatórios.' });
    }

    let pecaAtualizada = null;
    let registroKardex = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      draft.pecas = Array.isArray(draft.pecas) ? draft.pecas : [];
      draft.kardex_movimentacoes = Array.isArray(draft.kardex_movimentacoes) ? draft.kardex_movimentacoes : [];
      draft.inventoryMovements = Array.isArray(draft.inventoryMovements) ? draft.inventoryMovements : [];

      const peca = draft.pecas.find(p => p.id === produtoId || p.codigo === produtoId || p.codigoInterno === produtoId || p.cod === produtoId);
      if (!peca) {
        throw new Error(`Peça/Produto "${produtoId}" não encontrado no catálogo.`);
      }

      const saldoAnterior = Number(peca.qtd || 0);
      let saldoAtual = saldoAnterior;

      if (tipo === 'SAIDA_OS') {
        if (saldoAnterior < quantidade) {
          const err = new Error(`Estoque insuficiente para "${peca.nome || peca.descricao}". Saldo disponível: ${saldoAnterior}, Solicitado: ${quantidade}.`);
          err.status = 400;
          throw err;
        }
        saldoAtual = saldoAnterior - quantidade;
      } else if (tipo === 'ENTRADA_COMPRA' || tipo === 'DEVOLUCAO') {
        saldoAtual = saldoAnterior + quantidade;
      } else if (tipo === 'AJUSTE') {
        saldoAtual = quantidade;
      } else {
        throw new Error(`Tipo de movimentação inválido: ${tipo}`);
      }

      peca.qtd = saldoAtual;
      pecaAtualizada = peca;

      const kdx = {
        id: 'kdx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        tipo,
        osId: osId || null,
        produtoId: peca.id,
        produtoNome: peca.nome || peca.descricao,
        qtd: quantidade,
        saldoAnterior,
        saldoAtual,
        data: new Date().toISOString(),
        usuario: req.securityContext?.actorId || 'operador',
        motivo: motivo || (tipo === 'SAIDA_OS' ? `Baixa automática OS #${osId}` : 'Ajuste manual')
      };

      draft.kardex_movimentacoes.push(kdx);
      draft.inventoryMovements.push(kdx);
      registroKardex = kdx;
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao movimentar estoque.' });
    }

    res.json({
      success: true,
      peca: pecaAtualizada,
      kardex: registroKardex
    });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
});

/* ── 5. Elo 2: Lançamento de Compra com Baixa Automática e Conta a Pagar ── */
router.post('/api/compras', async (req, res) => {
  try {
    const { fornecedorId, fornecedorNome, itens, condicaoPgto, vencimento, obs } = req.body || {};
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de itens da compra é obrigatória.' });
    }

    let compraCriada = null;
    let contaCriada = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      draft.compras = Array.isArray(draft.compras) ? draft.compras : [];
      draft.contas = Array.isArray(draft.contas) ? draft.contas : [];
      draft.pecas = Array.isArray(draft.pecas) ? draft.pecas : [];
      draft.kardex_movimentacoes = Array.isArray(draft.kardex_movimentacoes) ? draft.kardex_movimentacoes : [];

      const compraId = 'cp_' + Date.now();
      let totalGeral = 0;

      // Incrementa peças
      itens.forEach(item => {
        const qtd = Number(item.qtd) || 1;
        const vlr = Number(item.valorUnitario || item.custo) || 0;
        totalGeral += qtd * vlr;

        let peca = draft.pecas.find(p => p.id === item.produtoId || p.codigo === item.produtoId || p.codigoInterno === item.produtoId);
        if (!peca) {
          peca = {
            id: item.produtoId || ('pec_' + Date.now()),
            nome: item.nome || `Item ${item.produtoId}`,
            descricao: item.nome || '',
            codigo: item.codigo || item.produtoId,
            qtd: 0,
            custo: vlr,
            venda: vlr * 1.4
          };
          draft.pecas.push(peca);
        }

        const saldoAnterior = Number(peca.qtd || 0);
        peca.qtd = saldoAnterior + qtd;
        peca.custo = vlr;

        draft.kardex_movimentacoes.push({
          id: 'kdx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          tipo: 'ENTRADA_COMPRA',
          osId: null,
          compraId,
          produtoId: peca.id,
          produtoNome: peca.nome,
          qtd,
          saldoAnterior,
          saldoAtual: peca.qtd,
          data: new Date().toISOString(),
          usuario: req.securityContext?.actorId || 'comprador',
          motivo: `Entrada por Compra #${compraId} (${fornecedorNome || 'Fornecedor'})`
        });
      });

      compraCriada = {
        id: compraId,
        fornecedorId,
        fornecedorNome: fornecedorNome || 'Fornecedor',
        itens,
        total: totalGeral,
        condicaoPgto: condicaoPgto || '30 dias',
        vencimento: vencimento || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        obs: obs || '',
        data: new Date().toISOString(),
        status: 'recebido'
      };
      draft.compras.push(compraCriada);

      contaCriada = {
        id: 'ct_' + Date.now(),
        tipo: 'despesa',
        desc: `Compra #${compraId} - ${fornecedorNome || 'Fornecedor'}`,
        parte: fornecedorNome || 'Fornecedor',
        valor: totalGeral,
        venc: compraCriada.vencimento,
        pago: false,
        cat: 'Peças & Insumos',
        doc: compraId
      };
      draft.contas.push(contaCriada);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao registrar compra.' });
    }

    res.json({
      success: true,
      compra: compraCriada,
      conta: contaCriada
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 6. Elo 3: Orçamento Digital Público (GET /orcamento/:token) ── */

module.exports = router;
