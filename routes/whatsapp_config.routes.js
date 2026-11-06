const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const {
  getOrLoadState,
  mutateTenantState,
  extractTenantId,
  getTenantKey,
  requirePermission,
  authMiddleware,
  recordSecurityAudit
} = require('../lib/serverContext');
const {
  getWppClient,
  getWppStatus,
  obterGruposWhatsApp,
  fecharModaisWhatsAppWeb
} = require('../services/whatsapp/whatsappState');
const {
  sincronizarGruposAutomaticamente
} = require('../services/whatsapp/whatsappClient');
const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarImagemIndicadoresJPG,
  enviarRelatorioGrupo,
  enviarRelatorioAdministradores
} = require('../services/reportGenerationService');
const { executarCicloDisparoRelatorioDiario } = require('../services/whatsapp/whatsappScheduler');
const financialEngine = require('../services/financialEngine');

router.use((req, res, next) => {
  req.wppClient = getWppClient();
  req.wppStatus = getWppStatus();
  next();
});

const wppStatus = getWppStatus();
const wppClient = new Proxy({}, {
  get(target, prop) {
    const client = getWppClient();
    if (!client) return undefined;
    const val = client[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  }
});

router.get('/api/whatsapp/config-grupos', async (req, res) => {
  try {
    const targetState = (await getOrLoadState(req)) || {};
    const cfg = targetState.cfg || {};
    res.json({
      grupoAdminId: cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '',
      grupoOperacaoId: cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '',
      horaRelatorio: cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30',
      envioAutomatico: cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false',
      apenasDiasUteis: cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false',
      avisarCaixaWhatsapp: Boolean(cfg.avisarCaixaWhatsapp),
      responderApenasGrupos: cfg.responderApenasGrupos !== false,
      wppStatus: wppStatus.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/whatsapp/config-grupos', authMiddleware, async (req, res) => {
  try {
    const targetState = await getOrLoadState(req);
    if (!targetState) return res.status(404).json({ error: 'Tenant não encontrado.' });
    if (!targetState.cfg) targetState.cfg = {};
    const currentCfg = targetState.cfg || {};

    const { grupoAdminId, grupoOperacaoId, horaRelatorio, envioAutomatico, apenasDiasUteis, avisarCaixaWhatsapp, responderApenasGrupos } = req.body || {};

    const role = (req.securityContext?.role || '').toLowerCase();
    const isDono = ['dono', 'tenant_admin', 'owner', 'platform_admin', 'admin'].includes(role);

    // Restringe avisarCaixaWhatsapp ao perfil Dono/Owner se houver mutação de valor
    const mudouAvisarCaixa = avisarCaixaWhatsapp !== undefined && Boolean(avisarCaixaWhatsapp) !== Boolean(currentCfg.avisarCaixaWhatsapp);
    if (mudouAvisarCaixa && !isDono) {
      return res.status(403).json({
        error: 'Acesso negado: a alteração de aviso de caixa via WhatsApp é restrita ao perfil dono.'
      });
    }

    let cfgAtualizada = null;
    let auditChanges = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.cfg) draft.cfg = {};
      const changes = {};

      if (grupoAdminId !== undefined) {
        if (grupoAdminId === '120363428179962435@g.us' || grupoAdminId === '120363428840376088@g.us') {
          draft.cfg.grupoAdminId = '';
        } else {
          draft.cfg.grupoAdminId = grupoAdminId;
        }
        changes.grupoAdminId = draft.cfg.grupoAdminId;
      }
      if (grupoOperacaoId !== undefined) {
        draft.cfg.grupoOperacaoId = grupoOperacaoId;
        changes.grupoOperacaoId = draft.cfg.grupoOperacaoId;
      }
      if (horaRelatorio) {
        draft.cfg.horaRelatorioDiario = horaRelatorio;
        changes.horaRelatorioDiario = horaRelatorio;
      }
      if (typeof envioAutomatico === 'boolean') {
        draft.cfg.envioAutomaticoRelatorio = envioAutomatico;
        changes.envioAutomaticoRelatorio = envioAutomatico;
      }
      if (typeof apenasDiasUteis === 'boolean') {
        draft.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
        changes.relatorioApenasDiasUteis = apenasDiasUteis;
      }
      if (typeof avisarCaixaWhatsapp === 'boolean') {
        draft.cfg.avisarCaixaWhatsapp = avisarCaixaWhatsapp;
        changes.avisarCaixaWhatsapp = avisarCaixaWhatsapp;
      }
      if (typeof responderApenasGrupos === 'boolean') {
        draft.cfg.responderApenasGrupos = responderApenasGrupos;
        changes.responderApenasGrupos = responderApenasGrupos;
      }

      cfgAtualizada = draft.cfg;
      auditChanges = changes;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ error: mutateRes.error || 'Falha ao salvar configurações de grupo.' });
    }

    if (auditChanges && Object.keys(auditChanges).length > 0) {
      await recordSecurityAudit({
        tenantId: extractTenantId(req),
        actorId: req.securityContext?.actorId || 'unknown',
        actorType: 'user',
        action: 'whatsapp:config_update',
        entity: 'whatsapp_config',
        entityId: 'config-grupos',
        details: { changes: auditChanges, role }
      });
    }

    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    console.error('[API /api/whatsapp/config-grupos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/whatsapp/config-relatorio', async (req, res) => {
  try {
    const targetState = (await getOrLoadState(req)) || {};
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cfgAdmins = targetState.cfg?.adminFones || [];
    const adminFones = [...new Set([...envAdmins, ...cfgAdmins])];
    const cfg = targetState.cfg || {};
    const horaRelatorio = cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30';
    const envioAutomatico = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
    const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';
    const avisarCaixaWhatsapp = Boolean(cfg.avisarCaixaWhatsapp);
    const comandosFinanceirosEscrita = Boolean(cfg.comandosFinanceirosEscrita);
    const rawLimite = Number(cfg.limiteValorLancamentoWhatsapp);
    const limiteValorLancamentoWhatsapp = (!isNaN(rawLimite) && rawLimite > 0) ? rawLimite : 1000.00;

    res.json({
      adminFones,
      horaRelatorio,
      envioAutomatico,
      apenasDiasUteis,
      avisarCaixaWhatsapp,
      comandosFinanceirosEscrita,
      limiteValorLancamentoWhatsapp,
      wppStatus: wppStatus.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/whatsapp/config-relatorio', authMiddleware, async (req, res) => {
  try {
    const {
      adminFones,
      horaRelatorio,
      envioAutomatico,
      apenasDiasUteis,
      avisarCaixaWhatsapp,
      comandosFinanceirosEscrita,
      limiteValorLancamentoWhatsapp
    } = req.body || {};

    const targetState = (await getOrLoadState(req)) || {};
    const currentCfg = targetState.cfg || {};

    const role = (req.securityContext?.role || '').toLowerCase();
    const isDono = ['dono', 'tenant_admin', 'owner', 'platform_admin', 'admin'].includes(role);

    // Detecta mutação real comparando com a configuração atual
    const { isDeepStrictEqual } = require('node:util');
    const mudouEscrita = comandosFinanceirosEscrita !== undefined && Boolean(comandosFinanceirosEscrita) !== Boolean(currentCfg.comandosFinanceirosEscrita);
    const mudouAvisarCaixa = avisarCaixaWhatsapp !== undefined && Boolean(avisarCaixaWhatsapp) !== Boolean(currentCfg.avisarCaixaWhatsapp);
    const mudouLimite = limiteValorLancamentoWhatsapp !== undefined && Number(limiteValorLancamentoWhatsapp) !== Number(currentCfg.limiteValorLancamentoWhatsapp || 1000);
    const mudouAdminFones = adminFones !== undefined && !isDeepStrictEqual(adminFones, currentCfg.adminFones || []);

    const tentouModificarSensiveis = mudouEscrita || mudouAvisarCaixa || mudouLimite || mudouAdminFones;

    if (tentouModificarSensiveis && !isDono) {
      return res.status(403).json({
        error: 'Acesso negado: a alteração de permissões de escrita, limite financeiro, telefones admin e alertas de caixa via WhatsApp é restrita ao perfil dono.'
      });
    }

    let cfgAtualizada = null;
    let auditChanges = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.cfg) draft.cfg = {};
      const changes = {};

      if (Array.isArray(adminFones)) {
        draft.cfg.adminFones = adminFones;
        changes.adminFones = adminFones;
      }
      if (horaRelatorio) {
        draft.cfg.horaRelatorioDiario = horaRelatorio;
        changes.horaRelatorioDiario = horaRelatorio;
      }
      if (typeof envioAutomatico === 'boolean') {
        draft.cfg.envioAutomaticoRelatorio = envioAutomatico;
        changes.envioAutomaticoRelatorio = envioAutomatico;
      }
      if (typeof apenasDiasUteis === 'boolean') {
        draft.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
        changes.relatorioApenasDiasUteis = apenasDiasUteis;
      }
      if (typeof avisarCaixaWhatsapp === 'boolean') {
        draft.cfg.avisarCaixaWhatsapp = avisarCaixaWhatsapp;
        changes.avisarCaixaWhatsapp = avisarCaixaWhatsapp;
      }
      if (typeof comandosFinanceirosEscrita === 'boolean') {
        draft.cfg.comandosFinanceirosEscrita = comandosFinanceirosEscrita;
        changes.comandosFinanceirosEscrita = comandosFinanceirosEscrita;
      }

      if (limiteValorLancamentoWhatsapp !== undefined) {
        const limNum = Number(limiteValorLancamentoWhatsapp);
        draft.cfg.limiteValorLancamentoWhatsapp = (!isNaN(limNum) && limNum > 0) ? limNum : 1000.00;
        changes.limiteValorLancamentoWhatsapp = draft.cfg.limiteValorLancamentoWhatsapp;
      }

      cfgAtualizada = draft.cfg;
      auditChanges = changes;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ error: mutateRes.error || 'Falha ao salvar configuração de relatório.' });
    }

    if (auditChanges && Object.keys(auditChanges).length > 0) {
      await recordSecurityAudit({
        tenantId: extractTenantId(req),
        actorId: req.securityContext?.actorId || 'unknown',
        actorType: 'user',
        action: 'whatsapp:config_update',
        entity: 'whatsapp_config',
        entityId: 'config-relatorio',
        details: { changes: auditChanges, role }
      });
    }

    res.json({ success: true, cfg: cfgAtualizada });
  } catch (err) {
    console.error('[API /api/whatsapp/config-relatorio POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Upload e Leitura de Nota Fiscal ──────── */



module.exports = router;
