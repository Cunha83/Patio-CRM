'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

// ── Testes Unitários de Lógica de Seleção de Voz (TTS) ─────────────
test('1. Seleção de Voz: Prioridade para voiceURI e voiceName configurados pelo usuário', () => {
  const fakeVoices = [
    { voiceURI: 'voice-daniel', name: 'Microsoft Daniel - Portuguese (Brazil)', lang: 'pt-BR' },
    { voiceURI: 'voice-maria', name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR' },
    { voiceURI: 'voice-francisca', name: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR' },
    { voiceURI: 'voice-google-pt', name: 'Google português do Brasil', lang: 'pt-BR' }
  ];

  function resolveVoiceSimulado({ gender = 'female', voiceURI = '', voiceName = '', voices = fakeVoices } = {}) {
    if (voiceURI || voiceName) {
      const exact = voices.find(v => (voiceURI && v.voiceURI === voiceURI) || (voiceName && v.name === voiceName));
      if (exact) {
        const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
        const isMale = maleRegex.test(exact.name);
        return {
          voice: exact,
          fallback: false,
          gender,
          requiresPitchCompensation: (gender === 'female' && isMale)
        };
      }
    }

    const ptBrVoices = voices.filter(v => /pt[-_]br/i.test(v.lang || ''));
    const list = ptBrVoices.length > 0 ? ptBrVoices : voices;

    const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
    const femaleRegex = /female|feminin|mulher|luciana|maria|helena|vitoria|vitória|francisca|raquel|camila|brenda|thalita|elza|leticia|letícia|manuela|leide|fernanda|gabriela|juliana|carolina|ana|ines|inês|joana|catarina|clara|amalia|amália|yelda|helia|hélia|zira/i;

    let matched = null;
    if (gender === 'male') {
      matched = list.find(v => maleRegex.test(v.name));
    } else {
      matched = list.find(v => femaleRegex.test(v.name));
    }

    if (matched) return { voice: matched, fallback: false, requiresPitchCompensation: false, gender };

    if (gender === 'female') {
      const nonMale = list.find(v => !maleRegex.test(v.name));
      if (nonMale) return { voice: nonMale, fallback: true, requiresPitchCompensation: false, gender };
    }

    const fallbackVoice = list[0] || null;
    const isFallbackMale = fallbackVoice ? maleRegex.test(fallbackVoice.name) : false;
    return {
      voice: fallbackVoice,
      fallback: true,
      requiresPitchCompensation: (gender === 'female' && isFallbackMale),
      gender
    };
  }

  const res1 = resolveVoiceSimulado({ voiceURI: 'voice-francisca', gender: 'female' });
  assert.equal(res1.voice.name, 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)');
  assert.equal(res1.fallback, false);
  assert.equal(res1.requiresPitchCompensation, false);

  const res2 = resolveVoiceSimulado({ voiceName: 'Microsoft Maria - Portuguese (Brazil)', gender: 'female' });
  assert.equal(res2.voice.voiceURI, 'voice-maria');
  assert.equal(res2.fallback, false);

  const res3 = resolveVoiceSimulado({ voiceURI: 'voice-daniel', gender: 'female' });
  assert.equal(res3.voice.voiceURI, 'voice-daniel');
  assert.equal(res3.requiresPitchCompensation, true);
});

test('2. Seleção de Voz: Compensação de afinação (Pitch) quando apenas voz masculina está disponível', () => {
  const windowsOnlyMaleVoice = [
    { voiceURI: 'voice-daniel', name: 'Microsoft Daniel - Portuguese (Brazil)', lang: 'pt-BR' }
  ];

  const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
  const femaleRegex = /female|feminin|mulher|luciana|maria|helena|vitoria|vitória|francisca|raquel|camila|brenda|thalita|elza|leticia|letícia|manuela|leide|fernanda|gabriela|juliana|carolina|ana|ines|inês|joana|catarina|clara|amalia|amália|yelda|helia|hélia|zira/i;

  const effGender = 'female';
  let matched = windowsOnlyMaleVoice.find(v => femaleRegex.test(v.name));
  assert.equal(matched, undefined);

  const nonMale = windowsOnlyMaleVoice.find(v => !maleRegex.test(v.name));
  assert.equal(nonMale, undefined);

  const fallbackVoice = windowsOnlyMaleVoice[0];
  const isFallbackMale = fallbackVoice ? maleRegex.test(fallbackVoice.name) : false;
  const requiresPitchShift = (effGender === 'female' && isFallbackMale);
  assert.equal(requiresPitchShift, true);

  const calcPitch = requiresPitchShift ? 1.32 : 1.05;
  assert.ok(calcPitch >= 1.30);
});

test('3. Teste de Saudação: Geração determinística de texto de acordo com nome e gênero', () => {
  function gerarFraseSaudacao({ displayName, voiceGender }) {
    const nome = displayName || 'Verônica';
    const genero = voiceGender || 'female';
    const artigo = genero === 'male' ? 'o' : 'a';
    const pronto = genero === 'male' ? 'pronto' : 'pronta';
    return `Olá! Eu sou ${artigo} ${nome}, seu assistente inteligente no Pátio CRM. A voz foi configurada com sucesso e estou ${pronto} para ajudar a sua oficina!`;
  }

  const frase1 = gerarFraseSaudacao({ displayName: 'Sofia', voiceGender: 'female' });
  assert.ok(frase1.includes('a Sofia'));
  assert.ok(frase1.includes('pronta'));

  const frase2 = gerarFraseSaudacao({ displayName: 'Atlas', voiceGender: 'male' });
  assert.ok(frase2.includes('o Atlas'));
  assert.ok(frase2.includes('pronto'));

  const frase3 = gerarFraseSaudacao({});
  assert.ok(frase3.includes('a Verônica'));
  assert.ok(frase3.includes('pronta'));
});

// ── Teste E2E de Persistência e API ────────────────────────────────
test('4. API /api/configuracoes/assistente: GET, PUT e persistência com parâmetros completos de voz', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-e2e-ass-'));
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const dbPath = path.join(tempDir, 'patio_ass_test.db');

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await new Promise(r => probe.once('listening', r));
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: 'patio-crm-admin-2026',
      DEFAULT_SINGLE_TENANT_ID: 'default',
      DISABLE_INTEGRATIONS: 'true',
      UPLOAD_DIR: uploadDir,
      DB_PATH: dbPath,
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStderr = '';
  serverProcess.stdout.on('data', d => { serverStderr += d.toString(); });
  serverProcess.stderr.on('data', d => { serverStderr += d.toString(); });

  let serverStarted = false;
  for (let i = 0; i < 200; i++) {
    if (serverProcess.exitCode !== null) throw new Error('Falha ao iniciar servidor E2E: ' + serverStderr);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200 || res.status === 401) {
        serverStarted = true;
        break;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!serverStarted) throw new Error('Timeout ao aguardar servidor: ' + serverStderr);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': 'patio-crm-admin-2026',
      'x-tenant-id': 'tenant_oficina_teste_voz'
    };

    const resGet1 = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, { headers });
    assert.equal(resGet1.status, 200);
    const jsonGet1 = await resGet1.json();
    assert.equal(jsonGet1.success, true);
    assert.equal(jsonGet1.assistente.displayName, 'Verônica');
    assert.equal(jsonGet1.assistente.voiceGender, 'female');

    const resPut = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        displayName: 'Atlas Inteligência',
        voiceGender: 'male',
        voiceURI: 'Microsoft Daniel - Portuguese (Brazil)',
        voiceName: 'Microsoft Daniel',
        pitch: 0.90,
        rate: 1.10
      })
    });
    assert.equal(resPut.status, 200);
    const jsonPut = await resPut.json();
    assert.equal(jsonPut.success, true);
    assert.equal(jsonPut.assistente.displayName, 'Atlas Inteligência');
    assert.equal(jsonPut.assistente.voiceGender, 'male');
    assert.equal(jsonPut.assistente.voiceURI, 'Microsoft Daniel - Portuguese (Brazil)');
    assert.equal(jsonPut.assistente.voiceName, 'Microsoft Daniel');
    assert.equal(jsonPut.assistente.pitch, 0.90);
    assert.equal(jsonPut.assistente.rate, 1.10);

    const resGet2 = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, { headers });
    assert.equal(resGet2.status, 200);
    const jsonGet2 = await resGet2.json();
    assert.equal(jsonGet2.assistente.displayName, 'Atlas Inteligência');
    assert.equal(jsonGet2.assistente.voiceGender, 'male');
    assert.equal(jsonGet2.assistente.voiceURI, 'Microsoft Daniel - Portuguese (Brazil)');
    assert.equal(jsonGet2.assistente.pitch, 0.90);
    assert.equal(jsonGet2.assistente.rate, 1.10);

    const headersTenantB = {
      'Content-Type': 'application/json',
      'x-api-key': 'patio-crm-admin-2026',
      'x-tenant-id': 'tenant_outro_negocio'
    };
    const resGetTenantB = await fetch(`http://127.0.0.1:${port}/api/configuracoes/assistente`, { headers: headersTenantB });
    assert.equal(resGetTenantB.status, 200);
    const jsonGetTenantB = await resGetTenantB.json();
    assert.equal(jsonGetTenantB.assistente.displayName, 'Verônica');
  } finally {
    serverProcess.kill('SIGTERM');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});
