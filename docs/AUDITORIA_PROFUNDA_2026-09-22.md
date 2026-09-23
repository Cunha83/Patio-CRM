# Auditoria independente do Pátio CRM — 22/09/2026

**Parecer: não liberar o piloto com dados reais na versão auditada.** Além da falta de backup independente já conhecida, foram reproduzidas falhas de autorização e integridade do cofre que não são detectadas pela suíte atual.

Não houve correção nem edição do código da aplicação. Foram criados somente este relatório e evidências. Os testes adicionais foram escritos e executados fora do projeto, em diretório temporário. Os 128 arquivos da release mantiveram os hashes registrados no início da auditoria. Não foram executados seeds, rotação de senhas, comandos administrativos ou testes destrutivos contra a instância operacional.

## Método e resultados

Cópia temporária dos arquivos da release, scripts e testes, sem `.env` ou bases operacionais; dependências instaladas reutilizadas por junction. Bancos, uploads e servidores de teste descartáveis. Não é uma nova comprovação de `npm ci`. A aplicação na porta 3000 recebeu apenas consulta de prontidão nesta auditoria.

| Verificação | Resultado observado |
|---|---|
| Suíte existente, exceto arquivo RBAC dependente da porta 3000 | 566 entradas: 565 aprovadas, zero falhas, 1 ignorada; 91,14 s |
| Arquivo RBAC restante | 6 entradas aprovadas, zero falhas; autenticação e HTTP redirecionados para servidor temporário com usuários sintéticos |
| Total das duas execuções | **572 entradas: 571 aprovadas, zero falhas, 1 ignorada**; contagem do runner inclui testes pais |
| Sintaxe da release | 112 arquivos JS/CJS verificados com `node --check`, zero erros |
| Testes HTTP adicionais | Login dos três perfis, isolamento entre tenants, acesso anônimo, permissões, CSRF, versão obsoleta e latência |
| Navegador Chromium independente | Nove módulos navegados com confirmação de `S.ui.view`, cadastro de cliente persistido e zero exceções JavaScript observadas |
| Runner `run_agent_browser_verified.cjs` | Falhou por timeout de 60 s na primeira jornada; não considerar suas seis jornadas homologadas nesta execução |
| Testes adversariais adicionais | Falhas reproduzidas abaixo, mesmo com a suíte existente aprovada |
| `npm audit --omit=dev` | 5 pacotes classificados como high, zero critical; detalhes no JSON |
| Host operacional | `/ready` 200, banco/storage ok, WhatsApp e integrações desativados; unidade D: ausente |

O teste ignorado tentou criar symlink de arquivo e recebeu EPERM no Windows. Esse controle específico não foi comprovado pela execução.

## Achados prioritários

### A1 — P1: mecânico consegue excluir OS e alterar clientes pelo estado completo

**Reproduzido por HTTP real, com banco temporário.** Usuário com papel `mecanico`, sem `os:write`, `os:delete` ou `crm:write`, leu o estado e enviou `POST /api/estado` removendo a OS e alterando o nome do cliente. Resposta HTTP 200. A leitura subsequente com o gestor confirmou zero OS e o nome alterado.

Referências: `server.js:681`, `lib/repository/stateRepository.js:200`, `lib/auth/userRepository.js:62`. A persistência protege alguns campos financeiros e administrativos, mas não autoriza cada alteração operacional por entidade/ação. A filtragem do GET não substitui autorização do POST.

**Correção indicada:** validar permissões por diferença entre estado anterior e recebido, incluindo exclusões; ou restringir a gravação integral e usar comandos específicos autorizados. Não basta esconder controles na interface. Critério: mecânico não exclui OS nem altera cadastro de cliente; o estado permanece inalterado após a tentativa, preservando operações técnicas legitimamente permitidas.

Evidência: `http-audit-deep-results.json`, casos `mechanic_unauthorized_changes` e `mechanic_state_write`.

### A2 — P1: upload autenticado pode apagar o diretório inteiro do cofre

**Reproduzido somente em cofre temporário.** Um pacote com `packageFolderName` igual a `.` resolve para a raiz do cofre. A publicação remove recursivamente o destino já existente antes de renomear o staging. A resposta final foi 400, mas o cofre e o arquivo sentinela anterior já tinham sido apagados.

Referências: `scripts/servico_backup_remoto.cjs:104` e `:160`. Requer token válido do cofre; não é um ataque anônimo. O impacto é perda dos backups disponíveis por pacote malformado ou cliente comprometido.

**Correção indicada:** validar identificadores e nomes por lista estrita de caracteres, rejeitar `.`/`..` e separadores, comprovar contenção canônica de todos os caminhos e impedir substituição destrutiva de pacotes existentes. Validar tudo antes de criar ou remover arquivos. Critério: entradas inválidas retornam erro e todos os pacotes existentes permanecem intactos.

Evidência: `vault-adversarial-results.json`, caso `dot_package_name`.

### A3 — P1: cofre declara verificado um pacote sem banco de dados

**Reproduzido por HTTP.** Manifesto exigindo `patio.db`, mas `files: {}`, recebeu HTTP 200, `verified: true` e `totalFiles: 0`. O receptor percorre apenas arquivos enviados e não exige correspondência completa com o manifesto. Hash ausente também não causa rejeição automática.

Referências: `scripts/servico_backup_remoto.cjs:111`, `:126` e `:154`. O produtor aceita o retorno remoto com base em `ok`/`verified`, sem conferir completamente o recibo contra o pacote original.

**Correção indicada:** exigir banco, validar esquema e igualdade entre conjuntos de arquivos, tamanhos e hashes; rejeitar arquivos faltantes/extras e hashes ausentes. O remetente deve conferir identidade e conteúdo do recibo. O hash do recibo atual não é assinatura digital autenticada.

Evidência: `vault-adversarial-results.json`, caso `missing_required_database`.

### A4 — P2: validação de independência admite loopback IPv6 e entrada inválida

**Reproduzido diretamente na função de validação.** `http://[::1]:3005/upload` e uma string que não é URL foram aceitos; `http://localhost:3005/upload` foi rejeitado. `URL.hostname` mantém colchetes no IPv6, enquanto a comparação usa `::1`. Erros de parsing são engolidos. A comparação de letras de unidade também não comprova discos físicos diferentes.

Referência: `scripts/executar_backup_operacional.cjs:70`. Não foi feita conexão a destinos externos nesse teste. Uma URL inválida pode falhar posteriormente no fetch; o achado é que a validação não a rejeita como promete.

**Correção indicada:** falhar em parsing inválido, tratar IPv4/IPv6 e resolução do destino, não inferir independência física apenas por letra da unidade. A prova operacional continua sendo backup e restauração em armazenamento realmente independente.

### A5 — P1: middleware de plataforma amplia permissões e pula checagem de origem

**Reproduzido em chamada isolada ao middleware real**, com identidade sintética `platform_support` que tinha apenas `platform:read` e `platform:support`. Para POST em `/api/platform/reconcile`, o middleware chamou `next()` e atribuiu `platform:manage` e `*`, mesmo recebendo origem externa e `sec-fetch-site: cross-site`.

Referências: `lib/auth/context.js:68`, `:94` e `:101`. O ramo da plataforma retorna antes da verificação de origem. Não foi executada reconciliação real nem comprovada exploração em navegador; o resultado comprova a decisão de autorização do middleware. A exploração final depende das restrições da rota e do navegador.

**Correção indicada:** preservar os privilégios efetivos de suporte, exigir permissões de gestão nos comandos administrativos e aplicar proteção de origem antes de qualquer ramo de autenticação que finalize com `next()`.

Evidência: `platform-auth-audit.json`.

## Dependências, desempenho e qualidade dos testes

O `npm audit` apontou `extract-zip`, `@puppeteer/browsers`, `puppeteer`, `puppeteer-core` e `whatsapp-web.js`, ligados à mesma cadeia de dependências. São cinco pacotes marcados, não cinco explorações independentes demonstradas no CRM. Os avisos tratam de extração de ZIP com symlinks e escrita fora do destino; o scanner não comprova que exista uma rota HTTP explorável na aplicação. Fontes: [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) e [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3). Não foi executado `npm audit fix` nem atualização de dependências. Manter WhatsApp desativado e avaliar atualização/substituição compatível, sem declarar correção automática disponível para toda a cadeia.

No teste SQLite existente, 100 operações por onda levaram 1.239/1.152/1.147 ms com concorrência 1/4/10; p95 por operação 18/50/131 ms. Nenhuma perda foi detectada pelo teste. Vinte leituras HTTP sequenciais autenticadas no primeiro ensaio tiveram p50 61,6 ms e p95 80,9 ms. É amostra sintética pequena, não capacidade garantida de produção. O código usa scrypt síncrono na autenticação Basic, custo relevante por requisição; otimizar somente após definir carga e meta, sem enfraquecer senhas.

Lacunas concretas de cobertura:

- O arquivo RBAC original aponta para `127.0.0.1:3000` e faz POST. Nesta auditoria foi redirecionado em runtime para porta temporária, com credenciais sintéticas; nenhum POST foi enviado ao piloto.
- O teste de backup proibido aceita 404, embora use `/api/backups/executar`, enquanto a rota principal existente é `/api/backup/wal`. Aprovar por rota inexistente não comprova autorização da rota real. O teste adicional confirmou bloqueio 403 para `/api/backup/listar`, mas não cobre todas as rotas de gestão.
- `deployment_preflight_guard.test.cjs:81` passa `--target` ao instalador, que não interpreta esse argumento. Pode testar a recusa do destino padrão e deixar a sentinela temporária intacta sem ter tentado operar nela.
- `run_agent_browser_verified.cjs:321` inclui `tagText.length >= 0`; essa condição é sempre verdadeira para uma string e não comprova que o aviso esperado apareceu.
- A suíte aprovada não exercitou os cenários A1–A5. Quantidade de testes e hashes corretos não equivalem a autorização ou integridade comprovadas.

## Cobertura funcional e limites

Os arquivos da suíte executada cobrem persistência/concorrência, reinício, clientes/frotas/manutenção, pré-OS/intake, inspeções/orçamentos, estoque/compras/fornecedores, mão de obra/produtividade, financeiro, voz/confirmacão, ERP/outbox, fiscal de teste, billing/SaaS, suporte, LGPD, uploads e backup/restauração. Aprovação refere-se aos cenários implementados nesses testes.

No Chromium independente foram confirmadas as telas Operação, Pátio, Mensagens, Painel, Estoque, Financeiro, Relatórios, Cadastros e Configurações, além de criação de cliente via formulário com leitura posterior pelo backend. Navegar e renderizar não comprova todos os comandos de cada módulo. A reprodução integral das seis jornadas do runner original ficou incompleta por timeout.

Não foram enviados documentos fiscais, cobranças, consultas pagas ou mensagens WhatsApp reais. Não foram testados microfone/dispositivos físicos, perda de energia, reinício do Windows, restauração de dados reais ou backup em D:, que continua ausente. Não há medição de cobertura percentual de linhas/branches nem garantia de ausência de outras falhas.

## Ordem recomendada para a próxima versão

1. Bloquear alterações não autorizadas do estado (A1) e corrigir o middleware de plataforma (A5), com regressões negativas.
2. Antes de usar o cofre, corrigir contenção e integridade (A2/A3). Para piloto local, manter esse componente fora do caminho operacional se não for necessário.
3. Disponibilizar destino físico/remoto independente e validar backup agendado e restauração dele; corrigir A4 e registrar resultado real da tarefa.
4. Corrigir os falsos positivos de cobertura e avaliar as dependências sinalizadas.
5. Reexecutar regressões e ensaio da oficina. Somente então reconsiderar o piloto com dados reais.

Evidências completas em `docs/evidencias/auditoria-profunda-2026-09-22/`. Os reprodutores adicionais foram preservados como arquivos `.cjs.txt` para consulta; contêm somente usuários, senhas e dados sintéticos da auditoria.
