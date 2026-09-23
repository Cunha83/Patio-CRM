'use strict';

/**
 * PÁTIO CRM — SERVIÇO DE RESPOSTA A INCIDENTES DE SEGURANÇA (LGPD)
 * Gerencia o registro, triagem de severidade, protocolo de contenção
 * e registro de comunicação à ANPD e controladores conforme o Art. 48 da LGPD.
 */

const crypto = require('crypto');
const { run, all, get } = require('../db');

const SEVERIDADES = {
  BAIXA: {
    nivel: 1,
    descricao: 'Incidente sem vazamento de dados ou indisponibilidade pontual mitigada.',
    prazoNotificacaoHoras: null
  },
  MEDIA: {
    nivel: 2,
    descricao: 'Acesso suspeito contido sem evidência de exfiltração de dados pessoais.',
    prazoNotificacaoHoras: 72
  },
  ALTA: {
    nivel: 3,
    descricao: 'Potencial vazamento ou acesso indevido a dados de clientes ou colaboradores.',
    prazoNotificacaoHoras: 48
  },
  CRITICA: {
    nivel: 4,
    descricao: 'Vazamento confirmado de dados pessoais com risco aos titulares (notificação obrigatória à ANPD).',
    prazoNotificacaoHoras: 24
  }
};

async function registrarIncidente({
  tenantId = '_platform_',
  tipo = 'tentativa_intrusao',
  severidade = 'BAIXA',
  descricao,
  dadosAfetados = [],
  medidasTomadas = '',
  atorId = 'sistema'
}) {
  if (!descricao) throw new Error('A descrição do incidente é obrigatória.');

  const sevConfig = SEVERIDADES[severidade] || SEVERIDADES.BAIXA;
  const incidentId = `inc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const detalhamento = {
    incidentId,
    tipo,
    severidade,
    descricao,
    dadosAfetados: Array.isArray(dadosAfetados) ? dadosAfetados : [dadosAfetados],
    medidasTomadas,
    prazoNotificacaoHoras: sevConfig.prazoNotificacaoHoras,
    notificacaoANPDObrigatoria: severidade === 'CRITICA' || severidade === 'ALTA',
    status: 'investigando',
    registradoPor: atorId,
    criadoEm: now
  };

  try {
    await run(`INSERT INTO security_audit_log (
      id, tenant_id, actor_id, actor_type, action, entity, entity_id, ip_address, details_json, created_at
    ) VALUES (?, ?, ?, 'incident_response', 'SECURITY_INCIDENT_REPORTED', 'incident', ?, '', ?, ?)`, [
      incidentId,
      tenantId,
      atorId,
      incidentId,
      JSON.stringify(detalhamento),
      now
    ]);
  } catch (err) {
    console.error('[IncidentResponse] Erro ao gravar log de incidente:', err.message);
  }

  return {
    ok: true,
    incidentId,
    severidade,
    notificacaoANPDObrigatoria: detalhamento.notificacaoANPDObrigatoria,
    detalhamento
  };
}

async function listarIncidentes({ tenantId = null, limit = 20 } = {}) {
  try {
    let sql = 'SELECT * FROM security_audit_log WHERE action LIKE "SECURITY_INCIDENT_%"';
    const params = [];
    if (tenantId && tenantId !== '_all_') {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await all(sql, params);
    return (rows || []).map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      action: r.action,
      criadoEm: r.created_at,
      detalhes: r.details_json ? JSON.parse(r.details_json) : {}
    }));
  } catch (_) {
    return [];
  }
}

module.exports = {
  registrarIncidente,
  listarIncidentes,
  SEVERIDADES
};
