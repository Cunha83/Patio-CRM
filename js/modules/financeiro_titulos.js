/* =====================================================================
   PÁTIO CRM — CONTAS A RECEBER, CONTAS A PAGAR & BAIXAS
===================================================================== */

function blocoContasReceber() {
  const contas = S.contas.filter(c => c.tipo === 'receber');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Títulos a Receber (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="receber" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Novo Título
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Cliente / Sacado</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:160px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;
            const venceHoje = !c.pago && c.venc === dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Serviços')}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Recebido (${dataBR(c.dataPgto)})</span>
                ` : vencida ? `
                  <span class="selo selo-peca" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : venceHoje ? `
                  <span class="selo selo-aprovacao">Vence Hoje</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  ${!c.pago ? `
                    <button class="btn btn-sucesso" data-act="baixar" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Dar Baixa / Receber">
                      ${ico('check', 12)} Receber
                    </button>
                    <button class="btn btn-secundario" data-act="cobrar-titulo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Cobrar no WhatsApp">
                      ${ico('zap', 12)}
                    </button>
                  ` : `
                    <button class="btn btn-secundario" data-act="imprimir-recibo" data-id="${c.id}" style="padding:4px 8px;font-size:12px" title="Imprimir Recibo">
                      ${ico('imprimir', 12)} Recibo
                    </button>
                  `}
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum título a receber registrado.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function blocoContasPagar() {
  const contas = S.contas.filter(c => c.tipo === 'pagar');
  const dH = hoje();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:600;font-size:14px">Controle de Contas a Pagar (${contas.length})</div>
    <button class="btn btn-primario" data-act="nova-conta" data-t="pagar" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Lançar Nova Conta
    </button>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição / Documento</th>
            <th>Fornecedor / Favorecido</th>
            <th style="width:110px;text-align:center">Vencimento</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:120px;text-align:center">Status</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${contas.length ? contas.map(c => {
            const vencida = !c.pago && c.venc < dH;

            return `
            <tr style="${vencida ? 'background:rgba(239, 68, 68, 0.04)' : (c.provisionado ? 'background:rgba(245, 158, 11, 0.04)' : '')}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.desc)}</div>
                <div class="mini">Doc: ${esc(c.doc || '—')} · Cat: ${esc(c.cat || 'Geral')}${c.provisionado ? ' · <b style="color:#b45309">⏳ Aguardando NF</b>' : ''}</div>
              </td>
              <td><b>${esc(c.parte)}</b></td>
              <td style="text-align:center">
                <span class="mono">${dataBRfull(c.venc)}</span>
                ${vencida ? `<div class="mini" style="color:var(--tijolo)">${Math.abs(diasEntre(dH, c.venc))}d em atraso</div>` : ''}
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(c.valor)}</td>
              <td style="text-align:center">
                ${c.pago ? `
                  <span class="selo selo-finalizada">Pago (${dataBR(c.dataPgto)})</span>
                ` : c.provisionado ? `
                  <span class="selo" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a" title="Provisionamento: Aguardando NF do Fornecedor">Provisionado</span>
                ` : vencida ? `
                  <span class="selo" style="background:var(--tijolo-fraco);color:var(--tijolo)">Vencido</span>
                ` : `
                  <span class="selo selo-fila">Em Aberto</span>
                `}
              </td>
              <td style="text-align:center">
                ${!c.pago ? `
                  <button class="btn ${c.provisionado ? 'btn-secundario' : 'btn-sucesso'}" data-act="baixar" data-id="${c.id}" style="padding:4px 10px;font-size:12px">
                    ${ico('check', 12)} ${c.provisionado ? 'Baixar / Liquidar' : 'Baixar Pagamento'}
                  </button>
                ` : `
                  <span class="mini" style="color:var(--verde)">Quitado</span>
                `}
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma conta a pagar cadastrada.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function baixarConta(c, dataPgto) {
  if (!c || c.pago) return;
  c.pago = true;
  c.dataPgto = dataPgto || hoje();

  S.movimentos.push({
    id: uid('mv'),
    data: c.dataPgto,
    tipo: c.tipo === 'receber' ? 'entrada' : 'saida',
    desc: `Baixa: ${c.desc} (${c.parte})`,
    valor: c.valor,
    cat: c.cat || 'Geral',
    conc: true,
    forma: 'Baixa Financeira'
  });

  if (typeof salvar === 'function') salvar();
}

function imprimirRecibo(contaId) {
  const c = S.contas.find(x => x.id === contaId);
  if (!c) return;

  const cfg = S.cfg;
  const janela = window.open('', '_blank');
  if (!janela) return;

  const logoRaw = cfg.identidadeVisual?.logo || cfg.identidadeVisual?.imagemInstitucional;
  const logoUrl = (typeof logoRaw === 'string') ? logoRaw : (logoRaw?.url || null);
  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:8px" alt="Logo"><br>` : '';

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Recibo de Pagamento — ${cfg.empresa}</title>
    <style>
      body { font-family: sans-serif; font-size: 13px; max-width: 600px; margin: 20px auto; padding: 20px; border: 2px solid #334155; border-radius: 8px; }
      .topo { text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; }
      .valor { font-size: 24px; font-weight: bold; color: #10b981; margin: 14px 0; text-align: right; }
      .corpo { line-height: 1.6; margin-bottom: 24px; }
      .ass { margin-top: 40px; text-align: center; border-top: 1px solid #000; width: 60%; margin-left: auto; margin-right: auto; padding-top: 6px; }
    </style>
  </head>
  <body>
    <div class="topo">
      ${logoHtml}
      <h2>${esc(cfg.empresa)}</h2>
      <div>CNPJ: ${esc(cfg.cnpj)} · ${esc(cfg.endereco)}</div>
    </div>
  <div class="valor">RECIBO: ${brl(c.valor)}</div>
  <div class="corpo">
    Recebemos de <b>${esc(c.parte)}</b> a quantia de <b>${brl(c.valor)}</b> referente a <b>${esc(c.desc)}</b> (${esc(c.doc || 'Doc S/N')}).<br>
    Para clareza e fins de direito, firmamos o presente recibo dando plena e geral quitação.
  </div>
  <div style="text-align:right">Campinas, ${dataBRfull(c.dataPgto || hoje())}.</div>
  <div class="ass">${esc(cfg.empresa)}<br><small>Assinatura Autorizada</small></div>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`);
  janela.document.close();
}

function folhaConta() {
  const tipo = S.ui.contaTipo || 'receber';
  const r = S.ui.rascConta = S.ui.rascConta || { venc: hoje(), valor: '' };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Lançar Título — Contas a ${tipo === 'receber' ? 'Receber' : 'Pagar'}</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Título:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Manutenção Preventiva / Compra de Peças" data-act="rct" data-c="desc" value="${esc(r.desc || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">${tipo === 'receber' ? 'Cliente / Devedor' : 'Fornecedor / Favorecido'}:</label>
        <input type="text" class="campo-texto" placeholder="Nome da empresa ou pessoa" data-act="rct" data-c="parte" value="${esc(r.parte || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rct" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Data de Vencimento:</label>
          <input type="date" class="campo-texto" data-act="rct" data-c="venc" value="${r.venc || hoje()}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Centro de Custo:</label>
        <select class="campo-select" data-act="rct" data-c="cat" style="width:100%;height:34px">
          ${typeof renderOptionsPlanoDeContas === 'function' ? renderOptionsPlanoDeContas(r.cat, tipo === 'receber' ? 'receita' : 'despesa') : `<option value="${esc(r.cat || 'Geral')}">${esc(r.cat || 'Geral')}</option>`}
        </select>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-conta" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Lançar Conta
      </button>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.blocoContasReceber = blocoContasReceber;
  window.blocoContasPagar = blocoContasPagar;
  window.baixarConta = baixarConta;
  window.imprimirRecibo = imprimirRecibo;
  window.folhaConta = folhaConta;
}
if (typeof globalThis !== 'undefined') {
  globalThis.blocoContasReceber = blocoContasReceber;
  globalThis.blocoContasPagar = blocoContasPagar;
  globalThis.baixarConta = baixarConta;
  globalThis.imprimirRecibo = imprimirRecibo;
  globalThis.folhaConta = folhaConta;
}

