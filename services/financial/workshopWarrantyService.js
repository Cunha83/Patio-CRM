/**
 * services/financial/workshopWarrantyService.js
 * Rastreamento de histórico e garantia por placa (90 dias) & retorno de garantia.
 * Modularizado sob teto de 350 linhas conforme regras de engenharia.
 */

const financialEngine = require('../financialEngine');

/**
 * 9.1.1 obterHistoricoGarantiaPlaca
 * Analisa o histórico de OSs e peças trocadas para a placa informada,
 * calculando a janela de garantia de 90 dias e identificando retorno elegível.
 */
function obterHistoricoGarantiaPlaca(state = {}, placaRaw, opcoes = {}) {
  const placa = String(placaRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  if (!placa) {
    const err = new Error('Placa não informada.');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'PLACA_OBRIGATORIA';
    throw err;
  }

  const diasGarantia = Number(opcoes.diasGarantia || 90);
  const agoraSP = financialEngine.obterAgoraSP();
  const dHoje = opcoes.dataBase || agoraSP.dataISO;

  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const veicIdsPlaca = new Set(
    veiculos
      .filter(v => v && String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placa)
      .map(v => v.id)
  );

  const osList = Array.isArray(state.os) ? state.os : [];
  const osDaPlaca = osList.filter(o => {
    if (!o) return false;
    const pOS = String(o.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pOS === placa) return true;
    if (o.vei && veicIdsPlaca.has(o.vei)) return true;
    if (o.veiculo && String(o.veiculo.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placa) return true;
    return false;
  });

  let totalFaturadoHistorico = 0;
  for (const o of osDaPlaca) {
    totalFaturadoHistorico += Number(o.total || o.valorTotal || o.totalGeral || 0);
  }
  totalFaturadoHistorico = +totalFaturadoHistorico.toFixed(2);

  // Identifica OSs concluídas e em garantia
  const osRecentesGarantia = [];
  let ultimoMecanico = null;
  const pecasAplicadasHistorico = [];

  // Ordena por data decrescente
  const osOrdenadas = [...osDaPlaca].sort((a, b) => {
    const dataA = a.concluidoExecucaoEm || a.dataFechamento || a.data || a.criadoEm || '';
    const dataB = b.concluidoExecucaoEm || b.dataFechamento || b.data || b.criadoEm || '';
    return String(dataB).localeCompare(String(dataA));
  });

  for (const o of osOrdenadas) {
    if (o.mecanico && !ultimoMecanico) {
      ultimoMecanico = o.mecanico;
    }
    const pecas = Array.isArray(o.pecasUtilizadas) ? o.pecasUtilizadas : (Array.isArray(o.pecas) ? o.pecas : []);
    for (const p of pecas) {
      pecasAplicadasHistorico.push({
        osId: o.id,
        osNum: o.num || o.id,
        nome: p.nome || p.descricao || 'Peça',
        quantidade: p.quantidade || p.qtd || 1,
        subtotal: p.subtotal || ((p.quantidade || 1) * (p.valorUnitario || p.precoVenda || 0)),
        data: o.concluidoExecucaoEm || o.data || null
      });
    }

    const dataOS = o.concluidoExecucaoEm || o.dataFechamento || o.data || o.criadoEm;
    const isConcluida = ['finalizada', 'concluida', 'entregue'].includes(o.st) ||
      ['pronto_retirada', 'entregue', 'finalizada'].includes(o.etapaPatio) ||
      Boolean(o.concluidoExecucaoEm);

    if (dataOS && isConcluida) {
      const diffDias = Math.max(0, financialEngine.diasEntre(dataOS.slice(0, 10), dHoje));
      if (diffDias <= diasGarantia) {
        osRecentesGarantia.push({
          osId: o.id,
          num: o.num || o.id,
          data: dataOS.slice(0, 10),
          diasAtras: diffDias,
          total: Number(o.total || 0),
          mecanico: o.mecanico || 'Oficina',
          etapaPatio: o.etapaPatio || o.st,
          emGarantia: true
        });
      }
    }
  }

  const emGarantiaAtiva = osRecentesGarantia.length > 0;

  let dossieTextoWhatsapp = `🛡️ *DOSSIÊ HISTÓRICO & GARANTIA POR PLACA* 🚚\n\n` +
    `• *Placa:* ${placa}\n` +
    `• *Status de Garantia:* ${emGarantiaAtiva ? '🛡️ *GARANTIA ATIVA (90 DIAS)*' : '⚪ Fora da Garantia'}\n` +
    `• *Total de OSs no Histórico:* ${osDaPlaca.length}\n` +
    `• *Último Mecânico:* ${ultimoMecanico || 'Não registrado'}\n` +
    `• *Total Faturado no Histórico:* ${financialEngine.formatarMoeda(totalFaturadoHistorico)}\n\n`;

  if (osRecentesGarantia.length > 0) {
    dossieTextoWhatsapp += `📋 *OSs Recentes Cobertas por Garantia:*\n`;
    osRecentesGarantia.forEach(osG => {
      dossieTextoWhatsapp += `• *OS #${osG.num}* (${financialEngine.formatarDataBR(osG.data)} - há ${osG.diasAtras} dias) - Mecânico: ${osG.mecanico}\n`;
    });
    dossieTextoWhatsapp += `\n`;
  }

  if (pecasAplicadasHistorico.length > 0) {
    dossieTextoWhatsapp += `🔩 *Últimas Peças Trocadas:* \n`;
    pecasAplicadasHistorico.slice(0, 5).forEach(peca => {
      dossieTextoWhatsapp += `• ${peca.quantidade}x ${peca.nome} (OS #${peca.osNum})\n`;
    });
    dossieTextoWhatsapp += `\n`;
  }

  if (emGarantiaAtiva) {
    dossieTextoWhatsapp += `💡 *Aviso Operacional:* Caso este veículo apresente retorno do mesmo serviço, vincule a OS de retorno com isenção de cobrança.`;
  } else {
    dossieTextoWhatsapp += `ℹ️ Nenhum serviço recente elegível para garantia nos últimos ${diasGarantia} dias.`;
  }

  return {
    sucesso: true,
    ok: true,
    placa,
    diasGarantia,
    emGarantiaAtiva,
    totalOS: osDaPlaca.length,
    osRecentesGarantia,
    pecasAplicadasHistorico,
    ultimoMecanico,
    totalFaturadoHistorico,
    dossieTextoWhatsapp
  };
}

/**
 * 9.1.2 registrarRetornoGarantiaOS
 * Vincula uma OS como retorno de garantia de uma OS anterior, aplicando isenção
 * e definindo statusLiberacaoPatio = 'liberado_garantia'.
 */
function registrarRetornoGarantiaOS(state = {}, payload = {}) {
  const osIdRaw = payload.osId;
  if (!osIdRaw) {
    const err = new Error('Identificador da OS (osId) é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'OS_ID_OBRIGATORIO';
    throw err;
  }

  const osNorm = String(osIdRaw).replace(/^#/, '').trim();
  if (!Array.isArray(state.os)) state.os = [];
  const osAlvo = state.os.find(o => String(o.id) === osNorm || String(o.num) === osNorm);
  if (!osAlvo) {
    const err = new Error(`Ordem de serviço #${osNorm} não encontrada.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'OS_NAO_ENCONTRADA';
    throw err;
  }

  const osOrigemId = payload.osOrigemId ? String(payload.osOrigemId).replace(/^#/, '').trim() : null;
  const motivoGarantia = payload.motivoGarantia ? String(payload.motivoGarantia).trim() : 'Retorno para reparo coberto por garantia';
  const isentarCobranca = payload.isentarCobranca !== false;
  const operador = payload.operador || 'operador';
  const operadorNome = (typeof operador === 'object' ? operador.nome || operador.actorId : operador) || 'Operador Técnico';
  const agoraISO = payload.agora || new Date().toISOString();

  osAlvo.isRetornoGarantia = true;
  osAlvo.osOrigemGarantiaId = osOrigemId;
  osAlvo.motivoGarantia = motivoGarantia;
  osAlvo.isentoGarantia = isentarCobranca;
  osAlvo.registradoGarantiaEm = agoraISO;
  osAlvo.garantiaRegistradaPor = operadorNome;

  if (isentarCobranca) {
    osAlvo.statusLiberacaoPatio = 'liberado_garantia';
  }

  if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
  osAlvo.historicoPatio.push({
    tipo: 'retorno_garantia',
    osOrigemId,
    motivo: motivoGarantia,
    isento: isentarCobranca,
    operador: operadorNome,
    data: agoraISO
  });

  return {
    sucesso: true,
    ok: true,
    osId: osAlvo.id,
    num: osAlvo.num || osAlvo.id,
    placa: osAlvo.placa || 'SEM-PLACA',
    isRetornoGarantia: true,
    osOrigemGarantiaId: osOrigemId,
    motivoGarantia,
    isentoGarantia: isentarCobranca,
    statusLiberacaoPatio: 'liberado_garantia',
    mensagem: `Retorno em garantia registrado para a OS #${osAlvo.num || osAlvo.id} (Origem: OS #${osOrigemId || 'N/A'}).`
  };
}

module.exports = {
  obterHistoricoGarantiaPlaca,
  registrarRetornoGarantiaOS
};
