'use strict';

const { get, run, transaction } = require('../../db');
const { getFiscalConfig } = require('./fiscalConfigService');

/**
 * Alocação atômica e exclusiva de numeração fiscal por série, modelo e ambiente.
 */
async function alocarProximoNumeroFiscal({ tenantId, modelo = '55', serie = '1', ambiente = 'homologacao' }) {
  if (!tenantId) throw new Error('TenantId é obrigatório para alocar número fiscal.');

  const mod = String(modelo).trim();
  const ser = String(serie).trim();
  const amb = String(ambiente).trim().toLowerCase();

  return await transaction(async (tx) => {
    // 1. Busca registro na tabela de controle de numeração
    let row = await tx.get(
      'SELECT * FROM fiscal_numbering_ledger WHERE tenant_id = ? AND modelo = ? AND serie = ? AND ambiente = ?',
      [tenantId, mod, ser, amb]
    );

    let proximoNumero = 1;

    if (!row) {
      // Se não existe registro no ledger, busca o ponto de partida configurado na empresa
      const config = await getFiscalConfig(tenantId);
      let inicio = 1;
      if (mod === '55' && config.nfeProximoNumero) inicio = config.nfeProximoNumero;
      else if (mod === 'NFS-e' && config.nfseProximoNumero) inicio = config.nfseProximoNumero;
      else if (mod === '65' && config.nfceProximoNumero) inicio = config.nfceProximoNumero;

      proximoNumero = Math.max(1, inicio);
      const ledgerId = `ledg_${tenantId}_${mod}_${ser}_${amb}`;

      await tx.run(
        `INSERT INTO fiscal_numbering_ledger (id, tenant_id, modelo, serie, ambiente, ultimo_numero, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ledgerId, tenantId, mod, ser, amb, proximoNumero, new Date().toISOString()]
      );
    } else {
      proximoNumero = Number(row.ultimo_numero) + 1;
      if (proximoNumero > 999999999) throw new Error('Série esgotada.');
      await tx.run(
        `UPDATE fiscal_numbering_ledger 
         SET ultimo_numero = ?, updated_at = ?
         WHERE tenant_id = ? AND modelo = ? AND serie = ? AND ambiente = ?`,
        [proximoNumero, new Date().toISOString(), tenantId, mod, ser, amb]
      );
    }

    return {
      tenantId,
      modelo: mod,
      serie: ser,
      ambiente: amb,
      numero: proximoNumero
    };
  });
}

/**
 * Consulta o próximo número da fila sem incrementar.
 */
async function consultarProximoNumero({ tenantId, modelo = '55', serie = '1', ambiente = 'homologacao' }) {
  if (!tenantId) return 1;
  const mod = String(modelo).trim();
  const ser = String(serie).trim();
  const amb = String(ambiente).trim().toLowerCase();

  const row = await get(
    'SELECT ultimo_numero FROM fiscal_numbering_ledger WHERE tenant_id = ? AND modelo = ? AND serie = ? AND ambiente = ?',
    [tenantId, mod, ser, amb]
  );

  if (row && row.ultimo_numero !== undefined) {
    return Number(row.ultimo_numero) + 1;
  }

  const config = await getFiscalConfig(tenantId);
  if (mod === '55' && config.nfeProximoNumero) return config.nfeProximoNumero;
  if (mod === 'NFS-e' && config.nfseProximoNumero) return config.nfseProximoNumero;
  if (mod === '65' && config.nfceProximoNumero) return config.nfceProximoNumero;

  return 1;
}

/**
 * Calibra manualmente o último número emitido (ex: sincronização inicial pós-migração de ERP)
 */
async function calibrarUltimoNumero({ tenantId, modelo = '55', serie = '1', ambiente = 'homologacao', ultimoNumero = 0 }) {
  if (!tenantId) throw new Error('TenantId é obrigatório.');
  const mod = String(modelo).trim();
  const ser = String(serie).trim();
  const amb = String(ambiente).trim().toLowerCase();
  const ult = Number(ultimoNumero);
  if (!Number.isSafeInteger(ult) || ult < 0 || ult > 999999998) throw new Error('Último número inválido.');

  return await transaction(async (tx) => {
    const ledgerId = `ledg_${tenantId}_${mod}_${ser}_${amb}`;
    await tx.run(
      `INSERT INTO fiscal_numbering_ledger (id, tenant_id, modelo, serie, ambiente, ultimo_numero, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, modelo, serie, ambiente) DO UPDATE SET
         ultimo_numero = MAX(fiscal_numbering_ledger.ultimo_numero, excluded.ultimo_numero),
         updated_at = excluded.updated_at`,
      [ledgerId, tenantId, mod, ser, amb, ult, new Date().toISOString()]
    );
    const saved = await tx.get('SELECT ultimo_numero FROM fiscal_numbering_ledger WHERE tenant_id=? AND modelo=? AND serie=? AND ambiente=?',[tenantId,mod,ser,amb]);
    return { ok: true, tenantId, modelo: mod, serie: ser, ambiente: amb, ultimoNumero: saved.ultimo_numero };
  });
}

module.exports = {
  alocarProximoNumeroFiscal,
  consultarProximoNumero,
  calibrarUltimoNumero
};
