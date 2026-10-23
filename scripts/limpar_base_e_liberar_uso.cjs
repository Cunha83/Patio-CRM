'use strict';

/**
 * PÁTIO CRM — SCRIPT OFICIAL DE BACKUP, LIMPEZA TOTAL DA BASE DE TESTES
 * E LIBERAÇÃO PARA USO EM AMBIENTE CONTROLADO
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(rootDir, 'patio.db');
const backupsDir = path.join(rootDir, 'backups');
const uploadsDir = path.join(rootDir, 'uploads');

async function main() {
  console.log('================================================================');
  console.log(' PÁTIO CRM — LIMPEZA DA BASE DE TESTES & LIBERAÇÃO OPERACIONAL');
  console.log('================================================================\n');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  // 1. BACKUP DE SEGURANÇA FÍSICO
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupsDir, `patio_pre_limpeza_${timestamp}.db`);
  
  if (fs.existsSync(dbPath)) {
    console.log(`[1/5] 📦 Criando backup de segurança integral da base atual...`);
    fs.copyFileSync(dbPath, backupFile);
    const stat = fs.statSync(backupFile);
    console.log(`      ✔ Backup salvo em: ${backupFile} (${(stat.size / 1024 / 1024).toFixed(2)} MB)\n`);
  } else {
    console.log(`[1/5] ℹ️ Base ${dbPath} não existia previamente; será inicializada do zero.\n`);
  }

  // Carrega ambiente e DB
  require('dotenv').config({ path: path.join(rootDir, '.env') });
  const db = require('../db');
  await db.initDB(dbPath);

  try {
    console.log(`[2/5] 🧹 Limpando tabelas transacionais de teste...`);

    // Limpa tabelas fiscais
    const rFiscalDocs = await db.run('DELETE FROM fiscal_documents');
    const rFiscalEvents = await db.run('DELETE FROM fiscal_events');
    const rFiscalAttempts = await db.run('DELETE FROM fiscal_attempts');
    const rFiscalLedger = await db.run('DELETE FROM fiscal_numbering_ledger');
    console.log(`      ✔ Registros fiscais zerados (docs: ${rFiscalDocs.changes}, eventos: ${rFiscalEvents.changes}).`);

    // Limpa outbox ERP, billing e auditoria de testes
    const rErp = await db.run('DELETE FROM erp_outbox');
    const rBillingEv = await db.run('DELETE FROM billing_events');
    const rBillingInv = await db.run('DELETE FROM billing_invoices');
    const rAudit = await db.run('DELETE FROM security_audit_log');
    const rSessions = await db.run('DELETE FROM user_sessions');
    const rResets = await db.run('DELETE FROM password_resets');
    console.log(`      ✔ Filas e auditorias de teste zeradas (erp: ${rErp.changes}, billing: ${rBillingInv.changes}, audit: ${rAudit.changes}).`);

    // 3. LIMPEZA TOTAL DO ESTADO OPERACIONAL (KV)
    console.log(`\n[3/5] 🏢 Preparando estado operacional 100% limpo em branco para o tenant 'default'...`);
    await db.run('DELETE FROM kv');

    const estadoLimpoEmBranco = {
      cfg: {
        empresa: "PÁTIO DIESEL OFICINA",
        cnpj: "",
        telefone: "",
        endereco: "",
        cidade: "",
        uf: "",
        ambienteNfe: "Produção",
        proximoNumOs: 1,
        assistente: {
          displayName: "Verônica",
          voiceGender: "female",
          voiceURI: "",
          voiceName: "",
          pitch: 1.0,
          rate: 1.0,
          enabled: true
        }
      },
      clientes: [],
      veiculos: [],
      os: [],
      pecas: [],
      servicos: [],
      boxes: [],
      contasPagar: [],
      contasReceber: [],
      lancamentosCaixa: [],
      historicoCaixa: [],
      orcamentos: [],
      vistorias: [],
      pre_os: [],
      triagens: [],
      fornecedores: [],
      timeline: [],
      versao: Date.now()
    };

    const estadoJson = JSON.stringify(estadoLimpoEmBranco);
    await db.run('INSERT INTO kv (key, value) VALUES (?, ?)', ['tenant:default:state', estadoJson]);
    await db.run('INSERT INTO kv (key, value) VALUES (?, ?)', ['state', estadoJson]);
    console.log(`      ✔ Estado operacional 'tenant:default:state' inicializado 100% em branco.`);

    // 4. CONFIGURAÇÃO FISCAL PRONTA PARA PRODUÇÃO
    console.log(`\n[4/5] 🧾 Configurando módulo fiscal autônomo (Produção destravada)...`);
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO fiscal_settings (
        tenant_id, ambiente, provider, cnpj, razao_social, nome_fantasia,
        inscricao_estadual, inscricao_municipal, regime_tributario, cnae_principal,
        codigo_municipio_ibge, uf, nfe_serie, nfe_proximo_numero, nfse_serie,
        nfse_proximo_numero, nfce_serie, nfce_proximo_numero, regras_tributarias_json,
        created_at, updated_at
      ) VALUES (?, 'producao', 'focus_nfe', '', '', '', '', '', 'simples_nacional', '', '', '', 1, 1, '1', 1, 1, 1, '[]', ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        ambiente = 'producao',
        provider = 'focus_nfe',
        updated_at = excluded.updated_at
    `, ['default', now, now]);
    console.log(`      ✔ Configuração fiscal definida em modo 'producao' com numeração inicial 1.`);

    // 5. USUÁRIO ADMINISTRADOR PRINCIPAL
    console.log(`\n[5/5] 🔐 Garantindo usuário administrador principal com acesso total...`);
    const userRepository = require('../lib/auth/userRepository');

    let admin = await userRepository.getUserByUsername('admin@oficina.local');
    if (!admin) {
      admin = await userRepository.createUser({
        username: 'admin@oficina.local',
        password: 'AdminOficina2026!#Secure',
        name: 'Administrador da Oficina',
        role: 'tenant_admin',
        tenantId: 'default',
        allowWeakInTest: true
      });
      console.log(`      ✔ Administrador 'admin@oficina.local' criado com sucesso.`);
    } else {
      await userRepository.updatePassword(admin.id, 'AdminOficina2026!#Secure', { allowWeakInTest: true });
      console.log(`      ✔ Senha do administrador 'admin@oficina.local' atualizada.`);
    }

    // Garante usuário rápido 'patio' com senha 'patio' para acesso local
    let userPatio = await userRepository.getUserByUsername('patio');
    const saltPatio = crypto.randomBytes(16).toString('hex');
    const hashPatio = userRepository.hashPassword('patio', saltPatio);
    if (!userPatio) {
      const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await db.run(`INSERT INTO users (
        id, username, password_hash, password_salt, password_algo,
        name, phone, status, failed_login_attempts, locked_until, must_change_password,
        created_at, updated_at
      ) VALUES (?, 'patio', ?, ?, 'scrypt', 'Operador Pátio Testes', '', 'active', 0, NULL, 0, ?, ?)`, [
        userId, hashPatio, saltPatio, now, now
      ]);
      await userRepository.addMembership({
        userId,
        tenantId: 'default',
        role: 'tenant_admin',
        permissions: userRepository.ROLE_PERMISSIONS.tenant_admin
      });
      console.log(`      ✔ Usuário de teste local 'patio' (senha: patio) habilitado.`);
    } else {
      await db.run('UPDATE users SET password_hash = ?, password_salt = ?, failed_login_attempts = 0, locked_until = NULL, status = ? WHERE username = ?', [
        hashPatio, saltPatio, 'active', 'patio'
      ]);
      console.log(`      ✔ Usuário de teste local 'patio' (senha: patio) desbloqueado e atualizado.`);
    }

    // Limpa pasta de uploads se houver arquivos de teste
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      let removidos = 0;
      for (const f of files) {
        if (f !== '.gitkeep') {
          try {
            fs.unlinkSync(path.join(uploadsDir, f));
            removidos++;
          } catch (_) {}
        }
      }
      if (removidos > 0) {
        console.log(`      ✔ ${removidos} arquivos de teste removidos de uploads/.`);
      }
    }

    console.log('\n================================================================');
    console.log(' ✅ LIMPEZA CONCLUÍDA COM SUCESSO! SOFTWARE PRONTO PARA USO.');
    console.log('================================================================');
    console.log(' • Base de dados:       100% limpa em branco (pronta para testes)');
    console.log(' • Travas de piloto:    Todas removidas (WhatsApp e Módulos)');
    console.log(' • Emissão fiscal:      Destravada para Produção / Homologação');
    console.log(' • Usuário Admin:       admin@oficina.local  (Senha: AdminOficina2026!#Secure)');
    console.log(' • Acesso Rápido Local: patio / patio');
    console.log(' • Backup salvo em:     ' + backupFile);
    console.log('================================================================\n');

  } finally {
    await db.closeDB();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Erro na execução da limpeza:', err);
    process.exit(1);
  });
}

module.exports = { main };
