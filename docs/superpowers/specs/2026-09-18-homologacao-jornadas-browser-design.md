# Design: Homologação E2E das 6 Jornadas via agent-browser com Decomposição Observável da Jornada 2

**Data:** 2026-09-18  
**Autor:** Antigravity  
**Status:** Proposto para Aprovação  
**Alvo:** scripts/run_agent_browser_verified.cjs, js/, server.js, docs/evidencias/

---

## 1. Contexto & Objetivos

A auditoria E2E no navegador real via agent-browser valida as 6 jornadas críticas do Pátio CRM.
Os avanços prévios confirmaram:
- 10/10 testes unitários e de integração de segurança e autorização da voz aprovados de forma independente;
- Jornada 1A (Cadastro manual sem birô externo) validada no DOM real;
- Jornada 1B (Consulta via adaptador opt-in de teste e cadastro veicular) validada no DOM real.

A Jornada 2 anteriormente era executada como um bloco monolítico de comandos no agent-browser, o que dificultava o diagnóstico granular quando ocorria timeout ou espera de interface.

O objetivo deste projeto é:
1. **Decompor a Jornada 2 em 9 etapas observáveis (a a i)** com medição de início, término, duração, validação e captura de evidência (screenshot, DOM, logs de console) em caso de anomalia.
2. **Distinguir problemas de interface de problemas de automação**, garantindo controles visíveis reais, eventos canônicos de DOM e viewport adequado (1920x1080).
3. **Garantir isolamento e evitar concorrência**, com sessões exclusivas do navegador, porta dinâmica, limpeza determinística de subprocessos e fixtures autônomas quando executada de modo isolado (--only-2).
4. **Validar as Jornadas 3 a 6** com blindagem estrita de mecânico, reconciliação pelo admin, configuração persistente do assistente e respostas por voz para finanças e treinamento.
5. **Consolidar o fechamento formal de evidências**, gerando hashes SHA-256 dos logs reais, garantindo a suíte geral npm test 100% verde e documentando o parecer final.

---

## 2. Decomposição Observável da Jornada 2

A Jornada 2 será orquestrada pela função canônica runObservableStep:
- **Assinatura:** runObservableStep(session, stepId, stepName, commands, validationFn, options)
- **Telemetria por etapa:** Registra timestamp_inicio, timestamp_fim, duracao_ms, status: SUCESSO | FALHA.
- **Tratamento de falha:** Em caso de erro ou timeout no passo, aciona automaticamente agent-browser screenshot, extrai o DOM relevante (#folha, .os-rodape-fixo, #vidro), coleta respostas HTTP/console e redige dados sensíveis antes de registrar no log.

### As 9 Etapas Canônicas:
- **Etapa 2.a: Navegar até o Pátio**
  - Comando: Clicar em button[data-act="ir"][data-v="patio"]
  - Validação: window.S.ui.view === 'patio' e container de pátio visível.
- **Etapa 2.b: Abrir Folha de Nova OS**
  - Comando: Clicar em button[data-act="nova-os"]
  - Validação: Elemento #folha exibindo o formulário de abertura de OS.
- **Etapa 2.c: Selecionar Veículo e Box**
  - Comando: Selecionar o veículo cadastrado no select select[data-act="rasc"][data-c="vei"] e o box em select[data-act="rasc"][data-c="box"].
  - Validação: Valores refletidos no formulário e eventos change/input despachados.
- **Etapa 2.d: Preencher Quilometragem e Queixa**
  - Comando: Preencher input[data-c="km"] e textarea[data-c="queixa"].
  - Validação: Inputs populados no DOM.
- **Etapa 2.e: Acionar Criação da OS**
  - Comando: Clicar no botão visível button[data-act="criar-os"] com scrollIntoView({ block: 'center' }).
  - Validação: Requisição disparada e processada.
- **Etapa 2.f: Confirmar Criação e Persistência Inicial**
  - Comando: Avaliar estado no DOM e em window.S.
  - Validação: numOS > 0, presença da barra .os-rodape-fixo.
- **Etapa 2.g: Abrir Seletor de Serviços e Adicionar Item**
  - Comando: Clicar em button[data-act="picker"][data-p="servicos"], aguardar picker, clicar em button[data-act="add-item"][data-t="servicos"][data-r="s1"].
  - Validação: os.servicos.length >= 2 (diagnóstico padrão + s1).
- **Etapa 2.h: Abrir Seletor de Peças e Adicionar Item**
  - Comando: Clicar em button[data-act="aba-os"][data-k="pecas"], aguardar render da aba, clicar em button[data-act="picker"][data-p="pecas"], clicar em button[data-act="add-item"][data-t="pecas"][data-r="p1"].
  - Validação: os.pecas.length >= 1.
- **Etapa 2.i: Conferir Totais e Persistência**
  - Comando: Ler .os-rodape-fixo e consultar /api/estado.
  - Validação: Totais de mão de obra e peças visíveis, somatória >= R$ 2.000,50 e persistência íntegra.

---

## 3. Distinção de Problemas de Interface vs. Automação

- **Viewport Fixo:** Configurar viewport em 1920x1080 em todas as sessões para evitar compressão vertical ou elementos ocultos sob overlays.
- **Detecção de Backdrop (#vidro):** Verificar se #vidro está com display: none ou opacity: 0 antes de interagir com elementos inferiores.
- **Interações Visíveis:** Utilizar seletores CSS estáveis orientados a data-act e inputs de ID, garantindo que o clique ocorra em elementos no fluxo visível.
- **Não Mascaramento:** Se a interface apresentar um desalinhamento real, corrigir a camada de apresentação (js/app.js, js/patio.js, style.css), preservando 100% das regras de negócio e validações fiscais/financeiras.

---

## 4. Gestão de Concorrência e Execuções Isoladas

- **Sessão Exclusiva:** Cada execução gera um identificador único patio_verified_<timestamp>.
- **Cleanup Robusto:** Fechamento explícito da sessão do agent-browser e encerramento do processo do servidor de teste via PID com desalocação de diretórios temporários.
- **Execução Modular:** Flag --only-2 prepara automaticamente as fixtures necessárias (1 cliente e 1 veículo no SQLite temporário) para diagnóstico isolado sem necessidade de rodar J1A/J1B previamente.

---

## 5. Jornadas Subsequentes (J3 a J6)

- **Jornada 3 (Perfil Mecânico):**
  - Acesso com credenciais mecanico_e2e.
  - Inspeção do DOM: ausência de cifras monetárias, ausência do botão faturar, rodapé indicando Execução Técnica de Oficina, tabela sem colunas de preço.
  - Atualização do status operacional para executando.
- **Jornada 4 (Reconciliação Admin):**
  - Acesso com credenciais admin_e2e.
  - Verificação de status preservado (executando), total financeiro íntegro no DOM e no payload, impressão sem travamento de popup e finalização da OS.
- **Jornada 5 (Assistente de Voz & SQLite):**
  - Configuração de nome (Sofia Inteligência Operacional), voz feminina, pitch 1.15 e rate 1.05.
  - Recarregamento da aplicação e conferência da persistência no banco SQLite.
- **Jornada 6 (Consultas de Voz & Treinamento):**
  - Consultas via /api/comando-voz: vencimentos a pagar, saldo de caixa e orientação para emissão fiscal.
  - Confirmação de respostas contextualizadas (sem fallback genérico).

---

## 6. Critérios de Homologação e Fechamento

1. Execução do auditor completo node scripts/run_agent_browser_verified.cjs com código de retorno 0.
2. Log timestamped gerado em docs/evidencias/agent-browser-verified.log e arquivo único com hash SHA-256.
3. Execução da suíte completa de testes (npm test) com 100% de aprovação (todos os testes verdes).
4. Emissão de parecer final detalhado categorizado por status (Aprovado, Falhou, Ignorado, Não Executado).
