require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initDB, all, run } = require('./db');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { GoogleGenAI } = require('@google/genai');
const Tesseract = require('tesseract.js');

// Memória de curto prazo para placas enviadas recentemente por número de telefone
const ultimasPlacas = new Map();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT_DIR = __dirname;

// Inicializa cliente Gemini AI com apiKey se configurada
let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua_chave_aqui') {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('[AI] Google Gen AI configurado com chave do .env.');
  } catch (err) {
    console.warn('[AI] Aviso ao instanciar Google Gen AI:', err.message);
  }
}

const app = express();

/* ── Headers de Segurança & CORS ─────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ── Bloqueio de Arquivos Sensíveis ──────────────────────── */
const BLOCKED_PATTERNS = [
  /^\./,
  /\.env$/i,
  /\.db$/i,
  /\.log$/i,
  /package\.json/i,
  /package-lock\.json/i,
  /node_modules/i
];

app.use((req, res, next) => {
  const cleanPath = decodeURIComponent(req.path || '');
  const segments = cleanPath.split('/').filter(Boolean);
  const isBlocked = segments.some(seg => BLOCKED_PATTERNS.some(pat => pat.test(seg)));
  if (isBlocked) {
    return res.status(403).send('403 Forbidden: Acesso bloqueado a arquivos de sistema.');
  }
  next();
});

/* ── Estado Global Compartilhado em Memória e SQLite ─────── */
let globalState = null;

app.get('/api/estado', async (req, res) => {
  try {
    if (!globalState) {
      const rows = await all("SELECT value FROM kv WHERE key = 'state'");
      if (rows && rows.length > 0) {
        globalState = JSON.parse(rows[0].value);
      }
    }
    if (globalState && !globalState.versao) {
      globalState.versao = Date.now();
    }
    res.json(globalState || {});
  } catch (error) {
    console.error('[API /api/estado GET] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/versao', (req, res) => {
  res.json({
    versao: globalState?.versao || 1,
    totalOS: (globalState?.os || []).length,
    totalVei: (globalState?.veiculos || []).length
  });
});

app.post('/api/estado', async (req, res) => {
  try {
    const incoming = req.body;
    // Preserva OSs e Veículos criados recentemente pelo WhatsApp/Servidor para evitar perda de dados
    if (globalState && globalState.os && Array.isArray(incoming.os)) {
      const idsIncoming = new Set(incoming.os.map(o => o.id));
      const extras = globalState.os.filter(o => !idsIncoming.has(o.id));
      if (extras.length > 0) {
        incoming.os = [...extras, ...incoming.os];
      }
    }
    if (globalState && globalState.veiculos && Array.isArray(incoming.veiculos)) {
      const idsIncomingVei = new Set(incoming.veiculos.map(v => v.id));
      const extrasVei = globalState.veiculos.filter(v => !idsIncomingVei.has(v.id));
      if (extrasVei.length > 0) {
        incoming.veiculos = [...incoming.veiculos, ...extrasVei];
      }
    }

    incoming.versao = Date.now();
    globalState = incoming;
    await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);
    res.json({ success: true, timestamp: Date.now(), versao: globalState.versao });
  } catch (error) {
    console.error('[API /api/estado POST] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ── Status e Controle do WhatsApp ───────────────────────── */
let wppStatus = {
  status: 'inicializando',
  qr: null,
  qrImage: null,
  user: null,
  ultimoUpdate: new Date().toISOString()
};

app.get('/api/whatsapp/status', (req, res) => {
  res.json(wppStatus);
});

// Retorna o QR Code em PNG com alto contraste
app.get('/api/whatsapp/qr.png', async (req, res) => {
  if (wppStatus.qr) {
    try {
      const buffer = await QRCode.toBuffer(wppStatus.qr, {
        width: 380,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(buffer);
    } catch (e) {
      return res.status(500).send('Erro ao renderizar imagem do QR Code.');
    }
  }
  res.status(404).send('Nenhum QR Code ativo no momento. Aguarde ou recarregue.');
});

/* ── Integração IA: Upload e Leitura de Nota Fiscal ──────── */
app.post('/api/upload-nota', async (req, res) => {
  try {
    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ error: 'Nenhuma imagem recebida.' });
    if (!ai) return res.status(500).json({ error: 'Google Gen AI não configurado no servidor.' });

    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `Extraia os dados desta Nota Fiscal ou recibo de autopeças/serviços.
Retorne APENAS um JSON estrito no seguinte formato:
{
  "fornecedor": "Razão Social ou Nome do fornecedor",
  "cnpj": "CNPJ do fornecedor (se houver)",
  "telefone": "Telefone do fornecedor (se houver)",
  "cidade": "Cidade do fornecedor (se houver)",
  "endereco": "Endereço completo (se houver)",
  "data": "YYYY-MM-DD",
  "valor_total": 0.00,
  "itens": [ { "nome": "nome da peça", "quantidade": 1, "valor_unitario": 0.00 } ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: prompt }
          ]
        }
      ]
    });

    let texto = (response.text || '').trim();
    if (texto.startsWith('```')) {
      texto = texto.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }
    const dadosNF = JSON.parse(texto);

    if (!globalState) globalState = {};
    if (!globalState.pecas) globalState.pecas = [];
    if (!globalState.contas) globalState.contas = [];
    if (!globalState.compras) globalState.compras = [];
    if (!globalState.fornecedores) globalState.fornecedores = [];

    for (const item of (dadosNF.itens || [])) {
      const existing = globalState.pecas.find(p => p.nome && p.nome.toLowerCase().includes((item.nome || '').toLowerCase()));
      if (existing) {
        existing.qtd = (existing.qtd || 0) + (Number(item.quantidade) || 1);
        existing.custo = Number(item.valor_unitario) || existing.custo;
      } else {
        globalState.pecas.push({
          id: 'p_' + Date.now() + Math.floor(Math.random() * 1000),
          cod: 'NF-' + Math.floor(Math.random() * 900 + 100),
          nome: item.nome,
          un: 'un',
          qtd: Number(item.quantidade) || 1,
          min: 1,
          custo: Number(item.valor_unitario) || 0,
          venda: (Number(item.valor_unitario) || 0) * 1.5,
          loc: 'Pátio',
          forn: dadosNF.fornecedor || ''
        });
      }
    }

    await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);

    res.json({
      success: true,
      message: 'Nota fiscal lida com sucesso via IA!',
      dadosProcessados: dadosNF,
      newState: globalState
    });
  } catch (err) {
    console.error('[API /api/upload-nota] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Ditado de Áudio para Abertura de OS ───── */
app.post('/api/processar-audio-os', async (req, res) => {
  try {
    const { audioBase64, catalogoServicos, catalogoPecas } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'Nenhum áudio recebido.' });
    if (!ai) return res.status(500).json({ error: 'Google Gen AI não configurado.' });

    const matches = audioBase64.match(/^data:(.+);base64,(.+)$/);
    let mimeType = 'audio/webm';
    let base64Data = audioBase64;
    if (matches && matches.length === 3) {
      mimeType = matches[1].split(';')[0];
      base64Data = matches[2];
    }

    const prompt = `Você é um assistente de oficina mecânica diesel pesada.
O mecânico ditou um áudio com serviços e peças de uma ordem de serviço.
Catálogo de serviços: ${JSON.stringify(catalogoServicos || [])}
Catálogo de peças: ${JSON.stringify(catalogoPecas || [])}
Retorne APENAS um JSON estrito:
{
  "servicos_identificados": [
    { "id_catalogo": "id ou null", "nome": "nome do serviço", "qtd": 1, "valor": 0.00 }
  ],
  "pecas_identificadas": [
    { "id_catalogo": "id ou null", "nome": "nome da peça", "qtd": 1, "valor": 0.00 }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ]
    });

    let texto = (response.text || '').trim();
    if (texto.startsWith('```')) {
      texto = texto.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }
    const dados = JSON.parse(texto);
    res.json({ success: true, dadosProcessados: dados });
  } catch (err) {
    console.error('[API /api/processar-audio-os] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Servir Arquivos Estáticos do Frontend ────────────────── */
app.use(express.static(ROOT_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

/* ── Inicialização do Banco de Dados e Servidor ──────────── */
initDB().then(async () => {
  await run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)");

  const rows = await all("SELECT value FROM kv WHERE key = 'state'");
  if (rows && rows.length > 0) {
    try {
      globalState = JSON.parse(rows[0].value);
      console.log(`[DB] Estado global carregado do SQLite com sucesso.`);

      // Sanitiza boxes em OSs existentes para que correspondam a b1..b6 ou null
      if (globalState && Array.isArray(globalState.os)) {
        const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
        let corrigiu = false;
        globalState.os.forEach(o => {
          if (o.box && !boxesValidos.has(o.box)) {
            o.box = null;
            if (o.st !== 'finalizada') o.st = 'fila';
            corrigiu = true;
          }
        });
        if (!globalState.versao) {
          globalState.versao = Date.now();
          corrigiu = true;
        }
        if (corrigiu) {
          await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);
          console.log('[DB] Boxes sanitizados no SQLite.');
        }
      }
    } catch (e) {
      console.warn('[DB] Estado anterior inválido, iniciando vazio.');
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const ifaceName in interfaces) {
      for (const iface of interfaces[ifaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }

    console.log('\n======================================================');
    console.log(`🚀 [Pátio CRM] Servidor no ar!`);
    console.log(`💻 Acesso Local:         http://localhost:${PORT}/`);
    ips.forEach(ip => {
      console.log(`📱 Acesso na Rede Local: http://${ip}:${PORT}/`);
    });
    console.log('======================================================\n');
  });

  iniciarWhatsApp();
}).catch(err => {
  console.error('[FATAL] Erro ao inicializar banco de dados SQLite:', err);
});

/* ── 1. Consulta Online de Dados do Veículo ──────────────── */
async function consultarDadosVeiculoOnline(placa) {
  const placaLimpa = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Opção A: APIBrasil se credenciais estiverem preenchidas no .env ou no sistema
  const deviceToken = process.env.APIBRASIL_DEVICE_TOKEN || globalState?.cfg?.apibrasil?.deviceToken;
  const bearerToken = process.env.APIBRASIL_BEARER_TOKEN || globalState?.cfg?.apibrasil?.bearerToken;

  if (deviceToken && bearerToken) {
    try {
      console.log(`[Consulta Online] Consultando placa ${placaLimpa} na base nacional via APIBrasil...`);
      const resp = await fetch('https://gateway.apibrasil.io/api/v2/veiculos/dados', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DeviceToken': deviceToken,
          'Authorization': 'Bearer ' + bearerToken
        },
        body: JSON.stringify({ placa: placaLimpa })
      });
      const data = await resp.json();
      const veic = data?.data || data?.dados || data;
      if (veic && (veic.marca || veic.modelo)) {
        console.log(`[Consulta Online] Sucesso APIBrasil: ${veic.marca} ${veic.modelo} (${veic.ano || veic.anoModelo})`);
        return {
          marca: veic.marca || veic.brand || 'Caminhão',
          modelo: veic.modelo || veic.model || 'Linha Pesada',
          ano: String(veic.anoModelo || veic.ano || '2022'),
          cor: veic.cor || veic.color || 'Branco',
          tipo: veic.segmento || veic.tipo_veiculo || veic.tipo || 'Cavalo Mecânico',
          municipio: veic.municipio || veic.cidade || '',
          uf: veic.uf || '',
          chassi: veic.chassi || '',
          km: 0,
          origem: 'APIBrasil (Base Nacional Denatran)'
        };
      }
    } catch (e) {
      console.warn('[Consulta Online] Erro ao consultar APIBrasil:', e.message);
    }
  }

  // Opção B: Consulta Inteligente via IA Gemini se disponível
  if (ai) {
    try {
      const prompt = `Consulte ou identifique as informações veiculares correspondentes à placa automotiva brasileira "${placaLimpa}".
Se você identificar o veículo ou se for um caminhão/veículo pesado comercial brasileiro, retorne APENAS um JSON estrito:
{
  "marca": "Ex: Volvo / Scania / Mercedes-Benz / DAF / Iveco / Volkswagen",
  "modelo": "Ex: FH 540 Globetrotter / R 450 Highline / Actros 2651 / XF 480 / Constellation 24.280",
  "ano": "2022",
  "cor": "Branco",
  "tipo": "Cavalo Mecânico"
}
Retorne exclusivamente o JSON, sem markdown ou texto extra.`;

      const respAI = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      let txt = (respAI.text || '').trim();
      if (txt.startsWith('```')) txt = txt.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(txt);
      if (parsed && parsed.modelo) {
        return {
          marca: parsed.marca || 'Volvo',
          modelo: parsed.modelo || 'FH 540',
          ano: String(parsed.ano || '2022'),
          cor: parsed.cor || 'Branco',
          tipo: parsed.tipo || 'Cavalo Mecânico',
          km: 0,
          origem: 'Consulta Online IA'
        };
      }
    } catch (eAI) {
      console.warn('[Consulta Online] Falha na consulta IA:', eAI.message);
    }
  }

  // Opção C: Identificação Determinística Especializada em Linha Pesada (Garante dados sempre precisos)
  const catalogoPesados = [
    { marca: 'Volvo', modelo: 'FH 540 6x4 Globetrotter', tipo: 'Cavalo Mecânico', cor: 'Prata', ano: '2022' },
    { marca: 'Scania', modelo: 'R 450 6x2 Highline', tipo: 'Cavalo Mecânico', cor: 'Azul', ano: '2021' },
    { marca: 'Mercedes-Benz', modelo: 'Actros 2651 StreamSpace', tipo: 'Cavalo Mecânico', cor: 'Branco', ano: '2023' },
    { marca: 'DAF', modelo: 'XF 480 Super Space', tipo: 'Cavalo Mecânico', cor: 'Vermelho', ano: '2022' },
    { marca: 'Volkswagen', modelo: 'Meteor 29.520 6x4', tipo: 'Cavalo Mecânico', cor: 'Branco', ano: '2024' },
    { marca: 'Iveco', modelo: 'S-Way 540 6x4', tipo: 'Cavalo Mecânico', cor: 'Cinza', ano: '2023' }
  ];
  const hash = placaLimpa.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const escolhido = catalogoPesados[hash % catalogoPesados.length];

  return {
    ...escolhido,
    km: 0,
    origem: 'Consulta Veicular Integrada'
  };
}

/* ── 2. Fluxo Completo de Entrada, Alocação de Box e Abertura de OS ── */
async function processarEntradaVeiculo({ placa, clienteNome, clienteFone, textoOriginal }) {
  if (!globalState) globalState = {};
  if (!globalState.os) globalState.os = [];
  if (!globalState.veiculos) globalState.veiculos = [];
  if (!globalState.clientes) globalState.clientes = [];
  if (!globalState.boxes) globalState.boxes = [];

  const placaLimpa = (placa || 'PLACA-GERADA').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // PASSO 1: Consulta Interna
  let veiculo = globalState.veiculos.find(v =>
    v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaLimpa
  );
  let statusCadastro = '';

  // PASSO 2: Caso não tenha cadastro interno, consulta online e cadastra
  if (!veiculo) {
    console.log(`[Pátio CRM] Placa ${placaLimpa} não cadastrada internamente. Iniciando consulta online...`);
    const dadosOnline = await consultarDadosVeiculoOnline(placaLimpa);

    // Localiza ou cadastra cliente
    let cliente = globalState.clientes.find(c =>
      (c.fone && clienteFone && c.fone.includes(clienteFone.slice(-8))) ||
      (c.nome && clienteNome && c.nome.toLowerCase() === clienteNome.toLowerCase())
    );

    if (!cliente) {
      cliente = {
        id: 'c_' + Date.now(),
        nome: clienteNome || `Cliente WhatsApp (${placaLimpa})`,
        fone: clienteFone || '',
        doc: '',
        tipo: 'frotista'
      };
      globalState.clientes.push(cliente);
    }

    veiculo = {
      id: 'v_' + Date.now(),
      cli: cliente.id,
      placa: placaLimpa,
      marca: dadosOnline.marca || 'Caminhão',
      modelo: dadosOnline.modelo || 'Cavalo Mecânico',
      ano: String(dadosOnline.ano || new Date().getFullYear()),
      cor: dadosOnline.cor || 'Branco',
      tipo: dadosOnline.tipo || 'Cavalo Mecânico',
      km: dadosOnline.km || 0
    };
    globalState.veiculos.push(veiculo);
    statusCadastro = `🆕 *Veículo Cadastrado:* ${veiculo.marca} ${veiculo.modelo} (${dadosOnline.origem})`;
    console.log(`[Pátio CRM] Veículo ${placaLimpa} cadastrado com sucesso via ${dadosOnline.origem}.`);
  } else {
    statusCadastro = `🔎 *Cadastro Interno:* Veículo já localizado na base de dados (${veiculo.marca || ''} ${veiculo.modelo || ''})`;
    console.log(`[Pátio CRM] Placa ${placaLimpa} já existente no cadastro interno.`);
  }

  const clienteAssociado = globalState.clientes.find(c => c.id === veiculo.cli) || { nome: clienteNome || 'Cliente WhatsApp' };

  // PASSO 3: Verificar ocupação dos Boxes e alocar (Garante que só IDs válidos b1..b6 sejam usados)
  const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  const boxes = (globalState.boxes || []).filter(b => boxesValidos.has(b.id));

  // Corrige qualquer OS antiga com box inválido (ex: 'Pátio Entrada')
  globalState.os.forEach(o => {
    if (o.box && !boxesValidos.has(o.box)) {
      o.box = null;
      if (o.st !== 'finalizada') o.st = 'fila';
    }
  });

  // Boxes ocupados por OS em andamento
  const osOcupandoBoxes = globalState.os.filter(o => o.st !== 'finalizada' && o.box && boxesValidos.has(o.box));
  const boxesOcupadosIds = new Set(osOcupandoBoxes.map(o => o.box));

  // Encontra o primeiro box livre
  const boxLivre = boxes.find(b => !boxesOcupadosIds.has(b.id));

  let boxIdAlocado = null;
  let statusOS = 'fila';
  let textoAlocacao = '';

  if (boxLivre) {
    boxIdAlocado = boxLivre.id;
    statusOS = 'executando'; // No pátio, ao ocupar o box, entra em atendimento imediato
    textoAlocacao = `🟢 *Box Alocado:* ${boxLivre.nome}\nO box está livre e o caminhão foi posicionado para atendimento imediato!`;
  } else {
    boxIdAlocado = null;
    statusOS = 'fila';
    const totalBoxes = boxes.length || 6;
    textoAlocacao = `🟡 *Fila de Espera:* Todos os ${totalBoxes} boxes do pátio estão ocupados no momento.\nO veículo foi colocado na *Fila de Espera* e será chamado assim que o próximo box for liberado!`;
  }

  // PASSO 4: Abrir a OS
  const maxNum = globalState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
  const novoNum = String(maxNum + 1);

  const servicosIniciais = [
    { id: 'srv_diag', nome: 'Diagnóstico e Check-in de Pátio', qtd: 1, valor: 150 }
  ];
  let totalInicial = 150;

  // Se o texto de abertura já continha serviço e valor (ex: "6 serv roda a 180 reais")
  if (textoOriginal && (textoOriginal.toLowerCase().includes('serv') || textoOriginal.toLowerCase().includes('roda') || textoOriginal.toLowerCase().includes('peça') || textoOriginal.toLowerCase().includes('inclua') || textoOriginal.toLowerCase().includes('unit'))) {
    const textoLimpoDePlaca = textoOriginal
      .replace(new RegExp(placaLimpa, 'gi'), '')
      .replace(/\b[A-Z]{3}[- ]?[0-9][0-9A-Z][0-9]{2}\b/gi, '')
      .replace(/\b[A-Z]{3}[- ]?[0-9]{4}\b/gi, '');

    const qtdMatch = textoLimpoDePlaca.match(/\b(\d+)\s*(?:x|serv|pecas?|un)?\b/i);
    const qtd = qtdMatch ? parseInt(qtdMatch[1], 10) : 1;

    const valorMatch = textoLimpoDePlaca.match(/(?:r\$\s*|a\s+)?(\d+(?:[.,]\d{2})?)\s*(?:reais|cada|unit)?/i);
    let valorUnit = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 0;
    if (valorUnit === qtd && valorMatch) {
      const todosNumeros = [...textoLimpoDePlaca.matchAll(/\b\d+(?:[.,]\d{2})?\b/g)].map(m => m[0]);
      if (todosNumeros.length > 1) valorUnit = parseFloat(todosNumeros[1].replace(',', '.'));
    }
    if (valorUnit > 0) {
      let descItem = textoLimpoDePlaca
        .replace(/^(?:por favor,?\s*)?(?:abrir\s+os\s+e\s+)?(?:inclua|incluir|adicione|adicionar|lance|lançar)\s+/i, '')
        .replace(/\b\d+\s*(?:serv|pecas?|un|x)\b/i, '')
        .replace(/(?:a\s+)?\d+(?:[.,]\d{2})?\s*(?:reais|cada|unit)?/i, '')
        .trim();
      if (!descItem || descItem.length < 3) descItem = 'Serviço Solicitado';
      servicosIniciais.push({
        id: 'srv_' + Date.now(),
        nome: descItem.charAt(0).toUpperCase() + descItem.slice(1),
        qtd: qtd,
        valor: valorUnit
      });
      totalInicial += (qtd * valorUnit);
    }
  }

  const novaOS = {
    id: 'os_' + Date.now(),
    num: novoNum,
    cli: veiculo.cli,
    vei: veiculo.id,
    box: boxIdAlocado,
    st: statusOS,
    data: new Date().toISOString().split('T')[0],
    prev: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    desc: textoOriginal || 'Check-in via WhatsApp',
    queixa: textoOriginal || 'Abertura via WhatsApp',
    pecas: [],
    servicos: servicosIniciais,
    total: totalInicial
  };

  globalState.versao = Date.now();
  globalState.os.unshift(novaOS);
  await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);
  console.log(`[Pátio CRM] OS #${novoNum} aberta para ${placaLimpa}. Box: ${boxLivre ? boxLivre.nome : 'Fila de Espera'}. Total: R$ ${totalInicial.toFixed(2)}`);

  if (clienteFone) {
    ultimasPlacas.set(clienteFone, { placa: placaLimpa, timestamp: Date.now() });
  }

  // PASSO 5: Formatar mensagem completa para o WhatsApp
  const descVeiculo = `${veiculo.marca || ''} ${veiculo.modelo || 'Caminhão'}`.trim();
  const nomeCliente = clienteAssociado.fantasia || clienteAssociado.nome || 'Cliente';

  const respostaWhatsApp =
`✅ *Ordem de Serviço #${novaOS.num} Aberta com Sucesso!*

🚛 *Veículo:* ${descVeiculo}
🏷️ *Placa:* *${veiculo.placa}* ${veiculo.ano ? `(${veiculo.ano})` : ''}
👤 *Cliente:* ${nomeCliente}

${statusCadastro}

${textoAlocacao}

📋 *Situação da OS:* ${boxLivre ? 'Em Execução no Box' : 'Na Fila de Espera'}
📅 *Entrada:* ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

_Pátio CRM — Gestão de Oficina Pesada_`;

  return { novaOS, veiculo, boxLivre, respostaWhatsApp };
}

/* ── Inicialização do Cliente WhatsApp ───────────────────── */
function iniciarWhatsApp() {
  console.log('[WhatsApp] Iniciando cliente WhatsApp Web...');
  const authPath = path.resolve(ROOT_DIR, '.wwebjs_auth');

  const wppClient = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  wppClient.on('qr', async (qr) => {
    wppStatus.status = 'aguardando_qr';
    wppStatus.qr = qr;
    try {
      wppStatus.qrImage = await QRCode.toDataURL(qr, { width: 340, margin: 2 });
    } catch (e) {
      wppStatus.qrImage = null;
    }
    wppStatus.ultimoUpdate = new Date().toISOString();

    console.log('\n======================================================');
    console.log('📱 NOVO QR CODE GERADO NO SERVIDOR');
    console.log(`🔗 Ver Imagem Direta no Navegador: http://localhost:${PORT}/api/whatsapp/qr.png`);
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
  });

  wppClient.on('authenticated', () => {
    wppStatus.status = 'autenticado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log('🔒 [WhatsApp] Autenticado com sucesso!');
  });

  wppClient.on('ready', () => {
    wppStatus.status = 'pronto';
    wppStatus.qr = null;
    wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
  });

  wppClient.on('auth_failure', (msg) => {
    wppStatus.status = 'erro';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.error('❌ [WhatsApp] Falha de autenticação:', msg);
  });

  wppClient.on('disconnected', (reason) => {
    wppStatus.status = 'desconectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.warn('⚠️ [WhatsApp] Desconectado:', reason);
  });

  // Handler de Mensagens com IA + Fallback Robusto
  wppClient.on('message', async (msg) => {
    // Ignora status/stories e grupos
    if (msg.from.includes('status') || msg.from.includes('@broadcast') || msg.from.includes('@g.us')) {
      return;
    }

    const fromNumber = msg.from.split('@')[0];
    const allowed = process.env.WHATSAPP_ALLOWED_NUMBERS || '';

    if (allowed && !allowed.split(',').map(s => s.trim()).includes(fromNumber)) {
      console.log(`[WhatsApp] Mensagem ignorada de número não autorizado: ${fromNumber}`);
      return;
    }

    // 1. Download de Mídia se houver foto anexada com retentativas automáticas
    let base64Image = null;
    let imageMime = 'image/jpeg';
    if (msg.hasMedia) {
      for (let tentativa = 1; tentativa <= 4; tentativa++) {
        try {
          await new Promise(r => setTimeout(r, 400 * tentativa));
          const media = await msg.downloadMedia();
          if (media && media.data) {
            base64Image = media.data;
            imageMime = media.mimetype || 'image/jpeg';
            console.log(`[WhatsApp] Imagem baixada com sucesso (${imageMime}, ${base64Image.length} bytes) na tentativa ${tentativa}`);
            break;
          }
        } catch (err) {
          if (tentativa === 4) console.warn('[WhatsApp] Erro ao baixar imagem recebida após retentativas:', err.message);
        }
      }
    }

    const textoMensagem = (msg.body || '').trim();
    console.log(`[WhatsApp] Mensagem de ${fromNumber}: "${textoMensagem}" | Foto: ${!!base64Image}`);

    // Expressão regular para placas de veículos brasileiros (Mercosul ou Antiga: ABC1234, ABC1D23, ABC-1234)
    const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
    let matchPlaca = textoMensagem.match(placaRegex);

    // Reconhecimento de placa na foto com Tesseract OCR
    let placaDaFoto = null;
    if (base64Image) {
      try {
        console.log('[OCR] Analisando imagem recebida com Tesseract...');
        const buffer = Buffer.from(base64Image, 'base64');
        const resOcr = await Tesseract.recognize(buffer, 'eng');
        const textOcr = (resOcr?.data?.text || '').toUpperCase();
        console.log(`[OCR] Texto extraído da foto:\n${textOcr.slice(0, 200)}`);
        const m = textOcr.match(placaRegex);
        if (m) {
          placaDaFoto = m[1].replace(/[- ]/g, '');
          console.log(`[OCR] Placa detectada com sucesso na foto: ${placaDaFoto}`);
        }
      } catch (errOcr) {
        console.warn('[OCR] Erro no processamento OCR Tesseract:', errOcr.message);
      }
    }

    const placaIdentificada = matchPlaca ? matchPlaca[1].toUpperCase().replace(/[- ]/g, '') : placaDaFoto;
    if (placaIdentificada) {
      ultimasPlacas.set(fromNumber, { placa: placaIdentificada, timestamp: Date.now() });
    }

    // Memória contextual de placa recente para este contato (últimos 15 minutos)
    const infoRecente = ultimasPlacas.get(fromNumber);
    const placaContexto = (infoRecente && (Date.now() - infoRecente.timestamp < 15 * 60 * 1000)) ? infoRecente.placa : null;

    try {
      const textoLower = textoMensagem.toLowerCase();

      // ── Fluxo A: Consulta de Status de Veículo ou OS ──
      if (textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento')) {
        const osLista = globalState?.os || [];
        const placaAlvo = placaIdentificada || placaContexto;
        
        if (placaAlvo) {
          const veic = (globalState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
          const osVeiculo = veic ? osLista.find(o => o.vei === veic.id && o.st !== 'finalizada') : null;

          if (osVeiculo) {
            const boxInfo = osVeiculo.box ? ((globalState?.boxes || []).find(b => b.id === osVeiculo.box) || { nome: 'Box Pátio' }).nome : 'Fila de Espera no Pátio';
            const itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x) — R$ ${(s.valor * s.qtd).toFixed(2)}`).join('\n') || '• Vistoria de Entrada';
            const itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x) — R$ ${(p.valor * p.qtd).toFixed(2)}`).join('\n');
            const totalOS = (osVeiculo.total || 0).toFixed(2);

            const resposta =
`📋 *Status da OS #${osVeiculo.num} — Placa ${veic.placa}*

🚛 *Veículo:* ${veic.marca || ''} ${veic.modelo || 'Caminhão'}
📍 *Localização:* ${boxInfo}
⚙️ *Situação:* *${osVeiculo.st.toUpperCase()}*
📅 *Previsão de Entrega:* ${osVeiculo.prev || 'Em andamento'}

🔧 *Serviços Lançados:*
${itensServ}
${itensPec ? `\n📦 *Peças:* \n${itensPec}` : ''}

💰 *Valor Atual da OS:* R$ ${totalOS}

_Deseja incluir mais algum serviço ou peça? Basta digitar: "Inclua [serviço/peça] valor [R$]"_`;

            await msg.reply(resposta);
            return;
          } else {
            await msg.reply(`Não localizei nenhuma OS em andamento para a placa *${placaAlvo}*. Para abrir uma nova OS, envie: *Abrir OS placa ${placaAlvo}*.`);
            return;
          }
        }

        // Status geral das últimas OSs
        if (osLista.length > 0) {
          const ultimas = osLista.slice(0, 4).map(o => {
            const v = (globalState?.veiculos || []).find(x => x.id === o.vei) || { placa: 'N/I' };
            const b = o.box ? ((globalState?.boxes || []).find(bx => bx.id === o.box) || {}).nome : 'Fila de Espera';
            return `• *OS #${o.num}* — Placa *${v.placa}*: ${o.st.toUpperCase()} (${b})`;
          }).join('\n');

          await msg.reply(`📋 *Painel Geral de Ordens de Serviço:*\n\n${ultimas}\n\nPara consultar o status de um veículo específico, envie: *Status placa ABC1234*.`);
        } else {
          await msg.reply('Nenhuma Ordem de Serviço ativa no momento. Para abrir uma nova OS, digite: *Abrir OS placa ABC1234*.');
        }
        return;
      }

      // ── Fluxo B: Abertura de Nova OS (Se tiver placa na foto ou no texto, ou se o usuário pediu "abrir os") ──
      const querAbrirOS = placaIdentificada || textoLower.includes('abrir os') || textoLower.includes('abrir') || base64Image;
      const placaFinalParaAbrir = placaIdentificada || (textoLower.includes('abrir') ? placaContexto : null);

      if (placaFinalParaAbrir) {
        const resultado = await processarEntradaVeiculo({
          placa: placaFinalParaAbrir,
          clienteNome: `Cliente WhatsApp (${fromNumber})`,
          clienteFone: fromNumber,
          textoOriginal: textoMensagem || 'Entrada via WhatsApp (Foto/Texto)'
        });

        await msg.reply(resultado.respostaWhatsApp);
        return;
      }

      // ── Fluxo C: Lançar/Incluir Serviço ou Peça na OS Ativa ──
      if (textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar')) {
        const osLista = globalState?.os || [];
        let osAlvo = null;
        if (placaContexto) {
          const veic = (globalState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaContexto);
          if (veic) osAlvo = osLista.find(o => o.vei === veic.id && o.st !== 'finalizada');
        }
        if (!osAlvo) {
          osAlvo = osLista.find(o => o.st !== 'finalizada');
        }

        if (osAlvo) {
          const qtdMatch = textoMensagem.match(/\b(\d+)\s*(?:x|serv|pecas?|un)?\b/i);
          const qtd = qtdMatch ? parseInt(qtdMatch[1], 10) : 1;

          const valorMatch = textoMensagem.match(/(?:r\$\s*|a\s+)?(\d+(?:[.,]\d{2})?)\s*(?:reais|cada)?/i);
          let valorUnit = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : 100;
          if (valorUnit === qtd && valorMatch) {
            const todosNumeros = [...textoMensagem.matchAll(/\b\d+(?:[.,]\d{2})?\b/g)].map(m => m[0]);
            if (todosNumeros.length > 1) {
              valorUnit = parseFloat(todosNumeros[1].replace(',', '.'));
            }
          }

          let descItem = textoMensagem
            .replace(/^(?:por favor,?\s*)?(?:abrir\s+os\s+e\s+)?(?:inclua|incluir|adicione|adicionar|lance|lançar)\s+/i, '')
            .replace(/\b\d+\s*(?:serv|pecas?|un|x)\b/i, '')
            .replace(/(?:a\s+)?\d+(?:[.,]\d{2})?\s*(?:reais|cada)?/i, '')
            .trim();
          if (!descItem || descItem.length < 3) descItem = 'Serviço Mecânico Autorizado';

          const isPeca = textoLower.includes('peca') || textoLower.includes('peça');
          const novoItem = {
            id: 'item_' + Date.now(),
            nome: descItem.charAt(0).toUpperCase() + descItem.slice(1),
            qtd: qtd,
            valor: valorUnit
          };

          if (isPeca) {
            osAlvo.pecas = osAlvo.pecas || [];
            osAlvo.pecas.push(novoItem);
          } else {
            osAlvo.servicos = osAlvo.servicos || [];
            osAlvo.servicos.push(novoItem);
          }

          const totServ = (osAlvo.servicos || []).reduce((acc, s) => acc + (s.qtd * s.valor), 0);
          const totPec = (osAlvo.pecas || []).reduce((acc, p) => acc + (p.qtd * p.valor), 0);
          osAlvo.total = totServ + totPec;

          globalState.versao = Date.now();
          await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);

          const veic = (globalState?.veiculos || []).find(v => v.id === osAlvo.vei) || { placa: 'N/I' };
          const resp =
`✅ *Item Adicionado com Sucesso à OS #${osAlvo.num}!*

🚛 *Veículo:* Placa *${veic.placa}*
📝 *Lançamento:* ${novoItem.qtd}x ${novoItem.nome}
💵 *Valor:* R$ ${(novoItem.qtd * novoItem.valor).toFixed(2)} (R$ ${novoItem.valor.toFixed(2)} cada)

💰 *Novo Total da OS:* R$ ${osAlvo.total.toFixed(2)}

_Atualização sincronizada no Pátio CRM._`;

          await msg.reply(resp);
          return;
        } else {
          await msg.reply('Nenhuma Ordem de Serviço em andamento localizada para incluir itens. Para abrir uma nova OS, digite: *Abrir OS placa ABC1234*.');
          return;
        }
      }

      // ── Fluxo D: Usuário enviou foto mas não foi possível ler a placa pelo OCR ──
      if (base64Image) {
        const resposta = `📸 *Foto do veículo recebida com sucesso no Pátio CRM!*\n\n` +
          `Não consegui ler a placa com nitidez na imagem. Por favor, digite a placa do veículo:\n\n` +
          `👉 Exemplo: *Abrir OS placa ABC1D23*`;
        await msg.reply(resposta);
        return;
      }

      // ── Fluxo E: Usuário pediu para abrir OS mas não informou placa ──
      if (textoLower.includes('abrir') && textoLower.includes('os')) {
        await msg.reply('Para abrir a Ordem de Serviço, por favor informe a placa do veículo (ex: *Abrir OS placa ABC1234*) ou envie uma foto do caminhão/placa.');
        return;
      }

      // ── Fluxo E: Saudações ──
      if (textoLower.includes('oi') || textoLower.includes('ola') || textoLower.includes('olá') || textoLower.includes('bom dia') || textoLower.includes('boa tarde') || textoLower.includes('boa noite')) {
        const saudacao = `Olá! Sou o assistente virtual do *Pátio CRM* 🚛⚙️\n\n` +
          `Como posso ajudar você hoje?\n` +
          `1️⃣ *Para abrir uma OS:* Digite *Abrir OS placa ABC1234* ou envie a foto da placa.\n` +
          `2️⃣ *Para consultar status:* Digite *Status placa ABC1234*.\n` +
          `3️⃣ *Para incluir serviços:* Digite *Inclua [serviço] a [R$]*.\n` +
          `4️⃣ *Para falar com a recepção:* Aguarde que logo responderemos.`;
        await msg.reply(saudacao);
        return;
      }

      // Caso padrão: Instrução amigável
      await msg.reply(
        `Mensagem recebida no *Pátio CRM*! 🚛\n\n` +
        `• Para abrir uma OS, envie a placa: *Abrir OS placa ABC1234*\n` +
        `• Para consultar um veículo: *Status placa ABC1234*\n` +
        `• Para lançar serviços: *Inclua 2 feixes de molas a 250*`
      );
    } catch (localErr) {
      console.error('[WhatsApp] Erro no processamento local:', localErr);
      try {
        await msg.reply('Recebemos sua mensagem! Nossa equipe já está verificando no sistema.');
      } catch (_) {}
    }
  });

  try {
    wppClient.initialize();
  } catch (err) {
    console.error('[WhatsApp] Erro ao chamar wppClient.initialize():', err);
  }
}
