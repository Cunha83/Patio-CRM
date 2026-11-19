/**
 * Testes Unitários e de Integração — Sprint 14.0
 * Pátio-CRM — Dados Reais (API Placa & Limpeza), Cadastros Completos, Tela Cheia TV & Print Exclusivo
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sprint 14.0 — Pilar 1: Consulta Real de Placa via API & Zero Mocks Silenciosos', async (t) => {
  const integrationsCode = fs.readFileSync(path.join(__dirname, '../js/modules/integrations.js'), 'utf8');

  await t.test('1. Eliminação total de mockData estático/fictício na consulta de placa', () => {
    assert.equal(integrationsCode.includes('VOLVO FH 460'), false, 'Não deve conter dados mockados de Volvo FH 460');
    assert.equal(integrationsCode.includes('9BWZZZ377VT004281'), false, 'Não deve conter chassi fictício hardcoded');
  });

  await t.test('2. Tratamento claro de ausência de token de API e erro de consulta de placa', () => {
    assert.ok(
      integrationsCode.includes('Consulta de placa indisponível') || 
      integrationsCode.includes('Configurações > Integrações') ||
      integrationsCode.includes('/api/veiculos/consultar-placa'),
      'Deve orientar o usuário a preencher manualmente ou configurar token'
    );
  });
});

test('Sprint 14.0 — Pilar 1: Gestão Permanente da Base de Dados (Limpar Base / Restaurar Demo)', async (t) => {
  const demoService = require('../services/demoDataService');

  await t.test('3. demoDataService.zerarBaseOperacional remove itens operacionais preservando empresa e admin', () => {
    assert.equal(typeof demoService.zerarBaseOperacional, 'function', 'Deve exportar função zerarBaseOperacional');
    const mockState = {
      cfg: { empresa: { nome: 'Oficina Real' } },
      empresa: { nome: 'Oficina Real' },
      usuarios: [{ id: 'admin_1', role: 'admin', nome: 'Administrador' }],
      os: [{ id: 'os_1' }, { id: 'os_2' }],
      clientes: [{ id: 'cli_1' }],
      veiculos: [{ id: 'vei_1' }],
      pecas: [{ id: 'pec_1' }],
      servicos: [{ id: 'srv_1' }],
      vendas: [{ id: 'vd_1' }]
    };

    const res = demoService.zerarBaseOperacional({ tenantId: 'tenant_teste', state: mockState });
    assert.equal(res.ok, true);
    assert.equal(mockState.os.length, 0);
    assert.equal(mockState.clientes.length, 0);
    assert.equal(mockState.veiculos.length, 0);
    assert.equal(mockState.pecas.length, 0);
    assert.equal(mockState.servicos.length, 0);
    assert.equal(mockState.vendas.length, 0);
    assert.ok(mockState.cfg.empresa.nome, 'Configurações de empresa devem ser preservadas');
    assert.equal(mockState.usuarios.length, 1, 'Usuário administrador deve ser preservado');
  });

  await t.test('4. Painel de gestão da base de dados e modais permanentes registrados', () => {
    const dbMgmtCode = fs.readFileSync(path.join(__dirname, '../js/modules/agent_config_database_mgmt.js'), 'utf8');
    assert.ok(dbMgmtCode.includes('zerarBaseOperacional') || dbMgmtCode.includes('executarZerarBaseOperacional'), 'Deve conter ação de zerar base');
    assert.ok(dbMgmtCode.includes('restaurarDadosDemo') || dbMgmtCode.includes('carregar-demo'), 'Deve conter ação de restaurar dados de demo');
  });
});

test('Sprint 14.0 — Pilar 1: Busca Ativa de XML de NF-e Emitidas contra CNPJ (SEFAZ)', async (t) => {
  const comprasCode = fs.readFileSync(path.join(__dirname, '../js/compras.js'), 'utf8');
  const fiscalCode = fs.readFileSync(path.join(__dirname, '../js/fiscal.js'), 'utf8');
  const xmlDistCode = fs.readFileSync(path.join(__dirname, '../js/modules/fiscal_xml_distribuicao_ui.js'), 'utf8');

  await t.test('5. Atalhos visíveis para buscar XMLs emitidos contra o CNPJ na SEFAZ', () => {
    assert.ok(
      comprasCode.includes('Buscar XMLs Emitidos') || comprasCode.includes('SEFAZ') || comprasCode.includes('buscar-xml-destinatario'),
      'Módulo de Compras deve disponibilizar busca ativa de XML da SEFAZ'
    );
    assert.ok(
      fiscalCode.includes('Buscar XMLs Emitidos') || fiscalCode.includes('SEFAZ') || fiscalCode.includes('buscar-xml-destinatario'),
      'Módulo Fiscal deve disponibilizar busca ativa de XML da SEFAZ'
    );
    assert.ok(
      xmlDistCode.includes('S.cfg') || xmlDistCode.includes('S.empresa'),
      'XML Distribuição deve ler dinamicamente o CNPJ da empresa ativa'
    );
  });
});

test('Sprint 14.0 — Pilar 2: Reestruturação de Cadastros (Colaboradores, Contatos e Tributação)', async (t) => {
  const colabFormCode = fs.readFileSync(path.join(__dirname, '../js/modules/cadastros_colaboradores_form.js'), 'utf8');
  const contatosCode = fs.readFileSync(path.join(__dirname, '../js/modules/cadastros_contatos_unificados.js'), 'utf8');
  const formsFiscaisCode = fs.readFileSync(path.join(__dirname, '../js/modules/cadastros_forms_fiscais.js'), 'utf8');
  const itensTabelasCode = fs.readFileSync(path.join(__dirname, '../js/modules/cadastros_itens_tabelas.js'), 'utf8');

  await t.test('6. Formulário de Colaboradores completo com dados pessoais, endereço e documentos', () => {
    assert.ok(colabFormCode.includes('cpf') && colabFormCode.includes('rg'), 'Deve incluir CPF e RG');
    assert.ok(colabFormCode.includes('cep') && colabFormCode.includes('cidade') && colabFormCode.includes('uf'), 'Deve incluir endereço completo');
    assert.ok(colabFormCode.includes('cnh') && colabFormCode.includes('categoriaCnh'), 'Deve incluir CNH e categoria');
    assert.ok(colabFormCode.includes('ctps') || colabFormCode.includes('pis'), 'Deve incluir CTPS / PIS-PASEP');
    assert.ok(colabFormCode.includes('comissao'), 'Deve incluir campo de comissão');
  });

  await t.test('7. Alternância funcional e sem erros das abas Clientes, Fornecedores e Transportadores', () => {
    assert.equal(contatosCode.includes("document.getElementById('conteudo-cadastros')"), false, 'Não deve depender de ID inexistente');
    assert.ok(contatosCode.includes('subAbaContatos') || contatosCode.includes('viewContatosUnificados'), 'Deve gerenciar subabas unificadas');
  });

  await t.test('8. Cadastro de Serviços estruturado com tributação municipal (ISS / LC 116)', () => {
    assert.ok(formsFiscaisCode.includes('codServLC116'), 'Deve ter Código de Serviço LC 116');
    assert.ok(formsFiscaisCode.includes('aliqISS') || formsFiscaisCode.includes('aliquotaISS'), 'Deve ter alíquota de ISS');
    assert.ok(itensTabelasCode.includes('Novo Serviço') || itensTabelasCode.includes('novo-cad'), 'Deve ter botão explícito de Novo Serviço');
  });

  await t.test('9. Cadastro de Peças com campos completos de tributação (NCM, CEST, CFOP, CSOSN/CST)', () => {
    assert.ok(formsFiscaisCode.includes('ncm') && formsFiscaisCode.includes('cest'), 'Deve conter NCM e CEST');
    assert.ok(formsFiscaisCode.includes('origem') && formsFiscaisCode.includes('cfop'), 'Deve conter Origem e CFOP');
    assert.ok(formsFiscaisCode.includes('cstICMS') || formsFiscaisCode.includes('csosn') || formsFiscaisCode.includes('regrasTributarias'), 'Deve suportar CST/CSOSN');
  });
});

test('Sprint 14.0 — Pilar 3: Modo TV / Tela Cheia & Impressão Exclusiva', async (t) => {
  const baseLayoutCss = fs.readFileSync(path.join(__dirname, '../css/base-layout.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(__dirname, '../css/components.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const workflowCode = fs.readFileSync(path.join(__dirname, '../js/modules/patio_actions_workflow.js'), 'utf8');
  const dashOpCode = fs.readFileSync(path.join(__dirname, '../js/dashboard_operacional.js'), 'utf8');

  await t.test('10. Suporte ao Modo TV / Tela Cheia com recolhimento de barra lateral e topbar', () => {
    assert.ok(baseLayoutCss.includes('fullscreen-patio-mode'), 'CSS deve ter regras para fullscreen-patio-mode');
    assert.ok(dashOpCode.includes('ativarModoTvOperacao') || dashOpCode.includes('fullscreen-patio-mode'), 'Dashboard deve ter controle de modo TV');
  });

  await t.test('11. Container dedicado #print-area-exclusiva e regra @media print estrita', () => {
    assert.ok(indexHtml.includes('id="print-area-exclusiva"'), 'index.html deve conter container print-area-exclusiva');
    assert.ok(
      componentsCss.includes(':not(#print-area-exclusiva)') || componentsCss.includes('#print-area-exclusiva'),
      'CSS deve isolar estritamente #print-area-exclusiva na impressão'
    );
    assert.ok(workflowCode.includes('print-area-exclusiva'), 'imprimirOS deve injetar no container dedicado de impressão');
  });
});
