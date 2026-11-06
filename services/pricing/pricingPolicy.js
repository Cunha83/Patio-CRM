'use strict';

const {
  DEFAULT_PRECIFICACAO_CONFIG,
  arredondar,
  gerarId,
  obterConfigPrecificacao
} = require('./pricingCore');

/**
 * Valida a política configurada no tenant para preços propostos
 */
function validarPoliticaMargem({
  tenantId,
  state,
  modo,
  precoProposto,
  precoMinimo,
  margemMinima,
  confirmado = false,
  userPermissions = [],
  actorId = 'operador',
  motivo = null
}) {
  const config = state ? obterConfigPrecificacao(state) : DEFAULT_PRECIFICACAO_CONFIG;
  const modoPolitica = modo || config?.protecaoMargem?.modo || config?.modo || 'alertar';
  const prop = Number(precoProposto) || 0;
  const min = Number(precoMinimo) || 0;

  if (modoPolitica === 'desativado') {
    return { permitido: true, modo: 'desativado', severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: prop < min };
  }

  if (prop >= min) {
    return { permitido: true, modo: modoPolitica, severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: false };
  }

  if (modoPolitica === 'alertar') {
    const aviso = `Atenção: o preço proposto (R$ ${prop.toFixed(2)}) está abaixo do piso mínimo de segurança (R$ ${min.toFixed(2)}).`;
    return {
      permitido: true,
      modo: 'alertar',
      severidade: 'aviso',
      aviso,
      alerta: aviso,
      bloqueado: false,
      abaixoMinimo: true
    };
  }

  if (modoPolitica === 'exigir_confirmacao') {
    if (confirmado) {
      return { permitido: true, modo: 'exigir_confirmacao', severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: true };
    }
    const aviso = `O preço proposto (R$ ${prop.toFixed(2)}) está abaixo do piso mínimo (R$ ${min.toFixed(2)}). Confirme para prosseguir.`;
    return {
      permitido: false,
      requerConfirmacao: true,
      modo: 'exigir_confirmacao',
      severidade: 'alerta',
      aviso,
      alerta: aviso,
      bloqueado: true,
      abaixoMinimo: true
    };
  }

  if (modoPolitica === 'exigir_aprovacao') {
    const podeAprovar = userPermissions.includes('*') || userPermissions.includes('pricing:override');
    if (!podeAprovar) {
      const erro = `Operação bloqueada: o preço de venda (R$ ${prop.toFixed(2)}) está abaixo do preço mínimo exigido (R$ ${min.toFixed(2)}). Exige permissão pricing:override.`;
      return {
        permitido: false,
        bloqueado: true,
        requerOverride: true,
        requerAprovacao: true,
        modo: 'exigir_aprovacao',
        severidade: 'erro',
        aviso: erro,
        erro,
        abaixoMinimo: true
      };
    }
    return {
      permitido: true,
      bloqueado: false,
      requerOverride: false,
      requerAprovacao: false,
      aprovadoPorOverride: true,
      modo: 'exigir_aprovacao',
      severidade: 'info',
      aviso: null,
      abaixoMinimo: true
    };
  }

  return { permitido: true, modo: modoPolitica, severidade: 'info', aviso: null, bloqueado: false, abaixoMinimo: prop < min };
}

/**
 * Registra override de preço aprovado por gestor
 */
function registrarOverridePreco({
  tenantId,
  state,
  quotationId,
  serviceId,
  partId,
  itemIndex = 0,
  precoAutorizado,
  precoProposto,
  precoRecomendado,
  precoMinimo,
  margemResultante,
  motivo,
  actorId,
  autorizadoPor
}) {
  if (!state) throw new Error('Estado do tenant é obrigatório.');
  state.pricingOverrides = Array.isArray(state.pricingOverrides) ? state.pricingOverrides : [];

  const preco = precoAutorizado != null ? precoAutorizado : precoProposto;
  const autorizador = actorId || autorizadoPor || 'gestor';

  const override = {
    id: gerarId('pover'),
    tenantId,
    quotationId,
    serviceId: serviceId || null,
    partId: partId || null,
    itemIndex,
    precoAutorizado: arredondar(preco),
    precoProposto: arredondar(preco),
    precoRecomendado: arredondar(precoRecomendado || precoMinimo || 0),
    precoMinimo: arredondar(precoMinimo),
    margemResultante: arredondar(margemResultante || 0, 1),
    motivo: String(motivo || 'Autorização gerencial').trim(),
    quemAprovou: autorizador,
    autorizadoPor: autorizador,
    timestamp: new Date().toISOString()
  };

  state.pricingOverrides.unshift(override);

  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    dataHora: override.timestamp,
    timestamp: override.timestamp,
    tenantId,
    tipo: 'pricing_override',
    usuario: autorizador,
    actorId: autorizador,
    intencao: 'pricing_override_approved',
    resumo: `Override de preço autorizado por "${autorizador}": R$ ${override.precoProposto} (mínimo: R$ ${override.precoMinimo}). Motivo: ${override.motivo}`,
    quotationId,
    overrideId: override.id
  });

  return { ok: true, override };
}

module.exports = {
  validarPoliticaMargem,
  registrarOverridePreco
};
