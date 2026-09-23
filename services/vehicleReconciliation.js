'use strict';

const crypto = require('crypto');
const Tesseract = require('tesseract.js');
const { gerarTokenAcao, consumirTokenAcao } = require('../lib/tokens/securityToken');

// Memória de conflitos pendentes aguardando confirmação do operador (TTL 5 min)
const conflitosPendentes = new Map();

setInterval(() => {
  const agora = Date.now();
  for (const [token, item] of conflitosPendentes) {
    if (agora > item.expiraEm) conflitosPendentes.delete(token);
  }
}, 60 * 1000).unref();

function normalizarPlaca(val) {
  if (!val) return null;
  const limpa = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = limpa.match(/([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[0-9]{4})/);
  return m ? m[1] : null;
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

/**
 * Extrai placa e dados veiculares de uma foto (Gemini AI com fallback para Tesseract OCR)
 */
async function extrairPlacaDeFoto(imagemBase64, aiClient = null) {
  if (!imagemBase64) return null;

  if (typeof imagemBase64 === 'string' && (imagemBase64.startsWith('mock:') || imagemBase64.includes('mock_placa='))) {
    const match = imagemBase64.match(/(?:mock:|mock_placa=)([A-Z0-9]+)/i);
    const p = normalizarPlaca(match ? match[1] : imagemBase64);
    if (p) return { placa: p, marca: 'Scania', modelo: 'R 450', cor: 'Azul', origem: 'Mock Test' };
  }

  let base64Data = imagemBase64;
  let mimeType = 'image/jpeg';
  const matches = imagemBase64.match(/^data:(.+);base64,(.+)$/);
  if (matches) {
    mimeType = matches[1].split(';')[0];
    base64Data = matches[2];
  }

  // 1. Tentativa via Gemini AI Multimodal se disponível
  if (aiClient) {
    try {
      const prompt = `Você é um especialista em reconhecimento de placas e veículos automotores brasileiros (Mercosul e padrão antigo).
Analise a imagem da foto ou placa e extraia os dados.
Retorne APENAS um JSON estrito:
{
  "placa": "ABC1D23 ou null",
  "marca": "marca ou null",
  "modelo": "modelo ou null",
  "cor": "cor ou null"
}`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: prompt }
            ]
          }
        ]
      });

      const parsed = safeJsonParse(response.text);
      if (parsed && parsed.placa) {
        const placaNorm = normalizarPlaca(parsed.placa);
        if (placaNorm) {
          return {
            placa: placaNorm,
            marca: parsed.marca || null,
            modelo: parsed.modelo || null,
            cor: parsed.cor || null,
            origem: 'Gemini AI'
          };
        }
      }
    } catch (eAI) {
      console.warn('[Reconciliacao] Falha na leitura IA, acionando OCR:', eAI.message);
    }
  }

  // 2. Fallback via Tesseract OCR
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const resOcr = await Tesseract.recognize(buffer, 'por');
    const textOcr = (resOcr?.data?.text || '').toUpperCase();
    const placaEncontrada = normalizarPlaca(textOcr);
    if (placaEncontrada) {
      return {
        placa: placaEncontrada,
        marca: null,
        modelo: null,
        cor: null,
        origem: 'Tesseract OCR'
      };
    }
  } catch (eOcr) {
    console.warn('[Reconciliacao] Falha no OCR:', eOcr.message);
  }

  return null;
}

/**
 * Motor de Conciliação de Veículos:
 * - Vincula foto à OS
 * - Reconcilia com veículos já cadastrados evitando duplicidade
 * - Detecta conflitos de placa e exige confirmação explícita
 */
async function conciliarVeiculoOS({ osId, placaInformada, imagemBase64, confirmarConflito = false, tokenConfirmacao = null, state = {}, aiClient = null, context = {} }) {
  if (!state.os) state.os = [];
  if (!state.veiculos) state.veiculos = [];
  if (!state.clientes) state.clientes = [];
  if (!state.auditoria) state.auditoria = [];

  // Se for confirmação de conflito previamente gerado com token
  if (tokenConfirmacao) {
    const dadosConflito = conflitosPendentes.get(tokenConfirmacao);
    const validacao = consumirTokenAcao(tokenConfirmacao, {
      tenantId: context.tenantId,
      actorId: context.actorId,
      resourceId: osId ? String(osId) : undefined,
      action: 'substituir_placa'
    });

    if (!validacao.ok && !dadosConflito) {
      return { ok: false, error: validacao.error || 'Token de confirmação inválido ou expirado.' };
    }
    conflitosPendentes.delete(tokenConfirmacao);

    const targetOsId = dadosConflito ? dadosConflito.osId : validacao.payload?.resourceId;
    const osAlvo = state.os.find(o => o.id === targetOsId || String(o.num) === String(targetOsId));
    if (!osAlvo) {
      return { ok: false, error: 'Ordem de Serviço do conflito não encontrada no estado atual.' };
    }
    const veiculoAtual = state.veiculos.find(v => v.id === (dadosConflito ? dadosConflito.veiculoId : osAlvo.vei) || v.id === osAlvo.vei);
    return await executarVinculoVeiculo({
      osAlvo,
      veiculoAtual,
      placaDetectada: dadosConflito?.placaDetectada || validacao.payload?.metadata?.placaDetectada,
      dadosExtraidos: dadosConflito?.dadosExtraidos || null,
      state,
      foiConfirmado: true
    });
  }

  // Localiza a Ordem de Serviço
  const osAlvo = state.os.find(o => o.id === osId || String(o.num) === String(osId));
  if (!osAlvo) {
    return { ok: false, error: 'Ordem de Serviço não encontrada para conciliação.' };
  }

  let veiculoAtual = state.veiculos.find(v => v.id === osAlvo.vei);

  // Extração ou recebimento da placa
  let placaDetectada = normalizarPlaca(placaInformada);
  let dadosExtraidos = null;

  if (!placaDetectada && imagemBase64) {
    dadosExtraidos = await extrairPlacaDeFoto(imagemBase64, aiClient);
    if (dadosExtraidos && dadosExtraidos.placa) {
      placaDetectada = dadosExtraidos.placa;
    }
  }

  if (!placaDetectada) {
    return {
      ok: false,
      error: 'Não foi possível identificar a placa na imagem enviada. Forneça uma foto mais nítida ou digite a placa manualmente.'
    };
  }

  // ── DETECÇÃO DE CONFLITO ──
  // Conflito ocorre quando o veículo já possuía uma placa válida e confirmada diferente da foto
  const temPlacaValidaAnterior = veiculoAtual && veiculoAtual.placa &&
    veiculoAtual.placa !== 'SEM-PLACA' &&
    !veiculoAtual.placa.startsWith('ENT-') &&
    !veiculoAtual.pendenciaCadastral;

  if (temPlacaValidaAnterior && normalizarPlaca(veiculoAtual.placa) !== placaDetectada) {
    const token = gerarTokenAcao({
      tenantId: context.tenantId || 'default',
      actorId: context.actorId || 'operador',
      resourceId: String(osAlvo.id),
      action: 'substituir_placa',
      version: state.versao || 0,
      ttlMs: 5 * 60 * 1000
    });
    conflitosPendentes.set(token, {
      osId: osAlvo.id,
      veiculoId: veiculoAtual ? veiculoAtual.id : null,
      placaDetectada,
      dadosExtraidos,
      expiraEm: Date.now() + 5 * 60 * 1000
    });

    return {
      ok: true,
      conflito: true,
      tokenConfirmacao: token,
      placaAtual: veiculoAtual.placa,
      placaDetectada,
      osNum: osAlvo.num,
      mensagem: `⚠️ Conflito Detectado: A foto contém a placa ${placaDetectada}, mas a OS #${osAlvo.num} está atualmente cadastrada com a placa ${veiculoAtual.placa}. Deseja confirmar a substituição?`
    };
  }

  // Executa o vínculo definitivo evitando duplicidade
  return await executarVinculoVeiculo({
    osAlvo,
    veiculoAtual,
    placaDetectada,
    dadosExtraidos,
    state,
    foiConfirmado: false
  });
}

/**
 * Aplica o vínculo, conciliação com veículos existentes e limpeza de duplicidades
 */
async function executarVinculoVeiculo({ osAlvo, veiculoAtual, placaDetectada, dadosExtraidos, state, foiConfirmado }) {
  // 1. Procura se a placa já está cadastrada em outro veículo (Evitar Duplicidade)
  const veiculoExistente = state.veiculos.find(v =>
    v.id !== veiculoAtual?.id && normalizarPlaca(v.placa) === placaDetectada
  );

  let veiculoFinal = null;
  let conciliouComExistente = false;

  if (veiculoExistente) {
    // Reconcilia diretamente com o cadastro existente!
    conciliouComExistente = true;
    veiculoFinal = veiculoExistente;
    osAlvo.vei = veiculoExistente.id;
    osAlvo.cli = veiculoExistente.cli;

    // Se o veículo anterior era apenas um rascunho temporário sem placa e sem outras OSs, remove para não deixar lixo
    if (veiculoAtual && (veiculoAtual.pendenciaCadastral || veiculoAtual.placa === 'SEM-PLACA')) {
      const outrasOS = state.os.filter(o => o.id !== osAlvo.id && o.vei === veiculoAtual.id);
      if (outrasOS.length === 0) {
        state.veiculos = state.veiculos.filter(v => v.id !== veiculoAtual.id);
      }
    }
  } else if (veiculoAtual) {
    // Atualiza o veículo atual da OS com a placa identificada
    veiculoAtual.placa = placaDetectada;
    veiculoAtual.pendenciaCadastral = false;
    veiculoAtual.pendencias = [];
    if (dadosExtraidos) {
      if (dadosExtraidos.marca && (!veiculoAtual.marca || veiculoAtual.marca === 'Pendente')) veiculoAtual.marca = dadosExtraidos.marca;
      if (dadosExtraidos.modelo && (!veiculoAtual.modelo || veiculoAtual.modelo === 'Veículo Não Identificado')) veiculoAtual.modelo = dadosExtraidos.modelo;
      if (dadosExtraidos.cor && (!veiculoAtual.cor || veiculoAtual.cor === 'Não informada')) veiculoAtual.cor = dadosExtraidos.cor;
    }
    veiculoFinal = veiculoAtual;
  } else {
    // Cria novo veículo
    veiculoFinal = {
      id: 'v_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      cli: osAlvo.cli,
      placa: placaDetectada,
      marca: dadosExtraidos?.marca || 'Caminhão',
      modelo: dadosExtraidos?.modelo || 'Cavalo Mecânico',
      ano: '',
      cor: dadosExtraidos?.cor || 'Não informada',
      km: osAlvo.km || 0,
      tipo: 'Cavalo Mecânico',
      pendenciaCadastral: false,
      criadoEm: Date.now()
    };
    state.veiculos.push(veiculoFinal);
    osAlvo.vei = veiculoFinal.id;
  }

  // 2. Resolve a pendência cadastral na Ordem de Serviço SEM alterar o status operacional
  osAlvo.pendenciaCadastral = false;
  osAlvo.pendencias = (osAlvo.pendencias || []).filter(p => p !== 'placa_pendente');

  // 3. Registra na trilha de auditoria
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: 'aud_' + Date.now(),
    dataHora: new Date().toISOString(),
    canal: 'foto_conciliacao',
    usuario: 'Operador',
    intencao: 'conciliacao_veiculo',
    comando: `Anexo de foto com placa ${placaDetectada}`,
    resumo: conciliouComExistente
      ? `OS #${osAlvo.num} conciliada com veículo existente ${placaDetectada} (${veiculoFinal.modelo}). Nenhuma duplicidade criada.`
      : `Placa ${placaDetectada} vinculada à OS #${osAlvo.num}. Pendência resolvida.`,
    osId: osAlvo.id
  });

  if (state.auditoria.length > 500) state.auditoria.length = 500;

  const msgSucesso = conciliouComExistente
    ? `✅ Veículo conciliado com o cadastro existente (Placa ${placaDetectada} — ${veiculoFinal.marca || ''} ${veiculoFinal.modelo || ''}). Pendência cadastral resolvida sem duplicidade!`
    : `✅ Placa ${placaDetectada} identificada na foto e cadastrada na OS #${osAlvo.num} com sucesso. Pendência cadastral resolvida!`;

  return {
    ok: true,
    conciliado: true,
    conflito: false,
    conciliouComExistente,
    placa: placaDetectada,
    veiculoId: veiculoFinal.id,
    clienteId: veiculoFinal.cli,
    osId: osAlvo.id,
    numOS: osAlvo.num,
    mensagem: msgSucesso
  };
}

module.exports = {
  conciliarVeiculoOS,
  extrairPlacaDeFoto,
  normalizarPlaca
};
