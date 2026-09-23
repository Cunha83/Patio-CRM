'use strict';

/**
 * Serviço de Garantia de Serviços da Oficina
 * Avalia regras configuradas por tenant de dias e quilometragem para apontar possível garantia.
 */

// Template inicial sugerido pelo sistema (NÃO é garantia universal concedida; serve apenas como referência inicial caso o tenant não defina)
const TEMPLATE_GARANTIAS_SUGERIDAS = {
  SUSPENSAO_EIXO_BUCHAS: { dias: 180, km: 20000, descricao: 'Embuchamento de eixo' },
  SUSPENSAO_MOLAS: { dias: 90, km: 15000, descricao: 'Molas de suspensão' },
  ESTRUTURAL_SOLDA: { dias: 90, km: 10000, descricao: 'Solda e reparo estrutural' },
  SISTEMA_FREIOS: { dias: 90, km: 15000, descricao: 'Sistema de freios' },
  DIRECAO_ALINHAMENTO: { dias: 30, km: 5000, descricao: 'Alinhamento e direção' },
  PADRAO: { dias: 90, km: 10000, descricao: 'Garantia padrão de serviços' }
};

// Mantido para retrocompatibilidade
const DEFAULT_GARANTIAS = TEMPLATE_GARANTIAS_SUGERIDAS;

// Aliases aceitos para compatibilidade com configurações em snake_case
const ALIAS_MAP = {
  embuchamento_eixo: 'SUSPENSAO_EIXO_BUCHAS',
  embuchamento: 'SUSPENSAO_EIXO_BUCHAS',
  mola: 'SUSPENSAO_MOLAS',
  molas: 'SUSPENSAO_MOLAS',
  solda: 'ESTRUTURAL_SOLDA',
  freio: 'SISTEMA_FREIOS',
  freios: 'SISTEMA_FREIOS',
  alinhamento: 'DIRECAO_ALINHAMENTO'
};

/**
 * Normaliza e consolida as regras de garantia da oficina.
 * Cada tenant define suas próprias políticas em cfg.garantias.
 */
function obterRegrasGarantia(tenantCfg = {}) {
  const custom = tenantCfg?.garantias || {};
  const regras = {};

  for (const [cat, templateVal] of Object.entries(TEMPLATE_GARANTIAS_SUGERIDAS)) {
    regras[cat] = {
      ...templateVal,
      origem: 'template_sugerido'
    };
  }

  for (const [chave, val] of Object.entries(custom)) {
    if (!val || typeof val !== 'object') continue;
    const catCode = ALIAS_MAP[chave.toLowerCase()] || chave.toUpperCase();
    regras[catCode] = {
      dias: Number(val.dias) || regras[catCode]?.dias || 90,
      km: val.km !== undefined ? (Number(val.km) || null) : (regras[catCode]?.km || null),
      descricao: val.descricao || regras[catCode]?.descricao || catCode,
      origem: 'configuracao_tenant'
    };
  }

  return regras;
}

/**
 * Avalia se uma ocorrência prévia se enquadra em possível retorno de garantia.
 * IMPORTANTE: Emite APENAS possivelGarantia para validação humana.
 * NUNCA emite garantiaAprovada de forma autônoma.
 */
function avaliarGarantia({ ocorrencia, tenantCfg = {} }) {
  if (!ocorrencia) {
    return {
      possivelGarantia: false,
      motivo: 'Nenhuma ocorrência anterior informada para avaliação.',
      regraAplicada: null
    };
  }

  const regras = obterRegrasGarantia(tenantCfg);
  const categoria = ocorrencia.categoria || 'PADRAO';
  const regra = regras[categoria] || regras.PADRAO;

  const diasAtras = Number(ocorrencia.diasAtras) || 0;
  const kmRodados = Number(ocorrencia.kmRodados) || 0;

  let diasOk = true;
  if (regra.dias) {
    diasOk = diasAtras <= regra.dias;
  }

  let kmOk = true;
  if (regra.km && kmRodados > 0) {
    kmOk = kmRodados <= regra.km;
  }

  const dentroGarantia = diasOk && kmOk;
  const tipoOrigem = regra.origem === 'configuracao_tenant' ? 'Regra cadastrada da oficina' : 'Configuração sugerida';

  let motivo = '';
  if (dentroGarantia) {
    const partes = [];
    partes.push(`Serviço realizado há ${diasAtras} dias.`);
    if (kmRodados > 0) {
      partes.push(`Rodagem estimada: ${kmRodados.toLocaleString('pt-BR')} km.`);
    }
    const condicoes = [];
    if (regra.dias) condicoes.push(`${regra.dias} dias`);
    if (regra.km) condicoes.push(`${regra.km.toLocaleString('pt-BR')} km`);
    partes.push(`${tipoOrigem}: ${condicoes.join(' ou ')}.`);
    partes.push('Possível retorno em garantia para validação humana.');
    motivo = partes.join(' ');
  } else {
    const motivosFora = [];
    if (!diasOk) motivosFora.push(`prazo expirado há ${diasAtras} dias (limite: ${regra.dias} dias)`);
    if (!kmOk) motivosFora.push(`quilometragem de ${kmRodados.toLocaleString('pt-BR')} km excedeu o limite de ${regra.km.toLocaleString('pt-BR')} km`);
    motivo = `Fora da política de garantia (${tipoOrigem.toLowerCase()}): ${motivosFora.join(' e ')}.`;
  }

  return {
    possivelGarantia: dentroGarantia,
    motivo,
    regraAplicada: {
      categoria,
      diasLimite: regra.dias,
      kmLimite: regra.km,
      descricao: regra.descricao,
      origem: regra.origem
    },
    diasAtras,
    kmRodados
  };
}

module.exports = {
  TEMPLATE_GARANTIAS_SUGERIDAS,
  DEFAULT_GARANTIAS,
  obterRegrasGarantia,
  avaliarGarantia
};
