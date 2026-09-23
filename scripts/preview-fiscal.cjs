'use strict';
// Instância integral do produto com autenticação real e recursos descartáveis.
const fs=require('fs'),os=require('os'),path=require('path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'patio-fiscal-preview-'));
Object.assign(process.env,{NODE_ENV:'test',DISABLE_INTEGRATIONS:'true',PORT:'3892',HOST:'127.0.0.1',DB_PATH:path.join(root,'test.db'),UPLOAD_DIR:path.join(root,'uploads'),BACKUP_DIR:path.join(root,'backups'),AUTH_USER:'fiscal_preview',AUTH_PASSWORD:'PreviewLocal-2026!',API_KEY:'',GEMINI_API_KEY:'',FISCAL_FOCUS_TOKENS:'{}'});
console.log('Prévia local integral: http://127.0.0.1:3892 — usuário fiscal_preview, senha descartável PreviewLocal-2026!');
require('../server');
setTimeout(()=>process.exit(0),20*60*1000).unref();
