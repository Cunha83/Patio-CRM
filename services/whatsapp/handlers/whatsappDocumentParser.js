'use strict';

const Tesseract = require('tesseract.js');
const { getAiClient, safeJsonParse } = require('../../../lib/serverContext');

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

module.exports = {
  extrairDadosDocumentoHeuristico,
  analisarDocumentoWhatsApp
};
