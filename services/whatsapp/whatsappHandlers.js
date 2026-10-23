const Tesseract = require('tesseract.js');
const { isAdminPhone, normalizePhone } = require('../../lib/core');
const {
  getOrLoadState,
  mutateTenantState,
  salvarEstado,
  enqueueWrite,
  gerarId,
  extractTenantId,
  safeJsonParse,
  ultimasPlacas,
  getAiClient,
  recordSecurityAudit
} = require('../../lib/serverContext');
const {
  gerarTokenAcao
} = require('../../lib/tokens/securityToken');
const voiceActionEngine = require('../voiceActionEngine');
const preOSEngine = require('../preOSEngine');
const quotationService = require('../quotationService');
const technicalIntakeEngine = require('../technicalIntakeEngine');
const financialEngine = require('../financialEngine');
const financialAnalystService = require('../financialAnalystService');
const executiveManagerService = require('../executiveManagerService');
const { consultarDadosVeiculoOnline } = require('../vehicleLookupService');
const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio,
  gerarImagemIndicadoresJPG
} = require('../reportGenerationService');
const {
  getWhatsAppModules,
  resolverTenantPorChatId,
  obterGruposWhatsApp
} = require('./whatsappState');

function formatarMoeda(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(d) {
  if (!d) return new Date().toLocaleDateString('pt-BR');
  if (typeof d === 'string' && d.includes('-')) {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
}

function formatarHoraSimples(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(11, 16);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(iso).slice(11, 16);
  }
}

// Rate limit em memória por número remetente (máx 15 requisições por janela de 1 minuto)
const rateLimitMap = new Map();
const RATE_LIMIT_JANELA_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQ = 15;

function verificarRateLimit(numero) {
  const norm = normalizePhone(numero) || String(numero || '');
  if (!norm) return { permitido: true };
  const agora = Date.now();
  let entrada = rateLimitMap.get(norm);
  if (!entrada || agora - entrada.inicioJanela > RATE_LIMIT_JANELA_MS) {
    entrada = { inicioJanela: agora, contagem: 1 };
    rateLimitMap.set(norm, entrada);
    return { permitido: true };
  }
  entrada.contagem += 1;
  if (entrada.contagem > RATE_LIMIT_MAX_REQ) {
    return { permitido: false, excedido: true, contagem: entrada.contagem };
  }
  return { permitido: true };
}

// Limpeza periódica do mapa de rate limit a cada 5 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [num, ent] of rateLimitMap.entries()) {
    if (agora - ent.inicioJanela > RATE_LIMIT_JANELA_MS * 5) {
      rateLimitMap.delete(num);
    }
  }
}, 5 * 60 * 1000).unref();

// Idempotência por ID de mensagem do WhatsApp prefixada por Tenant (TTL 10 minutos, durável em SQLite KV)
const mensagensProcessadas = new Map();
const IDEMPOTENCIA_TTL_MS = 10 * 60 * 1000;

async function verificarIdempotencia(msgId, tenantKey = 'default') {
  if (!msgId) return { duplicada: false };
  const agora = Date.now();
  const idStr = String(msgId);
  const chaveTenant = `tenant:${tenantKey}:wpp_msg:${idStr}`;

  // 1. Cache em memória para resposta rápida
  const regMem = mensagensProcessadas.get(chaveTenant);
  if (regMem && agora - regMem.timestamp < IDEMPOTENCIA_TTL_MS) {
    return { duplicada: true, resposta: regMem.resposta };
  }

  // 2. Persistência durável no SQLite kv
  try {
    const { get } = require('../../db');
    if (get && typeof get === 'function') {
      const row = await get('SELECT value FROM kv WHERE key = ?', [chaveTenant]);
      if (row && row.value) {
        const parsed = safeJsonParse(row.value);
        if (parsed && agora < (parsed.expiraEm || 0)) {
          mensagensProcessadas.set(chaveTenant, { timestamp: parsed.timestamp, resposta: parsed.resposta });
          return { duplicada: true, resposta: parsed.resposta };
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp Idempotência] Falha tolerante ao verificar KV SQLite:', err.message);
  }

  return { duplicada: false };
}

async function registrarIdempotencia(msgId, resposta = null, tenantKey = 'default') {
  if (!msgId) return;
  const agora = Date.now();
  const idStr = String(msgId);
  const chaveTenant = `tenant:${tenantKey}:wpp_msg:${idStr}`;
  mensagensProcessadas.set(chaveTenant, { timestamp: agora, resposta });

  try {
    const { run } = require('../../db');
    if (run && typeof run === 'function') {
      const value = JSON.stringify({
        timestamp: agora,
        resposta,
        tenantKey,
        expiraEm: agora + IDEMPOTENCIA_TTL_MS
      });
      await run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [chaveTenant, value]);
    }
  } catch (err) {
    console.warn('[WhatsApp Idempotência] Falha tolerante ao persistir KV SQLite:', err.message);
  }
}

setInterval(async () => {
  const agora = Date.now();
  for (const [id, reg] of mensagensProcessadas.entries()) {
    if (agora - reg.timestamp > IDEMPOTENCIA_TTL_MS) {
      mensagensProcessadas.delete(id);
    }
  }
  try {
    const { run } = require('../../db');
    if (run && typeof run === 'function') {
      // Remove chaves antigas de mensagem expiradas do kv
      await run("DELETE FROM kv WHERE key LIKE '%:wpp_msg:%' AND json_extract(value, '$.expiraEm') < ?", [agora]);
    }
  } catch (_) {}
}, 5 * 60 * 1000).unref();

// Memória de operações financeiras de escrita aguardando confirmação explícita (TTL estrito de 2 minutos)
const confirmacoesPendentes = new Map();
const execucoesEmAndamento = new Set();
const CONFIRMACAO_TTL_MS = 2 * 60 * 1000;

setInterval(() => {
  const agora = Date.now();
  for (const [chave, item] of confirmacoesPendentes.entries()) {
    if (agora > item.expiraEm) {
      confirmacoesPendentes.delete(chave);
    }
  }
}, 30 * 1000).unref();

/**
 * Extrai valor monetário de forma robusta e detecta ambiguidade/ausência
 */
function extrairValorMonetario(texto) {
  const t = String(texto || '').trim();

  // Padrões monetários explícitos
  const regexExplicit = /(?:r\$\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)|\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)\b|(?:com|de|saldo\s+de|valor\s+de)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/gi;
  
  const matches = [];
  let m;
  while ((m = regexExplicit.exec(t)) !== null) {
    const rawVal = m[1] || m[2] || m[3];
    if (rawVal) {
      const num = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(num) && num > 0) matches.push(num);
    }
  }

  // Padrões de números soltos quando não houver moeda explícita
  if (matches.length === 0) {
    const regexNumeros = /\b(\d+(?:[.,]\d{1,2})?)\b/g;
    while ((m = regexNumeros.exec(t)) !== null) {
      const raw = m[1];
      if (['2024', '2025', '2026', '2027'].includes(raw)) continue;
      const num = parseFloat(raw.replace(',', '.'));
      if (!isNaN(num) && num > 0) matches.push(num);
    }
  }

  if (matches.length === 0) {
    return { status: 'ausente' };
  }

  const unicos = [...new Set(matches)];
  if (unicos.length > 1) {
    return { status: 'ambiguo', valores: unicos };
  }

  return { status: 'valido', valor: unicos[0] };
}

/**
 * Extrai meio de pagamento a partir do texto do comando via WhatsApp
 */
function extrairFormaPagamentoHeuristica(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.includes('pix')) return 'pix';
  if (t.includes('cartao de debito') || t.includes('cartão de débito') || t.includes('debito') || t.includes('débito')) return 'cartao_debito';
  if (t.includes('cartao de credito') || t.includes('cartão de crédito') || t.includes('credito') || t.includes('crédito')) return 'cartao_credito';
  if (t.includes('cartao') || t.includes('cartão')) return 'cartao_credito';
  if (t.includes('boleto')) return 'boleto';
  if (t.includes('transferencia') || t.includes('transferência') || t.includes('ted') || t.includes('doc')) return 'transferencia';
  if (t.includes('dinheiro') || t.includes('especie') || t.includes('espécie')) return 'dinheiro';
  return 'dinheiro';
}

/**
 * Extrai OS e Placa a partir do texto do comando via WhatsApp
 */
function extrairOsEPlacaHeuristica(texto) {
  const t = String(texto || '');
  let osId = null;
  let placa = null;

  const matchOs = t.match(/\b(?:os|o\.s\.|ordem|ordem\s+de\s+serviço|ordem\s+de\s+servico)\s*#?\s*([a-zA-Z0-9_\-]+)\b/i);
  if (matchOs) {
    osId = matchOs[1].trim();
  }

  const matchPlaca = t.match(/\b([a-zA-Z]{3}[0-9][0-9a-zA-Z][0-9]{2}|[a-zA-Z]{3}[- ]?[0-9]{4})\b/i);
  if (matchPlaca) {
    placa = matchPlaca[1].toUpperCase().replace(/[- ]/g, '');
  }

  return { osId, placa };
}

/**
 * Obtém o perfil de acesso do remetente do WhatsApp
 */
async function obterPerfilNumeroWhatsApp({ tenantKey = 'default', numero, tenantState = {} }) {
  const norm = normalizePhone(numero);
  if (!norm) return { role: 'desconhecido', permissions: [] };

  // 1. Mecânicos cadastrados no estado
  const mecanicos = Array.isArray(tenantState?.mecanicos) ? tenantState.mecanicos : (Array.isArray(tenantState?.workers) ? tenantState.workers : []);
  const isMec = mecanicos.some(m => normalizePhone(m.fone || m.telefone || m.phone) === norm);
  if (isMec) {
    return { role: 'mecanico', permissions: ['os:read', 'labor:read', 'labor:write'] };
  }

  // 2. Atendentes cadastrados no estado
  const atendentes = Array.isArray(tenantState?.atendentes) ? tenantState.atendentes : [];
  const isAtend = atendentes.some(a => normalizePhone(a.fone || a.telefone || a.phone) === norm);
  if (isAtend) {
    return { role: 'atendente', permissions: ['os:read', 'os:write', 'crm:read'] };
  }

  // 3. Verificação no banco de dados persistente (users / memberships)
  try {
    const db = require('../../db');
    if (db && typeof db.get === 'function') {
      const userRow = await db.get('SELECT id FROM users WHERE phone = ?', [norm]);
      if (userRow) {
        const memRows = await db.all('SELECT role, permissions_json FROM memberships WHERE user_id = ?', [userRow.id]);
        const mem = memRows.find(m => m.tenant_id === tenantKey) || memRows[0];
        if (mem) {
          const perms = JSON.parse(mem.permissions_json || '[]');
          return { role: mem.role, permissions: perms };
        }
      }
    }
  } catch (_) {}

  // 4. Se estiver em financeiroFones no cfg do tenant
  const finFones = Array.isArray(tenantState?.cfg?.financeiroFones) ? tenantState.cfg.financeiroFones : [];
  if (finFones.some(f => normalizePhone(f) === norm)) {
    return { role: 'financeiro', permissions: ['financial:read', 'financial:write'] };
  }

  // 5. Se estiver em adminFones / WHATSAPP_ADMIN_NUMBERS (Dono / Administrador do Tenant)
  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/\D/g, ''))
    .filter(Boolean);
  if (tenantState?.cfg?.adminFones && Array.isArray(tenantState.cfg.adminFones)) {
    tenantState.cfg.adminFones.forEach(f => {
      const clean = String(f).replace(/\D/g, '');
      if (clean && !adminList.includes(clean)) adminList.push(clean);
    });
  }

  if (isAdminPhone(norm, adminList)) {
    return { role: 'tenant_admin', permissions: ['*'] };
  }

  return { role: 'desconhecido', permissions: [] };
}

function podeExecutarEscritaFinanceira(perfil) {
  if (!perfil) return false;
  if (perfil.role === 'mecanico' || perfil.role === 'atendente') return false;
  if (['tenant_admin', 'admin', 'financeiro', 'platform_admin'].includes(perfil.role)) return true;
  const perms = Array.isArray(perfil.permissions) ? perfil.permissions : [];
  return perms.includes('*') || perms.includes('financial:write');
}

function podeExecutarEstorno(perfil) {
  if (!perfil) return false;
  if (perfil.role === 'mecanico' || perfil.role === 'atendente' || perfil.role === 'financeiro') return false;
  if (['tenant_admin', 'dono', 'owner', 'platform_admin', 'admin'].includes(perfil.role)) return true;
  const perms = Array.isArray(perfil.permissions) ? perfil.permissions : [];
  return perms.includes('*');
}

async function auditarComandoWhatsApp({ tenantId, numero, comando, resultado, detalhes = {} }) {
  try {
    const agoraSP = financialEngine.obterAgoraSP();
    const entry = {
      tenantId: tenantId || 'default',
      actorId: `whatsapp:${numero || 'desconhecido'}`,
      actorType: 'whatsapp_sender',
      action: 'whatsapp_command',
      entity: 'financial_agent',
      entityId: comando || 'desconhecido',
      details: {
        numeroNormalizado: numero,
        comando,
        resultado,
        horarioSP: `${agoraSP.dataBR} ${agoraSP.horaBR}`,
        dataISO: agoraSP.dataISO,
        ...detalhes
      }
    };
    await recordSecurityAudit(entry);
    try {
      const st = await getOrLoadState(tenantId || 'default');
      if (st) {
        if (!Array.isArray(st.security_audit_log)) st.security_audit_log = [];
        st.security_audit_log.unshift(entry);
      }
    } catch (_) {}
  } catch (err) {
    console.warn('[WhatsApp Audit] Falha não-bloqueante ao gravar auditoria:', err.message);
  }
}

function extrairDadosDocumentoHeuristico(texto) {
  const t = (texto || '').toUpperCase();

  const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
  const matchPlaca = t.match(placaRegex);

  const isPixOuComprovante = t.includes('COMPROVANTE') || t.includes('PAGAMENTO EFETUADO') ||
    t.includes('PAGAMENTO REALIZADO') || t.includes('TRANSFERENCIA') || t.includes('TRANSFERÊNCIA') ||
    t.includes('PIX REALIZADO') || (t.includes('PIX') && (t.includes('AUTENTICA') || t.includes('TRANSACAO') || t.includes('TRANSAÇÃO') || t.includes('DESTINO') || t.includes('FAVORECIDO') || t.includes('VALOR PAGO') || t.includes('PAGO PARA') || t.includes('ENVIO PIX')));

  const isNotaFiscal = t.includes('DANFE') || t.includes('DOCUMENTO AUXILIAR') ||
    t.includes('NF-E') || t.includes('NFE') || t.includes('NOTA FISCAL') ||
    t.includes('CHAVE DE ACESSO') || t.includes('PROTOCOLO DE AUTORIZ') || t.includes('INSCRIÇÃO ESTADUAL');

  const isPedido = t.includes('PEDIDO') || t.includes('ORÇAMENTO') || t.includes('ORCAMENTO') ||
    t.includes('COTAÇÃO') || t.includes('COTACAO') || t.includes('ESPELHO DE PEDIDO') ||
    t.includes('PROPOSTA COMERCIAL') || t.includes('PEDIDO DE COMPRA') || t.includes('COND. PAG');

  let tipo = 'outro';
  if (isPixOuComprovante) {
    tipo = 'comprovante_pagamento';
  } else if (isNotaFiscal) {
    tipo = 'nota_fiscal';
  } else if (isPedido) {
    tipo = 'pedido_compra';
  } else if (matchPlaca) {
    tipo = 'placa_veiculo';
  }

  let valorTotal = 0;
  const valoresEncontrados = [];
  const regexValor = /(?:R\$\s*|VALOR\s*(?:TOTAL|PAGO|L[IÍ]QUIDO)?[:\s]*R?\$?\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{2}))/gi;
  let mv;
  while ((mv = regexValor.exec(t)) !== null) {
    const limpo = mv[1].replace(/\./g, '').replace(',', '.');
    const num = parseFloat(limpo);
    if (!isNaN(num) && num > 0) valoresEncontrados.push(num);
  }
  if (valoresEncontrados.length > 0) {
    valorTotal = Math.max(...valoresEncontrados);
  } else {
    const regexMoedaSolta = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;
    const moedas = [...t.matchAll(regexMoedaSolta)].map(m => parseFloat(m[0].replace(/\./g, '').replace(',', '.')));
    if (moedas.length > 0) valorTotal = Math.max(...moedas);
  }

  let cnpj = '';
  const matchCNPJ = t.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  if (matchCNPJ) cnpj = matchCNPJ[0].replace(/\D/g, '');

  let chaveAcesso = '';
  const seqsNumericas = t.match(/\d{44}/g);
  if (seqsNumericas && seqsNumericas.length > 0) {
    chaveAcesso = seqsNumericas[0];
  } else {
    const textoSoNumeros = t.replace(/[^0-9]/g, '');
    const matchChave = textoSoNumeros.match(/\d{44}/);
    if (matchChave) chaveAcesso = matchChave[0];
  }

  let numeroDoc = '';
  const matchNum = t.match(/(?:N[ºo°\.]\s*|NUMERO[:\s]*|NF[:\s]*|PEDIDO[:\s]*(?:N[ºo°\.]\s*)?|Nº[:\s]*)(\d+(?:[\.\-]\d+)*)/i);
  if (matchNum) {
    numeroDoc = matchNum[1].replace(/\D/g, '');
  }

  let fornecedorOuFavorecido = '';
  const matchFav = t.match(/(?:PARA|FAVORECIDO|DESTINAT[AÁ]RIO|RECEBEDOR|NOME DO RECEBEDOR|FORNECEDOR|EMITENTE|RAZ[AÃ]O SOCIAL|PAGO PARA)[:\s]+([^\n\r]+)/i);
  if (matchFav) {
    fornecedorOuFavorecido = matchFav[1].split(/[-–|,\.]/)[0].trim();
  }

  let autenticacao = '';
  const matchAuth = t.match(/(?:AUTENTICA[CÇ][AÃ]O|ID DA TRANSA[CÇ][AÃ]O|ID[:\s]+|C[OÓ]DIGO DE CONTROLE|TRANSAC[AÃ]O)[:\s]+([A-Z0-9\.\-]+)/i);
  if (matchAuth) autenticacao = matchAuth[1].trim();

  let forma = 'Pix';
  if (t.includes('BOLETO')) forma = 'Boleto';
  else if (t.includes('TED')) forma = 'TED';
  else if (t.includes('TRANSFERENCIA') || t.includes('TRANSFERÊNCIA')) forma = 'Transferência Bancária';
  else if (t.includes('PIX')) forma = 'Pix';

  let dataISO = new Date().toISOString().slice(0, 10);
  const matchData = t.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (matchData) {
    dataISO = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
  }

  return {
    tipo,
    placa: matchPlaca ? matchPlaca[1].replace(/[- ]/g, '') : null,
    valor_total: valorTotal,
    numero_documento: numeroDoc,
    chave_acesso: chaveAcesso,
    cnpj,
    fornecedor: fornecedorOuFavorecido || (tipo === 'comprovante_pagamento' ? 'Favorecido Identificado' : 'Fornecedor Identificado'),
    favorecido: fornecedorOuFavorecido || 'Favorecido Identificado',
    autenticacao,
    forma_pagamento: forma,
    data: dataISO
  };
}

async function analisarDocumentoWhatsApp(base64Image, textoMensagem) {
  const ai = getAiClient();
  if (ai && base64Image) {
    try {
      console.log('[Classificador IA] Enviando documento para análise multimodal no Gemini...');
      const prompt = `Você é um assistente contábil e operacional de oficina diesel pesada no Brasil.
Analise a imagem deste documento e a mensagem do usuário (se houver).
Classifique em uma das seguintes opções:
- "pedido_compra": se for pedido de compra, cotação, proposta ou orçamento de autopeças.
- "nota_fiscal": se for DANFE, NF-e ou cupom/nota fiscal de compra de peças ou serviços.
- "comprovante_pagamento": se for comprovante de Pix, boleto pago, TED ou transferência.
- "placa_veiculo": se for foto de caminhão, carreta ou placa veicular.
- "outro": caso não pertença a nenhuma acima.

Retorne APENAS um JSON estrito no formato:
{
  "tipo": "pedido_compra" | "nota_fiscal" | "comprovante_pagamento" | "placa_veiculo" | "outro",
  "fornecedor": "Razão social ou nome do fornecedor/favorecido",
  "cnpj": "CNPJ limpo se houver",
  "numero_documento": "Número do pedido ou NF",
  "chave_acesso": "Chave de 44 dígitos da NF se houver",
  "valor_total": 0.00,
  "data": "YYYY-MM-DD",
  "vencimento": "YYYY-MM-DD",
  "favorecido": "Nome do favorecido do pagamento",
  "pagador": "Nome do pagador",
  "autenticacao": "Código de autenticação bancária ou transação",
  "forma_pagamento": "Pix / Boleto / TED",
  "placa": "Placa veicular se houver",
  "itens": [
    { "nome": "Nome da peça", "quantidade": 1, "valor_unitario": 0.00 }
  ]
}`;
      const safeText = String(textoMensagem || '').replace(/"/g, '\\"').replace(/\{/g, '(').replace(/\}/g, ')');
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: `O usuário enviou a seguinte mensagem junto com a imagem: "${safeText}".\n\n` + prompt }
          ]
        }]
      });
      const parsed = safeJsonParse(resp.text);
      if (parsed && parsed.tipo && parsed.tipo !== 'outro') {
        console.log(`[Classificador IA] Documento classificado com sucesso como "${parsed.tipo}" via Gemini!`);
        return {
          tipo: parsed.tipo,
          origem: 'Gemini AI',
          dados: parsed
        };
      }
    } catch (eAI) {
      console.warn('[Classificador IA] Gemini indisponível ou token expirado, acionando OCR Tesseract heurístico:', eAI.message);
    }
  }

  let textoExtraido = textoMensagem || '';
  if (base64Image) {
    try {
      console.log('[Classificador OCR] Executando OCR Tesseract local no documento...');
      const buffer = Buffer.from(base64Image, 'base64');
      const resOcr = await Tesseract.recognize(buffer, 'por');
      const textOcr = resOcr?.data?.text || '';
      console.log(`[Classificador OCR] Texto extraído (${textOcr.length} caracteres).`);
      textoExtraido = textOcr + '\n' + (textoMensagem || '');
    } catch (errOcr) {
      console.warn('[Classificador OCR] Erro no Tesseract OCR:', errOcr.message);
    }
  }

  const heuristica = extrairDadosDocumentoHeuristico(textoExtraido);
  console.log(`[Classificador Heurístico] Resultado da análise: tipo="${heuristica.tipo}", valor=${heuristica.valor_total}, forn="${heuristica.fornecedor}"`);
  return {
    tipo: heuristica.tipo,
    origem: 'Tesseract OCR / Heurística',
    dados: heuristica
  };
}

/**
 * Extrai e normaliza o identificador numérico de telefone a partir de JID e mensagens WhatsApp.
 * Suporta formatos @c.us, @s.whatsapp.net, :device e rejeita estritamente @lid não resolvível (fail-closed).
 */
function extrairTelefoneDeJid(msg, explicitNumber = null) {
  if (explicitNumber !== null && explicitNumber !== undefined) {
    const str = String(explicitNumber).trim();
    if (str.includes('@lid')) return '';
    const clean = str.replace(/[@:].*$/, '').replace(/\D/g, '');
    if (clean) return clean;
  }

  if (!msg || typeof msg !== 'object') return '';

  const candidates = [
    msg.author,
    msg.from,
    msg._data?.author,
    msg._data?.from,
    msg.sender?.id?._serialized,
    msg.sender?.id?.user,
    msg.sender?.number,
    msg._data?.senderNumber,
    msg._data?.participant
  ];

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'string') continue;
    if (cand.includes('@lid')) continue;
    const clean = cand.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (clean && clean.length >= 8 && clean.length <= 15) {
      return clean;
    }
  }

  const isLid = Boolean(
    (typeof msg.from === 'string' && msg.from.includes('@lid')) ||
    (typeof msg.author === 'string' && msg.author.includes('@lid'))
  );
  if (isLid) {
    return ''; // Fail-closed para LID não resolvível
  }

  const fallback = msg.author || msg.from || '';
  return fallback.split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Processa comandos executivos e de administração do WhatsApp
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

  // Comandos Operacionais de Pátio / Boxes / Apontamento (Frente 5B)
  const matchBoxOS = textoLower.match(/^!?box\s+([a-zA-Z0-9_\-]+)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const isComandoBoxOS = Boolean(matchBoxOS);

  const matchIniciarOS = textoLower.match(/^!?iniciar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+box\s+([a-zA-Z0-9_\-]+))?$/i);
  const isComandoIniciarOS = Boolean(matchIniciarOS);

  const matchPausarOS = textoLower.match(/^!?pausar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const isComandoPausarOS = Boolean(matchPausarOS);

  const matchFinalizarOS = textoLower.match(/^!?(?:finalizar|pronto)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)$/i);
  const isComandoFinalizarOS = Boolean(matchFinalizarOS);

  const isComandoRadarGargalos = (
    textoLower === '!gargalos' || textoLower === 'gargalos' ||
    textoLower === '!radar patio' || textoLower === 'radar patio' ||
    textoLower === '!radar pátio' || textoLower === 'radar pátio' ||
    textoLower === '!status boxes' || textoLower === 'status boxes' ||
    textoLower === '!boxes' || textoLower === 'boxes'
  );

  // Comandos de Almoxarifado / Peças / Desbloqueio (Frente 6B e 7B)
  const matchEstoque = textoLower.match(/^!?(?:consultar\s+pe[çc]a|estoque)(?:\s+(.+))?$/i);
  const isComandoConsultaEstoque = Boolean(matchEstoque);

  const matchRequisitarPeca = textoLower.match(/^!?pe[çc]a\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i);
  const isComandoRequisitarPeca = Boolean(matchRequisitarPeca);

  const matchLiberarGargalo = textoLower.match(/^!?(?:chegou\s+pe[çc]a\s+os|retomar\s+os)\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const isComandoLiberarGargalo = Boolean(matchLiberarGargalo);

  const matchDevolverPeca = textoLower.match(/^!?devolver\s+pe[çc]a\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+(.+)$/i);
  const isComandoDevolverPeca = Boolean(matchDevolverPeca);

  // Comandos de Vistoria / Checklist Técnico Pesado (Frente 8B)
  const matchChecklistOk = textoLower.match(/^!?(?:checklist|vistoria)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+ok(?:\s+(.+))?$/i);
  const isComandoChecklistOk = Boolean(matchChecklistOk);

  const matchChecklistFalha = textoLower.match(/^!?(?:checklist|vistoria)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+(?:falha|reprovar|reprovado)(?:\s+(.+))?$/i);
  const isComandoChecklistFalha = Boolean(matchChecklistFalha);

  const matchConsultaLaudo = textoLower.match(/^!?(?:laudo\s+os|laudo|checklist\s+os|vistoria\s+os)\s*#?\s*([a-zA-Z0-9_\-]+)$/i);
  const isComandoConsultaLaudo = !isComandoChecklistOk && !isComandoChecklistFalha && Boolean(matchConsultaLaudo);

  // Comandos de Rastreamento de Garantia e Dossiê por Placa (Frente 9B)
  const matchGarantiaPlaca = textoLower.match(/^!?(?:garantia\s+placa|hist[oó]rico\s+placa|consultar\s+placa)\s+([a-zA-Z0-9_\-]+)$/i);
  const isComandoGarantiaPlaca = Boolean(matchGarantiaPlaca);

  const matchVinculoGarantiaOS = textoLower.match(/^!?garantia\s+os\s*#?\s*([a-zA-Z0-9_\-]+)\s+origem\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
  const isComandoVinculoGarantiaOS = Boolean(matchVinculoGarantiaOS);

  // Comandos de BI, Produtividade Periódica e Comissões (Frente 10B)
  const isComandoRelatorioSemanal = /(?:^|\b)(?:!relat[oó]rio\s+semanal|relat[oó]rio\s+semanal|!produtividade\s+semana(?:l)?|produtividade\s+semana(?:l)?|boletim\s+semanal)\b/i.test(textoLower);
  const isComandoRelatorioMensal = /(?:^|\b)(?:!relat[oó]rio\s+mensal|relat[oó]rio\s+mensal|fechamento\s+m[eê]s|!fechamento\s+m[eê]s|!produtividade\s+m[eê]s(?:al)?|produtividade\s+m[eê]s(?:al)?|boletim\s+mensal)\b/i.test(textoLower);
  const isComandoComissoes = /(?:^|\b)(?:minhas?\s+comiss[oõ]es|!minha\s+comiss[aã]o|minha\s+comiss[aã]o|!comiss[oõ]es|comiss[oõ]es|comiss[aã]o|extrato\s+comiss[aã]o)\b/i.test(textoLower);

  const isComandoOperacionalPatio = isComandoBoxOS || isComandoIniciarOS || isComandoPausarOS || isComandoFinalizarOS || isComandoRadarGargalos || isComandoConsultaEstoque || isComandoRequisitarPeca || isComandoLiberarGargalo || isComandoDevolverPeca || isComandoChecklistOk || isComandoChecklistFalha || isComandoConsultaLaudo || isComandoGarantiaPlaca || isComandoVinculoGarantiaOS || isComandoRelatorioSemanal || isComandoRelatorioMensal || isComandoComissoes;

  const matchComandoOS = textoLower.match(/(?:extrato|financeiro|saldo)\s+(?:da\s+|de\s+)?(?:os|o\.s\.)\s*#?\s*([a-zA-Z0-9_\-]+)/i) ||
                         textoLower.match(/(?:os|o\.s\.)\s*#?\s*([a-zA-Z0-9_\-]+)\s+(?:financeiro|extrato|saldo)/i) ||
                         textoLower.match(/^!?(?:extrato|financeiro|saldo)\s+os\s*#?\s*([a-zA-Z0-9_\-]+)/i) ||
                         textoLower.match(/^(?:os\s+financeira|financeiro\s+da\s+os)\s*#?\s*([a-zA-Z0-9_\-]+)/i);
  const isComandoExtratoOS = Boolean(matchComandoOS);

  const isComandoExtrato = !isComandoExtratoOS && (
    textoLower === '!extrato' ||
    textoLower.startsWith('extrato') ||
    textoLower.includes('ultimos lancamentos') ||
    textoLower.includes('últimos lançamentos') ||
    textoLower.includes('últimas movimentações') ||
    textoLower.includes('ultimas movimentacoes')
  );

  const isComandoResumoCaixa = (
    textoLower === 'resumo caixa' ||
    textoLower === '!resumo caixa' ||
    textoLower === 'fechamento parcial' ||
    textoLower === '!fechamento parcial' ||
    textoLower === 'resumo do caixa' ||
    textoLower === 'parcial do caixa'
  );

  const isComandoDRE = /^(?:!dre|dre|resultado\s+operacional|demonstrativo\s+dre)\b/i.test(textoLower);

  const matchAvisoRetiradaOS = textoLower.match(/^!?(?:aviso\s+retirada|aviso\s+cliente)(?:\s+os)?\s+([#a-zA-Z0-9_\-]+)$/i);
  const isComandoAvisoRetiradaOS = Boolean(matchAvisoRetiradaOS);

  const matchCobrancaOS = textoLower.match(/^(?:!cobranca|!cobrança|cobranca|cobrança|aviso\s+vencimento|lembrete\s+cobranca|lembrete\s+cobrança)(?:\s+os)?\s+([#a-zA-Z0-9_\-]+)$/i);
  const isComandoCobrancaOS = Boolean(matchCobrancaOS);

  const isComandoLeituraFinanceira = (
    isComandoExtratoOS ||
    isComandoExtrato ||
    isComandoResumoCaixa ||
    isComandoDRE ||
    isComandoAvisoRetiradaOS ||
    isComandoCobrancaOS ||
    textoLower === '!caixa' || textoLower === 'caixa' ||
    textoLower === '!saldo' || textoLower === 'saldo' ||
    textoLower === 'saldo do caixa' || textoLower === 'saldo de caixa' ||
    textoLower === '!financeiro' || textoLower === 'financeiro' ||
    textoLower.includes('entradas e saídas') || textoLower.includes('entradas e saidas') ||
    textoLower.includes('movimentações do dia') || textoLower.includes('movimentacoes do dia') ||
    textoLower.includes('movimentação do dia') || textoLower.includes('movimentacao do dia') ||
    textoLower.includes('entradas do dia') || textoLower.includes('saídas do dia') || textoLower.includes('saidas do dia') ||
    textoLower === '!movimentacoes' || textoLower === '!movimentos' ||
    (textoLower.includes('entradas') && textoLower.includes('saídas')) ||
    (textoLower.includes('entradas') && textoLower.includes('saidas')) ||
    textoLower.includes('contas a pagar e a receber') ||
    textoLower.includes('pagar e receber do dia') ||
    textoLower.includes('contas do dia') ||
    textoLower.includes('títulos do dia') || textoLower.includes('titulos do dia') ||
    textoLower.includes('vencimentos do dia') || textoLower.includes('vencimentos de hoje') ||
    textoLower.includes('contas a pagar do dia') || textoLower.includes('contas a receber do dia') ||
    textoLower.includes('contas a pagar') || textoLower.includes('contas a receber') ||
    textoLower === '!contas' || textoLower === '!vencimentos' || textoLower === 'vencimentos' ||
    textoLower === 'contas hoje' || textoLower === '!contas hoje' ||
    textoLower === 'agenda financeira' || textoLower === 'compromissos hoje' ||
    textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === '!relatório' || textoLower === 'relatório' ||
    textoLower.includes('relatório executivo') || textoLower.includes('relatorio executivo') ||
    textoLower.includes('relatório diário') || textoLower.includes('relatorio diario')
  );

  // Resolução de administradores autorizados
  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/\D/g, ''))
    .filter(Boolean);
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
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: 'desconhecido',
        comando: textoMensagem,
        resultado: 'recusado_nao_autorizado',
        detalhes: { motivo: 'lid_nao_resolvivel' }
      });
      return true;
    }

    if (!remetenteEAdmin) {
      const perfilRemetente = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
      if (isComandoLeituraFinanceira || perfilRemetente.role === 'desconhecido') {
        await msg.reply('Olá! Sou o assistente do Pátio CRM. No momento, o atendimento automatizado está disponível apenas para motoristas e clientes com veículos em serviço ou administradores autorizados. Para mais informações, entre em contato diretamente com a nossa recepção.');
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'recusado_nao_autorizado',
          detalhes: { motivo: 'numero_desconhecido' }
        });
        return true;
      }
    }
  }

  // Sobrescrita de pendência se o mesmo administrador enviar um novo comando de escrita
  let prefixoSubstituicao = '';
  if (isComandoEscrita && confirmacoesPendentes.has(chavePendente)) {
    const pendenteAnt = confirmacoesPendentes.get(chavePendente);
    confirmacoesPendentes.delete(chavePendente);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'substituido_por_novo_comando',
      detalhes: { acaoAnterior: pendenteAnt.acao, valorAnterior: pendenteAnt.valor }
    });
    prefixoSubstituicao = `ℹ️ *Aviso:* A operação anterior não confirmada (${pendenteAnt.descricaoAcao || pendenteAnt.acao}) foi substituída por esta nova.\n\n`;
  }

  // ── 0. CONFIRMAÇÃO OU CANCELAMENTO DE AÇÃO FINANCEIRA PENDENTE ──
  if (!isComandoEscrita && confirmacoesPendentes.has(chavePendente)) {
    const pendente = confirmacoesPendentes.get(chavePendente);
    const agora = Date.now();

    if (agora > pendente.expiraEm) {
      confirmacoesPendentes.delete(chavePendente);
      const respExp = '⏳ *Operação Cancelada:* O prazo de 2 minutos para confirmação expirou. Por favor, envie o comando novamente se desejar realizar a operação.';
      await msg.reply(respExp);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'confirmacao_expirada',
        detalhes: { acao: pendente.acao, valor: pendente.valor }
      });
      return true;
    }

    const textoUpper = textoMensagem.toUpperCase().trim();
    const isConfirmacao = textoUpper === 'CONFIRMAR' || textoUpper === 'SIM';

    if (isConfirmacao) {
      // Lock atômico contra concorrência/duplo clique
      if (execucoesEmAndamento.has(chavePendente)) {
        console.warn(`[WhatsApp Confirmação] Execução concorrente ignorada para ${chavePendente}`);
        return true;
      }
      execucoesEmAndamento.add(chavePendente);
      confirmacoesPendentes.delete(chavePendente);

      let resOp = null;
      let msgSucesso = '';
      const agoraIso = new Date().toISOString();

      try {
        if (pendente.acao === 'abrir_caixa') {
          resOp = financialAnalystService.abrirCaixa(tenantState, {
            tenantId: tenantKey,
            saldoInicial: pendente.valor,
            operador: senderNorm,
            operadorNome: pendente.perfil?.role || 'Operador',
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            msgSucesso = `✅ *Caixa Aberto com Sucesso!*\n\n• Saldo Inicial: ${financialEngine.formatarMoeda(pendente.valor)}\n• Responsável: ${senderNorm}\n• Turno: #${resOp.caixa.id}`;
          } else {
            msgSucesso = `⚠️ Não foi possível abrir o caixa: ${resOp.error}`;
          }
        } else if (pendente.acao === 'fechar_caixa') {
          resOp = financialAnalystService.fecharCaixa(tenantState, {
            tenantId: tenantKey,
            operador: senderNorm,
            operadorNome: pendente.perfil?.role || 'Operador',
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            const rf = resOp.resumoFechamento || {};
            msgSucesso = `🔒 *Caixa Fechado com Sucesso!*\n\n• Saldo Final: ${financialEngine.formatarMoeda(rf.saldoFinalCalculado || resOp.caixaFechado?.saldoAtual || 0)}\n• Entradas: ${financialEngine.formatarMoeda(rf.totalEntradas || 0)}\n• Saídas: ${financialEngine.formatarMoeda(rf.totalSaidas || 0)}\n• Responsável: ${senderNorm}`;
          } else {
            msgSucesso = `⚠️ Não foi possível fechar o caixa: ${resOp.error}`;
          }
        } else if (pendente.acao === 'lancar_entrada') {
          resOp = financialAnalystService.registrarMovimentacao(tenantState, {
            tenantId: tenantKey,
            tipo: 'entrada',
            valor: pendente.valor,
            descricao: pendente.descricao,
            formaPagamento: pendente.formaPagamento,
            forma: pendente.formaPagamento,
            osId: pendente.osId,
            placa: pendente.placa,
            operador: senderNorm,
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            msgSucesso = `✅ *Entrada Registrada com Sucesso!*\n\n• Valor: ${financialEngine.formatarMoeda(pendente.valor)}\n• Descrição: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
          } else {
            msgSucesso = `⚠️ Não foi possível registrar a entrada: ${resOp.error}`;
          }
        } else if (pendente.acao === 'lancar_saida') {
          resOp = financialAnalystService.registrarMovimentacao(tenantState, {
            tenantId: tenantKey,
            tipo: 'saida',
            valor: pendente.valor,
            descricao: pendente.descricao,
            formaPagamento: pendente.formaPagamento,
            forma: pendente.formaPagamento,
            osId: pendente.osId,
            placa: pendente.placa,
            operador: senderNorm,
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            msgSucesso = `🔴 *Saída Registrada com Sucesso!*\n\n• Valor: ${financialEngine.formatarMoeda(pendente.valor)}\n• Descrição: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
          } else {
            msgSucesso = `⚠️ Não foi possível registrar a saída: ${resOp.error}`;
          }
        } else if (pendente.acao === 'estornar_movimento') {
          resOp = financialAnalystService.estornarMovimentacao(tenantState, {
            movimentoId: pendente.movimentoId,
            motivo: pendente.descricao,
            operador: senderNorm,
            operadorNome: `WhatsApp (${senderNorm})`,
            tenantId: tenantKey,
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm
          });
          if (resOp.ok) {
            msgSucesso = `↩️ *Estorno Realizado com Sucesso!*\n\n• Movimento Original: #${resOp.movimentoEstornado?.id} (Estornado)\n• Compensatório: #${resOp.movimentoCompensatorio?.id} (${financialEngine.formatarMoeda(resOp.movimentoCompensatorio?.valor)})\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoAtual != null ? resOp.saldoAtual : 0)}\n• Motivo: ${pendente.descricao}`;
            try {
              await recordSecurityAudit({
                tenantId: tenantKey,
                actorId: `whatsapp:${senderNorm}`,
                actorType: 'whatsapp_sender',
                action: 'financeiro:movimento:estornar',
                entity: 'movimento_financeiro',
                entityId: pendente.movimentoId,
                details: {
                  movimentoId: pendente.movimentoId,
                  compensatorioId: resOp.movimentoCompensatorio?.id,
                  valor: resOp.movimentoCompensatorio?.valor,
                  motivo: pendente.descricao,
                  origemOriginal: resOp.movimentoEstornado?.origem || 'web',
                  operador: senderNorm
                }
              });
            } catch (auditErr) {
              console.warn('[WhatsApp Estorno Audit] Falha não-bloqueante:', auditErr.message);
            }
          } else {
            msgSucesso = `⚠️ Não foi possível realizar o estorno: ${resOp.error}`;
          }
        } else if (pendente.acao === 'sangria_caixa') {
          resOp = financialAnalystService.registrarMovimentacao(tenantState, {
            tenantId: tenantKey,
            tipo: 'saida',
            subtipo: 'sangria',
            naturezaOperacao: 'sangria',
            valor: pendente.valor,
            descricao: pendente.descricao,
            formaPagamento: 'dinheiro',
            forma: 'dinheiro',
            categoria: 'Sangria de Caixa',
            operador: senderNorm,
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            msgSucesso = `🏦 *Sangria de Caixa Realizada com Sucesso!*\n\n• Valor Retirado: ${financialEngine.formatarMoeda(pendente.valor)}\n• Motivo: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
            try {
              await recordSecurityAudit({
                tenantId: tenantKey,
                actorId: `whatsapp:${senderNorm}`,
                actorType: 'whatsapp_sender',
                action: 'financeiro:caixa:sangria',
                entity: 'caixa_diario',
                entityId: resOp.caixa?.id || null,
                details: {
                  movimentoId: resOp.movimentacao?.id,
                  valor: pendente.valor,
                  motivo: pendente.descricao,
                  saldoRestante: resOp.saldoCaixaAtual,
                  operador: senderNorm
                }
              });
            } catch (auditErr) {
              console.warn('[WhatsApp Sangria Audit] Falha não-bloqueante:', auditErr.message);
            }
          } else {
            msgSucesso = `⚠️ Não foi possível realizar a sangria: ${resOp.error}`;
          }
        } else if (pendente.acao === 'suprimento_caixa') {
          resOp = financialAnalystService.registrarMovimentacao(tenantState, {
            tenantId: tenantKey,
            tipo: 'entrada',
            subtipo: 'suprimento',
            naturezaOperacao: 'suprimento',
            valor: pendente.valor,
            descricao: pendente.descricao,
            formaPagamento: 'dinheiro',
            forma: 'dinheiro',
            categoria: 'Suprimento de Caixa',
            operador: senderNorm,
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            msgSucesso = `🪙 *Suprimento de Caixa Realizado com Sucesso!*\n\n• Valor Aportado: ${financialEngine.formatarMoeda(pendente.valor)}\n• Motivo: ${pendente.descricao}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
            try {
              await recordSecurityAudit({
                tenantId: tenantKey,
                actorId: `whatsapp:${senderNorm}`,
                actorType: 'whatsapp_sender',
                action: 'financeiro:caixa:suprimento',
                entity: 'caixa_diario',
                entityId: resOp.caixa?.id || null,
                details: {
                  movimentoId: resOp.movimentacao?.id,
                  valor: pendente.valor,
                  motivo: pendente.descricao,
                  saldoAtual: resOp.saldoCaixaAtual,
                  operador: senderNorm
                }
              });
            } catch (auditErr) {
              console.warn('[WhatsApp Suprimento Audit] Falha não-bloqueante:', auditErr.message);
            }
          } else {
            msgSucesso = `⚠️ Não foi possível registrar o suprimento: ${resOp.error}`;
          }
        } else if (pendente.acao === 'liquidar_titulo') {
          resOp = financialAnalystService.liquidarTituloFinanceiro(tenantState, {
            tenantId: tenantKey,
            id: pendente.tituloId,
            meioPagamento: pendente.formaPagamento,
            operador: senderNorm,
            origem: 'whatsapp',
            canal: 'whatsapp',
            autorNumero: senderNorm,
            confirmadoEm: agoraIso
          });
          if (resOp.ok) {
            const tit = resOp.titulo;
            const isReceber = tit.tipo === 'receber';
            msgSucesso = `✅ *Título Liquidado com Sucesso!*\n\n• Título: #${tit.id} (${isReceber ? 'Recebimento' : 'Pagamento'})\n• Descrição: ${tit.desc || tit.descricao || '-'}\n• Valor: ${financialEngine.formatarMoeda(tit.valor)}\n• Forma: ${String(tit.meioLiquidacao || pendente.formaPagamento).toUpperCase()}\n• Saldo Atual do Caixa: ${financialEngine.formatarMoeda(resOp.saldoCaixaAtual || 0)}`;
            try {
              await recordSecurityAudit({
                tenantId: tenantKey,
                actorId: `whatsapp:${senderNorm}`,
                actorType: 'whatsapp_sender',
                action: 'financeiro:titulo:liquidar',
                entity: 'contas_financeiras',
                entityId: tit.id,
                details: {
                  tituloId: tit.id,
                  tipo: tit.tipo,
                  valor: tit.valor,
                  meioPagamento: tit.meioLiquidacao,
                  movimentoId: resOp.movimentacao?.id,
                  saldoCaixaAtual: resOp.saldoCaixaAtual,
                  operador: senderNorm,
                  origem: 'whatsapp'
                }
              });
            } catch (auditErr) {
              console.warn('[WhatsApp Liquidar Titulo Audit] Falha não-bloqueante:', auditErr.message);
            }
          } else {
            msgSucesso = `⚠️ Não foi possível liquidar o título: ${resOp.error}`;
          }
        } else if (pendente.acao === 'liberar_saida_os') {
          resOp = financialAnalystService.validarOuAutorizarSaidaPatioOS(tenantState, {
            osId: pendente.osId,
            forcarLiberacao: true,
            justificativa: pendente.justificativa,
            operador: {
              perfil: pendente.perfil?.role || 'dono',
              nome: `WhatsApp (${senderNorm})`,
              numero: senderNorm
            }
          });
          if (resOp.ok && resOp.autorizado) {
            msgSucesso = `🔓 *Liberação Excepcional de Pátio Concedida!*\n\n• OS: #${resOp.osId}\n• Status: Liberado em Exceção\n• Saldo Pendente: ${financialEngine.formatarMoeda(resOp.saldoRestante || 0)}\n• Justificativa: ${pendente.justificativa}\n• Autorizado por: ${resOp.liberacaoExcepcional?.autorizadoPor}`;
            try {
              await recordSecurityAudit({
                tenantId: tenantKey,
                actorId: `whatsapp:${senderNorm}`,
                actorType: 'whatsapp_sender',
                action: 'financeiro:os:liberar_saida_excepcional',
                entity: 'ordem_servico',
                entityId: String(resOp.osId),
                details: {
                  osId: resOp.osId,
                  saldoPendenteNaSaida: resOp.saldoRestante,
                  justificativa: pendente.justificativa,
                  perfil: pendente.perfil?.role || 'dono',
                  autorizadoPor: `WhatsApp (${senderNorm})`,
                  origem: 'whatsapp'
                }
              });
            } catch (auditErr) {
              console.warn('[WhatsApp Liberar OS Audit] Falha não-bloqueante:', auditErr.message);
            }
          } else {
            msgSucesso = `⚠️ Não foi possível autorizar a liberação da OS: ${resOp.error || resOp.message}`;
          }
        }

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha tolerante ao persistir estado:', errPersist.message);
        }
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: resOp && resOp.ok ? 'sucesso' : 'falha_execucao',
          detalhes: {
            acao: pendente.acao,
            valor: pendente.valor,
            descricao: pendente.descricao,
            origem: 'whatsapp',
            confirmadoEm: agoraIso
          }
        });
      } finally {
        execucoesEmAndamento.delete(chavePendente);
      }
      return true;
    } else {
      // Qualquer outra resposta cancela imediatamente
      confirmacoesPendentes.delete(chavePendente);
      const respCancel = `❌ *Operação Cancelada:* A operação de ${pendente.descricaoAcao || pendente.acao} no valor de ${financialEngine.formatarMoeda(pendente.valor)} foi cancelada.`;
      await msg.reply(respCancel);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'cancelado',
        detalhes: { acao: pendente.acao, valor: pendente.valor, respostaRecebida: textoMensagem }
      });
      return true;
    }
  }

  // ── COMANDOS OPERACIONAIS DE PÁTIO, BOXES & APONTAMENTO (FRENTE 5B) ──
  if (isComandoOperacionalPatio) {
    const perfil = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
    const roleNorm = (perfil?.role || '').toLowerCase();
    const perfisPermitidos = [
      'mecanico', 'atendente', 'consultor', 'financeiro', 'gerente',
      'admin', 'tenant_admin', 'dono', 'owner', 'platform_admin'
    ];

    if (!perfisPermitidos.includes(roleNorm)) {
      const respNeg = `🔒 *Acesso Negado:* Seu perfil de usuário (${perfil?.role || 'desconhecido'}) não possui permissão para comandos de chão de oficina e pátio.`;
      await msg.reply(respNeg);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'negado_permissao',
        detalhes: { perfil: perfil?.role, tipo: 'patio' }
      });
      return true;
    }

    // 1. Comando: box <num_box> os <id> [mecanico]
    if (isComandoBoxOS && matchBoxOS) {
      const boxParam = matchBoxOS[1].trim();
      const osParam = matchBoxOS[2].trim();
      const mecParam = (matchBoxOS[3] || '').trim() || null;

      try {
        const resAloc = financialAnalystService.alocarBoxOS(tenantState, {
          osId: osParam,
          boxId: boxParam,
          mecanico: mecParam,
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir alocação de box:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:alocar_box',
            entity: 'ordem_servico',
            entityId: String(resAloc.os.id),
            details: {
              osId: resAloc.os.id,
              boxId: resAloc.box.id,
              mecanico: resAloc.os.mecanico,
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgSucesso = `✅ *Alocação de Box Confirmada!* 🏗️\n\n• *OS:* #${resAloc.os.num || resAloc.os.id}\n• *Box:* ${resAloc.box.nome || resAloc.box.id}\n${resAloc.os.mecanico ? `• *Mecânico:* ${resAloc.os.mecanico}\n` : ''}• *Status Pátio:* ${resAloc.resumoBoxes.ocupados}/${resAloc.resumoBoxes.total} boxes ocupados (${resAloc.resumoBoxes.livres} livres)`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resAloc.os.id, boxId: resAloc.box.id }
        });
        return true;
      } catch (err) {
        const msgErro = err.code === 'BOX_JA_OCUPADO'
          ? `⚠️ *Box Ocupado:* ${err.message}`
          : `⚠️ *Não foi possível alocar no box:* ${err.message}`;
        await msg.reply(msgErro);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: err.code === 'BOX_JA_OCUPADO' ? 'conflito_box_ocupado' : 'falha',
          detalhes: { erro: err.message, code: err.code }
        });
        return true;
      }
    }

    // 2. Comando: iniciar os <id> [box <n>]
    if (isComandoIniciarOS && matchIniciarOS) {
      const osParam = matchIniciarOS[1].trim();
      const boxParam = (matchIniciarOS[2] || '').trim() || null;

      try {
        const resApont = financialAnalystService.registrarApontamentoPatioOS(tenantState, {
          osId: osParam,
          acao: 'iniciar',
          boxId: boxParam,
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir apontamento iniciar:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:apontamento',
            entity: 'ordem_servico',
            entityId: String(resApont.os.id),
            details: { osId: resApont.os.id, acao: 'iniciar', boxId: resApont.os.boxId, origem: 'whatsapp' }
          });
        } catch (_) {}

        const agoraSP = financialEngine.obterAgoraSP();
        const msgSucesso = `⚙️ *Execução Iniciada!* 🔧\n\n• *OS:* #${resApont.os.num || resApont.os.id}\n• *Etapa:* Em Execução\n${resApont.os.boxId ? `• *Box:* ${resApont.os.boxId}\n` : ''}${resApont.os.mecanico ? `• *Mecânico:* ${resApont.os.mecanico}\n` : ''}• *Horário:* ${agoraSP.horaBR}`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resApont.os.id, acao: 'iniciar' }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao iniciar OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 3. Comando: pausar os <id> <motivo>
    if (isComandoPausarOS && matchPausarOS) {
      const osParam = matchPausarOS[1].trim();
      const motivoParam = (matchPausarOS[2] || '').trim();

      if (!motivoParam || motivoParam.length < 3) {
        await msg.reply('⚠️ Formato inválido. Use: *pausar os <id> <motivo>* (ex: *pausar os 101 aguardando feixe de mola*).');
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'formato_invalido'
        });
        return true;
      }

      try {
        const resApont = financialAnalystService.registrarApontamentoPatioOS(tenantState, {
          osId: osParam,
          acao: 'pausar',
          motivo: motivoParam,
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir pausa de OS:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:apontamento',
            entity: 'ordem_servico',
            entityId: String(resApont.os.id),
            details: { osId: resApont.os.id, acao: 'pausar', motivo: motivoParam, origem: 'whatsapp' }
          });
        } catch (_) {}

        const agoraSP = financialEngine.obterAgoraSP();
        const msgSucesso = `⏸️ *OS Pausada (Gargalo Registrado)* ⚠️\n\n• *OS:* #${resApont.os.num || resApont.os.id}\n• *Motivo:* ${resApont.motivoPausa}\n• *Status do Box:* Bloqueado por Peça/Gargalo\n• *Horário:* ${agoraSP.horaBR}`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resApont.os.id, acao: 'pausar', motivo: motivoParam }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao pausar OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 4. Comando: finalizar os <id> ou pronto os <id>
    if (isComandoFinalizarOS && matchFinalizarOS) {
      const osParam = matchFinalizarOS[1].trim();

      try {
        const resApont = financialAnalystService.registrarApontamentoPatioOS(tenantState, {
          osId: osParam,
          acao: 'finalizar',
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir finalização de OS:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:apontamento',
            entity: 'ordem_servico',
            entityId: String(resApont.os.id),
            details: { osId: resApont.os.id, acao: 'finalizar', origem: 'whatsapp' }
          });
        } catch (_) {}

        const agoraSP = financialEngine.obterAgoraSP();
        const msgSucesso = `✅ *OS Concluída no Pátio!* 🚗\n\n• *OS:* #${resApont.os.num || resApont.os.id}\n• *Etapa:* Pronto p/ Retirada\n• *Box:* Liberado no Pátio\n• *Horário:* ${agoraSP.horaBR}`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resApont.os.id, acao: 'finalizar' }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao finalizar OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 5. Consulta: gargalos / radar patio / status boxes
    if (isComandoRadarGargalos) {
      const radar = financialAnalystService.obterRadarGargalosPatio(tenantState);
      let respGargalos = `🚨 *RADAR OPERACIONAL DE GARGALOS & PÁTIO* 🏗️\n\n`;
      respGargalos += `📊 *Ocupação de Boxes:*\n`;
      respGargalos += `• Total: ${radar.resumoBoxes.total} | Livres: ${radar.resumoBoxes.livres} | Ocupados: ${radar.resumoBoxes.ocupados} | Bloqueados: ${radar.resumoBoxes.bloqueados}\n\n`;

      if (radar.osPausadasGargalo.length > 0) {
        respGargalos += `⏸️ *OSs Paradas em Gargalo (${radar.osPausadasGargalo.length}):*\n`;
        for (const g of radar.osPausadasGargalo) {
          respGargalos += `• *OS #${g.num}* (${g.placa}) - Box: ${g.boxId}\n`;
          respGargalos += `  _Motivo:_ ${g.motivoPausa} (${g.tempoPausaMinutos} min)\n`;
        }
        respGargalos += `\n`;
      } else {
        respGargalos += `✅ *Nenhuma OS travada por gargalo no momento!*\n\n`;
      }

      if (radar.osProntasRetidasFinanceiro.length > 0) {
        respGargalos += `🔒 *OSs Prontas Retidas no Financeiro (${radar.osProntasRetidasFinanceiro.length}):*\n`;
        for (const r of radar.osProntasRetidasFinanceiro) {
          respGargalos += `• *OS #${r.num}* (${r.placa}) - ${r.cliente}\n`;
          respGargalos += `  _Saldo Pendente:_ ${financialEngine.formatarMoeda(r.saldoRestante)}\n`;
        }
        respGargalos += `\n`;
      } else {
        respGargalos += `✅ *Nenhum veículo pronto retido por pendência financeira!*\n\n`;
      }

      await msg.reply(respGargalos.trim());
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: {
          boxesTotal: radar.resumoBoxes.total,
          gargalosTotal: radar.osPausadasGargalo.length,
          retidasTotal: radar.osProntasRetidasFinanceiro.length
        }
      });
      return true;
    }

    // 6. Comando: estoque [termo] ou consultar peca <termo>
    if (isComandoConsultaEstoque && matchEstoque) {
      const termoParam = (matchEstoque[1] || '').trim();
      const resultadoEst = financialAnalystService.listarEstoquePecas(tenantState, { termo: termoParam });

      let respEst = `📦 *Catálogo de Estoque & Peças* 🔩\n`;
      if (termoParam) respEst += `_Filtro aplicado:_ "${termoParam}"\n`;
      respEst += `\n`;

      if (resultadoEst.pecas.length === 0) {
        respEst += `Nenhum item localizado no estoque para o filtro informado.\n`;
      } else {
        for (const p of resultadoEst.pecas.slice(0, 8)) {
          const alertaCritico = p.quantidade <= p.estoqueMinimo ? ` ⚠️ *CRÍTICO*` : '';
          respEst += `• *[${p.codigo}]* ${p.nome}\n`;
          respEst += `  Saldo: *${p.quantidade} un* (Mín: ${p.estoqueMinimo})${alertaCritico} | Preço: ${financialEngine.formatarMoeda(p.precoVenda)}\n`;
        }
        if (resultadoEst.pecas.length > 8) {
          respEst += `_... e mais ${resultadoEst.pecas.length - 8} item(ns) cadastrados._\n`;
        }
      }

      respEst += `\n📊 *Resumo Geral:* ${resultadoEst.resumoEstoque.totalItens} itens únicos | ${resultadoEst.resumoEstoque.itensAbaixoMinimo} abaixo do mínimo | Custo total: ${financialEngine.formatarMoeda(resultadoEst.resumoEstoque.valorTotalCusto)}`;

      await msg.reply(respEst.trim());
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { termo: termoParam, totalEncontrado: resultadoEst.pecas.length }
      });
      return true;
    }

    // 7. Comando: peca os <osId> <qtd> <nome_ou_codigo>
    if (isComandoRequisitarPeca && matchRequisitarPeca) {
      const osParam = matchRequisitarPeca[1].trim();
      const qtdParam = parseFloat(matchRequisitarPeca[2].replace(',', '.'));
      const pecaParam = matchRequisitarPeca[3].trim();

      try {
        const resReq = financialAnalystService.requisitarPecaOS(tenantState, {
          osId: osParam,
          pecaIdOuNome: pecaParam,
          quantidade: qtdParam,
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir requisição de peça:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:requisitar_peca',
            entity: 'ordem_servico',
            entityId: String(resReq.osId),
            details: {
              osId: resReq.osId,
              peca: resReq.peca,
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgSucesso = `🔩 *Peça Requisitada na OS!* 📦\n\n• *OS:* #${resReq.osNum}\n• *Peça:* ${resReq.peca.quantidade}x ${resReq.peca.nome}\n• *Subtotal:* ${financialEngine.formatarMoeda(resReq.peca.subtotal)}\n• *Saldo em Estoque:* ${resReq.saldoEstoqueRestante != null ? `${resReq.saldoEstoqueRestante} un` : 'Avulso'}\n• *Total Peças da OS:* ${financialEngine.formatarMoeda(resReq.totalPecasOS)}`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resReq.osId, peca: resReq.peca.nome, quantidade: qtdParam }
        });
        return true;
      } catch (err) {
        const msgErro = err.code === 'ESTOQUE_INSUFICIENTE'
          ? `⚠️ *Estoque Insuficiente:* ${err.message}`
          : `⚠️ *Não foi possível requisitar a peça:* ${err.message}`;
        await msg.reply(msgErro);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: err.code === 'ESTOQUE_INSUFICIENTE' ? 'estoque_insuficiente' : 'falha',
          detalhes: { erro: err.message, code: err.code }
        });
        return true;
      }
    }

    // 8. Comando: chegou peca os <osId> [obs] ou retomar os <osId>
    if (isComandoLiberarGargalo && matchLiberarGargalo) {
      const osParam = matchLiberarGargalo[1].trim();
      const obsParam = (matchLiberarGargalo[2] || '').trim();

      try {
        const resLib = financialAnalystService.liberarGargaloPecaOS(tenantState, {
          osId: osParam,
          observacao: obsParam || 'Peça chegou via WhatsApp',
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir liberação de gargalo:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:liberar_gargalo_peca',
            entity: 'ordem_servico',
            entityId: String(resLib.osId),
            details: {
              osId: resLib.osId,
              boxId: resLib.boxId,
              boxStatus: resLib.boxStatus,
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgSucesso = `🚀 *Gargalo Desbloqueado! OS Retomada* ⚙️\n\n• *OS:* #${resLib.osNum}\n• *Etapa:* Em Execução\n• *Box:* ${resLib.boxId || 'N/A'} (Status: ${resLib.boxStatus || 'ocupado'})\n• *Aviso:* Veículo liberado para avanço mecânico no pátio.`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resLib.osId, boxId: resLib.boxId }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao liberar gargalo da OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 9. Comando: devolver peca os <osId> <nome_ou_codigo> (Frente 7B)
    if (isComandoDevolverPeca && matchDevolverPeca) {
      const osParam = matchDevolverPeca[1].trim();
      const pecaParam = matchDevolverPeca[2].trim();

      try {
        const resEstorno = financialAnalystService.estornarPecaOS(tenantState, {
          osId: osParam,
          itemIndexOuPecaId: pecaParam,
          motivo: 'Devolução solicitada via WhatsApp',
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir estorno de peça:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:estornar_peca',
            entity: 'ordem_servico',
            entityId: String(resEstorno.osId),
            details: {
              osId: resEstorno.osId,
              pecaDevolvida: resEstorno.pecaDevolvida,
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgSucesso = `↩️ *Peça Devolvida ao Estoque!* 📦\n\n• *OS:* #${resEstorno.osNum}\n• *Item:* ${resEstorno.pecaDevolvida?.nome || pecaParam} (${resEstorno.pecaDevolvida?.quantidade || 1} un)\n• *Saldo Estoque Atual:* ${resEstorno.saldoEstoqueRestante != null ? `${resEstorno.saldoEstoqueRestante} un` : 'N/A'}\n• *Novo Total Peças da OS:* ${financialEngine.formatarMoeda(resEstorno.totalPecasOS)}`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resEstorno.osId, item: pecaParam }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao devolver peça:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 10. Comando: checklist os <osId> ok [obs] ou vistoria os <osId> ok
    if (isComandoChecklistOk && matchChecklistOk) {
      const osParam = matchChecklistOk[1].trim();
      const obsParam = (matchChecklistOk[2] || '').trim();

      try {
        const resChk = financialAnalystService.registrarChecklistTecnicoOS(tenantState, {
          osId: osParam,
          modo: 'aprovar_todos',
          observacao: obsParam || 'Vistoria aprovada via WhatsApp',
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir aprovação de checklist:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:checklist_tecnico',
            entity: 'ordem_servico',
            entityId: String(resChk.osId),
            details: {
              osId: resChk.osId,
              statusChecklist: 'aprovado',
              modo: 'aprovar_todos',
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgSucesso = `🛡️ *VISTORIA TÉCNICA APROVADA!* ✅\n\n• *OS:* #${resChk.num}\n• *Placa:* ${resChk.placa}\n• *Status:* 100% Aprovado nos 5 itens de suspensão e freios\n• *Avaliador:* WhatsApp (${senderNorm})\n\n_Veículo liberado nos padrões técnicos para conclusão e rodagem._`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resChk.osId, status: 'aprovado' }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao aprovar checklist da OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 11. Comando: checklist os <osId> falha <motivo>
    if (isComandoChecklistFalha && matchChecklistFalha) {
      const osParam = matchChecklistFalha[1].trim();
      const motivoFalha = (matchChecklistFalha[2] || '').trim() || 'Falha de segurança apontada via WhatsApp';

      try {
        const resChk = financialAnalystService.registrarChecklistTecnicoOS(tenantState, {
          osId: osParam,
          modo: 'reprovar',
          itemFalha: motivoFalha,
          observacao: motivoFalha,
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir reprovação de checklist:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:checklist_tecnico',
            entity: 'ordem_servico',
            entityId: String(resChk.osId),
            details: {
              osId: resChk.osId,
              statusChecklist: 'reprovado_critico',
              modo: 'reprovar',
              motivoFalha,
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgFalha = `⚠️ *VISTORIA TÉCNICA REPROVADA!* ❌\n\n• *OS:* #${resChk.num}\n• *Placa:* ${resChk.placa}\n• *Status:* REPROVADO CRÍTICO\n• *Motivo/Item:* ${motivoFalha}\n• *Avaliador:* WhatsApp (${senderNorm})\n\n🚨 *Atenção:* A finalização mecânica desta OS está bloqueada até a correção dos itens e nova aprovação técnica.`;
        await msg.reply(msgFalha);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso_reprovado',
          detalhes: { osId: resChk.osId, status: 'reprovado_critico', motivoFalha }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao reprovar checklist da OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 12. Comando: laudo os <osId> ou checklist os <osId>
    if (isComandoConsultaLaudo && matchConsultaLaudo) {
      const osParam = matchConsultaLaudo[1].trim();

      try {
        const resChk = financialAnalystService.obterChecklistTecnicoOS(tenantState, osParam);
        await msg.reply(resChk.laudoTextoWhatsapp);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resChk.osId, status: resChk.statusChecklist }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Não foi possível consultar o laudo da OS:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 13. Comando: garantia placa <placa> ou historico placa <placa>
    if (isComandoGarantiaPlaca && matchGarantiaPlaca) {
      const placaParam = matchGarantiaPlaca[1].trim();

      try {
        const dossie = financialAnalystService.obterHistoricoGarantiaPlaca(tenantState, placaParam);
        await msg.reply(dossie.dossieTextoWhatsapp);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { placa: placaParam, emGarantiaAtiva: dossie.emGarantiaAtiva, totalOS: dossie.totalOS }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Não foi possível consultar o histórico da placa:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 14. Comando: garantia os <osId> origem <osOrigemId> <motivo>
    if (isComandoVinculoGarantiaOS && matchVinculoGarantiaOS) {
      const osParam = matchVinculoGarantiaOS[1].trim();
      const origemParam = matchVinculoGarantiaOS[2].trim();
      const motivoParam = (matchVinculoGarantiaOS[3] || '').trim() || 'Retorno para reparo coberto por garantia';

      try {
        const resGarantia = financialAnalystService.registrarRetornoGarantiaOS(tenantState, {
          osId: osParam,
          osOrigemId: origemParam,
          motivoGarantia: motivoParam,
          isentarCobranca: true,
          operador: {
            actorId: `whatsapp:${senderNorm}`,
            nome: `WhatsApp (${senderNorm})`
          }
        });

        try {
          await salvarEstado(tenantKey, tenantState);
        } catch (errPersist) {
          console.warn('[WhatsApp Handlers] Falha ao persistir retorno em garantia:', errPersist.message);
        }

        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'patio:os:retorno_garantia',
            entity: 'ordem_servico',
            entityId: String(resGarantia.osId),
            details: {
              osId: resGarantia.osId,
              osOrigemId: resGarantia.osOrigemGarantiaId,
              motivoGarantia: resGarantia.motivoGarantia,
              origem: 'whatsapp'
            }
          });
        } catch (_) {}

        const msgSucesso = `🛡️ *RETORNO EM GARANTIA VINCULADO!* 🔄\n\n• *OS Atual:* #${resGarantia.num}\n• *OS Origem:* #${resGarantia.osOrigemGarantiaId}\n• *Placa:* ${resGarantia.placa}\n• *Motivo:* ${resGarantia.motivoGarantia}\n• *Status de Liberação:* 🛡️ Liberado (Garantia)\n• *Cobrança:* Isenta na Portaria`;
        await msg.reply(msgSucesso);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'sucesso',
          detalhes: { osId: resGarantia.osId, osOrigemId: resGarantia.osOrigemGarantiaId }
        });
        return true;
      } catch (err) {
        await msg.reply(`⚠️ *Falha ao vincular retorno em garantia:* ${err.message}`);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'falha',
          detalhes: { erro: err.message }
        });
        return true;
      }
    }

    // 15. Comando: relatorio semanal / produtividade semana (Frente 10B)
    if (isComandoRelatorioSemanal) {
      const agoraSP = financialEngine.obterAgoraSP();
      const biSemanal = financialAnalystService.calcularProdutividadeEComissoes(tenantState, {
        periodo: 'semanal',
        dataRef: agoraSP.dataISO
      });
      const textoBoletim = financialAnalystService.formatarBoletimProdutividadeWhatsapp(biSemanal);
      await msg.reply(textoBoletim);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { tipo: 'bi_relatorio_semanal', totalOSConcluidas: biSemanal.resumo?.totalOSConcluidas, totalMaoDeObra: biSemanal.resumo?.totalMaoDeObra }
      });
      return true;
    }

    // 16. Comando: relatorio mensal / fechamento mes (Frente 10B)
    if (isComandoRelatorioMensal) {
      const agoraSP = financialEngine.obterAgoraSP();
      const biMensal = financialAnalystService.calcularProdutividadeEComissoes(tenantState, {
        periodo: 'mensal',
        dataRef: agoraSP.dataISO
      });
      const textoBoletim = financialAnalystService.formatarBoletimProdutividadeWhatsapp(biMensal);
      await msg.reply(textoBoletim);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { tipo: 'bi_relatorio_mensal', totalOSConcluidas: biMensal.resumo?.totalOSConcluidas, totalMaoDeObra: biMensal.resumo?.totalMaoDeObra }
      });
      return true;
    }

    // 17. Comando: comissoes / minha comissao (Frente 10B)
    if (isComandoComissoes) {
      const agoraSP = financialEngine.obterAgoraSP();
      const bi = financialAnalystService.calcularProdutividadeEComissoes(tenantState, {
        periodo: 'mensal',
        dataRef: agoraSP.dataISO
      });

      // Tenta localizar o mecânico associado ao número do remetente
      const workersList = Array.isArray(tenantState?.workers) ? tenantState.workers : (Array.isArray(tenantState?.mecanicos) ? tenantState.mecanicos : []);
      const senderWorker = workersList.find(w => {
        const fone = normalizePhone(w.fone || w.telefone || w.phone || '');
        return fone === senderNorm;
      });

      const nomeAlvo = senderWorker ? (senderWorker.nome || senderWorker.name) : (perfil?.nome || perfil?.fullName || '');
      let mecDados = null;
      if (nomeAlvo) {
        mecDados = bi.produtividadeMecanicos.find(m =>
          m.mecanico.toLowerCase().includes(nomeAlvo.toLowerCase()) ||
          nomeAlvo.toLowerCase().includes(m.mecanico.toLowerCase())
        );
      }

      if (mecDados) {
        const textoExtrato = financialAnalystService.formatarExtratoComissaoWhatsapp(mecDados, bi.periodo);
        await msg.reply(textoExtrato);
      } else {
        let txtComissoes = `🤝 *EXTRATO DE COMISSÕES — FECHAMENTO MENSAL* 💰\n`;
        const deBR = financialEngine.formatarDataBR(bi.periodo.de);
        const ateBR = financialEngine.formatarDataBR(bi.periodo.ate);
        txtComissoes += `📅 *Período:* ${deBR} a ${ateBR}\n\n`;

        if (bi.produtividadeMecanicos.length === 0) {
          txtComissoes += `Nenhum mecânico com comissão apurada no período.`;
        } else {
          bi.produtividadeMecanicos.forEach((m, idx) => {
            txtComissoes += `${idx + 1}. *${m.mecanico}*: ${financialEngine.formatarMoeda(m.valorComissao)} (${m.percentualComissao}%)\n`;
            txtComissoes += `   └ Base: ${financialEngine.formatarMoeda(m.maoDeObraComissionavel)} em ${m.totalOSConcluidas} OS(s) finalizada(s)\n`;
          });
          txtComissoes += `\n💵 *Total de Comissões da Equipe:* ${financialEngine.formatarMoeda(bi.resumo.totalComissoes)}`;
        }
        await msg.reply(txtComissoes.trim());
      }

      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'sucesso',
        detalhes: { tipo: 'bi_consulta_comissoes', totalComissoes: bi.resumo.totalComissoes }
      });
      return true;
    }
  }

  // ── COMANDOS DE ESCRITA FINANCEIRA (ABRIR/FECHAR CAIXA, LANÇAR ENTRADA/SAÍDA) ──
  if (isComandoEscrita) {
    // 0. Flag comandosFinanceirosEscrita (padrão false, editável por /config-relatorio)
    const escritaAtiva = Boolean(tenantState?.cfg?.comandosFinanceirosEscrita);
    if (!escritaAtiva) {
      const respDesativada = '🔒 *Operações Financeiras Desativadas:* Os comandos de movimentação e escrita financeira via WhatsApp estão desativados nas configurações. Para ativá-los, acesse as Configurações do WhatsApp no Pátio CRM Web.';
      await msg.reply(respDesativada);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'desativado_configuracao',
        detalhes: { flag: 'comandosFinanceirosEscrita', ativo: false }
      });
      return true;
    }

    // 1. Whitelist obrigatória se vier de grupo
    const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    if (tenantState?.cfg?.adminFones && Array.isArray(tenantState.cfg.adminFones)) {
      tenantState.cfg.adminFones.forEach(f => {
        const clean = String(f).replace(/\D/g, '');
        if (clean && !adminList.includes(clean)) adminList.push(clean);
      });
    }
    const remetenteNaWhitelist = isAdminPhone(senderNorm, adminList);

    if (isGroupMsg && !remetenteNaWhitelist) {
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

    // 2. Perfil do número: deve ser dono ou financeiro. Atendente e mecânico não executam escrita
    const perfil = await obterPerfilNumeroWhatsApp({ tenantKey, numero: senderNorm, tenantState });
    if (isComandoEstorno || isComandoLiberarOS) {
      if (!podeExecutarEstorno(perfil)) {
        const acaoMsg = isComandoLiberarOS ? 'conceder liberação excepcional de pátio' : 'realizar estorno de movimentações financeiras';
        const respNeg = `🔒 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para ${acaoMsg}. Esta ação é restrita exclusivamente ao Dono/Administrador.`;
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
      const respNeg = `🔒 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para realizar operações de escrita no caixa. Esta operação é restrita a Donos e Financeiro.`;
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

    // 3. Validação dos parâmetros e geração da confirmação
    if (isComandoAbrirCaixa) {
      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (caixaAberto) {
        const respJaAberto = `⚠️ Já existe um caixa aberto no momento (#${caixaAberto.id}). Feche o caixa atual antes de iniciar um novo turno.`;
        await msg.reply(respJaAberto);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_caixa_ja_aberto' });
        return true;
      }

      const resValor = extrairValorMonetario(textoMensagem);
      if (resValor.status === 'ausente') {
        const respPedeVal = '⚠️ Não identifiquei o saldo inicial em dinheiro para a abertura do caixa. Por favor, informe o comando com o valor (ex: *Abrir caixa com R$ 100,00*).';
        await msg.reply(respPedeVal);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ausente' } });
        return true;
      }
      if (resValor.status === 'ambiguo') {
        const respAmbiguo = '⚠️ Identifiquei múltiplos valores no comando. Para evitar divergência no caixa, por favor informe o comando com um único valor (ex: *Abrir caixa com R$ 100,00*).';
        await msg.reply(respAmbiguo);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ambiguo', valores: resValor.valores } });
        return true;
      }

      const valorFinal = resValor.valor;
      const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
      const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

      if (valorFinal > limiteMax) {
        const respLimite = `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido para operações via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Por questões de segurança, realize esta abertura diretamente pelo painel do Pátio CRM Web.`;
        await msg.reply(respLimite);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_limite',
          detalhes: { acao: 'abrir_caixa', valor: valorFinal, limite: limiteMax }
        });
        return true;
      }

      confirmacoesPendentes.set(chavePendente, {
        acao: 'abrir_caixa',
        descricaoAcao: 'Abertura de Caixa',
        valor: valorFinal,
        descricao: 'Abertura de caixa com saldo inicial',
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\n` +
        `Por favor, confira os dados da operação:\n` +
        `• *Ação:* Abertura de Caixa\n` +
        `• *Valor:* ${financialEngine.formatarMoeda(valorFinal)}\n` +
        `• *Descrição:* Abertura de caixa com saldo inicial\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'abrir_caixa', valor: valorFinal } });
      return true;
    }

    if (isComandoFecharCaixa) {
      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (!caixaAberto) {
        const respSemCaixa = '⚠️ Não há nenhum turno de caixa aberto no momento para ser encerrado.';
        await msg.reply(respSemCaixa);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
        return true;
      }

      const valorFinal = caixaAberto.saldoAtual || 0;
      confirmacoesPendentes.set(chavePendente, {
        acao: 'fechar_caixa',
        descricaoAcao: 'Fechamento de Caixa',
        valor: valorFinal,
        descricao: `Fechamento do Caixa #${caixaAberto.id}`,
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\n` +
        `Por favor, confira os dados da operação:\n` +
        `• *Ação:* Fechamento de Caixa\n` +
        `• *Valor em Caixa:* ${financialEngine.formatarMoeda(valorFinal)}\n` +
        `• *Descrição:* Fechamento do Caixa #${caixaAberto.id}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'fechar_caixa', valor: valorFinal } });
      return true;
    }

    if (isComandoEntrada) {
      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (!caixaAberto) {
        const respSemCaixa = '⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de registrar entradas.';
        await msg.reply(respSemCaixa);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
        return true;
      }

      const resValor = extrairValorMonetario(textoMensagem);
      if (resValor.status === 'ausente') {
        const respPedeVal = '⚠️ Não identifiquei o valor exato para o lançamento de entrada. Por favor, envie o comando com valor e descrição (ex: *Lançar entrada de R$ 150,00 referente a adiantamento*).';
        await msg.reply(respPedeVal);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ausente' } });
        return true;
      }
      if (resValor.status === 'ambiguo') {
        const respAmbiguo = '⚠️ Identifiquei múltiplos valores no comando. Para evitar divergência no caixa, por favor informe o comando com um único valor (ex: *Lançar entrada de R$ 150,00 referente a adiantamento*).';
        await msg.reply(respAmbiguo);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ambiguo', valores: resValor.valores } });
        return true;
      }

      const valorFinal = resValor.valor;
      const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
      const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

      if (valorFinal > limiteMax) {
        const respLimite = `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido para operações via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Por questões de segurança, realize este lançamento diretamente pelo painel do Pátio CRM Web.`;
        await msg.reply(respLimite);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_limite',
          detalhes: { acao: 'lancar_entrada', valor: valorFinal, limite: limiteMax }
        });
        return true;
      }

      const matchDesc = textoMensagem.match(/(?:referente\s+a|motivo|para|com|descrição|descricao)\s+(.+)$/i);
      const descricaoFinal = matchDesc ? matchDesc[1].trim() : 'Entrada avulsa no caixa';
      const formaPagamentoFinal = extrairFormaPagamentoHeuristica(textoMensagem);
      const { osId: osFinal, placa: placaFinal } = extrairOsEPlacaHeuristica(textoMensagem);

      confirmacoesPendentes.set(chavePendente, {
        acao: 'lancar_entrada',
        descricaoAcao: 'Lançar Entrada',
        valor: valorFinal,
        descricao: descricaoFinal,
        formaPagamento: formaPagamentoFinal,
        osId: osFinal,
        placa: placaFinal,
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      let detalhesExtras = `• *Meio de Pgto:* ${formaPagamentoFinal.toUpperCase()}\n`;
      if (osFinal) detalhesExtras += `• *OS Vinculada:* #${osFinal}\n`;
      if (placaFinal) detalhesExtras += `• *Veículo / Placa:* ${placaFinal}\n`;

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\n` +
        `Por favor, confira os dados da operação:\n` +
        `• *Ação:* Lançar Entrada\n` +
        `• *Valor:* ${financialEngine.formatarMoeda(valorFinal)}\n` +
        detalhesExtras +
        `• *Descrição:* ${descricaoFinal}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'lancar_entrada', valor: valorFinal, descricao: descricaoFinal, formaPagamento: formaPagamentoFinal, osId: osFinal, placa: placaFinal } });
      return true;
    }

    if (isComandoSaida) {
      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (!caixaAberto) {
        const respSemCaixa = '⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de registrar saídas.';
        await msg.reply(respSemCaixa);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
        return true;
      }

      const resValor = extrairValorMonetario(textoMensagem);
      if (resValor.status === 'ausente') {
        const respPedeVal = '⚠️ Não identifiquei o valor exato para o lançamento de saída. Por favor, envie o comando com valor e descrição (ex: *Lançar saída de R$ 80,00 referente a compra de óleo*).';
        await msg.reply(respPedeVal);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ausente' } });
        return true;
      }
      if (resValor.status === 'ambiguo') {
        const respAmbiguo = '⚠️ Identifiquei múltiplos valores no comando. Para evitar divergência no caixa, por favor informe o comando com um único valor (ex: *Lançar saída de R$ 80,00 referente a compra de óleo*).';
        await msg.reply(respAmbiguo);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ambiguo', valores: resValor.valores } });
        return true;
      }

      const valorFinal = resValor.valor;
      const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
      const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

      if (valorFinal > limiteMax) {
        const respLimite = `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido para operações via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Por questões de segurança, realize este lançamento diretamente pelo painel do Pátio CRM Web.`;
        await msg.reply(respLimite);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_limite',
          detalhes: { acao: 'lancar_saida', valor: valorFinal, limite: limiteMax }
        });
        return true;
      }

      const matchDesc = textoMensagem.match(/(?:referente\s+a|motivo|para|com|descrição|descricao)\s+(.+)$/i);
      const descricaoFinal = matchDesc ? matchDesc[1].trim() : 'Saída avulsa do caixa';
      const formaPagamentoFinal = extrairFormaPagamentoHeuristica(textoMensagem);
      const { osId: osFinal, placa: placaFinal } = extrairOsEPlacaHeuristica(textoMensagem);

      confirmacoesPendentes.set(chavePendente, {
        acao: 'lancar_saida',
        descricaoAcao: 'Lançar Saída',
        valor: valorFinal,
        descricao: descricaoFinal,
        formaPagamento: formaPagamentoFinal,
        osId: osFinal,
        placa: placaFinal,
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      let detalhesExtras = `• *Meio de Pgto:* ${formaPagamentoFinal.toUpperCase()}\n`;
      if (osFinal) detalhesExtras += `• *OS Vinculada:* #${osFinal}\n`;
      if (placaFinal) detalhesExtras += `• *Veículo / Placa:* ${placaFinal}\n`;

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE OPERAÇÃO FINANCEIRA* ⚠️\n\n` +
        `Por favor, confira os dados da operação:\n` +
        `• *Ação:* Lançar Saída\n` +
        `• *Valor:* ${financialEngine.formatarMoeda(resValor.valor)}\n` +
        detalhesExtras +
        `• *Descrição:* ${descricaoFinal}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'lancar_saida', valor: resValor.valor, descricao: descricaoFinal, formaPagamento: formaPagamentoFinal, osId: osFinal, placa: placaFinal } });
      return true;
    }

    // 3.1 Sangria de Caixa (Retirada de numerário em espécie para cofre/banco)
    if (isComandoSangria) {
      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (!caixaAberto) {
        const respSemCaixa = '⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de realizar sangrias.';
        await msg.reply(respSemCaixa);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
        return true;
      }

      const resValor = extrairValorMonetario(textoMensagem);
      if (resValor.status === 'ausente') {
        const respPedeVal = '⚠️ Não identifiquei o valor para a sangria. Por favor, envie o comando com valor e motivo (ex: *sangria 500 recolhimento cofre*).';
        await msg.reply(respPedeVal);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ausente' } });
        return true;
      }
      if (resValor.status === 'ambiguo') {
        const respAmbiguo = '⚠️ Identifiquei múltiplos valores no comando. Para evitar divergência no caixa, por favor informe o comando com um único valor (ex: *sangria 500 recolhimento cofre*).';
        await msg.reply(respAmbiguo);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ambiguo', valores: resValor.valores } });
        return true;
      }

      const valorFinal = resValor.valor;
      if (valorFinal > (caixaAberto.saldoAtual || 0)) {
        const respSaldoInsuf = `🚫 *Saldo Insuficiente:* O valor solicitado para sangria (${financialEngine.formatarMoeda(valorFinal)}) excede o saldo disponível no caixa (${financialEngine.formatarMoeda(caixaAberto.saldoAtual || 0)}).`;
        await msg.reply(respSaldoInsuf);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'recusado_saldo_insuficiente',
          detalhes: { acao: 'sangria', valor: valorFinal, saldoAtual: caixaAberto.saldoAtual }
        });
        return true;
      }

      const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
      const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;
      if (valorFinal > limiteMax) {
        const respLimite = `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido para operações via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Por questões de segurança, realize esta sangria diretamente pelo painel do Pátio CRM Web.`;
        await msg.reply(respLimite);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_limite',
          detalhes: { acao: 'sangria', valor: valorFinal, limite: limiteMax }
        });
        return true;
      }

      const matchDesc = textoMensagem.match(/(?:motivo|para|referente\s+a|descrição|descricao)\s+(.+)$/i);
      const motivoFinal = matchDesc ? matchDesc[1].trim() : (textoMensagem.replace(/^!?sangria\s*(?:de\s+)?(?:r\$\s*)?[\d.,]+/i, '').trim() || 'Retirada de numerário para cofre/banco');

      confirmacoesPendentes.set(chavePendente, {
        acao: 'sangria_caixa',
        descricaoAcao: 'Sangria de Caixa',
        valor: valorFinal,
        descricao: motivoFinal,
        naturezaOperacao: 'sangria',
        formaPagamento: 'dinheiro',
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE SANGRIA DE CAIXA* ⚠️\n\n` +
        `Por favor, confira os dados da retirada:\n` +
        `• *Ação:* Sangria de Caixa (Saída de Espécie)\n` +
        `• *Valor da Retirada:* ${financialEngine.formatarMoeda(valorFinal)}\n` +
        `• *Saldo Atual:* ${financialEngine.formatarMoeda(caixaAberto.saldoAtual || 0)}\n` +
        `• *Saldo Previsto Após Sangria:* ${financialEngine.formatarMoeda((caixaAberto.saldoAtual || 0) - valorFinal)}\n` +
        `• *Destino / Motivo:* ${motivoFinal}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'sangria_caixa', valor: valorFinal, motivo: motivoFinal } });
      return true;
    }

    // 3.2 Suprimento de Caixa (Aporte de troco/reforço)
    if (isComandoSuprimento) {
      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (!caixaAberto) {
        const respSemCaixa = '⚠️ Não há nenhum turno de caixa aberto no momento. Abra o caixa antes de realizar suprimentos.';
        await msg.reply(respSemCaixa);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
        return true;
      }

      const resValor = extrairValorMonetario(textoMensagem);
      if (resValor.status === 'ausente') {
        const respPedeVal = '⚠️ Não identifiquei o valor para o suprimento. Por favor, envie o comando com valor e motivo (ex: *suprimento 200 reforço de troco*).';
        await msg.reply(respPedeVal);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ausente' } });
        return true;
      }
      if (resValor.status === 'ambiguo') {
        const respAmbiguo = '⚠️ Identifiquei múltiplos valores no comando. Para evitar divergência no caixa, por favor informe o comando com um único valor (ex: *suprimento 200 reforço de troco*).';
        await msg.reply(respAmbiguo);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_valor', detalhes: { motivo: 'valor_ambiguo', valores: resValor.valores } });
        return true;
      }

      const valorFinal = resValor.valor;
      const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
      const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;
      if (valorFinal > limiteMax) {
        const respLimite = `🚫 *Limite Excedido:* O valor informado (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido para operações via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Por questões de segurança, realize este suprimento diretamente pelo painel do Pátio CRM Web.`;
        await msg.reply(respLimite);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_limite',
          detalhes: { acao: 'suprimento', valor: valorFinal, limite: limiteMax }
        });
        return true;
      }

      const matchDesc = textoMensagem.match(/(?:motivo|para|referente\s+a|descrição|descricao)\s+(.+)$/i);
      const motivoFinal = matchDesc ? matchDesc[1].trim() : (textoMensagem.replace(/^!?suprimento\s*(?:de\s+)?(?:r\$\s*)?[\d.,]+/i, '').trim() || 'Aporte de troco no caixa');

      confirmacoesPendentes.set(chavePendente, {
        acao: 'suprimento_caixa',
        descricaoAcao: 'Suprimento de Caixa',
        valor: valorFinal,
        descricao: motivoFinal,
        naturezaOperacao: 'suprimento',
        formaPagamento: 'dinheiro',
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE SUPRIMENTO DE CAIXA* ⚠️\n\n` +
        `Por favor, confira os dados do aporte:\n` +
        `• *Ação:* Suprimento de Caixa (Fundo de Troco)\n` +
        `• *Valor do Aporte:* ${financialEngine.formatarMoeda(valorFinal)}\n` +
        `• *Saldo Atual:* ${financialEngine.formatarMoeda(caixaAberto.saldoAtual || 0)}\n` +
        `• *Saldo Previsto Após Suprimento:* ${financialEngine.formatarMoeda((caixaAberto.saldoAtual || 0) + valorFinal)}\n` +
        `• *Origem / Motivo:* ${motivoFinal}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'aguardando_confirmacao', detalhes: { acao: 'suprimento_caixa', valor: valorFinal, motivo: motivoFinal } });
      return true;
    }

    // 4. Estorno de Movimentação Financeira via WhatsApp
    if (isComandoEstorno) {
      if (!podeExecutarEstorno(perfil)) {
        const respNeg = `🔒 *Acesso Negado:* Seu perfil de usuário (${perfil.role || 'desconhecido'}) não possui permissão para realizar estorno de movimentações financeiras. O estorno é restrito exclusivamente ao Dono/Administrador.`;
        await msg.reply(respNeg);
        try {
          await recordSecurityAudit({
            tenantId: tenantKey,
            actorId: `whatsapp:${senderNorm}`,
            actorType: 'whatsapp_sender',
            action: 'financeiro:movimento:estorno_negado',
            entity: 'movimento_financeiro',
            details: { motivo: 'perfil_nao_autorizado', perfil: perfil.role, comando: textoMensagem }
          });
        } catch (_) {}
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_permissao',
          detalhes: { perfil: perfil.role, acao: 'estornar' }
        });
        return true;
      }

      // Sintaxe: estornar <id|ultimo> <motivo>
      const matchEstorno = textoMensagem.match(/^!?estornar\s+(\S+)(?:\s+(.+))?$/i);
      if (!matchEstorno) {
        const respAjuda = '⚠️ Formato inválido. Use: *estornar ultimo <motivo>* ou *estornar <ID> <motivo>* (ex: *estornar ultimo lançamento em duplicidade*).';
        await msg.reply(respAjuda);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_estorno', detalhes: { motivo: 'formato_invalido' } });
        return true;
      }

      const paramAlvo = matchEstorno[1].trim();
      const motivoEstorno = (matchEstorno[2] || '').trim();

      if (!motivoEstorno || motivoEstorno.length < 3) {
        const respPedeMotivo = '⚠️ O motivo do estorno é obrigatório e deve conter ao menos 3 caracteres (ex: *estornar ultimo valor digitado incorreto*).';
        await msg.reply(respPedeMotivo);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_estorno', detalhes: { motivo: 'motivo_invalido' } });
        return true;
      }

      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      const todosMovs = Array.isArray(tenantState.movimentos) ? tenantState.movimentos : [];

      let movAlvo = null;
      if (paramAlvo.toLowerCase() === 'ultimo' || paramAlvo.toLowerCase() === 'último') {
        const movsCandidatos = caixaAberto
          ? todosMovs.filter(m => (m.caixaId === caixaAberto.id) || (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id)))
          : todosMovs;

        movAlvo = movsCandidatos.find(m => !m.estornado && !m.estornoDeId && m.subtipo !== 'estorno');
        if (!movAlvo) {
          const respNaoEnc = '⚠️ Não foi encontrada nenhuma movimentação ativa recente elegível para estorno no turno atual.';
          await msg.reply(respNaoEnc);
          await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_movimento_nao_encontrado' });
          return true;
        }
      } else {
        movAlvo = todosMovs.find(m => m.id === paramAlvo || m.id.toLowerCase() === paramAlvo.toLowerCase() || m.id.endsWith(paramAlvo));
        if (!movAlvo) {
          const respNaoEnc = `⚠️ Movimentação com identificador "${paramAlvo}" não foi localizada.`;
          await msg.reply(respNaoEnc);
          await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_movimento_nao_encontrado', detalhes: { paramAlvo } });
          return true;
        }
        if (movAlvo.estornado) {
          const respJaEst = `⚠️ A movimentação #${movAlvo.id} já foi estornada anteriormente por ${movAlvo.estornadoPor || 'outro operador'}.`;
          await msg.reply(respJaEst);
          await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_ja_estornado', detalhes: { movimentoId: movAlvo.id } });
          return true;
        }
        if (movAlvo.estornoDeId || movAlvo.subtipo === 'estorno') {
          const respComp = '⚠️ Não é permitido estornar um lançamento compensatório de estorno.';
          await msg.reply(respComp);
          await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_estorno_compensatorio', detalhes: { movimentoId: movAlvo.id } });
          return true;
        }
      }

      confirmacoesPendentes.set(chavePendente, {
        acao: 'estornar_movimento',
        descricaoAcao: 'Estorno Contábil',
        movimentoId: movAlvo.id,
        movimentoOriginal: movAlvo,
        valor: Number(movAlvo.valor) || 0,
        descricao: motivoEstorno,
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const isEntradaOriginal = movAlvo.tipo === 'entrada' || movAlvo.tipo === 'receita';
      const impactoSaldo = isEntradaOriginal ? `Débito de ${financialEngine.formatarMoeda(movAlvo.valor)} (reduz o saldo)` : `Crédito de ${financialEngine.formatarMoeda(movAlvo.valor)} (restaura o saldo)`;

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE ESTORNO CONTÁBIL* ⚠️\n\n` +
        `Por favor, confira os dados do estorno:\n` +
        `• *Lançamento Alvo:* #${movAlvo.id} (${movAlvo.desc || movAlvo.descricao || 'Movimento'})\n` +
        `• *Tipo Original:* ${isEntradaOriginal ? 'Entrada (+)' : 'Saída (−)'} de ${financialEngine.formatarMoeda(movAlvo.valor)}\n` +
        `• *Impacto no Caixa:* ${impactoSaldo}\n` +
        `• *Motivo do Estorno:* ${motivoEstorno}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'aguardando_confirmacao',
        detalhes: { acao: 'estornar_movimento', movimentoId: movAlvo.id, valor: movAlvo.valor, motivo: motivoEstorno }
      });
      return true;
    } else if (isComandoBaixa) {
      const matchBaixa = textoMensagem.match(/^(?:!baixar|baixar|pagar\s+conta|receber\s+t[ií]tulo)\s+([a-zA-Z0-9_\-]+)(?:\s+([a-zA-Z0-9_\-]+))?/i);
      if (!matchBaixa || !matchBaixa[1]) {
        const respPedeId = '⚠️ Por favor, informe o identificador do título ou conta a ser baixado (ex: *baixar tit_123 pix* ou *baixar 101 dinheiro*).';
        await msg.reply(respPedeId);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_id', detalhes: { motivo: 'id_ausente' } });
        return true;
      }

      const idAlvo = matchBaixa[1].trim();
      const formaInformada = matchBaixa[2] ? matchBaixa[2].trim() : '';
      const contas = Array.isArray(tenantState.contas) ? tenantState.contas : [];
      const idNorm = idAlvo.toLowerCase();
      const idSemPrefixo = idNorm.replace(/^(?:tit_|cnt_|mov_|cta_)/, '');

      const tituloAlvo = contas.find(c => {
        const cId = String(c.id || '').toLowerCase();
        if (cId === idNorm) return true;
        if (cId.replace(/^(?:tit_|cnt_|mov_|cta_)/, '') === idSemPrefixo) return true;
        return false;
      });

      if (!tituloAlvo) {
        const respNaoEnc = `⚠️ Título ou conta #${idAlvo} não foi encontrado(a).`;
        await msg.reply(respNaoEnc);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_titulo_nao_encontrado', detalhes: { idAlvo } });
        return true;
      }

      if (tituloAlvo.pago || tituloAlvo.status === 'liquidado' || tituloAlvo.status === 'pago') {
        const respJaLiq = `⚠️ O título #${tituloAlvo.id} já foi liquidado anteriormente em ${tituloAlvo.dataPagamento || tituloAlvo.dataPgto || 'data anterior'}.`;
        await msg.reply(respJaLiq);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_titulo_ja_liquidado', detalhes: { tituloId: tituloAlvo.id } });
        return true;
      }

      const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
      if (!caixaAberto) {
        const respSemCaixa = '⚠️ Não há caixa aberto no momento para registrar a liquidação deste título. Abra o caixa primeiro para poder realizar baixas integradas.';
        await msg.reply(respSemCaixa);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_caixa_fechado', detalhes: { tituloId: tituloAlvo.id } });
        return true;
      }

      const valorFinal = Number(tituloAlvo.valor) || 0;
      const rawLimite = Number(tenantState?.cfg?.limiteValorLancamentoWhatsapp);
      const limiteMax = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

      if (valorFinal > limiteMax) {
        const respLimite = `🚫 *Limite Excedido:* O valor do título #${tituloAlvo.id} (${financialEngine.formatarMoeda(valorFinal)}) excede o limite máximo permitido para operações via WhatsApp (${financialEngine.formatarMoeda(limiteMax)}). Por questões de segurança, realize esta baixa diretamente pelo painel do Pátio CRM Web.`;
        await msg.reply(respLimite);
        await auditarComandoWhatsApp({
          tenantId: tenantKey,
          numero: senderNorm,
          comando: textoMensagem,
          resultado: 'negado_limite',
          detalhes: { acao: 'liquidar_titulo', tituloId: tituloAlvo.id, valor: valorFinal, limite: limiteMax }
        });
        return true;
      }

      const meioLiquidacao = formaInformada ? financialAnalystService.normalizarFormaPagamento(formaInformada) : (tituloAlvo.forma ? financialAnalystService.normalizarFormaPagamento(tituloAlvo.forma) : 'dinheiro');

      confirmacoesPendentes.set(chavePendente, {
        acao: 'liquidar_titulo',
        descricaoAcao: 'Liquidação de Título',
        tituloId: tituloAlvo.id,
        tituloOriginal: tituloAlvo,
        valor: valorFinal,
        formaPagamento: meioLiquidacao,
        descricao: tituloAlvo.desc || tituloAlvo.descricao || (tituloAlvo.tipo === 'receber' ? 'Recebimento' : 'Pagamento'),
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const isReceber = tituloAlvo.tipo === 'receber';
      const impactoCaixa = isReceber
        ? `Crédito de ${financialEngine.formatarMoeda(valorFinal)} (entrada no caixa)`
        : `Débito de ${financialEngine.formatarMoeda(valorFinal)} (saída do caixa)`;

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE LIQUIDAÇÃO FINANCEIRA* ⚠️\n\n` +
        `Por favor, confira os dados da operação:\n` +
        `• *Título / Conta:* #${tituloAlvo.id} (${isReceber ? 'Recebimento' : 'Pagamento'})\n` +
        `• *Descrição / Parte:* ${tituloAlvo.desc || tituloAlvo.parte || 'Geral'}\n` +
        `• *Valor:* ${financialEngine.formatarMoeda(valorFinal)}\n` +
        `• *Meio de Pagamento:* ${meioLiquidacao.toUpperCase()}\n` +
        `• *Impacto no Caixa:* ${impactoCaixa}\n\n` +
        `Para executar, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'aguardando_confirmacao',
        detalhes: { acao: 'liquidar_titulo', tituloId: tituloAlvo.id, valor: valorFinal, meio: meioLiquidacao }
      });
      return true;
    } else if (isComandoLiberarOS) {
      // Sintaxe: liberar os <numero> <justificativa>
      const matchLiberar = textoMensagem.match(/^!?liberar\s+os\s*#?\s*([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/i);
      if (!matchLiberar || !matchLiberar[1]) {
        const respAjuda = '⚠️ Formato inválido. Use: *liberar os <número> <justificativa>* (ex: *liberar os 101 Cliente VIP liberado com promissória assinada*).';
        await msg.reply(respAjuda);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_liberar_os', detalhes: { motivo: 'formato_invalido' } });
        return true;
      }

      const osAlvo = matchLiberar[1].trim();
      const justificativa = (matchLiberar[2] || '').trim();

      if (!justificativa || justificativa.length < 5) {
        const respPedeJust = '⚠️ A justificativa para liberação excepcional é obrigatória e deve ter pelo menos 5 caracteres (ex: *liberar os 101 Cliente VIP aprovado pelo dono*).';
        await msg.reply(respPedeJust);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'solicitado_esclarecimento_justificativa', detalhes: { motivo: 'justificativa_invalida' } });
        return true;
      }

      const resumoOS = financialAnalystService.obterResumoFinanceiroOS(tenantState, osAlvo);
      if (['liberado_quitado', 'liberado_faturado', 'liberado_excepcional'].includes(resumoOS.statusLiberacaoPatio)) {
        const descStatus = resumoOS.statusLiberacaoPatio === 'liberado_quitado'
          ? 'Totalmente Quitada'
          : (resumoOS.statusLiberacaoPatio === 'liberado_faturado' ? 'Faturada a Prazo' : 'Exceção Auditada');
        const respJaLib = `ℹ️ A OS #${osAlvo} já se encontra liberada (${descStatus}). Não é necessária nova liberação.`;
        await msg.reply(respJaLib);
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_os_ja_liberada', detalhes: { osId: osAlvo, status: resumoOS.statusLiberacaoPatio } });
        return true;
      }

      confirmacoesPendentes.set(chavePendente, {
        acao: 'liberar_saida_os',
        descricaoAcao: 'Liberação Excepcional de Pátio',
        osId: osAlvo,
        justificativa,
        valor: resumoOS.saldoRestante || 0,
        expiraEm: Date.now() + CONFIRMACAO_TTL_MS,
        tenantKey,
        fromNumber: senderNorm,
        perfil
      });

      const msgConfirm =
        prefixoSubstituicao +
        `⚠️ *CONFIRMAÇÃO DE LIBERAÇÃO EXCEPCIONAL DE PÁTIO* ⚠️\n\n` +
        `Por favor, confira os dados da autorização:\n` +
        `• *OS Alvo:* #${osAlvo} (${resumoOS.cliente || 'Geral'})\n` +
        `• *Saldo Pendente em Aberto:* ${financialEngine.formatarMoeda(resumoOS.saldoRestante || 0)}\n` +
        `• *Justificativa Auditada:* ${justificativa}\n` +
        `• *Autorizador:* WhatsApp (${senderNorm}) [${perfil.role || 'dono'}]\n\n` +
        `Para autorizar a saída deste veículo do pátio, responda exatamente *CONFIRMAR* ou *SIM* em até 2 minutos.\n` +
        `Qualquer outra resposta cancelará esta operação.`;

      await msg.reply(msgConfirm);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'aguardando_confirmacao',
        detalhes: { acao: 'liberar_saida_os', osId: osAlvo, justificativa, saldoPendente: resumoOS.saldoRestante }
      });
      return true;
    }
  }

  // 0. Extrato Financeiro de Ordem de Serviço (OS) (Leitura)
  if (isComandoExtratoOS) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* A consulta financeira de Ordens de Serviço é disponibilizada exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }

    const osIdAlvo = matchComandoOS[1].trim();
    const resOS = financialAnalystService.obterResumoFinanceiroOS(tenantState, osIdAlvo);

    if (!resOS || !resOS.historico || resOS.historico.length === 0) {
      await msg.reply(`⚠️ Nenhuma movimentação financeira vinculada à OS #${osIdAlvo} foi localizada.`);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: senderNorm,
        comando: textoMensagem,
        resultado: 'recusado_os_sem_movimentacoes',
        detalhes: { osId: osIdAlvo }
      });
      return true;
    }

    let respOS = `📋 *POSIÇÃO FINANCEIRA - OS #${osIdAlvo}* 🚗\n\n`;
    if (resOS.placasVinculadas && resOS.placasVinculadas.length > 0) {
      respOS += `• *Veículo / Placa:* ${resOS.placasVinculadas.join(', ')}\n`;
    }
    respOS += `• *Total Recebido (Entradas):* ${financialEngine.formatarMoeda(resOS.totalEntradasOS)}\n`;
    respOS += `• *Despesas Vinculadas (Saídas):* ${financialEngine.formatarMoeda(resOS.totalSaidasOS)}\n`;
    respOS += `• *Saldo Líquido da OS:* ${financialEngine.formatarMoeda(resOS.saldoLiquidoOS)}\n`;
    respOS += `• *Total de Lançamentos:* ${resOS.historico.length} (${resOS.qtdLancamentos} ativo(s))\n\n`;

    const meiosKeys = Object.keys(resOS.resumoMeiosPagamento || {});
    if (meiosKeys.length > 0) {
      respOS += `💳 *Meios de Pagamento Utilizados:*\n`;
      meiosKeys.forEach(m => {
        const item = resOS.resumoMeiosPagamento[m];
        respOS += `• ${m.toUpperCase()}: ${financialEngine.formatarMoeda(item.total)} (${item.qtd}x)\n`;
      });
      respOS += `\n`;
    }

    respOS += `📜 *Histórico de Movimentações:*\n`;
    resOS.historico.slice(0, 10).forEach((mov, idx) => {
      const isEstornado = Boolean(mov.estornado);
      const isComp = Boolean(mov.estornoDeId || mov.subtipo === 'estorno');
      const isEnt = mov.tipo === 'entrada' || mov.tipo === 'receita';
      const tagTipo = isEstornado ? '⚠️ Estornado' : isComp ? '↩️ Compensatório' : isEnt ? '🟢 Entrada' : '🔴 Saída';
      const formaStr = (mov.forma || mov.formaPagamento || 'dinheiro').toUpperCase();
      const idCurto = mov.id ? (mov.id.length > 8 ? mov.id.slice(-6) : mov.id) : `${idx + 1}`;
      respOS += `• [${idCurto}] ${tagTipo} ${financialEngine.formatarMoeda(mov.valor)} (${formaStr}) - ${mov.desc || mov.descricao || 'Movimento'}\n`;
    });
    if (resOS.historico.length > 10) {
      respOS += `_... e mais ${resOS.historico.length - 10} movimentação(ões)._\n`;
    }

    await msg.reply(respOS.trim());
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { osId: osIdAlvo, totalEntradas: resOS.totalEntradasOS, totalSaidas: resOS.totalSaidasOS, saldoLiquido: resOS.saldoLiquidoOS }
    });
    return true;
  }

  // 0. Extrato Recente de Movimentações (Leitura)
  if (isComandoExtrato) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* O extrato financeiro de caixa é disponibilizado exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }

    let qtd = 5;
    const matchNum = textoLower.match(/\b([1-9]|10)\b/);
    if (matchNum) {
      qtd = parseInt(matchNum[1], 10);
    }
    const apenasWhatsapp = textoLower.includes('whatsapp') || textoLower.includes('wpp');

    const caixaAberto = financialAnalystService.obterCaixaAberto(tenantState, tenantKey);
    const todosMovs = Array.isArray(tenantState.movimentos) ? tenantState.movimentos : [];

    let movs = caixaAberto
      ? todosMovs.filter(m => (m.caixaId === caixaAberto.id) || (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id)))
      : todosMovs.slice(0, 20);

    if (apenasWhatsapp) {
      movs = movs.filter(m => m.origem === 'whatsapp');
    }

    const ultimos = movs.slice(0, qtd);
    const saldoAtual = caixaAberto ? (caixaAberto.saldoAtual || 0) : financialAnalystService.calcularSaldoConsolidado(tenantState, tenantKey);

    let resposta = `📜 *EXTRATO RECENTE DE MOVIMENTAÇÕES* 📜\n\n`;
    resposta += `• *Turno:* ${caixaAberto ? `#${caixaAberto.id} (Aberto)` : 'Nenhum Caixa Aberto'}\n`;
    resposta += `• *Saldo Atual:* ${financialEngine.formatarMoeda(saldoAtual)}\n`;
    resposta += `• *Exibindo:* ${ultimos.length} lançamento(s)${apenasWhatsapp ? ' (Apenas WhatsApp)' : ''}\n`;
    resposta += `─────────────────────────\n`;

    if (ultimos.length === 0) {
      resposta += `Nenhuma movimentação registrada no turno atual.\n`;
    } else {
      ultimos.forEach((m, idx) => {
        const isEstornado = Boolean(m.estornado);
        const isComp = Boolean(m.estornoDeId || m.subtipo === 'estorno');
        const isEnt = m.tipo === 'entrada' || m.tipo === 'receita';

        let tagTipo = isEstornado ? '⚠️ Estornado' : isComp ? '↩️ Compensatório' : isEnt ? '🟢 Entrada' : '🔴 Saída';
        const tagOrigem = m.origem === 'whatsapp' ? '📱 WPP' : '💻 WEB';
        const horaStr = m.confirmadoEm ? formatarHoraSimples(m.confirmadoEm) : (m.hora ? m.hora : (m.data || 'Hoje'));
        const idCurto = m.id ? (m.id.length > 8 ? m.id.slice(-6) : m.id) : `${idx + 1}`;

        resposta += `*[${idCurto}]* ${tagTipo} • ${financialEngine.formatarMoeda(m.valor)}\n`;
        resposta += `• *Desc:* ${m.desc || m.descricao || 'Movimento'}\n`;
        resposta += `• *Canal:* ${tagOrigem} | *Horário:* ${horaStr}\n`;
        if (isEstornado && m.motivoEstorno) {
          resposta += `• *Motivo Estorno:* ${m.motivoEstorno}\n`;
        }
        resposta += `─────────────────────────\n`;
      });
    }

    await msg.reply(resposta.trim());
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { qtdRetornada: ultimos.length, turnoId: caixaAberto ? caixaAberto.id : null }
    });
    return true;
  }

  // 1.1 Resumo Caixa / Fechamento Parcial (Leitura com quebra por origem e estornos)
  if (isComandoResumoCaixa) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* Informações de resumo e fechamento de caixa são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }

    const resParcial = financialAnalystService.obterResumoFechamentoParcial(tenantState, tenantKey);
    if (!resParcial.ok) {
      await msg.reply('⚠️ Não há nenhum turno de caixa aberto no momento para visualização de resumo.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: senderNorm, comando: textoMensagem, resultado: 'recusado_sem_caixa_aberto' });
      return true;
    }

    await msg.reply(resParcial.resumoTextoWhatsapp);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: senderNorm,
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: { acao: 'resumo_caixa', caixaId: resParcial.caixa?.id }
    });
    return true;
  }

  // 1. Saldo do Caixa (Leitura - Sem Confirmação)
  if (
    textoLower === '!caixa' || textoLower === 'caixa' ||
    textoLower === '!saldo' || textoLower === 'saldo' ||
    textoLower === 'saldo do caixa' || textoLower === 'saldo de caixa' ||
    textoLower === '!financeiro' || textoLower === 'financeiro'
  ) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* Informações financeiras de caixa e valores são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const resCaixa = gerarResumoCaixa(tenantState);
    await msg.reply(resCaixa);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'sucesso' });
    return true;
  }

  // 2. Entradas e Saídas do Dia (Movimentações de Hoje)
  if (
    textoLower.includes('entradas e saídas') || textoLower.includes('entradas e saidas') ||
    textoLower.includes('movimentações do dia') || textoLower.includes('movimentacoes do dia') ||
    textoLower.includes('movimentação do dia') || textoLower.includes('movimentacao do dia') ||
    textoLower.includes('entradas do dia') || textoLower.includes('saídas do dia') || textoLower.includes('saidas do dia') ||
    textoLower === '!movimentacoes' || textoLower === '!movimentos' ||
    (textoLower.includes('entradas') && textoLower.includes('saídas')) ||
    (textoLower.includes('entradas') && textoLower.includes('saidas'))
  ) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* As movimentações financeiras do dia são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    const movimentos = Array.isArray(tenantState.movimentos) ? tenantState.movimentos : [];
    const movsHoje = movimentos.filter(m => (m.data || '').slice(0, 10) === dHoje);

    let totEntradas = 0;
    let totSaidas = 0;
    movsHoje.forEach(m => {
      const v = Number(m.valor) || 0;
      if (m.tipo === 'entrada') totEntradas += v;
      else totSaidas += v;
    });

    const saldoDia = totEntradas - totSaidas;
    let txtMov = `📊 *ENTRADAS E SAÍDAS DE HOJE (${agoraSP.dataBR})* 💵\n\n` +
                 `• 🟢 *Total de Entradas:* ${financialEngine.formatarMoeda(totEntradas)}\n` +
                 `• 🔴 *Total de Saídas:* ${financialEngine.formatarMoeda(totSaidas)}\n` +
                 `• ⚖️ *Resultado do Dia:* ${saldoDia >= 0 ? '+' : ''}${financialEngine.formatarMoeda(saldoDia)}\n\n`;

    if (movsHoje.length === 0) {
      txtMov += `_Nenhuma movimentação avulsa registrada no caixa hoje até o momento._`;
    } else {
      txtMov += `📋 *Últimos Lançamentos:*\n`;
      const ultimos = movsHoje.slice(0, 6);
      ultimos.forEach(m => {
        const icone = m.tipo === 'entrada' ? '🟢' : '🔴';
        const horaFmt = m.hora || (m.criadoEm ? (m.criadoEm.slice(11, 16)) : '');
        txtMov += `${icone} ${financialEngine.formatarMoeda(m.valor)} — ${m.descricao || m.categoria || 'Lançamento'}${horaFmt ? ` (${horaFmt})` : ''}\n`;
      });
      if (movsHoje.length > 6) {
        txtMov += `_... e mais ${movsHoje.length - 6} lançamento(s) registrados._\n`;
      }
    }

    await msg.reply(txtMov);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'sucesso' });
    return true;
  }

  // 3. Contas a Pagar e a Receber do Dia
  if (
    textoLower.includes('contas a pagar e a receber') ||
    textoLower.includes('pagar e receber do dia') ||
    textoLower.includes('contas do dia') ||
    textoLower.includes('títulos do dia') || textoLower.includes('titulos do dia') ||
    textoLower.includes('vencimentos do dia') || textoLower.includes('vencimentos de hoje') ||
    textoLower.includes('contas a pagar do dia') || textoLower.includes('contas a receber do dia') ||
    textoLower.includes('contas a pagar') || textoLower.includes('contas a receber') ||
    textoLower === '!contas' || textoLower === '!vencimentos' || textoLower === 'vencimentos' ||
    textoLower === 'contas hoje' || textoLower === '!contas hoje' ||
    textoLower === 'agenda financeira' || textoLower === 'compromissos hoje'
  ) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* Contas a pagar e a receber são disponibilizadas exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const agoraSP = financialEngine.obterAgoraSP();
    const dHoje = agoraSP.dataISO;
    const contas = Array.isArray(tenantState.contas) ? tenantState.contas : [];

    const aPagarHoje = contas.filter(c => c.tipo === 'pagar' && !c.pago && (c.venc || '').slice(0, 10) === dHoje);
    const aReceberHoje = contas.filter(c => c.tipo === 'receber' && !c.pago && (c.venc || '').slice(0, 10) === dHoje);

    const totPagarHoje = aPagarHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const totReceberHoje = aReceberHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const liquido = totReceberHoje - totPagarHoje;

    let txtContas = `📅 *TÍTULOS E VENCIMENTOS DE HOJE (${agoraSP.dataBR})* 🏢\n\n` +
                    `🟢 *A Receber:* ${financialEngine.formatarMoeda(totReceberHoje)} (${aReceberHoje.length} título(s))\n` +
                    `🔴 *A Pagar:* ${financialEngine.formatarMoeda(totPagarHoje)} (${aPagarHoje.length} conta(s))\n` +
                    `⚖️ *Previsão Líquida:* ${liquido >= 0 ? '+' : ''}${financialEngine.formatarMoeda(liquido)}\n\n`;

    if (aPagarHoje.length > 0) {
      txtContas += `🔴 *Contas a Pagar Hoje:*\n`;
      aPagarHoje.slice(0, 4).forEach(c => {
        txtContas += `• #${c.id} - ${c.desc || c.parte || 'Fornecedor'}: ${financialEngine.formatarMoeda(c.valor)}\n`;
      });
      if (aPagarHoje.length > 4) txtContas += `_... e mais ${aPagarHoje.length - 4} conta(s)._\n`;
      txtContas += `\n`;
    }

    if (aReceberHoje.length > 0) {
      txtContas += `🟢 *Títulos a Receber Hoje:*\n`;
      aReceberHoje.slice(0, 4).forEach(c => {
        txtContas += `• #${c.id} - ${c.desc || c.parte || 'Cliente'}: ${financialEngine.formatarMoeda(c.valor)}\n`;
      });
      if (aReceberHoje.length > 4) txtContas += `_... e mais ${aReceberHoje.length - 4} título(s)._\n`;
      txtContas += `\n`;
    }

    if (aPagarHoje.length === 0 && aReceberHoje.length === 0) {
      txtContas += `_Nenhum vencimento de contas a pagar ou a receber agendado para hoje._`;
    } else {
      txtContas += `💡 *Para liquidar pelo WhatsApp:* envie *baixar <id> [forma]* (ex: _baixar ${aReceberHoje[0]?.id || aPagarHoje[0]?.id || 'tit_1'} pix_)\n`;
    }

    await msg.reply(txtContas);
    await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'sucesso' });
    return true;
  }

  // 3.1 Demonstrativo de Resultado Operacional (DRE Operacional)
  if (isComandoDRE) {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* O Demonstrativo de Resultado Operacional (DRE) é disponibilizado exclusivamente para administradores autorizados.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const dre = financialAnalystService.calcularDREOperacional(tenantState, { filtro: '30d' });
    const msgDRE = financialEngine.formatarDREWhatsapp(dre, tenantState);
    await msg.reply(msgDRE);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: (msg.author || msg.from || '').split('@')[0],
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: {
        receitaOperacionalBruta: dre.receitaOperacionalBruta,
        despesasOperacionais: dre.despesasOperacionais,
        custoPecasAplicadasOS: dre.custoPecasAplicadasOS,
        resultadoOperacionalLiquido: dre.resultadoOperacionalLiquido
      }
    });
    return true;
  }

  // 3.1.2 Aviso de Retirada / Comunicação de OS ao Cliente via WhatsApp (Frente 7B)
  if (isComandoAvisoRetiradaOS && matchAvisoRetiradaOS) {
    const osIdParam = String(matchAvisoRetiradaOS[1]).replace(/^#/, '').trim();
    const avisoResult = financialAnalystService.gerarAvisoClienteOS(tenantState, osIdParam);

    if (!avisoResult.sucesso && !avisoResult.ok) {
      await msg.reply(`⚠️ *Falha ao gerar aviso:* Não foi possível localizar a OS #${osIdParam}.`);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: (msg.author || msg.from || '').split('@')[0],
        comando: textoMensagem,
        resultado: 'falha_nao_encontrado'
      });
      return true;
    }

    await msg.reply(avisoResult.textoWhatsapp);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: (msg.author || msg.from || '').split('@')[0],
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: {
        osId: osIdParam,
        cliente: avisoResult.cliente,
        saldoRestante: avisoResult.saldoRestante,
        statusLiberacaoPatio: avisoResult.statusLiberacaoPatio
      }
    });
    return true;
  }

  // 3.2 Notificação / Lembrete Amigável de Cobrança de OS
  if (isComandoCobrancaOS && matchCobrancaOS) {
    const osIdParam = String(matchCobrancaOS[1]).replace(/^#/, '').trim();
    const cobrancaResult = financialAnalystService.gerarTextoCobrancaOS(tenantState, osIdParam);

    if (!cobrancaResult.ok) {
      await msg.reply(`⚠️ *Falha ao gerar cobrança:* Não foi possível localizar a OS #${osIdParam}.`);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: (msg.author || msg.from || '').split('@')[0],
        comando: textoMensagem,
        resultado: 'falha_nao_encontrado'
      });
      return true;
    }

    if (cobrancaResult.saldoRestante <= 0) {
      await msg.reply(`✅ *OS #${osIdParam} já está quitada!*\nNão há pendência financeira ativa para este veículo/cliente. Saldo devedor: R$ 0,00.`);
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: (msg.author || msg.from || '').split('@')[0],
        comando: textoMensagem,
        resultado: 'sucesso_quitada'
      });
      return true;
    }

    await msg.reply(cobrancaResult.textoCobranca);
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: (msg.author || msg.from || '').split('@')[0],
      comando: textoMensagem,
      resultado: 'sucesso',
      detalhes: {
        osId: osIdParam,
        cliente: cobrancaResult.clienteNome,
        saldoPendente: cobrancaResult.saldoRestante
      }
    });
    return true;
  }

  if (textoLower === '!previsao' || textoLower === 'previsao' || textoLower === 'previsão' || textoLower === '!forecast') {
    if (isContextOperacao || !isContextAdmin) {
      await msg.reply('🔒 *Acesso Restrito:* A projeção de fluxo de caixa é disponibilizada exclusivamente no Grupo da Administração.');
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'negado_permissao' });
      return true;
    }
    const prev = financialAnalystService.gerarPrevisaoFluxoCaixa(tenantState, { horizonteDias: 30 });
    let msgPrev = `📈 *PREVISÃO DE FLUXO DE CAIXA (VERÔNICA ANALISTA)* 🤖\n\n`;
    msgPrev += `💰 *Saldo Disponível Hoje:* ${formatarMoeda(prev.saldoAtual)}\n\n`;
    msgPrev += `🗓️ *Projeções por Período:*\n`;
    msgPrev += `• *7 Dias:* ${formatarMoeda(prev.marcos?.em7Dias?.saldo)} (Seguro: ${prev.marcos?.em7Dias?.seguro ? 'Sim' : 'Abaixo da Margem'})\n`;
    msgPrev += `• *15 Dias:* ${formatarMoeda(prev.marcos?.em15Dias?.saldo)} (Seguro: ${prev.marcos?.em15Dias?.seguro ? 'Sim' : 'Abaixo da Margem'})\n`;
    msgPrev += `• *30 Dias:* ${formatarMoeda(prev.marcos?.em30Dias?.saldo)} (Seguro: ${prev.marcos?.em30Dias?.seguro ? 'Sim' : 'Abaixo da Margem'})\n\n`;
    msgPrev += `📊 *Totais Projetados (30 Dias):*\n`;
    msgPrev += `• Contas a Receber: ${formatarMoeda(prev.totaisPeriodo?.aReceber)}\n`;
    msgPrev += `• Contas a Pagar: ${formatarMoeda(prev.totaisPeriodo?.aPagar)}\n`;
    msgPrev += `• Saldo Previsto por Títulos: ${formatarMoeda(prev.totaisPeriodo?.saldoPrevistoFinanceiro)}\n\n`;
    msgPrev += `🚛 *Potencial de Pátio (OS em andamento & orçamentos):*\n`;
    msgPrev += `• Cenário Provável: ${formatarMoeda(prev.receitaPotencialPatio?.cenarioProvavel)} (Saldo Proj: ${formatarMoeda(prev.receitaPotencialPatio?.saldoProvavel30dComPatio)})\n`;
    msgPrev += `• Cenário Conservador: ${formatarMoeda(prev.receitaPotencialPatio?.cenarioConservador)} (Saldo Proj: ${formatarMoeda(prev.receitaPotencialPatio?.saldoConservador30dComPatio)})\n`;

    if (prev.diagnosticoFuro?.furoDetectado) {
      msgPrev += `\n⚠️ *Alerta de Furo de Caixa:* Risco a partir de ${formatarDataBR(prev.diagnosticoFuro.dataPrimeiroFuro)} (menor saldo: ${formatarMoeda(prev.diagnosticoFuro.menorSaldoProjetado)}). Caixa mínimo: ${formatarMoeda(prev.caixaMinimoSeguranca)}.`;
    } else {
      msgPrev += `\n✅ *Saúde do Caixa:* Nenhum furo de caixa projetado nos próximos 30 dias (caixa mínimo de ${formatarMoeda(prev.caixaMinimoSeguranca)} mantido).`;
    }

    await msg.reply(msgPrev);
    return true;
  }

  if (textoLower === '!auditoria' || textoLower === 'auditoria' || textoLower === '!controles' || textoLower === 'controles') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* A auditoria de controles internos é disponibilizada exclusivamente no Grupo da Administração.');
      return true;
    }
    const parecer = financialAnalystService.formatarParecerExecutivoVerônica(tenantState);
    await msg.reply(parecer);
    return true;
  }

  if (textoLower === '!gestao360' || textoLower === 'gestao360' || textoLower === '!gestão360' || textoLower === '!raiox' || textoLower === 'raiox' || textoLower === '!gestao' || textoLower === 'gestao' || textoLower === '!gestão') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* O relatório de gestão 360º é disponibilizado exclusivamente no Grupo da Administração.');
      return true;
    }
    const relatorio = executiveManagerService.gerarRelatorioGerencial360(tenantState, { tenantId: tenantKey });
    await msg.reply(relatorio.textoWhatsApp);
    return true;
  }

  if (textoLower === '!compras' || textoLower === 'compras' || textoLower === '!suprimentos' || textoLower === 'suprimentos') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* A análise de compras sugeridas e viabilidade financeira é disponibilizada exclusivamente no Grupo da Administração.');
      return true;
    }
    const analise = executiveManagerService.analisarComprasEEstoque(tenantState, { tenantId: tenantKey });
    let msgCompras = `📦 *SUGESTÃO DE COMPRAS & ESTOQUE CRÍTICO (VERÔNICA)* 🤖\n\n`;
    msgCompras += `📊 *Resumo da Necessidade:*\n`;
    msgCompras += `• Total de Itens para Compra: ${analise.resumo.totalItensNecessidade}\n`;
    msgCompras += `• Peças Urgentes para OSs Ativas: ${analise.resumo.totalItensCriticosOS}\n`;
    msgCompras += `• Itens com Estoque Zerado: ${analise.resumo.totalItensZerados}\n`;
    msgCompras += `• Custo Total Estimado: ${formatarMoeda(analise.resumo.custoTotalReposicao)}\n`;
    if (analise.resumo.custoOSUrgente > 0) {
      msgCompras += `• Custo Urgente de OS: ${formatarMoeda(analise.resumo.custoOSUrgente)}\n`;
    }
    msgCompras += `\n💡 *Parecer Financeiro:*\n${analise.financeiro.parecerFinanceiro}\n`;

    if (analise.itens.length > 0) {
      msgCompras += `\n📋 *Principais Itens Sugeridos:*\n`;
      const topItens = analise.itens.slice(0, 6);
      for (const it of topItens) {
        const tagPrio = it.prioridade === 'urgente' ? '🚨' : (it.prioridade === 'alta' ? '⚠️' : '📦');
        msgCompras += `${tagPrio} *${it.nome}* (${it.cod || 'S/C'})\n`;
        msgCompras += `   • Sugestão: ${it.qtdSugerida} un | Custo: ${formatarMoeda(it.custoTotalEstimado)} | Forn: ${it.fornecedor}\n`;
        if (it.deficitOS > 0) {
          msgCompras += `   • *Déficit em OS:* Faltam ${it.deficitOS} un para atendimento no pátio\n`;
        }
      }
      if (analise.itens.length > 6) {
        msgCompras += `\n_... e mais ${analise.itens.length - 6} item(ns) detalhados no painel web._\n`;
      }
    }
    await msg.reply(msgCompras);
    return true;
  }

  if (textoLower === '!equipe' || textoLower === 'equipe' || textoLower === '!produtividade' || textoLower === 'produtividade') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* O relatório de produtividade da equipe e mecânicos é disponibilizado exclusivamente no Grupo da Administração.');
      return true;
    }
    const prod = executiveManagerService.analisarProdutividadeEquipe(tenantState, { tenantId: tenantKey });
    let msgEq = `👨‍🔧 *PRODUTIVIDADE DA EQUIPE & BOXES (VERÔNICA)* 🤖\n\n`;
    msgEq += `📊 *Indicadores Gerais:*\n`;
    msgEq += `• Mecânicos no Time: ${prod.resumo.totalMecanicos}\n`;
    msgEq += `• Total de Horas Produtivas: ${prod.resumo.totalHorasProdutivasEquipe}h (de ${prod.resumo.totalHorasApontadasEquipe}h apontadas)\n`;
    msgEq += `• Receita de Mão de Obra Gerada: ${formatarMoeda(prod.resumo.totalReceitaMaoDeObra)}\n`;
    msgEq += `• Ticket Médio de M.O. por OS: ${formatarMoeda(prod.resumo.ticketMedioGeralPorOS)}\n`;
    msgEq += `• Ocupação dos Boxes: ${prod.resumo.boxesOcupados}/${prod.resumo.totalBoxes} (${prod.resumo.taxaOcupacaoBoxes}%)\n\n`;

    if (prod.resumo.mecanicoDestaque) {
      msgEq += `🏆 *Colaborador Destaque:* ${prod.resumo.mecanicoDestaque.nome} com ${formatarMoeda(prod.resumo.mecanicoDestaque.receita)} gerados em ${prod.resumo.mecanicoDestaque.osCount} OSs atendidas.\n\n`;
    }

    if (prod.equipe.length > 0) {
      msgEq += `👨‍🏭 *Ranking Individual:*\n`;
      for (const m of prod.equipe) {
        const utilStr = m.taxaUtilizacao !== null ? `${m.taxaUtilizacao}%` : 'N/D';
        msgEq += `• *${m.nome}*: ${m.totalOSAtendidas} OS(s) | ${m.horasProdutivas}h prod. (Util: ${utilStr}) | ${formatarMoeda(m.receitaMaoDeObraGerada)}\n`;
      }
    }

    if (prod.resumo.totalSobrecarregados > 0) {
      msgEq += `\n⚠️ *Atenção:* ${prod.resumo.totalSobrecarregados} colaborador(es) com sobrecarga de jornada.`;
    }
    if (prod.resumo.totalOciosos > 0) {
      msgEq += `\n💡 *Capacidade:* ${prod.resumo.totalOciosos} colaborador(es) disponíveis/ociosos para novas OSs.`;
    }

    await msg.reply(msgEq);
    return true;
  }

  if (
    textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === 'relatório' ||
    textoLower === '!posicao' || textoLower === 'posicao' || textoLower === 'posiçao' ||
    textoLower.includes('relatório executivo') || textoLower.includes('relatorio executivo') ||
    textoLower.includes('pedir relatório') || textoLower.includes('pedir relatorio')
  ) {
    if (isContextOperacao) {
      const msgsOp = gerarMensagensOperacao(tenantState);
      await msg.reply(msgsOp[0]);
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgsOp[1]);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'sucesso' });
      return true;
    } else {
      if (!isContextAdmin) {
        await msg.reply('🔒 *Acesso Restrito:* O relatório executivo é disponibilizado exclusivamente para administradores autorizados.');
        await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'negado_permissao' });
        return true;
      }
      const msgs = gerarMensagensAdmin(tenantState);
      try {
        const jpgBuffer = await gerarImagemIndicadoresJPG(tenantState, tenantKey);
        const { MessageMedia } = getWhatsAppModules();
        const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
        if (wppClient) await wppClient.sendMessage(msg.from, media, { caption: msgs[0] });
        else await msg.reply(msgs[0]);
      } catch (imgErr) {
        console.warn('[WhatsApp] Falha ao enviar imagem JPG no comando !relatorio, enviando texto:', imgErr.message);
        await msg.reply(msgs[0]);
      }
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgs[1]);
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgs[2]);
      await auditarComandoWhatsApp({ tenantId: tenantKey, numero: (msg.author || msg.from || '').split('@')[0], comando: textoMensagem, resultado: 'sucesso' });
      return true;
    }
  }

  if (textoLower === '!patio' || textoLower === 'patio' || textoLower === 'pátio' || textoLower === 'boxes') {
    const resPatio = gerarResumoPatio(tenantState);
    await msg.reply(resPatio);
    return true;
  }

  if (textoLower === '!ajuda' || textoLower === 'ajuda' || textoLower === 'menu' || textoLower === '!comandos' || textoLower === 'comandos') {
    if (isContextOperacao) {
      const menuOp =
`🛠️ *COMANDOS OPERACIONAIS — PÁTIO CRM* 🚛

Olá, equipe de pátio e compras! Comandos e ações disponíveis:

📦 *Entradas & Documentos (Envie a Foto ou Texto):*
• 📋 *Foto de Pedido de Compra / Orçamento* ➔ Provisiona no Contas a Pagar (Status: _Aguardando NF_)
• 🧾 *Foto de Nota Fiscal (NF-e / DANFE)* ➔ Entrada de peças no almoxarifado, liquida pedido pendente e alimenta o financeiro/fiscal
• 💸 *Foto de Comprovante de Pagamento (Pix / Boleto / TED)* ➔ Baixa em conta a pagar e lançamento de saída de caixa

🚛 *Pátio & Ordens de Serviço:*
• 📸 *Foto da Placa ou Caminhão* ➔ Check-in e abertura automática de OS
• 🚛 *!patio* ➔ Ocupação dos boxes em tempo real
• 📋 *!relatorio* ➔ Veículos amanhecidos na oficina
• 🔍 *Status [placa]* ➔ Andamento e serviços (ex: *Status ABC1234*)
• ➕ *Abrir OS [placa]* ➔ Nova OS por texto (ex: *Abrir OS ABC1234*)
• 📝 *Inclua [serviço]* ➔ Adicionar item à OS (ex: *Inclua troca de mola*)

_Pátio CRM — Operação de Pátio e Oficina_`;
      await msg.reply(menuOp);
      return true;
    } else {
      const menuAdmin =
`🛠️ *COMANDOS DE ADMINISTRADOR — PÁTIO CRM* 🚛

Olá! Você tem acesso aos comandos executivos do sistema:

🌐 *!gestao360* — Relatório executivo 360º (Pátio, Caixa, Compras, Equipe e Frotas)
📦 *!compras* — Sugestão de compras cruzada com saldo de caixa e déficit de OS
👨‍🔧 *!equipe* — Produtividade dos mecânicos, ocupação de boxes e receita de M.O.
📊 *!relatorio* — Relatório executivo completo (3 mensagens + Gráfico JPG)
💰 *!caixa* — Posição financeira consolidada e títulos do dia
📈 *!previsao* — Previsão de fluxo de caixa (7, 15, 30 dias) e potencial de pátio
🔍 *!auditoria* — Auditoria de controles internos e parecer executivo da Verônica
🚛 *!patio* — Ocupação dos boxes e pátio em tempo real
📦 *Fotos de Pedidos, Notas Fiscais e Comprovantes* — Lançamento, provisionamento e conciliação automáticos
🔍 *Status [placa]* — Consultar OS de um veículo (ex: *Status ABC1234*)
➕ *Abrir OS [placa]* — Abrir nova OS com placa ou foto do caminhão
📝 *Inclua [serviço]* — Adicionar item à OS em andamento

_Pátio CRM — Gestão de Oficina Pesada_`;
      await msg.reply(menuAdmin);
      return true;
    }
  }

  return false;
}

/**
 * Trata o evento 'message' do cliente WhatsApp Web
 */
async function tratarMensagemWhatsApp(msg, wppClient) {
  if (msg.from.includes('status') || msg.from.includes('@broadcast')) {
    return;
  }

  const isGroup = msg.from && msg.from.includes('@g.us');
  const fromNumber = extrairTelefoneDeJid(msg);

  const { tenantKey, state: tenantState } = await resolverTenantPorChatId(msg.from, fromNumber);
  const msgId = (msg.id && (msg.id._serialized || msg.id.id)) || msg.id || null;
  const idemCheck = await verificarIdempotencia(msgId, tenantKey);
  if (idemCheck.duplicada) {
    console.log(`[WhatsApp Idempotência] Mensagem duplicada ignorada para tenant ${tenantKey}:`, msgId);
    if (idemCheck.resposta) {
      try { await msg.reply(idemCheck.resposta); } catch (_) {}
    }
    return;
  }

  const cfg = tenantState?.cfg || {};
  const responderApenasGrupos = cfg.responderApenasGrupos !== false;

  const grupoAdminIds = [
    ...(Array.isArray(cfg.grupoAdminId) ? cfg.grupoAdminId : [cfg.grupoAdminId]),
    ...(Array.isArray(cfg.gruposAdmin) ? cfg.gruposAdmin : []),
    ...(process.env.WHATSAPP_GRUPO_ADMIN_ID ? process.env.WHATSAPP_GRUPO_ADMIN_ID.split(',') : [])
  ].map(s => String(s || '').trim()).filter(Boolean);

  const grupoOperacaoIds = [
    ...(Array.isArray(cfg.grupoOperacaoId) ? cfg.grupoOperacaoId : [cfg.grupoOperacaoId]),
    ...(Array.isArray(cfg.gruposOperacao) ? cfg.gruposOperacao : []),
    ...(process.env.WHATSAPP_GRUPO_OPERACAO_ID ? process.env.WHATSAPP_GRUPO_OPERACAO_ID.split(',') : [])
  ].map(s => String(s || '').trim()).filter(Boolean);

  const isGrupoAdmin = isGroup && grupoAdminIds.includes(msg.from);
  const isGrupoOperacao = isGroup && grupoOperacaoIds.includes(msg.from);

  const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/\D/g, ''))
    .filter(Boolean);
  if (cfg.adminFones && Array.isArray(cfg.adminFones)) {
    cfg.adminFones.forEach(f => {
      const clean = String(f).replace(/\D/g, '');
      if (clean && !adminList.includes(clean)) adminList.push(clean);
    });
  }

  const isSenderAdmin = isAdminPhone(fromNumber, adminList);

  const rateCheck = verificarRateLimit(fromNumber);
  if (!rateCheck.permitido) {
    console.warn(`[WhatsApp RateLimit] Número ${fromNumber} excedeu o limite de requisições.`);
    try {
      await msg.reply('⚠️ Muitas mensagens recebidas em sequência. Por favor, aguarde um momento antes de tentar novamente.');
    } catch (_) {}
    await auditarComandoWhatsApp({
      tenantId: tenantKey,
      numero: normalizePhone(fromNumber) || fromNumber,
      comando: msg.body || (msg.hasMedia ? '[midia]' : ''),
      resultado: 'rate_limit_excedido',
      detalhes: { contagem: rateCheck.contagem }
    });
    return;
  }

  if (isGroup) {
    if (msg.from === '120363428179962435@g.us' || msg.from === '120363428840376088@g.us') {
      return;
    }
    if (!isGrupoAdmin && !isGrupoOperacao) {
      return;
    }
  } else {
    const linkInviteMatch = (msg.body || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]{20,30})/);
    if (linkInviteMatch && linkInviteMatch[1] && isSenderAdmin) {
      try {
        const inviteCode = linkInviteMatch[1];
        console.log(`[WhatsApp] Link de convite recebido do administrador (${inviteCode}). Aceitando convite...`);
        const groupId = await wppClient.acceptInvite(inviteCode);
        console.log(`✅ [WhatsApp] Entrou com sucesso no grupo via convite: ${groupId}`);
      } catch (eInv) {
        console.error('[WhatsApp] Erro ao aceitar convite:', eInv.message);
      }
      return;
    }

    // Regra estrita de operação: o agente deve responder SOMENTE nos grupos configurados.
    // Desativa qualquer resposta para números que enviem mensagem privada (clientes ou participantes cadastrados nos grupos).
    if (responderApenasGrupos) {
      console.log(`[WhatsApp] Mensagem direta de número ignorada (respostas ativas apenas em grupos). Remetente: ${fromNumber}`);
      return;
    }

    if (!isSenderAdmin) {
      // Número não cadastrado em adminFones recebe resposta neutra e nenhuma informação financeira
      await msg.reply('Olá! Sou o assistente do Pátio CRM. No momento, o atendimento automatizado está disponível apenas para motoristas e clientes com veículos em serviço ou administradores autorizados. Para mais informações, entre em contato diretamente com a nossa recepção.');
      await auditarComandoWhatsApp({
        tenantId: tenantKey,
        numero: normalizePhone(fromNumber) || fromNumber,
        comando: msg.body || (msg.hasMedia ? '[midia]' : ''),
        resultado: 'recusado_nao_autorizado',
        detalhes: { motivo: 'numero_desconhecido' }
      });
      return;
    }
  }

  const isContextAdmin = isGrupoAdmin || (!isGroup && isSenderAdmin);
  const isContextOperacao = isGrupoOperacao;

  let base64Image = null;
  let imageMime = 'image/jpeg';
  let base64Audio = null;
  let audioMime = null;

  if (msg.hasMedia) {
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        await new Promise(r => setTimeout(r, 400 * tentativa));
        const media = await msg.downloadMedia();
        if (media && media.data) {
          const mime = (media.mimetype || '').toLowerCase();
          if (mime.startsWith('audio/') || msg.type === 'ptt' || msg.type === 'audio') {
            base64Audio = media.data;
            audioMime = media.mimetype || 'audio/ogg';
            console.log(`[WhatsApp] Áudio/Voz baixado com sucesso (${audioMime}, ${base64Audio.length} bytes) na tentativa ${tentativa}`);
          } else {
            base64Image = media.data;
            imageMime = media.mimetype || 'image/jpeg';
            console.log(`[WhatsApp] Imagem baixada com sucesso (${imageMime}, ${base64Image.length} bytes) na tentativa ${tentativa}`);
          }
          break;
        }
      } catch (err) {
        if (tentativa === 4) console.warn('[WhatsApp] Erro ao baixar mídia recebida após retentativas:', err.message);
      }
    }
  }

  const ai = getAiClient();
  if (base64Audio) {
    const chavePendente = `${tenantKey}:${normalizePhone(fromNumber) || fromNumber}`;
    if (confirmacoesPendentes.has(chavePendente)) {
      await msg.reply('⚠️ *Operação Financeira Pendente:* Para confirmar ou cancelar lançamentos financeiros, por favor envie o comando em texto digitado (*CONFIRMAR* ou *CANCELAR*). Comandos de áudio não são aceitos para confirmação.');
      return;
    }

    try {
      console.log(`[WhatsApp] Processando áudio de voz recebido de ${fromNumber} via VoiceActionEngine...`);
      const resVoz = await voiceActionEngine.interpretarEExecutar({
        input: { audioBase64: base64Audio, mimeType: audioMime },
        context: {
          canal: 'whatsapp',
          tenantId: tenantKey,
          remetente: fromNumber,
          actorId: fromNumber,
          role: isSenderAdmin ? 'tenant_admin' : (isContextOperacao ? 'atendente' : 'cliente'),
          permissions: isSenderAdmin ? ['*'] : (isContextOperacao ? ['os:read', 'os:write'] : []),
          isSenderAdmin: !!isSenderAdmin,
          isContextOperacao: !!isContextOperacao,
          isContextAdmin: !!isContextAdmin
        },
        state: tenantState,
        aiClient: ai
      });

      await msg.reply(resVoz.resposta || 'Áudio processado pelo Pátio CRM.');
      return;
    } catch (errVoz) {
      console.error('[WhatsApp] Erro ao processar áudio no VoiceActionEngine:', errVoz);
      await msg.reply('Não consegui compreender o áudio com clareza. Você pode repetir ou digitar a mensagem?');
      return;
    }
  }

  const textoMensagem = (msg.body || '').trim();
  const textoLower = textoMensagem.toLowerCase().trim();
  console.log(`[WhatsApp] Mensagem no contexto [${isContextAdmin ? 'ADMIN' : (isContextOperacao ? 'OPERAÇÃO' : 'PRIVADO')}] de ${fromNumber}: "${textoMensagem}" | Foto: ${!!base64Image}`);

  if (textoLower.includes('aprovar') || textoLower.includes('recusar') || (textoLower.includes('orcamento') && (textoLower.includes('sim') || textoLower.includes('não') || textoLower.includes('nao')))) {
    const resOrcWpp = quotationService.processarComandoWhatsAppOrcamento({
      texto: textoMensagem,
      fromNumber,
      state: tenantState,
      tenantId: tenantKey
    });
    if (resOrcWpp.reconhecido && resOrcWpp.resposta) {
      await msg.reply(resOrcWpp.resposta);
      return;
    }
  }

  let docAnalise = null;
  const isDocTextual = textoLower.includes('pedido') || textoLower.includes('orçamento') || textoLower.includes('orcamento') ||
    textoLower.includes('nota fiscal') || textoLower.includes('danfe') || textoLower.includes('nf-e') || textoLower.includes('nfe') ||
    textoLower.includes('comprovante') || textoLower.includes('pagamento pix') || textoLower.includes('pago ');

  if (base64Image || isDocTextual) {
    try {
      docAnalise = await analisarDocumentoWhatsApp(base64Image, textoMensagem);
    } catch (eDoc) {
      console.warn('[WhatsApp] Erro na análise de documento:', eDoc.message);
    }
  }

  if (docAnalise && docAnalise.tipo === 'pedido_compra') {
    const dados = docAnalise.dados || {};
    await msg.reply(
      `📋 *Pedido de Compra / Cotação Identificado!*\n\n` +
      `• *Fornecedor:* ${dados.fornecedor || 'Identificado'}\n` +
      `• *Número do Pedido:* ${dados.numero_documento || 'S/N'}\n` +
      `• *Valor Total:* ${formatarMoeda(dados.valor_total || 0)}\n\n` +
      `_Documento recebido e provisionado para conferência no almoxarifado/compras._`
    );
    return;
  }

  if (docAnalise && docAnalise.tipo === 'nota_fiscal') {
    const dados = docAnalise.dados || {};
    await msg.reply(
      `🧾 *Nota Fiscal (NF-e / DANFE) Identificada!*\n\n` +
      `• *Emitente:* ${dados.fornecedor || 'Fornecedor'}\n` +
      `• *Número da NF:* ${dados.numero_documento || 'S/N'}\n` +
      `• *Chave de Acesso:* ${dados.chave_acesso || 'Identificada na imagem'}\n` +
      `• *Valor Total:* ${formatarMoeda(dados.valor_total || 0)}\n\n` +
      `_Registrado para conferência de entrada no estoque e escrituração fiscal._`
    );
    return;
  }

  if (docAnalise && docAnalise.tipo === 'comprovante_pagamento') {
    const dados = docAnalise.dados || {};
    await msg.reply(
      `💸 *Comprovante de Pagamento Identificado!*\n\n` +
      `• *Favorecido:* ${dados.favorecido || dados.fornecedor || 'Favorecido'}\n` +
      `• *Forma de Pagamento:* ${dados.forma_pagamento || 'Pix'}\n` +
      `• *Valor Pago:* ${formatarMoeda(dados.valor_total || 0)}\n` +
      `• *Autenticação:* ${dados.autenticacao || 'Identificada'}\n\n` +
      `_Comprovante recebido para conciliação financeira no Contas a Pagar/Caixa._`
    );
    return;
  }

  const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
  let matchPlaca = textoMensagem.match(placaRegex);
  let placaDaFoto = docAnalise?.dados?.placa || null;

  if (base64Image && !placaDaFoto) {
    try {
      const buffer = Buffer.from(base64Image, 'base64');
      const resOcr = await Tesseract.recognize(buffer, 'por');
      const textOcr = (resOcr?.data?.text || '').toUpperCase();
      const m = textOcr.match(placaRegex);
      if (m) {
        placaDaFoto = m[1].replace(/[- ]/g, '');
      }
    } catch (_) {}
  }

  const placaIdentificada = matchPlaca ? matchPlaca[1].toUpperCase().replace(/[- ]/g, '') : placaDaFoto;
  if (placaIdentificada) {
    ultimasPlacas.set(fromNumber, { placa: placaIdentificada, timestamp: Date.now() });
  }

  const infoRecente = ultimasPlacas.get(fromNumber);
  const placaContexto = (infoRecente && (Date.now() - infoRecente.timestamp < 15 * 60 * 1000)) ? infoRecente.placa : null;

  const isComandoExplicito = textoLower.startsWith('!') ||
    confirmacoesPendentes.has(`${tenantKey}:${normalizePhone(fromNumber) || fromNumber}`) ||
    textoLower === 'confirmar' || textoLower === 'cancelar' ||
    textoLower.includes('abrir caixa') || textoLower.includes('fechar caixa') ||
    textoLower.includes('lançar entrada') || textoLower.includes('lancar entrada') ||
    textoLower.includes('lançar saída') || textoLower.includes('lancar saida') ||
    ['relatorio', 'relatório', 'caixa', 'saldo', 'patio', 'pátio', 'boxes', 'ajuda', 'menu', 'comandos', 'previsao', 'previsão', 'forecast', 'auditoria', 'controles'].includes(textoLower);
  const isConsultaStatus = textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento');
  const isAberturaOS = textoLower.includes('abrir os') || textoLower.startsWith('abrir ') || textoLower === 'abrir';
  const isLancamentoItem = textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar');
  const isSaudacao = textoLower === 'oi' || textoLower === 'ola' || textoLower === 'olá' || textoLower === 'bom dia' || textoLower === 'boa tarde' || textoLower === 'boa noite' || textoLower.startsWith('bot') || textoLower.startsWith('agente');

  if (isGroup && !isComandoExplicito && !isConsultaStatus && !isAberturaOS && !isLancamentoItem && !base64Image && !matchPlaca) {
    return;
  }
  try {
    const tratado = await processarMensagemTexto(msg, {
      texto: textoMensagem,
      tenantKey,
      tenantState,
      isContextAdmin,
      isContextOperacao,
      isGroup,
      fromNumber,
      isSenderAdmin,
      wppClient
    });
    if (tratado) {
      await registrarIdempotencia(msgId);
      return;
    }

    if (textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento')) {
      const osLista = tenantState?.os || [];
      const placaAlvo = placaIdentificada || placaContexto;

      if (placaAlvo) {
        const veic = (tenantState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
        const osVeiculo = veic ? osLista.find(o => o.vei === veic.id && o.st !== 'finalizada') : null;

        if (osVeiculo) {
          const boxInfo = osVeiculo.box ? ((tenantState?.boxes || []).find(b => b.id === osVeiculo.box) || { nome: 'Box Pátio' }).nome : 'Fila de Espera no Pátio';
          
          let itensServ = '';
          let itensPec = '';
          if (isContextOperacao) {
            itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x)`).join('\n') || '• Vistoria de Entrada';
            itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x)`).join('\n');
          } else {
            itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x) — R$ ${(s.valor * s.qtd).toFixed(2)}`).join('\n') || '• Vistoria de Entrada';
            itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x) — R$ ${(p.valor * p.qtd).toFixed(2)}`).join('\n');
          }

          let resposta =
`📋 *Status da OS #${osVeiculo.num} — Placa ${veic.placa}*

🚛 *Veículo:* ${veic.marca || ''} ${veic.modelo || 'Caminhão'}
📍 *Localização:* ${boxInfo}
⚙️ *Situação:* *${osVeiculo.st.toUpperCase()}*
📅 *Previsão de Entrega:* ${osVeiculo.prev || 'Em andamento'}

🔧 *Serviços Lançados:*
${itensServ}
${itensPec ? `\n📦 *Peças:* \n${itensPec}` : ''}`;

          if (!isContextOperacao) {
            resposta += `\n\n💰 *Valor Atual da OS:* R$ ${(osVeiculo.total || 0).toFixed(2)}`;
          }

          resposta += `\n\n_Para adicionar serviços à OS, digite: "Inclua [serviço]"_`;
          await msg.reply(resposta);
          return;
        } else {
          await msg.reply(`Não localizei nenhuma OS em andamento para a placa *${placaAlvo}*. Para abrir uma nova OS, envie: *Abrir OS placa ${placaAlvo}*.`);
          return;
        }
      }

      if (osLista.length > 0) {
        const ultimas = osLista.slice(0, 4).map(o => {
          const v = (tenantState?.veiculos || []).find(x => x.id === o.vei) || { placa: 'N/I' };
          const b = o.box ? ((tenantState?.boxes || []).find(bx => bx.id === o.box) || {}).nome : 'Fila de Espera';
          return `• *OS #${o.num}* — Placa *${v.placa}*: ${o.st.toUpperCase()} (${b})`;
        }).join('\n');

        await msg.reply(`📋 *Painel Geral de Ordens de Serviço:*\n\n${ultimas}\n\nPara consultar o status de um veículo específico, envie: *Status placa ABC1234*.`);
      } else {
        await msg.reply('Nenhuma Ordem de Serviço ativa no momento. Para abrir uma nova OS, digite: *Abrir OS placa ABC1234*.');
      }
      return;
    }

    const isRedirecionamentoBox = (
      textoLower.includes('direcionar') ||
      textoLower.includes('mover') ||
      textoLower.includes('mudar box') ||
      textoLower.includes('trocar box') ||
      textoLower.includes('colocar no box') ||
      textoLower.includes('passar para o box')
    ) && !textoLower.includes('abrir os') && !textoLower.includes('abrir nova os');

    if (isRedirecionamentoBox || placaFinalParaAbrir || (textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar')) || isFalaNatural || (!isGroup && textoMensagem.length > 5)) {
      const resNat = await voiceActionEngine.interpretarEExecutar({
        input: { text: textoMensagem },
        context: {
          canal: 'whatsapp',
          tenantId: tenantKey,
          remetente: fromNumber,
          actorId: fromNumber,
          role: isSenderAdmin ? 'tenant_admin' : (isContextOperacao ? 'atendente' : 'cliente'),
          permissions: isSenderAdmin ? ['*'] : (isContextOperacao ? ['os:read', 'os:write'] : []),
          isSenderAdmin: !!isSenderAdmin,
          isContextOperacao: !!isContextOperacao,
          isContextAdmin: !!isContextAdmin
        },
        state: tenantState,
        aiClient: ai
      });

      if (resNat.ok) {
        await msg.reply(resNat.resposta);
        return;
      }
    }

    if (base64Image) {
      const resposta = `📸 *Foto recebida no Pátio CRM!*\n\n` +
        `Não consegui identificar o documento ou a placa do caminhão com nitidez.\n\n` +
        `Você pode enviar:\n` +
        `• 📋 *Foto de Pedido de Compra / Orçamento*\n` +
        `• 🧾 *Foto ou DANFE de Nota Fiscal (NF-e)*\n` +
        `• 💸 *Comprovante de Pagamento (Pix / Boleto / TED)*\n` +
        `• 🚛 *Foto da Placa do Caminhão (Ex: ABC1D23)*`;
      await msg.reply(resposta);
      return;
    }

    if (textoLower.includes('abrir') && textoLower.includes('os')) {
      await msg.reply('Para abrir a Ordem de Serviço, por favor informe a placa do veículo (ex: *Abrir OS placa ABC1234*) ou envie uma foto do caminhão/placa.');
      return;
    }

    if (isSaudacao) {
      const saudacao = `Olá! Sou o assistente virtual do *Pátio CRM* 🚛⚙️\n\n` +
        `Como posso ajudar você hoje?\n` +
        `1️⃣ *Para abrir uma OS:* Digite *Abrir OS placa ABC1234* ou envie a foto da placa.\n` +
        `2️⃣ *Para consultar status:* Digite *Status placa ABC1234*.\n` +
        `3️⃣ *Para incluir serviços:* Digite *Inclua [serviço]*.\n` +
        `4️⃣ *Para ver a ocupação:* Digite *!patio*`;
      await msg.reply(saudacao);
      return;
    }

    if (!isGroup && !responderApenasGrupos) {
      await msg.reply(
        `Mensagem recebida no *Pátio CRM*! 🚛\n\n` +
        `• Digite *!ajuda* para ver todos os comandos disponíveis.\n` +
        `• Digite *!relatorio* para o relatório executivo matinal.\n` +
        `• Digite *!caixa* para a posição financeira.`
      );
    }
  } catch (localErr) {
    console.error('[WhatsApp] Erro no processamento de mensagem:', localErr);
    if (isGroup || !responderApenasGrupos) {
      try {
        await msg.reply('Recebemos sua mensagem! Nossa equipe já está verificando no sistema.');
      } catch (_) {}
    }
  }
}

module.exports = {
  formatarMoeda,
  formatarDataBR,
  extrairDadosDocumentoHeuristico,
  analisarDocumentoWhatsApp,
  processarMensagemTexto,
  tratarMensagemWhatsApp,
  verificarRateLimit,
  auditarComandoWhatsApp,
  rateLimitMap,
  mensagensProcessadas,
  confirmacoesPendentes,
  execucoesEmAndamento,
  verificarIdempotencia,
  registrarIdempotencia,
  extrairValorMonetario,
  extrairTelefoneDeJid,
  obterPerfilNumeroWhatsApp,
  podeExecutarEscritaFinanceira,
  podeExecutarEstorno
};
