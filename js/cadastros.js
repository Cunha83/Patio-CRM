/* =====================================================================
   PÁTIO CRM — MÓDULO DE CADASTROS (CLIENTES, VEÍCULOS, FORNECEDORES, PRODUTOS, SERVIÇOS, MECÂNICOS, BOXES & EMPRESA)
   INSPIRADO NO MODELO INTEGRADO eGestor ERP COM VÍNCULOS RELACIONAIS
===================================================================== */

function renderSubnavCadastros(a) {
  const tabs = [
    { id: 'hub', label: 'Hub Principal', icone: 'painel' },
    { id: 'clientes', label: 'Clientes & Frotas', icone: 'gente', count: (S.clientes || []).length },
    { id: 'veiculos', label: 'Veículos', icone: 'caminhao', count: (S.veiculos || []).length },
    { id: 'fornecedores', label: 'Fornecedores', icone: 'cad', count: (S.fornecedores || []).length },
    { id: 'produtos', label: 'Produtos & Peças', icone: 'caixa', count: (S.pecas || []).length },
    { id: 'servicos', label: 'Serviços', icone: 'livro', count: (S.servicos || []).length },
    { id: 'mecanicos', label: 'Mecânicos', icone: 'eng', count: (S.mecanicos || []).length },
    { id: 'boxes', label: 'Boxes', icone: 'box', count: (S.boxes || []).length },
    { id: 'empresa', label: 'Geral & Empresa', icone: 'cfg' },
    { id: 'regras-tributarias', label: 'Tributário / RTC', icone: 'nota' }
  ];

  return `
  <div class="subnav-cadastros" style="display:flex;gap:4px;flex-wrap:wrap;background:var(--aco-100,#f1f5f9);padding:6px;border-radius:8px;margin-bottom:16px;border:1px solid var(--aco-200,#e2e8f0)">
    ${tabs.map(t => {
      const active = a === t.id;
      return `
        <button class="btn ${active ? 'btn-primario' : 'btn-neutro'}" 
                onclick="S.ui.abaCad='${t.id}';S.ui.buscaCad='';if(typeof render==='function')render();"
                style="font-size:12px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px;${active ? 'font-weight:700' : 'background:transparent;border:none;color:var(--aco-700)'}">
          ${ico(t.icone, 14)}
          <span>${t.label}</span>
          ${t.count !== undefined ? `<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:${active ? 'rgba(255,255,255,0.25)' : 'var(--aco-200,#e2e8f0)'};color:${active ? '#fff' : 'var(--aco-800)'}">${t.count}</span>` : ''}
        </button>
      `;
    }).join('')}
  </div>`;
}

function viewCadastros() {
  const a = S.ui.abaCad || 'hub';

  if (a === 'hub') {
    return `
      ${renderSubnavCadastros('hub')}

      <div style="margin:-8px -16px 16px -16px;padding:12px 24px;background:var(--aco-500,#475569);color:#fff;display:flex;align-items:center;justify-content:space-between;border-radius:6px">
        <h2 style="margin:0;font-size:17px;font-weight:600">Hub Geral de Cadastros & Cadastros Relacionais</h2>
      </div>

      <h3 style="font-size:15px;margin:16px 0 12px 0;color:var(--aco-800);font-weight:700">Cadastros Operacionais da Oficina</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:14px;margin-bottom:28px">
        ${cardCad('Clientes & Frotas', 'clientes', (S.clientes?.length || 0) + ' cadastrados', 'gente', '#2563eb')}
        ${cardCad('Veículos / Caminhões', 'veiculos', (S.veiculos?.length || 0) + ' cadastrados', 'caminhao', '#0ea5e9')}
        ${cardCad('Fornecedores', 'fornecedores', (S.fornecedores?.length || 0) + ' cadastrados', 'cad', '#8b5cf6')}
        ${cardCad('Produtos & Peças', 'produtos', (S.pecas?.length || 0) + ' itens em estoque', 'caixa', '#10b981')}
        ${cardCad('Tabela de Serviços', 'servicos', (S.servicos?.length || 0) + ' serviços ativos', 'livro', '#f59e0b')}
        ${cardCad('Mecânicos & Equipe', 'mecanicos', (S.mecanicos?.length || 0) + ' colaboradores', 'eng', '#ec4899')}
        ${cardCad('Boxes do Pátio', 'boxes', (S.boxes?.length || 0) + ' boxes operacionais', 'box', '#14b8a6')}
      </div>

      <h3 style="font-size:15px;margin:16px 0 12px 0;color:var(--aco-800);font-weight:700">Configurações e Parâmetros Tributários</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:14px">
        ${cardCad('Geral da Empresa', 'empresa', 'Razão social, logo, fachada', 'cfg', '#64748b')}
        ${cardCad('Regras Tributárias', 'regras-tributarias', 'Matriz ICMS, PIS, IBS, CBS', 'nota', '#2563eb')}
        ${cardCad('Plano de Contas', 'planocontas', 'Categorias financeiras', 'lista', '#64748b')}
        ${cardCad('Contas Caixa', 'contascaixa', 'Bancos, gaveta e cofres', 'cofre', '#64748b')}
        ${cardCad('Formas de Pgto', 'formaspgto', 'Pix, Boleto, Cartão, Prazo', 'nota', '#64748b')}
        ${cardCad('Dados Tributários', 'tributario', 'CNAE, Inscrições, IVA Dual', 'nota', '#0284c7')}
        ${cardCad('Simulador Reforma', 'simulador-fiscal', 'Cálculos RTC e alíquotas', 'grana', '#059669')}
        ${cardCad('Usuários & Acesso', 'usuarios', 'Logins e perfis de equipe', 'gente', '#64748b')}
      </div>
    `;
  }

  let corpo = '';
  let acoes = '';

  if (a === 'clientes' || a === 'fornecedores' || a === 'transportadores' || a === 'contatos') { 
    return viewContatosUnificados(a === 'contatos' ? 'clientes' : a);
  } else if (a === 'veiculos') { 
    corpo = tabelaVeiculos(); 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="veiculo">${ico('mais', 14)} Novo Veículo</button>`; 
  } else if (a === 'servicos') { 
    corpo = tabelaServicos(); 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="servico">${ico('mais', 14)} Novo Serviço</button>`; 
  } else if (a === 'boxes') { 
    corpo = tabelaBoxes(); 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="box">${ico('mais', 14)} Novo Box</button>`; 
  } else if (a === 'mecanicos') { 
    corpo = tabelaMecanicos(); 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="mecanico">${ico('mais', 14)} Novo Mecânico</button>`; 
  } else if (a === 'produtos') { 
    corpo = tabelaProdutos(); 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="produto">${ico('mais', 14)} Novo Produto/Peça</button>`; 
  } else if (a === 'empresa') { 
    corpo = viewEmpresa(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar Dados</button>`; 
  } else if (a === 'planocontas') { 
    corpo = viewPlanoContas(); 
  } else if (a === 'contascaixa') { 
    corpo = viewContasCaixa(); 
  } else if (a === 'operacoes') { 
    corpo = viewOperacoes(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'formaspgto') { 
    corpo = viewFormasPgto(); 
  } else if (a === 'boletos') { 
    corpo = viewBoletos(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'cobrancas') { 
    corpo = viewCobrancas(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'fiscal') { 
    corpo = viewFiscal(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'tributario') { 
    corpo = viewTributario(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'regras-tributarias') {
    corpo = viewRegrasTributarias();
    acoes = `<button class="btn btn-primario" onclick="S.ui.rascCad={tipo:'produto',cfop:'',desc:'',cstIBSCBS:'01',cClassTrib:'010101',aliqCBS:S.cfg.aliqPadraoCBS||0.9,aliqIBSEst:S.cfg.aliqPadraoIBSEst||0.05,aliqIBSMun:S.cfg.aliqPadraoIBSMun||0.05,aliqIBS:S.cfg.aliqPadraoIBS||0.1,cstIS:'00',aliqIS:0,indDestino:'1'};S.ui.cadTipo='regra-tributaria';abrirFolha(folhaCadastro);">${ico('mais', 14)} Nova Regra</button>`;
  } else if (a === 'simulador-fiscal') { 
    corpo = viewSimuladorFiscal(); 
  } else if (a === 'contabil') { 
    corpo = viewContabil(); 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'usuarios') { 
    corpo = viewUsuarios(); 
  } else if (a === 'api') { 
    corpo = viewAPI(); 
    acoes = `<button class='btn btn-primario' data-act='salvar-cfg'>${ico('check', 14)} Salvar</button>`; 
  }

  const nomesAbas = {
    clientes: 'Clientes & Frotas',
    veiculos: 'Veículos / Caminhões',
    fornecedores: 'Fornecedores',
    produtos: 'Produtos & Peças',
    servicos: 'Tabela de Serviços',
    mecanicos: 'Mecânicos & Equipe',
    boxes: 'Boxes do Pátio',
    empresa: 'Geral & Dados da Empresa',
    planocontas: 'Plano de Contas',
    contascaixa: 'Contas Caixa',
    operacoes: 'Operações',
    formaspgto: 'Formas de Pagamento',
    boletos: 'Boletos',
    cobrancas: 'Cobranças',
    fiscal: 'Fiscal',
    tributario: 'Dados Tributários & IVA Dual',
    'regras-tributarias': 'Regras Tributárias',
    'simulador-fiscal': 'Simulador Reforma Tributária',
    contabil: 'Contábil',
    usuarios: 'Usuários'
  };

  return `
    ${renderSubnavCadastros(a)}
    <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <h3 style="font-size:18px;margin:0;font-weight:700;color:var(--aco-900)">${nomesAbas[a] || a.toUpperCase()}</h3>
      </div>
      <div>
        ${acoes}
      </div>
    </div>
    ${corpo}
  `;
}

function cardCad(titulo, k, desc, icone, cor) {
  let fallbackIcon = '<div style="font-size:24px">📋</div>';
  if (typeof ico === 'function' && ico(icone, 24)) {
    fallbackIcon = ico(icone, 24);
  }
  let act = k.startsWith('js:') ? k.slice(3) : `S.ui.abaCad='${k}';S.ui.buscaCad='';if(typeof render === 'function') render()`;
  return `
  <div class="card card-p" style="cursor:pointer;border-top:4px solid ${cor};display:flex;align-items:center;gap:14px;transition:transform 0.2s,box-shadow 0.2s" onclick="${act}" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
    <div style="background:${cor}1a;color:${cor};padding:12px;border-radius:10px;display:flex;align-items:center;justify-content:center">${fallbackIcon}</div>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:700;color:var(--aco-800)">${titulo}</div>
      ${desc !== '' ? `<div style="font-size:12px;color:var(--aco-500);margin-top:2px">${desc}</div>` : ''}
    </div>
  </div>`;
}

/* ===== CONTATOS UNIFICADOS (CLIENTES, FORNECEDORES & TRANSPORTADORES) ===== */
function viewContatosUnificados(abaAtiva) {
  const subAba = abaAtiva || S.ui.subAbaContatos || 'clientes';
  S.ui.subAbaContatos = subAba;

  // Garante dados mockados para veículos pesados se vazios
  if (!S.clientes || S.clientes.length === 0) {
    S.clientes = [
      { id: 'cli1', codigo: 'CLI-001', nome: 'Transportes Rodoviários Silva Ltda', fantasia: 'TransSilva Logística', doc: '12.345.678/0001-90', fone: '(11) 98888-7777', cidade: 'São Paulo', uf: 'SP', tags: ['Frota Scania', 'Bitrem Graneleiro', 'Linha Pesada'], contato: 'Sr. Marcos' },
      { id: 'cli2', codigo: 'CLI-002', nome: 'Expresso Rodoviário Cordeiro S.A.', fantasia: 'Expresso Cordeiro', doc: '98.765.432/0001-10', fone: '(19) 99988-1122', cidade: 'Campinas', uf: 'SP', tags: ['Volvo FH 540', 'Câmara Frigorífica', 'Pesado'], contato: 'Dona Helena' },
      { id: 'cli3', codigo: 'CLI-003', nome: 'Logística Brasul Frotas e Cargas', fantasia: 'Brasul Frotas', doc: '33.444.555/0001-22', fone: '(11) 97777-6655', cidade: 'Guarulhos', uf: 'SP', tags: ['Mercedes Actros', 'Baú Carga Geral'], contato: 'Dr. Paulo' }
    ];
  }

  if (!S.fornecedores || S.fornecedores.length === 0) {
    S.fornecedores = [
      { id: 'for1', codigo: 'FOR-001', nome: 'Suspentech Indústria e Comércio de Autopeças', fantasia: 'Suspentech Suspensões', doc: '05.123.456/0001-88', fone: '(54) 3211-9000', cidade: 'Caxias do Sul', uf: 'RS', tags: ['Molas Parabólicas', 'Suspensão a Ar', 'Pinos Cementados'], contato: 'Depto Vendas' },
      { id: 'for2', codigo: 'FOR-002', nome: 'Fras-le Componentes de Fricção e Freios S.A.', fantasia: 'Fras-le Freios', doc: '88.765.432/0001-99', fone: '(54) 3289-1000', cidade: 'Caxias do Sul', uf: 'RS', tags: ['Lonas Heavy Duty', 'Pastilhas Freio', 'Tambores'], contato: 'Comercial' },
      { id: 'for3', codigo: 'FOR-003', nome: 'Cindumel Molas e Componentes Automotivos', fantasia: 'Cindumel Molas', doc: '61.222.333/0001-44', fone: '(11) 2468-1200', cidade: 'Guarulhos', uf: 'SP', tags: ['Lâminas Mestra', 'Grampos Aço 1045'], contato: 'Vendas SP' }
    ];
  }

  if (!S.transportadores || S.transportadores.length === 0) {
    S.transportadores = [
      { id: 'tra1', codigo: 'TRA-001', nome: 'TransVale Cargas Pesadas & Pranchas Especiais', fantasia: 'TransVale Log', doc: '14.555.666/0001-77', fone: '(41) 98765-4321', cidade: 'Curitiba', uf: 'PR', tags: ['Prancha Rebaixada', 'Transporte Chassi', 'Socorro Pesado'], contato: 'Operações' },
      { id: 'tra2', codigo: 'TRA-002', nome: 'RodoExpress Logística e Distribuição Rodoviária', fantasia: 'RodoExpress', doc: '22.333.444/0001-55', fone: '(11) 99123-4567', cidade: 'São Bernardo do Campo', uf: 'SP', tags: ['Truck 6x2', 'Entrega Expressa Peças'], contato: 'Expedição' }
    ];
  }

  const clientes = S.clientes || [];
  const fornecedores = S.fornecedores || [];
  const transportadores = S.transportadores || [];

  const busca = (S.ui.buscaCad || '').toLowerCase().trim();

  let listaAtual = [];
  let singularTipo = 'cliente';
  let labelNovo = '+ Novo Cliente';

  if (subAba === 'fornecedores') {
    listaAtual = fornecedores;
    singularTipo = 'fornecedor';
    labelNovo = '+ Novo Fornecedor';
  } else if (subAba === 'transportadores') {
    listaAtual = transportadores;
    singularTipo = 'transportador';
    labelNovo = '+ Novo Transportador';
  } else {
    listaAtual = clientes;
    singularTipo = 'cliente';
    labelNovo = '+ Novo Cliente';
  }

  // Filtragem instantânea
  if (busca) {
    listaAtual = listaAtual.filter(item => {
      const tagsStr = (item.tags || []).join(' ').toLowerCase();
      return (item.nome || '').toLowerCase().includes(busca) ||
             (item.fantasia || '').toLowerCase().includes(busca) ||
             (item.codigo || item.id || '').toLowerCase().includes(busca) ||
             (item.doc || '').toLowerCase().includes(busca) ||
             (item.fone || '').toLowerCase().includes(busca) ||
             (item.cidade || '').toLowerCase().includes(busca) ||
             tagsStr.includes(busca);
    });
  }

  return `
  ${renderSubnavCadastros(subAba)}

  <!-- FRENTE 3: FOLDER TABS NO TOPO -->
  <div class="folder-tabs">
    <button class="folder-tab ${subAba === 'clientes' ? 'ativo' : ''}" onclick="S.ui.abaCad='clientes';S.ui.subAbaContatos='clientes';render()">
      ${ico('gente', 15)} <span>CLIENTES (${clientes.length})</span>
    </button>
    <button class="folder-tab ${subAba === 'fornecedores' ? 'ativo' : ''}" onclick="S.ui.abaCad='fornecedores';S.ui.subAbaContatos='fornecedores';render()">
      ${ico('cad', 15)} <span>FORNECEDORES (${fornecedores.length})</span>
    </button>
    <button class="folder-tab ${subAba === 'transportadores' ? 'ativo' : ''}" onclick="S.ui.abaCad='transportadores';S.ui.subAbaContatos='transportadores';render()">
      ${ico('caminhao', 15)} <span>TRANSPORTADORES (${transportadores.length})</span>
    </button>
  </div>

  <!-- BARRA DE AÇÕES & BUSCA INSTANTÂNEA -->
  <div class="barra-acoes-lote">
    <div class="barra-acoes-grupo">
      <button class="btn btn-primario" data-act="novo-cad" data-t="${singularTipo}" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
        ${ico('mais', 14)} ${labelNovo}
      </button>
      <button class="btn btn-neutro" onclick="window.print()" title="Imprimir listagem de contatos">
        ${ico('impressora', 14)} Imprimir
      </button>
      <button class="btn btn-neutro" onclick="torrar('Exportação de contatos gerada com sucesso!','sucesso')" title="Exportar CSV">
        ${ico('relatorios', 14)} Exportar CSV
      </button>
    </div>

    <div style="font-size:12.5px;color:#64748b;font-weight:600">
      Mostrando ${listaAtual.length} registro(s)
    </div>
  </div>

  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Busca instantânea por Cód, Razão Social, Fantasia, CNPJ/CPF, Telefone, Cidade ou Tags..." 
           value="${esc(S.ui.buscaCad || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:540px;height:38px;font-size:13px;background:#ffffff">
  </div>

  <!-- TABELA DENSA DE ALTO CONTRASTE -->
  <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <div class="tabela-responsiva">
      <table class="tabela-densa">
        <thead>
          <tr>
            <th style="width:100px">Cód</th>
            <th>Nome / Razão Social</th>
            <th style="width:180px">Fones / WhatsApp</th>
            <th>Palavras-chave (Frota / Segmento)</th>
            <th style="width:160px">Cidade / UF</th>
            <th style="width:130px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${listaAtual.length === 0 ? `
            <tr>
              <td colspan="6" style="text-align:center;padding:36px;color:var(--aco-500)">
                Nenhum contato encontrado. Clique em <b>"${labelNovo}"</b> para adicionar.
              </td>
            </tr>
          ` : listaAtual.map(item => {
            const tags = item.tags || ['Frota Pesada'];
            return `
            <tr>
              <td class="mono">
                <span style="font-weight:700">#${esc(item.codigo || item.id || '')}</span>
              </td>
              <td>
                <div style="font-weight:700;color:#0f172a">${esc(item.nome)}</div>
                <div class="mini mono" style="color:#64748b">
                  ${item.fantasia ? `<span style="font-weight:600">${esc(item.fantasia)}</span> · ` : ''}
                  <span>${esc(item.doc || 'Doc não informado')}</span>
                </div>
              </td>
              <td>
                <div style="display:inline-flex;align-items:center;gap:6px">
                  <span style="font-weight:600;color:#0f172a">${esc(item.fone || '—')}</span>
                  ${item.fone ? `
                    <a href="https://wa.me/55${String(item.fone).replace(/\D/g, '')}" target="_blank" title="Conversar no WhatsApp" style="color:#10b981;font-size:13px;text-decoration:none">
                      💬
                    </a>
                  ` : ''}
                </div>
                ${item.contato ? `<div class="mini" style="color:#64748b">Contato: ${esc(item.contato)}</div>` : ''}
              </td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  ${tags.map(t => `<span class="selo" style="font-size:11px;background:#e2e8f0;color:#1e293b;border:1px solid #cbd5e1">${esc(t)}</span>`).join('')}
                </div>
              </td>
              <td>
                <div style="font-weight:600;color:#334155">${esc(item.cidade || '—')}${item.uf ? ' / ' + esc(item.uf) : ''}</div>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  ${subAba === 'clientes' ? `
                    <button class="btn-icone" data-act="ver-cliente" data-id="${item.id}" title="Ficha do Cliente">${ico('doc', 14)}</button>
                  ` : ''}
                  <button class="btn-icone" data-act="editar-cad" data-t="${singularTipo}" data-id="${item.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="${singularTipo}" data-id="${item.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function tabelaClientes() { return viewContatosUnificados('clientes'); }
function tabelaFornecedores() { return viewContatosUnificados('fornecedores'); }
function tabelaTransportadores() { return viewContatosUnificados('transportadores'); }

/* ===== TABELA VEÍCULOS ===== */
function tabelaVeiculos() {
  const busca = (S.ui.buscaCad || '').toLowerCase().trim();
  let lista = S.veiculos || [];

  if (busca) {
    lista = lista.filter(v => {
      const cl = C(v.cli) || {};
      return (v.placa || '').toLowerCase().includes(busca) ||
        (v.modelo || '').toLowerCase().includes(busca) ||
        (cl.nome || '').toLowerCase().includes(busca);
    });
  }

  return `
  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar por Placa, Modelo ou Proprietário..." 
           value="${esc(S.ui.buscaCad || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Marca & Modelo</th>
            <th>Proprietário / Cliente</th>
            <th>Tipo</th>
            <th style="width:110px;text-align:right">KM Registrado</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum veículo encontrado.</td></tr>` : lista.map(v => {
            const cl = C(v.cli) || {};
            return `
            <tr>
              <td><span class="placa">${esc(v.placa)}</span></td>
              <td><b>${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</b><div class="mini">Ano: ${esc(v.ano || '—')}</div></td>
              <td><b>${esc(cl.nome || 'Cliente não vinculado')}</b></td>
              <td><span class="selo">${esc(v.tipo || 'Cavalo')}</span></td>
              <td style="text-align:right" class="num">${(v.km || 0).toLocaleString('pt-BR')} km</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn btn-secundario" data-act="ver-historico-veiculo" data-id="${v.id}" style="padding:4px 8px;font-size:11px" title="Ver Histórico de OS">
                    ${ico('historico', 12)} OS
                  </button>
                  <button class="btn-icone" data-act="editar-cad" data-t="veiculo" data-id="${v.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="veiculo" data-id="${v.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}


/* ===== TABELA PRODUTOS & PEÇAS ===== */
function tabelaProdutos() {
  const categorias = ['Todas', 'Suspensão', 'Molas', 'Freio', 'Embreagem', 'Embuchamento de Eixo', 'Cardan', 'Motor', 'Outros'];
  const catAtiva = S.ui.catProdutoAtiva || 'Todas';
  const busca = (S.ui.buscaCad || '').toLowerCase().trim();

  let lista = S.pecas || [];
  if (catAtiva !== 'Todas') {
    lista = lista.filter(p => (p.categoria || 'Suspensão') === catAtiva);
  }
  if (busca) {
    lista = lista.filter(p => 
      (p.cod || '').toLowerCase().includes(busca) ||
      (p.nome || '').toLowerCase().includes(busca) ||
      (p.ncm || '').toLowerCase().includes(busca) ||
      (p.categoria || '').toLowerCase().includes(busca)
    );
  }

  return `
  <!-- Categorias estilo eGestor ERP -->
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    ${categorias.map(cat => `
      <button class="btn ${catAtiva === cat ? 'btn-primario' : 'btn-neutro'}" 
              onclick="S.ui.catProdutoAtiva='${cat}';render()" 
              style="font-size:11.5px;padding:4px 10px;border-radius:14px">
        ${cat}
      </button>
    `).join('')}
  </div>

  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar peça por código, descrição ou NCM..." 
           value="${esc(S.ui.buscaCad || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:100px">Código</th>
            <th>Descrição da Peça</th>
            <th style="width:140px">Categoria</th>
            <th style="width:100px;text-align:center">Estoque</th>
            <th style="width:110px;text-align:right">Custo</th>
            <th style="width:110px;text-align:right">Venda</th>
            <th style="width:90px;text-align:center">Margem</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhuma peça encontrada.</td></tr>` : lista.map(p => {
            const custo = Number(p.custo || 0);
            const venda = Number(p.venda || 0);
            const margem = custo > 0 ? Math.round(((venda - custo) / custo) * 100) : 0;
            const estoque = Number(p.qtd != null ? p.qtd : 0);
            const min = Number(p.min != null ? p.min : 1);
            const critico = estoque <= min;

            return `
            <tr>
              <td class="mono"><b>${esc(p.cod || '—')}</b></td>
              <td>
                <div style="font-weight:700;color:var(--aco-900)">${esc(p.nome)}</div>
                <div class="mini mono" style="color:var(--aco-500)">NCM: ${esc(p.ncm || '—')} · CFOP: ${esc(p.cfop || '5102')}</div>
              </td>
              <td><span class="selo">${esc(p.categoria || 'Suspensão')}</span></td>
              <td style="text-align:center">
                <span class="selo ${critico ? 'selo-peca' : 'selo-finalizada'}">
                  ${estoque} ${esc(p.un || 'un')}
                </span>
              </td>
              <td style="text-align:right" class="num">${brl(custo)}</td>
              <td style="text-align:right;font-weight:700;color:var(--verde)" class="num">${brl(venda)}</td>
              <td style="text-align:center;font-weight:600;color:${margem >= 30 ? 'var(--verde)' : 'var(--laranja)'}">
                ${margem}%
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="produto" data-id="${p.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="produto" data-id="${p.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA SERVIÇOS ===== */
function tabelaServicos() {
  const busca = (S.ui.buscaCad || '').toLowerCase().trim();
  let lista = S.servicos || [];

  if (busca) {
    lista = lista.filter(s => 
      (s.nome || '').toLowerCase().includes(busca) ||
      (s.cnae || '').toLowerCase().includes(busca) ||
      (s.codServLC116 || '').toLowerCase().includes(busca)
    );
  }

  return `
  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar serviço por descrição, CNAE ou código..." 
           value="${esc(S.ui.buscaCad || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Serviço</th>
            <th style="width:120px;text-align:center">Tempo Est.</th>
            <th style="width:200px">Fiscal (CNAE / ISS)</th>
            <th style="width:140px;text-align:right">Valor (R$)</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum serviço cadastrado.</td></tr>` : lista.map(s => `
            <tr>
              <td><b>${esc(s.nome)}</b></td>
              <td style="text-align:center"><span class="selo">${s.horas || 1} h</span></td>
              <td class="mini">CNAE: ${esc(s.cnae || '—')}<br>LC 116: ${esc(s.codServLC116 || '14.01')}</td>
              <td style="text-align:right;font-weight:700" class="num">${brl(s.valor)}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="servico" data-id="${s.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="servico" data-id="${s.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA MECÂNICOS ===== */
function tabelaMecanicos() {
  const busca = (S.ui.buscaCad || '').toLowerCase().trim();
  let lista = S.mecanicos || [];

  if (busca) {
    lista = lista.filter(m => 
      (m.nome || '').toLowerCase().includes(busca) ||
      (m.especialidade || '').toLowerCase().includes(busca)
    );
  }

  return `
  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar mecânico por nome ou especialidade..." 
           value="${esc(S.ui.buscaCad || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Nome do Colaborador</th>
            <th>Especialidade</th>
            <th>Telefone / WhatsApp</th>
            <th style="width:120px;text-align:center">OS em Andamento</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum mecânico cadastrado.</td></tr>` : lista.map(m => {
            const osEmAndamento = (S.os || []).filter(o => o.mecanico === m.id && o.st === 'executando');
            return `
            <tr>
              <td><div style="font-weight:700;color:var(--aco-900)">${esc(m.nome)}</div></td>
              <td><span class="selo">${esc(m.especialidade || 'Geral')}</span></td>
              <td class="mono">${esc(m.fone || '—')}</td>
              <td style="text-align:center">
                <span class="selo ${osEmAndamento.length ? 'selo-executando' : 'selo-fila'}">${osEmAndamento.length} OS</span>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="mecanico" data-id="${m.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="mecanico" data-id="${m.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA BOXES ===== */
function tabelaBoxes() {
  const lista = S.boxes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Identificação do Box</th>
            <th>Especialidade / Equipamento</th>
            <th style="width:160px;text-align:center">Status Atual</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum box cadastrado.</td></tr>` : lista.map(b => {
            const osNoBox = (S.os || []).find(o => o.box === b.id && o.st !== 'finalizada' && o.st !== 'cancelada');
            return `
            <tr>
              <td><b>${esc(b.nome)}</b></td>
              <td><span class="selo">${esc(b.tipo || 'Geral')}</span></td>
              <td style="text-align:center">
                <span class="selo ${osNoBox ? 'selo-executando' : 'selo-finalizada'}">
                  ${osNoBox ? `Ocupado (OS ${osNoBox.num})` : '● Livre'}
                </span>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="box" data-id="${b.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="box" data-id="${b.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== EMPRESA & PARAMETRIZAÇÃO VISUAL ===== */
function viewEmpresa() {
  const c = S.cfg || {};
  const logoSrc = (c.identidadeVisual && (c.identidadeVisual.logoUrl || c.identidadeVisual.logo)) || c.logoEmpresa;
  const instSrc = (c.identidadeVisual && (c.identidadeVisual.imagemInstitucionalUrl || c.identidadeVisual.imagemInstitucional)) || c.imagemInstitucional;

  return `
  <div class="card card-p" style="max-width:880px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3 style="font-weight:700;font-size:17px;margin:0">Dados Cadastrais da Empresa</h3>
        <div class="mini" style="color:var(--aco-500)">Informações impressas em ordens de serviço, notas fiscais, orçamentos e relatórios.</div>
      </div>
      <button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar Alterações</button>
    </div>

    <!-- 1. IDENTIDADE VISUAL DUAL (LOGO + FACHADA) -->
    <div style="margin-bottom:24px;background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:10px;padding:16px">
      <div style="font-weight:700;font-size:14px;color:var(--aco-800);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <span>🖼️ Identidade Visual da Empresa</span>
        <span class="selo selo-finalizada" style="font-size:10px">PNG, JPEG ou WEBP (máx. 2MB)</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <!-- CARD LOGOTIPO -->
        <div style="background:#fff;border:1px solid var(--aco-200,#cbd5e1);border-radius:8px;padding:14px;display:flex;flex-direction:column;align-items:center;text-align:center">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">Logotipo da Oficina / Empresa</div>
          <div style="width:100%;height:110px;background:#f8fafc;border:1px dashed var(--aco-300,#94a3b8);border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;overflow:hidden">
            ${logoSrc ? `
              <img src="${esc(logoSrc)}" alt="Logo" style="max-height:95px;max-width:90%;object-fit:contain">
            ` : `
              <div style="color:var(--aco-400);font-size:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                ${ico('patio', 28)}
                <span>Sem logotipo carregado</span>
              </div>
            `}
          </div>
          <input type="file" id="cfg-input-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none">
          <div style="display:flex;gap:6px">
            <button class="btn btn-secundario" type="button" onclick="document.getElementById('cfg-input-logo').click()" style="font-size:12px;padding:5px 12px">
              ${ico('upload', 14)} Escolher Logo
            </button>
            ${logoSrc ? `
              <button class="btn btn-perigo" type="button" data-act="remover-logo" style="font-size:12px;padding:5px 10px" title="Remover logotipo">
                ${ico('lixo', 14)}
              </button>
            ` : ''}
          </div>
          <div class="mini" style="color:var(--aco-500);margin-top:6px">Aparece na barra superior, nas OS e orçamentos.</div>
        </div>

        <!-- CARD IMAGEM INSTITUCIONAL / FACHADA -->
        <div style="background:#fff;border:1px solid var(--aco-200,#cbd5e1);border-radius:8px;padding:14px;display:flex;flex-direction:column;align-items:center;text-align:center">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">Imagem Institucional / Fachada</div>
          <div style="width:100%;height:110px;background:#f8fafc;border:1px dashed var(--aco-300,#94a3b8);border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;overflow:hidden">
            ${instSrc ? `
              <img src="${esc(instSrc)}" alt="Fachada" style="max-height:100px;max-width:95%;object-fit:cover;border-radius:4px">
            ` : `
              <div style="color:var(--aco-400);font-size:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                ${ico('cad', 28)}
                <span>Sem imagem institucional</span>
              </div>
            `}
          </div>
          <input type="file" id="cfg-input-institucional" accept="image/png,image/jpeg,image/webp" style="display:none">
          <div style="display:flex;gap:6px">
            <button class="btn btn-secundario" type="button" onclick="document.getElementById('cfg-input-institucional').click()" style="font-size:12px;padding:5px 12px">
              ${ico('upload', 14)} Escolher Imagem
            </button>
            ${instSrc ? `
              <button class="btn btn-perigo" type="button" data-act="remover-institucional" style="font-size:12px;padding:5px 10px" title="Remover imagem institucional">
                ${ico('lixo', 14)}
              </button>
            ` : ''}
          </div>
          <div class="mini" style="color:var(--aco-500);margin-top:6px">Usada na ficha da oficina, link de rastreio e CRM.</div>
        </div>
      </div>
    </div>

    <!-- 2. DADOS GERAIS -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:16px">
      <div>
        <label class="mini" style="font-weight:700">Razão Social / Nome da Empresa</label>
        <input type="text" class="campo-texto" value="${esc(c.empresa || '')}" oninput="S.cfg.empresa=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">CNPJ / CPF</label>
        <input type="text" class="campo-texto mono" value="${esc(c.cnpj || '')}" oninput="S.cfg.cnpj=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:20px">
      <div>
        <label class="mini" style="font-weight:700">Endereço Completo (Rua, Número, Bairro, Cidade/UF)</label>
        <input type="text" class="campo-texto" value="${esc(c.endereco || '')}" oninput="S.cfg.endereco=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Telefone / WhatsApp Comercial</label>
        <input type="text" class="campo-texto mono" value="${esc(c.fone || '')}" oninput="S.cfg.fone=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <!-- 3. PARAMETRIZAÇÃO FISCAL -->
    <div style="margin-bottom:12px;border-top:1px solid var(--aco-150);padding-top:16px">
      <h4 style="font-weight:700;font-size:14px;margin:0 0 12px 0;color:var(--aco-800)">Parametrização Fiscal & Tributária</h4>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:24px">
      <div>
        <label class="mini" style="font-weight:700">Regime Tributário</label>
        <select class="campo-texto" onchange="S.cfg.regimeTributario=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
          <option ${c.regimeTributario === 'Simples Nacional' ? 'selected' : ''}>Simples Nacional</option>
          <option ${c.regimeTributario === 'Lucro Presumido' ? 'selected' : ''}>Lucro Presumido</option>
          <option ${c.regimeTributario === 'Lucro Real' ? 'selected' : ''}>Lucro Real</option>
        </select>
      </div>
      <div>
        <label class="mini" style="font-weight:700">CNAE Principal</label>
        <input type="text" class="campo-texto" value="${esc(c.cnae || '4520-0/01')}" oninput="S.cfg.cnae=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Inscrição Estadual (IE)</label>
        <input type="text" class="campo-texto" value="${esc(c.ie || '')}" oninput="S.cfg.ie=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Inscrição Municipal (IM)</label>
        <input type="text" class="campo-texto" value="${esc(c.im || '')}" oninput="S.cfg.im=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <!-- 4. ASSISTENTE DE IA & WHATSAPP -->
    <div style="margin-bottom:12px;border-top:1px solid var(--aco-150);padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <h4 style="font-weight:700;font-size:14px;margin:0;color:var(--aco-800)">Assistente Virtual & Voz da Oficina</h4>
        <div class="mini" style="color:var(--aco-500)">Personalize a identidade da IA que interage com seus clientes.</div>
      </div>
      <button type="button" class="btn btn-neutro btn-pequeno" onclick="if(typeof abrirConfiguracoesAgente === 'function') abrirConfiguracoesAgente();">
        ⚙️ Configurar Voz Avançada
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label class="mini" style="font-weight:700">Nome do Agente / Assistente</label>
        <input type="text" class="campo-texto" value="${esc(c.assistente?.displayName || 'Verônica')}" style="width:100%;height:36px;font-size:13px" oninput="if(!S.cfg.assistente)S.cfg.assistente={};S.cfg.assistente.displayName=this.value;salvar()">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Gênero de Voz (TTS)</label>
        <select class="campo-texto" style="width:100%;height:36px;font-size:13px" onchange="if(!S.cfg.assistente)S.cfg.assistente={};S.cfg.assistente.voiceGender=this.value;salvar()">
          <option value="female" ${(c.assistente?.voiceGender !== 'male') ? 'selected' : ''}>👩 Voz Feminina</option>
          <option value="male" ${(c.assistente?.voiceGender === 'male') ? 'selected' : ''}>👨 Voz Masculina</option>
        </select>
      </div>
    </div>
  </div>`;
}

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.renderSubnavCadastros = renderSubnavCadastros;
  window.cardCad = cardCad;
  window.viewCadastros = viewCadastros;
  window.tabelaClientes = tabelaClientes;
  window.tabelaVeiculos = tabelaVeiculos;
  window.tabelaServicos = tabelaServicos;
  window.tabelaFornecedores = tabelaFornecedores;
  window.tabelaMecanicos = tabelaMecanicos;
  window.tabelaProdutos = tabelaProdutos;
  window.viewEmpresa = viewEmpresa;
  window.tabelaBoxes = tabelaBoxes;
}
