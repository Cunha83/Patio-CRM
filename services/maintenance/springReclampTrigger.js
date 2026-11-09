'use strict';

/**
 * Pátio CRM — Gatilho Operacional de Reaperto de Grampos de Mola (D+7 / 500 km)
 * Submódulo de Linha Pesada (< 200 linhas).
 */

const crypto = require('crypto');

function gerarId(prefix = 'opp') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizarData(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt.toISOString().slice(0, 10);
  const s = String(dt).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

function adicionarDias(dataISO, dias) {
  const d = new Date(dataISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [y, m, d] = dataISO.split('-');
  return `${d}/${m}/${y}`;
}

const REGEX_SUSPENSAO_MOLAS = /\b(mola|molas|feixe|feixes|grampo|grampos|espig[aã]o|balancim|balancins|arqueamento|embuchamento|suspens[aã]o)\b/i;

/**
 * Analisa os serviços, peças e queixa da OS para identificar se envolve molas/suspensão
 */
function identificarServicoSuspensaoMolas(os = {}) {
  const termos = new Set();

  const testarTexto = (txt) => {
    if (!txt || typeof txt !== 'string') return;
    const matches = txt.match(new RegExp(REGEX_SUSPENSAO_MOLAS.source, 'gi'));
    if (matches) {
      matches.forEach(m => termos.add(m.toLowerCase()));
    }
  };

  testarTexto(os.queixa);
  (os.servicos || []).forEach(s => testarTexto(s.nome || s.desc));
  (os.pecas || []).forEach(p => testarTexto(p.nome || p.desc));

  const termosEncontrados = Array.from(termos);
  return {
    requerReaperto: termosEncontrados.length > 0,
    termosEncontrados
  };
}

/**
 * Formata o texto de notificação de segurança do WhatsApp
 */
function formatarMensagemWhatsAppReaperto({
  osNum,
  placa,
  clienteNome = 'Amigo Motorista',
  dataReapertoISO,
  kmEstimado
}) {
  const dataFormatada = formatarDataBR(dataReapertoISO);
  const kmTexto = kmEstimado ? ` (aproximadamente ${kmEstimado.toLocaleString('pt-BR')} km)` : '';

  return (
`🚛 *Aviso de Segurança e Garantia — Pátio CRM*

Olá, *${clienteNome}*!

Informamos que o veículo *${placa}* realizou serviço de suspensão/feixe de molas na *OS #${osNum}*.

⚠️ *Atenção Importante:*
Para a sua total segurança na estrada e validade da garantia do serviço, é indispensável realizar o *reaperto dos grampos de mola* após rodar cerca de *500 km* ou até *${dataFormatada}*${kmTexto}.

O assentamento inicial das lâminas de mola é natural e o reaperto evita a quebra do pino de centro.

✅ O serviço de conferência e reaperto é *100% gratuito*.
⏱️ Tempo estimado no pátio: *20 minutos*.

Aguardamos você para garantir sua viagem segura!
_Pátio CRM — Gestão de Oficina Pesada_`
  );
}

/**
 * Gera a oportunidade preventiva de reaperto gratuito no CRM e esteira de pós-venda
 */
function gerarGatilhoReapertoGrampos({
  os,
  state,
  tenantId = 'default',
  dataReferencia = null,
  actorId = 'sistema'
}) {
  if (!os || !state) return { ok: false, error: 'OS e estado são obrigatórios' };

  if (os.st !== 'finalizada') {
    return { ok: true, gerado: false, motivo: 'os_nao_finalizada' };
  }

  const analise = identificarServicoSuspensaoMolas(os);
  if (!analise.requerReaperto) {
    return { ok: true, gerado: false, motivo: 'servico_sem_reaperto' };
  }

  if (!Array.isArray(state.opportunities)) state.opportunities = [];
  if (!Array.isArray(state.afterSales)) state.afterSales = [];
  if (!Array.isArray(state.auditoria)) state.auditoria = [];

  // Idempotência: não duplica se já agendado para esta OS
  const jaExiste = state.opportunities.find(o =>
    o.origemOSId === os.id && o.tipo === 'reaperto_preventivo_grampos'
  );
  if (jaExiste) {
    return { ok: true, gerado: false, motivo: 'ja_agendado', oportunidade: jaExiste };
  }

  const veiculo = (state.veiculos || []).find(v => v.id === os.vei || v.placa === os.placa);
  const cliente = (state.clientes || []).find(c => c.id === os.cli);

  const dataFechamento = normalizarData(os.fechamento || os.concluidaEm || os.abertura || dataReferencia) || new Date().toISOString().slice(0, 10);
  const dataPrevista = adicionarDias(dataFechamento, 7);

  const kmAtual = Number(veiculo?.km || os.km || 0);
  const kmEstimado = kmAtual > 0 ? kmAtual + 500 : 500;
  const placa = os.conjunto?.cavalo?.placa || os.placa || veiculo?.placa || 'SEM-PLACA';
  const clienteNome = cliente?.nome || cliente?.fantasia || 'Cliente';

  const oportunidade = {
    id: gerarId('opp'),
    tenantId,
    tipo: 'reaperto_preventivo_grampos',
    origemOSId: os.id,
    origemOSNum: os.num,
    vehicleId: os.vei || veiculo?.id || null,
    placa,
    clienteId: os.cli || cliente?.id || null,
    clienteNome,
    titulo: `Reaperto Preventivo Gratuito de Grampos (500 km / 7d) - Placa ${placa}`,
    descricao: `Reaperto obrigatório de garantia após manutenção no feixe de molas/suspensão na OS #${os.num}.`,
    dataPrevista,
    kmEstimado,
    gratuito: true,
    valorEstimado: 0.00,
    status: 'agendada',
    termosIdentificados: analise.termosEncontrados,
    criadoEm: new Date().toISOString()
  };

  state.opportunities.unshift(oportunidade);

  const mensagemWhatsApp = formatarMensagemWhatsAppReaperto({
    osNum: os.num,
    placa,
    clienteNome,
    dataReapertoISO: dataPrevista,
    kmEstimado
  });

  state.auditoria.unshift({
    id: gerarId('aud'),
    timestamp: new Date().toISOString(),
    tenantId,
    actorId,
    intencao: 'agendamento_reaperto_grampos',
    resumo: `Gatilho de reaperto preventivo gratuito agendado para OS #${os.num} (Placa ${placa}) em ${formatarDataBR(dataPrevista)}.`,
    osId: os.id
  });

  return {
    ok: true,
    gerado: true,
    oportunidade,
    mensagemWhatsApp
  };
}

/**
 * Varre as OSs finalizadas do tenant e gera agendamentos pendentes
 */
function avaliarReapertosPreventivos({ state, tenantId, dataReferencia = null }) {
  if (!state) return { processadas: 0, reapertosGerados: 0 };

  const ordens = (state.os || []).filter(o => {
    if (tenantId && o.tenantId && o.tenantId !== tenantId) return false;
    return o.st === 'finalizada';
  });

  let gerados = 0;
  for (const os of ordens) {
    const res = gerarGatilhoReapertoGrampos({ os, state, tenantId, dataReferencia });
    if (res.gerado) gerados++;
  }

  return {
    processadas: ordens.length,
    reapertosGerados: gerados
  };
}

module.exports = {
  identificarServicoSuspensaoMolas,
  formatarMensagemWhatsAppReaperto,
  gerarGatilhoReapertoGrampos,
  avaliarReapertosPreventivos
};

