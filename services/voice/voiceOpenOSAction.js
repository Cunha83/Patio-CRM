'use strict';

const { gerarId, registrarAuditoria, acoesPendentes, gerarTokenAcao } = require('./voiceSecurity');
const { normalizarPlaca, normalizarKm } = require('./voiceRulesHelpers');
const preOSEngine = require('../preOSEngine');

async function handleOpenOS({ interpretado, input, context = {}, state = {}, dataHoje }) {
  const cliDado = interpretado.cliente || {};
  const veiDado = interpretado.veiculo || {};
  const osDado = interpretado.os || {};

  // Localiza ou cadastra o cliente
  let cliente = null;
  const nomeBusca = (cliDado.nome || '').trim().toLowerCase();
  if (nomeBusca) {
    cliente = state.clientes.find(c => {
      const n = (c.nome || '').toLowerCase();
      const f = (c.fantasia || '').toLowerCase();
      const ct = (c.contato || '').toLowerCase();
      return n.includes(nomeBusca) || f.includes(nomeBusca) || ct.includes(nomeBusca);
    });
  }

  if (!cliente) {
    cliente = {
      id: gerarId('c'),
      nome: cliDado.nome || 'Cliente Recepção',
      fantasia: cliDado.nome || 'Cliente Recepção',
      doc: '',
      fone: cliDado.fone || '',
      email: '',
      contato: cliDado.nome || '',
      prazo: 0,
      ie: '',
      endereco: '',
      cidade: '',
      uf: '',
      cep: '',
      optin: true,
      bloqueado: false
    };
    state.clientes.push(cliente);
  }

  // Localiza ou cadastra o veículo
  let veiculo = null;
  const placaLimpa = normalizarPlaca(veiDado.placa);
  const isSemPlaca = !placaLimpa || placaLimpa === 'SEM-PLACA';

  if (placaLimpa && !isSemPlaca) {
    veiculo = state.veiculos.find(v => normalizarPlaca(v.placa) === placaLimpa);
  }
  if (!veiculo && veiDado.modelo && !isSemPlaca) {
    const modBusca = (veiDado.modelo || '').toLowerCase();
    veiculo = state.veiculos.find(v => v.cli === cliente.id && (v.modelo || '').toLowerCase().includes(modBusca));
  }

  const kmInformado = normalizarKm(veiDado.km) || normalizarKm(osDado.km) || (veiculo ? veiculo.km : 0);

  if (veiculo) {
    if (kmInformado && kmInformado > (veiculo.km || 0)) veiculo.km = kmInformado;
    if (veiDado.cor && (!veiculo.cor || veiculo.cor === 'Não informada')) veiculo.cor = veiDado.cor;
    if (veiDado.ano && !veiculo.ano) veiculo.ano = veiDado.ano;
    if (!veiculo.cli) veiculo.cli = cliente.id;
  } else {
    veiculo = {
      id: gerarId('v'),
      cli: cliente.id,
      placa: isSemPlaca ? 'SEM-PLACA' : (placaLimpa || `ENT-${Math.floor(1000 + Math.random() * 9000)}`),
      marca: veiDado.marca || 'Geral',
      modelo: veiDado.modelo || 'Veículo',
      ano: veiDado.ano || new Date().getFullYear().toString(),
      km: kmInformado || 0,
      cor: veiDado.cor || 'Não informada',
      tipo: veiDado.tipo || 'Passeio',
      pendenciaCadastral: isSemPlaca,
      pendencias: isSemPlaca ? ['placa_pendente'] : []
    };
    state.veiculos.push(veiculo);
  }

  // Prevenção de duplicidade: verifica se o veículo já tem OS em andamento no pátio
  const osExistente = state.os.find(o => o.vei === veiculo.id && o.st !== 'finalizada' && o.st !== 'cancelada');
  if (osExistente && !context.ignorarDuplicidade) {
    const novasQueixas = Array.isArray(osDado.reclamacoes) ? osDado.reclamacoes : [];
    if (novasQueixas.length > 0) {
      const textoNovas = novasQueixas.join('; ');
      osExistente.queixa = osExistente.queixa ? `${osExistente.queixa}\n• [Nova queixa]: ${textoNovas}` : textoNovas;
    }
    return {
      ok: true,
      acao: 'associar_os_existente',
      osId: osExistente.id,
      numOS: osExistente.num,
      veiculoId: veiculo.id,
      clienteId: cliente.id,
      resposta: `O veículo ${veiculo.modelo} já possui a OS #${osExistente.num} em andamento. Adicionei as novas queixas a ela com sucesso!`
    };
  }

  const listaQueixas = Array.isArray(osDado.reclamacoes) && osDado.reclamacoes.length > 0
    ? osDado.reclamacoes
    : ['Revisão e inspeção preventiva de entrada.'];
  const textoQueixaFormatado = listaQueixas.length > 1
    ? listaQueixas.map(q => `• ${q}`).join('\n')
    : listaQueixas[0];

  const tenantId = context.tenantId || 'default';
  const preOSConfirmada = context.preOSConfirmada === true || context._confirmadoInternamente === true;

  if (!preOSConfirmada && !context.ignorarPreOS) {
    const triagem = preOSEngine.triagemEntrada({
      tenantId,
      vehicleId: veiculo.id,
      placa: veiculo.placa,
      clienteId: cliente.id,
      motorista: interpretado.motorista || '',
      kmAtual: kmInformado,
      reclamacao: textoQueixaFormatado,
      origem: context.canal || 'voz',
      actorId: context.remetente || context.actorId || 'operador',
      state,
      dataReferencia: dataHoje
    });

    // Se houver alerta de atenção ou alto (recorrência ou garantia), pausa para confirmação
    if (triagem.resumoContexto.nivelAtencao === 'alto' || triagem.resumoContexto.nivelAtencao === 'atencao' || triagem.preOS?.possivelGarantia === true || triagem.preOS?.status === 'aguardando_confirmacao') {
      const token = gerarTokenAcao({
        tenantId,
        actorId: context.actorId || context.remetente || 'operador',
        resourceId: triagem.preOS.id,
        action: 'converter_pre_os',
        version: state.versao || 0,
        ttlMs: 5 * 60 * 1000
      });

      acoesPendentes.set(token, {
        interpretado,
        input,
        context,
        preOSId: triagem.preOS.id,
        expiraEm: Date.now() + 5 * 60 * 1000
      });

      return {
        ok: true,
        pendenteConfirmacao: true,
        token,
        acao: 'converter_pre_os',
        preOSId: triagem.preOS.id,
        preOS: triagem.preOS,
        resumoContexto: triagem.resumoContexto,
        possivelGarantia: triagem.preOS.possivelGarantia,
        risco: triagem.preOS.possivelGarantia ? 'alto' : 'medio',
        resposta: triagem.respostaSugerida
      };
    }

    // Caso nível de atenção seja 'info' (sem recorrência ou veículo novo), converte Pré-OS diretamente para OS
    const conversao = preOSEngine.converterEmOS({
      tenantId,
      preOSId: triagem.preOS.id,
      state,
      actorId: context.remetente || context.actorId || 'operador',
      boxId: osDado.box || 'patio',
      mecanico: osDado.mecanico || 'A Definir',
      dataReferencia: dataHoje
    });

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'abrir_os',
      comando: input.text || (input && input.texto) || '[Áudio ditado]',
      resumo: `Abertura da OS #${conversao.os.num} para ${veiculo.modelo} (${cliente.nome})`,
      osId: conversao.os.id
    });

    const respCurta = interpretado.resposta_falada ||
      `Certo, abri a OS #${conversao.os.num} para o ${veiculo.modelo} do ${cliente.nome} e registrei as queixas.`;

    return {
      ok: true,
      acao: 'abrir_os',
      osId: conversao.os.id,
      numOS: conversao.os.num,
      veiculoId: veiculo.id,
      clienteId: cliente.id,
      preOSId: triagem.preOS.id,
      possivelGarantia: conversao.preOS.possivelGarantia,
      resposta: respCurta
    };
  }

  // Criação da Nova Ordem de Serviço (caso já pré-confirmada)
  const maxNum = state.os.reduce((max, o) => Math.max(max, Number(o.num) || 0), 1040);
  const novoNum = maxNum + 1;

  const novaOS = {
    id: gerarId('os'),
    num: novoNum,
    box: osDado.box || 'patio',
    vei: veiculo.id,
    cli: cliente.id,
    mec: osDado.mecanico || 'A Definir',
    st: osDado.box && osDado.box !== 'patio' ? 'executando' : 'aguardando',
    pendenciaCadastral: isSemPlaca,
    pendencias: isSemPlaca ? ['placa_pendente'] : [],
    abertura: dataHoje,
    prev: dataHoje,
    km: kmInformado || 0,
    queixa: textoQueixaFormatado,
    servicos: [],
    pecas: [],
    desc: 0,
    pago: false,
    formaPgto: '',
    obs: isSemPlaca
      ? `Entrada registrada via voz com pendência cadastral de placa.`
      : `Entrada registrada via comando inteligente de voz.`
  };

  state.os.unshift(novaOS);

  registrarAuditoria(state, {
    canal: context.canal || 'voz',
    usuario: context.remetente || 'Operador',
    intencao: 'abrir_os',
    comando: input.text || (input && input.texto) || '[Áudio ditado]',
    resumo: `Abertura da OS #${novaOS.num} para ${veiculo.modelo} (${cliente.nome})`,
    osId: novaOS.id
  });

  const respCurta = interpretado.resposta_falada ||
    `Certo, abri a OS #${novaOS.num} para o ${veiculo.modelo} do ${cliente.nome} e registrei as queixas.`;

  return {
    ok: true,
    acao: 'abrir_os',
    osId: novaOS.id,
    numOS: novaOS.num,
    veiculoId: veiculo.id,
    clienteId: cliente.id,
    resposta: respCurta
  };
}

module.exports = {
  handleOpenOS
};

