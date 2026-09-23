# Plano de Implementação: Resolução de Bloqueios Técnicos para Homologação Funcional Isolada

**Data:** 17 de Setembro de 2026  
**Objetivo:** Concluir os bloqueios técnicos confirmados no Pátio CRM (consulta fictícia de clientes, proteção financeira estrita para mecânico, validação real de interface via `agent-browser`, sanitização de segredos e retificação do parecer fiscal/RTO), preservando os avanços anteriores sem declarar prontidão comercial ou fiscal prematura.

---

## 1. Mapeamento de Arquivos e Responsabilidades

| Arquivo | Ação | Responsabilidade Principal |
| :--- | :---: | :--- |
| `services/consultaClienteService.js` | **NOVO** | Serviço canônico de consulta cadastral externa (Sintegra/Serasa) com tratamento de indisponibilidade segura, segregação de ambiente, detecção de dados locais e adaptadores de teste opt-in. |
| `server.js` | **MODIFICAR** | Integrar `consultaClienteService`, remover fórmulas de semente fictícia, proteger `/api/financeiro/dashboard` e `/api/whatsapp/relatorio-preview` com `financial:read`, projetar resposta de `POST /api/estado`. |
| `lib/repository/stateRepository.js` | **MODIFICAR** | Expandir `filterStateByRole` para ocultar `servicos[].valor/custo`, `quotations[]`, peças em catálogo e insumos; reforçar `persistState` contra payloads adversariais com casamento estrito por ID e rejeição de cifras injetadas. |
| `js/cadastros.js` | **MODIFICAR** | Tratar indisponibilidade da consulta externa com mensagem clara, manter campos desbloqueados para digitação manual e eliminar qualquer geração fictícia no cliente. |
| `tests/consulta_cliente_api.test.cjs` | **MODIFICAR** | Regressões para ausência de provedor (503/indisponível seguro), permissão de cadastro manual, falha/timeout, consulta de cliente local e adaptador simulado estritamente em teste. |
| `tests/rbac_mechanic_financial_projection.test.cjs` | **MODIFICAR** | Testes para projeção de `servicos[].valor/custo`, `quotations`, endpoints HTTP de peças/dashboard e imunidade a injeção adversarial em itens novos/sem ID. |
| `scripts/run_agent_browser_verified.cjs` | **MODIFICAR** | Jornadas E2E operando via interações DOM reais (cliques, digitação em inputs `data-c`, seletores) sem atalhos diretos ao estado `S`, com asserções de elementos e sanitização de logs (`[REDACTED]`). |
| `docs/evidencias/parecer-prontidao-final.md` | **MODIFICAR** | Retificação da métrica de RTO (identificando a medição real de `3940.34 ms`), registro das limitações de `FISCAL_ENTREGA.md` e adequação das classificações para piloto controlado com ressalvas. |
| `docs/evidencias/auditoria_dados_ficticios.md` | **NOVO** | Procedimento formal para identificação e saneamento de eventuais cadastros locais afetados por seeds de consulta anteriores. |

---

## 2. Tarefas Detalhadas e Critérios de Aceite

### Task 1: Consulta Cadastral Segura e Eliminação de Dados Fictícios
- **1.1 Criar `services/consultaClienteService.js`**:
  - Validar CPF (11 dígitos) e CNPJ (14 dígitos).
  - Verificar se provedor externo está configurado via variáveis de ambiente (`SINTEGRA_API_URL`, `SERASA_API_URL`, etc.).
  - Caso não configurado:
    - Se o documento existir em `state.clientes`, retornar dados cadastrais locais existentes identificados com `origem: 'local'`, `consultaRealizada: false`, sem score Serasa.
    - Se o documento não existir, retornar `{ disponivel: false, codigo: 'INTEGRACAO_NAO_CONFIGURADA', mensagem: 'Serviço de consulta externa não configurado. Cadastro manual liberado.', cadastroManualPermitido: true, dados: null }`.
  - Mecanismo de simulação para testes:
    - Permitido **exclusivamente** se `process.env.NODE_ENV === 'test'` E ativação explícita via header `x-test-consulta-adapter: mock` ou método de injeção em teste.
    - Em ambiente de produção (`NODE_ENV === 'production'`), qualquer tentativa de usar simulador é rejeitada.
    - O resultado simulado deve conter `origem: 'simulacao_teste'`, `simulado: true`.
- **1.2 Atualizar `server.js`**:
  - Rota `POST /api/integracoes/consulta-cliente` e alias chamam `consultaClienteService.consultar(...)`.
  - Remover integralmente os blocos de cálculo com `seed`, `score = 400 + ...`, inscrições presumidas e endereços hardcoded.
- **1.3 Atualizar `js/cadastros.js`**:
  - Ao receber resposta com `disponivel: false`: exibir aviso informativo de que a consulta externa não está configurada e manter o formulário aberto e desbloqueado para digitação manual. Não preencher score fictício nem marcar consulta realizada.
- **1.4 Atualizar `tests/consulta_cliente_api.test.cjs`**:
  - Teste 1: Provedor não configurado retorna status indicando indisponibilidade e dados nulos.
  - Teste 2: Adaptador de teste ativo retorna dados com `simulado: true`.
  - Teste 3: Cliente existente localmente é retornado sem consulta externa.
  - Teste 4: Tentativa de usar adaptador de teste em `NODE_ENV === 'production'` é bloqueada.
  - Teste 5: Simulação de timeout/falha no adaptador de teste sem fallback para dados inventados.
- **1.5 Procedimento de Auditoria de Dados (`docs/evidencias/auditoria_dados_ficticios.md`)**:
  - Script e documentação para localizar cadastros que tenham recebido `scoreSerasa` ou IE calculada por seed.

---

### Task 2: Blindagem Financeira Server-Side Completa para Mecânico e Perfis Restritos
- **2.1 Ocultação de Campos Financeiros Adicionais em `lib/repository/stateRepository.js`**:
  - Em `filterStateByRole(state, context)`:
    - Se `!canReadFinancial`:
      - `filtered.servicos`: mapear e remover `valor`, `custo`, `subtotal`.
      - `filtered.quotations`: omitir ou remover `totalGeral`, `descontoGeral`, `subtotal`, `itens[].valor`, `itens[].custo`, `itens[].subtotal`.
      - `filtered.pecas`: remover `custo`, `venda`, `margem`, `preco`, `valor`, `custoMedio`.
      - `filtered.inspections`: remover estimativas monetárias.
      - `filtered.laborEntries`: remover `valorHora`, `custoHora`, `total`.
- **2.2 Proteção de Endpoints Alternativos em `server.js`**:
  - `GET /api/financeiro/dashboard`: adicionar `requirePermission('financial:read')`.
  - `GET /api/whatsapp/relatorio-preview`: adicionar `requirePermission('financial:read', 'reports:read')`.
  - `GET /api/pecas` e `GET /api/pecas/:id`: se `!req.securityContext.permissions.includes('financial:read')`, filtrar `custo`, `venda`, `margem` das peças retornadas.
  - `POST /api/estado`: no retorno, aplicar `filterStateByRole(result.state, req.securityContext)` para nunca vazar dados restaurados na resposta da requisição.
- **2.3 Reconciliação Não-Destrutiva contra Payloads Adversariais em `persistState`**:
  - Casamento estrito por `id` estável (ignorar correspondência frouxa por nome quando houver IDs).
  - Se um operador sem `financial:write` enviar um item novo em `os.servicos` ou `os.pecas` sem correspondente na OS existente:
    - Nunca aceitar valores financeiros injetados no payload (`valor`, `custo`, `venda`, `subtotal`).
    - Obter valor/custo exclusivamente do catálogo do sistema (`current.servicos` ou `current.pecas`) ou atribuir 0.
  - Se o operador tentar enviar uma nova OS sem permissão financeira:
    - Omitir/zerar `total`, `desc`, `desconto`, `orcamento`.
- **2.4 Testes de Regressão HTTP e RBAC**:
  - Adicionar testes em `tests/rbac_mechanic_financial_projection.test.cjs` com requisições HTTP reais validando:
    - Mecânico chamando `/api/estado`, `/api/pecas`, `/api/financeiro/dashboard`.
    - Usuário autorizado (admin/financeiro) mantendo acesso completo.
    - Tentativa de injeção de valores em serviços novos ou IDs alterados.

---

### Task 3: Validação Real de Interface via `agent-browser` sem Contornos
- **3.1 Atualizar `scripts/run_agent_browser_verified.cjs`**:
  - Classificar os cenários como testes de integração executados em navegador real.
  - Substituir qualquer `S.clientes.push`, `S.os.push`, `S.os[0].st = ...` por ações reais do usuário:
    - **Jornada de Cadastro**: Navegar na aba Cadastros -> Clicar em "Novo Cliente" -> Preencher inputs de formulário (`[data-c="nome"]`, `[data-c="doc"]`, etc.) -> Clicar em "Salvar Cliente" (`button[data-act="salvar-cad"]`).
    - **Jornada de Consulta / Cadastro Manual**: Clicar em "Consultar" -> Verificar renderização do modal pelo ID `#modal-consulta-cliente` e botões específicos -> Simular resposta de integração não configurada -> Confirmar que formulário permanece editável e concluir preenchimento manual.
    - **Jornada de Veículo e OS**: Clicar em "Ocupar Box" / "Nova OS" -> Selecionar veículo e box nos `<select>` -> Digitar queixa e km -> Clicar em "Abrir Ordem de Serviço" (`button[data-act="criar-os"]`).
    - **Jornada de Adição de Itens**: Abrir picker de serviços (`button[data-act="picker"][data-p="servicos"]`) -> Clicar em "Inserir" (`button[data-act="add-item"]`).
    - **Jornada do Mecânico**: Login com mecânico -> Abrir OS -> Mudar status no `<select data-act="mudar-status-os">` para "Em Execução" -> Validar que nenhum campo de valor é renderizado no DOM.
    - **Jornada do Admin (Reconciliação e Fechamento)**: Login com admin -> Verificar permanência dos valores originais -> Fechar OS.
    - **Jornada de Voz**: Abertura do modal de assistente via clique no botão de configuração -> Edição dos campos -> Gravação.
  - Eliminar asserções frágeis (`snapshotModal.length > 0`) em favor de seletores de elementos (`#modal-consulta-cliente`, `#btn-modal-serasa-sim`, etc.).
  - Isolar porta, banco SQLite, diretório de upload e backups.

---

### Task 4: Sanitização de Segredos e Logs
- **4.1 Sanitização do Gravador de Logs (`run_agent_browser_verified.cjs`)**:
  - Redigir senhas e credenciais em comandos `agent-browser set credentials` para exibir apenas o usuário com senha mascarada (`[REDACTED]`).
  - Filtrar cabeçalhos `Authorization` e senhas de qualquer log emitido.
- **4.2 Registro de Rotação de Credenciais**:
  - Incluir aviso explícito no parecer e na documentação operacional sobre a obrigatoriedade de rotação de credenciais que tenham sido registradas em arquivos de log anteriores.

---

### Task 5: Retificação do Parecer Técnico de Prontidão
- **5.1 Atualizar `docs/evidencias/parecer-prontidao-final.md`**:
  - Ajustar a menção a RTO para citar com precisão a medição obtida no log sob carga concorrente (`3940.34 ms`) e a verificação formal isolada (`RTO < 5s`).
  - Descrever com precisão o estado das integrações: "Pronto em arquitetura com adaptador de teste e indisponibilidade segura; pendente de contratação e homologação com provedores externos reais".
  - Refletir as limitações fiscais reais de `docs/FISCAL_ENTREGA.md`: indicar explicitamente que a emissão fiscal está bloqueada para piloto real devido à falta de credenciamento e autorizações fiscais externas.
  - Evitar termos absolutistas, delimitando exatamente o escopo das evidências colhidas.

---

### Task 6: Execução da Suíte Completa e Verificação
- **6.1 Execução das Baterias Afetadas**:
  - `tests/consulta_cliente_api.test.cjs`
  - `tests/rbac_mechanic_financial_projection.test.cjs`
  - `tests/multi_tenant_security.test.cjs`
- **6.2 Execução da Auditoria E2E no Navegador Real**:
  - `node scripts/run_agent_browser_verified.cjs`
- **6.3 Execução da Suíte Geral**:
  - `npm test`
  - Gravar resultado em `docs/evidencias/testes-completos-execucao.txt`.
