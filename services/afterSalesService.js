'use strict';

const crypto = require('crypto');
const vehicleHistoryService = require('./vehicleHistoryService');
const recurrenceDetector = require('./recurrenceDetector');
const warrantyService = require('./warrantyService');
const preOSEngine = require('./preOSEngine');

function gerarId(prefix = 'pvd') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

function adicionarDias(dataISO, dias) {
  const d = new Date(dataISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
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
 * Avalia OSs finalizadas para gerar registros de pós-venda agendados.
 */
function avaliarPosVenda({ tenantId, state, dataReferencia = null }) {
  if (!tenantId || !state) return { agendados: [], pendentesHoje: [] };

  if (!state.afterSales) state.afterSales = [];
  const cfg = state.cfg?.posVenda || {
    enabled: true,
    contatos: [
      { diasAposEntrega: 2, tipo: 'verificacao_servico' },
      { diasAposEntrega: 15, tipo: 'acompanhamento' }
    ]
  };

  if (cfg.enabled === false) return { agendados: [], pendentesHoje: [] };

  const ordens = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const hoje = normalizarData(dataReferencia) || new Date().toISOString().slice(0, 10);

  const recemAgendados = [];
  const pendentesHoje = [];

  for (const o of ordens) {
    if (o.st !== 'finalizada') continue;
    const dataEntrega = normalizarData(o.fechamento || o.concluidaEm || o.abertura);
    if (!dataEntrega) continue;

    let registro = state.afterSales.find(a => a.osId === o.id && a.tenantId === tenantId);
    if (!registro) {
      registro = {
        id: gerarId('pvd'),
        tenantId,
        osId: o.id,
        customerId: o.cli || null,
        vehicleId: o.vei || null,
        dataEntrega,
        status: 'pendente',
        contatosAgendados: (cfg.contatos || []).map(c => {
          const dias = c.dias != null ? Number(c.dias) : Number(c.diasAposEntrega || 2);
          return {
            tipo: c.tipo || 'verificacao_servico',
            diasAposEntrega: dias,
            dias,
            dataAgendada: adicionarDias(dataEntrega, dias)
          };
        }),
        contatos: [],
        feedback: null,
        followUpIssue: null,
        createdAt: new Date().toISOString()
      };
      state.afterSales.push(registro);
      recemAgendados.push(registro);

      registrarAuditoria(state, {
        action: 'after_sales_scheduled',
        actorId: 'scheduler',
        resourceId: registro.id,
        tenantId,
        details: { osId: o.id, dataEntrega }
      });
    }

    // Verifica se algum contato configurado está pendente para hoje
    const diffDias = Math.round((new Date(hoje).getTime() - new Date(dataEntrega).getTime()) / (1000 * 60 * 60 * 24));
    for (const regra of (cfg.contatos || [])) {
      const jaFeito = registro.contatos.some(c => c.tipo === regra.tipo);
      if (!jaFeito && diffDias >= regra.diasAposEntrega) {
        pendentesHoje.push({
          afterSalesId: registro.id,
          osId: o.id,
          osNum: o.num,
          vehicleId: o.vei,
          customerId: o.cli,
          tipo: regra.tipo,
          diasAposEntrega: diffDias
        });
      }
    }
  }

  return { recemAgendados, pendentesHoje };
}

/**
 * Gera mensagem humanizada de follow-up respeitando o nome configurado do assistente.
 */
function gerarMensagemFollowUp({ tenantId, state, osId, customerName = null, vehiclePlate = null }) {
  const cfg = state.cfg || {};
  const assistantName = cfg.assistente?.displayName || cfg.assistant?.displayName || 'Verônica';
  const voiceGender = cfg.assistente?.voiceGender || cfg.assistant?.voiceGender || 'female';
  const artigo = voiceGender === 'male' ? 'o' : 'a';
  const companyName = cfg.empresa || 'Oficina Fort Diesel';

  const ordens = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const clientes = Array.isArray(state.clientes) ? state.clientes : [];

  const o = ordens.find(x => x.id === osId || x.num === parseInt(osId, 10));
  const veic = o ? veiculos.find(v => v.id === o.vei) : null;
  const cli = o ? clientes.find(c => c.id === o.cli) : null;

  const nomeContato = customerName || cli?.contato || cli?.nome || 'Cliente';
  const placa = vehiclePlate || veic?.placa || 'seu veículo';

  return `Olá, ${nomeContato}.\n\nAqui é ${artigo} ${assistantName}, da ${companyName}.\n\nPassando para saber se o caminhão ${placa} ficou tudo certo depois do serviço realizado conosco.\n\nSe precisar de alguma coisa, pode falar comigo por aqui.`;
}

/**
 * Processa a resposta do cliente ao pós-venda.
 * Se elogio/ok -> status 'pos_venda_ok'
 * Se reclamação -> NÃO abre OS definitiva automaticamente; cria followUpIssue, consulta histórico, avalia garantia e abre fluxo Pré-OS/Intake.
 */
function processarRespostaCliente({ tenantId, state, afterSalesId = null, osId = null, respostaTexto, canal = 'whatsapp', ator = 'cliente' }) {
  if (!tenantId || !state) throw new Error('tenantId e state são obrigatórios.');
  if (!respostaTexto || String(respostaTexto).trim().length === 0) {
    return { ok: false, error: 'Texto da resposta é obrigatório.' };
  }

  const list = state.afterSales || [];
  let registro = null;
  if (afterSalesId) registro = list.find(r => r.id === afterSalesId && r.tenantId === tenantId);
  else if (osId) registro = list.find(r => r.osId === osId && r.tenantId === tenantId);

  if (!registro) {
    // Se não encontrou registro prévio, cria um para acomodar o feedback
    registro = {
      id: gerarId('pvd'),
      tenantId,
      osId: osId || null,
      status: 'pendente',
      contatos: [],
      feedback: null,
      followUpIssue: null,
      createdAt: new Date().toISOString()
    };
    if (!state.afterSales) state.afterSales = [];
    state.afterSales.push(registro);
  }

  const texto = String(respostaTexto).toLowerCase().trim();
  const termosPositivos = ['otimo', 'ótimo', 'ficou otimo', 'ficou ótimo', 'tudo certo', '100%', 'perfeito', 'muito bom', 'excelente', 'joia', 'beleza', 'resolvido', 'ok', 'tudo bem'];
  const termosReclamacao = ['bater', 'voltou a bater', 'barulho', 'quebrou', 'ruim', 'nao ficou bom', 'não ficou bom', 'vazando', 'vazamento', 'continua', 'defeito', 'falha', 'problema', 'piorou', 'solto', 'folga', 'queimado', 'chiar'];

  const textoLimpo = texto
    .replace(/sem\s+(folga|barulho|vazamento|defeito|problema|falha)s?/gi, '')
    .replace(/zero\s+(folga|barulho|vazamento|defeito|problema|falha)s?/gi, '');

  const isReclamacao = termosReclamacao.some(t => textoLimpo.includes(t));
  const isPositivo = termosPositivos.some(t => texto.includes(t));

  const agora = new Date().toISOString();

  if (isReclamacao) {
    // Reclamação detectada: cria followUpIssue
    const followUp = {
      id: gerarId('iss'),
      data: agora,
      textoReclamacao: respostaTexto,
      canal,
      status: 'aberto'
    };
    registro.followUpIssue = followUp;
    registro.status = 'reclamacao_registrada';
    registro.feedback = { avaliacao: 'negativa', comentario: respostaTexto, timestamp: agora };

    // Consulta histórico operacional do veículo
    let veiculoId = registro.vehicleId;
    if (!veiculoId && registro.osId) {
      const o = (state.os || []).find(x => x.id === registro.osId);
      if (o) veiculoId = o.vei;
    }

    let veicObj = veiculoId ? (state.veiculos || []).find(v => v.id === veiculoId) : null;
    let historicoVeic = null;
    let possivelGarantia = false;
    let analiseRecorrencia = null;
    let laudoGarantia = null;

    if (veiculoId) {
      historicoVeic = vehicleHistoryService.obterHistoricoVeiculo({ tenantId, vehicleId: veiculoId, state });
      analiseRecorrencia = recurrenceDetector.detectarRecorrencia({
        reclamacao: respostaTexto,
        historicoVeiculo: historicoVeic,
        kmAtual: veicObj ? Number(veicObj.km) : 0
      });

      if (analiseRecorrencia?.teveRecorrencia || analiseRecorrencia?.ocorrenciasRelacionadas?.length > 0) {
        laudoGarantia = warrantyService.avaliarGarantia({
          ocorrencia: analiseRecorrencia.ocorrenciasRelacionadas?.[0] || analiseRecorrencia.maisRecente || analiseRecorrencia.ocorrencias?.[0],
          tenantCfg: state.cfg
        });
        if (laudoGarantia?.possivelGarantia) {
          possivelGarantia = true;
        }
      }
    }

    // Inicia fluxo de Pré-OS para acolher a queixa (NUNCA abre OS aprovada automaticamente)
    let preOSCriada = null;
    try {
      const triagem = preOSEngine.triagemEntrada({
        tenantId,
        vehicleId: veiculoId,
        placa: veicObj ? veicObj.placa : 'SEM-PLACA',
        clienteId: registro.customerId,
        kmAtual: veicObj ? Number(veicObj.km) : 0,
        reclamacao: `Pós-Venda Reclamação: ${respostaTexto}`,
        origem: 'pos_venda',
        actorId: ator,
        state
      });
      preOSCriada = triagem.preOS;
      if (possivelGarantia && preOSCriada) {
        preOSCriada.possivelGarantia = true;
      }
      if (preOSCriada?.possivelGarantia) {
        possivelGarantia = true;
      }
    } catch (e) {
      console.warn('[AfterSales] Falha ao gerar Pré-OS automática para pós-venda:', e.message);
    }

    registrarAuditoria(state, {
      action: 'customer_complaint_registered',
      actorId: ator,
      resourceId: registro.id,
      tenantId,
      details: {
        reclamacao: respostaTexto,
        possivelGarantia,
        preOSId: preOSCriada?.id
      }
    });

    return {
      ok: true,
      tipoResultado: 'reclamacao_tecnica',
      posVendaStatus: 'reclamacao_registrada',
      followUpIssue: followUp,
      possivelGarantia,
      analiseRecorrencia,
      preOS: preOSCriada,
      respostaSugerida: 'Lamento pelo ocorrido. Nossa equipe técnica já foi notificada e vamos verificar o veículo imediatamente para você.'
    };
  } else {
    // Feedback positivo ou neutro
    registro.status = 'pos_venda_ok';
    registro.feedback = {
      avaliacao: isPositivo ? 'positiva' : 'neutra',
      comentario: respostaTexto,
      timestamp: agora
    };

    registrarAuditoria(state, {
      action: 'after_sales_completed',
      actorId: ator,
      resourceId: registro.id,
      tenantId,
      details: { resposta: respostaTexto, status: 'pos_venda_ok' }
    });

    return {
      ok: true,
      tipoResultado: 'pos_venda_ok',
      posVendaStatus: 'pos_venda_ok',
      feedback: registro.feedback,
      respostaSugerida: 'Que excelente notícia! Agradecemos a confiança e estamos sempre à disposição.'
    };
  }
}

module.exports = {
  avaliarPosVenda,
  gerarMensagemFollowUp,
  processarRespostaCliente,
  processarRespostaPosVenda: processarRespostaCliente
};
