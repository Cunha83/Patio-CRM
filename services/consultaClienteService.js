'use strict';

/**
 * Serviço Canônico de Consulta Cadastral Externa (Sintegra / Serasa)
 * 
 * Regras de Segurança:
 * 1. Nenhuma fórmula de semente (seed) ou geração aleatória/fictícia no caminho operacional.
 * 2. Sem provedor externo configurado via ENV, informa indisponibilidade segura (INTEGRACAO_NAO_CONFIGURADA).
 * 3. Permite reaproveitamento seguro de dados do cadastro local existente no tenant.
 * 4. Adaptador de simulação restrito estritamente a ambiente de teste (NODE_ENV === 'test').
 */

let _activeTestAdapter = null;

function setTestAdapter(adapterFn) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Adaptador de teste só pode ser configurado em ambiente de teste (NODE_ENV === "test").');
  }
  _activeTestAdapter = adapterFn;
}

function clearTestAdapter() {
  _activeTestAdapter = null;
}

function formatarDocumento(limpo) {
  if (limpo.length === 14) {
    return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (limpo.length === 11) {
    return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return limpo;
}

async function consultarCliente({ doc, incluirSerasa = false, state = null, tenantId = null, testAdapterHeader = null }) {
  if (!doc || typeof doc !== 'string') {
    return {
      success: false,
      status: 400,
      erro: 'Documento (CPF ou CNPJ) é obrigatório.'
    };
  }

  const limpo = doc.replace(/\D/g, '');
  if (limpo.length !== 11 && limpo.length !== 14) {
    return {
      success: false,
      status: 400,
      erro: 'Documento inválido. Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.'
    };
  }

  const isTestEnv = process.env.NODE_ENV === 'test';
  const enableTestMockEnv = isTestEnv && process.env.ENABLE_TEST_CONSULTA_MOCK === 'true';

  // 1. Simulação para Testes Automatizados (Opt-in estrito)
  if (testAdapterHeader || _activeTestAdapter || enableTestMockEnv) {
    if (!isTestEnv) {
      return {
        success: false,
        status: 403,
        erro: 'Simulação desabilitada fora do ambiente de homologação/testes.'
      };
    }

    if (typeof _activeTestAdapter === 'function') {
      const adapterResult = await _activeTestAdapter({ doc: limpo, incluirSerasa, state, tenantId });
      return {
        ...adapterResult,
        simulado: true,
        origem: 'simulacao_teste'
      };
    }

    const adapterMode = testAdapterHeader || (enableTestMockEnv ? 'mock' : null);
    if (adapterMode === 'mock' || adapterMode === 'test-mock') {
      const docFmt = formatarDocumento(limpo);
      const isCnpj = limpo.length === 14;
      return {
        success: true,
        status: 200,
        disponivel: true,
        simulado: true,
        origem: 'simulacao_teste',
        aviso: 'Dados retornados pelo adaptador de teste automatizado.',
        dados: {
          tipo: isCnpj ? 'CNPJ' : 'CPF',
          doc: docFmt,
          cnpj: isCnpj ? docFmt : undefined,
          cpf: !isCnpj ? docFmt : undefined,
          nome: isCnpj ? `Empresa de Transportes ${limpo.slice(-4)} Ltda` : `Motorista Autônomo ${limpo.slice(-4)}`,
          fantasia: isCnpj ? `Transportes & Logística ${limpo.slice(-4)}` : '',
          ie: isCnpj ? `116.${limpo.slice(-6, -3)}.${limpo.slice(-3)}` : 'ISENTO',
          cep: '13050-000',
          endereco: 'Rodovia Santos Dumont, KM 68',
          bairro: 'Distrito Industrial',
          cidade: 'Campinas',
          uf: 'SP',
          fone: '(19) 3999-' + limpo.slice(-4),
          situacaoCadastral: 'ATIVA',
          regimeTributario: 'Simples Nacional',
          dataConsulta: new Date().toISOString(),
          scoreSerasa: incluirSerasa ? 590 : null,
          situacaoSerasa: incluirSerasa ? 'Médio Risco / Regular' : null,
          consultaSerasaRealizada: Boolean(incluirSerasa)
        }
      };
    }

    if (testAdapterHeader === 'timeout') {
      return {
        success: false,
        status: 504,
        disponivel: false,
        codigo: 'TIMEOUT_PROVEDOR_EXTERNO',
        erro: 'Tempo limite excedido na comunicação com o birô externo.',
        cadastroManualPermitido: true
      };
    }

    if (testAdapterHeader === 'error') {
      return {
        success: false,
        status: 502,
        disponivel: false,
        codigo: 'ERRO_PROVEDOR_EXTERNO',
        erro: 'Falha reportada pelo provedor cadastral remoto.',
        cadastroManualPermitido: true
      };
    }
  }

  // 2. Verificação de Dados Locais Existentes no Tenant
  if (state && Array.isArray(state.clientes)) {
    const clienteExistente = state.clientes.find(c => c && (c.doc || '').replace(/\D/g, '') === limpo);
    if (clienteExistente) {
      return {
        success: true,
        status: 200,
        disponivel: true,
        origem: 'local',
        simulado: false,
        consultaRealizada: false,
        mensagem: 'Cliente localizado no cadastro interno da oficina.',
        dados: {
          tipo: limpo.length === 14 ? 'CNPJ' : 'CPF',
          doc: clienteExistente.doc || formatarDocumento(limpo),
          nome: clienteExistente.nome || '',
          fantasia: clienteExistente.fantasia || '',
          ie: clienteExistente.ie || '',
          cep: clienteExistente.cep || '',
          endereco: clienteExistente.endereco || '',
          bairro: clienteExistente.bairro || '',
          cidade: clienteExistente.cidade || '',
          uf: clienteExistente.uf || '',
          fone: clienteExistente.fone || '',
          scoreSerasa: null,
          situacaoSerasa: null,
          consultaSerasaRealizada: false,
          fonte: 'cadastro_interno'
        }
      };
    }
  }

  // 3. Verificação de Provedores Externos Configurados em Produção
  const sintegraConfigurado = Boolean(process.env.SINTEGRA_API_URL && (process.env.SINTEGRA_API_KEY || process.env.SINTEGRA_TOKEN));
  const serasaConfigurado = Boolean(process.env.SERASA_API_URL && (process.env.SERASA_API_KEY || process.env.SERASA_TOKEN));

  if (!sintegraConfigurado && !serasaConfigurado) {
    return {
      success: false,
      status: 200, // Retorna 200 com payload estruturado de indisponibilidade para consumo gracioso no front
      disponivel: false,
      codigo: 'INTEGRACAO_NAO_CONFIGURADA',
      mensagem: 'Serviço de consulta cadastral externa (Sintegra/Serasa) não configurado neste ambiente. Prossiga com o preenchimento manual.',
      cadastroManualPermitido: true,
      origem: 'nenhuma',
      simulado: false,
      consultaRealizada: false,
      dados: null
    };
  }

  // 4. Provedores com variáveis informadas, mas transporte externo ainda não implementado
  return {
    success: false,
    status: 501,
    disponivel: false,
    codigo: 'TRANSPORTE_NAO_IMPLEMENTADO',
    mensagem: 'Adaptador de transporte externo (Sintegra/Serasa) ainda não implementado na aplicação. Prossiga com o preenchimento manual.',
    cadastroManualPermitido: true,
    origem: 'nenhuma',
    simulado: false,
    consultaRealizada: false,
    dados: null
  };
}

module.exports = {
  consultarCliente,
  formatarDocumento,
  setTestAdapter,
  clearTestAdapter
};
