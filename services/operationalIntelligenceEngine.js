'use strict';

const crypto = require('crypto');
const { obterAgoraSP } = require('./financialEngine');

function gerarId(prefix = 'ope') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function parseDataHora(dataStr, horaStr = '08:00') {
  if (!dataStr) return null;
  if (dataStr instanceof Date) return dataStr;
  const s = String(dataStr).trim();
  if (s.includes('T')) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const h = horaStr && /^\d{1,2}:\d{2}$/.test(horaStr.trim()) ? horaStr.trim() : '08:00';
    const [ano, mes, dia] = s.split('-').map(Number);
    const [hora, min] = h.split(':').map(Number);
    // Cria em UTC-3 / São Paulo
    const isoUtc = new Date(Date.UTC(ano, mes - 1, dia, hora + 3, min, 0));
    return isNaN(isoUtc.getTime()) ? null : isoUtc;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function calcularHorasPassadas(inicio, agora) {
  if (!inicio || !agora) return 0;
  const diffMs = agora.getTime() - inicio.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60));
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

/**
 * Avalia continuamente o estado operacional de um tenant
 */
function avaliarOperacao(params) {
  const p = params && params.state ? params : { state: params, tenantId: params?.tenantId || 'default' };
  const tenantId = p.tenantId || p.state?.tenantId || 'default';
  const state = p.state;
  const dataReferencia = p.dataReferencia || null;
  const horaReferencia = p.horaReferencia || null;
  const agoraIso = p.agoraIso || null;
  const agoraDate = p.agoraDate || null;

  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  state.operationalEvents = Array.isArray(state.operationalEvents) ? state.operationalEvents : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  state.boxes = Array.isArray(state.boxes) ? state.boxes : [];
  state.preOS = Array.isArray(state.preOS) ? state.preOS : [];
  state.intakeSessions = Array.isArray(state.intakeSessions) ? state.intakeSessions : [];
  const cfg = state.cfg || {};
  const cfgOp = cfg.operacao || {};

  // Determina o momento presente da avaliação
  let agora;
  if (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) {
    agora = agoraDate;
  } else if (agoraIso) {
    agora = new Date(agoraIso);
  } else if (dataReferencia && horaReferencia) {
    agora = parseDataHora(dataReferencia, horaReferencia);
  } else if (dataReferencia) {
    agora = parseDataHora(dataReferencia, '12:00');
  } else {
    agora = new Date();
  }
  if (!agora || isNaN(agora.getTime())) agora = new Date();

  const infoAgoraSP = obterAgoraSP(agora);
  const dataHojeISO = dataReferencia || infoAgoraSP.dataISO;
  const horaAgora = horaReferencia || infoAgoraSP.horaBR;
  const agoraTimestampISO = agora.toISOString();

  // Limites configuráveis por tenant com defaults determinísticos
  const limitesVeiculo = {
    critico: Number(cfgOp.limitesVeiculoParado?.horasCritico) || 24,
    alto: Number(cfgOp.limitesVeiculoParado?.horasAlto) || 12,
    atencao: Number(cfgOp.limitesVeiculoParado?.horasAtencao) || 6
  };

  const limitesOS = {
    alto: Number(cfgOp.limitesSemEvolucao?.horasAlto) || 8,
    atencao: Number(cfgOp.limitesSemEvolucao?.horasAtencao) || 4
  };

  const limitesGargalos = {
    peca: Number(cfgOp.gargalos?.peca) || 3,
    diagnostico: Number(cfgOp.gargalos?.diagnostico) || 3,
    fila: Number(cfgOp.gargalos?.fila) || 4
  };

  // Conjunto de chaves de deduplicação ativas nesta rodada
  const activeDetectedKeys = new Set();
  const detectedEvents = [];

  // Mapeamentos rápidos
  const veiculosPorId = new Map(state.veiculos.map(v => [v.id, v]));
  const osPorVeiculo = new Map();
  for (const o of state.os) {
    if (o.st !== 'finalizada' && o.vei) {
      if (!osPorVeiculo.has(o.vei)) osPorVeiculo.set(o.vei, []);
      osPorVeiculo.get(o.vei).push(o);
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 1. REGRA: VEÍCULO PARADO NO PÁTIO SEM MOVIMENTAÇÃO
   * ───────────────────────────────────────────────────────────────── */
  for (const o of state.os) {
    if (o.st === 'finalizada') continue;
    const v = veiculosPorId.get(o.vei) || {};
    const placa = v.placa || o.placa || 'SEM-PLACA';

    // Determina o momento de entrada/início no pátio
    const tsInicio = parseDataHora(o.criadoEm || o.abertura || v.entrada || o.dataAbertura, '08:00');
    if (!tsInicio) continue;

    const horasParado = calcularHorasPassadas(tsInicio, agora);
    let severidade = null;
    let prioridade = null;

    if (horasParado >= limitesVeiculo.critico) {
      severidade = 'critico';
      prioridade = 'P1';
    } else if (horasParado >= limitesVeiculo.alto) {
      severidade = 'alto';
      prioridade = 'P2';
    } else if (horasParado >= limitesVeiculo.atencao) {
      severidade = 'atencao';
      prioridade = 'P3';
    }

    if (severidade) {
      const dedupeKey = `${tenantId}:veiculo_parado:${o.vei || placa}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'veiculo_parado',
        prioridade,
        severidade,
        dedupeKey,
        recurso: { tipo: 'veiculo', id: o.vei || null, placa, osId: o.id, osNum: o.num },
        titulo: `Veículo ${placa} parado no pátio há ${Math.floor(horasParado)}h`,
        descricao: `O veículo ${placa} (OS #${o.num || o.id}) está no pátio há ${horasParado.toFixed(1)} horas sem liberação.`,
        detalhes: { horasParado: Number(horasParado.toFixed(1)), statusOS: o.st, box: o.box || 'patio' }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 2. REGRA: OS SEM EVOLUÇÃO OPERACIONAL
   * ───────────────────────────────────────────────────────────────── */
  for (const o of state.os) {
    if (o.st === 'finalizada') continue;
    const v = veiculosPorId.get(o.vei) || {};
    const placa = v.placa || o.placa || 'SEM-PLACA';

    // Última evolução operacional (mudança de status, serviço, peça ou nota técnica)
    const tsUltimaEvolucao = parseDataHora(
      o.ultimaAtualizacao || o.atualizadoEm || o.criadoEm || o.abertura,
      '08:00'
    );
    if (!tsUltimaEvolucao) continue;

    const horasSemEvolucao = calcularHorasPassadas(tsUltimaEvolucao, agora);
    let severidade = null;
    let prioridade = null;

    if (horasSemEvolucao >= limitesOS.alto) {
      severidade = 'alto';
      prioridade = 'P2';
    } else if (horasSemEvolucao >= limitesOS.atencao) {
      severidade = 'atencao';
      prioridade = 'P3';
    }

    if (severidade) {
      const dedupeKey = `${tenantId}:os_sem_evolucao:${o.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'os_sem_evolucao',
        prioridade,
        severidade,
        dedupeKey,
        recurso: { tipo: 'os', id: o.id, num: o.num, placa },
        titulo: `OS #${o.num || o.id} sem evolução há ${Math.floor(horasSemEvolucao)}h`,
        descricao: `A OS #${o.num || o.id} (${placa}) está sem evolução registrada há ${horasSemEvolucao.toFixed(1)} horas (estágio: ${o.st}).`,
        detalhes: { horasSemEvolucao: Number(horasSemEvolucao.toFixed(1)), estagio: o.st }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 3. REGRA: ENTREGA PRÓXIMA OU ATRASADA
   * ───────────────────────────────────────────────────────────────── */
  for (const o of state.os) {
    if (o.st === 'finalizada') continue;
    const v = veiculosPorId.get(o.vei) || {};
    const placa = v.placa || o.placa || 'SEM-PLACA';

    let dataPrometida = null;
    let horaPrometida = '18:00';

    if (o.promessaEntrega && o.promessaEntrega.data) {
      dataPrometida = o.promessaEntrega.data;
      if (o.promessaEntrega.hora) horaPrometida = o.promessaEntrega.hora;
    } else if (o.prev) {
      dataPrometida = o.prev;
      if (o.horaPrev) horaPrometida = o.horaPrev;
    }

    if (dataPrometida) {
      const tsPromessa = parseDataHora(dataPrometida, horaPrometida);
      if (tsPromessa) {
        const diffMinutos = (tsPromessa.getTime() - agora.getTime()) / (1000 * 60);

        if (diffMinutos < 0) {
          // Atrasada
          const horasAtraso = Math.abs(diffMinutos / 60);
          const dedupeKey = `${tenantId}:entrega_atrasada:${o.id}`;
          activeDetectedKeys.add(dedupeKey);
          detectedEvents.push({
            tipo: 'entrega_atrasada',
            prioridade: 'P1',
            severidade: 'critico',
            dedupeKey,
            recurso: { tipo: 'os', id: o.id, num: o.num, placa },
            titulo: `OS #${o.num || o.id} com entrega atrasada`,
            descricao: `A OS #${o.num || o.id} do veículo ${placa} deveria ter sido entregue às ${horaPrometida} de ${dataPrometida} (atrasada há ${horasAtraso.toFixed(1)}h).`,
            detalhes: { dataPrometida, horaPrometida, horasAtraso: Number(horasAtraso.toFixed(1)), statusOS: o.st }
          });
        } else if (diffMinutos <= 60) {
          // Próxima da entrega (< 60 min)
          const dedupeKey = `${tenantId}:entrega_proxima:${o.id}`;
          activeDetectedKeys.add(dedupeKey);
          detectedEvents.push({
            tipo: 'entrega_proxima',
            prioridade: 'P2',
            severidade: 'alto',
            dedupeKey,
            recurso: { tipo: 'os', id: o.id, num: o.num, placa },
            titulo: `OS #${o.num || o.id} entrega em risco (< 60 min)`,
            descricao: `A OS #${o.num || o.id} do veículo ${placa} tem previsão de entrega em ${Math.round(diffMinutos)} minutos (${horaPrometida}).`,
            detalhes: { dataPrometida, horaPrometida, minutosRestantes: Math.round(diffMinutos), statusOS: o.st }
          });
        }
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 4. REGRA: ANOMALIA EM BOX (BLOQUEADO POR PEÇAS OU TEMPO EXCESSIVO)
   * ───────────────────────────────────────────────────────────────── */
  for (const box of state.boxes) {
    const osDoBox = state.os.find(o => o.box === box.id && o.st !== 'finalizada');
    if (osDoBox) {
      const v = veiculosPorId.get(osDoBox.vei) || {};
      const placa = v.placa || osDoBox.placa || 'SEM-PLACA';

      if (osDoBox.st === 'peca') {
        const dedupeKey = `${tenantId}:box_bloqueado_peca:${box.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'box_anomalia',
          subtipo: 'bloqueado_peca',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'box', id: box.id, nome: box.nome, osId: osDoBox.id, osNum: osDoBox.num, placa },
          titulo: `Box ${box.nome || box.id} bloqueado aguardando peças`,
          descricao: `O ${box.nome || box.id} está ocupado pela OS #${osDoBox.num || osDoBox.id} (${placa}) parada aguardando peças.`,
          detalhes: { boxId: box.id, osId: osDoBox.id, st: osDoBox.st }
        });
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 5. REGRA: GARGALOS POR ESTÁGIO CONCENTRADO
   * ───────────────────────────────────────────────────────────────── */
  const contagemEstagio = {
    peca: state.os.filter(o => o.st === 'peca').length,
    aprovacao: state.os.filter(o => o.st === 'aprovacao').length,
    fila: state.os.filter(o => o.st === 'fila' || (!o.st && !o.box && o.st !== 'finalizada')).length,
    executando: state.os.filter(o => o.st === 'executando').length
  };

  // Gargalo de Peças
  if (contagemEstagio.peca >= limitesGargalos.peca) {
    const dedupeKey = `${tenantId}:gargalo_estagio:peca`;
    activeDetectedKeys.add(dedupeKey);
    detectedEvents.push({
      tipo: 'gargalo_estagio',
      prioridade: contagemEstagio.peca >= limitesGargalos.peca + 2 ? 'P1' : 'P2',
      severidade: 'alto',
      dedupeKey,
      recurso: { tipo: 'estagio', nome: 'peca' },
      titulo: `Gargalo em Peças: ${contagemEstagio.peca} veículos aguardando peças`,
      descricao: `Existe uma concentração crítica de ${contagemEstagio.peca} veículos parados aguardando componentes (limite tolerado: ${limitesGargalos.peca}).`,
      detalhes: { estagio: 'peca', quantidade: contagemEstagio.peca, limite: limitesGargalos.peca }
    });
  }

  // Gargalo de Diagnóstico / Aprovação
  if (contagemEstagio.aprovacao >= limitesGargalos.diagnostico) {
    const dedupeKey = `${tenantId}:gargalo_estagio:aprovacao`;
    activeDetectedKeys.add(dedupeKey);
    detectedEvents.push({
      tipo: 'gargalo_estagio',
      prioridade: 'P3',
      severidade: 'atencao',
      dedupeKey,
      recurso: { tipo: 'estagio', nome: 'aprovacao' },
      titulo: `Gargalo em Aprovação: ${contagemEstagio.aprovacao} orçamentos pendentes`,
      descricao: `Há ${contagemEstagio.aprovacao} veículos aguardando aprovação de orçamento/diagnóstico pelo cliente.`,
      detalhes: { estagio: 'aprovacao', quantidade: contagemEstagio.aprovacao, limite: limitesGargalos.diagnostico }
    });
  }

  // Gargalo na Fila de Espera
  if (contagemEstagio.fila >= limitesGargalos.fila) {
    const dedupeKey = `${tenantId}:gargalo_estagio:fila`;
    activeDetectedKeys.add(dedupeKey);
    detectedEvents.push({
      tipo: 'gargalo_estagio',
      prioridade: 'P3',
      severidade: 'atencao',
      dedupeKey,
      recurso: { tipo: 'estagio', nome: 'fila' },
      titulo: `Fila do pátio cheia: ${contagemEstagio.fila} veículos sem box`,
      descricao: `O pátio possui ${contagemEstagio.fila} veículos aguardando liberação de box para atendimento.`,
      detalhes: { estagio: 'fila', quantidade: contagemEstagio.fila, limite: limitesGargalos.fila }
    });
  }

  /* ─────────────────────────────────────────────────────────────────
   * 6. REGRA: PRÉ-OS OU INTAKE TÉCNICO PENDENTE
   * ───────────────────────────────────────────────────────────────── */
  for (const pos of state.preOS) {
    if (pos.status === 'aguardando_confirmacao') {
      const tsPreOS = parseDataHora(pos.createdAt, '08:00');
      const horasPendentes = tsPreOS ? calcularHorasPassadas(tsPreOS, agora) : 0;
      if (horasPendentes >= 2 || pos.possivelGarantia) {
        const dedupeKey = `${tenantId}:pre_os_pendente:${pos.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'pre_os_pendente',
          prioridade: pos.possivelGarantia ? 'P1' : 'P3',
          severidade: pos.possivelGarantia ? 'critico' : 'atencao',
          dedupeKey,
          recurso: { tipo: 'pre_os', id: pos.id, placa: pos.placa },
          titulo: `Pré-OS ${pos.placa} aguardando confirmação`,
          descricao: `A Pré-OS do veículo ${pos.placa} está aguardando decisão humana há ${horasPendentes.toFixed(1)}h (${pos.reclamacaoOriginal}).`,
          detalhes: { preOSId: pos.id, possivelGarantia: pos.possivelGarantia, horasPendentes: Number(horasPendentes.toFixed(1)) }
        });
      }
    }
  }

  for (const ses of state.intakeSessions) {
    if (ses.status === 'aguardando_resposta') {
      const tsIntake = parseDataHora(ses.updatedAt || ses.createdAt, '08:00');
      const horasPendentes = tsIntake ? calcularHorasPassadas(tsIntake, agora) : 0;
      if (horasPendentes >= 2) {
        const dedupeKey = `${tenantId}:intake_abandonado:${ses.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'pre_os_pendente',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'intake', id: ses.id, placa: ses.placa },
          titulo: `Intake técnico abandonado (${ses.placa})`,
          descricao: `A conversa de triagem técnica do veículo ${ses.placa} está parada aguardando resposta há ${horasPendentes.toFixed(1)}h.`,
          detalhes: { sessionId: ses.id, horasPendentes: Number(horasPendentes.toFixed(1)) }
        });
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 7. REGRA: POSSÍVEL GARANTIA PENDENTE DE DECISÃO
   * ───────────────────────────────────────────────────────────────── */
  for (const o of state.os) {
    if (o.st !== 'finalizada' && o.possivelGarantia && !o.garantiaDecidida) {
      const v = veiculosPorId.get(o.vei) || {};
      const placa = v.placa || o.placa || 'SEM-PLACA';
      const dedupeKey = `${tenantId}:possivel_garantia_pendente:os_${o.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'possivel_garantia_pendente',
        prioridade: 'P1',
        severidade: 'critico',
        dedupeKey,
        recurso: { tipo: 'garantia', id: o.id, osNum: o.num, placa },
        titulo: `Possível garantia sem decisão humana (OS #${o.num || o.id})`,
        descricao: `O veículo ${placa} está na oficina com suspeita de garantia sem validação gerencial registrada.`,
        detalhes: { osId: o.id, placa, st: o.st }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 8. REGRA: ORÇAMENTOS E ADICIONAIS AGUARDANDO CLIENTE
   * ───────────────────────────────────────────────────────────────── */
  state.quotations = Array.isArray(state.quotations) ? state.quotations : [];
  for (const orc of state.quotations) {
    if (orc.tenantId === tenantId && (orc.status === 'enviado' || orc.status === 'rascunho')) {
      const tsOrc = parseDataHora(orc.enviadoEm || orc.criadoEm, '08:00');
      const horasPendentes = tsOrc ? calcularHorasPassadas(tsOrc, agora) : 0;
      const placa = orc.placa || 'VEICULO';

      if (orc.adicional) {
        const dedupeKey = `${tenantId}:adicional_aguardando_aprovacao:${orc.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'adicional_aguardando_aprovacao',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'orcamento', id: orc.id, codigo: orc.codigo, placa },
          titulo: `Adicional de escopo ${orc.codigo} aguardando aprovação`,
          descricao: `Serviço extra detectado na OS (${placa}) está parado aguardando autorização do cliente há ${horasPendentes.toFixed(1)}h.`,
          detalhes: { quotationId: orc.id, codigo: orc.codigo, totalGeral: orc.totalGeral, horasPendentes: Number(horasPendentes.toFixed(1)) }
        });
      } else if (horasPendentes >= 4) {
        const dedupeKey = `${tenantId}:orcamento_aguardando_cliente:${orc.id}`;
        activeDetectedKeys.add(dedupeKey);
        const severidade = horasPendentes >= 8 ? 'alto' : 'atencao';
        const prioridade = horasPendentes >= 8 ? 'P2' : 'P3';
        detectedEvents.push({
          tipo: 'orcamento_aguardando_cliente',
          prioridade,
          severidade,
          dedupeKey,
          recurso: { tipo: 'orcamento', id: orc.id, codigo: orc.codigo, placa },
          titulo: `Orçamento ${orc.codigo} pendente de aprovação (${horasPendentes.toFixed(1)}h)`,
          descricao: `O orçamento do veículo ${placa} foi enviado e aguarda decisão do cliente há ${horasPendentes.toFixed(1)}h.`,
          detalhes: { quotationId: orc.id, codigo: orc.codigo, totalGeral: orc.totalGeral, horasPendentes: Number(horasPendentes.toFixed(1)) }
        });
      }
    } else if (orc.tenantId === tenantId && orc.status === 'parcialmente_aprovado') {
      const dedupeKey = `${tenantId}:orcamento_parcialmente_aprovado:${orc.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'orcamento_parcialmente_aprovado',
        prioridade: 'P3',
        severidade: 'atencao',
        dedupeKey,
        recurso: { tipo: 'orcamento', id: orc.id, codigo: orc.codigo, placa: orc.placa },
        titulo: `Orçamento ${orc.codigo} parcialmente aprovado`,
        descricao: `O cliente aprovou apenas parte dos itens do orçamento ${orc.codigo}. Verificar itens recusados para alinhamento.`,
        detalhes: { quotationId: orc.id, totalAprovado: orc.totalAprovado, totalGeral: orc.totalGeral }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 9. REGRA: PEÇAS, SUPRIMENTOS E ALMOXARIFADO
   * ───────────────────────────────────────────────────────────────── */
  state.partRequirements = Array.isArray(state.partRequirements) ? state.partRequirements : [];
  state.purchaseOrders = Array.isArray(state.purchaseOrders) ? state.purchaseOrders : [];
  state.purchaseQuotes = Array.isArray(state.purchaseQuotes) ? state.purchaseQuotes : [];
  state.pecas = Array.isArray(state.pecas) ? state.pecas : [];

  // 9.1 Necessidades de peças pendentes de compra
  for (const req of state.partRequirements) {
    if (req.tenantId === tenantId && (req.status === 'aguardando_compra' || req.missingQuantity > 0)) {
      const os = state.os.find(o => o.id === req.osId);
      if (os && os.st !== 'finalizada' && os.st !== 'cancelada') {
        const peca = state.pecas.find(p => p.id === req.partId && p.tenantId === tenantId);
        const pecaNome = peca ? peca.descricao : 'Peça';
        const estaNoBox = Boolean(os.box);

        const ehP1 = estaNoBox && (req.urgencia === 'alta' || os.prioridade === 'alta');
        const tipoEvento = estaNoBox ? 'peca_bloqueando_box' : 'peca_aguardando_compra';
        const prioridade = ehP1 ? 'P1' : (estaNoBox ? 'P2' : 'P3');
        const severidade = ehP1 ? 'critico' : (estaNoBox ? 'alto' : 'atencao');
        const dedupeKey = `${tenantId}:${tipoEvento}:${req.id}`;

        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: tipoEvento,
          prioridade,
          severidade,
          dedupeKey,
          recurso: { tipo: 'part_requirement', id: req.id, osId: os.id, osNum: os.num, partId: req.partId },
          titulo: estaNoBox
            ? `Box ${os.box} bloqueado aguardando peça (OS #${os.num || os.id})`
            : `OS #${os.num || os.id} aguardando compra de peça`,
          descricao: `A OS #${os.num || os.id} (${os.placa || 'Sem placa'}) necessita de ${req.missingQuantity || req.quantidadeSolicitada || 1} un de "${pecaNome}" para prosseguir os serviços.`,
          detalhes: { requirementId: req.id, osId: os.id, partId: req.partId, missingQuantity: req.missingQuantity || req.quantidadeSolicitada || 1, box: os.box || null }
        });
      }
    }
  }

  // 9.2 Pedidos de compra em atraso
  for (const order of state.purchaseOrders) {
    if (order.tenantId === tenantId && ['pedido_realizado', 'aprovado', 'parcialmente_recebido', 'recebido_parcial'].includes(order.status)) {
      const dataPrev = order.expectedAt || order.previsaoEntrega;
      if (dataPrev) {
        const tsPrev = parseDataHora(dataPrev, '18:00');
        if (tsPrev && tsPrev < agora) {
          const dedupeKey = `${tenantId}:pedido_compra_atrasado:${order.id}`;
          activeDetectedKeys.add(dedupeKey);
          detectedEvents.push({
            tipo: 'pedido_compra_atrasado',
            prioridade: 'P2',
            severidade: 'alto',
            dedupeKey,
            recurso: { tipo: 'purchase_order', id: order.id, codigo: order.codigo, supplierId: order.supplierId },
            titulo: `Pedido de compra ${order.codigo} em atraso`,
            descricao: `O pedido ${order.codigo} (${order.supplierNome || 'Fornecedor'}) com entrega prometida para ${dataPrev} ainda não foi recebido no almoxarifado.`,
            detalhes: { orderId: order.id, codigo: order.codigo, expectedAt: dataPrev, status: order.status }
          });
        }
      }
    }
  }

  // 9.3 Cotações de compra sem resposta há mais de 4h
  for (const quote of state.purchaseQuotes) {
    if (quote.tenantId === tenantId && quote.status === 'aberta') {
      const tsCot = parseDataHora(quote.createdAt, '08:00');
      const horasAberta = tsCot ? calcularHorasPassadas(tsCot, agora) : 0;
      if (horasAberta >= 4) {
        const dedupeKey = `${tenantId}:cotacao_sem_resposta:${quote.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'cotacao_sem_resposta',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'purchase_quote', id: quote.id, codigo: quote.codigo },
          titulo: `Cotação ${quote.codigo} sem resposta (${horasAberta.toFixed(1)}h)`,
          descricao: `A cotação de compra ${quote.codigo} está aguardando retorno dos fornecedores há ${horasAberta.toFixed(1)} horas.`,
          detalhes: { quoteId: quote.id, horasAberta: Number(horasAberta.toFixed(1)) }
        });
      }
    }
  }

  // 9.4 Ruptura de estoque e estoque baixo
  for (const peca of state.pecas) {
    if (peca.tenantId === tenantId && peca.ativo !== false) {
      const qtdFisica = Math.max(0, Number(peca.qtd) || 0);
      const min = Math.max(0, Number(peca.estoqueMinimo != null ? peca.estoqueMinimo : peca.min) || 0);

      // Calcula reservas ativas para esta peça
      const reservado = state.partRequirements
        .filter(r => r.tenantId === tenantId && r.partId === peca.id && ['atendida', 'parcial', 'reservada'].includes(r.status))
        .reduce((acc, r) => acc + (Number(r.reservedQuantity) || 0), 0);
      const disponivel = Math.max(0, qtdFisica - reservado);

      // Tem demanda ativa para esta peça?
      const temDemanda = state.partRequirements.some(
        r => r.tenantId === tenantId && r.partId === peca.id && (r.status === 'aguardando_compra' || r.missingQuantity > 0)
      );

      if (disponivel === 0 && temDemanda) {
        const dedupeKey = `${tenantId}:ruptura_estoque:${peca.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'ruptura_estoque',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'peca', id: peca.id, codigoInterno: peca.codigoInterno },
          titulo: `Ruptura de estoque: ${peca.descricao}`,
          descricao: `A peça "${peca.descricao}" (${peca.codigoInterno}) está com estoque disponível zerado e possui demandas ativas de ordens de serviço.`,
          detalhes: { partId: peca.id, estoqueFisico: qtdFisica, estoqueReservado: reservado, estoqueDisponivel: 0 }
        });
      } else if (min > 0 && disponivel <= min) {
        const dedupeKey = `${tenantId}:estoque_baixo:${peca.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'estoque_baixo',
          prioridade: 'P4',
          severidade: 'info',
          dedupeKey,
          recurso: { tipo: 'peca', id: peca.id, codigoInterno: peca.codigoInterno },
          titulo: `Estoque baixo: ${peca.descricao}`,
          descricao: `A peça "${peca.descricao}" está com saldo disponível (${disponivel} un) abaixo ou igual ao mínimo de segurança (${min} un).`,
          detalhes: { partId: peca.id, estoqueDisponivel: disponivel, estoqueMinimo: min }
        });
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 10. REGRA: INTELIGÊNCIA DE MÃO DE OBRA, EQUIPE E PRODUTIVIDADE
   * ───────────────────────────────────────────────────────────────── */
  state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
  state.workers = Array.isArray(state.workers) ? state.workers : [];

  const jornadaPadraoHoras = Number(cfgOp.jornadaPadraoHoras || cfg.equipe?.jornadaPadraoHoras) || 8;

  // 10.1 Apontamento aberto esquecido (P2 se exceder jornada)
  for (const entry of state.laborEntries) {
    if (entry.tenantId === tenantId && entry.status === 'ativo') {
      const tsInicio = parseDataHora(entry.startedAt, '08:00');
      const horasAtivas = tsInicio ? calcularHorasPassadas(tsInicio, agora) : 0;
      const worker = state.workers.find(w => w.id === entry.workerId && w.tenantId === tenantId);
      const limiteJornada = Number(worker?.jornadaHorasDia) || jornadaPadraoHoras;

      if (horasAtivas >= limiteJornada) {
        const dedupeKey = `${tenantId}:apontamento_aberto_esquecido:${entry.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'apontamento_aberto_esquecido',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'labor_entry', id: entry.id, workerId: entry.workerId, osId: entry.osId, osNum: entry.osNum },
          titulo: `Apontamento esquecido aberto: ${entry.workerNome} (${horasAtivas.toFixed(1)}h)`,
          descricao: `O colaborador ${entry.workerNome} está com apontamento ativo na OS #${entry.osNum || entry.osId} há ${horasAtivas.toFixed(1)} horas (excedendo a jornada de ${limiteJornada}h). Solicitar revisão manual sem encerrar automaticamente.`,
          detalhes: { entryId: entry.id, workerId: entry.workerId, horasAtivas: Number(horasAtivas.toFixed(1)), limiteJornada }
        });
      } else if (horasAtivas >= 6) {
        // 10.2 Apontamento excessivo contínuo no mesmo serviço (P3)
        const dedupeKey = `${tenantId}:mecanico_com_apontamento_excessivo:${entry.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'mecanico_com_apontamento_excessivo',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'labor_entry', id: entry.id, workerId: entry.workerId, osId: entry.osId },
          titulo: `Apontamento contínuo longo: ${entry.workerNome} (${horasAtivas.toFixed(1)}h)`,
          descricao: `O mecânico ${entry.workerNome} está trabalhando continuamente há ${horasAtivas.toFixed(1)}h no mesmo serviço (${entry.serviceNome}) sem intervalo registrado.`,
          detalhes: { entryId: entry.id, workerId: entry.workerId, horasAtivas: Number(horasAtivas.toFixed(1)) }
        });
      }
    }
  }

  // 10.3 Serviço autorizado sem mecânico apontado (OS em execução sem atividade)
  const temModuloLaborAtivo = (Array.isArray(state.workers) && state.workers.length > 0) ||
                              (Array.isArray(state.laborEntries) && state.laborEntries.length > 0);
  if (temModuloLaborAtivo) {
    for (const o of state.os) {
      if (o.tenantId === tenantId || !o.tenantId) {
        if (o.st === 'executando') {
          const temApontamentoAtivo = state.laborEntries.some(
            e => e.tenantId === tenantId && e.osId === o.id && e.status === 'ativo'
          );
          if (!temApontamentoAtivo) {
            const dedupeKey = `${tenantId}:servico_sem_apontamento:os_${o.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'servico_sem_apontamento',
              prioridade: 'P3',
              severidade: 'atencao',
              dedupeKey,
              recurso: { tipo: 'os', id: o.id, osNum: o.num, placa: o.placa },
              titulo: `OS #${o.num || o.id} em execução sem mecânico apontado`,
              descricao: `A OS #${o.num || o.id} (${o.placa || 'Sem placa'}) está marcada como executando no pátio, mas nenhum colaborador está com serviço ativo registrado nela.`,
              detalhes: { osId: o.id, box: o.box || null }
            });
          }
        }
      }
    }
  }

  // 10.4 Box ocupado sem atividade de mecânico
  for (const b of state.boxes) {
    const osNoBox = state.os.find(o => o.box === b.id && (o.tenantId === tenantId || !o.tenantId) && o.st !== 'finalizada' && o.st !== 'cancelada');
    if (osNoBox && osNoBox.st !== 'peca') {
      const temMecNoBox = state.laborEntries.some(
        e => e.tenantId === tenantId && (e.boxId === b.id || e.osId === osNoBox.id) && e.status === 'ativo'
      );
      if (!temMecNoBox) {
        const dedupeKey = `${tenantId}:box_sem_atividade:${b.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'box_sem_atividade',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'box', id: b.id, nome: b.nome || b.id, osId: osNoBox.id },
          titulo: `Box ${b.nome || b.id} sem mecânico atuando`,
          descricao: `O box ${b.nome || b.id} está ocupado pelo veículo da OS #${osNoBox.num || osNoBox.id}, porém não há apontamento de mecânico ativo no momento.`,
          detalhes: { boxId: b.id, osId: osNoBox.id }
        });
      }
    }
  }

  // 10.5 Retrabalho elevado (horas de retrabalho acumuladas)
  const retrabalhosHoje = state.laborEntries.filter(
    e => e.tenantId === tenantId && e.type === 'retrabalho' && String(e.startedAt || '').startsWith(dataHojeISO)
  );
  const totalMinRetrabalho = retrabalhosHoje.reduce((acc, e) => acc + (Number(e.durationMinutes) || 0), 0);
  if (totalMinRetrabalho >= 120) {
    const dedupeKey = `${tenantId}:retrabalho_elevado:${dataHojeISO}`;
    activeDetectedKeys.add(dedupeKey);
    detectedEvents.push({
      tipo: 'retrabalho_elevado',
      prioridade: 'P2',
      severidade: 'alto',
      dedupeKey,
      recurso: { tipo: 'equipe', data: dataHojeISO },
      titulo: `Volume elevado de retrabalho hoje (${(totalMinRetrabalho / 60).toFixed(1)}h)`,
      descricao: `A oficina acumula ${(totalMinRetrabalho / 60).toFixed(1)} horas de retrabalho no dia de hoje em ${retrabalhosHoje.length} ocorrência(s). Recomenda-se analisar causas raiz e treinamentos.`,
      detalhes: { totalMinutos: totalMinRetrabalho, ocorrencias: retrabalhosHoje.length }
    });
  }

  // 10.6 Serviço acima do tempo estimado
  for (const entry of state.laborEntries) {
    if (entry.tenantId === tenantId && entry.status === 'ativo' && (entry.type === 'produtivo' || entry.type === 'diagnostico')) {
      const dur = Number(entry.durationMinutes) || 0;
      let durTotal = dur;
      if (entry.startedAt) {
        const sMs = new Date(entry.startedAt).getTime();
        durTotal += Math.max(0, (agora.getTime() - sMs) / (1000 * 60));
      }
      const servicoCatalog = (state.servicos || []).find(s => s.id === entry.serviceItemId || (s.nome && entry.serviceNome && s.nome.toLowerCase() === entry.serviceNome.toLowerCase()));
      const estimadoMin = servicoCatalog ? (Number(servicoCatalog.tempoEstimadoMinutos) || (Number(servicoCatalog.horas) * 60) || 60) : 60;
      if (durTotal > estimadoMin * 1.5 && durTotal >= estimadoMin + 45) {
        const dedupeKey = `${tenantId}:servico_acima_tempo_estimado:${entry.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'servico_acima_tempo_estimado',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'labor_entry', id: entry.id, osId: entry.osId, workerId: entry.workerId },
          titulo: `Serviço acima do tempo estimado: ${entry.serviceNome}`,
          descricao: `O serviço "${entry.serviceNome}" na OS #${entry.osNum || entry.osId} está com ${Math.round(durTotal)} min de execução (estimado: ${estimadoMin} min, desvio de +${Math.round(durTotal - estimadoMin)} min).`,
          detalhes: { entryId: entry.id, tempoEstimadoMinutos: estimadoMin, tempoRealMinutos: Math.round(durTotal) }
        });
      }
    }
  }

  // 11. REGRAS DE PRECIFICAÇÃO E RENTABILIDADE
  const cfgPrecificacao = state.cfg?.precificacao || {};
  const margemMinPadrao = Number(cfgPrecificacao.margemMinimaPadrao) || 20;

  // 11.1 Orçamento abaixo da margem mínima
  if (Array.isArray(state.quotations) && state.quotations.length > 0) {
    for (const q of state.quotations) {
      if ((q.tenantId === tenantId || !q.tenantId) && (q.status === 'rascunho' || q.status === 'enviado' || q.status === 'pendente')) {
        const total = Number(q.totalGeral || q.total || 0);
        const custoEst = Number(q.custoEstimadoTotal || q.custoTotal || 0);
        if (total > 0 && custoEst > 0) {
          const margemOrc = ((total - custoEst) / total) * 100;
          if (margemOrc < margemMinPadrao) {
            const dedupeKey = `${tenantId}:orcamento_abaixo_margem:${q.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'orcamento_abaixo_margem',
              prioridade: 'P2',
              severidade: 'alto',
              dedupeKey,
              recurso: { tipo: 'quotation', id: q.id, osId: q.osId },
              titulo: `Orçamento #${q.id.slice(-6)} com margem abaixo do mínimo`,
              descricao: `O orçamento #${q.id.slice(-6)} está com margem estimada de ${margemOrc.toFixed(1)}%, inferior à margem mínima configurada (${margemMinPadrao}%).`,
              detalhes: { quotationId: q.id, margemPercentual: Number(margemOrc.toFixed(1)), margemMinimaExigida: margemMinPadrao }
            });
          }
        }
      }
    }
  }

  // 11.2 Desconto rompendo margem da OS
  for (const o of state.os) {
    if ((o.tenantId === tenantId || !o.tenantId) && o.st !== 'finalizada' && o.st !== 'cancelada') {
      const desc = Number(o.desc || 0);
      if (desc > 0) {
        try {
          const ap = costingService.calcularCustoRealOS({ tenantId, state, osId: o.id });
          if (ap && ap.receitaAutorizada > 0 && ap.margemPercentual < margemMinPadrao) {
            const dedupeKey = `${tenantId}:desconto_acima_limite:os_${o.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'desconto_acima_limite',
              prioridade: 'P2',
              severidade: 'alto',
              dedupeKey,
              recurso: { tipo: 'os', id: o.id, osNum: o.num },
              titulo: `Desconto na OS #${o.num || o.id} rompeu a margem mínima`,
              descricao: `O desconto de R$ ${desc.toFixed(2)} concedido na OS #${o.num || o.id} reduziu a margem para ${ap.margemPercentual}%, abaixo do mínimo (${margemMinPadrao}%).`,
              detalhes: { osId: o.id, desconto: desc, margemPercentual: ap.margemPercentual, margemMinima: margemMinPadrao }
            });
          }
        } catch (_) {}
      }
    }
  }

  // 11.3 Custo de peça com aumento significativo (> 20% sobre custo anterior)
  if (Array.isArray(state.pecas) && state.pecas.length > 0) {
    for (const p of state.pecas) {
      if (p.tenantId === tenantId || !p.tenantId) {
        const cAnterior = Number(p.custoAnterior || p.custoHistorico || (p.ultimoCusto && p.custoMedio && p.ultimoCusto > p.custoMedio ? p.custoMedio : 0));
        const cAtual = Number(p.ultimoCusto || p.custoMedio || p.custo || 0);
        if (cAnterior > 0 && cAtual > cAnterior) {
          const varPerc = ((cAtual - cAnterior) / cAnterior) * 100;
          if (varPerc >= 20) {
            const dedupeKey = `${tenantId}:custo_peca_acima_historico:${p.id}`;
            activeDetectedKeys.add(dedupeKey);
            detectedEvents.push({
              tipo: 'custo_peca_acima_historico',
              referenciaId: p.id,
              prioridade: 'P3',
              severidade: 'aviso',
              dedupeKey,
              recurso: { tipo: 'peca', id: p.id, descricao: p.descricao || p.nome },
              titulo: `Aumento no custo da peça: ${p.descricao || p.nome}`,
              descricao: `O custo da peça "${p.descricao || p.nome}" subiu de R$ ${cAnterior.toFixed(2)} para R$ ${cAtual.toFixed(2)} (+${varPerc.toFixed(1)}%). É recomendável revisar preços de venda.`,
              detalhes: { partId: p.id, custoAnterior: cAnterior, custoAtual: cAtual, variacaoPercentual: Number(varPerc.toFixed(1)) }
            });
          }
        }
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * 12. REGRAS DE CRM, MANUTENÇÃO PREVENTIVA E PÓS-VENDA
   * ───────────────────────────────────────────────────────────────── */
  // 12.1 Manutenção preventiva próxima e vencida
  const maintenancePlanService = require('./maintenancePlanService');
  try {
    const prevRel = maintenancePlanService.avaliarVencimentos({ tenantId, state, dataReferencia: dataHojeISO });
    for (const it of (prevRel.itens || [])) {
      if (it.status === 'vencido') {
        const dedupeKey = `${tenantId}:manutencao_preventiva_vencida:${it.planoId}_${it.itemId}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'manutencao_preventiva_vencida',
          prioridade: 'P2',
          severidade: 'alto',
          dedupeKey,
          recurso: { tipo: 'maintenance_item', id: it.itemId, planoId: it.planoId, placa: it.placa },
          titulo: `Manutenção preventiva vencida (${it.placa || 'Veículo'})`,
          descricao: `A manutenção de "${it.descricao}" para o veículo ${it.placa || 'N/I'} está vencida.`,
          detalhes: { planoId: it.planoId, itemId: it.itemId, placa: it.placa, nextDueDate: it.nextDueDate, nextDueKm: it.nextDueKm }
        });
      } else if (it.status === 'proximo') {
        const dedupeKey = `${tenantId}:manutencao_preventiva_proxima:${it.planoId}_${it.itemId}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'manutencao_preventiva_proxima',
          prioridade: 'P3',
          severidade: 'aviso',
          dedupeKey,
          recurso: { tipo: 'maintenance_item', id: it.itemId, planoId: it.planoId, placa: it.placa },
          titulo: `Manutenção preventiva próxima (${it.placa || 'Veículo'})`,
          descricao: `A manutenção de "${it.descricao}" para o veículo ${it.placa || 'N/I'} está próxima do vencimento.`,
          detalhes: { planoId: it.planoId, itemId: it.itemId, placa: it.placa, nextDueDate: it.nextDueDate, nextDueKm: it.nextDueKm }
        });
      }
    }
  } catch (errPrev) {
    console.warn('[OperationalIntelligence] Erro ao avaliar manutenções preventivas:', errPrev.message);
  }

  // 12.2 Pós-venda pendente
  const afterSalesList = Array.isArray(state.afterSales) ? state.afterSales : (Array.isArray(state.posVenda) ? state.posVenda : []);
  for (const pv of afterSalesList) {
    if (pv.tenantId === tenantId && (pv.status === 'pendente' || pv.status === 'contato_programado')) {
      const dedupeKey = `${tenantId}:pos_venda_pendente:${pv.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'pos_venda_pendente',
        prioridade: 'P3',
        severidade: 'aviso',
        dedupeKey,
        recurso: { tipo: 'after_sales', id: pv.id, osId: pv.osId },
        titulo: `Acompanhamento de pós-venda pendente`,
        descricao: `Há contato de pós-venda pendente para a OS #${pv.osId || pv.id}.`,
        detalhes: { afterSalesId: pv.id, osId: pv.osId }
      });
    }

    // 12.3 Cliente respondeu com reclamação
    if (pv.tenantId === tenantId && pv.status === 'reclamacao_registrada' && pv.followUpIssue && pv.followUpIssue.status !== 'resolvido') {
      const dedupeKey = `${tenantId}:cliente_respondeu_com_reclamacao:${pv.id}`;
      activeDetectedKeys.add(dedupeKey);
      detectedEvents.push({
        tipo: 'cliente_respondeu_com_reclamacao',
        prioridade: 'P1',
        severidade: 'critico',
        dedupeKey,
        recurso: { tipo: 'after_sales_complaint', id: pv.id, osId: pv.osId },
        titulo: `Reclamação de cliente no pós-venda`,
        descricao: `Cliente registrou insatisfação no pós-venda: "${pv.followUpIssue.textoReclamacao || 'Queixa'}"`,
        detalhes: { afterSalesId: pv.id, osId: pv.osId, queixa: pv.followUpIssue.textoReclamacao }
      });
    }
  }

  // 12.4 Agendamento não compareceu
  const agendamentosList = Array.isArray(state.appointments) ? state.appointments : (Array.isArray(state.agendamentos) ? state.agendamentos : []);
  for (const ag of agendamentosList) {
    if (ag.tenantId === tenantId && ag.status === 'agendado') {
      const dataAg = ag.scheduledDate || ag.data;
      if (dataAg && dataAg < dataHojeISO) {
        ag.status = 'nao_compareceu';
        const dedupeKey = `${tenantId}:agendamento_nao_compareceu:${ag.id}`;
        activeDetectedKeys.add(dedupeKey);
        detectedEvents.push({
          tipo: 'agendamento_nao_compareceu',
          prioridade: 'P3',
          severidade: 'atencao',
          dedupeKey,
          recurso: { tipo: 'appointment', id: ag.id, vehicleId: ag.vehicleId },
          titulo: `Agendamento não compareceu (${ag.scheduledDate})`,
          descricao: `O veículo agendado para ${ag.scheduledDate} não compareceu à oficina.`,
          detalhes: { appointmentId: ag.id, scheduledDate: ag.scheduledDate }
        });
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
   * CICLO DE VIDA, DEDUPLICAÇÃO E AUTO-RESOLUÇÃO
   * ───────────────────────────────────────────────────────────────── */
  const agoraStr = agoraTimestampISO;
  const eventosAtuais = state.operationalEvents;

  // 1. Processa eventos detectados nesta rodada
  for (const novo of detectedEvents) {
    const existente = eventosAtuais.find(e =>
      e.dedupeKey === novo.dedupeKey &&
      (e.status === 'aberto' || e.status === 'reconhecido')
    );

    if (existente) {
      // Atualiza evento ativo mantendo o status 'reconhecido' se já tiver sido reconhecido
      existente.atualizadoEm = agoraStr;
      existente.descricao = novo.descricao;
      existente.detalhes = novo.detalhes;
      existente.referenciaId = novo.referenciaId || novo.recurso?.id || existente.referenciaId || null;
      // Atualiza prioridade e severidade caso tenham escalado
      existente.prioridade = novo.prioridade;
      existente.severidade = novo.severidade;
    } else {
      // Cria novo evento aberto
      eventosAtuais.unshift({
        id: gerarId('ope'),
        tenantId,
        tipo: novo.tipo,
        referenciaId: novo.referenciaId || novo.recurso?.id || null,
        subtipo: novo.subtipo || null,
        prioridade: novo.prioridade,
        severidade: novo.severidade,
        status: 'aberto',
        titulo: novo.titulo,
        descricao: novo.descricao,
        recurso: novo.recurso,
        dedupeKey: novo.dedupeKey,
        criadoEm: agoraStr,
        atualizadoEm: agoraStr,
        reconhecidoEm: null,
        reconhecidoPor: null,
        reconhecidoMotivo: null,
        resolvidoEm: null,
        detalhes: novo.detalhes || {}
      });
    }
  }

  // 2. Auto-resolução: eventos que estavam abertos/reconhecidos mas cuja condição não é mais detectada
  for (const ev of eventosAtuais) {
    if ((ev.status === 'aberto' || ev.status === 'reconhecido') && !activeDetectedKeys.has(ev.dedupeKey)) {
      ev.status = 'resolvido';
      ev.resolvidoEm = agoraStr;
      ev.atualizadoEm = agoraStr;
      registrarAuditoria(state, {
        acao: 'evento_operacional_auto_resolvido',
        eventoId: ev.id,
        tipo: ev.tipo,
        dedupeKey: ev.dedupeKey,
        resolvidoEm: agoraStr
      });
    }
  }

  // Mantém tamanho máximo de histórico de eventos (máx 1000)
  if (state.operationalEvents.length > 1000) {
    state.operationalEvents = state.operationalEvents.slice(0, 1000);
  }

  const eventosAtivos = state.operationalEvents.filter(e => e.status === 'aberto' || e.status === 'reconhecido');
  return {
    tenantId,
    timestamp: agoraStr,
    totalDetectados: detectedEvents.length,
    novosOuAtivos: eventosAtivos.length,
    eventos: eventosAtivos,
    alertas: eventosAtivos,
    novosEventos: detectedEvents,
    find(...args) { return eventosAtivos.find(...args); },
    filter(...args) { return eventosAtivos.filter(...args); },
    some(...args) { return eventosAtivos.some(...args); },
    map(...args) { return eventosAtivos.map(...args); },
    forEach(...args) { return eventosAtivos.forEach(...args); },
    get length() { return eventosAtivos.length; }
  };
}

/**
 * Operador ou Gerente reconhece um evento ativo ("ciente", "já estou vendo")
 */
function reconhecerEvento({
  tenantId,
  eventId,
  actorId = 'operador',
  motivo = 'ciente',
  state,
  agoraIso = null
}) {
  if (!tenantId || !eventId || !state) {
    throw new Error('tenantId, eventId e state são obrigatórios.');
  }
  state.operationalEvents = Array.isArray(state.operationalEvents) ? state.operationalEvents : [];

  const ev = state.operationalEvents.find(e => e.id === eventId && (!e.tenantId || e.tenantId === tenantId));
  if (!ev) {
    return { ok: false, status: 404, error: 'Evento operacional não encontrado para este tenant.' };
  }
  if (!ev.tenantId) ev.tenantId = tenantId;

  if (ev.status === 'resolvido') {
    return { ok: false, status: 400, error: 'Evento operacional já está resolvido.' };
  }

  const agora = agoraIso || new Date().toISOString();
  ev.status = 'reconhecido';
  ev.reconhecidoEm = agora;
  ev.reconhecidoPor = actorId;
  ev.reconhecidoMotivo = motivo;
  ev.motivoReconhecimento = motivo;
  ev.atualizadoEm = agora;

  registrarAuditoria(state, {
    acao: 'evento_operacional_reconhecido',
    eventoId: ev.id,
    tipo: ev.tipo,
    usuario: actorId,
    motivo
  });

  return {
    ok: true,
    evento: ev
  };
}

/**
 * Lista eventos operacionais com filtros opcionais
 */
function listarEventos({
  tenantId,
  state,
  status = null,
  severidade = null,
  prioridade = null,
  tipo = null,
  limit = 50
}) {
  if (!state || !Array.isArray(state.operationalEvents)) return [];

  let filtrados = state.operationalEvents.filter(e => e.tenantId === tenantId);

  if (status) {
    const stArr = Array.isArray(status) ? status : [status];
    filtrados = filtrados.filter(e => stArr.includes(e.status));
  }
  if (severidade) {
    const sevArr = Array.isArray(severidade) ? severidade : [severidade];
    filtrados = filtrados.filter(e => sevArr.includes(e.severidade));
  }
  if (prioridade) {
    const priArr = Array.isArray(prioridade) ? prioridade : [prioridade];
    filtrados = filtrados.filter(e => priArr.includes(e.prioridade));
  }
  if (tipo) {
    filtrados = filtrados.filter(e => e.tipo === tipo);
  }

  // Ordenação determinística: P1 > P2 > P3 > P4, depois data mais recente
  const ordemP = { P1: 1, P2: 2, P3: 3, P4: 4 };
  filtrados.sort((a, b) => {
    const pDiff = (ordemP[a.prioridade] || 5) - (ordemP[b.prioridade] || 5);
    if (pDiff !== 0) return pDiff;
    return new Date(b.atualizadoEm || b.criadoEm).getTime() - new Date(a.atualizadoEm || a.criadoEm).getTime();
  });

  return filtrados.slice(0, limit);
}

/**
 * Consulta um evento operacional específico
 */
function obterEvento({ tenantId, state, eventId }) {
  if (!state || !Array.isArray(state.operationalEvents)) return null;
  return state.operationalEvents.find(e => e.id === eventId && e.tenantId === tenantId) || null;
}

module.exports = {
  avaliarOperacao,
  avaliarEventosOperacionais: avaliarOperacao,
  reconhecerEvento,
  listarEventos,
  obterEvento,
  calcularHorasPassadas
};
