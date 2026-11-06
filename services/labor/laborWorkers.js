'use strict';

const crypto = require('crypto');

function gerarId(prefix = 'lab') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(val, decimais = 2) {
  const n = Number(val) || 0;
  return Number(Math.round(n + 'e' + decimais) + 'e-' + decimais);
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

function garantirColecoesLabor(state) {
  state.workers = Array.isArray(state.workers) ? state.workers : [];
  state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.cfg = state.cfg || {};
  if (!state.cfg.equipe) {
    state.cfg.equipe = { jornadaPadraoHoras: 8 };
  }
}

/**
 * ─────────────────────────────────────────────────────────────────
 * 1. GESTÃO DE COLABORADORES / MECÂNICOS
 * ─────────────────────────────────────────────────────────────────
 */

function cadastrarColaborador({ tenantId, state, workerData = {}, actorId = 'sistema' }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para cadastrar colaborador.');
  }
  if (!state) throw new Error('Estado do tenant é obrigatório.');

  garantirColecoesLabor(state);

  const nome = String(workerData.nome || '').trim();
  if (!nome) {
    throw new Error('Nome do colaborador é obrigatório.');
  }

  const jornadaPadrao = Number(state.cfg?.equipe?.jornadaPadraoHoras) || 8;
  const jornada = Number(workerData.jornadaHorasDia) > 0 ? Number(workerData.jornadaHorasDia) : jornadaPadrao;
  const custoHora = Math.max(0, Number(workerData.custoHora) || 0);

  const worker = {
    id: workerData.id || gerarId('wrk'),
    tenantId,
    userId: workerData.userId || null,
    nome,
    funcao: String(workerData.funcao || 'Mecânico').trim(),
    custoHora: arredondar(custoHora),
    jornadaHorasDia: jornada,
    ativo: workerData.ativo !== false,
    disponivelHoje: workerData.disponivelHoje !== false,
    motivoIndisponibilidade: workerData.motivoIndisponibilidade || null,
    especialidades: Array.isArray(workerData.especialidades) ? workerData.especialidades : (workerData.especialidade ? [workerData.especialidade] : ['Geral']),
    fone: workerData.fone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.workers.push(worker);

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'cadastrar_colaborador',
    resumo: `Colaborador "${worker.nome}" (${worker.funcao}) cadastrado na equipe.`,
    workerId: worker.id
  });

  return { ok: true, worker };
}

function listarColaboradores({ tenantId, state, incluirInativos = false, userPermissions = [] }) {
  if (!state) return [];
  garantirColecoesLabor(state);

  const podeVerCusto = userPermissions.includes('*') ||
    userPermissions.includes('costing:read') ||
    userPermissions.includes('productivity:manage');

  return state.workers
    .filter(w => w.tenantId === tenantId && (incluirInativos || w.ativo !== false))
    .map(w => {
      const clone = { ...w };
      if (!podeVerCusto) {
        delete clone.custoHora;
      }
      return clone;
    });
}

function obterColaborador({ tenantId, state, workerId, userPermissions = [] }) {
  if (!state) return null;
  garantirColecoesLabor(state);

  const w = state.workers.find(it => it.id === workerId && it.tenantId === tenantId);
  if (!w) return null;

  const podeVerCusto = userPermissions.includes('*') ||
    userPermissions.includes('costing:read') ||
    userPermissions.includes('productivity:manage');

  const clone = { ...w };
  if (!podeVerCusto) {
    delete clone.custoHora;
  }
  return clone;
}

function atualizarColaborador({ tenantId, state, workerId, workerData = {}, actorId = 'sistema' }) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  garantirColecoesLabor(state);

  const worker = state.workers.find(w => w.id === workerId && w.tenantId === tenantId);
  if (!worker) {
    throw new Error(`Colaborador "${workerId}" não encontrado.`);
  }

  if (workerData.nome) worker.nome = String(workerData.nome).trim();
  if (workerData.funcao) worker.funcao = String(workerData.funcao).trim();
  if (workerData.custoHora !== undefined) worker.custoHora = arredondar(Math.max(0, Number(workerData.custoHora) || 0));
  if (workerData.jornadaHorasDia !== undefined) worker.jornadaHorasDia = Number(workerData.jornadaHorasDia) || 8;
  if (workerData.ativo !== undefined) worker.ativo = Boolean(workerData.ativo);
  if (workerData.disponivelHoje !== undefined) worker.disponivelHoje = Boolean(workerData.disponivelHoje);
  if (workerData.motivoIndisponibilidade !== undefined) worker.motivoIndisponibilidade = workerData.motivoIndisponibilidade;
  if (Array.isArray(workerData.especialidades)) worker.especialidades = workerData.especialidades;
  if (workerData.fone !== undefined) worker.fone = workerData.fone;

  worker.updatedAt = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    actorId,
    usuario: actorId,
    intencao: 'atualizar_colaborador',
    resumo: `Cadastro do colaborador "${worker.nome}" atualizado.`,
    workerId: worker.id
  });

  return { ok: true, worker };
}

module.exports = {
  gerarId,
  arredondar,
  registrarAuditoria,
  garantirColecoesLabor,
  cadastrarColaborador,
  listarColaboradores,
  obterColaborador,
  atualizarColaborador
};

