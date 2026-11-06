'use strict';

const { run, all, transaction } = require('../../db');

/**
 * Pátio CRM — Sanitização, Reconciliação e Proteção de Campos Administrativos
 * Submódulo extraído de lib/repository/stateRepository.js (< 350 linhas)
 */
async function sanitizeAndProtectState(stateToSave, current, context, permissions) {
    const tenantId = context?.tenantId || 'default';
    // ── PROTEÇÃO DE CAMPOS ADMINISTRATIVOS & RBAC EFETIVO ──
    const safePermissions = permissions || [];
    const isAdmin = safePermissions.includes('admin:settings') || safePermissions.includes('*') || ['admin', 'tenant_admin', 'dono', 'owner'].includes(context.role);
    const canWriteFinancial = safePermissions.includes('financial:write') || safePermissions.includes('*') || isAdmin || context.role === 'financeiro';

    // 1. Configurações da empresa (somente admin pode alterar)
    if (!isAdmin) {
      if (current && current.cfg) {
        stateToSave.cfg = JSON.parse(JSON.stringify(current.cfg));
      } else {
        delete stateToSave.cfg;
      }
    } else {
      // Mesmo com permissão administrativa genérica, se o operador NÃO for Dono/Tenant Admin estrito,
      // protege os 4 campos críticos do WhatsApp contra sobrescrita indevida (portas dos fundos / sync / importações)
      const roleStr = (context.role || '').toLowerCase();
      const isOwner = ['dono', 'tenant_admin', 'owner', 'platform_admin', 'system'].includes(roleStr);
      if (!isOwner && current?.cfg) {
        if (!stateToSave.cfg) stateToSave.cfg = {};
        if (current.cfg.comandosFinanceirosEscrita !== undefined) {
          stateToSave.cfg.comandosFinanceirosEscrita = current.cfg.comandosFinanceirosEscrita;
        } else {
          delete stateToSave.cfg.comandosFinanceirosEscrita;
        }
        if (current.cfg.limiteValorLancamentoWhatsapp !== undefined) {
          stateToSave.cfg.limiteValorLancamentoWhatsapp = current.cfg.limiteValorLancamentoWhatsapp;
        } else {
          delete stateToSave.cfg.limiteValorLancamentoWhatsapp;
        }
        if (current.cfg.adminFones !== undefined) {
          stateToSave.cfg.adminFones = JSON.parse(JSON.stringify(current.cfg.adminFones));
        } else {
          delete stateToSave.cfg.adminFones;
        }
        if (current.cfg.avisarCaixaWhatsapp !== undefined) {
          stateToSave.cfg.avisarCaixaWhatsapp = current.cfg.avisarCaixaWhatsapp;
        } else {
          delete stateToSave.cfg.avisarCaixaWhatsapp;
        }
      }
    }

    // 1.1 Assinatura SaaS da Plataforma (inquilino não pode alterar seu próprio plano via POST de estado)
    const isPlatformAdmin = context.role === 'platform_admin' || context.role === 'system';
    if (!isPlatformAdmin) {
      if (current && current.subscription) {
        stateToSave.subscription = JSON.parse(JSON.stringify(current.subscription));
      } else {
        delete stateToSave.subscription;
      }
    }

    // 2. Dados Financeiros Sensíveis (apenas financeiro ou admin podem alterar)
    if (!canWriteFinancial && current) {
      if (current.financeiro) stateToSave.financeiro = JSON.parse(JSON.stringify(current.financeiro));
      if (current.contas) stateToSave.contas = JSON.parse(JSON.stringify(current.contas));
      if (current.movimentos) stateToSave.movimentos = JSON.parse(JSON.stringify(current.movimentos));
      if (current.pricingOverrides) stateToSave.pricingOverrides = JSON.parse(JSON.stringify(current.pricingOverrides));
      if (current.caixa) stateToSave.caixa = JSON.parse(JSON.stringify(current.caixa));
      if (current.quotations) stateToSave.quotations = JSON.parse(JSON.stringify(current.quotations));

      // Reconciliação não-destrutiva de campos financeiros em OS
      if (Array.isArray(stateToSave.os)) {
        for (const o of stateToSave.os) {
          if (!o || typeof o !== 'object') continue;
          const orig = Array.isArray(current.os) ? current.os.find(x => x && x.id === o.id) : null;
          if (orig) {
            if (orig.total !== undefined) o.total = orig.total;
            if (orig.desc !== undefined) o.desc = orig.desc;
            if (orig.desconto !== undefined) o.desconto = orig.desconto;
            if (orig.orcamento !== undefined) o.orcamento = JSON.parse(JSON.stringify(orig.orcamento));
            if (orig.faturamento !== undefined) o.faturamento = orig.faturamento;
            if (orig.contasReceber !== undefined) o.contasReceber = orig.contasReceber;

            // Reconciliação estrita de serviços por ID
            if (Array.isArray(o.servicos)) {
              for (const s of o.servicos) {
                if (!s || typeof s !== 'object') continue;
                let origS = null;
                if (s.id && Array.isArray(orig.servicos)) {
                  origS = orig.servicos.find(x => x && x.id === s.id);
                } else if (!s.id && s.nome && Array.isArray(orig.servicos)) {
                  // Fallback somente quando nenhum dos dois lados possui ID estável
                  const matches = orig.servicos.filter(x => x && !x.id && x.nome === s.nome);
                  if (matches.length === 1) origS = matches[0];
                }

                if (origS) {
                  o.servicos = o.servicos;
                  if (origS.valor !== undefined) s.valor = origS.valor;
                  if (origS.custo !== undefined) s.custo = origS.custo;
                  if (origS.subtotal !== undefined) s.subtotal = origS.subtotal;
                } else {
                  // Item novo adicionado por operador sem permissão financeira:
                  // NÃO aceitar valores financeiros injetados no payload
                  delete s.valor;
                  delete s.custo;
                  delete s.subtotal;
                  // Se existir no catálogo autorizado de serviços, preenche a partir dele
                  const catS = Array.isArray(current.servicos) ? current.servicos.find(x => x && (x.id === s.id || x.nome === s.nome)) : null;
                  if (catS) {
                    s.valor = catS.valor || 0;
                    s.custo = catS.custo || 0;
                    s.subtotal = (Number(s.qtd) || 1) * (catS.valor || 0);
                  }
                }
              }
            }

            // Reconciliação estrita de peças por ID
            if (Array.isArray(o.pecas)) {
              for (const p of o.pecas) {
                if (!p || typeof p !== 'object') continue;
                let origP = null;
                if (p.id && Array.isArray(orig.pecas)) {
                  origP = orig.pecas.find(x => x && x.id === p.id);
                } else if (!p.id && p.codigo && Array.isArray(orig.pecas)) {
                  const matches = orig.pecas.filter(x => x && !x.id && x.codigo === p.codigo);
                  if (matches.length === 1) origP = matches[0];
                }

                if (origP) {
                  if (origP.valor !== undefined) p.valor = origP.valor;
                  if (origP.custo !== undefined) p.custo = origP.custo;
                  if (origP.venda !== undefined) p.venda = origP.venda;
                  if (origP.margem !== undefined) p.margem = origP.margem;
                  if (origP.subtotal !== undefined) p.subtotal = origP.subtotal;
                } else {
                  // Peça nova injetada por operador sem permissão financeira:
                  delete p.valor;
                  delete p.custo;
                  delete p.venda;
                  delete p.margem;
                  delete p.subtotal;
                  const catP = Array.isArray(current.pecas) ? current.pecas.find(x => x && (x.id === p.id || (p.codigo && x.codigo === p.codigo))) : null;
                  if (catP) {
                    p.valor = catP.venda || 0;
                    p.custo = catP.custo || 0;
                    p.venda = catP.venda || 0;
                    p.subtotal = (Number(p.qtd) || 1) * (catP.venda || 0);
                  }
                }
              }
            }
          } else {
            // Nova OS inserida por operador sem permissão financeira:
            // Não aceita valores totais injetados
            delete o.total;
            delete o.desc;
            delete o.desconto;
            delete o.orcamento;
            delete o.faturamento;
            delete o.contasReceber;
            if (Array.isArray(o.servicos)) {
              for (const s of o.servicos) {
                if (s && typeof s === 'object') {
                  delete s.valor;
                  delete s.custo;
                  delete s.subtotal;
                  const catS = Array.isArray(current.servicos) ? current.servicos.find(x => x && (x.id === s.id || x.nome === s.nome)) : null;
                  if (catS) {
                    s.valor = catS.valor || 0;
                    s.custo = catS.custo || 0;
                    s.subtotal = (Number(s.qtd) || 1) * (catS.valor || 0);
                  }
                }
              }
            }
            if (Array.isArray(o.pecas)) {
              for (const p of o.pecas) {
                if (p && typeof p === 'object') {
                  delete p.valor;
                  delete p.custo;
                  delete p.venda;
                  delete p.margem;
                  delete p.subtotal;
                  const catP = Array.isArray(current.pecas) ? current.pecas.find(x => x && (x.id === p.id || (p.codigo && x.codigo === p.codigo))) : null;
                  if (catP) {
                    p.valor = catP.venda || 0;
                    p.custo = catP.custo || 0;
                    p.venda = catP.venda || 0;
                    p.subtotal = (Number(p.qtd) || 1) * (catP.venda || 0);
                  }
                }
              }
            }
          }
        }
      }

      // Reconciliação não-destrutiva de peças de estoque
      if (Array.isArray(stateToSave.pecas) && Array.isArray(current.pecas)) {
        for (const p of stateToSave.pecas) {
          if (!p || typeof p !== 'object') continue;
          const origP = current.pecas.find(x => x && ((p.id && x.id === p.id) || (x.codigo && p.codigo && x.codigo === p.codigo)));
          if (origP) {
            if (origP.custo !== undefined) p.custo = origP.custo;
            if (origP.venda !== undefined) p.venda = origP.venda;
            if (origP.margem !== undefined) p.margem = origP.margem;
          } else {
            delete p.custo;
            delete p.venda;
            delete p.margem;
          }
        }
      }

      // Catálogo de serviços: operador sem permissão não altera valores
      if (Array.isArray(stateToSave.servicos) && Array.isArray(current.servicos)) {
        for (const s of stateToSave.servicos) {
          if (!s || typeof s !== 'object') continue;
          const origS = current.servicos.find(x => x && ((s.id && x.id === s.id) || (x.nome && s.nome && x.nome === s.nome)));
          if (origS) {
            if (origS.valor !== undefined) s.valor = origS.valor;
            if (origS.custo !== undefined) s.custo = origS.custo;
          } else {
            delete s.valor;
            delete s.custo;
          }
        }
      }
    }

    // 3. Catálogo de Compras & Fornecedores (mecânico não pode limpar ou sobrescrever compras internas)
    if (context.role === 'mecanico' && current) {
      if (current.suppliers) stateToSave.suppliers = JSON.parse(JSON.stringify(current.suppliers));
      if (current.purchaseQuotes) stateToSave.purchaseQuotes = JSON.parse(JSON.stringify(current.purchaseQuotes));
      if (current.purchaseOrders) stateToSave.purchaseOrders = JSON.parse(JSON.stringify(current.purchaseOrders));
    }

    // 4. Trilha de Auditoria Imutável (estritamente append-only para TODOS, incluindo admin)
    if (Array.isArray(stateToSave.auditoria)) {
      const auditAtual = Array.isArray(current?.auditoria) ? current.auditoria : [];
      const auditNovos = stateToSave.auditoria.filter(a => a && a.id && !auditAtual.some(existing => existing.id === a.id));
      const allAudit = [...auditNovos, ...auditAtual];
      if (allAudit.length > 1000) {
        const overflow = allAudit.slice(1000);
        // Arquiva no security_audit_log dentro de transação para garantir persistência antes do corte
        await transaction(async () => {
          for (const item of overflow) {
            if (item && item.id) {
              const archId = `arch_${tenantId}_${item.id}`;
              await run(`INSERT OR IGNORE INTO security_audit_log (
                id, tenant_id, actor_id, actor_type, action, entity, entity_id, ip_address, details_json, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                archId,
                tenantId,
                String(item.usuario || item.actorId || 'operador'),
                'client_operational',
                String(item.acao || item.action || 'STATE_AUDIT_ARCHIVE'),
                String(item.entidade || item.entity || 'state'),
                item.entidadeId || item.entityId ? String(item.entidadeId || item.entityId) : null,
                item.ip || null,
                JSON.stringify(item.detalhes || item.details || item),
                item.data || item.createdAt || new Date().toISOString()
              ]);
            }
          }
        });
        stateToSave.auditoria = allAudit.slice(0, 1000);
      } else {
        stateToSave.auditoria = allAudit;
      }
    }

}

module.exports = {
  sanitizeAndProtectState
};
