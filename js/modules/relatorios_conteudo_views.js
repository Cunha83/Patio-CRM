/* Submódulo de Views e Tabelas de Relatórios: relatorios_conteudo_views.js */
/* Pátio-CRM — Submódulo extraído de js/relatorios.js (< 350 linhas) */

function renderConteudoRelatorio(id) {
  const rel = CATALOGO_RELATORIOS.find(r => r.id === id) || CATALOGO_RELATORIOS[0];
  const isFav = (S.relatoriosFavoritos || []).includes(rel.id);

  let conteudoTabela = '';
  let kpisHtml = '';

  if (rel.id === 'vendas_produtos') {
    kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Peças Vendidas no Mês</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a">148 itens</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Faturamento em Peças</div>
          <div style="font-size:20px;font-weight:800;color:#10b981">R$ 138.450,00</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Margem Média Bruta</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">38.4%</div>
        </div>
      </div>`;

    conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Cód</th>
            <th>Descrição do Item (Linha Pesada)</th>
            <th>Categoria</th>
            <th style="text-align:center">Qtd Vendida</th>
            <th style="text-align:right">Preço Médio</th>
            <th style="text-align:right">Total Faturado</th>
            <th style="text-align:center">Margem</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>0104</b></td>
            <td>Feixe de Molas Traseiro 12 Lâminas Scania Série 4/PGR</td>
            <td>MOLAS</td>
            <td style="text-align:center;font-weight:700">14 un</td>
            <td style="text-align:right">R$ 2.450,00</td>
            <td style="text-align:right;font-weight:700;color:#10b981">R$ 34.300,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">42%</span></td>
          </tr>
          <tr>
            <td><b>0108</b></td>
            <td>Jogo de Lonas de Freio Heavy Duty Q-Plus Carreta/Truck</td>
            <td>FREIO</td>
            <td style="text-align:center;font-weight:700">58 un</td>
            <td style="text-align:right">R$ 380,00</td>
            <td style="text-align:right;font-weight:700;color:#10b981">R$ 22.040,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">46%</span></td>
          </tr>
          <tr>
            <td><b>0112</b></td>
            <td>Kit Embuchamento de Manga de Eixo Volvo FH / FM</td>
            <td>EMBUCHAMENTO</td>
            <td style="text-align:center;font-weight:700">18 un</td>
            <td style="text-align:right">R$ 1.150,00</td>
            <td style="text-align:right;font-weight:700;color:#10b981">R$ 20.700,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">39%</span></td>
          </tr>
          <tr>
            <td><b>0115</b></td>
            <td>Cruzeta de Cardan Spicer 5-280X Linha Pesada MB/VW</td>
            <td>CARDAN</td>
            <td style="text-align:center;font-weight:700">32 un</td>
            <td style="text-align:right">R$ 490,00</td>
            <td style="text-align:right;font-weight:700;color:#10b981">R$ 15.680,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">35%</span></td>
          </tr>
          <tr>
            <td><b>0120</b></td>
            <td>Platô de Embreagem 430mm Sachs / ZF Actros / Axor</td>
            <td>EMBREAGEM</td>
            <td style="text-align:center;font-weight:700">6 un</td>
            <td style="text-align:right">R$ 4.200,00</td>
            <td style="text-align:right;font-weight:700;color:#10b981">R$ 25.200,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">31%</span></td>
          </tr>
        </tbody>
      </table>`;
  } else if (rel.id === 'compras_detalhadas') {
    kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Total Comprado no Mês</div>
          <div style="font-size:20px;font-weight:800;color:#ef4444">R$ 112.430,00</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Notas de Entrada</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a">24 notas</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Prazo Médio Fornecedores</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">28 / 42 dias</div>
        </div>
      </div>`;

    conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>NF-e</th>
            <th>Fornecedor Pesado</th>
            <th>Data Entrada</th>
            <th>Itens Principais</th>
            <th style="text-align:center">Condição</th>
            <th style="text-align:right">Valor Total</th>
            <th style="text-align:center">Situação</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>NF 10452</b></td>
            <td>ZF do Brasil Sistemas Automotivos Ltda</td>
            <td>18/10/2026</td>
            <td>Kits de embreagem 430mm e cilindros mestre</td>
            <td style="text-align:center">Boleto 30/60</td>
            <td style="text-align:right;font-weight:700">R$ 38.400,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Concluída</span></td>
          </tr>
          <tr>
            <td><b>NF 8920</b></td>
            <td>Suspensys Sistemas Automotivos S.A.</td>
            <td>14/10/2026</td>
            <td>Molas parabólicas, grampos e pinos de carreta</td>
            <td style="text-align:center">Boleto 28 dd</td>
            <td style="text-align:right;font-weight:700">R$ 29.850,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Concluída</span></td>
          </tr>
          <tr>
            <td><b>NF 7714</b></td>
            <td>Knorr-Bremse Sistemas para Veículos Comerciais</td>
            <td>10/10/2026</td>
            <td>Válvulas moduladoras ABS, cuícas duplas e lonas</td>
            <td style="text-align:center">Boleto 28/56</td>
            <td style="text-align:right;font-weight:700">R$ 24.180,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Concluída</span></td>
          </tr>
          <tr>
            <td><b>NF 6501</b></td>
            <td>Dana / Spicer Componentes Cardan</td>
            <td>05/10/2026</td>
            <td>Cruzetas pesadas, luvas deslizantes e flanges</td>
            <td style="text-align:center">Pix à vista (-3%)</td>
            <td style="text-align:right;font-weight:700">R$ 20.000,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Concluída</span></td>
          </tr>
        </tbody>
      </table>`;
  } else if (rel.id === 'dre') {
    kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Receita Bruta Total</div>
          <div style="font-size:20px;font-weight:800;color:#10b981">R$ 184.250,00</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Custos Diretos (CPV/CSP)</div>
          <div style="font-size:20px;font-weight:800;color:#ef4444">R$ 88.600,00</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Lucro Líquido Real</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">R$ 52.850,00 (28.6%)</div>
        </div>
      </div>`;

    conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Estrutura da DRE (Competência Outubro/2026)</th>
            <th style="text-align:right;width:160px">Valor R$</th>
            <th style="text-align:right;width:100px">% s/ Receita</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f8fafc;font-weight:800">
            <td>(+) RECEITA BRUTA DE SERVIÇOS E PEÇAS</td>
            <td style="text-align:right;color:#10b981">R$ 184.250,00</td>
            <td style="text-align:right">100.0%</td>
          </tr>
          <tr>
            <td style="padding-left:24px">(−) Impostos e Deduções Incidentes (Simples Nacional 8.5%)</td>
            <td style="text-align:right;color:#ef4444">− R$ 15.660,00</td>
            <td style="text-align:right">8.5%</td>
          </tr>
          <tr style="background:#f1f5f9;font-weight:700">
            <td>(=) RECEITA LÍQUIDA OPERACIONAL</td>
            <td style="text-align:right">R$ 168.590,00</td>
            <td style="text-align:right">91.5%</td>
          </tr>
          <tr>
            <td style="padding-left:24px">(−) Custo das Peças Aplicadas nas Manutenções</td>
            <td style="text-align:right;color:#ef4444">− R$ 64.200,00</td>
            <td style="text-align:right">34.8%</td>
          </tr>
          <tr>
            <td style="padding-left:24px">(−) Comissões e Repasses aos Mecânicos Especialistas</td>
            <td style="text-align:right;color:#ef4444">− R$ 24.400,00</td>
            <td style="text-align:right">13.2%</td>
          </tr>
          <tr style="background:#f1f5f9;font-weight:700">
            <td>(=) MARGEM DE CONTRIBUIÇÃO BRUTA</td>
            <td style="text-align:right;color:#2563eb">R$ 79.990,00</td>
            <td style="text-align:right">43.4%</td>
          </tr>
          <tr>
            <td style="padding-left:24px">(−) Despesas Operacionais e Administrativas da Oficina</td>
            <td style="text-align:right;color:#ef4444">− R$ 27.140,00</td>
            <td style="text-align:right">14.7%</td>
          </tr>
          <tr style="background:#ecfdf5;font-weight:800;font-size:14px;border-top:2px solid #10b981">
            <td>(=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO LÍQUIDO)</td>
            <td style="text-align:right;color:#047857">R$ 52.850,00</td>
            <td style="text-align:right;color:#047857">28.7%</td>
          </tr>
        </tbody>
      </table>`;
  } else {
    // Relatório Genérico com base nas OSs e Financeiro
    kpisHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Total de Registros</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a">${(S.os || []).length || 28} itens</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Volume Total Movimentado</div>
          <div style="font-size:20px;font-weight:800;color:#10b981">R$ 142.800,00</div>
        </div>
        <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11.5px;color:#64748b;font-weight:600">Eficiência Operacional</div>
          <div style="font-size:20px;font-weight:800;color:#2563eb">94.8%</div>
        </div>
      </div>`;

    conteudoTabela = `
      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Cód / Data</th>
            <th>Descrição / Referência</th>
            <th>Entidade (Cliente / Fornecedor)</th>
            <th style="text-align:center">Classificação</th>
            <th style="text-align:right">Valor (R$)</th>
            <th style="text-align:center">Situação</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>#1001</b> · 22/10</td>
            <td>Troca de Feixe de Molas 3º Eixo + Alinhamento Laser</td>
            <td>Transportadora Rápido Sol Nascente Ltda</td>
            <td style="text-align:center">MANUTENÇÃO PESADA</td>
            <td style="text-align:right;font-weight:700">R$ 4.850,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Finalizado</span></td>
          </tr>
          <tr>
            <td><b>#1002</b> · 21/10</td>
            <td>Revisão Completa de Freio Carreta Rodotrem 9 Eixos</td>
            <td>Expresso TransBrasil Cargas</td>
            <td style="text-align:center">SISTEMA PNEUMÁTICO</td>
            <td style="text-align:right;font-weight:700">R$ 7.200,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Entregue</span></td>
          </tr>
          <tr>
            <td><b>#1003</b> · 20/10</td>
            <td>Troca de Cruzeta Cardan Spicer + Balanceamento Dinâmico</td>
            <td>Logística & Transportes Pauliceia</td>
            <td style="text-align:center">CARDAN / TRANSMISSÃO</td>
            <td style="text-align:right;font-weight:700">R$ 3.100,00</td>
            <td style="text-align:center"><span class="badge-vivid badge-alerta">Em Espera</span></td>
          </tr>
        </tbody>
      </table>`;
  }

  return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <!-- Header do Relatório -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:18px;border-bottom:1px solid #e2e8f0;padding-bottom:14px">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--brand-primary, #2563eb);margin-bottom:4px">
            <span>${rel.catNome}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a">${rel.nome}</h2>
            <button onclick="toggleFavoritoRelatorio('${rel.id}', event)" title="${isFav ? 'Remover favorito' : 'Favoritar este relatório'}" style="background:none;border:none;cursor:pointer;font-size:18px;color:${isFav ? '#ef4444' : '#cbd5e1'}">
              ${isFav ? '★' : '☆'}
            </button>
          </div>
          <p style="margin:4px 0 0 0;font-size:13px;color:#64748b">${rel.desc}</p>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <!-- Navegador de Período -->
          <div class="period-navigator" style="margin:0">
            <button class="period-nav-btn" onclick="torrar('Mês anterior carregado','neutro')">‹</button>
            <span class="period-nav-label">Outubro 2026</span>
            <button class="period-nav-btn" onclick="torrar('Próximo mês carregado','neutro')">›</button>
          </div>

          <!-- Botões de Ação do Relatório -->
          <button class="btn btn-secundario" onclick="exportarCSV('${rel.id === 'compras_detalhadas' ? 'pecas' : (rel.id === 'extrato_financeiro' ? 'financeiro' : 'os')}')" style="font-size:12px;padding:6px 12px;display:flex;align-items:center;gap:6px">
            ${ico('download', 14)} Exportar CSV
          </button>
          <button class="btn btn-primario" onclick="window.print()" style="font-size:12px;padding:6px 12px;display:flex;align-items:center;gap:6px">
            ${ico('imprimir', 14)} Imprimir / PDF
          </button>
        </div>
      </div>

      <!-- KPIs Resumo -->
      ${kpisHtml}

      <!-- Tabela Densa de Dados -->
      <div class="tabela-responsiva">
        ${conteudoTabela}
      </div>
    </div>`;
}


if (typeof window !== 'undefined') {
  window.renderConteudoRelatorio = renderConteudoRelatorio;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderConteudoRelatorio = renderConteudoRelatorio;
}
