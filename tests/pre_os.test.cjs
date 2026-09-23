'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const { obterHistoricoVeiculo } = require('../services/vehicleHistoryService');
const { detectarRecorrencia, classificarTexto, normalizarReclamacao } = require('../services/recurrenceDetector');
const { avaliarGarantia, obterRegrasGarantia } = require('../services/warrantyService');
const { gerarResumoContexto, calcularNivelAtencao, formatarMensagemConversacional } = require('../services/maintenanceContextService');
const preOSEngine = require('../services/preOSEngine');
const voiceActionEngine = require('../services/voiceActionEngine');

/* ── 1. TESTE UNITÁRIO: MEMÓRIA OPERACIONAL DO VEÍCULO ─────────── */
test('1. Memória Operacional: consulta delimitada por tenant, ordenação decrescente e extração precisa', () => {
  const state = {
    veiculos: [
      { id: 'v_scania_1', placa: 'ABC1D23', modelo: 'R 450', marca: 'Scania', ano: '2021', km: 280000, cli: 'c_frota_1' }
    ],
    os: [
      {
        id: 'os_100',
        num: 1000,
        vei: 'v_scania_1',
        cli: 'c_frota_1',
        st: 'finalizada',
        abertura: '2026-01-10',
        km: 250000,
        queixa: 'Barulho na suspensão dianteira',
        servicos: [{ id: 's1', nome: 'Troca de buchas do eixo dianteiro', qtd: 1, valor: 450 }],
        pecas: [{ id: 'p1', nome: 'Bucha de poliuretano', cod: 'BCH-01', qtd: 2, valor: 180 }],
        mec: 'Marcos Mecânico'
      },
      {
        id: 'os_101',
        num: 1005,
        vei: 'v_scania_1',
        cli: 'c_frota_1',
        st: 'finalizada',
        abertura: '2026-06-15',
        km: 275000,
        queixa: 'Revisão de feixe de molas',
        servicos: [{ id: 's2', nome: 'Arqueamento de feixe de mola traseiro', qtd: 1, valor: 600 }],
        pecas: [],
        mec: 'Valdir Chefe'
      },
      {
        id: 'os_outro_vei',
        num: 1006,
        vei: 'v_outro',
        cli: 'c_outro',
        st: 'finalizada',
        abertura: '2026-07-01',
        km: 50000,
        queixa: 'Troca de pneus',
        servicos: [],
        pecas: []
      }
    ]
  };

  // 1.1 Consulta com veículo válido
  const hist = obterHistoricoVeiculo({ tenantId: 'tenant_alfa', vehicleId: 'v_scania_1', state });
  assert.equal(hist.vehicleId, 'v_scania_1');
  assert.equal(hist.placa, 'ABC1D23');
  assert.equal(hist.kmAtual, 280000);
  assert.equal(hist.totalOS, 2, 'Deve filtrar apenas as OSs do veículo');
  
  // Ordenação cronológica decrescente (OS 1005 mais recente primeiro)
  assert.equal(hist.historico[0].num, 1005);
  assert.equal(hist.historico[1].num, 1000);
  assert.equal(hist.ultimaOS.num, 1005);
  assert.equal(hist.historico[1].servicos[0].nome, 'Troca de buchas do eixo dianteiro');
  assert.equal(hist.historico[1].pecas[0].codigo, 'BCH-01');
  assert.equal(hist.historico[1].mecanico, 'Marcos Mecânico');

  // 1.2 Consulta com veículo inexistente
  const histVazio = obterHistoricoVeiculo({ tenantId: 'tenant_alfa', vehicleId: 'v_inexistente', state });
  assert.equal(histVazio.totalOS, 0);
  assert.deepEqual(histVazio.historico, []);
  assert.equal(histVazio.ultimaOS, null);

  // 1.3 Validação de obrigatoriedade de tenantId
  assert.throws(() => {
    obterHistoricoVeiculo({ tenantId: '', vehicleId: 'v_scania_1', state });
  }, /tenantId é obrigatório/);
});

/* ── 2. TESTE UNITÁRIO: DETECÇÃO DETERMINÍSTICA DE RECORRÊNCIA ─── */
test('2. Detecção de Recorrência: normalização, classificação por categoria e cálculo de delta de KM e dias', () => {
  const dataReferencia = '2026-09-10T12:00:00Z';

  // 2.1 Classificação e normalização
  const c1 = classificarTexto('Folga forte no embuchamento do eixo dianteiro');
  assert.equal(c1.categoria, 'SUSPENSAO_EIXO_BUCHAS');

  const c2 = classificarTexto('Lâmina de mola quebrou na rodovia');
  assert.equal(c2.categoria, 'SUSPENSAO_MOLAS');

  const c3 = classificarTexto('Pedal do freio baixo e chiando na cuíca');
  assert.equal(c3.categoria, 'SISTEMA_FREIOS');

  const c4 = classificarTexto('Trinca no chassi perto da quinta roda');
  assert.equal(c4.categoria, 'ESTRUTURAL_SOLDA');

  const c5 = classificarTexto('Caminhão puxando para a direita no alinhamento');
  assert.equal(c5.categoria, 'DIRECAO_ALINHAMENTO');

  const c6 = classificarTexto('Ronco no diferencial e cruzeta com folga');
  assert.equal(c6.categoria, 'TRANSMISSAO_DIFERENCIAL');

  // 2.2 Detecção de ocorrências prévias e deltas
  const historicoVeiculo = {
    vehicleId: 'v1',
    placa: 'XYZ9876',
    kmAtual: 215000,
    historico: [
      {
        osId: 'os_antiga',
        num: 1020,
        dataAbertura: '2026-08-11', // Exatos 30 dias antes
        km: 205000,
        queixa: 'Barulho na manga de eixo',
        servicos: [{ id: 's1', nome: 'Embuchamento completo do eixo dianteiro' }]
      }
    ]
  };

  const rec = detectarRecorrencia({
    reclamacao: 'Cliente reclama que voltou a bater o eixo dianteiro e bucha com folga',
    kmAtual: 215000,
    historicoVeiculo,
    dataReferencia
  });

  assert.equal(rec.categoriaDetectada, 'SUSPENSAO_EIXO_BUCHAS');
  assert.equal(rec.ocorrenciasRelacionadas.length, 1);
  const ocorrencia = rec.ocorrenciasRelacionadas[0];
  assert.equal(ocorrencia.osNum, 1020);
  assert.equal(ocorrencia.diasAtras, 30, 'Deveria calcular exatamente 30 dias decorridos');
  assert.equal(ocorrencia.kmRodados, 10000, 'Deveria calcular delta de 10.000 km (215.000 - 205.000)');
  assert.equal(ocorrencia.kmAnterior, 205000);
});

/* ── 3. TESTE UNITÁRIO: REGRAS DE GARANTIA E POLÍTICAS ──────────── */
test('3. Avaliação de Garantia: prazo em dias, quilometragem e regras customizadas por tenant', () => {
  // 3.1 Dentro da garantia padrão de embuchamento (180 dias / 20.000 km)
  const ocorrenciaEmGarantia = {
    categoria: 'SUSPENSAO_EIXO_BUCHAS',
    diasAtras: 45,
    kmRodados: 8500
  };
  const g1 = avaliarGarantia({ ocorrencia: ocorrenciaEmGarantia });
  assert.equal(g1.possivelGarantia, true);
  assert.match(g1.motivo, /Possível retorno em garantia/);
  assert.equal(g1.regraAplicada.categoria, 'SUSPENSAO_EIXO_BUCHAS');

  // 3.2 Fora da garantia por excesso de DIAS (> 180 dias)
  const ocorrenciaExcedeuDias = {
    categoria: 'SUSPENSAO_EIXO_BUCHAS',
    diasAtras: 210,
    kmRodados: 5000
  };
  const g2 = avaliarGarantia({ ocorrencia: ocorrenciaExcedeuDias });
  assert.equal(g2.possivelGarantia, false);
  assert.match(g2.motivo, /prazo expirado há 210 dias/);

  // 3.3 Fora da garantia por excesso de QUILOMETRAGEM (> 20.000 km)
  const ocorrenciaExcedeuKm = {
    categoria: 'SUSPENSAO_EIXO_BUCHAS',
    diasAtras: 30,
    kmRodados: 25000
  };
  const g3 = avaliarGarantia({ ocorrencia: ocorrenciaExcedeuKm });
  assert.equal(g3.possivelGarantia, false);
  assert.match(g3.motivo, /quilometragem de 25\.000 km excedeu o limite/);

  // 3.4 Regra customizada do Tenant (ex: oficina oferece garantia estendida de 365 dias / 40.000 km para molas)
  const tenantCfg = {
    garantias: {
      molas: { dias: 365, km: 40000, descricao: 'Garantia Premium de Molas' }
    }
  };
  const ocorrenciaMolas = {
    categoria: 'SUSPENSAO_MOLAS',
    diasAtras: 150,
    kmRodados: 25000
  };
  // Com regras padrão (90 dias / 15.000 km), estaria fora:
  const gPadrao = avaliarGarantia({ ocorrencia: ocorrenciaMolas });
  assert.equal(gPadrao.possivelGarantia, false);

  // Com tenantCfg customizado, deve estar dentro:
  const gCustom = avaliarGarantia({ ocorrencia: ocorrenciaMolas, tenantCfg });
  assert.equal(gCustom.possivelGarantia, true);
  assert.equal(gCustom.regraAplicada.diasLimite, 365);
  assert.equal(gCustom.regraAplicada.kmLimite, 40000);
});

/* ── 4. TESTE UNITÁRIO: CONTEXTO TÉCNICO & NÍVEIS DE ATENÇÃO ───── */
test('4. Contexto Técnico: cálculo do nível de atenção e geração de mensagem conversacional', () => {
  // 4.1 Nível 'alto' quando há possível retorno em garantia
  const n1 = calcularNivelAtencao({
    possivelGarantia: true,
    ocorrenciasRelacionadas: [{ diasAtras: 30, kmRodados: 5000 }]
  });
  assert.equal(n1, 'alto');

  // 4.2 Nível 'alto' quando intervenção foi muito recente (< 90 dias) mesmo sem garantia formal
  const n2 = calcularNivelAtencao({
    possivelGarantia: false,
    ocorrenciasRelacionadas: [{ diasAtras: 60, kmRodados: 12000 }]
  });
  assert.equal(n2, 'alto');

  // 4.3 Nível 'atencao' quando intervenção foi há mais de 90 dias mas dentro de 2 anos
  const n3 = calcularNivelAtencao({
    possivelGarantia: false,
    ocorrenciasRelacionadas: [{ diasAtras: 200, kmRodados: 40000 }]
  });
  assert.equal(n3, 'atencao');

  // 4.4 Nível 'info' quando não há histórico relacionado
  const n4 = calcularNivelAtencao({
    possivelGarantia: false,
    ocorrenciasRelacionadas: []
  });
  assert.equal(n4, 'info');

  // 4.5 Mensagem conversacional estruturada
  const resumo = gerarResumoContexto({
    vehicleId: 'v10',
    placa: 'KRM1020',
    kmAtual: 180000,
    historicoVeiculo: {
      placa: 'KRM1020',
      ultimaOS: { num: 1010, dataAbertura: '2026-08-01', km: 175000 }
    },
    ocorrenciasRelacionadas: [
      {
        osNum: 1010,
        servicos: ['Revisão de freios e troca de pastilhas'],
        data: '2026-08-01',
        kmAnterior: 175000,
        diasAtras: 40,
        kmRodados: 5000,
        categoria: 'SISTEMA_FREIOS'
      }
    ],
    garantiaAvaliada: {
      possivelGarantia: true,
      motivo: 'Dentro dos 90 dias de garantia de freios'
    },
    reclamacaoOriginal: 'Freio chiando na roda dianteira'
  });

  assert.equal(resumo.nivelAtencao, 'alto');
  assert.equal(resumo.possivelGarantia, true);
  assert.match(resumo.textoFormatado, /Localizei o veículo KRM1020/);
  assert.match(resumo.textoFormatado, /Revisão de freios e troca de pastilhas/);
  assert.match(resumo.textoFormatado, /possibilidade de retorno em garantia/i);
});

/* ── 5. TESTE UNITÁRIO: CICLO DE VIDA COMPLETO DA PRÉ-OS ────────── */
test('5. Ciclo de Vida da Pré-OS: triagem, auditoria, conversão para OS e cancelamento', () => {
  const state = {
    preOS: [],
    os: [
      {
        id: 'os_base',
        num: 1040,
        vei: 'v_volvo',
        cli: 'c1',
        st: 'finalizada',
        abertura: '2026-08-15',
        km: 310000,
        servicos: [{ id: 's1', nome: 'Embuchamento de manga de eixo' }]
      }
    ],
    veiculos: [
      { id: 'v_volvo', placa: 'VOL9988', modelo: 'FH 540', km: 315000, cli: 'c1' }
    ],
    clientes: [{ id: 'c1', nome: 'Expresso Rodoviário' }],
    auditoria: []
  };

  // 5.1 Triagem de Entrada com reincidência detectada
  const triagem = preOSEngine.triagemEntrada({
    tenantId: 'oficina_triagem',
    vehicleId: 'v_volvo',
    kmAtual: 315000,
    reclamacao: 'Voltou a apresentar folga no embuchamento do eixo',
    origem: 'web',
    actorId: 'usuario_recepcao',
    state,
    dataReferencia: '2026-09-10'
  });

  assert.equal(triagem.ok, true);
  assert.ok(triagem.preOS.id.startsWith('pre_'));
  assert.equal(triagem.preOS.status, 'aguardando_confirmacao');
  assert.equal(triagem.preOS.possivelGarantia, true);
  assert.equal(triagem.preOS.alertas.length, 1);
  assert.equal(triagem.preOS.alertas[0].tipo, 'garantia');

  // Verifica que audit log imutável foi inserido
  assert.ok(state.auditoria.length >= 1);
  assert.equal(state.auditoria[0].acao, 'criar_pre_os');
  assert.equal(state.auditoria[0].preOSId, triagem.preOS.id);

  // 5.2 Consulta da Pré-OS
  const consultada = preOSEngine.consultarPreOS({
    tenantId: 'oficina_triagem',
    preOSId: triagem.preOS.id,
    state
  });
  assert.ok(consultada);
  assert.equal(consultada.id, triagem.preOS.id);

  // 5.3 Conversão da Pré-OS em OS definitiva
  const conv = preOSEngine.converterEmOS({
    tenantId: 'oficina_triagem',
    preOSId: triagem.preOS.id,
    state,
    actorId: 'gerente_oficina',
    boxId: 'b1',
    dataReferencia: '2026-09-10'
  });

  assert.equal(conv.ok, true);
  assert.equal(conv.os.num, 1041);
  assert.equal(conv.os.preOSId, triagem.preOS.id);
  assert.equal(conv.os.possivelGarantia, true);
  assert.equal(conv.os.historicoRelacionado.length, 1);
  assert.equal(conv.preOS.status, 'convertida');
  assert.equal(conv.preOS.convertedToOS, 1041);

  // Auditoria da conversão
  assert.equal(state.auditoria[0].acao, 'converter_pre_os_em_os');

  // 5.4 Tentativa de converter novamente deve falhar (409 Conflict)
  const convRepetida = preOSEngine.converterEmOS({
    tenantId: 'oficina_triagem',
    preOSId: triagem.preOS.id,
    state
  });
  assert.equal(convRepetida.ok, false);
  assert.equal(convRepetida.status, 409);

  // 5.5 Triagem sem reincidência e posterior cancelamento
  const triagemSemHist = preOSEngine.triagemEntrada({
    tenantId: 'oficina_triagem',
    placa: 'NOVO123',
    kmAtual: 50000,
    reclamacao: 'Instalar defletor de ar de cabine',
    origem: 'whatsapp',
    state
  });

  assert.equal(triagemSemHist.preOS.status, 'rascunho');
  assert.equal(triagemSemHist.preOS.possivelGarantia, false);

  const canc = preOSEngine.cancelarPreOS({
    tenantId: 'oficina_triagem',
    preOSId: triagemSemHist.preOS.id,
    motivo: 'Cliente desistiu do serviço antes da abertura',
    state,
    actorId: 'operador_balcao'
  });
  assert.equal(canc.ok, true);
  assert.equal(canc.preOS.status, 'cancelada');
  assert.equal(canc.preOS.motivoCancelamento, 'Cliente desistiu do serviço antes da abertura');

  // Tentar converter Pré-OS cancelada deve falhar
  const convCancelada = preOSEngine.converterEmOS({
    tenantId: 'oficina_triagem',
    preOSId: triagemSemHist.preOS.id,
    state
  });
  assert.equal(convCancelada.ok, false);
  assert.equal(convCancelada.status, 400);
});

/* ── 6. TESTE DE SEGURANÇA: ISOLAMENTO MULTI-TENANT ─────────────── */
test('6. Isolamento Multi-Tenant: Tenant A jamais acessa histórico ou Pré-OS do Tenant B', () => {
  const stateTenantA = {
    preOS: [],
    os: [
      {
        id: 'os_tenant_a',
        num: 501,
        vei: 'v_compartilhado_id',
        cli: 'c_a',
        abertura: '2026-08-01',
        km: 100000,
        servicos: [{ nome: 'Solda de chassi na matriz' }]
      }
    ],
    veiculos: [
      { id: 'v_compartilhado_id', placa: 'AAA0001', km: 100000 }
    ],
    auditoria: []
  };

  const stateTenantB = {
    preOS: [],
    os: [],
    veiculos: [
      { id: 'v_compartilhado_id', placa: 'AAA0001', km: 100000 }
    ],
    auditoria: []
  };

  // 6.1 Histórico no Tenant A existe
  const histA = obterHistoricoVeiculo({
    tenantId: 'tenant_a',
    vehicleId: 'v_compartilhado_id',
    state: stateTenantA
  });
  assert.equal(histA.totalOS, 1);

  // 6.2 Histórico no Tenant B é estritamente isolado (não vê OS do Tenant A)
  const histB = obterHistoricoVeiculo({
    tenantId: 'tenant_b',
    vehicleId: 'v_compartilhado_id',
    state: stateTenantB
  });
  assert.equal(histB.totalOS, 0);

  // 6.3 Criação de Pré-OS no Tenant A
  const triagemA = preOSEngine.triagemEntrada({
    tenantId: 'tenant_a',
    vehicleId: 'v_compartilhado_id',
    reclamacao: 'Ver trinca no chassi',
    state: stateTenantA
  });

  // Tenant B tenta consultar Pré-OS de A
  const consultadaPorB = preOSEngine.consultarPreOS({
    tenantId: 'tenant_b',
    preOSId: triagemA.preOS.id,
    state: stateTenantA // mesmo se passar acidentalmente a referência de objeto, o tenantId bloqueia
  });
  assert.equal(consultadaPorB, null, 'Tenant B não pode acessar Pré-OS do Tenant A');

  // Tenant B tenta converter Pré-OS de A
  const convPorB = preOSEngine.converterEmOS({
    tenantId: 'tenant_b',
    preOSId: triagemA.preOS.id,
    state: stateTenantA
  });
  assert.equal(convPorB.ok, false);
  assert.equal(convPorB.status, 404);

  // Tenant B tenta cancelar Pré-OS de A
  const cancPorB = preOSEngine.cancelarPreOS({
    tenantId: 'tenant_b',
    preOSId: triagemA.preOS.id,
    state: stateTenantA
  });
  assert.equal(cancPorB.ok, false);
  assert.equal(cancPorB.status, 404);
});

/* ── 7. TESTE DE INTEGRAÇÃO: VOICE ENGINE & PRÉ-OS ──────────────── */
test('7. Voice Engine: Pré-OS automática sem histórico vs Alerta com token de confirmação em reincidência', async () => {
  const state = {
    os: [
      {
        id: 'os_antiga_freios',
        num: 1030,
        box: 'b1',
        vei: 'v_ford_cargo',
        cli: 'c_transp',
        st: 'finalizada',
        abertura: '2026-08-20',
        km: 150000,
        queixa: 'Revisão de pastilhas e discos de freio',
        servicos: [{ id: 's1', nome: 'Troca de pastilhas de freio dianteiras' }]
      }
    ],
    veiculos: [
      { id: 'v_ford_cargo', cli: 'c_transp', placa: 'FOR2020', marca: 'Ford', modelo: 'Cargo 2429', km: 154000 }
    ],
    clientes: [
      { id: 'c_transp', nome: 'Transportadora Continental', fone: '11988887777' }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    preOS: [],
    auditoria: []
  };

  // 7.1 Cenário A: Reclamação com histórico recente de FREIOS (possível garantia / atenção alta)
  const falaComHistorico = 'Chegou para abrir OS o caminhão Cargo placa FOR2020 da Continental, tá com 154 mil km. Motorista falou que quando freia, faz barulho no freio dianteiro';
  const resAlerta = await voiceActionEngine.interpretarEExecutar({
    input: { text: falaComHistorico },
    context: { canal: 'voz', remetente: 'Recepcionista Carlos', tenantId: 'oficina_voz', role: 'atendente', permissions: ['os:read', 'os:write'] },
    state
  });

  // Deve pausar a abertura definitiva e exigir confirmação consciente
  assert.equal(resAlerta.ok, true);
  assert.equal(resAlerta.pendenteConfirmacao, true);
  assert.equal(resAlerta.acao, 'converter_pre_os');
  assert.ok(resAlerta.token);
  assert.equal(resAlerta.possivelGarantia, true);
  assert.match(resAlerta.resposta, /possibilidade de retorno em garantia/i);

  // A Pré-OS foi registrada no estado com status aguardando confirmação
  const preOSRegistrada = state.preOS.find(p => p.id === resAlerta.preOSId);
  assert.ok(preOSRegistrada);
  assert.equal(preOSRegistrada.status, 'aguardando_confirmacao');

  // 7.2 Confirmação pelo operador da abertura
  const resConfirmado = await voiceActionEngine.interpretarEExecutar({
    input: { text: 'confirmar abertura da os' },
    context: { confirmToken: resAlerta.token, confirmadoPeloUsuario: true, tenantId: 'oficina_voz', role: 'atendente', permissions: ['os:read', 'os:write'] },
    state
  });

  assert.equal(resConfirmado.ok, true);
  assert.equal(resConfirmado.acao, 'abrir_os');
  assert.equal(preOSRegistrada.status, 'convertida');
  assert.equal(preOSRegistrada.convertedToOS, resConfirmado.numOS);

  // A OS gerada preservou rastreabilidade
  const osGerada = state.os.find(o => o.num === resConfirmado.numOS);
  assert.ok(osGerada);
  assert.equal(osGerada.preOSId, preOSRegistrada.id);
  assert.equal(osGerada.possivelGarantia, true);
  assert.equal(osGerada.historicoRelacionado.length, 1);

  // 7.3 Cenário B: Entrada de veículo novo sem histórico (converte diretamente sem bloquear)
  const falaSemHistorico = 'Chegou uma van Sprinter branca nova do cliente Silva, km 30 mil, para instalar sensor de ré';
  const resDireto = await voiceActionEngine.interpretarEExecutar({
    input: { text: falaSemHistorico },
    context: { canal: 'voz', remetente: 'Recepcionista Carlos', tenantId: 'oficina_voz', role: 'atendente', permissions: ['os:read', 'os:write'] },
    state
  });

  assert.equal(resDireto.ok, true);
  assert.equal(resDireto.acao, 'abrir_os');
  assert.equal(resDireto.pendenteConfirmacao, undefined);
  assert.ok(resDireto.osId);
  assert.ok(resDireto.preOSId);

  // Pré-OS gerada foi convertida de imediato
  const preOSDireta = state.preOS.find(p => p.id === resDireto.preOSId);
  assert.ok(preOSDireta);
  assert.equal(preOSDireta.status, 'convertida');
});

/* ── 8. TESTE DE INTEGRAÇÃO: WHATSAPP E ENTRADA DE VEÍCULOS ─────── */
test('8. Entrada de Veículo (WhatsApp / API): gera Pré-OS com rastreabilidade e alertas técnicos', async () => {
  // Simula estado da oficina com histórico anterior
  const state = {
    os: [
      {
        id: 'os_anterior_mola',
        num: 1015,
        vei: 'v_constellation',
        cli: 'c_frota',
        box: 'b1',
        st: 'finalizada',
        abertura: '2026-08-25',
        km: 190000,
        servicos: [{ id: 's1', nome: 'Reforço de feixe de mola traseiro' }]
      }
    ],
    veiculos: [
      { id: 'v_constellation', cli: 'c_frota', placa: 'VWX1234', marca: 'VW', modelo: 'Constellation', km: 192000 }
    ],
    clientes: [
      { id: 'c_frota', nome: 'Frota TransSul', fone: '5511999998888' }
    ],
    boxes: [
      { id: 'b1', nome: 'Box 01' },
      { id: 'b2', nome: 'Box 02' }
    ],
    preOS: [],
    auditoria: []
  };

  // Executa a triagem de entrada simulando a chamada interna do WhatsApp
  const triagem = preOSEngine.triagemEntrada({
    tenantId: 'oficina_zap',
    vehicleId: 'v_constellation',
    placa: 'VWX1234',
    kmAtual: 192000,
    reclamacao: 'Caminhão arrebentou mola na serra',
    origem: 'whatsapp',
    actorId: 'whatsapp',
    state,
    dataReferencia: '2026-09-10'
  });

  assert.equal(triagem.ok, true);
  assert.equal(triagem.preOS.possivelGarantia, true);
  assert.equal(triagem.preOS.alertas.length, 1);
  assert.equal(triagem.preOS.alertas[0].tipo, 'garantia');

  // Conversão para OS mantendo os metadados de rastreabilidade
  const conv = preOSEngine.converterEmOS({
    tenantId: 'oficina_zap',
    preOSId: triagem.preOS.id,
    boxId: 'b2',
    state,
    dataReferencia: '2026-09-10'
  });

  assert.equal(conv.ok, true);
  assert.equal(conv.os.preOSId, triagem.preOS.id);
  assert.equal(conv.os.possivelGarantia, true);
  assert.equal(conv.os.alertasGerados.length, 1);
  assert.equal(conv.os.box, 'b2');
  assert.equal(conv.os.st, 'executando');
});

/* ── 9. TESTE E2E COMPLETO DO SERVIDOR: ENDPOINTS REST DA PRÉ-OS ── */
test('9. Servidor Real E2E: endpoints REST /api/pre-os com autenticação e isolamento multi-tenant', async (t) => {
  const serverNet = net.createServer();
  await new Promise(r => serverNet.listen(0, r));
  const port = serverNet.address().port;
  await new Promise(r => serverNet.close(r));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_preos_test_'));
  const dbPath = path.join(tempDir, 'test_preos.db');
  const root = path.resolve(__dirname, '..');
  let child;

  async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-preos-api-key',
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

  const apiTenant = (tenantId) => {
    const headers = { 'x-api-key': 'test-preos-api-key' };
    if (tenantId) headers['x-tenant-id'] = tenantId;
    return {
      get: (url) => fetch(`http://127.0.0.1:${port}${url}`, { headers }),
      post: (url, body) => fetch(`http://127.0.0.1:${port}${url}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    };
  };

  const clientAlfa = apiTenant('oficina_alfa');
  const clientBeta = apiTenant('oficina_beta');

  // 9.1 Inicializa estado para oficina_alfa com histórico de OS
  await clientAlfa.post('/api/estado', {
    os: [
      {
        id: 'os_alfa_1',
        num: 1050,
        vei: 'v_alfa_caminhao',
        cli: 'c_alfa',
        st: 'finalizada',
        abertura: '2026-08-10',
        km: 220000,
        queixa: 'Embuchamento de eixo dianteiro',
        servicos: [{ id: 's1', nome: 'Troca de buchas de manga de eixo' }]
      }
    ],
    veiculos: [
      { id: 'v_alfa_caminhao', placa: 'ALF1234', modelo: 'Meteor 28.460', km: 225000, cli: 'c_alfa' }
    ],
    clientes: [{ id: 'c_alfa', nome: 'Transportes Alfa' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    preOS: [],
    versao: 0
  });

  // 9.2 Inicializa oficina_beta sem esse histórico
  await clientBeta.post('/api/estado', {
    os: [],
    veiculos: [
      { id: 'v_beta_caminhao', placa: 'BET5678', modelo: 'Constellation', km: 110000, cli: 'c_beta' }
    ],
    clientes: [{ id: 'c_beta', nome: 'Transportes Beta' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    preOS: [],
    versao: 0
  });

  // 9.3 POST /api/pre-os/triagem na oficina_alfa (detecta recorrência / garantia)
  const resTriagemAlfa = await clientAlfa.post('/api/pre-os/triagem', {
    placa: 'ALF1234',
    kmAtual: 225000,
    reclamacao: 'Barulho no eixo dianteiro e bucha batendo',
    origem: 'web'
  });
  assert.equal(resTriagemAlfa.status, 200);
  const triagemAlfaData = await resTriagemAlfa.json();
  assert.equal(triagemAlfaData.success, true);
  assert.equal(triagemAlfaData.preOS.possivelGarantia, true);
  assert.equal(triagemAlfaData.preOS.status, 'aguardando_confirmacao');
  const preOSIdAlfa = triagemAlfaData.preOS.id;

  // 9.4 GET /api/pre-os na oficina_alfa lista a Pré-OS criada
  const resListaAlfa = await clientAlfa.get('/api/pre-os');
  assert.equal(resListaAlfa.status, 200);
  const listaAlfaData = await resListaAlfa.json();
  assert.equal(listaAlfaData.total, 1);
  assert.equal(listaAlfaData.preOS[0].id, preOSIdAlfa);

  // 9.5 ISOLAMENTO MULTI-TENANT: oficina_beta NÃO enxerga a Pré-OS da oficina_alfa
  const resListaBeta = await clientBeta.get('/api/pre-os');
  assert.equal(resListaBeta.status, 200);
  const listaBetaData = await resListaBeta.json();
  assert.equal(listaBetaData.total, 0, 'Oficina Beta deve ter 0 Pré-OS');

  // oficina_beta tenta consultar a Pré-OS de alfa por ID (deve retornar 404)
  const resConsultaInvasiva = await clientBeta.get(`/api/pre-os/${preOSIdAlfa}`);
  assert.equal(resConsultaInvasiva.status, 404);

  // 9.6 GET /api/pre-os/:id na oficina_alfa retorna a Pré-OS com detalhes
  const resConsultaAlfa = await clientAlfa.get(`/api/pre-os/${preOSIdAlfa}`);
  assert.equal(resConsultaAlfa.status, 200);
  const consultaAlfaData = await resConsultaAlfa.json();
  assert.equal(consultaAlfaData.success, true);
  assert.equal(consultaAlfaData.preOS.id, preOSIdAlfa);
  assert.equal(consultaAlfaData.preOS.possivelGarantia, true);

  // 9.7 POST /api/pre-os/:id/converter na oficina_alfa converte em OS definitiva
  const resConverterAlfa = await clientAlfa.post(`/api/pre-os/${preOSIdAlfa}/converter`, {
    boxId: 'b1',
    mecanico: 'Mestre Valdir'
  });
  assert.equal(resConverterAlfa.status, 200);
  const converterAlfaData = await resConverterAlfa.json();
  assert.equal(converterAlfaData.success, true);
  assert.equal(converterAlfaData.os.preOSId, preOSIdAlfa);
  assert.equal(converterAlfaData.os.possivelGarantia, true);
  assert.equal(converterAlfaData.preOS.status, 'convertida');

  // 9.8 POST /api/os/entrada via HTTP cria OS e vincula Pré-OS automaticamente
  const resEntradaZap = await clientAlfa.post('/api/os/entrada', {
    placa: 'ALF1234',
    clienteNome: 'Transportes Alfa',
    textoOriginal: 'Chegou para conferir freio'
  });
  assert.equal(resEntradaZap.status, 200);
  const entradaZapData = await resEntradaZap.json();
  assert.equal(entradaZapData.success, true);
  assert.ok(entradaZapData.os.preOSId, 'OS aberta pela rota de entrada deve conter preOSId');

  // 9.9 POST /api/pre-os/triagem + POST /api/pre-os/:id/cancelar na oficina_beta
  const resTriagemBeta = await clientBeta.post('/api/pre-os/triagem', {
    placa: 'BET5678',
    kmAtual: 110000,
    reclamacao: 'Trocar correia alternador',
    origem: 'web'
  });
  assert.equal(resTriagemBeta.status, 200);
  const triagemBetaData = await resTriagemBeta.json();
  const preOSIdBeta = triagemBetaData.preOS.id;

  const resCancBeta = await clientBeta.post(`/api/pre-os/${preOSIdBeta}/cancelar`, {
    motivo: 'Cliente optou por realizar em outra data'
  });
  assert.equal(resCancBeta.status, 200);
  const cancBetaData = await resCancBeta.json();
  assert.equal(cancBetaData.success, true);
  assert.equal(cancBetaData.preOS.status, 'cancelada');
  assert.equal(cancBetaData.preOS.motivoCancelamento, 'Cliente optou por realizar em outra data');
});
