'use strict';

/**
 * tests/sprint120_stability_patch_fiscal_xml_3d_ui.test.cjs
 * Suíte de Testes TDD — Sprint 12.0:
 * Pilar 1: 8 Bloqueadores de Runtime e UI (Zero Cliques Mortos)
 * Pilar 2: Busca Automática de XML NF-e Contra CNPJ da Empresa (Multi-Empresa)
 * Pilar 3: Redesign Visual Enterprise (3D / Glassmorphism)
 *
 * Teto Modular: <= 350 linhas
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Carrega os módulos de serviço backend
const nfeDistributionService = require('../services/fiscal/nfeDistributionService');
const { gerarUuidSeguro } = require('../js/modules/uuid_fallback');
require('../js/modules/automations_modal');

test('Sprint 12.0 — Pilar 1: Correção dos Bloqueadores de Runtime & UI', async (t) => {
  await t.test('1. Fallback Universal para crypto.randomUUID (Contexto HTTP / Rede Local)', () => {
    // 1.1 Deve gerar UUID válido com regex RFC-4122 v4
    const uuid1 = gerarUuidSeguro();
    assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // 1.2 Verifica se window/globalThis recebeu gerarUuidSeguro
    assert.equal(typeof globalThis.gerarUuidSeguro, 'function');
  });

  await t.test('2. Roteamento SPA e Função navegarPara', () => {
    global.S = { ui: { view: 'patio' } };
    global.renderNav = () => {};
    global.fecharFolha = () => {};
    global.carregarEstado = () => Promise.resolve();
    global.iniciarPollingSincronizacao = () => {};

    // Carrega app.js
    const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
    eval(appCode);

    global.render = () => { global.renderChamado = true; };
    if (typeof window !== 'undefined') window.render = global.render;
    if (typeof globalThis !== 'undefined') globalThis.render = global.render;

    assert.equal(typeof global.navegarPara, 'function', 'navegarPara deve ser exposta globalmente');
    global.navegarPara('fiscal');
    assert.equal(global.S.ui.view, 'fiscal', 'Deve alternar S.ui.view para fiscal');
    assert.equal(global.renderChamado, true, 'Deve disparar render()');
  });

  await t.test('3. Gatilho de Cadastro & Consulta de Nova Placa via API (Abertura de OS)', () => {
    global.S = {
      ui: { rascunho: { box: 'b1', km: 120000 } },
      clientes: [{ id: 'cli_1', nome: 'Transportes Silva' }],
      veiculos: []
    };
    global.abrirFolha = (fn) => { global.folhaAberta = fn; };
    global.torrar = () => {};

    const cadFormsCode = fs.readFileSync(path.join(__dirname, '../js/modules/cadastros_forms.js'), 'utf8');
    eval(cadFormsCode);

    assert.equal(typeof global.abrirCadastroVeiculoParaOS, 'function', 'abrirCadastroVeiculoParaOS deve existir');
    global.abrirCadastroVeiculoParaOS();

    assert.equal(global.S.ui.cadTipo, 'veiculo');
    assert.equal(global.S.ui.veiculoRetornoOS, true);
    assert.equal(global.S.ui.rascunhoOSPreservado.box, 'b1', 'Deve preservar rascunho da OS');
  });

  await t.test('4. Gatilho de Cadastro & Consulta de CNPJ na Nova Venda', () => {
    global.S = {
      ui: {
        rascVenda: {
          clienteId: '',
          pecas: [{ pecaId: 'p1', qtd: 2, valor: 150 }],
          servicos: [],
          desconto: 10
        }
      },
      clientes: []
    };
    global.abrirFolha = (fn) => { global.folhaAberta = fn; };

    const pdvCode = fs.readFileSync(path.join(__dirname, '../js/modules/vendas_pdv_form.js'), 'utf8');
    eval(pdvCode);

    assert.equal(typeof global.abrirCadastroClienteParaVenda, 'function', 'abrirCadastroClienteParaVenda deve existir');
    global.abrirCadastroClienteParaVenda();

    assert.equal(global.S.ui.cadTipo, 'cliente');
    assert.equal(global.S.ui.retornoVenda, true);
    assert.equal(global.S.ui.rascVenda.pecas.length, 1, 'Itens do carrinho devem ser preservados');
    assert.equal(global.S.ui.rascVenda.desconto, 10, 'Desconto deve ser preservado');
  });

  await t.test('5. Bloqueio Estrito de Valores Negativos em Nova Venda e OS', () => {
    let mensagemErro = '';
    global.torrar = (msg, tipo) => { if (tipo === 'erro') mensagemErro = msg; };
    global.salvar = () => {};
    global.fecharFolha = () => {};
    global.render = () => {};

    // Venda com desconto negativo
    global.S.ui.rascVenda = {
      clienteId: 'cli_1',
      pecas: [{ pecaId: 'p1', qtd: 1, valor: 100 }],
      servicos: [],
      desconto: -50
    };
    global.salvarNovaVendaConfirmada();
    assert.match(mensagemErro, /não podem ser negativos/i);

    // Venda com quantidade negativa
    mensagemErro = '';
    global.S.ui.rascVenda = {
      clienteId: 'cli_1',
      pecas: [{ pecaId: 'p1', qtd: -2, valor: 100 }],
      servicos: [],
      desconto: 0
    };
    global.salvarNovaVendaConfirmada();
    assert.match(mensagemErro, /não podem ser negativos/i);
  });

  await t.test('6. Modal Interativo de Confirmação para Remoção de Dados de Exemplo', () => {
    const sisConfigCode = fs.readFileSync(path.join(__dirname, '../js/modules/events_sistema_config.js'), 'utf8');
    eval(sisConfigCode);

    assert.equal(typeof global.modalConfirmacaoRemoverDemo, 'function');
    assert.equal(typeof global.abrirModalConfirmacaoRemoverDemo, 'function');

    const htmlModal = global.modalConfirmacaoRemoverDemo();
    assert.ok(htmlModal.includes('Confirmar Exclusão dos Dados de Demonstração'), 'Deve conter botão explícito de confirmação');
    assert.ok(htmlModal.includes('Cancelar'), 'Deve conter botão cancelar');
  });

  await t.test('7. Central de Automações — Ativação de Regras e Vistoria de Entrega', () => {
    global.S = {
      cfg: {
        automacoesReceitas: null,
        automacaoVistoriaEntregaAtiva: false
      }
    };
    global.salvar = () => { global.salvouCfg = true; };
    global.torrar = () => {};

    const automCode = fs.readFileSync(path.join(__dirname, '../js/modules/automations_modal.js'), 'utf8');
    eval(automCode);

    assert.equal(typeof global.alternarGatilhoVistoriaEntrega, 'function');
    global.alternarGatilhoVistoriaEntrega();
    assert.equal(global.S.cfg.automacaoVistoriaEntregaAtiva, true, 'Deve ativar vistoria de entrega');
    assert.equal(global.salvouCfg, true, 'Deve persistir no backend');

    // Alterna de volta
    global.alternarGatilhoVistoriaEntrega();
    assert.equal(global.S.cfg.automacaoVistoriaEntregaAtiva, false, 'Deve desativar vistoria de entrega');
  });
});

test('Sprint 12.0 — Pilar 2: Busca Automática de XML NF-e Contra CNPJ da Empresa (Multi-Empresa)', async (t) => {
  await t.test('8. Validação de CNPJ Dinâmico da Empresa Ativa', () => {
    // 8.1 Sem CNPJ configurado deve disparar erro orientativo
    const stateSemCnpj = { config: { empresa: { cnpj: '' } }, emitente: {}, cfg: {} };
    assert.throws(
      () => nfeDistributionService.buscarXmlsDestinatario(stateSemCnpj),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'CNPJ_NAO_CONFIGURADO');
        assert.match(err.message, /Emitente e parâmetros/i);
        return true;
      }
    );

    // 8.2 Com CNPJ configurado dinamicamente
    const stateComCnpj = {
      config: { empresa: { cnpj: '12.345.678/0001-95' } },
      pecas: [],
      contasPagar: []
    };
    const res = nfeDistributionService.buscarXmlsDestinatario(stateComCnpj);
    assert.equal(res.success, true);
    assert.equal(res.cnpjConsultado, '12345678000195');
    assert.ok(res.xmls.length >= 2, 'Deve capturar lote de XMLs para o destinatário');
    assert.equal(res.xmls[0].chave.length, 44, 'Chave de acesso deve ter 44 dígitos');
  });

  await t.test('9. Recálculo de Custo Médio Ponderado (CMP)', () => {
    // Fórmula: CMP = (QtdAnt * CustoAnt + QtdEntr * CustoEntr) / (QtdAnt + QtdEntr)
    // Exemplo: 10 peças a R$ 100 + 10 peças a R$ 200 = 20 peças a R$ 150
    const cmp1 = nfeDistributionService.recalcularCMP(10, 100, 10, 200);
    assert.equal(cmp1, 150.00);

    // Exemplo: 4 peças a R$ 350 + 2 peças a R$ 500 = 6 peças a R$ 400
    const cmp2 = nfeDistributionService.recalcularCMP(4, 350, 2, 500);
    assert.equal(cmp2, 400.00);
  });

  await t.test('10. Importação de XML com 1 Clique (Almoxarifado CMP & Contas a Pagar)', () => {
    const state = {
      config: { empresa: { cnpj: '12.345.678/0001-95' } },
      pecas: [
        {
          id: 'p_scania',
          cod: 'DAN-7320',
          nome: 'Feixe de Molas Traseiro 9 Lâminas Scania Série 4/PGR',
          qtd: 2,
          custo: 1200.00
        }
      ],
      contasPagar: []
    };

    // 1. Busca os XMLs emitidos contra o CNPJ
    const busca = nfeDistributionService.buscarXmlsDestinatario(state);
    const xmlDana = busca.xmls.find(x => x.fornecedorNome.includes('DANA')) || busca.xmls[0];

    // 2. Importa o XML
    const imp = nfeDistributionService.importarXmlParaEstoqueEFinanceiro(state, xmlDana.chave);
    assert.equal(imp.success, true);
    assert.ok(imp.contaPagarId);
    assert.equal(imp.itensImportados, 2);

    // 3. Verifica se a peça existente teve estoque somado e CMP recalculado
    const pecaScania = state.pecas.find(p => p.cod === 'DAN-7320');
    assert.ok(pecaScania);
    // Tinha 2 a R$ 1200 + Entrou 2 a R$ 1450 => Total 4 peças a R$ 1325
    assert.equal(pecaScania.qtd, 4);
    assert.equal(pecaScania.custo, 1325.00);

    // 4. Verifica geração de Contas a Pagar
    const conta = state.contasPagar.find(c => c.id === imp.contaPagarId);
    assert.ok(conta);
    assert.equal(conta.tipo, 'pagar');
    assert.equal(conta.st, 'pendente');
    assert.equal(conta.valor, xmlDana.valorTotal);
    assert.equal(conta.chaveNFe, xmlDana.chave);

    // 5. Tentativa de reimportar o mesmo XML deve sinalizar jaImportado
    const reimp = nfeDistributionService.importarXmlParaEstoqueEFinanceiro(state, xmlDana.chave);
    assert.equal(reimp.jaImportado, true);
  });
});

test('Sprint 12.0 — Pilar 3: Redesign Visual Enterprise (3D / Glassmorphism)', async (t) => {
  await t.test('11. Classes e Regras CSS de Botões 3D, Glassmorphism e Focus Rings', () => {
    const cssComponents = fs.readFileSync(path.join(__dirname, '../css/components.css'), 'utf8');
    const cssBase = fs.readFileSync(path.join(__dirname, '../css/base-layout.css'), 'utf8');

    assert.ok(cssComponents.includes('.btn-3d') || cssComponents.includes('border-bottom: 3px solid'), 'Deve conter botões com profundidade 3D');
    assert.ok(cssComponents.includes('backdrop-filter: blur'), 'Deve conter modais com glassmorphism backdrop blur');
    assert.ok(cssComponents.includes('pulse-glow'), 'Deve conter animação pulsante para status badges');
    assert.ok(cssComponents.includes('focus-visible'), 'Deve conter regras focus-visible iluminadas');
    assert.ok(cssBase.includes('#0b1120') || cssBase.includes('#111827'), 'Sidebar deve adotar paleta metálica industrial profunda');
  });
});
