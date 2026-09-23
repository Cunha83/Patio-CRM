'use strict';

/**
 * Motor de Perguntas e Catálogo Técnico de Triagem (intakeQuestionEngine)
 * Seleciona perguntas progressivas de forma cirúrgica e gera o resumo estruturado da Pré-OS.
 * REGRA RIGOROSA: Não faz interrogatório longo e JAMAIS declara diagnóstico definitivo de forma autônoma.
 */

const DOMINIOS_TRIAGEM = {
  SUSPENSAO: {
    codigo: 'SUSPENSAO',
    nome: 'Suspensão e Eixos',
    termos: ['suspensao', 'suspensão', 'mola', 'molas', 'bucha', 'buchas', 'eixo', 'embuchamento', 'feixe', 'arqueamento', 'pino', 'manga', 'batendo'],
    perguntas: [
      {
        id: 'q_susp_condicao',
        campo: 'condicoes',
        texto: 'Essa pancada ou ruído acontece mais passando em buracos ou esterçando com o veículo parado?',
        tipo: 'condicao'
      },
      {
        id: 'q_susp_regiao',
        campo: 'regiao',
        texto: 'Em qual eixo e lado você nota mais o problema (dianteiro, traseiro, direito ou esquerdo)?',
        tipo: 'regiao'
      }
    ]
  },
  FREIOS: {
    codigo: 'FREIOS',
    nome: 'Sistema de Freios',
    termos: ['freio', 'freios', 'pastilha', 'lona', 'cuica', 'cuíca', 'disco', 'tambor', 'chiando', 'apitando', 'pedal'],
    perguntas: [
      {
        id: 'q_freio_condicao',
        campo: 'condicoes',
        texto: 'O ruído ou chiado acontece apenas quando aciona o freio ou de forma contínua rodando?',
        tipo: 'condicao'
      },
      {
        id: 'q_freio_lado',
        campo: 'puxando',
        texto: 'Você nota o caminhão puxando para algum lado ao frear?',
        tipo: 'lado'
      }
    ]
  },
  DIRECAO: {
    codigo: 'DIRECAO',
    nome: 'Direção e Alinhamento',
    termos: ['direcao', 'direção', 'alinhamento', 'geometria', 'volante', 'puxando', 'trepidando', 'vibrando'],
    perguntas: [
      {
        id: 'q_dir_condicao',
        campo: 'condicoes',
        texto: 'O problema acontece o tempo todo ou principalmente em velocidades mais altas?',
        tipo: 'condicao'
      },
      {
        id: 'q_dir_volante',
        campo: 'volante',
        texto: 'O volante fica desalinhado em linha reta ou apresenta folga perceptível?',
        tipo: 'volante'
      }
    ]
  },
  TRANSMISSAO: {
    codigo: 'TRANSMISSAO',
    nome: 'Transmissão, Cardan e Diferencial',
    termos: ['cambio', 'câmbio', 'marcha', 'embreagem', 'cardan', 'diferencial', 'cruzeta', 'patinando', 'tranco', 'ronco'],
    perguntas: [
      {
        id: 'q_transm_condicao',
        campo: 'condicoes',
        texto: 'O tranco ou ruído ocorre em alguma marcha específica ou ao arrancar com carga?',
        tipo: 'condicao'
      }
    ]
  },
  VAZAMENTO: {
    codigo: 'VAZAMENTO',
    nome: 'Vazamentos de Fluidos ou Ar',
    termos: ['vazamento', 'vazando', 'pingando', 'oleo', 'óleo', 'arrefecimento', 'agua', 'água', 'diesel', 'combustivel', 'combustível'],
    perguntas: [
      {
        id: 'q_vaz_fluido',
        campo: 'fluido',
        texto: 'Qual fluido aparenta estar vazando (óleo de motor, óleo de câmbio, ar, água ou diesel)?',
        tipo: 'fluido'
      },
      {
        id: 'q_vaz_condicao',
        campo: 'condicoes',
        texto: 'O vazamento ocorre com o caminhão parado ou apenas com o motor funcionando?',
        tipo: 'condicao'
      }
    ]
  },
  ESTRUTURAL: {
    codigo: 'ESTRUTURAL',
    nome: 'Estrutural, Chassi e Solda',
    termos: ['chassi', 'solda', 'trinca', 'trincado', 'longarina', 'quinta roda', 'travessa', 'rachou'],
    perguntas: [
      {
        id: 'q_est_regiao',
        campo: 'regiao',
        texto: 'Em qual região do chassi ou implemento foi observada a trinca ou necessidade de solda?',
        tipo: 'regiao'
      }
    ]
  },
  MOTOR: {
    codigo: 'MOTOR',
    nome: 'Motor e Arrefecimento',
    termos: ['motor', 'fumaca', 'fumaça', 'aquecendo', 'fervendo', 'falhando', 'potencia', 'potência', 'fraco'],
    perguntas: [
      {
        id: 'q_motor_condicao',
        campo: 'condicoes',
        texto: 'Apresenta fumaça visível (preta, branca ou azul) ou perda de força em subidas?',
        tipo: 'condicao'
      }
    ]
  },
  PNEUS: {
    codigo: 'PNEUS',
    nome: 'Pneus e Rodas',
    termos: ['pneu', 'pneus', 'roda', 'rodas', 'desgaste irregular', 'escamação', 'ombro'],
    perguntas: [
      {
        id: 'q_pneu_desgaste',
        campo: 'desgaste',
        texto: 'O desgaste anormal é no ombro interno, externo ou em escamação ao redor do pneu?',
        tipo: 'desgaste'
      }
    ]
  },
  ELETRICA: {
    codigo: 'ELETRICA',
    nome: 'Sistema Elétrico',
    termos: ['eletrica', 'elétrica', 'luz', 'farol', 'painel', 'bateria', 'alternador', 'partida', 'chicote'],
    perguntas: [
      {
        id: 'q_elet_condicao',
        campo: 'condicoes',
        texto: 'A falha ocorre na partida, na iluminação ou acendeu alguma luz de advertência no painel?',
        tipo: 'condicao'
      }
    ]
  },
  OUTROS: {
    codigo: 'OUTROS',
    nome: 'Geral e Acessórios',
    termos: [],
    perguntas: [
      {
        id: 'q_geral_condicao',
        campo: 'condicoes',
        texto: 'Quando esse problema começou a ser percebido e com que frequência ele ocorre?',
        tipo: 'condicao'
      }
    ]
  }
};

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
