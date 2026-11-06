/**
 * Módulo: estoque_catalogo_ui.js
 * Pátio-CRM — Catálogo, Filtros, Indicadores e Tabela do Almoxarifado
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function calcularSaldosPeca(p) {
    const fisico = Number(p.qtd ?? p.estoqueFisico ?? 0);
    let reservado = Number(p.reservado ?? 0);
    if (Array.isArray(S.os)) {
      for (const o of S.os) {
        if (o.st === 'cancelada' || o.st === 'finalizada') continue;
        for (const item of (o.pecas || [])) {
          if ((item.pecaId === p.id || item.id === p.id) && (item.st === 'reservada' || item.status === 'reservada')) {
            reservado += Number(item.qtd || 0);
          }
        }
      }
    }
    const disponivel = Math.max(0, fisico - reservado);
    return { fisico, reservado, disponivel };
  }

  function viewEstoque() {
    // Garante dados mockados realistas para o setor pesado se vazio
    if (!S.pecas || S.pecas.length === 0) {
      S.pecas = [
        { id: 'p1', cod: 'MOL-SC-01', nome: 'Feixe de Molas Scania R440 Traseiro Reforçado', cat: 'Molas', custo: 1350.00, venda: 2100.00, qtd: 8, min: 2, un: 'feixe', loc: 'Rua A-01' },
        { id: 'p2', cod: 'FRE-VO-02', nome: 'Jogo de Lonas de Freio Master Volvo FH Heavy Duty', cat: 'Freio', custo: 260.00, venda: 450.00, qtd: 24, min: 6, un: 'jogo', loc: 'Prat. B-03' },
        { id: 'p3', cod: 'TAM-VO-01', nome: 'Tambor de Freio Dianteiro Volvo FH/FM 10 Furos', cat: 'Freio', custo: 420.00, venda: 700.00, qtd: 0, min: 2, un: 'peça', loc: 'Rua C-02' },
        { id: 'p4', cod: 'EMB-MB-01', nome: 'Kit Embreagem Sachs 430mm Mercedes Actros / Axor', cat: 'Embreagem', custo: 2800.00, venda: 4200.00, qtd: 3, min: 1, un: 'kit', loc: 'Box Central' },
        { id: 'p5', cod: 'BUC-SC-04', nome: 'Bucha de Bronze do Eixo Tensor Scania 30mm', cat: 'Componentes Embuchamento de Eixo', custo: 85.00, venda: 162.50, qtd: 16, min: 4, un: 'un', loc: 'Gaveta D-12' },
        { id: 'p6', cod: 'SUS-MB-09', nome: 'Amortecedor Dianteiro Pesado Monroe Mercedes Axor', cat: 'Suspensão', custo: 320.00, venda: 580.00, qtd: 6, min: 2, un: 'par', loc: 'Rua A-04' },
        { id: 'p7', cod: 'CAR-SP-03', nome: 'Cruzeta do Cardan Spicer Heavy Duty Série 1810', cat: 'Cardan', custo: 180.00, venda: 340.00, qtd: 12, min: 3, un: 'un', loc: 'Prat. E-01' }
      ];
    }

    if (!S.servicos || S.servicos.length === 0) {
      S.servicos = [
        { id: 'srv1', cod: 'SRV-01', nome: 'Alinhamento e Geometria a Laser Eixo Dianteiro e Tração', cat: 'Suspensão', preco: 450.00, tempo: '2h' },
        { id: 'srv2', cod: 'SRV-02', nome: 'Substituição de Kit de Embreagem Pesada e Rolamento', cat: 'Embreagem', preco: 1200.00, tempo: '5h' },
        { id: 'srv3', cod: 'SRV-03', nome: 'Arqueamento e Troca de Lâminas de Feixe de Molas', cat: 'Molas', preco: 680.00, tempo: '3h30' },
        { id: 'srv4', cod: 'SRV-04', nome: 'Rebitagem de Lonas e Retífica de Tambores de Freio', cat: 'Freio', preco: 380.00, tempo: '2h' },
        { id: 'srv5', cod: 'SRV-05', nome: 'Embuchamento Completo de Eixo Dianteiro Manga de Eixo', cat: 'Componentes Embuchamento de Eixo', preco: 950.00, tempo: '4h' }
      ];
    }

    const pecas = S.pecas || [];
    const servicos = S.servicos || [];
    const subAba = S.ui.subAbaEstoque || 'produtos';
    const filtro = S.ui.filtroEstoque || 'todos';
    const busca = (S.ui.buscaEstoque || '').toLowerCase().trim();
    const linhasPorPagina = S.ui.linhasPorPaginaEstoque || 100;

    // Cálculos de KPIs de Estoque
    let totalFisico = 0;
    let totalReservado = 0;
    let totalDisponivel = 0;
    let valorTotalCusto = 0;
    let valorTotalVenda = 0;
    let pecasCriticasCount = 0;

    const pecasComSaldos = pecas.map(p => {
      const saldos = calcularSaldosPeca(p);
      totalFisico += saldos.fisico;
      totalReservado += saldos.reservado;
      totalDisponivel += saldos.disponivel;
      valorTotalCusto += (saldos.fisico * (p.custo || 0));
      valorTotalVenda += (saldos.fisico * (p.venda || 0));
      const isCritico = saldos.disponivel <= (p.min || 1);
      if (isCritico) pecasCriticasCount++;
      return { ...p, saldos, isCritico };
    });

    // Filtragem Almoxarifado
    let filtradasPecas = pecasComSaldos;
    if (filtro === 'critico') {
      filtradasPecas = filtradasPecas.filter(p => p.isCritico);
    } else if (filtro === 'reservado') {
      filtradasPecas = filtradasPecas.filter(p => p.saldos.reservado > 0);
    }

    if (busca) {
      filtradasPecas = filtradasPecas.filter(p => 
        (p.nome || '').toLowerCase().includes(busca) ||
        (p.cod || '').toLowerCase().includes(busca) ||
        (p.cat || '').toLowerCase().includes(busca) ||
        (p.loc || '').toLowerCase().includes(busca)
      );
    }

    let filtradosServicos = servicos;
    if (busca) {
      filtradosServicos = filtradosServicos.filter(s =>
        (s.nome || '').toLowerCase().includes(busca) ||
        (s.cod || '').toLowerCase().includes(busca) ||
        (s.cat || '').toLowerCase().includes(busca)
      );
    }

    return `
    <!-- KPIs de Estoque estilo eGestor -->
    <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:14px;margin-bottom:18px">
      <!-- Card 1: Saldo Disponível -->
      <div class="card card-p" style="border-bottom:4px solid #10b981;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
        <div class="entre" style="margin-bottom:6px">
          <span class="mini" style="font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:0.04em">Disponível p/ Aplicação</span>
          ${ico('check', 16)}
        </div>
        <div style="font-size:24px;font-weight:800;color:#10b981;line-height:1.2;font-family:var(--mono)">${totalDisponivel} un</div>
        <div class="mini" style="color:#64748b;margin-top:4px">Físico: <b>${totalFisico}</b> | Reservado OS: <b>${totalReservado}</b></div>
      </div>

      <!-- Card 2: Valor Total em Estoque (Custo) -->
      <div class="card card-p" style="border-bottom:4px solid #3b82f6;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
        <div class="entre" style="margin-bottom:6px">
          <span class="mini" style="font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.04em">Capital Parado (Custo)</span>
          ${ico('grana', 16)}
        </div>
        <div style="font-size:24px;font-weight:800;color:#2563eb;line-height:1.2;font-family:var(--mono)">${brl(valorTotalCusto)}</div>
        <div class="mini" style="color:#64748b;margin-top:4px">Preço Venda Projetado: <b>${brl(valorTotalVenda)}</b></div>
      </div>

      <!-- Card 3: Itens com Saldo Crítico -->
      <div class="card card-p" style="border-bottom:4px solid ${pecasCriticasCount > 0 ? '#ef4444' : '#10b981'};box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
        <div class="entre" style="margin-bottom:6px">
          <span class="mini" style="font-weight:700;color:${pecasCriticasCount > 0 ? '#b91c1c' : '#047857'};text-transform:uppercase;letter-spacing:0.04em">Estoque Crítico / Mínimo</span>
          ${ico('alerta', 16)}
        </div>
        <div style="font-size:24px;font-weight:800;color:${pecasCriticasCount > 0 ? '#ef4444' : '#10b981'};line-height:1.2;font-family:var(--mono)">${pecasCriticasCount} itens</div>
        <div class="mini" style="color:#64748b;margin-top:4px">Abaixo do estoque mínimo estipulado</div>
      </div>

      <!-- Card 4: Serviços Especializados Ativos -->
      <div class="card card-p" style="border-bottom:4px solid #8b5cf6;box-shadow:0 2px 6px rgba(0,0,0,0.06);background:#fff">
        <div class="entre" style="margin-bottom:6px">
          <span class="mini" style="font-weight:700;color:#6d28d9;text-transform:uppercase;letter-spacing:0.04em">Tabela de Serviços / Mão de Obra</span>
          ${ico('ferramenta', 16)}
        </div>
        <div style="font-size:24px;font-weight:800;color:#7c3aed;line-height:1.2;font-family:var(--mono)">${servicos.length} ativos</div>
        <div class="mini" style="color:#64748b;margin-top:4px">Preços tabelados por tipo de caminhão</div>
      </div>
    </div>

    <!-- NAVEGAÇÃO DE SUB-ABAS DE ESTOQUE ESTILO EGESTOR -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:2px solid var(--borda-suave);padding-bottom:2px">
      <div style="display:flex;gap:4px">
        <button class="btn ${subAba === 'produtos' ? 'btn-primario' : 'btn-neutro'}" onclick="S.ui.subAbaEstoque='produtos';render()" style="font-weight:700;font-size:13px;border-radius:6px 6px 0 0">
          📦 Produtos & Peças (${pecas.length})
        </button>
        <button class="btn ${subAba === 'servicos' ? 'btn-primario' : 'btn-neutro'}" onclick="S.ui.subAbaEstoque='servicos';render()" style="font-weight:700;font-size:13px;border-radius:6px 6px 0 0">
          🛠️ Serviços Cadastrados (${servicos.length})
        </button>
        <button class="btn ${subAba === 'ajustes' ? 'btn-primario' : 'btn-neutro'}" onclick="S.ui.subAbaEstoque='ajustes';render()" style="font-weight:700;font-size:13px;border-radius:6px 6px 0 0">
          ⚖️ Ajustes de Inventário
        </button>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" onclick="folhaXML()" style="gap:6px;display:flex;align-items:center;font-size:12.5px">
          ${ico('upload', 14)} 📄 Importar NF-e (XML)
        </button>
        <button class="btn btn-secundario" onclick="folhaSimulacaoOCR()" style="gap:6px;display:flex;align-items:center;font-size:12.5px">
          ${ico('qr', 14)} 📷 Leitor OCR Danfe
        </button>
        <button class="btn btn-primario" onclick="folhaNovaPeca()" style="gap:6px;display:flex;align-items:center;font-size:12.5px">
          ${ico('mais', 14)} + Cadastrar Peça
        </button>
      </div>
    </div>

    ${subAba === 'produtos' ? `
      <!-- BARRA DE PESQUISA E FILTROS RÁPIDOS -->
      <div class="card card-p" style="margin-bottom:14px;padding:12px 16px;background:#f8fafc">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div style="display:flex;gap:10px;align-items:center;flex:1;max-width:500px">
            <input type="text" class="campo-texto" placeholder="Buscar por código, descrição, categoria ou prateleira..." value="${esc(S.ui.buscaEstoque || '')}" oninput="S.ui.buscaEstoque=this.value;render()" style="width:100%;height:36px;font-size:13px">
          </div>

          <div style="display:flex;gap:8px;align-items:center">
            <span class="mini" style="font-weight:700;color:#64748b">Filtro:</span>
            <button class="btn-chip ${filtro === 'todos' ? 'ativo' : ''}" onclick="S.ui.filtroEstoque='todos';render()">Todos (${pecas.length})</button>
            <button class="btn-chip ${filtro === 'critico' ? 'ativo' : ''}" onclick="S.ui.filtroEstoque='critico';render()" style="${filtro === 'critico' ? 'background:#ef4444;color:#fff' : 'color:#b91c1c'}">⚠️ Crítico (${pecasCriticasCount})</button>
            <button class="btn-chip ${filtro === 'reservado' ? 'ativo' : ''}" onclick="S.ui.filtroEstoque='reservado';render()">🔒 Reservados em OS (${totalReservado})</button>
          </div>
        </div>
      </div>

      <!-- TABELA ESTILO EGESTOR DE PEÇAS & ALMOXARIFADO -->
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tabela-responsiva">
          <table class="tabela" style="width:100%;font-size:12.5px;border-collapse:collapse">
            <thead>
              <tr style="background:#f1f5f9;border-bottom:1px solid #cbd5e1;color:#334155;text-align:left">
                <th style="padding:10px 14px;width:120px">Código / Ref</th>
                <th style="padding:10px 14px">Descrição da Peça / Produto</th>
                <th style="padding:10px 14px;width:160px">Categoria / Sistema</th>
                <th style="padding:10px 14px;width:100px">Localização</th>
                <th style="padding:10px 14px;text-align:right;width:100px">Custo Unit.</th>
                <th style="padding:10px 14px;text-align:right;width:110px">Venda Unit.</th>
                <th style="padding:10px 14px;text-align:center;width:90px">Físico</th>
                <th style="padding:10px 14px;text-align:center;width:90px">Reservado</th>
                <th style="padding:10px 14px;text-align:center;width:100px">Disponível</th>
                <th style="padding:10px 14px;text-align:center;width:80px">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filtradasPecas.length === 0 ? `
                <tr>
                  <td colspan="10" style="text-align:center;padding:32px;color:#94a3b8">
                    Nenhuma peça encontrada com os filtros selecionados.
                  </td>
                </tr>
              ` : filtradasPecas.map(p => `
                <tr style="border-bottom:1px solid #e2e8f0;background:${p.isCritico ? '#fef2f2' : '#ffffff'}">
                  <td style="padding:10px 14px;font-family:var(--mono);font-weight:700;color:#0f172a">
                    ${esc(p.cod || '—')}
                  </td>
                  <td style="padding:10px 14px">
                    <div style="font-weight:700;color:#0f172a">${esc(p.nome)}</div>
                    <div class="mini" style="color:#64748b">Unidade: ${esc(p.un || 'un')} | Estoque Mínimo: ${p.min || 1}</div>
                  </td>
                  <td style="padding:10px 14px">
                    <span class="badge-vivid badge-info" style="font-size:10.5px">${esc(p.cat || 'Geral')}</span>
                  </td>
                  <td style="padding:10px 14px;color:#475569">
                    <span style="font-family:var(--mono);background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11.5px">${esc(p.loc || 'Pátio')}</span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;font-family:var(--mono);color:#475569">
                    ${brl(p.custo)}
                  </td>
                  <td style="padding:10px 14px;text-align:right;font-family:var(--mono);font-weight:700;color:#0f172a">
                    ${brl(p.venda)}
                  </td>
                  <td style="padding:10px 14px;text-align:center;font-weight:700;color:#334155">
                    ${p.saldos.fisico}
                  </td>
                  <td style="padding:10px 14px;text-align:center;color:#b45309;font-weight:700">
                    ${p.saldos.reservado > 0 ? `🔒 ${p.saldos.reservado}` : '0'}
                  </td>
                  <td style="padding:10px 14px;text-align:center">
                    <span class="badge-vivid ${p.isCritico ? 'badge-alerta' : 'badge-sucesso'}" style="font-size:11.5px;font-weight:800;padding:3px 8px">
                      ${p.saldos.disponivel} ${esc(p.un || 'un')}
                    </span>
                  </td>
                  <td style="padding:10px 14px;text-align:center">
                    <button class="btn btn-neutro btn-pequeno" onclick="S.ui.pecaAberta='${p.id}';folhaPeca()" style="padding:4px 8px" title="Editar Peça">
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : subAba === 'servicos' ? `
      <!-- TABELA DE SERVIÇOS E MÃO DE OBRA -->
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tabela-responsiva">
          <table class="tabela" style="width:100%;font-size:12.5px;border-collapse:collapse">
            <thead>
              <tr style="background:#f1f5f9;border-bottom:1px solid #cbd5e1;color:#334155;text-align:left">
                <th style="padding:10px 14px;width:120px">Código</th>
                <th style="padding:10px 14px">Descrição do Serviço Especializado</th>
                <th style="padding:10px 14px;width:180px">Especialidade / Sistema</th>
                <th style="padding:10px 14px;width:140px;text-align:center">Tempo Padrão</th>
                <th style="padding:10px 14px;text-align:right;width:130px">Valor de Tabela</th>
              </tr>
            </thead>
            <tbody>
              ${filtradosServicos.map(s => `
                <tr style="border-bottom:1px solid #e2e8f0">
                  <td style="padding:10px 14px;font-family:var(--mono);font-weight:700;color:#0f172a">${esc(s.cod || '—')}</td>
                  <td style="padding:10px 14px;font-weight:700;color:#0f172a">${esc(s.nome)}</td>
                  <td style="padding:10px 14px"><span class="badge-vivid badge-info" style="font-size:10.5px">${esc(s.cat || 'Geral')}</span></td>
                  <td style="padding:10px 14px;text-align:center;color:#64748b">⏱️ ${esc(s.tempo || '1h')}</td>
                  <td style="padding:10px 14px;text-align:right;font-family:var(--mono);font-weight:800;color:#10b981">${brl(s.preco)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : `
      <!-- ABA DE AJUSTES E INVENTÁRIO -->
      <div class="card card-p">
        <div style="font-weight:700;font-size:15px;margin-bottom:8px">Ajustes Manuais de Estoque & Balanço Físico</div>
        <div class="mini" style="margin-bottom:16px;color:#64748b">Lance quebras, perdas, garantias de peças devolvidas ou ajuste de contagem de inventário.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:14px">
          <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">Entrada Avulsa / Bonificação</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:12px">Adiciona saldo sem vincular a XML de compra</div>
            <button class="btn btn-primario" onclick="abrirModalAjusteEstoque('entrada')" style="font-size:12px">+ Registrar Entrada</button>
          </div>
          <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">Baixa / Perda / Garantia</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:12px">Subtrai saldo para itens avariados ou enviados a fabricante</div>
            <button class="btn btn-secundario" onclick="abrirModalAjusteEstoque('saida')" style="font-size:12px;color:#ef4444">- Registrar Baixa</button>
          </div>
          <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">Inventário / Balanço Geral</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:12px">Importe planilha CSV ou faça contagem física guiada</div>
            <button class="btn btn-neutro" onclick="torrar('Planilha de inventário disponível para download.','neutro')" style="font-size:12px">📋 Baixar Planilha</button>
          </div>
        </div>
      </div>
    `}
    `;
  }

  // Exportações explícitas para window e globalThis
  global.calcularSaldosPeca = calcularSaldosPeca;
  global.viewEstoque = viewEstoque;

  if (typeof window !== 'undefined') {
    window.calcularSaldosPeca = calcularSaldosPeca;
    window.viewEstoque = viewEstoque;
  }
})(typeof window !== 'undefined' ? window : globalThis);
