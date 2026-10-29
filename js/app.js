/* =====================================================================
   PÁTIO CRM — CONTROLLER PRINCIPAL DA APLICAÇÃO (SPA)
===================================================================== */

/* ---------------- Render Principal ---------------- */
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

  // Renderiza gráficos caso a view demande
  if (v === 'operacao' && typeof inicializarGraficosOperacionais === 'function') {
    setTimeout(inicializarGraficosOperacionais, 100);
  }
  if (v === 'painel') {
    setTimeout(renderGraficosPainel, 100);
  }
  if (v === 'financeiro' && (!S.ui.abaFin || S.ui.abaFin === 'dashboard')) {
    setTimeout(renderGraficosFinanceiro, 60);
  }
  if (v === 'configuracoes') {
    setTimeout(() => {
      if (typeof popularSelectVozesModal === 'function') {
        popularSelectVozesModal('cfg-ass-voz-inline');
      }
    }, 60);
  }
}

/* ---------------- Painel Inicial / KPIs (eGestor ERP Model) ---------------- */
function viewPainelInicial() {
  const dH = hoje();
  const rec = emAberto('receber');
  const pag = emAberto('pagar');

  // Métricas exatas do eGestor Dashboard
  const recHoje = rec.filter(c => c.venc === dH);
  const pagHoje = pag.filter(c => c.venc === dH);

  const recSemana = rec.filter(c => {
    const diff = diasEntre(dH, c.venc);
    return diff >= 0 && diff <= 7;
  });
  const pagSemana = pag.filter(c => {
    const diff = diasEntre(dH, c.venc);
    return diff >= 0 && diff <= 7;
  });

  const recMes = rec.filter(c => {
    const diff = diasEntre(dH, c.venc);
    return diff >= 0 && diff <= 30;
  });
  const pagMes = pag.filter(c => {
    const diff = diasEntre(dH, c.venc);
    return diff >= 0 && diff <= 30;
  });

  const totalRecHoje = soma(recHoje, c => c.valor);
  const totalPagHoje = soma(pagHoje, c => c.valor);
  const totalRecSemana = soma(recSemana, c => c.valor);
  const totalPagSemana = soma(pagSemana, c => c.valor);

  const recAtrasados = rec.filter(c => diasEntre(dH, c.venc) < 0);
  const pagAtrasados = pag.filter(c => diasEntre(dH, c.venc) < 0);
  const totalRecAtrasado = soma(recAtrasados, c => c.valor);
  const totalPagAtrasado = soma(pagAtrasados, c => c.valor);

  const osOrcamento = (S.os || []).filter(o => o.st === 'diagnostico' || o.st === 'fila' || !o.st);
  const conciliacoesPendentes = (S.extrato || []).filter(e => !e.conciliado).length || 2;

  // Cálculo DRE Resumido Gerencial
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
  <!-- FRENTE 2: LINHA SUPERIOR - 4 CARDS DE FLUXO DE CAIXA DE ALTO IMPACTO -->
  <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:14px;margin-bottom:18px">
    <!-- Card 1: A Receber Hoje (Verde) -->
    <div class="card card-p" style="border-bottom:4px solid #10b981;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px">
        <span class="mini" style="font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:0.04em">Contas a Receber Hoje</span>
        ${ico('grana', 16)}
      </div>
      <div style="font-size:26px;font-weight:800;color:#10b981;line-height:1.2;font-family:var(--mono)">${brl(totalRecHoje)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">
        <span class="mini" style="color:#64748b;font-weight:600">${recHoje.length} título(s) hoje</span>
        <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='receber';render()" style="color:#10b981;font-size:11.5px;font-weight:700">Mais detalhes »</button>
      </div>
    </div>

    <!-- Card 2: A Pagar Hoje (Vermelho) -->
    <div class="card card-p" style="border-bottom:4px solid #ef4444;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px">
        <span class="mini" style="font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.04em">Contas a Pagar Hoje</span>
        ${ico('cartao', 16)}
      </div>
      <div style="font-size:26px;font-weight:800;color:#ef4444;line-height:1.2;font-family:var(--mono)">${brl(totalPagHoje)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">
        <span class="mini" style="color:#64748b;font-weight:600">${pagHoje.length} compromisso(s)</span>
        <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='pagar';render()" style="color:#ef4444;font-size:11.5px;font-weight:700">Mais detalhes »</button>
      </div>
    </div>

    <!-- Card 3: A Receber na Semana (Verde) -->
    <div class="card card-p" style="border-bottom:4px solid #10b981;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px">
        <span class="mini" style="font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:0.04em">A Receber na Semana</span>
        ${ico('doc', 16)}
      </div>
      <div style="font-size:26px;font-weight:800;color:#10b981;line-height:1.2;font-family:var(--mono)">${brl(totalRecSemana)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">
        <span class="mini" style="color:#64748b;font-weight:600">${recSemana.length} título(s) na semana</span>
        <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='receber';render()" style="color:#10b981;font-size:11.5px;font-weight:700">Mais detalhes »</button>
      </div>
    </div>

    <!-- Card 4: A Pagar na Semana (Vermelho) -->
    <div class="card card-p" style="border-bottom:4px solid #ef4444;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
      <div class="entre" style="margin-bottom:6px">
        <span class="mini" style="font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.04em">A Pagar na Semana</span>
        ${ico('caixa', 16)}
      </div>
      <div style="font-size:26px;font-weight:800;color:#ef4444;line-height:1.2;font-family:var(--mono)">${brl(totalPagSemana)}</div>
      <div class="entre" style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">
        <span class="mini" style="color:#64748b;font-weight:600">${pagSemana.length} título(s) na semana</span>
        <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='pagar';render()" style="color:#ef4444;font-size:11.5px;font-weight:700">Mais detalhes »</button>
      </div>
    </div>
  </div>

  <!-- SEÇÃO PRINCIPAL DO PAINEL (COLUNA ESQUERDA: AVISOS & RÉGUA | COLUNA DIREITA: GRÁFICOS & DRE) -->
  <div style="display:grid;grid-template-columns:1fr 1.25fr;gap:16px;margin-bottom:18px">
    <!-- COLUNA ESQUERDA: QUADRO DE AVISOS & PENDÊNCIAS OPERACIONAIS CLICÁVEIS -->
    <div style="display:flex;flex-direction:column;gap:14px">
      <!-- Banner de Destaque da Régua de Cobrança Automática via WhatsApp/Pix -->
      <div class="card card-p" style="background:linear-gradient(135deg, #065f46 0%, #047857 100%);color:#fff;border-radius:10px;box-shadow:0 4px 12px rgba(4,120,87,0.25)">
        <div class="entre" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">⚡</span>
            <div>
              <strong style="font-size:14.5px">Régua de Cobrança Automática via WhatsApp & Pix</strong>
              <div class="mini" style="color:#a7f3d0">Disparos inteligentes pré, dia e pós-vencimento integrados</div>
            </div>
          </div>
          <span style="background:#10b981;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:12px;text-transform:uppercase">ATIVO</span>
        </div>
        <div class="entre" style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.2)">
          <span class="mini" style="color:#ecfdf5">Títulos com régua: <b>${rec.length}</b></span>
          <button class="btn" onclick="S.ui.view='mensagens';S.ui.abaZap='cobranca';render()" style="background:#fff;color:#065f46;font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:6px">Configurar Régua »</button>
        </div>
      </div>

      <!-- Lista de Alertas em Tempo Real com Links (detalhar) -->
      <div class="card card-p">
        <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--borda-suave);padding-bottom:8px">
          <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px;color:#0f172a">
            ${ico('alerta', 16)}
            <span>Quadro de Avisos & Pendências Operacionais</span>
          </div>
          <span class="badge-vivid badge-alerta">${recAtrasados.length + pagAtrasados.length + osOrcamento.length} itens</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <!-- 1. Conciliação Pendente -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #3b82f6">
            <div>
              <div style="font-weight:600;font-size:13px;color:#0f172a">Arquivos Bancários / Pix com Conciliação Pendente</div>
              <div class="mini" style="color:#64748b">${conciliacoesPendentes} extrato(s) e recebimentos a conferir</div>
            </div>
            <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='extrato';render()" style="color:#2563eb;font-size:12px;font-weight:700">(detalhar)</button>
          </div>

          <!-- 2. Financeiros a Receber Atrasados -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #ef4444">
            <div>
              <div style="font-weight:600;font-size:13px;color:#0f172a">Financeiros a Receber Atrasados</div>
              <div class="mini" style="color:#b91c1c;font-weight:600">${recAtrasados.length} cliente(s) · Total: ${brl(totalRecAtrasado)}</div>
            </div>
            <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='receber';render()" style="color:#ef4444;font-size:12px;font-weight:700">(detalhar)</button>
          </div>

          <!-- 3. Financeiros a Pagar Atrasados -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #f59e0b">
            <div>
              <div style="font-weight:600;font-size:13px;color:#0f172a">Financeiros a Pagar Atrasados</div>
              <div class="mini" style="color:#b45309;font-weight:600">${pagAtrasados.length} fatura(s) vencida(s) · Total: ${brl(totalPagAtrasado)}</div>
            </div>
            <button class="btn-link" onclick="S.ui.view='financeiro';S.ui.abaFin='pagar';render()" style="color:#f59e0b;font-size:12px;font-weight:700">(detalhar)</button>
          </div>

          <!-- 4. OSs em Orçamento / Aguardando Aprovação -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border-radius:6px;border-left:3px solid #10b981">
            <div>
              <div style="font-weight:600;font-size:13px;color:#0f172a">Ordens de Serviço em Orçamento no Pátio</div>
              <div class="mini" style="color:#64748b">${osOrcamento.length} veículo(s) aguardando liberação do cliente</div>
            </div>
            <button class="btn-link" onclick="S.ui.view='patio';render()" style="color:#10b981;font-size:12px;font-weight:700">(detalhar)</button>
          </div>
        </div>
      </div>
    </div>

    <!-- COLUNA DIREITA: GRÁFICOS E RESULTADO CONSOLIDADO -->
    <div style="display:flex;flex-direction:column;gap:14px">
      <!-- Gráfico Donut/Pizza: Vendas por Categoria com Filtro de Mês -->
      <div class="card card-p">
        <div class="entre" style="margin-bottom:10px">
          <div>
            <div style="font-weight:700;font-size:15px;color:#0f172a">Vendas por Categoria (Setor Pesado)</div>
            <div class="mini" style="color:#64748b">Distribuição da receita em peças e serviços especializados</div>
          </div>
          <div class="navegador-periodo">
            <button type="button" onclick="torrar('Mês anterior')">&lt;</button>
            <span class="periodo-label">Outubro 2026</span>
            <button type="button" onclick="torrar('Próximo mês')">&gt;</button>
          </div>
        </div>
        <div style="height:210px;position:relative">
          <canvas id="grafico-vendas-categoria"></canvas>
        </div>
      </div>

      <!-- Card Resultado Consolidado do Mês -->
      <div class="card card-p" style="background:#ffffff;border:1px solid var(--borda-forte)">
        <div class="entre" style="margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:8px">
          <div style="font-weight:700;font-size:14px;color:#0f172a">Resultado Consolidado do Mês</div>
          <span class="badge-vivid badge-info">Outubro 2026</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0">
            <div class="mini" style="color:#64748b">Receita Bruta</div>
            <div style="font-size:16px;font-weight:700;color:#10b981;font-family:var(--mono)">${brl(receitaBruta)}</div>
          </div>
          <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0">
            <div class="mini" style="color:#64748b">Despesas & CPV</div>
            <div style="font-size:16px;font-weight:700;color:#ef4444;font-family:var(--mono)">${brl(custosPecas + despesasOperacionais)}</div>
          </div>
          <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0">
            <div class="mini" style="color:#64748b">Lucro Líquido Real</div>
            <div style="font-size:16px;font-weight:800;color:${lucroLiquido >= 0 ? '#10b981' : '#ef4444'};font-family:var(--mono)">${brl(lucroLiquido)}</div>
          </div>
          <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0">
            <div class="mini" style="color:#64748b">Taxa de Ocupação dos Boxes</div>
            <div style="font-size:16px;font-weight:800;color:#2563eb;font-family:var(--mono)">${taxaOcupacao}% (${boxesOcupados}/${totalBoxes} boxes)</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function blocoTitulosPainel(lista, titulo, tipo) {
  const itens = (lista || [])
    .filter(t => t.status !== 'pago' && t.status !== 'recebido')
    .slice(0, 5);

  const corBadge = tipo === 'receber' ? 'var(--verde)' : 'var(--tijolo)';
  const labelTipo = tipo === 'receber' ? 'Cliente' : 'Fornecedor';

  return `
    <div class="cartao" style="margin-bottom:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid var(--aco-100);padding-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${corBadge}"></span>
          <span style="font-weight:700;font-size:13px;color:var(--aco-800)">${titulo}</span>
        </div>
        <span class="emblema" style="background:${tipo === 'receber' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};color:${corBadge}">
          ${itens.length} pendente(s)
        </span>
      </div>

      ${itens.length === 0 ? `
        <div style="text-align:center;padding:18px 0;color:var(--aco-400);font-size:12px">
          Nenhum título pendente no momento.
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${itens.map(item => {
            const atrasado = item.vencimento && item.vencimento < hoje();
            const pessoa = item.cliente || item.fornecedor || 'Geral';
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--aco-50);border-radius:6px;font-size:12px;border-left:3px solid ${atrasado ? 'var(--tijolo)' : corBadge}">
                <div>
                  <div style="font-weight:600;color:var(--aco-900)">${item.descricao || item.categoria || 'Título'}</div>
                  <div style="font-size:11px;color:var(--aco-500)">${labelTipo}: ${pessoa} · Venc: ${dataBR(item.vencimento)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;color:${corBadge}">${brl(item.valor || 0)}</div>
                  ${atrasado ? '<span style="color:var(--tijolo);font-size:10px;font-weight:700">Atrasado</span>' : '<span style="color:var(--aco-400);font-size:10px">A vencer</span>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

function renderGraficosPainel() {
  if (typeof Chart === 'undefined') return;

  // 1. Gráfico Donut: Vendas por Categoria
  const ctxCat = document.getElementById('grafico-vendas-categoria');
  if (ctxCat) {
    if (window._chartCat) window._chartCat.destroy();

    const pecas = S.pecas || [];
    const vendas = S.vendas || [];
    const categorias = ['SUSPENSÃO', 'MOLAS', 'EMBREAGEM', 'FREIO', 'COMPONENTES EMBUCHAMENTO DE EIXO', 'CARDAN', 'Outras categorias'];

    // Soma valores por categoria a partir de peças cadastradas e vendas
    const valoresPorCat = categorias.map(cat => {
      let total = 0;
      if (cat === 'Outras categorias') {
        pecas.filter(p => !['SUSPENSÃO', 'MOLAS', 'EMBREAGEM', 'FREIO', 'COMPONENTES EMBUCHAMENTO DE EIXO', 'CARDAN'].includes((p.categoria || '').toUpperCase())).forEach(p => {
          total += (Number(p.qtd) || 1) * (Number(p.venda) || 0);
        });
        (S.os || []).forEach(o => (o.servicos || []).forEach(s => total += (s.qtd || 1) * (s.valor || 0)));
      } else {
        pecas.filter(p => {
          const catP = (p.categoria || '').toUpperCase();
          if (cat === 'COMPONENTES EMBUCHAMENTO DE EIXO') return catP.includes('EMBUCH') || catP.includes('EIXO');
          return catP === cat;
        }).forEach(p => {
          total += (Number(p.qtd) || 1) * (Number(p.venda) || 0);
        });
      }
      return Math.round(total) || (cat === 'SUSPENSÃO' ? 14800 : cat === 'MOLAS' ? 11200 : cat === 'FREIO' ? 8900 : cat === 'EMBREAGEM' ? 7400 : 4500);
    });

    window._chartCat = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: categorias,
        datasets: [{
          data: valoresPorCat,
          backgroundColor: [
            '#2563eb', '#0ea5e9', '#10b981', '#ef4444',
            '#f59e0b', '#8b5cf6', '#64748b'
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10.5, weight: 'bold' } } }
        }
      }
    });
  }

  // 2. Gráfico Misto: Faturamento x Quantidade de Vendas
  const ctxFat = document.getElementById('grafico-faturamento-qtd');
  if (ctxFat) {
    if (window._chartFat) window._chartFat.destroy();

    const meses = ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'];
    const dadosFaturamento = [28500, 34200, 41000, 38900, 47500, 52300];
    const dadosQuantidade = [18, 22, 29, 25, 34, 38];

    window._chartFat = new Chart(ctxFat, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [
          {
            type: 'bar',
            label: 'Faturamento (R$)',
            data: dadosFaturamento,
            backgroundColor: 'rgba(37, 99, 235, 0.7)',
            borderColor: '#2563eb',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Qtd Vendas/OS',
            data: dadosQuantidade,
            borderColor: '#10b981',
            backgroundColor: '#10b981',
            borderWidth: 3,
            pointRadius: 4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'R$ Faturamento' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Quantidade' }
          }
        }
      }
    });
  }
}

/* ---------------- Configurações do Sistema ---------------- */
function viewConfiguracoes() {
  if (typeof viewSuperMenuConfiguracoes === 'function') {
    return viewSuperMenuConfiguracoes();
  }
  const cfg = S.cfg || {};

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div style="font-weight:700;font-size:18px;margin-bottom:6px">Configurações da Oficina & Parâmetros</div>
    <div class="mini" style="margin-bottom:16px">Dados impressos nas ordens de serviço, recibos e cabeçalhos.</div>

    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Nome da Oficina / Razão Social:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.empresa || '')}" data-act="cfg" data-c="empresa" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.cnpj || '')}" data-act="cfg" data-c="cnpj" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Telefone / WhatsApp Comercial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.fone || '')}" data-act="cfg" data-c="fone" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Endereço Completo:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.endereco || '')}" data-act="cfg" data-c="endereco" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Chave PIX Oficial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.chavePix || '')}" data-act="cfg" data-c="chavePix" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Inicial do Caixa (R$):</label>
          <input type="number" class="campo-texto" value="${cfg.saldoInicial || 0}" data-act="cfg" data-c="saldoInicial" step="100" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Termo Padrão de Garantia de Serviços:</label>
        <textarea class="campo-texto" data-act="cfg" data-c="termoGarantia" rows="2" style="width:100%">${esc(cfg.termoGarantia || '')}</textarea>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Identidade Visual & Logotipo</div>
        <div class="mini" style="margin-bottom:10px">O logotipo será impresso nas ordens de serviço, orçamentos, recibos e relatórios.</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div id="cfg-logo-preview" style="width:120px;height:60px;border:1px dashed var(--aco-300);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden">
            ${(cfg.identidadeVisual?.logoUrl || cfg.identidadeVisual?.logo) ? `<img src="${cfg.identidadeVisual.logoUrl || cfg.identidadeVisual.logo}" style="max-height:100%;max-width:100%;object-fit:contain">` : '<span class="mini" style="color:var(--aco-400)">Sem Logo</span>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="cfg-input-logo" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div style="display:flex;gap:8px">
              <button class="btn btn-neutro btn-pequeno" type="button" onclick="document.getElementById('cfg-input-logo').click()">Selecionar Logo</button>
              ${(cfg.identidadeVisual?.logoUrl || cfg.identidadeVisual?.logo) ? '<button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-logo">Remover</button>' : ''}
            </div>
            <span class="mini" style="color:var(--aco-500)">Tamanho máximo: 2MB.</span>
          </div>
        </div>

        <div style="font-weight:600;font-size:13px;margin:12px 0 4px 0">Imagem Institucional (Aprovação Digital):</div>
        <div class="mini" style="margin-bottom:10px">Exibida no cabeçalho da página pública de aprovação de orçamentos para os clientes.</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div id="cfg-institucional-preview" style="width:120px;height:60px;border:1px dashed var(--aco-300);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden">
            ${(cfg.identidadeVisual?.imagemInstitucionalUrl || cfg.identidadeVisual?.imagemInstitucional) ? `<img src="${cfg.identidadeVisual.imagemInstitucionalUrl || cfg.identidadeVisual.imagemInstitucional}" style="max-height:100%;max-width:100%;object-fit:contain">` : '<span class="mini" style="color:var(--aco-400)">Sem Imagem</span>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="cfg-input-institucional" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div style="display:flex;gap:8px">
              <button class="btn btn-neutro btn-pequeno" type="button" onclick="document.getElementById('cfg-input-institucional').click()">Selecionar Imagem</button>
              ${(cfg.identidadeVisual?.imagemInstitucionalUrl || cfg.identidadeVisual?.imagemInstitucional) ? '<button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-institucional">Remover</button>' : ''}
            </div>
            <span class="mini" style="color:var(--aco-500)">Tamanho máximo: 2MB.</span>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div class="entre" style="margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:14px">Assistente Virtual & Voz</div>
            <div class="mini" style="margin-bottom:4px">Personalize o nome, timbre de voz e teste a pronúncia da inteligência operacional da sua oficina.</div>
          </div>
          <button type="button" class="btn btn-neutro btn-pequeno" style="gap:6px;display:flex;align-items:center;white-space:nowrap" onclick="if(typeof abrirConfiguracoesAgente==='function')abrirConfiguracoesAgente()">
            ⚙️ Personalizar no Modal Completo
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nome do Assistente:</label>
            <input type="text" id="cfg-ass-nome-inline" class="campo-texto" value="${esc(cfg.assistente?.displayName || 'Verônica')}" data-act="cfg-assistente" data-c="displayName" placeholder="Ex: Verônica, Sofia, Carlos, Atlas" style="width:100%;height:34px">
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center">
              <span class="mini" style="color:var(--aco-500);font-size:10.5px">Sugestões:</span>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Verônica';(S.cfg.assistente.voiceGender='female');salvar();render();">Verônica 👩</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Sofia';(S.cfg.assistente.voiceGender='female');salvar();render();">Sofia 👩</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Carlos';(S.cfg.assistente.voiceGender='male');salvar();render();">Carlos 👨</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Atlas';(S.cfg.assistente.voiceGender='male');salvar();render();">Atlas 👨</button>
            </div>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Gênero da Voz Sintetizada:</label>
            <select class="campo-texto" data-act="cfg-assistente" data-c="voiceGender" style="width:100%;height:34px">
              <option value="female" ${(cfg.assistente?.voiceGender || 'female') === 'female' ? 'selected' : ''}>👩 Feminina (Padrão)</option>
              <option value="male" ${(cfg.assistente?.voiceGender) === 'male' ? 'selected' : ''}>👨 Masculina</option>
            </select>
            <div class="mini" style="margin-top:4px;color:var(--aco-500)">Gênero aplicado nos filtros de voz e nas saudações do pós-venda.</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;align-items:end;margin-bottom:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Voz Específica do Navegador / Sistema Operacional:</label>
            <select id="cfg-ass-voz-inline" class="campo-texto" data-act="cfg-assistente" data-c="voiceURI" style="width:100%;height:34px" onchange="if(typeof aoMudarVozInline==='function')aoMudarVozInline(this)">
              <option value="">✨ Seleção Automática Inteligente</option>
            </select>
          </div>
          <div>
            <button type="button" id="btn-inline-testar-voz" class="btn btn-neutro" style="width:100%;height:34px;gap:6px;display:flex;align-items:center;justify-content:center;font-weight:600" onclick="if(typeof executarTesteModalVoz==='function')executarTesteModalVoz()">
              <span>▶️</span> Ouvir Saudação
            </button>
          </div>
        </div>

        <!-- Briefing Executivo Diário e Semanal -->
        <div style="background:var(--aco-100, rgba(0,0,0,0.03));border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-top:10px">
          <div class="entre" style="margin-bottom:8px">
            <div>
              <span style="font-weight:700;font-size:13px">📊 Briefings Executivos para Gestores</span>
              <div class="mini" style="color:var(--aco-500)">Consolidação diária e semanal de pátio e financeiro.</div>
            </div>
            <button type="button" class="btn btn-neutro btn-pequeno" onclick="if(typeof gerarEVisualizarBriefing==='function')gerarEVisualizarBriefing()" style="font-weight:600;display:flex;align-items:center;gap:4px">
              <span>📈</span> Visualizar Briefing Agora
            </button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
            <div style="border-right:1px solid var(--aco-200);padding-right:10px">
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;cursor:pointer;margin-bottom:6px">
                <input type="checkbox" data-act="cfg-assistente-bool" data-c="briefingDiarioAtivo" ${cfg.assistente?.briefingDiarioAtivo ? 'checked' : ''}>
                <span>Briefing Diário Matinal</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="mini" style="white-space:nowrap">Horário:</span>
                <input type="time" class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" value="${cfg.assistente?.briefingDiarioHorario || '07:30'}" data-act="cfg-assistente" data-c="briefingDiarioHorario">
              </div>
            </div>
            <div>
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;cursor:pointer;margin-bottom:6px">
                <input type="checkbox" data-act="cfg-assistente-bool" data-c="briefingSemanalAtivo" ${cfg.assistente?.briefingSemanalAtivo ? 'checked' : ''}>
                <span>Briefing Semanal Gerencial</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center">
                <select class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" data-act="cfg-assistente" data-c="briefingSemanalDia">
                  <option value="segunda" ${(cfg.assistente?.briefingSemanalDia || 'segunda') === 'segunda' ? 'selected' : ''}>Segunda-feira</option>
                  <option value="sexta" ${(cfg.assistente?.briefingSemanalDia) === 'sexta' ? 'selected' : ''}>Sexta-feira</option>
                  <option value="sabado" ${(cfg.assistente?.briefingSemanalDia) === 'sabado' ? 'selected' : ''}>Sábado</option>
                </select>
                <input type="time" class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" value="${cfg.assistente?.briefingSemanalHorario || '08:00'}" data-act="cfg-assistente" data-c="briefingSemanalHorario">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Manutenção Preventiva & Pós-Venda</div>
        <div class="mini" style="margin-bottom:10px">Parâmetros globais para alertas automáticos e follow-up com frotistas.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">Alerta Preventiva (Km antecedência):</label>
            <input type="number" class="campo-texto" value="${cfg.manutencaoPreventiva?.alertaKmPadrao || 1000}" data-act="cfg-prev" data-c="alertaKmPadrao" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">Alerta Preventiva (Dias antecedência):</label>
            <input type="number" class="campo-texto" value="${cfg.manutencaoPreventiva?.alertaDiasPadrao || 15}" data-act="cfg-prev" data-c="alertaDiasPadrao" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Guia de Implantação & Demonstração</div>
        <div class="mini" style="margin-bottom:10px">Controle o banner de ativação e carregue ou limpe os dados de demonstração.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-neutro btn-pequeno" type="button" data-act="${cfg.onboardingConcluido ? 'reabrir-onboarding' : 'concluir-onboarding'}">
            ${cfg.onboardingConcluido ? 'Reabrir Checklist de Onboarding' : 'Marcar Onboarding Concluído'}
          </button>
          <button class="btn btn-neutro btn-pequeno" type="button" data-act="carregar-demo">Carregar Dados Demo</button>
          <button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-demo">Remover Dados Demo</button>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Integração APIBrasil (Consulta de Placas)</div>
        <div class="mini" style="margin-bottom:10px">Insira as credenciais para puxar marca, modelo e cor pela placa automaticamente.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">DeviceToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.deviceToken) || '')}" data-act="cfg-apibrasil" data-c="deviceToken" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">BearerToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.bearerToken) || '')}" data-act="cfg-apibrasil" data-c="bearerToken" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-perigo" data-act="zerar">Restaurar Demonstração</button>
        <button class="btn btn-primario" data-act="salvar-cfg">Salvar Alterações</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- Gerenciamento de Modais / Folhas ---------------- */
function abrirFolha(fn) {
  folhaAtual = fn;
  renderFolha();
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.add('on');
  if (folha) folha.classList.add('on');
}

function renderFolha() {
  const folha = document.getElementById('folha');
  if (folha && folhaAtual) {
    folha.innerHTML = folhaAtual();
  }
}

function fecharFolha() {
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.remove('on');
  if (folha) {
    folha.classList.remove('on');
    folha.classList.remove('folha-assistente');
  }
  folhaAtual = null;
}

/* =====================================================================
   INICIALIZAÇÃO DO SISTEMA (BOOT)
===================================================================== */
async function boot() {
  const salvo = await armazem.ler();
  S = salvo && salvo.os ? salvo : sementes();

  // Hidrata e sincroniza configurações do assistente de voz a partir de cache persistente
  try {
    const assLocal = localStorage.getItem('patio_assistente_config');
    if (assLocal) {
      const parsedAss = JSON.parse(assLocal);
      S.cfg = S.cfg || {};
      S.cfg.assistente = Object.assign({}, S.cfg.assistente || {}, parsedAss);
      if (typeof window !== 'undefined') window.__PATIO_VOICE_CONFIG__ = S.cfg.assistente;
    } else if (S.cfg && S.cfg.assistente) {
      localStorage.setItem('patio_assistente_config', JSON.stringify(S.cfg.assistente));
      if (typeof window !== 'undefined') window.__PATIO_VOICE_CONFIG__ = S.cfg.assistente;
    }
  } catch (_) {}

  S.ui = Object.assign({
    view: 'patio',
    filtro: 'todos',
    perfilAtivo: 'todos',
    abaFin: 'dashboard',
    abaOS: 'servicos',
    abaCad: 'hub',
    abaZap: 'cobranca',
    busca: '',
    buscaPlaca: ''
  }, S.ui || {});

  if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
    S.ui.perfilAtivo = 'mecanico';
  }

  S.extrato = S.extrato || [];
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.compras = S.compras || [];
  S.vendas = S.vendas || [];
  S.fornecedores = S.fornecedores || [];
  S.mecanicos = S.mecanicos || [];
  S.boxes = S.boxes || [];
  S.pecas = S.pecas || [];
  S.servicos = S.servicos || [];
  S.contasPagar = S.contasPagar || [];
  S.contasReceber = S.contasReceber || [];
  S.lancamentosCaixa = S.lancamentosCaixa || [];
  S.historicoCaixa = S.historicoCaixa || [];
  if (!S.zap || !S.zap.regua) S.zap = zapPadrao();

  // Verifica autenticação ativa
  try {
    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('patio_auth_token')) ||
                  (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('patio_auth_token'));
    if (!token) {
      if (typeof abrirModalLogin === 'function') {
        setTimeout(abrirModalLogin, 60);
      }
    } else {
      const meRes = await fetch('/api/auth/me', {
        headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : { 'Authorization': `Bearer ${token}` }
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user) {
          S.user = meData.user;
          S.perfil = meData.user.role;
          S.ui = S.ui || {};
          S.ui.perfilAtivo = meData.user.role;
        }
      } else if (meRes.status === 401 || meRes.status === 403) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('patio_auth_token');
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('patio_auth_token');
        if (typeof abrirModalLogin === 'function') {
          setTimeout(abrirModalLogin, 60);
        }
      }
    }
  } catch (_) {}

  render();

  // Sincronização Periódica em Tempo Real com o Servidor (Auto-Refresh quando chegar OS do WhatsApp)
  let _checandoSync = false;
  async function checarAtualizacoesServidor() {
    if (_checandoSync) return;
    if (document.visibilityState === 'hidden') return;
    if (pendingLocalSave || folhaAtual) return;
    const generation = localGeneration;
    _checandoSync = true;
    try {
      const res = await fetch('/api/versao');
      if (res.ok) {
        const info = await res.json();
        const versaoLocal = S.versao || 0;
        const osLocal = (S.os || []).length;
        const veiLocal = (S.veiculos || []).length;

        if ((info.versao && info.versao > versaoLocal) || info.totalOS !== osLocal || info.totalVei !== veiLocal) {
          const resEst = await fetch('/api/estado');
          if (resEst.ok) {
            const novo = await resEst.json();
            if (novo && novo.os) {
              // Uma edição iniciada durante o fetch invalida esta atualização.
              if (pendingLocalSave || folhaAtual || generation !== localGeneration) return;
              const ui = S.ui;
              S = novo;
              S.ui = ui;
              if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
                S.ui.perfilAtivo = 'mecanico';
              }
              armazem.base = PatioSync.clone(novo);
              try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}

              // Re-renderiza em tempo real se nenhuma folha/modal estiver sendo editada
              if (!folhaAtual && typeof render === 'function') {
                render();
                const statusEl = document.getElementById('status-salvo');
                if (statusEl) {
                  statusEl.textContent = '● Pátio Atualizado';
                  statusEl.style.color = 'var(--verde)';
                  setTimeout(() => { if (statusEl) statusEl.textContent = '● Salvo'; }, 2000);
                }
              }
            }
          }
        }
      }
    } catch (_) {
    } finally {
      _checandoSync = false;
    }
  }
  setInterval(checarAtualizacoesServidor, 5000);
}
boot();

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.boot = boot;
  window.render = render;
  window.viewPainelInicial = viewPainelInicial;
  window.blocoTitulosPainel = blocoTitulosPainel;
  window.renderGraficosPainel = renderGraficosPainel;
  window.viewConfiguracoes = viewConfiguracoes;
  window.abrirFolha = abrirFolha;
  window.renderFolha = renderFolha;
  window.fecharFolha = fecharFolha;
}
