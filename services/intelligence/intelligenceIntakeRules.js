'use strict';

const { parseDataHora, calcularHorasPassadas } = require('./intelligenceHelpers');

/**
 * Avalia regras de Pré-OS, triagem técnica, garantias e orçamentos (Regras 6, 7 e 8)
 */
function detectarRegrasIntakeEOrcamentos({
  tenantId,
  state,
  agora,
  activeDetectedKeys,
  detectedEvents
}) {
  const veiculosPorId = new Map((state.veiculos || []).map(v => [v.id, v]));

  /* ─────────────────────────────────────────────────────────────────
   * 6. REGRA: PRÉ-OS OU INTAKE TÉCNICO PENDENTE
   * ───────────────────────────────────────────────────────────────── */
  for (const pos of (state.preOS || [])) {
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

  for (const ses of (state.intakeSessions || [])) {
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
  for (const o of (state.os || [])) {
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
}

module.exports = {
  detectarRegrasIntakeEOrcamentos
};

