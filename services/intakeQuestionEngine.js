'use strict';

/**
 * Motor de Perguntas e Catálogo Técnico de Triagem (intakeQuestionEngine)
 * Seleciona perguntas progressivas de forma cirúrgica e gera o resumo estruturado da Pré-OS.
 * REGRA RIGOROSA: Não faz interrogatório longo e JAMAIS declara diagnóstico definitivo de forma autônoma.
 */

const { DOMINIOS_TRIAGEM } = require('./intake/triagemCatalog');

function normalizarTexto(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Identifica o domínio técnico principal a partir da reclamação
 */
function identificarDominioTecnico(texto) {
  const t = normalizarTexto(texto);
  for (const [chave, dom] of Object.entries(DOMINIOS_TRIAGEM)) {
    if (chave === 'OUTROS') continue;
    for (const termo of dom.termos) {
      if (t.includes(normalizarTexto(termo))) {
        return dom;
      }
    }
  }
  return DOMINIOS_TRIAGEM.OUTROS;
}

/**
 * Determina a próxima pergunta técnica relevante sem ser cansativo (máx 1-2 perguntas).
 */
function determinarProximaPergunta({
  categoria = null,
  reclamacaoOriginal = '',
  collected = {},
  answeredQuestions = [],
  historicoRelacionado = null
}) {
  const jaPerguntouKm = answeredQuestions.some(q => q.campo === 'kmAtual') || Boolean(collected.kmAtual && collected.kmAtual > 0);
  
  // 1. Quilometragem é a informação operacional prioritária número 1
  if (!jaPerguntouKm && (!collected.kmAtual || collected.kmAtual <= 0)) {
    return {
      id: 'q_km_atual',
      campo: 'kmAtual',
      texto: 'Qual a quilometragem atual do veículo?',
      tipo: 'km'
    };
  }

  // Se já respondeu 2 ou mais perguntas, encerra coleta progressiva para não fadigar
  if (answeredQuestions.length >= 2) {
    return null;
  }

  // Identifica o domínio técnico
  const textoParaAnalise = `${reclamacaoOriginal} ${collected.reclamacaoOriginal || ''}`;
  const dominio = identificarDominioTecnico(textoParaAnalise);

  const tNorm = normalizarTexto(textoParaAnalise);

  // 2. Busca uma pergunta do domínio que ainda não foi respondida nem citada na reclamação
  for (const p of dominio.perguntas) {
    const jaRespondida = answeredQuestions.some(q => q.id === p.id || q.campo === p.campo);
    if (jaRespondida) continue;

    const jaColetado = Boolean(collected[p.campo]);
    if (jaColetado) continue;

    // Se a reclamação inicial já respondeu a pergunta naturalmente, pula
    if (p.campo === 'condicoes' && (tNorm.includes('buraco') || tNorm.includes('frear') || tNorm.includes('subida') || tNorm.includes('alta velocidade') || tNorm.includes('parado'))) {
      continue;
    }
    if (p.campo === 'regiao' && (tNorm.includes('dianteir') || tNorm.includes('traseir') || tNorm.includes('frente') || tNorm.includes('lado direito') || tNorm.includes('lado esquerdo'))) {
      continue;
    }
    if (p.campo === 'fluido' && (tNorm.includes('oleo') || tNorm.includes('ar') || tNorm.includes('agua') || tNorm.includes('diesel'))) {
      continue;
    }

    return p;
  }

  return null;
}

/**
 * Extrai semanticamente o valor de uma resposta curta com base no campo esperado
 */
function extrairResposta({ question, textoResposta }) {
  const txt = String(textoResposta || '').trim();
  const norm = normalizarTexto(txt);

  if (!txt) return null;

  // Extração de KM
  if (question?.tipo === 'km' || question?.campo === 'kmAtual') {
    const matchMil = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i);
    if (matchMil) {
      const num = parseFloat(matchMil[1].replace(',', '.'));
      return { valor: Math.round(num * 1000), formatado: `${Math.round(num * 1000).toLocaleString('pt-BR')} km` };
    }
    const digits = txt.replace(/\D/g, '');
    if (digits && digits.length >= 3) {
      const n = parseInt(digits, 10);
      return { valor: n, formatado: `${n.toLocaleString('pt-BR')} km` };
    }
    return null;
  }

  // Extração de Região / Lado
  if (question?.tipo === 'regiao' || question?.campo === 'regiao' || question?.campo === 'puxando') {
    const partes = [];
    if (norm.includes('dianteir') || norm.includes('frente')) partes.push('Dianteira');
    if (norm.includes('traseir') || norm.includes('atras') || norm.includes('trás')) partes.push('Traseira');
    if (norm.includes('direit')) partes.push('Lado Direito');
    if (norm.includes('esquerd')) partes.push('Lado Esquerdo');
    if (partes.length > 0) {
      return { valor: partes.join(', '), formatado: partes.join(', ') };
    }
  }

  // Extração de Fluido
  if (question?.tipo === 'fluido' || question?.campo === 'fluido') {
    if (norm.includes('oleo') || norm.includes('óleo')) return { valor: 'Óleo', formatado: 'Óleo' };
    if (norm.includes('ar') && !norm.includes('arrefecimento')) return { valor: 'Ar comprimido', formatado: 'Ar comprimido' };
    if (norm.includes('agua') || norm.includes('água') || norm.includes('arrefecimento')) return { valor: 'Água / Arrefecimento', formatado: 'Líquido de Arrefecimento' };
    if (norm.includes('diesel') || norm.includes('combustivel')) return { valor: 'Diesel', formatado: 'Diesel' };
  }

  // Texto descritivo limpo
  const limpo = txt.charAt(0).toUpperCase() + txt.slice(1);
  return { valor: limpo, formatado: limpo };
}

/**
 * Gera o Resumo Estruturado da Pré-OS.
 * ATENÇÃO: Cumpre rigorosamente a regra de NÃO DIAGNOSTICAR automaticamente.
 * Separação estrita de Reclamação, Sintomas, Condições, Histórico e Hipótese Técnica.
 */
function formatarResumoPreOS({ preOS, session = {}, resumoContexto = {}, veiculo = null }) {
  const placa = veiculo?.placa || preOS?.placa || 'NÃO INFORMADA';
  const descVeiculo = veiculo
    ? `${veiculo.marca || ''} ${veiculo.modelo || 'Caminhão'}`.trim()
    : 'Caminhão';

  const km = session?.collected?.kmAtual || preOS?.kmAtual || 0;
  const kmStr = km > 0 ? `${km.toLocaleString('pt-BR')} km` : 'Não informada';

  const reclamacao = session?.collected?.reclamacaoOriginal || preOS?.reclamacaoOriginal || 'Inspeção geral';
  const condicoes = session?.collected?.condicoes || 'Conforme uso operacional habitual.';
  const regiao = session?.collected?.regiao || null;
  const ruido = session?.collected?.ruido || null;

  const ocorrencia = (resumoContexto?.servicosRelacionados && resumoContexto.servicosRelacionados[0]) ||
                     (preOS?.ocorrenciasRelacionadas && preOS.ocorrenciasRelacionadas[0]) || null;

  let historicoTexto = 'Nenhum serviço anterior recente correlacionado.';
  let rodagemHistorico = null;
  if (ocorrencia) {
    const nomeSrv = (ocorrencia.servicos && ocorrencia.servicos[0]) || 'Manutenção anterior';
    historicoTexto = `${nomeSrv} realizado há ${ocorrencia.diasAtras || 0} dias (OS #${ocorrencia.osNum || 'N/I'}, ${(ocorrencia.kmAnterior || ocorrencia.km || 0).toLocaleString('pt-BR')} km).`;
    if (ocorrencia.kmRodados > 0) {
      rodagemHistorico = `${ocorrencia.kmRodados.toLocaleString('pt-BR')} km desde a intervenção.`;
    }
  }

  const nivel = (resumoContexto?.nivelAtencao || (preOS?.possivelGarantia ? 'alto' : 'info')).toUpperCase();
  const possivelGarantiaStr = (preOS?.possivelGarantia || resumoContexto?.possivelGarantia) ? 'Sim' : 'Não';

  const linhas = [
    '📋 *PRÉ-ORDEM DE SERVIÇO (RESUMO TÉCNICO)*',
    '',
    `🚛 *Veículo:* ${descVeiculo}`,
    `🏷️ *Placa:* ${placa}`,
    `⏱️ *KM Atual:* ${kmStr}`,
    '',
    `🗣️ *Reclamação do Cliente:* "${reclamacao}"`
  ];

  if (regiao) linhas.push(`📍 *Localização Relatada:* ${regiao}`);
  if (condicoes) linhas.push(`⚙️ *Condições de Ocorrência:* ${condicoes}`);
  if (ruido) linhas.push(`🔊 *Sintoma de Ruído:* ${ruido}`);

  linhas.push('');
  linhas.push(`🔍 *Histórico Relacionado:* ${historicoTexto}`);
  if (rodagemHistorico) linhas.push(`📊 *Uso pós-serviço:* ${rodagemHistorico}`);

  linhas.push('');
  linhas.push(`⚠️ *Nível de Atenção:* *${nivel}*`);
  linhas.push(`🛡️ *Possível Retorno em Garantia:* *${possivelGarantiaStr}*`);

  linhas.push('');
  linhas.push('💡 *Recomendação Técnica:* Inspecionar o conjunto mecânico no box de atendimento antes de autorizar desmontagem ou substituição de componentes.');

  return linhas.join('\n');
}

module.exports = {
  DOMINIOS_TRIAGEM,
  identificarDominioTecnico,
  determinarProximaPergunta,
  extrairResposta,
  formatarResumoPreOS
};
