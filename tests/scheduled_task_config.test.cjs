'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { spawnSync } = require('child_process');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const xmlPath = path.join(rootDir, 'docs', 'operacao', 'PatioCRM_Backup_WAL.xml');
const docPath = path.join(rootDir, 'docs', 'operacao', 'SUPERVISAO_WINDOWS.md');
const generatorScript = require('../scripts/gerar_tarefa_agendada_windows.cjs');

function parseXmlWithWindowsReader(filePath) {
  const psScript = `
    $ErrorActionPreference = 'Stop'
    try {
      $path = [System.IO.Path]::GetFullPath('${filePath.replace(/'/g, "''")}')
      $settings = New-Object System.Xml.XmlReaderSettings
      $reader = [System.Xml.XmlReader]::Create($path, $settings)
      while ($reader.Read()) { }
      $reader.Close()

      $doc = New-Object System.Xml.XmlDocument
      $doc.Load($path)
      $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
      $ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')

      $multipleInstances = $doc.SelectSingleNode('//t:MultipleInstancesPolicy', $ns).InnerText
      $interval = $doc.SelectSingleNode('//t:Interval', $ns).InnerText
      $command = $doc.SelectSingleNode('//t:Command', $ns).InnerText
      $arguments = $doc.SelectSingleNode('//t:Arguments', $ns).InnerText
      $workingDir = $doc.SelectSingleNode('//t:WorkingDirectory', $ns).InnerText

      Write-Output "PARSER_OK|$multipleInstances|$interval|$command|$arguments|$workingDir"
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8'
  });

  if (res.status !== 0) {
    throw new Error(`Falha no parser XML real do Windows (.NET XmlReader): ${res.stderr || res.stdout}`);
  }

  const lines = res.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const okLine = lines.find(l => l.startsWith('PARSER_OK|'));
  if (!okLine) {
    throw new Error(`Linha de confirmação PARSER_OK não encontrada na saída:\n${res.stdout}`);
  }

  const parts = okLine.split('|');
  return {
    multipleInstances: parts[1],
    interval: parts[2],
    command: parts[3],
    arguments: parts[4],
    workingDir: parts[5]
  };
}

test('P2: Configuração e Validação do Agendador de Tarefas do Windows (Task Scheduler)', async (t) => {
  await t.test('1. Definição XML contém declaração UTF-8, MultipleInstancesPolicy=IgnoreNew e intervalo horário', () => {
    assert.ok(fs.existsSync(xmlPath), 'O arquivo PatioCRM_Backup_WAL.xml deve existir em docs/operacao/');
    const content = fs.readFileSync(xmlPath, 'utf8');

    assert.match(content, /<\?xml version="1\.0" encoding="UTF-8"\?>/i,
      'O cabeçalho XML deve declarar explicitamente encoding="UTF-8"');
    assert.match(content, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/,
      'O XML deve configurar explicitamente MultipleInstancesPolicy como IgnoreNew');
    assert.match(content, /<Interval>PT1H<\/Interval>/,
      'O XML deve configurar o intervalo horário de 1 hora (PT1H)');
    assert.match(content, /executar_backup_operacional\.cjs/,
      'O XML deve apontar para o script executar_backup_operacional.cjs');
    assert.match(content, /<Task version="1\.2"/,
      'O XML deve ser compatível com o schema do Windows Task Scheduler 1.2+');
  });

  await t.test('2. Script gerador produz XML consistente com parâmetros personalizados', () => {
    const customXml = generatorScript.buildTaskXml({
      nodePath: 'C:\\CustomNode\\node.exe',
      scriptPath: 'D:\\CRM\\scripts\\backup.cjs',
      workingDir: 'D:\\CRM',
      interval: 'PT2H',
      user: 'OFICINA\\Admin'
    });

    assert.match(customXml, /<\?xml version="1\.0" encoding="UTF-8"\?>/i);
    assert.match(customXml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
    assert.match(customXml, /<Interval>PT2H<\/Interval>/);
    assert.match(customXml, /<Command>C:\\CustomNode\\node\.exe<\/Command>/);
    assert.match(customXml, /<UserId>OFICINA\\Admin<\/UserId>/);
  });

  await t.test('3. Documentação SUPERVISAO_WINDOWS.md não atribui anti-sobreposição a /np e documenta IgnoreNew', () => {
    assert.ok(fs.existsSync(docPath), 'O arquivo SUPERVISAO_WINDOWS.md deve existir');
    const doc = fs.readFileSync(docPath, 'utf8');

    // Verifica que NÃO afirma que /np impede sobreposição
    assert.doesNotMatch(
      doc,
      /\/np[^.\n]*(?:impede|evita|preven[ir]|bloqueia)[^.\n]*sobreposi/i,
      'A documentação não pode afirmar falsamente que /np impede sobreposição de tarefas'
    );

    // Verifica que documenta o significado real de /np
    assert.match(doc, /\/np.*Do not store password/i,
      'A documentação deve esclarecer o verdadeiro significado de /np');

    // Verifica que MultipleInstancesPolicy=IgnoreNew é ensinada
    assert.match(doc, /MultipleInstancesPolicy.*IgnoreNew/i,
      'A documentação deve orientar o uso de MultipleInstancesPolicy=IgnoreNew');

    // Verifica comandos PowerShell e importação XML
    assert.match(doc, /-MultipleInstances\s+IgnoreNew/i,
      'A documentação deve conter o comando PowerShell com -MultipleInstances IgnoreNew');
    assert.match(doc, /schtasks\s+\/create.*\/xml/i,
      'A documentação deve conter o comando schtasks /xml para importação da definição');
  });

  await t.test('4. Validação com parser XML real do Windows (.NET XmlReader) no arquivo oficial', () => {
    const parsed = parseXmlWithWindowsReader(xmlPath);
    assert.equal(parsed.multipleInstances, 'IgnoreNew', 'MultipleInstancesPolicy deve ser IgnoreNew no parser real');
    assert.equal(parsed.interval, 'PT1H', 'Interval deve ser PT1H no parser real');
    assert.ok(parsed.command.toLowerCase().includes('node'), 'Command deve referenciar o executável node');
    assert.ok(parsed.arguments.includes('executar_backup_operacional.cjs'), 'Arguments deve referenciar o script de backup');
  });

  await t.test('5. Parser XML real valida caminhos complexos contendo "&" e preserva integridade sem corromper entidades', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-xml-test-'));
    const tempXmlPath = path.join(tempDir, 'PatioCRM_Test_Amp.xml');

    try {
      const complexNode = 'C:\\Oficina & Filhos\\node.exe';
      const complexScript = 'D:\\Patio & CRM\\scripts\\executar_backup_operacional.cjs';
      const complexWorkingDir = 'D:\\Patio & CRM';

      const xmlContent = generatorScript.buildTaskXml({
        nodePath: complexNode,
        scriptPath: complexScript,
        workingDir: complexWorkingDir,
        interval: 'PT1H',
        user: 'OFICINA & COMPANHIA\\Servico'
      });

      fs.writeFileSync(tempXmlPath, xmlContent, 'utf8');

      // Executa parser XML real do Windows nos bytes gravados
      const parsed = parseXmlWithWindowsReader(tempXmlPath);

      assert.equal(parsed.multipleInstances, 'IgnoreNew');
      assert.equal(parsed.interval, 'PT1H');
      assert.equal(parsed.command, complexNode, 'O parser deve decodificar exatamente o caminho contendo "&" no Command');
      assert.equal(parsed.arguments, `"${complexScript}"`, 'O parser deve decodificar exatamente o caminho com aspas e "&" nos Arguments');
      assert.equal(parsed.workingDir, complexWorkingDir, 'O parser deve decodificar exatamente o diretório de trabalho com "&"');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  await t.test('6. Função escapeXml escapa adequadamente todos os caracteres reservados XML', () => {
    const { escapeXml } = generatorScript;
    assert.equal(escapeXml('A & B < C > D "E" \'F\''), 'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;');
    assert.equal(escapeXml(null), '');
    assert.equal(escapeXml(undefined), '');
  });
});
