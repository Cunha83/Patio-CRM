# Jev no Pátio CRM — análise de oportunidade

Data da análise: 28/09/2026. Fontes locais capturadas em 2026-09-28T14:29:03.476Z.

Avaliar o roteamento de suporte agora; manter as regras críticas em código. Nenhuma integração Jev está aprovada para produção com as evidências disponíveis.

## Escopo e limites

Inventário de arquivos, rotas e testes; leitura dirigida dos pontos de decisão e seus chamadores em frontend, API, autenticação, suporte, voz, triagem, documentos/WhatsApp, cobrança, persistência, fiscal/ERP, operação, automações e implantação. Não é auditoria linha a linha nem certificação de segurança. Não foram lidos .env, banco, uploads, sessões ou dados de clientes. Sem chamada real à TypeSafe ou benchmark do Jev. Testes históricos nos documentos não foram tratados como testes executados nesta análise.

O documento de distribuição de 23/09/2026 descreve três instalações independentes para testes fictícios, integrações desativadas e backup independente/restore pendentes. É evidência documental, não consulta ao estado atual das instalações.

## Critério de decisão

Scores são julgamento técnico de utilidade incremental, não acurácia, probabilidade nem ROI medido. 0 = sem encaixe; 1–3 = regras superiores ou pouco ganho; 4–6 = ganho condicionado; 7–8 = encaixe forte e limitado; 9–10 exigiriam evidência operacional, ausente aqui. Impacto e complexidade vão de 0 a 10. Esforços são estimativas para integração + avaliação de um desenvolvedor familiarizado; nos casos rejeitados mostram o custo evitável de tentar Jev. Custos usam R$ 100/h apenas como hipótese editável. Gatilhos de escala e critérios numéricos são propostas para decisão, não métricas observadas.

## Prioridades

### Medir antes de integrar

Instrumentar o suporte atual e montar corpus PT-BR. Contar somente dúvidas não resolvidas localmente; separar correção de artigo, latência e tempo humano. Não há volume real medido nesta análise.

### Comparar três alternativas

Busca local com sinônimos, classificação Gemini atual e Jev. Testar em ambiente isolado. O gasto de tokens sozinho não paga a engenharia; usar custo total e custo dos erros.

### Fechar prioridades do piloto

Verificar pendências de backup independente e restauração. O menu WhatsApp ainda descreve baixas e compras automáticas que o handler bloqueia: alinhar esse texto evita expectativas erradas sem Jev.

## Comparação

| Caso | Utilidade /10 | Impacto /10 | Complexidade /10 | Decisão | Horas estimadas |
|---|---:|---:|---:|---|---|
| 01 · Escolher o artigo certo no suporte | 8 | 8 | 3 | AGORA — Experimento isolado | 16–32 |
| 02 · Priorizar relatos de incidente | 6 | 6 | 4 | DEPOIS — Fila humana | 24–40 |
| 03 · Rotear comandos de texto | 6 | 7 | 7 | DEPOIS — Somente intenção | 40–72 |
| 04 · Classificar a queixa técnica | 5 | 6 | 5 | DEPOIS — Sugestão ao operador | 32–56 |
| 05 · Rotear documentos após OCR | 4 | 4 | 6 | DEPOIS — Canal hoje bloqueado | 40–64 |
| 06 · Autenticação e permissões | 0 | 0 | 8 | NÃO USAR — Manter determinístico | 40–80 |
| 07 · Antifraude e comprovantes | 2 | 2 | 9 | NÃO USAR — Sem evidência de ROI | 80–160 |
| 08 · Transações, caixa e estoque | 0 | 0 | 7 | NÃO USAR — Cálculo e invariantes | 48–96 |
| 09 · Gerar conversa, áudio ou laudo | 1 | 1 | 5 | NÃO USAR — Modelo inadequado | 24–48 |
| 10 · Moderação e prompt injection | 2 | 2 | 4 | NÃO USAR — Baixo ROI atual | 24–48 |
| 11 · Alertas, manutenção e pós-venda | 2 | 2 | 3 | NÃO USAR — Regras suficientes | 24–40 |
| 12 · Fiscal e integração ERP | 1 | 1 | 8 | NÃO USAR — Contratos exatos | 48–96 |
| 13 · Automações e continuidade | 1 | 1 | 6 | NÃO USAR — Confiabilidade primeiro | 24–48 |


Nos casos NÃO USAR, as horas representam custo evitável de uma tentativa de integração, não trabalho recomendado. Nenhuma economia ou acurácia Jev foi medida.

## Economia

Custo Jev estimado = chamadas × tokens médios de entrada (estado + perguntas) / 1.000.000 × US$ 0,042. Por exemplo, 1.000 chamadas de 2.000 tokens custariam US$ 0,084 somente de inferência. OCR, transcrição, fallback, impostos, câmbio, revisão humana, desenvolvimento e manutenção são separados. Use a calculadora do dashboard para incluir os custos totais. Preço publicado em [Models](https://docs.typesafe.ai/models).

## Arquitetura

SPA modular → Express / autenticação / RBAC → serviços de domínio → repositório por tenant → SQLite WAL. Integrações laterais: Gemini, Tesseract, WhatsApp, ERP, billing e fiscal. Suporte tem tabelas/conexão próprias no mesmo arquivo de banco configurado. Flags e documentação do piloto restringem integrações; presença no código não comprova operação real.

Jev proposto: adapter server-side opcional somente entre texto minimizado e escolha de handler/categoria. Suporte é o primeiro experimento. Regras/saída aprovada/revisão humana permanecem soberanas. Não chamar fornecedor com transação aberta. Sem novo banco, microserviço ou vetor de busca.

## Referências externas

- [Anúncio do Jev · 15/09/2026](https://typesafe.ai/blog/introducing-system-one-models-and-jev): Lançamento e benchmarks do próprio fornecedor; não são medições deste CRM.

- [Modelos, preço e modalidades](https://docs.typesafe.ai/models): Consulta em 28/09/2026: jev-1.13.0, texto, US$ 0,042 por milhão de tokens de entrada; saída sem cobrança. Preço sujeito a revisão.

- [Contrato HTTP da API](https://docs.typesafe.ai/api): POST /v1/systemone; state + questions; Choice, Score e Noul. Choice admite até 255 opções.

- [Probabilidade e confiança](https://docs.typesafe.ai/confidence): Confidence é derivada da distribuição; não equivale à taxa de acerto observada no português da oficina. Noul não tem confidence separado.

- [Limitações declaradas do Jev 1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13): Pode errar em números, datas, instruções adversariais e contexto irrelevante. Saída válida não garante decisão correta.

- [Políticas de dados do fornecedor](https://docs.typesafe.ai/legal): Validar contrato, retenção e destino dos dados antes de mudar o provedor de suporte. Não presumir que o consentimento atual ao Gemini abrange a TypeSafe.

## 01 · Escolher o artigo certo no suporte

**AGORA · utilidade 8/10 · impacto 8/10 · complexidade 3/10.**

**Atual:** SupportAgent.answer tenta regras e busca local; sem artigo inequívoco, com consentimento e modelo configurado, o Gemini retorna articleId. Artigos e mensagens locais de esclarecimento/encaminhamento são predefinidos; a saída livre do Gemini não é exibida.

**Fluxo:** Mensagem sanitizada → políticas obrigatórias → busca local → Jev Choice(articleId | desconhecido) → limiar validado → artigo existente ou pessoa.

**Decisão:** AGORA vale preparar corpus e comparador isolado. Não habilitar Jev no atendimento real sem evidência e acesso ao provedor. O piloto não comprova volume nem gasto de IA.

**Benefício esperado:** Hipótese: menos encaminhamentos por sinônimos e menor custo/latência no ramo que já chama IA. Não atribuir ao Jev atendimentos que a busca local já resolve.

**Prós:** Reaproveita base revisada e contrato de resposta. Troca pequena e reversível em uma fronteira de classificação existente.

**Contras:** Integração, avaliação e manutenção custam mais que tokens no piloto. Português, jargão e catálogo precisam de avaliação própria; o baseline já valida um enum.

**Riscos:** Artigo errado, confiança excessiva e envio de dados ao novo fornecedor. A sanitização atual reduz dados, mas não anonimiza todo texto livre.

**Esforço estimado:** 16–32 horas (R$ 1600–3200 a R$ 100/h hipotéticos). Inclui integração e avaliação; não inclui tempo de espera do fornecedor ou governança.

**Quando reavaliar:** Para promover: amostra inicial de 200 perguntas PT-BR revisadas, ganho mensurável sobre busca local/Gemini e payback ≤ 6 meses. 500 dúvidas ambíguas/mês é um ponto de revisão proposto, não demanda observada.

**Evidências locais:**

- services/support/agent.js:31 — `if (!article && aiConsent && this.aiAvailable)` (SHA-256 22d747b95bb410295d62d51bad3eae21e718827c95110c96dc090edc2aba0975)

- services/support/router.js:62 — `req.body.aiConsent` (SHA-256 2ecade228b6f695413888419a552683653ffc295c0a5a08d9c34b82e471c3641)

- services/support/knowledge.js:87 — `function search(query)` (SHA-256 90bacca9f24e85bc5c57d18b2406f1cf154f6ad74d64097caeca575696a37609)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 01: Escolher o artigo certo no suporte. Recomendação: AGORA — Experimento isolado.
Implemente um experimento opcional e reversível; não habilite em produção automaticamente.

CONTEXTO VERIFICADO
SupportAgent.answer tenta regras e busca local; sem artigo inequívoco, com consentimento e modelo configurado, o Gemini retorna articleId. Artigos e mensagens locais de esclarecimento/encaminhamento são predefinidos; a saída livre do Gemini não é exibida.
Fluxo alvo: Mensagem sanitizada → políticas obrigatórias → busca local → Jev Choice(articleId | desconhecido) → limiar validado → artigo existente ou pessoa.
Arquivos existentes: services/support/agent.js, services/support/index.js, services/support/router.js, services/support/privacy.js, services/support/knowledge.js, js/support-widget.js, docs/SUPORTE_IA.md.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Criar services/ai/jevClassifier.js com cliente injetável e scripts/evaluate-jev-support.cjs. Comparar offline busca local, classificador atual e Jev sobre o mesmo conjunto. Integrar opcionalmente no ramo externo de SupportAgent, com feature flag desligada. Preservar o formato text/references/handoff/priority/mode; ajustar opt-in para nomear o provedor escolhido e registrar a versão do consentimento. Não ativar o novo provedor com um consentimento legado que só nomeia Gemini.
Gatilho de negócio: Para promover: amostra inicial de 200 perguntas PT-BR revisadas, ganho mensurável sobre busca local/Gemini e payback ≤ 6 meses. 500 dúvidas ambíguas/mês é um ponto de revisão proposto, não demanda observada.
Contrato: conferir https://docs.typesafe.ai/api e /models antes de codificar; usar POST https://api.typesafe.ai/v1/systemone com state minimizado, model fixado (jev-1.13.0 era o documentado em 28/09/2026) e questions. Choice: criteria com opções existentes e desconhecido; resposta answers[id].choice/probabilities/confidence. Noul: answers[id].noul, sem confidence independente. Nunca confundir confiança com acurácia medida. IDs/classes devem ser allowlisted e números finitos validados mesmo com saída tipada.
Criar adapter server-side injetável em services/ai/jevClassifier.js, com flag por caso desativada, chave TYPESAFE_API_KEY apenas no ambiente, limite de payload/orçamento e timeout inicial configurável de 1.500 ms. Evitar retry síncrono em cascata; tratar 429/5xx com fallback e circuito por processo, documentando limite de instância única. Não usar alias móvel sem reavaliação. Não colocar chave no frontend. Não transmitir state completo, código, histórico amplo, senhas ou tokens. Confirmar consentimento para TypeSafe e política de dados antes de qualquer tráfego real; testes usam mocks e corpus sintético/revisado. Não abrir transação SQLite durante espera externa. Não adicionar outra base, fila ou microserviço sem necessidade.

CRITÉRIOS DE ACEITE
Separar desenvolvimento e holdout por pergunta/paráfrase; incluir fora de escopo, incidentes, pedido humano e prompt injection. No holdout, precisão ≥ 95% entre respostas aceitas, cobertura não inferior ao baseline e zero falhas nas regras obrigatórias. Relatar tamanho por classe e intervalo de incerteza; 200 exemplos não certificam segurança. Só promover se custo total ou p95 melhorar sem regressão. Sem consentimento: zero chamadas externas.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/support_agent.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
mode, versão do catálogo/modelo, latência p50/p95, tokens, custo, taxa de abstenção, artigos corrigidos, handoff e motivo; identificadores pseudônimos e sem texto bruto.
Separar previsão, abstenção e resultado revisado; registrar versão de regras/modelo e request ID, nunca conteúdo bruto. Exportar comparação de baseline e candidato, incluindo falhas, revisão humana e custo total. Limiares calibrados em desenvolvimento e verificados em holdout PT-BR; não escolher limiar arbitrário como garantia.

FALLBACK E REVERSÃO
Erro, timeout, 429, opção inválida, baixa confiança ou circuito aberto → orientação local, esclarecimento ou humano. Não chamar Gemini automaticamente se o consentimento não o permitir. Flag off restaura o comportamento atual.
Provar flag off, timeout, indisponibilidade, resposta inválida e reinício em testes. Sem credencial/acesso, entregar adapter mockado, corpus e relatório pendente; não simular ganhos medidos. Produção só após resultado econômico e validação pelo responsável.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 02 · Priorizar relatos de incidente

**DEPOIS · utilidade 6/10 · impacto 6/10 · complexidade 4/10.**

**Atual:** O agente reconhece vazamento, invasão, fraude e pedido de pessoa por expressões regulares; encaminha com prioridade. Existe inbox humana e fluxo de resposta a incidentes.

**Fluxo:** Relato já autorizado → regras de emergência → Jev Noul(relata possível incidente?) → apenas elevar prioridade da fila humana.

**Decisão:** DEPOIS, como extensão da mesma fronteira do suporte. Não criar um segundo chatbot nem um serviço de bloqueio automático.

**Benefício esperado:** Hipótese: captar relatos indiretos, como “apareceu a oficina de outra empresa”, e reduzir tempo de triagem.

**Prós:** Decisão estreita sobre texto existente. Pode ser agrupada com a classificação do suporte, quando ambas forem elegíveis.

**Contras:** Incidentes raros produzem muitos falsos alarmes. Depende de equipe responsável; priorização sem resposta humana não resolve o incidente.

**Riscos:** Falso negativo não pode neutralizar regra existente. Noul é um sinal do relato, não prova de invasão. Não enviar credenciais para análise.

**Esforço estimado:** 24–40 horas (R$ 2400–4000 a R$ 100/h hipotéticos). Inclui integração e avaliação; não inclui tempo de espera do fornecedor ou governança.

**Quando reavaliar:** Reavaliar após 2 relatos críticos perdidos pela regra em 30 dias ou > 100 tickets/dia com atraso de triagem; ambos são gatilhos propostos.

**Evidências locais:**

- services/support/agent.js:16 — `const urgent =` (SHA-256 22d747b95bb410295d62d51bad3eae21e718827c95110c96dc090edc2aba0975)

- services/support/agent.js:20 — `priority: urgent ? 'urgent'` (SHA-256 22d747b95bb410295d62d51bad3eae21e718827c95110c96dc090edc2aba0975)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 02: Priorizar relatos de incidente. Recomendação: DEPOIS — Fila humana.
Implemente um experimento opcional e reversível; não habilite em produção automaticamente.

CONTEXTO VERIFICADO
O agente reconhece vazamento, invasão, fraude e pedido de pessoa por expressões regulares; encaminha com prioridade. Existe inbox humana e fluxo de resposta a incidentes.
Fluxo alvo: Relato já autorizado → regras de emergência → Jev Noul(relata possível incidente?) → apenas elevar prioridade da fila humana.
Arquivos existentes: services/support/agent.js, services/support/repository.js, services/support/router.js, public/support/inbox.js, services/incidentResponseService.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Acrescentar classificador complementar de possível incidente ao suporte, condicionado a opt-in para o provedor. Acrescentar prioridade sugerida e razão enumerada na fila. Regras críticas sempre prevalecem; jamais bloquear conta, resetar senha ou encerrar ocorrência por resultado de IA.
Gatilho de negócio: Reavaliar após 2 relatos críticos perdidos pela regra em 30 dias ou > 100 tickets/dia com atraso de triagem; ambos são gatilhos propostos.
Contrato: conferir https://docs.typesafe.ai/api e /models antes de codificar; usar POST https://api.typesafe.ai/v1/systemone com state minimizado, model fixado (jev-1.13.0 era o documentado em 28/09/2026) e questions. Choice: criteria com opções existentes e desconhecido; resposta answers[id].choice/probabilities/confidence. Noul: answers[id].noul, sem confidence independente. Nunca confundir confiança com acurácia medida. IDs/classes devem ser allowlisted e números finitos validados mesmo com saída tipada.
Criar adapter server-side injetável em services/ai/jevClassifier.js, com flag por caso desativada, chave TYPESAFE_API_KEY apenas no ambiente, limite de payload/orçamento e timeout inicial configurável de 1.500 ms. Evitar retry síncrono em cascata; tratar 429/5xx com fallback e circuito por processo, documentando limite de instância única. Não usar alias móvel sem reavaliação. Não colocar chave no frontend. Não transmitir state completo, código, histórico amplo, senhas ou tokens. Confirmar consentimento para TypeSafe e política de dados antes de qualquer tráfego real; testes usam mocks e corpus sintético/revisado. Não abrir transação SQLite durante espera externa. Não adicionar outra base, fila ou microserviço sem necessidade.

CRITÉRIOS DE ACEITE
Conjunto PT-BR revisado com relatos indiretos, negações e injeção; zero rebaixamento de incidentes detectados pelas regras. Medir recall e falsos positivos em holdout e exigir aprovação do responsável do suporte sobre a carga adicional. Sem regra positiva e sem IA válida, preservar fila normal com pedido humano disponível.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/support_agent.test.cjs, tests/workshop_day.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Incidentes confirmados/rejeitados pelo atendente, tempo até assunção, recall auditado, falsos positivos por 100 tickets e custo incremental; não logar relato bruto.
Separar previsão, abstenção e resultado revisado; registrar versão de regras/modelo e request ID, nunca conteúdo bruto. Exportar comparação de baseline e candidato, incluindo falhas, revisão humana e custo total. Limiares calibrados em desenvolvimento e verificados em holdout PT-BR; não escolher limiar arbitrário como garantia.

FALLBACK E REVERSÃO
Preservar regex, botão de atendimento humano e protocolo atual. Nunca descartar relato quando o classificador falhar.
Provar flag off, timeout, indisponibilidade, resposta inválida e reinício em testes. Sem credencial/acesso, entregar adapter mockado, corpus e relatório pendente; não simular ganhos medidos. Produção só após resultado econômico e validação pelo responsável.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 03 · Rotear comandos de texto

**DEPOIS · utilidade 6/10 · impacto 7/10 · complexidade 7/10.**

**Atual:** interpretarComando envia texto ou áudio ao Gemini para interpretar intenção e campos; interpretarPorRegras é o fallback. executarAcao aplica controles e confirmações.

**Fluxo:** Texto disponível → comandos exatos locais → Jev Choice(intenção | ambígua) → handler existente; campos extraídos e validados separadamente.

**Decisão:** DEPOIS. A troca integral do Gemini não cabe: Jev não transcreve áudio nem gera os campos livres ou a resposta falada.

**Benefício esperado:** Hipótese: dispensar uma chamada generativa em consultas textuais cuja entidade já esteja resolvida no contexto autorizado.

**Prós:** Intenções enumeradas já existem. Pode reduzir chamadas em uma fração simples dos comandos.

**Contras:** Adicionar Jev antes de toda chamada Gemini aumenta custo e latência. Separar interpretação de extração exige refatoração e testes de execução.

**Riscos:** Confundir consulta com mutação; executar no tenant errado; contornar confirmação. Confiança alta nunca autoriza uma ação.

**Esforço estimado:** 40–72 horas (R$ 4000–7200 a R$ 100/h hipotéticos). Inclui integração e avaliação; não inclui tempo de espera do fornecedor ou governança.

**Quando reavaliar:** Canal ativo, ≥ 5.000 comandos textuais/mês e ≥ 30% resolvíveis sem extração livre; ou latência de consultas comprovadamente prejudicial. Medir economia da cascata completa.

**Evidências locais:**

- services/voiceActionEngine.js:854 — `async function interpretarComando` (SHA-256 22cfc13a820c62bc0f58272f98004b3608bb5532e2bad256ab6afeff9c139226)

- services/voiceActionEngine.js:920 — `async function executarAcao` (SHA-256 22cfc13a820c62bc0f58272f98004b3608bb5532e2bad256ab6afeff9c139226)

- server.js:2294 — `app.post('/api/comando-voz'` (SHA-256 7cbbaaa768eb33d3d25d252a07e6efd5c6e582ada564266dc6b08968d2433801)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 03: Rotear comandos de texto. Recomendação: DEPOIS — Somente intenção.
Implemente um experimento opcional e reversível; não habilite em produção automaticamente.

CONTEXTO VERIFICADO
interpretarComando envia texto ou áudio ao Gemini para interpretar intenção e campos; interpretarPorRegras é o fallback. executarAcao aplica controles e confirmações.
Fluxo alvo: Texto disponível → comandos exatos locais → Jev Choice(intenção | ambígua) → handler existente; campos extraídos e validados separadamente.
Arquivos existentes: services/voiceActionEngine.js, services/technicalIntakeEngine.js, lib/tokens/securityToken.js, server.js, js/voz.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Criar roteamento opcional só para input.text, com consultas permitidas explicitamente e contexto obtido no servidor. Manter áudio na pipeline existente. Iniciar em shadow mode que registra previsão sem executar; depois liberar apenas consultas com entidades determinadas. Mutação continua na execução atual, com RBAC, tokens e controle de versão.
Gatilho de negócio: Canal ativo, ≥ 5.000 comandos textuais/mês e ≥ 30% resolvíveis sem extração livre; ou latência de consultas comprovadamente prejudicial. Medir economia da cascata completa.
Contrato: conferir https://docs.typesafe.ai/api e /models antes de codificar; usar POST https://api.typesafe.ai/v1/systemone com state minimizado, model fixado (jev-1.13.0 era o documentado em 28/09/2026) e questions. Choice: criteria com opções existentes e desconhecido; resposta answers[id].choice/probabilities/confidence. Noul: answers[id].noul, sem confidence independente. Nunca confundir confiança com acurácia medida. IDs/classes devem ser allowlisted e números finitos validados mesmo com saída tipada.
Criar adapter server-side injetável em services/ai/jevClassifier.js, com flag por caso desativada, chave TYPESAFE_API_KEY apenas no ambiente, limite de payload/orçamento e timeout inicial configurável de 1.500 ms. Evitar retry síncrono em cascata; tratar 429/5xx com fallback e circuito por processo, documentando limite de instância única. Não usar alias móvel sem reavaliação. Não colocar chave no frontend. Não transmitir state completo, código, histórico amplo, senhas ou tokens. Confirmar consentimento para TypeSafe e política de dados antes de qualquer tráfego real; testes usam mocks e corpus sintético/revisado. Não abrir transação SQLite durante espera externa. Não adicionar outra base, fila ou microserviço sem necessidade.

CRITÉRIOS DE ACEITE
Testar negação, duas intenções, “não excluir”, confirmação por outro usuário, token expirado e outro tenant. Nenhuma mutação pelo novo atalho; ambiguidade retorna ao fluxo existente. Comparar p95 e custo total incluindo fallback, não apenas a chamada Jev.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/voice.test.cjs, tests/voice_security_negative.test.cjs, tests/http_voice_confirmation_recovery.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Intenção prevista/corrigida, taxa de atalhos seguros, discordância, custo por comando completo, p95 fim a fim, abstenção e violações bloqueadas.
Separar previsão, abstenção e resultado revisado; registrar versão de regras/modelo e request ID, nunca conteúdo bruto. Exportar comparação de baseline e candidato, incluindo falhas, revisão humana e custo total. Limiares calibrados em desenvolvimento e verificados em holdout PT-BR; não escolher limiar arbitrário como garantia.

FALLBACK E REVERSÃO
interpretarComando atual com Gemini quando permitido, interpretarPorRegras ou entrada manual. Preservar confirmação explícita; nunca transformar baixa confiança em execução.
Provar flag off, timeout, indisponibilidade, resposta inválida e reinício em testes. Sem credencial/acesso, entregar adapter mockado, corpus e relatório pendente; não simular ganhos medidos. Produção só após resultado econômico e validação pelo responsável.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 04 · Classificar a queixa técnica

**DEPOIS · utilidade 5/10 · impacto 6/10 · complexidade 5/10.**

**Atual:** identificarDominioTecnico e classificarTexto percorrem termos conhecidos. A categoria orienta perguntas e detecção de recorrência na Pré-OS.

**Fluxo:** Queixa em texto → regra local → Jev Choice(categorias atuais | geral | múltiplas) nos casos ambíguos → operador confirma → triagem existente.

**Decisão:** DEPOIS de medir erros; primeiro ampliar sinônimos revisados. Não alterar automaticamente garantia, serviço, preço ou liberação do veículo.

**Benefício esperado:** Hipótese: menos queixas genéricas e perguntas mais relevantes para descrições coloquiais do motorista.

**Prós:** Taxonomias pequenas e explícitas. Possibilidade de abstenção e confirmação humana.

**Contras:** As duas taxonomias existentes não são idênticas; exigem mapeamento. Sinônimos locais podem resolver por custo menor.

**Riscos:** Classificação incorreta pode mascarar sintoma ou influenciar a recorrência. Não usar como diagnóstico mecânico nem como decisão de garantia.

**Esforço estimado:** 32–56 horas (R$ 3200–5600 a R$ 100/h hipotéticos). Inclui integração e avaliação; não inclui tempo de espera do fornecedor ou governança.

**Quando reavaliar:** ≥ 1.000 triagens/mês e > 15% em GERAL/OUTROS ou corrigidas, após manutenção do dicionário. Começar com 300 queixas rotuladas por especialista.

**Evidências locais:**

- services/intakeQuestionEngine.js:177 — `function identificarDominioTecnico` (SHA-256 3aa29130f842828ee504d4a98fa3c8fd3f8bead0a1c28425a4f117198afd09d5)

- services/recurrenceDetector.js:73 — `function classificarTexto` (SHA-256 95a254366e48a8c836c0073617d11d5391bd9f86fe55d5e1eabb1c89e693df79)

- services/preOSEngine.js:74 — `const recorrencia = detectarRecorrencia` (SHA-256 822136da5e66bae52633f30c3954ac69130c8fe61a8da12f0b02137c5a5c8bca)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 04: Classificar a queixa técnica. Recomendação: DEPOIS — Sugestão ao operador.
Implemente um experimento opcional e reversível; não habilite em produção automaticamente.

CONTEXTO VERIFICADO
identificarDominioTecnico e classificarTexto percorrem termos conhecidos. A categoria orienta perguntas e detecção de recorrência na Pré-OS.
Fluxo alvo: Queixa em texto → regra local → Jev Choice(categorias atuais | geral | múltiplas) nos casos ambíguos → operador confirma → triagem existente.
Arquivos existentes: services/intakeQuestionEngine.js, services/recurrenceDetector.js, services/preOSEngine.js, services/technicalIntakeEngine.js, services/warrantyService.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Introduzir sugestão opcional de categoria antes da abertura da Pré-OS; preservar função síncrona de regras e separar avaliação externa da transação. Definir mapeamento explícito entre DOMINIOS_TRIAGEM e CATALOGO_CATEGORIAS. Guardar categoria original, sugerida e confirmada sem substituir o texto da queixa.
Gatilho de negócio: ≥ 1.000 triagens/mês e > 15% em GERAL/OUTROS ou corrigidas, após manutenção do dicionário. Começar com 300 queixas rotuladas por especialista.
Contrato: conferir https://docs.typesafe.ai/api e /models antes de codificar; usar POST https://api.typesafe.ai/v1/systemone com state minimizado, model fixado (jev-1.13.0 era o documentado em 28/09/2026) e questions. Choice: criteria com opções existentes e desconhecido; resposta answers[id].choice/probabilities/confidence. Noul: answers[id].noul, sem confidence independente. Nunca confundir confiança com acurácia medida. IDs/classes devem ser allowlisted e números finitos validados mesmo com saída tipada.
Criar adapter server-side injetável em services/ai/jevClassifier.js, com flag por caso desativada, chave TYPESAFE_API_KEY apenas no ambiente, limite de payload/orçamento e timeout inicial configurável de 1.500 ms. Evitar retry síncrono em cascata; tratar 429/5xx com fallback e circuito por processo, documentando limite de instância única. Não usar alias móvel sem reavaliação. Não colocar chave no frontend. Não transmitir state completo, código, histórico amplo, senhas ou tokens. Confirmar consentimento para TypeSafe e política de dados antes de qualquer tráfego real; testes usam mocks e corpus sintético/revisado. Não abrir transação SQLite durante espera externa. Não adicionar outra base, fila ou microserviço sem necessidade.

CRITÉRIOS DE ACEITE
Corpus revisado por mecânico, incluindo múltiplos sintomas, negação e termos regionais; ganho em macro-F1 sobre dicionário ampliado no holdout. Garantia, datas, km e decisão de reparo permanecem determinísticos/humanos. Nenhuma chamada externa com transação SQLite aberta.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/technical_intake.test.cjs, tests/pre_os.test.cjs, tests/progressive_os.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Correções por categoria, GERAL/OUTROS, macro-F1, abstenção, tempo de triagem e falsos vínculos de recorrência revisados.
Separar previsão, abstenção e resultado revisado; registrar versão de regras/modelo e request ID, nunca conteúdo bruto. Exportar comparação de baseline e candidato, incluindo falhas, revisão humana e custo total. Limiares calibrados em desenvolvimento e verificados em holdout PT-BR; não escolher limiar arbitrário como garantia.

FALLBACK E REVERSÃO
Catálogo de termos e pergunta geral atuais; escolha manual do domínio. Se não houver ganho sobre sinônimos, remover experimento.
Provar flag off, timeout, indisponibilidade, resposta inválida e reinício em testes. Sem credencial/acesso, entregar adapter mockado, corpus e relatório pendente; não simular ganhos medidos. Produção só após resultado econômico e validação pelo responsável.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 05 · Rotear documentos após OCR

**DEPOIS · utilidade 4/10 · impacto 4/10 · complexidade 6/10.**

**Atual:** analisarDocumentoWhatsApp combina classificação e extração multimodal no Gemini; usa Tesseract e heurísticas como fallback. O handler bloqueia compras, notas e comprovantes no piloto.

**Fluxo:** OCR/texto existente → Jev Choice(pedido, nota, comprovante, placa, outro) → fila apropriada → revisão/extração atual.

**Decisão:** DEPOIS, somente após homologar o canal. Não acrescentar OCR caro só para alimentar Jev nem reabrir as mutações bloqueadas.

**Benefício esperado:** Hipótese: menos documentos enviados ao fluxo errado; ganho depende de reutilizar OCR e evitar uma chamada que seria necessária.

**Prós:** Tipos já definidos no código. Saída curta e abstenção para documentos ilegíveis.

**Contras:** Não recebe imagem; OCR permanece necessário. Classificação não elimina extração de itens, valores e nomes.

**Riscos:** Erro de OCR, dados financeiros enviados ao provedor e confusão entre recibo e comprovação bancária. Tipo “comprovante” não atesta autenticidade nem liquidação.

**Esforço estimado:** 40–64 horas (R$ 4000–6400 a R$ 100/h hipotéticos). Inclui integração e avaliação; não inclui tempo de espera do fornecedor ou governança.

**Quando reavaliar:** Canal aprovado, ≥ 2.000 documentos/mês e custo/erro medido no roteamento; demonstrar economia da cadeia OCR + classificação + extração + revisão.

**Evidências locais:**

- server.js:7658 — `async function analisarDocumentoWhatsApp` (SHA-256 7cbbaaa768eb33d3d25d252a07e6efd5c6e582ada564266dc6b08968d2433801)

- server.js:8389 — `docAnalise.tipo === 'comprovante_pagamento'` (SHA-256 7cbbaaa768eb33d3d25d252a07e6efd5c6e582ada564266dc6b08968d2433801)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 05: Rotear documentos após OCR. Recomendação: DEPOIS — Canal hoje bloqueado.
Implemente um experimento opcional e reversível; não habilite em produção automaticamente.

CONTEXTO VERIFICADO
analisarDocumentoWhatsApp combina classificação e extração multimodal no Gemini; usa Tesseract e heurísticas como fallback. O handler bloqueia compras, notas e comprovantes no piloto.
Fluxo alvo: OCR/texto existente → Jev Choice(pedido, nota, comprovante, placa, outro) → fila apropriada → revisão/extração atual.
Arquivos existentes: server.js, js/whatsapp.js, services/procurementService.js, services/inventoryService.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Extrair o classificador documental para serviço próprio e incluir Jev apenas após texto OCR existente. Tratar o resultado como sugestão de fila. Preservar todos os returns que bloqueiam mutações do WhatsApp no piloto. Não chamar processarComprovantePagamento a partir da classificação.
Gatilho de negócio: Canal aprovado, ≥ 2.000 documentos/mês e custo/erro medido no roteamento; demonstrar economia da cadeia OCR + classificação + extração + revisão.
Contrato: conferir https://docs.typesafe.ai/api e /models antes de codificar; usar POST https://api.typesafe.ai/v1/systemone com state minimizado, model fixado (jev-1.13.0 era o documentado em 28/09/2026) e questions. Choice: criteria com opções existentes e desconhecido; resposta answers[id].choice/probabilities/confidence. Noul: answers[id].noul, sem confidence independente. Nunca confundir confiança com acurácia medida. IDs/classes devem ser allowlisted e números finitos validados mesmo com saída tipada.
Criar adapter server-side injetável em services/ai/jevClassifier.js, com flag por caso desativada, chave TYPESAFE_API_KEY apenas no ambiente, limite de payload/orçamento e timeout inicial configurável de 1.500 ms. Evitar retry síncrono em cascata; tratar 429/5xx com fallback e circuito por processo, documentando limite de instância única. Não usar alias móvel sem reavaliação. Não colocar chave no frontend. Não transmitir state completo, código, histórico amplo, senhas ou tokens. Confirmar consentimento para TypeSafe e política de dados antes de qualquer tráfego real; testes usam mocks e corpus sintético/revisado. Não abrir transação SQLite durante espera externa. Não adicionar outra base, fila ou microserviço sem necessidade.

CRITÉRIOS DE ACEITE
Testar nota, pedido, recibo falso, ilegível, texto injetado e imagem sem OCR. Contratos monetários e validação de NF não mudam. Testar por HTTP/handler que classificar comprovante não gera movimento nem baixa. Benchmark completo deve incluir OCR.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/voice.test.cjs, tests/http.test.cjs, tests/monetary_contracts.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Confusão entre tipos, taxa de revisão, OCR sem texto, latência total, custo total por documento e qualquer tentativa bloqueada de mutação.
Separar previsão, abstenção e resultado revisado; registrar versão de regras/modelo e request ID, nunca conteúdo bruto. Exportar comparação de baseline e candidato, incluindo falhas, revisão humana e custo total. Limiares calibrados em desenvolvimento e verificados em holdout PT-BR; não escolher limiar arbitrário como garantia.

FALLBACK E REVERSÃO
Heurística textual ou seleção humana; manter a mensagem de canal bloqueado. Gemini somente no fluxo multimodal autorizado atual.
Provar flag off, timeout, indisponibilidade, resposta inválida e reinício em testes. Sem credencial/acesso, entregar adapter mockado, corpus e relatório pendente; não simular ganhos medidos. Produção só após resultado econômico e validação pelo responsável.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 06 · Autenticação e permissões

**NÃO USAR · utilidade 0/10 · impacto 0/10 · complexidade 8/10.**

**Atual:** scrypt, comparação segura, memberships, lockout, securityContext e RBAC em lib/auth; tokens de ação separados.

**Fluxo:** Não inserir Jev no login, na validação de sessão, na escolha do tenant ou no requirePermission.

**Decisão:** NÃO USAR, independentemente de escala, para conceder acesso.

**Benefício esperado:** Nenhum benefício claro sobre verificações criptográficas e regras. Preservá-las evita disponibilidade dependente de IA.

**Prós:** Não há vantagem técnica demonstrada para o Jev neste ponto.

**Contras:** Falso aceite é falha de segurança. Rede e custo adicionados a toda autenticação.

**Riscos:** Escalada de privilégio, acesso entre tenants e indisponibilidade no login.

**Esforço estimado:** 40–80 horas (R$ 4000–8000 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Nenhum volume justifica autenticação probabilística. Incidentes podem justificar telemetria e triagem humana separada (caso 02).

**Evidências locais:**

- lib/auth/userRepository.js:79 — `crypto.scryptSync` (SHA-256 5867cba59944ac74b5e59b6e932ff6360734a210624a3287815f5e64400db55a)

- lib/auth/context.js:7 — `function createAuthMiddleware` (SHA-256 0cfc750278b615be471bf99da6a5fcb22fd4a4a4f2c3d69c83c033d2e009710c)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 06: Autenticação e permissões. Recomendação: NÃO USAR — Manter determinístico.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
scrypt, comparação segura, memberships, lockout, securityContext e RBAC em lib/auth; tokens de ação separados.
Fluxo alvo: Não inserir Jev no login, na validação de sessão, na escolha do tenant ou no requirePermission.
Arquivos existentes: lib/auth/identity.js, lib/auth/context.js, lib/auth/userRepository.js, lib/tokens/securityToken.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Revisar as fronteiras de autorização e documentar que modelos não produzem securityContext, roles ou permissões. Acrescentar regressões apenas se descobrir lacuna reproduzível.
Gatilho de negócio: Nenhum volume justifica autenticação probabilística. Incidentes podem justificar telemetria e triagem humana separada (caso 02).
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Login e RBAC funcionam com todas as IAs desabilitadas; tenant e papel sempre derivados de credenciais verificadas. Nenhuma previsão substitui validação criptográfica.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/persistent_auth_and_rbac.test.cjs, tests/multi_tenant_security.test.cjs, tests/auth_lockout_audit_and_rbac_preservation.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Falhas de autenticação por tipo, bloqueios e latência usando lib/metrics.js, sem senhas ou tokens.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Credencial inválida ou permissão ausente → negar deterministicamente. Fluxo de recuperação existente.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 07 · Antifraude e comprovantes

**NÃO USAR · utilidade 2/10 · impacto 2/10 · complexidade 9/10.**

**Atual:** Billing verifica webhooks e deduplica eventos no SQLite. Comprovantes via WhatsApp não fazem baixa no handler do piloto.

**Fluxo:** Provedor → verificação de webhook → idempotência → atualização determinística. Não incluir score Jev como autorização de liquidação.

**Decisão:** NÃO USAR agora como motor antifraude ou certificador de comprovantes. Não há conjunto de perdas/chargebacks rotulado no levantamento.

**Benefício esperado:** Ganho não demonstrado; score sem dados de resultado pode criar falsa sensação de proteção.

**Prós:** Em cenário futuro, texto de contestação poderia ser triado para uma pessoa; não é prova de fraude.

**Contras:** Sem acesso à verdade bancária. Falso positivo prejudica cliente; falso negativo pode liberar baixa indevida.

**Riscos:** Confiar em imagem/texto adulterado, cobrança indevida e decisão não auditável. Saída válida não equivale a transação válida.

**Esforço estimado:** 80–160 horas (R$ 8000–16000 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Reabrir apenas para triagem auxiliar se houver perdas materiais e corpus rotulado, por exemplo ≥ 10.000 eventos/mês com análise de custo do erro; priorizar sinais do provedor.

**Evidências locais:**

- services/billing/billingService.js:264 — `async function processWebhookEvent` (SHA-256 e4aaefc0980c347349cff4be1f0c545ad6ee106e1b5ac300cf31c21367b511e5)

- server.js:8389 — `docAnalise.tipo === 'comprovante_pagamento'` (SHA-256 7cbbaaa768eb33d3d25d252a07e6efd5c6e582ada564266dc6b08968d2433801)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 07: Antifraude e comprovantes. Recomendação: NÃO USAR — Sem evidência de ROI.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
Billing verifica webhooks e deduplica eventos no SQLite. Comprovantes via WhatsApp não fazem baixa no handler do piloto.
Fluxo alvo: Provedor → verificação de webhook → idempotência → atualização determinística. Não incluir score Jev como autorização de liquidação.
Arquivos existentes: services/billing/billingService.js, services/billing/paymentProviderAdapter.js, server.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Mapear e verificar contratos de autenticação dos webhooks por adapter, idempotência durável, reconciliação com provedor e bloqueio atual de baixa pelo WhatsApp. Corrigir apenas falhas reproduzidas em ambiente isolado.
Gatilho de negócio: Reabrir apenas para triagem auxiliar se houver perdas materiais e corpus rotulado, por exemplo ≥ 10.000 eventos/mês com análise de custo do erro; priorizar sinais do provedor.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Webhook inválido não altera assinatura; replay não duplica efeito; foto ou texto de recibo não confirma liquidação. Cobrir o adapter real configurado sem depender de chamadas reais em testes.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/durable_billing.test.cjs, tests/saas_customer_lifecycle.test.cjs, tests/http.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Webhook rejeitado, replay, divergência de reconciliação e perda confirmada, com identificadores minimizados.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Evento não verificado fica pendente de reconciliação/humano; nunca transformar falha de IA em aprovação.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 08 · Transações, caixa e estoque

**NÃO USAR · utilidade 0/10 · impacto 0/10 · complexidade 7/10.**

**Atual:** SQLite WAL, BEGIN IMMEDIATE, filas por tenant, versões e serviços financeiros/estoque. Existem testes monetários e de isolamento.

**Fluxo:** RBAC → validação de domínio → transação/versionamento → auditoria. Jev fora do caminho de commit.

**Decisão:** NÃO USAR para decidir commit, calcular saldo, custo, preço mínimo, estoque ou aprovação de orçamento.

**Benefício esperado:** Nenhuma vantagem clara. Regras locais são mais rápidas, baratas e reproduzíveis.

**Prós:** Jev não agrega garantia transacional.

**Contras:** Não elimina locks, validação ou idempotência. Chamadas externas dentro de transação aumentariam contenção.

**Riscos:** Perda de atualização, saldo incorreto, estoque negativo e arredondamento indevido.

**Esforço estimado:** 48–96 horas (R$ 4800–9600 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Nenhum volume justifica IA para invariantes exatos. Crescimento justifica otimização do banco e testes de concorrência.

**Evidências locais:**

- db.js:455 — `await txObj.run('BEGIN IMMEDIATE')` (SHA-256 9ed9a2aa49a78b54357683668bec399d8f92c16e34d98fd853277e20c7d9c652)

- lib/repository/stateRepository.js:23 — `function getTenantWriteQueue` (SHA-256 1a46fdba59531ffa71ed1efda756f11b288c2912e954052d3473b5801e381c0d)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 08: Transações, caixa e estoque. Recomendação: NÃO USAR — Cálculo e invariantes.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
SQLite WAL, BEGIN IMMEDIATE, filas por tenant, versões e serviços financeiros/estoque. Existem testes monetários e de isolamento.
Fluxo alvo: RBAC → validação de domínio → transação/versionamento → auditoria. Jev fora do caminho de commit.
Arquivos existentes: db.js, lib/repository/stateRepository.js, services/financialEngine.js, services/inventoryService.js, services/pricingEngine.js, services/quotationService.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Preservar controles de concorrência e contratos monetários; manter qualquer enriquecimento externo antes da transação e revalidar versão, permissão e valores ao persistir.
Gatilho de negócio: Nenhum volume justifica IA para invariantes exatos. Crescimento justifica otimização do banco e testes de concorrência.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Testes de concorrência, rollback e valores monetários passam sem rede; nenhum resultado de modelo autoriza override de preço, baixa, aprovação ou consumo de estoque.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/transaction_isolation.test.cjs, tests/lost_update_concurrency.test.cjs, tests/monetary_contracts.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Conflitos 409, rollback, latência de escrita e violações de invariantes com lib/metrics.js.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Conflito → resposta 409 e releitura; falha → rollback. Nunca persistir estado parcialmente validado.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 09 · Gerar conversa, áudio ou laudo

**NÃO USAR · utilidade 1/10 · impacto 1/10 · complexidade 5/10.**

**Atual:** Suporte usa textos aprovados; voz utiliza Gemini multimodal e respostas do motor; existem briefing e upload de notas.

**Fluxo:** Manter templates e geração/transcrição existentes. Usar Jev somente para os roteamentos separados dos casos 01 e 03.

**Decisão:** NÃO USAR como substituto universal do Gemini, redator do chatbot ou gerador de diagnóstico.

**Benefício esperado:** Nenhum ganho funcional nessa substituição; perderia modalidades e geração necessárias.

**Prós:** Escolher resposta pronta é possível e já foi analisado no suporte.

**Contras:** Não gera strings livres nem processa áudio/imagem. Encadear escolhas para fabricar texto aumenta complexidade sem vantagem.

**Riscos:** Piora da experiência e perda de campos livres. Laudo exige validação técnica do responsável.

**Esforço estimado:** 24–48 horas (R$ 2400–4800 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Nenhuma escala justifica usar a versão textual classificadora como transcritor/redator. Reavaliar só com nova capacidade documentada.

**Evidências locais:**

- services/voiceActionEngine.js:856 — `const { text, audioBase64, mimeType }` (SHA-256 22cfc13a820c62bc0f58272f98004b3608bb5532e2bad256ab6afeff9c139226)

- server.js:5530 — `async function gerarBriefingExecutivo` (SHA-256 7cbbaaa768eb33d3d25d252a07e6efd5c6e582ada564266dc6b08968d2433801)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 09: Gerar conversa, áudio ou laudo. Recomendação: NÃO USAR — Modelo inadequado.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
Suporte usa textos aprovados; voz utiliza Gemini multimodal e respostas do motor; existem briefing e upload de notas.
Fluxo alvo: Manter templates e geração/transcrição existentes. Usar Jev somente para os roteamentos separados dos casos 01 e 03.
Arquivos existentes: services/support/knowledge.js, services/voiceActionEngine.js, js/voz.js, server.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev para geração. Documentar separação entre escolher conteúdo aprovado, transcrever, extrair campos e redigir. Preservar os templates e a revisão de laudos; qualquer classificador futuro deve retornar só categorias.
Gatilho de negócio: Nenhuma escala justifica usar a versão textual classificadora como transcritor/redator. Reavaliar só com nova capacidade documentada.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Áudio continua na pipeline multimodal; suporte retorna apenas artigos aprovados; conteúdo não conhecido encaminha a humano. Nenhum laudo novo produzido por escolhas encadeadas.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/voice.test.cjs, tests/support_agent.test.cjs, tests/assistente_briefing.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Falha de transcrição, correção de campos, satisfação/encaminhamento e tempo total; sem armazenar áudio em telemetria.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Texto digitado, formulário manual, templates e suporte humano.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 10 · Moderação e prompt injection

**NÃO USAR · utilidade 2/10 · impacto 2/10 · complexidade 4/10.**

**Atual:** Suporte autenticado tem quotas e redução de dados; o agente não executa ferramentas nem exibe texto livre do modelo.

**Fluxo:** Limites + validação + sanitização + saída restrita. Não inserir Jev como barreira única de segurança ou filtro de todo atendimento.

**Decisão:** NÃO USAR agora para moderar todo texto ou substituir controles contra injeção.

**Benefício esperado:** Ganho incremental não demonstrado no canal privado atual.

**Prós:** Classificação de abuso pode ser útil se surgir uma fila real e mensurável.

**Contras:** Bloqueio incorreto de pedido legítimo. Modelo também pode ser influenciado por texto adversarial.

**Riscos:** Censurar relatos de incidente; enviar conteúdo sensível para um segundo fornecedor; confundir filtro com autorização.

**Esforço estimado:** 24–48 horas (R$ 2400–4800 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Reavaliar só se um canal público for efetivamente criado ou houver > 50 abusos/dia revisados por humanos; regras/quotas continuam primeiro.

**Evidências locais:**

- services/support/privacy.js:4 — `function sanitize` (SHA-256 6289c45260b2b9b64c07652b10437ba4fcd49e38f7c154befbf61537ecbd793d)

- services/support/agent.js:34 — `A IA apenas seleciona um conteúdo aprovado` (SHA-256 22d747b95bb410295d62d51bad3eae21e718827c95110c96dc090edc2aba0975)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 10: Moderação e prompt injection. Recomendação: NÃO USAR — Baixo ROI atual.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
Suporte autenticado tem quotas e redução de dados; o agente não executa ferramentas nem exibe texto livre do modelo.
Fluxo alvo: Limites + validação + sanitização + saída restrita. Não inserir Jev como barreira única de segurança ou filtro de todo atendimento.
Arquivos existentes: services/support/router.js, services/support/privacy.js, services/support/agent.js, js/support-widget.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Preservar quotas, texto seguro, catálogo fechado e separação de instruções/dados. Verificar casos adversariais no suporte e encaminhamento humano; não bloquear relatos críticos por vocabulário sensível.
Gatilho de negócio: Reavaliar só se um canal público for efetivamente criado ou houver > 50 abusos/dia revisados por humanos; regras/quotas continuam primeiro.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
HTML e instruções injetadas não executam; pedido de pessoa continua disponível; modelo não ganha ferramentas nem acessa dados de outra oficina.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/support_agent.test.cjs, tests/voice_security_negative.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Rejeições por quota, tickets abusivos confirmados, falsos bloqueios e incidentes encaminhados.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Encaminhamento humano e limites locais; ausência de classificador não enfraquece autorização.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 11 · Alertas, manutenção e pós-venda

**NÃO USAR · utilidade 2/10 · impacto 2/10 · complexidade 3/10.**

**Atual:** Motores de inteligência operacional, manutenção, relacionamento e pós-venda calculam eventos e oportunidades a partir do estado.

**Fluxo:** Estado autorizado → limites de horas/km/datas → eventos → política de notificação. Manter cálculos em código.

**Decisão:** NÃO USAR para recalcular urgência baseada em prazo, priorizar mecanicamente boxes ou inventar previsão de churn.

**Benefício esperado:** Nenhum ganho claro sobre ajustar os limiares existentes com os operadores.

**Prós:** Uma futura classificação de comentários livres poderia ser separada, se existir demanda.

**Contras:** Adiciona rede a cálculos locais. Não há evidência de rótulos para previsão de churn ou falha mecânica.

**Riscos:** Ocultar alertas críticos, recomendar reparo inadequado ou alterar prioridades sem explicação operacional.

**Esforço estimado:** 24–40 horas (R$ 2400–4000 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Mais volume exige ajuste de limites; só reabrir classificação semântica se houver fila de relatos livres e erros documentados que regras não resolvem.

**Evidências locais:**

- services/operationalIntelligenceEngine.js:51 — `function avaliarOperacao` (SHA-256 b24d9d754ec9e8f137ab68872097693a971473c895d0cfaa16b805786d22aa28)

- services/maintenancePlanService.js:48 — `function calcularStatusItem` (SHA-256 301e39848fc4e449ad7810f62c3ca3b3fabdd29d4cbf3507a9f13fba52aa2bab)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 11: Alertas, manutenção e pós-venda. Recomendação: NÃO USAR — Regras suficientes.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
Motores de inteligência operacional, manutenção, relacionamento e pós-venda calculam eventos e oportunidades a partir do estado.
Fluxo alvo: Estado autorizado → limites de horas/km/datas → eventos → política de notificação. Manter cálculos em código.
Arquivos existentes: services/operationalIntelligenceEngine.js, services/maintenancePlanService.js, services/relationshipService.js, services/afterSalesService.js, services/operationalNotificationPolicy.js.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Levantar ruído dos alertas com operadores, ajustar configuração existente e manter regras explícitas de prazo/km/cooldown. Preservar severidades críticas e escopo por tenant.
Gatilho de negócio: Mais volume exige ajuste de limites; só reabrir classificação semântica se houver fila de relatos livres e erros documentados que regras não resolvem.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Mesmo estado e relógio produzem os mesmos eventos; testes de fuso, prazo, km e cooldown permanecem determinísticos. Nenhum alerta crítico depende de provedor externo.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/operational_intelligence.test.cjs, tests/operational_dashboard.test.cjs, tests/crm_fleet_and_maintenance.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Alertas reconhecidos/ignorados, tempo parado, repetição suprimida e taxa de falsos alertas revisada pelo operador.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Painel e política local; sem WhatsApp, manter eventos consultáveis no CRM.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 12 · Fiscal e integração ERP

**NÃO USAR · utilidade 1/10 · impacto 1/10 · complexidade 8/10.**

**Atual:** ERP usa schemaVersion, cursores e outbox; fiscal tem cálculo decimal e ciclo próprio, com produção bloqueada no escopo documentado.

**Fluxo:** Estado → schema canônico → outbox/adapter → confirmação de sincronismo. Cálculo e códigos fiscais validados no fluxo competente.

**Decisão:** NÃO USAR para emitir nota, atribuir alíquota/NCM, calcular imposto ou aceitar sincronização.

**Benefício esperado:** Nenhuma melhoria clara na correção de contratos de dados.

**Prós:** Triagem de texto documental é separável e já consta no caso 05.

**Contras:** Não substitui parser, schema, cadastro fiscal ou integração real com ERP. Acrescenta risco a dados de efeito financeiro.

**Riscos:** Classificação fiscal indevida, arredondamento incorreto, sincronismo duplicado e extrapolação do escopo operacional do CRM.

**Esforço estimado:** 48–96 horas (R$ 4800–9600 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Nenhuma escala justifica IA para somas e validade fiscal; só avaliar sugestões de cadastro em outro escopo, com revisão especializada e corpus próprio.

**Evidências locais:**

- services/erpIntegrationService.js:12 — `const SCHEMA_VERSION = '1.0.0'` (SHA-256 3c76f606c7af5831e0a413acd7e7fa5caba373d36e032c13f91c0ee629018ba4)

- services/fiscal/decimal.js:7 — `BigInt` (SHA-256 5c060f6cb2308e6da4d0e4e747d52012cdaaa1964b46b02e5354b2169ff4a7f1)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 12: Fiscal e integração ERP. Recomendação: NÃO USAR — Contratos exatos.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
ERP usa schemaVersion, cursores e outbox; fiscal tem cálculo decimal e ciclo próprio, com produção bloqueada no escopo documentado.
Fluxo alvo: Estado → schema canônico → outbox/adapter → confirmação de sincronismo. Cálculo e códigos fiscais validados no fluxo competente.
Arquivos existentes: services/erpIntegrationService.js, services/fiscal/fiscalCalculationEngine.js, services/fiscal/decimal.js, services/fiscal/fiscalLifecycleService.js, docs/INTEGRACAO_ERP.md.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Preservar schemas, cálculo decimal, idempotência e bloqueios de produção. Documentar que sugestão de tipo de documento não determina tributação, emissão ou sincronismo.
Gatilho de negócio: Nenhuma escala justifica IA para somas e validade fiscal; só avaliar sugestões de cadastro em outro escopo, com revisão especializada e corpus próprio.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Contratos ERP e testes de ciclo fiscal passam sem rede/modelo; emitir continua sujeito aos bloqueios e configurações atuais.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/erp_integration.test.cjs, tests/fiscal_calculation.test.cjs, tests/fiscal_hardening.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Falhas de schema, fila/retries ERP, rejeições fiscais e divergências conciliadas.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Reter pendência para revisão e retry idempotente; manter emissão real no ERP homologado conforme escopo.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```

## 13 · Automações e continuidade

**NÃO USAR · utilidade 1/10 · impacto 1/10 · complexidade 6/10.**

**Atual:** Scheduler outbox, políticas de envio, supervisor Windows e scripts de backup/restore já existem. Documentação do piloto registra pendências de backup independente.

**Fluxo:** Agenda/regras → outbox → envio e registro; backup → verificação → ensaio de restauração. Nenhuma decisão Jev no caminho.

**Decisão:** NÃO USAR para escolher se um backup é íntegro, quando executar um job obrigatório ou se deve restaurar.

**Benefício esperado:** O ROI está na confiabilidade operacional e no fechamento das pendências documentadas, não em um classificador adicional.

**Prós:** Não há vantagem demonstrada do modelo nas rotinas existentes.

**Contras:** Dependência de internet num piloto local. IA não torna fila, armazenamento ou serviço Windows mais duráveis.

**Riscos:** Silenciar falha de backup, repetir envio ou deixar job obrigatório sem execução.

**Esforço estimado:** 24–48 horas (R$ 2400–4800 a R$ 100/h hipotéticos). Tentativa desaconselhada; orçamento recomendado para integrar Jev é zero.

**Quando reavaliar:** Múltiplas instâncias justificam coordenação durável; falha de restore exige correção operacional. Nenhum desses eventos justifica Jev.

**Evidências locais:**

- lib/outbox/scheduler.js:51 — `async function processarProximoJob` (SHA-256 4609855e5f4b8612a17d7a9276bdb83ff1f1a084b59272f1abcf6a28160e7333)

- docs/INSTALADOR_TRES_EMPRESAS_2026-09-23.md:21 — `Backup independente` (SHA-256 3566b8d44f92eaf6958ff7fbc6fb523171c989fe5541742f879baea7e634a341)

**Prompt individual:**

```text
Trabalhe no repositório Pátio CRM (Node.js CommonJS/Express, frontend JS modular, SQLite WAL).
Caso 13: Automações e continuidade. Recomendação: NÃO USAR — Confiabilidade primeiro.
Este caso foi rejeitado para Jev. Implemente/verifique a alternativa determinística abaixo; não instale nem chame Jev.

CONTEXTO VERIFICADO
Scheduler outbox, políticas de envio, supervisor Windows e scripts de backup/restore já existem. Documentação do piloto registra pendências de backup independente.
Fluxo alvo: Agenda/regras → outbox → envio e registro; backup → verificação → ensaio de restauração. Nenhuma decisão Jev no caminho.
Arquivos existentes: lib/outbox/scheduler.js, services/backupService.js, services/operationalNotificationPolicy.js, scripts/supervise_patio.cjs, scripts/executar_backup_operacional.cjs.
Confira o conteúdo atual e as instruções do repositório; os nomes de arquivos são referências, não autorização para refatorar módulos sem necessidade. Preserve mudanças do usuário.

ESCOPO
Não integrar Jev. Confirmar o estado atual das pendências documentadas e priorizar ensaio isolado de restore, observabilidade de falhas e contratos de claim/retry da fila se a topologia mudar. Não executar restore sobre banco real.
Gatilho de negócio: Múltiplas instâncias justificam coordenação durável; falha de restore exige correção operacional. Nenhum desses eventos justifica Jev.
Custo recomendado de integração Jev: zero. Faça primeiro uma revisão delimitada; só altere código se houver falha ou melhoria concreta demonstrada.

CRITÉRIOS DE ACEITE
Backup íntegro validado por ferramentas determinísticas, restauração em destino isolado e jobs com comportamento definido para crash/retry. Relatar limites da instância única.
Preservar isolamento por tenant, RBAC, confirmação humana/token, versionamento e idempotência. Nenhum score altera estas garantias. Escrever testes dirigidos de falha e fronteira, não testes que apenas reproduzem a implementação.
Testes existentes relevantes: tests/wal_backup_and_recovery.test.cjs, tests/operational_backup_external.test.cjs, tests/supervisor_isolated.test.cjs. Usar scripts/test-preload.cjs quando exigido pela suíte, bancos temporários e integrações desativadas; não importar banco real em ensaios. Só afirmar testes efetivamente executados.

OBSERVABILIDADE
Idade do último backup válido, resultado do restore, fila pendente, tentativas, falhas finais e reinícios.
Reutilizar métricas existentes; sem coletar dados adicionais desnecessários.

FALLBACK E REVERSÃO
Alerta operacional e procedimento humano documentado; nunca aceitar integridade por score de IA.
Manter o comportamento determinístico e documentar riscos residuais.

ENTREGA
Diff pequeno, instruções de execução, evidências dos testes e relatório do que foi medido versus estimado. Não alterar .env, banco operacional, deploy-piloto, credenciais ou liberar integrações bloqueadas. Não publicar nem enviar mensagens externas como parte deste trabalho.
```
