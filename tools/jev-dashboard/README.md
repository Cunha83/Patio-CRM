# Jev × Pátio CRM

Dashboard local de análise, separado do runtime do CRM. Sem dependências novas, credenciais, chamadas à IA ou acesso ao banco. Não altera integrações nem habilita recursos do piloto.

Na raiz do projeto:

```powershell
node tools/jev-dashboard/build.cjs
node scripts/preview-jev.cjs
```

Abra <http://127.0.0.1:3894>. Para outra porta: `node scripts/preview-jev.cjs 3895`. Ctrl+C encerra o servidor. O bind é exclusivamente `127.0.0.1`; não serve a raiz do repositório, apenas os seis assets declarados.

- `analysis.cjs`: análise editorial, scores, fontes e prompts individuais.
- `build.cjs`: confere referências e captura trechos/linhas/hash; gera JSON e relatório Markdown.
- `analysis.json`: dados consumidos pelo dashboard, sem informações de clientes.
- `report.md`: relatório completo, inclusive todos os prompts.
- `index.html`, `style.css`, `app.js`: interface sem CDN, com filtros, detalhes, matriz e calculadora de ROI.

Se editar a análise ou os arquivos citados, rode o build de novo. Os trechos são snapshots: não fazem leitura do repositório no navegador. Fontes externas refletem consulta em 28/09/2026. Esforços, scores, limiares e volumes são estimativas/propostas; não representam benchmark executado do Jev.

Os prompts dos casos **NÃO USAR** orientam a alternativa determinística. **AGORA** indica apenas um experimento isolado de suporte; ativação de produção depende de acesso ao fornecedor, consentimento adequado, corpus revisado e ganho medido.

Verificação isolada do dashboard:

```powershell
node --test tools/jev-dashboard/dashboard.test.cjs
```
