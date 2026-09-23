'use strict';

/**
 * Serviço de Contexto Técnico de Manutenção
 * Consolida resumo compacto antes da abertura da OS e determina o nível de atenção.
 */

/**
 * Determina o nível de atenção (INFO, ATENÇÃO, ALTO)
 */
function calcularNivelAtencao({ possivelGarantia, ocorrenciasRelacionadas }) {
  if (possivelGarantia) {
    return 'alto';
  }

  if (!ocorrenciasRelacionadas || ocorrenciasRelacionadas.length === 0) {
    return 'info';
  }

  const maisRecente = ocorrenciasRelacionadas[0];
  const dias = Number(maisRecente.diasAtras) || 0;
  const km = Number(maisRecente.kmRodados) || 0;

  // Retorno muito precoce ou baixa quilometragem (< 90 dias ou < 10.000 km)
  if (dias <= 90 || (km > 0 && km <= 10000)) {
    return 'alto';
  }

  // Intervenção recente nos últimos 2 anos
  if (dias <= 365 * 2) {
    return 'atencao';
  }

  // Mais de 2 anos: informativo
  return 'info';
}

/**
 * Gera mensagem conversacional amigável para Voz / WhatsApp / Web
 */
function formatarMensagemConversacional({ veiculo, reclamacao, resumo, garantia }) {
  const placa = veiculo?.placa || 'do veículo';
  const ocorrencia = resumo.servicosRelacionados[0];

  if (!ocorrencia) {
    return `Veículo ${placa} identificado. Nenhuma ocorrência recente relacionada a "${reclamacao}". Pronto para abrir a Pré-OS.`;
  }

  const nomeServico = (ocorrencia.servicos && ocorrencia.servicos[0]) || 'manutenção anterior';
  const kmAnteriorStr = ocorrencia.km ? `${ocorrencia.km.toLocaleString('pt-BR')} km` : 'KM não informada';
  const kmAtualStr = resumo.kmAtual ? `${resumo.kmAtual.toLocaleString('pt-BR')} km` : null;

  const linhas = [
    `Localizei o veículo ${placa}.`,
    `Antes de abrir a OS, encontrei um serviço relacionado:`,
    `Foi realizado ${nomeServico} em ${ocorrencia.data || 'data anterior'} (OS #${ocorrencia.osNum}), com ${kmAnteriorStr}.`
  ];

  if (resumo.kmDesdeUltimoServicoRelacionado > 0) {
    linhas.push(`Ele rodou aproximadamente ${resumo.kmDesdeUltimoServicoRelacionado.toLocaleString('pt-BR')} km desde o serviço.`);
  }

  if (resumo.possivelGarantia) {
    linhas.push(`⚠️ *Atenção:* Existe possibilidade de retorno em garantia segundo a política cadastrada pela oficina.`);
    linhas.push(`Deseja abrir a Pré-OS como possível retorno em garantia?`);
  } else {
    if (resumo.nivelAtencao === 'alto' || resumo.nivelAtencao === 'atencao') {
      linhas.push(`Recomendo verificar desgaste prematuro ou histórico técnico antes de autorizar nova intervenção.`);
    }
    linhas.push(`Deseja confirmar a abertura da OS para "${reclamacao}"?`);
  }

  return linhas.join('\n\n');
}

/**
 * Constrói o contexto técnico compacto de manutenção
 */
function gerarResumoContexto({
  vehicleId,
  placa = null,
  kmAtual = 0,
  historicoVeiculo = {},
  ocorrenciasRelacionadas = [],
  garantiaAvaliada = null,
  reclamacaoOriginal = ''
}) {
  const possivelGarantia = Boolean(garantiaAvaliada?.possivelGarantia);
  const nivelAtencao = calcularNivelAtencao({ possivelGarantia, ocorrenciasRelacionadas });

  const maisRecente = ocorrenciasRelacionadas[0] || null;

  const resumo = {
    vehicleId: vehicleId || null,
    placa: placa || historicoVeiculo?.placa || null,
    kmAtual: Number(kmAtual) || 0,
    ultimaOS: historicoVeiculo?.ultimaOS ? {
      osNum: historicoVeiculo.ultimaOS.num,
      data: historicoVeiculo.ultimaOS.dataAbertura,
      km: historicoVeiculo.ultimaOS.km
    } : null,
    servicosRelacionados: ocorrenciasRelacionadas.map(o => ({
      osNum: o.osNum,
      servicos: o.servicos,
      data: o.data,
      km: o.kmAnterior,
      diasAtras: o.diasAtras,
      kmRodados: o.kmRodados,
      categoria: o.categoria
    })),
    kmDesdeUltimoServicoRelacionado: maisRecente ? maisRecente.kmRodados : null,
    diasDesdeUltimoServicoRelacionado: maisRecente ? maisRecente.diasAtras : null,
    possivelGarantia,
    motivoGarantia: garantiaAvaliada?.motivo || null,
    nivelAtencao
  };

  resumo.textoFormatado = formatarMensagemConversacional({
    veiculo: { placa: resumo.placa },
    reclamacao: reclamacaoOriginal,
    resumo,
    garantia: garantiaAvaliada
  });

  return resumo;
}

module.exports = {
  calcularNivelAtencao,
  gerarResumoContexto,
  formatarMensagemConversacional
};
