'use strict';

const { gerarId, registrarAuditoria, obterInspecao } = require('./inspectionCrud');

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
    condicao: item.condicao || 'desgaste',
    severidade: item.severidade || 'atencao',
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
    return { ok: false, error: 'Nome do serviço recomendado é obrigatório.', status: 400 };
  }

  const novoServico = {
    id: gerarId('rec'),
    serviceCatalogId: servico.serviceCatalogId || null,
    nome: String(servico.nome).trim(),
    tipo: servico.tipo || 'servico',
    quantidade: Number(servico.quantidade) || 1,
    valorEstimado: Number(servico.valorEstimado || servico.valor || 0),
    observacoes: String(servico.observacoes || '').trim(),
    criadoEm: new Date().toISOString(),
    criadoPor: actorId
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

function estruturarInspecaoPorVoz({ texto, tenantId, state }) {
  if (!texto || typeof texto !== 'string') {
    return { sugestoes: [], confianca: 'baixa', laudoSugerido: '' };
  }

  const t = texto.toLowerCase();
  const sugestoes = [];

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
  adicionarItemInspecao,
  confirmarDiagnosticoHumano,
  adicionarFotoItem,
  adicionarServicoRecomendado,
  estruturarInspecaoPorVoz
};

