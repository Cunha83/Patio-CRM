'use strict';

/**
 * Detector de Recorrência de Serviços e Reclamações
 * Normaliza queixas e correlaciona com o histórico operacional do mesmo veículo.
 */

const CATALOGO_CATEGORIAS = [
  {
    codigo: 'SUSPENSAO_EIXO_BUCHAS',
    nome: 'Embuchamento e Buchas de Eixo',
    termos: [
      'embuchar', 'embuchamento', 'bucha', 'buchas', 'folga eixo',
      'eixo dianteiro', 'eixo traseiro', 'batendo eixo', 'pino de centro',
      'manga de eixo', 'pino manga', 'folga no eixo', 'trocar bucha'
    ]
  },
  {
    codigo: 'SUSPENSAO_MOLAS',
    nome: 'Molas e Feixes de Suspensão',
    termos: [
      'mola', 'molas', 'feixe de mola', 'arqueamento', 'reforco de mola',
      'reforço de mola', 'pino de mola', 'grampo de mola', 'lamina de mola',
      'lâmina de mola', 'quebrou mola', 'arrebentou mola'
    ]
  },
  {
    codigo: 'SISTEMA_FREIOS',
    nome: 'Sistema de Freios',
    termos: [
      'freio', 'freios', 'pastilha', 'lona de freio', 'cuica', 'cuíca',
      'disco de freio', 'tambor de freio', 'catraca de freio', 'valvula freio',
      'vazamento freio', 'nao freia', 'não freia'
    ]
  },
  {
    codigo: 'ESTRUTURAL_SOLDA',
    nome: 'Solda e Reparo Estrutural',
    termos: [
      'solda', 'soldagem', 'trinca', 'trincado', 'reforco chassi',
      'reforço chassi', 'chassi', 'longarina', 'soldar', 'rachou'
    ]
  },
  {
    codigo: 'DIRECAO_ALINHAMENTO',
    nome: 'Direção e Alinhamento',
    termos: [
      'alinhamento', 'balanceamento', 'geometria', 'puxando',
      'volante torto', 'terminais de direcao', 'terminais de direção',
      'barra de direcao', 'barra de direção', 'setor direcao'
    ]
  },
  {
    codigo: 'TRANSMISSAO_DIFERENCIAL',
    nome: 'Transmissão, Cardan e Diferencial',
    termos: [
      'diferencial', 'cruzeta', 'cardan', 'cambio', 'câmbio',
      'embreagem', 'patinando', 'ronco cambio', 'marcha escapando'
    ]
  }
];

function removerAcentos(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Identifica a categoria técnica de uma queixa ou serviço
 */
function classificarTexto(texto) {
  if (!texto) return { categoria: 'GERAL', nome: 'Manutenção Geral', termosEncontrados: [] };
  const limpo = removerAcentos(texto);

  for (const cat of CATALOGO_CATEGORIAS) {
    const termosMatch = cat.termos.filter(t => {
      const termoLimpo = removerAcentos(t);
      return limpo.includes(termoLimpo);
    });
    if (termosMatch.length > 0) {
      return {
        categoria: cat.codigo,
        nome: cat.nome,
        termosEncontrados: termosMatch
      };
    }
  }

  return {
    categoria: 'GERAL',
    nome: 'Manutenção Geral',
    termosEncontrados: []
  };
}

/**
 * Normaliza texto de reclamação e extrai sintomas principais
 */
function normalizarReclamacao(reclamacaoTexto) {
  const str = String(reclamacaoTexto || '').trim();
  const classif = classificarTexto(str);

  // Extração básica de sintomas por pontuação ou conjunções
  const partes = str
    .split(/(?:\.|;|,|\se\s+|\stambem\s+|\stambém\s+)/i)
    .map(p => p.trim())
    .filter(p => p.length >= 4);

  const sintomas = partes.length > 0 ? partes : [str || 'Inspeção geral'];

  return {
    reclamacaoOriginal: str,
    reclamacaoNormalizada: sintomas[0] || str,
    sintomas,
    categoria: classif.categoria,
    categoriaNome: classif.nome,
    termosIdentificados: classif.termosEncontrados
  };
}

/**
 * Detecta ocorrências prévias no histórico do veículo relacionadas à queixa atual
 */
function detectarRecorrencia({ reclamacao, kmAtual = 0, historicoVeiculo = {}, dataReferencia = null }) {
  const norm = normalizarReclamacao(reclamacao);
  const historicoOS = Array.isArray(historicoVeiculo?.historico) ? historicoVeiculo.historico : [];

  const dataHoje = dataReferencia ? new Date(dataReferencia) : new Date();
  const kmAtualNum = Number(kmAtual) || 0;

  const ocorrenciasRelacionadas = [];

  for (const os of historicoOS) {
    let bateuCategoria = false;
    let servicosIdentificados = [];

    // Checa serviços da OS anterior
    for (const s of (os.servicos || [])) {
      const catS = classificarTexto(s.nome);
      if (catS.categoria === norm.categoria && norm.categoria !== 'GERAL') {
        bateuCategoria = true;
        servicosIdentificados.push(s.nome);
      } else if (norm.categoria === 'GERAL') {
        // Se a queixa for geral, compara correspondência de palavras chave
        const sLimpo = removerAcentos(s.nome);
        const rLimpo = removerAcentos(norm.reclamacaoOriginal);
        if (sLimpo.includes(rLimpo) || rLimpo.includes(sLimpo)) {
          bateuCategoria = true;
          servicosIdentificados.push(s.nome);
        }
      }
    }

    // Checa queixa anterior se nenhum serviço identificou
    if (!bateuCategoria && os.queixa) {
      const catQ = classificarTexto(os.queixa);
      if (catQ.categoria === norm.categoria && norm.categoria !== 'GERAL') {
        bateuCategoria = true;
        servicosIdentificados.push(os.queixa);
      }
    }

    if (bateuCategoria) {
      const dtAbertura = os.dataAbertura ? new Date(os.dataAbertura) : null;
      let diasAtras = 0;
      if (dtAbertura && !isNaN(dtAbertura.getTime())) {
        const diffMs = dataHoje.getTime() - dtAbertura.getTime();
        diasAtras = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      const kmAnterior = Number(os.km) || 0;
      const kmRodados = (kmAtualNum > 0 && kmAnterior > 0) ? Math.max(0, kmAtualNum - kmAnterior) : 0;

      ocorrenciasRelacionadas.push({
        osId: os.osId,
        osNum: os.num,
        data: os.dataAbertura,
        kmAnterior,
        kmAtual: kmAtualNum,
        diasAtras,
        kmRodados,
        servicos: servicosIdentificados.length > 0 ? servicosIdentificados : ['Serviço relacionado anterior'],
        categoria: norm.categoria,
        categoriaNome: norm.categoriaNome,
        mecanico: os.mecanico
      });
    }
  }

  return {
    reclamacaoNormalizada: norm.reclamacaoNormalizada,
    categoriaDetectada: norm.categoria,
    categoriaNome: norm.categoriaNome,
    sintomas: norm.sintomas,
    ocorrenciasRelacionadas
  };
}

module.exports = {
  CATALOGO_CATEGORIAS,
  classificarTexto,
  normalizarReclamacao,
  detectarRecorrencia
};
