require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB, all, run, get } = require('./db');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { GoogleGenAI } = require('@google/genai');
const Tesseract = require('tesseract.js');

// Memória de curto prazo para placas enviadas recentemente por número de telefone
const ultimasPlacas = new Map();

// Limpeza periódica do mapa de placas (TTL 15 minutos)
setInterval(() => {
  const agora = Date.now();
  for (const [key, val] of ultimasPlacas) {
    if (agora - (val.ts || 0) > 15 * 60 * 1000) ultimasPlacas.delete(key);
  }
}, 5 * 60 * 1000);

// Mutex para serialização de escritas no banco
let _writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  _writeQueue = _writeQueue.then(fn).catch(err => {
    console.error('[DB Write Queue] Erro na escrita:', err);
  });
  return _writeQueue;
}

// Helper para salvar estado de forma segura (serializado via mutex)
function salvarEstado() {
  return enqueueWrite(async () => {
    if (!globalState) return;
    globalState.versao = Date.now();
    await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);
  });
}

// Gerador de IDs únicos (evita colisão por timestamp)
function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Helper para sanitizar HTML (proteção contra XSS no Puppeteer)
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Safe JSON parse — extrai bloco JSON e retorna null em vez de throw
function safeJsonParse(text) {
  if (!text) return null;
  try {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    const matchArr = cleaned.match(/\[[\s\S]*\]/);
    if (matchArr) return JSON.parse(matchArr[0]);
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[safeJsonParse] Falha ao parsear JSON:', e.message);
    return null;
  }
}

// API Key para endpoints administrativos
const API_KEY = process.env.API_KEY || '';
function authMiddleware(req, res, next) {
  if (!API_KEY) return next(); // Se não configurada, pular autenticação
  const key = req.headers['x-api-key'] || req.query.apikey || '';
  if (key === API_KEY) return next();

  // Permite requisições originadas legitimamente da interface web (mesma origem / intranet)
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const host = req.headers.host || '';
  const secFetchSite = req.headers['sec-fetch-site'] || '';
  const isSameOrigin = secFetchSite === 'same-origin' ||
    (origin && host && origin.includes(host)) ||
    (referer && host && referer.includes(host));

  if (isSameOrigin) return next();

  return res.status(401).json({ error: 'Não autorizado. Forneça X-API-Key válida.' });
}

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
app.use(helmet({
  contentSecurityPolicy: false, // CSP gerenciado separadamente para compatibilidade
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: function(origin, callback) {
    // Permite requisições sem origin (Postman, curl, etc.) e localhost
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS não permitido para esta origem'));
    }
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate limiting global para API (com margem para sincronização em tempo real e operadores locais)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5000,
  skip: (req) => {
    // Bypass para polling ultra-leve de versão (usado por múltiplos monitores/tablets na oficina)
    const p = req.path || '';
    if (p === '/api/versao' || p === '/versao') return true;
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
    return ip.includes('127.0.0.1') || ip.includes('::1') || ip === 'localhost';
  },
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

/* ── Bloqueio de Arquivos Sensíveis & Proteção Path Traversal ── */
const BLOCKED_PATTERNS = [
  /^\./,
  /\.env$/i,
  /\.db$/i,
  /\.db-wal$/i,
  /\.db-shm$/i,
  /\.log$/i,
  /\.js$/i,
  /\.py$/i,
  /\.zip$/i,
  /\.bak$/i,
  /package\.json/i,
  /package-lock\.json/i,
  /node_modules/i
];

// Exceções: JS do frontend que DEVEM ser acessíveis
const ALLOWED_JS_DIRS = ['js'];

app.use((req, res, next) => {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(req.path || '');
  } catch (e) {
    return res.status(400).send('400 Bad Request: URI inválida.');
  }

  // Normalização estrita contra Windows path traversal (\ e %5c)
  const normalizedPath = path.normalize(cleanPath).replace(/\\/g, '/');
  if (normalizedPath.includes('..')) {
    return res.status(403).send('403 Forbidden: Acesso bloqueado (traversal detectado).');
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  const isBlocked = segments.some((seg, idx) => {
    const blocked = BLOCKED_PATTERNS.some(pat => pat.test(seg));
    if (!blocked) return false;
    // Permitir arquivos .js dentro de pastas autorizadas (js/)
    if (/\.js$/i.test(seg) && idx > 0 && ALLOWED_JS_DIRS.includes(segments[idx - 1])) return false;
    return true;
  });
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

app.get('/api/backup/download', async (req, res) => {
  try {
    if (!globalState) {
      const rows = await all("SELECT value FROM kv WHERE key = 'state'");
      if (rows && rows.length > 0) globalState = JSON.parse(rows[0].value);
    }
    const dHoje = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `backup_patio_crm_${dHoje}_${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(globalState || {}, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/estado', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const incoming = req.body || {};
    const excluidosOS = new Set(incoming._excluidos?.os || []);
    const excluidosVei = new Set(incoming._excluidos?.veiculos || []);
    const excluidosCli = new Set(incoming._excluidos?.clientes || []);
    const excluidosPec = new Set(incoming._excluidos?.pecas || []);
    delete incoming._excluidos; // Não persiste estrutura temporária

    const versaoCliente = incoming.versao || 0;

    // Preserva OSs e Veículos criados concorrentemente pelo WhatsApp/Servidor sem ressuscitar itens excluídos pelo usuário
    if (globalState && globalState.os && Array.isArray(incoming.os)) {
      const idsIncoming = new Set(incoming.os.map(o => o.id));
      const extras = globalState.os.filter(o => 
        !idsIncoming.has(o.id) &&
        !excluidosOS.has(o.id) &&
        (o.criadoEm && o.criadoEm > versaoCliente)
      );
      if (extras.length > 0) {
        incoming.os = [...extras, ...incoming.os];
      }
    }
    if (globalState && globalState.veiculos && Array.isArray(incoming.veiculos)) {
      const idsIncomingVei = new Set(incoming.veiculos.map(v => v.id));
      const extrasVei = globalState.veiculos.filter(v => 
        !idsIncomingVei.has(v.id) &&
        !excluidosVei.has(v.id) &&
        (v.criadoEm && v.criadoEm > versaoCliente)
      );
      if (extrasVei.length > 0) {
        incoming.veiculos = [...incoming.veiculos, ...extrasVei];
      }
    }

    incoming.versao = Date.now();
    globalState = incoming;
    await salvarEstado();
    res.json({ success: true, timestamp: Date.now(), versao: globalState.versao });
  } catch (error) {
    console.error('[API /api/estado POST] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backup/importar', express.json({ limit: '100mb' }), async (req, res) => {
  try {
    const { dados, modo = 'mesclar' } = req.body || {};
    if (!dados || typeof dados !== 'object') {
      return res.status(400).json({ success: false, error: 'Objeto de dados inválido para importação.' });
    }

    const stats = {
      clientes: { inseridos: 0, atualizados: 0 },
      veiculos: { inseridos: 0, atualizados: 0 },
      pecas: { inseridos: 0, atualizados: 0 },
      servicos: { inseridos: 0, atualizados: 0 },
      fornecedores: { inseridos: 0, atualizados: 0 },
      os: { inseridos: 0, atualizados: 0 },
      contas: { inseridos: 0, atualizados: 0 }
    };

    await enqueueWrite(async () => {
      if (!globalState) globalState = {};
      if (modo === 'substituir') {
        const cfgAtual = globalState.cfg || {};
        const incomingCfg = dados.cfg || {};
        dados.cfg = {
          ...cfgAtual,
          ...incomingCfg,
          grupoAdminId: incomingCfg.grupoAdminId || cfgAtual.grupoAdminId,
          grupoOperacaoId: incomingCfg.grupoOperacaoId || cfgAtual.grupoOperacaoId,
          adminFones: incomingCfg.adminFones || cfgAtual.adminFones
        };
        dados.versao = Date.now();
        globalState = dados;

        stats.clientes.inseridos = (globalState.clientes || []).length;
        stats.veiculos.inseridos = (globalState.veiculos || []).length;
        stats.pecas.inseridos = (globalState.pecas || []).length;
        stats.servicos.inseridos = (globalState.servicos || []).length;
        stats.fornecedores.inseridos = (globalState.fornecedores || []).length;
        stats.os.inseridos = (globalState.os || []).length;
        stats.contas.inseridos = (globalState.contas || []).length;
      } else {
        if (!globalState.clientes) globalState.clientes = [];
        if (!globalState.veiculos) globalState.veiculos = [];
        if (!globalState.pecas) globalState.pecas = [];
        if (!globalState.servicos) globalState.servicos = [];
        if (!globalState.fornecedores) globalState.fornecedores = [];
        if (!globalState.os) globalState.os = [];
        if (!globalState.contas) globalState.contas = [];

        // 1. Clientes
        if (Array.isArray(dados.clientes)) {
          for (const inc of dados.clientes) {
            const docLimpo = (inc.doc || '').replace(/\D/g, '');
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = globalState.clientes.find(c =>
              (docLimpo && (c.doc || '').replace(/\D/g, '') === docLimpo) ||
              (nomeNorm && (c.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.clientes.atualizados++;
            } else {
              inc.id = inc.id || gerarId('c');
              globalState.clientes.push(inc);
              stats.clientes.inseridos++;
            }
          }
        }

        // 2. Veículos
        if (Array.isArray(dados.veiculos)) {
          for (const inc of dados.veiculos) {
            const placaNorm = (inc.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const exist = globalState.veiculos.find(v => (v.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === placaNorm);
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.veiculos.atualizados++;
            } else {
              inc.id = inc.id || gerarId('v');
              inc.placa = placaNorm || inc.placa;
              globalState.veiculos.push(inc);
              stats.veiculos.inseridos++;
            }
          }
        }

        // 3. Peças / Estoque
        if (Array.isArray(dados.pecas)) {
          for (const inc of dados.pecas) {
            const codNorm = (inc.cod || '').trim().toLowerCase();
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = globalState.pecas.find(p =>
              (codNorm && (p.cod || '').trim().toLowerCase() === codNorm) ||
              (nomeNorm && (p.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              exist.qtd = (exist.qtd || 0) + (Number(inc.qtd) || 0);
              if (inc.custo) exist.custo = Number(inc.custo);
              if (inc.venda) exist.venda = Number(inc.venda);
              if (inc.loc && !exist.loc) exist.loc = inc.loc;
              if (inc.forn && !exist.forn) exist.forn = inc.forn;
              stats.pecas.atualizados++;
            } else {
              inc.id = inc.id || gerarId('p');
              globalState.pecas.push(inc);
              stats.pecas.inseridos++;
            }
          }
        }

        // 4. Serviços
        if (Array.isArray(dados.servicos)) {
          for (const inc of dados.servicos) {
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = globalState.servicos.find(s => (s.nome || '').trim().toLowerCase() === nomeNorm);
            if (exist) {
              if (inc.valor) exist.valor = Number(inc.valor);
              if (inc.horas) exist.horas = Number(inc.horas);
              stats.servicos.atualizados++;
            } else {
              inc.id = inc.id || gerarId('s');
              globalState.servicos.push(inc);
              stats.servicos.inseridos++;
            }
          }
        }

        // 5. Fornecedores
        if (Array.isArray(dados.fornecedores)) {
          for (const inc of dados.fornecedores) {
            const docLimpo = (inc.doc || '').replace(/\D/g, '');
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = globalState.fornecedores.find(f =>
              (docLimpo && (f.doc || '').replace(/\D/g, '') === docLimpo) ||
              (nomeNorm && (f.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.fornecedores.atualizados++;
            } else {
              inc.id = inc.id || gerarId('f');
              globalState.fornecedores.push(inc);
              stats.fornecedores.inseridos++;
            }
          }
        }

        // 6. Ordens de Serviço (OS)
        if (Array.isArray(dados.os)) {
          for (const inc of dados.os) {
            const numStr = String(inc.num || '');
            const exist = globalState.os.find(o => String(o.num) === numStr);
            if (exist) {
              stats.os.atualizados++;
            } else {
              inc.id = inc.id || gerarId('os');
              globalState.os.push(inc);
              stats.os.inseridos++;
            }
          }
        }

        // 7. Contas
        if (Array.isArray(dados.contas)) {
          for (const inc of dados.contas) {
            inc.id = inc.id || gerarId('ct');
            globalState.contas.push(inc);
            stats.contas.inseridos++;
          }
        }

        globalState.versao = Date.now();
      }

      await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);
    });

    console.log(`[Backup Import] Concluído com sucesso (Modo: ${modo}). Estatísticas:`, JSON.stringify(stats));
    res.json({ success: true, modo, stats, versao: globalState.versao });
  } catch (error) {
    console.error('[API /api/backup/importar] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
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
let wppClient = null;
let ultimoDiaEnvioRelatorio = '';

function formatarMoeda(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ── Gerador de Relatório Executivo Matinal (Admin) ───────── */
function gerarRelatorioExecutivo(state) {
  state = state || globalState || {};
  const dHoje = new Date().toISOString().slice(0, 10);
  const dataFormatada = new Date().toLocaleDateString('pt-BR');
  const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // 1. Posição de Caixa
  const cfg = state.cfg || {};
  const saldoInicial = Number(cfg.saldoInicial) || 0;
  const movimentos = state.movimentos || [];
  const totalEntradas = movimentos.filter(m => m.tipo === 'entrada').reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const totalSaidas = movimentos.filter(m => m.tipo === 'saida').reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const saldoCaixa = saldoInicial + totalEntradas - totalSaidas;

  // 2. Contas a Pagar e Receber
  const contas = state.contas || [];
  const emAberto = contas.filter(c => !c.pago);

  // Vencimentos de Hoje
  const recHoje = emAberto.filter(c => c.tipo === 'receber' && c.venc === dHoje);
  const pagHoje = emAberto.filter(c => c.tipo === 'pagar' && c.venc === dHoje);
  const totRecHoje = recHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
  const totPagHoje = pagHoje.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
  const liquidoHoje = totRecHoje - totPagHoje;

  // Projeção dos Próximos 7 Dias (Semana)
  const dFimSemanaObj = new Date();
  dFimSemanaObj.setDate(dFimSemanaObj.getDate() + 7);
  const dFimSemana = dFimSemanaObj.toISOString().slice(0, 10);

  const recSemana = emAberto.filter(c => c.tipo === 'receber' && c.venc >= dHoje && c.venc <= dFimSemana);
  const pagSemana = emAberto.filter(c => c.tipo === 'pagar' && c.venc >= dHoje && c.venc <= dFimSemana);
  const totRecSemana = recSemana.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
  const totPagSemana = pagSemana.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
  const saldoPrevistoSemana = saldoCaixa + totRecSemana - totPagSemana;

  // Inadimplência / Atrasos
  const vencidosRec = emAberto.filter(c => c.tipo === 'receber' && c.venc < dHoje);
  const totVencidosRec = vencidosRec.reduce((acc, c) => acc + (Number(c.valor) || 0), 0);

  // 3. Pátio & Boxes
  const osLista = state.os || [];
  const veiculos = state.veiculos || [];
  const clientes = state.clientes || [];
  const boxes = state.boxes || [];

  const osAtivas = osLista.filter(o => o.st !== 'finalizada');
  const boxesOcupados = osAtivas.filter(o => o.box);
  const naFila = osAtivas.filter(o => !o.box || o.st === 'fila');

  // 4. Veículos que Amanheceram na Oficina
  const amanheceram = osAtivas.filter(o => o.abertura && o.abertura < dHoje);
  const listaAmanhecidos = amanheceram.length > 0 ? amanheceram : osAtivas;

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let texto =
`📊 *PÁTIO CRM — RELATÓRIO EXECUTIVO MATINAL* 🚛⚙️
📅 *Data:* ${dataFormatada} às ${horaFormatada}
🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'}

════════════════════════════
💰 *1. POSIÇÃO DE CAIXA & FLUXO*
════════════════════════════
💵 *Saldo Consolidado:* *${formatarMoeda(saldoCaixa)}*

📅 *Vencimentos de Hoje (${dataFormatada.slice(0, 5)}):*
• 🟢 *A Receber:* ${formatarMoeda(totRecHoje)} (${recHoje.length} títulos)
• 🔴 *A Pagar:* ${formatarMoeda(totPagHoje)} (${pagHoje.length} contas)
• ⚖️ *Resultado Líquido do Dia:* ${liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(liquidoHoje)}

🗓️ *Projeção dos Próximos 7 Dias (Semana):*
• 📈 *A Receber na Semana:* ${formatarMoeda(totRecSemana)} (${recSemana.length} títulos)
• 📉 *A Pagar na Semana:* ${formatarMoeda(totPagSemana)} (${pagSemana.length} contas)
• 🏦 *Saldo Previsto ao Fim da Semana:* *${formatarMoeda(saldoPrevistoSemana)}*
`;

  if (vencidosRec.length > 0) {
    texto += `⚠️ *Atenção Cobrança:* ${vencidosRec.length} título(s) de clientes vencidos em aberto (${formatarMoeda(totVencidosRec)}).\n`;
  }

  texto +=
`\n════════════════════════════
🚛 *2. OCUPAÇÃO DO PÁTIO & BOXES*
════════════════════════════
• 🚚 *Total de Caminhões no Pátio:* ${osAtivas.length}
• 🔧 *Boxes Ocupados:* ${boxesOcupados.length} de ${boxes.length || 6} (${Math.round((boxesOcupados.length / (boxes.length || 6)) * 100)}% capacidade)
• ⏳ *Aguardando na Fila de Triagem:* ${naFila.length}

════════════════════════════
🌅 *3. VEÍCULOS QUE AMANHECERAM NA OFICINA*
════════════════════════════
`;

  if (listaAmanhecidos.length === 0) {
    texto += `_Nenhum veículo amanheceu no pátio hoje. Capacidade 100% livre!_\n`;
  } else {
    listaAmanhecidos.forEach((o, idx) => {
      const v = veiculos.find(x => x.id === o.vei) || {};
      const c = clientes.find(x => x.id === o.cli) || {};
      const b = boxes.find(x => x.id === o.box) || {};

      let diasNoPatio = 1;
      if (o.abertura) {
        const diff = Math.round((new Date(dHoje + 'T12:00:00') - new Date(o.abertura + 'T12:00:00')) / 864e5);
        diasNoPatio = isNaN(diff) ? 1 : Math.max(1, diff);
      }

      const primeiroServico = (o.servicos && o.servicos[0] && o.servicos[0].nome)
        ? o.servicos[0].nome
        : (o.queixa || 'Manutenção Geral');

      const boxNome = b.nome || (o.box ? `Box ${o.box}` : 'Pátio');

      texto += `${idx + 1}️⃣ *${v.placa || 'SEM PLACA'}* — ${v.modelo || 'Caminhão'} (${c.nome || 'Cliente'})\n`;
      texto += `   📍 *Local:* ${boxNome} | 👨‍🔧 ${o.mec || 'Equipe'} | ⏳ *No pátio há:* ${diasNoPatio} dia(s)\n`;
      texto += `   🔧 *Serviço:* ${primeiroServico}\n`;
      texto += `   📌 *Status:* *${statusEmojis[o.st] || o.st}*\n`;

      if (o.st === 'peca' && o.obs) {
        texto += `   🚨 *Atenção Fornecedor:* _${o.obs}_\n`;
      }
      if (o.prev) {
        const prevBR = o.prev.slice(8, 10) + '/' + o.prev.slice(5, 7);
        texto += `   🎯 _Previsão de Entrega: ${prevBR}_\n`;
      }
      texto += `\n`;
    });
  }

  texto +=
`════════════════════════════
_📱 Relatório gerado automaticamente pelo Pátio CRM._
_💡 Comandos rápidos para admin: *!relatorio*, *!caixa* ou *!patio*_`;

  return {
    texto,
    indicadores: {
      data: dHoje,
      saldoCaixa,
      totRecHoje,
      totPagHoje,
      liquidoHoje,
      totRecSemana,
      totPagSemana,
      saldoPrevistoSemana,
      totVencidosRec,
      totalOSAtivas: osAtivas.length,
      boxesOcupados: boxesOcupados.length,
      totalBoxes: boxes.length || 6,
      naFila: naFila.length,
      totalAmanhecidos: listaAmanhecidos.length
    }
  };
}

/* ── Gerador de Infográfico Visual em JPG (Puppeteer) ────── */
let browserRenderCache = null;
async function getRenderBrowser() {
  if (browserRenderCache && browserRenderCache.isConnected()) return browserRenderCache;
  try {
    browserRenderCache = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    return browserRenderCache;
  } catch (e) {
    browserRenderCache = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    return browserRenderCache;
  }
}

async function gerarImagemIndicadoresJPG(state) {
  state = state || globalState || {};
  const rel = gerarRelatorioExecutivo(state);
  const ind = rel.indicadores;
  const cfg = state.cfg || {};

  const osLista = state.os || [];
  const veiculos = state.veiculos || [];
  const boxes = state.boxes || [];

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { background: #0b0f19; color: #f1f5f9; padding: 24px; width: 800px; height: 500px; overflow: hidden; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px; }
  .logo { font-size: 20px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px; }
  .sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .badge-date { background: #1e293b; border: 1px solid #334155; padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; color: #cbd5e1; }
  .grid-top { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .card { background: #131c2e; border: 1px solid #1e293b; border-radius: 10px; padding: 12px; position: relative; overflow: hidden; }
  .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent, #38bdf8); }
  .label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 4px; }
  .value { font-size: 22px; font-weight: 800; color: #ffffff; line-height: 1.2; }
  .desc { font-size: 10.5px; color: #64748b; margin-top: 3px; }
  .grid-bottom { display: grid; grid-template-columns: 1fr 1.2fr; gap: 12px; }
  .boxes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
  .box-chip { background: #1e293b; border-radius: 6px; padding: 6px 4px; text-align: center; border: 1px solid #334155; }
  .box-chip.ocupado { background: #1e3a8a; border-color: #3b82f6; }
  .box-chip.peca { background: #450a0a; border-color: #ef4444; }
  .box-chip.livre { background: #064e3b; border-color: #10b981; }
  .box-num { font-size: 10.5px; font-weight: 700; color: #e2e8f0; }
  .box-st { font-size: 9.5px; color: #94a3b8; margin-top: 1px; }
  .caminhoes-lista { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
  .cam-item { display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 6px 8px; border-radius: 6px; border: 1px solid #1e293b; font-size: 11px; }
  .cam-placa { font-weight: 800; color: #f8fafc; font-family: monospace; background: #334155; padding: 2px 5px; border-radius: 4px; }
  .cam-tag { font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 10px; }
  .tag-exec { background: #1e3a8a; color: #93c5fd; }
  .tag-peca { background: #7f1d1d; color: #fca5a5; }
  .tag-fila { background: #334155; color: #cbd5e1; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">🚛 ${escapeHtml(cfg.empresa) || 'PÁTIO DIESEL'}</div>
      <div class="sub">PAINEL EXECUTIVO GERENCIAL — MATINAL</div>
    </div>
    <div class="badge-date">📅 ${new Date().toLocaleDateString('pt-BR')} • 08:00</div>
  </div>

  <div class="grid-top">
    <div class="card" style="--accent:#10b981">
      <div class="label">💵 Saldo Consolidado em Caixa</div>
      <div class="value" style="color:#10b981">${formatarMoeda(ind.saldoCaixa)}</div>
      <div class="desc">Entradas vs Saídas acumuladas</div>
    </div>
    <div class="card" style="--accent:#38bdf8">
      <div class="label">📅 Vencimentos de Hoje</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:700;color:#38bdf8">+${formatarMoeda(ind.totRecHoje)}</div>
          <div style="font-size:9.5px;color:#94a3b8">Receber</div>
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:#f87171">-${formatarMoeda(ind.totPagHoje)}</div>
          <div style="font-size:9.5px;color:#94a3b8">Pagar</div>
        </div>
      </div>
      <div class="desc" style="color:${ind.liquidoHoje >= 0 ? '#10b981' : '#f87171'};font-weight:600">
        Líquido: ${ind.liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(ind.liquidoHoje)}
      </div>
    </div>
    <div class="card" style="--accent:#f59e0b">
      <div class="label">🗓️ Previsão da Semana (7d)</div>
      <div class="value" style="font-size:18px;color:#f59e0b">${formatarMoeda(ind.saldoPrevistoSemana)}</div>
      <div class="desc">+${formatarMoeda(ind.totRecSemana)} rec | -${formatarMoeda(ind.totPagSemana)} pag</div>
    </div>
  </div>

  <div class="grid-bottom">
    <div class="card" style="--accent:#8b5cf6">
      <div class="label">🔧 Ocupação dos Boxes (${ind.boxesOcupados}/${ind.totalBoxes})</div>
      <div class="boxes-grid">
        ${(boxes.length ? boxes : [{id:'b1',nome:'Box 1'},{id:'b2',nome:'Box 2'},{id:'b3',nome:'Box 3'},{id:'b4',nome:'Box 4'},{id:'b5',nome:'Box 5'},{id:'b6',nome:'Box 6'}]).slice(0, 6).map(b => {
          const osBox = osLista.find(o => o.box === b.id && o.st !== 'finalizada');
          let cls = 'livre', stNome = 'Livre';
          if (osBox) {
            cls = osBox.st === 'peca' ? 'peca' : 'ocupado';
            stNome = osBox.st === 'peca' ? 'Parado Peça' : 'Ocupado';
          }
          return `<div class="box-chip ${cls}">
            <div class="box-num">${escapeHtml((b.nome || '').slice(0, 10))}</div>
            <div class="box-st">${stNome}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="desc" style="margin-top:6px">Fila de espera: <b>${ind.naFila} caminhões</b></div>
    </div>

    <div class="card" style="--accent:#ef4444">
      <div class="label">🌅 Amanheceram na Oficina (${ind.totalAmanhecidos})</div>
      <div class="caminhoes-lista">
        ${osLista.filter(o => o.st !== 'finalizada').slice(0, 4).map(o => {
          const v = veiculos.find(x => x.id === o.vei) || {};
          const isPeca = o.st === 'peca';
          return `<div class="cam-item">
            <div>
              <span class="cam-placa">${escapeHtml(v.placa || 'PLACA')}</span>
              <span style="color:#94a3b8;margin-left:6px;font-size:10.5px">${escapeHtml((v.modelo || 'Caminhão').slice(0, 18))}</span>
            </div>
            <span class="cam-tag ${isPeca ? 'tag-peca' : 'tag-exec'}">${escapeHtml(isPeca ? 'PARADO PEÇA' : (o.st === 'executando' ? 'EM EXECUÇÃO' : o.st.toUpperCase()))}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>
</body>
</html>`;

  const browser = await getRenderBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 500, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    return await page.screenshot({ type: 'jpeg', quality: 90 });
  } finally {
    await page.close();
  }
}

/* ── Mensagens para o Grupo da Administração (3 Mensagens) ── */
function gerarMensagensAdmin(state) {
  state = state || globalState || {};
  const rel = gerarRelatorioExecutivo(state);
  const ind = rel.indicadores;
  const cfg = state.cfg || {};
  const osLista = state.os || [];
  const veiculos = state.veiculos || [];
  const clientes = state.clientes || [];
  const boxes = state.boxes || [];
  const contas = state.contas || [];
  const emAberto = contas.filter(c => !c.pago);
  const dHoje = new Date().toISOString().slice(0, 10);
  const dataFormatada = new Date().toLocaleDateString('pt-BR');
  const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // MSG 1: Finanças & Fluxo
  let msg1 = `📊 *[1/3] PÁTIO CRM — POSIÇÃO DE CAIXA & FLUXO* 💰\n` +
    `🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'} | 📅 *${dataFormatada}* às *${horaFormatada}*\n\n` +
    `💵 *Saldo Consolidado em Caixa:* *${formatarMoeda(ind.saldoCaixa)}*\n\n` +
    `📅 *Vencimentos de Hoje (${dataFormatada.slice(0, 5)}):*\n` +
    `• 🟢 *A Receber:* ${formatarMoeda(ind.totRecHoje)} (${emAberto.filter(c => c.tipo === 'receber' && c.venc === dHoje).length} títulos)\n` +
    `• 🔴 *A Pagar:* ${formatarMoeda(ind.totPagHoje)} (${emAberto.filter(c => c.tipo === 'pagar' && c.venc === dHoje).length} contas)\n` +
    `• ⚖️ *Resultado Líquido do Dia:* ${ind.liquidoHoje >= 0 ? '+' : ''}${formatarMoeda(ind.liquidoHoje)}\n\n` +
    `🗓️ *Projeção dos Próximos 7 Dias (Semana):*\n` +
    `• 📈 *A Receber na Semana:* ${formatarMoeda(ind.totRecSemana)}\n` +
    `• 📉 *A Pagar na Semana:* ${formatarMoeda(ind.totPagSemana)}\n` +
    `• 🏦 *Saldo Previsto ao Fim da Semana:* *${formatarMoeda(ind.saldoPrevistoSemana)}*\n`;
  if (ind.totVencidosRec > 0) {
    msg1 += `⚠️ *Atenção Cobrança:* Títulos de clientes vencidos em aberto: *${formatarMoeda(ind.totVencidosRec)}*.\n`;
  }

  // MSG 2: Pátio & Boxes
  const osAtivas = osLista.filter(o => o.st !== 'finalizada');
  const boxesOcupados = osAtivas.filter(o => o.box);
  const naFila = osAtivas.filter(o => !o.box || o.st === 'fila');
  let msg2 = `🚛 *[2/3] PÁTIO CRM — OCUPAÇÃO DO PÁTIO & BOXES* ⚙️\n\n` +
    `• 🚚 *Total de Caminhões no Pátio:* ${osAtivas.length}\n` +
    `• 🔧 *Boxes Ocupados:* ${boxesOcupados.length} de ${boxes.length || 6} (${Math.round((boxesOcupados.length / (boxes.length || 6)) * 100)}% da capacidade)\n` +
    `• ⏳ *Aguardando na Fila de Triagem:* ${naFila.length} caminhões\n`;

  // MSG 3: Caminhões Amanhecidos
  const amanheceram = osAtivas.filter(o => o.abertura && o.abertura < dHoje);
  const listaAmanhecidos = amanheceram.length > 0 ? amanheceram : osAtivas;

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let msg3 = `🌅 *[3/3] PÁTIO CRM — CAMINHÕES QUE AMANHECERAM* 🚛\n` +
    `Prioridades de atendimento para o dia de hoje:\n\n`;

  if (listaAmanhecidos.length === 0) {
    msg3 += `_Nenhum veículo amanheceu no pátio. Oficina 100% livre!_\n`;
  } else {
    listaAmanhecidos.forEach((o, idx) => {
      const v = veiculos.find(x => x.id === o.vei) || {};
      const c = clientes.find(x => x.id === o.cli) || {};
      const b = boxes.find(x => x.id === o.box) || {};

      let diasNoPatio = 1;
      if (o.abertura) {
        const diff = Math.round((new Date(dHoje + 'T12:00:00') - new Date(o.abertura + 'T12:00:00')) / 864e5);
        diasNoPatio = isNaN(diff) ? 1 : Math.max(1, diff);
      }
      const primeiroServico = (o.servicos && o.servicos[0] && o.servicos[0].nome) ? o.servicos[0].nome : (o.queixa || 'Manutenção Geral');
      const boxNome = b.nome || (o.box ? `Box ${o.box}` : 'Pátio');

      msg3 += `${idx + 1}️⃣ *${v.placa || 'SEM PLACA'}* — ${v.modelo || 'Caminhão'} (${c.nome || 'Cliente'})\n` +
        `   📍 *Local:* ${boxNome} | 👨‍🔧 ${o.mec || 'Equipe'} | ⏳ *No pátio há:* ${diasNoPatio} dia(s)\n` +
        `   🔧 *Serviço:* ${primeiroServico}\n` +
        `   📌 *Status:* *${statusEmojis[o.st] || o.st}*\n`;

      if (o.st === 'peca' && o.obs) {
        msg3 += `   🚨 *Atenção Fornecedor:* _${o.obs}_\n`;
      }
      if (o.prev) {
        const prevBR = o.prev.slice(8, 10) + '/' + o.prev.slice(5, 7);
        msg3 += `   🎯 _Previsão de Entrega: ${prevBR}_\n`;
      }
      msg3 += `\n`;
    });
  }
  msg3 += `════════════════════════════\n_💡 Comandos para Admin: *!relatorio*, *!caixa*, *!patio* ou *!ajuda*_`;

  return [msg1, msg2, msg3];
}

/* ── Mensagens para o Grupo da Operação (Zero Dados Financeiros) ── */
function gerarMensagensOperacao(state) {
  state = state || globalState || {};
  const cfg = state.cfg || {};
  const osLista = state.os || [];
  const veiculos = state.veiculos || [];
  const clientes = state.clientes || [];
  const boxes = state.boxes || [];
  const dHoje = new Date().toISOString().slice(0, 10);
  const dataFormatada = new Date().toLocaleDateString('pt-BR');
  const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const osAtivas = osLista.filter(o => o.st !== 'finalizada');
  const boxesOcupados = osAtivas.filter(o => o.box);
  const naFila = osAtivas.filter(o => !o.box || o.st === 'fila');

  // MSG 1: Posição do Pátio Operacional
  let msg1 = `🚛 *[1/2] PÁTIO OPERACIONAL — OCUPAÇÃO DOS BOXES* ⚙️\n` +
    `🏢 *Oficina:* ${cfg.empresa || 'Auto Molas Fort'} | 📅 *${dataFormatada}* às *${horaFormatada}*\n\n` +
    `• 🚚 *Total de Caminhões em Atendimento:* ${osAtivas.length}\n` +
    `• 🔧 *Boxes Ocupados:* ${boxesOcupados.length} de ${boxes.length || 6} (${Math.round((boxesOcupados.length / (boxes.length || 6)) * 100)}% da capacidade produtiva)\n` +
    `• ⏳ *Aguardando na Fila de Triagem:* ${naFila.length} caminhões\n\n` +
    `_Lembrete equipe: mantenham os status dos boxes atualizados ao liberar veículos!_`;

  // MSG 2: Caminhões que Amanheceram
  const amanheceram = osAtivas.filter(o => o.abertura && o.abertura < dHoje);
  const listaAmanhecidos = amanheceram.length > 0 ? amanheceram : osAtivas;

  const statusEmojis = {
    executando: '⚙️ Em Execução',
    peca: '🛑 PARADO POR PEÇA',
    aprovacao: '⏳ Aguardando Aprovação',
    fila: '📋 Na Fila de Espera',
    finalizada: '✅ Finalizada'
  };

  let msg2 = `🌅 *[2/2] PÁTIO OPERACIONAL — VEÍCULOS QUE AMANHECERAM* 🚛\n` +
    `Relação de veículos que passaram a noite na oficina para priorização do dia:\n\n`;

  if (listaAmanhecidos.length === 0) {
    msg2 += `_Nenhum veículo amanheceu no pátio. Todos os boxes livres para novas entradas!_\n`;
  } else {
    listaAmanhecidos.forEach((o, idx) => {
      const v = veiculos.find(x => x.id === o.vei) || {};
      const c = clientes.find(x => x.id === o.cli) || {};
      const b = boxes.find(x => x.id === o.box) || {};

      let diasNoPatio = 1;
      if (o.abertura) {
        const diff = Math.round((new Date(dHoje + 'T12:00:00') - new Date(o.abertura + 'T12:00:00')) / 864e5);
        diasNoPatio = isNaN(diff) ? 1 : Math.max(1, diff);
      }
      const primeiroServico = (o.servicos && o.servicos[0] && o.servicos[0].nome) ? o.servicos[0].nome : (o.queixa || 'Manutenção Geral');
      const boxNome = b.nome || (o.box ? `Box ${o.box}` : 'Pátio');

      msg2 += `${idx + 1}️⃣ *${v.placa || 'SEM PLACA'}* — ${v.modelo || 'Caminhão'} (${c.nome || 'Cliente'})\n` +
        `   📍 *Local:* ${boxNome} | 👨‍🔧 ${o.mec || 'Equipe'}\n` +
        `   ⏳ *No pátio há:* ${diasNoPatio} dia(s)\n` +
        `   🔧 *Serviço:* ${primeiroServico}\n` +
        `   📌 *Status:* *${statusEmojis[o.st] || o.st}*\n`;

      if (o.st === 'peca' && o.obs) {
        msg2 += `   ⚠️ *Peça Pendente:* _${o.obs}_\n`;
      }
      if (o.prev) {
        const prevBR = o.prev.slice(8, 10) + '/' + o.prev.slice(5, 7);
        msg2 += `   🎯 _Previsão de Entrega: ${prevBR}_\n`;
      }
      msg2 += `\n`;
    });
  }

  msg2 += `════════════════════════════\n` +
    `_💡 Comandos no grupo: *!patio*, *Status [placa]*, *Abrir OS [placa]* ou envie foto da placa_`;

  return [msg1, msg2];
}

function gerarResumoCaixa(state) {
  const rel = gerarRelatorioExecutivo(state);
  const ind = rel.indicadores;
  const d = new Date().toLocaleDateString('pt-BR');
  return `💰 *POSIÇÃO FINANCEIRA RÁPIDA (${d})* 🚛\n\n` +
    `💵 *Saldo em Caixa:* *${formatarMoeda(ind.saldoCaixa)}*\n\n` +
    `📅 *Hoje:* A Receber ${formatarMoeda(ind.totRecHoje)} | A Pagar ${formatarMoeda(ind.totPagHoje)}\n` +
    `🗓️ *Semana (7d):* A Receber ${formatarMoeda(ind.totRecSemana)} | A Pagar ${formatarMoeda(ind.totPagSemana)}\n` +
    `🏦 *Saldo Projetado ao Fim da Semana:* *${formatarMoeda(ind.saldoPrevistoSemana)}*\n\n` +
    `_Digite *!relatorio* para a visão executiva completa._`;
}

function gerarResumoPatio(state) {
  const rel = gerarRelatorioExecutivo(state);
  const ind = rel.indicadores;
  return `🚛 *OCUPAÇÃO ATUAL DO PÁTIO* ⚙️\n\n` +
    `• Total de Caminhões na Oficina: *${ind.totalOSAtivas}*\n` +
    `• Boxes Ocupados: *${ind.boxesOcupados} de ${ind.totalBoxes}*\n` +
    `• Caminhões na Fila de Espera: *${ind.naFila}*\n` +
    `• Amanheceram na Oficina: *${ind.totalAmanhecidos}*\n\n` +
    `_Digite *!relatorio* para ver os detalhes de cada caminhão e serviços._`;
}

async function enviarRelatorioGrupo(tipo = 'admin') {
  if (!wppClient) {
    console.error('[WhatsApp] Falha no disparo: wppClient não inicializado.');
    return { success: false, error: 'WhatsApp Web não está inicializado no servidor.' };
  }

  // Se não estiver com status 'pronto', verifica se já está conectado
  if (wppStatus.status !== 'pronto') {
    const st = await wppClient.getState().catch(() => null);
    if (st === 'CONNECTED' || wppClient.info) {
      wppStatus.status = 'pronto';
      wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    } else {
      console.error(`[WhatsApp] Falha no disparo: status atual é "${wppStatus.status}".`);
      return { success: false, error: `WhatsApp Web não está pronto no servidor (status atual: ${wppStatus.status}).` };
    }
  }

  const cfg = globalState?.cfg || {};
  let targetChatId = (tipo === 'admin'
    ? (cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID)
    : (cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID)
  );

  // Blacklist estrita: Faturamento e Compras NUNCA podem ser usados para envio de relatórios da Administração
  if (tipo === 'admin') {
    if (targetChatId === '120363428179962435@g.us' || targetChatId === '120363428840376088@g.us') {
      console.warn(`[WhatsApp] Grupo proibido detectado para Administração (${targetChatId}). Desvinculando imediatamente.`);
      targetChatId = null;
      if (globalState.cfg) globalState.cfg.grupoAdminId = '';
      await salvarEstado();
    }
  }

  // Se o ID for o dummy/mock antigo ou não estiver setado, tenta auto-descobrir agora nos chats do WhatsApp
  if (!targetChatId || targetChatId.startsWith('12036300000000000')) {
    console.log(`[WhatsApp] ID do grupo ${tipo} não configurado ou dummy. Buscando grupos disponíveis nos chats do WhatsApp...`);
    try {
      const grupos = await obterGruposWhatsApp();
      let achado = null;
      if (tipo === 'admin') {
        achado = grupos.find(g => {
          const n = (g.name || '').toLowerCase();
          if (n.includes('faturamento') || n.includes('compras')) return false;
          return n.includes('admin') || n.includes('administra') || n.includes('gestão') || n.includes('gerência');
        });
      } else {
        achado = grupos.find(g => {
          const n = (g.name || '').toLowerCase();
          return (n.includes('opera') || n.includes('patio') || n.includes('pátio') || n.includes('oficina')) && g.id !== cfg.grupoAdminId;
        });
      }
      if (achado) {
        targetChatId = achado.id;
        if (tipo === 'admin') globalState.cfg.grupoAdminId = targetChatId;
        else globalState.cfg.grupoOperacaoId = targetChatId;
        globalState.versao = Date.now();
        await salvarEstado();
        console.log(`🎯 [WhatsApp] Grupo ${tipo} auto-descoberto com sucesso: "${achado.name}" (${targetChatId})`);
      }
    } catch (eBusca) {
      console.warn('[WhatsApp] Erro ao listar chats para auto-descoberta:', eBusca.message);
    }
  }

  if (!targetChatId || targetChatId.startsWith('12036300000000000')) {
    const errMsg = `Grupo de ${tipo === 'admin' ? 'Administração' : 'Operação'} não localizado no WhatsApp. Verifique se o número foi adicionado ao grupo.`;
    console.error(`❌ [WhatsApp] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  try {
    if (tipo === 'admin') {
      const msgs = gerarMensagensAdmin(globalState);
      console.log(`[WhatsApp] Disparando 3 mensagens + JPG para Grupo Admin (${targetChatId})...`);

      // 1. Gera imagem JPG dos Indicadores e envia com a Msg 1 como legenda
      try {
        console.log('[WhatsApp] Gerando imagem JPG de indicadores para Grupo Admin...');
        const jpgBuffer = await gerarImagemIndicadoresJPG(globalState);
        const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
        await wppClient.sendMessage(targetChatId, media, { caption: msgs[0] });
      } catch (imgErr) {
        console.warn('[WhatsApp] Falha ao renderizar imagem JPG, enviando texto puro:', imgErr.message);
        await wppClient.sendMessage(targetChatId, msgs[0]);
      }

      await new Promise(r => setTimeout(r, 1200));
      await wppClient.sendMessage(targetChatId, msgs[1]);

      await new Promise(r => setTimeout(r, 1200));
      await wppClient.sendMessage(targetChatId, msgs[2]);

      console.log(`✅ [WhatsApp] Relatório completo (3 mensagens + JPG) enviado com sucesso para Grupo Admin (${targetChatId})`);
      return { success: true, tipo: 'admin', grupoId: targetChatId, totalMensagens: 3 };
    } else {
      const msgsOp = gerarMensagensOperacao(globalState);
      console.log(`[WhatsApp] Disparando 2 mensagens operacionais para Grupo Operação (${targetChatId})...`);

      await wppClient.sendMessage(targetChatId, msgsOp[0]);
      await new Promise(r => setTimeout(r, 1200));
      await wppClient.sendMessage(targetChatId, msgsOp[1]);

      console.log(`✅ [WhatsApp] Relatório operacional (2 mensagens sem finanças) enviado para Grupo Operação (${targetChatId})`);
      return { success: true, tipo: 'operacao', grupoId: targetChatId, totalMensagens: 2 };
    }
  } catch (err) {
    console.error(`❌ [WhatsApp] Erro ao disparar para grupo ${tipo}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function enviarRelatorioAdministradores(destinatarioEspecifico = null) {
  // Se for especificado um grupo ou fone
  if (destinatarioEspecifico && destinatarioEspecifico.includes('@g.us')) {
    return await enviarRelatorioGrupo('admin');
  }

  const rel = gerarRelatorioExecutivo(globalState);
  let lista = [];
  if (destinatarioEspecifico) {
    lista = [destinatarioEspecifico];
  } else {
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    const cfgAdmins = (globalState?.cfg?.adminFones || [])
      .map(s => String(s).trim().replace(/\D/g, ''))
      .filter(Boolean);
    lista = [...new Set([...envAdmins, ...cfgAdmins])];
  }

  if (lista.length === 0) {
    return { success: false, error: 'Nenhum telefone de administrador cadastrado no sistema (.env ou Configurações).' };
  }

  if (!wppClient || wppStatus.status !== 'pronto') {
    return {
      success: false,
      error: `WhatsApp Web não está pronto no servidor (status atual: ${wppStatus.status}). Conecte pelo painel primeiro.`,
      textoPreview: rel.texto,
      destinatarios: lista
    };
  }

  const enviados = [];
  const falhas = [];

  for (const fone of lista) {
    try {
      let foneFormatado = fone.replace(/\D/g, '');
      if (!foneFormatado.startsWith('55') && foneFormatado.length >= 10 && foneFormatado.length <= 11) {
        foneFormatado = '55' + foneFormatado;
      }
      const chatId = `${foneFormatado}@c.us`;
      await wppClient.sendMessage(chatId, rel.texto);
      enviados.push(fone);
      console.log(`[WhatsApp] Relatório executivo enviado com sucesso para ${fone}`);
    } catch (err) {
      console.error(`[WhatsApp] Falha ao enviar para ${fone}:`, err.message);
      falhas.push({ fone, erro: err.message });
    }
  }

  return {
    success: enviados.length > 0,
    totalEnviados: enviados.length,
    enviados,
    falhas,
    textoRelatorio: rel.texto
  };
}

function iniciarAgendadorRelatorioDiario() {
  console.log('[Agendador WhatsApp] Rotina matinal diária inicializada.');
  setInterval(async () => {
    try {
      const cfg = globalState?.cfg || {};
      const horaConfig = (cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30').trim();
      const autoAtivo = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
      const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';

      if (!autoAtivo) return;

      const agora = new Date();
      const diaSemana = agora.getDay(); // 0 = Domingo, 1 = Segunda, ..., 5 = Sexta, 6 = Sábado
      const isDiaUtil = diaSemana >= 1 && diaSemana <= 5;

      if (apenasDiasUteis && !isDiaUtil) {
        // Ignora envio automático em fins de semana
        return;
      }

      const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const diaHoje = agora.toISOString().slice(0, 10);

      // Proteção contra duplos disparos
      if (globalState._enviandoRelatorio) return;

      if (horaAtual === horaConfig && ultimoDiaEnvioRelatorio !== diaHoje) {
        globalState._enviandoRelatorio = true;
        try {
          ultimoDiaEnvioRelatorio = diaHoje;
          console.log(`⏰ [Agendador WhatsApp] Horário de disparo matinal atingido (${horaConfig}) em dia útil (${diaSemana}).`);

        // Disparo para Grupo da Administração
        console.log('⏰ Disparando relatório completo + JPG para Grupo da Administração...');
        const resAdm = await enviarRelatorioGrupo('admin');
        console.log('⏰ Resultado disparo admin:', JSON.stringify(resAdm));

        // Disparo para Grupo da Operação
        console.log('⏰ Disparando relatório operacional (sem finanças) para Grupo da Operação...');
        const resOp = await enviarRelatorioGrupo('operacao');
        console.log('⏰ Resultado disparo operacao:', JSON.stringify(resOp));

        // Fallback: se ambos os grupos falharem, dispara para a lista de adminFones
        if (!resAdm.success && !resOp.success) {
          console.log('⏰ Grupos não configurados ou com falha. Acionando fallback direto para administradores...');
          await enviarRelatorioAdministradores();
        }
        } finally {
          globalState._enviandoRelatorio = false;
        }
      }
    } catch (err) {
      console.error('[Agendador WhatsApp] Erro no agendador:', err);
    }
  }, 30000);
}

app.get('/api/whatsapp/status', async (req, res) => {
  let userWid = null;
  if (wppClient && wppClient.info && wppClient.info.wid) {
    userWid = wppClient.info.wid.user;
    if (wppStatus.status !== 'pronto') {
      wppStatus.status = 'pronto';
      wppStatus.user = userWid;
    }
  }
  res.json(wppStatus);
});

// Retorna o QR Code em PNG com alto contraste
app.get('/api/whatsapp/qr.png', async (req, res) => {
  if (wppStatus.qr) {
    try {
      const buffer = await QRCode.toBuffer(wppStatus.qr, {
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.send(buffer);
    } catch (e) {
      return res.status(500).send('Erro ao renderizar QR Code.');
    }
  }
  res.status(404).send('Nenhum QR Code pendente no momento.');
});

// Helper resiliente para listar grupos do WhatsApp contornando instabilidades do getChats()
async function obterGruposWhatsApp() {
  if (!wppClient) return [];

  // Tentativa 1: Extração direta resiliente via evaluate no Puppeteer (bypassa WAWebLidMigrationUtils e getChatModel corrompido)
  if (wppClient.pupPage) {
    try {
      const grupos = await wppClient.pupPage.evaluate(() => {
        try {
          let chatModels = [];
          if (typeof window.require === 'function') {
            try {
              const coll = window.require('WAWebCollections');
              if (coll && coll.Chat) {
                chatModels = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
              }
            } catch (eColl) {}
          }
          if (!chatModels || chatModels.length === 0) {
            if (window.Store && window.Store.Chat) {
              chatModels = typeof window.Store.Chat.getModelsArray === 'function'
                ? window.Store.Chat.getModelsArray()
                : (window.Store.Chat.models || []);
            }
          }

          const resultado = [];
          const jaInseridos = new Set();

          for (const c of (chatModels || [])) {
            try {
              const rawId = c.id ? (c.id._serialized || c.id) : null;
              let idStr = '';
              if (typeof rawId === 'string') idStr = rawId;
              else if (rawId && rawId.user && rawId.server) idStr = `${rawId.user}@${rawId.server}`;
              else if (rawId && rawId._serialized) idStr = rawId._serialized;

              if (idStr && idStr.endsWith('@g.us') && !jaInseridos.has(idStr)) {
                jaInseridos.add(idStr);
                const name = c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || 'Grupo';
                resultado.push({ id: idStr, name: String(name) });
              }
            } catch (errItem) {}
          }
          return resultado;
        } catch (errEval) {
          return [];
        }
      });

      if (Array.isArray(grupos) && grupos.length > 0) {
        console.log(`[WhatsApp] Extração resiliente no Puppeteer encontrou ${grupos.length} grupos.`);
        return grupos;
      }
    } catch (e2) {
      console.warn('[WhatsApp] evaluate() resiliente no Puppeteer falhou:', e2.message);
    }
  }

  // Tentativa 2: getChats() padrão (se disponível e não crashar)
  try {
    const chats = await wppClient.getChats();
    if (Array.isArray(chats) && chats.length > 0) {
      return chats.filter(c => c.isGroup).map(c => ({
        id: c.id ? (c.id._serialized || c.id) : '',
        name: c.name || 'Grupo sem nome'
      })).filter(g => g.id && String(g.id).endsWith('@g.us'));
    }
  } catch (e1) {
    console.warn('[WhatsApp] getChats() padrão retornou erro (esperado no WhatsApp Web atual):', e1.message);
  }

  return [];
}

// ── Rotas do Relatório Executivo e Grupos do WhatsApp ────────
app.get('/api/whatsapp/grupos', async (req, res) => {
  try {
    if (!wppClient) {
      return res.json({ grupos: [], error: 'WhatsApp não inicializado.' });
    }
    const grupos = await obterGruposWhatsApp();
    res.json({ grupos });
  } catch (err) {
    console.error('[API /api/whatsapp/grupos] Erro:', err);
    res.status(500).json({ error: err.message, grupos: [] });
  }
});

app.post('/api/whatsapp/sincronizar-grupos', async (req, res) => {
  try {
    if (!wppClient) return res.json({ success: false, error: 'WhatsApp não inicializado.' });
    await sincronizarGruposAutomaticamente();
    const grupos = await obterGruposWhatsApp();
    res.json({ success: true, grupos, cfg: globalState?.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/sincronizar-grupos] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/entrar-grupo', async (req, res) => {
  try {
    const { inviteCode, url } = req.body || {};
    let code = inviteCode;
    if (!code && url) {
      const m = url.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
      if (m) code = m[1];
    }
    if (!code) return res.status(400).json({ success: false, error: 'Código ou URL do convite não fornecido.' });
    if (!wppClient) return res.status(500).json({ success: false, error: 'WhatsApp não inicializado.' });

    const groupId = await wppClient.acceptInvite(code);
    await sincronizarGruposAutomaticamente();
    res.json({ success: true, groupId, cfg: globalState?.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/entrar-grupo] Erro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whatsapp/diagnostico', async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) {
      return res.json({ error: 'WhatsApp Web ou pupPage indisponível.' });
    }
    const info = await wppClient.pupPage.evaluate(async () => {
      const titles = [];
      document.querySelectorAll('span[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && t.length > 1 && !titles.includes(t)) titles.push(t);
      });

      let storeChats = [];
      try {
        const coll = window.require ? window.require('WAWebCollections') : null;
        if (coll && coll.Chat) {
          const arr = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
          storeChats = arr.map(c => ({
            id: c.id ? (c.id._serialized || c.id) : null,
            name: c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || '',
            isGroup: Boolean(c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us'))),
            unreadCount: c.unreadCount || 0
          }));
        }
      } catch (e) {}

      return { titles, storeChats };
    });

    res.json({ success: true, ...info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/screenshot', authMiddleware, async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) return res.status(400).json({ error: 'Puppeteer não disponível.' });
    const buffer = await wppClient.pupPage.screenshot({ type: 'png' });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/pesquisar-termo/:termo', authMiddleware, async (req, res) => {
  try {
    if (!wppClient || !wppClient.pupPage) return res.json({ error: 'pupPage indisponível' });
    const termo = req.params.termo;
    const resultado = await wppClient.pupPage.evaluate(async (busca) => {
      const searchBox = document.querySelector('div[contenteditable="true"][data-tab="3"]') ||
                        document.querySelector('div[role="textbox"]');
      if (!searchBox) return { erro: 'Caixa de busca não encontrada no DOM' };

      searchBox.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, busca);

      await new Promise(r => setTimeout(r, 2500));

      const items = [];
      document.querySelectorAll('span[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && !items.includes(t)) items.push(t);
      });

      let chatsEncontrados = [];
      try {
        const coll = window.require ? window.require('WAWebCollections') : null;
        if (coll && coll.Chat) {
          const arr = typeof coll.Chat.getModelsArray === 'function' ? coll.Chat.getModelsArray() : (coll.Chat.models || []);
          chatsEncontrados = arr.map(c => ({
            id: c.id ? (c.id._serialized || c.id) : null,
            name: c.formattedTitle || c.name || (c.contact ? (c.contact.formattedName || c.contact.name) : '') || '',
            isGroup: Boolean(c.isGroup || (c.id && String(c.id._serialized || c.id).endsWith('@g.us')))
          })).filter(c => c.name.toLowerCase().includes(busca.toLowerCase()) || c.isGroup);
        }
      } catch (eColl) {}

      return { titlesAposBusca: items, chatsEncontrados };
    }, termo);

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/imagem-preview.jpg', async (req, res) => {
  try {
    const buffer = await gerarImagemIndicadoresJPG(globalState);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  } catch (err) {
    console.error('[API /api/whatsapp/imagem-preview.jpg] Erro:', err);
    res.status(500).send('Erro ao renderizar imagem preview.');
  }
});

app.get('/api/whatsapp/relatorio-preview', (req, res) => {
  try {
    const msgsAdmin = gerarMensagensAdmin(globalState);
    const msgsOp = gerarMensagensOperacao(globalState);
    const rel = gerarRelatorioExecutivo(globalState);
    res.json({
      success: true,
      texto: rel.texto,
      mensagensAdmin: msgsAdmin,
      mensagensOperacao: msgsOp,
      indicadores: rel.indicadores
    });
  } catch (err) {
    console.error('[API /api/whatsapp/relatorio-preview] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/disparar-grupo/:tipo', authMiddleware, async (req, res) => {
  try {
    const tipo = req.params.tipo === 'operacao' ? 'operacao' : 'admin';
    const resultado = await enviarRelatorioGrupo(tipo);
    res.json(resultado);
  } catch (err) {
    console.error(`[API /api/whatsapp/disparar-grupo/${req.params.tipo}] Erro:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/whatsapp/disparar-relatorio-admin', authMiddleware, async (req, res) => {
  try {
    const resultado = await enviarRelatorioAdministradores();
    res.json(resultado);
  } catch (err) {
    console.error('[API /api/whatsapp/disparar-relatorio-admin] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/whatsapp/config-grupos', (req, res) => {
  const cfg = globalState?.cfg || {};
  res.json({
    grupoAdminId: cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '',
    grupoOperacaoId: cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '',
    horaRelatorio: cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30',
    envioAutomatico: cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false',
    apenasDiasUteis: cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false',
    wppStatus: wppStatus.status
  });
});

app.post('/api/whatsapp/config-grupos', authMiddleware, async (req, res) => {
  try {
    const { grupoAdminId, grupoOperacaoId, horaRelatorio, envioAutomatico, apenasDiasUteis } = req.body || {};
    if (!globalState) globalState = {};
    if (!globalState.cfg) globalState.cfg = {};

    if (grupoAdminId !== undefined) {
      if (grupoAdminId === '120363428179962435@g.us' || grupoAdminId === '120363428840376088@g.us') {
        globalState.cfg.grupoAdminId = '';
      } else {
        globalState.cfg.grupoAdminId = grupoAdminId;
      }
    }
    if (grupoOperacaoId !== undefined) globalState.cfg.grupoOperacaoId = grupoOperacaoId;
    if (horaRelatorio) globalState.cfg.horaRelatorioDiario = horaRelatorio;
    if (typeof envioAutomatico === 'boolean') globalState.cfg.envioAutomaticoRelatorio = envioAutomatico;
    if (typeof apenasDiasUteis === 'boolean') globalState.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
    globalState.versao = Date.now();

    await salvarEstado();
    res.json({ success: true, cfg: globalState.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/config-grupos POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/config-relatorio', (req, res) => {
  const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
  const cfgAdmins = globalState?.cfg?.adminFones || [];
  const adminFones = [...new Set([...envAdmins, ...cfgAdmins])];
  const cfg = globalState?.cfg || {};
  const horaRelatorio = cfg.horaRelatorioDiario || process.env.HORA_RELATORIO_DIARIO || '07:30';
  const envioAutomatico = cfg.envioAutomaticoRelatorio !== false && process.env.ENVIO_AUTOMATICO_RELATORIO !== 'false';
  const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false && process.env.RELATORIO_APENAS_DIAS_UTEIS !== 'false';

  res.json({
    adminFones,
    horaRelatorio,
    envioAutomatico,
    apenasDiasUteis,
    wppStatus: wppStatus.status
  });
});

app.post('/api/whatsapp/config-relatorio', authMiddleware, async (req, res) => {
  try {
    const { adminFones, horaRelatorio, envioAutomatico, apenasDiasUteis } = req.body || {};
    if (!globalState) globalState = {};
    if (!globalState.cfg) globalState.cfg = {};

    if (Array.isArray(adminFones)) globalState.cfg.adminFones = adminFones;
    if (horaRelatorio) globalState.cfg.horaRelatorioDiario = horaRelatorio;
    if (typeof envioAutomatico === 'boolean') globalState.cfg.envioAutomaticoRelatorio = envioAutomatico;
    if (typeof apenasDiasUteis === 'boolean') globalState.cfg.relatorioApenasDiasUteis = apenasDiasUteis;
    globalState.versao = Date.now();

    await salvarEstado();
    res.json({ success: true, cfg: globalState.cfg });
  } catch (err) {
    console.error('[API /api/whatsapp/config-relatorio POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Upload e Leitura de Nota Fiscal ──────── */
app.post('/api/upload-nota', express.json({ limit: '50mb' }), async (req, res) => {
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

    const dadosNF = safeJsonParse(response.text);
    if (!dadosNF || typeof dadosNF !== 'object') {
      return res.status(422).json({ error: 'Não foi possível extrair dados estruturados da nota fiscal enviada.' });
    }

    if (!globalState) globalState = {};
    if (!globalState.pecas) globalState.pecas = [];
    if (!globalState.contas) globalState.contas = [];
    if (!globalState.compras) globalState.compras = [];
    if (!globalState.fornecedores) globalState.fornecedores = [];

    for (const item of (dadosNF.itens || [])) {
      const itemNomeNorm = (item.nome || '').trim().toLowerCase();
      const existing = globalState.pecas.find(p => p.nome && p.nome.trim().toLowerCase() === itemNomeNorm);
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

    await salvarEstado();

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
app.post('/api/processar-audio-os', express.json({ limit: '50mb' }), async (req, res) => {
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

    const dados = safeJsonParse(response.text);
    if (!dados || typeof dados !== 'object') {
      return res.status(422).json({ error: 'Não foi possível extrair os serviços e peças do áudio informado.' });
    }
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
          await salvarEstado();
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
  iniciarAgendadorRelatorioDiario();
}).catch(err => {
  console.error('[FATAL] Erro ao inicializar banco de dados SQLite:', err);
  process.exit(1);
});

/* ── Encerramento Gracioso de Processos (Puppeteer & WhatsApp) ── */
async function finalizarProcessosFilhos(sinal) {
  console.log(`\n[Servidor] Recebido sinal ${sinal}. Limpando recursos e processos em segundo plano...`);
  try {
    if (browserRenderCache) {
      console.log('[Puppeteer] Fechando navegador de renderização...');
      await browserRenderCache.close().catch(() => {});
      browserRenderCache = null;
    }
  } catch (_) {}
  try {
    if (wppClient) {
      console.log('[WhatsApp] Desconectando sessão com segurança...');
      await wppClient.destroy().catch(() => {});
      wppClient = null;
    }
  } catch (_) {}
}

process.on('SIGINT', async () => {
  await finalizarProcessosFilhos('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await finalizarProcessosFilhos('SIGTERM');
  process.exit(0);
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
        body: JSON.stringify({ placa: placaLimpa }),
        signal: AbortSignal.timeout(8000)
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

  // Opção C: Fallback para quando todas as consultas online falham
  return {
    marca: 'Não Identificada',
    modelo: 'Caminhão',
    ano: '',
    cor: '',
    tipo: '',
    km: 0,
    origem: 'Cadastro Pendente'
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
        id: gerarId('c'),
        nome: clienteNome || `Cliente WhatsApp (${placaLimpa})`,
        fone: clienteFone || '',
        doc: '',
        tipo: 'frotista'
      };
      globalState.clientes.push(cliente);
    }

    veiculo = {
      id: gerarId('v'),
      cli: cliente.id,
      placa: placaLimpa,
      marca: dadosOnline.marca || 'Caminhão',
      modelo: dadosOnline.modelo || 'Cavalo Mecânico',
      ano: String(dadosOnline.ano || new Date().getFullYear()),
      cor: dadosOnline.cor || 'Branco',
      tipo: dadosOnline.tipo || 'Cavalo Mecânico',
      km: dadosOnline.km || 0,
      criadoEm: Date.now()
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

  // Parser de Box Solicitado no texto (ex: "direcionar para o box 2", "box 3", "box b4", "fila")
  let boxDesejado = null;
  if (textoOriginal) {
    const txt = textoOriginal.toLowerCase();
    if (txt.includes('fila') || txt.includes('pátio') || txt.includes('patio') || txt.includes('espera')) {
      boxDesejado = 'fila';
    } else {
      const matchBox = txt.match(/\b(?:direcionar\s+(?:para\s+o\s+|ao\s+)?box|no\s+box|box\s*:?)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                       txt.match(/\bbox\s*(?:b)?([1-6])\b/i);
      if (matchBox) {
        const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
        const raw = matchBox[1].toLowerCase();
        boxDesejado = mapaNum[raw] || ('b' + raw);
      }
    }
  }

  const boxLivre = boxes.find(b => !boxesOcupadosIds.has(b.id));

  let boxIdAlocado = null;
  let statusOS = 'fila';
  let textoAlocacao = '';

  if (boxDesejado === 'fila') {
    boxIdAlocado = null;
    statusOS = 'fila';
    textoAlocacao = `🟡 *Fila de Espera:* Veículo posicionado na *Fila de Espera* do pátio conforme solicitado.`;
  } else if (boxDesejado && boxesValidos.has(boxDesejado)) {
    const boxAlvo = boxes.find(b => b.id === boxDesejado);
    const osNoBox = osOcupandoBoxes.find(o => o.box === boxDesejado);

    if (!osNoBox) {
      boxIdAlocado = boxDesejado;
      statusOS = 'executando';
      textoAlocacao = `🟢 *Box Alocado:* ${boxAlvo ? boxAlvo.nome : boxDesejado} (Conforme Solicitado)\nO box estava livre e o caminhão foi posicionado para atendimento imediato!`;
    } else {
      const veicOcup = (globalState.veiculos || []).find(v => v.id === osNoBox.vei);
      const placaOcup = veicOcup ? veicOcup.placa : 'N/I';
      if (boxLivre) {
        boxIdAlocado = boxLivre.id;
        statusOS = 'executando';
        textoAlocacao = `⚠️ *Box ${boxAlvo ? boxAlvo.nome : boxDesejado} Ocupado:* Já ocupado pela OS #${osNoBox.num} (${placaOcup}).\n🟢 *Redirecionado para:* ${boxLivre.nome} que estava disponível!`;
      } else {
        boxIdAlocado = null;
        statusOS = 'fila';
        textoAlocacao = `⚠️ *Box ${boxAlvo ? boxAlvo.nome : boxDesejado} Ocupado:* Já ocupado pela OS #${osNoBox.num} (${placaOcup}) e os demais boxes estão cheios.\n🟡 *Fila de Espera:* Veículo aguardando liberação no pátio.`;
      }
    }
  } else if (boxLivre) {
    boxIdAlocado = boxLivre.id;
    statusOS = 'executando';
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
    id: gerarId('os'),
    num: novoNum,
    cli: veiculo.cli,
    vei: veiculo.id,
    box: boxIdAlocado,
    st: statusOS,
    abertura: new Date().toISOString().split('T')[0],
    prev: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    desc: 0,
    queixa: textoOriginal || 'Check-in via WhatsApp',
    pecas: [],
    servicos: servicosIniciais,
    total: totalInicial,
    criadoEm: Date.now()
  };

  await enqueueWrite(async () => {
    // Re-check box allocation to prevent race conditions
    if (boxIdAlocado) {
      const isBoxOccupied = globalState.os.some(o => o.box === boxIdAlocado && o.st !== 'finalizada');
      if (isBoxOccupied) {
        // Redireciona para fila de espera
        novaOS.box = null;
        novaOS.st = 'fila';
        textoAlocacao += `\n⚠️ *Atenção:* O box escolhido foi ocupado neste exato momento por outro veículo. Direcionado para a fila.`;
      }
    }

    // Garante OS sequence sem duplicidade
    const maxNumReal = globalState.os.reduce((max, o) => Math.max(max, parseInt(o.num, 10) || 1000), 1040);
    novaOS.num = String(maxNumReal + 1);

    globalState.versao = Date.now();
    globalState.os.unshift(novaOS);
    await run("INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)", [JSON.stringify(globalState)]);
  });
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

/* ── 3. Classificação e Processamento de Documentos (Fotos & Mensagens) ── */

function formatarDataBR(d) {
  if (!d) return new Date().toLocaleDateString('pt-BR');
  if (typeof d === 'string' && d.includes('-')) {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
}

function extrairDadosDocumentoHeuristico(texto) {
  const t = (texto || '').toUpperCase();

  // 1. Identificação de Placa Veicular (Mercosul ou Padrão Antigo)
  const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
  const matchPlaca = t.match(placaRegex);

  // 2. Classificação por termos-chave
  const isPixOuComprovante = t.includes('COMPROVANTE') || t.includes('PAGAMENTO EFETUADO') ||
    t.includes('PAGAMENTO REALIZADO') || t.includes('TRANSFERENCIA') || t.includes('TRANSFERÊNCIA') ||
    t.includes('PIX REALIZADO') || (t.includes('PIX') && (t.includes('AUTENTICA') || t.includes('TRANSACAO') || t.includes('TRANSAÇÃO') || t.includes('DESTINO') || t.includes('FAVORECIDO') || t.includes('VALOR PAGO') || t.includes('PAGO PARA') || t.includes('ENVIO PIX')));

  const isNotaFiscal = t.includes('DANFE') || t.includes('DOCUMENTO AUXILIAR') ||
    t.includes('NF-E') || t.includes('NFE') || t.includes('NOTA FISCAL') ||
    t.includes('CHAVE DE ACESSO') || t.includes('PROTOCOLO DE AUTORIZ') || t.includes('INSCRIÇÃO ESTADUAL');

  const isPedido = t.includes('PEDIDO') || t.includes('ORÇAMENTO') || t.includes('ORCAMENTO') ||
    t.includes('COTAÇÃO') || t.includes('COTACAO') || t.includes('ESPELHO DE PEDIDO') ||
    t.includes('PROPOSTA COMERCIAL') || t.includes('PEDIDO DE COMPRA') || t.includes('COND. PAG');

  let tipo = 'outro';
  if (isPixOuComprovante) {
    tipo = 'comprovante_pagamento';
  } else if (isNotaFiscal) {
    tipo = 'nota_fiscal';
  } else if (isPedido) {
    tipo = 'pedido_compra';
  } else if (matchPlaca) {
    tipo = 'placa_veiculo';
  }

  // 3. Extração de Valores Monetários (R$)
  let valorTotal = 0;
  const valoresEncontrados = [];
  const regexValor = /(?:R\$\s*|VALOR\s*(?:TOTAL|PAGO|L[IÍ]QUIDO)?[:\s]*R?\$?\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{2}))/gi;
  let mv;
  while ((mv = regexValor.exec(t)) !== null) {
    const limpo = mv[1].replace(/\./g, '').replace(',', '.');
    const num = parseFloat(limpo);
    if (!isNaN(num) && num > 0) valoresEncontrados.push(num);
  }
  if (valoresEncontrados.length > 0) {
    valorTotal = Math.max(...valoresEncontrados);
  } else {
    const regexMoedaSolta = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;
    const moedas = [...t.matchAll(regexMoedaSolta)].map(m => parseFloat(m[0].replace(/\./g, '').replace(',', '.')));
    if (moedas.length > 0) valorTotal = Math.max(...moedas);
  }

  // 4. Extração de CNPJ
  let cnpj = '';
  const matchCNPJ = t.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  if (matchCNPJ) cnpj = matchCNPJ[0].replace(/\D/g, '');

  // 5. Extração de Chave NF-e (44 dígitos)
  let chaveAcesso = '';
  const seqsNumericas = t.match(/\d{44}/g);
  if (seqsNumericas && seqsNumericas.length > 0) {
    chaveAcesso = seqsNumericas[0];
  } else {
    // Tenta agrupar números ignorando espaços
    const textoSoNumeros = t.replace(/[^0-9]/g, '');
    const matchChave = textoSoNumeros.match(/\d{44}/);
    if (matchChave) chaveAcesso = matchChave[0];
  }

  // 6. Extração de Número de Documento (NF ou Pedido)
  let numeroDoc = '';
  const matchNum = t.match(/(?:N[ºo°\.]\s*|NUMERO[:\s]*|NF[:\s]*|PEDIDO[:\s]*(?:N[ºo°\.]\s*)?|Nº[:\s]*)(\d+(?:[\.\-]\d+)*)/i);
  if (matchNum) {
    numeroDoc = matchNum[1].replace(/\D/g, '');
  }

  // 7. Extração de Fornecedor / Favorecido
  let fornecedorOuFavorecido = '';
  const matchFav = t.match(/(?:PARA|FAVORECIDO|DESTINAT[AÁ]RIO|RECEBEDOR|NOME DO RECEBEDOR|FORNECEDOR|EMITENTE|RAZ[AÃ]O SOCIAL|PAGO PARA)[:\s]+([^\n\r]+)/i);
  if (matchFav) {
    fornecedorOuFavorecido = matchFav[1].split(/[-–|,\.]/)[0].trim();
  }

  // 8. Extração de Autenticação / Código Pix
  let autenticacao = '';
  const matchAuth = t.match(/(?:AUTENTICA[CÇ][AÃ]O|ID DA TRANSA[CÇ][AÃ]O|ID[:\s]+|C[OÓ]DIGO DE CONTROLE|TRANSAC[AÃ]O)[:\s]+([A-Z0-9\.\-]+)/i);
  if (matchAuth) autenticacao = matchAuth[1].trim();

  // 9. Forma de Pagamento
  let forma = 'Pix';
  if (t.includes('BOLETO')) forma = 'Boleto';
  else if (t.includes('TED')) forma = 'TED';
  else if (t.includes('TRANSFERENCIA') || t.includes('TRANSFERÊNCIA')) forma = 'Transferência Bancária';
  else if (t.includes('PIX')) forma = 'Pix';

  // 10. Data (DD/MM/YYYY)
  let dataISO = new Date().toISOString().slice(0, 10);
  const matchData = t.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (matchData) {
    dataISO = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
  }

  return {
    tipo,
    placa: matchPlaca ? matchPlaca[1].replace(/[- ]/g, '') : null,
    valor_total: valorTotal,
    numero_documento: numeroDoc,
    chave_acesso: chaveAcesso,
    cnpj,
    fornecedor: fornecedorOuFavorecido || (tipo === 'comprovante_pagamento' ? 'Favorecido Identificado' : 'Fornecedor Identificado'),
    favorecido: fornecedorOuFavorecido || 'Favorecido Identificado',
    autenticacao,
    forma_pagamento: forma,
    data: dataISO
  };
}

async function analisarDocumentoWhatsApp(base64Image, textoMensagem) {
  // Tentativa 1: IA Gemini se configurada e ativa
  if (ai && base64Image) {
    try {
      console.log('[Classificador IA] Enviando documento para análise multimodal no Gemini...');
      const prompt = `Você é um assistente contábil e operacional de oficina diesel pesada no Brasil.
Analise a imagem deste documento e a mensagem do usuário (se houver).
Classifique em uma das seguintes opções:
- "pedido_compra": se for pedido de compra, cotação, proposta ou orçamento de autopeças.
- "nota_fiscal": se for DANFE, NF-e ou cupom/nota fiscal de compra de peças ou serviços.
- "comprovante_pagamento": se for comprovante de Pix, boleto pago, TED ou transferência.
- "placa_veiculo": se for foto de caminhão, carreta ou placa veicular.
- "outro": caso não pertença a nenhuma acima.

Retorne APENAS um JSON estrito no formato:
{
  "tipo": "pedido_compra" | "nota_fiscal" | "comprovante_pagamento" | "placa_veiculo" | "outro",
  "fornecedor": "Razão social ou nome do fornecedor/favorecido",
  "cnpj": "CNPJ limpo se houver",
  "numero_documento": "Número do pedido ou NF",
  "chave_acesso": "Chave de 44 dígitos da NF se houver",
  "valor_total": 0.00,
  "data": "YYYY-MM-DD",
  "vencimento": "YYYY-MM-DD",
  "favorecido": "Nome do favorecido do pagamento",
  "pagador": "Nome do pagador",
  "autenticacao": "Código de autenticação bancária ou transação",
  "forma_pagamento": "Pix / Boleto / TED",
  "placa": "Placa veicular se houver",
  "itens": [
    { "nome": "Nome da peça", "quantidade": 1, "valor_unitario": 0.00 }
  ]
}`;
      const safeText = String(textoMensagem || '').replace(/"/g, '\\"').replace(/\{/g, '(').replace(/\}/g, ')');
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: `O usuário enviou a seguinte mensagem junto com a imagem: "${safeText}".\n\n` + prompt }
          ]
        }]
      });
      const parsed = safeJsonParse(resp.text);
      if (parsed && parsed.tipo && parsed.tipo !== 'outro') {
        console.log(`[Classificador IA] Documento classificado com sucesso como "${parsed.tipo}" via Gemini!`);
        return {
          tipo: parsed.tipo,
          origem: 'Gemini AI',
          dados: parsed
        };
      }
    } catch (eAI) {
      console.warn('[Classificador IA] Gemini indisponível ou token expirado, acionando OCR Tesseract heurístico:', eAI.message);
    }
  }

  // Tentativa 2: Extração via Tesseract OCR + Heurísticas robustas offline
  let textoExtraido = textoMensagem || '';
  if (base64Image) {
    try {
      console.log('[Classificador OCR] Executando OCR Tesseract local no documento...');
      const buffer = Buffer.from(base64Image, 'base64');
      const resOcr = await Tesseract.recognize(buffer, 'por');
      const textOcr = resOcr?.data?.text || '';
      console.log(`[Classificador OCR] Texto extraído (${textOcr.length} caracteres).`);
      textoExtraido = textOcr + '\n' + (textoMensagem || '');
    } catch (errOcr) {
      console.warn('[Classificador OCR] Erro no Tesseract OCR:', errOcr.message);
    }
  }

  const heuristica = extrairDadosDocumentoHeuristico(textoExtraido);
  console.log(`[Classificador Heurístico] Resultado da análise: tipo="${heuristica.tipo}", valor=${heuristica.valor_total}, forn="${heuristica.fornecedor}"`);
  return {
    tipo: heuristica.tipo,
    origem: 'Tesseract OCR / Heurística',
    dados: heuristica
  };
}

async function processarEntradaPedidoCompra({ forn, cnpj, numPedido, valor, itens, data, venc, remitenteFone, isContextOperacao }) {
  if (!globalState) globalState = {};
  if (!globalState.compras) globalState.compras = [];
  if (!globalState.contas) globalState.contas = [];

  const numero = String(numPedido || Math.floor(Math.random() * 9000 + 1000));
  const fornecedorNome = (forn && forn !== 'Fornecedor Identificado') ? forn : 'Fornecedor Peças Diesel';
  const valorTotal = Number(valor) || 0;
  const dataHoje = data || new Date().toISOString().slice(0, 10);
  const dataVenc = venc || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const compraId = gerarId('cmp');
  const itensLista = (itens && itens.length > 0)
    ? itens.map(it => ({
        nome: it.nome || 'Peça / Insumo',
        qtd: Number(it.quantidade || it.qtd) || 1,
        custo: Number(it.valor_unitario || it.custo || it.valor) || 0
      }))
    : [{ nome: `Peças Conforme Pedido #${numero}`, qtd: 1, custo: valorTotal }];

  // 1. Registra o Pedido de Compra (Sem alterar pecas/estoque)
  const novoPedido = {
    id: compraId,
    tipo: 'pedido',
    num: numero,
    forn: fornecedorNome,
    cnpj: cnpj || '',
    data: dataHoje,
    valor: valorTotal,
    situacao: 'Aguardando NF',
    itens: itensLista,
    origem: 'WhatsApp Operação',
    remetente: remitenteFone || ''
  };
  globalState.compras.unshift(novoPedido);

  // 2. Cria Provisionamento no Contas a Pagar
  const contaId = gerarId('ct');
  const novaConta = {
    id: contaId,
    tipo: 'pagar',
    desc: `[PROVISIONAMENTO] Pedido #${numero} — ${fornecedorNome}`,
    parte: fornecedorNome,
    valor: valorTotal,
    venc: dataVenc,
    pago: false,
    provisionado: true,
    situacao: 'Aguardando NF',
    pedidoId: compraId,
    doc: `PED-${numero}`,
    cat: 'Fornecedores Peças',
    origem: 'WhatsApp'
  };
  globalState.contas.unshift(novaConta);

  globalState.versao = Date.now();
  await salvarEstado();

  console.log(`[Pátio CRM] Pedido #${numero} registrado e provisionado no Contas a Pagar (R$ ${valorTotal.toFixed(2)}). Estoque aguardando NF.`);

  const respostaWhatsApp =
`📋 *PEDIDO DE COMPRA REGISTRADO COM SUCESSO!* 📦

🏢 *Fornecedor:* ${fornecedorNome}
🔢 *Nº do Pedido:* #${numero}
💵 *Valor Total:* ${formatarMoeda(valorTotal)}
📅 *Previsão de Vencimento:* ${formatarDataBR(dataVenc)}

⚠️ *Situação Contábil & Estoque:*
• 🟡 *Provisionado no Contas a Pagar* (Status: _Aguardando NF_).
• 🛑 *Estoque Físico/Fiscal:* Não alterado (aguardando emissão da Nota Fiscal pelo fornecedor).
• 🔗 Assim que a Nota Fiscal deste fornecedor for enviada aqui no grupo, o provisionamento será liquidado e as peças darão entrada no estoque automaticamente!

_Pátio CRM — Gestão de Compras & Operação_`;

  return { novoPedido, novaConta, respostaWhatsApp };
}

async function processarEntradaNotaFiscal({ forn, cnpj, numNF, chave, valor, itens, data, venc, remitenteFone, isContextOperacao }) {
  if (!globalState) globalState = {};
  if (!globalState.compras) globalState.compras = [];
  if (!globalState.contas) globalState.contas = [];
  if (!globalState.pecas) globalState.pecas = [];
  if (!globalState.nfsRecebidas) globalState.nfsRecebidas = [];

  const numero = String(numNF || Math.floor(Math.random() * 90000 + 10000));
  const fornecedorNome = (forn && forn !== 'Fornecedor Identificado') ? forn : 'Fornecedor Peças Diesel';
  const valorTotal = Number(valor) || 0;
  const dataHoje = data || new Date().toISOString().slice(0, 10);
  const dataVenc = venc || new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);

  // 1. Verifica se há Pedido de Compra provisionado em aberto para este fornecedor
  const fornLower = fornecedorNome.toLowerCase();
  const pedidosAguardando = globalState.compras.filter(c => c.tipo === 'pedido' && c.situacao === 'Aguardando NF');
  const pedidoVinculado = pedidosAguardando.find(p => {
    const pForn = (p.forn || '').toLowerCase();
    const mesmoFornecedor = pForn && (pForn.includes(fornLower) || fornLower.includes(pForn));
    const valorParecido = valorTotal > 0 && Math.abs((p.valor || 0) - valorTotal) < 2.0;
    return mesmoFornecedor && valorParecido;
  });

  let textoVinculo = '';
  if (pedidoVinculado) {
    pedidoVinculado.situacao = 'Concluída';
    pedidoVinculado.nfNumero = numero;
    pedidoVinculado.nfChave = chave || '';

    // Converte a conta provisionada em conta definitiva
    const contaProvisionada = globalState.contas.find(c =>
      c.provisionado && (c.pedidoId === pedidoVinculado.id || c.doc === `PED-${pedidoVinculado.num}`)
    );
    if (contaProvisionada) {
      contaProvisionada.provisionado = false;
      contaProvisionada.situacao = 'Confirmada NF';
      contaProvisionada.desc = `NF-e ${numero} — ${fornecedorNome} (Ref. Pedido #${pedidoVinculado.num})`;
      contaProvisionada.doc = `NF-${numero}`;
      contaProvisionada.parte = fornecedorNome;
      if (valorTotal > 0) contaProvisionada.valor = valorTotal;
      contaProvisionada.venc = dataVenc;
    }
    textoVinculo = `🔗 *Vinculado ao Pedido:* #${pedidoVinculado.num} (Provisionamento confirmado em definitivo)`;
    console.log(`[Pátio CRM] NF-e ${numero} vinculada com sucesso ao pedido provisionado #${pedidoVinculado.num}!`);
  } else {
    // Entrada direta de NF: cria conta a pagar definitiva
    const contaId = gerarId('ct');
    globalState.contas.unshift({
      id: contaId,
      tipo: 'pagar',
      desc: `NF-e ${numero} — ${fornecedorNome}`,
      parte: fornecedorNome,
      valor: valorTotal,
      venc: dataVenc,
      pago: false,
      provisionado: false,
      doc: `NF-${numero}`,
      cat: 'Fornecedores Peças',
      origem: 'WhatsApp'
    });
    textoVinculo = `📑 *Entrada:* Nota Fiscal Direta (Contas a Pagar gerado com vencimento em ${formatarDataBR(dataVenc)})`;
  }

  // 2. Alimenta Estoque (globalState.pecas)
  const itensLista = (itens && itens.length > 0)
    ? itens.map(it => ({
        nome: it.nome || 'Peça Diesel Conforme NF',
        qtd: Number(it.quantidade || it.qtd) || 1,
        custo: Number(it.valor_unitario || it.custo || it.valor) || (valorTotal / itens.length) || 0
      }))
    : [{ nome: `Peças Conforme NF-e #${numero}`, qtd: 1, custo: valorTotal }];

  const resumoItens = [];
  for (const it of itensLista) {
    const nomeNorm = it.nome.trim();
    let p = globalState.pecas.find(x => x.nome && x.nome.toLowerCase() === nomeNorm.toLowerCase());
    if (p) {
      p.qtd = (p.qtd || 0) + it.qtd;
      p.custo = it.custo || p.custo;
      if (p.venda <= p.custo) p.venda = Math.round(p.custo * 1.6);
      resumoItens.push(`• ${nomeNorm}: +${it.qtd} un (Estoque atual: ${p.qtd})`);
    } else {
      const novaPeca = {
        id: 'p_' + Date.now() + Math.floor(Math.random() * 1000),
        cod: 'NF-' + numero.slice(-4),
        nome: nomeNorm,
        un: 'un',
        qtd: it.qtd,
        min: 2,
        custo: it.custo,
        venda: Math.round(it.custo * 1.6) || 100,
        loc: 'Almoxarifado',
        forn: fornecedorNome
      };
      globalState.pecas.push(novaPeca);
      resumoItens.push(`• ${nomeNorm}: ${it.qtd} un (Novo item no almoxarifado)`);
    }
  }

  // 3. Registra no Módulo Fiscal
  globalState.nfsRecebidas.unshift({
    id: gerarId('nf'),
    num: numero,
    serie: '1',
    forn: fornecedorNome,
    cnpj: cnpj || '',
    chave: chave || '',
    valor: valorTotal,
    data: dataHoje,
    venc: dataVenc,
    pedidoVinculado: pedidoVinculado ? pedidoVinculado.num : null
  });

  // Salva no histórico de compras
  globalState.compras.unshift({
    id: gerarId('cmp'),
    tipo: 'nf',
    num: numero,
    forn: fornecedorNome,
    cnpj: cnpj || '',
    data: dataHoje,
    valor: valorTotal,
    situacao: 'Concluída',
    itens: itensLista,
    origem: 'WhatsApp',
    remetente: remitenteFone || ''
  });

  globalState.versao = Date.now();
  await salvarEstado();

  const respostaWhatsApp =
`🧾 *NOTA FISCAL PROCESSADA COM SUCESSO!* 🚚

🏢 *Fornecedor:* ${fornecedorNome} ${cnpj ? `\n📄 *CNPJ:* ${cnpj}` : ''}
🔢 *NF-e Nº:* #${numero}
💵 *Valor Total:* ${formatarMoeda(valorTotal)}
${textoVinculo}

📦 *Estoque / Almoxarifado Atualizado:*
${resumoItens.slice(0, 5).join('\n')}
${resumoItens.length > 5 ? `_... e mais ${resumoItens.length - 5} item(ns)_` : ''}

🏛️ *Fiscal & Financeiro:*
• Registro fiscal lançado em Notas Recebidas.
• Título confirmado no Contas a Pagar com vencimento em ${formatarDataBR(dataVenc)}.

_Pátio CRM — Gestão Integrada de Estoque & Compras_`;

  return { respostaWhatsApp };
}

async function processarComprovantePagamento({ favorecido, pagador, valor, data, autenticacao, forma, remitenteFone, isContextOperacao }) {
  if (!globalState) globalState = {};
  if (!globalState.contas) globalState.contas = [];
  if (!globalState.movimentos) globalState.movimentos = [];

  const valorPago = Number(valor) || 0;
  const favNome = (favorecido && favorecido !== 'Favorecido Identificado') ? favorecido : '';
  const dataHoje = data || new Date().toISOString().slice(0, 10);
  const formaPgto = forma || 'Pix';

  // 1. Localiza conta a pagar correspondente em aberto
  const contasPagarAbertas = globalState.contas.filter(c => c.tipo === 'pagar' && !c.pago);
  let contaAlvo = null;

  if (favNome && valorPago > 0) {
    const favNorm = favNome.toLowerCase();
    contaAlvo = contasPagarAbertas.find(c => {
      const pNome = (c.parte || c.desc || '').toLowerCase();
      const bateValor = Math.abs((c.valor || 0) - valorPago) < 0.1;
      return bateValor && (pNome.includes(favNorm) || favNorm.includes(pNome));
    });
  }

  // Removemos as buscas soltas por apenas valor ou apenas nome
  // Se não encontrou match preciso (nome E valor), a variável contaAlvo ficará null

  let detalheLiquidacao = '';
  if (contaAlvo) {
    contaAlvo.pago = true;
    contaAlvo.dataPgto = dataHoje;
    contaAlvo.comprovanteAuth = autenticacao || '';
    contaAlvo.forma = formaPgto;
    detalheLiquidacao = `✅ *Título Liquidado:* Baixa confirmada no título "${contaAlvo.desc}"`;
  } else {
    detalheLiquidacao = `📝 *Lançamento:* Pagamento avulso registrado como despesa de peças/fornecedores`;
  }

  // 2. Lança saída de caixa em movimentos
  const movId = 'mv_' + Date.now();
  const descMov = contaAlvo
    ? `Baixa: ${contaAlvo.desc} (${contaAlvo.parte || favNome})`
    : `Pagamento: ${favNome || 'Fornecedor'} (${formaPgto})`;

  const novoMovimento = {
    id: movId,
    data: dataHoje,
    tipo: 'saida',
    desc: descMov,
    valor: valorPago || (contaAlvo ? contaAlvo.valor : 0),
    cat: contaAlvo ? (contaAlvo.cat || 'Fornecedores Peças') : 'Fornecedores Peças',
    conc: true,
    forma: formaPgto,
    auth: autenticacao || '',
    origem: 'WhatsApp'
  };
  globalState.movimentos.push(novoMovimento);

  // Calcula novo saldo
  const cfg = globalState.cfg || {};
  const saldoInicial = Number(cfg.saldoInicial) || 0;
  const totalEntradas = globalState.movimentos.filter(m => m.tipo === 'entrada').reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const totalSaidas = globalState.movimentos.filter(m => m.tipo === 'saida').reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const saldoAtual = saldoInicial + totalEntradas - totalSaidas;

  globalState.versao = Date.now();
  await salvarEstado();

  console.log(`[Pátio CRM] Comprovante de ${formaPgto} processado: R$ ${novoMovimento.valor.toFixed(2)}. Novo saldo: R$ ${saldoAtual.toFixed(2)}`);

  const respostaWhatsApp =
`💸 *COMPROVANTE DE PAGAMENTO CONCILIADO!* ✅

👤 *Favorecido:* ${favNome || (contaAlvo ? contaAlvo.parte : 'Fornecedor')}
💵 *Valor Liquidado:* ${formatarMoeda(novoMovimento.valor)}
💳 *Forma:* ${formaPgto}
📅 *Data:* ${formatarDataBR(dataHoje)}
${autenticacao ? `🔐 *Autenticação:* ${autenticacao}\n` : ''}
${detalheLiquidacao}

💵 *Novo Saldo em Caixa:* *${formatarMoeda(saldoAtual)}*
_Movimentação financeira lançada no fluxo de caixa e conciliada no Pátio CRM._`;

  return { respostaWhatsApp, contaAlvo, novoMovimento, saldoAtual };
}

/* ── Auto-Sincronização e Descoberta de Grupos ───────────── */
async function sincronizarGruposAutomaticamente() {
  try {
    if (!wppClient) return;
    console.log('[WhatsApp] Sincronizando e auto-detectando grupos no WhatsApp...');
    const grupos = await obterGruposWhatsApp();
    console.log(`[WhatsApp] Total de grupos encontrados na conta: ${grupos.length}`);
    grupos.forEach(g => {
      console.log(`   📁 Grupo: "${g.name}" | ID: ${g.id}`);
    });

    if (!globalState) globalState = {};
    if (!globalState.cfg) globalState.cfg = {};

    let atualizou = false;

    // 1. Limpa imediatamente grupo de faturamento se estiver associado a Admin
    if (globalState.cfg.grupoAdminId === '120363428179962435@g.us' || globalState.cfg.grupoAdminId === '120363428840376088@g.us') {
      console.warn('[WhatsApp] Limpando grupoAdminId proibido (Faturamento/Compras).');
      globalState.cfg.grupoAdminId = '';
      atualizou = true;
    }

    // 2. Localiza grupo Administração (estritamente admin/administração, JAMAIS faturamento ou compras)
    const grupoAdminEncontrado = grupos.find(g => {
      const n = (g.name || '').toLowerCase();
      if (n.includes('faturamento') || n.includes('compras')) return false;
      return n.includes('admin') || n.includes('administra') || n.includes('gestão') || n.includes('gerência');
    });
    if (grupoAdminEncontrado && (!globalState.cfg.grupoAdminId || globalState.cfg.grupoAdminId.startsWith('12036300000000000'))) {
      globalState.cfg.grupoAdminId = grupoAdminEncontrado.id;
      console.log(`🎯 [WhatsApp] Grupo da Administração auto-vinculado: "${grupoAdminEncontrado.name}" (${globalState.cfg.grupoAdminId})`);
      atualizou = true;
    }

    // 2. Localiza grupo Operação
    const grupoOpEncontrado = grupos.find(g => {
      const n = (g.name || '').toLowerCase();
      return (n.includes('opera') || n.includes('patio') || n.includes('pátio') || n.includes('oficina')) && g.id !== globalState.cfg.grupoAdminId;
    });
    if (grupoOpEncontrado && (!globalState.cfg.grupoOperacaoId || globalState.cfg.grupoOperacaoId.startsWith('12036300000000000'))) {
      globalState.cfg.grupoOperacaoId = grupoOpEncontrado.id;
      console.log(`🎯 [WhatsApp] Grupo da Operação auto-vinculado: "${grupoOpEncontrado.name}" (${globalState.cfg.grupoOperacaoId})`);
      atualizou = true;
    }

    if (atualizou) {
      globalState.versao = Date.now();
      await salvarEstado();
      console.log('[WhatsApp] Configurações de grupos salvas e persistidas no SQLite.');
    }
  } catch (err) {
    console.warn('[WhatsApp] Erro na auto-sincronização de grupos:', err.message);
  }
}

/* ── Inicialização do Cliente WhatsApp ───────────────────── */
function iniciarWhatsApp() {
  console.log('[WhatsApp] Iniciando cliente WhatsApp Web...');
  const authPath = path.resolve(ROOT_DIR, '.wwebjs_auth');

  wppClient = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
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

    // Monitoramento ativo: se por qualquer motivo o evento 'ready' demorar,
    // verifica via getState() / info se o cliente já está pronto para operar
    let tentativasReady = 0;
    const monitorPronto = setInterval(async () => {
      tentativasReady++;
      try {
        if (wppStatus.status === 'pronto') {
          clearInterval(monitorPronto);
          return;
        }
        const state = await wppClient.getState().catch(() => null);
        if (state === 'CONNECTED' || wppClient.info) {
          wppStatus.status = 'pronto';
          wppStatus.qr = null;
          wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
          wppStatus.ultimoUpdate = new Date().toISOString();
          console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
          clearInterval(monitorPronto);
          await sincronizarGruposAutomaticamente();
        }
      } catch (e) {}
      if (tentativasReady > 30) clearInterval(monitorPronto);
    }, 2000);
  });

  wppClient.on('ready', async () => {
    wppStatus.status = 'pronto';
    wppStatus.qr = null;
    wppStatus.user = wppClient.info ? wppClient.info.wid.user : 'Conectado';
    wppStatus.ultimoUpdate = new Date().toISOString();
    console.log(`✅ [WhatsApp] Agente Virtual Conectado e Pronto! (${wppStatus.user})`);
    await sincronizarGruposAutomaticamente();
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
  // Handler de Mensagens com IA + Roteamento por Grupos (Admin vs Operação)
  wppClient.on('message', async (msg) => {
    // 1. Ignora status/stories e transmissões de broadcast
    if (msg.from.includes('status') || msg.from.includes('@broadcast')) {
      return;
    }

    const cfg = globalState?.cfg || {};
    const grupoAdminId = cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID || '';
    const grupoOperacaoId = cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID || '';

    const isGroup = msg.from.includes('@g.us');
    const isGrupoAdmin = isGroup && Boolean(grupoAdminId) && (msg.from === grupoAdminId);
    const isGrupoOperacao = isGroup && Boolean(grupoOperacaoId) && (msg.from === grupoOperacaoId);

    // Lista de administradores cadastrados (env + estado)
    const adminList = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    if (cfg.adminFones && Array.isArray(cfg.adminFones)) {
      cfg.adminFones.forEach(f => {
        const clean = String(f).replace(/\D/g, '');
        if (clean && !adminList.includes(clean)) adminList.push(clean);
      });
    }

    // Identifica o autor da mensagem
    // Em grupos, msg.author é o JID do participante; no chat direto, msg.from é o participante
    const rawAuthor = isGroup ? (msg.author || msg.from) : msg.from;
    const fromNumber = (rawAuthor || '').split('@')[0].replace(/\D/g, '');
    const isSenderAdmin = adminList.length > 0 && adminList.some(adm => {
      // Normalização e comparação estrita. Evita que '9999' valide um número '5562999999999'
      const admNorm = adm.startsWith('55') ? adm : `55${adm}`;
      const fromNorm = fromNumber.startsWith('55') ? fromNumber : `55${fromNumber}`;
      return admNorm === fromNorm || fromNumber.slice(-8) === adm.slice(-8); // Fallback mais seguro
    });

    // ── Política de Grupos e Privacidade de Clientes ──
    if (isGroup) {
      // Se for grupo e ainda não estava mapeado pelo ID, não faz auto-vínculo inseguro.
      // A vinculação de grupos deve ser feita explicitamente pelo painel administrativo (UI).
      if (msg.from === '120363428179962435@g.us' || msg.from === '120363428840376088@g.us') {
        return; // Jamais processar mensagens do Faturamento ou Compras
      }

      // Se não for nenhum dos dois grupos autorizados do Pátio CRM, ignora
      if (!isGrupoAdmin && !isGrupoOperacao) {
        return;
      }
    } else {
      // Se for link de convite para grupo recebido no privado
      const linkInviteMatch = (msg.body || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]{20,30})/);
      if (linkInviteMatch && linkInviteMatch[1]) {
        try {
          if (!isSenderAdmin) {
            console.log(`[WhatsApp] Convite negado: remetente não é administrador.`);
            return;
          }
          const inviteCode = linkInviteMatch[1];
          console.log(`[WhatsApp] Link de convite recebido do administrador (${inviteCode}). Aceitando convite...`);
          const groupId = await wppClient.acceptInvite(inviteCode);
          console.log(`✅ [WhatsApp] Entrou com sucesso no grupo via convite: ${groupId}`);
          await sincronizarGruposAutomaticamente();
          await msg.reply(`✅ *Convite aceito com sucesso!*\nO agente agora faz parte do grupo (\`${groupId}\`).`);
          return;
        } catch (eInv) {
          console.error('[WhatsApp] Erro ao aceitar convite:', eInv.message);
          await msg.reply(`⚠️ Falha ao entrar no grupo: ${eInv.message}`);
          return;
        }
      }

      // Se for mensagem direta / privada:
      // O agente permanece SILENCIOSO para clientes comuns para não interferir no atendimento humano.
      // Somente responde se o remetente for um administrador autorizado testando/gerenciando no privado.
      if (!isSenderAdmin) {
        return;
      }
    }

    const isContextAdmin = isGrupoAdmin || (!isGroup && isSenderAdmin);
    const isContextOperacao = isGrupoOperacao;

    // 2. Download de Mídia se houver foto anexada com retentativas automáticas
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
    const textoLower = textoMensagem.toLowerCase().trim();
    console.log(`[WhatsApp] Mensagem no contexto [${isContextAdmin ? 'ADMIN' : (isContextOperacao ? 'OPERAÇÃO' : 'PRIVADO')}] de ${fromNumber}: "${textoMensagem}" | Foto: ${!!base64Image}`);

    // ── Análise Inteligente de Documento (Fotos & Mensagens) ──
    let docAnalise = null;
    const isDocTextual = textoLower.includes('pedido') || textoLower.includes('orçamento') || textoLower.includes('orcamento') ||
      textoLower.includes('nota fiscal') || textoLower.includes('danfe') || textoLower.includes('nf-e') || textoLower.includes('nfe') ||
      textoLower.includes('comprovante') || textoLower.includes('pagamento pix') || textoLower.includes('pago ');

    if (base64Image || isDocTextual) {
      try {
        docAnalise = await analisarDocumentoWhatsApp(base64Image, textoMensagem);
      } catch (eDoc) {
        console.warn('[WhatsApp] Erro na análise de documento:', eDoc.message);
      }
    }

    // 1. Processamento de Pedido de Compra (Provisionamento no Contas a Pagar + Aguardando NF)
    if (docAnalise && docAnalise.tipo === 'pedido_compra') {
      const resPedido = await processarEntradaPedidoCompra({
        ...docAnalise.dados,
        numPedido: docAnalise.dados.numero_documento,
        valor: docAnalise.dados.valor_total,
        remitenteFone: fromNumber,
        isContextOperacao
      });
      await msg.reply(resPedido.respostaWhatsApp);
      return;
    }

    // 2. Processamento de Nota Fiscal (Liquidação de pedido pendente / Entrada Direta + Estoque + Fiscal)
    if (docAnalise && docAnalise.tipo === 'nota_fiscal') {
      const resNF = await processarEntradaNotaFiscal({
        ...docAnalise.dados,
        numNF: docAnalise.dados.numero_documento,
        chave: docAnalise.dados.chave_acesso,
        valor: docAnalise.dados.valor_total,
        remitenteFone: fromNumber,
        isContextOperacao
      });
      await msg.reply(resNF.respostaWhatsApp);
      return;
    }

    // 3. Processamento de Comprovante de Pagamento (Baixa no Contas a Pagar + Saída de Caixa)
    if (docAnalise && docAnalise.tipo === 'comprovante_pagamento') {
      const resPgto = await processarComprovantePagamento({
        ...docAnalise.dados,
        valor: docAnalise.dados.valor_total,
        forma: docAnalise.dados.forma_pagamento,
        remitenteFone: fromNumber,
        isContextOperacao
      });
      await msg.reply(resPgto.respostaWhatsApp);
      return;
    }

    // Expressão regular para placas de veículos brasileiros (Mercosul ou Antiga: ABC1234, ABC1D23, ABC-1234)
    const placaRegex = /\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/i;
    let matchPlaca = textoMensagem.match(placaRegex);
    let placaDaFoto = docAnalise?.dados?.placa || null;

    if (base64Image && !placaDaFoto) {
      try {
        const buffer = Buffer.from(base64Image, 'base64');
        const resOcr = await Tesseract.recognize(buffer, 'por');
        const textOcr = (resOcr?.data?.text || '').toUpperCase();
        const m = textOcr.match(placaRegex);
        if (m) {
          placaDaFoto = m[1].replace(/[- ]/g, '');
        }
      } catch (_) {}
    }

    const placaIdentificada = matchPlaca ? matchPlaca[1].toUpperCase().replace(/[- ]/g, '') : placaDaFoto;
    if (placaIdentificada) {
      ultimasPlacas.set(fromNumber, { placa: placaIdentificada, timestamp: Date.now() });
    }

    // Memória contextual de placa recente para este contato (últimos 15 minutos)
    const infoRecente = ultimasPlacas.get(fromNumber);
    const placaContexto = (infoRecente && (Date.now() - infoRecente.timestamp < 15 * 60 * 1000)) ? infoRecente.placa : null;

    // Em grupos, evitar responder conversas normais/paralelas entre funcionários (anti-spam)
    const isComandoExplicito = textoLower.startsWith('!') ||
      ['relatorio', 'relatório', 'caixa', 'saldo', 'patio', 'pátio', 'boxes', 'ajuda', 'menu', 'comandos'].includes(textoLower);
    const isConsultaStatus = textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento');
    const isAberturaOS = textoLower.includes('abrir os') || textoLower.startsWith('abrir ') || textoLower === 'abrir';
    const isLancamentoItem = textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar');
    const isSaudacao = textoLower === 'oi' || textoLower === 'ola' || textoLower === 'olá' || textoLower === 'bom dia' || textoLower === 'boa tarde' || textoLower === 'boa noite' || textoLower.startsWith('bot') || textoLower.startsWith('agente');

    if (isGroup && !isComandoExplicito && !isConsultaStatus && !isAberturaOS && !isLancamentoItem && !base64Image && !matchPlaca) {
      // Conversa comum entre membros no grupo — robô não interfere
      return;
    }

    try {
      // ── COMANDO: Consulta de Caixa / Posição Financeira ──
      if (textoLower === '!caixa' || textoLower === 'caixa' || textoLower === 'saldo' || textoLower === '!financeiro' || textoLower === 'financeiro') {
        if (isContextOperacao) {
          await msg.reply('🔒 *Acesso Restrito:* Informações financeiras de caixa e valores são disponibilizadas exclusivamente no Grupo da Administração.');
          return;
        }
        const resCaixa = gerarResumoCaixa(globalState);
        await msg.reply(resCaixa);
        return;
      }

      // ── COMANDO: Relatório Diário ──
      if (textoLower === '!relatorio' || textoLower === 'relatorio' || textoLower === 'relatório' || textoLower === '!posicao' || textoLower === 'posicao' || textoLower === 'posiçao') {
        if (isContextOperacao) {
          // Grupo Operação: 2 mensagens sem nenhum dado financeiro ou R$
          const msgsOp = gerarMensagensOperacao(globalState);
          await msg.reply(msgsOp[0]);
          await new Promise(r => setTimeout(r, 800));
          await wppClient.sendMessage(msg.from, msgsOp[1]);
          return;
        } else {
          // Grupo Administração: 3 mensagens temáticas + Infográfico JPG
          const msgs = gerarMensagensAdmin(globalState);
          try {
            const jpgBuffer = await gerarImagemIndicadoresJPG(globalState);
            const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
            await wppClient.sendMessage(msg.from, media, { caption: msgs[0] });
          } catch (imgErr) {
            console.warn('[WhatsApp] Falha ao enviar imagem JPG no comando !relatorio, enviando texto:', imgErr.message);
            await msg.reply(msgs[0]);
          }
          await new Promise(r => setTimeout(r, 800));
          await wppClient.sendMessage(msg.from, msgs[1]);
          await new Promise(r => setTimeout(r, 800));
          await wppClient.sendMessage(msg.from, msgs[2]);
          return;
        }
      }

      // ── COMANDO: Ocupação do Pátio e Boxes ──
      if (textoLower === '!patio' || textoLower === 'patio' || textoLower === 'pátio' || textoLower === 'boxes') {
        const resPatio = gerarResumoPatio(globalState);
        await msg.reply(resPatio);
        return;
      }

      // ── COMANDO: Menu de Ajuda / Comandos ──
      if (textoLower === '!ajuda' || textoLower === 'ajuda' || textoLower === 'menu' || textoLower === '!comandos' || textoLower === 'comandos') {
        if (isContextOperacao) {
          const menuOp =
`🛠️ *COMANDOS OPERACIONAIS — PÁTIO CRM* 🚛

Olá, equipe de pátio e compras! Comandos e ações disponíveis:

📦 *Entradas & Documentos (Envie a Foto ou Texto):*
• 📋 *Foto de Pedido de Compra / Orçamento* ➔ Provisiona no Contas a Pagar (Status: _Aguardando NF_)
• 🧾 *Foto de Nota Fiscal (NF-e / DANFE)* ➔ Entrada de peças no almoxarifado, liquida pedido pendente e alimenta o financeiro/fiscal
• 💸 *Foto de Comprovante de Pagamento (Pix / Boleto / TED)* ➔ Baixa em conta a pagar e lançamento de saída de caixa

🚛 *Pátio & Ordens de Serviço:*
• 📸 *Foto da Placa ou Caminhão* ➔ Check-in e abertura automática de OS
• 🚛 *!patio* ➔ Ocupação dos boxes em tempo real
• 📋 *!relatorio* ➔ Veículos amanhecidos na oficina
• 🔍 *Status [placa]* ➔ Andamento e serviços (ex: *Status ABC1234*)
• ➕ *Abrir OS [placa]* ➔ Nova OS por texto (ex: *Abrir OS ABC1234*)
• 📝 *Inclua [serviço]* ➔ Adicionar item à OS (ex: *Inclua troca de mola*)

_Pátio CRM — Operação de Pátio e Oficina_`;
          await msg.reply(menuOp);
          return;
        } else {
          const menuAdmin =
`🛠️ *COMANDOS DE ADMINISTRADOR — PÁTIO CRM* 🚛

Olá! Você tem acesso aos comandos executivos do sistema:

📊 *!relatorio* — Relatório executivo completo (3 mensagens + Gráfico JPG)
💰 *!caixa* — Posição financeira consolidada e títulos do dia
🚛 *!patio* — Ocupação dos boxes e pátio em tempo real
📦 *Fotos de Pedidos, Notas Fiscais e Comprovantes* — Lançamento, provisionamento e conciliação automáticos
🔍 *Status [placa]* — Consultar OS de um veículo (ex: *Status ABC1234*)
➕ *Abrir OS [placa]* — Abrir nova OS com placa ou foto do caminhão
📝 *Inclua [serviço]* — Adicionar item à OS em andamento

_Pátio CRM — Gestão de Oficina Pesada_`;
          await msg.reply(menuAdmin);
          return;
        }
      }

      // ── FLUXO A: Consulta de Status de Veículo ou OS ──
      if (textoLower.includes('status') || textoLower.includes('como está') || textoLower.includes('consultar') || textoLower.includes('andamento')) {
        const osLista = globalState?.os || [];
        const placaAlvo = placaIdentificada || placaContexto;

        if (placaAlvo) {
          const veic = (globalState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
          const osVeiculo = veic ? osLista.find(o => o.vei === veic.id && o.st !== 'finalizada') : null;

          if (osVeiculo) {
            const boxInfo = osVeiculo.box ? ((globalState?.boxes || []).find(b => b.id === osVeiculo.box) || { nome: 'Box Pátio' }).nome : 'Fila de Espera no Pátio';
            
            // Para Operação, não exibir preços ou R$
            let itensServ = '';
            let itensPec = '';
            if (isContextOperacao) {
              itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x)`).join('\n') || '• Vistoria de Entrada';
              itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x)`).join('\n');
            } else {
              itensServ = (osVeiculo.servicos || []).map(s => `• ${s.nome} (${s.qtd}x) — R$ ${(s.valor * s.qtd).toFixed(2)}`).join('\n') || '• Vistoria de Entrada';
              itensPec = (osVeiculo.pecas || []).map(p => `• ${p.nome} (${p.qtd}x) — R$ ${(p.valor * p.qtd).toFixed(2)}`).join('\n');
            }

            let resposta =
`📋 *Status da OS #${osVeiculo.num} — Placa ${veic.placa}*

🚛 *Veículo:* ${veic.marca || ''} ${veic.modelo || 'Caminhão'}
📍 *Localização:* ${boxInfo}
⚙️ *Situação:* *${osVeiculo.st.toUpperCase()}*
📅 *Previsão de Entrega:* ${osVeiculo.prev || 'Em andamento'}

🔧 *Serviços Lançados:*
${itensServ}
${itensPec ? `\n📦 *Peças:* \n${itensPec}` : ''}`;

            if (!isContextOperacao) {
              resposta += `\n\n💰 *Valor Atual da OS:* R$ ${(osVeiculo.total || 0).toFixed(2)}`;
            }

            resposta += `\n\n_Para adicionar serviços à OS, digite: "Inclua [serviço]"_`;
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

      // ── FLUXO B0: Redirecionamento de Veículo Ativo para Box / Fila de Espera ──
      const isRedirecionamentoBox = (
        textoLower.includes('direcionar') ||
        textoLower.includes('mover') ||
        textoLower.includes('mudar box') ||
        textoLower.includes('trocar box') ||
        textoLower.includes('colocar no box') ||
        textoLower.includes('passar para o box')
      ) && !textoLower.includes('abrir os') && !textoLower.includes('abrir nova os');

      if (isRedirecionamentoBox) {
        const placaAlvo = placaIdentificada || placaContexto;
        const osLista = (globalState?.os || []).filter(o => o.st !== 'finalizada');
        let osAlvo = null;
        let veicAlvo = null;

        if (placaAlvo) {
          veicAlvo = (globalState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaAlvo);
          if (veicAlvo) osAlvo = osLista.find(o => o.vei === veicAlvo.id);
        }

        if (!osAlvo) {
          const matchNum = textoMensagem.match(/\bos\s*(?:#|n[º°]?)?\s*(\d+)\b/i);
          if (matchNum) {
            osAlvo = osLista.find(o => String(o.num) === matchNum[1]);
            if (osAlvo) veicAlvo = (globalState?.veiculos || []).find(v => v.id === osAlvo.vei);
          }
        }

        if (osAlvo && veicAlvo) {
          const boxesValidos = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
          const boxes = (globalState.boxes || []).filter(b => boxesValidos.has(b.id));

          let boxDesejado = null;
          if (textoLower.includes('fila') || textoLower.includes('pátio') || textoLower.includes('patio') || textoLower.includes('espera')) {
            boxDesejado = 'fila';
          } else {
            const matchBox = textoLower.match(/\b(?:box|ao\s+box|para\s+o\s+box)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                             textoLower.match(/\bbox\s*(?:b)?([1-6])\b/i);
            if (matchBox) {
              const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
              const raw = matchBox[1].toLowerCase();
              boxDesejado = mapaNum[raw] || ('b' + raw);
            }
          }

          if (boxDesejado === 'fila') {
            osAlvo.box = null;
            osAlvo.st = 'fila';
            globalState.versao = Date.now();
            await salvarEstado();
            await msg.reply(`🟡 *Veículo Movido para a Fila:*\nCaminhão placa *${veicAlvo.placa}* (OS #${osAlvo.num}) retirado do box e colocado na *Fila de Espera* do pátio.`);
            return;
          } else if (boxDesejado && boxesValidos.has(boxDesejado)) {
            const boxAlvo = boxes.find(b => b.id === boxDesejado) || { id: boxDesejado, nome: boxDesejado.toUpperCase() };
            const osOcupando = osLista.find(o => o.id !== osAlvo.id && o.box === boxDesejado);

            if (!osOcupando) {
              osAlvo.box = boxDesejado;
              osAlvo.st = 'executando';
              globalState.versao = Date.now();
              await salvarEstado();
              await msg.reply(
`✅ *Veículo Direcionado com Sucesso!*

🚛 *Veículo:* Placa *${veicAlvo.placa}* (OS #${osAlvo.num})
🟢 *Novo Box:* *${boxAlvo.nome}*
📋 *Status:* Em Execução

_Posicionamento atualizado em tempo real no Pátio CRM._`
              );
              return;
            } else {
              const veicOcup = (globalState.veiculos || []).find(v => v.id === osOcupando.vei);
              const placaOcup = veicOcup ? veicOcup.placa : 'N/I';
              const boxesLivres = boxes.filter(b => !osLista.some(o => o.box === b.id)).map(b => b.nome).join(', ') || 'Nenhum';
              await msg.reply(
`⚠️ *Box Indisponível:* O *${boxAlvo.nome}* já está ocupado pela OS #${osOcupando.num} (Placa *${placaOcup}*).

📋 *Boxes Livres no Momento:* ${boxesLivres}
_Para alocar em outro box, envie: *Direcionar placa ${veicAlvo.placa} para o [Box livre]*_`
              );
              return;
            }
          }
        }
      }

      // ── FLUXO B: Abertura de Nova OS (Se tiver placa na foto ou no texto, ou se o usuário pediu "abrir os") ──
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

      // ── FLUXO C: Lançar/Incluir Serviço ou Peça na OS Ativa ──
      if (textoLower.includes('inclua') || textoLower.includes('incluir') || textoLower.includes('adicione') || textoLower.includes('adicionar') || textoLower.includes('lance') || textoLower.includes('lancar') || textoLower.includes('lançar')) {
        const osLista = globalState?.os || [];
        let osAlvo = null;
        if (placaContexto) {
          const veic = (globalState?.veiculos || []).find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaContexto);
          if (veic) osAlvo = osLista.find(o => o.vei === veic.id && o.st !== 'finalizada');
        }
        if (!osAlvo) {
          await msg.reply('⚠️ *Placa ou OS não identificada.* Informe a placa do veículo ou o número da OS para incluir itens. Ex: *Inclua troca de óleo placa ABC1234*.');
          return;
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
          await salvarEstado();

          const veic = (globalState?.veiculos || []).find(v => v.id === osAlvo.vei) || { placa: 'N/I' };
          
          let resp = '';
          if (isContextOperacao) {
            resp =
`✅ *Item Adicionado com Sucesso à OS #${osAlvo.num}!*

🚛 *Veículo:* Placa *${veic.placa}*
📝 *Lançamento:* ${novoItem.qtd}x ${novoItem.nome}

_Atualização sincronizada no Pátio CRM._`;
          } else {
            resp =
`✅ *Item Adicionado com Sucesso à OS #${osAlvo.num}!*

🚛 *Veículo:* Placa *${veic.placa}*
📝 *Lançamento:* ${novoItem.qtd}x ${novoItem.nome}
💵 *Valor:* R$ ${(novoItem.qtd * novoItem.valor).toFixed(2)} (R$ ${novoItem.valor.toFixed(2)} cada)

💰 *Novo Total da OS:* R$ ${osAlvo.total.toFixed(2)}

_Atualização sincronizada no Pátio CRM._`;
          }

          await msg.reply(resp);
          return;
        } else {
          await msg.reply('Nenhuma Ordem de Serviço em andamento localizada para incluir itens. Para abrir uma nova OS, digite: *Abrir OS placa ABC1234*.');
          return;
        }
      }

      // ── FLUXO D: Usuário enviou foto mas não foi possível identificar documento ou placa ──
      if (base64Image) {
        const resposta = `📸 *Foto recebida no Pátio CRM!*\n\n` +
          `Não consegui identificar o documento ou a placa do caminhão com nitidez.\n\n` +
          `Você pode enviar:\n` +
          `• 📋 *Foto de Pedido de Compra / Orçamento*\n` +
          `• 🧾 *Foto ou DANFE de Nota Fiscal (NF-e)*\n` +
          `• 💸 *Comprovante de Pagamento (Pix / Boleto / TED)*\n` +
          `• 🚛 *Foto da Placa do Caminhão (Ex: ABC1D23)*`;
        await msg.reply(resposta);
        return;
      }

      // ── FLUXO E: Usuário pediu para abrir OS mas não informou placa ──
      if (textoLower.includes('abrir') && textoLower.includes('os')) {
        await msg.reply('Para abrir a Ordem de Serviço, por favor informe a placa do veículo (ex: *Abrir OS placa ABC1234*) ou envie uma foto do caminhão/placa.');
        return;
      }

      // ── FLUXO F: Saudações ──
      if (isSaudacao) {
        const saudacao = `Olá! Sou o assistente virtual do *Pátio CRM* 🚛⚙️\n\n` +
          `Como posso ajudar você hoje?\n` +
          `1️⃣ *Para abrir uma OS:* Digite *Abrir OS placa ABC1234* ou envie a foto da placa.\n` +
          `2️⃣ *Para consultar status:* Digite *Status placa ABC1234*.\n` +
          `3️⃣ *Para incluir serviços:* Digite *Inclua [serviço]*.\n` +
          `4️⃣ *Para ver a ocupação:* Digite *!patio*`;
        await msg.reply(saudacao);
        return;
      }

      // Se estiver no chat privado do administrador e não deu match nos anteriores:
      if (!isGroup) {
        await msg.reply(
          `Mensagem recebida no *Pátio CRM*! 🚛\n\n` +
          `• Digite *!ajuda* para ver todos os comandos disponíveis.\n` +
          `• Digite *!relatorio* para o relatório executivo matinal.\n` +
          `• Digite *!caixa* para a posição financeira.`
        );
      }
    } catch (localErr) {
      console.error('[WhatsApp] Erro no processamento de mensagem:', localErr);
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
