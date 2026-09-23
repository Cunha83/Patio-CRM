'use strict';

const crypto = require('crypto');
const { obterHistoricoVeiculo } = require('./vehicleHistoryService');
const { detectarRecorrencia } = require('./recurrenceDetector');
const { avaliarGarantia } = require('./warrantyService');
const { gerarResumoContexto } = require('./maintenanceContextService');

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function registrarAuditoria(state, entrada) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    ...entrada
  });
  if (state.auditoria.length > 500) {
    state.auditoria = state.auditoria.slice(0, 500);
  }
}

/**
 * Realiza a triagem inteligente de entrada de veículo e cria a Pré-OS
 */
function triagemEntrada({
  tenantId,
  vehicleId = null,
  placa = null,
  clienteId = null,
  motorista = '',
  kmAtual = 0,
  reclamacao = '',
  origem = 'web',
  actorId = 'operador',
  state,
  dataReferencia = null
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para triagem de Pré-OS.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }

  state.preOS = Array.isArray(state.preOS) ? state.preOS : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  state.clientes = Array.isArray(state.clientes) ? state.clientes : [];
  state.os = Array.isArray(state.os) ? state.os : [];

  // Localiza veículo existente se vehicleId ou placa forem informados
  let veiculo = null;
  if (vehicleId) {
    veiculo = state.veiculos.find(v => v.id === vehicleId);
  }
  if (!veiculo && placa) {
    const placaLimpa = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
    veiculo = state.veiculos.find(v => (v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placaLimpa);
  }

  const vId = veiculo ? veiculo.id : (vehicleId || null);
  const placaFinal = veiculo ? veiculo.placa : (placa || 'SEM-PLACA');
  const kmFinal = Number(kmAtual) || (veiculo ? (Number(veiculo.km) || 0) : 0);
  const cliFinal = clienteId || (veiculo ? veiculo.cli : null) || null;

  // 1. Consulta o histórico operacional do veículo
  const historicoVeiculo = vId
    ? obterHistoricoVeiculo({ tenantId, vehicleId: vId, state })
    : { vehicleId: null, placa: placaFinal, kmAtual: kmFinal, totalOS: 0, historico: [], ultimaOS: null };

  // 2. Detecta recorrência baseada na queixa
  const recorrencia = detectarRecorrencia({
    reclamacao,
    kmAtual: kmFinal,
    historicoVeiculo,
    dataReferencia
  });

  // 3. Avalia garantia para a ocorrência mais recente relacionada
  let garantiaAvaliada = null;
  if (recorrencia.ocorrenciasRelacionadas.length > 0) {
    garantiaAvaliada = avaliarGarantia({
      ocorrencia: recorrencia.ocorrenciasRelacionadas[0],
      tenantCfg: state.cfg || {}
    });
  }

  // 4. Gera resumo técnico compacto
  const resumoContexto = gerarResumoContexto({
    vehicleId: vId,
    placa: placaFinal,
    kmAtual: kmFinal,
    historicoVeiculo,
    ocorrenciasRelacionadas: recorrencia.ocorrenciasRelacionadas,
    garantiaAvaliada,
    reclamacaoOriginal: reclamacao
  });

  // 5. Monta os alertas estruturados
  const alertas = [];
  if (garantiaAvaliada && garantiaAvaliada.possivelGarantia) {
    alertas.push({
      nivel: 'alto',
      mensagem: garantiaAvaliada.motivo,
      tipo: 'garantia'
    });
  } else if (recorrencia.ocorrenciasRelacionadas.length > 0) {
    const rec = recorrencia.ocorrenciasRelacionadas[0];
    alertas.push({
      nivel: resumoContexto.nivelAtencao,
      mensagem: `Serviço semelhante realizado há ${rec.diasAtras} dias (OS #${rec.osNum}, ${rec.kmAnterior.toLocaleString('pt-BR')} km).`,
      tipo: 'recorrencia'
    });
  }

  // Status inicial: se houver atenção ou alto risco de garantia, aguarda confirmação
  const status = (resumoContexto.nivelAtencao === 'alto' || resumoContexto.nivelAtencao === 'atencao')
    ? 'aguardando_confirmacao'
    : 'rascunho';

  const preOS = {
    id: gerarId('pre'),
    tenantId,
    vehicleId: vId,
    placa: placaFinal,
    motorista: motorista || '',
    clienteId: cliFinal,
    kmAtual: kmFinal,
    reclamacaoOriginal: reclamacao || 'Revisão de entrada',
    reclamacaoNormalizada: recorrencia.reclamacaoNormalizada,
    sintomas: recorrencia.sintomas,
    origem: origem || 'web',
    historicoConsultado: true,
    ocorrenciasRelacionadas: recorrencia.ocorrenciasRelacionadas,
    alertas,
    possivelGarantia: Boolean(garantiaAvaliada?.possivelGarantia),
    status,
    createdAt: new Date().toISOString(),
    createdBy: actorId || 'operador'
  };

  state.preOS.unshift(preOS);

  registrarAuditoria(state, {
    acao: 'criar_pre_os',
    preOSId: preOS.id,
    placa: preOS.placa,
    reclamacao: preOS.reclamacaoOriginal,
    possivelGarantia: preOS.possivelGarantia,
    nivelAtencao: resumoContexto.nivelAtencao,
    usuario: actorId,
    canal: origem
  });

  return {
    ok: true,
    preOS,
    resumoContexto,
    respostaSugerida: resumoContexto.textoFormatado
  };
}

/**
 * Converte uma Pré-OS em Ordem de Serviço definitiva
 */
function converterEmOS({
  tenantId,
  preOSId,
  state,
  actorId = 'operador',
  boxId = null,
  mecanico = 'A Definir',
  dataReferencia = null
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para converter Pré-OS.');
  }
  state.preOS = Array.isArray(state.preOS) ? state.preOS : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  state.clientes = Array.isArray(state.clientes) ? state.clientes : [];

  const preOS = state.preOS.find(p => p.id === preOSId && p.tenantId === tenantId);
  if (!preOS) {
    return { ok: false, status: 404, error: 'Pré-OS não encontrada para este tenant.' };
  }

  if (preOS.status === 'convertida') {
    return { ok: false, status: 409, error: `Pré-OS já convertida na OS #${preOS.convertedToOS}.` };
  }

  if (preOS.status === 'cancelada') {
    return { ok: false, status: 400, error: 'Não é possível converter uma Pré-OS cancelada.' };
  }

  // Localiza ou cadastra veículo definitivo se necessário
  let veiculo = state.veiculos.find(v => v.id === preOS.vehicleId);
  if (!veiculo && preOS.placa) {
    const isSemPlaca = preOS.placa === 'SEM-PLACA';
    veiculo = {
      id: gerarId('v'),
      cli: preOS.clienteId || null,
      placa: preOS.placa,
      modelo: 'Caminhão',
      marca: 'Geral',
      ano: new Date().getFullYear().toString(),
      km: preOS.kmAtual || 0,
      cor: 'Não informada',
      tipo: 'Cavalo Mecânico',
      pendenciaCadastral: isSemPlaca,
      pendencias: isSemPlaca ? ['placa_pendente'] : []
    };
    state.veiculos.push(veiculo);
    preOS.vehicleId = veiculo.id;
  }

  // Gera numeração de OS
  const maxNum = state.os.reduce((max, o) => Math.max(max, Number(o.num) || 0), 1040);
  const novoNum = maxNum + 1;
  const dataHoje = dataReferencia || new Date().toISOString().slice(0, 10);

  const novaOS = {
    id: gerarId('os'),
    num: novoNum,
    box: boxId || 'patio',
    vei: preOS.vehicleId,
    cli: preOS.clienteId || (veiculo ? veiculo.cli : null),
    mec: mecanico || 'A Definir',
    st: boxId && boxId !== 'patio' ? 'executando' : 'aguardando',
    pendenciaCadastral: preOS.placa === 'SEM-PLACA',
    pendencias: preOS.placa === 'SEM-PLACA' ? ['placa_pendente'] : [],
    abertura: dataHoje,
    prev: dataHoje,
    km: preOS.kmAtual || 0,
    queixa: preOS.reclamacaoOriginal,
    preOSId: preOS.id,
    historicoRelacionado: preOS.ocorrenciasRelacionadas || [],
    possivelGarantia: preOS.possivelGarantia,
    alertasGerados: preOS.alertas || [],
    servicos: [],
    pecas: [],
    desc: 0,
    pago: false,
    formaPgto: '',
    obs: preOS.possivelGarantia
      ? 'Abertura confirmada pelo operador com indicação de possível garantia.'
      : 'Convertida com sucesso a partir da Pré-OS.'
  };

  state.os.unshift(novaOS);

  preOS.status = 'convertida';
  preOS.convertedToOS = novaOS.num;
  preOS.convertedOSId = novaOS.id;
  preOS.convertedAt = new Date().toISOString();
  preOS.convertedBy = actorId;

  registrarAuditoria(state, {
    acao: 'converter_pre_os_em_os',
    preOSId: preOS.id,
    osNum: novaOS.num,
    osId: novaOS.id,
    placa: preOS.placa,
    possivelGarantia: preOS.possivelGarantia,
    usuario: actorId
  });

  return {
    ok: true,
    os: novaOS,
    preOS
  };
}

/**
 * Cancela uma Pré-OS e registra justificativa auditada
 */
function cancelarPreOS({
  tenantId,
  preOSId,
  motivo = 'Cancelada pelo operador',
  state,
  actorId = 'operador'
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para cancelar Pré-OS.');
  }
  state.preOS = Array.isArray(state.preOS) ? state.preOS : [];

  const preOS = state.preOS.find(p => p.id === preOSId && p.tenantId === tenantId);
  if (!preOS) {
    return { ok: false, status: 404, error: 'Pré-OS não encontrada para este tenant.' };
  }

  if (preOS.status === 'convertida') {
    return { ok: false, status: 400, error: 'Não é possível cancelar uma Pré-OS já convertida em OS.' };
  }

  preOS.status = 'cancelada';
  preOS.motivoCancelamento = motivo;
  preOS.canceledAt = new Date().toISOString();
  preOS.canceledBy = actorId;

  registrarAuditoria(state, {
    acao: 'cancelar_pre_os',
    preOSId: preOS.id,
    placa: preOS.placa,
    motivo,
    usuario: actorId
  });

  return {
    ok: true,
    preOS
  };
}

function listarPreOS({ tenantId, state, status = null, placa = null }) {
  if (!tenantId) return [];
  const lista = Array.isArray(state?.preOS) ? state.preOS : [];
  return lista.filter(p => {
    if (p.tenantId !== tenantId) return false;
    if (status && p.status !== status) return false;
    if (placa) {
      const pL = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const itemPL = (p.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (itemPL !== pL) return false;
    }
    return true;
  });
}

function consultarPreOS({ tenantId, preOSId, state }) {
  if (!tenantId) return null;
  const lista = Array.isArray(state?.preOS) ? state.preOS : [];
  return lista.find(p => p.id === preOSId && p.tenantId === tenantId) || null;
}

module.exports = {
  triagemEntrada,
  converterEmOS,
  cancelarPreOS,
  listarPreOS,
  consultarPreOS
};
