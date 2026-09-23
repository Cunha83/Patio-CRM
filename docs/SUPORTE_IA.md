# Suporte assistido do Pátio CRM

Implementação inicial de atendimento aos usuários do software. Não é um atendente de orçamento ou agendamento para os clientes finais da oficina.

## Uso

O cliente autenticado abre **Ajuda e suporte**, inicia um protocolo e descreve a dificuldade. Pode retomar os próprios protocolos e solicitar uma pessoa. A equipe usa `/api/platform/support-desk/`, com usuário de plataforma de papel `platform_admin` ou `platform_support`, para assumir, responder e encerrar. A resposta fica no chat do solicitante; não há envio de e-mail, WhatsApp nem promessa de atendimento imediato. A lista exibe até 30 protocolos; pesquisa, paginação e redistribuição de responsáveis ainda não fazem parte desta versão.

## Comportamento do agente

- A base versionada cobre OS, sincronização, estoque, compras, orçamento, financeiro gerencial, acesso, WhatsApp, assinatura, ERP, backup, privacidade e segurança.
- A resposta exibida vem exclusivamente de artigos revisáveis em `services/support/knowledge.js`. Cada artigo registra arquivos de referência; o usuário vê o título da orientação.
- A IA externa apenas identifica qual artigo corresponde à pergunta quando a busca local não resolve. Não recebe código-fonte, banco da oficina, anexos ou histórico completo. A saída livre do modelo nunca é exibida ou executada.
- Perguntas sem orientação verificada pedem esclarecimento e, se continuarem sem resposta, são encaminhadas. Pedido explícito de humano e suspeita de incidente também encaminham. Cobrança, backup e privacidade têm orientação limitada e encaminhamento.
- O assistente não altera OS, estoque, pagamentos, usuários, permissões ou backups. Não acessa as informações operacionais da oficina para fazer diagnósticos.

## Ativação

O módulo está montado após autenticação e limitador de API no `server.js`; o componente foi adicionado ao `index.html`. Não é necessário instalar dependências novas.

Sem `SUPPORT_AI_MODEL`, a base local e a fila humana funcionam, sem chamadas de IA. Para ativar a classificação externa, configure `SUPPORT_AI_MODEL` com um identificador de modelo disponível e validado na conta Google usada pelo servidor e configure `GEMINI_API_KEY` pelo mecanismo de segredos da instalação. Reinicie o serviço pelo procedimento normal. Nenhuma chave foi criada, alterada ou exposta neste desenvolvimento. Não foi feita uma chamada real ao provedor.

Antes do primeiro protocolo com IA, o usuário pode autorizar o envio do texto ao Google Gemini. A opção começa desmarcada; sem autorização não há chamada externa. A preferência é registrada por protocolo. A versão inicial não possui alteração dessa preferência durante a conversa: encerre o protocolo e abra outro sem IA para continuar usando somente a base local.

`SUPPORT_ENABLED=false` desativa as rotas. O componente se oculta quando não consegue carregar o recurso autenticado. A tela e as requisições reutilizam a autenticação do produto; não existe conta administrativa ou chave mestra criada pelo suporte.

Referência da integração: [saída estruturada do Gemini](https://ai.google.dev/gemini-api/docs/structured-output). O SDK já instalado oferece as opções de saída JSON e cancelamento utilizadas. Configure limites e orçamento na conta do provedor antes de habilitar uso externo.

## Dados, segurança e operação

As tabelas `support_tickets`, `support_messages` e `support_requests` ficam no banco definido por `DB_PATH`, ou no `patio.db` do projeto. O módulo usa conexão própria, transações, controle de versão e identificadores idempotentes. O desligamento normal fecha essa conexão. Uma cópia integral consistente do SQLite inclui essas tabelas; uma exportação apenas do estado operacional não equivale a backup do suporte.

Os clientes só acessam protocolos da combinação oficina + usuário autenticado. A fila global exige usuário humano de plataforma; chaves de API e administradores de oficina não a acessam. Ações humanas registram o identificador do ator. Origem externa é rejeitada nas alterações. A interface apresenta mensagens como texto, sem interpretar HTML do usuário ou da IA.

Há limites por usuário: três protocolos abertos, dez novos protocolos por dia, cem mensagens de cliente por dia e duzentas mensagens por protocolo para novos envios do cliente. O encerramento e o encaminhamento continuam disponíveis. As alterações da API têm limite por minuto. O controle de requisições simultâneas e o limitador em memória são locais ao processo; instalações com múltiplas instâncias precisarão de coordenação compartilhada.

Senhas identificáveis, e-mails, links e sequências numéricas pessoais passam por redução antes da gravação. Isso não garante anonimização: nomes e dados sensíveis em texto livre ainda podem permanecer. O histórico é armazenado no SQLite sem criptografia própria do módulo. Não existe acesso remoto ao computador, leitura de tela, anexos ou execução de comandos pelo agente.

O retorno da IA tem limite de espera; em falha, a orientação local e o encaminhamento permanecem disponíveis. Falhas internas da API registram evento técnico sem o conteúdo da conversa. Ainda não há painel de métricas do suporte, alertas externos, escala de plantão ou SLA contratado.

## Verificação executada

Execute `node --test tests/support_agent.test.cjs`. Os testes criam bancos temporários próprios e não importam o banco principal do produto. Cobrem orientação, seleção restrita do modelo, opt-in, falha e timeout do provedor, redução de dados, isolamento, idempotência, disputa entre atendentes, resposta humana, bloqueios de API e recuperação de histórico a partir de cópia consistente do SQLite.

O teste de recuperação verifica as tabelas de suporte em uma cópia isolada; não certifica o procedimento completo de restauração de produção, os uploads, as credenciais ou os demais módulos.

Para conferir a interface isoladamente: `node scripts/preview-support.cjs`, depois acesse `http://127.0.0.1:3891`. O ambiente usa identidades fictícias, banco temporário e nenhuma IA externa; fica vinculado apenas ao endereço local. Não publique nem importe esse script no servidor. A conferência no navegador percorreu abertura do protocolo, orientação de estoque, encaminhamento, assunção pela equipe, resposta humana e recuperação do histórico após recarregar.

## Integração com as correções em andamento

As alterações existentes de autenticação, cobrança, backup e demais módulos foram preservadas. Os pontos de integração adicionados são a montagem do serviço no servidor, o fechamento da conexão no desligamento e o carregamento do componente na página principal.

Ao alterar autenticação, preserve `req.securityContext` com `tenantId`, `actorId`, `actorType`, `role` e indicação de sessão de suporte, ou adapte o guard deste módulo e execute novamente os testes. Os testes HTTP do suporte usam identidades de teste; a autenticação real e o provisionamento dos operadores precisam ser homologados com o fluxo definitivo do produto. Não habilite acesso público anônimo às rotas do suporte.

Antes de restaurar um banco em produção, pare a aplicação e todas as conexões, inclusive a do suporte. Não substitua o arquivo com conexões abertas. Homologue backup/restore incluindo essas tabelas e as políticas de acesso: um backup físico integral pode conter históricos de todas as oficinas e exige tratamento de plataforma.

## Manutenção com 5S e critérios de liberação

1. **Utilização:** mantenha apenas orientações comprovadas, removendo exemplos obsoletos e funções sem uso.
2. **Organização:** preserve a separação entre conteúdo, agente, persistência, API e interfaces. Cada novo assunto precisa de título, origem e critério de encaminhamento.
3. **Limpeza:** não grave segredos em artigos, testes, logs ou protocolos de demonstração. Use bases temporárias nas verificações.
4. **Padronização:** revise linguagem, estados e referências; atualize a versão da base quando a orientação mudar.
5. **Disciplina:** atribua um responsável à base e revise os assuntos sem solução, sem transformar sugestões do modelo em respostas aprovadas automaticamente.

Para liberar comercialmente, ainda é necessário homologar a autenticação definitiva, cadastrar os operadores responsáveis, testar o modelo real e os limites de custo, estabelecer atendimento e monitoramento e concluir a governança de privacidade. Esta versão não declara conformidade integral com a LGPD. Prazo de retenção, exclusão/anonimização, solicitações dos titulares, base legal, acesso administrativo, contrato com o provedor e eventual transferência internacional precisam de definição e validação específicas. Não há rotina automática de retenção ou exclusão nesta entrega.
