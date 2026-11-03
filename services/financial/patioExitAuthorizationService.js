'use strict';

const { obterResumoFinanceiroOS } = require('./billingAndSettlementService');

/**
 * Valida financeiramente a liberação de saída de veículo/OS no pátio ou concede liberação excepcional auditada com RBAC
 */
function validarOuAutorizarSaidaPatioOS(state = {}, payload = {}) {
  const osId = payload.osId;
  if (!osId) {
    return {
      ok: false,
      autorizado: false,
      status: 400,
      code: 'OS_ID_OBRIGATORIO',
      error: 'OS_ID_OBRIGATORIO',
      message: 'O identificador da OS (osId) é obrigatório.'
    };
  }

  const osNorm = String(osId).replace(/^#/, '').trim();
  const resumoOS = obterResumoFinanceiroOS(state, osNorm, payload);
  const forcarLiberacao = Boolean(payload.forcarLiberacao);

  // Se a OS já estiver liberada (quitada, faturada a prazo, garantia ou liberação excepcional prévia)
  if (['liberado_quitado', 'liberado_faturado', 'liberado_excepcional', 'liberado_garantia'].includes(resumoOS.statusLiberacaoPatio)) {
    return {
      ok: true,
      autorizado: true,
      statusLiberacaoPatio: resumoOS.statusLiberacaoPatio,
      osId: osNorm,
      saldoRestante: resumoOS.saldoRestante,
      liberacaoExcepcional: resumoOS.liberacaoExcepcional || null,
      mensagem: `Saída do pátio autorizada com sucesso (${resumoOS.statusLiberacaoPatio}). Saldo pendente: R$ ${resumoOS.saldoRestante.toFixed(2)}.`
    };
  }

  // Se a OS está com status 'retido_pendente'
  if (!forcarLiberacao) {
    return {
      ok: false,
      autorizado: false,
      status: 409,
      code: 'OS_RETIDA_PENDENCIA_FINANCEIRA',
      error: 'OS_RETIDA_PENDENCIA_FINANCEIRA',
      saldoRestante: resumoOS.saldoRestante,
      statusLiberacaoPatio: 'retido_pendente',
      message: `Saída bloqueada: OS #${osNorm} possui pendência financeira de R$ ${resumoOS.saldoRestante.toFixed(2)} sem quitação ou faturamento a prazo.`
    };
  }

  // Se forcarLiberacao === true: Validação de RBAC
  const operador = payload.operador || {};
  const perfil = (operador.perfil || operador.role || payload.perfil || payload.role || '').toLowerCase();
  const perfisPermitidos = ['dono', 'tenant_admin', 'owner', 'platform_admin', 'admin'];
  if (!perfisPermitidos.includes(perfil)) {
    return {
      ok: false,
      autorizado: false,
      status: 403,
      code: 'PERFIL_NAO_AUTORIZADO',
      error: 'PERFIL_NAO_AUTORIZADO',
      statusLiberacaoPatio: 'retido_pendente',
      saldoRestante: resumoOS.saldoRestante,
      message: 'Apenas perfis superiores (Dono ou Administrador) podem conceder liberação excepcional de pátio.'
    };
  }

  // Validação da justificativa (mínimo 5 caracteres)
  const justificativa = String(payload.justificativa || '').trim();
  if (!justificativa || justificativa.length < 5) {
    return {
      ok: false,
      autorizado: false,
      status: 400,
      code: 'JUSTIFICATIVA_INVALIDA',
      error: 'JUSTIFICATIVA_INVALIDA',
      statusLiberacaoPatio: 'retido_pendente',
      saldoRestante: resumoOS.saldoRestante,
      message: 'A justificativa para liberação excepcional deve ter pelo menos 5 caracteres.'
    };
  }

  // Gravar liberação excepcional no cadastro da OS no state
  if (!Array.isArray(state.os)) {
    state.os = [];
  }
  let osCadastro = state.os.find(o => String(o.id || o.numero || '').replace(/^#/, '').trim() === osNorm);
  if (!osCadastro) {
    osCadastro = { id: osNorm, numero: osNorm };
    state.os.push(osCadastro);
  }

  const liberacaoExcepcional = {
    autorizadoPor: operador.nome || operador.autorizadoPor || operador.actorId || payload.autorizadoPor || 'Administrador',
    perfil,
    justificativa,
    dataHora: new Date().toISOString(),
    saldoPendenteNaSaida: resumoOS.saldoRestante
  };

  osCadastro.liberacaoExcepcional = liberacaoExcepcional;
  osCadastro.statusLiberacaoPatio = 'liberado_excepcional';

  return {
    ok: true,
    autorizado: true,
    statusLiberacaoPatio: 'liberado_excepcional',
    osId: osNorm,
    saldoRestante: resumoOS.saldoRestante,
    liberacaoExcepcional,
    mensagem: `Liberação excepcional de pátio concedida por ${liberacaoExcepcional.autorizadoPor} (${perfil}). Justificativa: "${justificativa}".`
  };
}

module.exports = {
  validarOuAutorizarSaidaPatioOS
};
