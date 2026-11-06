'use strict';

/**
 * Pátio CRM — Filtragem de Estado por Papel e Permissões (RBAC)
 * Submódulo extraído de lib/repository/stateRepository.js (< 350 linhas)
 */

function filterStateByRole(state, context = null) {
  if (!state || typeof state !== 'object') return state;
  if (!context) return state;

  const perms = context.permissions || [];
  const role = context.role;
  const isPrivileged = perms.includes('*') || ['admin', 'tenant_admin', 'service_admin', 'platform_admin', 'platform_support', 'dono', 'owner'].includes(role);
  if (isPrivileged) {
    return state;
  }

  const filtered = JSON.parse(JSON.stringify(state));

  // 1. Financeiro: quem não tem financial:read não recebe movimentações, contas ou saldos
  if (!perms.includes('financial:read') && role !== 'financeiro') {
    filtered.financeiro = { faturamentoTotal: 0, custosTotal: 0, margemOperacional: 0, movimentos: [], contas: [], resumo: {} };
    filtered.contas = [];
    filtered.movimentos = [];
    filtered.pricingOverrides = [];
    if (filtered.caixa) {
      filtered.caixa = { saldo: 0, entradas: 0, saidas: 0 };
    }

    // Oculta estritamente valores financeiros de OS para perfis operacionais
    if (Array.isArray(filtered.os)) {
      filtered.os = filtered.os.map(o => {
        if (!o || typeof o !== 'object') return o;
        const safe = { ...o };
        delete safe.total;
        delete safe.desc;
        delete safe.desconto;
        delete safe.orcamento;
        delete safe.faturamento;
        delete safe.contasReceber;
        if (Array.isArray(safe.servicos)) {
          safe.servicos = safe.servicos.map(s => {
            if (!s || typeof s !== 'object') return s;
            const cs = { ...s };
            delete cs.valor;
            delete cs.custo;
            delete cs.subtotal;
            return cs;
          });
        }
        if (Array.isArray(safe.pecas)) {
          safe.pecas = safe.pecas.map(p => {
            if (!p || typeof p !== 'object') return p;
            const cp = { ...p };
            delete cp.valor;
            delete cp.custo;
            delete cp.venda;
            delete cp.margem;
            delete cp.subtotal;
            return cp;
          });
        }
        return safe;
      });
    }

    // Oculta custos e preços de venda do catálogo de peças no estoque
    if (Array.isArray(filtered.pecas)) {
      filtered.pecas = filtered.pecas.map(p => {
        if (!p || typeof p !== 'object') return p;
        const cp = { ...p };
        delete cp.custo;
        delete cp.venda;
        delete cp.margem;
        delete cp.preco;
        delete cp.valor;
        delete cp.precoVenda;
        delete cp.custoMedio;
        delete cp.subtotal;
        return cp;
      });
    }

    // Oculta valores e custos do catálogo de serviços geral
    if (Array.isArray(filtered.servicos)) {
      filtered.servicos = filtered.servicos.map(s => {
        if (!s || typeof s !== 'object') return s;
        const cs = { ...s };
        delete cs.valor;
        delete cs.custo;
        delete cs.subtotal;
        return cs;
      });
    }

    // Oculta orçamentos comerciais e seus subtotais/valores
    if (!perms.includes('quotation:read')) {
      filtered.quotations = [];
    } else if (Array.isArray(filtered.quotations)) {
      filtered.quotations = filtered.quotations.map(q => {
        if (!q || typeof q !== 'object') return q;
        const cq = { ...q };
        delete cq.totalGeral;
        delete cq.descontoGeral;
        delete cq.subtotal;
        delete cq.valor;
        delete cq.margemLucro;
        const itensKey = Array.isArray(cq.itens) ? 'itens' : (Array.isArray(cq.items) ? 'items' : null);
        if (itensKey) {
          cq[itensKey] = cq[itensKey].map(it => {
            if (!it || typeof it !== 'object') return it;
            const cit = { ...it };
            delete cit.valor;
            delete cit.custo;
            delete cit.subtotal;
            delete cit.total;
            return cit;
          });
        }
        return cq;
      });
    }

    // Oculta valores em apontamentos e requisições de peças
    if (Array.isArray(filtered.partRequirements)) {
      filtered.partRequirements = filtered.partRequirements.map(pr => {
        if (!pr || typeof pr !== 'object') return pr;
        const cpr = { ...pr };
        delete cpr.custoEstimado;
        delete cpr.valorEstimado;
        delete cpr.custo;
        delete cpr.valor;
        delete cpr.subtotal;
        return cpr;
      });
    }

    if (Array.isArray(filtered.laborEntries)) {
      filtered.laborEntries = filtered.laborEntries.map(le => {
        if (!le || typeof le !== 'object') return le;
        const cle = { ...le };
        delete cle.valorHora;
        delete cle.custoHora;
        delete cle.total;
        delete cle.custo;
        return cle;
      });
    }
  }

  // 2. Configurações da Empresa: remover dados bancários e segredos de API para operadores sem admin:settings
  if (!perms.includes('admin:settings') && role !== 'gerente') {
    if (filtered.cfg && typeof filtered.cfg === 'object') {
      delete filtered.cfg.apiKeyExterna;
      delete filtered.cfg.apiKey;
      delete filtered.cfg.asaasApiKey;
      delete filtered.cfg.geminiApiKey;
      delete filtered.cfg.token;
      if (filtered.cfg.empresa && typeof filtered.cfg.empresa === 'object') {
        delete filtered.cfg.empresa.chavePix;
        delete filtered.cfg.empresa.banco;
        delete filtered.cfg.empresa.agencia;
        delete filtered.cfg.empresa.conta;
      }
    }
  }

  // 3. Trilha de auditoria: restrita a administradores
  if (!perms.includes('admin:settings') && !perms.includes('audit:read')) {
    filtered.auditoria = [];
  }

  // 4. Mecânico: restringe dados de fornecedores e compras internas
  if (role === 'mecanico') {
    filtered.suppliers = [];
    filtered.purchaseQuotes = [];
    filtered.purchaseOrders = [];
  }

  return filtered;
}


module.exports = {
  filterStateByRole
};
