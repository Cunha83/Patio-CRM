'use strict';

/**
 * Serviço de Memória Operacional do Veículo
 * Consulta exclusivamente dados delimitados por tenantId e vehicleId no repositório persistente.
 */

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const str = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.slice(0, 10).split('/');
    return `${y}-${m}-${d}`;
  }
  return str.slice(0, 10);
}

/**
 * Consulta o histórico operacional de um veículo dentro do tenant contextualizado.
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string} params.vehicleId
 * @param {Object} params.state
 * @returns {Object} Histórico estruturado
 */
function obterHistoricoVeiculo({ tenantId, vehicleId, state }) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para consultar o histórico do veículo.');
  }
  if (!vehicleId || typeof vehicleId !== 'string') {
    return {
      vehicleId: null,
      placa: null,
      kmAtual: 0,
      totalOS: 0,
      historico: [],
      ultimaOS: null
    };
  }

  const veiculos = Array.isArray(state?.veiculos) ? state.veiculos : [];
  const veiculo = veiculos.find(v => v.id === vehicleId);

  const ordens = Array.isArray(state?.os) ? state.os : [];
  const historicoOS = ordens
    .filter(o => o.vei === vehicleId)
    .map(o => {
      const servicos = (o.servicos || []).map(s => ({
        id: s.id || null,
        nome: s.nome || '',
        qtd: Number(s.qtd) || 1,
        valor: Number(s.valor) || 0,
        categoria: s.categoria || null
      }));

      const pecas = (o.pecas || []).map(p => ({
        id: p.id || null,
        nome: p.nome || '',
        qtd: Number(p.qtd) || 1,
        valor: Number(p.valor) || 0,
        codigo: p.cod || null
      }));

      const dataAbertura = normalizarData(o.abertura || o.criadoEm);
      const dataFechamento = normalizarData(o.fechamento || o.concluidaEm || o.abertura);

      return {
        osId: o.id,
        num: o.num,
        status: o.st || 'aguardando',
        dataAbertura,
        dataFechamento,
        km: Number(o.km) || 0,
        queixa: o.queixa || '',
        servicos,
        pecas,
        mecanico: o.mec || 'A Definir',
        observacoes: o.obs || '',
        preOSId: o.preOSId || null,
        possivelGarantia: Boolean(o.possivelGarantia),
        fotosTotal: Array.isArray(o.fotos) ? o.fotos.length : 0
      };
    })
    .sort((a, b) => {
      // Ordenação decrescente cronológica (mais recente primeiro)
      const dataA = a.dataAbertura || '1970-01-01';
      const dataB = b.dataAbertura || '1970-01-01';
      if (dataA !== dataB) return dataB.localeCompare(dataA);
      return (Number(b.num) || 0) - (Number(a.num) || 0);
    });

  return {
    vehicleId,
    placa: veiculo ? veiculo.placa : null,
    modelo: veiculo ? veiculo.modelo : null,
    marca: veiculo ? veiculo.marca : null,
    ano: veiculo ? veiculo.ano : null,
    kmAtual: veiculo ? (Number(veiculo.km) || 0) : 0,
    totalOS: historicoOS.length,
    historico: historicoOS,
    ultimaOS: historicoOS[0] || null
  };
}

module.exports = {
  obterHistoricoVeiculo,
  normalizarData
};
