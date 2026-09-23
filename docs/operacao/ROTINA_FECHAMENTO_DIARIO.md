# Rotina de Fechamento Diário e Metodologia 5S — Pátio CRM

Procedimento obrigatório a ser executado pelo Gestor da Oficina ao término do expediente (17h30 - 18h00) durante os 5 dias de piloto controlado.

---

## 1. Passo a Passo de Fechamento Diário (Checklist de Fim de Turno)

### Etapa 1: Pátio & Ocupação de Boxes
- [ ] Acessar o menu **Pátio & Boxes**.
- [ ] Conferir os caminhões que permanecerão pernoitando na oficina para o dia seguinte ("Veículos que Amanheceram").
- [ ] Verificar se todas as OSs dos veículos já entregues aos motoristas foram efetivamente marcadas como `finalizada` ou `faturada`.
- [ ] Nenhuma OS de veículo já liberado deve permanecer como `executando` nos boxes.

### Etapa 2: Almoxarifado de Peças & Apontamentos
- [ ] Comparar a lista de peças requisitadas nas OSs do dia com as saídas físicas do balcão de peças.
- [ ] Conferir se os apontamentos de tempo dos mecânicos foram encerrados ou pausados ao final da jornada de trabalho.

### Etapa 3: Financeiro Gerencial & Caixa
- [ ] Acessar o menu **Financeiro** > **Fluxo de Caixa**.
- [ ] Conferir o total de entradas em dinheiro/PIX recebidas no dia com os pagamentos informados nas OSs faturadas.
- [ ] Lançar eventuais despesas operacionais do dia pelo botão **Lançar Título**.

### Etapa 4: Auditoria do Backup WAL e Integridade
- [ ] Verificar se o script de backup executou nas últimas horas:
  ```cmd
  node -e "require('./services/backupService').listarBackups(3).then(console.log)"
  ```
- [ ] Conferir se o arquivo mais recente possui `status: 'completed'` e tamanho compatível.
- [ ] Confirmar a cópia do backup para o pendrive ou unidade de rede secundária da oficina.

---

## 2. Metodologia 5S Aplicada ao Sistema Operacional

1. **Seiri (Utilização / Descarte):** Manter no pátio e nas telas apenas os veículos e cadastros ativos do piloto. Não acumular ordens de serviço fictícias de teste na base operacional.
2. **Seiton (Organização):** Manter placas cadastradas no formato padrão Mercosul (ex.: `BRA2E19`), nomes de clientes sem abreviações confusas e boxes identificados fisicamente de acordo com as baias da oficina.
3. **Seiso (Limpeza de Dados):** Não apagar arquivos ou tabelas do banco de dados como tentativa de "limpar" o sistema. Erros operacionais devem ser corrigidos pelos fluxos canônicos de estorno/ajuste do sistema.
4. **Seiketsu (Padronização):** Todos os 3 operadores (Gestor, Atendimento, Mecânico) devem seguir rigorosamente os passos descritos no `GUIA_OPERACIONAL_PILOTO.md`.
5. **Shitsuke (Disciplina):** Cumprir diariamente o ritual de fechamento às 17h30 e o preenchimento do Registro de Incidentes em caso de qualquer anomalia.
