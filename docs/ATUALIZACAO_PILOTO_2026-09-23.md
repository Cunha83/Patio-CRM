# Atualização do piloto — 23/09/2026

As cinco correções descritas em `CORRECOES_AUDITORIA_2026-09-22.md` foram publicadas em `deploy-piloto`. A observação anterior de que a instância ativa ainda não havia recebido a versão corrigida está superada por esta atualização.

## Preservação e publicação

- Porta 3000 sem serviço antes da atualização; PID da trava anterior inexistente.
- Conferidos os hashes dos 128 arquivos de origem. Atualizados somente os cinco arquivos divergentes: `server.js`, `lib/auth/context.js`, `lib/repository/stateRepository.js`, `scripts/executar_backup_operacional.cjs` e `scripts/servico_backup_remoto.cjs`.
- Manifestos copiados para o deploy. Conferência posterior: 128 arquivos, nenhuma divergência.
- Criado snapshot SQLite com `VACUUM INTO` por conexão de leitura, acompanhado dos anexos e dos cinco arquivos antigos, antes da publicação.
- Diretório local de reversão: `deploy-piloto/backups/release-2026-09-23T10-50-12-639Z`. Isso é proteção local da atualização, não substitui backup independente.
- Banco e `.env` com hashes inalterados durante a cópia dos arquivos. Credenciais não foram alteradas nem registradas neste documento.
- Nenhum comando de seed ou instalador destrutivo foi executado.

## Serviço e verificações

Supervisor iniciado em janela oculta no diretório do deploy, PID 17184, em 23/09/2026 às 10:50:32 UTC. A trava antiga foi recuperada pelo próprio supervisor.

Verificação em 23/09/2026 às 10:51 UTC:

- `/health`: HTTP 200, `status: ok`.
- `/ready`: HTTP 200, `status: ready`, banco/storage `ok`, fila pendente 0.
- WhatsApp, IA e scheduler interno desativados; fiscal `homologacao_only`; billing `unconfigured_warning`.
- Gestor, atendente e mecânico: HTTP 200 em leitura autenticada do estado, cada qual com o papel esperado. Nenhuma escrita de teste foi feita na base operacional.

Os testes de regressão da versão publicados no relatório anterior permanecem válidos: 576 aprovações, zero falhas e um teste ignorado. Nesta etapa não houve nova alteração de código; foram realizadas as verificações de publicação e inicialização acima.

## Pendência operacional

A unidade D: permanece ausente. O sistema corrigido está disponível em `http://localhost:3000/?tenant=oficina_piloto_01`, mas a liberação para dados reais continua condicionada ao backup em armazenamento independente e ao ensaio de restauração desse destino.

O supervisor foi iniciado como processo em segundo plano. Esta atualização não instalou um serviço Windows nem comprova inicialização automática após reinício do computador.
