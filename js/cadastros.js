/* =====================================================================
   PÁTIO CRM — MÓDULO DE CADASTROS (FACHADA CENTRAL & NAVEGAÇÃO)
   Submódulos:
   - js/modules/cadastros_contatos_unificados.js: Clientes, fornecedores e transportadores
   - js/modules/cadastros_itens_tabelas.js: Veículos, produtos/peças e serviços
   - js/modules/cadastros_equipe_empresa.js: Mecânicos, boxes e empresa
   - js/modules/cadastros_fiscal.js: Central fiscal, regras tributárias e plano de contas
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

function viewCadastros() {
  const a = (S.ui && S.ui.abaCad) || 'hub';

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
    return (typeof viewContatosUnificados === 'function') ? viewContatosUnificados(a === 'contatos' ? 'clientes' : a) : '';
  } else if (a === 'veiculos') { 
    corpo = (typeof tabelaVeiculos === 'function') ? tabelaVeiculos() : ''; 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="veiculo">${ico('mais', 14)} Novo Veículo</button>`; 
  } else if (a === 'servicos') { 
    corpo = (typeof tabelaServicos === 'function') ? tabelaServicos() : ''; 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="servico">${ico('mais', 14)} Novo Serviço</button>`; 
  } else if (a === 'boxes') { 
    corpo = (typeof tabelaBoxes === 'function') ? tabelaBoxes() : ''; 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="box">${ico('mais', 14)} Novo Box</button>`; 
  } else if (a === 'mecanicos') { 
    corpo = (typeof tabelaMecanicos === 'function') ? tabelaMecanicos() : ''; 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="mecanico">${ico('mais', 14)} Novo Mecânico</button>`; 
  } else if (a === 'produtos') { 
    corpo = (typeof tabelaProdutos === 'function') ? tabelaProdutos() : ''; 
    acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="produto">${ico('mais', 14)} Novo Produto/Peça</button>`; 
  } else if (a === 'empresa') { 
    corpo = (typeof viewEmpresa === 'function') ? viewEmpresa() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar Dados</button>`; 
  } else if (a === 'planocontas') {
    corpo = (typeof viewPlanoContas === 'function') ? viewPlanoContas() : '';
    acoes = `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-neutro" onclick="restaurarPlanoContasPadrao()" title="Restaurar contas padrão">${ico('recarregar', 14) || '↺'} Restaurar Padrões</button><button class="btn btn-primario" onclick="abrirFolhaPlanoConta()" style="font-weight:600">${ico('mais', 14) || '+'} Nova Conta</button></div>`;
  } else if (a === 'contascaixa') { 
    corpo = (typeof viewContasCaixa === 'function') ? viewContasCaixa() : ''; 
  } else if (a === 'operacoes') { 
    corpo = (typeof viewOperacoes === 'function') ? viewOperacoes() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'formaspgto') { 
    corpo = (typeof viewFormasPgto === 'function') ? viewFormasPgto() : ''; 
  } else if (a === 'boletos') { 
    corpo = (typeof viewBoletos === 'function') ? viewBoletos() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'cobrancas') { 
    corpo = (typeof viewCobrancas === 'function') ? viewCobrancas() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'fiscal') { 
    corpo = (typeof viewFiscal === 'function') ? viewFiscal() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'tributario') { 
    corpo = (typeof viewTributario === 'function') ? viewTributario() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'regras-tributarias') {
    corpo = (typeof viewRegrasTributarias === 'function') ? viewRegrasTributarias() : '';
    acoes = `<button class="btn btn-primario" onclick="S.ui.rascCad={tipo:'produto',cfop:'',desc:'',cstIBSCBS:'01',cClassTrib:'010101',aliqCBS:S.cfg.aliqPadraoCBS||0.9,aliqIBSEst:S.cfg.aliqPadraoIBSEst||0.05,aliqIBSMun:S.cfg.aliqPadraoIBSMun||0.05,aliqIBS:S.cfg.aliqPadraoIBS||0.1,cstIS:'00',aliqIS:0,indDestino:'1'};S.ui.cadTipo='regra-tributaria';abrirFolha(folhaCadastro);">${ico('mais', 14)} Nova Regra</button>`;
  } else if (a === 'simulador-fiscal') { 
    corpo = (typeof viewSimuladorFiscal === 'function') ? viewSimuladorFiscal() : ''; 
  } else if (a === 'contabil') { 
    corpo = (typeof viewContabil === 'function') ? viewContabil() : ''; 
    acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; 
  } else if (a === 'usuarios') { 
    corpo = (typeof viewUsuarios === 'function') ? viewUsuarios() : ''; 
  } else if (a === 'api') { 
    corpo = (typeof viewAPI === 'function') ? viewAPI() : ''; 
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

// Binds no escopo global window e globalThis
const exportsCadastros = {
  renderSubnavCadastros,
  cardCad,
  viewCadastros,
  tabelaClientes: typeof tabelaClientes !== 'undefined' ? tabelaClientes : undefined,
  tabelaVeiculos: typeof tabelaVeiculos !== 'undefined' ? tabelaVeiculos : undefined,
  tabelaServicos: typeof tabelaServicos !== 'undefined' ? tabelaServicos : undefined,
  tabelaFornecedores: typeof tabelaFornecedores !== 'undefined' ? tabelaFornecedores : undefined,
  tabelaMecanicos: typeof tabelaMecanicos !== 'undefined' ? tabelaMecanicos : undefined,
  tabelaProdutos: typeof tabelaProdutos !== 'undefined' ? tabelaProdutos : undefined,
  viewEmpresa: typeof viewEmpresa !== 'undefined' ? viewEmpresa : undefined,
  tabelaBoxes: typeof tabelaBoxes !== 'undefined' ? tabelaBoxes : undefined,
  viewContatosUnificados: typeof viewContatosUnificados !== 'undefined' ? viewContatosUnificados : undefined,
  tabelaTransportadores: typeof tabelaTransportadores !== 'undefined' ? tabelaTransportadores : undefined
};

if (typeof window !== 'undefined') Object.assign(window, exportsCadastros);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsCadastros);
if (typeof module !== 'undefined' && module.exports) module.exports = exportsCadastros;
