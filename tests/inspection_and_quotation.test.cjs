'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const inspectionService = require('../services/inspectionService');
const quotationService = require('../services/quotationService');
const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const operationalSummaryService = require('../services/operationalSummaryService');
const voiceActionEngine = require('../services/voiceActionEngine');
const {
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('../lib/tokens/securityToken');

function criarEstadoMock(tenantId = 'oficina_teste') {
  return {
    versao: 1,
    cfg: { empresa: 'Oficina Teste Pesada' },
    os: [
      {
        id: 'os_101',
        num: 1044,
        vei: 'vei_scania_1',
        cli: 'cli_frota_1',
        placa: 'ABC1D23',
        st: 'fila',
        abertura: '2026-09-11',
        km: 245000,
        servicos: [],
        pecas: [],
        motivo: 'Direção puxando e estalo no freio dianteiro'
      }
    ],
    veiculos: [
      { id: 'vei_scania_1', placa: 'ABC1D23', modelo: 'R 450', marca: 'Scania', km: 245000, cli: 'cli_frota_1' }
    ],
    clientes: [
      { id: 'cli_frota_1', nome: 'Transportadora TransRodovias', fone: '5562999990001' }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    auditoria: [],
    inspections: [],
    quotations: [],
    operationalEvents: [],
    operationalSnapshots: []
  };
}

/* ── 1. CRIAÇÃO DE INSPEÇÃO TÉCNICA ────────────────────────────── */
test('1. Criação de Inspeção: cria com status em_inspecao, vinculada a OS e veículo', () => {
  const state = criarEstadoMock();
  const res = inspectionService.criarInspecao({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    mechanicId: 'mec_valdir',
    mecanico: 'Valdir Chefe',
    reclamacaoCliente: 'Direção puxando para a direita',
    actorId: 'operador_1'
  });

  assert.equal(res.ok, true);
  assert.ok(res.inspection.id.startsWith('insp_'));
  assert.equal(res.inspection.status, 'em_inspecao');
  assert.equal(res.inspection.placa, 'ABC1D23');
  assert.equal(res.inspection.mecanico, 'Valdir Chefe');
  assert.equal(state.inspections.length, 1);
  assert.equal(state.os[0].inspectionId, res.inspection.id);
  assert.equal(state.os[0].st, 'diagnostico');
});

/* ── 2. ISOLAMENTO DE INSPEÇÃO POR TENANT ──────────────────────── */
test('2. Isolamento de Inspeção por Tenant: Tenant A jamais enxerga ou altera inspeção do Tenant B', () => {
  const state = criarEstadoMock();
  const resA = inspectionService.criarInspecao({
    tenantId: 'tenant_alfa',
    state,
    osId: 'os_101',
    actorId: 'user_a'
  });

  // Consulta por Tenant Alfa (autorizado)
  const inspAlfa = inspectionService.obterInspecao({
    tenantId: 'tenant_alfa',
    state,
    inspectionId: resA.inspection.id
  });
  assert.ok(inspAlfa);
  assert.equal(inspAlfa.id, resA.inspection.id);

  // Consulta por Tenant Beta (deve retornar null)
  const inspBeta = inspectionService.obterInspecao({
    tenantId: 'tenant_beta',
    state,
    inspectionId: resA.inspection.id
  });
  assert.equal(inspBeta, null);

  // Listagem isolada
  const listaBeta = inspectionService.listarInspecoes({ tenantId: 'tenant_beta', state });
  assert.equal(listaBeta.length, 0);
});

/* ── 3. DIAGNÓSTICO HUMANO CONFIRMADO (RECUSA DE IA AUTÔNOMA) ─── */
test('3. Diagnóstico Humano Confirmado: registro explícito do mecânico e recusa estrita de IA autônoma', () => {
  const state = criarEstadoMock();
  const resInsp = inspectionService.criarInspecao({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101'
  });

  const resItem = inspectionService.adicionarItemInspecao({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    item: {
      categoria: 'direcao',
      componente: 'Terminal de Direção Direito',
      descricao: 'Folga excessiva na articulação esférica',
      condicao: 'desgaste',
      severidade: 'critico'
    }
  });
  assert.equal(resItem.ok, true);

  // Tentativa 1: Fechamento por IA / Sistema autônomo (DEVE SER REJEITADO)
  const resIA = inspectionService.confirmarDiagnosticoHumano({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    itemId: resItem.item.id,
    diagnosticoConfirmado: 'Trocar terminal imediatamente',
    confirmedBy: 'IA'
  });
  assert.equal(resIA.ok, false);
  assert.match(resIA.error, /não podem? ser validados? de forma autônoma/i);

  // Tentativa 2: Sem informar mecânico humano
  const resSemNome = inspectionService.confirmarDiagnosticoHumano({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    itemId: resItem.item.id,
    diagnosticoConfirmado: 'Folga confirmada',
    confirmedBy: ''
  });
  assert.equal(resSemNome.ok, false);

  // Tentativa 3: Confirmação legítima por mecânico autorizado
  const resValido = inspectionService.confirmarDiagnosticoHumano({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    itemId: resItem.item.id,
    diagnosticoConfirmado: 'Folga radial excessiva de 4mm no terminal esquerdo com risco de desprendimento da barra',
    confirmedBy: 'Mecânico Carlos Silva - Registro #402',
    actorId: 'carlos_silva'
  });
  assert.equal(resValido.ok, true);
  assert.equal(resValido.item.diagnostico.confirmado, true);
  assert.equal(resValido.item.diagnostico.confirmadoPor, 'Mecânico Carlos Silva - Registro #402');
  assert.ok(resValido.item.diagnostico.confirmadoEm);
  assert.equal(resValido.item.status, 'diagnosticado');
});

/* ── 4. ADIÇÃO DE FOTOS E SERVIÇOS RECOMENDADOS ─────────────────── */
test('4. Adição de Fotos e Serviços Recomendados na Inspeção', () => {
  const state = criarEstadoMock();
  const resInsp = inspectionService.criarInspecao({ tenantId: 'oficina_teste', state, osId: 'os_101' });
  const resItem = inspectionService.adicionarItemInspecao({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    item: { componente: 'Tambor de Freio Dianteiro' }
  });

  // Anexa foto Base64
  const resFoto = inspectionService.adicionarFotoItem({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    itemId: resItem.item.id,
    fotoBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
    descricao: 'Trinca na pista de frenagem'
  });
  assert.equal(resFoto.ok, true);
  assert.equal(resItem.item.fotos.length, 1);

  // Adiciona serviço recomendado
  const resServ = inspectionService.adicionarServicoRecomendado({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    itemId: resItem.item.id,
    servico: {
      tipo: 'servico',
      nome: 'Substituição dos Tambores e Ajuste de Lonas',
      quantidade: 1,
      valorEstimado: 350.00
    }
  });
  assert.equal(resServ.ok, true);
  assert.equal(resItem.item.servicosRecomendados.length, 1);

  // Adiciona peça recomendada
  const resPeca = inspectionService.adicionarServicoRecomendado({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    itemId: resItem.item.id,
    servico: {
      tipo: 'peca',
      nome: 'Tambor de Freio Scania Série 5',
      quantidade: 2,
      valorEstimado: 850.00
    }
  });
  assert.equal(resPeca.ok, true);
  assert.equal(resItem.item.servicosRecomendados.length, 2);
});

/* ── 5. CONCLUSÃO E CANCELAMENTO DA INSPEÇÃO ───────────────────── */
test('5. Conclusão e Cancelamento da Inspeção Técnica com Atualização de Status da OS', () => {
  const state = criarEstadoMock();
  const resInsp = inspectionService.criarInspecao({ tenantId: 'oficina_teste', state, osId: 'os_101' });

  const resConc = inspectionService.concluirInspecao({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp.inspection.id,
    laudoGeral: 'Inspeção geral dianteira concluída com sucesso.',
    actorId: 'gerente_patio'
  });

  assert.equal(resConc.ok, true);
  assert.equal(resConc.inspection.status, 'concluida');
  assert.ok(resConc.inspection.concluidoEm);
  assert.equal(state.os[0].st, 'aprovacao');

  // Cancelamento
  const resInsp2 = inspectionService.criarInspecao({ tenantId: 'oficina_teste', state, osId: 'os_101' });
  const resCanc = inspectionService.cancelarInspecao({
    tenantId: 'oficina_teste',
    state,
    inspectionId: resInsp2.inspection.id,
    motivo: 'Veículo retirado a pedido do cliente'
  });
  assert.equal(resCanc.ok, true);
  assert.equal(resCanc.inspection.status, 'cancelada');
});

/* ── 6. CRIAÇÃO DE ORÇAMENTO COMERCIAL ─────────────────────────── */
test('6. Criação de Orçamento: monta itens a partir de serviços e peças com códigos determinísticos', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [
      { tipo: 'servico', nome: 'Mão de Obra Suspensão', quantidade: 1, valorUnitario: 450.00 },
      { tipo: 'peca', nome: 'Pivô de Suspensão', quantidade: 2, valorUnitario: 220.00 }
    ],
    descontoGeral: 40.00
  });

  assert.equal(resOrc.ok, true);
  assert.equal(resOrc.quotation.codigo, 'ORC-1044-v1');
  assert.equal(resOrc.quotation.versao, 1);
  assert.equal(resOrc.quotation.status, 'rascunho');
  assert.equal(resOrc.quotation.itens.length, 2);
  assert.equal(state.quotations.length, 1);
  assert.equal(state.os[0].quotationId, resOrc.quotation.id);
});

/* ── 7. CÁLCULO FINANCEIRO DETERMINÍSTICO ──────────────────────── */
test('7. Cálculo Financeiro Determinístico: subtotais de serviços, peças, descontos e total líquido precisos', () => {
  const itens = [
    { tipo: 'servico', valorUnitario: 350.50, quantidade: 2 }, // 701.00
    { tipo: 'peca', valorUnitario: 125.25, quantidade: 4 }      // 501.00
  ];
  const totais = quotationService.calcularTotais(itens, 52.00);

  assert.equal(totais.subtotalServicos, 701.00);
  assert.equal(totais.subtotalPecas, 501.00);
  assert.equal(totais.descontoGeral, 52.00);
  assert.equal(totais.totalGeral, 1150.00); // 701 + 501 - 52 = 1150.00
  assert.equal(totais.totalAprovado, 0);    // Nenhum aprovado ainda
});

/* ── 8. VERSIONAMENTO DO ORÇAMENTO (v1 -> v2) ──────────────────── */
test('8. Versionamento do Orçamento: alteração gera versão v2, arquiva anterior no histórico e revoga tokens antigos', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ tipo: 'servico', nome: 'Alinhamento de Eixo', quantidade: 1, valorUnitario: 300 }]
  });

  // Emite token para v1
  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });
  assert.equal(resEnvio.ok, true);

  // Gera v2 com novos itens
  const resV2 = quotationService.criarNovaVersao({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id,
    novosItens: [
      { tipo: 'servico', nome: 'Alinhamento de Eixo Completo', quantidade: 1, valorUnitario: 350 },
      { tipo: 'peca', nome: 'Barra de Ligação', quantidade: 1, valorUnitario: 600 }
    ],
    motivo: 'Detectada necessidade de trocar barra de ligação'
  });

  assert.equal(resV2.ok, true);
  assert.equal(resV2.quotation.versao, 2);
  assert.equal(resV2.quotation.codigo, 'ORC-1044-v2');
  assert.equal(resV2.quotation.totalGeral, 950.00);
  assert.equal(resV2.quotation.historicoVersoes.length, 1);
  assert.equal(resV2.quotation.historicoVersoes[0].versao, 1);
  assert.equal(resV2.quotation.activeTokenHash, null); // Token v1 revogado!
});

/* ── 9. ENVIO DO ORÇAMENTO E TOKEN CRIPTOGRÁFICO ───────────────── */
test('9. Envio do Orçamento: gera token criptográfico HMAC SHA-256 e link seguro de aprovação', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ tipo: 'servico', nome: 'Revisão', quantidade: 1, valorUnitario: 200 }]
  });

  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id,
    canal: 'whatsapp',
    validadeHoras: 48,
    baseUrl: 'https://oficina.patiocrm.com.br'
  });

  assert.equal(resEnvio.ok, true);
  assert.ok(resEnvio.token.includes('.'));
  assert.ok(resEnvio.linkAprovacao.startsWith('https://oficina.patiocrm.com.br/aprovacao/'));
  assert.equal(resOrc.quotation.status, 'enviado');
  assert.ok(resOrc.quotation.enviadoEm);
});

/* ── 10. VALIDAÇÃO DE TOKEN VÁLIDO ─────────────────────────────── */
test('10. Validação de Token Válido: integridade de assinatura e extração segura do payload', () => {
  const state = criarEstadoMock();
  const token = gerarTokenAprovacaoOrcamento({
    tenantId: 'oficina_teste',
    quotationId: 'orc_999',
    version: 1,
    customerId: 'cli_1',
    ttlMs: 60 * 60 * 1000
  });

  const validacao = validarTokenAprovacaoOrcamento(token);
  assert.equal(validacao.ok, true);
  assert.equal(validacao.payload.tenantId, 'oficina_teste');
  assert.equal(validacao.payload.quotationId, 'orc_999');
  assert.equal(validacao.payload.version, 1);
  assert.equal(validacao.payload.action, 'quotation_approval');
});

/* ── 11. REJEIÇÃO DE TOKEN EXPIRADO ────────────────────────────── */
test('11. Rejeição Estrita de Token Expirado após o decurso do TTL', () => {
  const tokenExpirado = gerarTokenAprovacaoOrcamento({
    tenantId: 'oficina_teste',
    quotationId: 'orc_999',
    version: 1,
    ttlMs: -1000 // Já expirado
  });

  const validacao = validarTokenAprovacaoOrcamento(tokenExpirado);
  assert.equal(validacao.ok, false);
  assert.equal(validacao.expirado, true);
  assert.match(validacao.error, /expirou/i);
});

/* ── 12. REVOGAÇÃO AUTOMÁTICA DE TOKEN AO PUBLICAR V2 ──────────── */
test('12. Revogação Automática de Token de Versão Anterior ao publicar v2', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ tipo: 'servico', nome: 'Serviço Base', quantidade: 1, valorUnitario: 100 }]
  });

  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });

  // Atualiza para v2
  quotationService.criarNovaVersao({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id,
    novosItens: [{ tipo: 'servico', nome: 'Serviço Modificado', quantidade: 1, valorUnitario: 150 }]
  });

  // Tenta consultar com o token da v1
  const consulta = quotationService.consultarPorToken({
    tokenString: resEnvio.token,
    state
  });
  assert.equal(consulta.ok, false);
  assert.equal(consulta.conflict, true);
  assert.match(consulta.error, /versão mais recente|nova versão/i);
});

/* ── 13. PROTEÇÃO DE ESCOPO / TENANT ───────────────────────────── */
test('13. Proteção de Escopo: rejeição de token de outro orçamento ou outro tenant', () => {
  const stateA = criarEstadoMock('tenant_alfa');
  const tokenAlfa = gerarTokenAprovacaoOrcamento({
    tenantId: 'tenant_alfa',
    quotationId: 'orc_alfa_1',
    version: 1
  });

  // Tentativa de consumo com tenant divergente
  const resConsumo = consumirTokenAprovacaoOrcamento(tokenAlfa, {
    tenantId: 'tenant_beta',
    quotationId: 'orc_alfa_1'
  });
  assert.equal(resConsumo.ok, false);
  assert.match(resConsumo.error, /outro tenant/i);
});

/* ── 14. APROVAÇÃO TOTAL DO CLIENTE ────────────────────────────── */
test('14. Aprovação Total do Cliente: aprova todos os itens, calcula total e sincroniza OS como executando', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [
      { id: 'it1', tipo: 'servico', nome: 'Troca de amortecedores', quantidade: 2, valorUnitario: 200 },
      { id: 'it2', tipo: 'peca', nome: 'Amortecedor Monroe', quantidade: 2, valorUnitario: 500 }
    ]
  });

  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });

  const resAprov = quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvio.token,
    aprovarTudo: true,
    canalAprovacao: 'link_digital',
    ipOrigem: '200.180.10.5'
  });

  assert.equal(resAprov.ok, true);
  assert.equal(resAprov.status, 'aprovado');
  assert.equal(resAprov.totalAprovado, 1400.00);
  assert.equal(resOrc.quotation.itens[0].status, 'aprovado');
  assert.equal(resOrc.quotation.itens[1].status, 'aprovado');

  // Sincronização com a OS
  const os = state.os[0];
  assert.equal(os.st, 'executando');
  assert.equal(os.totalAutorizado, 1400.00);
  assert.equal(os.servicos.length, 1);
  assert.equal(os.pecas.length, 1);
  assert.equal(os.servicos[0].autorizado, true);
  assert.equal(os.pecas[0].autorizado, true);
});

/* ── 15. APROVAÇÃO PARCIAL DO CLIENTE ──────────────────────────── */
test('15. Aprovação Parcial do Cliente: aprova itens 1 e 3 e recusa item 2; total autorizado reflete apenas itens aprovados', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [
      { id: 'it1', tipo: 'servico', nome: 'Regulagem de Freio', quantidade: 1, valorUnitario: 150 },
      { id: 'it2', tipo: 'peca', nome: 'Lona de Freio Nova', quantidade: 4, valorUnitario: 120 }, // 480
      { id: 'it3', tipo: 'servico', nome: 'Lavagem de Chassi', quantidade: 1, valorUnitario: 80 }
    ]
  });
  // Total Proposta = 150 + 480 + 80 = 710.00

  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });

  // Cliente aprova it1 e it3, e recusa it2
  const resDecisao = quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvio.token,
    itensAprovadosIds: ['it1', 'it3'],
    itensRecusadosIds: ['it2'],
    motivoRecusa: 'Vou trocar as lonas na próxima viagem',
    canalAprovacao: 'link_digital'
  });

  assert.equal(resDecisao.ok, true);
  assert.equal(resDecisao.status, 'parcialmente_aprovado');
  assert.equal(resDecisao.totalAprovado, 230.00); // 150 + 80 = 230.00 (sem os 480 da lona)
  assert.equal(resOrc.quotation.totalAprovado, 230.00);
  assert.equal(resOrc.quotation.totalGeral, 710.00);

  // OS contém apenas os aprovados
  const os = state.os[0];
  assert.equal(os.st, 'executando');
  assert.equal(os.totalAutorizado, 230.00);
  assert.equal(os.servicos.length, 2);
  assert.equal(os.pecas.length, 0); // Peça recusada não entrou na execução
  assert.equal(os.itensRecusados.length, 1);
  assert.equal(os.itensRecusados[0].id, 'it2');
  assert.equal(os.itensRecusados[0].autorizado, false);
});

/* ── 16. RECUSA TOTAL PELO CLIENTE ─────────────────────────────── */
test('16. Recusa Total pelo Cliente: registra justificativa e bloqueia execução de todos os itens', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ id: 'it1', tipo: 'servico', nome: 'Retífica de Motor', quantidade: 1, valorUnitario: 4500 }]
  });

  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });

  const resRecusa = quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvio.token,
    recusarTudo: true,
    motivoRecusa: 'Valor acima do orçado pela diretoria'
  });

  assert.equal(resRecusa.ok, true);
  assert.equal(resRecusa.status, 'recusado');
  assert.equal(resRecusa.totalAprovado, 0);
  assert.equal(state.os[0].servicos.length, 0);
  assert.equal(state.os[0].totalAutorizado, 0);
});

/* ── 17. IDEMPOTÊNCIA RIGOROSA (CLIQUE DUPLO) ──────────────────── */
test('17. Idempotência Rigorosa: requisições repetidas ou cliques duplos retornam confirmação sem duplicar serviços na OS', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ id: 'it1', tipo: 'servico', nome: 'Revisão Elétrica', quantidade: 1, valorUnitario: 350 }]
  });

  const resEnvio = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });

  // Primeiro clique
  const res1 = quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvio.token,
    aprovarTudo: true
  });
  assert.equal(res1.ok, true);
  assert.equal(state.os[0].servicos.length, 1);

  // Segundo clique idêntico (double-click ou retry)
  const res2 = quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvio.token,
    aprovarTudo: true
  });
  assert.equal(res2.ok, true);
  assert.equal(res2.idempotente, true);
  assert.equal(state.os[0].servicos.length, 1); // Não duplicou!
});

/* ── 18. BLOQUEIO DE VERSÃO DESATUALIZADA ──────────────────────── */
test('18. Bloqueio de Versão Desatualizada (409 Conflict): cliente tentando aprovar v1 após publicação da v2 é bloqueado', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ id: 'it1', tipo: 'servico', nome: 'Serviço Inicial', quantidade: 1, valorUnitario: 200 }]
  });

  const resEnvioV1 = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id
  });

  // Oficina emite v2 com novos valores
  quotationService.criarNovaVersao({
    tenantId: 'oficina_teste',
    state,
    quotationId: resOrc.quotation.id,
    novosItens: [{ id: 'it1', tipo: 'servico', nome: 'Serviço Inicial', quantidade: 1, valorUnitario: 250 }]
  });

  // Cliente tenta aprovar usando o link antigo da v1
  const resTentativa = quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvioV1.token,
    aprovarTudo: true
  });

  assert.equal(resTentativa.ok, false);
  assert.equal(resTentativa.conflict, true);
});

/* ── 19. ADICIONAL DE ESCOPO DURANTE EXECUÇÃO ──────────────────── */
test('19. Adicional de Escopo: criação de orçamento adicional durante desmontagem com numeração específica', () => {
  const state = criarEstadoMock();
  const resOrcBase = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ tipo: 'servico', nome: 'Desmontagem de Caixa', quantidade: 1, valorUnitario: 800 }]
  });

  const resAdic = quotationService.criarAdicionalEscopo({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    parentQuotationId: resOrcBase.quotation.id,
    items: [{ tipo: 'peca', nome: 'Sincronizador da 3ª Marcha Danificado', quantidade: 1, valorUnitario: 1200 }],
    motivo: 'Dente do anel sincronizador quebrado constatado ao abrir o câmbio'
  });

  assert.equal(resAdic.ok, true);
  assert.equal(resAdic.quotation.adicional, true);
  assert.equal(resAdic.quotation.parentQuotationId, resOrcBase.quotation.id);
  assert.ok(resAdic.quotation.codigo.includes('ADIC'));
  assert.equal(resAdic.quotation.status, 'rascunho');
});

/* ── 20. ADICIONAL EXIGE NOVA APROVAÇÃO ────────────────────────── */
test('20. Adicional Exige Nova Aprovação: itens adicionais permanecem bloqueados até autorização explícita', () => {
  const state = criarEstadoMock();
  // Orçamento base já aprovado
  state.os[0].servicos = [{ id: 's_base', nome: 'Desmontagem', preco: 800, autorizado: true }];
  state.os[0].st = 'executando';

  const resAdic = quotationService.criarAdicionalEscopo({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ id: 'p_extra', tipo: 'peca', nome: 'Engrenagem Trincada', quantidade: 1, valorUnitario: 1500 }]
  });

  // Antes da aprovação: peça adicional NÃO pode estar na OS autorizada
  assert.equal(state.os[0].pecas.length, 0);

  // Envia e cliente aprova o adicional
  const envioAdic = quotationService.enviarOrcamento({
    tenantId: 'oficina_teste',
    state,
    quotationId: resAdic.quotation.id
  });

  quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: envioAdic.token,
    aprovarTudo: true
  });

  // Após aprovação explícita: peça adicional é liberada na OS
  assert.equal(state.os[0].pecas.length, 1);
  assert.equal(state.os[0].pecas[0].id, 'p_extra');
  assert.equal(state.os[0].pecas[0].autorizado, true);
});

/* ── 21. VISÃO DO MECÂNICO (AUTORIZADO VS NÃO AUTORIZADO) ──────── */
test('21. Visão do Mecânico: itens aprovados marcados como AUTORIZADO e itens recusados em alerta de bloqueio', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [
      { id: 's1', tipo: 'servico', nome: 'Trocar Cruzeta', quantidade: 1, valorUnitario: 250 },
      { id: 's2', tipo: 'servico', nome: 'Pintura de Chassi', quantidade: 1, valorUnitario: 400 }
    ]
  });

  const resEnvio = quotationService.enviarOrcamento({ tenantId: 'oficina_teste', state, quotationId: resOrc.quotation.id });

  quotationService.processarAprovacaoCliente({
    tenantId: 'oficina_teste',
    state,
    tokenString: resEnvio.token,
    itensAprovadosIds: ['s1'],
    itensRecusadosIds: ['s2']
  });

  const os = state.os[0];
  const servAutorizado = os.servicos.find(s => s.id === 's1');
  assert.ok(servAutorizado);
  assert.equal(servAutorizado.autorizado, true);

  const servRecusado = os.itensRecusados.find(r => r.id === 's2');
  assert.ok(servRecusado);
  assert.equal(servRecusado.autorizado, false);
  assert.equal(servRecusado.recusado, true);
});

/* ── 22. POSSÍVEL GARANTIA SEM DECISÃO AUTOMÁTICA ──────────────── */
test('22. Possível Garantia Sem Decisão Automática: orçamento mantém valores financeiros para decisão humana manual', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [
      { id: 'g1', tipo: 'servico', nome: 'Revisão de Caixa com Possível Garantia', quantidade: 1, valorUnitario: 800, possivelGarantia: true }
    ]
  });

  assert.equal(resOrc.ok, true);
  assert.equal(resOrc.quotation.totalGeral, 800.00); // Não zera valor automaticamente!
  assert.equal(resOrc.quotation.itens[0].possivelGarantia, true);
});

/* ── 23. INTELIGÊNCIA OPERACIONAL (ALERTAS DE ORÇAMENTO) ───────── */
test('23. Inteligência Operacional: alerta determinístico para orçamentos pendentes > 4h e > 8h', () => {
  const state = criarEstadoMock();
  const agora = new Date('2026-09-11T16:00:00Z');

  // Orçamento 1: enviado há 5h (severidade: atencao / P3)
  state.quotations.push({
    id: 'orc_p3',
    tenantId: 'oficina_teste',
    codigo: 'ORC-1044-v1',
    status: 'enviado',
    enviadoEm: new Date(agora.getTime() - 5 * 60 * 60 * 1000).toISOString(),
    totalGeral: 1200,
    itens: []
  });

  // Orçamento 2: adicional enviado há 2h (severidade: alto / P2)
  state.quotations.push({
    id: 'orc_adic_p2',
    tenantId: 'oficina_teste',
    codigo: 'ORC-1044-ADIC-1',
    adicional: true,
    status: 'enviado',
    enviadoEm: new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    totalGeral: 950,
    itens: []
  });

  const aval = operationalIntelligenceEngine.avaliarOperacao({
    tenantId: 'oficina_teste',
    state,
    agoraDate: agora
  });

  const alertaP3 = aval.eventos.find(e => e.dedupeKey === 'oficina_teste:orcamento_aguardando_cliente:orc_p3');
  assert.ok(alertaP3);
  assert.equal(alertaP3.prioridade, 'P3');
  assert.equal(alertaP3.severidade, 'atencao');

  const alertaAdic = aval.eventos.find(e => e.dedupeKey === 'oficina_teste:adicional_aguardando_aprovacao:orc_adic_p2');
  assert.ok(alertaAdic);
  assert.equal(alertaAdic.prioridade, 'P2');
  assert.equal(alertaAdic.severidade, 'alto');
});

/* ── 24. DASHBOARD OPERACIONAL CONSOLIDADO ───────────────────────── */
test('24. Dashboard Operacional: consolidação em tempo real de contagem e valores de orçamentos pendentes e adicionais', () => {
  const state = criarEstadoMock();
  state.quotations = [
    { tenantId: 'oficina_teste', status: 'enviado', totalGeral: 1500, adicional: false },
    { tenantId: 'oficina_teste', status: 'enviado', totalGeral: 800, adicional: true },
    { tenantId: 'oficina_teste', status: 'aprovado', totalAprovado: 2300, adicional: false }
  ];

  const resumo = operationalSummaryService.gerarResumoOperacional({
    tenantId: 'oficina_teste',
    state
  });

  assert.ok(resumo.orcamentos);
  assert.equal(resumo.orcamentos.pendentes, 2);
  assert.equal(resumo.orcamentos.valorPendente, 2300.00); // 1500 + 800
  assert.equal(resumo.orcamentos.adicionaisPendentes, 1);
  assert.equal(resumo.orcamentos.aprovados, 1);
});

/* ── 25. COMANDOS DE VOZ DA VERÔNICA ────────────────────────────── */
test('25. Comandos de Voz da Verônica: consulta de orçamentos pendentes com dados verídicos e laudo estruturado de fala', async () => {
  const state = criarEstadoMock();
  state.quotations = [
    { tenantId: 'oficina_teste', status: 'enviado', totalGeral: 1500, adicional: false },
    { tenantId: 'oficina_teste', status: 'enviado', totalGeral: 800, adicional: true }
  ];

  const resVoz = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Verônica, como estão os orçamentos pendentes de aprovação?' },
    context: { tenantId: 'oficina_teste' },
    state
  });

  assert.equal(resVoz.ok, true);
  assert.equal(resVoz.acao, 'consultar_orcamento');
  assert.match(resVoz.resposta, /2 orçamento\(s\) aguardando aprovação/);
  assert.match(resVoz.resposta, /1 são adicionais de escopo/);

  // Ditado de inspeção por voz
  const resInspVoz = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Identifiquei folga excessiva no terminal de direção e vazamento grave no tambor de freio' },
    context: { tenantId: 'oficina_teste' },
    state
  });

  assert.equal(resInspVoz.ok, true);
  assert.equal(resInspVoz.acao, 'registrar_inspecao_voz');
  assert.ok(resInspVoz.itensSugeridos.length >= 2);
});

/* ── 26. VOZ DE ALTO RISCO (MUDANÇA FINANCEIRA EXIGE TOKEN) ─────── */
test('26. Voz de Alto Risco: alteração financeira no orçamento exige confirmação explícita por token', async () => {
  const state = criarEstadoMock();
  const resCritico = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'Adicionar ao orçamento serviço de plaina de cabeçote valor R$ 850 reais' },
    context: { tenantId: 'oficina_teste', actorId: 'operador_joao' },
    state
  });

  assert.equal(resCritico.ok, true);
  assert.equal(resCritico.pendenteConfirmacao, true);
  assert.equal(resCritico.risco, 'alto');
  assert.ok(resCritico.token);
});

/* ── 27. COMANDOS VIA WHATSAPP ─────────────────────────────────── */
test('27. WhatsApp: comandos conversacionais de aprovação total e recusa via mensagem com resposta contextual', () => {
  const state = criarEstadoMock();
  const resOrc = quotationService.criarOrcamento({
    tenantId: 'oficina_teste',
    state,
    osId: 'os_101',
    items: [{ id: 'it1', tipo: 'servico', nome: 'Troca de Óleo', quantidade: 1, valorUnitario: 300 }]
  });
  quotationService.enviarOrcamento({ tenantId: 'oficina_teste', state, quotationId: resOrc.quotation.id });

  // Mensagem "aprovar tudo"
  const resWppAprov = quotationService.processarComandoWhatsAppOrcamento({
    texto: 'Aprovar tudo',
    fromNumber: '5562999990001',
    state,
    tenantId: 'oficina_teste'
  });

  assert.equal(resWppAprov.reconhecido, true);
  assert.equal(resWppAprov.sucesso, true);
  assert.match(resWppAprov.resposta, /APROVADO com sucesso/i);
  assert.equal(resOrc.quotation.status, 'aprovado');
});

/* ── 28. CONTROLE DE ACESSO RBAC ───────────────────────────────── */
test('28. Controle de Acesso RBAC: permissões inspection:* e quotation:* estritamente aplicadas', () => {
  const { IdentityRegistry } = require('../lib/auth/identity');
  const { createAuthMiddleware } = require('../lib/auth/context');

  const registry = new IdentityRegistry({ allowWeakInTest: true });
  registry.registerUser({
    username: 'mecanico_leitor',
    password: 'senha_leitor_123',
    memberships: [
      { tenantId: 'oficina_rbac', role: 'mechanic', permissions: ['inspection:read', 'quotation:read'] }
    ]
  });

  const middleware = createAuthMiddleware(registry, { defaultSingleTenantId: 'oficina_rbac' });

  const reqMock = {
    headers: {
      authorization: 'Basic ' + Buffer.from('mecanico_leitor:senha_leitor_123').toString('base64'),
      'x-tenant-id': 'oficina_rbac'
    },
    method: 'GET',
    path: '/api/inspecoes'
  };
  const resMock = {
    setHeader: () => {},
    status: () => ({ json: () => {} })
  };

  let nextCalled = false;
  middleware(reqMock, resMock, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.ok(reqMock.securityContext.permissions.includes('inspection:read'));
  assert.ok(!reqMock.securityContext.permissions.includes('inspection:write'));
});

/* ── 29. TRILHA DE AUDITORIA COMPLETA ──────────────────────────── */
test('29. Trilha de Auditoria Completa: registra eventos de todo o ciclo de vida de forma imutável', () => {
  const state = criarEstadoMock();
  const resInsp = inspectionService.criarInspecao({ tenantId: 'oficina_teste', state, osId: 'os_101', actorId: 'operador_audit' });
  const resItem = inspectionService.adicionarItemInspecao({ tenantId: 'oficina_teste', state, inspectionId: resInsp.inspection.id, item: { componente: 'Cruzeta' }, actorId: 'operador_audit' });
  inspectionService.confirmarDiagnosticoHumano({ tenantId: 'oficina_teste', state, inspectionId: resInsp.inspection.id, itemId: resItem.item.id, diagnosticoConfirmado: 'Folga severa', confirmedBy: 'Mecânico Teste', actorId: 'mec_teste' });
  const resOrc = quotationService.criarOrcamento({ tenantId: 'oficina_teste', state, osId: 'os_101', items: [{ tipo: 'servico', nome: 'Cruzeta', valorUnitario: 200, quantidade: 1 }], actorId: 'orcamentista' });
  const resEnvio = quotationService.enviarOrcamento({ tenantId: 'oficina_teste', state, quotationId: resOrc.quotation.id, actorId: 'orcamentista' });
  quotationService.processarAprovacaoCliente({ tenantId: 'oficina_teste', state, tokenString: resEnvio.token, aprovarTudo: true, actorId: 'cliente_link' });

  const tiposAudit = state.auditoria.map(a => a.tipo);
  assert.ok(tiposAudit.includes('inspecao_criada'));
  assert.ok(tiposAudit.includes('item_inspecao_adicionado'));
  assert.ok(tiposAudit.includes('diagnostico_humano_confirmado'));
  assert.ok(tiposAudit.includes('orcamento_criado'));
  assert.ok(tiposAudit.includes('orcamento_enviado'));
  assert.ok(tiposAudit.includes('orcamento_decidido_cliente'));
});

/* ── 30. SERVIDOR REAL E2E COM FLUXO COMPLETO ──────────────────── */
test('30. Servidor Real E2E: ciclo completo HTTP (inspeção -> orçamento -> envio -> aprovação digital pública sem login -> OS executando)', async (t) => {
  const serverNet = net.createServer();
  await new Promise(r => serverNet.listen(0, r));
  const port = serverNet.address().port;
  await new Promise(r => serverNet.close(r));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_insp_test_'));
  const dbPath = path.join(tempDir, 'test_insp.db');
  const root = path.resolve(__dirname, '..');
  let child;

  async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-insp-api-key',
        AUTH_USER: 'patio',
        AUTH_PASSWORD: 'patio-password-test',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: dbPath
      }
    });

    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw Error('Falha ao iniciar servidor de teste');
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.status === 401) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Timeout ao aguardar servidor.');
  }

  async function stopServer() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stopServer();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await startServer();

  const authHeaders = {
    'x-api-key': 'test-insp-api-key',
    'x-tenant-id': 'oficina_e2e',
    'Content-Type': 'application/json'
  };

  // 30.1 Cria estado inicial com uma OS na fila
  const estadoInicial = {
    versao: 0,
    os: [
      { id: 'os_e2e_1', num: 2001, vei: 'v_e2e', cli: 'c_e2e', placa: 'XYZ9K88', st: 'fila', servicos: [], pecas: [] }
    ],
    veiculos: [{ id: 'v_e2e', placa: 'XYZ9K88', modelo: 'Volvo FH 540' }],
    clientes: [{ id: 'c_e2e', nome: 'Transportes Brasil' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }]
  };

  const resSave = await fetch(`http://127.0.0.1:${port}/api/estado`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(estadoInicial)
  });
  assert.equal(resSave.status, 200);

  // 30.2 Cria Inspeção Técnica
  const resInsp = await fetch(`http://127.0.0.1:${port}/api/inspecoes`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      osId: 'os_e2e_1',
      mecanico: 'Pedro Mecânico',
      reclamacaoCliente: 'Barulho no diferencial'
    })
  });
  assert.equal(resInsp.status, 200);
  const jsonInsp = await resInsp.json();
  const inspectionId = jsonInsp.inspection.id;

  // 30.3 Adiciona Item e Confirma Diagnóstico Humano
  const resItem = await fetch(`http://127.0.0.1:${port}/api/inspecoes/${inspectionId}/itens`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      categoria: 'transmissao',
      componente: 'Rolamento do Pinhão',
      descricao: 'Folga axial perceptível'
    })
  });
  assert.equal(resItem.status, 200);
  const jsonItem = await resItem.json();
  const itemId = jsonItem.item.id;

  const resDiag = await fetch(`http://127.0.0.1:${port}/api/inspecoes/${inspectionId}/itens/${itemId}/diagnostico`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      diagnosticoConfirmado: 'Rolamento cônico com desgaste severo na pista',
      confirmedBy: 'Pedro Mecânico'
    })
  });
  assert.equal(resDiag.status, 200);

  // 30.4 Conclui Inspeção
  const resConcluir = await fetch(`http://127.0.0.1:${port}/api/inspecoes/${inspectionId}/concluir`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ laudoGeral: 'Diferencial desmontado e diagnosticado.' })
  });
  assert.equal(resConcluir.status, 200);

  // 30.5 Elabora Orçamento Comercial
  const resOrc = await fetch(`http://127.0.0.1:${port}/api/orcamentos`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      osId: 'os_e2e_1',
      inspectionId,
      items: [
        { id: 'it_serv', tipo: 'servico', nome: 'Mão de obra Diferencial', quantidade: 1, valorUnitario: 1200 },
        { id: 'it_peca', tipo: 'peca', nome: 'Rolamento Pinhão Timken', quantidade: 1, valorUnitario: 1800 }
      ]
    })
  });
  assert.equal(resOrc.status, 200);
  const jsonOrc = await resOrc.json();
  const quotationId = jsonOrc.quotation.id;

  // 30.6 Envia Orçamento e Obtém Token Seguro
  const resEnviar = await fetch(`http://127.0.0.1:${port}/api/orcamentos/${quotationId}/enviar`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ canal: 'link_digital' })
  });
  assert.equal(resEnviar.status, 200);
  const jsonEnviar = await resEnviar.json();
  const token = jsonEnviar.token;
  assert.ok(token);

  // 30.7 ACESSO PÚBLICO DO CLIENTE (SEM LOGIN, SEM API KEY, SEM BASIC AUTH!)
  const resPublicaHtml = await fetch(`http://127.0.0.1:${port}/aprovacao/${token}`);
  assert.equal(resPublicaHtml.status, 200);

  const resPublicaDados = await fetch(`http://127.0.0.1:${port}/api/aprovacao/${token}`);
  assert.equal(resPublicaDados.status, 200);
  const jsonPublica = await resPublicaDados.json();
  assert.equal(jsonPublica.success, true);
  assert.equal(jsonPublica.quotation.totalGeral, 3000.00);

  // 30.8 Cliente envia aprovação via tela pública
  const resDecisaoPublica = await fetch(`http://127.0.0.1:${port}/api/aprovacao/${token}/decidir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aprovarTudo: true })
  });
  assert.equal(resDecisaoPublica.status, 200);
  const jsonDecisao = await resDecisaoPublica.json();
  assert.equal(jsonDecisao.success, true);
  assert.equal(jsonDecisao.status, 'aprovado');
  assert.equal(jsonDecisao.totalAprovado, 3000.00);

  // 30.9 Verifica se a OS foi automaticamente sincronizada para status 'executando'
  const resConsultaEstado = await fetch(`http://127.0.0.1:${port}/api/estado`, {
    headers: authHeaders
  });
  const estadoFinal = await resConsultaEstado.json();
  const osFinal = estadoFinal.os.find(o => o.id === 'os_e2e_1');
  assert.equal(osFinal.st, 'executando');
  assert.equal(osFinal.totalAutorizado, 3000.00);
  assert.equal(osFinal.servicos.length, 1);
  assert.equal(osFinal.pecas.length, 1);
  assert.equal(osFinal.servicos[0].autorizado, true);
  assert.equal(osFinal.pecas[0].autorizado, true);
});
