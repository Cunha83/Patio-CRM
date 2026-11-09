'use strict';

const {
  salvarEstado,
  enqueueWrite,
  gerarId,
  extractTenantId,
  ultimasPlacas
} = require('../../lib/serverContext');
const preOSEngine = require('../preOSEngine');
const { gerarTokenAcao } = require('../../lib/tokens/securityToken');

function extrairServicosIniciais(servicos, textoOriginal, placaLimpa) {
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
        status: s.status || (s.autorizado !== false ? 'aprovado' : 'pendente'),
        alvo: s.alvo || (s.placaAlvo ? (s.placaAlvo === placaLimpa ? 'cavalo' : 'carreta') : null),
        placaAlvo: s.placaAlvo || null
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

  return { servicosIniciais, totalInicial };
}

async function finalizarAberturaOS({
  targetState,
  req,
  veiculo,
  isSemPlaca,
  placaLimpa,
  clienteNome,
  clienteFone,
  clienteAssociado,
  statusCadastro,
  boxLivre,
  boxIdAlocado,
  statusOS,
  textoAlocacao,
  servicos = [],
  textoOriginal,
  conjunto = null
}) {
  const { servicosIniciais, totalInicial } = extrairServicosIniciais(servicos, textoOriginal, placaLimpa);
  const tid = extractTenantId(req);

  const conjuntoFinal = conjunto || {
    isArticulado: false,
    tipoConjunto: 'simples',
    cavalo: { id: veiculo ? veiculo.id : null, placa: veiculo ? veiculo.placa : placaLimpa },
    implementos: []
  };

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

  const maxNum = targetState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
  const novoNum = String(maxNum + 1);

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
    conjunto: conjuntoFinal,
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

  let finalAlocacaoTexto = textoAlocacao;

  await enqueueWrite(async () => {
    if (boxIdAlocado) {
      const isBoxOccupied = targetState.os.some(o => o.box === boxIdAlocado && o.st !== 'finalizada');
      if (isBoxOccupied) {
        novaOS.box = null;
        novaOS.st = 'fila';
        finalAlocacaoTexto += `\n⚠️ *Atenção:* O box escolhido foi ocupado neste exato momento por outro veículo. Direcionado para a fila.`;
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

  const linhaConjunto = conjuntoFinal.isArticulado
    ? `\n🚛 *Conjunto Articulado:* Cavalo ${conjuntoFinal.cavalo.placa} + Carreta: ${conjuntoFinal.implementos.map(i => i.placa).join(', ')}`
    : '';

  const respostaWhatsApp =
`✅ *Ordem de Serviço #${novaOS.num} Aberta com Sucesso!*

🚛 *Veículo:* ${descVeiculo}
🏷️ *Placa:* *${veiculo.placa}* ${veiculo.ano ? `(${veiculo.ano})` : ''}${linhaConjunto}
👤 *Cliente:* ${nomeCliente}

${statusCadastro}

${finalAlocacaoTexto}
${blocoAlertaTecnico}
📋 *Situação da OS:* ${boxLivre ? 'Em Execução no Box' : 'Na Fila de Espera'}${isSemPlaca ? ' (Pendência Cadastral: Sem Placa)' : ''}
📅 *Entrada:* ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

_Pátio CRM — Gestão de Oficina Pesada_`;

  return { novaOS, veiculo, boxLivre, respostaWhatsApp };
}

module.exports = {
  extrairServicosIniciais,
  finalizarAberturaOS
};

