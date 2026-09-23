# Análise para piloto — 21/09/2026

## Escopo e conclusão

Inspeção do código local, testes automatizados com bancos temporários, auditoria npm e duas reproduções dirigidas. Nenhuma alteração no código da aplicação foi feita nesta análise. O banco operacional e o arquivo `.env` não foram abertos para inspeção. Não houve homologação visual nem validação de serviços externos reais.

**Recomendação: corrigir os bloqueadores de integridade antes de liberar o piloto operacional.** A existência de testes e pareceres antigos não comprova a prontidão da árvore de trabalho atual.

Base existente: Node.js v24.19.0, npm 11.17.0, Express, SQLite WAL, frontend JavaScript, 46 arquivos de teste. Há autenticação persistente, RBAC, isolamento por oficina, controle de versão para parte das gravações, backup e recuperação. `server.js` tem 8.164 linhas. Há alterações locais extensas e diretórios novos ainda não versionados; o commit sozinho não identifica o código analisado.

## Achados com evidência

1. **P0 — Sobrescrita de alterações em gravações internas.** `server.js:175` marca gravações de `salvarEstado` com `channel: 'internal'`; `lib/repository/stateRepository.js:220` dispensa a comparação de versão nesse canal. Reproduzido com duas cópias do mesmo estado em banco temporário: a primeira adiciona cliente, a segunda adiciona veículo; ambas retornam `ok: true`, mas o estado final contém zero clientes e um veículo. A fila somente da persistência não protege a leitura e a mutação anteriores. Corrigir o ciclo completo e seus chamadores, sem apenas remover a exceção e deixar respostas de sucesso após conflitos.

2. **P0 — Reinicialização desfaz alocação em boxes válidos.** `server.js:6178` aceita apenas IDs `b1` a `b6`, enquanto `js/app.js:1898` cria boxes com `uid('b')`. Executando o trecho real da rotina de inicialização com um box cadastrado `b_custom`, a OS mudou de `{box:'b_custom', st:'executando'}` para `{box:null, st:'fila'}`. Corrigir a validação para usar os boxes do próprio estado/tenant. A reprodução executou o trecho de código; ainda é necessário um teste completo de reinício HTTP.

3. **P1 — Readiness pode indicar armazenamento saudável incorretamente.** `server.js:325` testa `ROOT_DIR/uploads`, mas `lib/file-storage.js:7` grava em `UPLOAD_DIR` ou `public/uploads`. O endpoint também informa `scheduler: 'ok'` de forma fixa. Centralizar a configuração e refletir os estados reais. Falhas obrigatórias de inicialização devem impedir prontidão.

4. **Segurança — cinco dependências sinalizadas como altas.** `npm audit --omit=dev --json` retornou 5 altas e 0 críticas na cadeia `whatsapp-web.js` / Puppeteer / `extract-zip`. Isso é contagem de pacotes afetados, não cinco explorações comprovadas no CRM. O relatório não oferece correção automática para a cadeia completa. `server.js:29` carrega WhatsApp e Puppeteer mesmo quando a inicialização das integrações está desabilitada. Desativar integrações não elimina dependências vulneráveis instaladas. Não executar `npm audit fix --force` indiscriminadamente.

5. **Desempenho — custo cresce com o estado completo.** `js/state.js` serializa e transmite o estado completo; `stateRepository` clona objetos e persiste JSON integral no SQLite. Existem operações síncronas de disco e buscas repetidas em arrays. São candidatos a medição; não há benchmark desta análise que autorize alegar uma lentidão específica ou prometer ganho percentual. Para o piloto, medir antes de otimizar e manter um único processo de aplicação enquanto cache/fila forem locais ao processo.

6. **5S — documentação e configuração não representam uma liberação verificável.** Os pareceres anteriores relatam outra suíte; o README apresenta RPO/RTO que dependem de operação e ensaio. `.env.example` ativa integrações por padrão. Organizar uma configuração de piloto explícita e evidências atuais, preservando dados, arquivos novos e alterações existentes.

## Validação

- Execução inicial de `npm test`: apresentou falhas e deixou de produzir progresso; interrompida. Não existe resultado consolidado aprovado dessa tentativa.
- Reteste isolado do briefing: 6 aprovados, zero falhas, saída 0.
- Reteste sequencial de backup e consulta de cliente: 14 aprovados, zero falhas, 1 ignorado por privilégio de symlink no Windows, saída 0.
- Nova suíte com concorrência 2: **497 testes, 489 aprovados, 7 falhas, zero cancelados e 1 ignorado; duração 69,10 segundos; saída 1.** Comando: `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`.
- Falhas em `pre_os.test.cjs`, `progressive_os.test.cjs`, `voice.test.cjs` e `voice_financial_and_training.test.cjs`; a contagem do runner inclui a falha do teste pai financeiro. Existem fixtures que omitem contexto autenticado e esperam sucesso, enquanto o motor aplica autorização. É necessário classificar cada caso e corrigir fixtures legítimas sem enfraquecer a segurança; esta análise não demonstrou que todas as falhas sejam apenas fixtures.
- Auditoria de dependências: saída 1 por vulnerabilidades, 5 altas, zero críticas.
- Os dois defeitos de integridade acima foram reproduzidos separadamente. Testes existentes passando não anulam esses achados.

Logs desta análise: `docs/evidencias/analise-2026-09-21/` (suíte limitada concluída, tentativa padrão interrompida, retestes e auditoria npm).

## Prompt para o Antigravity

Você deve estabilizar o Pátio CRM para um piloto operacional controlado o quanto antes. Trabalhe sobre o código local existente e leia `docs/ANALISE_PILOTO_2026-09-21.md`. Preserve alterações locais e arquivos ainda não versionados. Implemente correções pequenas, revisáveis, seguras e compatíveis com os contratos atuais. Não faça reescrita ampla, troca de framework ou banco, nem expansão funcional nesta entrega.

### 1. Corrigir os bloqueadores de integridade primeiro

- Reproduza a perda de atualização em `salvarEstado`/`persistState`: duas leituras da mesma versão, alterações independentes e duas gravações internas hoje retornam sucesso, mas uma alteração desaparece.
- Garanta atomicidade do ciclo leitura–mutação–persistência por oficina ou aplique controle otimista obrigatório com tratamento explícito dos conflitos. Audite todos os chamadores, incluindo endpoints e tarefas internas. Evite filas aninhadas com deadlock. Não reaplique automaticamente efeitos externos não idempotentes. Nunca retorne sucesso quando persistir falhar ou entrar em conflito. Preserve RBAC, auditoria e isolamento entre tenants.
- Remova a lista fixa `b1`–`b6` da inicialização. Valide alocações pelo cadastro de boxes do próprio tenant. Não altere silenciosamente uma OS válida. Crie teste que cadastre box com ID dinâmico, aloque OS, reinicie o servidor e comprove manutenção de box e status.
- Acrescente regressões de concorrência reais em endpoints, conflitos na mesma entidade, preservação de alterações independentes e isolamento entre duas oficinas.

### 2. Tornar a operação do piloto confiável

- Corrija `/ready` para testar o diretório efetivo de uploads e refletir inicialização, banco e agendadores reais. Componente opcional desativado deve ser identificado como desativado; falha obrigatória deve retornar 503. Use I/O assíncrono onde apropriado.
- Prepare configuração explícita de piloto com caminhos isolados para banco, backup e uploads; usuários individuais e permissões mínimas; acesso restrito e HTTPS quando acessado pela rede. Não exponha segredos em frontend, logs ou repositório.
- Mantenha emissão fiscal de produção bloqueada. Deixe cobrança real, IA e WhatsApp fora do caminho obrigatório do piloto até homologação específica. As funcionalidades disponíveis devem ser claras na interface, sem dados fictícios apresentados como reais.
- Audite a cadeia WhatsApp/Puppeteer. Para o piloto, prefira artefato mínimo que não instale/carregue dependências opcionais vulneráveis, após verificar usos compartilhados como renderização. Não declare a vulnerabilidade resolvida só porque uma flag foi desligada. Se restar exposição, registre-a e a decisão necessária para liberar o ambiente.
- Prepare backup automatizado com monitoramento e cópia fora do host. Ensaiar restauração em banco separado incluindo anexos necessários; registrar tempos medidos e integridade. Não transformar metas de RPO/RTO em garantias sem evidência.

### 3. Otimizar com evidência, dentro do escopo do piloto

- Defina e registre uma carga sintética representativa do piloto: quantidade de oficinas, usuários simultâneos e registros. Meça antes/depois a abertura do pátio, leitura/gravação de estado, payload, memória, p50/p95 e erros/conflitos.
- Otimize os gargalos comprovados com mudanças pontuais: evitar gravação sem alteração, reduzir cópias redundantes, substituir buscas repetidas por índices em memória locais à operação, e paginar listas quando necessário. Preserve a recuperação de rascunho e a resolução de conflitos.
- Não crie caches sem invalidação/isolamento por tenant, não reduza durabilidade SQLite e não use vários processos sobre caches locais sem resolver consistência. Migração geral do estado para tabelas normalizadas fica para depois se as medições não a exigirem.

### 4. Aplicar 5S

- Utilização: congelar escopo em cliente/veículo, entrada, OS, box, peças, execução e entrega; separar funções opcionais.
- Ordenação: centralizar configuração operacional e manter um roteiro único de instalação, piloto e rollback.
- Limpeza: listar arquivos temporários, artefatos e dados gerados; ajustar `.gitignore` seletivamente. Não apagar bancos, backups, uploads ou trabalho existente. Não ocultar código novo necessário sob regras amplas.
- Padronização: respostas de erro, validação, identificação de tenant e convenções consistentes nas áreas alteradas; alinhar README, exemplo de ambiente e estado real dos recursos.
- Disciplina: um comando reproduzível de testes, evidência atual e checklist de liberação. Ajustar a concorrência do runner a partir de medição; não mascarar falhas aumentando timeouts ou ignorando testes.

### 5. Critérios de aceite e entrega

- Suíte completa com saída 0; informar contagem de aprovados/falhas/cancelados/ignorados e justificar cada skip. Investigar diferenças entre execução padrão e limitada. Não enfraquecer autorização para passar testes.
- Investigar as 7 falhas reportadas na execução atual, especialmente fixtures sem contexto em `pre_os`, `progressive_os`, `voice` e `voice_financial_and_training`. Separar defeito funcional de expectativa de teste obsoleta; incluir regressões negativas sem autorização.
- Homologação no navegador: login → cliente/veículo → OS → box criado dinamicamente → peças/execução → entrega → reinício → conferência. Testar duas sessões simultâneas, queda de conexão e recuperação de rascunho. Verificar que mecânico não recebe dados financeiros por API nem DOM.
- Dois bloqueadores de integridade reproduzidos antes e corrigidos depois; `/ready` comprovado em sucesso e falha; restauração ensaiada; métricas de desempenho registradas sem ganhos inventados.
- Testes somente em bancos e diretórios temporários, sem envio real de mensagens, emissão fiscal ou cobrança. Nunca manipular a base operacional para fabricar evidências.
- Entregar resumo das mudanças, arquivos alterados, comandos e códigos de saída, métricas, evidências de navegador, riscos remanescentes e parecer `APTO` ou `NÃO APTO` com motivo. Vincular evidências ao commit e às alterações locais/manifesto. Se algo não foi testado, escrever `NÃO VALIDADO`.

Prioridade: integridade dos dados → segurança e recuperação → jornada principal → desempenho medido → organização. Conclua essas correções antes de propor novos módulos.
