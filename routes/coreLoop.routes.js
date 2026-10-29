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
router.get('/orcamento/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const state = await getOrLoadState(req);
    const os = (state.os || []).find(o => o.tokenAprovacao === token || o.id === token || String(o.num) === token);

    if (!os) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="utf-8"><title>Orçamento Não Encontrado</title>
        <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8fafc;color:#334155;}</style></head>
        <body>
          <h2>Orçamento Não Encontrado</h2>
          <p>O link informado é inválido ou já expirou.</p>
        </body></html>
      `);
    }

    const cfg = state.cfg || {};
    const paleta = cfg.identidadeVisual?.paleta || { primary: '#2563eb', accent: '#f59e0b' };
    const empresaNome = cfg.empresa || 'Pátio CRM - Oficina Especializada';
    const logoUrl = cfg.identidadeVisual?.logo;
    const jaAprovado = os.aprovacaoDigital?.aprovado || os.st === 'executando' || os.st === 'finalizada';

    const totalPecas = (os.pecas || []).reduce((acc, p) => acc + (Number(p.qtd || 1) * Number(p.valor || p.venda || 0)), 0);
    const totalServicos = (os.servicos || []).reduce((acc, s) => acc + (Number(s.qtd || 1) * Number(s.valor || 0)), 0);
    const totalGeral = Number(os.total || (totalPecas + totalServicos - (Number(os.desc) || 0)));

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orçamento OS #${os.num || os.id} — ${empresaNome}</title>
      <style>
        :root { --primary: ${paleta.primary}; --accent: ${paleta.accent}; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f1f5f9; color: #1e293b; padding: 16px; line-height: 1.5; }
        .container { max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background: var(--primary); color: #ffffff; padding: 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .header-title { font-size: 20px; font-weight: 700; }
        .header-sub { font-size: 13px; opacity: 0.9; }
        .logo { max-height: 50px; max-width: 140px; object-fit: contain; background: white; border-radius: 6px; padding: 4px; }
        .body-card { padding: 24px; }
        .veiculo-banner { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .placa-box { font-family: monospace; font-size: 18px; font-weight: 700; background: #0f172a; color: #ffffff; display: inline-block; padding: 4px 10px; border-radius: 6px; letter-spacing: 1px; }
        .sec-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
        th { background: #f8fafc; text-align: left; padding: 8px; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
        td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
        .text-right { text-align: right; }
        .totais-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 16px; }
        .total-linha { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
        .total-destaque { font-size: 20px; font-weight: 800; color: var(--primary); border-top: 2px solid #cbd5e1; padding-top: 8px; margin-top: 8px; }
        .btn-aprovar { display: block; width: 100%; background: #16a34a; color: #ffffff; text-align: center; font-size: 16px; font-weight: 700; padding: 16px; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; margin-top: 24px; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3); transition: background 0.2s; }
        .btn-aprovar:hover { background: #15803d; }
        .badge-status { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; margin-top: 12px; }
        .status-ok { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <div class="header-title">${empresaNome}</div>
            <div class="header-sub">Orçamento de Serviço Oficial · OS #${os.num || os.id}</div>
          </div>
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo">` : ''}
        </div>

        <div class="body-card">
          <div class="veiculo-banner">
            <div>
              <div style="font-size:12px;color:#64748b;margin-bottom:4px">VEÍCULO / PLACA</div>
              <div class="placa-box">${os.placa || 'PLACA'}</div>
              <div style="margin-top:6px;font-weight:600">${os.modelo || os.veiculo || 'Caminhão/Veículo'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#64748b;margin-bottom:4px">CLIENTE / CONTATO</div>
              <div style="font-weight:700">${os.cliente || 'Frotista'}</div>
              <div style="font-size:13px;color:#64748b">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          ${(os.pecas && os.pecas.length > 0) ? `
            <div class="sec-title">1. Peças & Componentes Substituídos</div>
            <table>
              <thead>
                <tr><th>Item</th><th style="width:60px;text-align:center">Qtd</th><th class="text-right">Unitário</th><th class="text-right">Subtotal</th></tr>
              </thead>
              <tbody>
                ${os.pecas.map(p => `
                  <tr>
                    <td><b>${p.nome || p.descricao}</b></td>
                    <td style="text-align:center">${p.qtd || 1}</td>
                    <td class="text-right">R$ ${Number(p.valor || p.venda || 0).toFixed(2)}</td>
                    <td class="text-right">R$ ${(Number(p.qtd || 1) * Number(p.valor || p.venda || 0)).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          ${(os.servicos && os.servicos.length > 0) ? `
            <div class="sec-title">2. Mão de Obra Especializada & Serviços</div>
            <table>
              <thead>
                <tr><th>Serviço</th><th style="width:60px;text-align:center">Qtd</th><th class="text-right">Unitário</th><th class="text-right">Subtotal</th></tr>
              </thead>
              <tbody>
                ${os.servicos.map(s => `
                  <tr>
                    <td><b>${s.nome || s.descricao}</b></td>
                    <td style="text-align:center">${s.qtd || 1}</td>
                    <td class="text-right">R$ ${Number(s.valor || 0).toFixed(2)}</td>
                    <td class="text-right">R$ ${(Number(s.qtd || 1) * Number(s.valor || 0)).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <div class="totais-box">
            <div class="total-linha"><span>Subtotal Peças:</span><span>R$ ${totalPecas.toFixed(2)}</span></div>
            <div class="total-linha"><span>Subtotal Mão de Obra:</span><span>R$ ${totalServicos.toFixed(2)}</span></div>
            ${os.desc ? `<div class="total-linha" style="color:#dc2626"><span>Desconto Concedido:</span><span>- R$ ${Number(os.desc).toFixed(2)}</span></div>` : ''}
            <div class="total-linha total-destaque"><span>Valor Total Aprovado:</span><span>R$ ${totalGeral.toFixed(2)}</span></div>
          </div>

          ${jaAprovado ? `
            <div style="text-align:center;margin-top:24px">
              <div class="badge-status status-ok">
                ✅ Orçamento Aprovado Digitalmente pelo Cliente
              </div>
              <div style="font-size:12px;color:#64748b;margin-top:6px">
                Aprovado em ${new Date(os.aprovacaoDigital?.data || Date.now()).toLocaleString('pt-BR')}
              </div>
            </div>
          ` : `
            <button id="btnAprovar" class="btn-aprovar" onclick="aprovarDigitalmente()">
              ✍️ Aprovar Orçamento Digitalmente
            </button>
            <div id="msgSucesso" style="display:none;text-align:center;margin-top:16px;" class="badge-status status-ok">
              ✅ Orçamento Aprovado com Sucesso! A oficina já iniciou o atendimento.
            </div>
          `}
        </div>

        <div class="footer">
          Termo de Garantia Legal de 90 dias conforme Art. 26 do Código de Defesa do Consumidor.<br>
          ${empresaNome} · Segurança e Rastreabilidade Digital Garantida.
        </div>
      </div>

      <script>
        async function aprovarDigitalmente() {
          const btn = document.getElementById('btnAprovar');
          btn.disabled = true;
          btn.textContent = 'Processando aprovação...';
          try {
            const resp = await fetch('/api/orcamento/${token}/aprovar', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const data = await resp.json();
            if (data.success) {
              btn.style.display = 'none';
              document.getElementById('msgSucesso').style.display = 'block';
            } else {
              alert(data.error || 'Erro ao aprovar orçamento.');
              btn.disabled = false;
              btn.textContent = '✍️ Aprovar Orçamento Digitalmente';
            }
          } catch (e) {
            alert('Falha de conexão ao aprovar.');
            btn.disabled = false;
            btn.textContent = '✍️ Aprovar Orçamento Digitalmente';
          }
        }
      </script>
    </body>
    </html>
    `);
  } catch (err) {
    res.status(500).send('Erro interno ao carregar orçamento.');
  }
});

router.post('/api/orcamento/:token/aprovar', async (req, res) => {
  try {
    const token = req.params.token;
    let osAprovada = null;

    const saveRes = await mutateTenantState(req, (draft) => {
      draft.os = Array.isArray(draft.os) ? draft.os : [];
      draft.pecas = Array.isArray(draft.pecas) ? draft.pecas : [];
      draft.kardex_movimentacoes = Array.isArray(draft.kardex_movimentacoes) ? draft.kardex_movimentacoes : [];
      draft.auditoria = Array.isArray(draft.auditoria) ? draft.auditoria : [];

      const o = draft.os.find(x => x.tokenAprovacao === token || x.id === token || String(x.num) === token);
      if (!o) {
        throw new Error('Orçamento não encontrado para este token.');
      }

      o.st = 'executando';
      o.etapaPatio = 'em_execucao';
      o.aprovacaoDigital = {
        aprovado: true,
        data: new Date().toISOString(),
        ip: req.ip || '',
        userAgent: req.get('User-Agent') || ''
      };

      // Baixa automática atômica de peças incluídas na OS
      if (Array.isArray(o.pecas)) {
        o.pecas.forEach(pItem => {
          const p = draft.pecas.find(x => x.id === pItem.id || x.codigo === pItem.codigo || x.codigoInterno === pItem.codigo);
          if (p) {
            const qtdBaixa = Number(pItem.qtd) || 1;
            const saldoAnterior = Number(p.qtd) || 0;
            p.qtd = Math.max(0, saldoAnterior - qtdBaixa);

            draft.kardex_movimentacoes.push({
              id: 'kdx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              tipo: 'SAIDA_OS',
              osId: o.id,
              produtoId: p.id,
              produtoNome: p.nome,
              qtd: qtdBaixa,
              saldoAnterior,
              saldoAtual: p.qtd,
              data: new Date().toISOString(),
              usuario: 'cliente_frotista_digital',
              motivo: `Aprovação Digital da OS #${o.num || o.id}`
            });
          }
        });
      }

      draft.auditoria.push({
        id: 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        tipo: 'ORCAMENTO_APROVADO_DIGITAL',
        osId: o.id,
        timestamp: new Date().toISOString(),
        usuario: 'cliente_digital'
      });

      osAprovada = o;
    });

    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Erro ao aprovar orçamento.' });
    }

    res.json({
      success: true,
      message: 'Orçamento aprovado digitalmente com sucesso!',
      os: osAprovada
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ── 7. Elo 4: Checkout Financeiro & Pix com TxID e Webhook ── */
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
