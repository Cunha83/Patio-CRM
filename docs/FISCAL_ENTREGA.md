# Preparação fiscal e homologação — Pátio CRM

Estado desta entrega: **bloqueado para piloto real**. Implementação local disponível; nenhuma autorização fiscal externa foi obtida. Este documento substitui conclusões anteriores de homologação baseadas no adaptador simulado. Não é certificação tributária, de segurança ou de cobertura nacional.

## O que está implementado

- Persistência: conexões SQLite dedicadas para transações, contexto assíncrono, savepoints, confirmação com `synchronous=FULL`, migração fiscal transacional e proteção dos caminhos em testes.
- Interface em Gestão → Notas fiscais: configuração do emitente, preparação avulsa ou a partir de OS, correção de rascunho/rejeição definitiva, revisão, transmissão em homologação, consulta, cancelamento, CC-e, XML, representação auxiliar quando disponibilizada pelo provedor e exportação individual para contabilidade.
- Adaptador Focus com requisições HTTP reais de emissão/consulta/eventos. A simulação foi retirada do caminho normal da aplicação e está em `tests/helpers`. Não existe fallback de erro para autorização fictícia.
- Intenção persistida antes do envio, referência estável, reserva transacional de numeração, histórico de tentativas, revisão com cópia dos parâmetros e dos dados enviados, protocolos e hashes dos arquivos.
- Resultado incerto exige consulta; a repetição do botão não emite novamente. Eventos pendentes bloqueiam novos eventos até reconciliação. Consulta recupera XML de cancelamento e última CC-e disponibilizada.
- Backups consistentes com VACUUM INTO, sem cópia insegura do banco vivo como fallback. Restauração exige checksum de referência e destino novo. Um marcador bloqueia transmissões/eventos após a restauração.
- Permissões fiscais no servidor, isolamento por oficina, proibição de uso pelo suporte com IA e pelas chaves de máquina. Segredos não entram na configuração pública.
- Proteção adicional dos uploads por oficina e caminho; SVG ativo recusado. Backup físico, que contém todas as oficinas, deixou de ser uma operação administrativa de tenant.

A emissão não altera estoque, fechamento da OS, conta a receber ou recebimento. Não há lançamento duplicado de receita como efeito da autorização/cancelamento fiscal.

## Levantamento e cobertura

Consulta local somente de leitura não encontrou tabela de configurações fiscais no banco operacional. Não foram extraídos CNPJ, tokens, certificados ou dados de clientes. Os valores SP/Campinas/Simples anteriormente presentes no código eram padrões presumidos e foram removidos. Não constituem informação confirmada da empresa.

| Documento | Operação | Estabelecimento | Autorizador | Integração | Requisitos | Homologação | Limitações |
|---|---|---|---|---|---|---|---|
| NF-e 55 | Saída normal de peças | Um emitente por oficina; a confirmar | SEFAZ da UF a confirmar | Focus `/v2/nfe` | Cadastro completo, IE, certificado no provedor, token, perfil e histórico de séries revisados | Apenas testes locais; nenhuma nota autorizada externamente | Cobertura inicial restrita aos tratamentos explicitamente aceitos na revisão; sem ST/IPI calculados, débito RTC ou operações especiais |
| NFS-e municipal | Prestação de serviços | Município/IM a confirmar | Prefeitura aplicável | Focus `/v2/nfse` | Confirmação de atendimento ao município, natureza/local de incidência, códigos, ISS/retenção e perfil | Apenas testes locais; nenhuma nota autorizada externamente | Uma tributação homogênea por documento; XML/eventos municipais dependem do formato; não equivale à API nacional |
| NFS-e nacional | Prestação se exigida para o emitente | A confirmar | Emissor nacional | Não implementada nesta entrega | Confirmar adesão, regras atuais, DPS e credenciamento | Bloqueada | Deve receber adaptador/contratos próprios se este for o cenário real |
| NFC-e 65 | Venda a consumidor, se pertinente | UF/operação não informadas | SEFAZ | Não implementada | Confirmar necessidade, CSC e regras locais | Bloqueada | Não foi adicionada indiscriminadamente |

Não há faturamento parcial, múltiplos estabelecimentos dentro da mesma oficina, importação histórica completa, inutilização, contingência, substituição ou devolução homologados. Não são prometidos SPED, apuração/escrituração contábil nem conformidade fiscal nacional. A limitação aparece na interface.

O motor contém cálculos preliminares também fora da cobertura de transmissão. Ter um cálculo ou um teste matemático não habilita sua utilização fiscal. A revisão bloqueia ICMS-ST calculado, IPI, débito RTC e tratamentos não cobertos. CBS/IBS não são inferidos. O suporte à reforma deve ser ampliado para o cenário real após identificação do regime/operação/período.

## Falhas encontradas e correções

| Falha / causa | Correção | Evidência |
|---|---|---|
| Conexão compartilhada permitia participação em transação alheia | Transação em conexão dedicada; operações externas usam outra conexão; fechamento aguarda transações | `transaction_isolation`, `database_safety` |
| Inicializações simultâneas duplicavam ALTER TABLE | Inspeção e aplicação da migração dentro de transação | `database_safety` e servidor real |
| Adaptador real retornava mock quando configuração não estava pronta | Erro explícito; mock apenas em processo de teste e opt-in | `fiscal_hardening` |
| Chave fixa de criptografia | Chave obrigatória fornecida por infraestrutura; falha de abertura não vira segredo vazio | `fiscal_lifecycle_and_events` |
| Classificações e alíquotas presumidas | Remoção de padrões; revisão exige campos expressos e perfil vigente | `fiscal_hardening`, evidência visual |
| Concorrência/idempotência de rascunhos e números | Reserva serializada; chave com oficina; colisão com conteúdo diferente rejeitada; calibração não retrocede | Testes fiscais e carga local |
| Timeout seguido de reemissão | Estado incerto e consulta pela mesma referência antes de qualquer correção/reenvio | `fiscal_hardening` |
| Evento enviado antes de gravar intenção | Evento pendente e trava persistidos antes da rede | `fiscal_hardening` |
| HTTP 200 confundido com autorização | Interpretação de situação; XML, chave correspondente e protocolo NF-e; eventos recuperados em XML | Testes de transporte sintético conforme contrato documentado |
| Backup com fallback inconsistente e checksum facultativo | Falha explícita; VACUUM INTO; checksum obrigatório; destino novo | `wal_backup_and_recovery` |
| Backup físico acessível a administrador de oficina | Restrição à operação de infraestrutura; nenhuma oficina recebe banco compartilhado | Código de proteção no servidor |
| Testes dependiam de dados previamente instalados | Recursos temporários antes dos imports; demonstração gerada no próprio teste | Suíte completa |
| Upload/remover arquivo sem validar oficina e raiz | Validação de tenant, caminho canônico, travessia e links; limite; SVG recusado | Regressão de armazenamento e inspeção |

## Decisão de arquitetura

Foi mantido o provedor Focus que já aparecia no projeto, substituindo seu fallback por transporte real. A escolha é provisória, condicionada à cobertura da UF/município e à contratação/credencial da empresa. Nenhum serviço foi contratado.

Custódia e assinatura: o certificado fica no provedor conforme seu processo de credenciamento. Esta aplicação não assina XML nem distribui certificado ao navegador. Os campos de certificado legados ficam restritos ao servidor, mas não constituem uma implementação de assinatura direta.

Módulos: configuração e custódia; cálculo decimal; numeração; rascunhos/origem; revisão; transporte Focus; transmissão/reconciliação; eventos; API; interface. O suporte com IA permanece separado, sem acesso a emissão/cancelamento.

## Migração e persistência

`initDB()` aplica a versão `2026-09-fiscal-safety-v1` de forma idempotente, registrada em `fiscal_migrations`. Acrescenta cópia da configuração, composição revisada, revisor/data, hashes/XML, operação em andamento, número oficial e PDF auxiliar em `fiscal_documents`, além de `fiscal_attempts`.

Os números existentes e protocolos não são zerados. Não execute downgrade destrutivo. Bancos com segredos criptografados pela antiga chave fixa precisam ter suas credenciais reprovisionadas com a nova custódia; não há migração silenciosa usando a chave insegura. Registros antigos sem evidência de revisão/recuperação recebem indicação de autorização externa não comprovada na interface.

Transações aninhadas sequenciais usam savepoints; aninhamento concorrente no mesmo contexto é recusado. Não aguarde uma escrita independente enquanto mantém a própria transação de escrita aberta: o SQLite só permite um escritor, com timeout de contenção. Operações independentes não são confirmadas antes do commit. Falha ao abrir/iniciar transação não deixa conexão ativa. Operações novas são recusadas durante desligamento.

## Testes e evidências reproduzíveis

Execute `npm test`. O preload cria recursos temporários, desativa integrações e bloqueia `fetch` para fora de loopback. Servidores filhos recebem ambiente de teste e não carregam `.env`. O guard de banco também verifica o arquivo real, aliases e caminhos normalizados. Uploads/backups não usam as pastas operacionais durante a suíte.

- `docs/evidencias/testes-completos.txt`: saída integral da última suíte.
- `docs/evidencias/resiliencia-fiscal.txt`: regressões de isolamento, disco cheio, migração e transporte.
- `docs/evidencias/fiscal-bloqueio-cadastro.png`: rascunho criado pela interface, R$ 251,00, com revisão bloqueada por emitente incompleto.
- `docs/evidencias/dependencias-audit.json`: auditoria inicial de dependências.
- `docs/evidencias/dependencias-correcao.txt`: tentativa de atualização compatível, sem `--force` nem scripts de instalação.

Carga local previamente limitada a 100 transações por onda, concorrências 1/4/10 e máximo de 30s por onda. Primeira medição isolada registrada: 6.782 / 3.389 / 4.537 ms; p95 por operação 166 / 268 / 1.189 ms, respectivamente. São medidas desta máquina e carga de SQLite, não um dimensionamento de empresa média nem teste prolongado de capacidade HTTP. O arquivo de execução contém medições posteriores sob competição com outras suítes.

Foram exercitados rollback externo, leitura não confirmada, processos independentes, reinício, migração concorrente, disco cheio, rateio em 2.000 combinações, repetição, timeout, recuperação por consulta, contrato de evento com protocolo em XML, rejeição do provedor/certificado, bloqueio de produção, SSRF/XML com entidades e acesso cruzado.

Não foram executados carga contra SEFAZ/prefeitura, teste destrutivo em produção, autorização/cancelamento real, teste de mutação abrangente, validação integral de XSD/assinatura XML, ensaio prolongado de capacidade ou emissão oficial com certificado. Os testes de transporte usam respostas sintéticas e estão identificados como tais.

## Pendências que bloqueiam o piloto

1. Responsável da empresa: confirmar CNPJ/estabelecimento, UF, município/IBGE, IE/IM, regime, operações reais e histórico de numeração. Não enviar segredos pelo chat.
2. Responsável fiscal/contador: validar os códigos/tributos e vigência, incidência/retenções, RTC e modelo correto para OS com peças e serviços. Definir se o serviço usa API municipal ou nacional.
3. Infraestrutura/provedor: contratar/confirmar cobertura, custodiar certificado válido, provisionar token de homologação, chave de criptografia e controles de acesso.
4. Desenvolvimento + contador: ampliar contratos municipais/RTC/tributos conforme os dados confirmados; validar esquemas/assinaturas e eventos aplicáveis. Bloqueios técnicos de cobertura permanecem explícitos.
5. Homologador: obter autorização e protocolos reais em homologação, revisar rejeições/eventos e executar recuperação com reconciliação externa. Não existe documento oficial de homologação para anexar nesta entrega.
6. Segurança: cinco alertas altos derivados da cadeia `extract-zip` → Puppeteer → WhatsApp permanecem após atualização compatível. A sugestão automática envolve downgrade incompatível do WhatsApp; não foi aplicada. Avaliar atualização upstream/substituição controlada, sem declarar a cadeia segura. Não extrair arquivos ZIP de usuários por esse caminho.
7. Operação/DPO: definir retenção por obrigação aplicável, permissões de contabilidade, política de backup/cofre, monitoramento e plantão. Testes de exportação/anonimização existentes não constituem conformidade integral com LGPD; a exportação de titular ainda exige consolidação com os novos documentos fiscais.

Parecer: **bloqueado**. Há código operacional e regressões executadas, mas dados fiscais, cobertura específica, segurança pendente e evidência externa impedem declarar “apto para homologação fiscal” do cenário da empresa ou “apto para piloto real controlado”.
