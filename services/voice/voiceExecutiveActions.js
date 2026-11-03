'use strict';

const executiveManagerService = require('../executiveManagerService');
const financialEngine = require('../financialEngine');
const { BASE_CONHECIMENTO_SISTEMA } = require('./voiceSecurity');

async function handleExecutiveAction({ intencao, interpretado, input, context = {}, state = {} }) {
  const rawText = (input && typeof input.text === 'string') ? input.text :
                  (input && typeof input.texto === 'string') ? input.texto :
                  (typeof input === 'string' ? input : '');
  const tLower = rawText.trim().toLowerCase();
  const tenantId = context.tenantId || state.tenantId || 'default';

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

  if (intencao === 'consultar_gestao_360') {
    const relatorio = executiveManagerService.gerarRelatorioGerencial360(state, { tenantId });
    return {
      ok: true,
      acao: 'consultar_gestao_360',
      relatorio,
      resposta: relatorio.textoVoz || relatorio.textoWhatsApp
    };
  }

  if (intencao === 'consultar_compras_sugeridas') {
    const analise = executiveManagerService.analisarComprasEEstoque(state, { tenantId });
    let resp = '';
    if (analise.resumo.totalItensNecessidade === 0) {
      resp = 'O estoque de peças está regular. Nenhuma peça abaixo do estoque mínimo nem OS travada por falta de materiais.';
    } else {
      resp = `Análise de Compras: Temos ${analise.resumo.totalItensNecessidade} item(ns) com sugestão de compra, totalizando ${financialEngine.formatarMoeda(analise.resumo.custoTotalReposicao)}.`;
      if (analise.resumo.totalItensCriticosOS > 0) {
        resp += ` Atenção: ${analise.resumo.totalItensCriticosOS} item(ns) com déficit imediato para ordens de serviço ativas no pátio (${financialEngine.formatarMoeda(analise.resumo.custoOSUrgente)}).`;
      }
      resp += ` ${analise.financeiro.parecerFinanceiro}`;
    }
    return {
      ok: true,
      acao: 'consultar_compras_sugeridas',
      analise,
      resposta: resp
    };
  }

  if (intencao === 'consultar_produtividade_equipe') {
    const analise = executiveManagerService.analisarProdutividadeEquipe(state, { tenantId });
    let resp = `Produtividade da Equipe: ${analise.resumo.totalMecanicos} mecânico(s) ativos com ${analise.resumo.totalHorasProdutivasEquipe}h produtivas apontadas e ${financialEngine.formatarMoeda(analise.resumo.totalReceitaMaoDeObra)} em mão de obra gerada.`;
    if (analise.resumo.mecanicoDestaque) {
      resp += ` Mecânico destaque: ${analise.resumo.mecanicoDestaque.nome} com ${financialEngine.formatarMoeda(analise.resumo.mecanicoDestaque.receita)} gerados em ${analise.resumo.mecanicoDestaque.osCount} OSs.`;
    }
    if (analise.resumo.totalSobrecarregados > 0) {
      resp += ` Há ${analise.resumo.totalSobrecarregados} colaborador(es) com sobrecarga de jornada.`;
    }
    if (analise.resumo.totalOciosos > 0) {
      resp += ` Há ${analise.resumo.totalOciosos} colaborador(es) com ociosidade.`;
    }
    return {
      ok: true,
      acao: 'consultar_produtividade_equipe',
      analise,
      resposta: resp
    };
  }

  return null;
}

module.exports = {
  handleExecutiveAction
};

