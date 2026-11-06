'use strict';

const { gerarId } = require('../../lib/serverContext');
const { consultarDadosVeiculoOnline } = require('../vehicleLookupService');

async function resolverVeiculoECliente({ placa, clienteNome, clienteFone, textoOriginal, targetState }) {
  const isSemPlaca = !placa ||
    placa === 'SEM-PLACA' ||
    placa.toUpperCase() === 'SEMPLACA' ||
    /sem\s+placa/i.test(placa) ||
    (!placa && textoOriginal && /sem\s+placa/i.test(textoOriginal));

  let placaLimpa = isSemPlaca ? 'SEM-PLACA' : (placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let veiculo = null;
  let statusCadastro = '';

  if (isSemPlaca) {
    let cliente = targetState.clientes.find(c =>
      (c.fone && clienteFone && c.fone.includes(clienteFone.slice(-8))) ||
      (c.nome && clienteNome && c.nome.toLowerCase() === clienteNome.toLowerCase())
    );
    if (!cliente) {
      cliente = {
        id: gerarId('c'),
        nome: clienteNome || 'Cliente Recepção',
        fone: clienteFone || '',
        doc: '',
        tipo: 'frotista'
      };
      targetState.clientes.push(cliente);
    }

    veiculo = {
      id: gerarId('v'),
      cli: cliente.id,
      placa: 'SEM-PLACA',
      marca: 'Pendente',
      modelo: 'Veículo Não Identificado',
      ano: '',
      cor: 'Não informada',
      tipo: 'Cavalo Mecânico',
      km: 0,
      pendenciaCadastral: true,
      pendencias: ['placa_pendente'],
      criadoEm: Date.now()
    };
    targetState.veiculos.push(veiculo);
    statusCadastro = `⚠️ *Pendência Cadastral:* Veículo sem placa identificada. Anexe a foto da placa/veículo para conciliação automática.`;
  } else {
    veiculo = targetState.veiculos.find(v =>
      v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaLimpa
    );

    if (!veiculo) {
      console.log(`[Pátio CRM] Placa ${placaLimpa} não cadastrada internamente. Iniciando consulta online...`);
      const dadosOnline = await consultarDadosVeiculoOnline(placaLimpa, targetState?.cfg);

      let cliente = targetState.clientes.find(c =>
        (c.fone && clienteFone && c.fone.includes(clienteFone.slice(-8))) ||
        (c.nome && clienteNome && c.nome.toLowerCase() === clienteNome.toLowerCase())
      );
      if (!cliente) {
        cliente = {
          id: gerarId('c'),
          nome: clienteNome || `Cliente WhatsApp (${placaLimpa})`,
          fone: clienteFone || '',
          doc: '',
          tipo: 'frotista'
        };
        targetState.clientes.push(cliente);
      }

      veiculo = {
        id: gerarId('v'),
        cli: cliente.id,
        placa: placaLimpa,
        marca: dadosOnline.marca || 'Caminhão',
        modelo: dadosOnline.modelo || 'Cavalo Mecânico',
        ano: String(dadosOnline.ano || new Date().getFullYear()),
        cor: dadosOnline.cor || 'Branco',
        tipo: dadosOnline.tipo || 'Cavalo Mecânico',
        km: dadosOnline.km || 0,
        pendenciaCadastral: false,
        pendencias: [],
        criadoEm: Date.now()
      };
      targetState.veiculos.push(veiculo);
      statusCadastro = `🆕 *Veículo Cadastrado:* ${veiculo.marca} ${veiculo.modelo} (${dadosOnline.origem})`;
      console.log(`[Pátio CRM] Veículo ${placaLimpa} cadastrado com sucesso via ${dadosOnline.origem}.`);
    } else {
      statusCadastro = `🔎 *Cadastro Interno:* Veículo já localizado na base de dados (${veiculo.marca || ''} ${veiculo.modelo || ''})`;
      console.log(`[Pátio CRM] Placa ${placaLimpa} já existente no cadastro interno.`);
    }
  }

  const clienteAssociado = targetState.clientes.find(c => c.id === veiculo.cli) || { nome: clienteNome || 'Cliente' };

  return { isSemPlaca, placaLimpa, veiculo, statusCadastro, clienteAssociado };
}

function resolverAlocacaoBox({ textoOriginal, targetState }) {
  const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  const boxes = (targetState.boxes || []).filter(b => boxesValidos.has(b.id));

  targetState.os.forEach(o => {
    if (o.box && !boxesValidos.has(o.box)) {
      o.box = null;
      if (o.st !== 'finalizada') o.st = 'fila';
    }
  });

  const osOcupandoBoxes = targetState.os.filter(o => o.st !== 'finalizada' && o.box && boxesValidos.has(o.box));
  const boxesOcupadosIds = new Set(osOcupandoBoxes.map(o => o.box));

  let boxDesejado = null;
  if (textoOriginal) {
    const txt = textoOriginal.toLowerCase();
    if (txt.includes('fila') || txt.includes('pátio') || txt.includes('patio') || txt.includes('espera')) {
      boxDesejado = 'fila';
    } else {
      const matchBox = txt.match(/\b(?:direcionar\s+(?:para\s+o\s+|ao\s+)?box|no\s+box|box\s*:?)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                       txt.match(/\bbox\s*(?:b)?([1-6])\b/i);
      if (matchBox) {
        const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
        const raw = matchBox[1].toLowerCase();
        boxDesejado = mapaNum[raw] || ('b' + raw);
      }
    }
  }

  const boxLivre = boxes.find(b => !boxesOcupadosIds.has(b.id));

  let boxIdAlocado = null;
  let statusOS = 'fila';
  let textoAlocacao = '';

  if (boxDesejado === 'fila') {
    boxIdAlocado = null;
    statusOS = 'fila';
    textoAlocacao = `🟡 *Fila de Espera:* Veículo posicionado na *Fila de Espera* do pátio conforme solicitado.`;
  } else if (boxDesejado && boxesValidos.has(boxDesejado)) {
    const boxAlvo = boxes.find(b => b.id === boxDesejado);
    const osNoBox = osOcupandoBoxes.find(o => o.box === boxDesejado);

    if (!osNoBox) {
      boxIdAlocado = boxDesejado;
      statusOS = 'executando';
      textoAlocacao = `🟢 *Box Alocado:* ${boxAlvo ? boxAlvo.nome : boxDesejado} (Conforme Solicitado)\nO box estava livre e o caminhão foi posicionado para atendimento imediato!`;
    } else {
      const veicOcup = (targetState.veiculos || []).find(v => v.id === osNoBox.vei);
      const placaOcup = veicOcup ? veicOcup.placa : 'N/I';
      if (boxLivre) {
        boxIdAlocado = boxLivre.id;
        statusOS = 'executando';
        textoAlocacao = `⚠️ *Box ${boxAlvo ? boxAlvo.nome : boxDesejado} Ocupado:* Já ocupado pela OS #${osNoBox.num} (${placaOcup}).\n🟢 *Redirecionado para:* ${boxLivre.nome} que estava disponível!`;
      } else {
        boxIdAlocado = null;
        statusOS = 'fila';
        textoAlocacao = `⚠️ *Box ${boxAlvo ? boxAlvo.nome : boxDesejado} Ocupado:* Já ocupado pela OS #${osNoBox.num} (${placaOcup}) e os demais boxes estão cheios.\n🟡 *Fila de Espera:* Veículo aguardando liberação no pátio.`;
      }
    }
  } else if (boxLivre) {
    boxIdAlocado = boxLivre.id;
    statusOS = 'executando';
    textoAlocacao = `🟢 *Box Alocado:* ${boxLivre.nome}\nO box está livre e o caminhão foi posicionado para atendimento imediato!`;
  } else {
    boxIdAlocado = null;
    statusOS = 'fila';
    const totalBoxes = boxes.length || 6;
    textoAlocacao = `🟡 *Fila de Espera:* Todos os ${totalBoxes} boxes do pátio estão ocupados no momento.\nO veículo foi colocado na *Fila de Espera* e será chamado assim que o próximo box for liberado!`;
  }

  return { boxLivre, boxIdAlocado, statusOS, textoAlocacao };
}

module.exports = {
  resolverVeiculoECliente,
  resolverAlocacaoBox
};
