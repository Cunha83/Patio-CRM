'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const pricingEngine = require('../services/pricingEngine');
const costingService = require('../services/costingService');
const operationalIntelligenceEngine = require('../services/operationalIntelligenceEngine');
const voiceActionEngine = require('../services/voiceActionEngine');

function criarEstadoBase(tenantId = 'tenant_oficina_1') {
  return {
    tenantId,
    cfg: {
      empresa: 'Auto Molas & Mecânica Diesel Pesada',
      precificacao: {
        margemAlvoPadrao: 35.0,
        margemMinimaPadrao: 20.0,
        amostraMinimaHistorico: 5,
        modo: 'alertar',
        margensPorCategoria: {
          motor: { margemAlvo: 40.0, margemMinima: 25.0 },
          freio: { margemAlvo: 35.0, margemMinima: 20.0 },
          suspensao: { margemAlvo: 30.0, margemMinima: 18.0 }
        }
      }
    },
    workers: [
      { id: 'w1', tenantId, nome: 'Antônio Chefe', custoHora: 60.0, ativo: true },
      { id: 'w2', tenantId, nome: 'Carlos Especialista', custoHora: 40.0, ativo: true }
    ],
    servicos: [
      { id: 'srv_embreagem', tenantId, nome: 'Troca de Embreagem Scania R450', categoria: 'transmissao', preco: 1500, tempoEstimadoMinutos: 360 },
      { id: 'srv_freio', tenantId, nome: 'Revisão de Freios Dianteiros', categoria: 'freio', preco: 450, tempoEstimadoMinutos: 120 },
      { id: 'srv_catalogo_only', tenantId, nome: 'Calibração de Injetores', categoria: 'motor', preco: 600, tempoEstimadoMinutos: 180 },
      { id: 'srv_sem_dados', tenantId, nome: 'Serviço Personalizado Raro', categoria: 'custom', preco: 0 }
    ],
    pecas: [
      { id: 'part_kit_emb', tenantId, codigoInterno: 'KIT-EMB-01', descricao: 'Kit de Embreagem 430mm', custoMedio: 1200.0, ultimoCusto: 1250.0, preco: 1900.0, qtd: 4 },
      { id: 'part_pastilha', tenantId, codigoInterno: 'PST-02', descricao: 'Jogo Pastilha Freio', custoMedio: 180.0, ultimoCusto: 190.0, preco: 320.0, qtd: 10 },
      { id: 'part_sem_medio', tenantId, codigoInterno: 'RET-09', descricao: 'Retentor Especial', custoMedio: 0, ultimoCusto: 85.0, preco: 150.0, qtd: 2 },
      { id: 'part_inflacionada', tenantId, codigoInterno: 'VALV-12', descricao: 'Válvula Reguladora', custoMedio: 100.0, ultimoCusto: 135.0, preco: 220.0, qtd: 3 }
    ],
    os: [],
    quotations: [],
    pricingOverrides: [],
    auditoria: []
  };
}

// ── TESTE 1: Cálculo exato da fórmula de preço alvo ─────────────────
test('1. Cálculo exato da fórmula de preço alvo: Preço = Custo / (1 - Margem Alvo/100)', () => {
  // Preço = 650 / (1 - 0.35) = 650 / 0.65 = 1000.00
  const p1 = pricingEngine.calcularPrecoAlvo(650, 35);
  assert.equal(p1, 1000.00);

  // Preço = 120 / (1 - 0.25) = 120 / 0.75 = 160.00
  const p2 = pricingEngine.calcularPrecoAlvo(120, 25);
  assert.equal(p2, 160.00);

  // Custo zero -> Preço zero
  assert.equal(pricingEngine.calcularPrecoAlvo(0, 30), 0);

  // Margem >= 100 deve lançar erro
  assert.throws(() => pricingEngine.calcularPrecoAlvo(100, 100), /Margem inválida/);
  assert.throws(() => pricingEngine.calcularPrecoAlvo(100, -5), /Margem inválida/);
});

// ── TESTE 2: Distinção matemática entre margem bruta e markup ───────
test('2. Distinção matemática entre margem bruta e markup (Markup = Margem / (1 - Margem))', () => {
  const custo = 100;
  const preco = 150;

  const margem = pricingEngine.calcularMargemBruta(preco, custo); // (150 - 100) / 150 = 33.33%
  const markup = pricingEngine.calcularMarkup(preco, custo);       // (150 - 100) / 100 = 50.00%

  assert.equal(margem, 33.33);
  assert.equal(markup, 50.00);
  assert.notEqual(margem, markup);

  // Verificação matemática da relação: Markup = Margem / (1 - Margem)
  const margemFracao = margem / 100;
  const markupEsperado = Number(((margemFracao / (1 - margemFracao)) * 100).toFixed(2));
  assert.equal(Math.round(markup), Math.round(markupEsperado));
});

// ── TESTE 3: Preço mínimo calculado estritamente sobre a margem mínima ──
test('3. Preço mínimo calculado estritamente sobre a margem mínima configurada', () => {
  const custo = 800;
  const margemMinima = 20; // Preço Mínimo = 800 / (1 - 0.20) = 1000.00

  const pMin = pricingEngine.calcularPrecoMinimo(custo, margemMinima);
  assert.equal(pMin, 1000.00);

  // Verifica que a margem no preço mínimo é exatamente a margem mínima
  const margemNoMinimo = pricingEngine.calcularMargemBruta(pMin, custo);
  assert.equal(margemNoMinimo, 20.00);
});

// ── TESTE 4: Desconto máximo seguro calculado como Preço Atual - Preço Mínimo ──
test('4. Desconto máximo seguro calculado como Preço Atual - Preço Mínimo (nunca negativo)', () => {
  // Preço Atual 1200, Piso Mínimo 1000 -> Desconto Seguro = 200 (16.67%)
  const d1 = pricingEngine.calcularDescontoSeguro(1200, 1000);
  assert.equal(d1.descontoMaximoSeguro, 200.00);
  assert.equal(d1.descontoMaximoPercentual, 16.67);

  // Preço Atual 900, Piso Mínimo 1000 -> Já está abaixo do piso, desconto seguro é 0
  const d2 = pricingEngine.calcularDescontoSeguro(900, 1000);
  assert.equal(d2.descontoMaximoSeguro, 0.00);
  assert.equal(d2.descontoMaximoPercentual, 0.00);
  assert.equal(d2.jaAbaixoDoMinimo, true);
});

// ── TESTE 5: Desconto que fura a margem mínima gera aviso ou bloqueio ──
test('5. Desconto que fura a margem mínima gera aviso ou bloqueio conforme modo configurado', () => {
  const custo = 800;
  const precoMinimo = 1000;
  const precoAbaixo = 900; // Gera margem de 11.11% (< 20%)

  // Modo Alertar
  const valAlertar = pricingEngine.validarPoliticaMargem({
    modo: 'alertar',
    precoProposto: precoAbaixo,
    precoMinimo,
    margemMinima: 20
  });
  assert.equal(valAlertar.permitido, true);
  assert.equal(valAlertar.severidade, 'aviso');
  assert.ok(valAlertar.aviso.includes('abaixo do piso'));

  // Modo Exigir Confirmação
  const valConfirmar = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_confirmacao',
    precoProposto: precoAbaixo,
    precoMinimo,
    confirmado: false
  });
  assert.equal(valConfirmar.permitido, false);
  assert.equal(valConfirmar.requerConfirmacao, true);

  // Modo Exigir Confirmação com flag confirmada
  const valConfirmado = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_confirmacao',
    precoProposto: precoAbaixo,
    precoMinimo,
    confirmado: true
  });
  assert.equal(valConfirmado.permitido, true);

  // Modo Exigir Aprovação (sem permissão)
  const valAprovacaoSemPerm = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_aprovacao',
    precoProposto: precoAbaixo,
    precoMinimo,
    userPermissions: ['pricing:read']
  });
  assert.equal(valAprovacaoSemPerm.permitido, false);
  assert.equal(valAprovacaoSemPerm.bloqueado, true);

  // Modo Exigir Aprovação (com permissão pricing:override)
  const valAprovacaoComPerm = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_aprovacao',
    precoProposto: precoAbaixo,
    precoMinimo,
    userPermissions: ['pricing:override']
  });
  assert.equal(valAprovacaoComPerm.permitido, true);
});

// ── TESTE 6: Cálculo de tempo histórico usando a mediana quando amostra >= 5 ──
test('6. Cálculo de tempo histórico usando a mediana quando amostra >= 5', () => {
  const state = criarEstadoBase();
  // 5 execuções com tempos em minutos: 180, 200, 240, 260, 600
  // Ordenado: 180, 200, [240], 260, 600 -> Mediana = 240 min. (Média = 296 min)
  const tempos = [180, 200, 240, 260, 600];
  tempos.forEach((min, idx) => {
    state.os.push({
      id: `os_${idx + 1}`,
      num: 100 + idx,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_embreagem', nome: 'Troca de Embreagem Scania R450', valor: 1500, preco: 1500, tempoRealMinutos: min, horasReais: min / 60 }]
    });
  });

  const hist = pricingEngine.consultarHistoricoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_embreagem'
  });

  assert.equal(hist.quantidadeExecucoes, 5);
  assert.equal(hist.tempoMediano, 240);
  assert.equal(hist.tempoMedio, 296);
  assert.equal(hist.amostraSuficiente, true);
});

// ── TESTE 7: Identificação e flag de outliers (duração > 3x mediana) sem exclusão silenciosa ──
test('7. Identificação e flag de outliers (duração > 3x mediana) sem exclusão silenciosa', () => {
  const state = criarEstadoBase();
  // Mediana aproximada = 100. Um item com 350 min (> 3x 100 = 300) é outlier.
  const tempos = [90, 95, 100, 105, 350];
  tempos.forEach((min, idx) => {
    state.os.push({
      id: `os_${idx + 1}`,
      num: 200 + idx,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', nome: 'Revisão de Freios Dianteiros', valor: 450, tempoRealMinutos: min }]
    });
  });

  const hist = pricingEngine.consultarHistoricoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_freio'
  });

  assert.equal(hist.quantidadeExecucoes, 5);
  assert.equal(hist.tempoMediano, 100);
  assert.equal(hist.outliers.length, 1);
  assert.equal(hist.outliers[0].tempoRealMinutos, 350);
  assert.equal(hist.outliers[0].flagOutlier, true);
  // O outlier NÃO é excluído silenciosamente da contagem
  assert.equal(hist.execucoesValidas.length, 5);
});

// ── TESTE 8: Fallback para estimativa de catálogo quando amostra histórica < 5 ──
test('8. Fallback para estimativa de catálogo quando amostra histórica < 5 e flag baseHistoricaInsuficiente = true', () => {
  const state = criarEstadoBase();
  // Apenas 2 execuções para 'srv_catalogo_only'. Catálogo define tempoEstimadoMinutos: 180.
  state.os.push(
    { id: 'os_1', tenantId: state.tenantId, st: 'finalizada', servicos: [{ id: 'srv_catalogo_only', tempoRealMinutos: 170 }] },
    { id: 'os_2', tenantId: state.tenantId, st: 'finalizada', servicos: [{ id: 'srv_catalogo_only', tempoRealMinutos: 190 }] }
  );

  const rec = pricingEngine.gerarRecomendacaoPreco({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_catalogo_only',
    userPermissions: ['pricing:read']
  });

  assert.equal(rec.ok, true);
  assert.equal(rec.amostraHistorica.tamanhoAmostra, 2);
  assert.equal(rec.amostraHistorica.baseHistoricaInsuficiente, true);
  assert.equal(rec.confianca, 'baixa');
});

// ── TESTE 9: Retorno de tempoEstimado = null quando não há histórico nem catálogo ──
test('9. Retorno de tempoEstimado = null quando não há histórico nem catálogo (sem inventar dados)', () => {
  const state = criarEstadoBase();
  // 'srv_sem_dados' não tem histórico em OS e tempoEstimadoMinutos = null no catálogo
  const custo = pricingEngine.calcularCustoEsperadoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_sem_dados'
  });

  assert.equal(custo.tempoEsperadoMinutos, null);
  assert.equal(custo.custoMaoObraEsperado, 0);
  assert.equal(custo.fonteTempo, 'indisponivel');

  const rec = pricingEngine.gerarRecomendacaoPreco({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_sem_dados',
    userPermissions: ['pricing:read']
  });

  assert.equal(rec.ok, true);
  assert.equal(rec.tempoEsperadoHoras, null);
  assert.equal(rec.confianca, 'baixa');
});

// ── TESTE 10: Custo de MO baseado no custo/hora real dos mecânicos da oficina ──
test('10. Custo de mão de obra baseado no custo/hora real dos mecânicos da oficina (média da equipe ativa)', () => {
  const state = criarEstadoBase();
  // Equipe ativa: w1 (60.00) + w2 (40.00) -> Média = 50.00 R$/h
  // 'srv_freio' possui catálogo de 120 min (2h)
  const custo = pricingEngine.calcularCustoEsperadoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_freio'
  });

  assert.equal(custo.custoHoraEquipe, 50.00);
  assert.equal(custo.tempoEsperadoMinutos, 120);
  // 2h * 50.00 R$/h = 100.00 R$
  assert.equal(custo.custoMaoObraEsperado, 100.00);
});

// ── TESTE 11: Custo de peças priorizando custo médio ponderado do estoque ──
test('11. Custo de peças priorizando custo médio ponderado do estoque', () => {
  const state = criarEstadoBase();
  // part_kit_emb: custoMedio = 1200.0, ultimoCusto = 1250.0
  const custo = pricingEngine.calcularCustoEsperadoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_embreagem',
    pecasEspecificadas: [{ partId: 'part_kit_emb', qtd: 1 }]
  });

  assert.equal(custo.custoPecasEsperado, 1200.00);
  assert.equal(custo.itensPecasDetalhados[0].fonteCusto, 'custo_medio_estoque');
});

// ── TESTE 12: Fallback para último custo de compra quando custo médio não disponível ──
test('12. Fallback para último custo de compra quando custo médio não estiver disponível', () => {
  const state = criarEstadoBase();
  // part_sem_medio: custoMedio = 0, ultimoCusto = 85.0
  const custo = pricingEngine.calcularCustoEsperadoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_freio',
    pecasEspecificadas: [{ partId: 'part_sem_medio', qtd: 2 }]
  });

  // 2 * 85.0 = 170.00
  assert.equal(custo.custoPecasEsperado, 170.00);
  assert.equal(custo.itensPecasDetalhados[0].fonteCusto, 'ultimo_custo_compra');
});

// ── TESTE 13: Alerta emitido quando custo recente da peça subiu mais de 20% ──
test('13. Alerta emitido quando custo recente da peça subiu mais de 20% em relação ao histórico', () => {
  const state = criarEstadoBase();
  // part_inflacionada: custoMedio = 100.0, ultimoCusto = 135.0 (+35% de aumento)
  const alertas = operationalIntelligenceEngine.avaliarOperacao(state);
  const alertaInflacao = alertas.find(a => a.tipo === 'custo_peca_acima_historico' && a.referenciaId === 'part_inflacionada');

  assert.ok(alertaInflacao !== undefined);
  assert.equal(alertaInflacao.severidade, 'aviso');
  assert.ok(alertaInflacao.descricao.includes('35.0%'));
});

// ── TESTE 14: Segregação de serviços em garantia da base histórica de preço de venda ──
test('14. Segregação de serviços em garantia da base histórica de preço de venda (não polui médias)', () => {
  const state = criarEstadoBase();
  // 5 execuções comerciais de R$ 1500
  for (let i = 1; i <= 5; i++) {
    state.os.push({
      id: `os_com_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_embreagem', valor: 1500, preco: 1500, tempoRealMinutos: 360 }]
    });
  }
  // 2 retornos em garantia faturados a R$ 0
  for (let i = 1; i <= 2; i++) {
    state.os.push({
      id: `os_gar_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      garantia: true,
      servicos: [{ id: 'srv_embreagem', valor: 0, preco: 0, garantia: true, tempoRealMinutos: 360 }]
    });
  }

  const hist = pricingEngine.consultarHistoricoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_embreagem'
  });

  assert.equal(hist.quantidadeExecucoes, 7);
  assert.equal(hist.execucoesGarantia, 2);
  // O preço médio e mediano devem considerar APENAS as 5 execuções comerciais
  assert.equal(hist.precoVendaMediano, 1500.00);
  assert.equal(hist.precoVendaMedio, 1500.00);
});

// ── TESTE 15: Segregação de cortesias e retrabalhos do histórico de preços comerciais ──
test('15. Segregação de cortesias e retrabalhos do histórico de preços comerciais', () => {
  const state = criarEstadoBase();
  // Execuções comerciais: R$ 450
  for (let i = 1; i <= 5; i++) {
    state.os.push({
      id: `os_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', valor: 450, preco: 450, tempoRealMinutos: 120 }]
    });
  }
  // Cortesia: R$ 0
  state.os.push({
    id: 'os_cortesia',
    tenantId: state.tenantId,
    st: 'finalizada',
    servicos: [{ id: 'srv_freio', valor: 0, preco: 0, cortesia: true, tempoRealMinutos: 120 }]
  });

  const hist = pricingEngine.consultarHistoricoServico({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_freio'
  });

  assert.equal(hist.execucoesCortesia, 1);
  assert.equal(hist.precoVendaMediano, 450.00);
});

// ── TESTE 16: Recomendação de preço com nível de confiança ───────────
test('16. Recomendação de preço com nível de confiança: alta (>=10), média (5-9), baixa (<5 ou catálogo)', () => {
  const state = criarEstadoBase();

  // Caso Baixa Confiança: 2 execuções
  for (let i = 1; i <= 2; i++) {
    state.os.push({
      id: `os_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', valor: 450, tempoRealMinutos: 120 }]
    });
  }
  const rBaixa = pricingEngine.gerarRecomendacaoPreco({ tenantId: state.tenantId, state, serviceId: 'srv_freio', userPermissions: ['*'] });
  assert.equal(rBaixa.confianca, 'baixa');

  // Caso Média Confiança: adiciona mais 4 (total 6)
  for (let i = 3; i <= 6; i++) {
    state.os.push({
      id: `os_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', valor: 450, tempoRealMinutos: 120 }]
    });
  }
  const rMedia = pricingEngine.gerarRecomendacaoPreco({ tenantId: state.tenantId, state, serviceId: 'srv_freio', userPermissions: ['*'] });
  assert.equal(rMedia.confianca, 'media');

  // Caso Alta Confiança: adiciona mais 5 (total 11)
  for (let i = 7; i <= 11; i++) {
    state.os.push({
      id: `os_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', valor: 450, tempoRealMinutos: 120 }]
    });
  }
  const rAlta = pricingEngine.gerarRecomendacaoPreco({ tenantId: state.tenantId, state, serviceId: 'srv_freio', userPermissions: ['*'] });
  assert.equal(rAlta.confianca, 'alta');
});

// ── TESTE 17: Explicação determinística gerada com abertura transparente ──
test('17. Explicação determinística gerada com abertura transparente: horas de MO, custo MO, peças, margens', () => {
  const state = criarEstadoBase();
  const rec = pricingEngine.gerarRecomendacaoPreco({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_freio',
    userPermissions: ['pricing:read']
  });

  assert.equal(rec.ok, true);
  assert.ok(typeof rec.explicacao === 'string');
  assert.ok(rec.explicacao.includes('Tempo previsto:'));
  assert.ok(rec.explicacao.includes('Mão de obra:'));
  assert.ok(rec.explicacao.includes('Preço alvo recomendado:'));
  assert.ok(rec.explicacao.includes('Piso mínimo de segurança:'));
});

// ── TESTE 18: Proteção de margem: modo desativado ───────────────────
test('18. Proteção de margem: modo desativado permite alteração sem restrições', () => {
  const res = pricingEngine.validarPoliticaMargem({
    modo: 'desativado',
    precoProposto: 100,
    precoMinimo: 500,
    margemMinima: 20
  });

  assert.equal(res.permitido, true);
  assert.equal(res.severidade, 'info');
  assert.equal(res.aviso, null);
  assert.equal(res.bloqueado, false);
});

// ── TESTE 19: Proteção de margem: modo alertar ──────────────────────
test('19. Proteção de margem: modo alertar permite alteração com aviso registrado', () => {
  const res = pricingEngine.validarPoliticaMargem({
    modo: 'alertar',
    precoProposto: 400,
    precoMinimo: 500,
    margemMinima: 20
  });

  assert.equal(res.permitido, true);
  assert.equal(res.severidade, 'aviso');
  assert.ok(res.aviso.includes('abaixo do piso'));
  assert.equal(res.bloqueado, false);
});

// ── TESTE 20: Proteção de margem: modo exigir_confirmacao ───────────
test('20. Proteção de margem: modo exigir_confirmacao bloqueia até confirmação explícita', () => {
  const resPendente = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_confirmacao',
    precoProposto: 400,
    precoMinimo: 500,
    confirmado: false
  });
  assert.equal(resPendente.permitido, false);
  assert.equal(resPendente.requerConfirmacao, true);

  const resConfirmado = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_confirmacao',
    precoProposto: 400,
    precoMinimo: 500,
    confirmado: true
  });
  assert.equal(resConfirmado.permitido, true);
});

// ── TESTE 21: Proteção de margem: modo exigir_aprovacao ─────────────
test('21. Proteção de margem: modo exigir_aprovacao bloqueia sem permissão pricing:override', () => {
  const resBloqueado = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_aprovacao',
    precoProposto: 400,
    precoMinimo: 500,
    userPermissions: ['pricing:read']
  });
  assert.equal(resBloqueado.permitido, false);
  assert.equal(resBloqueado.bloqueado, true);
  assert.equal(resBloqueado.requerOverride, true);

  const resAutorizado = pricingEngine.validarPoliticaMargem({
    modo: 'exigir_aprovacao',
    precoProposto: 400,
    precoMinimo: 500,
    userPermissions: ['pricing:override']
  });
  assert.equal(resAutorizado.permitido, true);
});

// ── TESTE 22: Registro de override com justificativa na trilha de auditoria ──
test('22. Registro de override com justificativa, usuário autorizador e timestamp na trilha de auditoria', () => {
  const state = criarEstadoBase();
  const reg = pricingEngine.registrarOverridePreco({
    tenantId: state.tenantId,
    state,
    quotationId: 'orc_999',
    serviceId: 'srv_freio',
    precoProposto: 350,
    precoMinimo: 450,
    motivo: 'Cliente frotista com 50 caminhões fechando pacote mensal',
    autorizadoPor: 'gerente_comercial'
  });

  assert.equal(reg.ok, true);
  assert.equal(state.pricingOverrides.length, 1);
  const ov = state.pricingOverrides[0];
  assert.equal(ov.quotationId, 'orc_999');
  assert.equal(ov.precoProposto, 350);
  assert.equal(ov.precoMinimo, 450);
  assert.equal(ov.autorizadoPor, 'gerente_comercial');
  assert.ok(ov.timestamp !== undefined);

  // Auditoria registrada
  const aud = state.auditoria.find(a => a.tipo === 'pricing_override');
  assert.ok(aud !== undefined);
  assert.equal(aud.usuario, 'gerente_comercial');
});

// ── TESTE 23: Resumo de rentabilidade consolidada da oficina ─────────
test('23. Resumo de rentabilidade consolidada da oficina (receita, custo real, margem bruta, margem média)', () => {
  const state = criarEstadoBase();
  // Cria 2 OSs finalizadas
  state.os.push(
    {
      id: 'os_1',
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', valor: 500, preco: 500, autorizado: true, tempoRealMinutos: 120 }], // MO = 2h * 50 = 100
      pecas: [{ partId: 'part_pastilha', qtd: 1, preco: 300, valorTotal: 300, consumida: true }] // Custo = 180
      // Receita = 800, Custo = 280, Margem Bruta = 520 (65.0%)
    },
    {
      id: 'os_2',
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', valor: 400, preco: 400, autorizado: true, tempoRealMinutos: 120 }], // MO = 100
      pecas: []
      // Receita = 400, Custo = 100, Margem Bruta = 300 (75.0%)
    }
  );

  const resumo = pricingEngine.obterResumoRentabilidade({
    tenantId: state.tenantId,
    state
  });

  assert.equal(resumo.totalOrdensFinalizadas, 2);
  assert.equal(resumo.receitaTotal, 1200.00);
  assert.equal(resumo.custoRealTotal, 380.00);
  assert.equal(resumo.margemBrutaTotal, 820.00);
  assert.equal(resumo.margemPercentualGeral, 68.33);
});

// ── TESTE 24: Identificação e listagem de serviços com margem abaixo do piso ──
test('24. Identificação e listagem de serviços executados com margem abaixo do piso configurado', () => {
  const state = criarEstadoBase();
  state.cfg.precificacao.margemMinimaPadrao = 25.0;

  // OS 1: Margem saudável (50%)
  state.os.push({
    id: 'os_alta',
    tenantId: state.tenantId,
    st: 'finalizada',
    servicos: [{ id: 'srv_1', nome: 'Serviço Lucrativo', categoria: 'geral', valor: 1000, preco: 1000, autorizado: true, tempoRealMinutos: 120 }] // Custo MO = 100
  });

  // OS 2: Margem deficitária (10% < 25% piso)
  // Receita: 110, Custo MO: 100 -> Margem = 9.09%
  state.os.push({
    id: 'os_baixa',
    tenantId: state.tenantId,
    st: 'finalizada',
    servicos: [{ id: 'srv_2', nome: 'Serviço Prejuízo', categoria: 'geral', valor: 110, preco: 110, autorizado: true, tempoRealMinutos: 120 }] // Custo MO = 100
  });

  const lista = pricingEngine.obterRentabilidadeServicos({
    tenantId: state.tenantId,
    state,
    ordenarPor: 'margem_asc'
  });

  assert.equal(lista.length, 2);
  assert.equal(lista[0].serviceNome, 'Serviço Prejuízo');
  assert.equal(lista[0].abaixoDaMargemMinima, true);
  assert.equal(lista[1].abaixoDaMargemMinima, false);
});

// ── TESTE 25: Ranking de serviços por índice de retrabalho ───────────
test('25. Ranking de serviços por índice de retrabalho e impacto na rentabilidade', () => {
  const state = criarEstadoBase();

  // Serviço A: 5 execuções, 2 retrabalhos (40% de retrabalho)
  for (let i = 1; i <= 3; i++) {
    state.os.push({
      id: `os_a_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_a', nome: 'Serviço Problemático', valor: 500, preco: 500, autorizado: true, tempoRealMinutos: 60 }]
    });
  }
  for (let i = 1; i <= 2; i++) {
    state.os.push({
      id: `os_a_ret_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_a', nome: 'Serviço Problemático', valor: 0, preco: 0, retrabalho: true, autorizado: true, tempoRealMinutos: 60 }]
    });
  }

  // Serviço B: 5 execuções, 0 retrabalhos (0%)
  for (let i = 1; i <= 5; i++) {
    state.os.push({
      id: `os_b_${i}`,
      tenantId: state.tenantId,
      st: 'finalizada',
      servicos: [{ id: 'srv_b', nome: 'Serviço Perfeito', valor: 500, preco: 500, autorizado: true, tempoRealMinutos: 60 }]
    });
  }

  const ranking = pricingEngine.obterRentabilidadeServicos({
    tenantId: state.tenantId,
    state,
    ordenarPor: 'retrabalho_desc'
  });

  assert.equal(ranking[0].serviceId, 'srv_a');
  assert.equal(ranking[0].taxaRetrabalho, 40.0);
  assert.equal(ranking[1].serviceId, 'srv_b');
  assert.equal(ranking[1].taxaRetrabalho, 0.0);
});

// ── TESTE 26: Isolamento multi-tenant estrito ────────────────────────
test('26. Isolamento multi-tenant: dados de custo e histórico do Tenant A não influenciam Tenant B', () => {
  const state = criarEstadoBase('tenant_alpha');

  // Registra 10 execuções caras no Tenant Alpha (tempo real 600 min)
  for (let i = 1; i <= 10; i++) {
    state.os.push({
      id: `os_alpha_${i}`,
      tenantId: 'tenant_alpha',
      st: 'finalizada',
      servicos: [{ id: 'srv_freio', nome: 'Revisão de Freios', valor: 2500, tempoRealMinutos: 600 }]
    });
  }

  // Tenant Beta consulta histórico do mesmo srv_freio
  const histBeta = pricingEngine.consultarHistoricoServico({
    tenantId: 'tenant_beta',
    state,
    serviceId: 'srv_freio'
  });

  // Para o Tenant Beta, o histórico DEVE ser zero
  assert.equal(histBeta.quantidadeExecucoes, 0);
  assert.equal(histBeta.tempoMediano, null);

  // Tenant Alpha consulta histórico
  const histAlpha = pricingEngine.consultarHistoricoServico({
    tenantId: 'tenant_alpha',
    state,
    serviceId: 'srv_freio'
  });
  assert.equal(histAlpha.quantidadeExecucoes, 10);
  assert.equal(histAlpha.tempoMediano, 600);
});

// ── TESTE 27: Ocultação de custos e margens para perfis sem permissão ──
test('27. Ocultação de custos e margens para perfis sem permissão pricing:read ou profitability:read', () => {
  const state = criarEstadoBase();

  // Usuário SEM permissão pricing:read
  const recOculta = pricingEngine.gerarRecomendacaoPreco({
    tenantId: state.tenantId,
    state,
    serviceId: 'srv_freio',
    userPermissions: ['os:read']
  });

  assert.equal(recOculta.ok, true);
  // Custos e margens devem ser NULL
  assert.equal(recOculta.custoMaoObraEsperado, null);
  assert.equal(recOculta.custoPecasEsperado, null);
  assert.equal(recOculta.custoTotalEsperado, null);
  assert.equal(recOculta.margemAlvoAplicada, null);
  assert.equal(recOculta.amostraHistorica, null);
  // Apenas preços finais são apresentados
  assert.ok(recOculta.precoAlvoRecomendado !== null);
  assert.ok(recOculta.precoMinimo !== null);
});

// ── TESTE 28: Verônica (voz): consulta de sugestão de preço ──────────
test('28. Verônica (voz): consulta de sugestão de preço ("quanto deveríamos cobrar pela troca de embreagem?")', async () => {
  const state = criarEstadoBase();
  const res = await voiceActionEngine.interpretarEExecutar({
    input: 'quanto deveríamos cobrar pela troca de embreagem?',
    context: {
      tenantId: state.tenantId,
      permissions: ['*'],
      isSenderAdmin: true
    },
    state
  });

  assert.equal(res.ok, true);
  assert.equal(res.acao, 'consultar_sugestao_preco');
  assert.ok(typeof res.resposta === 'string');
  assert.ok(res.resposta.includes('Troca de Embreagem Scania R450'));
  assert.ok(res.resposta.includes('Preço alvo recomendado'));
  assert.ok(res.resposta.includes('Piso mínimo'));
});

// ── TESTE 29: Verônica (voz): consulta de desconto seguro ───────────
test('29. Verônica (voz): consulta de desconto seguro ("quanto posso dar de desconto sem furar a margem?")', async () => {
  const state = criarEstadoBase();
  state.quotations.push({
    id: 'orc_10',
    numero: 10,
    tenantId: state.tenantId,
    servicos: [{ id: 'srv_freio', nome: 'Revisão de Freios Dianteiros', preco: 600, valor: 600, qtd: 1 }],
    pecas: []
  });

  const res = await voiceActionEngine.interpretarEExecutar({
    input: 'quanto posso dar de desconto sem furar a margem no orçamento 10?',
    context: {
      tenantId: state.tenantId,
      permissions: ['*'],
      isSenderAdmin: true
    },
    state
  });

  assert.equal(res.ok, true);
  assert.equal(res.acao, 'consultar_desconto_seguro');
  assert.ok(typeof res.resposta === 'string');
  assert.ok(res.resposta.includes('desconto máximo seguro'));
  assert.ok(res.descontoMaximoSeguro !== undefined);
});

// ── TESTE 30: E2E Orçamento -> Margem -> Desconto -> Override -> Auditoria ──
test('30. E2E: Orçamento criado -> margem calculada -> desconto seguro consultado -> override autorizado -> auditoria', async () => {
  async function findFreePort() {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  const port = await findFreePort();
  const tenantId = 'tenant_e2e_pricing';

  const proc = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'patio-crm-admin-2026',
      DEFAULT_SINGLE_TENANT_ID: 'default',
      DISABLE_INTEGRATIONS: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStderr = '';
  proc.stderr.on('data', d => { serverStderr += d.toString(); });

  let serverStarted = false;
  for (let i = 0; i < 150; i++) {
    if (proc.exitCode !== null) throw new Error('Falha ao iniciar servidor de teste E2E: ' + serverStderr);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status === 401 || res.status === 200) {
        serverStarted = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!serverStarted) throw new Error('Timeout ao aguardar servidor E2E: ' + serverStderr);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': 'patio-crm-admin-2026',
      'x-tenant-id': tenantId
    };

    // 1. Cadastra colaborador
    await fetch(`http://127.0.0.1:${port}/api/equipe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nome: 'Mecânico E2E', custoHora: 50.0 })
    });

    // 2. Simula precificação via API
    const resSim = await fetch(`http://127.0.0.1:${port}/api/precificacao/simular`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tempoHoras: 3,
        custoPecas: 200,
        margemAlvo: 35
      })
    });
    assert.equal(resSim.status, 200);
    const jsonSim = await resSim.json();
    assert.equal(jsonSim.success, true);
    assert.ok(jsonSim.precoAlvoRecomendado > 0);

    // 3. Cadastra OS com serviço
    const resOS = await fetch(`http://127.0.0.1:${port}/api/os/entrada`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        placa: 'PRC1D23',
        modelo: 'Volvo FH 540',
        clienteNome: 'Cliente Rentabilidade',
        servicos: [{ id: 'srv_e2e_1', nome: 'Revisão Geral', valor: 1000, preco: 1000, autorizado: true, status: 'aprovado' }]
      })
    });
    const jsonOS = await resOS.json();
    const osId = jsonOS.osId || jsonOS.os?.id;

    // 4. Consulta margem do orçamento/OS
    const resMargem = await fetch(`http://127.0.0.1:${port}/api/orcamentos/${osId}/margem`, { headers });
    assert.equal(resMargem.status, 200);
    const jsonMargem = await resMargem.json();
    assert.equal(jsonMargem.success, true);
    assert.ok(jsonMargem.descontoMaximoSeguro !== undefined);

    // 5. Registra override autorizado com permissão e justificativa
    const resOverride = await fetch(`http://127.0.0.1:${port}/api/orcamentos/${osId}/override-preco`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        serviceId: 'srv_e2e_1',
        precoProposto: 400,
        motivo: 'Condição especial de frota aprovada pela diretoria'
      })
    });
    assert.equal(resOverride.status, 200);
    const jsonOverride = await resOverride.json();
    assert.equal(jsonOverride.success, true);
    assert.equal(jsonOverride.override.precoProposto, 400);

    // 6. Consulta resumo de rentabilidade da oficina
    const resRent = await fetch(`http://127.0.0.1:${port}/api/rentabilidade/resumo`, { headers });
    assert.equal(resRent.status, 200);
    const jsonRent = await resRent.json();
    assert.equal(jsonRent.success, true);
    assert.ok(jsonRent.resumo !== undefined);

  } finally {
    proc.kill('SIGTERM');
  }
});
