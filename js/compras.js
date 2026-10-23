/* =====================================================================
   PÁTIO CRM — MÓDULO DE COMPRAS & ENTRADA DE NOTAS (XML SEFAZ)
   INSPIRADO NO MODELO eGestor ERP COM ATUALIZAÇÃO DE ESTOQUE E CONTAS A PAGAR
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
        ${ico('upload', 14)} Importar XML
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

/* =====================================================================
   IMPORTADOR DE XML SEFAZ (NF-e MODELO 55)
===================================================================== */
async function processarXMLCompra(arquivo) {
  if (!arquivo) return;
  if (typeof arquivo !== 'string' && arquivo.name && !arquivo.name.toLowerCase().endsWith('.xml')) {
    torrar('Selecione um arquivo XML de NF-e válido.', 'erro');
    return;
  }

  torrar('Lendo XML da NF-e...', 'neutro');

  try {
    const textoXML = typeof arquivo === 'string' ? arquivo : (arquivo && arquivo.text ? await arquivo.text() : '');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(textoXML, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      torrar('Arquivo XML inválido ou corrompido.', 'erro');
      return;
    }

    const getVal = (parent, tag) => {
      if (!parent) return '';
      const el = parent.getElementsByTagName(tag)[0];
      return el ? (el.textContent || '').trim() : '';
    };

    // 1. Dados da Identificação da Nota
    const ide = xmlDoc.getElementsByTagName('ide')[0];
    const nNF = getVal(ide, 'nNF') || 'S/N';
    const dhEmi = getVal(ide, 'dhEmi') || getVal(ide, 'dEmi') || hoje();
    const dataEmissao = dhEmi.substring(0, 10);

    // 2. Dados do Emitente (Fornecedor)
    const emit = xmlDoc.getElementsByTagName('emit')[0];
    const cnpjEmit = getVal(emit, 'CNPJ') || getVal(emit, 'CPF');
    const nomeEmit = getVal(emit, 'xNome') || 'Fornecedor XML';
    const fantEmit = getVal(emit, 'xFant') || nomeEmit;
    const enderEmit = emit ? emit.getElementsByTagName('enderEmit')[0] : null;
    const munEmit = getVal(enderEmit, 'xMun');
    const ufEmit = getVal(enderEmit, 'UF');
    const foneEmit = getVal(enderEmit, 'fone');

    // Vincula ou cria fornecedor em S.fornecedores
    S.fornecedores = S.fornecedores || [];
    let fornecedor = S.fornecedores.find(f => (cnpjEmit && f.doc === cnpjEmit) || f.nome.toLowerCase() === nomeEmit.toLowerCase());
    if (!fornecedor) {
      fornecedor = {
        id: uid('forn'),
        nome: nomeEmit,
        fantasia: fantEmit,
        doc: cnpjEmit,
        cidade: munEmit,
        uf: ufEmit,
        fone: foneEmit,
        contato: 'Importado via XML'
      };
      S.fornecedores.push(fornecedor);
    }

    // 3. Dados dos Itens / Produtos (<det>)
    const detList = xmlDoc.getElementsByTagName('det');
    const itensImportados = [];
    S.pecas = S.pecas || [];

    for (let i = 0; i < detList.length; i++) {
      const det = detList[i];
      const prod = det.getElementsByTagName('prod')[0];
      if (!prod) continue;

      const cProd = getVal(prod, 'cProd');
      const xProd = getVal(prod, 'xProd');
      const ncm = getVal(prod, 'NCM');
      const cfop = getVal(prod, 'CFOP');
      const uCom = getVal(prod, 'uCom') || 'un';
      const qCom = parseFloat(getVal(prod, 'qCom')) || 1;
      const vUnCom = parseFloat(getVal(prod, 'vUnCom')) || 0;
      const vProd = parseFloat(getVal(prod, 'vProd')) || (qCom * vUnCom);

      itensImportados.push({
        cod: cProd,
        nome: xProd,
        ncm,
        cfop,
        un: uCom,
        qtd: qCom,
        custo: vUnCom,
        total: vProd
      });

      // Vincula ao estoque existente ou cria nova peça
      let peca = S.pecas.find(p => (cProd && p.cod === cProd) || p.nome.toLowerCase() === xProd.toLowerCase());
      if (peca) {
        peca.qtd = (Number(peca.qtd) || 0) + qCom;
        peca.custo = vUnCom;
        peca.ncm = ncm || peca.ncm;
        peca.cfop = cfop || peca.cfop;
      } else {
        // Sugere categoria com base no nome
        let catSugerida = 'Suspensão';
        const nomeLower = xProd.toLowerCase();
        if (nomeLower.includes('mola')) catSugerida = 'Molas';
        else if (nomeLower.includes('freio') || nomeLower.includes('pastilha') || nomeLower.includes('lona') || nomeLower.includes('disco')) catSugerida = 'Freio';
        else if (nomeLower.includes('embreagem') || nomeLower.includes('disco embr')) catSugerida = 'Embreagem';
        else if (nomeLower.includes('bucha') || nomeLower.includes('eixo')) catSugerida = 'Embuchamento de Eixo';
        else if (nomeLower.includes('cardan') || nomeLower.includes('cruzeta')) catSugerida = 'Cardan';
        else if (nomeLower.includes('filtro') || nomeLower.includes('oleo') || nomeLower.includes('motor')) catSugerida = 'Motor';

        peca = {
          id: uid('p'),
          cod: cProd,
          nome: xProd,
          categoria: catSugerida,
          un: uCom,
          custo: vUnCom,
          venda: +(vUnCom * 1.5).toFixed(2), // Margem padrão de 50%
          qtd: qCom,
          min: 2,
          ncm,
          cfop
        };
        S.pecas.push(peca);
      }
    }

    // 4. Total da NF
    const totalEl = xmlDoc.getElementsByTagName('total')[0];
    const vNF = parseFloat(getVal(totalEl, 'vNF')) || itensImportados.reduce((acc, it) => acc + it.total, 0);

    // 5. Duplicatas / Contas a Pagar (<cobr><dup>)
    const dupList = xmlDoc.getElementsByTagName('dup');
    S.contasPagar = S.contasPagar || [];
    const duplicatasImportadas = [];

    if (dupList.length > 0) {
      for (let j = 0; j < dupList.length; j++) {
        const dup = dupList[j];
        const nDup = getVal(dup, 'nDup') || (j + 1);
        const dVenc = getVal(dup, 'dVenc') || hoje();
        const vDup = parseFloat(getVal(dup, 'vDup')) || (vNF / dupList.length);

        const conta = {
          id: uid('cp'),
          parte: fornecedor.nome,
          fornecedorId: fornecedor.id,
          desc: `NF-e ${nNF} - Parc. ${nDup}`,
          valor: vDup,
          venc: dVenc,
          tipo: 'pagar',
          st: 'pendente',
          origem: 'compra_xml'
        };
        S.contasPagar.push(conta);
        duplicatasImportadas.push(conta);
      }
    } else {
      // Se não houver duplicatas expressas, cria uma fatura a pagar com vencimento em 28 dias
      const dataVenc = new Date();
      dataVenc.setDate(dataVenc.getDate() + 28);
      const conta = {
        id: uid('cp'),
        parte: fornecedor.nome,
        fornecedorId: fornecedor.id,
        desc: `NF-e ${nNF} - Compra de Peças`,
        valor: vNF,
        venc: dataVenc.toISOString().substring(0, 10),
        tipo: 'pagar',
        st: 'pendente',
        origem: 'compra_xml'
      };
      S.contasPagar.push(conta);
      duplicatasImportadas.push(conta);
    }

    // 6. Registra a Compra
    S.compras = S.compras || [];
    const novaCompra = {
      id: uid('comp'),
      codigo: 'C' + (S.compras.length + 101),
      num: nNF,
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome,
      fornecedorDoc: fornecedor.doc,
      data: dataEmissao,
      total: vNF,
      itens: itensImportados,
      duplicatas: duplicatasImportadas,
      situacao: 'Finalizada',
      obs: 'Importado automaticamente via XML SEFAZ'
    };
    S.compras.unshift(novaCompra);

    salvar();
    render();

    torrar(`NF-e ${nNF} importada com sucesso! ${itensImportados.length} itens adicionados ao estoque.`, 'sucesso');
  } catch (err) {
    console.error('Erro ao processar XML de compra:', err);
    torrar('Erro ao processar arquivo XML: ' + err.message, 'erro');
  }
}

/* =====================================================================
   MODAL NOVA COMPRA (MANUAL)
===================================================================== */
function abrirModalNovaCompra() {
  S.ui.rascCompra = {
    fornecedorId: (S.fornecedores && S.fornecedores[0]?.id) || '',
    num: '',
    data: hoje(),
    itens: []
  };
  abrirFolha(folhaNovaCompra);
}

function folhaNovaCompra() {
  const r = S.ui.rascCompra || {};
  const fornecedores = S.fornecedores || [];
  const pecas = S.pecas || [];

  const totalCompra = (r.itens || []).reduce((acc, it) => acc + (it.qtd * it.custo), 0);

  return `
  <div class="card card-p" style="max-width:760px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700;margin:0">Nova Compra de Peças / Mercadorias</h3>
        <div class="mini" style="color:var(--aco-500)">Lançamento com entrada de estoque e geração de Contas a Pagar.</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <!-- Cabeçalho da Compra -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="mini" style="font-weight:700">Fornecedor</label>
        <select class="campo-texto" onchange="S.ui.rascCompra.fornecedorId=this.value" style="width:100%;height:36px;font-size:13px">
          <option value="">— Selecione o Fornecedor —</option>
          ${fornecedores.map(f => `<option value="${f.id}" ${r.fornecedorId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="mini" style="font-weight:700">Número da Nota Fiscal</label>
        <input type="text" class="campo-texto" placeholder="Ex: 84920" value="${esc(r.num || '')}" oninput="S.ui.rascCompra.num=this.value" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Data da Compra</label>
        <input type="date" class="campo-texto" value="${r.data || hoje()}" onchange="S.ui.rascCompra.data=this.value" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <!-- Itens Comprados -->
    <div style="background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:8px;padding:12px;margin-bottom:16px">
      <div class="entre" style="margin-bottom:10px">
        <span style="font-weight:700;font-size:13px">Itens da Compra (${(r.itens || []).length})</span>
        <button class="btn btn-secundario btn-pequeno" onclick="adicionarItemRascCompra()">+ Adicionar Peça</button>
      </div>

      ${(r.itens || []).length === 0 ? `
        <div class="mini" style="text-align:center;padding:16px;color:var(--aco-500)">Nenhum item adicionado à compra ainda.</div>
      ` : `
        <table class="tabela" style="margin:0">
          <thead>
            <tr>
              <th>Peça / Produto</th>
              <th style="width:90px;text-align:center">Qtd</th>
              <th style="width:120px;text-align:right">Custo Unit.</th>
              <th style="width:120px;text-align:right">Subtotal</th>
              <th style="width:50px;text-align:center"></th>
            </tr>
          </thead>
          <tbody>
            ${r.itens.map((it, idx) => `
              <tr>
                <td>
                  <select class="campo-texto" onchange="S.ui.rascCompra.itens[${idx}].pecaId=this.value;atualizarItemRascCompra(${idx});renderFolha()" style="width:100%;height:32px;font-size:12px">
                    <option value="">— Selecione a Peça —</option>
                    ${pecas.map(p => `<option value="${p.id}" ${it.pecaId === p.id ? 'selected' : ''}>${esc(p.cod ? p.cod + ' - ' : '')}${esc(p.nome)}</option>`).join('')}
                  </select>
                </td>
                <td style="text-align:center">
                  <input type="number" class="campo-texto" value="${it.qtd || 1}" min="1" step="1" oninput="S.ui.rascCompra.itens[${idx}].qtd=+this.value||1;renderFolha()" style="width:70px;height:32px;text-align:center">
                </td>
                <td style="text-align:right">
                  <input type="number" class="campo-texto" value="${it.custo || 0}" step="0.01" oninput="S.ui.rascCompra.itens[${idx}].custo=+this.value||0;renderFolha()" style="width:100px;height:32px;text-align:right">
                </td>
                <td style="text-align:right;font-weight:700" class="num">
                  ${brl((it.qtd || 1) * (it.custo || 0))}
                </td>
                <td style="text-align:center">
                  <button class="btn-icone-perigo" onclick="S.ui.rascCompra.itens.splice(${idx}, 1);renderFolha()">${ico('lixo', 14)}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <!-- Rodapé & Total -->
    <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px;align-items:center">
      <div style="font-size:16px;font-weight:700">
        Total da Compra: <span style="color:var(--verde)">${brl(totalCompra)}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" onclick="salvarNovaCompraConfirmada()" style="font-weight:700;padding:0 20px">
          ${ico('check', 14)} Finalizar & Atualizar Estoque
        </button>
      </div>
    </div>
  </div>`;
}

function adicionarItemRascCompra() {
  S.ui.rascCompra = S.ui.rascCompra || { itens: [] };
  S.ui.rascCompra.itens = S.ui.rascCompra.itens || [];
  const pecaPrimeira = (S.pecas && S.pecas[0]) || {};
  S.ui.rascCompra.itens.push({
    pecaId: pecaPrimeira.id || '',
    nome: pecaPrimeira.nome || '',
    qtd: 1,
    custo: Number(pecaPrimeira.custo || 0)
  });
  renderFolha();
}

function atualizarItemRascCompra(idx) {
  const it = S.ui.rascCompra.itens[idx];
  if (!it) return;
  const p = (S.pecas || []).find(x => x.id === it.pecaId);
  if (p) {
    it.nome = p.nome;
    it.custo = Number(p.custo || 0);
  }
}

function salvarNovaCompraConfirmada() {
  const r = S.ui.rascCompra;
  if (!r) return;
  if (!r.fornecedorId) {
    torrar('Selecione o fornecedor da compra.', 'erro');
    return;
  }
  if (!r.itens || r.itens.length === 0) {
    torrar('Adicione ao menos um item na compra.', 'erro');
    return;
  }

  const forn = (S.fornecedores || []).find(f => f.id === r.fornecedorId) || {};
  const total = r.itens.reduce((acc, it) => acc + (it.qtd * it.custo), 0);

  // 1. Atualiza estoque de cada item
  S.pecas = S.pecas || [];
  r.itens.forEach(it => {
    const p = S.pecas.find(x => x.id === it.pecaId);
    if (p) {
      p.qtd = (Number(p.qtd) || 0) + (Number(it.qtd) || 0);
      if (it.custo > 0) p.custo = it.custo;
    }
  });

  // 2. Gera Conta a Pagar
  S.contasPagar = S.contasPagar || [];
  const dataVenc = new Date();
  dataVenc.setDate(dataVenc.getDate() + 28);
  S.contasPagar.push({
    id: uid('cp'),
    parte: forn.nome || 'Fornecedor',
    fornecedorId: forn.id,
    desc: `Compra ${r.num ? 'NF-e ' + r.num : 'de Peças'}`,
    valor: total,
    venc: dataVenc.toISOString().substring(0, 10),
    tipo: 'pagar',
    st: 'pendente',
    origem: 'compra_manual'
  });

  // 3. Salva a compra
  S.compras = S.compras || [];
  S.compras.unshift({
    id: uid('comp'),
    codigo: 'C' + (S.compras.length + 101),
    num: r.num || 'S/N',
    fornecedorId: forn.id,
    fornecedorNome: forn.nome,
    fornecedorDoc: forn.doc,
    data: r.data || hoje(),
    total,
    itens: r.itens,
    situacao: 'Finalizada',
    obs: 'Lançamento manual de compra'
  });

  salvar();
  fecharFolha();
  render();
  torrar('Compra registrada com sucesso! Estoque e contas a pagar atualizados.', 'sucesso');
}

/* =====================================================================
   DETALHES E EXCLUSÃO DE COMPRA
===================================================================== */
function abrirDetalhesCompra(id) {
  const compra = (S.compras || []).find(c => c.id === id);
  if (!compra) return;

  abrirFolha(() => `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700;margin:0">Compra #${compra.codigo || compra.id} — ${esc(compra.fornecedorNome || '')}</h3>
        <div class="mini mono">NF-e: ${esc(compra.num || 'S/N')} · Data: ${dataBR(compra.data)}</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">Itens Comprados</div>
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Item</th>
            <th style="width:80px;text-align:center">Qtd</th>
            <th style="width:110px;text-align:right">Custo Unit.</th>
            <th style="width:110px;text-align:right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${(compra.itens || []).map(it => `
            <tr>
              <td>
                <div style="font-weight:600">${esc(it.nome)}</div>
                ${it.cod ? `<div class="mini mono">${esc(it.cod)}</div>` : ''}
              </td>
              <td style="text-align:center">${it.qtd} ${esc(it.un || 'un')}</td>
              <td style="text-align:right">${brl(it.custo)}</td>
              <td style="text-align:right;font-weight:700">${brl((it.qtd || 1) * (it.custo || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px;align-items:center">
      <div style="font-size:16px;font-weight:700">
        Total: <span style="color:var(--verde)">${brl(compra.total || 0)}</span>
      </div>
      <button class="btn btn-secundario" data-act="fechar">Fechar</button>
    </div>
  </div>`);
}

function excluirCompra(id) {
  pedirConfirmacao('excluir_compra_' + id, 'Toque de novo para excluir o registro desta compra', () => {
    S.compras = (S.compras || []).filter(c => c.id !== id);
    salvar();
    render();
    torrar('Compra excluída.');
  });
}

function darEntradaEstoqueCompra(id) {
  const compra = (S.compras || []).find(c => c.id === id);
  if (!compra) return;

  S.pecas = S.pecas || [];
  (compra.itens || []).forEach(it => {
    const p = S.pecas.find(x => x.id === it.pecaId || x.cod === it.cod || x.nome.toLowerCase() === it.nome.toLowerCase());
    if (p) {
      p.qtd = (Number(p.qtd) || 0) + (Number(it.qtd) || 0);
    }
  });

  compra.situacao = 'Finalizada';
  salvar();
  render();
  torrar('Entrada de estoque concluída com sucesso!', 'sucesso');
}

const processarXmlNfe = processarXMLCompra;

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.viewCompras = viewCompras;
  window.processarXMLCompra = processarXMLCompra;
  window.processarXmlNfe = processarXMLCompra;
  window.abrirModalNovaCompra = abrirModalNovaCompra;
  window.folhaNovaCompra = folhaNovaCompra;
  window.adicionarItemRascCompra = adicionarItemRascCompra;
  window.atualizarItemRascCompra = atualizarItemRascCompra;
  window.salvarNovaCompraConfirmada = salvarNovaCompraConfirmada;
  window.abrirDetalhesCompra = abrirDetalhesCompra;
  window.excluirCompra = excluirCompra;
  window.darEntradaEstoqueCompra = darEntradaEstoqueCompra;
}
