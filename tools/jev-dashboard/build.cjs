'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const data = require('./analysis.cjs');
const root = path.resolve(__dirname, '../..');

for (const c of data.cases) {
  for (const file of [...c.files, ...c.tests]) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Referência ausente: ${file}`);
  }
  c.evidence = c.evidence.map(e => {
    const content = fs.readFileSync(path.join(root, e.file), 'utf8');
    const lines = content.split(/\r?\n/);
    const index = lines.findIndex(line => line.includes(e.needle));
    if (index < 0) throw new Error(`Trecho não encontrado: ${e.file} / ${e.needle}`);
    const start = Math.max(0, index - 2);
    return { ...e, line: index + 1, sha256: crypto.createHash('sha256').update(content).digest('hex'),
      excerpt: lines.slice(start, index + 8).map((line, i) => `${start + i + 1}  ${line}`).join('\n') };
  });
}
data.generatedAt = new Date().toISOString();
fs.writeFileSync(path.join(__dirname, 'analysis.json'), JSON.stringify(data, null, 2) + '\n');

const parts = [
  '# Jev no Pátio CRM — análise de oportunidade',
  `Data da análise: ${data.date}. Fontes locais capturadas em ${data.generatedAt}.`,
  data.verdict,
  '## Escopo e limites', data.scope, data.pilot,
  '## Critério de decisão', data.methodology,
  '## Prioridades', ...data.next.map(n => `### ${n.title}\n\n${n.text}`),
  '## Comparação',
  ['| Caso | Utilidade /10 | Impacto /10 | Complexidade /10 | Decisão | Horas estimadas |',
  '|---|---:|---:|---:|---|---|',
  ...data.cases.map(c => `| ${c.number} · ${c.title} | ${c.score} | ${c.impact} | ${c.complexity} | ${c.status} — ${c.stage} | ${c.hours.join('–')} |`)].join('\n'),
  '\nNos casos NÃO USAR, as horas representam custo evitável de uma tentativa de integração, não trabalho recomendado. Nenhuma economia ou acurácia Jev foi medida.',
  '## Economia',
  'Custo Jev estimado = chamadas × tokens médios de entrada (estado + perguntas) / 1.000.000 × US$ 0,042. Por exemplo, 1.000 chamadas de 2.000 tokens custariam US$ 0,084 somente de inferência. OCR, transcrição, fallback, impostos, câmbio, revisão humana, desenvolvimento e manutenção são separados. Use a calculadora do dashboard para incluir os custos totais. Preço publicado em [Models](https://docs.typesafe.ai/models).',
  '## Arquitetura',
  'SPA modular → Express / autenticação / RBAC → serviços de domínio → repositório por tenant → SQLite WAL. Integrações laterais: Gemini, Tesseract, WhatsApp, ERP, billing e fiscal. Suporte tem tabelas/conexão próprias no mesmo arquivo de banco configurado. Flags e documentação do piloto restringem integrações; presença no código não comprova operação real.',
  'Jev proposto: adapter server-side opcional somente entre texto minimizado e escolha de handler/categoria. Suporte é o primeiro experimento. Regras/saída aprovada/revisão humana permanecem soberanas. Não chamar fornecedor com transação aberta. Sem novo banco, microserviço ou vetor de busca.',
  '## Referências externas', ...data.sources.map(s => `- [${s.title}](${s.url}): ${s.note}`),
];
for (const c of data.cases) {
  parts.push(`## ${c.number} · ${c.title}`, `**${c.status} · utilidade ${c.score}/10 · impacto ${c.impact}/10 · complexidade ${c.complexity}/10.**`,
    `**Atual:** ${c.current}`, `**Fluxo:** ${c.flow}`, `**Decisão:** ${c.decision}`, `**Benefício esperado:** ${c.benefit}`,
    `**Prós:** ${c.pros.join(' ')}`, `**Contras:** ${c.cons.join(' ')}`, `**Riscos:** ${c.risks}`,
    `**Esforço estimado:** ${c.hours.join('–')} horas (R$ ${c.hours[0] * 100}–${c.hours[1] * 100} a R$ 100/h hipotéticos). ${c.status === 'NÃO USAR' ? 'Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.' : 'Inclui integração e avaliação; não inclui tempo de espera do fornecedor ou governança.'}`,
    `**Quando reavaliar:** ${c.trigger}`, '**Evidências locais:**',
    ...c.evidence.map(e => `- ${e.file}:${e.line} — \`${e.needle}\` (SHA-256 ${e.sha256})`),
    '**Prompt individual:**', '```text\n' + c.prompt + '\n```');
}
fs.writeFileSync(path.join(__dirname, 'report.md'), parts.join('\n\n') + '\n');
console.log(`Gerados analysis.json e report.md: ${data.cases.length} casos; todas as referências conferidas.`);
