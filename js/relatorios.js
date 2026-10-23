/* =====================================================================
   PÁTIO CRM — MÓDULO DE RELATÓRIOS, EXPORTAÇÕES & BACKUP
===================================================================== */

/* =====================================================================
   PÁTIO CRM — CENTRAL DE RELATÓRIOS ENTERPRISE (MASTER-DETAIL)
===================================================================== */

const CATALOGO_RELATORIOS = [
  // Financeiro
  { id: 'extrato_financeiro', cat: 'financeiro', catNome: '💰 Financeiro', nome: 'Extrato financeiro', desc: 'Movimentações detalhadas com saldos bancários e dinheiro' },
  { id: 'fluxo_caixa_periodico', cat: 'financeiro', catNome: '💰 Financeiro', nome: 'Fluxo de caixa periódico', desc: 'Entradas, saídas e saldo projetado dia a dia' },
  { id: 'fluxo_financeiro', cat: 'financeiro', catNome: '💰 Financeiro', nome: 'Fluxo financeiro', desc: 'Contas a receber vs a pagar consolidadas no mês' },
  { id: 'dre', cat: 'financeiro', catNome: '💰 Financeiro', nome: 'DRE - Demonstrativo de Resultado', desc: 'Receita líquida, custos de peças e mão de obra, margem e lucro' },
  { id: 'inadimplencia', cat: 'financeiro', catNome: '💰 Financeiro', nome: 'Inadimplência & Títulos Vencidos', desc: 'Duplicatas e boletos em atraso por faixa de dias' },

  // Operacional / Pátio
  { id: 'os_periodo', cat: 'patio', catNome: '🚛 Operação & Pátio Pesado', nome: 'Ordens de Serviço por Período', desc: 'Relatório completo de OSs abertas, em execução e finalizadas' },
  { id: 'produtividade_mecanicos', cat: 'patio', catNome: '🚛 Operação & Pátio Pesado', nome: 'Produtividade de Mecânicos', desc: 'Horas faturadas, serviços concluídos e comissões da equipe' },
  { id: 'ocupacao_boxes', cat: 'patio', catNome: '🚛 Operação & Pátio Pesado', nome: 'Ocupação & Giro de Boxes', desc: 'Taxa de utilização dos 8 boxes de linha pesada' },
  { id: 'tempo_permanencia', cat: 'patio', catNome: '🚛 Operação & Pátio Pesado', nome: 'Tempo Médio de Atendimento', desc: 'Permanência de frotas desde o checklist até a liberação' },

  // Vendas & Comercial
  { id: 'vendas_produtos', cat: 'vendas', catNome: '📦 Vendas & Comercial', nome: 'Detalhes dos produtos vendidos', desc: 'Vendas detalhadas por item de suspensão, molas e freio' },
  { id: 'vendas_vendedor', cat: 'vendas', catNome: '📦 Vendas & Comercial', nome: 'Vendas por Vendedor / Consultor', desc: 'Ranking de faturamento por consultor comercial' },
  { id: 'curva_abc', cat: 'vendas', catNome: '📦 Vendas & Comercial', nome: 'Curva ABC de Peças e Serviços', desc: 'Classificação 80/15/5 dos itens de maior impacto no faturamento' },
  { id: 'devolucoes_garantias', cat: 'vendas', catNome: '📦 Vendas & Comercial', nome: 'Devoluções e Garantias', desc: 'Índice de retrabalho e peças substituídas em garantia' },

  // Compras & Estoque
  { id: 'compras_detalhadas', cat: 'estoque', catNome: '🏭 Estoque & Compras', nome: 'Compras detalhadas de Fornecedores', desc: 'Entrada de notas, fornecedores pesados e histórico de preços' },
  { id: 'posicao_estoque', cat: 'estoque', catNome: '🏭 Estoque & Compras', nome: 'Posição Atual de Estoque', desc: 'Inventário completo, estoque mínimo e valor total imobilizado' },
  { id: 'necessidade_reposicao', cat: 'estoque', catNome: '🏭 Estoque & Compras', nome: 'Necessidade de Reposição', desc: 'Itens com estoque zerado ou abaixo do ponto de pedido' },
  { id: 'giro_almoxarifado', cat: 'estoque', catNome: '🏭 Estoque & Compras', nome: 'Giro de Itens Críticos', desc: 'Velocidade de saída de lâminas de mola, pinos e lonas' }
];

function toggleFavoritoRelatorio(id, ev) {
  if (ev) ev.stopPropagation();
  S.relatoriosFavoritos = S.relatoriosFavoritos || ['vendas_produtos', 'compras_detalhadas', 'dre', 'extrato_financeiro'];
  const idx = S.relatoriosFavoritos.indexOf(id);
  if (idx >= 0) {
    S.relatoriosFavoritos.splice(idx, 1);
    torrar('Relatório removido dos favoritos', 'neutro');
  } else {
    S.relatoriosFavoritos.push(id);
    torrar('Relatório adicionado aos favoritos ★', 'sucesso');
  }
  salvarLocal();
  render();
}

function selecionarRelatorio(id) {
  S.ui.relatorioAtivo = id;
  render();
}

function filtrarRelatoriosLista(termo) {
  S.ui.buscaRelatorios = termo || '';
  const container = document.getElementById('lista_relatorios_master');
  if (container) {
    container.innerHTML = renderListaRelatoriosMaster();
  }
}

function renderListaRelatoriosMaster() {
  S.relatoriosFavoritos = S.relatoriosFavoritos || ['vendas_produtos', 'compras_detalhadas', 'dre', 'extrato_financeiro'];
  const ativo = S.ui.relatorioAtivo || 'vendas_produtos';
  const busca = (S.ui.buscaRelatorios || '').toLowerCase().trim();

  // Favoritos
  const favoritos = CATALOGO_RELATORIOS.filter(r => S.relatoriosFavoritos.includes(r.id));
  
  // Categorias agrupadas
  const categorias = [
    { cat: 'financeiro', titulo: '💰 Financeiro' },
    { cat: 'patio', titulo: '🚛 Operação & Pátio Pesado' },
    { cat: 'vendas', titulo: '📦 Vendas & Comercial' },
    { cat: 'estoque', titulo: '🏭 Estoque & Compras' }
  ];

  let html = '';

  // Bloco de Favoritos em Vermelho
  if (favoritos.length) {
    const favFiltrados = favoritos.filter(r => !busca || r.nome.toLowerCase().includes(busca) || r.desc.toLowerCase().includes(busca));
    if (favFiltrados.length) {
      html += `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:8px;padding:12px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:12.5px;color:#b91c1c;margin-bottom:8px">
          <span style="font-size:14px">★</span> RELATÓRIOS FAVORITOS
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${favFiltrados.map(r => `
            <div onclick="selecionarRelatorio('${r.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:6px;cursor:pointer;background:${r.id === ativo ? '#ffffff' : 'transparent'};border:${r.id === ativo ? '1px solid #ef4444' : '1px solid transparent'};transition:all 0.15s ease">
              <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:${r.id === ativo ? '700' : '500'};color:${r.id === ativo ? '#991b1b' : '#334155'}">
                <span style="color:#ef4444">★</span>
                <span>${r.nome}</span>
              </div>
              <button onclick="toggleFavoritoRelatorio('${r.id}', event)" title="Remover favorito" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px">✕</button>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
  }

  // Acordeões por Categoria
  categorias.forEach(c => {
    const itens = CATALOGO_RELATORIOS.filter(r => r.cat === c.cat && (!busca || r.nome.toLowerCase().includes(busca) || r.desc.toLowerCase().includes(busca)));
    if (!itens.length) return;

    html += `
    <div style="margin-bottom:12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:12.5px;color:#1e293b;display:flex;align-items:center;justify-content:space-between">
        <span>${c.titulo}</span>
        <span style="font-size:11px;color:#64748b;background:#e2e8f0;padding:1px 6px;border-radius:10px">${itens.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;padding:4px">
        ${itens.map(r => {
          const isAtivo = r.id === ativo;
          const isFav = S.relatoriosFavoritos.includes(r.id);
          return `
          <div onclick="selecionarRelatorio('${r.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:6px;cursor:pointer;margin:2px 0;background:${isAtivo ? 'var(--brand-primary-light, #eff6ff)' : 'transparent'};border-left:${isAtivo ? '3px solid var(--brand-primary, #2563eb)' : '3px solid transparent'};transition:all 0.15s ease">
            <div style="flex:1;min-width:0;padding-right:6px">
              <div style="font-size:12.5px;font-weight:${isAtivo ? '700' : '500'};color:${isAtivo ? 'var(--brand-primary, #2563eb)' : '#1e293b'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${r.nome}
              </div>
            </div>
            <button onclick="toggleFavoritoRelatorio('${r.id}', event)" title="${isFav ? 'Remover favorito' : 'Favoritar'}" style="background:none;border:none;cursor:pointer;color:${isFav ? '#ef4444' : '#cbd5e1'};font-size:14px;padding:2px">
              ${isFav ? '★' : '☆'}
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  return html;
}

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

function viewRelatorios() {
  const ativo = S.ui.relatorioAtivo || 'vendas_produtos';

  return `
  <!-- CENTRAL DE RELATÓRIOS MASTER-DETAIL -->
  <div style="display:grid;grid-template-columns:300px 1fr;gap:18px;align-items:start">
    <!-- COLUNA ESQUERDA (MASTER): BUSCA + FAVORITOS + ACORDEÕES -->
    <div>
      <div class="card" style="padding:14px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05);margin-bottom:14px">
        <label style="display:block;font-size:11.5px;font-weight:700;color:#334155;margin-bottom:6px">BUSCAR RELATÓRIO:</label>
        <div style="position:relative">
          <input type="text" id="busca_relatorios_input" class="campo-texto" placeholder="Digite para filtrar..." value="${esc(S.ui.buscaRelatorios || '')}" oninput="filtrarRelatoriosLista(this.value)" style="width:100%;height:36px;font-size:12.5px;padding-left:32px">
          <span style="position:absolute;left:10px;top:9px;color:#94a3b8;font-size:14px">🔍</span>
        </div>
      </div>

      <div id="lista_relatorios_master">
        ${renderListaRelatoriosMaster()}
      </div>
    </div>

    <!-- COLUNA DIREITA (DETAIL): RELATÓRIO SELECIONADO -->
    <div>
      ${renderConteudoRelatorio(ativo)}

      <!-- BLOCO COMPLEMENTAR: BACKUP, RESTAURAÇÃO E ASSISTENTE DE MIGRAÇÃO -->
      <div class="card card-p" style="margin-top:18px;border:1px solid #cbd5e1">
        <div class="entre" style="margin-bottom:6px">
          <div style="font-weight:700;font-size:15px;color:#0f172a">Backup do Banco de Dados & Assistente de Migração</div>
          <span class="selo selo-executando" style="font-size:11px">Pronto para Produção</span>
        </div>
        <div class="mini" style="margin-bottom:14px">Exporte a base em formato JSON nativo ou acesse o assistente de importação de dados externos.</div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
            <b style="font-size:13px;color:#0f172a">Backup Geral (.JSON)</b>
            <div class="mini" style="margin-top:2px;margin-bottom:8px">Salvaguarda completa offline de clientes, peças e financeiro.</div>
            <button class="btn btn-secundario" data-act="exportar-backup-json" style="font-size:12px;padding:6px 12px;width:100%">
              ${ico('download', 14)} Baixar Backup JSON
            </button>
          </div>

          <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
            <b style="font-size:13px;color:#0f172a">Fechamento de Caixa</b>
            <div class="mini" style="margin-top:2px;margin-bottom:8px">Impressão física para conferência e prestação de contas.</div>
            <button class="btn btn-secundario" data-act="imprimir-fechamento-caixa" style="font-size:12px;padding:6px 12px;width:100%">
              ${ico('imprimir', 14)} Imprimir Caixa
            </button>
          </div>

          <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
            <b style="font-size:13px;color:#0f172a">Central de Migração</b>
            <div class="mini" style="margin-top:2px;margin-bottom:8px">Importe planilhas de clientes e estoque de outros sistemas.</div>
            <button class="btn btn-primario" data-act="abrir-importador-sistemas" style="font-size:12px;padding:6px 12px;width:100%">
              ${ico('upload', 14)} Abrir Assistente
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* =====================================================================
   FUNÇÕES DE EXPORTAÇÃO CSV
===================================================================== */
function csvSafe(val) {
  if (val == null) return '';
  let s = String(val);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportarCSV(tipo) {
  let csv = '', nomeArquivo = '';

  if (tipo === 'os') {
    nomeArquivo = `patio_ordens_servico_${hoje()}.csv`;
    csv = 'Numero;Data Abertura;Status;Placa;Modelo;Cliente;Mecanico;Servicos (R$);Pecas (R$);Desconto (R$);Total (R$)\n';
    (S.os || []).forEach(o => {
      const v = V(o.vei), c = C(o.cli);
      const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
      const total = totOS(o);
      csv += `${o.num};"${o.abertura}";"${ST[o.st].r}";${csvSafe(v.placa)};${csvSafe(v.modelo)};${csvSafe(c.nome)};${csvSafe(o.mec || '')};${totServ.toFixed(2)};${totPec.toFixed(2)};${(o.desc || 0).toFixed(2)};${total.toFixed(2)}\n`;
    });
  } else if (tipo === 'pecas') {
    nomeArquivo = `patio_estoque_pecas_${hoje()}.csv`;
    csv = 'Codigo;Descricao;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Localizacao;Fornecedor\n';
    (S.pecas || []).forEach(p => {
      csv += `${csvSafe(p.cod)};${csvSafe(p.nome)};${csvSafe(p.un || 'un')};${p.qtd};${p.min};${p.custo.toFixed(2)};${p.venda.toFixed(2)};${csvSafe(p.loc || '')};${csvSafe(p.forn || '')}\n`;
    });
  } else if (tipo === 'financeiro') {
    nomeArquivo = `patio_movimentacoes_caixa_${hoje()}.csv`;
    csv = 'Data;Tipo;Descricao;Categoria;Forma;Valor (R$);Conciliado\n';
    (S.movimentos || []).forEach(m => {
      csv += `"${m.data}";"${m.tipo}";${csvSafe(m.desc)};${csvSafe(m.cat || 'Geral')};${csvSafe(m.forma || '')};${m.valor.toFixed(2)};${m.conc ? 'Sim' : 'Nao'}\n`;
    });
  } else if (tipo === 'clientes') {
    nomeArquivo = `patio_clientes_${hoje()}.csv`;
    csv = 'Razao Social;Fantasia;CNPJ_CPF;Telefone;Contato;Cidade;UF;Prazo (dias)\n';
    (S.clientes || []).forEach(c => {
      csv += `${csvSafe(c.nome)};${csvSafe(c.fantasia || '')};${csvSafe(c.doc || '')};${csvSafe(c.fone || '')};${csvSafe(c.contato || '')};${csvSafe(c.cidade || '')};${csvSafe(c.uf || '')};${c.prazo || 0}\n`;
    });
  }

  baixarArquivo('\uFEFF' + csv, nomeArquivo, 'text/csv;charset=utf-8;');
  torrar(`Relatório exportado: ${nomeArquivo}`);
}

function exportarBackupJSON() {
  const dados = JSON.stringify(S, null, 2);
  const nome = `backup_patio_crm_${hoje()}_${Date.now()}.json`;
  baixarArquivo(dados, nome, 'application/json');
  torrar('Backup completo baixado com sucesso!');
}

function baixarArquivo(conteudo, nome, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =====================================================================
   CENTRAL DE MIGRAÇÃO & IMPORTAÇÃO DE OUTROS SISTEMAS
===================================================================== */
window._dadosMigracao = null;

// Parser CSV universal resiliente com auto-detecção de delimitador
function parseCSVUniversal(texto) {
  if (!texto || typeof texto !== 'string') return { headers: [], rows: [] };
  // Remove BOM UTF-8 se presente
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);

  const primeiraLinha = texto.split(/\r?\n/)[0] || '';
  const pontovirgulas = (primeiraLinha.match(/;/g) || []).length;
  const virgulas = (primeiraLinha.match(/,/g) || []).length;
  const tabs = (primeiraLinha.match(/\t/g) || []).length;
  const pipes = (primeiraLinha.match(/\|/g) || []).length;

  let sep = ';';
  if (tabs > pontovirgulas && tabs > virgulas) sep = '\t';
  else if (virgulas > pontovirgulas && virgulas > pipes) sep = ',';
  else if (pipes > pontovirgulas && pipes > virgulas) sep = '|';

  const linhas = [];
  let linhaAtual = [];
  let campoAtual = '';
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const proximo = texto[i + 1];

    if (dentroAspas) {
      if (c === '"') {
        if (proximo === '"') {
          campoAtual += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campoAtual += c;
      }
    } else {
      if (c === '"') {
        dentroAspas = true;
      } else if (c === sep) {
        linhaAtual.push(campoAtual.trim());
        campoAtual = '';
      } else if (c === '\r') {
        // ignora carriage return
      } else if (c === '\n') {
        linhaAtual.push(campoAtual.trim());
        if (linhaAtual.some(col => col.length > 0)) {
          linhas.push(linhaAtual);
        }
        linhaAtual = [];
        campoAtual = '';
      } else {
        campoAtual += c;
      }
    }
  }

  if (campoAtual.length > 0 || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual.trim());
    if (linhaAtual.some(col => col.length > 0)) {
      linhas.push(linhaAtual);
    }
  }

  if (linhas.length === 0) return { headers: [], rows: [] };

  const headers = linhas[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows = [];

  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i];
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

// Helpers de normalização
function normalizarNumero(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).replace(/R\$\s?/gi, '').trim();
  if (s.includes(',') && s.includes('.')) {
    // Ex: 1.250,50 -> 1250.50
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // Ex: 1250,50 -> 1250.50
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizarData(val) {
  if (!val) return '';
  const s = String(val).trim();
  // Formato DD/MM/YYYY ou DD-MM-YYYY
  const mBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mBR) {
    const dia = mBR[1].padStart(2, '0');
    const mes = mBR[2].padStart(2, '0');
    const ano = mBR[3];
    return `${ano}-${mes}-${dia}`;
  }
  // Formato YYYY-MM-DD
  const mISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (mISO) {
    const ano = mISO[1];
    const mes = mISO[2].padStart(2, '0');
    const dia = mISO[3].padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  return s.slice(0, 10);
}

function limparChaveHeader(h) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sem acentos
    .replace(/[^a-z0-9]/g, ''); // sem pontuações ou espaços
}

function detectarEntidadeCSV(headers) {
  const norm = headers.map(limparChaveHeader);
  const tem = (termos) => termos.some(t => norm.some(h => h.includes(t)));

  if (tem(['placa', 'chassi', 'renavam', 'carroceria'])) return 'veiculos';
  if (tem(['estoque', 'preco', 'custo', 'venda', 'ncm', 'sku', 'cfop', 'peca'])) return 'pecas';
  if (tem(['servico', 'maodeobra', 'iss', 'horas'])) return 'servicos';
  if (tem(['vencimento', 'pagar', 'receber', 'despesa', 'receita', 'contas'])) return 'contas';
  if (tem(['fornecedor', 'vendor', 'supplier'])) return 'fornecedores';
  if (tem(['cliente', 'razao', 'fantasia', 'cpf', 'cnpj', 'doc', 'contato'])) return 'clientes';
  if (tem(['os', 'ordem', 'mecanico', 'queixa', 'defeito'])) return 'os';

  return 'clientes'; // fallback
}

// Analisador Universal de Dados Importados (JSON ou CSV)
function normalizarDadosExternos(texto, nomeArquivo) {
  const ext = (nomeArquivo || '').split('.').pop().toLowerCase();
  const resultado = {
    tipoDetectado: 'desconhecido',
    formatoOrigem: ext === 'json' ? 'JSON' : 'CSV/Texto',
    dados: {
      clientes: [],
      veiculos: [],
      pecas: [],
      servicos: [],
      fornecedores: [],
      contas: [],
      os: []
    }
  };

  if (ext === 'json') {
    let parsed;
    try { parsed = JSON.parse(texto); } catch (e) { throw new Error('Arquivo JSON inválido ou corrompido.'); }

    if (Array.isArray(parsed)) {
      // Array avulso de itens
      if (parsed.length === 0) throw new Error('O arquivo JSON está vazio.');
      const primeiro = parsed[0] || {};
      const chaves = Object.keys(primeiro).map(limparChaveHeader);
      const tem = (termos) => termos.some(t => chaves.some(h => h.includes(t)));

      let ent = 'clientes';
      if (tem(['placa'])) ent = 'veiculos';
      else if (tem(['estoque', 'custo', 'venda', 'ncm', 'cod'])) ent = 'pecas';
      else if (tem(['servico', 'iss', 'horas'])) ent = 'servicos';
      else if (tem(['fornecedor'])) ent = 'fornecedores';
      else if (tem(['vencimento', 'pagar', 'receber'])) ent = 'contas';

      resultado.tipoDetectado = `Lista de ${ent.toUpperCase()}`;
      resultado.dados[ent] = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Objeto com coleções completas
      resultado.tipoDetectado = 'Backup Completo de Sistema';

      // Clientes
      const rawCli = parsed.clientes || parsed.clients || parsed.customers || parsed.contatos || [];
      resultado.dados.clientes = rawCli.map(c => ({
        id: c.id || uid('c'),
        nome: c.nome || c.razao_social || c.razao || c.razaoSocial || c.client_name || c.cliente || c.name || 'Cliente Sem Nome',
        fantasia: c.fantasia || c.nome_fantasia || c.trade_name || '',
        doc: (c.doc || c.cnpj || c.cpf || c.documento || c.document || '').replace(/[^\d\.\-\/]/g, ''),
        fone: (c.fone || c.telefone || c.celular || c.whatsapp || c.phone || c.tel || '').replace(/\D/g, ''),
        email: c.email || c.e_mail || c.mail || '',
        contato: c.contato || c.responsavel || '',
        prazo: parseInt(c.prazo || c.prazo_dias || 0, 10) || 0,
        ie: c.ie || c.inscricao_estadual || '',
        endereco: c.endereco || c.rua || c.logradouro || '',
        cidade: c.cidade || c.municipio || c.city || '',
        uf: (c.uf || c.estado || c.state || '').toUpperCase().slice(0, 2),
        cep: c.cep || '',
        optin: c.optin !== false,
        bloqueado: !!c.bloqueado
      }));

      // Veículos
      const rawVei = parsed.veiculos || parsed.vehicles || parsed.frota || parsed.caminhoes || [];
      resultado.dados.veiculos = rawVei.map(v => ({
        id: v.id || uid('v'),
        cli: v.cli || v.cliente_id || '',
        placa: (v.placa || v.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        marca: v.marca || v.brand || 'Caminhão',
        modelo: v.modelo || v.model || 'Pesado',
        ano: String(v.ano || v.year || ''),
        km: normalizarNumero(v.km || v.quilometragem || v.odometer),
        tipo: v.tipo || v.tipo_veiculo || 'Cavalo Mecânico'
      }));

      // Peças / Estoque
      const rawPec = parsed.pecas || parsed.parts || parsed.produtos || parsed.products || parsed.estoque || [];
      resultado.dados.pecas = rawPec.map(p => ({
        id: p.id || uid('p'),
        cod: p.cod || p.codigo || p.sku || p.referencia || ('P-' + Date.now().toString().slice(-4)),
        nome: p.nome || p.descricao || p.description || p.item || 'Item de Peça',
        un: p.un || p.unidade || 'un',
        qtd: normalizarNumero(p.qtd || p.quantidade || p.estoque || p.saldo || p.stock),
        min: normalizarNumero(p.min || p.estoque_minimo || p.minimo || 1),
        custo: normalizarNumero(p.custo || p.preco_custo || p.valor_custo || p.cost),
        venda: normalizarNumero(p.venda || p.preco_venda || p.preco || p.price),
        loc: p.loc || p.localizacao || p.prateleira || '',
        forn: p.forn || p.fornecedor || '',
        ncm: p.ncm || '',
        cfop: p.cfop || '5102',
        cest: p.cest || '',
        origem: p.origem || '0 - Nacional'
      }));

      // Serviços
      const rawSrv = parsed.servicos || parsed.services || [];
      resultado.dados.servicos = rawSrv.map(s => ({
        id: s.id || uid('s'),
        nome: s.nome || s.descricao || s.servico || 'Serviço Mecânico',
        valor: normalizarNumero(s.valor || s.preco || s.preco_venda),
        horas: normalizarNumero(s.horas || s.tempo || 1),
        iss_cod: s.iss_cod || '14.01',
        iss_aliq: normalizarNumero(s.iss_aliq || 5),
        cnae: s.cnae || '4520-0/01'
      }));

      // Fornecedores
      const rawForn = parsed.fornecedores || parsed.suppliers || [];
      resultado.dados.fornecedores = rawForn.map(f => ({
        id: f.id || uid('f'),
        nome: f.nome || f.razao_social || f.fornecedor || 'Fornecedor',
        fantasia: f.fantasia || '',
        doc: (f.doc || f.cnpj || '').replace(/[^\d\.\-\/]/g, ''),
        fone: (f.fone || f.telefone || '').replace(/\D/g, ''),
        email: f.email || '',
        contato: f.contato || '',
        cidade: f.cidade || '',
        uf: (f.uf || '').toUpperCase().slice(0, 2)
      }));

      // Contas a Pagar / Receber
      const rawContas = parsed.contas || parsed.bills || parsed.financial || parsed.financeiro || [];
      resultado.dados.contas = rawContas.map(c => ({
        id: c.id || uid('ct'),
        tipo: (c.tipo || 'pagar').toLowerCase().includes('rec') ? 'receber' : 'pagar',
        desc: c.desc || c.descricao || 'Lançamento Financeiro',
        parte: c.parte || c.favorecido || c.cliente || c.fornecedor || 'Geral',
        valor: normalizarNumero(c.valor || c.valor_total),
        venc: normalizarData(c.venc || c.vencimento || c.data_vencimento || hoje()),
        pago: !!(c.pago || c.status === 'pago' || c.liquidado),
        cat: c.cat || c.categoria || 'Geral',
        doc: c.doc || c.numero_documento || ''
      }));

      // Ordens de Serviço
      const rawOS = parsed.os || parsed.ordens || parsed.work_orders || [];
      resultado.dados.os = rawOS.map(o => ({
        id: o.id || uid('os'),
        num: o.num || o.numero || (1000 + Math.floor(Math.random() * 9000)),
        box: o.box || null,
        vei: o.vei || o.veiculo_id || '',
        cli: o.cli || o.cliente_id || '',
        mec: o.mec || o.mecanico || 'Oficina',
        st: ['fila', 'aprovacao', 'executando', 'peca', 'finalizada'].includes(o.st) ? o.st : 'fila',
        abertura: normalizarData(o.abertura || o.data_abertura || hoje()),
        prev: normalizarData(o.prev || o.previsao || hoje()),
        km: normalizarNumero(o.km),
        queixa: o.queixa || o.problema || o.relato || '',
        servicos: Array.isArray(o.servicos) ? o.servicos : [],
        pecas: Array.isArray(o.pecas) ? o.pecas : [],
        desc: normalizarNumero(o.desc),
        pago: !!o.pago,
        formaPgto: o.formaPgto || '',
        obs: o.obs || ''
      }));

      // Se tiver configurações no arquivo, mantém
      if (parsed.cfg && typeof parsed.cfg === 'object') {
        resultado.dados.cfg = parsed.cfg;
      }
    }
  } else {
    // Processamento CSV / Planilha Tabular
    const { headers, rows } = parseCSVUniversal(texto);
    if (rows.length === 0) throw new Error('Nenhum registro encontrado na planilha enviada.');

    const entidade = detectarEntidadeCSV(headers);
    resultado.tipoDetectado = `Planilha de ${entidade.toUpperCase()}`;

    // Mapa de nomes de colunas normalizados
    const mapaH = {};
    headers.forEach(h => { mapaH[limparChaveHeader(h)] = h; });
    const getVal = (row, termos) => {
      for (const t of termos) {
        for (const k in mapaH) {
          if (k.includes(t)) {
            const v = row[mapaH[k]];
            if (v !== undefined && v !== '') return v;
          }
        }
      }
      return '';
    };

    if (entidade === 'clientes') {
      resultado.dados.clientes = rows.map(r => ({
        id: uid('c'),
        nome: getVal(r, ['razaosocial', 'razao', 'nome', 'cliente']) || 'Cliente Sem Nome',
        fantasia: getVal(r, ['fantasia', 'nomefantasia']),
        doc: getVal(r, ['cnpj', 'cpf', 'doc', 'documento']).replace(/[^\d\.\-\/]/g, ''),
        fone: getVal(r, ['telefone', 'fone', 'celular', 'whatsapp']).replace(/\D/g, ''),
        contato: getVal(r, ['contato', 'responsavel']),
        email: getVal(r, ['email', 'mail']),
        cidade: getVal(r, ['cidade', 'municipio']),
        uf: getVal(r, ['uf', 'estado']).toUpperCase().slice(0, 2),
        cep: getVal(r, ['cep']),
        endereco: getVal(r, ['endereco', 'rua', 'logradouro']),
        ie: getVal(r, ['inscricaoestadual', 'ie']),
        prazo: parseInt(getVal(r, ['prazo', 'prazodias']) || 0, 10) || 0,
        optin: true,
        bloqueado: false
      }));
    } else if (entidade === 'veiculos') {
      resultado.dados.veiculos = rows.map(r => {
        const placa = getVal(r, ['placa']).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cliInfo = getVal(r, ['cliente', 'proprietario', 'cnpj', 'cpf']);
        // Tenta achar cliente existente por nome ou doc
        let cliId = '';
        if (cliInfo && S && S.clientes) {
          const cliInfoLimpo = cliInfo.replace(/\D/g, '');
          const achado = S.clientes.find(c =>
            (cliInfoLimpo && (c.doc || '').replace(/\D/g, '') === cliInfoLimpo) ||
            ((c.nome || '').toLowerCase() === cliInfo.toLowerCase()) ||
            ((c.fantasia || '').toLowerCase() === cliInfo.toLowerCase())
          );
          if (achado) cliId = achado.id;
        }

        return {
          id: uid('v'),
          cli: cliId || (S && S.clientes && S.clientes[0] ? S.clientes[0].id : ''),
          _clienteRef: cliInfo,
          placa: placa || 'PLACA',
          modelo: getVal(r, ['modelo', 'descricao']) || 'Caminhão',
          marca: getVal(r, ['marca', 'fabricante']) || 'Pesado',
          ano: String(getVal(r, ['ano', 'anomodelo']) || ''),
          km: normalizarNumero(getVal(r, ['km', 'quilometragem'])),
          tipo: getVal(r, ['tipo', 'carroceria']) || 'Cavalo Mecânico'
        };
      });
    } else if (entidade === 'pecas') {
      resultado.dados.pecas = rows.map(r => ({
        id: uid('p'),
        cod: getVal(r, ['codigo', 'cod', 'sku', 'referencia']) || ('P-' + Date.now().toString().slice(-4)),
        nome: getVal(r, ['descricao', 'nome', 'item', 'peca']) || 'Peça Importada',
        un: getVal(r, ['unidade', 'un']) || 'un',
        qtd: normalizarNumero(getVal(r, ['estoqueatual', 'estoque', 'qtd', 'quantidade', 'saldo'])),
        min: normalizarNumero(getVal(r, ['estoqueminimo', 'min', 'minimo'])) || 1,
        custo: normalizarNumero(getVal(r, ['precocusto', 'custo', 'valorcusto'])),
        venda: normalizarNumero(getVal(r, ['precovenda', 'venda', 'preco', 'valorvenda'])),
        loc: getVal(r, ['localizacao', 'loc', 'prateleira']),
        forn: getVal(r, ['fornecedor', 'forn']),
        ncm: getVal(r, ['ncm']),
        cfop: getVal(r, ['cfop']) || '5102',
        cest: getVal(r, ['cest']),
        origem: '0 - Nacional'
      }));
    } else if (entidade === 'servicos') {
      resultado.dados.servicos = rows.map(r => ({
        id: uid('s'),
        nome: getVal(r, ['descricao', 'servico', 'nome']) || 'Serviço Mecânico',
        valor: normalizarNumero(getVal(r, ['precopadrao', 'preco', 'valor'])),
        horas: normalizarNumero(getVal(r, ['tempoestimado', 'horas', 'tempo'])) || 1,
        iss_cod: getVal(r, ['codigoiss', 'isscod']) || '14.01',
        iss_aliq: normalizarNumero(getVal(r, ['aliquotaiss', 'issaliq'])) || 5,
        cnae: '4520-0/01'
      }));
    } else if (entidade === 'contas') {
      resultado.dados.contas = rows.map(r => {
        const rawTipo = getVal(r, ['tipo']).toLowerCase();
        const tipo = rawTipo.includes('rec') ? 'receber' : 'pagar';
        const rawPago = getVal(r, ['pago', 'status']).toLowerCase();
        const pago = rawPago === 'sim' || rawPago === 'pago' || rawPago === 's' || rawPago === '1';

        return {
          id: uid('ct'),
          tipo,
          desc: getVal(r, ['descricao', 'desc']) || 'Título Financeiro',
          parte: getVal(r, ['favorecido', 'cliente', 'fornecedor', 'parte']) || 'Geral',
          valor: normalizarNumero(getVal(r, ['valor', 'valortotal'])),
          venc: normalizarData(getVal(r, ['vencimento', 'venc', 'datavencimento']) || hoje()),
          pago,
          cat: getVal(r, ['categoria', 'cat']) || 'Geral',
          doc: getVal(r, ['numerodocumento', 'documento', 'doc'])
        };
      });
    }
  }

  return resultado;
}

// Download de Templates em CSV com formato perfeito
function baixarTemplateCSV(tipo) {
  let csv = '', nome = '';
  if (tipo === 'clientes') {
    nome = 'modelo_importacao_clientes.csv';
    csv = 'Razao Social;Nome Fantasia;CNPJ_CPF;Telefone;Contato;Email;Cidade;UF;CEP;Endereco;Inscricao Estadual;Prazo Dias\n' +
      'TransRodrigues Transportes Ltda;TransRodrigues;23.456.789/0001-12;11987654321;Carlos Rodrigues;manutencao@transrodrigues.com.br;Campinas;SP;13050-000;Av. das Industrias, 1500;123.456.789.000;30\n' +
      'Expresso Vale Logistica;Expresso Vale;34.567.890/0001-23;19981234567;Marcos Silveira;frota@expressovale.com.br;Sumare;SP;13170-000;Rua dos Galpoes, 340;234.567.890.111;28\n';
  } else if (tipo === 'veiculos') {
    nome = 'modelo_importacao_veiculos.csv';
    csv = 'Placa;Modelo;Marca;Ano;Km Atual;Tipo;Cliente (Nome ou CNPJ)\n' +
      'BRA2E19;R 450 6x2 Highline;Scania;2021;382400;Cavalo Mecanico;TransRodrigues Transportes Ltda\n' +
      'QRF8J44;FH 540 6x4 Globetrotter;Volvo;2022;295100;Cavalo Mecanico;23.456.789/0001-12\n';
  } else if (tipo === 'pecas') {
    nome = 'modelo_importacao_pecas_estoque.csv';
    csv = 'Codigo;Descricao da Peca;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Localizacao;Fornecedor;NCM;CFOP\n' +
      'SCN-1875892;Jogo de Pastilhas de Freio Scania;jg;8;3;320.00;540.00;Prat. A-02;Fras-le Pecas;87083019;5102\n' +
      'VLV-2134567;Filtro Separador Racor Volvo FH;un;14;5;85.00;165.00;Prat. B-01;Donaldson Filtros;84212300;5102\n';
  } else if (tipo === 'servicos') {
    nome = 'modelo_importacao_servicos.csv';
    csv = 'Descricao do Servico;Preco Padrao (R$);Tempo Estimado (Horas);Codigo ISS;Aliquota ISS (%)\n' +
      'Revisao Completa de Freios;850.00;4.5;14.01;5.0\n' +
      'Troca de Kit de Embreagem;1600.00;8.0;14.01;5.0\n' +
      'Troca de Oleo e Filtros;380.00;1.5;14.01;5.0\n';
  } else if (tipo === 'contas') {
    nome = 'modelo_importacao_contas.csv';
    csv = 'Tipo (pagar/receber);Descricao;Favorecido ou Cliente;Valor;Vencimento (DD/MM/AAAA);Pago (sim/nao);Categoria;Numero Documento\n' +
      'receber;Manutencao Preventiva Frota;TransRodrigues Transportes Ltda;6850.00;25/09/2026;nao;Servicos & Pecas;NF-1040\n' +
      'pagar;Compra Valvulas EBS;ZF Wabco Brasil;5400.00;20/09/2026;nao;Fornecedores Pecas;NF-98412\n';
  }

  baixarArquivo('\uFEFF' + csv, nome, 'text/csv;charset=utf-8;');
  torrar(`Planilha modelo baixada: ${nome}`);
}

// Folha / Modal do Assistente de Importação & Migração
function abrirImportadorSistemas() {
  window._dadosMigracao = null;
  abrirFolha(folhaImportacaoSistemas);
}

function folhaImportacaoSistemas() {
  const mig = window._dadosMigracao;

  let previaHtml = '';
  let resumoCards = '';

  if (mig && mig.dados) {
    const d = mig.dados;
    const totais = [
      { label: 'Clientes', qtd: (d.clientes || []).length, icoName: 'cad' },
      { label: 'Veículos', qtd: (d.veiculos || []).length, icoName: 'patio' },
      { label: 'Peças Estoque', qtd: (d.pecas || []).length, icoName: 'pecas' },
      { label: 'Serviços', qtd: (d.servicos || []).length, icoName: 'cfg' },
      { label: 'Fornecedores', qtd: (d.fornecedores || []).length, icoName: 'cad' },
      { label: 'Ordens Serviço', qtd: (d.os || []).length, icoName: 'doc' },
      { label: 'Contas Fin.', qtd: (d.contas || []).length, icoName: 'fin' }
    ].filter(t => t.qtd > 0);

    resumoCards = `
    <div style="background:var(--aco-050);padding:14px;border-radius:10px;border:1px solid var(--aco-200);margin-bottom:16px">
      <div class="entre" style="margin-bottom:10px">
        <div>
          <b style="font-size:14px">📁 Arquivos Identificados (${mig.arquivos ? mig.arquivos.length : 1}):</b>
        </div>
        <button class="btn btn-secundario mini" data-act="cancelar-migracao" style="padding:4px 10px">
          ${ico('x', 12)} Limpar Seleção
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${(mig.arquivos || []).map(a => `
          <div class="entre" style="background:#fff;padding:8px 12px;border-radius:6px;border:1px solid var(--aco-200);font-size:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span>📄</span>
              <b>${esc(a.nome)}</b>
              <span class="mini" style="color:var(--aco-400)">(${(a.tamanho / 1024).toFixed(1)} KB)</span>
            </div>
            <div>
              <span class="selo selo-executando" style="font-size:10.5px">${esc(a.tipoDetectado)}</span>
              <span class="selo selo-finalizada" style="font-size:10.5px;margin-left:4px">${a.totalItens} registros</span>
            </div>
          </div>
        `).join('')}
      </div>

      ${mig.erros && mig.erros.length > 0 ? `
        <div style="background:var(--tijolo-fraco);color:var(--tijolo);padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:12px">
          <b>⚠️ Avisos na leitura:</b>
          ${mig.erros.map(e => `<div>• ${esc(e)}</div>`).join('')}
        </div>
      ` : ''}

      <div style="font-weight:700;font-size:13px;margin-bottom:8px">Total Consolidado Pronto para Importação:</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:8px">
        ${totais.map(t => `
          <div style="background:#fff;padding:10px;border-radius:8px;border:1px solid var(--aco-200);text-align:center">
            <div style="font-size:11px;color:var(--aco-500);display:flex;align-items:center;justify-content:center;gap:4px">
              ${ico(t.icoName, 12)} ${t.label}
            </div>
            <div style="font-size:20px;font-weight:800;color:var(--aco-900);margin-top:2px">${t.qtd}</div>
          </div>
        `).join('')}
      </div>
    </div>`;

    // Pré-visualização dos primeiros itens
    let itensAmostra = [];
    let tituloAmostra = '';
    if ((d.clientes || []).length > 0) {
      tituloAmostra = `Amostra de Clientes (primeiros 5 de ${d.clientes.length})`;
      itensAmostra = d.clientes.slice(0, 5).map(c => `<tr><td><b>${esc(c.nome)}</b><div class="mini">${esc(c.fantasia || '')}</div></td><td class="mono">${esc(c.doc || '—')}</td><td>${esc(c.fone || '—')}</td><td>${esc(c.cidade || '—')}/${esc(c.uf || '')}</td></tr>`);
    } else if ((d.veiculos || []).length > 0) {
      tituloAmostra = `Amostra de Veículos (primeiros 5 de ${d.veiculos.length})`;
      itensAmostra = d.veiculos.slice(0, 5).map(v => `<tr><td class="mono"><b>${esc(v.placa)}</b></td><td>${esc(v.modelo)}</td><td>${esc(v.marca)}</td><td>${esc(v.ano || '—')}</td></tr>`);
    } else if ((d.pecas || []).length > 0) {
      tituloAmostra = `Amostra de Peças (primeiras 5 de ${d.pecas.length})`;
      itensAmostra = d.pecas.slice(0, 5).map(p => `<tr><td class="mono"><b>${esc(p.cod)}</b></td><td>${esc(p.nome)}</td><td>${p.qtd} ${esc(p.un)}</td><td class="num">${brl(p.venda)}</td></tr>`);
    } else if ((d.servicos || []).length > 0) {
      tituloAmostra = `Amostra de Serviços (primeiros 5 de ${d.servicos.length})`;
      itensAmostra = d.servicos.slice(0, 5).map(s => `<tr><td><b>${esc(s.nome)}</b></td><td class="num">${brl(s.valor)}</td><td>${s.horas}h</td></tr>`);
    } else if ((d.contas || []).length > 0) {
      tituloAmostra = `Amostra de Contas (primeiras 5 de ${d.contas.length})`;
      itensAmostra = d.contas.slice(0, 5).map(c => `<tr><td><b>${esc(c.desc)}</b><div class="mini">${esc(c.parte)}</div></td><td><span class="selo ${c.tipo === 'receber' ? 'selo-finalizada' : 'selo-peca'}">${c.tipo.toUpperCase()}</span></td><td class="num">${brl(c.valor)}</td><td class="mono">${dataBR(c.venc)}</td></tr>`);
    }

    if (itensAmostra.length > 0) {
      previaHtml = `
      <div style="margin-bottom:16px">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">${tituloAmostra}</div>
        <div style="max-height:180px;overflow-y:auto;border:1px solid var(--aco-200);border-radius:8px">
          <table class="tabela" style="font-size:12px">
            <tbody>${itensAmostra.join('')}</tbody>
          </table>
        </div>
      </div>`;
    }
  }

  return `
  <div class="card card-p" style="max-width:720px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:800;color:var(--aco-900)">Central de Migração & Importação</h3>
        <div class="mini">Envio simultâneo de arquivos CSV e backups JSON para testes em produção</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    ${!mig ? `
      <!-- Área de Seleção de Arquivo (Suporte a múltiplos CSVs e JSON) -->
      <div style="border:2px dashed var(--petroleo);padding:35px 20px;border-radius:12px;text-align:center;background:var(--petroleo-fraco);margin-bottom:20px">
        <div style="color:var(--petroleo);margin-bottom:12px">${ico('upload', 42)}</div>
        <div style="font-weight:800;font-size:16px;margin-bottom:6px;color:var(--aco-900)">
          Selecione os Arquivos para Upload
        </div>
        <div class="mini" style="max-width:520px;margin:0 auto 18px auto;color:var(--aco-600);line-height:1.5">
          💡 <b>Envio simultâneo ativado:</b> você pode selecionar vários arquivos de uma só vez (ex: segure <kbd style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-weight:bold">Ctrl</kbd> e selecione <b>clientes.csv</b>, <b>veiculos.csv</b>, <b>pecas.csv</b> ou um backup <b>.json</b>).
        </div>
        <div style="display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap">
          <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:11px 24px;font-size:14px;font-weight:700;box-shadow:var(--sombra)">
            ${ico('doc', 16)} Escolher Arquivo(s) no Computador
            <input type="file" accept=".json,.csv,.txt" multiple data-act="arquivo-migracao-input" style="display:none" onchange="window._onMigracaoFileChange(this)">
          </label>
        </div>
      </div>

      <!-- Caixa de Modelos de Planilha -->
      <div style="background:var(--aco-050);padding:14px;border-radius:10px;border:1px solid var(--aco-200)">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:4px">Modelos Prontos para Preenchimento no Excel</div>
        <div class="mini" style="margin-bottom:12px">Baixe a planilha modelo correspondente, cole seus dados e importe diretamente acima:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="clientes" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Clientes
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="veiculos" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Veículos
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="pecas" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Peças/Estoque
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="servicos" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Serviços
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="contas" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Contas
          </button>
        </div>
      </div>
    ` : `
      <!-- Visualização dos Arquivos Carregados e Confirmação -->
      ${resumoCards}
      ${previaHtml}

      <!-- Opção de Modo de Importação -->
      <div style="background:#fff;padding:14px;border-radius:10px;border:1px solid var(--aco-200);margin-bottom:18px">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:10px">Selecione o Modo de Importação:</div>

        <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;cursor:pointer">
          <input type="radio" name="modo-importacao" value="mesclar" checked style="margin-top:3px">
          <div>
            <div style="font-weight:700;color:var(--petroleo)">Mesclar e Incrementar (Recomendado para Produção)</div>
            <div class="mini">Adiciona os novos registros e atualiza os existentes (sem apagar histórico de OSs, parametrização fiscal ou conexões WhatsApp).</div>
          </div>
        </label>

        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
          <input type="radio" name="modo-importacao" value="substituir" style="margin-top:3px">
          <div>
            <div style="font-weight:700;color:var(--tijolo)">Substituição Completa da Base</div>
            <div class="mini">Substitui integralmente os registros pelos arquivos importados. <b>Um backup de segurança do estado atual será baixado automaticamente antes de prosseguir.</b></div>
          </div>
        </label>
      </div>

      <!-- BLOCO DE CONFIRMAÇÃO EM GRANDE DESTAQUE COM O BOTÃO DE AÇÃO -->
      <div style="background:var(--verde-fraco);padding:18px;border-radius:10px;border:2px solid var(--verde);text-align:center;margin-bottom:16px">
        <div style="font-weight:800;font-size:16px;color:var(--verde);margin-bottom:4px">
          Tudo pronto para iniciar a importação!
        </div>
        <div class="mini" style="margin-bottom:14px;color:var(--aco-700)">
          Os dados dos arquivos foram analisados. Clique no botão abaixo para confirmar a seleção e gravar no sistema:
        </div>
        <button class="btn btn-primario" data-act="executar-importacao-confirmada" style="background:var(--verde);border-color:var(--verde);font-size:15px;font-weight:800;padding:12px 32px;box-shadow:0 4px 14px rgba(16, 185, 129, 0.4);cursor:pointer">
          ${ico('salvar', 16)} Confirmar Seleção e Iniciar Importação
        </button>
      </div>

      <!-- Botões de Apoio -->
      <div class="entre" style="gap:10px">
        <label class="btn btn-secundario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:8px 14px">
          ${ico('doc', 13)} Adicionar / Selecionar Outros Arquivos
          <input type="file" accept=".json,.csv,.txt" multiple data-act="arquivo-migracao-input" style="display:none" onchange="window._onMigracaoFileChange(this)">
        </label>
        <button class="btn btn-secundario" data-act="cancelar-migracao" style="font-size:12px;padding:8px 14px">
          Cancelar
        </button>
      </div>
    `}
  </div>`;
}

// Leitura de Múltiplos Arquivos de Migração (CSV / JSON simultâneos)
async function processarArquivosMigracao(fileList) {
  if (!fileList || !fileList.length) {
    torrar('Nenhum arquivo selecionado.');
    return;
  }
  const files = Array.from(fileList);
  torrar(`Lendo ${files.length} arquivo(s)...`);

  const dadosAcumulados = {
    clientes: [],
    veiculos: [],
    pecas: [],
    servicos: [],
    fornecedores: [],
    contas: [],
    os: []
  };

  const arquivosProcessados = [];
  const erros = [];

  for (const file of files) {
    try {
      const texto = await lerArquivoTexto(file);
      const res = normalizarDadosExternos(texto, file.name);

      let totalNeste = 0;
      for (const ent in res.dados) {
        if (Array.isArray(res.dados[ent]) && res.dados[ent].length > 0) {
          dadosAcumulados[ent].push(...res.dados[ent]);
          totalNeste += res.dados[ent].length;
        }
      }

      arquivosProcessados.push({
        nome: file.name,
        tamanho: file.size,
        tipoDetectado: res.tipoDetectado,
        formato: res.formatoOrigem,
        totalItens: totalNeste
      });
    } catch (err) {
      console.error(`[Migração] Erro ao ler arquivo ${file.name}:`, err);
      erros.push(`${file.name}: ${err.message}`);
    }
  }

  // Tenta vincular veículos sem cliente caso o cliente tenha vindo no mesmo lote de importação
  if (dadosAcumulados.veiculos.length > 0) {
    const todosClientes = [...(S.clientes || []), ...dadosAcumulados.clientes];
    dadosAcumulados.veiculos.forEach(v => {
      if (!v.cli && v._clienteRef) {
        const refLimpo = String(v._clienteRef).replace(/\D/g, '');
        const achado = todosClientes.find(c =>
          (refLimpo && (c.doc || '').replace(/\D/g, '') === refLimpo) ||
          ((c.nome || '').toLowerCase() === String(v._clienteRef).toLowerCase()) ||
          ((c.fantasia || '').toLowerCase() === String(v._clienteRef).toLowerCase())
        );
        if (achado) v.cli = achado.id;
      }
    });
  }

  window._dadosMigracao = {
    arquivos: arquivosProcessados,
    totalArquivos: arquivosProcessados.length,
    dados: dadosAcumulados,
    erros
  };

  renderFolha();
  torrar(`✅ ${arquivosProcessados.length} arquivo(s) analisado(s)!`);
}

function lerArquivoTexto(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file, 'UTF-8');
  });
}

window._onMigracaoFileChange = function(input) {
  if (input && input.files && input.files.length > 0) {
    abrirFolha(folhaImportacaoSistemas);
    processarArquivosMigracao(input.files);
    input.value = '';
  }
};

// Mantido para compatibilidade com qualquer chamada anterior
function processarArquivoMigracao(arquivo) {
  if (arquivo) processarArquivosMigracao([arquivo]);
}

// Execução da Importação
async function executarImportacaoConfirmada() {
  if (!window._dadosMigracao || !window._dadosMigracao.dados) {
    torrar('Nenhum dado selecionado para importação.');
    return;
  }

  const radioModo = document.querySelector('input[name="modo-importacao"]:checked');
  const modo = radioModo ? radioModo.value : 'mesclar';
  const dados = window._dadosMigracao.dados;

  // Se for substituição completa, gera snapshot de segurança antes
  if (modo === 'substituir') {
    torrar('Gerando snapshot de segurança antes de substituir...');
    exportarBackupJSON();
    await new Promise(r => setTimeout(r, 400));
  }

  try {
    await flushSave();
    if (pendingLocalSave || saving) throw new Error('Resolva as alterações pendentes antes de importar.');
    const res = await fetch('/api/backup/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados, modo, versao: S.versao || 0 })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const resposta = await res.json();

    // Após a importação, lê o estado confirmado; não reaplica o backup localmente.
    const refresh = await fetch('/api/estado');
    if (!refresh.ok) throw new Error('Importação concluída, mas a atualização da tela falhou. Recarregue a página.');
    const novoEstado = await refresh.json();
    if (!novoEstado.os) throw new Error('Estado retornado inválido.');
    S = { ...novoEstado, ui: S.ui };
    armazem.base = PatioSync.clone(novoEstado);
    try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}
    fecharFolha();
    render();

    const st = resposta.stats || {};
    const detalhes = [
      st.clientes?.inseridos ? `${st.clientes.inseridos} clientes` : null,
      st.veiculos?.inseridos ? `${st.veiculos.inseridos} veículos` : null,
      st.pecas?.inseridos ? `${st.pecas.inseridos} peças` : null,
      st.servicos?.inseridos ? `${st.servicos.inseridos} serviços` : null,
      st.contas?.inseridos ? `${st.contas.inseridos} contas` : null
    ].filter(Boolean).join(', ');

    alert(`✅ Importação Concluída com Sucesso!\n\nModo aplicado: ${modo === 'mesclar' ? 'Mesclagem / Incremento' : 'Substituição Completa'}\nRegistros inseridos: ${detalhes || 'Dados integrados'}`);
    torrar('Base de dados atualizada com sucesso!');
  } catch (err) {
    console.error('[Migração] Erro ao gravar importação:', err);
    alert('Erro ao persistir importação no servidor: ' + err.message);
  } finally {
    window._dadosMigracao = null;
  }
}

// Mantido para compatibilidade com qualquer chamada anterior
function restaurarBackupJSON(arquivo) {
  processarArquivoMigracao(arquivo);
}

/* =====================================================================
   FECHAMENTO DIÁRIO DE CAIXA (IMPRESSÃO)
===================================================================== */
function imprimirFechamentoCaixa() {
  const dH = hoje();
  const movsHoje = (S.movimentos || []).filter(m => m.data === dH);
  const entradas = movsHoje.filter(m => m.tipo === 'entrada');
  const saidas = movsHoje.filter(m => m.tipo === 'saida');
  const totEntradas = soma(entradas, m => m.valor);
  const totSaidas = soma(saidas, m => m.valor);
  const saldoFinal = saldoCaixa();

  const logoRaw = S?.cfg?.identidadeVisual?.logo || S?.cfg?.identidadeVisual?.imagemInstitucional;
  const logoUrl = (typeof logoRaw === 'string') ? logoRaw : (logoRaw?.url || null);
  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;max-width:160px;object-fit:contain;margin-bottom:8px" alt="Logo"><br>` : '';

  const janela = window.open('', '_blank');
  if (!janela) return;

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Fechamento Diário de Caixa — ${dataBRfull(dH)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12.5px; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #94a3b8; border-radius: 6px; }
      .topo { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th { background: #f1f5f9; text-align: left; padding: 6px; border-bottom: 1px solid #cbd5e1; }
      td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
      .totais { background: #f8fafc; padding: 10px; border-radius: 6px; margin-top: 14px; border: 1px solid #cbd5e1; }
      .tot-linha { display: flex; justify-content: space-between; margin-bottom: 4px; }
      .ass { margin-top: 40px; display: flex; justify-content: space-between; }
      .campo-ass { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="topo">
      ${logoHtml}
      <h2 style="margin:0">${esc(S.cfg.empresa)}</h2>
      <div style="font-size:14px;font-weight:bold;margin-top:4px">FECHAMENTO DIÁRIO DE CAIXA</div>
      <div>Data de Referência: ${dataBRfull(dH)} às ${horaBR()}</div>
    </div>

    <div style="font-weight:bold;margin-bottom:4px">ENTRADAS DO DIA (${entradas.length})</div>
    <table>
      <thead><tr><th>Descrição</th><th>Forma</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${entradas.map(e => `<tr><td>${esc(e.desc)}</td><td>${esc(e.forma || 'Pix')}</td><td style="text-align:right">${brl(e.valor)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center">Nenhuma entrada hoje</td></tr>'}
      </tbody>
    </table>

    <div style="font-weight:bold;margin-bottom:4px">SAÍDAS DO DIA (${saidas.length})</div>
    <table>
      <thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${saidas.map(s => `<tr><td>${esc(s.desc)}</td><td>${esc(s.cat || 'Geral')}</td><td style="text-align:right">${brl(s.valor)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center">Nenhuma saída hoje</td></tr>'}
      </tbody>
    </table>

    <div class="totais">
      <div class="tot-linha"><span>(+) Total de Entradas:</span><b style="color:#10b981">${brl(totEntradas)}</b></div>
      <div class="tot-linha"><span>(−) Total de Saídas:</span><b style="color:#ef4444">${brl(totSaidas)}</b></div>
      <div class="tot-linha" style="font-size:14px;font-weight:bold;border-top:1px solid #94a3b8;padding-top:6px;margin-top:6px">
        <span>(=) SALDO FINAL CONSOLIDADO EM CAIXA:</span>
        <span>${brl(saldoFinal)}</span>
      </div>
    </div>

    <div class="ass">
      <div class="campo-ass">Responsável pelo Caixa</div>
      <div class="campo-ass">Gerência Financeira</div>
    </div>

    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}
