const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { UPLOADS_BASE } = require('../lib/file-storage');

const ROOT_DIR = path.resolve(__dirname, '../');

router.get('/precos', (req, res) => res.sendFile('precos.html', { root: path.join(ROOT_DIR, 'public') }));
router.get('/cadastro', (req, res) => res.sendFile('cadastro.html', { root: path.join(ROOT_DIR, 'public') }));
router.get('/checkout', (req, res) => res.sendFile('checkout.html', { root: path.join(ROOT_DIR, 'public') }));
router.get('/assinatura', (req, res) => res.sendFile('assinatura.html', { root: path.join(ROOT_DIR, 'public') }));

/* ── Servir Arquivos Estáticos do Frontend ────────────────── */
router.use('/js', express.static(path.join(ROOT_DIR, 'js'), { dotfiles: 'deny' }));
router.use('/uploads', (req,res,next)=>{
  const tenant=req.securityContext?.tenantId;
  let requested;try{requested=decodeURIComponent(req.path);}catch(_){return res.status(400).end();}
  const base=path.resolve(process.env.UPLOAD_DIR || path.join(ROOT_DIR,'public','uploads'));
  const target=path.resolve(base,'.'+requested),tenantRoot=path.join(base,String(tenant||''));
  const relative=path.relative(tenantRoot,target);
  if(!tenant || requested.split('/')[1]!==tenant || !relative || relative.startsWith('..') || path.isAbsolute(relative))return res.status(404).end();
  if(fs.existsSync(target)){const realRelative=path.relative(tenantRoot,fs.realpathSync(target));if(realRelative.startsWith('..')||path.isAbsolute(realRelative))return res.status(404).end();}
  if(req.path.toLowerCase().endsWith('.svg')) return res.status(403).end();
  next();
}, express.static(process.env.UPLOAD_DIR || path.join(ROOT_DIR,'public','uploads'), {dotfiles:'deny'}));
router.get('/style.css', (req, res) => res.sendFile('style.css', { root: ROOT_DIR }));
router.get('/index.html', (req, res) => res.sendFile('index.html', { root: ROOT_DIR }));
router.use((err, req, res, next) => {
  if (!err) return next();
  const status = err.type === 'entity.too.large' ? 413 : err.status || 500;
  res.status(status).json({ error: status === 413 ? 'Arquivo excede o limite permitido.' : 'Requisição inválida.' });
});

router.get('/', (req, res) => {
  res.sendFile('index.html', { root: ROOT_DIR });
});


module.exports = router;
