const Tesseract = require('tesseract.js');
const { isAdminPhone } = require('../../lib/core');
const {
  getOrLoadState,
  mutateTenantState,
  salvarEstado,
  enqueueWrite,
  gerarId,
  extractTenantId,
  safeJsonParse,
  ultimasPlacas,
  getAiClient
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
 * Processa comandos executivos e de administração do WhatsApp
 */
async function processarMensagemTexto(msg, {
  texto = null,
  tenantKey = 'default',
  tenantState = {},
  isContextAdmin = true,
  isContextOperacao = false,
  wppClient = null
} = {}) {
  const textoMensagem = (texto !== null ? texto : (msg.body || '')).trim();
  const textoLower = textoMensagem.toLowerCase().trim();

  if (textoLower === '!caixa' || textoLower === 'caixa' || textoLower === 'saldo' || textoLower === '!financeiro' || textoLower === 'financeiro') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* Informações financeiras de caixa e valores são disponibilizadas exclusivamente no Grupo da Administração.');
      return true;
    }
    const resCaixa = gerarResumoCaixa(tenantState);
    await msg.reply(resCaixa);
    return true;
  }

  if (textoLower === '!previsao' || textoLower === 'previsao' || textoLower === 'previsão' || textoLower === '!forecast') {
    if (isContextOperacao) {
      await msg.reply('🔒 *Acesso Restrito:* A projeção de fluxo de caixa é disponibilizada exclusivamente no Grupo da Administração.');
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

  if (textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === 'relatório' || textoLower === '!posicao' || textoLower === 'posicao' || textoLower === 'posiçao') {
    if (isContextOperacao) {
      const msgsOp = gerarMensagensOperacao(tenantState);
      await msg.reply(msgsOp[0]);
      await new Promise(r => setTimeout(r, 800));
      if (wppClient) await wppClient.sendMessage(msg.from, msgsOp[1]);
      return true;
    } else {
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

  const isGroup = msg.from.includes('@g.us');
  const rawAuthor = isGroup ? (msg.author || msg.from) : msg.from;
  const fromNumber = (rawAuthor || '').split('@')[0].replace(/\D/g, '');

  const { tenantKey, state: tenantState } = await resolverTenantPorChatId(msg.from, fromNumber);
  const cfg = tenantState?.cfg || {};
  const grupoAdminId = cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '';
  const grupoOperacaoId = cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '';

  const isGrupoAdmin = isGroup && Boolean(grupoAdminId) && (msg.from === grupoAdminId);
  const isGrupoOperacao = isGroup && Boolean(grupoOperacaoId) && (msg.from === grupoOperacaoId);

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

  if (isGroup) {
    if (msg.from === '120363428179962435@g.us' || msg.from === '120363428840376088@g.us') {
      return;
    }
    if (!isGrupoAdmin && !isGrupoOperacao) {
      return;
    }
  } else {
    const linkInviteMatch = (msg.body || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]{20,30})/);
    if (linkInviteMatch && linkInviteMatch[1]) {
      try {
        if (!isSenderAdmin) {
          console.log(`[WhatsApp] Convite negado: remetente não é administrador.`);
          return;
        }
        const inviteCode = linkInviteMatch[1];
        console.log(`[WhatsApp] Link de convite recebido do administrador (${inviteCode}). Aceitando convite...`);
        const groupId = await wppClient.acceptInvite(inviteCode);
        console.log(`✅ [WhatsApp] Entrou com sucesso no grupo via convite: ${groupId}`);
        await msg.reply(`✅ *Convite aceito com sucesso!*\nO agente agora faz parte do grupo (\`${groupId}\`).`);
        return;
      } catch (eInv) {
        console.error('[WhatsApp] Erro ao aceitar convite:', eInv.message);
        await msg.reply(`⚠️ Falha ao entrar no grupo: ${eInv.message}`);
        return;
      }
    }

    if (!isSenderAdmin) {
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

      if (resVoz.ok && !resVoz.pendenteConfirmacao && resVoz.acao !== 'consultar_status' && resVoz.acao !== 'duvida_geral') {
        await msg.reply(
          `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
          `Mutações de dados via áudio de WhatsApp estão desabilitadas no piloto controlado para garantir rastreabilidade.\n` +
          `Por favor, utilize o *Pátio CRM Web* ou o *Assistente de Voz* no navegador para abertura de OS e cadastros.`
        );
        return;
      }

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
      if (resOrcWpp.sucesso) {
        await msg.reply(
          `⚠️ *Aprovação Digital via Link (Piloto Controlado)*\n\n` +
          `No piloto controlado, decisões de orçamento devem ser feitas através do link direto de aprovação digital enviado ao cliente.`
        );
        return;
      }
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
    await msg.reply(
      `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
      `O envio de pedidos de compra via WhatsApp está bloqueado no piloto controlado. Realize a entrada de compras diretamente pelo Pátio CRM Web.`
    );
    return;
  }

  if (docAnalise && docAnalise.tipo === 'nota_fiscal') {
    await msg.reply(
      `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
      `O envio de Notas Fiscais via WhatsApp está bloqueado no piloto controlado. Utilize o módulo Fiscal ou Estoque no Pátio CRM Web.`
    );
    return;
  }

  if (docAnalise && docAnalise.tipo === 'comprovante_pagamento') {
    await msg.reply(
      `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
      `A conciliação de comprovantes via WhatsApp está bloqueada no piloto controlado. Realize a baixa financeira diretamente no Financeiro do Pátio CRM Web.`
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
      wppClient
    });
    if (tratado) return;

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

    if (isRedirecionamentoBox) {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `Movimentação de boxes via WhatsApp está desativada no piloto controlado. Utilize o painel de Pátio & Boxes na Web.`
      );
      return;
    }

    const sessaoAtiva = technicalIntakeEngine.localizarSessaoAtiva({
      tenantId: tenantKey,
      actorId: `zap_${fromNumber}`,
      channel: 'whatsapp',
      state: tenantState
    });

    if (sessaoAtiva && !textoLower.includes('abrir nova os') && !base64Image) {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `A triagem interativa via WhatsApp está desativada no piloto controlado. Abra a OS diretamente pelo Pátio CRM Web ou por voz no navegador.`
      );
      return;
    }

    const querAbrirOS = placaIdentificada || textoLower.includes('abrir os') || textoLower.includes('abrir') || base64Image;
    const placaFinalParaAbrir = placaIdentificada || (textoLower.includes('abrir') ? placaContexto : null);

    if (placaFinalParaAbrir) {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `Abertura de OS via WhatsApp está desativada durante o piloto controlado para assegurar integridade transacional.\n` +
        `Por favor, utilize o Pátio CRM Web ou o assistente de voz no navegador para abrir a OS da placa ${placaFinalParaAbrir}.`
      );
      return;
    }

    if (textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar')) {
      await msg.reply(
        `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
        `Lançamento de itens na OS via WhatsApp desativado no piloto controlado. Acesse a folha da OS no Pátio CRM Web.`
      );
      return;
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

    const isFalaNatural = textoLower.includes('chegou') || textoLower.includes('coloca') || textoLower.includes('adiciona') ||
      textoLower.includes('não, a') || textoLower.includes('nao, a') || textoLower.includes('reclamou') || textoLower.includes('falou') ||
      textoLower.includes('quando freia') || textoLower.includes('barulho') || textoLower.includes('gelando') || textoLower.includes('vibrando') ||
      textoLower.includes('quilometragem') || textoLower.includes('excluir os') || textoLower.includes('apagar os');

    if (isFalaNatural || (!isGroup && textoMensagem.length > 5)) {
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
        if (resNat.acao === 'consultar_status' || resNat.acao === 'duvida_geral') {
          await msg.reply(resNat.resposta);
          return;
        } else {
          await msg.reply(
            `⚠️ *Canal em Modo Consulta (Piloto Controlado)*\n\n` +
            `Operações de abertura e alteração de OS via WhatsApp estão desativadas durante o piloto controlado para assegurar integridade transacional.\n` +
            `Por favor, utilize o Pátio CRM Web ou o assistente de voz no navegador.`
          );
          return;
        }
      }
    }

    if (!isGroup) {
      await msg.reply(
        `Mensagem recebida no *Pátio CRM*! 🚛\n\n` +
        `• Digite *!ajuda* para ver todos os comandos disponíveis.\n` +
        `• Digite *!relatorio* para o relatório executivo matinal.\n` +
        `• Digite *!caixa* para a posição financeira.`
      );
    }
  } catch (localErr) {
    console.error('[WhatsApp] Erro no processamento de mensagem:', localErr);
    try {
      await msg.reply('Recebemos sua mensagem! Nossa equipe já está verificando no sistema.');
    } catch (_) {}
  }
}

module.exports = {
  formatarMoeda,
  formatarDataBR,
  extrairDadosDocumentoHeuristico,
  analisarDocumentoWhatsApp,
  processarMensagemTexto,
  tratarMensagemWhatsApp
};
