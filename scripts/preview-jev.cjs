'use strict';
// Dashboard local isolado. Não carrega server.js, db.js, dotenv ou integrações do CRM.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../tools/jev-dashboard');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/analysis.json', ['analysis.json', 'application/json; charset=utf-8']],
  ['/report.md', ['report.md', 'text/markdown; charset=utf-8']],
]);
function createServer() {
  return http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); return res.end('Host local exigido'); }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); res.writeHead(405); return res.end(); }
    let pathname;
    try { pathname = new URL(req.url, 'http://127.0.0.1').pathname; }
    catch { res.writeHead(400); return res.end(); }
    if (pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ app: 'jev-analysis-dashboard', status: 'ok' }));
    }
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const asset = assets.get(pathname);
    if (!asset) { res.writeHead(404); return res.end('Não encontrado'); }
    fs.readFile(path.join(root, asset[0]), (error, buffer) => {
      if (error) { res.writeHead(503); return res.end('Gere os artefatos: node tools/jev-dashboard/build.cjs'); }
      res.setHeader('Content-Type', asset[1]);
      if (pathname === '/report.md') res.setHeader('Content-Disposition', 'attachment; filename="analise-jev-patio-crm.md"');
      res.end(req.method === 'HEAD' ? undefined : buffer);
    });
  });
}
if (require.main === module) {
  const port = Number(process.argv[2] || 3894);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta inválida (1024–65535).');
  const server = createServer();
  server.on('error', err => { console.error(`Dashboard não iniciado: ${err.code || err.message}. Use outra porta como argumento.`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Jev × Pátio CRM: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
module.exports = { createServer };
