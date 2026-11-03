'use strict';

const BOXES_PADRAO_PATIO = [
  { id: 'BOX-01', nome: 'Box 01' },
  { id: 'BOX-02', nome: 'Box 02' },
  { id: 'BOX-03', nome: 'Box 03' },
  { id: 'BOX-04', nome: 'Box 04' }
];

function buscarBoxPorIdOuNome(boxes = [], boxIdOrNome = '') {
  if (!boxIdOrNome) return null;
  const termo = String(boxIdOrNome).trim().toLowerCase();
  let b = boxes.find(bx => String(bx.id).trim().toLowerCase() === termo);
  if (b) return b;
  b = boxes.find(bx => String(bx.nome || '').trim().toLowerCase() === termo);
  if (b) return b;
  const num = parseInt(termo.replace(/\D/g, ''), 10);
  if (!isNaN(num)) {
    const pad2 = `box-${String(num).padStart(2, '0')}`;
    const pad1 = `box-${num}`;
    const bId = `b${num}`;
    b = boxes.find(bx => {
      const bLow = String(bx.id).toLowerCase();
      const nLow = String(bx.nome || '').toLowerCase();
      return bLow === pad2 || bLow === pad1 || bLow === bId || bLow === `box 0${num}` || bLow === `box ${num}` ||
             nLow.includes(`box 0${num}`) || nLow.includes(`box ${num}`);
    });
    if (b) return b;
  }
  b = boxes.find(bx => String(bx.nome || '').toLowerCase().includes(termo));
  return b || null;
}

function listarOcupacaoBoxes(state = {}, opcoes = {}) {
  if (!Array.isArray(state.boxes) || state.boxes.length === 0) {
    state.boxes = JSON.parse(JSON.stringify(BOXES_PADRAO_PATIO));
  }

  const agora = opcoes?.agora ? new Date(opcoes.agora) : new Date();
  const osLista = Array.isArray(state.os) ? state.os : [];
  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  const boxesMapeados = state.boxes.map(b => {
    const boxId = String(b.id || '').trim();
    const osDoBox = osLista.find(o => {
      const matchBox = (String(o.boxId || '').trim() === boxId) || (String(o.box || '').trim() === boxId);
      if (!matchBox) return false;
      const statusFinalizado = o.st === 'finalizada' || o.st === 'entregue' || o.etapaPatio === 'pronto_retirada';
      return !statusFinalizado;
    });

    if (osDoBox) {
      const veiObj = veiculos.find(v => v.id === osDoBox.vei) || {};
      const placa = osDoBox.placa || veiObj.placa || null;
      const veiculoDesc = [veiObj.marca, veiObj.modelo].filter(Boolean).join(' ').trim() || osDoBox.veiculo || null;
      const alocadoEm = osDoBox.alocadoBoxEm || osDoBox.alocadoEm || b.alocadoEm || null;
      let tempoOcupacaoMinutos = 0;
      if (alocadoEm) {
        const diffMs = Math.max(0, agora.getTime() - new Date(alocadoEm).getTime());
        tempoOcupacaoMinutos = Math.floor(diffMs / 60000);
      }
      const isBloqueado = osDoBox.etapaPatio === 'pausado_gargalo' || osDoBox.st === 'peca' || b.status === 'bloqueado_peca';
      const status = isBloqueado ? 'bloqueado_peca' : 'ocupado';
      const mecanico = osDoBox.mecanico || b.mecanico || null;

      return {
        id: b.id,
        nome: b.nome || `Box ${b.id}`,
        status,
        osId: osDoBox.id,
        placa,
        veiculo: veiculoDesc,
        mecanico,
        alocadoEm,
        tempoOcupacaoMinutos
      };
    }

    return {
      id: b.id,
      nome: b.nome || `Box ${b.id}`,
      status: 'livre',
      osId: null,
      placa: null,
      veiculo: null,
      mecanico: null,
      alocadoEm: null,
      tempoOcupacaoMinutos: 0
    };
  });

  const resumoBoxes = {
    total: boxesMapeados.length,
    livres: boxesMapeados.filter(b => b.status === 'livre').length,
    ocupados: boxesMapeados.filter(b => b.status === 'ocupado').length,
    bloqueados: boxesMapeados.filter(b => b.status === 'bloqueado_peca').length
  };

  const resultado = [...boxesMapeados];
  resultado.boxes = boxesMapeados;
  resultado.resumoBoxes = resumoBoxes;
  resultado.total = resumoBoxes.total;
  resultado.livres = resumoBoxes.livres;
  resultado.ocupados = resumoBoxes.ocupados;
  resultado.bloqueados = resumoBoxes.bloqueados;
  resultado.sucesso = true;

  return resultado;
}

function alocarBoxOS(state = {}, payload = {}) {
  const osIdRaw = payload.osId;
  const boxIdRaw = payload.boxId;
  const mecanico = payload.mecanico ? String(payload.mecanico).trim() : null;
  const operador = payload.operador || 'operador';
  const operadorNome = (typeof operador === 'object' ? operador.nome || operador.actorId : operador) || 'operador';
  const agoraISO = payload.agora || new Date().toISOString();

  if (!osIdRaw) {
    const err = new Error('Identificador da OS (osId) é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'OS_ID_OBRIGATORIO';
    throw err;
  }
  if (!boxIdRaw) {
    const err = new Error('Identificador do box (boxId) é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'BOX_ID_OBRIGATORIO';
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

  if (!Array.isArray(state.boxes) || state.boxes.length === 0) {
    state.boxes = JSON.parse(JSON.stringify(BOXES_PADRAO_PATIO));
  }

  let boxAlvo = buscarBoxPorIdOuNome(state.boxes, boxIdRaw);
  if (!boxAlvo) {
    const novoBox = { id: String(boxIdRaw).trim(), nome: `Box ${boxIdRaw}` };
    state.boxes.push(novoBox);
    boxAlvo = novoBox;
  }

  const boxIdNorm = String(boxAlvo.id).trim();

  const outraOS = state.os.find(o => {
    if (String(o.id) === String(osAlvo.id)) return false;
    const matchBox = (String(o.boxId || '').trim() === boxIdNorm) || (String(o.box || '').trim() === boxIdNorm);
    if (!matchBox) return false;
    const statusFinalizado = o.st === 'finalizada' || o.st === 'entregue' || o.etapaPatio === 'pronto_retirada';
    return !statusFinalizado;
  });

  if (outraOS) {
    const err = new Error(`Box "${boxAlvo.nome || boxAlvo.id}" já está ocupado pela OS #${outraOS.num || outraOS.id}.`);
    err.status = 409;
    err.statusCode = 409;
    err.code = 'BOX_JA_OCUPADO';
    throw err;
  }

  const boxAnteriorId = osAlvo.boxId || osAlvo.box;
  if (boxAnteriorId && String(boxAnteriorId).trim() !== boxIdNorm) {
    const boxAntigoObj = state.boxes.find(b => String(b.id).trim() === String(boxAnteriorId).trim());
    if (boxAntigoObj) {
      boxAntigoObj.status = 'livre';
      boxAntigoObj.osId = null;
      boxAntigoObj.mecanico = null;
      boxAntigoObj.alocadoEm = null;
    }
    if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
    osAlvo.historicoPatio.push({
      tipo: 'transferencia_box',
      deBox: boxAnteriorId,
      paraBox: boxAlvo.id,
      operador: operadorNome,
      data: agoraISO
    });
  }

  osAlvo.boxId = boxAlvo.id;
  osAlvo.box = boxAlvo.id;
  if (mecanico) osAlvo.mecanico = mecanico;
  osAlvo.alocadoBoxEm = agoraISO;
  osAlvo.alocadoEm = agoraISO;
  if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
  osAlvo.historicoPatio.push({
    tipo: 'alocacao_box',
    boxId: boxAlvo.id,
    mecanico: osAlvo.mecanico || null,
    operador: operadorNome,
    data: agoraISO
  });

  boxAlvo.osId = osAlvo.id;
  boxAlvo.status = (osAlvo.etapaPatio === 'pausado_gargalo' || osAlvo.st === 'peca') ? 'bloqueado_peca' : 'ocupado';
  boxAlvo.mecanico = osAlvo.mecanico || null;
  boxAlvo.alocadoEm = agoraISO;

  const ocupacao = listarOcupacaoBoxes(state, { agora: agoraISO });
  return {
    ok: true,
    sucesso: true,
    os: osAlvo,
    box: boxAlvo,
    resumoBoxes: ocupacao.resumoBoxes
  };
}

function liberarBoxOS(state = {}, payload = {}) {
  const osIdRaw = payload.osId;
  const operador = payload.operador || 'operador';
  const operadorNome = (typeof operador === 'object' ? operador.nome || operador.actorId : operador) || 'operador';
  const motivo = payload.motivo || 'liberacao_manual';
  const agoraISO = payload.agora || new Date().toISOString();

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

  const boxIdAlvo = payload.boxId || osAlvo.boxId || osAlvo.box;
  let tempoPermanenciaMinutos = 0;
  const alocadoEm = osAlvo.alocadoBoxEm || osAlvo.alocadoEm;
  if (alocadoEm) {
    const diffMs = Math.max(0, new Date(agoraISO).getTime() - new Date(alocadoEm).getTime());
    tempoPermanenciaMinutos = Math.floor(diffMs / 60000);
  }

  if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
  osAlvo.historicoPatio.push({
    tipo: 'liberacao_box',
    boxId: boxIdAlvo || null,
    motivo,
    tempoPermanenciaMinutos,
    operador: operadorNome,
    data: agoraISO
  });

  osAlvo.boxId = null;
  osAlvo.box = null;
  osAlvo.alocadoBoxEm = null;
  osAlvo.alocadoEm = null;

  if (boxIdAlvo && Array.isArray(state.boxes)) {
    const boxObj = state.boxes.find(b => String(b.id).trim() === String(boxIdAlvo).trim());
    if (boxObj) {
      boxObj.status = 'livre';
      boxObj.osId = null;
      boxObj.mecanico = null;
      boxObj.alocadoEm = null;
    }
  }

  const ocupacao = listarOcupacaoBoxes(state, { agora: agoraISO });
  return {
    ok: true,
    sucesso: true,
    os: osAlvo,
    boxId: boxIdAlvo || null,
    tempoPermanenciaMinutos,
    resumoBoxes: ocupacao.resumoBoxes
  };
}

module.exports = {
  BOXES_PADRAO_PATIO,
  buscarBoxPorIdOuNome,
  listarOcupacaoBoxes,
  alocarBoxOS,
  liberarBoxOS
};
