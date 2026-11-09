'use strict';

/**
 * Pátio CRM — Motor de Boletos Bancários e Títulos Febraban & Pix Híbrido
 * Arquitetura Modular (< 260 linhas).
 */

const crypto = require('crypto');

// Calcula Dígito Verificador usando Módulo 10 (Padrão Febraban para Linha Digitável)
function calcularModulo10(numeroStr) {
  const digits = String(numeroStr).replace(/\D/g, '');
  let soma = 0;
  let peso = 2;

  for (let i = digits.length - 1; i >= 0; i--) {
    let mul = Number(digits[i]) * peso;
    if (mul > 9) {
      mul = Math.floor(mul / 10) + (mul % 10);
    }
    soma += mul;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return (10 - resto) % 10;
}

// Calcula Dígito Verificador usando Módulo 11 (Padrão Febraban para Código de Barras Geral)
function calcularModulo11Febraban(numeroStr) {
  const digits = String(numeroStr).replace(/\D/g, '');
  let soma = 0;
  let peso = 2;

  for (let i = digits.length - 1; i >= 0; i--) {
    soma += Number(digits[i]) * peso;
    peso = peso >= 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return (dv === 0 || dv === 10 || dv === 11) ? 1 : dv;
}

// Calcula o Fator de Vencimento Febraban (com suporte à virada de ciclo de 22/02/2025)
function calcularFatorVencimento(dataVencimento) {
  if (!dataVencimento) return '0000';
  const str = String(dataVencimento).split('T')[0];
  const parts = str.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return '0000';
  }

  const baseDate = new Date(Date.UTC(1997, 9, 7)); // 1997-10-07 UTC
  const targetDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const diffDays = Math.round((targetDate - baseDate) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '0000';

  let fator = diffDays;
  if (fator >= 10000) {
    fator = 1000 + ((fator - 10000) % 9000);
  }
  return String(fator).padStart(4, '0');
}

// Formata valor nominal em 10 dígitos com zeros à esquerda (em centavos)
function formatarValorNominal(valor) {
  const num = Math.max(0, Number(valor) || 0);
  return String(Math.round(num * 100)).padStart(10, '0');
}

// Gera Campo Livre bancário de 25 posições conforme banco
function gerarCampoComposicaoBancaria({ banco, agencia, conta, carteira, nossoNumero }) {
  const ag = String(agencia || '0000').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const cc = String(conta || '00000').replace(/\D/g, '').padStart(8, '0').slice(-8);
  const cart = String(carteira || '17').replace(/\D/g, '').padStart(2, '0').slice(-2);
  const nn = String(nossoNumero || '1').replace(/\D/g, '').padStart(11, '0').slice(-11);
  return `${cart}${ag}${cc}${nn}`.padEnd(25, '0').slice(0, 25);
}

// Gera Código de Barras (44 dígitos) e Linha Digitável (47 dígitos) formatada
function gerarCodigoBarrasELinhaDigitavel(params) {
  const banco = String(params.banco || '001').padStart(3, '0').slice(-3);
  const moeda = '9';
  const fatorVenc = calcularFatorVencimento(params.vencimento);
  const valorFmt = formatarValorNominal(params.valor);
  const campoLivre = gerarCampoComposicaoBancaria({
    banco,
    agencia: params.agencia,
    conta: params.conta,
    carteira: params.carteira,
    nossoNumero: params.nossoNumero
  });

  const preDV = `${banco}${moeda}`;
  const posDV = `${fatorVenc}${valorFmt}${campoLivre}`;
  const dvGeral = calcularModulo11Febraban(`${preDV}${posDV}`);
  const codigoBarras = `${preDV}${dvGeral}${posDV}`;

  // Montagem dos 5 campos da Linha Digitável
  const campo1SemDV = `${banco}${moeda}${campoLivre.slice(0, 5)}`;
  const campo1 = `${campo1SemDV}${calcularModulo10(campo1SemDV)}`;

  const campo2SemDV = campoLivre.slice(5, 15);
  const campo2 = `${campo2SemDV}${calcularModulo10(campo2SemDV)}`;

  const campo3SemDV = campoLivre.slice(15, 25);
  const campo3 = `${campo3SemDV}${calcularModulo10(campo3SemDV)}`;

  const campo4 = String(dvGeral);
  const campo5 = `${fatorVenc}${valorFmt}`;

  const linhaDigitavel = `${campo1}${campo2}${campo3}${campo4}${campo5}`;
  const linhaDigitavelFormatada = `${campo1.slice(0, 5)}.${campo1.slice(5)} ${campo2.slice(0, 5)}.${campo2.slice(5)} ${campo3.slice(0, 5)}.${campo3.slice(5)} ${campo4} ${campo5}`;

  return {
    codigoBarras,
    linhaDigitavel,
    linhaDigitavelFormatada,
    fatorVencimento: fatorVenc,
    valorFormatado: valorFmt,
    dvGeral
  };
}

// Calcula CRC16-CCITT (0xFFFF polinômio 0x1021) para padrão EMVCo do Pix
function calcularCRC16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = ((crc & 0x8000) !== 0) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function emvField(id, value) {
  const v = String(value || '');
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

// Gera Payload Pix Híbrido EMVCo Dinâmico (Pix Copia e Cola)
function gerarPayloadPixHibrido({ chavePix, recebedorNome, cidade, valor, txid }) {
  const gui = emvField('00', 'br.gov.bcb.pix');
  const chave = emvField('01', chavePix || 'pix@molasfort.com.br');
  const merchantAccount = emvField('26', `${gui}${chave}`);
  const merchantCategory = emvField('52', '0000');
  const currency = emvField('53', '986'); // BRL
  const amount = emvField('54', (Number(valor) || 0).toFixed(2));
  const country = emvField('58', 'BR');
  const name = emvField('59', (recebedorNome || 'AUTO MOLAS FORT').slice(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const city = emvField('60', (cidade || 'FORTALEZA').slice(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const tx = emvField('05', (txid || 'BORD' + Date.now()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 25));
  const additionalData = emvField('62', tx);

  const payloadSemCRC = `000201${merchantAccount}${merchantCategory}${currency}${amount}${country}${name}${city}${additionalData}6304`;
  const crc16 = calcularCRC16(payloadSemCRC);
  return {
    payload: `${payloadSemCRC}${crc16}`,
    crc16,
    txid: tx
  };
}

// Calcula encargos de atraso (multa e juros de mora pro rata die)
function calcularEncargosAtraso({
  valorOriginal,
  vencimento,
  dataConsulta = new Date().toISOString(),
  multaPercentual = 2.0,
  jurosMensalPercentual = 1.0
}) {
  const val = Math.max(0, Number(valorOriginal) || 0);
  if (!vencimento) {
    return { diasAtraso: 0, multaValor: 0, jurosValor: 0, totalEncargos: 0, valorAtualizado: val };
  }

  const vParts = String(vencimento).split('T')[0].split('-').map(Number);
  const cParts = String(dataConsulta).split('T')[0].split('-').map(Number);
  const dVenc = new Date(Date.UTC(vParts[0], vParts[1] - 1, vParts[2]));
  const dCons = new Date(Date.UTC(cParts[0], cParts[1] - 1, cParts[2]));
  const diasAtraso = Math.max(0, Math.floor((dCons.getTime() - dVenc.getTime()) / (1000 * 60 * 60 * 24)));

  if (diasAtraso <= 0) {
    return { diasAtraso: 0, multaValor: 0, jurosValor: 0, totalEncargos: 0, valorAtualizado: val };
  }

  const multaValor = Math.round(val * (multaPercentual / 100) * 100) / 100;
  const taxaDiaria = (jurosMensalPercentual / 100) / 30;
  const jurosValor = Math.round(val * taxaDiaria * diasAtraso * 100) / 100;
  const totalEncargos = Math.round((multaValor + jurosValor) * 100) / 100;
  return {
    diasAtraso,
    multaValor,
    jurosValor,
    totalEncargos,
    valorAtualizado: Math.round((val + totalEncargos) * 100) / 100
  };
}

// Emite e gera estrutura completa de Boleto Bancário Híbrido
function gerarBoletoCompleto(params) {
  const {
    tituloId,
    tenantId = 'default',
    pagador = {},
    beneficiario = {},
    valor = 0,
    vencimento,
    nossoNumero = String(Date.now()).slice(-9),
    chavePix
  } = params;

  const dadosCodBarras = gerarCodigoBarrasELinhaDigitavel({
    banco: beneficiario.banco || '001',
    vencimento,
    valor,
    agencia: beneficiario.agencia,
    conta: beneficiario.conta,
    carteira: beneficiario.carteira,
    nossoNumero
  });

  const txid = `TIT${String(tituloId || '').replace(/\D/g, '').slice(-15) || Date.now()}`;
  const pix = gerarPayloadPixHibrido({
    chavePix: chavePix || beneficiario.chavePix,
    recebedorNome: beneficiario.nome,
    cidade: beneficiario.cidade || 'FORTALEZA',
    valor,
    txid
  });

  return {
    id: 'bol_' + crypto.randomUUID().slice(0, 10),
    tituloId,
    tenantId,
    banco: beneficiario.banco || '001',
    nossoNumero,
    codigoBarras: dadosCodBarras.codigoBarras,
    linhaDigitavel: dadosCodBarras.linhaDigitavelFormatada,
    linhaDigitavelLimpa: dadosCodBarras.linhaDigitavel,
    fatorVencimento: dadosCodBarras.fatorVencimento,
    valor: Number(valor) || 0,
    vencimento,
    pixCopiaECola: pix.payload,
    pixTxid: txid,
    pagador: {
      nome: pagador.nome || 'Cliente Frotista',
      cnpj: pagador.cnpj || pagador.doc || '',
      endereco: pagador.endereco || ''
    },
    beneficiario: {
      nome: beneficiario.nome || 'Oficina Mecânica',
      cnpj: beneficiario.cnpj || '',
      agencia: beneficiario.agencia || '',
      conta: beneficiario.conta || '',
      carteira: beneficiario.carteira || ''
    },
    status: 'emitido',
    emitidoEm: new Date().toISOString()
  };
}

module.exports = {
  calcularModulo10,
  calcularModulo11Febraban,
  calcularFatorVencimento,
  formatarValorNominal,
  gerarCampoComposicaoBancaria,
  gerarCodigoBarrasELinhaDigitavel,
  gerarPayloadPixHibrido,
  calcularEncargosAtraso,
  gerarBoletoCompleto
};
