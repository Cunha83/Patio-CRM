const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  persistTenantState,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getAiClient
} = require('../lib/serverContext');
const { salvarUpload, removerUpload } = require('../lib/file-storage');
const lgpdService = require('../services/lgpdService');
const demoDataService = require('../services/demoDataService');
const operationalSummaryService = require('../services/operationalSummaryService');
const financialEngine = require('../services/financialEngine');

const limiterUploads = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Limite de uploads temporariamente excedido.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.get('/api/configuracoes/assistente', requirePermission('assistant:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const raw = state.cfg?.assistente || state.cfg?.assistant || {};
    const cfg = {
      displayName: raw.displayName || 'Verônica',
      voiceGender: raw.voiceGender || 'female',
      voiceURI: raw.voiceURI || '',
      voiceName: raw.voiceName || '',
      pitch: (typeof raw.pitch === 'number' && Number.isFinite(raw.pitch)) ? raw.pitch : 1.0,
      rate: (typeof raw.rate === 'number' && Number.isFinite(raw.rate)) ? raw.rate : 1.0,
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
      briefingDiarioAtivo: raw.briefingDiarioAtivo !== undefined ? Boolean(raw.briefingDiarioAtivo) : false,
      briefingDiarioHorario: raw.briefingDiarioHorario || '07:30',
      briefingDiarioDias: Array.isArray(raw.briefingDiarioDias) ? raw.briefingDiarioDias : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      briefingSemanalAtivo: raw.briefingSemanalAtivo !== undefined ? Boolean(raw.briefingSemanalAtivo) : false,
      briefingSemanalDia: raw.briefingSemanalDia || 'segunda',
      briefingSemanalHorario: raw.briefingSemanalHorario || '08:00',
      briefingDestinatarios: raw.briefingDestinatarios || 'gestores',
      alertasProativosAtivos: raw.alertasProativosAtivos !== undefined ? Boolean(raw.alertasProativosAtivos) : true,
      alertaOrcamentoParadoAtivo: raw.alertaOrcamentoParadoAtivo !== undefined ? Boolean(raw.alertaOrcamentoParadoAtivo) : true,
      slaOrcamentoParadoHoras: (typeof raw.slaOrcamentoParadoHoras === 'number' && Number.isFinite(raw.slaOrcamentoParadoHoras) && raw.slaOrcamentoParadoHoras > 0) ? raw.slaOrcamentoParadoHoras : 4,
      alertaGargaloBoxAtivo: raw.alertaGargaloBoxAtivo !== undefined ? Boolean(raw.alertaGargaloBoxAtivo) : true,
      slaGargaloBoxHoras: (typeof raw.slaGargaloBoxHoras === 'number' && Number.isFinite(raw.slaGargaloBoxHoras) && raw.slaGargaloBoxHoras > 0) ? raw.slaGargaloBoxHoras : 6,
      cooldownAlertasMinutos: (typeof raw.cooldownAlertasMinutos === 'number' && Number.isFinite(raw.cooldownAlertasMinutos) && raw.cooldownAlertasMinutos > 0) ? raw.cooldownAlertasMinutos : 240
    };
    res.json({ success: true, assistente: cfg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/api/configuracoes/assistente', requirePermission('assistant:settings', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const {
      displayName,
      voiceGender,
      enabled,
      voiceURI,
      voiceName,
      pitch,
      rate,
      briefingDiarioAtivo,
      briefingDiarioHorario,
      briefingDiarioDias,
      briefingSemanalAtivo,
      briefingSemanalDia,
      briefingSemanalHorario,
      briefingDestinatarios,
      alertasProativosAtivos,
      alertaOrcamentoParadoAtivo,
      slaOrcamentoParadoHoras,
      alertaGargaloBoxAtivo,
      slaGargaloBoxHoras,
      cooldownAlertasMinutos
    } = req.body || {};

    if (!state.cfg) state.cfg = {};
    if (!state.cfg.assistente) {
      state.cfg.assistente = {
        displayName: 'Verônica',
        voiceGender: 'female',
        voiceURI: '',
        voiceName: '',
        pitch: 1.0,
        rate: 1.0,
        enabled: true,
        briefingDiarioAtivo: false,
        briefingDiarioHorario: '07:30',
        briefingDiarioDias: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        briefingSemanalAtivo: false,
        briefingSemanalDia: 'segunda',
        briefingSemanalHorario: '08:00',
        briefingDestinatarios: 'gestores',
        alertasProativosAtivos: true,
        alertaOrcamentoParadoAtivo: true,
        slaOrcamentoParadoHoras: 4,
        alertaGargaloBoxAtivo: true,
        slaGargaloBoxHoras: 6,
        cooldownAlertasMinutos: 240
      };
    }

    if (displayName !== undefined && String(displayName).trim().length >= 2) {
      state.cfg.assistente.displayName = String(displayName).trim();
    }
    if (voiceGender !== undefined) {
      const g = String(voiceGender).toLowerCase().trim();
      state.cfg.assistente.voiceGender = (g === 'male' || g === 'masculina') ? 'male' : 'female';
    }
    if (voiceURI !== undefined) {
      state.cfg.assistente.voiceURI = String(voiceURI || '').trim();
    }
    if (voiceName !== undefined) {
      state.cfg.assistente.voiceName = String(voiceName || '').trim();
    }
    if (pitch !== undefined && pitch !== null && Number.isFinite(Number(pitch))) {
      state.cfg.assistente.pitch = Math.max(0.5, Math.min(2.0, Number(pitch)));
    }
    if (rate !== undefined && rate !== null && Number.isFinite(Number(rate))) {
      state.cfg.assistente.rate = Math.max(0.5, Math.min(2.0, Number(rate)));
    }
    if (enabled !== undefined) {
      state.cfg.assistente.enabled = Boolean(enabled);
    }
    if (briefingDiarioAtivo !== undefined) {
      state.cfg.assistente.briefingDiarioAtivo = Boolean(briefingDiarioAtivo);
    }
    if (briefingDiarioHorario !== undefined && typeof briefingDiarioHorario === 'string') {
      const h = briefingDiarioHorario.trim();
      if (/^\d{2}:\d{2}$/.test(h)) state.cfg.assistente.briefingDiarioHorario = h;
    }
    if (briefingDiarioDias !== undefined && Array.isArray(briefingDiarioDias)) {
      state.cfg.assistente.briefingDiarioDias = briefingDiarioDias.map(String);
    }
    if (briefingSemanalAtivo !== undefined) {
      state.cfg.assistente.briefingSemanalAtivo = Boolean(briefingSemanalAtivo);
    }
    if (briefingSemanalDia !== undefined && typeof briefingSemanalDia === 'string') {
      state.cfg.assistente.briefingSemanalDia = briefingSemanalDia.trim();
    }
    if (briefingSemanalHorario !== undefined && typeof briefingSemanalHorario === 'string') {
      const h = briefingSemanalHorario.trim();
      if (/^\d{2}:\d{2}$/.test(h)) state.cfg.assistente.briefingSemanalHorario = h;
    }
    if (briefingDestinatarios !== undefined && typeof briefingDestinatarios === 'string') {
      state.cfg.assistente.briefingDestinatarios = briefingDestinatarios.trim();
    }
    if (alertasProativosAtivos !== undefined) {
      state.cfg.assistente.alertasProativosAtivos = Boolean(alertasProativosAtivos);
    }
    if (alertaOrcamentoParadoAtivo !== undefined) {
      state.cfg.assistente.alertaOrcamentoParadoAtivo = Boolean(alertaOrcamentoParadoAtivo);
    }
    if (slaOrcamentoParadoHoras !== undefined && slaOrcamentoParadoHoras !== null && Number.isFinite(Number(slaOrcamentoParadoHoras))) {
      state.cfg.assistente.slaOrcamentoParadoHoras = Math.max(1, Number(slaOrcamentoParadoHoras));
    }
    if (alertaGargaloBoxAtivo !== undefined) {
      state.cfg.assistente.alertaGargaloBoxAtivo = Boolean(alertaGargaloBoxAtivo);
    }
    if (slaGargaloBoxHoras !== undefined && slaGargaloBoxHoras !== null && Number.isFinite(Number(slaGargaloBoxHoras))) {
      state.cfg.assistente.slaGargaloBoxHoras = Math.max(1, Number(slaGargaloBoxHoras));
    }
    if (cooldownAlertasMinutos !== undefined && cooldownAlertasMinutos !== null && Number.isFinite(Number(cooldownAlertasMinutos))) {
      state.cfg.assistente.cooldownAlertasMinutos = Math.max(1, Number(cooldownAlertasMinutos));
    }

    const saveRes = await persistTenantState(req, state);
    if (!saveRes || !saveRes.ok) {
      return res.status(saveRes?.status || 500).json({ success: false, error: saveRes?.error || 'Falha ao salvar configurações do assistente.' });
    }
    res.json({ success: true, assistente: state.cfg.assistente });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── BRIEFING EXECUTIVO GERENCIAL DO ASSISTENTE ────────────────────────
async function gerarBriefingExecutivo(req, state) {
  const tenantId = extractTenantId(req);
  const dataHoje = new Date().toISOString().slice(0, 10);

  // 1. Resumo Operacional do Pátio
  const resumoOp = operationalSummaryService.gerarResumoOperacional({
    tenantId,
    state,
    dataReferencia: dataHoje
  });

  // 2. Resumo Financeiro (KPIs e fluxo)
  const kpisFin = financialEngine.calcularKPIsFinanceiros(state, {
    filtro: 'hoje',
    dataRef: dataHoje
  });

  const patio = {
    veiculosNoPatio: resumoOp.veiculosPatio ?? (Array.isArray(state.os) ? state.os.filter(o => o.st !== 'finalizada').length : 0),
    boxesOcupados: resumoOp.boxes?.ocupados ?? 0,
    boxesLivres: resumoOp.boxes?.livres ?? 0,
    totalBoxes: resumoOp.boxes?.total ?? 0,
    taxaOcupacaoPercentual: resumoOp.metricas?.taxaOcupacaoBoxesPercentual ?? 0,
    estagios: resumoOp.estagios || {},
    entregas: resumoOp.entregas || { hoje: 0, emRisco: 0, atrasadas: 0 },
    maiorGargalo: resumoOp.maiorGargalo || null
  };

  const financeiro = {
    saldoConsolidado: kpisFin.saldoConsolidado ?? 0,
    vencimentosHoje: {
      aReceber: kpisFin.totalRecHoje ?? 0,
      qtdReceber: kpisFin.qtdRecHoje ?? 0,
      aPagar: kpisFin.totalPagHoje ?? 0,
      qtdPagar: kpisFin.qtdPagHoje ?? 0,
      liquido: kpisFin.liquidoHoje ?? 0
    },
    vencimentosSemana: {
      aReceber: kpisFin.totRec7d ?? 0,
      aPagar: kpisFin.totPag7d ?? 0,
      saldoPrevisto: kpisFin.saldoPrevisto7d ?? 0
    },
    inadimplencia: {
      totalVencidos: kpisFin.totalRecVencidos ?? 0,
      qtdVencidos: kpisFin.qtdRecVencidos ?? 0
    },
    totalReceberAberto: kpisFin.totalReceberAberto ?? 0,
    totalPagarAberto: kpisFin.totalPagarAberto ?? 0
  };

  const empresa = state.cfg?.empresa || 'Auto Molas Fort';
  const agoraFormatada = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let textoFormatado = `📊 *BRIEFING GERENCIAL EXECUTIVO — PÁTIO CRM*\n`;
  textoFormatado += `📅 *Gerado em:* ${agoraFormatada}\n`;
  textoFormatado += `🏢 *Empresa:* ${empresa}\n\n`;

  textoFormatado += `════════════════════════════\n`;
  textoFormatado += `💰 *1. POSIÇÃO FINANCEIRA*\n`;
  textoFormatado += `════════════════════════════\n`;
  textoFormatado += `💵 *Saldo em Caixa:* R$ ${Number(financeiro.saldoConsolidado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  textoFormatado += `🟢 *A Receber Hoje:* R$ ${Number(financeiro.vencimentosHoje.aReceber).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${financeiro.vencimentosHoje.qtdReceber} títulos)\n`;
  textoFormatado += `🔴 *A Pagar Hoje:* R$ ${Number(financeiro.vencimentosHoje.aPagar).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${financeiro.vencimentosHoje.qtdPagar} contas)\n`;
  textoFormatado += `⚖️ *Resultado Líquido do Dia:* R$ ${Number(financeiro.vencimentosHoje.liquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
  textoFormatado += `🗓️ *Previsão 7 Dias:* R$ ${Number(financeiro.vencimentosSemana.saldoPrevisto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Rec: R$ ${Number(financeiro.vencimentosSemana.aReceber).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / Pag: R$ ${Number(financeiro.vencimentosSemana.aPagar).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
  if (financeiro.inadimplencia.qtdVencidos > 0) {
    textoFormatado += `⚠️ *Atenção Cobrança:* ${financeiro.inadimplencia.qtdVencidos} título(s) vencido(s) (R$ ${Number(financeiro.inadimplencia.totalVencidos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
  }

  textoFormatado += `\n════════════════════════════\n`;
  textoFormatado += `🚛 *2. OPERAÇÃO & PÁTIO*\n`;
  textoFormatado += `════════════════════════════\n`;
  textoFormatado += `🚚 *Veículos no Pátio:* ${patio.veiculosNoPatio}\n`;
  textoFormatado += `🔧 *Ocupação de Boxes:* ${patio.boxesOcupados} de ${patio.totalBoxes} (${patio.taxaOcupacaoPercentual}%)\n`;
  textoFormatado += `📋 *Estágios Ativos:* Fila (${patio.estagios.fila || 0}) | Diagnóstico (${patio.estagios.diagnostico || 0}) | Aprovação (${patio.estagios.aprovacao || 0}) | Execução (${patio.estagios.executando || 0}) | Aguardando Peça (${patio.estagios.peca || 0}) | Prontos (${patio.estagios.pronto || 0})\n`;
  textoFormatado += `📦 *Entregas Hoje:* ${patio.entregas.hoje} previstas | ${patio.entregas.emRisco} em risco | ${patio.entregas.atrasadas} atrasadas\n`;
  if (patio.maiorGargalo) {
    textoFormatado += `⚠️ *Gargalo Identificado:* ${patio.maiorGargalo.descricao || patio.maiorGargalo.tipo}\n`;
  }

  return {
    patio,
    financeiro,
    textoFormatado,
    geradoEm: new Date().toISOString()
  };
}

router.get('/api/assistente/briefing', requirePermission('financial:read', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const briefing = await gerarBriefingExecutivo(req, state);
    res.json({ success: true, briefing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/assistente/briefing/gerar', requirePermission('financial:read', 'admin:settings'), async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const briefing = await gerarBriefingExecutivo(req, state);
    res.json({ success: true, briefing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Rotas Públicas de Aprovação Digital do Cliente (Sem login, via Token HMAC) ── */


module.exports = router;
