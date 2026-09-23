# Instalador local do piloto — três empresas

O mesmo ZIP deve ser entregue às três empresas. Cada instalação gera uma identidade aleatória, três senhas exclusivas e um banco SQLite novo. **Não distribuir a pasta instalada**, que passa a conter credenciais e dados.

## Uso

1. Em Windows 10/11 x64, extrair o ZIP inteiro em uma pasta local.
2. Executar `Instalar.cmd` e informar o nome da empresa.
3. Abrir o atalho criado na Área de Trabalho ou `Iniciar.cmd` na pasta instalada.
4. Consultar `ACESSOS.txt` na pasta instalada. Entregar somente a credencial correspondente a cada operador: gestor, atendente ou mecânico. Armazenar as senhas em local seguro e remover o arquivo depois.
5. Manter a janela do programa aberta; usar Ctrl+C para encerrar. Após reiniciar o Windows, abrir novamente o atalho.

O destino padrão é `%LOCALAPPDATA%\PatioCRM\piloto_<identificador aleatório>`. A pasta recebe permissões para o usuário instalador, Administradores e SYSTEM. Não exige instalação global de Node, npm ou privilégios administrativos. Node e dependências de produção estão incluídos; a instalação não baixa arquivos.

## Escopo operacional

- Uma instalação local por computador de teste. As empresas não compartilham banco, anexos, credenciais nem configuração. Bases não sincronizam.
- O servidor escuta somente `127.0.0.1`. O instalador escolhe uma porta livre entre 3000 e 3099, sem alterar firewall ou publicar serviços na rede.
- Para múltiplos computadores na mesma oficina será necessária uma implantação de servidor de rede específica. Instalar uma cópia em cada computador cria bases separadas.
- Integrações WhatsApp e agendadores estão desativados; não são fornecidas chaves de IA, cobrança ou emissão fiscal. O aplicativo conserva recursos existentes que dependem da internet, incluindo o Chart.js carregado via CDN.
- Uso autorizado pelo parecer anterior: testes funcionais com dados fictícios. Backup independente e restauração continuam pendentes para operação oficial.
- O supervisor reinicia o servidor em caso de falha enquanto a janela estiver aberta. Não é serviço Windows nem inicialização automática após reboot.

## Proteção e manutenção

O instalador verifica o inventário e os hashes de todos os arquivos antes de copiar. Recusa destino já existente, porta ocupada e nomes de empresa contendo caracteres de controle. Não apaga instalações nem atualiza bancos existentes. Uma falha preserva a pasta parcial para diagnóstico.

Dados locais: `app/patio.db`, `app/uploads`, `app/backups`; configuração privada: `app/.env`; logs: `app/logs`. Não enviar esses arquivos junto com o pacote de instalação.

O ZIP e os scripts não têm assinatura Authenticode. O arquivo `.zip.sha256` e `SHA256SUMS.json` permitem conferir integridade, sem equivaler a assinatura digital do publicador.

Para remover uma instalação, encerrar o programa e preservar dados necessários antes de remover a pasta correspondente e seu atalho. Não foi incluído desinstalador automático, para evitar perda de dados. Uma atualização futura deve preservar banco, anexos e configuração.

## Construção e verificação técnica

- `scripts/build_windows_pilot.cjs`: seleciona fontes de runtime cujos hashes conferem com o manifesto existente; exclui scripts internos de implantação, bancos, uploads e `.env`; instala dependências com `npm ci --omit=dev`; inclui o Node 24 x64 usado no build e sua licença; gera ZIP e SHA-256.
- `installer/windows/`: configuração, instalador, inicializador e instruções. Não modifica módulos funcionais do CRM.
- `tests/windows_distribution.test.cjs`: ensaio em diretórios temporários com instalação real e inicialização dos executáveis distribuídos, sem `NODE_PATH` nem dependências emprestadas do projeto.

Reprodução do build: `node scripts/build_windows_pilot.cjs <pasta-nova>` em Windows x64 com Node 24 e internet. O build precisa de internet; a instalação entregue não.

As dependências permanecem nas versões do lockfile auditado. Os alertas de dependências opcionais registrados na auditoria anterior não foram resolvidos por este empacotamento; não há alegação de certificação geral de segurança ou homologação em versões do Windows ainda não ensaiadas.

## Evidências desta entrega

- Pacote: `dist/PatioCRM-Piloto-1.0.0-win-x64.zip`, aproximadamente 79,2 MiB, com 9.691 arquivos inventariados e Node v24.19.0 x64.
- SHA-256: `1e4f943f31f21b91fda6d387a6a989b7627b4add5fbb485599e412498ac4dce7`.
- Ensaio **a partir do ZIP final extraído**: 7 aprovações, zero falhas, zero ignorados. Três instalações isoladas nesta máquina Windows, nove acessos autenticados, bancos vazios na primeira execução, isolamento de tenant e senha, gravação autorizada, rejeição de alteração pelo mecânico e persistência após encerramento real e reinício. A liberação da porta foi conferida antes de reiniciar.
- Regressões de segurança, manifesto e supervisor: 14 aprovações, zero falhas, zero ignorados. As cinco correções anteriores permanecem protegidas pelos testes.
- O ponto de entrada `Instalar.cmd` foi executado com entrada inválida: carregou o Node incluído e recusou o nome antes de criar dados.
- Varredura dos 101 arquivos de runtime não encontrou credenciais locais ativas; valores padrão já rejeitados pelo próprio código foram desconsiderados nessa comparação. Bancos, `.env`, anexos e credenciais geradas não estão no pacote.
- Atalhos na Área de Trabalho não foram criados durante o ensaio automatizado, para não modificar o desktop da máquina de auditoria. A criação do atalho tem fallback explícito para `Iniciar.cmd`.
- Não houve alteração em módulos funcionais do CRM nem na instalação `deploy-piloto`. O `/ready` da instalação atual permaneceu HTTP 200 ao final.

Evidências: `docs/evidencias/instalador-windows-2026-09-23/distribuicao-final.txt`, `regressao-seguranca-supervisor.txt` e `resumo.json`.

**Parecer:** pacote pronto para distribuição do piloto funcional local. Os ensaios representam três instalações na máquina de auditoria; a compatibilidade e os fluxos devem ser confirmados nas três máquinas das empresas. As restrições de dados fictícios e backup/restauração pendentes continuam vigentes.
