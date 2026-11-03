'use strict';

const { normalizarKm, normalizarPlaca } = require('./voiceRulesHelpers');

function matchHighRiskOS(t) {
  if (/(?:excluir|apagar|deletar|cancelar)\s*(?:a\s+|o\s+)?(?:os|ordem)/i.test(t)) {
    const matchNum = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i);
    return {
      intencao: 'excluir_os',
      risco: 'alto',
      os: { num: matchNum ? parseInt(matchNum[1], 10) : null },
      cliente: null,
      veiculo: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Atenção: excluir uma Ordem de Serviço é uma ação irreversível.'
    };
  }

  if (/(?:faturar|fechar)\s*(?:a\s+|o\s+)?(?:os|ordem)/i.test(t) || t.includes('faturamento da os')) {
    const matchNum = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i);
    return {
      intencao: 'faturar_os',
      risco: 'alto',
      os: { num: matchNum ? parseInt(matchNum[1], 10) : null },
      cliente: null,
      veiculo: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Atenção: o faturamento de OS gera lançamentos financeiros definitivos.'
    };
  }

  return null;
}

function matchCorrection(t) {
  const isAbertura = t.includes('chegou') || t.includes('abrir os') || t.includes('nova os') || t.includes('ordem de serviço') || t.includes('entrada');
  const isEstoque = t.includes('estoque');
  const isCorrecao = t.startsWith('não,') || t.startsWith('nao,') || t.includes('corrige') || t.includes('corrigir') || t.includes('ajuste') || t.includes('ajustar') || t.includes('muda') || t.includes('mudar') || (t.includes('quilometragem é') || t.includes('km é'));
  if (!isAbertura && !isEstoque && (isCorrecao || (!t.includes('chegou') && (t.startsWith('não') || t.startsWith('nao'))))) {
    const kmEncontrado = normalizarKm(t);
    if (kmEncontrado) {
      return {
        intencao: 'corrigir_campo',
        risco: 'baixo',
        cliente: null,
        veiculo: null,
        os: null,
        correcoes: [{ campo: 'km', valor: kmEncontrado }],
        itens_solicitados: { servicos: [], pecas: [] },
        resposta_falada: `Quilometragem ajustada para ${kmEncontrado.toLocaleString('pt-BR')} km.`
      };
    }
  }
  return null;
}

function matchInspection(t) {
  if (t.includes('inspeção') || t.includes('inspecao') || t.includes('laudo') || t.includes('constatado') || t.includes('identifiquei') || t.includes('folga no') || t.includes('folga na') || t.includes('folga excessiva')) {
    return {
      intencao: 'registrar_inspecao_voz',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Identificando itens apontados na inspeção técnica.'
    };
  }
  return null;
}

function matchAddComplaint(t, context) {
  const termosQueixa = ['ar não tá gelando', 'ar nao ta gelando', 'barulho', 'vazamento', 'fumaça', 'falhando', 'queixa', 'reclamou', 'não gela', 'nao gela', 'vibrando', 'estralando'];
  const temTermoQueixa = termosQueixa.some(termo => t.includes(termo));

  if (t.includes('coloca também') || t.includes('coloca tambem') || t.includes('adiciona que') || t.includes('anota que') || (temTermoQueixa && !t.includes('chegou') && !t.includes('abrir os'))) {
    let textoQueixa = t.replace(/^(?:coloca(?:|r)|adiciona(?:|r)|anota(?:|r))\s*(?:também|tambem)?\s*(?:que)?\s*/i, '').trim();
    if (textoQueixa) {
      textoQueixa = textoQueixa.charAt(0).toUpperCase() + textoQueixa.slice(1);
      return {
        intencao: 'adicionar_reclamacao',
        risco: 'baixo',
        cliente: null,
        veiculo: null,
        os: {
          id_alvo: context.activeOsId || null,
          reclamacoes: [textoQueixa]
        },
        correcoes: [],
        itens_solicitados: { servicos: [], pecas: [] },
        resposta_falada: `Reclamação anotada: "${textoQueixa}".`
      };
    }
  }
  return null;
}

function matchCheckinAndOpenOS(t) {
  if (!t.includes('chegou') && !t.includes('abrir os') && !t.includes('nova os') && !t.includes('ordem de serviço') && !t.includes('entrada de veículo') && !t.includes('entrada do') && !t.includes('entrada da')) {
    return null;
  }

  let clienteNome = '';
  const matchCliente = t.match(/(?:do|da|cliente|proprietário|dono)\s+([A-ZÀ-Úa-zà-ú0-9\s]+?)(?=\.|\,|\stá|\st[\u00e1a]|\sano|\skm|\scom|\splaca|$)/i);
  if (matchCliente) {
    clienteNome = matchCliente[1].trim().replace(/^(o|a|os|as)\s+/i, '');
  }

  let marca = '';
  let modelo = '';
  let cor = '';
  let ano = '';

  const modelosConhecidos = [
    { modelo: 'Onix', marca: 'Chevrolet', tipo: 'Passeio' },
    { modelo: 'Prisma', marca: 'Chevrolet', tipo: 'Passeio' },
    { modelo: 'S10', marca: 'Chevrolet', tipo: 'Picape' },
    { modelo: 'Gol', marca: 'Volkswagen', tipo: 'Passeio' },
    { modelo: 'Constellation 24.280', marca: 'Volkswagen', tipo: 'Truck' },
    { modelo: 'Constellation', marca: 'Volkswagen', tipo: 'Truck' },
    { modelo: 'Delivery', marca: 'Volkswagen', tipo: 'VUC' },
    { modelo: 'R 450', marca: 'Scania', tipo: 'Cavalo Mecânico' },
    { modelo: 'Scania', marca: 'Scania', tipo: 'Cavalo Mecânico' },
    { modelo: 'FH 540', marca: 'Volvo', tipo: 'Cavalo Mecânico' },
    { modelo: 'FH', marca: 'Volvo', tipo: 'Cavalo Mecânico' },
    { modelo: 'VM', marca: 'Volvo', tipo: 'Truck' },
    { modelo: 'Actros 2651', marca: 'Mercedes-Benz', tipo: 'Cavalo Mecânico' },
    { modelo: 'Actros', marca: 'Mercedes-Benz', tipo: 'Cavalo Mecânico' },
    { modelo: 'Axor', marca: 'Mercedes-Benz', tipo: 'Cavalo Mecânico' },
    { modelo: 'Atego', marca: 'Mercedes-Benz', tipo: 'Truck' },
    { modelo: 'Accelo', marca: 'Mercedes-Benz', tipo: 'VUC' },
    { modelo: 'Hi-Way', marca: 'Iveco', tipo: 'Bitrem Graneleiro' },
    { modelo: 'Daily', marca: 'Iveco', tipo: 'VUC' },
    { modelo: 'XF 480', marca: 'DAF', tipo: 'Cavalo Mecânico' },
    { modelo: 'Hilux', marca: 'Toyota', tipo: 'Picape' },
    { modelo: 'Corolla', marca: 'Toyota', tipo: 'Passeio' },
    { modelo: 'Strada', marca: 'Fiat', tipo: 'Picape' },
    { modelo: 'Toro', marca: 'Fiat', tipo: 'Picape' }
  ];

  for (const m of modelosConhecidos) {
    if (new RegExp('\\b' + m.modelo + '\\b', 'i').test(t)) {
      modelo = m.modelo;
      marca = m.marca;
      break;
    }
  }

  const cores = ['branco', 'branca', 'preto', 'preta', 'prata', 'cinza', 'vermelho', 'vermelha', 'azul', 'amarelo', 'verde'];
  for (const c of cores) {
    if (new RegExp('\\b' + c + '\\b', 'i').test(t)) {
      cor = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
      if (cor === 'Branca') cor = 'Branco';
      if (cor === 'Preta') cor = 'Preto';
      if (cor === 'Vermelha') cor = 'Vermelho';
      break;
    }
  }

  const matchAno = t.match(/\b(20[0-2][0-9])\b/);
  if (matchAno) ano = matchAno[1];

  const km = normalizarKm(t);
  const placa = normalizarPlaca(t);

  const reclamacoes = [];
  const termosQueixa = ['ar não tá gelando', 'ar nao ta gelando', 'barulho', 'vazamento', 'fumaça', 'falhando', 'queixa', 'reclamou', 'não gela', 'nao gela', 'vibrando', 'estralando'];
  const temTermoQueixa = termosQueixa.some(termo => t.includes(termo));
  const matchQueixa = t.match(/(?:falou que|reclamou que|disse que|relatou que|reclamação|queixa|sintoma)\s+(.+)$/i);

  if (matchQueixa) {
    let parteQueixa = matchQueixa[1].trim();
    const frases = parteQueixa.split(/(?:\s+e\s+o\s+|\s+e\s+a\s+|\s+e\s+|\.\s*)/i);
    frases.forEach(f => {
      const limp = f.trim();
      if (limp.length > 3) {
        reclamacoes.push(limp.charAt(0).toUpperCase() + limp.slice(1));
      }
    });
  } else if (temTermoQueixa) {
    reclamacoes.push('Verificar barulho/anomalia relatada na recepção.');
  }

  let boxEscolhido = null;
  const matchBox = t.match(/\b(?:colocar\s+(?:no\s+|para\s+o\s+)?box|direcionar\s+(?:para\s+o\s+|ao\s+)?box|no\s+box|box\s*:?)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                   t.match(/\bbox\s*(?:b)?([1-6])\b/i);
  if (matchBox) {
    const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
    const raw = matchBox[1].toLowerCase();
    boxEscolhido = mapaNum[raw] || ('b' + raw);
  }

  const veiculo = {
    marca: marca || 'Veículo',
    modelo: modelo || 'Geral',
    ano: ano || new Date().getFullYear().toString(),
    cor: cor || 'Não informada',
    km: km || 0,
    placa: placa || null,
    tipo: 'Passeio'
  };

  const cliente = { nome: clienteNome || 'Cliente Recepção', fone: '' };

  return {
    intencao: 'abrir_os',
    risco: 'baixo',
    cliente,
    veiculo,
    os: {
      box: boxEscolhido,
      km: km || 0,
      reclamacoes: reclamacoes.length > 0 ? reclamacoes : ['Revisão geral e inspeção preventiva de entrada.']
    },
    correcoes: [],
    itens_solicitados: { servicos: [], pecas: [] },
    resposta_falada: `Certo, registrei a entrada do ${veiculo.modelo} ${veiculo.cor} do cliente ${cliente.nome}.`
  };
}

function matchOperationalAlertsAndBottlenecks(t) {
  if (t.includes('ciente') || t === 'ok' || t.includes('já estou vendo') || t.includes('ja estou vendo') || t.includes('anotado') || t.includes('reconhecido')) {
    return {
      intencao: 'reconhecer_alerta',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Registrando ciência do alerta operacional.'
    };
  }

  if (t.includes('maior gargalo') || t.includes('qual o gargalo') || t.includes('onde está o gargalo') || t.includes('onde esta o gargalo')) {
    return {
      intencao: 'consultar_gargalo_operacao',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando os principais gargalos operacionais da oficina.'
    };
  }

  if (t.includes('entrega em risco') || t.includes('entregas em risco') || t.includes('entrega atrasada') || t.includes('entregas atrasadas') || t.includes('entregas de hoje')) {
    return {
      intencao: 'consultar_entregas_risco',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando status das entregas previstas para hoje.'
    };
  }

  if (t.includes('minha atenção') || t.includes('minha atencao') || t.includes('precisa de atenção') || t.includes('precisa de atencao') || t.includes('algum alerta') || t.includes('alertas da oficina') || t.includes('alertas operacionais')) {
    return {
      intencao: 'consultar_alertas_operacao',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Verificando alertas operacionais que exigem atenção.'
    };
  }

  if (t.includes('como está a oficina') || t.includes('como esta a oficina') || t.includes('como tá a oficina') || t.includes('como ta a oficina') || t.includes('como está o pátio') || t.includes('como esta o patio') || t.includes('como tá o pátio') || t.includes('como ta o patio') || t.includes('resumo da oficina') || t.includes('resumo do pátio') || t.includes('resumo do patio')) {
    return {
      intencao: 'consultar_resumo_operacional',
      risco: 'baixo',
      cliente: null,
      veiculo: null,
      os: null,
      correcoes: [],
      itens_solicitados: { servicos: [], pecas: [] },
      resposta_falada: 'Consultando o resumo operacional da oficina.'
    };
  }

  return null;
}

module.exports = {
  matchHighRiskOS,
  matchCorrection,
  matchInspection,
  matchAddComplaint,
  matchCheckinAndOpenOS,
  matchOperationalAlertsAndBottlenecks
};

