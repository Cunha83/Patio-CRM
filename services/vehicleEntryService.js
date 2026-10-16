const {
  getOrLoadState,
  salvarEstado,
  enqueueWrite,
  gerarId,
  extractTenantId,
  ultimasPlacas
} = require('../lib/serverContext');
const { consultarDadosVeiculoOnline } = require('./vehicleLookupService');
const preOSEngine = require('./preOSEngine');
const { gerarTokenAcao } = require('../lib/tokens/securityToken');

/**
 * 2. Fluxo Completo de Entrada, Alocação de Box e Abertura de OS
 */
async function processarEntradaVeiculo({ placa, clienteNome, clienteFone, textoOriginal, servicos = [], req = null }) {
  const targetState = await getOrLoadState(req);
  if (!targetState.os) targetState.os = [];
  if (!targetState.veiculos) targetState.veiculos = [];
  if (!targetState.clientes) targetState.clientes = [];
  if (!targetState.boxes) targetState.boxes = [];

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

  const maxNum = targetState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
  const novoNum = String(maxNum + 1);

  const servicosIniciais = [
    { id: 'srv_diag', nome: 'Diagnóstico e Check-in de Pátio', qtd: 1, valor: 150, autorizado: true, status: 'aprovado' }
  ];
  let totalInicial = 150;

  if (Array.isArray(servicos) && servicos.length > 0) {
    servicos.forEach(s => {
      servicosIniciais.push({
        id: s.id || gerarId('srv'),
        nome: s.nome || s.desc || 'Serviço Solicitado',
        qtd: s.qtd || 1,
        valor: s.valor || s.preco || 0,
        preco: s.preco || s.valor || 0,
        autorizado: s.autorizado !== false,
        status: s.status || (s.autorizado !== false ? 'aprovado' : 'pendente')
      });
      totalInicial += (s.qtd || 1) * (s.valor || s.preco || 0);
    });
  }

  if (textoOriginal && (textoOriginal.toLowerCase().includes('serv') || textoOriginal.toLowerCase().includes('roda') || textoOriginal.toLowerCase().includes('peça') || textoOriginal.toLowerCase().includes('inclua') || textoOriginal.toLowerCase().includes('unit'))) {
    const textoLimpoDePlaca = textoOriginal
      .replace(new RegExp(placaLimpa, 'gi'), '')
      .replace(/\b[A-Z]{3}[- ]?[0-9][0-9A-Z][0-9]{2}\b/gi, '')
      .replace(/\b[A-Z]{3}[- ]?[0-9]{4}\b/gi, '');

    const qtdMatch = textoLimpoDePlaca.match(/\b(\d+)\s*(?:x|serv|pecas?|un)?\b/i);
    const qtd = qtdMatch ? parseInt(qtdMatch[1], 10) : 1;

    const valorMatch = textoLimpoDePlaca.match(/(?:r\$\s*|a\s+)?(\d+(?:[.,]\d{2})?)\s*(?:reais|cada|unit)?/i);
    let valorUnit = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
    if (valorUnit === qtd && valorMatch) {
      const todosNumeros = [...textoLimpoDePlaca.matchAll(/\b\d+(?:[.,]\d{2})?\b/g)].map(m => m[0]);
      if (todosNumeros.length > 1) valorUnit = parseFloat(todosNumeros[1].replace(',', '.'));
    }
    if (valorUnit > 0) {
      let descItem = textoLimpoDePlaca
        .replace(/^(?:por favor,?\s*)?(?:abrir\s+os\s+e\s+)?(?:inclua|incluir|adicione|adicionar|lance|lançar)\s+/i, '')
        .replace(/\b\d+\s*(?:serv|pecas?|un|x)\b/i, '')
        .replace(/(?:a\s+)?\d+(?:[.,]\d{2})?\s*(?:reais|cada|unit)?/i, '')
        .trim();
      if (!descItem || descItem.length < 3) descItem = 'Serviço Solicitado';
      servicosIniciais.push({
        id: 'srv_' + Date.now(),
        nome: descItem.charAt(0).toUpperCase() + descItem.slice(1),
        qtd: qtd,
        valor: valorUnit
      });
      totalInicial += (qtd * valorUnit);
    }
  }

  const tid = extractTenantId(req);
  let triagemPreOS = null;
  try {
    triagemPreOS = preOSEngine.triagemEntrada({
      tenantId: tid,
      vehicleId: veiculo ? veiculo.id : null,
      placa: veiculo ? veiculo.placa : placaLimpa,
      clienteId: veiculo ? veiculo.cli : null,
      kmAtual: veiculo ? veiculo.km : 0,
      reclamacao: textoOriginal || (isSemPlaca ? 'Entrada sem placa identificada' : 'Check-in via WhatsApp'),
      origem: 'whatsapp',
      actorId: 'whatsapp',
      state: targetState
    });
  } catch (err) {
    console.error('[Pátio CRM] Erro na triagem inteligente de Pré-OS:', err);
  }

  const requerConfirmacao = triagemPreOS?.preOS?.status === 'aguardando_confirmacao' ||
                            triagemPreOS?.resumoContexto?.nivelAtencao === 'alto' ||
                            triagemPreOS?.resumoContexto?.nivelAtencao === 'atencao' ||
                            Boolean(triagemPreOS?.preOS?.possivelGarantia);

  if (requerConfirmacao && triagemPreOS?.preOS) {
    const actorId = clienteFone ? `zap_${clienteFone}` : 'whatsapp';
    const confirmToken = gerarTokenAcao({
      tenantId: tid,
      actorId,
      resourceId: triagemPreOS.preOS.id,
      action: 'converter_pre_os',
      version: targetState.versao || 0,
      ttlMs: 24 * 60 * 60 * 1000
    });

    const session = {
      id: gerarId('ses'),
      tenantId: tid,
      actorId,
      channel: 'whatsapp',
      vehicleId: veiculo ? veiculo.id : null,
      placa: veiculo ? veiculo.placa : placaLimpa,
      clienteId: veiculo ? veiculo.cli : null,
      preOSId: triagemPreOS.preOS.id,
      status: 'aguardando_confirmacao',
      collected: {
        kmAtual: veiculo ? veiculo.km : 0,
        reclamacaoOriginal: triagemPreOS.preOS.reclamacaoOriginal,
        categoria: triagemPreOS.preOS.categoria,
        sintomas: triagemPreOS.preOS.sintomas
      },
      missing: [],
      answeredQuestions: [],
      pendingQuestion: null,
      confirmToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };

    targetState.intakeSessions = Array.isArray(targetState.intakeSessions) ? targetState.intakeSessions : [];
    targetState.intakeSessions.unshift(session);

    const saveRes = await salvarEstado(req, targetState);
    if (!saveRes || !saveRes.ok) {
      throw new Error(saveRes?.error || 'Falha ao salvar sessão de intake de Pré-OS.');
    }

    const descVeiculo = `${veiculo.marca || ''} ${veiculo.modelo || 'Caminhão'}`.trim();
    const nomeCliente = clienteAssociado.fantasia || clienteAssociado.nome || 'Cliente';
    const linhasAlerta = (triagemPreOS.preOS.alertas || []).map(a => {
      const icone = a.tipo === 'garantia' ? '🛡️' : '🔍';
      return `${icone} *Alerta de Histórico:* ${a.mensagem}`;
    }).join('\n');

    const respostaWhatsApp =
`⚠️ *Atenção: Pré-OS #${triagemPreOS.preOS.id} Registrada*

🚛 *Veículo:* ${descVeiculo}
🏷️ *Placa:* *${veiculo.placa}* ${veiculo.ano ? `(${veiculo.ano})` : ''}
👤 *Cliente:* ${nomeCliente}

${linhasAlerta || 'Serviço com histórico recente identificado.'}

❓ *Atenção necessária antes da abertura definitiva da OS.*
Deseja confirmar a abertura da Ordem de Serviço?
_Envie *Sim* para confirmar ou *Não* para cancelar._`;

    return {
      novaOS: null,
      preOS: triagemPreOS.preOS,
      session,
      veiculo,
      boxLivre,
      pendenteConfirmacao: true,
      token: confirmToken,
      respostaWhatsApp
    };
  }

  const novaOS = {
    id: gerarId('os'),
    num: novoNum,
    cli: veiculo.cli,
    vei: veiculo.id,
    box: boxIdAlocado,
    st: statusOS,
    pendenciaCadastral: isSemPlaca,
    pendencias: isSemPlaca ? ['placa_pendente'] : [],
    abertura: new Date().toISOString().split('T')[0],
    prev: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    desc: 0,
    queixa: textoOriginal || (isSemPlaca ? 'Entrada sem placa identificada' : 'Check-in via WhatsApp'),
    preOSId: triagemPreOS?.preOS?.id || null,
    historicoRelacionado: triagemPreOS?.preOS?.ocorrenciasRelacionadas || [],
    possivelGarantia: Boolean(triagemPreOS?.preOS?.possivelGarantia),
    alertasGerados: triagemPreOS?.preOS?.alertas || [],
    pecas: [],
    servicos: servicosIniciais,
    total: totalInicial,
    criadoEm: Date.now()
  };

  if (triagemPreOS?.preOS) {
    triagemPreOS.preOS.status = 'convertida';
    triagemPreOS.preOS.convertedToOS = novaOS.num;
    triagemPreOS.preOS.convertedOSId = novaOS.id;
    triagemPreOS.preOS.convertedAt = new Date().toISOString();
  }

  await enqueueWrite(async () => {
    if (boxIdAlocado) {
      const isBoxOccupied = targetState.os.some(o => o.box === boxIdAlocado && o.st !== 'finalizada');
      if (isBoxOccupied) {
        novaOS.box = null;
        novaOS.st = 'fila';
        textoAlocacao += `\n⚠️ *Atenção:* O box escolhido foi ocupado neste exato momento por outro veículo. Direcionado para a fila.`;
      }
    }

    const maxNumReal = targetState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
    novaOS.num = String(maxNumReal + 1);
    if (triagemPreOS?.preOS) {
      triagemPreOS.preOS.convertedToOS = novaOS.num;
    }

    targetState.os.unshift(novaOS);
    const saveRes = await salvarEstado(req, targetState);
    if (!saveRes || !saveRes.ok) {
      throw new Error(saveRes?.error || 'Falha ao salvar Ordem de Serviço.');
    }
  });
  console.log(`[Pátio CRM] OS #${novoNum} aberta para ${placaLimpa}. Box: ${boxLivre ? boxLivre.nome : 'Fila de Espera'}. Total: R$ ${totalInicial.toFixed(2)}`);

  if (clienteFone && !isSemPlaca) {
    ultimasPlacas.set(`${tid}:direct:${clienteFone}`, { placa: placaLimpa, timestamp: Date.now() });
  }

  const descVeiculo = `${veiculo.marca || ''} ${veiculo.modelo || 'Caminhão'}`.trim();
  const nomeCliente = clienteAssociado.fantasia || clienteAssociado.nome || 'Cliente';

  let blocoAlertaTecnico = '';
  if (triagemPreOS?.preOS?.alertas && triagemPreOS.preOS.alertas.length > 0) {
    const linhasAlerta = triagemPreOS.preOS.alertas.map(a => {
      const icone = a.tipo === 'garantia' ? '🛡️' : '🔍';
      return `${icone} *Alerta de Histórico:* ${a.mensagem}`;
    }).join('\n');
    blocoAlertaTecnico = `\n${linhasAlerta}\n`;
  }

  const respostaWhatsApp =
`✅ *Ordem de Serviço #${novaOS.num} Aberta com Sucesso!*

🚛 *Veículo:* ${descVeiculo}
🏷️ *Placa:* *${veiculo.placa}* ${veiculo.ano ? `(${veiculo.ano})` : ''}
👤 *Cliente:* ${nomeCliente}

${statusCadastro}

${textoAlocacao}
${blocoAlertaTecnico}
📋 *Situação da OS:* ${boxLivre ? 'Em Execução no Box' : 'Na Fila de Espera'}${isSemPlaca ? ' (Pendência Cadastral: Sem Placa)' : ''}
📅 *Entrada:* ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

_Pátio CRM — Gestão de Oficina Pesada_`;

  return { novaOS, veiculo, boxLivre, respostaWhatsApp };
}

module.exports = {
  processarEntradaVeiculo
};
