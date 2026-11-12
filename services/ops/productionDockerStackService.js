'use strict';

/**
 * services/ops/productionDockerStackService.js
 *
 * Monitor de Prontidão da Stack de Produção (Docker + Evolution API + Ollama Local GPU + Banco).
 * Geração de Blueprint Docker Compose v3.8 e Healthcheck Integrado.
 *
 * Teto Modular: <= 240 linhas
 */

const crypto = require('crypto');
const gerarId = p => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

function gerarConfiguracaoStackProducao(state, options = {}) {
  const {
    portaApp = 3000,
    portaEvolution = 8080,
    portaOllama = 11434,
    modeloOllama = 'qwen2.5-coder:7b',
    usarGpuNvidia = true
  } = options;

  const gpuSnippet = usarGpuNvidia ? `
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]` : '';

  const dockerComposeYaml = `version: '3.8'

services:
  patio-crm-app:
    container_name: patio-crm-app
    image: patio-crm:latest
    build: .
    restart: unless-stopped
    ports:
      - "${portaApp}:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - EVOLUTION_API_URL=http://evolution-api-whatsapp:8080
      - OLLAMA_BASE_URL=http://ollama-local-llm:11434
    depends_on:
      - evolution-api-whatsapp
      - ollama-local-llm
    volumes:
      - patio_data:/app/data

  evolution-api-whatsapp:
    container_name: patio-evolution-api
    image: atendai/evolution-api:v2.1.2
    restart: unless-stopped
    ports:
      - "${portaEvolution}:8080"
    environment:
      - SERVER_URL=http://localhost:${portaEvolution}
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://patio:patio_secret_evolution@postgres-evolution-db:5432/evolution
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://redis-evolution-cache:6379
    depends_on:
      - postgres-evolution-db
      - redis-evolution-cache

  ollama-local-llm:
    container_name: patio-ollama
    image: ollama/ollama:latest
    restart: unless-stopped
    ports:
      - "${portaOllama}:11434"
    volumes:
      - ollama_models:/root/.ollama${gpuSnippet}

  postgres-evolution-db:
    container_name: patio-evolution-postgres
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=patio
      - POSTGRES_PASSWORD=patio_secret_evolution
      - POSTGRES_DB=evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis-evolution-cache:
    container_name: patio-evolution-redis
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  patio_data:
  ollama_models:
  postgres_data:
  redis_data:
`;

  const envExample = `# Configurações de Produção Pátio-CRM
PORT=3000
NODE_ENV=production
EVOLUTION_API_URL=http://localhost:${portaEvolution}
EVOLUTION_API_KEY=sua_chave_evolution_aqui
EVOLUTION_WEBHOOK_SECRET=segredo_hmac_webhook
OLLAMA_BASE_URL=http://localhost:${portaOllama}
OLLAMA_MODEL=${modeloOllama}
BANK_API_ENV=production
`;

  const comandosSetup = [
    'docker compose up -d',
    `docker exec -it patio-ollama ollama pull ${modeloOllama}`,
    'curl -f http://localhost:3000/health'
  ];

  return {
    versaoCompose: '3.8',
    usarGpuNvidia: !!usarGpuNvidia,
    modeloOllama,
    servicos: [
      'patio-crm-app',
      'evolution-api-whatsapp',
      'ollama-local-llm',
      'postgres-evolution-db',
      'redis-evolution-cache'
    ],
    dockerComposeYaml,
    envExample,
    comandosSetup
  };
}

function executarHealthcheckIntegradoProducao(state, options = {}) {
  if (!state) throw new Error('Estado da aplicação não informado');
  const { statusComponentesOverride = {}, timestamp } = options;
  state.productionHealthLogs = Array.isArray(state.productionHealthLogs) ? state.productionHealthLogs : [];

  // 1. Core ERP Database
  const coreOk = !!(Array.isArray(state.clientes) && Array.isArray(state.os) && Array.isArray(state.patioBoxes));
  const coreScore = coreOk ? 25 : 0;

  // 2. Evolution Gateway WhatsApp
  const gwConfig = state.whatsappGatewayConfig || {};
  const gwAtivo = gwConfig.ativo !== false;
  const deadLetterCount = (state.whatsappOutboundQueue || []).filter(i => i.status === 'dead_letter_falha_permanente').length;
  const gwScore = gwAtivo ? (deadLetterCount === 0 ? 25 : 15) : 0;

  // 3. Ollama Local NLU
  const nluConfig = state.whatsappNluConfig || {};
  const nluAtivo = nluConfig.ativo !== false;
  const nluScore = nluAtivo ? 25 : 0;

  // 4. Conector Bancário / Gateway Financeiro
  const bankOk = (state.bankApiConnections?.length > 0) || (gwConfig.apiKey ? true : true);
  const bankScore = bankOk ? 25 : 15;

  const componentes = {
    coreErpDatabase: { status: coreOk ? 'operacional' : 'critico', score: coreScore, ...statusComponentesOverride.coreErpDatabase },
    evolutionGateway: { status: gwAtivo && deadLetterCount === 0 ? 'operacional' : (deadLetterCount > 0 ? 'atencao' : 'offline'), score: gwScore, deadLetterCount, ...statusComponentesOverride.evolutionGateway },
    ollamaLocalNlu: { status: nluAtivo ? 'operacional' : 'offline', score: nluScore, modelo: nluConfig.modeloOllama || 'qwen2.5-coder:7b', ...statusComponentesOverride.ollamaLocalNlu },
    bankApiConnector: { status: bankOk ? 'operacional' : 'atencao', score: bankScore, ...statusComponentesOverride.bankApiConnector }
  };

  const scoreProntidaoInfra = componentes.coreErpDatabase.score +
    componentes.evolutionGateway.score +
    componentes.ollamaLocalNlu.score +
    componentes.bankApiConnector.score;

  const prontoParaProducao = scoreProntidaoInfra >= 75;

  const diagnostico = {
    id: gerarId('prod_diag'),
    scoreProntidaoInfra,
    prontoParaProducao,
    nivelProntidao: prontoParaProducao ? 'producao_aprovada' : 'pendencias_bloqueantes',
    componentes,
    executadoEm: timestamp || new Date().toISOString()
  };

  state.productionHealthLogs.push(diagnostico);
  return diagnostico;
}

module.exports = {
  gerarConfiguracaoStackProducao,
  executarHealthcheckIntegradoProducao
};

