/**
 * Módulo Orquestrador e Fachada de Relatórios: relatorios.js
 * Pátio-CRM — Central de Relatórios Enterprise e Exportações
 * Arquitetura Modular (< 350 linhas).
 *
 * Submódulos especializados em js/modules/:
 * - relatorios_conteudo_views.js: views e tabelas dos relatórios
 * - migracao_parser_csv.js: parser e validador de CSV universal
 * - migracao_normalizador.js: normalização e heurísticas para sistemas legados
 * - migracao_importador_ui.js: modal e drawer de importação de dados
 * - migracao_processamento.js: download de templates e processamento de arquivos
 */

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

