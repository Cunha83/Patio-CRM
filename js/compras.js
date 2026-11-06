/* =====================================================================
   PÁTIO CRM — MÓDULO DE COMPRAS & ENTRADA DE NOTAS (XML SEFAZ)
   INSPIRADO NO MODELO eGestor ERP COM ATUALIZAÇÃO DE ESTOQUE E CONTAS A PAGAR
   Fachada Modular (< 350 linhas)
===================================================================== */

function viewCompras() {
  // Garante dados mockados realistas para o setor de veículos pesados se vazio
  if (!S.compras || S.compras.length === 0) {
    S.compras = [
      { id: 'c201', codigo: 'C-201', fornecedorNome: 'Suspentech Indústria de Peças para Suspensão Pesada', fornecedorDoc: '05.123.456/0001-88', num: '18492', serie: '1', data: hoje(), situacao: 'Concluída', total: 12450.00, temFinanceiroPendente: false, itens: [{ cod: 'MOL-SC-01', nome: 'Mola Parabólica Scania Dianteira', qtd: 6, valor: 1450.00 }, { cod: 'PIN-03', nome: 'Pino de Mola Scania 30mm Cementado', qtd: 12, valor: 125.00 }] },
      { id: 'c202', codigo: 'C-202', fornecedorNome: 'Fras-le Componentes de Fricção e Freios S.A.', fornecedorDoc: '88.765.432/0001-99', num: '94201', serie: '1', data: hoje(), situacao: 'Concluída', total: 8790.00, temFinanceiroPendente: true, itens: [{ cod: 'LON-FH-01', nome: 'Jogo Lona Freio Volvo FH/FM Standard', qtd: 10, valor: 520.00 }, { cod: 'REM-02', nome: 'Rebites de Alumínio para Lona Pacote 500un', qtd: 4, valor: 95.00 }] },
      { id: 'c203', codigo: 'C-203', fornecedorNome: 'Cindumel Molas e Peças Automotivas', fornecedorDoc: '61.222.333/0001-44', num: '10542', serie: '2', data: hoje(), situacao: 'Pendente', total: 6400.00, temFinanceiroPendente: true, itens: [{ cod: 'LAM-05', nome: 'Lâmina Mestra Traseira Mercedes Axor', qtd: 4, valor: 850.00 }, { cod: 'ABR-08', nome: 'Grampo / Abraçadeira de Mola Aço 1045', qtd: 8, valor: 150.00 }] }
    ];
  }

  const compras = S.compras || [];
  const filtro = S.ui.filtroCompras || 'todas';
  const busca = (S.ui.buscaCompras || '').toLowerCase().trim();
  const subAbaCompras = S.ui.subAbaCompras || 'compras';

  // Filtragem
  let filtradas = compras;
  if (filtro !== 'todas') {
    filtradas = filtradas.filter(c => (c.situacao || 'Concluída').toLowerCase() === filtro.toLowerCase());
  }
  if (busca) {
    filtradas = filtradas.filter(c => 
      (c.codigo || c.id || '').toLowerCase().includes(busca) ||
      (c.fornecedorNome || '').toLowerCase().includes(busca) ||
      (c.num || '').toLowerCase().includes(busca)
    );
  }

  // KPIs de Compras
  const totalMes = compras.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
  const pendentes = compras.filter(c => (c.situacao || 'Concluída').toLowerCase() === 'pendente' || (c.situacao || '').toLowerCase() === 'em espera').length;
  const concluidas = compras.filter(c => (c.situacao || 'Concluída').toLowerCase() === 'concluída' || (c.situacao || '').toLowerCase() === 'finalizada').length;

  return `
  <!-- KPIs de Compras estilo eGestor -->
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('caixa', 14)} Total Compras do Mês</div>
      <div class="v">${brlCurto(totalMes)}</div>
      <div class="d">${compras.length} compras faturadas</div>
    </div>
    <div class="kpi ${pendentes > 0 ? 'alerta' : 'bom'}">
      <div class="r">${ico('relogio', 14)} Compras Pendentes</div>
      <div class="v">${pendentes}</div>
      <div class="d">Aguardando entrada física / conferência</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Concluídas</div>
      <div class="v">${concluidas}</div>
      <div class="d">Estoque atualizado e faturadas</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('cad', 14)} Fornecedores Homologados</div>
      <div class="v">${(S.fornecedores || []).length || 8}</div>
      <div class="d">Parceiros comerciais cadastrados</div>
    </div>
  </div>

  <!-- FRENTE 3: FOLDER TABS NO TOPO -->
  <div class="folder-tabs">
    <button class="folder-tab ${subAbaCompras === 'compras' ? 'ativo' : ''}" onclick="S.ui.subAbaCompras='compras';render()">
      ${ico('caixa', 15)} <span>COMPRAS & ENTRADA DE NOTAS</span>
    </button>
    <button class="folder-tab ${subAbaCompras === 'pedidos' ? 'ativo' : ''}" onclick="S.ui.subAbaCompras='pedidos';render()">
      ${ico('doc', 15)} <span>PEDIDOS DE COMPRA</span>
    </button>
    <button class="folder-tab ${subAbaCompras === 'xml' ? 'ativo' : ''}" onclick="S.ui.subAbaCompras='xml';render()">
      ${ico('upload', 15)} <span>HISTÓRICO XML SEFAZ</span>
    </button>
  </div>

  <!-- BARRA DE AÇÕES EM LOTE & NAVEGADOR DE PERÍODO -->
  <div class="barra-acoes-lote">
    <div class="barra-acoes-grupo">
      <input type="file" id="xml-compra-input" accept=".xml,text/xml" style="display:none" onchange="processarXMLCompra(this.files[0])">
      
      <button class="btn btn-primario" onclick="abrirModalNovaCompra()" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
        ${ico('mais', 14)} + Nova Compra
      </button>
      <button class="btn btn-neutro" onclick="document.getElementById('xml-compra-input').click()" style="font-weight:600;display:inline-flex;align-items:center;gap:6px" title="Importar XML SEFAZ da NF-e do Fornecedor">
        ${ico('upload', 14)} Carregar XML (NF-e)
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteCompras('duplicar')" title="Duplicar compra selecionada">
        ${ico('doc', 14)} Duplicar
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteCompras('imprimir')" title="Imprimir espelho de compra">
        ${ico('impressora', 14)} Imprimir
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteCompras('excluir')" style="color:#ef4444" title="Excluir selecionadas">
        ${ico('lixo', 14)} Excluir
      </button>
    </div>

    <!-- Navegador de Período -->
    <div class="navegador-periodo">
      <button class="btn-periodo-nav" onclick="torrar('Mês anterior','neutro')" title="Mês anterior">◀</button>
      <span>Mês Atual: Outubro / 2026</span>
      <button class="btn-periodo-nav" onclick="torrar('Próximo mês','neutro')" title="Próximo mês">▶</button>
    </div>
  </div>

  <!-- Barra de Pesquisa e Filtros -->
  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input type="text" class="campo-texto" placeholder="🔍 Buscar por Fornecedor, Nº da Nota ou Código..." 
             value="${esc(S.ui.buscaCompras || '')}" 
             oninput="S.ui.buscaCompras=this.value;render()" 
             style="width:340px;height:36px;font-size:13px;background:#ffffff">

      <div class="chips" style="display:inline-flex;gap:4px">
        <button class="chip ${filtro === 'todas' ? 'ativo' : ''}" onclick="S.ui.filtroCompras='todas';render()">Todas (${compras.length})</button>
        <button class="chip ${filtro === 'pendente' ? 'ativo' : ''}" onclick="S.ui.filtroCompras='pendente';render()">Pendentes (${pendentes})</button>
        <button class="chip ${filtro === 'concluída' ? 'ativo' : ''}" onclick="S.ui.filtroCompras='concluída';render()">Concluídas (${concluidas})</button>
      </div>
    </div>
  </div>

  <!-- Tabela Densa de Alto Contraste -->
  <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <div class="tabela-responsiva">
      <table class="tabela-densa">
        <thead>
          <tr>
            <th style="width:36px;text-align:center">
              <input type="checkbox" onchange="document.querySelectorAll('.chk-compra').forEach(c=>c.checked=this.checked)" style="cursor:pointer">
            </th>
            <th style="width:110px">Cód</th>
            <th>Fornecedor</th>
            <th style="width:130px">Nota Fiscal</th>
            <th style="width:110px">Data</th>
            <th style="width:120px;text-align:center">Situação</th>
            <th style="width:130px;text-align:right">Total (R$)</th>
            <th style="width:130px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtradas.length === 0 ? `
            <tr>
              <td colspan="8" style="text-align:center;padding:32px;color:var(--aco-500)">
                Nenhuma compra encontrada. Clique em <b>"Importar XML"</b> para dar entrada na NF-e de peças ou em <b>"+ Nova Compra"</b>.
              </td>
            </tr>
          ` : filtradas.map(c => {
            const sit = (c.situacao || 'Concluída');
            const isConcluida = sit.toLowerCase() === 'concluída' || sit.toLowerCase() === 'finalizada';
            const badgeClass = isConcluida ? 'badge-sucesso' : 'badge-alerta';
            const temPendente = c.temFinanceiroPendente !== false;

            return `
            <tr>
              <td style="text-align:center">
                <input type="checkbox" class="chk-compra" value="${c.id}" style="cursor:pointer">
              </td>
              <td class="mono">
                <div style="display:inline-flex;align-items:center;gap:4px">
                  <span style="font-weight:700">#${esc(c.codigo || c.id || '')}</span>
                  ${temPendente ? `<span title="Contas a pagar pendente" style="color:#ef4444;font-weight:800;font-size:12px;cursor:help">$</span>` : ''}
                </div>
              </td>
              <td>
                <div style="font-weight:700;color:#0f172a">${esc(c.fornecedorNome || 'Fornecedor Avulso')}</div>
                ${c.fornecedorDoc ? `<div class="mini mono" style="color:#64748b">CNPJ: ${esc(c.fornecedorDoc)}</div>` : ''}
              </td>
              <td class="mono" style="font-weight:700;color:#334155">${esc(c.num ? 'NF-e ' + c.num : 'Sem Nota')}</td>
              <td>${dataBR(c.data || hoje())}</td>
              <td style="text-align:center">
                <span class="badge-vivid ${badgeClass}">${isConcluida ? 'Concluída' : 'Pendente'}</span>
              </td>
              <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">${brl(c.total || 0)}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn btn-secundario" onclick="abrirDetalhesCompra('${c.id}')" style="padding:4px 8px;font-size:11px" title="Ver Detalhes">
                    ${ico('doc', 12)} Ver
                  </button>
                  ${!isConcluida ? `
                    <button class="btn btn-sucesso" onclick="darEntradaEstoqueCompra('${c.id}')" style="padding:4px 8px;font-size:11px" title="Concluir e Dar Entrada">
                      ${ico('check', 12)} Entrada
                    </button>
                  ` : ''}
                  <button class="btn-icone-perigo" onclick="excluirCompra('${c.id}')" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function acaoEmLoteCompras(acao) {
  const selecionados = Array.from(document.querySelectorAll('.chk-compra:checked')).map(el => el.value);
  if (selecionados.length === 0) {
    torrar('Selecione ao menos uma compra para a ação.', 'alerta');
    return;
  }
  if (acao === 'excluir') {
    if (confirm(`Deseja realmente excluir as ${selecionados.length} compras selecionadas?`)) {
      S.compras = (S.compras || []).filter(c => !selecionados.includes(c.id));
      salvarLocal();
      render();
      torrar(`${selecionados.length} compras excluídas com sucesso.`, 'sucesso');
    }
  } else if (acao === 'duplicar') {
    const original = (S.compras || []).find(c => c.id === selecionados[0]);
    if (original) {
      const novoId = 'c' + Date.now().toString().slice(-4);
      const copia = JSON.parse(JSON.stringify(original));
      copia.id = novoId;
      copia.codigo = 'C-' + Math.floor(100 + Math.random() * 900);
      copia.data = hoje();
      copia.situacao = 'Pendente';
      copia.temFinanceiroPendente = true;
      S.compras.unshift(copia);
      salvarLocal();
      render();
      torrar(`Compra #${original.codigo || original.id} duplicada com sucesso!`, 'sucesso');
    }
  } else if (acao === 'imprimir') {
    window.print();
  }
}

// Binds no escopo global
if (typeof window !== 'undefined') {
  window.viewCompras = viewCompras;
  window.acaoEmLoteCompras = acaoEmLoteCompras;
  window.processarXMLCompra = typeof processarXMLCompra !== 'undefined' ? processarXMLCompra : (window.processarXMLCompra || null);
  window.processarXmlNfe = window.processarXMLCompra;
  window.abrirModalNovaCompra = typeof abrirModalNovaCompra !== 'undefined' ? abrirModalNovaCompra : (window.abrirModalNovaCompra || null);
  window.folhaNovaCompra = typeof folhaNovaCompra !== 'undefined' ? folhaNovaCompra : (window.folhaNovaCompra || null);
  window.adicionarItemRascCompra = typeof adicionarItemRascCompra !== 'undefined' ? adicionarItemRascCompra : (window.adicionarItemRascCompra || null);
  window.atualizarItemRascCompra = typeof atualizarItemRascCompra !== 'undefined' ? atualizarItemRascCompra : (window.atualizarItemRascCompra || null);
  window.salvarNovaCompraConfirmada = typeof salvarNovaCompraConfirmada !== 'undefined' ? salvarNovaCompraConfirmada : (window.salvarNovaCompraConfirmada || null);
  window.abrirDetalhesCompra = typeof abrirDetalhesCompra !== 'undefined' ? abrirDetalhesCompra : (window.abrirDetalhesCompra || null);
  window.excluirCompra = typeof excluirCompra !== 'undefined' ? excluirCompra : (window.excluirCompra || null);
  window.darEntradaEstoqueCompra = typeof darEntradaEstoqueCompra !== 'undefined' ? darEntradaEstoqueCompra : (window.darEntradaEstoqueCompra || null);
}
if (typeof globalThis !== 'undefined') {
  globalThis.viewCompras = viewCompras;
  globalThis.acaoEmLoteCompras = acaoEmLoteCompras;
}
