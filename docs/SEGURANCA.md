# Matriz de Segurança da Aplicação (OWASP ASVS 4.0.3 — Nível 2 / NIST SSDF)

Data da avaliação: 2026-09-16  
Escopo: Pátio CRM (Express 5.2.1, SQLite 3 WAL, Módulos de Identidade, Backup, LGPD e Integrações)

---

## 1. Requisitos Específicos Avaliados (OWASP ASVS v4.0.3 Nível 2)

| ID Requisito ASVS | Descrição Específica do Requisito | Implementação e Defesas Ativas no Pátio CRM | Evidência / Teste Automatizado | Situação |
|---|---|---|---|---|
| **V1.4.1** | O controle de acesso deve impor o princípio do menor privilégio e isolamento de funções administrativas de plataforma vs inquilino. | Segregação estrita: rotas `/api/backup/wal`, `/api/backup/restaurar` e `/api/platform/*` exigem `actorType === 'user'`, `tenantId === '_platform_'` e privilégio `backup:global`. Usuários de oficina (`tenant_admin`) não acessam dados de terceiros ou plataforma. | `tests/backup_security_controls.test.cjs`, `tests/adversarial_audit_regressions.test.cjs` (Teste H) | **Avaliado e Conforme** |
| **V2.1.1** | Senhas enviadas pelo usuário devem ser verificadas contra comprimento mínimo e listas de credenciais inseguras conhecidas. | Validação estrita por entropia via `userRepository.validatePasswordPolicy`: mínimo de 12 caracteres em produção, checagem contra `INSECURE_PASSWORDS`. Rejeição em runtime de credenciais fracas. | `tests/multi_tenant_security.test.cjs` (Teste 1), `lib/auth/userRepository.js` | **Avaliado e Conforme** |
| **V2.4.1** | Mecanismo de controle contra ataques de força bruta com bloqueio temporal de conta. | Bloqueio de conta por 15 minutos após 5 tentativas consecutivas incorretas via `IdentityRegistry` com persistência em banco SQLite (`locked_until`). | `tests/auth_lockout_audit_and_rbac_preservation.test.cjs`, `tests/adversarial_audit_regressions.test.cjs` (Teste B) | **Avaliado e Conforme** |
| **V2.7.2** | Armazenamento seguro de senhas utilizando funções de derivação de chave com salt individualizado. | Criptografia via `crypto.scryptSync` nativo do Node.js, com salt aleatório de 16 bytes e derivação de chave de 64 bytes com parâmetros `N=16384, r=8, p=1`. | `lib/auth/userRepository.js` | **Avaliado e Conforme** |
| **V3.4.1** | Tokens de redefinição de senha devem ser criptograficamente aleatórios, ter expiração curta e uso único estritamente atômico. | Geração com `crypto.randomBytes(32)` com hash SHA-256 persistido na tabela `password_resets`. Consumo atômico sob concorrência (`consumirTokenAcao` com transação SQLite). | `tests/adversarial_audit_regressions.test.cjs` (Teste K) | **Avaliado e Conforme** |
| **V4.1.1** | Todas as solicitações de usuários devem ser associadas e validadas contra o identificador do inquilino (Multi-Tenant Isolation). | Validação obrigatória de `x-tenant-id` comparado com o membership do usuário autenticado (`createAuthMiddleware`). Tentativas cross-tenant rejeitadas com HTTP 403. | `tests/multi_tenant_security.test.cjs` (Teste 2 e 4), `tests/http.test.cjs` | **Avaliado e Conforme** |
| **V4.2.1** | Verificação de permissões deve ocorrer em todas as operações com base no princípio de negação por padrão. | Rotas protegidas por `requirePermission`. `POST /api/estado` rejeita requisições sem contexto com HTTP 401. | `tests/http.test.cjs` | **Avaliado e Conforme** |
| **V5.1.1** | Todas as entradas de dados de usuários devem ser validadas e estruturadas quanto ao tipo e comprimento. | Validação centralizada via `validateState` em `lib/core.js` e sanitização de strings via `sanitizeStr` em `js/state.js`. | `tests/core.test.cjs` | **Avaliado e Conforme** |
| **V5.3.4** | Consultas a banco de dados devem utilizar exclusivamente interfaces parametrizadas para prevenir SQL Injection. | Todas as operações de banco via `db.js` (`run`, `get`, `all`) utilizam prepared statements com arrays de parâmetros obrigatórios. Ausência de concatenação de strings em cláusulas SQL. | `db.js`, `tests/database_safety.test.cjs` | **Avaliado e Conforme** |
| **V5.5.1** | O sistema não deve ser vulnerável a ataques de Path Traversal na manipulação de arquivos e backups. | Validação canônica por `fs.realpathSync` contra `BACKUP_DIR` em `server.js` (`/api/backup/restaurar`), bloqueando symlinks, junctions e caminhos relativos/absolutos que escapem da raiz. | `tests/backup_security_controls.test.cjs` | **Avaliado e Conforme** |
| **V7.1.1** | Registros de log não devem conter senhas, chaves de API, tokens de sessão ou segredos em texto claro. | Middleware de sanitização `sanitizeObject` em `lib/security/logSanitizer.js` mascara recursivamente chaves sensíveis com `***REDACTED***`. | `lib/security/logSanitizer.js` | **Avaliado e Conforme** |
| **V8.2.1** | Segredos de autenticação externa e credenciais fiscais devem ser armazenados criptografados em repouso. | Criptografia AES-256-GCM dos tokens e parâmetros tributários via `FISCAL_ENCRYPTION_KEY` em `services/fiscal/fiscalConfigService.js`. | `services/fiscal/fiscalConfigService.js`, `tests/fiscal_lifecycle_and_events.test.cjs` | **Avaliado e Conforme** |
| **V12.1.1** | Upload de arquivos deve restringir tipos MIME, bloquear executáveis e isolar o armazenamento por inquilino. | `lib/file-storage.js`: upload em subpastas isoladas por tenant, renomeação por hash SHA-256 do conteúdo, rejeição de SVG para prevenir stored XSS e checagem de tamanho máximo (20MB). | `tests/workshop_day.test.cjs` (Teste 7), `lib/file-storage.js` | **Avaliado e Conforme** |
| **V13.2.1** | Mecanismos de proteção contra ataques de falsificação de requisições entre sites (CSRF). | Validação estrita de cabeçalhos de metadados de requisição `sec-fetch-site` (rejeita cross-site em métodos POST/PUT/DELETE) e conferência de cabeçalho `origin` contra `host`. | `lib/auth/context.js` (L99-132), `tests/core.test.cjs` | **Avaliado e Conforme** |

---

## 2. Requisitos Declarados como Não Avaliados / Fora do Escopo Atual

- **ASVS V9 (Comunicações Criptografadas em Trânsito - TLS/HTTPS):** O encerramento TLS é delegado ao proxy reverso de infraestrutura (ex: Nginx / Caddy / Cloudflare); não é gerenciado diretamente no processo Node.js Express.
- **ASVS V10 (Controles de Execução de Código Malicioso em Runtime):** Análise dinâmica em tempo de execução via WAF corporativo e sandboxing de SO fora do escopo da aplicação pura.
- **ASVS V14.4 (Content Security Policy Avançado com Nonces Dinâmicos):** Implementado Helmet com cabeçalhos padrão; CSP estrito com nonces em cada renderização SPA necessita de migração em ciclo futuro (BK-03).
