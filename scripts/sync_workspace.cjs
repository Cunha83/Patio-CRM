'use strict';

const fs = require('fs');
const path = require('path');

const DIR_IDE = path.resolve('C:/Users/AutoMolasFort/.gemini/antigravity-ide/scratch/Patio-CRM-main');
const DIR_RUN = path.resolve('C:/Users/AutoMolasFort/.gemini/antigravity/scratch/Patio-CRM-main/Patio-CRM-main');

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.wwebjs_auth',
  '.wwebjs_cache',
  'playwright',
  '.system_generated'
];

function shouldIgnore(relPath) {
  const parts = relPath.split(path.sep);
  return parts.some(p => IGNORE_PATTERNS.includes(p));
}

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst, { recursive: true });
  }

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    const rel = path.relative(DIR_IDE, srcPath);

    if (shouldIgnore(rel)) continue;

    if (entry.isDirectory()) {
      count += copyRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      let needsCopy = true;
      if (fs.existsSync(dstPath)) {
        const srcStat = fs.statSync(srcPath);
        const dstStat = fs.statSync(dstPath);
        if (srcStat.mtimeMs <= dstStat.mtimeMs && srcStat.size === dstStat.size) {
          needsCopy = false;
        }
      }
      if (needsCopy) {
        fs.copyFileSync(srcPath, dstPath);
        count++;
      }
    }
  }
  return count;
}

function sync() {
  console.log(`[Sync] Sincronizando de IDE -> RUN...`);
  const copiedToRun = copyRecursive(DIR_IDE, DIR_RUN);
  console.log(`[Sync] ${copiedToRun} arquivos sincronizados para RUN.`);
}

if (require.main === module) {
  sync();
}

module.exports = { sync };
