const { ImageRenderCache } = require('../lib/image-cache');
const financialEngine = require('./financialEngine');
const { getOrLoadState, mutateTenantState } = require('../lib/serverContext');
const {
  getPuppeteer,
  getWppClient,
  getWppStatus,
  obterGruposWhatsApp,
  fecharModaisWhatsAppWeb,
  registrarIdMensagem,
  getWhatsAppModules
} = require('./whatsapp/whatsappState');

const {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio
} = financialEngine;

let browserRenderCache = null;
async function getRenderBrowser() {
  if (browserRenderCache && browserRenderCache.isConnected()) return browserRenderCache;
  const pptr = getPuppeteer();
  try {
    browserRenderCache = await pptr.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    return browserRenderCache;
  } catch (e) {
    browserRenderCache = await pptr.launch({ headless: true, args: ['--no-sandbox'] });
    return browserRenderCache;
  }
}

async function closeRenderBrowser() {
  if (browserRenderCache) {
    await browserRenderCache.close().catch(() => {});
    browserRenderCache = null;
  }
}

const imageRenderCache = new ImageRenderCache({ maxEntries: 50 });

async function gerarImagemIndicadoresJPG(state, tenantKey = 'default', options = {}) {
  state = state || {};
  const stVer = state.versao || 0;

  const cached = imageRenderCache.get(tenantKey, stVer, options.dataRef || '', options);
  if (cached) {
    return cached;
  }

  const agoraSP = financialEngine.obterAgoraSP(options.dataRef);
  const dHoje = agoraSP.dataISO;
  const dataFormatada = agoraSP.dataBR;
  const horaFormatada = agoraSP.horaBR;

  const cfg = state.cfg || {};
  const fin = financialEngine.calcularKPIsFinanceiros(state, { ...options, dataRef: dHoje, filtro: '30d' });
  const series = financialEngine.gerarSeriesGraficos(state, { ...options, dataRef: dHoje, filtro: '15d' });
  const op = financialEngine.calcularResumoOperacional(state, { ...options, dataRef: dHoje });

  const svgFluxo = financialEngine.gerarSVGBarrasFluxo(series.grafico1Fluxo, 990, 200);
  const svgProjecao = financialEngine.gerarSVGProjecao(series.grafico4Projecao, 990, 180);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body {
    background: #070b14;
    color: #f8fafc;
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    padding: 38px 44px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Cabeçalho */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #1e293b;
    padding-bottom: 18px;
  }
  .brand-title {
    font-size: 34px;
    font-weight: 900;
    color: #38bdf8;
    letter-spacing: -0.8px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-sub {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }
  .header-badge {
    background: #111827;
    border: 1px solid #334155;
    padding: 8px 16px;
    border-radius: 12px;
    text-align: right;
  }
  .header-empresa {
    font-size: 14px;
    font-weight: 800;
    color: #f1f5f9;
  }
  .header-data {
    font-size: 12px;
    color: #38bdf8;
    font-weight: 600;
    margin-top: 2px;
  }

  /* Cartão Hero Saldo */
  .hero-card {
    background: linear-gradient(135deg, #0f172a 0%, #131c2e 100%);
    border: 1.5px solid #2563eb;
    border-radius: 16px;
    padding: 22px 28px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    overflow: hidden;
  }
  .hero-card::after {
    content: '';
    position: absolute;
    top: 0; right: 0; width: 140px; height: 100%;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%);
  }
  .hero-label {
    font-size: 13px;
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 1px;
    color: #94a3b8;
    margin-bottom: 4px;
  }
  .hero-val {
    font-size: 42px;
    font-weight: 900;
    color: #38bdf8;
    letter-spacing: -1px;
  }
  .hero-sub {
    font-size: 13px;
    color: #64748b;
    margin-top: 4px;
  }
  .hero-metrics {
    display: flex;
    gap: 20px;
    z-index: 1;
  }
  .hero-stat {
    text-align: right;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid #1e293b;
    padding: 10px 16px;
    border-radius: 10px;
  }
  .hero-stat-label {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
  }
  .hero-stat-val {
    font-size: 18px;
    font-weight: 800;
    margin-top: 2px;
  }

  /* Grid 4 KPIs */
  .grid-kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .kpi-card {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 14px 16px;
    position: relative;
  }
  .kpi-title {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .kpi-val {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }
  .kpi-sub {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
  }

  /* Seções de Gráfico */
  .section-chart {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 14px;
    padding: 18px 22px;
  }
  .section-title {
    font-size: 14px;
    font-weight: 800;
    color: #f1f5f9;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-badge {
    font-size: 11px;
    font-weight: 600;
    background: #1e293b;
    color: #94a3b8;
    padding: 3px 8px;
    border-radius: 6px;
  }

  /* Barra de Radar Operacional */
  .radar-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    background: #0b1120;
    border: 1px solid #1e293b;
    border-radius: 12px;
    padding: 12px 18px;
  }
  .radar-box {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .radar-icon {
    font-size: 24px;
  }
  .radar-info-title {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
  }
  .radar-info-val {
    font-size: 16px;
    font-weight: 800;
    color: #f8fafc;
  }

  /* Rodapé */
  .footer {
    border-top: 1px solid #1e293b;
    padding-top: 12px;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #64748b;
    font-weight: 500;
  }
</style>
</head>
<body>
  <!-- Cabeçalho -->
  <div class="header">
    <div>
      <div class="brand-title">🚛 PÁTIO CRM</div>
      <div class="brand-sub">PAINEL DIÁRIO DE INDICADORES & PERFORMANCE</div>
    </div>
    <div class="header-badge">
      <div class="header-empresa">${cfg.empresa || 'Oficina Mecânica Pesada'}</div>
      <div class="header-data">${dataFormatada} • ${horaFormatada}</div>
    </div>
  </div>

  <!-- Cartão Hero Saldo Atual -->
  <div class="hero-card">
    <div>
      <div class="hero-label">Saldo Líquido em Caixa</div>
      <div class="hero-val">${fin.saldoAtualFormatado}</div>
      <div class="hero-sub">Posição consolidada das contas ativas hoje</div>
    </div>
    <div class="hero-metrics">
      <div class="hero-stat">
        <div class="hero-stat-label">A Receber (30d)</div>
        <div class="hero-stat-val" style="color:#10b981">${fin.aReceberTotalFormatado}</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-label">A Pagar (30d)</div>
        <div class="hero-stat-val" style="color:#ef4444">${fin.aPagarTotalFormatado}</div>
      </div>
    </div>
  </div>

  <!-- Grid 4 KPIs -->
  <div class="grid-kpis">
    <div class="kpi-card" style="border-left:4px solid #10b981">
      <div class="kpi-title">Receita do Mês</div>
      <div class="kpi-val" style="color:#10b981">${fin.receitaTotalFormatado}</div>
      <div class="kpi-sub">Faturamento realizado</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #38bdf8">
      <div class="kpi-title">Resultado Líquido</div>
      <div class="kpi-val" style="color:${fin.resultadoLiquido >= 0 ? '#38bdf8' : '#ef4444'}">${fin.resultadoLiquidoFormatado}</div>
      <div class="kpi-sub">Margem estimada de 30d</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #f59e0b">
      <div class="kpi-title">Ticket Médio</div>
      <div class="kpi-val" style="color:#f59e0b">${fin.ticketMedioFormatado}</div>
      <div class="kpi-sub">Por caminhão finalizado</div>
    </div>
    <div class="kpi-card" style="border-left:4px solid #818cf8">
      <div class="kpi-title">Veículos no Pátio</div>
      <div class="kpi-val" style="color:#818cf8">${op.veiculosNoPatio}</div>
      <div class="kpi-sub">${op.boxesOcupados} boxes em execução</div>
    </div>
  </div>

  <!-- Gráfico 1: Fluxo de Caixa (15 Dias) -->
  <div class="section-chart">
    <div class="section-title">
      <span>📊 FLUXO DE CAIXA: REALIZADO & PREVISTO (15 DIAS)</span>
      <span class="section-badge">🟢 Entradas vs 🔴 Saídas</span>
    </div>
    <div style="width:100%; height:200px; display:flex; justify-content:center; align-items:center;">
      ${svgFluxo}
    </div>
  </div>

  <!-- Gráfico 2: Projeção de Liquidez (Curva Acumulada) -->
  <div class="section-chart">
    <div class="section-title">
      <span>📈 PROJEÇÃO DE LIQUIDEZ E SALDO EM CONTA</span>
      <span class="section-badge">Trajetória Futura (R$)</span>
    </div>
    <div style="width:100%; height:180px; display:flex; justify-content:center; align-items:center;">
      ${svgProjecao}
    </div>
  </div>

  <!-- Radar Operacional & Ocupação -->
  <div class="radar-bar">
    <div class="radar-box">
      <span class="radar-icon">🚛</span>
      <div>
        <div class="radar-info-title">Taxa de Ocupação</div>
        <div class="radar-info-val">${op.taxaOcupacaoBoxes}% dos Boxes</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">🔧</span>
      <div>
        <div class="radar-info-title">Boxes Ocupados</div>
        <div class="radar-info-val">${op.boxesOcupados} de ${op.totalBoxes}</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">⏳</span>
      <div>
        <div class="radar-info-title">Fila de Triagem</div>
        <div class="radar-info-val">${op.naFila} na espera</div>
      </div>
    </div>
    <div class="radar-box">
      <span class="radar-icon">⚠️</span>
      <div>
        <div class="radar-info-title">Inadimplência</div>
        <div class="radar-info-val" style="color:${fin.taxaInadimplencia > 0 ? '#f59e0b' : '#10b981'}">${fin.taxaInadimplencia}%</div>
      </div>
    </div>
  </div>

  <!-- Rodapé -->
  <div class="footer">
    <div>Pátio CRM • Módulo de Gestão Especializado para Oficinas Pesadas & Diesel</div>
    <div>Relatório Gerencial Confidencial • Emitido via Servidor WhatsApp Web</div>
  </div>
</body>
</html>`;

  const browser = await getRenderBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1.5 });
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
    imageRenderCache.set(tenantKey, stVer, options.dataRef || '', options, buffer);
    return buffer;
  } finally {
    await page.close();
  }
}

async function enviarRelatorioGrupo(tipo = 'admin', context = {}) {
  const tenantKey = context.tenantKey || 'state';
  let state = context.state;
  if (!state) {
    state = await getOrLoadState(tenantKey);
  }
  if (!state) {
    return { success: false, error: `Estado não encontrado para o tenant ${tenantKey}.` };
  }

  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    return { success: true, mock: true, tipo, totalMensagens: tipo === 'admin' ? 3 : 2, tenantKey };
  }

  const wppClient = getWppClient();
  const wppStatus = getWppStatus();

  if (!wppClient) {
    console.error('[WhatsApp] Falha no disparo: wppClient não inicializado.');
    return { success: false, error: 'WhatsApp Web não está inicializado no servidor.' };
  }

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

  const cfg = state.cfg || {};
  let targetChatId = (tipo === 'admin'
    ? (cfg.grupoAdminId || process.env.WHATSAPP_GRUPO_ADMIN_ID)
    : (cfg.grupoOperacaoId || process.env.WHATSAPP_GRUPO_OPERACAO_ID)
  );

  // Blacklist estrita: Faturamento e Compras NUNCA podem ser usados para envio de relatórios da Administração
  if (tipo === 'admin') {
    if (targetChatId === '120363428179962435@g.us' || targetChatId === '120363428840376088@g.us') {
      console.warn(`[WhatsApp] Grupo proibido detectado para Administração (${targetChatId}). Desvinculando imediatamente.`);
      targetChatId = null;
      await mutateTenantState(tenantKey, (draft) => {
        if (!draft.cfg) draft.cfg = {};
        draft.cfg.grupoAdminId = '';
      });
    }
  }

  // Auto-descoberta se não configurado
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
        await mutateTenantState(tenantKey, (draft) => {
          if (!draft.cfg) draft.cfg = {};
          if (tipo === 'admin') draft.cfg.grupoAdminId = targetChatId;
          else draft.cfg.grupoOperacaoId = targetChatId;
        });
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
    const messageIds = [];
    await fecharModaisWhatsAppWeb();

    if (tipo === 'admin') {
      const msgs = gerarMensagensAdmin(state);
      console.log(`[WhatsApp] Disparando 3 mensagens + JPG para Grupo Admin (${targetChatId})...`);

      let sent1;
      try {
        console.log('[WhatsApp] Gerando imagem JPG de indicadores para Grupo Admin...');
        const jpgBuffer = await gerarImagemIndicadoresJPG(state, tenantKey);
        const { MessageMedia } = getWhatsAppModules();
        const media = new MessageMedia('image/jpeg', jpgBuffer.toString('base64'), 'painel_executivo.jpg');
        sent1 = await wppClient.sendMessage(targetChatId, media, { caption: msgs[0], waitUntilMsgSent: true });
      } catch (imgErr) {
        console.warn('[WhatsApp] Falha ao renderizar imagem JPG, enviando texto puro:', imgErr.message);
        sent1 = await wppClient.sendMessage(targetChatId, msgs[0], { waitUntilMsgSent: true });
      }
      await registrarIdMensagem(sent1, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent2 = await wppClient.sendMessage(targetChatId, msgs[1], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent2, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent3 = await wppClient.sendMessage(targetChatId, msgs[2], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent3, targetChatId, messageIds);

      console.log(`✅ [WhatsApp] Relatório completo (3 mensagens + JPG) enviado com sucesso para Grupo Admin (${targetChatId}):`, messageIds);
      return { success: true, tipo: 'admin', grupoId: targetChatId, totalMensagens: 3, messageIds };
    } else {
      const msgsOp = gerarMensagensOperacao(state);
      console.log(`[WhatsApp] Disparando 2 mensagens operacionais para Grupo Operação (${targetChatId})...`);

      const sent1 = await wppClient.sendMessage(targetChatId, msgsOp[0], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent1, targetChatId, messageIds);

      await new Promise(r => setTimeout(r, 1200));
      const sent2 = await wppClient.sendMessage(targetChatId, msgsOp[1], { waitUntilMsgSent: true });
      await registrarIdMensagem(sent2, targetChatId, messageIds);

      console.log(`✅ [WhatsApp] Relatório operacional (2 mensagens sem finanças) enviado para Grupo Operação (${targetChatId}):`, messageIds);
      return { success: true, tipo: 'operacao', grupoId: targetChatId, totalMensagens: 2, messageIds };
    }
  } catch (err) {
    console.error(`❌ [WhatsApp] Erro ao disparar para grupo ${tipo}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function enviarRelatorioAdministradores(destinatarioEspecifico = null, context = {}) {
  const tenantKey = context.tenantKey || 'state';
  let state = context.state;
  if (!state) {
    state = await getOrLoadState(tenantKey);
  }
  if (!state) {
    return { success: false, error: `Estado não encontrado para o tenant ${tenantKey}.` };
  }

  if (process.env.DISABLE_INTEGRATIONS === 'true') {
    return { success: true, mock: true, totalEnviados: 1, enviados: ['mock_admin'], tenantKey };
  }

  if (destinatarioEspecifico && destinatarioEspecifico.includes('@g.us')) {
    return await enviarRelatorioGrupo('admin', context);
  }

  const rel = gerarRelatorioExecutivo(state);
  let lista = [];
  if (destinatarioEspecifico) {
    lista = [destinatarioEspecifico];
  } else {
    const envAdmins = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(s => s.trim().replace(/\D/g, ''))
      .filter(Boolean);
    const cfgAdmins = (state.cfg?.adminFones || [])
      .map(s => String(s).trim().replace(/\D/g, ''))
      .filter(Boolean);
    lista = [...new Set([...envAdmins, ...cfgAdmins])];
  }

  if (lista.length === 0) {
    return { success: false, error: 'Nenhum telefone de administrador cadastrado no sistema (.env ou Configurações).' };
  }

  const wppClient = getWppClient();
  const wppStatus = getWppStatus();

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
  const messageIds = [];

  await fecharModaisWhatsAppWeb();
  for (const fone of lista) {
    try {
      let foneFormatado = fone.replace(/\D/g, '');
      if (!foneFormatado.startsWith('55') && foneFormatado.length >= 10 && foneFormatado.length <= 11) {
        foneFormatado = '55' + foneFormatado;
      }
      const chatId = `${foneFormatado}@c.us`;
      const sent = await wppClient.sendMessage(chatId, rel.texto, { waitUntilMsgSent: true });
      await registrarIdMensagem(sent, chatId, messageIds);
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
    messageIds,
    textoRelatorio: rel.texto
  };
}

module.exports = {
  gerarRelatorioExecutivo,
  gerarMensagensAdmin,
  gerarMensagensOperacao,
  gerarResumoCaixa,
  gerarResumoPatio,
  gerarImagemIndicadoresJPG,
  enviarRelatorioGrupo,
  enviarRelatorioAdministradores,
  closeRenderBrowser
};
