# Matriz de Achados, Riscos e Bloqueios — Pátio CRM

Data de consolidação: 2026-09-16  
Responsável técnico: Engenheiro de Software Sênior (Arquitetura, Segurança, Qualidade e Operações)

---

## 1. Defeitos Confirmados e Correções Aplicadas

| ID | Módulo | Severidade | Cenário de Reprodução / Causa-Raiz | Correção Aplicada | Teste Automatizado | Situação |
|---|---|---|---|---|---|---|
| **P0-1** | `server.js` (`POST /api/estado`) | **Crítica** | Requisição sem `securityContext` assumia privilégios totais de admin (`permissions: ['*']`). | Removido fallback permissivo; requisição sem autenticação recebe HTTP 401 explícito. | `tests/http.test.cjs` | **Corrigido e Verificado** |
| **P0-2** | `stateRepository.js` (`auditoria`) | **Crítica** | Volume de auditoria excedente (>1000) sofria corte na memória antes de gravação persistente. | Itens excedentes são arquivados transacionalmente em `security_audit_log` antes do corte. | `tests/adversarial_audit_regressions.test.cjs` | **Corrigido e Verificado** |
| **P0-3** | `server.js` (`/api/backup/restaurar`) | **Crítica** | Path traversal em `backupFilepath` aceitava caminhos fora do diretório autorizado; validação original recebia 403 antes de validar caminho. | Validação canônica por `fs.realpathSync` contra `BACKUP_DIR`, bloqueando symlinks, junctions, caminhos absolutos e prefixos similares. Casos de symlink e junction estritamente separados; teste de arquivo através da junction executado e caso de symlink reportado como não executado quando restrito por permissão do SO. | `tests/backup_security_controls.test.cjs` | **Corrigido e Verificado** |
| **P1-1** | `logSanitizer.js` (`logSecurityEvent`) | **Alta** | Falhas de inserção de auditoria SQLite engolidas por `.catch(() => {})`. | Substituído por log explícito `[AUDIT_LOG_FAILURE]` com identificação da ação auditada. | Inspeção de código | **Corrigido e Verificado** |
| **P1-2** | `services/lgpdService.js` | **Alta** | Exportação de titular continha catch vazio, ignorava falhas de banco, não validava `origem_tipo` e parseava destinatário sem checar CPF/CNPJ normalizado; convertia totais corrompidos para zeros falsos. | Refatoração completa: consulta por tenant, parse estruturado de CPF/CNPJ, validação combinada de `origem_tipo === 'os'`, campos exportáveis restritos, totais corrompidos/inválidos representados como `null` com `incompleto: true` (sem zeros falsos), advertência explícita e rota HTTP validada no banco isolado. | `tests/lgpd_fiscal_export_hardening.test.cjs` | **Corrigido e Verificado** |
| **P1-3** | `lib/core.js` (`createAuth`) | **Alta** | Fallback de `AUTH_PASSWORD` com padrão `'patio'` em configurações incompletas. | Removido padrão fraco; exige credencial válida ou rejeição estrita por entropia. | `tests/core.test.cjs` | **Corrigido e Verificado** |
| **P1-4** | `docs/OPERACAO_E_SUPORTE.md` | **Alta** | Documentação declarava `PRAGMA synchronous = NORMAL`, divergindo do código `FULL`. | Atualizado manual operacional para refletir `PRAGMA synchronous = FULL` (durabilidade estrita). | `docs/OPERACAO_E_SUPORTE.md` | **Corrigido e Verificado** |
| **P1-5** | `server.js` (`GET /health`) | **Alta** | Resposta fixa `version: '2.1.0'` divergente da versão real do `package.json` (`1.0.0`). | Endpoint ajustado para ler dinamicamente `package.json.version`. | `tests/http.test.cjs` | **Corrigido e Verificado** |
| **P2-1** | `js/patio.js` (`imprimirOS`) | **Média** | Interpolação direta de campos de texto e ausência de sanitização de protocolo na URL do logo da empresa. | Aplicado `esc()` em `o.num` e `cfg.empresa`, e validação estrita de esquema (`https?://` ou `data:image/`) no logo. | Inspeção de código | **Corrigido e Verificado** |

---

## 2. Riscos Residuais e Situação de Segurança

| ID | Componente | Descrição do Risco | Mitigações Ativas | Situação Atual e Ação Necessária |
|---|---|---|---|---|
| **RS-01** | `whatsapp-web.js` / `extract-zip` / `puppeteer` | Cinco alertas altos de vulnerabilidade em biblioteca de terceiros (`GHSA-jmr9-qjv8-65gv`, `GHSA-7pqw-9j4j-h8q3`). | O sistema não descompacta arquivos zip de usuários; uploads são restritos a imagens com hash SHA-256 e validação de extensão/MIME. | **RISCO EM ABERTO.** Permanece registrado como risco de dependência até atualização upstream ou aceitação explícita de risco pelo responsável de segurança/produto. Migração futura recomendada para API oficial Meta Cloud. |
| **RS-02** | `server.js` Monolítico (7.831 linhas) | Concentração de rotas em arquivo único. | Protegido por suíte automatizada de testes cobrindo todas as rotas e regras de negócio. | **MELHORIA DE MANUTENÇÃO.** A decomposição modular é uma evolução técnica interna; não substitui nem condiciona os critérios de segurança e operação para lançamento do sistema. |

---

## 3. Bloqueios Externos e Limitações Técnicas Fiscais

Conforme detalhado no documento `docs/FISCAL_ENTREGA.md`, a operação fiscal real está **bloqueada** devido a pendências externas e restrições técnicas estruturais:

### 3.1 Limitações Técnicas do Código Fiscal (Existentes no Sistema)
- **LT-01 (Modelos Não Implementados):** NFC-e (modelo 65) e NFS-e nacional não foram implementadas e estão bloqueadas. Apenas NF-e (modelo 55) para peças e NFS-e municipal em lote único possuem adaptador.
- **LT-02 (Cálculos Tributários Restritos):** Motor de cálculo não calcula ICMS-ST, IPI, débito RTC nem tributos da reforma (CBS/IBS); tratamentos fora do regime simples/padrão homologado são rejeitados na revisão.
- **LT-03 (Procedimentos Não Suportados):** Não há implementação para inutilização de faixas de numeração nem emissão em contingência offline (SCAN/DPEC/EPEC).
- **LT-04 (Operações Especiais Ausentes):** Sem suporte a faturamento parcial de OS, múltiplos estabelecimentos por tenant, devoluções, trocas ou substituições fiscais.
- **LT-05 (Validação Restrita ao Mock Sintético):** Nenhuma nota foi enviada, autorizada ou cancelada em ambiente real de SEFAZ ou prefeitura; toda a validação de transporte foi realizada via testes sintéticos com dados simulados.

### 3.2 Bloqueios Externos (Credenciais e Homologação)
- **BL-01 (Dados do Estabelecimento):** Falta de CNPJ, Inscrição Estadual, Inscrição Municipal, CNAE oficial e Certificado Digital A1 emitido e custodiado.
- **BL-02 (Contratação de Provedor):** Necessidade de contratação de plano de produção e emissão de token junto à Focus NFe.
- **BL-03 (Validação Contábil):** Homologação formal das matrizes de alíquotas e natureza de operação pelo contador responsável pela oficina.
