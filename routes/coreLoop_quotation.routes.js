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

module.exports = router;
