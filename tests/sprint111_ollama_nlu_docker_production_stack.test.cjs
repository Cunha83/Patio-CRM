'use strict';

/**
 * tests/sprint111_ollama_nlu_docker_production_stack.test.cjs
 *
 * Suíte de Testes TDD da Sprint 11.1:
 * 1. Extração de Entidades e Tool Calling via NLU (Ollama / Fallback)
 * 2. Resiliência de Fallback Determinístico e Guarda RBAC 403
 * 3. Monitor de Prontidão de Produção e Blueprint Docker com GPU NVIDIA
 * 4. Endpoints REST e Componentes de UI/Actions
 *
 * Teto Modular: <= 350 linhas
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  configurarProvedorNluWhatsApp,
  extrairEntidadesTexto,
  interpretarMensagemNluHibrido,
  rotearMensagemComNluParaSkill
} = require('../services/whatsapp/whatsappLocalLlmNluService');

const {
  gerarConfiguracaoStackProducao,
  executarHealthcheckIntegradoProducao
} = require('../services/ops/productionDockerStackService');

function criarEstadoMock() {
  return {
    clientes: [
      { id: 'cli_transp_ceara', nome: 'Transportadora Ceará Express', telefone: '5585988881111', politicaCredito: { limiteCredito: 10000, diasToleranciaAtraso: 5, bloqueioAutomatico: true } }
    ],
    veiculos: [
      { placa: 'ABC1D23', clienteId: 'cli_transp_ceara', modelo: 'Volvo FH 540', ano: 2022 }
    ],
    borderos: [],
    contas: [],
    paymentCharges: [],
    patioBoxes: [
      { id: 'box_01', numero: '01', status: 'livre', tipoBox: 'pesado_mola' }
    ],
    os: [],
    whatsappGatewayConfig: { ativo: true, instanceName: 'patio-oficial', baseUrl: 'http://localhost:8080' },
    whatsappOutboundQueue: [],
    whatsappNluTelemetryLogs: [],
    productionHealthLogs: []
  };
}

test('Sprint 11.1 — Task 1: [NLU] Extração de Entidades e Tool Calling Híbrido com Execução de Skill', async (t) => {
  const state = criarEstadoMock();

  configurarProvedorNluWhatsApp(state, {
    provedorPrimario: 'ollama_local',
    modeloOllama: 'qwen2.5-coder:7b',
    limiarConfiancaMinimo: 0.75
  });

  // 1. Extração pura de entidades via Regex-NLU
  const msgEntrada = 'Bom dia, o caminhão placa ABC-1D23 chegou na portaria com 412500 km para fazer triagem';
  const entidades = extrairEntidadesTexto(msgEntrada);
  assert.equal(entidades.placa, 'ABC1D23');
  assert.equal(entidades.kmEntrada, 412500);

  // 2. Interpretação NLU híbrida com Tool Calling simulado do Ollama
  const interpretacao = interpretarMensagemNluHibrido(state, {
    mensagem: msgEntrada,
    respostaLlmSimulada: {
      skillAlvo: 'SKILL_RECEPCAO_PATIO',
      acaoEspecifica: 'triagem_360',
      confianca: 0.98,
      entidadesExtraidas: { placa: 'ABC1D23', kmEntrada: 412500 }
    }
  });

  assert.equal(interpretacao.skillAlvo, 'SKILL_RECEPCAO_PATIO');
  assert.equal(interpretacao.acaoEspecifica, 'triagem_360');
  assert.equal(interpretacao.entidadesExtraidas.placa, 'ABC1D23');
  assert.equal(interpretacao.fallbackAcionado, false);
  assert.equal(interpretacao.provedorExecutado, 'qwen2.5-coder:7b');

  // 3. Roteamento com NLU e despacho direto para a Skill de Recepção de Pátio
  const dispatchRes = rotearMensagemComNluParaSkill(state, {
    mensagem: msgEntrada,
    perfilRemetente: 'cliente',
    respostaLlmSimulada: {
      skillAlvo: 'SKILL_RECEPCAO_PATIO',
      acaoEspecifica: 'triagem_360',
      confianca: 0.98,
      entidadesExtraidas: { placa: 'ABC1D23', kmEntrada: 412500 }
    }
  });

  assert.ok(dispatchRes.resultadoSkill);
  const dadosOp = dispatchRes.resultadoSkill.dadosOperacionais || dispatchRes.resultadoSkill;
  assert.equal(dadosOp.placa, 'ABC1D23');
  assert.equal(dadosOp.clienteId, 'cli_transp_ceara');
  assert.ok(dadosOp.boxLivreRecomendado);
  assert.equal(state.whatsappNluTelemetryLogs.length >= 2, true, 'Deve registrar telemetria NLU');
});

test('Sprint 11.1 — Task 2: [NLU] Resiliência de Fallback Determinístico e Guarda RBAC 403', async (t) => {
  const state = criarEstadoMock();

  // 1. Fallback Determinístico imediato quando Ollama simula falha
  const msgOrcamento = 'Gostaria de saber quanto fica o pré-orçamento para trocar feixe de molas';
  const fallbackRes = interpretarMensagemNluHibrido(state, {
    mensagem: msgOrcamento,
    simularFalhaOllama: true
  });

  assert.equal(fallbackRes.skillAlvo, 'SKILL_ORCAMENTISTA_TECNICO');
  assert.equal(fallbackRes.acaoEspecifica, 'gerar_pre_orcamento_cmp');
  assert.equal(fallbackRes.fallbackAcionado, true);
  assert.equal(fallbackRes.provedorExecutado, 'heuristico_deterministico');

  // 2. Fallback de Compras com Mínimo 3 Fornecedores
  const msgCompras = 'Favor abrir cotação de compras com fornecedores para feixe de mola';
  const comprasNlu = interpretarMensagemNluHibrido(state, {
    mensagem: msgCompras,
    simularFalhaOllama: true
  });
  assert.equal(comprasNlu.skillAlvo, 'SKILL_COMPRAS_FORNECEDORES');

  // 3. Guarda RBAC: Cliente comum tenta acionar comando gerencial (DRE / Briefing)
  assert.throws(() => {
    rotearMensagemComNluParaSkill(state, {
      mensagem: 'Envie o briefing da diretoria e DRE gerencial do mês',
      perfilRemetente: 'cliente'
    });
  }, { code: 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL' });

  // 4. Perfil autorizado (gerencia/admin) executa comando gerencial com sucesso
  const resGerencia = rotearMensagemComNluParaSkill(state, {
    mensagem: 'Envie o briefing da diretoria e DRE gerencial do mês',
    perfilRemetente: 'gerencia'
  });
  assert.ok(resGerencia.resultadoSkill);
  assert.equal(resGerencia.interpretacaoNlu.skillAlvo, 'SKILL_ANALISTA_FINANCEIRO');
});

test('Sprint 11.1 — Task 3: [Ops] Blueprint Docker Compose (Ollama GPU + Evolution) e Healthcheck Integrado', async (t) => {
  const state = criarEstadoMock();

  // 1. Geração de blueprint Docker Compose com GPU NVIDIA
  const blueprint = gerarConfiguracaoStackProducao(state, {
    portaApp: 3000,
    portaEvolution: 8080,
    portaOllama: 11434,
    modeloOllama: 'qwen2.5-coder:7b',
    usarGpuNvidia: true
  });

  assert.equal(blueprint.versaoCompose, '3.8');
  assert.equal(blueprint.usarGpuNvidia, true);
  assert.ok(blueprint.servicos.includes('patio-crm-app'));
  assert.ok(blueprint.servicos.includes('evolution-api-whatsapp'));
  assert.ok(blueprint.servicos.includes('ollama-local-llm'));
  assert.ok(blueprint.dockerComposeYaml.includes('capabilities: [gpu]'), 'Deve configurar suporte a GPU no Ollama');
  assert.ok(blueprint.envExample.includes('NODE_ENV=production'));
  assert.ok(blueprint.comandosSetup.length >= 3);

  // 2. Healthcheck Integrado da Stack
  const diagnostico = executarHealthcheckIntegradoProducao(state);
  assert.ok(diagnostico.scoreProntidaoInfra >= 75);
  assert.equal(diagnostico.prontoParaProducao, true);
  assert.equal(diagnostico.nivelProntidao, 'producao_aprovada');
  assert.equal(diagnostico.componentes.coreErpDatabase.status, 'operacional');
  assert.equal(diagnostico.componentes.evolutionGateway.status, 'operacional');
  assert.equal(diagnostico.componentes.ollamaLocalNlu.status, 'operacional');
  assert.equal(state.productionHealthLogs.length, 1);
});

test('Sprint 11.1 — Task 4: [UI/REST] Componentes Visuais de UI e Ações do NLU e Monitor de Stack', async (t) => {
  const uiModule = require('../js/modules/whatsapp_nlu_producao_ui');
  const actionsModule = require('../js/modules/whatsapp_nlu_producao_actions');

  const html = globalThis.renderPainelNluOllamaEStackProducaoHtml({
    nluConfig: { modeloOllama: 'qwen2.5-coder:7b', ativo: true },
    healthcheck: {
      scoreProntidaoInfra: 100,
      prontoParaProducao: true,
      componentes: {
        coreErpDatabase: { status: 'operacional', score: 25 },
        evolutionGateway: { status: 'operacional', score: 25 },
        ollamaLocalNlu: { status: 'operacional', score: 25 },
        bankApiConnector: { status: 'operacional', score: 25 }
      }
    },
    logsNlu: [{ mensagem: 'teste nlu', skillAlvo: 'SKILL_RECEPCAO_PATIO', acaoEspecifica: 'triagem_360', confianca: 0.95, provedorExecutado: 'qwen2.5-coder:7b', fallbackAcionado: false }]
  });

  assert.match(html, /Motor NLU Híbrido \(Ollama GPU\) & Stack de Produção/);
  assert.match(html, /data-act="abrir-config-nlu-ollama"/);
  assert.match(html, /data-act="abrir-docker-blueprint-btn"/);
  assert.match(html, /data-act="atualizar-healthcheck-stack-btn"/);
  assert.match(html, /data-act="testar-nlu-mensagem-btn"/);

  const modalNlu = globalThis.modalConfigurarNluOllamaHtml({ modeloOllama: 'qwen2.5-coder:7b' });
  assert.match(modalNlu, /modalConfigurarNluOllama/);

  const modalDocker = globalThis.modalVisualizarDockerBlueprintHtml({ versaoCompose: '3.8', comandosSetup: ['docker compose up -d'] });
  assert.match(modalDocker, /modalVisualizarDockerBlueprint/);

  assert.equal(typeof globalThis.abrirModalConfigurarNluOllama, 'function');
  assert.equal(typeof globalThis.salvarConfiguracaoNluOllamaAction, 'function');
  assert.equal(typeof globalThis.testarMensagemNluWhatsAppAction, 'function');
  assert.equal(typeof globalThis.executarHealthcheckStackProducaoAction, 'function');
  assert.equal(typeof globalThis.abrirModalDockerBlueprint, 'function');
});
