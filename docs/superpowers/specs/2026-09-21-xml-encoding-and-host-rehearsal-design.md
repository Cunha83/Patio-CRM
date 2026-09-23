# Especificação Técnica: Correção de Codificação/Escape XML e Ensaio Operacional no Host

**Data:** 21/09/2026  
**Referência:** `docs/VALIDACAO_PACOTE_FINAL_2026-09-21.md`  
**Escopo:** Fechamento estrito do pacote operacional do Pátio CRM (sem alteração do núcleo funcional nem de dados operacionais).

---

## 1. Diagnóstico do Problema no XML do Agendador de Tarefas

Na versão anterior de `scripts/gerar_tarefa_agendada_windows.cjs`:
1. **Inconsistência de Declaração e Codificação:**
   - O cabeçalho declarava: `<?xml version="1.0" encoding="UTF-16"?>`.
   - O arquivo era gravado com codificação UTF-8 (`fs.writeFileSync(..., xml, 'utf8')`) sem Byte Order Mark (BOM).
   - O parser nativo do Windows Task Scheduler e o .NET `[System.Xml.XmlReader]::Create(path)` rejeitam o arquivo com erro:
     > `There is no Unicode byte order mark. Cannot switch to Unicode.`
2. **Ausência de Escape de Entidades XML:**
   - Variáveis interpoladas (`nodePath`, `scriptPath`, `workingDir`, `interval`, `user`) não sofriam escape de caracteres XML especiais (`&`, `<`, `>`, `"`, `'`).
   - Se um caminho contiver `&` (ex.: `C:\Oficina & Filhos\node.exe`), a árvore XML fica malformada (`XML syntax error: entity reference not ended with semicolon`).
3. **Lacuna na Validação dos Testes:**
   - `tests/scheduled_task_config.test.cjs` apenas buscava strings e expressões regulares no arquivo, sem submeter os bytes gravados a um parser XML real.

---

## 2. Decisões Técnicas de Arquitetura

### 2.1 Unificação em UTF-8 e Função Canônica de Escape XML
- O cabeçalho será corrigido para: `<?xml version="1.0" encoding="UTF-8"?>`.
- Implementação de função pura de escape `escapeXml(value)`:
  ```javascript
  function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  ```
- Todos os campos dinâmicos dentro das tags `<Command>`, `<Arguments>`, `<WorkingDirectory>`, `<Interval>`, `<UserId>` serão encapsulados por `escapeXml()`.
- O arquivo será gravado em UTF-8 e o gerador atualizará `docs/operacao/PatioCRM_Backup_WAL.xml`.

### 2.2 Teste Automatizado com Parser XML Real
- `tests/scheduled_task_config.test.cjs` executará um teste em que um arquivo XML temporário é gerado e lido por meio do parser real .NET via PowerShell (`[System.Xml.XmlReader]::Create(path)` ou `[System.Xml.XmlDocument]::new().Load(path)`).
- O teste incluirá caminhos complexos contendo `&` (ex.: `C:\Oficina & CIA\node.exe` e `D:\Backups & Arquivos\backup.cjs`).
- O parser deve ler o documento completo até o final sem exceções, e os nós `<Command>` e `<Arguments>` devem restaurar o caractere `&` decodificado sem corrupção.
- Não haverá nenhum registro de tarefas reais no Agendador do Windows durante os testes automatizados.

### 2.3 Ensaio Operacional Pré-Piloto no Host (`scripts/ensaio_operacional_host.cjs`)
- Para cobrir a validação completa antes da 1ª OS real sem violar o isolamento:
  1. Cria ambiente isolado em `os.tmpdir()` para simular instalação limpa pelo lockfile.
  2. Regenera o XML de agendamento validando os caminhos absolutos do host.
  3. Checa a existência da conta executora configurada e permissões de escrita em `BACKUP_EXTERNAL_DIR`.
  4. Executa o backup físico e valida o pacote no destino externo.
  5. Restaura o pacote externo em uma nova pasta isolada, sobe o servidor efêmero e testa: login, leitura de estado, criação de OS e download de anexos.
  6. Emite o relatório de cada etapa no formato `APROVADO`, `PENDENTE` ou `FALHOU`.

---

## 3. Matriz de Não-Regressão
- A base operacional `patio.db` permanece 100% intocada.
- Preserva-se `MultipleInstancesPolicy=IgnoreNew`.
- A suíte completa e o manifesto de release de 119 arquivos serão regenerados e validados.
