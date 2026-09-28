# Verificação da entrega

Dashboard e estudo conferidos em 28/09/2026.

- `node tools/jev-dashboard/build.cjs`: 13 casos gerados; todos os arquivos, testes e âncoras de código referenciados foram localizados. Trechos têm linha e hash do arquivo de origem.
- `node --test tools/jev-dashboard/dashboard.test.cjs`: 5 testes aprovados, zero falhas. Cobrem cálculo de ROI, custos adicionais, entradas inválidas, referências/prompts e o servidor isolado.
- `node --check` em `app.js` e `scripts/preview-jev.cjs`: sem erro de sintaxe.
- Navegador: filtros Agora (1), Depois (4), Não usar (8), busca com acentos e estado sem resultado conferidos; abertura de detalhes por card e matriz conferida.
- Botão Copiar Prompt do suporte: conteúdo conferido por colagem no navegador, com contexto, observabilidade e fallback. A leitura pela API de clipboard do navegador integrado retornou vazia; a colagem real confirmou o texto. O fallback de seleção manual está disponível, mas negação de permissão do clipboard não foi simulada.
- Calculadora: cenário inicial negativo, cenário com economia positiva e rejeição de hora igual a zero conferidos na interface.
- Layout inspecionado no tamanho padrão do navegador e em 390 e 320 pixels. Em telas pequenas, a matriz usa lista compacta com impacto e complexidade para evitar sobreposição.
- Servidor iniciado em `http://127.0.0.1:3894`, sem importar runtime, banco ou configuração privada do CRM. Somente assets declarados são servidos.

Não foi feita chamada real à TypeSafe, nem medição de qualidade, latência ou custo do Jev. A suíte funcional completa do CRM não foi executada nesta entrega, pois o runtime do produto não foi alterado. Os testes listados em cada prompt são recomendações para a futura implementação, não resultados desta sessão.

Scores, esforço, volumes de revisão e critérios de promoção são julgamentos/hipóteses explicitamente identificados na análise. O estado de implantação é documental, não uma verificação das instalações em produção.
