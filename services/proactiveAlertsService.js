'use strict';

/**
 * =====================================================================
 * PÁTIO CRM — SERVIÇO DE ALERTAS PROATIVOS DA VERÔNICA NO WHATSAPP
 * Detecção de Orçamentos Parados e Gargalos de Tempo nos Boxes
 * =====================================================================
 */

const { parseDataHora, obterAgoraSP } = require('./financialEngine');

const CONFIG_PADRAO_ALERTAS = {
  alertasProativosAtivos: true,
  alertaOrcamentoParadoAtivo: true,
  slaOrcamentoParadoHoras: 4,
  alertaGargaloBoxAtivo: true,
  slaGargaloBoxHoras: 6,
  cooldownAlertasMinutos: 240 // 4 horas
};

// Histórico de disparos em memória para controle de cooldown (anti-spam)
// Chave: `${tenantId}:${tipo}:${id}` -> timestamp (ms)
const historicoDisparos = new Map();

function limparHistoricoCooldown() {
  historicoDisparos.clear();
}

/**
 * Extrai a configuração consolidada de alertas proativos com retrocompatibilidade
 */
function obterConfigAlertas(state = {}) {
  const cfg = state.cfg || state.config || {};
  const ass = cfg.assistente || cfg.assistant || {};
  const wpp = cfg.whatsapp || {};

  return {
    alertasProativosAtivos: ass.alertasProativosAtivos !== undefined
      ? Boolean(ass.alertasProativosAtivos)
      : (wpp.alertasProativosAtivos !== undefined ? Boolean(wpp.alertasProativosAtivos) : CONFIG_PADRAO_ALERTAS.alertasProativosAtivos),
    alertaOrcamentoParadoAtivo: ass.alertaOrcamentoParadoAtivo !== undefined
      ? Boolean(ass.alertaOrcamentoParadoAtivo)
      : (wpp.alertaOrcamentoParadoAtivo !== undefined ? Boolean(wpp.alertaOrcamentoParadoAtivo) : CONFIG_PADRAO_ALERTAS.alertaOrcamentoParadoAtivo),
    slaOrcamentoParadoHoras: Number(ass.slaOrcamentoParadoHoras) > 0
      ? Number(ass.slaOrcamentoParadoHoras)
      : (Number(wpp.slaOrcamentoParadoHoras) > 0 ? Number(wpp.slaOrcamentoParadoHoras) : CONFIG_PADRAO_ALERTAS.slaOrcamentoParadoHoras),
    alertaGargaloBoxAtivo: ass.alertaGargaloBoxAtivo !== undefined
      ? Boolean(ass.alertaGargaloBoxAtivo)
      : (wpp.alertaGargaloBoxAtivo !== undefined ? Boolean(wpp.alertaGargaloBoxAtivo) : CONFIG_PADRAO_ALERTAS.alertaGargaloBoxAtivo),
    slaGargaloBoxHoras: Number(ass.slaGargaloBoxHoras) > 0
      ? Number(ass.slaGargaloBoxHoras)
      : (Number(wpp.slaGargaloBoxHoras) > 0 ? Number(wpp.slaGargaloBoxHoras) : CONFIG_PADRAO_ALERTAS.slaGargaloBoxHoras),
    cooldownAlertasMinutos: Number(ass.cooldownAlertasMinutos) > 0
      ? Number(ass.cooldownAlertasMinutos)
      : (Number(wpp.cooldownAlertasMinutos) > 0 ? Number(wpp.cooldownAlertasMinutos) : CONFIG_PADRAO_ALERTAS.cooldownAlertasMinutos),
    displayName: ass.displayName || 'Verônica'
  };
}

/**
 * Calcula diferença em horas entre duas datas de forma segura
 */
function calcularHoras(inicio, fim) {
  if (!inicio || !fim) return 0;
  const dInicio = inicio instanceof Date ? inicio : new Date(inicio);
  const dFim = fim instanceof Date ? fim : new Date(fim);
  if (isNaN(dInicio.getTime()) || isNaN(dFim.getTime())) return 0;
  return Math.max(0, (dFim.getTime() - dInicio.getTime()) / (1000 * 60 * 60));
}

/**
 * 1. DETECÇÃO DE ORÇAMENTOS PARADOS
 * Identifica orçamentos pendentes de aprovação que excederam o SLA em horas.
 * Verifica também se o veículo vinculado está ocupando um box físico simultaneamente.
 */
function detectarOrcamentosParados({ state = {}, tenantId = 'default', agoraDate = null, slaHoras = null }) {
  const cfgAlertas = obterConfigAlertas(state);
  if (!cfgAlertas.alertasProativosAtivos || !cfgAlertas.alertaOrcamentoParadoAtivo) {
    return [];
  }

  const slaLimite = Number(slaHoras) > 0 ? Number(slaHoras) : cfgAlertas.slaOrcamentoParadoHoras;
  const agora = (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) ? agoraDate : new Date();

  const quotations = Array.isArray(state.quotations) ? state.quotations : [];
  const orcamentosLegados = Array.isArray(state.orcamentos) ? state.orcamentos : [];
  const osList = Array.isArray(state.os) ? state.os : [];
  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  const clienteMap = new Map(clientes.map(c => [c.id, c.nome || c.razaoSocial || c.id]));
  const veiculoMap = new Map(veiculos.map(v => [v.id, v]));
  const boxMap = new Map(boxes.map(b => [b.id, b.nome || b.id]));

  const statusPendentes = new Set([
    'aguardando_aprovacao',
    'pendente',
    'enviado',
    'rascunho_aguardando',
    'aberto'
  ]);

  const listaAlertas = [];

  // Mapear OS ativas que estão em box
  const osEmBoxPorVeiculo = new Map();
  const osEmBoxPorId = new Map();
  for (const o of osList) {
    if (o.st !== 'finalizada' && o.st !== 'cancelada' && o.box) {
      if (o.vei) osEmBoxPorVeiculo.set(o.vei, o);
      if (o.placa) osEmBoxPorVeiculo.set(o.placa, o);
      osEmBoxPorId.set(o.id, o);
    }
  }

  // Avaliação dos orçamentos da coleção state.quotations
  const todosOrcamentos = [...quotations, ...orcamentosLegados];
  const orcamentosProcessados = new Set();

  for (const orc of todosOrcamentos) {
    if (!orc || !orc.id || orcamentosProcessados.has(orc.id)) continue;
    orcamentosProcessados.add(orc.id);

    const st = String(orc.status || '').toLowerCase().trim();
    if (!statusPendentes.has(st)) continue;

    // Data de referência do envio ou criação
    const dataRef = orc.enviadoEm || orc.atualizadoEm || orc.criadoEm || orc.data;
    const tsInicio = dataRef ? new Date(dataRef) : null;
    if (!tsInicio || isNaN(tsInicio.getTime())) continue;

    const horasParado = calcularHoras(tsInicio, agora);
    if (horasParado >= slaLimite) {
      // Localiza veículo e se está em box
      const veiculoId = orc.veiculoId || (orc.veiculo && orc.veiculo.id);
      let placa = orc.placa;
      if (!placa && veiculoId && veiculoMap.has(veiculoId)) {
        placa = veiculoMap.get(veiculoId).placa;
      }

      const osVinculada = (orc.osId && osEmBoxPorId.get(orc.osId)) ||
                          (veiculoId && osEmBoxPorVeiculo.get(veiculoId)) ||
                          (placa && osEmBoxPorVeiculo.get(placa));

      const ocupaBox = Boolean(osVinculada && osVinculada.box);
      const boxId = ocupaBox ? osVinculada.box : null;
      const boxNome = boxId ? (boxMap.get(boxId) || boxId) : null;

      const clienteId = orc.clienteId || (osVinculada && osVinculada.cli);
      const clienteNome = (clienteId && clienteMap.get(clienteId)) || orc.clienteNome || 'Cliente não identificado';

      const valorTotal = Number(orc.totalGeral || orc.valorTotal || orc.total || 0);

      listaAlertas.push({
        tipo: 'orcamento_parado',
        id: orc.id,
        codigo: orc.codigo || `ORC-${orc.id}`,
        osId: orc.osId || (osVinculada ? osVinculada.id : null),
        osNum: osVinculada ? (osVinculada.num || osVinculada.id) : (orc.osNum || null),
        placa: placa || 'SEM-PLACA',
        clienteNome,
        valorTotal,
        statusOrcamento: st,
        horasParado: Number(horasParado.toFixed(1)),
        slaHoras: slaLimite,
        ocupaBox,
        boxId,
        boxNome,
        enviadoEm: dataRef,
        chaveCooldown: `orcamento:${tenantId}:${orc.id}`,
        recomendacao: ocupaBox
          ? `Prioridade Alta: Veículo ocupa o ${boxNome}. Cobrar autorização urgente ou remanejar veículo para liberar o box.`
          : 'Contatar cliente para aprovação comercial ou verificar se há dúvidas na cotação.'
      });
    }
  }

  // Também verificar OSs em estágio "aprovacao" que talvez não tenham gerado objeto quotation separado
  for (const o of osList) {
    if (o.st === 'aprovacao') {
      const orcExistente = listaAlertas.find(a => a.osId === o.id);
      if (orcExistente) continue;

      const dataRef = o.atualizadoEm || o.criadoEm || o.abertura;
      const tsInicio = dataRef ? new Date(dataRef) : null;
      if (!tsInicio || isNaN(tsInicio.getTime())) continue;

      const horasParado = calcularHoras(tsInicio, agora);
      if (horasParado >= slaLimite) {
        const v = veiculoMap.get(o.vei) || {};
        const placa = v.placa || o.placa || 'SEM-PLACA';
        const clienteNome = (o.cli && clienteMap.get(o.cli)) || 'Cliente não identificado';
        const ocupaBox = Boolean(o.box);
        const boxNome = ocupaBox ? (boxMap.get(o.box) || o.box) : null;
        const valorTotal = Number(o.total || o.valorTotal || 0);

        listaAlertas.push({
          tipo: 'orcamento_parado',
          id: `os_aprovacao_${o.id}`,
          codigo: `OS-#${o.num || o.id}`,
          osId: o.id,
          osNum: o.num || o.id,
          placa,
          clienteNome,
          valorTotal,
          statusOrcamento: 'aprovacao',
          horasParado: Number(horasParado.toFixed(1)),
          slaHoras: slaLimite,
          ocupaBox,
          boxId: o.box || null,
          boxNome,
          enviadoEm: dataRef,
          chaveCooldown: `orcamento:${tenantId}:os_${o.id}`,
          recomendacao: ocupaBox
            ? `Veículo ocupa o ${boxNome} em aprovação de orçamento. Contatar cliente com urgência.`
            : 'Cobrar retorno do orçamento da OS com o cliente.'
        });
      }
    }
  }

  return listaAlertas.sort((a, b) => b.horasParado - a.horasParado);
}

/**
 * 2. DETECÇÃO DE GARGALOS NOS BOXES
 * Identifica boxes ocupados cujo tempo de permanência ultrapassou o SLA
 * ou que estejam sem apontamento de mecânico ativo há tempo excessivo.
 */
function detectarGargalosBox({ state = {}, tenantId = 'default', agoraDate = null, slaHoras = null }) {
  const cfgAlertas = obterConfigAlertas(state);
  if (!cfgAlertas.alertasProativosAtivos || !cfgAlertas.alertaGargaloBoxAtivo) {
    return [];
  }

  const slaLimite = Number(slaHoras) > 0 ? Number(slaHoras) : cfgAlertas.slaGargaloBoxHoras;
  const agora = (agoraDate instanceof Date && !isNaN(agoraDate.getTime())) ? agoraDate : new Date();

  const boxes = Array.isArray(state.boxes) ? state.boxes : [];
  const osList = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];
  const laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];

  const veiculoMap = new Map(veiculos.map(v => [v.id, v]));
  const clienteMap = new Map(clientes.map(c => [c.id, c.nome || c.razaoSocial || c.id]));

  const gargalos = [];

  for (const box of boxes) {
    if (!box || !box.id) continue;

    // Encontra a OS ativa no box
    const osNoBox = osList.find(o =>
      o.box === box.id &&
      (o.tenantId === tenantId || !o.tenantId) &&
      o.st !== 'finalizada' &&
      o.st !== 'cancelada'
    );

    if (!osNoBox) continue; // Box livre

    const v = veiculoMap.get(osNoBox.vei) || {};
    const placa = v.placa || osNoBox.placa || 'SEM-PLACA';
    const clienteNome = (osNoBox.cli && clienteMap.get(osNoBox.cli)) || 'Cliente não informado';

    // Determina o tempo no box
    // Pode vir de osNoBox.boxEntradaEm, osNoBox.emExecucaoDesde, osNoBox.criadoEm, ou osNoBox.abertura
    const dataEntradaBox = osNoBox.boxEntradaEm ||
      osNoBox.emExecucaoDesde ||
      osNoBox.criadoEm ||
      osNoBox.abertura ||
      osNoBox.atualizadoEm;

    const tsEntrada = dataEntradaBox ? new Date(dataEntradaBox) : null;
    const horasNoBox = tsEntrada && !isNaN(tsEntrada.getTime())
      ? calcularHoras(tsEntrada, agora)
      : 0;

    // Verifica se há mecânico apontando ativamente na OS / Box
    const apontamentoAtivo = laborEntries.find(e =>
      e.status === 'ativo' &&
      (e.boxId === box.id || e.osId === osNoBox.id)
    );

    // Verifica último apontamento realizado
    const apontamentosDaOS = laborEntries.filter(e =>
      e.osId === osNoBox.id || e.boxId === box.id
    );

    let horasSemApontamento = 0;
    if (!apontamentoAtivo) {
      if (apontamentosDaOS.length > 0) {
        // Encontra o encerramento mais recente
        const datasFim = apontamentosDaOS
          .map(e => e.endedAt || e.pausedAt || e.startedAt)
          .filter(Boolean)
          .map(d => new Date(d))
          .filter(d => !isNaN(d.getTime()));
        if (datasFim.length > 0) {
          const maisRecente = new Date(Math.max(...datasFim.map(d => d.getTime())));
          horasSemApontamento = calcularHoras(maisRecente, agora);
        } else {
          horasSemApontamento = horasNoBox;
        }
      } else {
        horasSemApontamento = horasNoBox;
      }
    }

    const ultrapassouSlaTempo = horasNoBox >= slaLimite;
    const estagioBloqueado = osNoBox.st === 'peca' || osNoBox.st === 'aprovacao';
    const ociosoSemMecanico = !apontamentoAtivo && horasSemApontamento >= 2 && horasNoBox >= 2;

    if (ultrapassouSlaTempo || (estagioBloqueado && horasNoBox >= 3) || ociosoSemMecanico) {
      let motivo = '';
      let recomendacao = '';

      if (osNoBox.st === 'peca') {
        motivo = `Box bloqueado aguardando peças (${horasNoBox.toFixed(1)}h no box).`;
        recomendacao = 'Cobrar expedição das peças com distribuidor ou avaliar remoção do veículo para vaga de espera.';
      } else if (osNoBox.st === 'aprovacao') {
        motivo = `Box bloqueado aguardando aprovação de orçamento (${horasNoBox.toFixed(1)}h).`;
        recomendacao = 'Cobrar autorização comercial do cliente imediatamente para liberar o posto de trabalho.';
      } else if (ociosoSemMecanico) {
        motivo = `Box ocupado sem mecânico ativo apontando serviço há ${horasSemApontamento.toFixed(1)}h.`;
        recomendacao = 'Alinhar com a liderança de oficina a atribuição de mecânico ou conferir se o serviço foi concluído.';
      } else {
        motivo = `Tempo de execução no box (${horasNoBox.toFixed(1)}h) excedeu o SLA de ${slaLimite}h.`;
        recomendacao = 'Verificar se houve imprevistos mecânicos ou complexidade técnica no serviço.';
      }

      gargalos.push({
        tipo: 'gargalo_box',
        boxId: box.id,
        boxNome: box.nome || box.id,
        osId: osNoBox.id,
        osNum: osNoBox.num || osNoBox.id,
        placa,
        clienteNome,
        statusOS: osNoBox.st || 'executando',
        horasNoBox: Number(horasNoBox.toFixed(1)),
        slaHoras: slaLimite,
        temMecanicoAtivo: Boolean(apontamentoAtivo),
        mecanicoNome: apontamentoAtivo ? (apontamentoAtivo.workerNome || 'Mecânico') : null,
        horasSemApontamento: Number(horasSemApontamento.toFixed(1)),
        motivo,
        recomendacao,
        chaveCooldown: `box:${tenantId}:${box.id}:${placa}`
      });
    }
  }

  return gargalos.sort((a, b) => b.horasNoBox - a.horasNoBox);
}

/**
 * 3. CONTROLE DE COOLDOWN / ANTI-SPAM
 * Evita disparos duplicados em rajada para a mesma pendência.
 */
function verificarCooldown({ tipo, chave, cooldownMinutos = 240, agora = null }) {
  const tsAgora = (agora instanceof Date ? agora.getTime() : (agora || Date.now()));
  const chaveCompleta = `${tipo}:${chave}`;
  const ultimoEnvio = historicoDisparos.get(chaveCompleta);

  if (!ultimoEnvio) {
    return true; // Liberado para envio
  }

  const janelaMs = Number(cooldownMinutos) * 60 * 1000;
  const tempoDecorridoMs = tsAgora - ultimoEnvio;

  return tempoDecorridoMs >= janelaMs;
}

function registrarDisparo({ tipo, chave, agora = null }) {
  const tsAgora = (agora instanceof Date ? agora.getTime() : (agora || Date.now()));
  const chaveCompleta = `${tipo}:${chave}`;
  historicoDisparos.set(chaveCompleta, tsAgora);
}

/**
 * 4. FORMATAÇÃO DAS MENSAGENS EXECUTIVAS DA VERÔNICA
 */
function formatarValorMoeda(num) {
  return Number(num || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMensagemOrcamentoParado({ alerta, nomeAssistente = 'Verônica' }) {
  const avisoBox = alerta.ocupaBox
    ? `🚨 *ATENÇÃO CRÍTICA:* O veículo está ocupando o *${alerta.boxNome || 'Box'}*!\n`
    : '';

  return `🤖 *${nomeAssistente} — Alerta de SLA: Orçamento Parado*\n` +
    `════════════════════════════\n` +
    `📋 *Orçamento:* ${alerta.codigo} (OS #${alerta.osNum || alerta.osId})\n` +
    `🚚 *Veículo / Placa:* ${alerta.placa}\n` +
    `🏢 *Cliente / Frota:* ${alerta.clienteNome}\n` +
    `💰 *Valor Total:* ${formatarValorMoeda(alerta.valorTotal)}\n` +
    `⏳ *Tempo de Espera:* *${alerta.horasParado}h* (SLA: ${alerta.slaHoras}h)\n` +
    avisoBox +
    `💡 *Ação Recomendada:* ${alerta.recomendacao}\n` +
    `════════════════════════════`;
}

function formatarMensagemGargaloBox({ alerta, nomeAssistente = 'Verônica' }) {
  const mecStatus = alerta.temMecanicoAtivo
    ? `👨‍🔧 *Mecânico Ativo:* ${alerta.mecanicoNome}`
    : `⚠️ *Mecânico:* Sem apontamento ativo há ${alerta.horasSemApontamento}h`;

  return `🤖 *${nomeAssistente} — Alerta Operacional: Gargalo no Box*\n` +
    `════════════════════════════\n` +
    `🔧 *Box:* *${alerta.boxNome}*\n` +
    `🚚 *Veículo / Placa:* ${alerta.placa}\n` +
    `📋 *Ordem de Serviço:* #${alerta.osNum || alerta.osId} (${alerta.clienteNome})\n` +
    `⏱️ *Tempo no Box:* *${alerta.horasNoBox}h* (SLA: ${alerta.slaHoras}h)\n` +
    `📊 *Estágio Atual:* ${alerta.statusOS}\n` +
    `${mecStatus}\n` +
    `⚠️ *Diagnóstico:* ${alerta.motivo}\n` +
    `💡 *Ação Recomendada:* ${alerta.recomendacao}\n` +
    `════════════════════════════`;
}

/**
 * 5. AVALIAÇÃO CONSOLIDADA (LEITURA)
 */
function avaliarAlertasProativos({ state = {}, tenantId = 'default', agoraDate = null }) {
  const cfg = obterConfigAlertas(state);
  const orcamentosParados = detectarOrcamentosParados({ state, tenantId, agoraDate });
  const gargalosBox = detectarGargalosBox({ state, tenantId, agoraDate });

  return {
    sucesso: true,
    tenantId,
    config: cfg,
    resumo: {
      totalOrcamentosParados: orcamentosParados.length,
      totalGargalosBox: gargalosBox.length,
      totalAlertas: orcamentosParados.length + gargalosBox.length
    },
    orcamentosParados,
    gargalosBox
  };
}

/**
 * 6. DISPARO DE ALERTAS PROATIVOS VIA WHATSAPP
 */
async function dispararAlertasProativos({
  state = {},
  tenantId = 'default',
  force = false,
  wppClientOverride = null,
  agoraDate = null
}) {
  const { getWppClient, getWppStatus } = require('./whatsapp/whatsappState');

  const cfg = state.cfg || state.config || {};
  const cfgAlertas = obterConfigAlertas(state);

  if (!cfgAlertas.alertasProativosAtivos && !force) {
    return {
      success: false,
      motivo: 'Alertas proativos desativados nas configurações.',
      enviados: []
    };
  }

  // Avaliação dos gargalos e orçamentos
  const avaliacao = avaliarAlertasProativos({ state, tenantId, agoraDate });
  const { orcamentosParados, gargalosBox } = avaliacao;

  const totalPendentes = orcamentosParados.length + gargalosBox.length;
  if (totalPendentes === 0) {
    return {
      success: true,
      mensagem: 'Nenhum orçamento parado ou gargalo de box detectado no momento.',
      totalDetectados: 0,
      enviados: []
    };
  }

  // Identificação do Chat de Destino (Grupo de Operação ou Fallback Admin)
  const targetChatId = cfg.grupoOperacaoId || cfg.grupoAdminId;
  const adminFones = Array.isArray(cfg.adminFones) ? cfg.adminFones : [];

  // Mocks para ambiente de teste ou integração desativada
  const isMockEnv = process.env.DISABLE_INTEGRATIONS === 'true' ||
                    process.env.DISABLE_WHATSAPP === 'true' ||
                    process.env.NODE_ENV === 'test';

  const wppClient = wppClientOverride || getWppClient();
  const wppStatus = getWppStatus ? getWppStatus() : { status: 'desconectado' };

  if (!isMockEnv && (!wppClient || wppStatus.status !== 'pronto')) {
    return {
      success: false,
      error: `WhatsApp não está conectado (status: ${wppStatus.status}). Conecte o WhatsApp no painel.`,
      avaliacao
    };
  }

  const enviados = [];
  const ignoradosCooldown = [];
  const falhas = [];

  // Processa orçamentos parados
  for (const item of orcamentosParados) {
    const liberadoCooldown = force || verificarCooldown({
      tipo: 'orcamento',
      chave: item.chaveCooldown,
      cooldownMinutos: cfgAlertas.cooldownAlertasMinutos,
      agora: agoraDate
    });

    if (!liberadoCooldown) {
      ignoradosCooldown.push({ tipo: 'orcamento', id: item.id, chave: item.chaveCooldown });
      continue;
    }

    const mensagem = formatarMensagemOrcamentoParado({
      alerta: item,
      nomeAssistente: cfgAlertas.displayName
    });

    try {
      if (isMockEnv || !wppClient) {
        // Mock de envio com sucesso
        registrarDisparo({ tipo: 'orcamento', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'orcamento',
          id: item.id,
          codigo: item.codigo,
          mock: true,
          destinatario: targetChatId || 'admin_mock',
          texto: mensagem
        });
      } else {
        if (targetChatId) {
          await wppClient.sendMessage(targetChatId, mensagem, { waitUntilMsgSent: true });
        } else if (adminFones.length > 0) {
          for (const fone of adminFones) {
            const clean = String(fone).replace(/\D/g, '');
            if (clean) {
              const foneChat = `${clean.startsWith('55') ? clean : '55' + clean}@c.us`;
              await wppClient.sendMessage(foneChat, mensagem, { waitUntilMsgSent: true });
            }
          }
        }
        registrarDisparo({ tipo: 'orcamento', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'orcamento',
          id: item.id,
          codigo: item.codigo,
          destinatario: targetChatId || 'adminFones',
          texto: mensagem
        });
      }
    } catch (errEnvio) {
      console.error(`[Alertas Proativos] Falha ao enviar alerta de orçamento ${item.codigo}:`, errEnvio.message);
      falhas.push({ tipo: 'orcamento', id: item.id, erro: errEnvio.message });
    }
  }

  // Processa gargalos de box
  for (const item of gargalosBox) {
    const liberadoCooldown = force || verificarCooldown({
      tipo: 'box',
      chave: item.chaveCooldown,
      cooldownMinutos: cfgAlertas.cooldownAlertasMinutos,
      agora: agoraDate
    });

    if (!liberadoCooldown) {
      ignoradosCooldown.push({ tipo: 'box', boxId: item.boxId, chave: item.chaveCooldown });
      continue;
    }

    const mensagem = formatarMensagemGargaloBox({
      alerta: item,
      nomeAssistente: cfgAlertas.displayName
    });

    try {
      if (isMockEnv || !wppClient) {
        // Mock de envio com sucesso
        registrarDisparo({ tipo: 'box', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'gargalo_box',
          boxId: item.boxId,
          boxNome: item.boxNome,
          mock: true,
          destinatario: targetChatId || 'admin_mock',
          texto: mensagem
        });
      } else {
        if (targetChatId) {
          await wppClient.sendMessage(targetChatId, mensagem, { waitUntilMsgSent: true });
        } else if (adminFones.length > 0) {
          for (const fone of adminFones) {
            const clean = String(fone).replace(/\D/g, '');
            if (clean) {
              const foneChat = `${clean.startsWith('55') ? clean : '55' + clean}@c.us`;
              await wppClient.sendMessage(foneChat, mensagem, { waitUntilMsgSent: true });
            }
          }
        }
        registrarDisparo({ tipo: 'box', chave: item.chaveCooldown, agora: agoraDate });
        enviados.push({
          tipo: 'gargalo_box',
          boxId: item.boxId,
          boxNome: item.boxNome,
          destinatario: targetChatId || 'adminFones',
          texto: mensagem
        });
      }
    } catch (errEnvio) {
      console.error(`[Alertas Proativos] Falha ao enviar alerta do box ${item.boxNome}:`, errEnvio.message);
      falhas.push({ tipo: 'gargalo_box', boxId: item.boxId, erro: errEnvio.message });
    }
  }

  return {
    success: true,
    totalDetectados: totalPendentes,
    totalEnviados: enviados.length,
    totalIgnoradosCooldown: ignoradosCooldown.length,
    enviados,
    ignoradosCooldown,
    falhas
  };
}

module.exports = {
  CONFIG_PADRAO_ALERTAS,
  obterConfigAlertas,
  detectarOrcamentosParados,
  detectarGargalosBox,
  verificarCooldown,
  registrarDisparo,
  limparHistoricoCooldown,
  formatarMensagemOrcamentoParado,
  formatarMensagemGargaloBox,
  avaliarAlertasProativos,
  dispararAlertasProativos
};
