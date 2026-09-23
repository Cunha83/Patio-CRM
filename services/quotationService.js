'use strict';

const crypto = require('crypto');
const {
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('../lib/tokens/securityToken');
const inventoryService = require('./inventoryService');

function gerarId(prefix = 'orc') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function arredondar(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
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
 * Calcula subtotais e totais de um orçamento de forma determinística
 */
function calcularTotais(itens = [], descontoGeral = 0) {
  let subtotalServicos = 0;
  let subtotalPecas = 0;
  let totalAprovado = 0;

  for (const item of itens) {
    const unit = arredondar(item.valorUnitario || item.preco || 0);
    const qtd = Math.max(1, Number(item.quantidade) || 1);
    const totalItem = arredondar(unit * qtd);
    item.valorUnitario = unit;
    item.quantidade = qtd;
    item.valorTotal = totalItem;

    if (item.tipo === 'peca') {
      subtotalPecas += totalItem;
    } else {
      subtotalServicos += totalItem;
    }

    if (item.status === 'aprovado') {
      totalAprovado += totalItem;
    }
  }

  subtotalServicos = arredondar(subtotalServicos);
  subtotalPecas = arredondar(subtotalPecas);
  const desc = arredondar(Math.max(0, Number(descontoGeral) || 0));
  const totalGeral = arredondar(Math.max(0, subtotalServicos + subtotalPecas - desc));
  totalAprovado = arredondar(totalAprovado);

  return {
    subtotalServicos,
    subtotalPecas,
    descontoGeral: desc,
    totalGeral,
    totalAprovado
  };
}

/**
 * Cria um novo orçamento comercial vinculado a uma OS (e opcionalmente a uma Inspeção)
 */
function criarOrcamento({
  tenantId,
  state,
  osId,
  inspectionId = null,
  items = [],
  descontoGeral = 0,
  validadeHoras = 72,
  adicional = false,
  parentQuotationId = null,
  motivoAdicional = null,
  actorId = 'operador'
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('tenantId é obrigatório para criar orçamento.');
  }
  if (!state) {
    throw new Error('Estado do tenant é obrigatório.');
  }
  if (!osId) {
    throw new Error('osId é obrigatório para criar orçamento.');
  }

  state.quotations = Array.isArray(state.quotations) ? state.quotations : [];
  state.os = Array.isArray(state.os) ? state.os : [];
  state.veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];

  const os = state.os.find(o => o.id === osId);
  const osNum = os ? (os.num || os.id) : osId;
  const veiculoId = os ? os.vei : null;
  const clienteId = os ? os.cli : null;
  const placa = os ? os.placa : null;

  const itensFormatados = items.map((it, idx) => ({
    id: it.id || `item_${Date.now()}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
    tipo: it.tipo === 'peca' ? 'peca' : 'servico',
    nome: String(it.nome || 'Item sem descrição').trim(),
    descricao: String(it.descricao || '').trim(),
    quantidade: Math.max(1, Number(it.quantidade) || 1),
    valorUnitario: arredondar(it.valorUnitario || it.preco || 0),
    valorTotal: arredondar((Number(it.valorUnitario || it.preco || 0)) * (Math.max(1, Number(it.quantidade) || 1))),
    prioridade: it.prioridade || 'obrigatorio', // obrigatorio | recomendado | preventivo
    status: it.status || 'pendente', // pendente | aprovado | recusado
    motivoRecusa: null,
    garantiaEstimada: it.garantiaEstimada || null,
    possivelGarantia: Boolean(it.possivelGarantia)
  }));

  const totais = calcularTotais(itensFormatados, descontoGeral);

  const versaoInicial = 1;
  const codigo = adicional
    ? `ORC-${osNum}-ADIC-${state.quotations.filter(q => q.osId === osId && q.adicional).length + 1}`
    : `ORC-${osNum}-v${versaoInicial}`;

  const novoOrcamento = {
    id: gerarId('orc'),
    codigo,
    tenantId,
    osId,
    inspectionId: inspectionId || null,
    veiculoId: veiculoId || null,
    clienteId: clienteId || null,
    placa: placa ? String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
    versao: versaoInicial,
    adicional: Boolean(adicional),
    parentQuotationId: parentQuotationId || null,
    motivoAdicional: motivoAdicional ? String(motivoAdicional).trim() : null,
    status: 'rascunho', // rascunho | enviado | aprovado | parcialmente_aprovado | recusado | expirado | cancelado
    itens: itensFormatados,
    ...totais,
    validadeHoras: Number(validadeHoras) || 72,
    expiraEm: new Date(Date.now() + (Number(validadeHoras) || 72) * 60 * 60 * 1000).toISOString(),
    enviadoEm: null,
    canalEnvio: null,
    activeTokenHash: null,
    historicoVersoes: [],
    decisaoCliente: {
      decididoEm: null,
      canal: null,
      itensAprovadosIds: [],
      itensRecusadosIds: [],
      motivoRecusaGeral: null,
      ipOrigem: null,
      userAgent: null
    },
    criadoEm: new Date().toISOString(),
    criadoPor: actorId,
    atualizadoEm: new Date().toISOString()
  };

  state.quotations.unshift(novoOrcamento);

  if (os) {
    if (!adicional) {
      os.quotationId = novoOrcamento.id;
      if (os.st === 'fila' || os.st === 'diagnostico') {
        os.st = 'aprovacao';
      }
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: adicional ? 'orcamento_adicional_criado' : 'orcamento_criado',
    quotationId: novoOrcamento.id,
    codigo: novoOrcamento.codigo,
    osId: novoOrcamento.osId,
    totalGeral: novoOrcamento.totalGeral,
    totalItens: novoOrcamento.itens.length,
    autor: actorId
  });

  return { ok: true, quotation: novoOrcamento };
}

/**
 * Obtém um orçamento pelo ID com isolamento estrito de tenant
 */
function obterOrcamento({ tenantId, state, quotationId }) {
  if (!tenantId || !state || !quotationId) return null;
  const list = Array.isArray(state.quotations) ? state.quotations : [];
  const orc = list.find(q => q.id === quotationId && q.tenantId === tenantId);
  return orc || null;
}

/**
 * Lista orçamentos de um tenant com filtros opcionais
 */
function listarOrcamentos({ tenantId, state, osId = null, status = null, placa = null }) {
  if (!tenantId || !state) return [];
  const list = Array.isArray(state.quotations) ? state.quotations : [];
  return list.filter(q => {
    if (q.tenantId !== tenantId) return false;
    if (osId && q.osId !== osId) return false;
    if (status && q.status !== status) return false;
    if (placa) {
      const pNorm = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const qPlaca = String(q.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (qPlaca !== pNorm) return false;
    }
    return true;
  });
}

/**
 * Cria uma nova versão de um orçamento existente (ex: v1 -> v2)
 * Arquiva a versão anterior no histórico e revoga os tokens antigos.
 */
function criarNovaVersao({
  tenantId,
  state,
  quotationId,
  novosItens = null,
  descontoGeral = null,
  motivo = 'Ajuste de escopo e valores',
  actorId = 'operador'
}) {
  const orc = obterOrcamento({ tenantId, state, quotationId });
  if (!orc) {
    return { ok: false, error: 'Orçamento não encontrado.', status: 404 };
  }

  if (orc.status === 'cancelado') {
    return { ok: false, error: 'Não é possível versionar um orçamento cancelado.', status: 400 };
  }

  // 1. Arquiva versão atual no histórico
  orc.historicoVersoes = Array.isArray(orc.historicoVersoes) ? orc.historicoVersoes : [];
  orc.historicoVersoes.push({
    versao: orc.versao,
    codigo: orc.codigo,
    status: orc.status,
    itens: JSON.parse(JSON.stringify(orc.itens)),
    subtotalServicos: orc.subtotalServicos,
    subtotalPecas: orc.subtotalPecas,
    descontoGeral: orc.descontoGeral,
    totalGeral: orc.totalGeral,
    totalAprovado: orc.totalAprovado,
    enviadoEm: orc.enviadoEm,
    arquivadoEm: new Date().toISOString(),
    motivo: String(motivo || '').trim(),
    arquivadoPor: actorId
  });

  // 2. Incrementa versão e invalida token antigo
  orc.versao += 1;
  const os = (state.os || []).find(o => o.id === orc.osId);
  const osNum = os ? (os.num || os.id) : orc.osId;
  orc.codigo = orc.adicional ? `${orc.codigo}-v${orc.versao}` : `ORC-${osNum}-v${orc.versao}`;
  orc.activeTokenHash = null; // Revoga token da versão anterior
  orc.status = 'rascunho';

  // 3. Atualiza itens se fornecidos
  if (Array.isArray(novosItens)) {
    orc.itens = novosItens.map((it, idx) => ({
      id: it.id || `item_${Date.now()}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
      tipo: it.tipo === 'peca' ? 'peca' : 'servico',
      nome: String(it.nome || 'Item sem descrição').trim(),
      descricao: String(it.descricao || '').trim(),
      quantidade: Math.max(1, Number(it.quantidade) || 1),
      valorUnitario: arredondar(it.valorUnitario || it.preco || 0),
      valorTotal: arredondar((Number(it.valorUnitario || it.preco || 0)) * (Math.max(1, Number(it.quantidade) || 1))),
      prioridade: it.prioridade || 'obrigatorio',
      status: 'pendente',
      motivoRecusa: null,
      garantiaEstimada: it.garantiaEstimada || null,
      possivelGarantia: Boolean(it.possivelGarantia)
    }));
  }

  if (descontoGeral !== null && descontoGeral !== undefined) {
    orc.descontoGeral = arredondar(descontoGeral);
  }

  // 4. Recalcula totais
  const totais = calcularTotais(orc.itens, orc.descontoGeral);
  Object.assign(orc, totais);
  orc.atualizadoEm = new Date().toISOString();

  registrarAuditoria(state, {
    tenantId,
    tipo: 'orcamento_nova_versao',
    quotationId: orc.id,
    codigo: orc.codigo,
    versao: orc.versao,
    totalGeral: orc.totalGeral,
    motivo,
    autor: actorId
  });

  return { ok: true, quotation: orc };
}

/**
 * Cria um adicional de escopo descoberto durante a execução da OS
 */
function criarAdicionalEscopo({
  tenantId,
  state,
  osId,
  parentQuotationId = null,
  items = [],
  motivo = 'Anomalia detectada durante a desmontagem',
  actorId = 'operador'
}) {
  return criarOrcamento({
    tenantId,
    state,
    osId,
    items,
    adicional: true,
    parentQuotationId,
    motivoAdicional: motivo,
    actorId
  });
}

/**
 * Registra o envio do orçamento ao cliente e emite o token de aprovação digital
 */
function enviarOrcamento({
  tenantId,
  state,
  quotationId,
  canal = 'link',
  validadeHoras = 72,
  baseUrl = '',
  actorId = 'operador'
}) {
  const orc = obterOrcamento({ tenantId, state, quotationId });
  if (!orc) {
    return { ok: false, error: 'Orçamento não encontrado.', status: 404 };
  }

  const ttlMs = (Number(validadeHoras) || orc.validadeHoras || 72) * 60 * 60 * 1000;
  const token = gerarTokenAprovacaoOrcamento({
    tenantId,
    quotationId: orc.id,
    version: orc.versao,
    customerId: orc.clienteId,
    ttlMs
  });

  orc.status = 'enviado';
  orc.enviadoEm = new Date().toISOString();
  orc.canalEnvio = canal;
  orc.expiraEm = new Date(Date.now() + ttlMs).toISOString();
  orc.activeTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  orc.atualizadoEm = new Date().toISOString();

  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const linkAprovacao = `${cleanBase}/aprovacao/${token}`;

  registrarAuditoria(state, {
    tenantId,
    tipo: 'orcamento_enviado',
    quotationId: orc.id,
    codigo: orc.codigo,
    canal,
    validadeHoras: Math.round(ttlMs / (60 * 60 * 1000)),
    autor: actorId
  });

  return {
    ok: true,
    quotation: orc,
    token,
    linkAprovacao
  };
}

/**
 * Valida o token de aprovação para exibição segura sem consumi-lo
 */
function consultarPorToken({ tokenString, state }) {
  const validacao = validarTokenAprovacaoOrcamento(tokenString);
  if (!validacao.ok) return validacao;

  const { tenantId, quotationId, version } = validacao.payload;
  const orc = obterOrcamento({ tenantId, state, quotationId });
  if (!orc) {
    return { ok: false, error: 'Orçamento não encontrado para este link.', status: 404 };
  }

  if (orc.versao !== version) {
    return {
      ok: false,
      error: 'Este orçamento foi atualizado pela oficina para uma versão mais recente. Solicite o novo link.',
      status: 409,
      conflict: true
    };
  }

  // Verifica se o veículo possui inspeção com fotos
  let fotosInspecao = [];
  if (orc.inspectionId && Array.isArray(state.inspections)) {
    const insp = state.inspections.find(i => i.id === orc.inspectionId && i.tenantId === tenantId);
    if (insp && Array.isArray(insp.items)) {
      for (const item of insp.items) {
        if (Array.isArray(item.fotos) && item.fotos.length > 0) {
          fotosInspecao.push({
            componente: item.componente,
            condicao: item.condicao,
            severidade: item.severidade,
            fotos: item.fotos
          });
        }
      }
    }
  }

  return {
    ok: true,
    quotation: orc,
    fotosInspecao,
    payload: validacao.payload
  };
}

/**
 * Processa a decisão do cliente (Aprovação Total, Parcial ou Recusa).
 * Implementa idempotência estrita e sincronização com a execução autorizada da OS.
 */
function processarAprovacaoCliente({
  tenantId,
  state,
  tokenString,
  itensAprovadosIds = [],
  itensRecusadosIds = [],
  aprovarTudo = false,
  recusarTudo = false,
  motivoRecusa = null,
  canalAprovacao = 'link_digital',
  ipOrigem = null,
  userAgent = null,
  actorId = 'cliente'
}) {
  const consulta = consultarPorToken({ tokenString, state });
  if (!consulta.ok) return consulta;

  const orc = consulta.quotation;
  const payload = consulta.payload;

  // ── 1. PROTEÇÃO DE IDEMPOTÊNCIA (Clique duplo / requisição repetida) ──
  const statusFinais = ['aprovado', 'parcialmente_aprovado', 'recusado'];
  if (statusFinais.includes(orc.status)) {
    return {
      ok: true,
      quotation: orc,
      idempotente: true,
      mensagem: `A decisão sobre este orçamento já foi registrada anteriormente como "${orc.status}".`
    };
  }

  // ── 2. CONSUMO ATÔMICO DO TOKEN ──
  const consumo = consumirTokenAprovacaoOrcamento(tokenString, {
    tenantId,
    quotationId: orc.id,
    version: orc.versao
  });
  if (!consumo.ok && !consumo.jaConsumido) {
    return consumo;
  }

  // ── 3. PROCESSAMENTO DOS ITENS ──
  const aprovadosSet = new Set(Array.isArray(itensAprovadosIds) ? itensAprovadosIds : []);
  const recusadosSet = new Set(Array.isArray(itensRecusadosIds) ? itensRecusadosIds : []);

  let qtdAprovados = 0;
  let qtdRecusados = 0;

  for (const item of orc.itens) {
    if (aprovarTudo) {
      item.status = 'aprovado';
      item.motivoRecusa = null;
      qtdAprovados++;
    } else if (recusarTudo) {
      item.status = 'recusado';
      item.motivoRecusa = motivoRecusa || 'Recusado integralmente pelo cliente';
      qtdRecusados++;
    } else {
      if (aprovadosSet.has(item.id)) {
        item.status = 'aprovado';
        item.motivoRecusa = null;
        qtdAprovados++;
      } else if (recusadosSet.has(item.id)) {
        item.status = 'recusado';
        item.motivoRecusa = motivoRecusa || 'Item dispensado pelo cliente';
        qtdRecusados++;
      } else {
        // Se não foi explicitamente aprovado em decisão parcial, permanece recusado/não autorizado
        item.status = 'recusado';
        item.motivoRecusa = 'Item não selecionado para execução';
        qtdRecusados++;
      }
    }
  }

  // ── 4. RECÁLCULO DOS TOTAIS E STATUS GERAL ──
  const totais = calcularTotais(orc.itens, orc.descontoGeral);
  Object.assign(orc, totais);

  if (qtdAprovados > 0 && qtdRecusados === 0) {
    orc.status = 'aprovado';
  } else if (qtdAprovados > 0 && qtdRecusados > 0) {
    orc.status = 'parcialmente_aprovado';
  } else {
    orc.status = 'recusado';
  }

  orc.decisaoCliente = {
    decididoEm: new Date().toISOString(),
    canal: canalAprovacao,
    itensAprovadosIds: orc.itens.filter(i => i.status === 'aprovado').map(i => i.id),
    itensRecusadosIds: orc.itens.filter(i => i.status === 'recusado').map(i => i.id),
    motivoRecusaGeral: motivoRecusa || null,
    ipOrigem: ipOrigem || null,
    userAgent: userAgent || null
  };
  orc.atualizadoEm = new Date().toISOString();

  // ── 5. SINCRONIZAÇÃO COM A EXECUÇÃO AUTORIZADA DA OS ──
  state.os = Array.isArray(state.os) ? state.os : [];
  const os = state.os.find(o => o.id === orc.osId);
  if (os) {
    os.servicos = Array.isArray(os.servicos) ? os.servicos : [];
    os.pecas = Array.isArray(os.pecas) ? os.pecas : [];
    os.itensRecusados = Array.isArray(os.itensRecusados) ? os.itensRecusados : [];

    for (const item of orc.itens) {
      if (item.status === 'aprovado') {
        const itemExecucao = {
          id: item.id,
          desc: item.nome,
          nome: item.nome,
          preco: item.valorTotal,
          qtd: item.quantidade,
          valorUnitario: item.valorUnitario,
          autorizado: true,
          orcamentoId: orc.id,
          codigoOrcamento: orc.codigo
        };

        if (item.tipo === 'peca') {
          // Localiza ou mapeia peça no estoque do tenant
          let partId = item.partId || item.pecaId || null;
          if (!partId && Array.isArray(state.pecas)) {
            const matchPeca = state.pecas.find(p => p.tenantId === tenantId && (
              (p.descricao && p.descricao.toLowerCase() === item.nome.toLowerCase()) ||
              (p.nome && p.nome.toLowerCase() === item.nome.toLowerCase()) ||
              (p.codigoInterno && p.codigoInterno.toLowerCase() === item.nome.toLowerCase()) ||
              (p.id === item.id)
            ));
            if (matchPeca) partId = matchPeca.id;
          }

          if (partId) {
            itemExecucao.partId = partId;
            try {
              const resReserva = inventoryService.reservarParaOS({
                tenantId,
                state,
                osId: orc.osId,
                quotationId: orc.id,
                quotationItemId: item.id,
                partId,
                quantity: item.quantidade,
                actorId: 'aprovacao_cliente'
              });
              itemExecucao.statusEstoque = resReserva.status;
              itemExecucao.qtdReservada = resReserva.reservedQuantity;
              itemExecucao.qtdFaltante = resReserva.missingQuantity;
              itemExecucao.requirementId = resReserva.requirement?.id;
            } catch (errReserva) {
              console.warn('[QuotationService] Aviso ao reservar peça:', errReserva.message);
            }
          }

          const idx = os.pecas.findIndex(p => p.id === item.id);
          if (idx >= 0) os.pecas[idx] = itemExecucao;
          else os.pecas.push(itemExecucao);
        } else {
          const idx = os.servicos.findIndex(s => s.id === item.id);
          if (idx >= 0) os.servicos[idx] = itemExecucao;
          else os.servicos.push(itemExecucao);
        }
      } else {
        // Se foi recusado e havia reserva anterior, libera
        if (item.tipo === 'peca' && (item.partId || item.id)) {
          try {
            inventoryService.liberarReserva({
              tenantId,
              state,
              osId: orc.osId,
              partId: item.partId,
              quantity: item.quantidade,
              reason: 'Item de orçamento recusado pelo cliente',
              actorId: 'aprovacao_cliente'
            });
          } catch (_) {}
        }

        // Registra item como não autorizado para visualização transparente do mecânico
        os.itensRecusados.push({
          id: item.id,
          nome: item.nome,
          tipo: item.tipo,
          quantidade: item.quantidade,
          valorTotal: item.valorTotal,
          motivoRecusa: item.motivoRecusa,
          autorizado: false,
          recusado: true,
          orcamentoId: orc.id
        });
      }
    }

    os.totalAutorizado = orc.totalAprovado;

    // Transição de status da OS:
    // Se houver itens aprovados e a OS estava em aprovação, move para executando
    if (qtdAprovados > 0) {
      if (os.st === 'aprovacao' || os.st === 'fila' || os.st === 'diagnostico') {
        os.st = 'executando';
      }
    } else {
      // Nenhum item aprovado
      if (os.st === 'aprovacao') {
        os.st = 'fila'; // Retorna para alinhamento ou entrega sem serviço
      }
    }
  }

  registrarAuditoria(state, {
    tenantId,
    tipo: 'orcamento_decidido_cliente',
    quotationId: orc.id,
    codigo: orc.codigo,
    status: orc.status,
    canalAprovacao,
    totalAprovado: orc.totalAprovado,
    qtdAprovados,
    qtdRecusados,
    autor: actorId
  });

  return {
    ok: true,
    quotation: orc,
    totalAprovado: orc.totalAprovado,
    status: orc.status,
    qtdAprovados,
    qtdRecusados
  };
}

/**
 * Formata mensagem clara e objetiva para envio do orçamento pelo WhatsApp
 */
function formatarMensagemWhatsAppOrcamento({ orcamento, state, baseUrl = '' }) {
  if (!orcamento) return '';
  const os = (state.os || []).find(o => o.id === orcamento.osId);
  const placa = orcamento.placa || (os ? os.placa : 'VEÍCULO');

  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const token = orcamento.token || (orcamento.activeTokenHash ? 'link' : '');
  const urlLink = token ? `${cleanBase}/aprovacao/${token}` : `${cleanBase}/aprovacao/orcamento-${orcamento.id}`;

  let texto = `🚚 *ORÇAMENTO TÉCNICO — PÁTIO CRM*\n`;
  texto += `📋 *Código:* ${orcamento.codigo} | *Placa:* ${placa}\n`;
  if (orcamento.adicional) {
    texto += `⚠️ *Escopo Adicional:* Detectado durante desmontagem/execução.\n`;
  }
  texto += `\n*ITENS PROPOSTOS:*\n`;

  orcamento.itens.forEach((it, idx) => {
    const tipoIcon = it.tipo === 'peca' ? '⚙️' : '🔧';
    const statusIcon = it.status === 'aprovado' ? '✅' : (it.status === 'recusado' ? '❌' : '⏳');
    texto += `${idx + 1}. ${tipoIcon} *${it.nome}* (${it.quantidade}x R$ ${it.valorUnitario.toFixed(2)}) = *R$ ${it.valorTotal.toFixed(2)}* ${statusIcon}\n`;
  });

  texto += `\n💵 *Subtotal Serviços:* R$ ${orcamento.subtotalServicos.toFixed(2)}\n`;
  texto += `📦 *Subtotal Peças:* R$ ${orcamento.subtotalPecas.toFixed(2)}\n`;
  if (orcamento.descontoGeral > 0) {
    texto += `🏷️ *Desconto:* -R$ ${orcamento.descontoGeral.toFixed(2)}\n`;
  }
  texto += `💰 *TOTAL GERAL:* *R$ ${orcamento.totalGeral.toFixed(2)}*\n`;
  if (orcamento.totalAprovado > 0 && orcamento.totalAprovado !== orcamento.totalGeral) {
    texto += `🟢 *TOTAL AUTORIZADO:* *R$ ${orcamento.totalAprovado.toFixed(2)}*\n`;
  }

  texto += `\n🔗 *Aprovação Digital com Fotos e Laudo Completo:*\n${urlLink}\n`;
  texto += `\nVocê pode aprovar ou recusar itens individualmente pelo link acima ou responder diretamente:\n`;
  texto += `👉 Digite *"APROVAR TUDO"* para autorizar o serviço completo.\n`;
  texto += `👉 Digite *"RECUSAR ORÇAMENTO"* caso queira declinar a proposta.\n`;

  return texto;
}

/**
 * Processa comandos textuais de orçamento via WhatsApp
 */
function processarComandoWhatsAppOrcamento({
  texto,
  fromNumber,
  state,
  tenantId = 'default',
  baseUrl = ''
}) {
  const t = String(texto || '').trim().toLowerCase();
  state.quotations = Array.isArray(state.quotations) ? state.quotations : [];

  // Localiza o orçamento mais recente em status 'enviado' para este tenant
  const pendente = state.quotations.find(q =>
    q.tenantId === tenantId && (q.status === 'enviado' || q.status === 'rascunho')
  );

  if (!pendente) {
    return {
      reconhecido: false,
      resposta: 'Não encontrei nenhum orçamento aguardando sua aprovação no momento.'
    };
  }

  // Gera token para consumo seguro
  const token = gerarTokenAprovacaoOrcamento({
    tenantId,
    quotationId: pendente.id,
    version: pendente.versao
  });

  if (/^(aprovar tudo|aprovo tudo|aprova tudo|aprovado|pode fazer|autorizado)$/i.test(t)) {
    const resAprov = processarAprovacaoCliente({
      tenantId,
      state,
      tokenString: token,
      aprovarTudo: true,
      canalAprovacao: 'whatsapp',
      actorId: fromNumber || 'cliente_whatsapp'
    });

    return {
      reconhecido: true,
      acao: 'aprovar_tudo',
      sucesso: resAprov.ok,
      resposta: `✅ *Orçamento ${pendente.codigo} APROVADO com sucesso!* Valor autorizado: R$ ${pendente.totalAprovado.toFixed(2)}. Nossa equipe foi notificada e já iniciou a separação e execução.`
    };
  }

  if (/^(recusar tudo|recuso tudo|recusar orcamento|recusado|nao autorizo|não autorizo)$/i.test(t)) {
    const resRecusa = processarAprovacaoCliente({
      tenantId,
      state,
      tokenString: token,
      recusarTudo: true,
      motivoRecusa: 'Recusado pelo cliente via WhatsApp',
      canalAprovacao: 'whatsapp',
      actorId: fromNumber || 'cliente_whatsapp'
    });

    return {
      reconhecido: true,
      acao: 'recusar_tudo',
      sucesso: resRecusa.ok,
      resposta: `❌ *Orçamento ${pendente.codigo} RECUSADO.* Registramos sua decisão no sistema. Nenhum serviço será executado sem sua prévia autorização.`
    };
  }

  return {
    reconhecido: false,
    resposta: null
  };
}

/**
 * Resumo estatístico de orçamentos do tenant para o painel operacional
 */
function obterResumoOrcamentos({ tenantId, state }) {
  if (!tenantId || !state) {
    return {
      pendentesAprovacao: 0,
      valorPendente: 0,
      aprovados: 0,
      valorAprovado: 0,
      recusados: 0,
      adicionaisPendentes: 0
    };
  }

  const list = (state.quotations || []).filter(q => q.tenantId === tenantId);
  const pendentes = list.filter(q => q.status === 'enviado');
  const aprovados = list.filter(q => q.status === 'aprovado' || q.status === 'parcialmente_aprovado');
  const recusados = list.filter(q => q.status === 'recusado');
  const adicionais = list.filter(q => q.adicional && q.status === 'enviado');

  return {
    pendentesAprovacao: pendentes.length,
    valorPendente: arredondar(pendentes.reduce((acc, q) => acc + (q.totalGeral || 0), 0)),
    aprovados: aprovados.length,
    valorAprovado: arredondar(aprovados.reduce((acc, q) => acc + (q.totalAprovado || 0), 0)),
    recusados: recusados.length,
    adicionaisPendentes: adicionais.length
  };
}

module.exports = {
  calcularTotais,
  criarOrcamento,
  obterOrcamento,
  listarOrcamentos,
  criarNovaVersao,
  criarAdicionalEscopo,
  enviarOrcamento,
  consultarPorToken,
  processarAprovacaoCliente,
  formatarMensagemWhatsAppOrcamento,
  processarComandoWhatsAppOrcamento,
  obterResumoOrcamentos
};
