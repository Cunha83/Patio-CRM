'use strict';

const crypto = require('crypto');
const {
  gerarTokenAcao,
  consumirTokenAcao,
  validarTokenAcao,
  confirmarConsumoTokenAcao,
  reservarTokenAcao,
  liberarTokenAcao
} = require('../../lib/tokens/securityToken');

const BASE_CONHECIMENTO_SISTEMA = {
  cliente: 'Para cadastrar um cliente ou transportadora, acesse o menu Cadastros & Frotas, clique em Clientes e no botão Novo Cliente. Digite o CNPJ ou CPF e clique em Consultar para buscar via Sintegra/Serasa ou preencha manualmente os campos de Razão Social, IE, telefone e endereço, e clique em Salvar Cliente.',
  os: 'Para abrir uma Ordem de Serviço, acesse o menu Pátio & Boxes e clique no botão Nova OS. Selecione o caminhão ou veículo pela placa (ou cadastre novo), escolha o box disponível, informe o KM do painel e descreva a queixa do motorista. Clique em Criar OS para iniciar o atendimento.',
  pecas_servicos: 'Na folha da OS aberta, você pode navegar entre a aba Serviços e a aba Peças. Clique no botão Adicionar, utilize o campo de busca no picker para selecionar o item cadastrado e clique em Inserir. O total da OS é recalculado em tempo real.',
  faturamento: 'Para faturar e entregar a OS, certifique-se de que os serviços e peças foram executados. No rodapé da OS, clique no botão Faturar & Entregar, selecione as condições de pagamento e prazos, e confirme. Isso gera os títulos financeiros a receber e libera o veículo do box.',
  fiscal: 'O módulo Fiscal e Notas Fiscais permite emitir NF-e para peças e NFS-e para serviços mecânicos com base nas OSs faturadas. O sistema calcula a matriz tributária completa de ICMS, PIS, COFINS, ISS e IVA Dual da Reforma Tributária (IBS e CBS) através do código cClassTrib. Em ambiente de homologação, a transmissão real aguarda certificado A1 e credenciamento oficial na SEFAZ.',
  assistente: 'Para configurar o assistente virtual de voz, acesse o menu Configurações > Assistente Virtual. Você pode personalizar o nome do agente (como Verônica ou Sofia), alternar entre voz feminina e masculina e regular o tom (pitch) e velocidade de fala (rate).',
  financeiro: 'O módulo Financeiro gerencia contas a pagar, contas a receber, saldo consolidado de caixa, fluxo de caixa previsto para 7 e 30 dias e DRE gerencial. Você pode acompanhar vencimentos diários e lançar novos títulos pelo botão Lançar Título.',
  regras_tributarias: 'Em Cadastros > Regras Tributárias, você cadastra as alíquotas fiscais da oficina por CFOP, configurando a tributação tradicional e os novos campos da Reforma Tributária (CBS, IBS estadual/municipal e cClassTrib).',
  whatsapp: 'O módulo WhatsApp & CRM permite conectar o número da oficina para automação de mensagens: aviso de OS aprovada, veículo pronto para retirada e réguas de cobrança preventiva com faturas e relatórios em PDF.',
  geral: 'O Pátio CRM é a plataforma de gestão operacional para oficinas pesadas diesel e mecânicas, unificando pátio, almoxarifado de peças, financeiro, regras tributárias e CRM de pós-venda.'
};

const acoesPendentes = new Map();

setInterval(() => {
  const agora = Date.now();
  for (const [token, item] of acoesPendentes) {
    if (agora > item.expiraEm) acoesPendentes.delete(token);
  }
}, 60 * 1000).unref();

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

function resolveEffectiveRole(context) {
  if (!context || typeof context !== 'object') return null;
  if (typeof context.role === 'string' && context.role.trim()) {
    return context.role.trim().toLowerCase();
  }
  return null;
}

function canReadFinancial(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('financial:read')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'financeiro', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canWriteFinancial(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('financial:write')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'financeiro', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canDeleteOS(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('os:delete')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canWriteOS(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('os:write')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'gerente', 'atendente', 'consultor', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canAdjustInventory(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('inventory:adjust') || perms.includes('inventory:write')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'estoquista', 'compras', 'gerente', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function registrarAuditoria(state, { canal, usuario, intencao, comando, resumo, osId }) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    dataHora: new Date().toISOString(),
    canal: canal || 'web',
    usuario: usuario || 'Operador',
    intencao: intencao || 'geral',
    comando: comando || '',
    resumo: resumo || '',
    osId: osId || null
  });

  if (state.auditoria.length > 500) {
    state.auditoria.length = 500;
  }
}

function consumirAcaoPendente(token, { tenantId, actorId } = {}) {
  const c = confirmarConsumoTokenAcao(token, { tenantId, actorId });
  acoesPendentes.delete(token);
  return c;
}

function abortarConfirmacaoAcao(token) {
  if (!token) return;
  liberarTokenAcao(token);
  const acao = acoesPendentes.get(token);
  if (acao) {
    delete acao.emProcessamento;
  }
}

function buscarTokenPendente({ canal, remetente, token } = {}) {
  if (token && acoesPendentes.has(token)) return token;
  if (token) return token;
  if (canal) {
    for (const [t, a] of acoesPendentes) {
      if (a.context?.canal === canal &&
          (!remetente || a.context?.remetente === remetente || a.context?.actorId === remetente)) {
        return t;
      }
    }
  }
  return null;
}

module.exports = {
  BASE_CONHECIMENTO_SISTEMA,
  acoesPendentes,
  gerarId,
  safeJsonParse,
  resolveEffectiveRole,
  canReadFinancial,
  canWriteFinancial,
  canDeleteOS,
  canWriteOS,
  canAdjustInventory,
  registrarAuditoria,
  consumirAcaoPendente,
  abortarConfirmacaoAcao,
  buscarTokenPendente,
  gerarTokenAcao,
  consumirTokenAcao,
  validarTokenAcao,
  confirmarConsumoTokenAcao,
  reservarTokenAcao,
  liberarTokenAcao
};

