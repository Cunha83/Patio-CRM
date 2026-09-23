'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE ASSINATURAS, PLANOS SaaS E FEATURE FLAGS
 * Gerencia a matriz de recursos por plano, o ciclo de vida de trial,
 * status canônicos de billing e garante a preservação total de dados em downgrade.
 */

const { BILLING_CONFIG } = require('./billing/billingConfig');
const { getSubscription: getBillingSubscription } = require('./billing/billingService');

const PLANOS_FEATURES = {
  essencial: [
    'os',
    'clientes',
    'veiculos',
    'patio',
    'boxes',
    'orcamento',
    'aprovacao_digital',
    'financeiro_basico',
    'estoque_basico',
    'compras_basicas',
    'equipe',
    'apontamento',
    'whatsapp',
    'whatsapp_operacional',
    'agendamentos',
    'relatorios_padrao',
    'dashboard_operacional',
    'crm_basico'
  ],
  pro: [
    'os',
    'clientes',
    'veiculos',
    'patio',
    'boxes',
    'orcamento',
    'aprovacao_digital',
    'financeiro_basico',
    'estoque_basico',
    'compras_basicas',
    'equipe',
    'apontamento',
    'whatsapp',
    'whatsapp_operacional',
    'agendamentos',
    'relatorios_padrao',
    'dashboard_operacional',
    'crm_basico',
    // Diferenciais Pro
    'precificacao_assistida',
    'protecao_margem',
    'rentabilidade_avancada',
    'dashboard_executivo_avancado',
    'frotas_avancadas',
    'manutencao_preventiva_frota',
    'pos_venda_proativo',
    'pos_venda_automatico',
    'inteligencia_operacional_proativa',
    'voz_inteligente',
    'relatorios_avancados',
    'insights',
    'identidade_visual_personalizada'
  ]
};

const TRIAL_DIAS_PADRAO = 14;

function obterAssinatura(tenantId, state) {
  if (!tenantId) throw new Error('tenantId é obrigatório para consultar assinatura.');

  if (state && state.subscription) {
    const sub = state.subscription;
    const agora = Date.now();
    const trialFim = sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : 0;
    const isTrial = sub.status === 'trial' || sub.status === 'trialing';
    const isTrialExpirado = isTrial && agora > trialFim;

    const statusEfetivo = isTrialExpirado ? 'expired' : sub.status;
    const featuresEfetivas = (statusEfetivo === 'expired' || statusEfetivo === 'suspended')
      ? ['os', 'clientes', 'veiculos', 'export', 'billing', 'support']
      : (sub.features && sub.features.length > 0 ? sub.features : (PLANOS_FEATURES[sub.plan] || PLANOS_FEATURES.pro));

    return {
      ...sub,
      status: statusEfetivo,
      diasRestantesTrial: isTrial ? Math.max(0, Math.ceil((trialFim - agora) / (1000 * 60 * 60 * 24))) : 0,
      features: featuresEfetivas
    };
  }

  // Se não existir assinatura cadastrada, inicializa automaticamente com Trial Pro de 14 dias
  const agoraDate = new Date();
  const trialEndsDate = new Date(agoraDate.getTime() + TRIAL_DIAS_PADRAO * 24 * 60 * 60 * 1000);

  const novaSub = {
    tenantId,
    plan: 'trial',
    status: 'trial',
    startedAt: agoraDate.toISOString(),
    trialEndsAt: trialEndsDate.toISOString(),
    billingCycle: 'mensal',
    features: [...PLANOS_FEATURES.pro]
  };

  if (state) {
    state.subscription = novaSub;
  }

  return {
    ...novaSub,
    diasRestantesTrial: TRIAL_DIAS_PADRAO
  };
}

/**
 * Verifica se um recurso está habilitado para o tenant.
 * Respeita tanto a matriz de planos quanto o status canônico da assinatura.
 */
function hasFeature(tenantId, featureName, state = null) {
  if (!tenantId || !featureName) return false;
  try {
    const sub = obterAssinatura(tenantId, state);
    if (sub.status === 'expired' || sub.status === 'suspended' || sub.status === 'cancelled' || sub.status === 'canceled') {
      // Bloqueia novas operações e automações; permite consulta essencial e exportação
      return ['os', 'clientes', 'veiculos', 'export', 'billing', 'support'].includes(featureName);
    }
    return Array.isArray(sub.features) && sub.features.includes(featureName);
  } catch (_) {
    return true; // Fallback permissivo seguro para resiliência operacional
  }
}

/**
 * Atualiza o plano de assinatura do tenant de forma idempotente.
 * POLÍTICA DE NÃO-EXCLUSÃO: Em downgrades, nenhum dado existente é apagado.
 */
function atualizarPlano({ tenantId, state, novoPlano, billingCycle = 'mensal', ator = 'administrador' }) {
  if (!['trial', 'essencial', 'pro'].includes(novoPlano)) {
    throw new Error(`Plano inválido: "${novoPlano}". Opções permitidas: trial, essencial, pro.`);
  }

  const subAtual = obterAssinatura(tenantId, state);
  const agora = new Date().toISOString();

  const features = novoPlano === 'trial' ? [...PLANOS_FEATURES.pro] : [...PLANOS_FEATURES[novoPlano]];

  state.subscription = {
    ...subAtual,
    plan: novoPlano,
    status: novoPlano === 'trial' ? 'trial' : 'active',
    billingCycle,
    features,
    updatedAt: agora,
    updatedBy: ator
  };

  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: `aud_sub_${Date.now()}`,
    timestamp: agora,
    action: 'subscription_plan_updated',
    actorId: ator,
    tenantId,
    details: {
      planoAnterior: subAtual.plan,
      novoPlano,
      billingCycle
    }
  });

  return {
    ok: true,
    subscription: state.subscription
  };
}

/**
 * Avalia e agenda avisos de término de trial (D-7, D-3, D-1, D0) usando o outbox/scheduler existente.
 */
async function verificarAvisosTrial({ tenantId, state, agendarJobFn = null }) {
  const sub = obterAssinatura(tenantId, state);
  const isTrial = sub.status === 'trial' || sub.status === 'trialing';
  if (!isTrial) return { ok: true, noticeSent: false, reason: 'not_in_trial' };

  const dias = sub.diasRestantesTrial;
  const avisosPermitidos = [7, 3, 1, 0];
  if (!avisosPermitidos.includes(dias)) {
    return { ok: true, noticeSent: false, diasRestantes: dias };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const tipo = `trial_notice_d${dias}`;
  const destino = state.cfg?.fone || 'admin_whatsapp';

  let jobResult = null;
  if (typeof agendarJobFn === 'function') {
    jobResult = await agendarJobFn({
      tenantId,
      dataRef: hoje,
      tipo,
      destino
    });
  }

  return {
    ok: true,
    noticeSent: true,
    diasRestantes: dias,
    tipo,
    job: jobResult
  };
}

module.exports = {
  PLANOS_FEATURES,
  TRIAL_DIAS_PADRAO,
  obterAssinatura,
  hasFeature,
  atualizarPlano,
  verificarAvisosTrial
};

