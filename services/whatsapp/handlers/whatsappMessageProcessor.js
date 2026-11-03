'use strict';

const { isAdminPhone, normalizePhone } = require('../../../lib/core');
const { extrairTelefoneDeJid } = require('./whatsappHelpers');
const {
  confirmacoesPendentes,
  auditarComandoWhatsApp,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira,
  podeExecutarEstorno
} = require('./whatsappSecurity');
const { recordSecurityAudit } = require('../../../lib/serverContext');
const { resolverConfirmacaoPendente } = require('./whatsappPendingConfirmations');
const { processarComandosPatio } = require('./whatsappPatioCommands');
const { processarComandosEstoque } = require('./whatsappInventoryCommands');
const { processarComandosChecklist } = require('./whatsappChecklistCommands');
const { processarComandosBI } = require('./whatsappBICommands');
const { processarComandosCaixa } = require('./whatsappCashCommands');
const { processarComandosAjuste } = require('./whatsappAdjustmentCommands');
const { processarConsultasFinanceiras } = require('./whatsappFinancialQueries');
const { processarComandosExecutivos } = require('./whatsappExecutiveCommands');

/**
 * Processador central de mensagens de texto e comandos de texto do WhatsApp
 */
async function processarMensagemTexto(msg, {
  texto = null,
  tenantKey = 'default',
  tenantState = {},
  isContextAdmin = true,
  isContextOperacao = false,
  isGroup = undefined,
  fromNumber = null,
  isSenderAdmin = undefined,
  wppClient = null
} = {}) {
  const textoMensagem = (texto !== null ? texto : (msg.body || '')).trim();
  const textoLower = textoMensagem.toLowerCase().trim();

  const isGroupMsg = isGroup !== undefined ? isGroup : Boolean(msg.from && msg.from.includes('@g.us'));
  const rawSender = extrairTelefoneDeJid(msg, fromNumber);
  const senderNorm = normalizePhone(rawSender) || rawSender;
  const chavePendente = `${tenantKey}:${senderNorm}`;

  const isComandoAbrirCaixa = /(?:abrir|iniciar|abertura\s+de)\s*(?:o\s+)?caixa/i.test(textoLower);
  const isComandoFecharCaixa = /(?:fechar|encerrar|fechamento\s+de)\s*(?:o\s+)?caixa/i.test(textoLower);
  const isComandoEntrada = /(?:lançar|lancar|registrar)\s*(?:uma\s+)?(?:entrada|receita)/i.test(textoLower) || /(?:entrada)\s+de\s+caixa/i.test(textoLower);
  const isComandoSaida = /(?:lançar|lancar|registrar)\s*(?:uma\s+)?(?:saída|saida|despesa)/i.test(textoLower) || /(?:saída|saida)\s+de\s+caixa/i.test(textoLower);
  const isComandoSangria = /^!?sangria\b/i.test(textoLower);
  const isComandoSuprimento = /^!?suprimento\b/i.test(textoLower);
  const isComandoEstorno = /^(?:!estornar|estornar)\b/i.test(textoLower);
  const isComandoBaixa = /^(?:!baixar|baixar|pagar\s+conta|receber\s+titulo|receber\s+título)\b/i.test(textoLower);
  const isComandoLiberarOS = /^(?:!liberar\s+os|liberar\s+os)\b/i.test(textoLower);
  const isComandoEscrita = isComandoAbrirCaixa || isComandoFecharCaixa || isComandoEntrada || isComandoSaida || isComandoSangria || isComandoSuprimento || isComandoEstorno || isComandoBaixa || isComandoLiberarOS;

  const matchBoxOS = textoLower.match(/^!?box\s+([a-zA-Z0-9_\-]+)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const matchIniciarOS = textoLower.match(/^!?iniciar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+box\s+([a-zA-Z0-9_\-]+))?$/i);
  const matchPausarOS = textoLower.match(/^!?pausar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const matchFinalizarOS = textoLower.match(/^!?(?:finalizar|pronto)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)$/i);
  const isComandoRadarGargalos = (
    textoLower === '!gargalos' || textoLower === 'gargalos' ||
    textoLower === '!radar patio' || textoLower === 'radar patio' ||
    textoLower === '!radar pátio' || textoLower === 'radar pátio' ||
    textoLower === '!status boxes' || textoLower === 'status boxes' ||
    textoLower === '!boxes' || textoLower === 'boxes'
  );
  const isComandoOperacionalPatio = Boolean(matchBoxOS || matchIniciarOS || matchPausarOS || matchFinalizarOS || isComandoRadarGargalos);

  const matchComandoOS = textoLower.match(/(?:extrato|financeiro|saldo)\s+(?:da\s+|de\s+)?(?:os|o\.s\.)\s*#?\s*([a-zA-Z0-9_\-]+)/i) ||
    textoLower.match(/(?:os|o\.s\.)\s*#?\s*([a-zA-Z0-9_\-]+)\s+(?:financeiro|extrato|saldo)/i) ||
    textoLower.match(/^!?(?:extrato|financeiro|saldo)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)/i) ||
    textoLower.match(/^(?:os\s+financeira|financeiro\s+da\s+os)\s*#?\s*([a-zA-Z0-9_\-]+)/i);
  const isComandoExtratoOS = Boolean(matchComandoOS);

  const isComandoLeituraFinanceira = (
    isComandoExtratoOS ||
    textoLower.includes('extrato') ||
    textoLower.includes('resumo caixa') ||
    textoLower.includes('fechamento parcial') ||
    textoLower === '!dre' || textoLower === 'dre' ||
    textoLower.startsWith('aviso retirada') || textoLower.startsWith('aviso cliente') ||
    textoLower.startsWith('cobranca') || textoLower.startsWith('cobrança') ||
    textoLower.startsWith('!cobranca') || textoLower.startsWith('!cobrança') ||
    textoLower.startsWith('aviso vencimento') || textoLower.startsWith('lembrete cobranca') ||
    textoLower === '!caixa' || textoLower === 'caixa' ||
    textoLower === '!saldo' || textoLower === 'saldo' ||
    textoLower.includes('entradas e saídas') || textoLower.includes('entradas e saidas') ||
    textoLower.includes('movimentações do dia') || textoLower.includes('movimentacoes do dia') ||
    textoLower.includes('contas a pagar') || textoLower.includes('contas a receber') ||
    textoLower.includes('vencimentos do dia') ||
    textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === '!relatório'
  );

  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);
  if (tenantState?.cfg?.adminFones && Array.isArray(tenantState.cfg.adminFones)) {
    tenantState.cfg.adminFones.forEach(f => {
      const clean = String(f).replace(/\D/g, '');
      if (clean && !adminList.includes(clean)) adminList.push(clean);
    });
  }
  const remetenteEAdmin = isSenderAdmin !== undefined ? Boolean(isSenderAdmin) : isAdminPhone(senderNorm, adminList);

  // Fail-closed para JID @lid não resolvível ou número desconhecido tentando comando restrito
  if (!isGroupMsg && (isComandoEscrita || isComandoLeituraFinanceira)) {
    if (!rawSender) {
      await msg.reply('Olá! Sou o assistente do Pátio CRM. No momento, o atendimento automatizado está disponível apenas para motoristas e clientes com veículos em serviço ou administradores autorizados. Para mais informações, entre em contato diretamente com a nossa recepção.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: 'desconhecido', comando: textoMensagem, resultado: 'recusado_nao_autorizado', detalhes: { motivo: 'lid_nao_resolvivel' } });
      return true;
    }
    if (!remetenteEAdmin) {
      const perfilRemetente = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
      if (isComandoLeituraFinanceira || perfilRemetente.role === 'desconhecido') {
        await msg.reply('Olá! Sou o assistente do Pátio CRM. No momento, o atendimento automatizado está disponível apenas para motoristas e clientes com veículos em serviço ou administradores autorizados. Para mais informações, entre em contato diretamente com a nossa recepção.');
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_nao_autorizado', detalhes: { motivo: 'numero_desconhecido' } });
        return true;
      }
    }
  }

  // RBAC para Comandos de Escrita Financeira
  if (isComandoEscrita) {
    if (isGroupMsg && !remetenteEAdmin) {
      const respNeg = '🔒 *Acesso Negado:* Comandos de escrita financeira via grupo exigem que o remetente esteja cadastrado na lista autorizada (whitelist).';
      await msg.reply(respNeg);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'negado_permissao',
        detalhes: { motivo: 'remetente_grupo_nao_whitelist' }
      });
      return true;
    }

    const perfil = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
    if (isComandoEstorno || isComandoLiberarOS) {
      if (!podeExecutarEstorno(perfil)) {
        const acaoMsg = isComandoLiberarOS ? 'conceder liberação excepcional de pátio' : 'realizar estorno de movimentações financeiras';
        const respNeg = `🚫 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para ${acaoMsg}. Esta ação é restrita exclusivamente ao Dono/Administrador.`;
        await msg.reply(respNeg);
        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: isComandoLiberarOS ? 'financeiro:os:liberar_saida_negada' : 'financeiro:movimento:estorno_negado',
            entity: isComandoLiberarOS ? 'ordem_servico' : 'movimento_financeiro',
            details: { motivo: 'perfil_nao_autorizado', perfil: perfil.role, comando: textoMensagem }
          });
        } catch (_) {}
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_permissao',
          detalhes: { perfil: perfil.role, acao: isComandoLiberarOS ? 'liberar_os' : 'estornar' }
        });
        return true;
      }
    } else if (!podeExecutarEscritaFinanceira(perfil)) {
      const respNeg = `🚫 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para realizar operações de escrita no caixa. Esta operação é restrita a Donos e Financeiro.`;
      await msg.reply(respNeg);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'negado_permissao',
        detalhes: { perfil: perfil.role }
      });
      return true;
    }
  }

  // RBAC para Comandos Operacionais de Pátio
  if (isComandoOperacionalPatio) {
    const perfil = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
    const roleNorm = (perfil?.role || '').toLowerCase();
    const perfisPermitidos = [
      'mecanico', 'atendente', 'consultor', 'financeiro', 'gerente',
      'admin', 'tenant_admin', 'dono', 'owner', 'platform_admin'
    ];

    if (!perfisPermitidos.includes(roleNorm)) {
      const respNeg = `🚫 *Acesso Negado:* Seu perfil de usuário (${perfil?.role || 'desconhecido'}) não possui permissão para comandos de chão de oficina e pátio.`;
      await msg.reply(respNeg);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'negado_permissao',
        detalhes: { motivo: 'remetente_grupo_nao_whitelist' }
      });
      return true;
    }
  }

  // Sobrescrita de pendência se o mesmo administrador enviar um novo comando de escrita
  let prefixoSubstituicao = '';
  if (isComandoEscrita && confirmacoesPendentes.has(chavePendente)) {
    const pendenteAnt = confirmacoesPendentes.get(chavePendente);
    confirmacoesPendentes.delete(chavePendente);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'substituido_por_novo_comando', detalhes: { acaoAnterior: pendenteAnt.acao, valorAnterior: pendenteAnt.valor } });
    prefixoSubstituicao = `ℹ️ *Aviso:* A operação anterior não confirmada (${pendenteAnt.descricaoAcao || pendenteAnt.acao}) foi substituída por esta nova.\n\n`;
  }

  // Contexto comum para handlers
  const ctx = {
    msg,
    textoMensagem,
    textoLower,
    tenantKey,
    tenantState,
    senderNorm,
    isGroupMsg,
    chavePendente,
    prefixoSubstituicao,
    isContextAdmin,
    isContextOperacao,
    wppClient,
    isComandoEscrita
  };

  // 1. Resolução de confirmação pendente
  if (!isComandoEscrita && confirmacoesPendentes.has(chavePendente)) {
    const resolvido = await resolverConfirmacaoPendente(msg, ctx);
    if (resolvido) return true;
  }

  // 2. Comandos Operacionais de Pátio / Boxes
  if (await processarComandosPatio(msg, ctx)) return true;

  // 3. Comandos de Almoxarifado e Estoque
  if (await processarComandosEstoque(msg, ctx)) return true;

  // 4. Comandos de Checklist e Garantia
  if (await processarComandosChecklist(msg, ctx)) return true;

  // 5. Comandos de BI e Comissões
  if (await processarComandosBI(msg, ctx)) return true;

  // 6. Comandos de Caixa (Abrir/Fechar/Entrada/Saída)
  if (await processarComandosCaixa(msg, ctx)) return true;

  // 7. Comandos de Ajuste Financeiro (Sangria/Suprimento/Estorno/Baixa/Liberar OS)
  if (await processarComandosAjuste(msg, ctx)) return true;

  // 8. Consultas Financeiras de Leitura (Extrato OS/Caixa, DRE, Saldo, etc.)
  if (await processarConsultasFinanceiras(msg, ctx)) return true;

  // 9. Comandos Executivos e Gerenciais (!previsao, !auditoria, !gestao360, !relatorio, !ajuda)
  if (await processarComandosExecutivos(msg, ctx)) return true;

  return false;
}

module.exports = {
  processarMensagemTexto,
  normalizePhone,
  isAdminPhone
};
