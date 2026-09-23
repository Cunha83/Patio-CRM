# Início do piloto controlado — Pátio CRM

## Decisão e limites

A nova entrega foi inspecionada quanto à unificação das confirmações de voz. Ambos os endpoints reservam o token, tratam aborto/falha e só confirmam seu consumo depois da gravação. Os hashes de servidor, módulo de tokens e motor de voz correspondem ao walkthrough recebido.

Reexecução independente da suíte completa: **529 testes, 528 aprovados, zero falhas/cancelados, 1 ignorado, saída 0, duração 70,10 s**. Inclui recuperação da confirmação após falha de escrita, rejeição de repetição, concorrência e isolamento. Comando: `node --require ./scripts/test-preload.cjs --test --test-concurrency=2 --test-timeout=120000 tests/*.test.cjs`. Evidência: `docs/evidencias/inicio-piloto-2026-09-21/suite-validacao.txt`.

O próximo trabalho é preparar e operar o piloto, preservando o núcleo estabilizado. A aprovação técnica da suíte não comprova backup agendado, segurança da rede, supervisão do processo ou restauração no ambiente real. Esses itens permanecem como critérios operacionais de entrada, não como novos pedidos de refatoração.

O endpoint local `/health` respondeu HTTP 200 durante esta revisão. Isso não comprova que o processo iniciou após o último deploy nem que está configurado para reiniciar automaticamente. O log agent-browser indicado no walkthrough foi consultado e registra conclusão; o navegador não foi reexecutado nesta revisão.

## Escopo inicial proposto

- Uma oficina, um processo Node e três usuários individuais: gestor, atendimento e mecânico. Acrescentar financeiro somente quando necessário, com perfil próprio.
- Cinco dias úteis de observação; horizonte proposto, não calendário já aprovado.
- Núcleo: cliente/veículo → entrada/OS → box → peças/apontamentos → encerramento e conferência. Voz pode ser exercitada por usuários treinados, incluindo confirmações explícitas.
- Fiscal de produção e cobrança automática fora do escopo. Financeiro, quando utilizado, é gerencial; emissão oficial permanece no processo/ERP adotado pela oficina.
- Iniciar com WhatsApp desativado no ambiente de piloto até decisão específica sobre integração e dependências. Não confundir bloqueio de mutações com eliminação das vulnerabilidades da cadeia instalada.
- Não ampliar módulos nem alterar a arquitetura durante a primeira rodada, salvo correção de incidente comprovado.

## Antes da primeira OS real

| Item | Evidência necessária | Situação nesta revisão |
|---|---|---|
| Versão reproduzível | Commit/release ou manifesto do conteúdo com lockfile; preservar alterações locais e excluir segredos/dados | Preparar |
| Backup inicial | Snapshot consistente SQLite WAL e anexos, validado; cópia protegida fora do host | Não verificado no ambiente operacional |
| Recuperação | Restaurar cópia em diretório isolado e conferir usuários, OS e anexos | Testes automatizados não substituem ensaio operacional |
| Rotina de backup | Execução periódica, horário do último sucesso e alerta de falha; meta inicial de intervalo de 1 hora | Agendamento externo não comprovado |
| Acesso | Contas individuais, menor privilégio e HTTPS/acesso restrito quando usado pela rede | Validar na instalação |
| Serviço | Um processo supervisionado, reinício e logs; diretórios DB_PATH/UPLOAD_DIR/BACKUP_DIR fixos | `/health` disponível; supervisão não comprovada |
| Dados | Cadastros reais separados de exemplos e ensaios; nenhum seed/purge sobre base operacional | Manter separação |

Não usar cópia simples de `patio.db` em execução como substituto de backup WAL consistente. Usar o serviço existente. A rota de backup físico atual é `POST /api/backup/wal`, restrita à infraestrutura; não conceder privilégios globais ao gestor da oficina para executar backups.

## Roteiro de uso e 5S

1. **Preparação:** completar os itens de entrada, identificar responsável operacional e suplente, registrar versão e horário do início. Manter o processo anterior disponível para contingência.
2. **Primeiro dia:** acompanhar um conjunto pequeno de OS reais. Conferir cada abertura, alteração de box, peça, apontamento e encerramento. Evitar exclusão de OS reais apenas para testar voz; usar homologação isolada para ações destrutivas.
3. **Dias seguintes:** aumentar gradualmente o uso com atendimento e mecânico simultâneos. Registrar conflitos e falhas de salvamento; orientar a preservar rascunhos, sem insistir cegamente em comandos duplicados.
4. **Fechamento diário:** comparar OS abertas/encerradas, movimentos de estoque e totais gerenciais com os registros de trabalho; verificar último backup e anotar erros com horário e identificador da operação, sem segredos ou dados pessoais desnecessários.
5. **Avaliação final:** ampliar usuários somente após consistência comprovada, recuperação ensaiada e ausência de incidentes bloqueantes. Baixa amostragem deve ser registrada como limitação.

5S aplicado: manter somente funções do escopo visíveis/ativas; organizar cadastro e nomes; separar dados de teste; usar o mesmo roteiro e registro de incidentes; cumprir a conferência diária. Não apagar arquivos ou dados existentes como forma de “limpeza”.

## Critérios para interromper e recuperar

- Interromper gravações no canal afetado diante de sucesso sem persistência, perda/duplicação de dados ou acesso entre perfis/oficinas indevido.
- Preservar logs e o estado atual; não restaurar backup automaticamente por qualquer erro, pois isso elimina alterações legítimas posteriores ao snapshot.
- Fazer backup de preservação antes de migração ou recuperação, quando tecnicamente possível. Diagnosticar e reconciliar operações antes de trocar o banco.
- Descrever rollback de código separadamente da restauração de dados. Reiniciar o processo não equivale a recuperar dados.

## Prompt para o Antigravity — implantação e início do piloto

Leia `docs/INICIO_PILOTO_CONTROLADO_2026-09-21.md`. O foco agora é preparar o piloto operacional; preserve as correções de persistência e confirmação de voz, sem novas funcionalidades ou refatoração ampla.

1. Congele uma versão reproduzível da árvore atual com manifesto ou release. Preserve arquivos locais e alterações do usuário; nunca inclua `.env`, bancos, backups, uploads ou credenciais em commits/artefatos públicos.
2. Prepare um perfil de piloto de uma oficina e um processo Node. Documente caminhos, portas, perfis de usuário e funções habilitadas. Mantenha WhatsApp e fiscal de produção fora do escopo inicial; não ative integrações externas automaticamente.
3. Prepare e teste, em diretórios isolados, o procedimento de backup WAL com anexos, validação e restauração. Forneça comando/script operacional revisável e configuração do agendamento. Não afirme que está implantado antes de verificar execução real, cópia fora do host e alerta de falha. Se faltar destino externo ou identidade de serviço, conclua os artefatos e peça somente essa informação.
4. Prepare a execução supervisionada no Windows com um único processo e logs. Detecte processo já ativo para evitar duplicidade. Documente HTTPS/acesso restrito para uso em rede; não exponha a porta publicamente.
5. Alinhe o comando oficial de testes com a concorrência 2 usada na homologação, preservando o preload e a saída do runner. Atualize o guia operacional com os comandos e rotas realmente existentes. Evite múltiplos pareceres contraditórios: mantenha histórico e um documento de situação atual.
6. Entregue checklist de início, instruções curtas para gestor/atendimento/mecânico, registro de incidentes e rotina de fechamento diário. Classifique cada critério operacional como comprovado ou pendente, com evidência.
7. Não execute seed, purge, restauração ou migração na base real para demonstrar testes. Não interrompa o processo operacional para ensaios. Caso uma ativação exija janela, destino ou credencial ainda não definidos, informe exatamente o que falta após preparar o restante.

Critério de entrega: pacote de piloto executável e revisável, escopo explícito, dados preservados, backup/recuperação documentados e pendências operacionais honestas. Não reabrir o ciclo de desenvolvimento sem um defeito novo reproduzível.
