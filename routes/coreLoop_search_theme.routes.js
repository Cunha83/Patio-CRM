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

router.get('/api/tenant/theme', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const paleta = state.cfg?.identidadeVisual?.paleta || {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      primaryLight: '#eff6ff',
      accent: '#f59e0b'
    };
    res.json({
      success: true,
      theme: paleta,
      logo: state.cfg?.identidadeVisual?.logo || null,
      empresa: state.cfg?.empresa || 'Pátio CRM'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/tenant/theme', async (req, res) => {
  try {
    const { primary, primaryHover, primaryLight, accent, logo } = req.body || {};
    if (!primary) {
      return res.status(400).json({ success: false, error: 'Cor primária é obrigatória.' });
    }

    const novaPaleta = {
      primary: String(primary).trim(),
      primaryHover: String(primaryHover || primary).trim(),
      primaryLight: String(primaryLight || '#eff6ff').trim(),
      accent: String(accent || '#f59e0b').trim()
    };

    let paletaFinal = null;
    const saveRes = await mutateTenantState(req, (draft) => {
      draft.cfg = draft.cfg || {};
      draft.cfg.identidadeVisual = draft.cfg.identidadeVisual || {};
      draft.cfg.identidadeVisual.paleta = novaPaleta;
      if (logo) {
        draft.cfg.identidadeVisual.logo = String(logo);
      }
      draft.cfg.identidadeVisual.updatedAt = new Date().toISOString();
      paletaFinal = draft.cfg.identidadeVisual.paleta;
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao persistir tema.' });
    }

    res.json({ success: true, theme: paletaFinal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 2. Busca Global Indexada (GET /api/search?q=...) ──────── */
router.get('/api/search', async (req, res) => {
  try {
    const rawQuery = String(req.query.q || '').trim();
    if (!rawQuery) {
      return res.json({ success: true, query: '', resultados: [] });
    }

    let prefix = null;
    let term = rawQuery;
    const m = /^em:([a-z0-9_-]+)\s*(.*)$/i.exec(rawQuery);
    if (m) {
      prefix = m[1].toLowerCase();
      term = m[2].trim();
    }
    const termUpper = term.toUpperCase();

    const state = await getOrLoadState(req);
    const resultados = [];

    // Helper de busca
    const match = (val) => val && String(val).toUpperCase().includes(termUpper);

    // Vendas e Ordens de Serviço
    if (!prefix || prefix === 'vendas' || prefix === 'os') {
      (state.os || []).forEach(o => {
        if (!term || match(o.num) || match(o.id) || match(o.placa) || match(o.cliente) || match(o.queixa)) {
          resultados.push({
            tipo: 'venda',
            rota: 'vendas',
            badge: `OS #${o.num || o.id}`,
            id: o.id,
            titulo: `OS #${o.num || o.id} — Placa: ${o.placa || 'Sem placa'}`,
            subtitulo: `${o.cliente || 'Cliente não informado'} · Status: ${o.st || 'fila'} · Total: R$ ${Number(o.total || 0).toFixed(2)}`,
            data: o
          });
        }
      });
    }

    // Pátio & Veículos
    if (!prefix || prefix === 'patio' || prefix === 'boxes') {
      (state.veiculos || []).forEach(v => {
        if (!term || match(v.placa) || match(v.modelo) || match(v.marca) || match(v.chassi)) {
          resultados.push({
            tipo: 'patio',
            rota: 'patio',
            badge: 'Pátio',
            id: v.id || v.placa,
            titulo: `Veículo: ${v.placa} (${v.marca || ''} ${v.modelo || ''})`,
            subtitulo: `Cliente: ${v.cliente || '—'} · Km: ${v.km || 0}`,
            data: v
          });
        }
      });
    }

    // Clientes
    if (!prefix || prefix === 'clientes') {
      (state.clientes || []).forEach(c => {
        if (!term || match(c.nome) || match(c.fantasia) || match(c.doc) || match(c.fone) || match(c.cnpj) || match(c.cpf)) {
          resultados.push({
            tipo: 'cliente',
            rota: 'cadastros',
            badge: 'Cliente',
            id: c.id,
            titulo: c.fantasia || c.nome,
            subtitulo: `Doc: ${c.doc || c.cnpj || c.cpf || '—'} · Fone: ${c.fone || c.telefone || '—'}`,
            data: c
          });
        }
      });
    }

    // Produtos / Peças / Serviços
    if (!prefix || prefix === 'produtos' || prefix === 'pecas' || prefix === 'servicos') {
      (state.pecas || []).forEach(p => {
        if (!term || match(p.nome) || match(p.descricao) || match(p.codigo) || match(p.codigoInterno) || match(p.cod)) {
          resultados.push({
            tipo: 'produto',
            rota: 'cadastros',
            badge: 'Peça',
            id: p.id,
            titulo: p.nome || p.descricao,
            subtitulo: `Cód: ${p.codigo || p.codigoInterno || p.cod || p.id} · Saldo: ${p.qtd || 0} un · R$ ${Number(p.venda || p.preco || 0).toFixed(2)}`,
            data: p
          });
        }
      });

      (state.servicos || []).forEach(s => {
        if (!term || match(s.nome) || match(s.descricao)) {
          resultados.push({
            tipo: 'servico',
            rota: 'cadastros',
            badge: 'Serviço',
            id: s.id,
            titulo: s.nome || s.descricao,
            subtitulo: `Mão de Obra · Valor: R$ ${Number(s.valor || 0).toFixed(2)}`,
            data: s
          });
        }
      });
    }

    // Compras / Fornecedores
    if (!prefix || prefix === 'compras') {
      (state.compras || state.purchaseOrders || []).forEach(cp => {
        if (!term || match(cp.id) || match(cp.fornecedorNome) || match(cp.nfNumero)) {
          resultados.push({
            tipo: 'compra',
            rota: 'compras',
            badge: 'Compra',
            id: cp.id,
            titulo: `Pedido de Compra #${cp.id}`,
            subtitulo: `Fornecedor: ${cp.fornecedorNome || '—'} · Total: R$ ${Number(cp.total || cp.valorTotal || 0).toFixed(2)}`,
            data: cp
          });
        }
      });
    }

    // Fiscal / NF-e
    if (!prefix || prefix === 'nfe' || prefix === 'fiscal') {
      (state.notas_fiscais || []).forEach(nf => {
        if (!term || match(nf.numero) || match(nf.chave_acesso) || match(nf.destinatario)) {
          resultados.push({
            tipo: 'nfe',
            rota: 'fiscal',
            badge: 'NF-e',
            id: nf.id || nf.numero,
            titulo: `NF-e Nº ${nf.numero} (Série ${nf.serie || 1})`,
            subtitulo: `Chave: ${nf.chave_acesso || '—'} · Status: ${nf.status || 'autorizada'}`,
            data: nf
          });
        }
      });
    }

    res.json({
      success: true,
      query: rawQuery,
      prefix,
      total: resultados.length,
      resultados: resultados.slice(0, 30)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── 3. Elo 1: Vínculo Real Box ➔ Orçamento/OS (POST /api/patio/box-update) ── */

module.exports = router;
