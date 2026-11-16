'use strict';

/**
 * tests/sprint112_whatsapp_multimodal_voice_ocr_vision.test.cjs
 *
 * Suíte de Testes TDD: Sprint 11.2 (Fase 11 - IA Multimodal no Chão de Oficina e Financeiro)
 * - Transcrição de Áudio/Voz (Whisper ASR) integrada ao NLU com RBAC
 * - Visão/OCR: Comprovante PIX, DANFE/NF de Peças, Portaria 360º e Peça Condenada no Box
 * - Inbound Multimodal via Gateway Adapter & Telemetria
 *
 * Teto Modular: <= 350 linhas
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  configurarProvedoresMultimodaisWhatsApp,
  transcreverAudioEExecutarSkillWhatsApp,
  processarImagemOcrWhatsApp,
  obterTelemetriaMultimodalWhatsApp
} = require('../services/whatsapp/whatsappMultimodalAudioVisionService');

const {
  receberWebhookRealGatewayWhatsApp
} = require('../services/whatsapp/whatsappGatewayAdapterService');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_teste_multimodal',
    clientes: [
      { id: 'cli_transp_fort', nome: 'Transportadora Fortaleza', cnpj: '11.222.333/0001-44', limiteCredito: 25000, titulosVencidos: [] }
    ],
    veiculos: [
      { placa: 'ABC1D23', modelo: 'Volvo FH 540', clienteId: 'cli_transp_fort', kmAtual: 410000 }
    ],
    os: [
      { id: 'os_mm_101', num: 101, placa: 'ABC1D23', clienteId: 'cli_transp_fort', status: 'em_andamento', boxAtualId: 'box_02', itens: [], totalGeral: 0 }
    ],
    boxes: [
      { id: 'box_02', nome: 'Box 02 - Pesados', status: 'ocupado', osAtualId: 'os_mm_101' }
    ],
    pecas: [
      { id: 'peca_mol_01', codigo: 'MOL-01', descricao: 'Feixe de Mola Traseiro', qtd: 5, custoMedio: 400.00, custo: 400.00 }
    ],
    estoque: [],
    inventoryMovements: [],
    partReservations: [],
    purchaseOrders: [
      {
        id: 'ped_compra_99',
        tenantId: 'tenant_teste_multimodal',
        status: 'aprovado',
        fornecedorNome: 'Molas Brasil Distribuidora',
        valorTotalPedido: 1200.00,
        condicaoPagamentoParcelas: 1,
        osVinculadaId: 'os_mm_101',
        itens: [
          { pecaId: 'peca_mol_01', codigo: 'MOL-01', descricao: 'Feixe de Mola Traseiro', quantidade: 2, custoUnitario: 450.00 }
        ]
      }
    ],
    contas: [],
    paymentCharges: [
      { id: 'chg_pix_77', txid: 'PIX_TEST_MM_8899', valorCobrar: 750.00, status: 'pendente', osId: 'os_mm_101' }
    ],
    borderos: [],
    borderosFrotistas: [],
    whatsappMultimodalConfig: {},
    whatsappAudioTranscriptionLogs: [],
    whatsappVisionOcrLogs: []
  };
}

test('Sprint 11.2 - Motor Multimodal: Configuração de Provedores Whisper e Visão', () => {
  const state = criarEstadoMock();
  const cfg = configurarProvedoresMultimodaisWhatsApp(state, {
    audioProvider: 'whisper_local',
    whisperModel: 'whisper-large-v3',
    visionProvider: 'vision_llm_local',
    visionModel: 'qwen2-vl:7b',
    limiarConfiancaOcr: 0.88
  });

  assert.equal(cfg.audioProvider, 'whisper_local');
  assert.equal(cfg.whisperModel, 'whisper-large-v3');
  assert.equal(cfg.visionModel, 'qwen2-vl:7b');
  assert.equal(cfg.limiarConfiancaOcr, 0.88);
  assert.equal(state.whatsappMultimodalConfig.visionProvider, 'vision_llm_local');
});

test('Sprint 11.2 - Áudio/Voz: Transcrição e Execução de Skill via NLU com RBAC', () => {
  const state = criarEstadoMock();

  // 1. Áudio de cliente para triagem/portaria (permitido)
  const resAudioPortaria = transcreverAudioEExecutarSkillWhatsApp(state, {
    textoTranscrito: 'Olá, por favor triagem portaria placa ABC1D23 km 412500',
    telefoneRemetente: '5585988887777',
    perfilRemetente: 'cliente',
    duracaoSegundos: 5
  });

  assert.ok(resAudioPortaria.sucesso);
  assert.equal(resAudioPortaria.transcricao.duracaoSegundos, 5);
  assert.equal(resAudioPortaria.resultadoNlu.skillAlvo, 'SKILL_RECEPCAO_PATIO');
  assert.equal(state.whatsappAudioTranscriptionLogs.length, 1);
  assert.equal(state.whatsappAudioTranscriptionLogs[0].textoTranscrito, 'Olá, por favor triagem portaria placa ABC1D23 km 412500');

  // 2. Áudio de cliente tentando comando financeiro restrito -> Bloqueado com 403
  assert.throws(() => {
    transcreverAudioEExecutarSkillWhatsApp(state, {
      textoTranscrito: 'Verônica, me envie o fechamento de caixa diário e briefing DRE',
      telefoneRemetente: '5585988887777',
      perfilRemetente: 'cliente'
    });
  }, err => {
    return err.code === 'WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL' && err.status === 403;
  });

  // 3. Mesmo comando financeiro falado por Gerência -> Autorizado com sucesso!
  const resAudioGerente = transcreverAudioEExecutarSkillWhatsApp(state, {
    textoTranscrito: 'Verônica, me envie o fechamento de caixa diário e briefing DRE',
    telefoneRemetente: '5585999990001',
    perfilRemetente: 'gerencia'
  });
  assert.ok(resAudioGerente.sucesso);
  assert.equal(resAudioGerente.resultadoNlu.skillAlvo, 'SKILL_ANALISTA_FINANCEIRO');
});

test('Sprint 11.2 - Visão/OCR: [Fluxo A] Comprovante de Pagamento PIX com Baixa Automática', () => {
  const state = criarEstadoMock();

  const resOcrPix = processarImagemOcrWhatsApp(state, {
    tipoDocumento: 'comprovante_pagamento_pix',
    textoBrutoOcr: 'Comprovante de Transferência PIX Efetuada com Sucesso no valor de R$ 750,00 ID: PIX_TEST_MM_8899',
    telefoneRemetente: '5585988887777'
  });

  assert.ok(resOcrPix.sucesso);
  assert.equal(resOcrPix.tipo, 'comprovante_pagamento_pix');
  assert.equal(resOcrPix.txid, 'PIX_TEST_MM_8899');
  assert.equal(resOcrPix.valorPago, 750);

  // Valida que a cobrança no financeiro foi marcada como liquidada
  const chg = state.paymentCharges.find(c => c.txid === 'PIX_TEST_MM_8899');
  assert.equal(chg.status, 'liquidada_webhook');
  assert.equal(chg.valorPago, 750);
});

test('Sprint 11.2 - Visão/OCR: [Fluxo B] DANFE/NF de Peças com Recálculo CMP e Guarda RBAC', () => {
  const state = criarEstadoMock();

  // 1. Cliente comum tenta processar DANFE -> Bloqueado 403
  assert.throws(() => {
    processarImagemOcrWhatsApp(state, {
      tipoDocumento: 'danfe_nf_compra_pecas',
      pedidoId: 'ped_compra_99',
      numeroNF: '987654',
      perfilRemetente: 'cliente'
    });
  }, err => err.code === 'WHATSAPP_UNAUTHORIZED_OCR_ACTION' && err.status === 403);

  // 2. Compras processa a DANFE -> Entrada no estoque, recálculo CMP e baixa de gargalo
  const resOcrNf = processarImagemOcrWhatsApp(state, {
    tipoDocumento: 'danfe_nf_compra_pecas',
    pedidoId: 'ped_compra_99',
    numeroNF: '987654',
    chaveAcessoNFe: '35261111222333000144550010009876541234567890',
    perfilRemetente: 'compras'
  });

  assert.ok(resOcrNf.sucesso);
  assert.equal(resOcrNf.pedidoId, 'ped_compra_99');
  assert.equal(resOcrNf.numeroNF, '987654');

  // Pedido marcado como recebido
  const ped = state.purchaseOrders.find(p => p.id === 'ped_compra_99');
  assert.equal(ped.status, 'recebido');

  // CMP recalculado: (5 * 400 + 2 * 450) / 7 = 2900 / 7 = 414.29
  const peca = state.pecas.find(p => p.id === 'peca_mol_01');
  assert.equal(peca.qtd, 7);
  assert.equal(peca.custoMedio, 414.29);

  // Reserva criada para a OS vinculada
  assert.ok(state.partReservations.some(r => r.osId === 'os_mm_101' && r.partId === 'peca_mol_01'));
});

test('Sprint 11.2 - Visão/OCR: [Fluxo C] Placa e Hodômetro de Portaria com Triagem 360º', () => {
  const state = criarEstadoMock();

  const resOcrPortaria = processarImagemOcrWhatsApp(state, {
    tipoDocumento: 'placa_hodometro_portaria',
    textoBrutoOcr: 'Entrada portaria caminhão Placa ABC1D23 Km 415000',
    telefoneRemetente: '5585977778888'
  });

  assert.ok(resOcrPortaria.sucesso);
  assert.equal(resOcrPortaria.placa, 'ABC1D23');
  assert.equal(resOcrPortaria.kmEntrada, 415000);
  assert.ok(resOcrPortaria.triagem);
  assert.equal(resOcrPortaria.triagem.placa, 'ABC1D23');
  assert.ok(resOcrPortaria.triagem.clienteId);
});

test('Sprint 11.2 - Visão/OCR: [Fluxo D] Evidência Técnica de Peça Condenada no Box', () => {
  const state = criarEstadoMock();

  const resOcrCondenada = processarImagemOcrWhatsApp(state, {
    tipoDocumento: 'evidencia_peca_condenada_box',
    osId: 'os_mm_101',
    pecaDescricao: 'Tambor de freio traseiro trincado no cubo',
    boxId: 'box_02',
    mecanicoId: 'mec_05',
    mecanicoNome: 'Raimundo Mecânico',
    quantidade: 1,
    valorUnitario: 850.00,
    valorMaoObraAdicional: 150.00,
    laudoTecnicoCurto: 'Fissura detectada após desmontagem de roda e medição com paquímetro',
    imagemUrl: 'https://cdn.patio-crm.local/evidencias/tambor_trincado.jpg'
  });

  assert.ok(resOcrCondenada.sucesso);
  assert.equal(resOcrCondenada.osId, 'os_mm_101');
  assert.ok(resOcrCondenada.evidencia);
  assert.equal(resOcrCondenada.evidencia.osId, 'os_mm_101');
  assert.equal(resOcrCondenada.evidencia.pecaDescricao, 'Tambor de freio traseiro trincado no cubo');

  // Verifica inserção da peça condenada na OS e nas evidências de desmontagem
  const os = state.os.find(o => o.id === 'os_mm_101');
  const pecaOs = os.pecas.find(p => p.desc.includes('Tambor de freio'));
  assert.ok(pecaOs);
  assert.equal(pecaOs.statusAprovacao, 'pendente_frotista');
  assert.equal(pecaOs.origemCondenacaoBox, true);
  assert.ok(os.evidenciasDesmontagemBox.some(e => e.pecaDescricao.includes('Tambor de freio')));
});

test('Sprint 11.2 - Visão/OCR: Validação de Tipo de Documento Inválido', () => {
  const state = criarEstadoMock();
  assert.throws(() => {
    processarImagemOcrWhatsApp(state, {
      tipoDocumento: 'contrato_social_empresa'
    });
  }, err => err.code === 'TIPO_DOCUMENTO_OCR_INVALIDO' && err.status === 400);
});

test('Sprint 11.2 - Inbound Gateway com Anexos de Áudio e Imagem & Telemetria', () => {
  const state = criarEstadoMock();

  // Inbound via Gateway Adapter com áudio simulado
  const resGwAudio = receberWebhookRealGatewayWhatsApp(state, {
    externalMessageId: 'msg_aud_gw_01',
    telefoneRemetente: '5585988887777',
    perfilRemetente: 'gerencia',
    anexoMidia: {
      mimetype: 'audio/ogg',
      tipo: 'audio_voz',
      textoTranscrito: 'Consultar status do box 02'
    }
  }, { ignorarAssinatura: true });

  assert.ok(resGwAudio.sucesso);
  assert.ok(resGwAudio.multimodalProcessado);

  // Inbound via Gateway Adapter com imagem simulada (comprovante PIX)
  const resGwImg = receberWebhookRealGatewayWhatsApp(state, {
    externalMessageId: 'msg_img_gw_02',
    telefoneRemetente: '5585988887777',
    anexoMidia: {
      mimetype: 'image/jpeg',
      tipo: 'imagem_ocr',
      tipoDocumento: 'comprovante_pagamento_pix',
      textoBrutoOcr: 'PIX efetuado txid PIX_TEST_MM_8899 valor R$ 750,00'
    }
  }, { ignorarAssinatura: true });

  assert.ok(resGwImg.sucesso);
  assert.ok(resGwImg.multimodalProcessado);

  // Telemetria consolidada
  const telemetria = obterTelemetriaMultimodalWhatsApp(state);
  assert.ok(telemetria.totalAudiosTranscritos >= 1);
  assert.ok(telemetria.totalImagensOcrProcessadas >= 1);
  assert.equal(telemetria.whisperPronto, true);
  assert.equal(telemetria.visionPronto, true);
});

test('Sprint 11.2 - Componentes Visuais de UI e Ações do Motor Multimodal', () => {
  require('../js/modules/whatsapp_multimodal_ia_ui');
  require('../js/modules/whatsapp_multimodal_ia_actions');

  const html = globalThis.renderPainelMultimodalIaHtml({
    telemetria: {
      whisperModel: 'whisper-base-pt',
      visionModel: 'llava:7b',
      whisperPronto: true,
      visionPronto: true,
      totalAudiosTranscritos: 12,
      totalImagensOcrProcessadas: 34,
      ocrPorTipo: { comprovante_pagamento_pix: 10, danfe_nf_compra_pecas: 8, placa_hodometro_portaria: 9, evidencia_peca_condenada_box: 7 }
    },
    logsAudio: [{ telefoneRemetente: '5585999990000', textoTranscrito: 'teste voz', duracaoSegundos: 3 }],
    logsOcr: [{ tipoDocumento: 'comprovante_pagamento_pix', telefoneRemetente: '5585999990000', confianca: 0.95 }]
  });

  assert.match(html, /IA Multimodal WhatsApp \(Áudio Whisper & Visão OCR\)/);
  assert.match(html, /data-act="abrir-config-multimodal-btn"/);
  assert.match(html, /data-act="simular-audio-modal-btn"/);
  assert.match(html, /data-act="simular-ocr-modal-btn"/);
  assert.match(html, /data-act="atualizar-telemetria-multimodal-btn"/);

  const modalCfg = globalThis.modalConfigurarMultimodalHtml({ audioProvider: 'whisper_local' });
  assert.match(modalCfg, /Configurar Motores Multimodais/);
  assert.match(modalCfg, /data-act="salvar-config-multimodal-action"/);

  const modalAudio = globalThis.modalSimularAudioHtml();
  assert.match(modalAudio, /Testar Entrada de Áudio\/Voz/);
  assert.match(modalAudio, /data-act="executar-simulacao-audio-action"/);

  const modalOcr = globalThis.modalSimularOcrHtml();
  assert.match(modalOcr, /Testar Visão\/OCR/);
  assert.match(modalOcr, /data-act="executar-simulacao-ocr-action"/);

  assert.equal(typeof globalThis.abrirModalConfigurarMultimodal, 'function');
  assert.equal(typeof globalThis.abrirModalSimularAudio, 'function');
  assert.equal(typeof globalThis.abrirModalSimularOcr, 'function');
  assert.equal(typeof globalThis.salvarConfiguracaoMultimodalAction, 'function');
  assert.equal(typeof globalThis.executarSimulacaoAudioAction, 'function');
  assert.equal(typeof globalThis.executarSimulacaoOcrAction, 'function');
  assert.equal(typeof globalThis.atualizarTelemetriaMultimodalAction, 'function');
});
