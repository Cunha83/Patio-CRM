/* =====================================================================
   PÁTIO CRM — WORKFLOW DE AÇÕES DE OS, FATURAMENTO & IMPRESSÃO
   Submódulo para faturamento, baixa de estoque e impressão de OS
   ===================================================================== */

function folhaFaturarOS() {
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);
  if (isMec) {
    return `
    <div class="card card-p" style="max-width:500px;margin:0 auto;text-align:center;padding:32px 20px">
      <div style="font-size:36px;margin-bottom:12px">🔒</div>
      <h3 style="font-size:18px;font-weight:700;color:var(--aco-800)">Acesso Restrito</h3>
      <p style="color:var(--aco-500);font-size:13px;margin:10px 0 20px">O perfil técnico Mecânico não possui permissão para faturamento, emissão de cobrança ou visualização de valores financeiros.</p>
      <button class="btn btn-secundario" data-act="fechar" style="padding:0 20px;height:36px">Fechar</button>
    </div>`;
  }
  const o = (typeof OSatual === 'function' ? OSatual() : null);
  if (!o) return '<div class="card card-p">Nenhuma OS selecionada.</div>';

  const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
  const c = (typeof C === 'function' ? C(o.cli) : (o.cli || {}));
  const total = (typeof totOS === 'function' ? totOS(o) : 0);
  const rasc = (S.ui && (S.ui.rascFaturar = S.ui.rascFaturar || {
    forma: 'pix',
    parcelas: 1,
    vencimento: hoje(),
    baixarEstoque: true,
    emitirRecibo: true
  })) || {};

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Faturar e Entregar OS ${o.num}</h3>
        <div class="mini">Veículo: <span class="placa">${esc(v.placa)}</span> · Cliente: ${esc(c.nome)}</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div class="kpi bom" style="text-align:center;padding:14px;margin-bottom:14px">
      <div class="r" style="justify-content:center">Valor a Faturar</div>
      <div class="v" style="font-size:30px">${brl(total)}</div>
      <div class="d">${(o.servicos || []).length} serviços · ${(o.pecas || []).length} peças aplicadas</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Condição de Pagamento:</label>
        <select class="campo-select" data-act="rasc-fat" data-c="forma" style="width:100%;height:36px;font-weight:600">
          <option value="pix" ${rasc.forma === 'pix' ? 'selected' : ''}>À Vista — PIX Instantâneo</option>
          <option value="dinheiro" ${rasc.forma === 'dinheiro' ? 'selected' : ''}>À Vista — Dinheiro em Espécie</option>
          <option value="cartao_debito" ${rasc.forma === 'cartao_debito' ? 'selected' : ''}>Cartão de Débito</option>
          <option value="cartao_credito" ${rasc.forma === 'cartao_credito' ? 'selected' : ''}>Cartão de Crédito</option>
          <option value="boleto_28d" ${rasc.forma === 'boleto_28d' ? 'selected' : ''}>Faturado — Boleto 28 Dias</option>
          <option value="boleto_15_30_45" ${rasc.forma === 'boleto_15_30_45' ? 'selected' : ''}>Faturado — 3 Parcelas (15/30/45 dias)</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">1º Vencimento:</label>
          <input type="date" class="campo-texto" value="${rasc.vencimento || hoje()}" data-act="rasc-fat" data-c="vencimento" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Nº de Parcelas:</label>
          <input type="number" class="campo-texto" value="${rasc.parcelas || 1}" data-act="rasc-fat" data-c="parcelas" min="1" max="12" style="width:100%;height:34px">
        </div>
      </div>

      <div style="background:var(--aco-050);border:1px solid var(--aco-150);border-radius:8px;padding:10px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">
          <input type="checkbox" checked disabled>
          Baixar automaticamente as peças utilizadas do almoxarifado
        </label>
        <div class="mini" style="margin-left:24px;margin-top:2px">Atualiza o saldo físico no módulo de estoque.</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-sucesso" data-act="confirmar-faturamento" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Concluir Faturamento
      </button>
    </div>
  </div>`;
}

function processarFaturamentoOS(o) {
  if (!o || o.st === 'finalizada') return;
  const rasc = (S.ui && S.ui.rascFaturar) || {};
  const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
  const c = (typeof C === 'function' ? C(o.cli) : (o.cli || {}));
  const total = (typeof totOS === 'function' ? totOS(o) : 0);
  const forma = rasc.forma || 'pix';
  const parcelas = Number(rasc.parcelas) || 1;
  const valorParc = total / parcelas;

  // 1. Baixar peças do estoque
  if (o.pecas && o.pecas.length && S.pecas) {
    o.pecas.forEach(item => {
      const pecaEstoque = S.pecas.find(p => p.id === item.id || p.nome === item.nome);
      if (pecaEstoque) {
        pecaEstoque.qtd = Math.max(0, (pecaEstoque.qtd || 0) - (Number(item.qtd) || 1));
      }
    });
  }

  // 2. Gerar Lançamento Financeiro
  const isImediato = ['pix', 'dinheiro', 'cartao_debito'].includes(forma);
  S.movimentos = S.movimentos || [];
  S.contas = S.contas || [];

  if (isImediato) {
    S.movimentos.push({
      id: (typeof uid === 'function' ? uid('mv') : 'mv_' + Date.now()),
      data: hoje(),
      tipo: 'entrada',
      desc: `Recebimento OS ${o.num} (${v.placa}) — ${c.nome}`,
      valor: total,
      cat: 'Serviços & Peças',
      conc: true,
      forma: forma.toUpperCase()
    });
    o.pago = true;
  } else {
    for (let p = 1; p <= parcelas; p++) {
      const diasVenc = forma === 'boleto_15_30_45' ? p * 15 : (forma === 'boleto_28d' ? 28 : (p - 1) * 30);
      const dataVenc = (typeof addDias === 'function' ? addDias(rasc.vencimento || hoje(), diasVenc) : hoje());
      S.contas.push({
        id: (typeof uid === 'function' ? uid('ct') : 'ct_' + Date.now()),
        tipo: 'receber',
        desc: `OS ${o.num} (Parc. ${p}/${parcelas}) — ${v.placa}`,
        parte: c.nome,
        valor: valorParc,
        venc: dataVenc,
        pago: false,
        cat: 'Serviços & Peças',
        doc: `NF-${o.num}/${p}`,
        osId: o.id
      });
    }
  }

  o.st = 'finalizada';
  o.formaPgto = forma;
  if (typeof salvar === 'function') salvar();
}

function imprimirOS(o, formato = 'a4') {
  if (!o && typeof OSatual === 'function') o = OSatual();
  if (!o) return;

  const v = (typeof V === 'function' ? V(o.vei) : (o.vei || {}));
  const c = (typeof C === 'function' ? C(o.cli) : (o.cli || {}));
  const cfg = S.cfg || {};
  const isMec = (typeof isPerfilMecanico === 'function' ? isPerfilMecanico() : false);
  const total = (typeof totOS === 'function' ? totOS(o) : 0);
  const totServ = (typeof soma === 'function' ? soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0)) : 0);
  const totPec = (typeof soma === 'function' ? soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0)) : 0);

  const htmlTermica = `
    <div style="font-family:'Courier New',monospace;font-size:11px;width:72mm;margin:0 auto;padding:6px;color:#000;line-height:1.3">
      <div style="text-align:center;font-weight:bold;font-size:13px">${esc(cfg.empresa || 'PÁTIO CRM')}</div>
      <div style="text-align:center">CNPJ: ${esc(cfg.cnpj || '—')}</div>
      <div style="text-align:center">Tel: ${esc(cfg.fone || '—')}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="text-align:center;font-weight:bold">CUPOM DE ATENDIMENTO · OS #${esc(o.num)}</div>
      <div style="display:flex;justify-content:space-between"><span>Data:</span><span>${typeof dataBRfull === 'function' ? dataBRfull(o.abertura) : o.abertura}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Placa:</span><span style="font-weight:bold">${esc(v.placa)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Veículo:</span><span>${esc(v.modelo || '')}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Cliente:</span><span>${esc(c.nome)}</span></div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="font-weight:bold">SERVIÇOS / MÃO DE OBRA:</div>
      ${(o.servicos || []).map(s => `<div style="display:flex;justify-content:space-between"><span>${esc(s.nome)} (${s.qtd}x)</span><span>${brl(s.qtd * s.valor)}</span></div>`).join('')}
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="font-weight:bold">PEÇAS / INSUMOS:</div>
      ${(o.pecas || []).map(p => `<div style="display:flex;justify-content:space-between"><span>${esc(p.nome)} (${p.qtd}x)</span><span>${brl(p.qtd * p.valor)}</span></div>`).join('')}
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="display:flex;justify-content:space-between"><span>Subtotal Serv.:</span><span>${brl(totServ)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Subtotal Peças:</span><span>${brl(totPec)}</span></div>
      ${o.desc ? `<div style="display:flex;justify-content:space-between"><span>Desconto:</span><span>-${brl(o.desc)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:4px"><span>TOTAL:</span><span>${brl(total)}</span></div>
      ${cfg.chavePix ? `<div style="border-top:1px dashed #000;margin:6px 0"></div><div style="text-align:center">Chave Pix: <b>${esc(cfg.chavePix)}</b></div>` : ''}
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="text-align:center;font-size:10px">Garantia legal: 90 dias conforme CDC</div>
      <div style="text-align:center;margin-top:8px">Obrigado pela preferência!</div>
    </div>`;

  const htmlA4 = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#1e293b;padding:20px;max-width:800px;margin:0 auto;line-height:1.4">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:16px">
          ${(cfg.identidadeVisual?.logo && /^https?:\/\/|^data:image\//i.test(cfg.identidadeVisual.logo)) ? `<img src="${esc(cfg.identidadeVisual.logo)}" alt="${esc(cfg.empresa)}" style="max-height:60px;max-width:160px;object-fit:contain">` : ''}
          <div>
            <div style="font-size:20px;font-weight:bold;color:#0f172a">${esc(cfg.empresa)}</div>
            <div>CNPJ: ${esc(cfg.cnpj)} · Tel: ${esc(cfg.fone)}</div>
            <div>${esc(cfg.endereco)}</div>
          </div>
        </div>
        <div>
          <div style="font-size:22px;font-weight:bold;color:#2563eb;text-align:right">${isMec ? 'VIA DE OFICINA' : `ORDEM DE SERVIÇO Nº ${o.num}`}</div>
          <div>Emissão: ${typeof dataBRfull === 'function' ? dataBRfull(o.abertura) : o.abertura}</div>
          <div>Previsão: ${typeof dataBRfull === 'function' ? dataBRfull(o.prev) : o.prev}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #e2e8f0">
        <div><b>CLIENTE:</b> ${esc(c.nome)}<br><b>CNPJ/CPF:</b> ${esc(c.doc || '—')}<br><b>FONE:</b> ${esc(c.fone || '—')}</div>
        <div><b>VEÍCULO:</b> ${esc(v.marca || '')} ${esc(v.modelo || '')}<br><b>PLACA:</b> <b>${esc(v.placa)}</b><br><b>KM:</b> ${(o.km || 0).toLocaleString('pt-BR')} km</div>
      </div>
      ${o.queixa ? `<div style="margin-bottom:14px;background:#fff;padding:8px;border-left:3px solid #f59e0b"><b>Diagnóstico / Queixa:</b> ${esc(o.queixa)}</div>` : ''}
      <div style="font-weight:bold;margin-bottom:6px">1. SERVIÇOS</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:6px">Descrição</th><th style="width:60px;text-align:center">Qtd</th>${!isMec ? '<th style="width:90px;text-align:right">Valor</th><th style="width:90px;text-align:right">Total</th>' : ''}</tr></thead>
        <tbody>${(o.servicos || []).map(s => `<tr><td style="padding:6px;border-bottom:1px solid #e2e8f0">${esc(s.nome)}</td><td style="text-align:center">${s.qtd}</td>${!isMec ? `<td style="text-align:right">${brl(s.valor)}</td><td style="text-align:right">${brl(s.qtd * s.valor)}</td>` : ''}</tr>`).join('')}</tbody>
      </table>
      <div style="font-weight:bold;margin-bottom:6px">2. PEÇAS</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:6px">Descrição</th><th style="width:60px;text-align:center">Qtd</th>${!isMec ? '<th style="width:90px;text-align:right">Valor</th><th style="width:90px;text-align:right">Total</th>' : ''}</tr></thead>
        <tbody>${(o.pecas || []).map(p => `<tr><td style="padding:6px;border-bottom:1px solid #e2e8f0">${esc(p.nome)}</td><td style="text-align:center">${p.qtd}</td>${!isMec ? `<td style="text-align:right">${brl(p.valor)}</td><td style="text-align:right">${brl(p.qtd * p.valor)}</td>` : ''}</tr>`).join('')}</tbody>
      </table>
      ${!isMec ? `<div style="margin-left:auto;width:280px;border:1px solid #cbd5e1;padding:8px;border-radius:6px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between"><span>Serviços:</span><span>${brl(totServ)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Peças:</span><span>${brl(totPec)}</span></div>
        ${o.desc ? `<div style="display:flex;justify-content:space-between;color:#ef4444"><span>Desconto:</span><span>−${brl(o.desc)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:bold;border-top:1px solid #94a3b8;padding-top:4px;margin-top:4px"><span>TOTAL:</span><span>${brl(total)}</span></div>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:30px">
        <div style="width:45%;text-align:center;border-top:1px solid #000;padding-top:4px;font-size:11px">${esc(cfg.empresa)}<br>Responsável Técnico</div>
        <div style="width:45%;text-align:center;border-top:1px solid #000;padding-top:4px;font-size:11px">${esc(c.nome)}<br>Assinatura Cliente</div>
      </div>
    </div>`;

  const printArea = (typeof document !== 'undefined') ? document.getElementById('print-area-exclusiva') : null;
  const htmlConteudo = formato === 'termica' ? htmlTermica : htmlA4;
  if (printArea) {
    printArea.innerHTML = htmlConteudo;
    printArea.style.display = 'block';
    if (typeof window !== 'undefined') {
      window.onafterprint = () => {
        printArea.innerHTML = '';
        printArea.style.display = 'none';
      };
      window.print();
    }
    return;
  }

  if (typeof window === 'undefined' || !window.open) return;
  const janela = window.open('', '_blank');
  if (!janela) {
    if (typeof torrar === 'function') torrar('Por favor, permita popups para imprimir o comprovante.');
    return;
  }
  janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS ${esc(o.num)}</title></head><body>${htmlConteudo}<script>window.onload = () => window.print();<\/script></body></html>`);
  janela.document.close();
}

const exportsWorkflow = { folhaFaturarOS, processarFaturamentoOS, imprimirOS };
if (typeof window !== 'undefined') Object.assign(window, exportsWorkflow);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsWorkflow);

