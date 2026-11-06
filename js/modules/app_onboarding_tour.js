/**
 * Módulo: app_onboarding_tour.js
 * Pátio-CRM — Configurações da Oficina, Guia de Implantação e Gráficos do Painel
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

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
          <div style="text-align:center;padding:18px 0;color:var(--aco-400);font-size:12px">Nenhum título pendente no momento.</div>
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
                </div>`;
            }).join('')}
          </div>
        `}
      </div>`;
  }

  function renderGraficosPainel() {
    if (typeof Chart === 'undefined') return;

    // 1. Gráfico Donut: Vendas por Categoria
    const ctxCat = document.getElementById('grafico-vendas-categoria');
    if (ctxCat) {
      if (window._chartCat) window._chartCat.destroy();

      const pecas = S.pecas || [];
      const categorias = ['SUSPENSÃO', 'MOLAS', 'EMBREAGEM', 'FREIO', 'COMPONENTES EMBUCHAMENTO DE EIXO', 'CARDAN', 'Outras categorias'];

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
            backgroundColor: ['#2563eb', '#0ea5e9', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#64748b'],
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
            y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'R$ Faturamento' } },
            y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Quantidade' } }
          }
        }
      });
    }
  }

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
        </div>

        <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
          <div class="entre" style="margin-bottom:8px">
            <div>
              <div style="font-weight:700;font-size:14px">Assistente Virtual & Voz</div>
              <div class="mini" style="margin-bottom:4px">Personalize a inteligência operacional da sua oficina.</div>
            </div>
            <button type="button" class="btn btn-neutro btn-pequeno" onclick="if(typeof abrirConfiguracoesAgente==='function')abrirConfiguracoesAgente()">
              ⚙️ Modal Completo
            </button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px">Nome do Assistente:</label>
              <input type="text" id="cfg-ass-nome-inline" class="campo-texto" value="${esc(cfg.assistente?.displayName || 'Verônica')}" data-act="cfg-assistente" data-c="displayName" style="width:100%;height:34px">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px">Gênero da Voz:</label>
              <select class="campo-texto" data-act="cfg-assistente" data-c="voiceGender" style="width:100%;height:34px">
                <option value="female" ${(cfg.assistente?.voiceGender || 'female') === 'female' ? 'selected' : ''}>👩 Feminina (Padrão)</option>
                <option value="male" ${(cfg.assistente?.voiceGender) === 'male' ? 'selected' : ''}>👨 Masculina</option>
              </select>
            </div>
          </div>
        </div>

        <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px">Guia de Implantação & Demonstração</div>
          <div class="mini" style="margin-bottom:10px">Controle o banner de ativação e carregue ou limpe os dados de demonstração.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-neutro btn-pequeno" type="button" data-act="${cfg.onboardingConcluido ? 'reabrir-onboarding' : 'concluir-onboarding'}">
              ${cfg.onboardingConcluido ? 'Reabrir Guia de Implantação' : 'Marcar Guia Concluído'}
            </button>
            <button class="btn btn-neutro btn-pequeno" type="button" data-act="carregar-demo">Carregar Dados de Exemplo</button>
            <button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-demo">Remover Dados de Exemplo</button>
          </div>
        </div>

        <div style="border-top:1px solid var(--aco-200);padding-top:14px;display:flex;justify-content:space-between;align-items:center">
          <button class="btn btn-perigo" data-act="zerar">Restaurar Demonstração</button>
          <button class="btn btn-primario" data-act="salvar-cfg">Salvar Alterações</button>
        </div>
      </div>
    </div>`;
  }

  // Exportações explícitas para window e globalThis
  global.blocoTitulosPainel = blocoTitulosPainel;
  global.renderGraficosPainel = renderGraficosPainel;
  global.viewConfiguracoes = viewConfiguracoes;

  if (typeof window !== 'undefined') {
    window.blocoTitulosPainel = blocoTitulosPainel;
    window.renderGraficosPainel = renderGraficosPainel;
    window.viewConfiguracoes = viewConfiguracoes;
  }
})(typeof window !== 'undefined' ? window : globalThis);

