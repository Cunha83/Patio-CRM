'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-fiscal-test-'));
const testDbPath = path.join(tempDir, 'test.db');
process.env.DB_PATH = testDbPath;
process.env.BACKUP_DIR = path.join(tempDir,'backups');
process.env.UPLOAD_DIR = path.join(tempDir,'uploads');
process.env.FISCAL_TEST_ADAPTER = 'enabled';
process.env.FISCAL_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');

const { initDB, run, get, all, closeDB } = require('../db');
const fiscalConfigService = require('../services/fiscal/fiscalConfigService');
const fiscalNumberingService = require('../services/fiscal/fiscalNumberingService');
const fiscalLifecycleService = require('../services/fiscal/fiscalLifecycleService');
const fiscalEventService = require('../services/fiscal/fiscalEventService');
const { calcularDVChave44 } = require('./helpers/fiscalMock.cjs');

test('SIMULAÇÃO LOCAL — Ciclo de Vida Fiscal, Numeração Atômica, Eventos e Recuperação (NF-e/NFS-e)', async (t) => {
  await initDB();

  t.after(async () => {
    await closeDB().catch(() => {});
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  const tenantId = `tenant_fisc_${Date.now()}`;

  // 1. Configuração Fiscal do Emitente e Criptografia em Repouso
  await t.test('1. fiscalConfigService: salva parâmetros e criptografa segredos em repouso', async () => {
    const saved = await fiscalConfigService.saveFiscalConfig(tenantId, {
      ambiente: 'homologacao',
      provider: 'mock_homologacao',
      providerToken: 'token-secreto-focus-123',
      certPassword: 'senha-do-certificado-a1',
      cnpj: '12.345.678/0001-90',
      razaoSocial: 'Auto Molas & Freios Diesel Ltda',
      nomeFantasia: 'Auto Molas Diesel',
      inscricaoEstadual: '123456789110',
      inscricaoMunicipal: '98765-4',
      regimeTributario: 'simples_nacional',
      cnaePrincipal: '4520-0/01',
      codigoMunicipioIbge: '3509502',
      uf: 'SP',
      nfeSerie: 1,
      nfeProximoNumero: 100
    });

    assert.equal(saved.cnpj, '12345678000190');
    assert.equal(saved.providerToken, 'token-secreto-focus-123');

    // Verifica que no banco bruto do SQLite o token e a senha estão criptografados (não existem em texto claro)
    const rawRow = await get('SELECT * FROM fiscal_settings WHERE tenant_id = ?', [tenantId]);
    assert.ok(rawRow.provider_token_encrypted.includes(':'));
    assert.ok(!rawRow.provider_token_encrypted.includes('token-secreto-focus-123'));
    assert.ok(!rawRow.cert_password_encrypted.includes('senha-do-certificado-a1'));

    // Configuração pública sanitizada não expõe segredos
    const publicCfg = await fiscalConfigService.getPublicFiscalConfig(tenantId);
    assert.equal(publicCfg.hasProviderToken, true);
    assert.equal(publicCfg.providerToken, undefined);
    assert.equal(publicCfg.hasCertPassword, true);
    assert.equal(publicCfg.certPassword, undefined);
  });

  // 2. Alocação Atômica de Numeração Fiscal Concorrente (Sem duplicidade nem saltos)
  await t.test('2. fiscalNumberingService: alocação atômica serializada de numeração sob concorrência', async () => {
    // Dispara 10 alocações simultâneas para o mesmo tenant, modelo e série
    const promises = Array.from({ length: 10 }, () =>
      fiscalNumberingService.alocarProximoNumeroFiscal({
        tenantId,
        modelo: '55',
        serie: '1',
        ambiente: 'homologacao'
      })
    );

    const results = await Promise.all(promises);
    const numeros = results.map(r => r.numero);

    // Deve conter 10 números distintos e estritamente crescentes
    const uniqueNumeros = new Set(numeros);
    assert.equal(uniqueNumeros.size, 10, 'Todas as 10 alocações devem gerar números exclusivos');
    assert.equal(Math.min(...numeros), 100);
    assert.equal(Math.max(...numeros), 109);
  });

  // 3. Geração e separação automática de documentos fiscais a partir de Ordem de Serviço
  await t.test('3. fiscalLifecycleService: separa peças em NF-e 55 e mão de obra em NFS-e', async () => {
    const osMock = {
      id: 'os_demo_7788',
      cliNome: 'Transportadora Carga Pesada Ltda',
      cliDoc: '01.234.567/0001-89',
      pecas: [
        { id: 'p1', nome: 'Lâmina de Mola Viradeira L1', qtd: 2, preco: 350.00, ncm: '73201000' }
      ],
      servicos: [
        { id: 's1', nome: 'Mão de Obra de Arquear Feixe', qtd: 1, preco: 250.00 }
      ]
    };

    const docs = await fiscalLifecycleService.gerarDocumentosFiscaisDeOS({
      tenantId,
      os: osMock,
      cliente: { nome: osMock.cliNome, doc: osMock.cliDoc }
    });

    assert.equal(docs.length, 2, 'Deve gerar exatamente 2 rascunhos (1 NF-e e 1 NFS-e)');

    const docNFe = docs.find(d => d.modelo === '55');
    const docNFSe = docs.find(d => d.modelo === 'NFS-e');

    assert.ok(docNFe);
    assert.equal(docNFe.status, 'rascunho');
    assert.equal(docNFe.totais.valorProdutos, 700.00);
    assert.equal(docNFe.totais.valorTotalDocumento, 700.00);

    assert.ok(docNFSe);
    assert.equal(docNFSe.status, 'rascunho');
    assert.equal(docNFSe.totais.valorServicos, 250.00);
    assert.equal(docNFSe.totais.valorTotalDocumento, 250.00);
  });

  // 4. Transmissão e autorização de NF-e com Chave de Acesso de 44 dígitos válida
  let nfeEmitidaId = null;
  await t.test('4. fiscalLifecycleService: transmite NF-e e obtém autorização com chave de 44 dígitos válida', async () => {
    const docRascunho = await fiscalLifecycleService.criarRascunhoDocumentoFiscal({
      tenantId,
      modelo: '55',
      origemTipo: 'os',
      origemId: 'os_9999',
      destinatario: { nome: 'Frotista TransBrasil', documento: '11.222.333/0001-44' },
      itens: [
        { id: 'p10', descricao: 'Cuíca de Freio Dupla 30/30', quantidade: 2, valorUnitario: 180.00 }
      ]
    });

    nfeEmitidaId = docRascunho.id;

    const resTransm = await fiscalLifecycleService.transmitirDocumentoFiscal({
      documentId: nfeEmitidaId,
      tenantId,
      usuario: 'gerente_carlos'
    });

    assert.equal(resTransm.ok, true);
    assert.equal(resTransm.status, 'autorizado');

    const docAut = resTransm.documento;
    assert.ok(docAut.chaveAcesso);
    assert.equal(docAut.chaveAcesso.length, 44, 'Chave de acesso deve ter exatamente 44 dígitos');

    // Valida dígito verificador da chave
    const chave43 = docAut.chaveAcesso.substring(0, 43);
    const dvCalculado = calcularDVChave44(chave43);
    assert.equal(Number(docAut.chaveAcesso.charAt(43)), dvCalculado, 'Dígyto verificador da chave de acesso deve ser válido');

    assert.ok(docAut.protocoloAutorizacao.startsWith('13526'));
    assert.ok(docAut.xmlOficial.includes('<nfeProc'));
    assert.ok(docAut.danfeUrl);

    // Re-transmissão idempotente não duplica documento
    const resRepetida = await fiscalLifecycleService.transmitirDocumentoFiscal({
      documentId: nfeEmitidaId,
      tenantId
    });
    assert.equal(resRepetida.jaAutorizado, true);
    assert.equal(resRepetida.documento.chaveAcesso, docAut.chaveAcesso);
  });

  // 5. Carta de Correção Eletrônica (CC-e)
  await t.test('5. fiscalEventService: emite CC-e com validação de tamanho mínimo e sequencial incremental', async () => {
    // Rejeita texto com menos de 15 caracteres
    await assert.rejects(
      async () => {
        await fiscalEventService.emitirCartaCorrecao({
          documentId: nfeEmitidaId,
          tenantId,
          correcao: 'Texto curto'
        });
      },
      /mínimo 15 caracteres/
    );

    const cce1 = await fiscalEventService.emitirCartaCorrecao({
      documentId: nfeEmitidaId,
      tenantId,
      correcao: 'Correção de endereço de entrega do cliente para Rodovia Anhanguera km 120.',
      usuario: 'faturista_ana'
    });

    assert.equal(cce1.ok, true);
    assert.equal(cce1.sequencial, 1);
    assert.ok(cce1.protocolo.startsWith('1352600888'));

    const cce2 = await fiscalEventService.emitirCartaCorrecao({
      documentId: nfeEmitidaId,
      tenantId,
      correcao: 'Correção complementar de código do transportador terceiro na nota fiscal.',
      usuario: 'faturista_ana'
    });

    assert.equal(cce2.ok, true);
    assert.equal(cce2.sequencial, 2);

    const eventos = await fiscalEventService.listarEventosDocumento(nfeEmitidaId, tenantId);
    assert.equal(eventos.length, 2);
  });

  // 6. Cancelamento Fiscal homologado com justificativa mínima de 15 caracteres
  await t.test('6. fiscalEventService: cancela NF-e autorizada e valida justificativa legal', async () => {
    // Rejeita cancelamento com justificativa curta
    await assert.rejects(
      async () => {
        await fiscalEventService.cancelarDocumentoFiscal({
          documentId: nfeEmitidaId,
          tenantId,
          justificativa: 'Erro simples'
        });
      },
      /mínimo 15 caracteres/
    );

    const resCanc = await fiscalEventService.cancelarDocumentoFiscal({
      documentId: nfeEmitidaId,
      tenantId,
      justificativa: 'Erro de digitação no destinatário detectado pelo cliente antes da saída da mercadoria.',
      usuario: 'gerente_carlos'
    });

    assert.equal(resCanc.ok, true);
    assert.equal(resCanc.status, 'cancelado');
    assert.equal(resCanc.documento.status, 'cancelado');
    assert.ok(resCanc.protocolo.startsWith('1352600999'));

    // Documento cancelado não pode ser re-transmitido nem cancelado novamente
    await assert.rejects(
      async () => {
        await fiscalLifecycleService.transmitirDocumentoFiscal({
          documentId: nfeEmitidaId,
          tenantId
        });
      },
      /cancelado/
    );
  });

  // 7. Exercício de Backup, Restauração e Preservação de Numeração Fiscal
  await t.test('7. Backup & Restauração: restaura banco em arquivo separado e preserva histórico e ledger fiscal', async () => {
    const backupService = require('../services/backupService');
    const bckRes = await backupService.executarBackupWal({
      tenantId,
      actorId: 'auditor_fiscal'
    });

    assert.equal(bckRes.ok, true);
    assert.ok(fs.existsSync(bckRes.filepath));

    // Restaura em banco totalmente isolado
    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-restore-fisc-'));
    const restoreDbPath = path.join(restoreDir, 'restored.db');

    const restoreRes = await backupService.restaurarBackup({
      backupId: bckRes.backupId,
      targetDbPath: restoreDbPath
    });

    assert.equal(restoreRes.ok, true);

    // Inicia conexão no banco restaurado e verifica documentos fiscais e numeração
    const sqlite3 = require('sqlite3').verbose();
    const restDb = new sqlite3.Database(restoreDbPath);

    const rowsDocs = await new Promise((resolve, reject) => {
      restDb.all('SELECT id, modelo, status, chave_acesso FROM fiscal_documents WHERE tenant_id = ?', [tenantId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    assert.ok(rowsDocs.length >= 1, 'Documentos fiscais devem existir no banco restaurado');
    const docRestaurado = rowsDocs.find(d => d.id === nfeEmitidaId);
    assert.ok(docRestaurado);
    assert.equal(docRestaurado.status, 'cancelado');

    // Verifica que o ledger de numeração foi preservado e não regrediu
    const rowLedger = await new Promise((resolve, reject) => {
      restDb.get('SELECT ultimo_numero FROM fiscal_numbering_ledger WHERE tenant_id = ? AND modelo = "55"', [tenantId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    assert.ok(rowLedger && rowLedger.ultimo_numero >= 109, 'Ledger de numeração deve ter preservado o último número');

    await new Promise(r => restDb.close(r));
    try { fs.rmSync(restoreDir, { recursive: true, force: true }); } catch (_) {}
  });
});
