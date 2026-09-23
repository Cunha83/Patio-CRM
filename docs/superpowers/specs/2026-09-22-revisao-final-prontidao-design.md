# Especificação de Design: Correção das Três Pendências de Prontidão Operacional do Piloto

**Data:** 22 de Setembro de 2026  
**Status:** APROVADO PARA IMPLEMENTAÇÃO  
**Escopo:** Armazenamento Independente de Backup, Higienização de Senhas/Credenciais, Guarda Pré-Voo de Implantação e Calibração de RTO/RPO.

---

## 1. Visão Geral e Objetivos

O presente documento detalha as soluções técnicas estritas para sanar as três pendências operacionais apontadas na revisão de prontidão:

1. **Armazenamento Realmente Independente:**
   - Eliminar `subst B:` e caminhos no mesmo disco físico como evidência de backup independente.
   - Implementar validação estrita que rejeita destinos na mesma unidade física/lógica.
   - Fornecer suporte e evidência comprovada para **Destino Remoto Autêntico** via Serviço de Armazenamento Remoto Dedicado (`scripts/servico_backup_remoto.cjs`) e destinos de rede UNC.
   - Manter a pendência física de pendrive/NAS local expressa com transparência no checklist até conexão física pelo operador.

2. **Remoção de Senhas Literais e Sigilo de Credenciais:**
   - Remover toda e qualquer senha em texto plano de scripts, documentação, markdown e logs.
   - Provisionar credenciais através de variáveis de ambiente (`PILOTO_GESTOR_SENHA`, `PILOTO_ATENDENTE_SENHA`, `PILOTO_MECANICO_SENHA`) ou geração em memória em tempo de execução sem exibição nos logs (`[REDACTED]`).
   - Documentar entrega de senhas em canal seguro físico/operacional.

3. **Guarda Pré-Voo de Implantação (Recusa Antes de Qualquer Escrita):**
   - Garantir que `scripts/executar_implantacao_real_piloto.cjs` e `scripts/instalar_pacote_piloto.cjs` verifiquem a existência de instalações anteriores antes de executar qualquer escrita (`fs.writeFileSync`, `mkdir`, etc.).
   - Lançar erro `INSTALACAO_JA_EXISTE` e sair com código `1`.
   - Comprovar em teste automatizado isolado que banco `patio.db`, `.env` e anexos permanecem 100% inalterados.

4. **Calibração Realista de RPO:**
   - Corrigir declarações de "RPO zero".
   - Definir RTO medido (~8 segundos) e RPO nominal de **até 1 hora (≤ 1h)** em conformidade com o intervalo horário da tarefa agendada.

---

## 2. Arquitetura dos Componentes

### 2.1 Módulo de Backup com Destino Remoto e Rejeição de Mesmo Disco
- **Arquivo:** `scripts/executar_backup_operacional.cjs`
- **Validação de Independência:**
  - Função `assertIndependentDestination(srcPath, destPath)`:
    - Compara os roots de volume (`path.parse(srcPath).root` vs `path.parse(destPath).root`).
    - Resolve possíveis `subst` via checagem de volume e dispositivo.
    - Se o destino estiver no mesmo volume do banco de dados e não for um destino de rede remoto, recusa o backup externo com erro `ERRO_ARMAZENAMENTO_NAO_INDEPENDENTE`.
- **Destino Remoto via Rede (`BACKUP_REMOTE_URL`):**
  - Quando configurado `BACKUP_REMOTE_URL` (ex: `http://127.0.0.1:3005/api/backup/upload`), o script realiza stream/upload seguro do pacote comprimido/autocontido para o receptor remoto com autenticação via token HMAC/Bearer.
- **Serviço Receptor Remoto Dedicado:**
  - `scripts/servico_backup_remoto.cjs`: Servidor HTTP leve que escuta na porta 3005 (ou configurável), aceita pacotes de backup autenticados, valida hashes SHA-256 e os armazena em seu cofre de armazenamento segregado.

### 2.2 Guarda de Pré-Voo na Implantação
- **Arquivo:** `scripts/executar_implantacao_real_piloto.cjs`
- **Comportamento:**
  - Antes de qualquer escrita (inclusive `.env`), invoca `assertCleanDeploymentTarget(deployDir)`.
  - Se `deployDir` contiver `patio.db`, `.env` ou `public/uploads`:
    - Emite `[ERRO] Instalação existente detectada no destino. Implantação abortada para evitar corrupção ou perda de dados.`
    - Define `process.exitCode = 1` e interrompe a execução imediatamente sem tocar em nenhum arquivo.

### 2.3 Higienização de Credenciais
- **Arquivos Afetados:**
  - `scripts/provisionar_credenciais_finais.cjs`: Lê credenciais de `process.env.PILOTO_*_SENHA` ou gera senhas fortes de alta entropia sem imprimir em stdout.
  - `tests/rbac_permissions_audit.test.cjs`: Usa credenciais transitórias injetadas via env em tempo de teste.
  - `docs/operacao/CHECKLIST_INICIO_PILOTO.md`: Substitui valores literais por `[CONFIGURADO_VIA_ENV / COFRE]`.
  - `walkthrough.md`: Purga senhas literais.

---

## 3. Plano de Verificação e Testes

1. `tests/deployment_preflight_guard.test.cjs`:
   - Prepara staging com banco, .env e anexo.
   - Executa `executar_implantacao_real_piloto.cjs` apontando para esse staging.
   - Valida saída de erro `INSTALACAO_JA_EXISTE` e integridade byte a byte dos arquivos.
2. `tests/remote_independent_backup.test.cjs`:
   - Inicia o serviço receptor de backup remoto em porta isolada.
   - Executa `executar_backup_operacional.cjs` com `BACKUP_REMOTE_URL`.
   - Comprova recebimento, verificação de hash SHA-256 e restauração completa a partir do serviço remoto.
3. `tests/rbac_permissions_audit.test.cjs`:
   - Valida que as senhas foram rotacionadas/provisionadas com sigilo e sem expor literais em logs.
4. Suíte completa com `test-preload.cjs`:
   - Todos os testes dirigidos executados com zero falhas.
