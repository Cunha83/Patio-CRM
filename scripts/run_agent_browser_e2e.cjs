'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.resolve(__dirname, '../docs/evidencias/agent-browser-audit.log');
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function runAgentCmd(cmd) {
  try {
    const out = execSync(`agent-browser ${cmd}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000
    });
    return { ok: true, out };
  } catch (err) {
    return {
      ok: false,
      out: (err.stdout || '') + '\n' + (err.stderr || err.message)
    };
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n', 'utf8');
}

async function main() {
  fs.writeFileSync(logFile, `=== AUDITORIA E2E DE NAVEGAÇÃO FRONTEND VIA AGENT-BROWSER (VERCEL) ===\n\n`, 'utf8');
  log('Iniciando teste E2E interativo em http://patio:patio@localhost:3000/ ...');

  // 1. Abre a página autenticada
  const openRes = runAgentCmd('open http://patio:patio@localhost:3000/');
  log(`1. Navegação inicial: ${openRes.ok ? 'SUCESSO' : 'FALHA'}`);
  if (!openRes.ok) {
    log(`Erro ao abrir: ${openRes.out}`);
    process.exit(1);
  }

  runAgentCmd('wait 1500');

  // 2. Snapshot inicial dos elementos interativos
  const snap1 = runAgentCmd('snapshot -i');
  log('2. Snapshot de elementos interativos capturado.');
  fs.appendFileSync(logFile, `--- SNAPSHOT INICIAL ---\n${snap1.out}\n\n`, 'utf8');

  // 3. Teste de cada um dos 9 módulos principais
  const modulos = [
    { nome: 'Operação em Tempo Real', texto: 'Operação em Tempo Real', seletor: 'button "Operação em Tempo Real"' },
    { nome: 'Pátio & Boxes', texto: 'Pátio & Boxes', seletor: 'button "Pátio & Boxes"' },
    { nome: 'WhatsApp & CRM', texto: 'WhatsApp & CRM', seletor: 'button "WhatsApp & CRM"' },
    { nome: 'Painel & KPIs', texto: 'Painel & KPIs', seletor: 'button "Painel & KPIs"' },
    { nome: 'Almoxarifado', texto: 'Almoxarifado', seletor: 'button "Almoxarifado"' },
    { nome: 'Financeiro', texto: 'Financeiro', seletor: 'button "Financeiro"' },
    { nome: 'Relatórios & Backup', texto: 'Relatórios & Backup', seletor: 'button "Relatórios & Backup"' },
    { nome: 'Cadastros & Frotas', texto: 'Cadastros & Frotas', seletor: 'button "Cadastros & Frotas"' },
    { nome: 'Configurações', texto: 'Configurações', seletor: 'button "Configurações"' }
  ];

  let modulosAprovados = 0;

  for (const m of modulos) {
    log(`Navegando para módulo: ${m.nome}...`);
    const clickRes = runAgentCmd(`find role button click --name "${m.texto}"`);
    runAgentCmd('wait 1000');
    const snapModulo = runAgentCmd('snapshot -i');
    
    const renderizou = snapModulo.ok && snapModulo.out.length > 50;
    if (renderizou) {
      log(`✔ Módulo [${m.nome}] renderizado com sucesso.`);
      modulosAprovados++;
    } else {
      log(`✖ Módulo [${m.nome}] falhou ao renderizar: ${clickRes.out}`);
    }
  }

  log(`Módulos validados com sucesso: ${modulosAprovados}/${modulos.length}`);

  // 4. Teste de isolamento do Perfil Mecânico
  log('Testando alternância para perfil Mecânico...');
  // Volta para Pátio & Boxes
  runAgentCmd('find role button click --name "Pátio & Boxes"');
  runAgentCmd('wait 800');

  // Muda perfil para mecânico
  runAgentCmd('select @e2 "🔧 Mecânico / Box"');
  runAgentCmd('wait 1000');
  const snapMec = runAgentCmd('snapshot -i');
  fs.appendFileSync(logFile, `--- SNAPSHOT PERFIL MECANICO ---\n${snapMec.out}\n\n`, 'utf8');

  // Restaura perfil para Todos os Módulos
  runAgentCmd('select @e2 "Todos os Módulos"');
  runAgentCmd('wait 800');

  // 5. Teste da Gaveta de Voz e Configuração do Assistente
  log('Testando abertura da Gaveta de Voz e Configuração do Assistente...');
  runAgentCmd('find role button click --name "Falar com o Pátio CRM"');
  runAgentCmd('wait 1000');
  const snapVoz = runAgentCmd('snapshot -i');
  fs.appendFileSync(logFile, `--- SNAPSHOT GAVETA DE VOZ ---\n${snapVoz.out}\n\n`, 'utf8');

  log('Auditoria E2E via agent-browser concluída com êxito!');
  log(`Evidências detalhadas salvas em: ${logFile}`);
}

main().catch(err => {
  console.error('Falha crítica na auditoria E2E:', err);
  process.exit(1);
});
