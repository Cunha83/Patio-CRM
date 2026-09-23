'use strict';

const crypto = require('crypto');
const { gerarTokenAcao, consumirTokenAcao, validarTokenAcao, confirmarConsumoTokenAcao, reservarTokenAcao, liberarTokenAcao } = require('../lib/tokens/securityToken');
const preOSEngine = require('./preOSEngine');
const operationalIntelligenceEngine = require('./operationalIntelligenceEngine');
const operationalSummaryService = require('./operationalSummaryService');
const inspectionService = require('./inspectionService');
const quotationService = require('./quotationService');
const inventoryService = require('./inventoryService');
const procurementService = require('./procurementService');
const supplierService = require('./supplierService');
const laborTrackingService = require('./laborTrackingService');
const productivityService = require('./productivityService');
const costingService = require('./costingService');
const pricingEngine = require('./pricingEngine');
const customerTimelineService = require('./customerTimelineService');
const maintenancePlanService = require('./maintenancePlanService');
const afterSalesService = require('./afterSalesService');
const relationshipService = require('./relationshipService');
const appointmentService = require('./appointmentService');
const financialEngine = require('./financialEngine');

const BASE_CONHECIMENTO_SISTEMA = {
  cliente: 'Para cadastrar um cliente ou transportadora, acesse o menu Cadastros & Frotas, clique em Clientes e no botão Novo Cliente. Digite o CNPJ ou CPF e clique em Consultar para buscar via Sintegra/Serasa ou preencha manualmente os campos de Razão Social, IE, telefone e endereço, e clique em Salvar Cliente.',
  os: 'Para abrir uma Ordem de Serviço, acesse o menu Pátio & Boxes e clique no botão Nova OS. Selecione o caminhão ou veículo pela placa (ou cadastre novo), escolha o box disponível, informe o KM do painel e descreva a queixa do motorista. Clique em Criar OS para iniciar o atendimento.',
  pecas_servicos: 'Na folha da OS aberta, você pode navegar entre a aba Serviços e a aba Peças. Clique no botão Adicionar, utilize o campo de busca no picker para selecionar o item cadastrado e clique em Inserir. O total da OS é recalculado em tempo real.',
  faturamento: 'Para faturar e entregar a OS, certifique-se de que os serviços e peças foram executados. No rodapé da OS, clique no botão Faturar & Entregar, selecione as condições de pagamento e prazos, e confirme. Isso gera os títulos financeiros a receber e libera o veículo do box.',
  fiscal: 'O módulo Fiscal e Notas Fiscais permite emitir NF-e para peças e NFS-e para serviços mecânicos com base nas OSs faturadas. O sistema calcula a matriz tributária completa de ICMS, PIS, COFINS, ISS e IVA Dual da Reforma Tributária (IBS e CBS) através do código cClassTrib. Em ambiente de homologação, a transmissão real aguarda certificado A1 e credenciamento oficial na SEFAZ.',
  assistente: 'Para configurar o assistente virtual de voz, acesse o menu Configurações > Assistente Virtual. Você pode personalizar o nome do agente (como Verônica ou Sofia), alternar entre voz feminina e masculina e regular o tom (pitch) e velocidade de fala (rate).',
  financeiro: 'O módulo Financeiro gerencia contas a pagar, contas a receber, saldo consolidado de caixa, fluxo de caixa previsto para 7 e 30 dias e DRE gerencial. Você pode acompanhar vencimentos diários e lançar novos títulos pelo botão Lançar Título.',
  regras_tributarias: 'Em Cadastros > Regras Tributárias, você cadastra as alíquotas fiscais da oficina por CFOP, configurando a tributação tradicional e os novos campos da Reforma Tributária (CBS, IBS estadual/municipal e cClassTrib).',
  whatsapp: 'O módulo WhatsApp & CRM permite conectar o número da oficina para automação de mensagens: aviso de OS aprovada, veículo pronto para retirada e réguas de cobrança preventiva com faturas e relatórios em PDF.',
  geral: 'O Pátio CRM é a plataforma de gestão operacional para oficinas pesadas diesel e mecânicas, unificando pátio, almoxarifado de peças, financeiro, regras tributárias e CRM de pós-venda.'
};

/**
 * Motor Desacoplado de Comandos de Voz e Operação em Linguagem Natural
 * Atende canais Web (microfone navegador) e WhatsApp (áudio PTT e mensagens de texto).
 */

// Memória de ações de alto risco aguardando confirmação explícita (TTL 5 min)
const acoesPendentes = new Map();

// Limpeza periódica de ações pendentes expiradas
setInterval(() => {
  const agora = Date.now();
  for (const [token, item] of acoesPendentes) {
    if (agora > item.expiraEm) acoesPendentes.delete(token);
  }
}, 60 * 1000).unref();

function gerarId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

/**
 * Funções Canônicas de Verificação de Autorização por Papel e Permissões (Strict Default-Deny)
 */
function resolveEffectiveRole(context) {
  if (!context || typeof context !== 'object') return null;
  if (typeof context.role === 'string' && context.role.trim()) {
    return context.role.trim().toLowerCase();
  }
  return null;
}

function canReadFinancial(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('financial:read')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'financeiro', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canWriteFinancial(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('financial:write')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'financeiro', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canDeleteOS(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('os:delete')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canWriteOS(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('os:write')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'gerente', 'atendente', 'consultor', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

function canAdjustInventory(context) {
  if (!context || typeof context !== 'object') return false;
  const perms = Array.isArray(context.permissions) ? context.permissions : [];
  if (perms.includes('*') || perms.includes('inventory:adjust') || perms.includes('inventory:write')) return true;
  const role = resolveEffectiveRole(context);
  if (role && ['admin', 'tenant_admin', 'estoquista', 'compras', 'gerente', 'platform_admin'].includes(role)) {
    return true;
  }
  return false;
}

/**
 * Normaliza número de quilometragem a partir de texto
 * Ex: "82 mil", "82.000", "82000", "128 mil km" -> 82000 / 128000
 */
function normalizarKm(val) {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return null;
  const str = String(val).toLowerCase().replace(/\s+/g, ' ').trim();
  const matchMil = str.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i);
  if (matchMil) {
    const num = parseFloat(matchMil[1].replace(',', '.'));
    return Math.round(num * 1000);
  }
  const digits = str.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/**
 * Normaliza placa veicular brasileira (Mercosul ou Antiga)
 */
function normalizarPlaca(val) {
  if (!val) return null;
  const str = String(val).toUpperCase();
  const match = str.match(/\b([A-Z]{3}[- ]?[0-9][0-9A-Z][0-9]{2})\b/) ||
                str.match(/\b([A-Z]{3}[- ]?[0-9]{4})\b/);
  if (match) return match[1].replace(/[^A-Z0-9]/g, '');
  const limpa = str.replace(/[^A-Z0-9]/g, '');
  if (limpa.length >= 7 && limpa.length <= 8) {
    const m = limpa.match(/^([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[0-9]{4})$/);
    return m ? m[1] : null;
  }
  return null;
}

/**
 * Heurística resiliente para fallback quando IA estiver offline ou em testes locais
 */
function interpretarPorRegras(texto, context = {}, state = {}) {
  const t = (texto || '').toLowerCase().trim();
  const resultado = {
    intencao: 'duvida_geral',
    risco: 'baixo',
    cliente: null,
    veiculo: null,
    os: null,
    correcoes: [],
    itens_solicitados: { servicos: [], pecas: [] },
    resposta_falada: ''
  };

  // 1. Confirmação de ação pendente
  if (/^(sim|confirmar|confirmo|pode confirmar|pode fazer|autorizado|ok)$/i.test(t) || t.startsWith('confirmar') || t.startsWith('confirmo') || (context.confirmToken && /confirm/i.test(t))) {
    resultado.intencao = 'confirmar_acao';
    resultado.resposta_falada = 'Confirmando ação autorizada.';
    return resultado;
  }

  // 2. Cancelamento de ação pendente
  if (/^(não|cancelar|cancela|deixa|esquece|abortar)$/i.test(t) || t.startsWith('cancelar') || t.startsWith('cancela') || (context.confirmToken && /cancel/i.test(t))) {
    resultado.intencao = 'cancelar_acao_pendente';
    resultado.resposta_falada = 'Ação cancelada com sucesso.';
    return resultado;
  }

  // 2.5 Treinamento e Dúvidas Passo a Passo do Sistema
  const isPerguntaAjuda = /^(?:qual o passo a passo|passo a passo|me explica|me ensina|ajuda|manual|tutorial|o que é|o que e)\b/i.test(t) ||
                          t.includes('como faço') || t.includes('como faco') ||
                          t.includes('como abrir') || t.includes('como cadastrar') ||
                          t.includes('como emitir') || t.includes('como faturar') ||
                          t.includes('como lançar') || t.includes('como lancar') ||
                          t.includes('como adicionar') || t.includes('como colocar') ||
                          t.includes('como funciona') || t.includes('como configurar') ||
                          t.includes('onde clico');

  if (isPerguntaAjuda) {
    let topico = 'geral';
    if (t.includes('cliente') || t.includes('transportadora')) {
      topico = 'cliente';
    } else if (t.includes('os') || t.includes('ordem de serviço') || t.includes('ordem de servico') || t.includes('pátio') || t.includes('patio')) {
      topico = 'os';
    } else if (t.includes('peça') || t.includes('peca') || t.includes('serviço') || t.includes('servico')) {
      topico = 'pecas_servicos';
    } else if (t.includes('faturar') || t.includes('faturamento') || t.includes('fechar')) {
      topico = 'faturamento';
    } else if (t.includes('nota') || t.includes('fiscal') || t.includes('nfe') || t.includes('nf-e') || t.includes('nfse') || t.includes('tribut')) {
      topico = 'fiscal';
    } else if (t.includes('assistente') || t.includes('voz') || t.includes('sofia') || t.includes('veronica')) {
      topico = 'assistente';
    } else if (t.includes('financeiro') || t.includes('caixa') || t.includes('pagar') || t.includes('receber')) {
      topico = 'financeiro';
    } else if (t.includes('whatsapp') || t.includes('zap') || t.includes('mensagem')) {
      topico = 'whatsapp';
    } else if (t.includes('regra') || t.includes('cfop')) {
      topico = 'regras_tributarias';
    }

    resultado.intencao = 'ajuda_sistema_treinamento';
    resultado.risco = 'baixo';
    resultado.topico = topico;
    resultado.resposta_falada = BASE_CONHECIMENTO_SISTEMA[topico] || BASE_CONHECIMENTO_SISTEMA.geral;
    return resultado;
  }

  // 2.6 Consultas Financeiras (Vencimentos a Pagar, A Receber, Saldo de Caixa, Faturamento)
  const isConsultaFin = t.includes('vencimento') || t.includes('a pagar') || t.includes('contas a pagar') ||
                        t.includes('a receber') || t.includes('contas a receber') || t.includes('receber de clientes') ||
                        t.includes('saldo atual') || t.includes('saldo do caixa') || t.includes('saldo de caixa') ||
                        t.includes('saldo em caixa') || t.includes('posição do caixa') || t.includes('posicao do caixa') ||
                        (t.includes('saldo') && (t.includes('caixa') || t.includes('atual') || t.includes('hoje'))) ||
                        (t.includes('caixa') && (t.includes('saldo') || t.includes('quanto temos'))) ||
                        t.includes('faturamento') || t.includes('quanto faturamos');

  if (isConsultaFin) {
    resultado.intencao = 'consultar_financeiro';
    resultado.risco = 'baixo';
    if (t.includes('pagar') || t.includes('vencimento') || t.includes('despesa')) {
      resultado.subtipo = 'pagar';
    } else if (t.includes('receber') || t.includes('cliente')) {
      resultado.subtipo = 'receber';
    } else if (t.includes('saldo') || t.includes('caixa')) {
      resultado.subtipo = 'saldo';
    } else if (t.includes('faturamento') || t.includes('faturamos')) {
      resultado.subtipo = 'faturamento';
    } else {
      resultado.subtipo = 'geral';
    }
    resultado.resposta_falada = 'Consultando informações financeiras no sistema.';
    return resultado;
  }

  // 2.7 Consulta de Peças com Estoque Baixo / Crítico
  if (t.includes('estoque baixo') || t.includes('estoque crítico') || t.includes('estoque critico') ||
      t.includes('peças em falta') || t.includes('pecas em falta') ||
      t.includes('repor') || t.includes('para repor') || t.includes('pra repor') ||
      t.includes('peças acabando') || t.includes('pecas acabando')) {
    resultado.intencao = 'consultar_estoque';
    resultado.risco = 'baixo';
    resultado.subtipo = 'critico';
    resultado.resposta_falada = 'Consultando itens com estoque baixo ou crítico para reposição.';
    return resultado;
  }

  // 3. Exclusão de OS (Alto Risco)
  if (/(?:excluir|apagar|deletar|cancelar)\s*(?:a\s+|o\s+)?(?:os|ordem)/i.test(t)) {
    resultado.intencao = 'excluir_os';
    resultado.risco = 'alto';
    const matchNum = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i);
    resultado.os = { num: matchNum ? parseInt(matchNum[1], 10) : null };
    resultado.resposta_falada = 'Atenção: excluir uma Ordem de Serviço é uma ação irreversível.';
    return resultado;
  }

  // 4. Faturamento / Fechamento de OS (Alto Risco)
  if (/(?:faturar|fechar)\s*(?:a\s+|o\s+)?(?:os|ordem)/i.test(t) || t.includes('faturamento da os')) {
    resultado.intencao = 'faturar_os';
    resultado.risco = 'alto';
    const matchNum = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i);
    resultado.os = { num: matchNum ? parseInt(matchNum[1], 10) : null };
    resultado.resposta_falada = 'Atenção: o faturamento de OS gera lançamentos financeiros definitivos.';
    return resultado;
  }

  // 5. Correção de campo (ex: "não, a quilometragem é 128 mil, não 120" ou "km é 128 mil")
  const isAbertura = t.includes('chegou') || t.includes('abrir os') || t.includes('nova os') || t.includes('ordem de serviço') || t.includes('entrada');
  const isEstoque = t.includes('estoque');
  const isCorrecao = t.startsWith('não,') || t.startsWith('nao,') || t.includes('corrige') || t.includes('corrigir') || t.includes('ajuste') || t.includes('ajustar') || t.includes('muda') || t.includes('mudar') || (t.includes('quilometragem é') || t.includes('km é'));
  if (!isAbertura && !isEstoque && (isCorrecao || (!t.includes('chegou') && (t.startsWith('não') || t.startsWith('nao'))))) {
    const kmEncontrado = normalizarKm(t);
    if (kmEncontrado) {
      resultado.intencao = 'corrigir_campo';
      resultado.risco = 'baixo';
      resultado.correcoes.push({ campo: 'km', valor: kmEncontrado });
      resultado.resposta_falada = `Quilometragem ajustada para ${kmEncontrado.toLocaleString('pt-BR')} km.`;
      return resultado;
    }
  }

  // 5.5 Inspeção Técnica / Diagnóstico por voz
  if (t.includes('inspeção') || t.includes('inspecao') || t.includes('laudo') || t.includes('constatado') || t.includes('identifiquei') || t.includes('folga no') || t.includes('folga na') || t.includes('folga excessiva')) {
    resultado.intencao = 'registrar_inspecao_voz';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Identificando itens apontados na inspeção técnica.';
    return resultado;
  }

  // 6. Adição de queixa em OS existente ("coloca também que...", "adiciona que...", "anota também...")
  const matchAdicionarQueixa = t.match(/^(?:coloca(?:|r)|adiciona(?:|r)|anota(?:|r)|marca(?:|r)|inclui(?:|r))?\s*(?:também|tambem|mais)?\s*(?:que|o|a)?\s*(.+)$/i);
  const termosQueixa = ['ar não tá gelando', 'ar nao ta gelando', 'barulho', 'vazamento', 'fumaça', 'falhando', 'queixa', 'reclamou', 'não gela', 'nao gela', 'vibrando', 'estralando'];
  const temTermoQueixa = termosQueixa.some(termo => t.includes(termo));

  if ((t.includes('coloca também') || t.includes('coloca tambem') || t.includes('adiciona que') || t.includes('anota que') || (temTermoQueixa && !t.includes('chegou') && !t.includes('abrir os')))) {
    let textoQueixa = t.replace(/^(?:coloca(?:|r)|adiciona(?:|r)|anota(?:|r))\s*(?:também|tambem)?\s*(?:que)?\s*/i, '').trim();
    if (textoQueixa) {
      // Capitaliza primeira letra
      textoQueixa = textoQueixa.charAt(0).toUpperCase() + textoQueixa.slice(1);
      resultado.intencao = 'adicionar_reclamacao';
      resultado.risco = 'baixo';
      resultado.os = {
        id_alvo: context.activeOsId || null,
        reclamacoes: [textoQueixa]
      };
      resultado.resposta_falada = `Reclamação anotada: "${textoQueixa}".`;
      return resultado;
    }
  }

  // 7. Abertura de OS (Check-in veicular)
  // Ex: "chegou aqui um Onix branco 2021 do Carlos. Tá com 82 mil quilômetros. Cliente falou que quando freia, faz um barulho na roda dianteira direita e o volante tá vibrando"
  if (t.includes('chegou') || t.includes('abrir os') || t.includes('nova os') || t.includes('ordem de serviço') || t.includes('entrada de veículo') || t.includes('entrada do') || t.includes('entrada da')) {
    resultado.intencao = 'abrir_os';
    resultado.risco = 'baixo';

    // Extração de cliente ("do Carlos", "cliente Carlos", "para a TransRodrigues")
    let clienteNome = '';
    const matchCliente = t.match(/(?:do|da|cliente|proprietário|dono)\s+([A-ZÀ-Úa-zà-ú0-9\s]+?)(?=\.|\,|\stá|\st[\u00e1a]|\sano|\skm|\scom|\splaca|$)/i);
    if (matchCliente) {
      clienteNome = matchCliente[1].trim();
      clienteNome = clienteNome.replace(/^(o|a|os|as)\s+/i, '');
    }

    // Extração de veículo
    let marca = '';
    let modelo = '';
    let cor = '';
    let ano = '';

    const modelosConhecidos = [
      { modelo: 'Onix', marca: 'Chevrolet', tipo: 'Passeio' },
      { modelo: 'Prisma', marca: 'Chevrolet', tipo: 'Passeio' },
      { modelo: 'S10', marca: 'Chevrolet', tipo: 'Picape' },
      { modelo: 'Gol', marca: 'Volkswagen', tipo: 'Passeio' },
      { modelo: 'Constellation 24.280', marca: 'Volkswagen', tipo: 'Truck' },
      { modelo: 'Constellation', marca: 'Volkswagen', tipo: 'Truck' },
      { modelo: 'Delivery', marca: 'Volkswagen', tipo: 'VUC' },
      { modelo: 'R 450', marca: 'Scania', tipo: 'Cavalo Mecânico' },
      { modelo: 'Scania', marca: 'Scania', tipo: 'Cavalo Mecânico' },
      { modelo: 'FH 540', marca: 'Volvo', tipo: 'Cavalo Mecânico' },
      { modelo: 'FH', marca: 'Volvo', tipo: 'Cavalo Mecânico' },
      { modelo: 'VM', marca: 'Volvo', tipo: 'Truck' },
      { modelo: 'Actros 2651', marca: 'Mercedes-Benz', tipo: 'Cavalo Mecânico' },
      { modelo: 'Actros', marca: 'Mercedes-Benz', tipo: 'Cavalo Mecânico' },
      { modelo: 'Axor', marca: 'Mercedes-Benz', tipo: 'Cavalo Mecânico' },
      { modelo: 'Atego', marca: 'Mercedes-Benz', tipo: 'Truck' },
      { modelo: 'Accelo', marca: 'Mercedes-Benz', tipo: 'VUC' },
      { modelo: 'Hi-Way', marca: 'Iveco', tipo: 'Bitrem Graneleiro' },
      { modelo: 'Daily', marca: 'Iveco', tipo: 'VUC' },
      { modelo: 'XF 480', marca: 'DAF', tipo: 'Cavalo Mecânico' },
      { modelo: 'Hilux', marca: 'Toyota', tipo: 'Picape' },
      { modelo: 'Corolla', marca: 'Toyota', tipo: 'Passeio' },
      { modelo: 'Strada', marca: 'Fiat', tipo: 'Picape' },
      { modelo: 'Toro', marca: 'Fiat', tipo: 'Picape' }
    ];

    for (const m of modelosConhecidos) {
      if (new RegExp('\\b' + m.modelo + '\\b', 'i').test(t)) {
        modelo = m.modelo;
        marca = m.marca;
        break;
      }
    }

    // Cores comuns
    const cores = ['branco', 'branca', 'preto', 'preta', 'prata', 'cinza', 'vermelho', 'vermelha', 'azul', 'amarelo', 'verde'];
    for (const c of cores) {
      if (new RegExp('\\b' + c + '\\b', 'i').test(t)) {
        cor = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
        if (cor === 'Branca') cor = 'Branco';
        if (cor === 'Preta') cor = 'Preto';
        if (cor === 'Vermelha') cor = 'Vermelho';
        break;
      }
    }

    // Ano (2000 a 2030)
    const matchAno = t.match(/\b(20[0-2][0-9])\b/);
    if (matchAno) ano = matchAno[1];

    // Quilometragem
    const km = normalizarKm(t);

    // Placa
    const placa = normalizarPlaca(t);

    // Reclamações e sintomas informados pelo cliente
    const reclamacoes = [];
    const matchQueixa = t.match(/(?:falou que|reclamou que|disse que|relatou que|reclamação|queixa|sintoma)\s+(.+)$/i);
    if (matchQueixa) {
      let parteQueixa = matchQueixa[1].trim();
      const frases = parteQueixa.split(/(?:\s+e\s+o\s+|\s+e\s+a\s+|\s+e\s+|\.\s*)/i);
      frases.forEach(f => {
        const limp = f.trim();
        if (limp.length > 3) {
          reclamacoes.push(limp.charAt(0).toUpperCase() + limp.slice(1));
        }
      });
    } else if (temTermoQueixa) {
      reclamacoes.push('Verificar barulho/anomalia relatada na recepção.');
    }

    resultado.cliente = { nome: clienteNome || 'Cliente Recepção', fone: '' };
    resultado.veiculo = {
      marca: marca || 'Veículo',
      modelo: modelo || 'Geral',
      ano: ano || new Date().getFullYear().toString(),
      cor: cor || 'Não informada',
      km: km || 0,
      placa: placa || null,
      tipo: 'Passeio'
    };

    let boxEscolhido = null;
    const matchBox = t.match(/\b(?:colocar\s+(?:no\s+|para\s+o\s+)?box|direcionar\s+(?:para\s+o\s+|ao\s+)?box|no\s+box|box\s*:?)\s*(?:b)?([1-6]|um|dois|tr[eê]s|quatro|cinco|seis)\b/i) ||
                     t.match(/\bbox\s*(?:b)?([1-6])\b/i);
    if (matchBox) {
      const mapaNum = { '1': 'b1', 'um': 'b1', '2': 'b2', 'dois': 'b2', '3': 'b3', 'tres': 'b3', 'três': 'b3', '4': 'b4', 'quatro': 'b4', '5': 'b5', 'cinco': 'b5', '6': 'b6', 'seis': 'b6' };
      const raw = matchBox[1].toLowerCase();
      boxEscolhido = mapaNum[raw] || ('b' + raw);
    }

    resultado.os = {
      box: boxEscolhido,
      km: km || 0,
      reclamacoes: reclamacoes.length > 0 ? reclamacoes : ['Revisão geral e inspeção preventiva de entrada.']
    };

    resultado.resposta_falada = `Certo, registrei a entrada do ${resultado.veiculo.modelo} ${resultado.veiculo.cor} do cliente ${resultado.cliente.nome}.`;
    return resultado;
  }

  // 7.1 Gestão Operacional Proativa (Reconhecimento, Gargalos, Entregas, Alertas, Resumo)
  if (t.includes('ciente') || t === 'ok' || t.includes('já estou vendo') || t.includes('ja estou vendo') || t.includes('anotado') || t.includes('reconhecido')) {
    resultado.intencao = 'reconhecer_alerta';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Registrando ciência do alerta operacional.';
    return resultado;
  }

  if (t.includes('maior gargalo') || t.includes('qual o gargalo') || t.includes('onde está o gargalo') || t.includes('onde esta o gargalo')) {
    resultado.intencao = 'consultar_gargalo_operacao';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando os principais gargalos operacionais da oficina.';
    return resultado;
  }

  if (t.includes('entrega em risco') || t.includes('entregas em risco') || t.includes('entrega atrasada') || t.includes('entregas atrasadas') || t.includes('entregas de hoje')) {
    resultado.intencao = 'consultar_entregas_risco';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando status das entregas previstas para hoje.';
    return resultado;
  }

  if (t.includes('minha atenção') || t.includes('minha atencao') || t.includes('precisa de atenção') || t.includes('precisa de atencao') || t.includes('algum alerta') || t.includes('alertas da oficina') || t.includes('alertas operacionais')) {
    resultado.intencao = 'consultar_alertas_operacao';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Verificando alertas operacionais que exigem atenção.';
    return resultado;
  }

  if (t.includes('como está a oficina') || t.includes('como esta a oficina') || t.includes('como tá a oficina') || t.includes('como ta a oficina') || t.includes('como está o pátio') || t.includes('como esta o patio') || t.includes('como tá o pátio') || t.includes('como ta o patio') || t.includes('resumo da oficina') || t.includes('resumo do pátio') || t.includes('resumo do patio')) {
    resultado.intencao = 'consultar_resumo_operacional';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando o resumo operacional da oficina.';
    return resultado;
  }

  // 7.2 Gestão de Orçamentos e Inspeção Técnica por Voz
  if ((t.includes('orçamento') || t.includes('orcamento') || t.includes('aprovação') || t.includes('aprovacao') || t.includes('quem não aprovou') || t.includes('quem nao aprovou') || t.includes('orçamentos pendentes') || t.includes('orcamentos pendentes')) && !t.includes('margem') && !t.includes('desconto')) {
    if ((t.includes('adicionar') || t.includes('incluir') || t.includes('colocar')) && (t.includes('r$') || t.includes('reais') || t.includes('peça') || t.includes('peca') || t.includes('serviço') || t.includes('servico'))) {
      resultado.intencao = 'adicionar_item_orcamento';
      resultado.risco = 'alto'; // Ação financeira crítica exige confirmação explícita
      resultado.resposta_falada = 'Atenção: Adicionar item com valor financeiro altera o orçamento a ser aprovado pelo cliente. Deseja realmente confirmar?';
      return resultado;
    }
    resultado.intencao = 'consultar_orcamento';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando situação dos orçamentos da oficina.';
    return resultado;
  }

  if (t.includes('inspeção') || t.includes('inspecao') || t.includes('laudo') || t.includes('constatado') || t.includes('folga no') || t.includes('folga na') || t.includes('vazamento no') || t.includes('trinca no')) {
    resultado.intencao = 'registrar_inspecao_voz';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Identificando itens apontados na inspeção técnica.';
    return resultado;
  }

  // 7.3 Gestão de Peças, Estoque e Compras por Voz
  // Ações de Alto Risco (Ajuste de estoque, cancelamento de pedido, aprovação de compra acima da alçada):
  if (t.includes('ajustar estoque') || t.includes('ajuste de estoque') || t.includes('mudar estoque') || t.includes('cancelar pedido') || t.includes('cancela pedido') || t.includes('aprovar compra') || t.includes('aprova compra')) {
    if (t.includes('cancelar pedido') || t.includes('cancela pedido')) {
      resultado.intencao = 'cancelar_pedido_compra';
    } else if (t.includes('aprovar compra') || t.includes('aprova compra')) {
      resultado.intencao = 'aprovar_compra';
    } else {
      resultado.intencao = 'ajustar_estoque';
    }
    resultado.risco = 'alto';
    resultado.resposta_falada = 'Atenção: Esta é uma operação crítica de almoxarifado/compras e exige confirmação explícita. Deseja realmente confirmar?';
    return resultado;
  }

  // Ação de Reserva por Voz: "reserva 2 buchas para a OS 8921" / "reservar duas peças para a os 101"
  if ((t.includes('reserva') || t.includes('reservar')) && (t.includes('para a os') || t.includes('para o os') || t.includes('pra os') || t.includes('na os') || t.includes('para os'))) {
    resultado.intencao = 'reservar_peca_os';
    resultado.risco = 'baixo';
    const matchQtd = t.match(/\b(\d+)\b/);
    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i);
    resultado.reserva = {
      quantidade: matchQtd ? parseInt(matchQtd[1], 10) : 1,
      osNum: matchOS ? parseInt(matchOS[1], 10) : null
    };
    resultado.resposta_falada = 'Processando reserva de peça no almoxarifado para a ordem de serviço.';
    return resultado;
  }

  // Consultas sobre Peças, Falta, Pedidos e Fornecedores:
  if (t.includes('aguardando peças') || t.includes('aguardando pecas') || t.includes('esperando peça') || t.includes('esperando peca') || t.includes('falta de peças')) {
    resultado.intencao = 'consultar_os_aguardando_pecas';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando ordens de serviço aguardando peças.';
    return resultado;
  }

  if (t.includes('faltando comprar') || t.includes('falta comprar') || t.includes('precisa comprar') || t.includes('o que falta comprar') || t.includes('peças para comprar') || t.includes('compras pendentes')) {
    resultado.intencao = 'consultar_compras_pendentes';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Verificando a lista de necessidades de peças aguardando compra.';
    return resultado;
  }

  if (t.includes('pedidos atrasados') || t.includes('pedido atrasado') || t.includes('compras atrasadas') || t.includes('peça atrasada')) {
    resultado.intencao = 'consultar_pedidos_atrasados';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Verificando se há pedidos de compra com prazo prometido em atraso.';
    return resultado;
  }

  if (t.includes('qual fornecedor tem') || t.includes('quem tem essa peça') || t.includes('fornecedor tem') || t.includes('fornecedor de')) {
    resultado.intencao = 'consultar_fornecedor_peca';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando fornecedores que fornecem esse componente.';
    return resultado;
  }

  if (t.includes('temos') || t.includes('quanto temos de estoque') || t.includes('quantas buchas') || t.includes('quantos terminais') || t.includes('quanto de estoque') || t.includes('saldo da peça') || t.includes('tem estoque') || t.includes('estoque de') || t.includes('estoque da') || t.includes('estoque do')) {
    resultado.intencao = 'consultar_estoque_peca';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando saldo físico e disponível no almoxarifado.';
    return resultado;
  }

  // 7.4 Apontamento de Mão de Obra e Ações de Equipe por Voz
  if (t.includes('vou começar') || t.includes('começar o') || t.includes('comeca o') || t.includes('comece o') || t.includes('começar a') || t.includes('iniciar serviço') || t.includes('inicia o') || t.includes('iniciar o') || t.includes('começar')) {
    resultado.intencao = 'iniciar_servico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Iniciando apontamento de serviço.';
    return resultado;
  }

  if (t.includes('pausa') || t.includes('pausar')) {
    resultado.intencao = 'pausar_servico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Pausando serviço do mecânico.';
    return resultado;
  }

  if (t.includes('retomar') || t.includes('retoma') || t.includes('pode retomar')) {
    resultado.intencao = 'retomar_servico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Retomando apontamento de serviço.';
    return resultado;
  }

  if (t.includes('finalizei') || t.includes('finalizar serviço') || t.includes('terminei') || t.includes('concluí o serviço') || t.includes('conclui o serviço')) {
    resultado.intencao = 'encerrar_servico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Encerrando serviço e registrando duração final.';
    return resultado;
  }

  if (t.includes('quem está livre') || t.includes('quem ta livre') || t.includes('mecanicos livres') || t.includes('mecânicos livres')) {
    resultado.intencao = 'consultar_equipe_livre';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando colaboradores livres no momento.';
    return resultado;
  }

  if (t.includes('trabalhando') && (t.includes('em que') || t.includes('o que') || t.includes('onde') || t.includes('qual os'))) {
    resultado.intencao = 'consultar_mecanico_trabalho';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando atividade atual do colaborador.';
    return resultado;
  }

  if (t.includes('quem está no box') || t.includes('quem tá no box') || t.includes('quem ta no box')) {
    resultado.intencao = 'consultar_box_mecanico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando ocupação do box selecionado.';
    return resultado;
  }

  if (t.includes('quanto tempo gastamos na os') || t.includes('quanto tempo na os') || t.includes('tempo gasto na os') || (t.includes('quanto tempo') && t.includes('nessa os'))) {
    resultado.intencao = 'consultar_tempo_os';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Calculando tempo total acumulado de mão de obra na ordem de serviço.';
    return resultado;
  }

  if (t.includes('mais horas produtivas') || t.includes('mais produtivo')) {
    resultado.intencao = 'consultar_mecanico_mais_produtivo';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando dados de produtividade da equipe.';
    return resultado;
  }

  if (t.includes('retrabalho')) {
    resultado.intencao = 'consultar_retrabalho';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando indicadores de retrabalho da oficina.';
    return resultado;
  }

  if (t.includes('custo real de mão de obra') || t.includes('custo de mão de obra') || t.includes('custo da mão de obra')) {
    resultado.intencao = 'consultar_custo_mao_obra_os';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Calculando custo real de mão de obra da OS.';
    return resultado;
  }

  if (t.includes('margem da os') || t.includes('quanto essa os custou de verdade') || t.includes('custou de verdade') || t.includes('qual a margem') || t.includes('custo real da os')) {
    resultado.intencao = 'consultar_custo_real_os';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Calculando custo real consolidado e margem da ordem de serviço.';
    return resultado;
  }

  // ── 14. INTENÇÕES DE PRECIFICAÇÃO E RENTABILIDADE ────────────
  if (t.includes('desconto sem cair') || t.includes('desconto seguro') || t.includes('quanto posso dar de desconto') || t.includes('quanto de desconto posso dar') || (t.includes('desconto') && t.includes('margem'))) {
    resultado.intencao = 'consultar_desconto_seguro';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Calculando desconto máximo seguro sem romper a margem mínima.';
    return resultado;
  }

  if (t.includes('quanto deveríamos cobrar') || t.includes('quanto deveriamos cobrar') || t.includes('quanto cobrar') || t.includes('sugestão de preço') || t.includes('sugestao de preco') || t.includes('preço sugerido')) {
    resultado.intencao = 'consultar_sugestao_preco';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Calculando recomendação de preço com base no histórico real.';
    return resultado;
  }

  if (t.includes('qual a margem desse orçamento') || t.includes('qual a margem do orçamento') || t.includes('margem desse orçamento') || t.includes('margem do orcamento') || (t.includes('margem') && t.includes('orçamento'))) {
    resultado.intencao = 'consultar_margem_orcamento';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Analisando margem estimada do orçamento.';
    return resultado;
  }

  if (t.includes('pouca margem') || t.includes('menor margem') || t.includes('menos rentáveis') || t.includes('menos rentaveis')) {
    resultado.intencao = 'consultar_servicos_pouca_margem';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando serviços com menor margem recente.';
    return resultado;
  }

  if (t.includes('mais retrabalho') || t.includes('maior retrabalho')) {
    resultado.intencao = 'consultar_servico_mais_retrabalho';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando serviços com maior índice de retrabalho.';
    return resultado;
  }

  if (t.includes('quanto custa em média') || t.includes('quanto custa em media') || t.includes('custo médio de fazer') || t.includes('custo medio de fazer') || (t.includes('quanto custa') && t.includes('serviço'))) {
    resultado.intencao = 'consultar_custo_medio_servico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Calculando custo médio histórico para este serviço.';
    return resultado;
  }

  if (t.includes('cobrando barato') || t.includes('preço está bom') || t.includes('preco esta bom') || t.includes('preço tá bom')) {
    resultado.intencao = 'consultar_adequacao_preco_servico';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Avaliando adequação do preço em relação ao custo esperado.';
    return resultado;
  }

  if ((t.includes('altera o') || t.includes('alterar o') || t.includes('muda o') || t.includes('coloca r$') || t.includes('colocar r$')) && (t.includes('r$') || t.includes('reais') || /\b\d{3,5}\b/.test(t))) {
    resultado.intencao = 'alterar_preco_servico';
    resultado.risco = 'medio';
    resultado.resposta_falada = 'Validando proposta de alteração de preço contra política de margem.';
    return resultado;
  }

  // ── 15. INTENÇÕES DE CRM, FROTAS E MANUTENÇÃO PREVENTIVA ─────────
  if (t.includes('perto da revisão') || t.includes('perto da revisao') || t.includes('manutenção vencida') || t.includes('manutencao vencida') || t.includes('revisão vencida') || t.includes('revisao vencida') || t.includes('próximos de manutenção') || t.includes('proximos de manutencao')) {
    resultado.intencao = 'consultar_preventiva_frota';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando manutenções preventivas próximas e vencidas.';
    return resultado;
  }

  if (t.includes('quantos veículos') || t.includes('quantos veiculos') || t.includes('quantos caminhões') || t.includes('quantos caminhoes') || t.includes('veículos dela') || t.includes('veiculos dela') || (t.includes('frota') && t.includes('oficina'))) {
    resultado.intencao = 'consultar_frota_cliente';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando veículos da frota no cadastro e na oficina.';
    return resultado;
  }

  if (t.includes('precisam de contato') || t.includes('precisam ser contatados') || t.includes('mais tempo sem retornar') || t.includes('frotistas inativos')) {
    resultado.intencao = 'consultar_contatos_crm';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando oportunidades de contato e clientes com retorno pendente.';
    return resultado;
  }

  if (t.includes('última manutenção') || t.includes('ultima manutencao') || t.includes('próxima revisão') || t.includes('proxima revisao') || t.includes('próxima manutenção') || t.includes('proxima manutencao')) {
    resultado.intencao = 'consultar_manutencao_veiculo';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando histórico e previsão de manutenção para este veículo.';
    return resultado;
  }

  if (t.includes('pós-venda pendente') || t.includes('pos-venda pendente') || t.includes('pos venda pendente') || t.includes('pós venda pendente')) {
    resultado.intencao = 'consultar_pos_venda';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Verificando acompanhamentos de pós-venda pendentes para hoje.';
    return resultado;
  }

  if (t.includes('agenda a') || t.includes('agendar a') || t.includes('agende a') || (t.includes('agenda') && (t.includes('terça') || t.includes('segunda') || t.includes('quarta') || t.includes('quinta') || t.includes('sexta') || t.includes('sábado') || t.includes('amanhã') || t.includes('manha') || t.includes('tarde')))) {
    resultado.intencao = 'agendar_veiculo';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Processando agendamento solicitado.';
    return resultado;
  }

  // 8. Consulta de Status / Caixa / Pátio
  if (t.includes('status') || t.includes('como tá') || t.includes('como esta') || t.includes('onde tá') || t.includes('onde esta') || t.includes('saldo') || t.includes('caixa')) {
    resultado.intencao = 'consultar_status';
    resultado.risco = 'baixo';
    resultado.resposta_falada = 'Consultando informações solicitadas no sistema.';
    return resultado;
  }

  return resultado;
}

/**
 * Prompt para extração profunda com Gemini 2.5 Flash
 */
function construirPromptIA(contextoInfo, catalogoServicos = [], catalogoPecas = []) {
  return `Você é o Motor de Inteligência Operacional do Pátio CRM (gestão para oficinas mecânicas pesadas diesel e leves).
Sua missão é interpretar a fala natural de mecânicos, gerentes de pátio e proprietários da oficina (que muitas vezes falam informalmente, com gírias e as mãos na graxa) e transformá-la em uma AÇÃO ESTRUTURADA DE NEGÓCIO.

CONTEXTO ATUAL DO OPERADOR:
${JSON.stringify(contextoInfo, null, 2)}

CATÁLOGO RESUMIDO DE SERVIÇOS DA OFICINA:
${JSON.stringify(catalogoServicos.slice(0, 15), null, 2)}

CATÁLOGO RESUMIDO DE PEÇAS:
${JSON.stringify(catalogoPecas.slice(0, 15), null, 2)}

REGRAS CRÍTICAS DE NEGÓCIO DA OFICINA:
1. RECLAMAÇÃO/SINTOMA DO CLIENTE vs DIAGNÓSTICO/SERVIÇO COBRADO:
   - Toda queixa ou relato de defeito ("barulho na roda", "volante vibrando", "não gela", "pedal baixo", "fumaça preta", "motor engasgando") DEVE ser gravado no array "os.reclamacoes".
   - NUNCA transforme um relato de problema em serviço ou peça faturada antes do orçamento! Isso é um sintoma do cliente, não um serviço aprovado.
   - Só coloque itens em "itens_solicitados.servicos" ou "itens_solicitados.pecas" se o operador ordenar explicitamente a execução de um trabalho ou uso de peça (ex: "adicione o serviço de troca de óleo", "coloque 2 filtros racor").
2. CONTEXTO E CONTINUIDADE:
   - Se o operador disser "coloca também que...", "adiciona...", "mais uma coisa: o ar não gela", associe isso imediatamente à OS ativa indicada no contexto ("activeOsId"), sem exigir que ele repita a placa ou o cliente.
   - Se o operador disser "não, a quilometragem é 128 mil, não 120", interprete como intencao="corrigir_campo" com campo="km" e valor=128000.
3. CONVERSÃO DE UNIDADES E NÚMEROS:
   - "82 mil" = 82000; "128 mil" = 128000; "duzentos e cinquenta mil" = 250000.
4. CLASSIFICAÇÃO DE RISCO:
   - baixo: abrir_os, adicionar_reclamacao, corrigir_campo, consultar_status, mover_box livre.
   - medio: box já ocupado (conflito de espaço), múltiplos clientes homônimos.
   - alto: excluir_os, cancelar_os, faturar_os/fechar caixa (exige confirmação do operador).
5. RESPOSTA FALADA (HUMANA E CURTA):
   - Gere uma resposta concisa, educada e direta em português brasileiro (1 a 2 frases no máximo), ideal para ser falada via sintetizador de áudio para o mecânico que está com as mãos ocupadas. Ex: "Certo! Abri a OS #1049 para o Onix branco do Carlos com 82 mil km e anotei as queixas do freio e da vibração."

RETORNE APENAS UM JSON VÁLIDO SEGUINDO ESTE ESQUEMA:
{
  "intencao": "abrir_os" | "adicionar_reclamacao" | "corrigir_campo" | "adicionar_itens" | "mover_box" | "consultar_status" | "excluir_os" | "faturar_os" | "consultar_financeiro" | "consultar_estoque" | "ajuda_sistema_treinamento" | "duvida_geral" | "confirmar_acao" | "cancelar_acao_pendente",
  "risco": "baixo" | "medio" | "alto",
  "motivo_risco": "string explicativa se medio ou alto",
  "cliente": {
    "nome": "Nome do cliente",
    "fone": "telefone se houver"
  },
  "veiculo": {
    "marca": "ex: Chevrolet, Scania, Volvo, etc.",
    "modelo": "ex: Onix, FH 540, etc.",
    "ano": "YYYY",
    "cor": "ex: Branco",
    "placa": "ABC1234 ou null",
    "km": 82000,
    "tipo": "Passeio" | "Cavalo Mecânico" | "Truck" | "Picape" | "VUC"
  },
  "os": {
    "id_alvo": "id se referenciou uma OS específica ou null",
    "num": null,
    "box": null,
    "km": 82000,
    "reclamacoes": ["Sintoma 1", "Sintoma 2"]
  },
  "correcoes": [
    { "campo": "km" | "placa" | "cor" | "modelo" | "cliente", "valor": "novo valor" }
  ],
  "itens_solicitados": {
    "servicos": [ { "nome": "nome", "qtd": 1, "valor": 0 } ],
    "pecas": [ { "nome": "nome", "qtd": 1, "valor": 0 } ]
  },
  "resposta_falada": "Mensagem curta, humana e natural para confirmação ao operador."
}`;
}

/**
 * Interpretação Multimodal: Texto ou Áudio via Gemini AI (com fallback por regras)
 */
async function interpretarComando({ input, context = {}, state = {}, aiClient = null }) {
  const rawInput = typeof input === 'string' ? { text: input } : (input || {});
  const { text, audioBase64, mimeType } = rawInput;

  // Se Gemini AI disponível e configurado
  if (aiClient && (text || audioBase64)) {
    try {
      const contextoInfo = {
        canal: context.canal || 'web',
        activeOsId: context.activeOsId || null,
        activeVehicleId: context.activeVehicleId || null,
        activeClientId: context.activeClientId || null,
        remetente: context.remetente || 'Operador',
        isSenderAdmin: !!context.isSenderAdmin,
        isContextOperacao: !!context.isContextOperacao
      };

      const catalogoServicos = (state.servicos || []).map(s => ({ id: s.id, nome: s.nome, valor: s.valor }));
      const catalogoPecas = (state.pecas || []).map(p => ({ id: p.id, nome: p.nome, venda: p.venda }));

      const systemPrompt = construirPromptIA(contextoInfo, catalogoServicos, catalogoPecas);

      const parts = [];
      if (audioBase64) {
        let cleanBase64 = audioBase64;
        let cleanMime = mimeType || 'audio/webm';
        const m = audioBase64.match(/^data:(.+);base64,(.+)$/);
        if (m) {
          cleanMime = m[1].split(';')[0];
          cleanBase64 = m[2];
        }
        parts.push({ inlineData: { mimeType: cleanMime, data: cleanBase64 } });
        parts.push({ text: `Interprete o áudio falado pelo operador no contexto da oficina mecânica e retorne o JSON estrito.` });
      } else {
        parts.push({ text: `Comando falado ou digitado pelo operador: "${text}"\nInterprete e retorne o JSON estrito.` });
      }

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              ...parts
            ]
          }
        ]
      });

      const parsed = safeJsonParse(response.text);
      if (parsed && parsed.intencao) {
        return parsed;
      }
    } catch (err) {
      console.warn('[VoiceActionEngine] Erro ao consultar Gemini AI, acionando fallback por regras:', err.message);
    }
  }

  // Fallback por regras heurísticas caso o Gemini não esteja configurado ou ocorra falha de rede/cota
  return interpretarPorRegras(text || '', context, state);
}

/**
 * Executa as ações de negócio identificadas no Estado Global (globalState)
 */
async function executarAcao({ interpretado, input, context = {}, state = {} }) {
  if (!state.os) state.os = [];
  if (!state.veiculos) state.veiculos = [];
  if (!state.clientes) state.clientes = [];
  if (!state.boxes) state.boxes = [];
  if (!state.auditoria) state.auditoria = [];

  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const t = rawText.trim();
  const tLower = t.toLowerCase();

  const dataHoje = new Date().toISOString().slice(0, 10);
  const intencao = interpretado.intencao || 'duvida_geral';

  // ── 1. CONFIRMAÇÃO DE AÇÃO DE ALTO RISCO / PRÉ-OS ───────
  if (intencao === 'confirmar_acao') {
    let token = context.confirmToken;
    if (!token && context.canal) {
      for (const [t, a] of acoesPendentes) {
        if (a.context?.canal === context.canal &&
            (!context.remetente || a.context?.remetente === context.remetente)) {
          token = t;
          break;
        }
      }
    }

    if (!token) {
      return {
        ok: false,
        acao: 'confirmar_acao',
        negado: true,
        resposta: 'Não há token de confirmação informado para a ação.'
      };
    }

    const shouldAutoConsume = context.autoConsumirToken === true;
    const validacao = shouldAutoConsume
      ? consumirTokenAcao(token, {
          tenantId: context.tenantId,
          actorId: context.actorId
        })
      : validarTokenAcao(token, {
          tenantId: context.tenantId,
          actorId: context.actorId
        });

    if (!validacao.ok) {
      return {
        ok: false,
        acao: 'confirmar_acao',
        negado: true,
        resposta: validacao.error || 'Token de confirmação inválido ou expirado.'
      };
    }

    let acaoPendente = acoesPendentes.get(token);
    if (!acaoPendente) {
      return {
        ok: false,
        acao: 'confirmar_acao',
        resposta: 'Não há nenhuma ação pendente aguardando confirmação no momento.'
      };
    }

    if (acaoPendente.context?.tenantId && context.tenantId && acaoPendente.context.tenantId !== context.tenantId) {
      if (shouldAutoConsume) acoesPendentes.delete(token);
      return {
        ok: false,
        acao: 'confirmar_acao',
        resposta: 'Violação de isolamento: token pertence a outro tenant.'
      };
    }

    if (acaoPendente.context?.actorId && context.actorId && acaoPendente.context.actorId !== context.actorId) {
      if (shouldAutoConsume) acoesPendentes.delete(token);
      return {
        ok: false,
        acao: 'confirmar_acao',
        resposta: 'Ação só pode ser confirmada pelo mesmo operador que a solicitou.'
      };
    }

    if (shouldAutoConsume) {
      acoesPendentes.delete(token);
    } else {
      acaoPendente.emProcessamento = true;
    }

    if (acaoPendente.preOSId) {
      const tenantId = context.tenantId || acaoPendente.context?.tenantId || 'default';
      const conv = preOSEngine.converterEmOS({
        tenantId,
        preOSId: acaoPendente.preOSId,
        state,
        actorId: context.actorId || acaoPendente.context?.actorId || 'operador'
      });
      if (!conv.ok) {
        return conv;
      }
      return {
        ok: true,
        acao: 'abrir_os',
        osId: conv.os.id,
        numOS: conv.os.num,
        veiculoId: conv.os.vei,
        clienteId: conv.os.cli,
        preOSId: acaoPendente.preOSId,
        possivelGarantia: conv.preOS.possivelGarantia,
        resposta: `Abertura confirmada! OS #${conv.os.num} gerada com sucesso a partir da Pré-OS.${conv.preOS.possivelGarantia ? ' (Identificado possível retorno em garantia)' : ''}`
      };
    }

    // Executa a ação guardada com autorização interna comprovada
    return await executarAcao({
      interpretado: acaoPendente.interpretado,
      input: acaoPendente.input,
      context: { ...acaoPendente.context, _confirmadoInternamente: true, preOSConfirmada: true },
      state
    });
  }

  // Cancelamento de ação pendente
  if (intencao === 'cancelar_acao_pendente') {
    let token = context.confirmToken;
    if (!token && context.canal) {
      for (const [t, a] of acoesPendentes) {
        if (a.context?.canal === context.canal &&
            (!context.remetente || a.context?.remetente === context.remetente)) {
          token = t;
          break;
        }
      }
    }
    let preOSId = null;
    if (token && acoesPendentes.has(token)) {
      const p = acoesPendentes.get(token);
      preOSId = p.preOSId;
      acoesPendentes.delete(token);
    }
    if (preOSId) {
      const tenantId = context.tenantId || 'default';
      preOSEngine.cancelarPreOS({
        tenantId,
        preOSId,
        motivo: 'Operador cancelou a abertura após alerta de histórico',
        state,
        actorId: context.actorId || 'operador'
      });
    }
    return {
      ok: true,
      acao: 'cancelar_acao_pendente',
      preOSId,
      resposta: 'Abertura cancelada com segurança. A Pré-OS foi mantida como cancelada no histórico técnico.'
    };
  }

  // ── 1.9 AUTORIZAÇÃO PRÉVIA POR INTENÇÃO E AÇÃO ──────────
  if (intencao === 'faturar_os') {
    if (!canWriteFinancial(context) || !canWriteOS(context)) {
      return {
        ok: false,
        acao: 'faturar_os',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para faturar ordens de serviço.'
      };
    }
  }

  if (intencao === 'excluir_os') {
    if (!canDeleteOS(context)) {
      return {
        ok: false,
        acao: 'excluir_os',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para excluir ordens de serviço.'
      };
    }
  }

  if (intencao === 'abrir_os') {
    if (!canWriteOS(context)) {
      return {
        ok: false,
        acao: 'abrir_os',
        negado: true,
        resposta: 'Acesso negado: seu perfil possui permissão apenas de leitura para ordens de serviço.'
      };
    }
  }

  if (intencao === 'solicitar_ajuste_estoque' || intencao === 'ajustar_estoque') {
    if (!canAdjustInventory(context)) {
      return {
        ok: false,
        acao: intencao,
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para ajustar o estoque físico de peças.'
      };
    }
  }

  if (intencao === 'consultar_financeiro') {
    if (!canReadFinancial(context)) {
      return {
        ok: false,
        acao: 'consultar_financeiro',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para consultar dados financeiros da oficina.'
      };
    }
  }

  // ── 2. PROTEÇÃO DE ALTO RISCO (Excluir OS / Faturar OS) ──
  const foiConfirmadoInternamente = context._confirmadoInternamente === true;
  if (interpretado.risco === 'alto' && !foiConfirmadoInternamente) {
    const resourceId = interpretado.os?.id || interpretado.os?.num || context.activeOsId || 'os_global';
    const token = gerarTokenAcao({
      tenantId: context.tenantId || 'default',
      actorId: context.actorId || 'operador',
      resourceId: String(resourceId),
      action: intencao,
      version: state.versao || 0,
      ttlMs: 5 * 60 * 1000
    });

    acoesPendentes.set(token, {
      interpretado: { ...interpretado, risco: 'baixo' },
      input,
      context,
      expiraEm: Date.now() + 5 * 60 * 1000
    });

    return {
      ok: true,
      pendenteConfirmacao: true,
      token,
      acao: intencao,
      risco: 'alto',
      resposta: interpretado.resposta_falada || 'Atenção: Esta é uma ação crítica. Deseja realmente confirmar a execução?'
    };
  }

  // ── 3. INTENÇÃO: ABRIR ORDEM DE SERVIÇO (Check-in) ────────
  if (intencao === 'abrir_os') {
    const cliDado = interpretado.cliente || {};
    const veiDado = interpretado.veiculo || {};
    const osDado = interpretado.os || {};

    // Localiza ou cadastra o cliente
    let cliente = null;
    const nomeBusca = (cliDado.nome || '').trim().toLowerCase();
    if (nomeBusca) {
      cliente = state.clientes.find(c => {
        const n = (c.nome || '').toLowerCase();
        const f = (c.fantasia || '').toLowerCase();
        const ct = (c.contato || '').toLowerCase();
        return n.includes(nomeBusca) || f.includes(nomeBusca) || ct.includes(nomeBusca);
      });
    }

    if (!cliente) {
      cliente = {
        id: gerarId('c'),
        nome: cliDado.nome || 'Cliente Recepção',
        fantasia: cliDado.nome || 'Cliente Recepção',
        doc: '',
        fone: cliDado.fone || '',
        email: '',
        contato: cliDado.nome || '',
        prazo: 0,
        ie: '',
        endereco: '',
        cidade: '',
        uf: '',
        cep: '',
        optin: true,
        bloqueado: false
      };
      state.clientes.push(cliente);
    }

    // Localiza ou cadastra o veículo
    let veiculo = null;
    const placaLimpa = normalizarPlaca(veiDado.placa);
    const isSemPlaca = !placaLimpa || placaLimpa === 'SEM-PLACA';

    if (placaLimpa && !isSemPlaca) {
      veiculo = state.veiculos.find(v => normalizarPlaca(v.placa) === placaLimpa);
    }
    if (!veiculo && veiDado.modelo && !isSemPlaca) {
      const modBusca = (veiDado.modelo || '').toLowerCase();
      veiculo = state.veiculos.find(v => v.cli === cliente.id && (v.modelo || '').toLowerCase().includes(modBusca));
    }

    const kmInformado = normalizarKm(veiDado.km) || normalizarKm(osDado.km) || (veiculo ? veiculo.km : 0);

    if (veiculo) {
      if (kmInformado && kmInformado > (veiculo.km || 0)) veiculo.km = kmInformado;
      if (veiDado.cor && (!veiculo.cor || veiculo.cor === 'Não informada')) veiculo.cor = veiDado.cor;
      if (veiDado.ano && !veiculo.ano) veiculo.ano = veiDado.ano;
      if (!veiculo.cli) veiculo.cli = cliente.id;
    } else {
      veiculo = {
        id: gerarId('v'),
        cli: cliente.id,
        placa: isSemPlaca ? 'SEM-PLACA' : (placaLimpa || `ENT-${Math.floor(1000 + Math.random() * 9000)}`),
        marca: veiDado.marca || 'Geral',
        modelo: veiDado.modelo || 'Veículo',
        ano: veiDado.ano || new Date().getFullYear().toString(),
        km: kmInformado || 0,
        cor: veiDado.cor || 'Não informada',
        tipo: veiDado.tipo || 'Passeio',
        pendenciaCadastral: isSemPlaca,
        pendencias: isSemPlaca ? ['placa_pendente'] : []
      };
      state.veiculos.push(veiculo);
    }

    // Prevenção de duplicidade: verifica se o veículo já tem OS em andamento no pátio
    const osExistente = state.os.find(o => o.vei === veiculo.id && o.st !== 'finalizada' && o.st !== 'cancelada');
    if (osExistente && !context.ignorarDuplicidade) {
      const novasQueixas = Array.isArray(osDado.reclamacoes) ? osDado.reclamacoes : [];
      if (novasQueixas.length > 0) {
        const textoNovas = novasQueixas.join('; ');
        osExistente.queixa = osExistente.queixa ? `${osExistente.queixa}\n• [Nova queixa]: ${textoNovas}` : textoNovas;
      }
      return {
        ok: true,
        acao: 'associar_os_existente',
        osId: osExistente.id,
        numOS: osExistente.num,
        veiculoId: veiculo.id,
        clienteId: cliente.id,
        resposta: `O veículo ${veiculo.modelo} já possui a OS #${osExistente.num} em andamento. Adicionei as novas queixas a ela com sucesso!`
      };
    }

    const listaQueixas = Array.isArray(osDado.reclamacoes) && osDado.reclamacoes.length > 0
      ? osDado.reclamacoes
      : ['Revisão e inspeção preventiva de entrada.'];
    const textoQueixaFormatado = listaQueixas.length > 1
      ? listaQueixas.map(q => `• ${q}`).join('\n')
      : listaQueixas[0];

    const tenantId = context.tenantId || 'default';
    const preOSConfirmada = context.preOSConfirmada === true || context._confirmadoInternamente === true;

    if (!preOSConfirmada && !context.ignorarPreOS) {
      const triagem = preOSEngine.triagemEntrada({
        tenantId,
        vehicleId: veiculo.id,
        placa: veiculo.placa,
        clienteId: cliente.id,
        motorista: interpretado.motorista || '',
        kmAtual: kmInformado,
        reclamacao: textoQueixaFormatado,
        origem: context.canal || 'voz',
        actorId: context.remetente || context.actorId || 'operador',
        state,
        dataReferencia: dataHoje
      });

      // Se houver alerta de atenção ou alto (recorrência ou garantia), pausa para confirmação
      if (triagem.resumoContexto.nivelAtencao === 'alto' || triagem.resumoContexto.nivelAtencao === 'atencao' || triagem.preOS?.possivelGarantia === true || triagem.preOS?.status === 'aguardando_confirmacao') {
        const token = gerarTokenAcao({
          tenantId,
          actorId: context.actorId || context.remetente || 'operador',
          resourceId: triagem.preOS.id,
          action: 'converter_pre_os',
          version: state.versao || 0,
          ttlMs: 5 * 60 * 1000
        });

        acoesPendentes.set(token, {
          interpretado,
          input,
          context,
          preOSId: triagem.preOS.id,
          expiraEm: Date.now() + 5 * 60 * 1000
        });

        return {
          ok: true,
          pendenteConfirmacao: true,
          token,
          acao: 'converter_pre_os',
          preOSId: triagem.preOS.id,
          preOS: triagem.preOS,
          resumoContexto: triagem.resumoContexto,
          possivelGarantia: triagem.preOS.possivelGarantia,
          risco: triagem.preOS.possivelGarantia ? 'alto' : 'medio',
          resposta: triagem.respostaSugerida
        };
      }

      // Caso nível de atenção seja 'info' (sem recorrência ou veículo novo), converte Pré-OS diretamente para OS
      const conversao = preOSEngine.converterEmOS({
        tenantId,
        preOSId: triagem.preOS.id,
        state,
        actorId: context.remetente || context.actorId || 'operador',
        boxId: osDado.box || 'patio',
        mecanico: osDado.mecanico || 'A Definir',
        dataReferencia: dataHoje
      });

      registrarAuditoria(state, {
        canal: context.canal || 'voz',
        usuario: context.remetente || 'Operador',
        intencao: 'abrir_os',
        comando: input.text || '[Áudio ditado]',
        resumo: `Abertura da OS #${conversao.os.num} para ${veiculo.modelo} (${cliente.nome})`,
        osId: conversao.os.id
      });

      const respCurta = interpretado.resposta_falada ||
        `Certo, abri a OS #${conversao.os.num} para o ${veiculo.modelo} do ${cliente.nome} e registrei as queixas.`;

      return {
        ok: true,
        acao: 'abrir_os',
        osId: conversao.os.id,
        numOS: conversao.os.num,
        veiculoId: veiculo.id,
        clienteId: cliente.id,
        preOSId: triagem.preOS.id,
        possivelGarantia: conversao.preOS.possivelGarantia,
        resposta: respCurta
      };
    }

    // Criação da Nova Ordem de Serviço (caso já pré-confirmada)
    const maxNum = state.os.reduce((max, o) => Math.max(max, Number(o.num) || 0), 1040);
    const novoNum = maxNum + 1;

    const novaOS = {
      id: gerarId('os'),
      num: novoNum,
      box: osDado.box || 'patio',
      vei: veiculo.id,
      cli: cliente.id,
      mec: osDado.mecanico || 'A Definir',
      st: osDado.box && osDado.box !== 'patio' ? 'executando' : 'aguardando',
      pendenciaCadastral: isSemPlaca,
      pendencias: isSemPlaca ? ['placa_pendente'] : [],
      abertura: dataHoje,
      prev: dataHoje,
      km: kmInformado || 0,
      queixa: textoQueixaFormatado,
      servicos: [],
      pecas: [],
      desc: 0,
      pago: false,
      formaPgto: '',
      obs: isSemPlaca
        ? `Entrada registrada via voz com pendência cadastral de placa.`
        : `Entrada registrada via comando inteligente de voz.`
    };

    state.os.unshift(novaOS);

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'abrir_os',
      comando: input.text || '[Áudio ditado]',
      resumo: `Abertura da OS #${novaOS.num} para ${veiculo.modelo} (${cliente.nome})`,
      osId: novaOS.id
    });

    const respCurta = interpretado.resposta_falada ||
      `Certo, abri a OS #${novaOS.num} para o ${veiculo.modelo} do ${cliente.nome} e registrei as queixas.`;

    return {
      ok: true,
      acao: 'abrir_os',
      osId: novaOS.id,
      numOS: novaOS.num,
      veiculoId: veiculo.id,
      clienteId: cliente.id,
      resposta: respCurta
    };
  }

  // ── 4. INTENÇÃO: ADICIONAR RECLAMAÇÃO / SINTOMA A OS EXISTENTE ──
  if (intencao === 'adicionar_reclamacao') {
    let targetOs = null;

    if (context.activeOsId) {
      targetOs = state.os.find(o => o.id === context.activeOsId);
    }
    if (!targetOs && interpretado.os?.id_alvo) {
      targetOs = state.os.find(o => o.id === interpretado.os.id_alvo);
    }
    if (!targetOs && interpretado.os?.num) {
      targetOs = state.os.find(o => o.num === interpretado.os.num);
    }
    if (!targetOs) {
      targetOs = state.os.find(o => o.st !== 'finalizada' && o.st !== 'cancelada');
    }

    if (!targetOs) {
      return {
        ok: false,
        acao: 'adicionar_reclamacao',
        resposta: 'Não encontrei nenhuma Ordem de Serviço em aberto no momento para adicionar a queixa.'
      };
    }

    const novas = Array.isArray(interpretado.os?.reclamacoes) && interpretado.os.reclamacoes.length > 0
      ? interpretado.os.reclamacoes
      : [input.text || 'Defeito adicional relatado pelo cliente.'];

    const novasFormatadas = novas.map(q => q.startsWith('•') ? q : `• ${q}`).join('\n');
    targetOs.queixa = targetOs.queixa ? `${targetOs.queixa}\n${novasFormatadas}` : novasFormatadas;

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'adicionar_reclamacao',
      comando: input.text || '[Áudio ditado]',
      resumo: `Adicionada reclamação na OS #${targetOs.num}`,
      osId: targetOs.id
    });

    const respCurta = interpretado.resposta_falada ||
      `Certo, adicionei a queixa na OS #${targetOs.num}.`;

    return {
      ok: true,
      acao: 'adicionar_reclamacao',
      osId: targetOs.id,
      numOS: targetOs.num,
      resposta: respCurta
    };
  }

  // ── 5. INTENÇÃO: CORRIGIR CAMPO (KM, Placa, Cor, etc.) ────
  if (intencao === 'corrigir_campo') {
    let targetOs = null;
    if (context.activeOsId) targetOs = state.os.find(o => o.id === context.activeOsId);
    if (!targetOs) targetOs = state.os.find(o => o.st !== 'finalizada' && o.st !== 'cancelada');

    let targetVei = targetOs ? state.veiculos.find(v => v.id === targetOs.vei) : null;
    const correcoesFeitas = [];

    const correcoes = Array.isArray(interpretado.correcoes) ? interpretado.correcoes : [];

    for (const c of correcoes) {
      if (c.campo === 'km') {
        const valKm = normalizarKm(c.valor);
        if (valKm) {
          if (targetOs) targetOs.km = valKm;
          if (targetVei) targetVei.km = valKm;
          correcoesFeitas.push(`KM ajustado para ${valKm.toLocaleString('pt-BR')} km`);
        }
      }
      if (c.campo === 'placa' && targetVei) {
        const valPlaca = normalizarPlaca(c.valor);
        if (valPlaca) {
          targetVei.placa = valPlaca;
          correcoesFeitas.push(`Placa corrigida para ${valPlaca}`);
        }
      }
      if (c.campo === 'cor' && targetVei) {
        targetVei.cor = String(c.valor);
        correcoesFeitas.push(`Cor corrigida para ${c.valor}`);
      }
      if (c.campo === 'modelo' && targetVei) {
        targetVei.modelo = String(c.valor);
        correcoesFeitas.push(`Modelo corrigido para ${c.valor}`);
      }
    }

    if (correcoesFeitas.length === 0) {
      return {
        ok: false,
        acao: 'corrigir_campo',
        resposta: 'Não consegui identificar qual campo você deseja corrigir.'
      };
    }

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'corrigir_campo',
      comando: input.text || '[Áudio ditado]',
      resumo: correcoesFeitas.join(', '),
      osId: targetOs?.id
    });

    const respCurta = interpretado.resposta_falada ||
      `Perfeito, ${correcoesFeitas.join(' e ')}.`;

    return {
      ok: true,
      acao: 'corrigir_campo',
      osId: targetOs?.id,
      numOS: targetOs?.num,
      resposta: respCurta
    };
  }

  // ── 5.1 GESTÃO OPERACIONAL PROATIVA (Resumo, Alertas, Gargalos, Entregas, Reconhecimento) ──
  if (intencao === 'consultar_resumo_operacional') {
    const tenantId = context.tenantId || 'default';
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarResumoConversacional(resumo);
    return {
      ok: true,
      acao: 'consultar_resumo_operacional',
      resumo,
      resposta
    };
  }

  if (intencao === 'consultar_alertas_operacao') {
    const tenantId = context.tenantId || 'default';
    const aval = operationalIntelligenceEngine.avaliarOperacao({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarAlertasAtencao(aval.eventos);
    return {
      ok: true,
      acao: 'consultar_alertas_operacao',
      eventos: aval.eventos,
      resposta
    };
  }

  if (intencao === 'consultar_gargalo_operacao') {
    const tenantId = context.tenantId || 'default';
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarMaiorGargalo(resumo);
    return {
      ok: true,
      acao: 'consultar_gargalo_operacao',
      maiorGargalo: resumo.maiorGargalo,
      resposta
    };
  }

  if (intencao === 'consultar_entregas_risco') {
    const tenantId = context.tenantId || 'default';
    const resumo = operationalSummaryService.gerarResumoOperacional({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const aval = operationalIntelligenceEngine.avaliarOperacao({
      tenantId,
      state,
      dataReferencia: context.dataReferencia,
      horaReferencia: context.horaReferencia
    });
    const resposta = operationalSummaryService.formatarEntregasEmRisco(resumo, aval.eventos);
    return {
      ok: true,
      acao: 'consultar_entregas_risco',
      entregas: resumo.entregas,
      eventos: aval.eventos.filter(e => e.tipo === 'entrega_atrasada' || e.tipo === 'entrega_proxima'),
      resposta
    };
  }

  if (intencao === 'reconhecer_alerta') {
    const tenantId = context.tenantId || 'default';
    const actorId = context.remetente || context.actorId || 'operador';
    let targetAlertId = context.activeAlertId || null;
    if (!targetAlertId && Array.isArray(state.operationalEvents)) {
      const eventosAbertos = state.operationalEvents.filter(e => e.tenantId === tenantId && e.status === 'aberto');
      const ordemP = { P1: 1, P2: 2, P3: 3, P4: 4 };
      eventosAbertos.sort((a, b) => (ordemP[a.prioridade] || 5) - (ordemP[b.prioridade] || 5));
      if (eventosAbertos.length > 0) {
        targetAlertId = eventosAbertos[0].id;
      }
    }

    if (!targetAlertId) {
      return {
        ok: true,
        acao: 'reconhecer_alerta',
        resposta: 'Nenhum alerta pendente para reconhecimento no momento.'
      };
    }

    const rec = operationalIntelligenceEngine.reconhecerEvento({
      tenantId,
      eventId: targetAlertId,
      actorId,
      motivo: input.text || 'ciente',
      state
    });

    return {
      ok: rec.ok,
      acao: 'reconhecer_alerta',
      evento: rec.evento || null,
      resposta: rec.ok
        ? `Alerta sobre "${rec.evento.titulo}" reconhecido com sucesso. O monitoramento continua ativo.`
        : 'Não foi possível reconhecer o alerta indicado.'
    };
  }

  // ── 5.2 ORÇAMENTOS E INSPEÇÃO TÉCNICA POR VOZ ──────────────
  if (intencao === 'consultar_orcamento') {
    const tenantId = context.tenantId || 'default';
    const resumo = quotationService.obterResumoOrcamentos({ tenantId, state });
    let resposta = `Temos ${resumo.pendentesAprovacao} orçamento(s) aguardando aprovação dos clientes, totalizando R$ ${resumo.valorPendente.toFixed(2)}.`;
    if (resumo.adicionaisPendentes > 0) {
      resposta += ` Destes, ${resumo.adicionaisPendentes} são adicionais de escopo gerados durante a execução.`;
    }
    return {
      ok: true,
      acao: 'consultar_orcamento',
      resumo,
      resposta
    };
  }

  if (intencao === 'registrar_inspecao_voz') {
    const tenantId = context.tenantId || 'default';
    const parsed = inspectionService.estruturarInspecaoPorVoz({ texto: input.text, state, tenantId });
    return {
      ok: true,
      acao: 'registrar_inspecao_voz',
      itensSugeridos: parsed.sugestoes,
      laudoSugerido: parsed.laudoSugerido,
      resposta: parsed.sugestoes.length > 0
        ? `Identifiquei as seguintes anomalias na fala: ${parsed.sugestoes.map(s => s.componente).join(', ')}. Deseja confirmar os laudos e adicionar à inspeção técnica?`
        : 'Não identifiquei anomalias técnicas claras na fala. Por favor, especifique o componente ou sistema avaliado.'
    };
  }

  if (intencao === 'adicionar_item_orcamento') {
    const tenantId = context.tenantId || 'default';
    const targetOsId = context.activeOsId || (state.os && state.os[0] ? state.os[0].id : null);
    return {
      ok: true,
      acao: 'adicionar_item_orcamento',
      osId: targetOsId,
      resposta: 'Item adicionado ao orçamento após confirmação explícita do operador.'
    };
  }

  // ── 6. INTENÇÃO: CONSULTAR STATUS OU INFORMAÇÕES ──────────
  if (intencao === 'consultar_status') {
    const totalAbertas = state.os.filter(o => o.st !== 'finalizada' && o.st !== 'cancelada').length;
    const patioQtd = state.os.filter(o => o.box === 'patio' && o.st !== 'finalizada').length;

    let resp = `Temos ${totalAbertas} Ordens de Serviço em andamento, sendo ${patioQtd} no pátio aguardando box.`;

    if (context.activeOsId) {
      const o = state.os.find(x => x.id === context.activeOsId);
      if (o) {
        const v = state.veiculos.find(x => x.id === o.vei);
        resp = `A OS #${o.num} do veículo ${v ? v.modelo : 'em atendimento'} está com status "${o.st}".`;
      }
    }

    return {
      ok: true,
      acao: 'consultar_status',
      resposta: resp
    };
  }

  // ── 7. INTENÇÃO: EXCLUIR OS (Confirmada) ──────────────────
  if (intencao === 'excluir_os') {
    let targetOs = null;
    if (interpretado.os?.num) targetOs = state.os.find(o => o.num === interpretado.os.num || String(o.num) === String(interpretado.os.num) || o.id === String(interpretado.os.num));
    if (!targetOs && (context.activeOsId || interpretado.os?.id)) {
      const osIdAlvo = String(context.activeOsId || interpretado.os?.id);
      targetOs = state.os.find(o => String(o.id) === osIdAlvo || String(o.num) === osIdAlvo);
    }

    if (!targetOs) {
      return { ok: false, acao: 'excluir_os', resposta: 'Ordem de serviço não encontrada para exclusão.' };
    }

    const numExcluido = targetOs.num;
    state.os = state.os.filter(o => o.id !== targetOs.id);

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.remetente || 'Operador',
      intencao: 'excluir_os',
      comando: input.text || '[Áudio ditado]',
      resumo: `OS #${numExcluido} excluída com autorização`,
      osId: targetOs.id
    });

    return {
      ok: true,
      acao: 'excluir_os',
      numOS: numExcluido,
      resposta: `A OS #${numExcluido} foi excluída com sucesso.`
    };
  }

  // ── 9. AÇÕES DE ALTO RISCO DE ESTOQUE E COMPRAS ────────
  if (['ajustar_estoque', 'cancelar_pedido_compra', 'aprovar_compra'].includes(intencao)) {
    const token = gerarTokenAcao({
      tenantId: context.tenantId,
      actorId: context.actorId,
      intencao,
      dados: { ...interpretado, texto: input.text }
    });
    acoesPendentes.set(token, {
      intencao,
      interpretado,
      context,
      expiraEm: Date.now() + 5 * 60 * 1000
    });
    let msgAlerta = 'Atenção: Ação de alto risco de estoque/compras identificada.';
    if (intencao === 'ajustar_estoque') {
      msgAlerta = 'Atenção: O ajuste manual de estoque altera o inventário físico e exige confirmação explícita.';
    } else if (intencao === 'cancelar_pedido_compra') {
      msgAlerta = 'Atenção: Cancelar pedido de compra é uma operação de alto impacto e exige confirmação.';
    } else if (intencao === 'aprovar_compra') {
      msgAlerta = 'Atenção: Aprovação de compra de valor elevado exige confirmação por token de segurança.';
    }
    return {
      ok: true,
      acao: intencao,
      risco: 'alto',
      pendenteConfirmacao: true,
      token,
      resposta: `${msgAlerta} Deseja prosseguir com a confirmação?`
    };
  }

  // ── 10. AÇÃO DE RESERVA DE PEÇAS POR VOZ ──────────────
  if (intencao === 'reservar_peca_os') {
    const tenantId = context.tenantId || 'default';
    const osNum = interpretado.reserva?.osNum;
    let osAlvo = null;
    if (osNum) osAlvo = state.os.find(o => (o.num === osNum || o.id === String(osNum)) && (o.tenantId === tenantId || !o.tenantId));
    if (!osAlvo && context.activeOsId) osAlvo = state.os.find(o => o.id === context.activeOsId);
    if (!osAlvo && state.os.length > 0) osAlvo = state.os.find(o => o.st !== 'finalizada');

    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual Ordem de Serviço deve receber a reserva.' };
    }

    // Busca peça mais relevante mencionada no texto
    const tLower = (input.text || '').toLowerCase();
    let pecaAlvo = null;
    if (Array.isArray(state.pecas)) {
      pecaAlvo = state.pecas.find(p => (p.tenantId === tenantId || !p.tenantId) && (
        tLower.includes((p.descricao || '').toLowerCase()) ||
        tLower.includes((p.nome || '').toLowerCase()) ||
        (p.codigoInterno && tLower.includes(p.codigoInterno.toLowerCase()))
      ));
    }

    if (!pecaAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não encontrei no cadastro a peça mencionada para realizar a reserva.' };
    }

    const qtd = interpretado.reserva?.quantidade || 1;
    const resReserva = inventoryService.reservarParaOS({
      tenantId,
      state,
      osId: osAlvo.id,
      partId: pecaAlvo.id,
      quantity: qtd,
      actorId: context.actorId || 'operador_voz'
    });

    return {
      ok: true,
      acao: intencao,
      reserva: resReserva,
      resposta: `Reserva processada para a OS #${osAlvo.num || osAlvo.id}: ${resReserva.reservedQuantity} unidade(s) de "${pecaAlvo.descricao}" reservada(s)${resReserva.missingQuantity > 0 ? `, e ${resReserva.missingQuantity} colocada(s) em necessidade de compra.` : '.'}`
    };
  }

  // ── 11. CONSULTAS DE ESTOQUE, PEÇAS E FORNECEDORES ───
  if (intencao === 'consultar_os_aguardando_pecas') {
    const tenantId = context.tenantId || 'default';
    const reqs = (state.partRequirements || []).filter(r => r.tenantId === tenantId && (r.status === 'aguardando_compra' || r.missingQuantity > 0));
    const osIds = [...new Set(reqs.map(r => r.osId))];
    const oss = state.os.filter(o => osIds.includes(o.id));

    if (oss.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há nenhuma ordem de serviço retida aguardando peças no momento.' };
    }
    const lista = oss.map(o => `OS #${o.num || o.id} (${o.placa || 'Sem placa'})`).join(', ');
    return {
      ok: true,
      acao: intencao,
      total: oss.length,
      resposta: `Temos ${oss.length} OS(s) aguardando peças no momento: ${lista}.`
    };
  }

  if (intencao === 'consultar_compras_pendentes') {
    const tenantId = context.tenantId || 'default';
    const reqs = (state.partRequirements || []).filter(r => r.tenantId === tenantId && (r.status === 'aguardando_compra' || r.missingQuantity > 0));
    if (reqs.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há pendências de compras de peças registradas no sistema.' };
    }
    const pecasMap = new Map();
    for (const r of reqs) {
      const p = (state.pecas || []).find(it => it.id === r.partId);
      const desc = p ? p.descricao : 'Item sem código';
      pecasMap.set(desc, (pecasMap.get(desc) || 0) + (r.missingQuantity || 1));
    }
    const itensTxt = Array.from(pecasMap.entries()).map(([k, v]) => `${v} un de ${k}`).join(', ');
    return {
      ok: true,
      acao: intencao,
      totalItens: reqs.length,
      resposta: `Estão pendentes de compra: ${itensTxt}.`
    };
  }

  if (intencao === 'consultar_pedidos_atrasados') {
    const tenantId = context.tenantId || 'default';
    const agora = new Date();
    const atrasados = (state.purchaseOrders || []).filter(o => {
      if (o.tenantId !== tenantId) return false;
      if (o.status !== 'pedido_realizado' && o.status !== 'parcialmente_recebido') return false;
      return o.expectedAt && new Date(o.expectedAt) < agora;
    });
    if (atrasados.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Todos os pedidos de compra estão dentro do prazo previsto de entrega.' };
    }
    const txt = atrasados.map(o => `Pedido ${o.codigo} (${o.supplierNome})`).join(', ');
    return {
      ok: true,
      acao: intencao,
      total: atrasados.length,
      resposta: `Existem ${atrasados.length} pedido(s) de compra atrasado(s): ${txt}.`
    };
  }

  if (intencao === 'consultar_fornecedor_peca') {
    const tenantId = context.tenantId || 'default';
    const fornecedores = (state.suppliers || []).filter(s => s.tenantId === tenantId && s.ativo !== false);
    if (fornecedores.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Nenhum fornecedor cadastrado para esse tenant.' };
    }
    const lista = fornecedores.map(f => `${f.nome} (prazo médio: ${f.prazoMedioDias} dias)`).join(', ');
    return {
      ok: true,
      acao: intencao,
      resposta: `Fornecedores cadastrados disponíveis: ${lista}.`
    };
  }

  if (intencao === 'consultar_estoque_peca') {
    const tenantId = context.tenantId || 'default';
    const tLower = (input.text || '').toLowerCase();

    // 1. Verifica se mencionou placa
    const matchPlaca = tLower.match(/\b([a-z]{3}[0-9][a-z0-9][0-9]{2}|[a-z]{3}[0-9]{4})\b/i);
    if (matchPlaca) {
      const placa = matchPlaca[1].toUpperCase();
      const veiculo = (state.veiculos || []).find(v => v.placa === placa);
      const os = (state.os || []).find(o => (o.placa === placa || o.vei === veiculo?.id) && o.st !== 'finalizada');
      if (os && Array.isArray(os.pecas) && os.pecas.length > 0) {
        const pecasOS = os.pecas.map(p => {
          const saldos = p.partId ? inventoryService.calcularSaldos({ tenantId, state, partId: p.partId }) : null;
          return `${p.desc || p.nome}: ${saldos ? `${saldos.estoqueDisponivel} disponível(eis)` : (p.qtdReservada ? `${p.qtdReservada} reservada(s)` : 'status ' + (p.statusEstoque || 'pendente'))}`;
        }).join(', ');
        return {
          ok: true,
          acao: intencao,
          resposta: `Para o veículo placa ${placa} (OS #${os.num || os.id}), situação das peças: ${pecasOS}.`
        };
      }
    }

    // 2. Busca peça pelo nome no cadastro
    let peca = null;
    if (Array.isArray(state.pecas)) {
      peca = state.pecas.find(p => {
        if (p.tenantId !== tenantId && p.tenantId) return false;
        const desc = (p.descricao || p.nome || '').toLowerCase();
        const cod = (p.codigoInterno || p.cod || '').toLowerCase();
        if (cod && tLower.includes(cod)) return true;
        if (desc && tLower.includes(desc)) return true;
        const palavras = desc.split(/[\s-]+/).filter(w => w.length >= 4);
        return palavras.some(w => tLower.includes(w));
      });
    }

    if (!peca) {
      // Se não achou peça específica, responde com resumo geral de itens
      const totalItens = (state.pecas || []).filter(p => p.tenantId === tenantId).length;
      return {
        ok: true,
        acao: intencao,
        resposta: `Temos ${totalItens} variedade(s) de peças cadastradas no almoxarifado.`
      };
    }

    const saldos = inventoryService.calcularSaldos({ tenantId, state, partId: peca.id });
    return {
      ok: true,
      acao: intencao,
      peca,
      saldos,
      resposta: `Para "${peca.descricao}" (${peca.codigoInterno}): temos ${saldos.estoqueFisico} unidade(s) físicas, sendo ${saldos.estoqueReservado} reservada(s) e ${saldos.estoqueDisponivel} disponível(eis) no almoxarifado.`
    };
  }

  // ── 12. AÇÕES DE APONTAMENTO DE MÃO DE OBRA E EQUIPE ───────
  if (intencao === 'iniciar_servico') {
    const tenantId = context.tenantId || 'default';
    state.workers = Array.isArray(state.workers) ? state.workers : [];
    state.os = Array.isArray(state.os) ? state.os : [];

    // Localiza OS
    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    let osAlvo = null;
    if (numOS) {
      osAlvo = state.os.find(o => (o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo && context.activeOsId) {
      osAlvo = state.os.find(o => o.id === context.activeOsId && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo) {
      osAlvo = state.os.find(o => o.st === 'executando' || o.st === 'fila' || o.st === 'aguardando');
    }
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual é a ordem de serviço para iniciar o trabalho.' };
    }

    // Localiza Colaborador/Mecânico
    let worker = null;
    for (const w of state.workers) {
      if (w.tenantId === tenantId && tLower.includes(w.nome.toLowerCase())) {
        worker = w;
        break;
      }
    }
    if (!worker && context.workerId) {
      worker = state.workers.find(w => w.id === context.workerId && w.tenantId === tenantId);
    }
    if (!worker && context.remetente) {
      worker = state.workers.find(w => w.tenantId === tenantId && (w.nome.toLowerCase() === context.remetente.toLowerCase() || w.userId === context.remetente));
    }
    if (!worker) {
      worker = state.workers.find(w => w.tenantId === tenantId && w.ativo !== false);
    }
    if (!worker) {
      // Cria colaborador padrão se ainda não existir
      const resW = laborTrackingService.cadastrarColaborador({
        tenantId,
        state,
        workerData: { nome: context.remetente || 'Mecânico', funcao: 'Mecânico' },
        actorId: 'voz'
      });
      worker = resW.worker;
    }

    // Localiza Serviço na OS
    let serviceItemId = null;
    let serviceNome = 'Serviço';
    if (Array.isArray(osAlvo.servicos) && osAlvo.servicos.length > 0) {
      const matchServ = osAlvo.servicos.find(s => {
        const n = (s.nome || s.desc || '').toLowerCase();
        return n.split(/\s+/).some(p => p.length >= 4 && tLower.includes(p));
      });
      if (matchServ) {
        serviceItemId = matchServ.id;
        serviceNome = matchServ.nome || matchServ.desc;
      } else {
        const primeiroAut = osAlvo.servicos.find(s => s.autorizado !== false && s.status !== 'recusado');
        if (primeiroAut) {
          serviceItemId = primeiroAut.id;
          serviceNome = primeiroAut.nome || primeiroAut.desc;
        }
      }
    }

    try {
      const resApont = laborTrackingService.iniciarApontamento({
        tenantId,
        state,
        workerId: worker.id,
        osId: osAlvo.id,
        serviceItemId,
        boxId: osAlvo.box || 'Box',
        type: 'produtivo',
        source: 'voz',
        actorId: worker.nome
      });

      return {
        ok: true,
        acao: intencao,
        entry: resApont.entry,
        resposta: `Serviço iniciado na OS #${osAlvo.num || osAlvo.id} (${serviceNome}) para ${worker.nome} no box ${osAlvo.box || 'Box'}.`
      };
    } catch (err) {
      return {
        ok: false,
        acao: intencao,
        resposta: `Não foi possível iniciar o serviço: ${err.message}`
      };
    }
  }

  if (intencao === 'pausar_servico') {
    const tenantId = context.tenantId || 'default';
    state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];

    // Localiza apontamento ativo para pausar
    let entry = state.laborEntries.find(e => e.tenantId === tenantId && e.status === 'ativo');
    if (!entry) {
      return { ok: false, acao: intencao, resposta: 'Não há nenhum apontamento de serviço ativo no momento para pausar.' };
    }

    const motivo = (t.includes('esperando peça') || t.includes('esperando peca') || t.includes('aguardando peça') || t.includes('aguardando peca') || t.includes('falta peça'))
      ? 'espera_peca'
      : 'pausa';

    try {
      const resPausa = laborTrackingService.pausarApontamento({
        tenantId,
        state,
        entryId: entry.id,
        motivo,
        actorId: context.remetente || 'operador_voz'
      });

      return {
        ok: true,
        acao: intencao,
        entry: resPausa.entry,
        resposta: `Serviço pausado para ${entry.workerNome} na OS #${entry.osNum || entry.osId}. Motivo: ${motivo === 'espera_peca' ? 'Aguardando peça' : 'Pausa'}. Tempo produtivo até agora: ${entry.durationMinutes} minutos.`
      };
    } catch (err) {
      return { ok: false, acao: intencao, resposta: `Erro ao pausar serviço: ${err.message}` };
    }
  }

  if (intencao === 'retomar_servico') {
    const tenantId = context.tenantId || 'default';
    state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];

    const entry = state.laborEntries.find(e => e.tenantId === tenantId && e.status === 'pausado');
    if (!entry) {
      return { ok: false, acao: intencao, resposta: 'Não encontrei nenhum serviço pausado aguardando retomada.' };
    }

    try {
      const resRetomada = laborTrackingService.retomarApontamento({
        tenantId,
        state,
        entryId: entry.id,
        actorId: context.remetente || 'operador_voz'
      });

      return {
        ok: true,
        acao: intencao,
        entry: resRetomada.entry,
        resposta: `Serviço retomado por ${entry.workerNome} na OS #${entry.osNum || entry.osId} (${entry.serviceNome}).`
      };
    } catch (err) {
      return { ok: false, acao: intencao, resposta: `Erro ao retomar serviço: ${err.message}` };
    }
  }

  if (intencao === 'encerrar_servico') {
    const tenantId = context.tenantId || 'default';
    state.laborEntries = Array.isArray(state.laborEntries) ? state.laborEntries : [];

    const entry = state.laborEntries.find(e => e.tenantId === tenantId && (e.status === 'ativo' || e.status === 'pausado'));
    if (!entry) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei nenhum serviço em andamento para finalizar.' };
    }

    try {
      const resFim = laborTrackingService.encerrarApontamento({
        tenantId,
        state,
        entryId: entry.id,
        actorId: context.remetente || 'operador_voz'
      });

      return {
        ok: true,
        acao: intencao,
        entry: resFim.entry,
        resposta: `Serviço concluído por ${entry.workerNome} na OS #${entry.osNum || entry.osId}. Tempo total registrado: ${resFim.entry.durationMinutes} minutos.`
      };
    } catch (err) {
      return { ok: false, acao: intencao, resposta: `Erro ao concluir serviço: ${err.message}` };
    }
  }

  // ── 13. CONSULTAS DE EQUIPE, PRODUTIVIDADE E CUSTOS ────────
  if (intencao === 'consultar_equipe_livre') {
    const tenantId = context.tenantId || 'default';
    const equipeAgora = productivityService.obterEquipeAgora({ tenantId, state });
    if (!equipeAgora || equipeAgora.totalMecanicosAtivos === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há colaboradores cadastrados na equipe da oficina.' };
    }
    if (equipeAgora.livres.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Nenhum mecânico está livre no momento. Toda a equipe está em serviço ou em espera.' };
    }
    const nomes = equipeAgora.livres.map(w => w.nome).join(', ');
    return {
      ok: true,
      acao: intencao,
      livres: equipeAgora.livres,
      resposta: `Estão livres no momento: ${nomes}.`
    };
  }

  if (intencao === 'consultar_mecanico_trabalho') {
    const tenantId = context.tenantId || 'default';
    const equipeAgora = productivityService.obterEquipeAgora({ tenantId, state });
    if (!equipeAgora) return { ok: false, acao: intencao, resposta: 'Dados de equipe indisponíveis.' };

    let alvo = null;
    for (const item of [...equipeAgora.emServico, ...equipeAgora.emEspera, ...equipeAgora.livres]) {
      if (tLower.includes(item.nome.toLowerCase())) {
        alvo = item;
        break;
      }
    }
    if (!alvo) {
      alvo = equipeAgora.emServico[0] || equipeAgora.emEspera[0] || equipeAgora.livres[0];
    }
    if (!alvo) {
      return { ok: true, acao: intencao, resposta: 'Não encontrei o colaborador mencionado.' };
    }

    if (alvo.status === 'em_servico') {
      return {
        ok: true,
        acao: intencao,
        resposta: `${alvo.nome} está trabalhando na OS #${alvo.osNum || alvo.osId} (${alvo.serviceNome || 'Serviço'}) há ${alvo.tempoDecorridoFormatado}.`
      };
    } else if (alvo.status === 'em_espera') {
      return {
        ok: true,
        acao: intencao,
        resposta: `${alvo.nome} está na OS #${alvo.osNum || alvo.osId}, porém pausado (${alvo.motivoPausa || 'aguardando'}) há ${alvo.tempoDecorridoFormatado}.`
      };
    } else {
      return {
        ok: true,
        acao: intencao,
        resposta: `${alvo.nome} está livre sem nenhum serviço em andamento no momento.`
      };
    }
  }

  if (intencao === 'consultar_box_mecanico') {
    const tenantId = context.tenantId || 'default';
    const matchBox = t.match(/box\s*(\d+|[a-zA-Z0-9_-]+)/i);
    const boxId = matchBox ? matchBox[1] : null;

    const entries = (state.laborEntries || []).filter(
      e => e.tenantId === tenantId && e.status === 'ativo' && (!boxId || String(e.boxId).toLowerCase() === String(boxId).toLowerCase())
    );

    if (entries.length === 0) {
      return { ok: true, acao: intencao, resposta: boxId ? `Não há nenhum mecânico atuando no box ${boxId} no momento.` : 'Nenhum box possui mecânicos trabalhando no momento.' };
    }

    const item = entries[0];
    return {
      ok: true,
      acao: intencao,
      resposta: `No box ${item.boxId} está o mecânico ${item.workerNome} atuando na OS #${item.osNum || item.osId} (${item.serviceNome}).`
    };
  }

  if (intencao === 'consultar_tempo_os') {
    const tenantId = context.tenantId || 'default';
    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    let osAlvo = null;
    if (numOS) {
      osAlvo = (state.os || []).find(o => (o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo && context.activeOsId) {
      osAlvo = (state.os || []).find(o => o.id === context.activeOsId && (o.tenantId === tenantId || !o.tenantId));
    }
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual é a ordem de serviço para calcular o tempo.' };
    }

    const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId, state, osId: osAlvo.id });
    return {
      ok: true,
      acao: intencao,
      osId: osAlvo.id,
      horasHomemTotal: apuracao.horasHomemTotal,
      resposta: `Na OS #${osAlvo.num || osAlvo.id} foram acumuladas ${apuracao.horasHomemTotal} horas-homem de trabalho em ${apuracao.apontamentos.length} apontamento(s).`
    };
  }

  if (intencao === 'consultar_mecanico_mais_produtivo') {
    const tenantId = context.tenantId || 'default';
    const prod = productivityService.calcularProdutividadeOficina({ tenantId, state });
    if (!prod || prod.mecanicos.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há dados suficientes de produtividade para a equipe hoje.' };
    }
    const ordenados = [...prod.mecanicos].sort((a, b) => (b.horasProdutivas || 0) - (a.horasProdutivas || 0));
    const top = ordenados[0];
    return {
      ok: true,
      acao: intencao,
      topMecanico: top,
      resposta: `O colaborador com maior volume produtivo hoje é ${top.nome}, com ${top.horasProdutivas}h produtivas (utilização de ${top.utilizacao || 0}%).`
    };
  }

  if (intencao === 'consultar_retrabalho') {
    const tenantId = context.tenantId || 'default';
    const prod = productivityService.calcularProdutividadeOficina({ tenantId, state });
    return {
      ok: true,
      acao: intencao,
      horasRetrabalho: prod?.horasRetrabalho || 0,
      resposta: `Tivemos ${prod?.horasRetrabalho || 0} hora(s) de retrabalho registradas hoje na oficina.`
    };
  }

  if (intencao === 'consultar_custo_mao_obra_os') {
    const tenantId = context.tenantId || 'default';
    const podeVerCusto = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('costing:read') || context.permissions.includes('productivity:manage')));

    if (!podeVerCusto) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: consultas financeiras de custo real exigem perfil administrativo ou gerencial.' };
    }

    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    const osAlvo = (state.os || []).find(o => (!numOS || o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei a ordem de serviço informada.' };
    }

    const apuracao = costingService.calcularCustoMaoDeObraOS({ tenantId, state, osId: osAlvo.id });
    return {
      ok: true,
      acao: intencao,
      custoMaoObra: apuracao.custoMaoObra,
      resposta: `O custo real de mão de obra da OS #${osAlvo.num || osAlvo.id} é de R$ ${apuracao.custoMaoObra.toFixed(2).replace('.', ',')} para um total de ${apuracao.horasHomemTotal} horas-homem trabalhadas.`
    };
  }

  if (intencao === 'consultar_custo_real_os') {
    const tenantId = context.tenantId || 'default';
    const podeVerCusto = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('costing:read') || context.permissions.includes('productivity:manage')));

    if (!podeVerCusto) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: apuração de custo real e margem da OS exige perfil administrativo ou gerencial.' };
    }

    const matchOS = t.match(/(?:os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{3,6})\b/);
    const numOS = matchOS ? parseInt(matchOS[1], 10) : null;
    const osAlvo = (state.os || []).find(o => (!numOS || o.num === numOS || o.id === String(numOS)) && (o.tenantId === tenantId || !o.tenantId));
    if (!osAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei a ordem de serviço informada.' };
    }

    const custoConsolidado = costingService.calcularCustoRealOS({ tenantId, state, osId: osAlvo.id });
    return {
      ok: true,
      acao: intencao,
      custos: custoConsolidado,
      resposta: `OS #${osAlvo.num || osAlvo.id}: Peças consumidas: R$ ${custoConsolidado.custoPecasConsumidas.toFixed(2).replace('.', ',')}, Mão de obra: R$ ${custoConsolidado.custoMaoObra.toFixed(2).replace('.', ',')}. Custo real total: R$ ${custoConsolidado.custoRealOS.toFixed(2).replace('.', ',')}. Valor autorizado: R$ ${custoConsolidado.receitaAutorizada.toFixed(2).replace('.', ',')}. Margem bruta operacional: R$ ${custoConsolidado.margemBrutaOS.toFixed(2).replace('.', ',')} (${custoConsolidado.margemPercentual}%).`
    };
  }

  // ── 15. AÇÕES DE PRECIFICAÇÃO E RENTABILIDADE ────────────
  function encontrarServicoAlvo(termo) {
    const tenantId = context.tenantId || 'default';
    if (!Array.isArray(state.servicos)) return null;
    if (context.serviceId || context.servicoId) {
      const s = state.servicos.find(srv => (srv.id === (context.serviceId || context.servicoId)) && (srv.tenantId === tenantId || !srv.tenantId));
      if (s) return s;
    }
    const termoLimpo = (termo || '').toLowerCase();
    for (const s of state.servicos) {
      if (s.tenantId && s.tenantId !== tenantId) continue;
      const sNome = (s.nome || s.desc || '').toLowerCase();
      if (sNome && termoLimpo.includes(sNome)) return s;
    }
    for (const s of state.servicos) {
      if (s.tenantId && s.tenantId !== tenantId) continue;
      const palavras = (s.nome || s.desc || '').toLowerCase().split(/[\s-]+/).filter(w => w.length >= 4);
      if (palavras.length > 0 && palavras.every(p => termoLimpo.includes(p))) return s;
    }
    for (const s of state.servicos) {
      if (s.tenantId && s.tenantId !== tenantId) continue;
      const palavras = (s.nome || s.desc || '').toLowerCase().split(/[\s-]+/).filter(w => w.length >= 4);
      if (palavras.some(p => termoLimpo.includes(p))) return s;
    }
    return state.servicos.find(s => s.tenantId === tenantId || !s.tenantId) || null;
  }

  function encontrarOrcamentoAlvo() {
    const tenantId = context.tenantId || 'default';
    const orcamentos = Array.isArray(state.quotations) ? state.quotations : (Array.isArray(state.orcamentos) ? state.orcamentos : []);
    const matchNum = t.match(/(?:orçamento|orcamento|os|ordem)\s*(?:#|número|numero)?\s*(\d+)/i) || t.match(/\b(\d{1,6})\b/);
    const num = matchNum ? parseInt(matchNum[1], 10) : null;
    if (num) {
      const orc = orcamentos.find(o => (o.numero === num || o.num === num || o.id === String(num)) && (o.tenantId === tenantId || !o.tenantId));
      if (orc) return orc;
    }
    if (context.quotationId || context.activeQuotationId) {
      const id = context.quotationId || context.activeQuotationId;
      const orc = orcamentos.find(o => o.id === id && (o.tenantId === tenantId || !o.tenantId));
      if (orc) return orc;
    }
    if (context.activeOsId || context.osId) {
      const osId = context.activeOsId || context.osId;
      const orc = orcamentos.find(o => (o.osId === osId || o.id === osId) && (o.tenantId === tenantId || !o.tenantId));
      if (orc) return orc;
    }
    return orcamentos.find(o => o.tenantId === tenantId || !o.tenantId) || null;
  }

  if (intencao === 'consultar_sugestao_preco') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read') || context.permissions.includes('pricing:recommend')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: consultas de recomendação de preço e margem exigem perfil autorizado.' };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não encontrei o serviço especificado para sugerir o preço.' };
    }

    const rec = pricingEngine.gerarRecomendacaoPreco({
      tenantId,
      state,
      serviceId: servicoAlvo.id,
      serviceNome: servicoAlvo.nome,
      userPermissions: context.permissions || ['pricing:read', 'pricing:recommend']
    });

    if (!rec.ok) {
      return { ok: false, acao: intencao, resposta: rec.error || 'Não foi possível gerar recomendação de preço.' };
    }

    const confMsg = rec.confianca === 'alta' ? 'Alta confiança (base estatística robusta)' : (rec.confianca === 'media' ? 'Média confiança' : 'Baixa confiança (amostra reduzida ou estimativa)');
    const resposta = `Sugestão para "${servicoAlvo.nome}": Preço alvo recomendado de R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')} (margem de ${rec.margemAlvoAplicada}%). Piso mínimo de segurança: R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')} (${rec.margemMinimaPolitica}%). Custo esperado: R$ ${rec.custoTotalEsperado.toFixed(2).replace('.', ',')} (${rec.tempoEsperadoHoras}h MO: R$ ${rec.custoMaoObraEsperado.toFixed(2).replace('.', ',')}, Peças: R$ ${rec.custoPecasEsperado.toFixed(2).replace('.', ',')}, baseado em ${rec.amostraHistorica.tamanhoAmostra} execuções reais). Nível: ${confMsg}.`;

    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      recomendacao: rec,
      resposta
    };
  }

  if (intencao === 'consultar_margem_orcamento') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: apuração de margem de orçamento exige perfil autorizado.' };
    }

    const orcAlvo = encontrarOrcamentoAlvo();
    if (!orcAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não localizei o orçamento para apurar a margem.' };
    }

    let receita = 0;
    let custoTotal = 0;

    const servicosOrc = Array.isArray(orcAlvo.servicos) ? orcAlvo.servicos : (Array.isArray(orcAlvo.services) ? orcAlvo.services : []);
    for (const s of servicosOrc) {
      const preco = Number(s.preco || s.valor || 0) * (Number(s.qtd || 1));
      receita += preco;
      const c = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: s.id || s.serviceId, serviceNome: s.nome || s.desc });
      custoTotal += c.custoTotalEsperado || 0;
    }

    const pecasOrc = Array.isArray(orcAlvo.pecas) ? orcAlvo.pecas : (Array.isArray(orcAlvo.parts) ? orcAlvo.parts : []);
    for (const p of pecasOrc) {
      const preco = Number(p.precoUnitario || p.preco || p.valor || 0) * (Number(p.qtd || p.quantidade || 1));
      receita += preco;
      const pCad = (state.pecas || []).find(item => item.id === (p.id || p.partId));
      const custoUnit = Number(pCad?.custoMedio || pCad?.ultimoCusto || p.custoUnitario || 0);
      custoTotal += custoUnit * (Number(p.qtd || p.quantidade || 1));
    }

    const margemBruta = receita - custoTotal;
    const margemPercentual = pricingEngine.calcularMargemBruta(receita, custoTotal);

    return {
      ok: true,
      acao: intencao,
      orcamentoId: orcAlvo.id,
      receita,
      custoTotal,
      margemBruta,
      margemPercentual,
      resposta: `Orçamento #${orcAlvo.numero || orcAlvo.num || orcAlvo.id}: Receita de R$ ${receita.toFixed(2).replace('.', ',')}, Custo previsto de R$ ${custoTotal.toFixed(2).replace('.', ',')}. Margem bruta estimada de R$ ${margemBruta.toFixed(2).replace('.', ',')} (${margemPercentual}%).`
    };
  }

  if (intencao === 'consultar_desconto_seguro') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: cálculo de desconto seguro exige perfil autorizado.' };
    }

    const orcAlvo = encontrarOrcamentoAlvo();
    if (orcAlvo) {
      let precoAtual = 0;
      let custoTotal = 0;
      for (const s of (orcAlvo.servicos || [])) {
        precoAtual += Number(s.preco || s.valor || 0) * Number(s.qtd || 1);
        const c = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: s.id, serviceNome: s.nome });
        custoTotal += c.custoTotalEsperado || 0;
      }
      for (const p of (orcAlvo.pecas || [])) {
        precoAtual += Number(p.precoUnitario || p.preco || p.valor || 0) * Number(p.qtd || 1);
        const pCad = (state.pecas || []).find(item => item.id === (p.id || p.partId));
        custoTotal += Number(pCad?.custoMedio || pCad?.ultimoCusto || p.custoUnitario || 0) * Number(p.qtd || 1);
      }
      const margemMinima = state.cfg?.precificacao?.margemMinimaPadrao != null ? Number(state.cfg.precificacao.margemMinimaPadrao) : 20.0;
      const precoMinimo = pricingEngine.calcularPrecoMinimo(custoTotal, margemMinima);
      const descSeguro = pricingEngine.calcularDescontoSeguro(precoAtual, precoMinimo);

      return {
        ok: true,
        acao: intencao,
        orcamentoId: orcAlvo.id,
        precoAtual,
        precoMinimo,
        descontoMaximoSeguro: descSeguro.descontoMaximoSeguro,
        resposta: `No orçamento #${orcAlvo.numero || orcAlvo.num || orcAlvo.id}, com valor atual de R$ ${precoAtual.toFixed(2).replace('.', ',')}, o piso de segurança é R$ ${precoMinimo.toFixed(2).replace('.', ',')} (margem mínima de ${margemMinima}%). O desconto máximo seguro é de R$ ${descSeguro.descontoMaximoSeguro.toFixed(2).replace('.', ',')} (${descSeguro.descontoMaximoPercentual}%).`
      };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (servicoAlvo) {
      const rec = pricingEngine.gerarRecomendacaoPreco({ tenantId, state, serviceId: servicoAlvo.id, userPermissions: ['pricing:read'] });
      const precoAtual = Number(servicoAlvo.preco || servicoAlvo.valor || rec.precoAlvoRecomendado || 0);
      const desc = pricingEngine.calcularDescontoSeguro(precoAtual, rec.precoMinimo);
      return {
        ok: true,
        acao: intencao,
        servicoId: servicoAlvo.id,
        precoAtual,
        precoMinimo: rec.precoMinimo,
        descontoMaximoSeguro: desc.descontoMaximoSeguro,
        resposta: `Para o serviço "${servicoAlvo.nome}", com preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')}, o piso mínimo é R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')}. Você pode conceder no máximo R$ ${desc.descontoMaximoSeguro.toFixed(2).replace('.', ',')} de desconto seguro.`
      };
    }

    return { ok: false, acao: intencao, resposta: 'Não identifiquei o orçamento ou serviço para calcular o desconto seguro.' };
  }

  if (intencao === 'consultar_servicos_pouca_margem') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('profitability:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: análise de rentabilidade exige perfil autorizado.' };
    }

    const lista = pricingEngine.obterRentabilidadeServicos({ tenantId, state, ordenarPor: 'margem_asc', limite: 5 });
    if (lista.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Ainda não há dados suficientes de ordens finalizadas para analisar a margem dos serviços.' };
    }

    const itens = lista.slice(0, 3).map(s => `"${s.serviceNome}": margem ${s.margemPercentual}% (Custo: R$ ${s.custoRealTotal.toFixed(2).replace('.', ',')}, Receita: R$ ${s.receitaTotal.toFixed(2).replace('.', ',')})`).join('; ');
    return {
      ok: true,
      acao: intencao,
      servicos: lista,
      resposta: `Os serviços com menor margem recente são: ${itens}.`
    };
  }

  if (intencao === 'consultar_servico_mais_retrabalho') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('profitability:read') || context.permissions.includes('productivity:manage')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: análise de retrabalho exige perfil autorizado.' };
    }

    const lista = pricingEngine.obterRentabilidadeServicos({ tenantId, state, ordenarPor: 'retrabalho_desc', limite: 5 });
    const comRetrabalho = lista.filter(s => s.taxaRetrabalho > 0);
    if (comRetrabalho.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Excelente! Não há registros de retrabalho associados aos serviços executados no período.' };
    }

    const top = comRetrabalho[0];
    return {
      ok: true,
      acao: intencao,
      servicos: comRetrabalho,
      resposta: `O serviço com maior índice de retrabalho é "${top.serviceNome}", com taxa de retrabalho de ${top.taxaRetrabalho}% (${top.execucoesRetrabalho} retorno(s) em ${top.quantidadeExecucoes} execuções).`
    };
  }

  if (intencao === 'consultar_custo_medio_servico') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: custo médio de serviços exige perfil autorizado.' };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei o serviço desejado para calcular o custo médio.' };
    }

    const custo = pricingEngine.calcularCustoEsperadoServico({ tenantId, state, serviceId: servicoAlvo.id, serviceNome: servicoAlvo.nome });
    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      custo,
      resposta: `O custo médio estimado para "${servicoAlvo.nome}" é de R$ ${custo.custoTotalEsperado.toFixed(2).replace('.', ',')}, sendo R$ ${custo.custoMaoObraEsperado.toFixed(2).replace('.', ',')} de mão de obra (${(custo.tempoEsperadoMinutos / 60).toFixed(1)}h) e R$ ${custo.custoPecasEsperado.toFixed(2).replace('.', ',')} em peças.`
    };
  }

  if (intencao === 'consultar_adequacao_preco_servico') {
    const tenantId = context.tenantId || 'default';
    const podeVer = context.isSenderAdmin ||
      (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:read')));
    if (!podeVer) {
      return { ok: false, acao: intencao, resposta: 'Acesso restrito: avaliação de preço exige perfil autorizado.' };
    }

    const servicoAlvo = encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual serviço analisar.' };
    }

    const rec = pricingEngine.gerarRecomendacaoPreco({ tenantId, state, serviceId: servicoAlvo.id, userPermissions: ['pricing:read'] });
    const precoAtual = Number(servicoAlvo.preco || servicoAlvo.valor || 0);

    let avaliacao = '';
    if (precoAtual === 0) {
      avaliacao = `O serviço "${servicoAlvo.nome}" está sem preço definido. A recomendação é cobrar R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}.`;
    } else if (precoAtual < rec.precoMinimo) {
      avaliacao = `Atenção: o preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')} está abaixo do piso mínimo de segurança de R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')}. A margem atual é prejudicial à oficina. Recomenda-se ajustar para R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}.`;
    } else if (precoAtual < rec.precoAlvoRecomendado) {
      avaliacao = `O preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')} cobre o piso mínimo (R$ ${rec.precoMinimo.toFixed(2).replace('.', ',')}), mas está abaixo da meta ideal de R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}.`;
    } else {
      avaliacao = `O preço atual de R$ ${precoAtual.toFixed(2).replace('.', ',')} é saudável e está alinhado com a meta de rentabilidade da oficina (alvo sugerido: R$ ${rec.precoAlvoRecomendado.toFixed(2).replace('.', ',')}).`;
    }

    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      precoAtual,
      precoAlvo: rec.precoAlvoRecomendado,
      precoMinimo: rec.precoMinimo,
      resposta: avaliacao
    };
  }

  if (intencao === 'alterar_preco_servico') {
    const tenantId = context.tenantId || 'default';
    const servicoAlvo = (context.servicoId ? (state.servicos || []).find(s => s.id === context.servicoId) : null) || encontrarServicoAlvo(t);
    if (!servicoAlvo) {
      return { ok: false, acao: intencao, resposta: 'Não identifiquei qual serviço deve ter o preço alterado.' };
    }

    const matchValor = t.match(/r\$\s*(\d+(?:[.,]\d+)?)/i) || t.match(/(?:para|coloca|muda|por)\s*(\d+(?:[.,]\d+)?)/i) || t.match(/\b(\d{3,5})\b/);
    const novoPreco = context.novoPreco || (matchValor ? parseFloat(matchValor[1].replace(',', '.')) : null);
    if (!novoPreco || isNaN(novoPreco) || novoPreco <= 0) {
      return { ok: false, acao: intencao, resposta: 'O valor informado para o serviço é inválido.' };
    }

    const rec = pricingEngine.gerarRecomendacaoPreco({ tenantId, state, serviceId: servicoAlvo.id, userPermissions: ['pricing:read'] });
    const precoMinimo = rec.precoMinimo;

    if (novoPreco < precoMinimo && !context._confirmadoInternamente) {
      const podeOverride = context.isSenderAdmin ||
        (context.permissions && (context.permissions.includes('*') || context.permissions.includes('pricing:override')));

      if (!podeOverride) {
        return {
          ok: false,
          acao: intencao,
          abaixoDoMinimo: true,
          resposta: `Ação bloqueada: o preço de R$ ${novoPreco.toFixed(2).replace('.', ',')} fica abaixo do piso mínimo de segurança (R$ ${precoMinimo.toFixed(2).replace('.', ',')}) e você não possui permissão de override de margem.`
        };
      }

      const token = gerarTokenAcao({ acao: 'alterar_preco_servico', tenantId, actorId: context.actorId || 'operador' });
      acoesPendentes.set(token, {
        interpretado,
        input,
        context: { ...context, novoPreco, servicoId: servicoAlvo.id },
        expiraEm: Date.now() + 5 * 60 * 1000
      });

      return {
        ok: false,
        requerConfirmacao: true,
        confirmToken: token,
        acao: intencao,
        resposta: `Atenção: o preço de R$ ${novoPreco.toFixed(2).replace('.', ',')} fica abaixo do piso de segurança de R$ ${precoMinimo.toFixed(2).replace('.', ',')} (margem mínima de ${rec.margemMinimaPolitica}%). Para confirmar essa exceção com autorização de override, responda "confirmar".`
      };
    }

    const precoAnterior = Number(servicoAlvo.preco || servicoAlvo.valor || 0);
    servicoAlvo.preco = novoPreco;
    servicoAlvo.valor = novoPreco;

    if (context._confirmadoInternamente && novoPreco < precoMinimo) {
      pricingEngine.registrarOverridePreco({
        tenantId,
        state,
        serviceId: servicoAlvo.id,
        precoProposto: novoPreco,
        precoMinimo,
        motivo: `Override autorizado via comando de voz ${state?.cfg?.assistente?.displayName || 'Verônica'}`,
        autorizadoPor: context.actorId || 'operador'
      });
    }

    registrarAuditoria(state, {
      canal: context.canal || 'voz',
      usuario: context.actorId || 'Operador',
      intencao,
      comando: input,
      resumo: `Preço do serviço "${servicoAlvo.nome}" alterado de R$ ${precoAnterior.toFixed(2)} para R$ ${novoPreco.toFixed(2)}.`
    });

    return {
      ok: true,
      acao: intencao,
      servicoId: servicoAlvo.id,
      precoAnterior,
      novoPreco,
      resposta: `Preço do serviço "${servicoAlvo.nome}" atualizado com sucesso para R$ ${novoPreco.toFixed(2).replace('.', ',')}.`
    };
  }


  // ── 15. HANDLERS DE CRM, FROTAS E MANUTENÇÃO PREVENTIVA ─────────
  const tenantId = context.tenantId || state.tenantId || 'default';
  if (intencao === 'consultar_frota_cliente') {
    const clientes = Array.isArray(state.clientes) ? state.clientes : [];
    const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
    const ordens = (state.os || []).filter(o => o.st !== 'finalizada');

    let cliAlvo = null;
    for (const c of clientes) {
      if (c.nome && tLower.includes(c.nome.toLowerCase())) {
        cliAlvo = c;
        break;
      }
    }

    if (!cliAlvo && (state.fleets || state.frotas)) {
      const frotas = state.fleets || state.frotas || [];
      for (const f of frotas) {
        if (f.nome && tLower.includes(f.nome.toLowerCase())) {
          cliAlvo = clientes.find(c => c.id === f.customerId) || { nome: f.nome, id: f.customerId };
          break;
        }
      }
    }

    if (!cliAlvo) {
      // Pega o primeiro frotista ou cliente encontrado
      cliAlvo = clientes.find(c => c.tipo === 'frotista') || clientes[0];
    }

    if (!cliAlvo) {
      return { ok: true, acao: intencao, resposta: 'Não há frotistas cadastrados no sistema no momento.' };
    }

    const veicsCli = veiculos.filter(v => v.cli === cliAlvo.id);
    const veicsNaOficina = veicsCli.filter(v => ordens.some(o => o.vei === v.id));

    let resp = `A ${cliAlvo.nome} possui ${veicsCli.length} veículo(s) cadastrado(s).`;
    if (veicsNaOficina.length > 0) {
      resp += ` No momento, ${veicsNaOficina.length} está(ão) na oficina: ${veicsNaOficina.map(v => v.placa).join(', ')}.`;
    } else {
      resp += ' Nenhum veículo dessa frota está na oficina no momento.';
    }

    return {
      ok: true,
      acao: intencao,
      cliente: cliAlvo.nome,
      totalVeiculos: veicsCli.length,
      veiculosNaOficina: veicsNaOficina.length,
      resposta: resp
    };
  }

  if (intencao === 'consultar_preventiva_frota') {
    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state });
    const clientes = Array.isArray(state.clientes) ? state.clientes : [];

    let cliAlvo = null;
    for (const c of clientes) {
      if (c.nome && tLower.includes(c.nome.toLowerCase())) {
        cliAlvo = c;
        break;
      }
    }

    let itens = prev.itens || [];
    if (cliAlvo) {
      const veiculosIds = new Set((state.veiculos || []).filter(v => v.cli === cliAlvo.id).map(v => v.id));
      itens = itens.filter(it => veiculosIds.has(it.vehicleId));
    }

    const vencidos = itens.filter(i => i.status === 'vencido');
    const proximos = itens.filter(i => i.status === 'proximo');
    const aguardandoKm = itens.filter(i => i.status === 'aguardando_km');

    let resp = '';
    if (cliAlvo) {
      resp += `Para a frota de ${cliAlvo.nome}: `;
    }

    if (vencidos.length === 0 && proximos.length === 0 && aguardandoKm.length === 0) {
      resp += 'Todas as manutenções preventivas estão rigorosamente em dia!';
    } else {
      const partes = [];
      if (vencidos.length > 0) {
        partes.push(`${vencidos.length} com manutenção vencida (${vencidos.map(v => v.placa + ' - ' + v.descricao).slice(0, 3).join(', ')})`);
      }
      if (proximos.length > 0) {
        partes.push(`${proximos.length} com revisão próxima (${proximos.map(v => v.placa + ' - ' + v.descricao).slice(0, 3).join(', ')})`);
      }
      if (aguardandoKm.length > 0) {
        partes.push(`${aguardandoKm.length} aguardando atualização de KM (${aguardandoKm.map(v => v.placa).slice(0, 3).join(', ')})`);
      }
      resp += `Temos ${partes.join('; ')}.`;
    }

    return {
      ok: true,
      acao: intencao,
      vencidos: vencidos.length,
      proximos: proximos.length,
      aguardandoKm: aguardandoKm.length,
      resposta: resp
    };
  }

  if (intencao === 'consultar_contatos_crm') {
    const opNovas = relationshipService.avaliarOportunidades({ tenantId, state });
    const opTotal = (state.opportunities || []).filter(o => ['aberta', 'contato_programado'].includes(o.status));

    if (opTotal.length === 0) {
      return {
        ok: true,
        acao: intencao,
        resposta: 'Não há contatos proativos pendentes na fila do CRM hoje.'
      };
    }

    const inativos = opTotal.filter(o => o.tipo === 'cliente_inativo');
    const prevs = opTotal.filter(o => o.tipo === 'manutencao_proxima' || o.tipo === 'manutencao_vencida');

    return {
      ok: true,
      acao: intencao,
      totalOportunidades: opTotal.length,
      resposta: `Há ${opTotal.length} oportunidade(s) de contato hoje: ${prevs.length} para manutenções preventivas e ${inativos.length} cliente(s) inativo(s) aguardando relacionamento.`
    };
  }

  if (intencao === 'consultar_manutencao_veiculo') {
    const placa = interpretado.veiculo || normalizarPlaca(tLower);
    const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
    const veic = placa ? veiculos.find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placa) : veiculos[0];

    if (!veic) {
      return { ok: true, acao: intencao, resposta: 'Veículo não localizado para consulta de manutenção.' };
    }

    const prev = maintenancePlanService.avaliarVencimentos({ tenantId, state, vehicleId: veic.id });
    const hist = vehicleHistoryService.obterHistoricoVeiculo({ tenantId, vehicleId: veic.id, state });

    const ultimaOS = hist?.ultimaOS;
    let resp = `Veículo ${veic.placa}: `;
    if (ultimaOS) {
      resp += `Última manutenção realizada em ${ultimaOS.dataFechamento || ultimaOS.dataAbertura} (OS #${ultimaOS.num}). `;
    } else {
      resp += 'Sem histórico anterior de serviços concluídos. ';
    }

    const itensPrev = prev.itens || [];
    if (itensPrev.length > 0) {
      const prox = itensPrev[0];
      resp += `Próxima revisão prevista: "${prox.descricao}" (${prox.status.toUpperCase()})`;
      if (prox.kmRestante != null) resp += ` em aproximadamente ${Math.abs(prox.kmRestante).toLocaleString('pt-BR')} km`;
      if (prox.diasRestantes != null) resp += ` ou em ${Math.abs(prox.diasRestantes)} dia(s)`;
      resp += '.';
    } else {
      resp += 'Nenhum plano de preventiva cadastrado para este veículo.';
    }

    return {
      ok: true,
      acao: intencao,
      placa: veic.placa,
      resposta: resp
    };
  }

  if (intencao === 'consultar_pos_venda') {
    const pv = afterSalesService.avaliarPosVenda({ tenantId, state });
    const pendentes = pv.pendentesHoje || [];

    if (pendentes.length === 0) {
      return { ok: true, acao: intencao, resposta: 'Não há nenhum acompanhamento de pós-venda pendente para envio hoje.' };
    }

    return {
      ok: true,
      acao: intencao,
      totalPendentes: pendentes.length,
      resposta: `Temos ${pendentes.length} pós-venda(s) pendente(s) hoje para acompanhamento pós-entrega.`
    };
  }

  if (intencao === 'agendar_veiculo') {
    const placa = interpretado.veiculo || normalizarPlaca(tLower);
    const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
    const veic = placa ? veiculos.find(v => v.placa && v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') === placa) : null;

    // Calcula data agendada (ex: terça-feira ou amanhã)
    const hoje = new Date();
    const dataAlvo = new Date(hoje);
    if (tLower.includes('amanhã') || tLower.includes('amanha')) {
      dataAlvo.setDate(dataAlvo.getDate() + 1);
    } else if (tLower.includes('terça') || tLower.includes('terca')) {
      const diaSemana = dataAlvo.getDay();
      const diff = (2 + 7 - diaSemana) % 7 || 7;
      dataAlvo.setDate(dataAlvo.getDate() + diff);
    } else {
      dataAlvo.setDate(dataAlvo.getDate() + 2);
    }

    const dataISO = dataAlvo.toISOString().slice(0, 10);
    const hora = (tLower.includes('tarde')) ? '14:00' : '08:30';

    const agd = appointmentService.criarAgendamento({
      tenantId,
      state,
      vehicleId: veic ? veic.id : null,
      scheduledDate: dataISO,
      scheduledTime: hora,
      reason: 'Revisão preventiva agendada por voz',
      createdBy: context.actorId || 'voz'
    });

    const placaExib = veic ? veic.placa : (placa || 'Veículo');
    return {
      ok: true,
      acao: intencao,
      agendamento: agd.agendamento,
      resposta: `Agendamento confirmado para o veículo ${placaExib} na ${dataISO} às ${hora}.`
    };
  }

  if (intencao === 'ajuda_sistema_treinamento') {
    let topico = interpretado.topico;
    if (!topico) {
      if (tLower.includes('cliente') || tLower.includes('transportadora')) topico = 'cliente';
      else if (tLower.includes('os') || tLower.includes('ordem de serviço') || tLower.includes('ordem de servico') || tLower.includes('pátio') || tLower.includes('patio')) topico = 'os';
      else if (tLower.includes('peça') || tLower.includes('peca') || tLower.includes('serviço') || tLower.includes('servico')) topico = 'pecas_servicos';
      else if (tLower.includes('faturar') || tLower.includes('faturamento') || tLower.includes('entregar')) topico = 'faturamento';
      else if (tLower.includes('nota') || tLower.includes('fiscal') || tLower.includes('nfe') || tLower.includes('nf-e') || tLower.includes('nfse') || tLower.includes('tribut')) topico = 'fiscal';
      else if (tLower.includes('assistente') || tLower.includes('voz') || tLower.includes('sofia') || tLower.includes('veronica')) topico = 'assistente';
      else if (tLower.includes('financeiro') || tLower.includes('caixa')) topico = 'financeiro';
      else if (tLower.includes('whatsapp') || tLower.includes('mensagem')) topico = 'whatsapp';
      else if (tLower.includes('regra') || tLower.includes('cfop')) topico = 'regras_tributarias';
      else topico = 'geral';
    }
    const resposta = BASE_CONHECIMENTO_SISTEMA[topico] || BASE_CONHECIMENTO_SISTEMA.geral;
    return {
      ok: true,
      acao: 'ajuda_sistema_treinamento',
      topico,
      resposta
    };
  }

  if (intencao === 'consultar_financeiro') {
    if (!canReadFinancial(context)) {
      return {
        ok: false,
        acao: 'consultar_financeiro',
        negado: true,
        resposta: 'Acesso negado: seu perfil não possui permissão para consultar dados financeiros da oficina.'
      };
    }

    const kpis = financialEngine.calcularKPIsFinanceiros(state);
    const subtipo = interpretado.subtipo || (
      (tLower.includes('pagar') || tLower.includes('vencimento')) ? 'pagar' :
      (tLower.includes('receber')) ? 'receber' :
      (tLower.includes('saldo') || tLower.includes('caixa')) ? 'saldo' :
      (tLower.includes('faturamento') || tLower.includes('faturamos')) ? 'faturamento' : 'geral'
    );

    let resp = '';
    if (subtipo === 'pagar') {
      const contas = Array.isArray(state.contas) ? state.contas : [];
      const aPagarAbertas = contas
        .filter(c => c.tipo === 'pagar' && !c.pago)
        .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''));

      if (aPagarAbertas.length === 0) {
        resp = 'Não há contas a pagar pendentes no momento. Todas estão em dia.';
      } else {
        const listaStr = aPagarAbertas.slice(0, 3).map(c => {
          const desc = c.desc || c.parte || 'Fornecedor';
          const val = financialEngine.formatarMoeda(c.valor);
          const dataVenc = c.venc ? (financialEngine.formatarDataBRFull(c.venc) || c.venc) : 'sem data';
          return `${desc} (${val} com vencimento em ${dataVenc})`;
        }).join(', ');
        resp = `Temos ${aPagarAbertas.length} conta(s) a pagar pendente(s), totalizando ${financialEngine.formatarMoeda(kpis.totalPagarAberto)}. Próximos vencimentos: ${listaStr}.`;
      }
    } else if (subtipo === 'receber') {
      const contas = Array.isArray(state.contas) ? state.contas : [];
      const aReceberAbertas = contas.filter(c => c.tipo === 'receber' && !c.pago);
      if (aReceberAbertas.length === 0) {
        resp = 'Não há títulos a receber em aberto no momento.';
      } else {
        resp = `Temos ${aReceberAbertas.length} título(s) a receber em aberto, totalizando ${financialEngine.formatarMoeda(kpis.totalReceberAberto)}. Vencidos: ${financialEngine.formatarMoeda(kpis.totalRecVencidos)}, a receber hoje: ${financialEngine.formatarMoeda(kpis.totalRecHoje)}.`;
      }
    } else if (subtipo === 'saldo') {
      resp = `O saldo atual consolidado do caixa é de ${financialEngine.formatarMoeda(kpis.saldoConsolidado)}. Total de entradas registradas: ${financialEngine.formatarMoeda(kpis.totalEntradasGeral)} e saídas: ${financialEngine.formatarMoeda(kpis.totalSaidasGeral)}.`;
    } else if (subtipo === 'faturamento') {
      const fatTotal = state.financeiro?.faturamentoTotal || kpis.totalEntradasGeral;
      resp = `O faturamento registrado no sistema é de ${financialEngine.formatarMoeda(fatTotal)}.`;
    } else {
      resp = `Posição financeira da oficina: Saldo em caixa ${financialEngine.formatarMoeda(kpis.saldoConsolidado)}, a pagar ${financialEngine.formatarMoeda(kpis.totalPagarAberto)} e a receber ${financialEngine.formatarMoeda(kpis.totalReceberAberto)}.`;
    }

    return {
      ok: true,
      acao: 'consultar_financeiro',
      subtipo,
      kpis,
      resposta: resp
    };
  }

  if (intencao === 'consultar_estoque') {
    const pecas = Array.isArray(state.pecas) ? state.pecas : [];
    const criticas = pecas.filter(p => {
      const qtd = Number(p.qtd) || 0;
      const min = Number(p.min) || 1;
      return qtd <= min;
    });

    let resp = '';
    if (criticas.length === 0) {
      resp = 'O estoque está regular. Nenhuma peça está abaixo do estoque mínimo de segurança.';
    } else {
      const lista = criticas.slice(0, 4).map(p => `${p.nome || p.cod || 'Peça'} (${p.qtd} em estoque, mín. ${p.min || 1})`).join(', ');
      resp = `Atenção: temos ${criticas.length} item(ns) com estoque baixo ou crítico para reposição: ${lista}.`;
    }

    return {
      ok: true,
      acao: 'consultar_estoque',
      totalCriticas: criticas.length,
      criticas,
      resposta: resp
    };
  }

  // Fallback para dúvidas gerais ou não mapeadas
  return {
    ok: true,
    acao: 'duvida_geral',
    resposta: interpretado.resposta_falada || 'Entendido. Como posso ajudar com a oficina?'
  };
}

/**
 * Grava trilha de auditoria no estado
 */
function registrarAuditoria(state, { canal, usuario, intencao, comando, resumo, osId }) {
  if (!state.auditoria) state.auditoria = [];
  state.auditoria.unshift({
    id: gerarId('aud'),
    dataHora: new Date().toISOString(),
    canal: canal || 'web',
    usuario: usuario || 'Operador',
    intencao: intencao || 'geral',
    comando: comando || '',
    resumo: resumo || '',
    osId: osId || null
  });

  if (state.auditoria.length > 500) {
    state.auditoria.length = 500;
  }
}

/**
 * Função principal pública: recebe entrada, processa e executa
 */
async function interpretarEExecutar({ input, context = {}, state = {}, aiClient = null }) {
  const interpretado = await interpretarComando({ input, context, state, aiClient });
  const resultadoExecucao = await executarAcao({ interpretado, input, context, state });

  return {
    ...resultadoExecucao,
    interpretado
  };
}

function consumirAcaoPendente(token, { tenantId, actorId } = {}) {
  const c = confirmarConsumoTokenAcao(token, { tenantId, actorId });
  acoesPendentes.delete(token);
  return c;
}

function abortarConfirmacaoAcao(token) {
  if (!token) return;
  liberarTokenAcao(token);
  const acao = acoesPendentes.get(token);
  if (acao) {
    delete acao.emProcessamento;
  }
}

function buscarTokenPendente({ canal, remetente, token } = {}) {
  if (token && acoesPendentes.has(token)) return token;
  if (token) return token;
  if (canal) {
    for (const [t, a] of acoesPendentes) {
      if (a.context?.canal === canal &&
          (!remetente || a.context?.remetente === remetente || a.context?.actorId === remetente)) {
        return t;
      }
    }
  }
  return null;
}

module.exports = {
  interpretarEExecutar,
  processarComandoVoz: async ({ texto, input, context, state, tenantId }) => interpretarEExecutar({ input: texto || input, context: { ...(context || {}), tenantId }, state }),
  interpretarComando,
  interpretarPorRegras,
  executarAcao,
  consumirAcaoPendente,
  abortarConfirmacaoAcao,
  buscarTokenPendente,
  normalizarKm,
  normalizarPlaca
};
