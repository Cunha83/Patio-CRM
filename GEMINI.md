# Contexto e Instruções do Projeto Pátio-CRM (`GEMINI.md`)

Este arquivo estabelece as diretrizes canônicas para o Google Antigravity e modelos Gemini operando neste repositório.

Consulte o documento mestre de arquitetura e convenções:
@AGENTS.md

---

## Regras de Operação Rápida

1. **Quality Gate de Linhas:** Todos os arquivos de serviço, handlers, módulos frontend e CSS devem ter **no máximo 350 linhas**. Validação obrigatória com:
   ```bash
   node --test tests/modular_file_size_gate.test.cjs
   ```
2. **Padrão Fachada (Facade):** Sempre que decompor ou refatorar um módulo, mantenha a fachada original intacta com suas exportações públicas.
3. **Isolamento de Estado:** Nenhuma suíte de testes deve gravar em `data/database.json`. Sempre utilize o preload (`--require ./scripts/test-preload.cjs`).
4. **Verificação Prévia Criptográfica:** Novos arquivos de código devem ser incorporados ao manifesto via:
   ```bash
   node scripts/gerar_manifesto_release.cjs
   node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs
   ```
5. **Suíte Geral:** `npm test` deve sempre retornar Exit Code 0 com 100% dos testes aprovados.
