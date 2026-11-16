# Pátio-CRM v2.1.0 Autonomous Enterprise — Guia de Instalação e Deploy "Zero to Hero"

Este documento orienta a implantação completa e assistida do **Pátio-CRM v2.1.0 Enterprise** em um computador Windows limpo (do zero), sem exigir conhecimento técnico prévio do operador.

---

## 1. Visão Geral da Stack de Produção

A arquitetura de produção do Pátio-CRM opera de forma contenerizada via Docker Compose, garantindo isolamento total, alta performance e inteligência artificial local com aceleração por GPU:

| Serviço / Container | Imagem Oficial | Porta Host | Finalidade no Pátio-CRM |
| :--- | :--- | :---: | :--- |
| **`patio-crm-app`** | `patio-crm:v2.1.0` | `3000` | Aplicação central do ERP, Pátio, Financeiro e API REST |
| **`patio-crm-ollama`** | `ollama/ollama:latest` | `11434` | Motor NLU local com Tool Calling (`qwen2.5-coder:7b`) e suporte a GPU NVIDIA |
| **`patio-crm-evolution`** | `atendai/evolution-api:v2.1.2` | `8080` | Gateway WhatsApp (instâncias Baileys/Cloud API, áudio e OCR) |
| **`patio-crm-postgres`** | `postgres:15-alpine` | `5432` (interno) | Banco relacional dedicado da Evolution API |
| **`patio-crm-redis`** | `redis:7-alpine` | `6379` (interno) | Cache em memória de mensagens e sessões WhatsApp |

---

## 2. Requisitos Mínimos Recomendados

- **Sistema Operacional:** Windows 10 (Build 19044+) ou Windows 11 (64-bit).
- **Processador:** Intel Core i5/i7 (8ª geração+) ou AMD Ryzen 5/7.
- **Memória RAM:** 16 GB (recomendado para rodar a IA local sem engasgos).
- **Armazenamento:** 20 GB de espaço livre em disco SSD.
- **Placa de Vídeo (Opcional):** Placa de vídeo dedicada NVIDIA (RTX série 20/30/40 ou GTX 1660+) com drivers atualizados para aceleração de inferência via CUDA no WSL2.
- **Conexão de Internet:** Necessária apenas no primeiro deploy para download das imagens Docker e do modelo de IA.

---

## 3. Instalação em 1 Clique (Deploy "Zero to Hero")

O instalador automatizado `deploy-zero-to-hero.bat` foi projetado para orquestrar todas as etapas de preparação da máquina:

### Passo a Passo:
1. Abra a pasta do projeto no Windows Explorer.
2. Clique com o botão direito no arquivo **`deploy-zero-to-hero.bat`** e selecione **"Executar como Administrador"**.
3. O script executará automaticamente:
   - **Verificação de Permissões:** Solicita privilégios elevados se necessário.
   - **Instalação de Pré-requisitos:** Detecta e instala automaticamente Git, Node.js LTS e Docker Desktop (via Winget).
   - **Inicialização do Docker:** Aciona o serviço do Docker Desktop e aguarda até o daemon estar pronto.
   - **Ambiente e Diretórios:** Cria as pastas `data/`, `docs/operacao/` e o arquivo `.env.production`.
   - **Integridade Criptográfica:** Executa a verificação estrita do manifesto SHA-256 de todos os arquivos de código.
   - **Build & Deploy da Stack:** Constrói os containers de produção e inicia os 5 serviços.
   - **Download da IA Local:** Baixa o modelo `qwen2.5-coder:7b` para inferência rápida no chão de oficina.
   - **Abertura Automática:** Abre o navegador em `http://localhost:3000`.

---

## 4. Operação Diária do Sistema

Após a instalação inicial, o operador não precisa mais reexecutar o instalador.

- **Para Iniciar o Sistema:** Basta clicar duas vezes no atalho **`iniciar-sistema.bat`** localizado na raiz do projeto. O script verifica se o Docker está ativo, sobe a stack e abre o ERP no navegador.
- **Para Parar o Sistema:** Abra o Prompt de Comando na pasta e execute:
  ```cmd
  docker compose -f docker-compose.production.yml stop
  ```
- **Para Reiniciar os Serviços:**
  ```cmd
  docker compose -f docker-compose.production.yml restart
  ```

---

## 5. Endpoints e Portas de Acesso

Com a stack operacional, os seguintes endereços ficam disponíveis localmente ou na rede interna da oficina:

- **Painel Web Principal (Pátio-CRM):** [http://localhost:3000](http://localhost:3000)
- **Healthcheck e Status da API:** [http://localhost:3000/health](http://localhost:3000/health)
- **Readiness Probe do Sistema:** [http://localhost:3000/ready](http://localhost:3000/ready)
- **Gerenciador da Evolution API:** [http://localhost:8080/manager](http://localhost:8080/manager)
- **API do Motor Ollama:** [http://localhost:11434](http://localhost:11434)

---

## 6. Diagnóstico e Resolução de Problemas Comuns

### O Docker Desktop não inicializou automaticamente
- Abra o Docker Desktop manualmente através do Menu Iniciar do Windows.
- Certifique-se de que a opção **"Use the WSL 2 based engine"** está marcada em *Settings > General*.
- Verifique se o WSL2 está atualizado executando no terminal: `wsl --update`.

### Aceleração por GPU NVIDIA no Ollama
- Certifique-se de que o driver NVIDIA mais recente está instalado no Windows (ele repassa automaticamente o suporte CUDA ao WSL2).
- Para testar se o container do Ollama enxerga a GPU:
  ```cmd
  docker exec -it patio-crm-ollama nvidia-smi
  ```

### Restauração em Caso de Acidente Operacional
O Pátio-CRM v2.1.0 inclui o **Cofre de Snapshots SHA-256**:
- Acesse o painel web em *Governança > Cofre de Snapshots* ou faça um POST para `/api/ops/backups/restaurar-snapshot`.
- O sistema valida a assinatura SHA-256 e restaura atomicamente o estado de clientes, pátio, estoque e contas sem perda de consistência.
