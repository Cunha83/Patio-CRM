'use strict';

const crypto = require('crypto');

function gerarId(prefix = 'insp') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
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
 * Cria uma nova inspeção técnica vinculada a OS ou Pré-OS
 */
function criarInspecao({
  tenantId,
  state,
  preOSId = null,
  osId = null,
  vehicleId = null,
  placa = null,
  clienteId = null,
  mechanicId = null,
  mecanico = null,
  reclamacaoCliente = '',
  actorId = 'operador'
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para criar inspeção.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  state.inspections = Array.isArray(state.inspections) ? state.inspections : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  let osVinculada = null;
  if (osId) {
    osVinculada = state.os.find(o => o.id === osId);
  }

  // Preenche dados a partir da OS vinculada se não foram passados explicitamente
  let vId = vehicleId || (osVinculada ? osVinculada.vei : null);
  let vPlaca = placa || (osVinculada ? osVinculada.placa : null);
  let cId = clienteId || (osVinculada ? osVinculada.cli : null);

  if (!vPlaca && vId) {
    const v = state.veiculos.find(ve => ve.id === vId);
    if (v) vPlaca = v.placa;
  }

  const novaInspecao = {
    id: gerarId('insp'),
    tenantId,
    preOSId: preOSId || null,
    osId: osId || null,
    vehicleId: vId || null,
    placa: vPlaca ? String(vPlaca).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
    clienteId: cId || null,
    mechanicId: mechanicId || null,
    mecanico: mecanico || null,
    reclamacaoCliente: reclamacaoCliente || (osVinculada ? (osVinculada.motivo || osVinculada.desc || '') : ''),
    status: 'em_inspecao',
    items: [],
    laudoGeral: '',
    criadoEm: new Date().toISOString(),
    criadoPor: actorId,
    atualizadoEm: new Date().toISOString(),
    concluidoEm: null,
    concluidoPor: null
  };

  state.inspections.unshift(novaInspecao);

  if (osVinculada) {
    osVinculada.inspectionId = novaInspecao.id;
    if (osVinculada.st === 'fila') {
      osVinculada.st = 'diagnostico';
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: 'inspecao_criada',
    inspectionId: novaInspecao.id,
    osId: novaInspecao.osId,
    placa: novaInspecao.placa,
    autor: actorId,
    detalhes: { reclamacaoCliente: novaInspecao.reclamacaoCliente }
  });

  return { ok: true, inspection: novaInspecao };
}

/**
 * Obtém uma inspeção técnica pelo ID com isolamento de tenant
 */
function obterInspecao({ tenantId, state, inspectionId }) {
  if (!tenantId || !state || !inspectionId) return null;
  const inspections = Array.isArray(state.inspections) ? state.inspections : [];
  const inspecao = inspections.find(i => i.id === inspectionId && i.tenantId === tenantId);
  return inspecao || null;
}

/**
 * Lista inspeções técnicas com filtros
 */
function listarInspecoes({ tenantId, state, osId = null, vehicleId = null, placa = null, status = null }) {
  if (!tenantId || !state) return [];
  const inspections = Array.isArray(state.inspections) ? state.inspections : [];
  return inspections.filter(i => {
    if (i.tenantId !== tenantId) return false;
    if (osId && i.osId !== osId) return false;
    if (vehicleId && i.vehicleId !== vehicleId) return false;
    if (status && i.status !== status) return false;
    if (placa) {
      const pNorm = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const iPlaca = String(i.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (iPlaca !== pNorm) return false;
    }
    return true;
  });
}

/**
 * Adiciona um item avaliado na inspeção técnica
 */
function adicionarItemInspecao({ tenantId, state, inspectionId, item, actorId = 'operador' }) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada ou não pertence ao tenant.', status: 404 };
  }
  if (inspecao.status === 'cancelada') {
    return { ok: false, error: 'Não é possível adicionar itens a uma inspeção cancelada.', status: 400 };
  }

  if (!item || !item.componente) {
    return { ok: false, error: 'Componente avaliado é obrigatório.', status: 400 };
  }

  const novoItem = {
    id: gerarId('item'),
    categoria: item.categoria || 'geral',
    componente: String(item.componente).trim(),
    descricao: String(item.descricao || '').trim(),
    condicao: item.condicao || 'desgaste', // ok | desgaste | danificado | critico | nao_conforme
    severidade: item.severidade || 'atencao', // informativo | atencao | importante | critico
    observacoes: String(item.observacoes || '').trim(),
    fotos: [],
    diagnostico: {
      confirmado: false,
      laudo: '',
      confirmadoPor: null,
      confirmadoEm: null
    },
    servicosRecomendados: [],
    status: 'pendente',
    criadoEm: new Date().toISOString(),
    criadoPor: actorId
  };

  inspecao.items.push(novoItem);
  inspecao.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'item_inspecao_adicionado',
    inspectionId: inspecao.id,
    itemId: novoItem.id,
    componente: novoItem.componente,
    severidade: novoItem.severidade,
    autor: actorId
  });

  return { ok: true, item: novoItem };
}

/**
 * Confirmação técnica humana obrigatória do diagnóstico.
 * NUNCA permite confirmação automática autônoma por IA.
 */
function confirmarDiagnosticoHumano({
  tenantId,
  state,
  inspectionId,
  itemId,
  diagnosticoConfirmado,
  confirmedBy,
  actorId = 'mecanico'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada ou não pertence ao tenant.', status: 404 };
  }

  const item = inspecao.items.find(i => i.id === itemId);
  if (!item) {
    return { ok: false, error: 'Item de inspeção não encontrado.', status: 404 };
  }

  // ── VALIDAÇÃO DE AUTONOMIA HUMANA ──
  const resp = String(confirmedBy || '').trim();
  if (!resp) {
    return {
      ok: false,
      error: 'Diagnóstico técnico requer confirmação explícita por um profissional humano autorizado (mecânico/técnico).',
      status: 422
    };
  }

  const respLower = resp.toLowerCase();
  const agentesNaoHumanos = ['ia', 'ai', 'sistema', 'robo', 'bot', 'gemini', 'automático', 'autonomo', 'veronica_auto'];
  if (agentesNaoHumanos.includes(respLower)) {
    return {
      ok: false,
      error: 'Diagnósticos físicos não podem ser validados de forma autônoma por IA ou sistema. Exige inspeção e confirmação humana presencial.',
      status: 422
    };
  }

  const laudo = String(diagnosticoConfirmado || '').trim();
  if (!laudo) {
    return { ok: false, error: 'Laudo descritivo do diagnóstico confirmado é obrigatório.', status: 422 };
  }

  item.diagnostico = {
    confirmado: true,
    laudo,
    confirmadoPor: resp,
    confirmadoEm: new Date().toISOString()
  };
  item.status = 'diagnosticado';
  inspecao.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'diagnostico_humano_confirmado',
    inspectionId: inspecao.id,
    itemId: item.id,
    componente: item.componente,
    confirmadoPor: resp,
    laudo,
    autor: actorId
  });

  return { ok: true, item };
}

/**
 * Anexa foto a um item inspecionado
 */
function adicionarFotoItem({
  tenantId,
  state,
  inspectionId,
  itemId,
  fotoBase64 = null,
  url = null,
  descricao = '',
  actorId = 'operador'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada.', status: 404 };
  }

  const item = inspecao.items.find(i => i.id === itemId);
  if (!item) {
    return { ok: false, error: 'Item de inspeção não encontrado.', status: 404 };
  }

  if (!fotoBase64 && !url) {
    return { ok: false, error: 'É necessário fornecer a foto em Base64 ou URL.', status: 400 };
  }

  const foto = {
    id: gerarId('foto'),
    fotoBase64: fotoBase64 || null,
    url: url || null,
    descricao: String(descricao || '').trim(),
    enviadoEm: new Date().toISOString(),
    enviadoPor: actorId
  };

  item.fotos.push(foto);
  inspecao.atualizadoEm = new Date().toISOString();

  return { ok: true, foto };
}

/**
 * Adiciona um serviço ou peça recomendada para solucionar a anomalia do item
 */
function adicionarServicoRecomendado({
  tenantId,
  state,
  inspectionId,
  itemId,
  servico,
  actorId = 'operador'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada.', status: 404 };
  }

  const item = inspecao.items.find(i => i.id === itemId);
  if (!item) {
    return { ok: false, error: 'Item de inspeção não encontrado.', status: 404 };
  }

  if (!servico || !servico.nome) {
    return { ok: false, error: 'Nome do serviço ou peça recomendada é obrigatório.', status: 400 };
  }

  const novoServico = {
    id: gerarId('rec'),
    tipo: servico.tipo === 'peca' ? 'peca' : 'servico',
    nome: String(servico.nome).trim(),
    descricao: String(servico.descricao || '').trim(),
    quantidade: Math.max(1, Number(servico.quantidade) || 1),
    valorEstimado: Math.max(0, Number(servico.valorEstimado) || Number(servico.preco) || 0),
    prioridade: servico.prioridade || 'obrigatorio', // obrigatorio | recomendado | preventivo
    status: 'recomendado',
    criadoEm: new Date().toISOString()
  };

  item.servicosRecomendados.push(novoServico);
  item.status = 'recomendado';
  inspecao.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'servico_recomendado_adicionado',
    inspectionId: inspecao.id,
    itemId: item.id,
    servico: novoServico.nome,
    tipoItem: novoServico.tipo,
    valorEstimado: novoServico.valorEstimado,
    autor: actorId
  });

  return { ok: true, servico: novoServico };
}

/**
 * Conclui formalmente a inspeção técnica
 */
function concluirInspecao({
  tenantId,
  state,
  inspectionId,
  laudoGeral = '',
  actorId = 'operador'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada.', status: 404 };
  }

  inspecao.status = 'concluida';
  inspecao.laudoGeral = String(laudoGeral || inspecao.laudoGeral || '').trim();
  inspecao.concluidoEm = new Date().toISOString();
  inspecao.concluidoPor = actorId;
  inspecao.atualizadoEm = new Date().toISOString();

  // Se a OS estiver vinculada, marca que a inspeção foi concluída
  if (inspecao.osId) {
    const os = state.os.find(o => o.id === inspecao.osId);
    if (os && (os.st === 'diagnostico' || os.st === 'fila')) {
      os.st = 'aprovacao'; // Pronta para orçar e aprovar
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: 'inspecao_concluida',
    inspectionId: inspecao.id,
    osId: inspecao.osId,
    totalItens: inspecao.items.length,
    autor: actorId
  });

  return { ok: true, inspection: inspecao };
}

/**
 * Cancela uma inspeção técnica
 */
function cancelarInspecao({
  tenantId,
  state,
  inspectionId,
  motivo = '',
  actorId = 'operador'
}) {
  const inspecao = obterInspecao({ tenantId, state, inspectionId });
  if (!inspecao) {
    return { ok: false, error: 'Inspeção não encontrada.', status: 404 };
  }

  inspecao.status = 'cancelada';
  inspecao.motivoCancelamento = String(motivo || 'Cancelada pelo operador').trim();
  inspecao.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'inspecao_cancelada',
    inspectionId: inspecao.id,
    motivo: inspecao.motivoCancelamento,
    autor: actorId
  });

  return { ok: true, inspection: inspecao };
}

/**
 * Assistente de estruturação por fala/voz para o mecânico.
 * Extrai anomalias citadas explicitamente sem alucinar peças ou serviços inexistentes.
 */
function estruturarInspecaoPorVoz({ texto, state, tenantId }) {
  if (!texto || typeof texto !== 'string') {
    return { sugestoes: [], laudoSugerido: '', confianca: 'baixa' };
  }

  const t = texto.toLowerCase();
  const sugestoes = [];

  // Mapeamento determinístico de sistemas da linha pesada
  const padroes = [
    { cat: 'direcao', comp: 'Terminal de Direção', re: /\b(terminal|barra de dire[cç][aã]o|folga na dire[cç][aã]o)\b/ },
    { cat: 'freio', comp: 'Tambor de Freio', re: /\b(tambor|panela de freio|lona de freio|pastilha de freio|freio)\b/ },
    { cat: 'suspensao', comp: 'Feixe de Molas', re: /\b(feixe de molas|mola mestre|arqueamento|piv[oô]|amortecedor)\b/ },
    { cat: 'suspensao', comp: 'Bucha de Tirante', re: /\b(bucha|tirante|barra tensora|estabilizador)\b/ },
    { cat: 'motor', comp: 'Vazamento de Óleo', re: /\b(vazamento|vazando [oó]leo|junta do carter|retentor)\b/ },
    { cat: 'ar', comp: 'Sistema Pneumático / Válvula', re: /\b(vazamento de ar|valvula pedal|cu[ií]ca de freio|secador de ar)\b/ },
    { cat: 'transmissao', comp: 'Embreagem / Cardan', re: /\b(embreagem patinando|cruzeta|cardan|diferencial)\b/ }
  ];

  for (const p of padroes) {
    if (p.re.test(t)) {
      let condicao = 'desgaste';
      let severidade = 'atencao';
      if (/quebrad[ao]|trincad[ao]|estourad[ao]|vazamento grave|critico/i.test(t)) {
        condicao = 'danificado';
        severidade = 'critico';
      } else if (/folga excessiva|muito gasta|risco/i.test(t)) {
        condicao = 'desgaste';
        severidade = 'importante';
      }

      sugestoes.push({
        categoria: p.cat,
        componente: p.comp,
        condicao,
        severidade,
        sugestao: true,
        requerValidacaoHumana: true,
        observacao: `Detectado a partir da fala: "${texto.slice(0, 100)}..."`
      });
    }
  }

  return {
    sugestoes,
    laudoSugerido: sugestoes.length > 0 ? `Constatadas anomalias em: ${sugestoes.map(s => s.componente).join(', ')}.` : '',
    confianca: sugestoes.length > 0 ? 'alta' : 'baixa'
  };
}

module.exports = {
  criarInspecao,
  obterInspecao,
  listarInspecoes,
  adicionarItemInspecao,
  confirmarDiagnosticoHumano,
  adicionarFotoItem,
  adicionarServicoRecomendado,
  concluirInspecao,
  cancelarInspecao,
  estruturarInspecaoPorVoz
};
