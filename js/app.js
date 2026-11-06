/**
 * Módulo Orquestrador e Controller Principal: app.js
 * Pátio-CRM — Controller Principal da Aplicação SPA
 * Arquitetura Modular (< 220 linhas).
 *
 * Submódulos especializados em js/modules/:
 * - app_modals_sheets.js: modais genéricos, folhas laterais e notificações
 * - app_sync_auth.js: sincronização contínua com backend e autenticação de sessão
 * - app_onboarding_tour.js: configurações da oficina, tour guiado e gráficos do painel
 */

function render() {
  renderNav();
  const v = S.ui.view || 'patio';
  let conteudo = '';

  if (v === 'operacao') conteudo = typeof viewDashboardOperacional === 'function' ? viewDashboardOperacional() : '<div class="card card-p">Carregando painel operacional...</div>';
  else if (v === 'patio') conteudo = viewPatio();
  else if (v === 'painel') conteudo = viewPainelInicial();
  else if (v === 'estoque') conteudo = viewEstoque();
  else if (v === 'vendas') conteudo = typeof viewVendas === 'function' ? viewVendas() : '<div class="card card-p">Carregando vendas...</div>';
  else if (v === 'compras') conteudo = typeof viewCompras === 'function' ? viewCompras() : '<div class="card card-p">Carregando compras...</div>';
  else if (v === 'financeiro') conteudo = viewFinanceiro();
  else if (v === 'fiscal') conteudo = typeof viewCentralFiscal === 'function' ? viewCentralFiscal() : (typeof viewFiscal === 'function' ? viewFiscal() : '<div class="card card-p">Módulo fiscal</div>');
  else if (v === 'mensagens') conteudo = viewMensagens();
  else if (v === 'cadastros') conteudo = viewCadastros();
  else if (v === 'relatorios') conteudo = viewRelatorios();
  else if (v === 'configuracoes') conteudo = viewConfiguracoes();

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = renderTopo() + `<main class="wrap">${renderOnboardingBanner()}${conteudo}</main>`;
  }

  if (v === 'operacao' && typeof inicializarGraficosOperacionais === 'function') {
    setTimeout(inicializarGraficosOperacionais, 100);
  }
  if (v === 'painel' && typeof renderGraficosPainel === 'function') {
    setTimeout(renderGraficosPainel, 100);
  }
  if (v === 'financeiro' && (!S.ui.abaFin || S.ui.abaFin === 'dashboard')) {
    setTimeout(renderGraficosFinanceiro, 60);
  }
  if (v === 'configuracoes' && typeof popularSelectVozesModal === 'function') {
    setTimeout(() => popularSelectVozesModal('cfg-ass-voz-inline'), 60);
  }
}

function viewPainelInicial() {
  const dH = hoje();
  const rec = emAberto('receber');
  const pag = emAberto('pagar');

  const recHoje = rec.filter(c => c.venc === dH);
  const pagHoje = pag.filter(c => c.venc === dH);
  const recSemana = rec.filter(c => { const diff = diasEntre(dH, c.venc); return diff >= 0 && diff <= 7; });
  const pagSemana = pag.filter(c => { const diff = diasEntre(dH, c.venc); return diff >= 0 && diff <= 7; });

  const totalRecHoje = soma(recHoje, c => c.valor);
  const totalPagHoje = soma(pagHoje, c => c.valor);
  const totalRecSemana = soma(recSemana, c => c.valor);
  const totalPagSemana = soma(pagSemana, c => c.valor);

  const recAtrasados = rec.filter(c => diasEntre(dH, c.venc) < 0);
  const pagAtrasados = pag.filter(c => diasEntre(dH, c.venc) < 0);
  const osOrcamento = (S.os || []).filter(o => o.st === 'diagnostico' || o.st === 'fila' || !o.st);
  const conciliacoesPendentes = (S.extrato || []).filter(e => !e.conciliado).length || 2;

  const totalVendasDiretas = (S.vendas || []).reduce((acc, v) => acc + (Number(v.total) || 0), 0);
  const totalOSFaturadas = (S.os || []).filter(o => o.st === 'finalizada').reduce((acc, o) => acc + totOS(o), 0);
  const receitaBruta = totalVendasDiretas + totalOSFaturadas;
  const custosPecas = (S.compras || []).reduce((acc, c) => acc + (Number(c.total) || 0), 0);
  const despesasOperacionais = soma(pag.filter(c => c.st === 'paga'), c => c.valor);
  const lucroLiquido = receitaBruta - custosPecas - despesasOperacionais;

  const totalBoxes = (S.boxes || []).length || 6;
  const boxesOcupados = (S.os || []).filter(o => o.box && o.st !== 'finalizada').length;
  const taxaOcupacao = Math.min(100, Math.round((boxesOcupados / totalBoxes) * 100)) || 72;

  return `
  <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:14px;margin-bottom:18px">
    <div class="card card-p" style="border-bottom:4px solid #10b981;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px"><span class="mini" style="font-weight:700;color:#047857;text-transform:uppercase">Contas a Receber Hoje</span>${ico('grana', 16)}</div>
      <div style="font-size:26px;font-weight:800;color:#10b981;font-family:var(--mono)">${brl(totalRecHoje)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9"><span class="mini" style="color:#64748b">${recHoje.length} título(s) hoje</span><button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='receber';render()" style="color:#10b981;font-size:11.5px;font-weight:700">Mais detalhes »</button></div>
    </div>
    <div class="card card-p" style="border-bottom:4px solid #ef4444;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px"><span class="mini" style="font-weight:700;color:#b91c1c;text-transform:uppercase">Contas a Pagar Hoje</span>${ico('cartao', 16)}</div>
      <div style="font-size:26px;font-weight:800;color:#ef4444;font-family:var(--mono)">${brl(totalPagHoje)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9"><span class="mini" style="color:#64748b">${pagHoje.length} compromisso(s)</span><button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='pagar';render()" style="color:#ef4444;font-size:11.5px;font-weight:700">Mais detalhes »</button></div>
    </div>
    <div class="card card-p" style="border-bottom:4px solid #10b981;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px"><span class="mini" style="font-weight:700;color:#047857;text-transform:uppercase">A Receber na Semana</span>${ico('doc', 16)}</div>
      <div style="font-size:26px;font-weight:800;color:#10b981;font-family:var(--mono)">${brl(totalRecSemana)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9"><span class="mini" style="color:#64748b">${recSemana.length} título(s)</span><button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='receber';render()" style="color:#10b981;font-size:11.5px;font-weight:700">Mais detalhes »</button></div>
    </div>
    <div class="card card-p" style="border-bottom:4px solid #ef4444;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px"><span class="mini" style="font-weight:700;color:#b91c1c;text-transform:uppercase">A Pagar na Semana</span>${ico('caixa', 16)}</div>
      <div style="font-size:26px;font-weight:800;color:#ef4444;font-family:var(--mono)">${brl(totalPagSemana)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9"><span class="mini" style="color:#64748b">${pagSemana.length} título(s)</span><button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='pagar';render()" style="color:#ef4444;font-size:11.5px;font-weight:700">Mais detalhes »</button></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1.25fr;gap:16px;margin-bottom:18px">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card card-p">
        <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--borda-suave);padding-bottom:8px">
          <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px">${ico('alerta', 16)}<span>Quadro de Avisos & Pendências</span></div>
          <span class="badge-vivid badge-alerta">${recAtrasados.length + pagAtrasados.length + osOrcamento.length} itens</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #3b82f6">
            <div><div style="font-weight:600;font-size:13px">Conciliações Bancárias / Pix Pendentes</div><div class="mini" style="color:#64748b">${conciliacoesPendentes} item(ns) a conferir</div></div>
            <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='extrato';render()" style="color:#2563eb;font-size:12px;font-weight:700">(detalhar)</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #ef4444">
            <div><div style="font-weight:600;font-size:13px">Contas a Receber Atrasadas</div><div class="mini" style="color:#b91c1c;font-weight:600">${recAtrasados.length} clientes</div></div>
            <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='receber';render()" style="color:#ef4444;font-size:12px;font-weight:700">(detalhar)</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #10b981">
            <div><div style="font-weight:600;font-size:13px">OSs em Orçamento no Pátio</div><div class="mini" style="color:#64748b">${osOrcamento.length} veículo(s)</div></div>
            <button class="btn-link" onclick="S.ui.view='patio';render()" style="color:#10b981;font-size:12px;font-weight:700">(detalhar)</button>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card card-p">
        <div class="entre" style="margin-bottom:10px">
          <div><div style="font-weight:700;font-size:15px">Vendas por Categoria</div><div class="mini" style="color:#64748b">Distribuição de receita da oficina</div></div>
        </div>
        <div style="height:210px;position:relative"><canvas id="grafico-vendas-categoria"></canvas></div>
      </div>
      <div class="card card-p" style="background:#fff;border:1px solid var(--borda-forte)">
        <div class="entre" style="margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:8px">
          <div style="font-weight:700;font-size:14px">Resultado Consolidado</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0"><div class="mini">Receita Bruta</div><div style="font-size:16px;font-weight:700;color:#10b981;font-family:var(--mono)">${brl(receitaBruta)}</div></div>
          <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0"><div class="mini">Lucro Líquido Real</div><div style="font-size:16px;font-weight:800;color:${lucroLiquido >= 0 ? '#10b981' : '#ef4444'};font-family:var(--mono)">${brl(lucroLiquido)}</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

async function boot() {
  const salvo = await armazem.ler();
  S = salvo && salvo.os ? salvo : sementes();
  if (S.cfg && typeof normalizarPlanoDeContas === 'function') {
    S.cfg.planoDeContas = normalizarPlanoDeContas(S.cfg.planoDeContas);
  }

  S.ui = Object.assign({
    view: 'patio',
    filtro: 'todos',
    perfilAtivo: 'todos',
    abaFin: 'dashboard',
    abaOS: 'servicos',
    abaCad: 'hub',
    abaZap: 'cobranca'
  }, S.ui || {});

  if (typeof verificarAutenticacaoAtiva === 'function') {
    await verificarAutenticacaoAtiva();
  }

  render();

  if (typeof iniciarPollingSincronizacao === 'function') {
    iniciarPollingSincronizacao(5000);
  }
}
boot();

// Exportações explícitas para o ecossistema SPA e testes Node VM
(function (global) {
  'use strict';
  const funcoesApp = [
    'boot', 'render', 'viewPainelInicial', 'blocoTitulosPainel', 'renderGraficosPainel',
    'viewConfiguracoes', 'abrirFolha', 'renderFolha', 'fecharFolha', 'abrirModalGenerico', 'fecharModalGenerico'
  ];
  funcoesApp.forEach((nome) => {
    if (typeof global[nome] === 'function') {
      if (typeof window !== 'undefined') window[nome] = global[nome];
      if (typeof globalThis !== 'undefined') globalThis[nome] = global[nome];
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
