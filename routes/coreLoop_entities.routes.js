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

router.post('/api/:entidade/duplicar', async (req, res) => {
  try {
    const { entidade } = req.params;
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'id é obrigatório para duplicar.' });

    let itemClonado = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      let colecao = null;
      if (entidade === 'os' || entidade === 'vendas') colecao = draft.os;
      else if (entidade === 'produtos' || entidade === 'pecas') colecao = draft.pecas;
      else if (entidade === 'clientes') colecao = draft.clientes;

      if (!Array.isArray(colecao)) {
        throw new Error(`Entidade "${entidade}" não suportada para duplicação.`);
      }

      const original = colecao.find(x => x.id === id);
      if (!original) throw new Error('Registro original não encontrado.');

      itemClonado = JSON.parse(JSON.stringify(original));
      itemClonado.id = (entidade === 'os' ? 'os_' : 'id_') + Date.now();
      if (itemClonado.num) itemClonado.num = (Number(itemClonado.num) || 0) + 1;
      if (itemClonado.st) itemClonado.st = 'fila';
      if (itemClonado.nome) itemClonado.nome = `${itemClonado.nome} (Cópia)`;
      itemClonado.criadoEm = new Date().toISOString();
      delete itemClonado.tokenAprovacao;
      delete itemClonado.aprovacaoDigital;

      colecao.push(itemClonado);
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao duplicar registro.' });
    }

    res.json({ success: true, item: itemClonado });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/api/:entidade/lote', async (req, res) => {
  try {
    const role = req.securityContext?.role;
    const perms = req.securityContext?.permissions || [];
    if (role === 'mecanico' || (!perms.includes('*') && !perms.includes('admin:settings') && !perms.includes('os:delete'))) {
      return res.status(403).json({ success: false, error: 'Acesso negado: perfil sem permissão para exclusão em lote.' });
    }
    const { entidade } = req.params;
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de IDs é obrigatória.' });
    }

    const idsSet = new Set(ids);
    let totalRemovidos = 0;

    const saveRes = await mutateTenantState(req, (draft) => {
      let colecao = null;
      if (entidade === 'os' || entidade === 'vendas') {
        const antes = (draft.os || []).length;
        draft.os = (draft.os || []).filter(x => !idsSet.has(x.id));
        totalRemovidos = antes - draft.os.length;
      } else if (entidade === 'produtos' || entidade === 'pecas') {
        const antes = (draft.pecas || []).length;
        draft.pecas = (draft.pecas || []).filter(x => !idsSet.has(x.id));
        totalRemovidos = antes - draft.pecas.length;
      } else if (entidade === 'clientes') {
        const antes = (draft.clientes || []).length;
        draft.clientes = (draft.clientes || []).filter(x => !idsSet.has(x.id));
        totalRemovidos = antes - draft.clientes.length;
      } else if (entidade === 'contas') {
        const antes = (draft.contas || []).length;
        draft.contas = (draft.contas || []).filter(x => !idsSet.has(x.id));
        totalRemovidos = antes - draft.contas.length;
      }

      draft.auditoria = Array.isArray(draft.auditoria) ? draft.auditoria : [];
      draft.auditoria.push({
        id: 'aud_' + Date.now(),
        tipo: 'EXCLUSAO_LOTE',
        entidade,
        ids,
        timestamp: new Date().toISOString(),
        usuario: req.securityContext?.actorId || 'operador'
      });
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao excluir em lote.' });
    }

    res.json({ success: true, count: totalRemovidos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



module.exports = router;
