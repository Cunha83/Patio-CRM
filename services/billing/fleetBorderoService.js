'use strict';

/**
 * Pátio CRM — Serviço de Gestão e Fechamento em Lote de Frotas (Borderô)
 * Arquitetura Modular (< 280 linhas).
 */

const crypto = require('crypto');
const boletoEngine = require('./boletoEngine');
const calc = require('./fleetBorderoCalc');
const fleetCostCenterService = require('../crm/fleetCostCenterService');

// Lista ordens de serviço finalizadas e entregues aptas a faturamento
function listarOSFaturaveisPorCliente({ state, tenantId, clienteId, dataInicio, dataFim, centroCustoId }) {
  if (!state || !Array.isArray(state.os)) return [];

  return state.os.filter(os => {
    if (tenantId && os.tenantId && os.tenantId !== tenantId) return false;
    const cid = os.cli || os.clienteId;
    if (cid !== clienteId) return false;

    // Apenas finalizadas ou entregues
    const st = String(os.st || '').toLowerCase();
    if (!['finalizada', 'entregue', 'concluida', 'pronto'].includes(st)) return false;

    // Bloqueio anti-duplicidade: não pode estar em borderô ativo
    if (os.borderoId || os.statusBordero === 'faturado') return false;

    // Filtro por Centro de Custo
    if (centroCustoId) {
      const ccId = os.centroCustoId || (state.veiculos || []).find(v => v.id === os.vei || v.placa === os.placa)?.centroCustoId;
      if (ccId !== centroCustoId) return false;
    }

    // Filtro por janela de período
    const dataOS = String(os.fechamento || os.data || os.dataEntrada || '').split('T')[0];
    if (dataInicio && dataOS && dataOS < dataInicio) return false;
    if (dataFim && dataOS && dataOS > dataFim) return false;

    return true;
  });
}

// Simula prévia do borderô sem alterar o estado do sistema
function simularPreviaBordero({
  state,
  tenantId,
  clienteId,
  osIds = [],
  descontoGeral = 0,
  retencoes = {},
  condicaoPagamento = '30ddl',
  dataBase = new Date().toISOString()
}) {
  if (!state) return { ok: false, error: 'Estado não inicializado.' };
  const cliente = (state.clientes || []).find(c => c.id === clienteId);
  if (!cliente) return { ok: false, error: 'Cliente frotista não encontrado.' };

  const idsSet = new Set(osIds);
  const ossSelecionadas = (state.os || []).filter(os => {
    if (tenantId && os.tenantId && os.tenantId !== tenantId) return false;
    return idsSet.has(os.id);
  });

  if (ossSelecionadas.length === 0) {
    return { ok: false, error: 'Nenhuma Ordem de Serviço selecionada para faturamento.' };
  }

  // Verificação de anti-duplicidade: nenhuma OS pode estar já faturada
  for (const os of ossSelecionadas) {
    if (os.borderoId || os.statusBordero === 'faturado') {
      return { ok: false, error: `A OS ${os.num || os.id} já está vinculada a outro borderô ativo.` };
    }
  }

  // Extrai itens e calcula totais
  const itensOS = ossSelecionadas.map(os => calc.extrairTotaisOS(os));
  const resumoTotais = calc.calcularResumoTotais({
    itensOS,
    descontoGeral,
    retencoes
  });

  const parcelas = calc.gerarDesdobramentoParcelas({
    totalLiquido: resumoTotais.totalLiquido,
    condicaoPagamento,
    dataBase
  });

  const agrupamentoCentrosCusto = fleetCostCenterService.agruparBorderoPorCentroCusto({
    itensOS,
    centrosCusto: Array.isArray(cliente.centrosCusto) ? cliente.centrosCusto : []
  });

  return {
    ok: true,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      doc: cliente.doc || cliente.cnpj || '',
      email: cliente.email || '',
      fone: cliente.fone || ''
    },
    resumoTotais,
    parcelas,
    espelhoAnalitico: itensOS,
    agrupamentoCentrosCusto
  };
}

// Fecha borderô: bloqueia OSs, cria títulos em contas a receber com boletos Febraban
function fecharBordero({
  state,
  tenantId = 'default',
  clienteId,
  osIds = [],
  descontoGeral = 0,
  retencoes = {},
  condicaoPagamento = '30ddl',
  dadosBancarios = null,
  operador = 'operador_frotas'
}) {
  const previa = simularPreviaBordero({
    state,
    tenantId,
    clienteId,
    osIds,
    descontoGeral,
    retencoes,
    condicaoPagamento
  });

  if (!previa.ok) return previa;

  state.borderos = Array.isArray(state.borderos) ? state.borderos : [];
  state.contas = Array.isArray(state.contas) ? state.contas : [];

  const borderoId = 'bord_' + crypto.randomUUID().slice(0, 8);
  const seq = state.borderos.length + 1;
  const numBordero = `BORD-${String(seq).padStart(4, '0')}`;

  const cfgBancaria = dadosBancarios || state.cfg?.oficina?.dadosBancarios || {
    banco: '001',
    agencia: '1234',
    conta: '56789',
    carteira: '17',
    chavePix: 'pix@molasfort.com.br'
  };

  const contasGeradas = [];
  const parcelasBordero = [];

  // Geração de Contas a Receber e Boletos Febraban
  for (const parc of previa.parcelas) {
    const contaId = 'cta_' + crypto.randomUUID().slice(0, 8);
    const nossoNumero = String(Date.now()).slice(-6) + String(parc.numero).padStart(3, '0');

    const boleto = boletoEngine.gerarBoletoCompleto({
      tituloId: contaId,
      tenantId,
      pagador: {
        nome: previa.cliente.nome,
        cnpj: previa.cliente.doc
      },
      beneficiario: {
        nome: state.cfg?.oficina?.nome || 'Oficina Mecânica',
        cnpj: state.cfg?.oficina?.cnpj || '',
        ...cfgBancaria
      },
      valor: parc.valor,
      vencimento: parc.vencimento,
      nossoNumero,
      chavePix: cfgBancaria.chavePix
    });

    const conta = {
      id: contaId,
      tenantId,
      tipo: 'receber',
      cli: clienteId,
      clienteNome: previa.cliente.nome,
      borderoId,
      borderoNum: numBordero,
      parcela: parc.numero,
      totalParcelas: parc.totalParcelas,
      valor: parc.valor,
      vencimento: parc.vencimento,
      pago: false,
      forma: 'boleto',
      descricao: `Borderô ${numBordero} - Parc ${parc.numero}/${parc.totalParcelas} - ${previa.cliente.nome}`,
      boleto: {
        id: boleto.id,
        banco: boleto.banco,
        nossoNumero: boleto.nossoNumero,
        codigoBarras: boleto.codigoBarras,
        linhaDigitavel: boleto.linhaDigitavel,
        pixCopiaECola: boleto.pixCopiaECola,
        status: 'emitido'
      },
      criadoEm: new Date().toISOString(),
      criadoPor: operador
    };

    state.contas.push(conta);
    contasGeradas.push(contaId);
    parcelasBordero.push({
      ...parc,
      contaId,
      boletoId: boleto.id,
      linhaDigitavel: boleto.linhaDigitavel,
      pixCopiaECola: boleto.pixCopiaECola
    });
  }

  // Trava as OSs associadas
  const idsSet = new Set(osIds);
  for (const os of state.os) {
    if (idsSet.has(os.id)) {
      os.borderoId = borderoId;
      os.statusBordero = 'faturado';
      os.dataFaturamentoBordero = new Date().toISOString();
    }
  }

  const novoBordero = {
    id: borderoId,
    num: numBordero,
    tenantId,
    clienteId,
    clienteNome: previa.cliente.nome,
    clienteDoc: previa.cliente.doc,
    status: 'faturado',
    osIds,
    resumoOS: previa.espelhoAnalitico,
    totais: previa.resumoTotais,
    condicaoPagamento,
    parcelas: parcelasBordero,
    contasIds: contasGeradas,
    criadoEm: new Date().toISOString(),
    criadoPor: operador
  };

  state.borderos.push(novoBordero);
  return { ok: true, bordero: novoBordero };
}

// Cancelamento atômico de borderô
function cancelarBordero({ state, tenantId, borderoId, motivo = '', operador = 'admin' }) {
  if (!state || !Array.isArray(state.borderos)) {
    return { ok: false, error: 'Borderô não encontrado.' };
  }

  const bordero = state.borderos.find(b => {
    if (tenantId && b.tenantId && b.tenantId !== tenantId) return false;
    return b.id === borderoId;
  });

  if (!bordero) return { ok: false, error: 'Borderô não encontrado.' };
  if (bordero.status === 'cancelado') return { ok: false, error: 'Borderô já está cancelado.' };

  // Libera as OSs vinculadas
  const osIdsSet = new Set(bordero.osIds || []);
  for (const os of (state.os || [])) {
    if (osIdsSet.has(os.id)) {
      os.borderoId = null;
      os.statusBordero = 'aberto';
      delete os.dataFaturamentoBordero;
    }
  }

  // Cancela contas a receber geradas
  const contasSet = new Set(bordero.contasIds || []);
  for (const conta of (state.contas || [])) {
    if (contasSet.has(conta.id)) {
      conta.st = 'cancelada';
      conta.canceladoEm = new Date().toISOString();
      conta.canceladoPor = operador;
      conta.motivoCancelamento = motivo;
    }
  }

  bordero.status = 'cancelado';
  bordero.canceladoEm = new Date().toISOString();
  bordero.canceladoPor = operador;
  bordero.motivoCancelamento = motivo;

  return { ok: true, bordero };
}

// Formata notificação WhatsApp profissional para envio ao financeiro da transportadora
function formatarNotificacaoWhatsAppBordero({ state, bordero }) {
  if (!bordero) return '';
  const clienteNome = bordero.clienteNome || 'Cliente Frotista';
  const numBordero = bordero.num || bordero.id;
  const totais = bordero.totais || {};

  let msg = `🚛 *FECHAMENTO DE FROTA — BORDERÔ ${numBordero}*\n`;
  msg += `*Cliente:* ${clienteNome}\n`;
  msg += `*Veículos Faturados:* ${bordero.resumoOS?.length || bordero.osIds?.length || 0} veículos\n\n`;

  msg += `📋 *Resumo por Veículo/OS:*\n`;
  for (const item of (bordero.resumoOS || [])) {
    msg += `• Placa *${item.placa}* (OS #${item.num}): R$ ${item.totalOS?.toFixed(2) || '0.00'}\n`;
    if (Array.isArray(item.discriminacaoArticulado) && item.discriminacaoArticulado.length > 0) {
      for (const d of item.discriminacaoArticulado) {
        msg += `   └─ ${d.alvo === 'cavalo' ? 'Cavalo' : 'Carreta'} (${d.placa}): R$ ${d.total.toFixed(2)}\n`;
      }
    }
  }

  msg += `\n💰 *Totalização:*\n`;
  msg += `• Mão de Obra: R$ ${totais.totalMaoDeObra?.toFixed(2) || '0.00'}\n`;
  msg += `• Peças: R$ ${totais.totalPecas?.toFixed(2) || '0.00'}\n`;
  if (totais.descontoGeral > 0) msg += `• Desconto: -R$ ${totais.descontoGeral.toFixed(2)}\n`;
  if (totais.totalRetencoes > 0) msg += `• Retenções Contratuais: -R$ ${totais.totalRetencoes.toFixed(2)}\n`;
  msg += `• *TOTAL LÍQUIDO:* *R$ ${totais.totalLiquido?.toFixed(2) || '0.00'}*\n\n`;

  msg += `💳 *Parcelas & Pagamento:*\n`;
  for (const parc of (bordero.parcelas || [])) {
    msg += `*Parcela ${parc.numero || 1}:* R$ ${parc.valor?.toFixed(2)} — Venc: ${parc.vencimento}\n`;
    if (parc.linhaDigitavel) {
      msg += `Linha Digitável:\n\`${parc.linhaDigitavel}\`\n`;
    }
    if (parc.pixCopiaECola) {
      msg += `Pix Copia e Cola:\n\`${parc.pixCopiaECola}\`\n`;
    }
    msg += `\n`;
  }

  msg += `_Dúvidas sobre o faturamento? Entre em contato com nosso setor financeiro._`;
  return msg.trim();
}

module.exports = {
  listarOSFaturaveisPorCliente,
  simularPreviaBordero,
  fecharBordero,
  cancelarBordero,
  formatarNotificacaoWhatsAppBordero
};

