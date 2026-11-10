'use strict';

/**
 * services/billing/fleetDelinquencyGuardService.js
 *
 * Motor de Governança de Risco, Política de Crédito e Trava de Inadimplência Frotista.
 * Avalia borderôs vencidos, tolerância de atraso e limite de crédito global.
 * Permite override gerencial auditado com histórico append-only em creditOverrideLogs.
 *
 * Teto de Linhas: <= 350 linhas
 */

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function toDateYmd(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function calcularDiasAtraso(dataVenc, dataRef) {
  const ymdVenc = toDateYmd(dataVenc);
  const ymdRef = toDateYmd(dataRef);
  if (!ymdVenc || !ymdRef) return 0;
  if (ymdRef <= ymdVenc) return 0;

  const [y1, m1, d1] = ymdVenc.split('-').map(Number);
  const [y2, m2, d2] = ymdRef.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((t2 - t1) / (24 * 3600 * 1000)));
}

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getNowIso() {
  return new Date().toISOString();
}

/**
 * Configura ou atualiza a política de crédito de uma transportadora/frotista.
 */
function configurarPoliticaCreditoFrotista(state, clienteId, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  if (!clienteId) throw new Error('clienteId é obrigatório');

  state.creditPolicies = state.creditPolicies || {};
  state.security_audit_log = state.security_audit_log || [];

  const policy = {
    clienteId,
    limiteCredito: round2(payload.limiteCredito || 0),
    diasToleranciaAtraso: Number(payload.diasToleranciaAtraso ?? 5),
    bloqueioAutomatico: payload.bloqueioAutomatico !== false,
    atualizadoEm: getNowIso(),
    atualizadoPor: payload.usuario || 'sistema'
  };

  state.creditPolicies[clienteId] = policy;

  if (Array.isArray(state.clientes)) {
    const cli = state.clientes.find(c => c.id === clienteId);
    if (cli) cli.politicaCredito = { ...policy };
  }

  state.security_audit_log.push({
    action: 'CREDIT_POLICY_CONFIGURED',
    clienteId,
    policy: { ...policy },
    timestamp: getNowIso()
  });

  return policy;
}

/**
 * Obtém a política de crédito configurada ou padrão.
 */
function obterPoliticaCreditoFrotista(state, clienteId) {
  if (state?.creditPolicies?.[clienteId]) {
    return state.creditPolicies[clienteId];
  }
  if (Array.isArray(state?.clientes)) {
    const cli = state.clientes.find(c => c.id === clienteId);
    if (cli?.politicaCredito) return cli.politicaCredito;
  }
  return {
    clienteId,
    limiteCredito: 0,
    diasToleranciaAtraso: 5,
    bloqueioAutomatico: true
  };
}

/**
 * Avalia o risco de inadimplência e exposição financeira do frotista.
 */
function avaliarRiscoInadimplenciaFrotista(state, clienteId, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  if (!clienteId) throw new Error('clienteId é obrigatório');

  const policy = obterPoliticaCreditoFrotista(state, clienteId);
  const dataReferencia = options.dataReferencia ? new Date(options.dataReferencia) : new Date();

  const borderosLista = [
    ...(Array.isArray(state.borderosFrotistas) ? state.borderosFrotistas : []),
    ...(Array.isArray(state.borderos) ? state.borderos : [])
  ];
  const vistos = new Set();
  const borderosUnicos = [];
  for (const b of borderosLista) {
    if (b && b.id && !vistos.has(b.id)) {
      vistos.add(b.id);
      borderosUnicos.push(b);
    }
  }

  const borderosDoCliente = borderosUnicos.filter(b => b.clienteId === clienteId && b.status !== 'cancelado');

  const borderosAbertos = borderosDoCliente.filter(b => {
    if (b.status === 'liquidado') return false;
    const saldo = b.saldoDevedor !== undefined
      ? Number(b.saldoDevedor)
      : (Number(b.totais?.totalLiquido || b.valorTotal || 0) - Number(b.valorPagoAcumulado || 0));
    return saldo > 0.01;
  });

  let saldoDevedorTotal = 0;
  const borderosEmAtraso = [];

  for (const b of borderosAbertos) {
    const saldo = b.saldoDevedor !== undefined
      ? Number(b.saldoDevedor)
      : round2(Number(b.totais?.totalLiquido || b.valorTotal || 0) - Number(b.valorPagoAcumulado || 0));
    saldoDevedorTotal = round2(saldoDevedorTotal + saldo);

    const diasAtraso = calcularDiasAtraso(b.dataVencimento, dataReferencia);
    if (diasAtraso > 0) {
      borderosEmAtraso.push({
        borderoId: b.id,
        num: b.num,
        dataVencimento: b.dataVencimento,
        saldoDevedor: saldo,
        diasAtraso
      });
    }
  }

  const diasMaiorAtraso = borderosEmAtraso.reduce((max, b) => Math.max(max, b.diasAtraso), 0);

  let statusRisco = 'regular';
  let motivoBloqueio = '';
  const limiteDisponivel = policy.limiteCredito > 0
    ? round2(policy.limiteCredito - saldoDevedorTotal)
    : 0;

  if (policy.bloqueioAutomatico) {
    if (diasMaiorAtraso > policy.diasToleranciaAtraso) {
      statusRisco = 'bloqueado_inadimplencia';
      motivoBloqueio = `Borderô em atraso há ${diasMaiorAtraso} dias (tolerância: ${policy.diasToleranciaAtraso} dias)`;
    } else if (policy.limiteCredito > 0 && saldoDevedorTotal >= policy.limiteCredito) {
      statusRisco = 'bloqueado_limite_credito';
      motivoBloqueio = `Limite de crédito atingido: R$ ${saldoDevedorTotal.toFixed(2)} de R$ ${policy.limiteCredito.toFixed(2)}`;
    } else if (diasMaiorAtraso > 0 && diasMaiorAtraso <= policy.diasToleranciaAtraso) {
      statusRisco = 'atencao_atraso_tolerancia';
    }
  }

  const aprovadoParaNovosServicos = (statusRisco === 'regular' || statusRisco === 'atencao_atraso_tolerancia');

  return {
    clienteId,
    statusRisco,
    aprovadoParaNovosServicos,
    motivoBloqueio,
    limiteCredito: policy.limiteCredito,
    saldoDevedorTotal,
    limiteDisponivel,
    diasMaiorAtraso,
    diasToleranciaAtraso: policy.diasToleranciaAtraso,
    totalBorderosAbertos: borderosAbertos.length,
    borderosEmAtraso,
    avaliadoEm: getNowIso()
  };
}

/**
 * Valida se o frotista pode receber nova OS ou se necessita de override gerencial.
 */
function validarTravaInadimplenciaFrotista(state, clienteId, payload = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  if (!clienteId) throw new Error('clienteId é obrigatório');

  const valorNovoServico = round2(payload.valorNovoServico || 0);
  const avaliacao = avaliarRiscoInadimplenciaFrotista(state, clienteId, payload);

  const estouraLimite = avaliacao.limiteCredito > 0 &&
    (round2(avaliacao.saldoDevedorTotal + valorNovoServico) > avaliacao.limiteCredito);

  const bloqueado = !avaliacao.aprovadoParaNovosServicos || estouraLimite;

  if (bloqueado) {
    if (payload.permitirOverride && payload.motivoLiberacao && payload.usuarioLiberacao) {
      state.creditOverrideLogs = state.creditOverrideLogs || [];
      const overrideLog = {
        id: `OVR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        clienteId,
        valorServico: valorNovoServico,
        motivoLiberacao: payload.motivoLiberacao,
        usuarioLiberacao: payload.usuarioLiberacao,
        data: getNowIso(),
        statusRiscoAnterior: avaliacao.statusRisco,
        saldoDevedorTotal: avaliacao.saldoDevedorTotal,
        limiteCredito: avaliacao.limiteCredito
      };
      state.creditOverrideLogs.push(overrideLog);

      state.security_audit_log = state.security_audit_log || [];
      state.security_audit_log.push({
        action: 'CREDIT_LIMIT_OVERRIDE_GRANTED',
        clienteId,
        overrideLog,
        timestamp: getNowIso()
      });

      return {
        liberado: true,
        override: true,
        log: overrideLog,
        avaliacao
      };
    }

    const motivo = avaliacao.motivoBloqueio || (estouraLimite
      ? `Novo serviço de R$ ${valorNovoServico.toFixed(2)} excede o limite disponível de R$ ${avaliacao.limiteDisponivel.toFixed(2)}`
      : 'Restrição de crédito ativa');

    const err = new Error(`Cliente frotista com restrição de crédito: ${motivo}`);
    err.code = 'FLEET_DELINQUENCY_CREDIT_BLOCKED';
    err.status = 403;
    err.avaliacao = avaliacao;
    throw err;
  }

  return {
    liberado: true,
    override: false,
    avaliacao
  };
}

module.exports = {
  configurarPoliticaCreditoFrotista,
  obterPoliticaCreditoFrotista,
  avaliarRiscoInadimplenciaFrotista,
  validarTravaInadimplenciaFrotista
};
