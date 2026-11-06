'use strict';

const { parseDataHora, calcularHorasPassadas } = require('./intelligenceHelpers');

/**
 * Avalia regras de fluxo de pátio, veículos e ordens de serviço (Regras 1 a 5)
 */
function detectarRegrasVeiculosEPatio({
  tenantId,
  state,
  agora,
  limitesVeiculo,
  limitesOS,
  limitesGargalos,
  activeDetectedKeys,
  detectedEvents
}) {
  const veiculosPorId = new Map((state.veiculos || []).map(v => [v.id, v]));

  /* ─────────────────────────────────────────────────────────────────
   * 1. REGRA: VEÍCULO PARADO NO PÁTIO SEM MOVIMENTAÇÃO
   * ───────────────────────────────────────────────────────────────── */
  for (const o of (state.os || [])) {
    if (o.st === 'finalizada') continue;
    const v = veiculosPorId.get(o.vei) || {};
    const placa = v.placa || o.placa || 'SEM-PLACA';

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
  for (const o of (state.os || [])) {
    if (o.st === 'finalizada') continue;
    const v = veiculosPorId.get(o.vei) || {};
    const placa = v.placa || o.placa || 'SEM-PLACA';

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
  for (const o of (state.os || [])) {
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
  for (const box of (state.boxes || [])) {
    const osDoBox = (state.os || []).find(o => o.box === box.id && o.st !== 'finalizada');
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
    peca: (state.os || []).filter(o => o.st === 'peca').length,
    aprovacao: (state.os || []).filter(o => o.st === 'aprovacao').length,
    fila: (state.os || []).filter(o => o.st === 'fila' || (!o.st && !o.box && o.st !== 'finalizada')).length,
    executando: (state.os || []).filter(o => o.st === 'executando').length
  };

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
}

module.exports = {
  detectarRegrasVeiculosEPatio
};

