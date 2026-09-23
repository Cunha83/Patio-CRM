# Backlog Técnico Priorizado — Pátio CRM

Itens organizados por criticidade de segurança, estabilidade e requisitos de evolução operacional.

---

## 1. Backlog Técnico Priorizado

### [BK-01] Atualização da Integração de Mensageria e Desacoplamento do Puppeteer
- **Prioridade:** Alta (Segurança de Cadeia de Suprimentos — Risco em Aberto)
- **Descrição:** Substituir o uso de `whatsapp-web.js` (que arrasta dependência vulnerável de `extract-zip` / `puppeteer`) pela API Oficial do WhatsApp Cloud (Meta Business API) para eliminação dos cinco alertas altos no `npm audit`. Enquanto não houver migração ou aceitação explícita do risco pela governança, o risco permanece registrado como em aberto.
- **Critérios de Aceite:**
  1. `npm audit` executado com zero vulnerabilidades de severidade alta ou crítica.
  2. Fluxo de envio de notificações de OS e recebimento de mensagens de motoristas operando via Webhook oficial.
  3. Descontinuação completa do binário do Chromium no servidor.

### [BK-02] Template Tags com Escapamento Automático no Frontend (Anti-XSS Defense-in-Depth)
- **Prioridade:** Média (Segurança do Cliente)
- **Descrição:** Padronizar um helper universal de template tag (ex: `html`...``) em todos os módulos de visualização que codifique automaticamente entidades HTML em interpolações dinâmicas, reduzindo a dependência do uso manual da função `esc()`.
- **Critérios de Aceite:**
  1. Todas as interpolações de variáveis de usuário (`c.*`, `v.*`, `o.*`) protegidas nativamente na geração de strings HTML.
  2. Nenhuma regressão na renderização de tabelas, botões e badges.

### [BK-03] Decomposição Modular do `server.js` Monolítico
- **Prioridade:** Média (Melhoria Opcional de Manutenção Interna)
- **Nota de Governança:** A decomposição modular é uma evolução técnica interna de manutenibilidade; **não substitui nem condiciona os critérios de segurança e operação para lançamento do sistema**.
- **Descrição:** Fatiar as 7.831 linhas de `server.js` em roteadores Express dedicados (`routes/os.js`, `routes/backup.js`, `routes/whatsapp.js`, `routes/lgpd.js`), preservando estritamente os contratos HTTP e a esteira de testes.
- **Critérios de Aceite:**
  1. Cada arquivo de rota focado em um domínio funcional com isolamento de dependências.
  2. Ausência de quebra de compatibilidade em nenhum endpoint público ou privado.
  3. Suíte completa de testes automatizados aprovada integralmente.

### [BK-04] Homologação Fiscal e Desbloqueio para Produção Real
- **Prioridade:** Externa (Bloqueante para Emissão Fiscal Real)
- **Descrição:** Atendimento às pendências externas e aceitação das limitações técnicas do código fiscal descritas em `docs/FISCAL_ENTREGA.md`:
- **Critérios de Aceite:**
  1. Confirmação de dados cadastrais da empresa (CNPJ, IE, IM, CNAE, endereço e enquadramento tributário).
  2. Certificado Digital A1 emitido e custodiado no provedor Focus NFe.
  3. Token de produção da Focus NFe provisionado no servidor via `FISCAL_ENCRYPTION_KEY`.
  4. Validação pelo contador responsável dos tratamentos tributários suportados e aceitação expressa das limitações técnicas vigentes (ausência de NFC-e 65, NFS-e nacional, ICMS-ST, IPI, inutilização e contingência offline).
  5. Emissão comprovada de NF-e 55 e NFS-e autorizadas pela SEFAZ do estado e prefeitura do município do emitente.
