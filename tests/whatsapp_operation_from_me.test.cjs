'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
const os = require('os');

// Prepara banco temporário isolado
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_wpp_op_'));
const testDb = path.join(tempDir, 'test_op.db');
process.env.DB_PATH = testDb;

const Tesseract = require('tesseract.js');
const origRecognize = Tesseract.recognize;
Tesseract.recognize = async () => ({ data: { text: 'PLACA XYZ9876' } });

const { initDB, closeDB, run } = require('../db');
const { tratarMensagemWhatsApp } = require('../services/whatsapp/whatsappHandlers');
const {
  registrarMensagemEnviadaPeloBot,
  isMensagemEnviadaPeloBot,
  setWppClient
} = require('../services/whatsapp/whatsappState');
const { getOrLoadState, salvarEstado } = require('../lib/serverContext');

test('WhatsApp Grupo Operação - Mensagens do próprio número (fromMe) e Abertura de OS', async (t) => {
  await initDB();

  t.after(async () => {
    Tesseract.recognize = origRecognize;
    try { await closeDB(); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  const GRUPO_OP = '120363432546429887@g.us';
  const NUMERO_CONECTADO = '556232997924';

  // Configura estado inicial com o grupo de operação
  const estadoInicial = await getOrLoadState('default');
  estadoInicial.cfg = {
    ...(estadoInicial.cfg || {}),
    responderApenasGrupos: true,
    grupoOperacaoId: GRUPO_OP,
    adminFones: [NUMERO_CONECTADO]
  };
  estadoInicial.boxes = [
    { id: 'b1', nome: 'Box 1' },
    { id: 'b2', nome: 'Box 2' }
  ];
  estadoInicial.os = [];
  estadoInicial.veiculos = [];
  estadoInicial.clientes = [];
  await salvarEstado({ tenantId: 'default' }, estadoInicial);

  const mockClient = {
    info: { wid: { user: NUMERO_CONECTADO, _serialized: `${NUMERO_CONECTADO}@c.us` } },
    sendMessage: async (chatId, text) => ({ id: { _serialized: `bot_${Date.now()}` } })
  };
  setWppClient(mockClient);

  await t.test('1. Deve abrir OS quando o próprio número conectado envia mensagem no grupo de operação (fromMe=true)', async () => {
    let respostaEnviada = null;
    const msgMock = {
      id: { _serialized: `user_sent_${Date.now()}`, id: `user_${Date.now()}` },
      fromMe: true,
      from: `${NUMERO_CONECTADO}@c.us`,
      to: GRUPO_OP,
      body: 'Abrir OS placa ABC1234',
      hasMedia: false,
      reply: async (text) => {
        respostaEnviada = text;
        return { id: { _serialized: `bot_reply_${Date.now()}` } };
      }
    };

    await tratarMensagemWhatsApp(msgMock, mockClient);

    assert.ok(respostaEnviada, 'O robô deve responder à mensagem enviada no grupo de operação');
    assert.match(respostaEnviada, /Ordem de Serviço #.*Aberta com Sucesso/i, 'A resposta deve confirmar a abertura da OS');
    assert.match(respostaEnviada, /ABC1234/i, 'A resposta deve conter a placa');

    // Verifica persistência da OS no estado
    const estadoAtualizado = await getOrLoadState('default');
    const osAberta = (estadoAtualizado.os || []).find(o => {
      const v = estadoAtualizado.veiculos.find(ve => ve.id === o.vei);
      return v && v.placa === 'ABC1234';
    });
    assert.ok(osAberta, 'A OS para ABC1234 deve ter sido gravada no estado');
    assert.equal(osAberta.box, 'b1', 'Deve ter sido alocada no Box 1');
  });

  await t.test('2. Deve ignorar mensagens que o próprio bot enviou para prevenir loop', async () => {
    const botMsgId = 'true_120363432546429887@g.us_BOTMSG001';
    registrarMensagemEnviadaPeloBot(botMsgId);
    assert.equal(isMensagemEnviadaPeloBot(botMsgId), true);

    let replyChamado = false;
    const msgBot = {
      id: { _serialized: botMsgId, id: 'BOTMSG001' },
      fromMe: true,
      from: `${NUMERO_CONECTADO}@c.us`,
      to: GRUPO_OP,
      body: '✅ *Ordem de Serviço #1041 Aberta com Sucesso!*',
      hasMedia: false,
      reply: async () => {
        replyChamado = true;
      }
    };

    await tratarMensagemWhatsApp(msgBot, mockClient);
    assert.equal(replyChamado, false, 'O robô não deve processar mensagens enviadas por ele mesmo');
  });

  await t.test('3. Mensagem de áudio deve retornar resposta amigável mesmo sem serviço Gemini', async () => {
    let respostaAudio = null;
    const msgAudio = {
      id: { _serialized: `audio_${Date.now()}`, id: `audio_${Date.now()}` },
      fromMe: true,
      from: `${NUMERO_CONECTADO}@c.us`,
      to: GRUPO_OP,
      body: '',
      hasMedia: true,
      type: 'ptt',
      downloadMedia: async () => ({
        mimetype: 'audio/ogg',
        data: Buffer.from('fake_audio').toString('base64')
      }),
      reply: async (text) => {
        respostaAudio = text;
        return { id: { _serialized: `bot_reply_audio_${Date.now()}` } };
      }
    };

    await tratarMensagemWhatsApp(msgAudio, mockClient);

    assert.ok(respostaAudio, 'O robô deve responder à mensagem de áudio');
    assert.match(respostaAudio, /Áudio/i, 'Deve conter aviso sobre o áudio');
  });

  await t.test('4. Envio de foto com placa no grupo de operação abre OS e aloca box', async () => {
    let respostaFoto = null;
    const msgFoto = {
      id: { _serialized: `photo_${Date.now()}`, id: `photo_${Date.now()}` },
      fromMe: true,
      from: `${NUMERO_CONECTADO}@c.us`,
      to: GRUPO_OP,
      body: 'Foto da placa XYZ9876',
      hasMedia: true,
      type: 'image',
      downloadMedia: async () => ({
        mimetype: 'image/png',
        data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      }),
      reply: async (text) => {
        respostaFoto = text;
        return { id: { _serialized: `bot_reply_photo_${Date.now()}` } };
      }
    };

    await tratarMensagemWhatsApp(msgFoto, mockClient);

    assert.ok(respostaFoto, 'Deve responder ao envio de foto com placa');
    assert.match(respostaFoto, /Ordem de Serviço #.*Aberta com Sucesso/i, 'A foto com placa deve abrir OS');
    assert.match(respostaFoto, /XYZ9876/i, 'Deve conter a placa na resposta');

    const estadoAtualizado = await getOrLoadState('default');
    const osFoto = (estadoAtualizado.os || []).find(o => {
      const v = estadoAtualizado.veiculos.find(ve => ve.id === o.vei);
      return v && v.placa === 'XYZ9876';
    });
    assert.ok(osFoto, 'A OS para XYZ9876 deve ter sido criada');
    assert.equal(osFoto.box, 'b2', 'Deve ter alocado o próximo box disponível (Box 2)');
  });
});
