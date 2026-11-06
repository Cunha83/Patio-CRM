'use strict';

const { ImageRenderCache } = require('../../lib/image-cache');
const { getPuppeteer } = require('../whatsapp/whatsappState');
const { gerarHTMLPainelIndicadores } = require('./reportImageTemplate');

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

  const html = gerarHTMLPainelIndicadores(state, options);

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

module.exports = {
  getRenderBrowser,
  closeRenderBrowser,
  gerarImagemIndicadoresJPG
};

