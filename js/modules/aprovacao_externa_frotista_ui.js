// js/modules/aprovacao_externa_frotista_ui.js
// Renderizador da Interface do Portal de Aprovação Externa e Links Tokenizados B2B
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarDataHora(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(iso).slice(0, 16);
    }
  }

  function renderBadgeStatusToken(st) {
    const map = {
      pendente: '<span class="badge" style="background:#eab308;color:#000;">Pendente</span>',
      utilizado: '<span class="badge" style="background:#22c55e;color:#fff;">Aprovado/Utilizado</span>',
      revogado: '<span class="badge" style="background:#ef4444;color:#fff;">Revogado</span>',
      expirado: '<span class="badge" style="background:#6b7280;color:#fff;">Expirado</span>'
    };
    return map[st] || `<span class="badge">${st}</span>`;
  }

  function renderPainelLinksAprovacaoExternaHtml(tokens = [], osList = []) {
    const lista = Array.isArray(tokens) ? tokens : [];
    return `
      <div class="card p-3" style="background:var(--bg-card,#1e293b);border-radius:8px;border:1px solid var(--border-color,#334155);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <h4 style="margin:0;font-size:1.1rem;color:var(--text-main,#f8fafc);">
              <i class="fas fa-link" style="color:var(--primary-color,#38bdf8);margin-right:6px;"></i>
              Links de Aprovação Externa do Frotista
            </h4>
            <small style="color:var(--text-muted,#94a3b8);">Envio tokenizado com auditoria jurídica SHA-256 e destravamento de box</small>
          </div>
          <button class="btn btn-sm btn-primary" data-act="abrir-modal-gerar-link-aprovacao">
            <i class="fas fa-plus"></i> Novo Link
          </button>
        </div>

        <div class="table-responsive" style="max-height:380px;overflow-y:auto;">
          <table class="table table-dark table-hover table-sm" style="font-size:0.85rem;margin:0;">
            <thead>
              <tr style="color:var(--text-muted,#94a3b8);border-bottom:1px solid #334155;">
                <th>OS / Placa</th>
                <th>Telefone / Destino</th>
                <th>Valor Original</th>
                <th>Criado Em</th>
                <th>Validade</th>
                <th>Status</th>
                <th style="text-align:right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${lista.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align:center;padding:16px;color:#94a3b8;">
                    Nenhum link de aprovação gerado até o momento.
                  </td>
                </tr>
              ` : lista.map(t => {
                const os = (osList || []).find(o => o.id === t.osId) || {};
                const placa = os.placa || '-';
                const osNum = t.osNum || os.num || t.osId;
                return `
                  <tr>
                    <td><strong>OS #${osNum}</strong> <span style="color:#94a3b8;">(${placa})</span></td>
                    <td>${t.telefoneDestino || '<span style="color:#64748b;">Link direto</span>'}</td>
                    <td><strong>${formatarMoeda(t.valorOrcamentoOriginal)}</strong></td>
                    <td>${formatarDataHora(t.criadoEm)}</td>
                    <td>${formatarDataHora(t.expiraEm)}</td>
                    <td>${renderBadgeStatusToken(t.status)}</td>
                    <td style="text-align:right;white-space:nowrap;">
                      <button class="btn btn-xs btn-outline-info" data-act="abrir-portal-publico-preview" data-token="${t.token}" title="Visualizar Portal">
                        <i class="fas fa-external-link-alt"></i>
                      </button>
                      <button class="btn btn-xs btn-outline-secondary" data-act="copiar-link-aprovacao" data-token="${t.token}" title="Copiar Link">
                        <i class="fas fa-copy"></i>
                      </button>
                      ${t.telefoneDestino ? `
                        <button class="btn btn-xs btn-outline-success" data-act="enviar-link-whatsapp" data-token="${t.token}" data-telefone="${t.telefoneDestino}" title="Reenviar WhatsApp">
                          <i class="fab fa-whatsapp"></i>
                        </button>
                      ` : ''}
                      ${t.status === 'pendente' ? `
                        <button class="btn btn-xs btn-outline-danger" data-act="revogar-link-aprovacao" data-token-id="${t.id}" title="Revogar Link">
                          <i class="fas fa-ban"></i>
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function modalGerarLinkAprovacaoFrotistaHtml(os = {}, options = {}) {
    const osId = os.id || '';
    const osNum = os.num || os.id || '';
    const placa = os.placa || '';
    const total = Number(os.total != null ? os.total : (os.valorTotal || 0));

    return `
      <div class="modal-dialog-b2b" style="max-width:480px;background:var(--bg-card,#1e293b);border-radius:10px;padding:20px;color:#f8fafc;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h4 style="margin:0;font-size:1.15rem;color:#38bdf8;">
            <i class="fas fa-shield-alt"></i> Gerar Link Tokenizado de Aprovação
          </h4>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-aprovacao-externa" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        <div style="background:#0f172a;padding:12px;border-radius:6px;margin-bottom:14px;border:1px solid #334155;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Ordem de Serviço:</span>
            <strong>OS #${osNum}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Veículo / Placa:</span>
            <strong>${placa}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Valor do Orçamento:</span>
            <strong style="color:#22c55e;">${formatarMoeda(total)}</strong>
          </div>
        </div>

        <input type="hidden" id="modal-link-os-id" value="${osId}">

        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:0.85rem;color:#cbd5e1;">Telefone WhatsApp do Frotista:</label>
          <input type="text" id="modal-link-telefone" class="form-control form-control-sm" placeholder="Ex: 5511999998888" value="${options.telefone || ''}" style="background:#0f172a;color:#fff;border:1px solid #475569;">
        </div>

        <div class="form-group" style="margin-bottom:16px;">
          <label style="font-size:0.85rem;color:#cbd5e1;">Validade do Link (horas):</label>
          <select id="modal-link-validade" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border:1px solid #475569;">
            <option value="24">24 horas</option>
            <option value="48" selected>48 horas (Padrão)</option>
            <option value="72">72 horas</option>
            <option value="168">7 dias</option>
          </select>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-aprovacao-externa">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="confirmar-gerar-link-aprovacao">
            <i class="fas fa-check"></i> Gerar Link & Enviar
          </button>
        </div>
      </div>
    `;
  }

  function modalPortalPublicoAprovacaoFrotistaHtml(consulta = {}) {
    const os = consulta.os || {};
    const token = consulta.token || {};
    const cliente = consulta.cliente || {};
    const servicos = Array.isArray(os.servicos) ? os.servicos : [];
    const pecas = Array.isArray(os.pecas) ? os.pecas : [];

    return `
      <div class="modal-portal-publico" style="max-width:680px;background:#0f172a;border-radius:12px;padding:24px;color:#f8fafc;box-shadow:0 12px 30px rgba(0,0,0,0.7);border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:16px;">
          <div>
            <h3 style="margin:0;font-size:1.25rem;color:#38bdf8;">
              <i class="fas fa-truck"></i> Portal de Aprovação de Manutenção B2B
            </h3>
            <small style="color:#94a3b8;">Cliente: ${cliente.nome || 'Transportadora Parceira'} | Placa: <strong>${os.placa || '-'}</strong></small>
          </div>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-aprovacao-externa" style="background:none;border:none;color:#94a3b8;font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>

        <input type="hidden" id="portal-token-publico" value="${token.token || ''}">

        <div style="margin-bottom:16px;">
          <h5 style="margin:0 0 8px 0;font-size:0.95rem;color:#cbd5e1;">Itens do Orçamento para Aprovação:</h5>
          <div style="max-height:220px;overflow-y:auto;border:1px solid #334155;border-radius:6px;background:#1e293b;">
            <table class="table table-dark table-sm" style="margin:0;font-size:0.85rem;">
              <thead>
                <tr style="color:#94a3b8;">
                  <th>Item / Tipo</th>
                  <th>Valor</th>
                  <th style="width:140px;">Decisão</th>
                </tr>
              </thead>
              <tbody>
                ${servicos.map(s => `
                  <tr>
                    <td><i class="fas fa-wrench" style="color:#38bdf8;"></i> ${s.desc || s.nome || 'Serviço'}</td>
                    <td>${formatarMoeda(s.valor || s.preco || s.total)}</td>
                    <td>
                      <select class="form-control form-control-sm portal-item-decisao" data-item-id="${s.id}" style="background:#0f172a;color:#fff;border:1px solid #475569;font-size:0.8rem;padding:2px 4px;">
                        <option value="aprovado" selected>Aprovar</option>
                        <option value="adiado">Adiar (CRM)</option>
                        <option value="recusado">Recusar</option>
                      </select>
                    </td>
                  </tr>
                `).join('')}
                ${pecas.map(p => `
                  <tr>
                    <td><i class="fas fa-cogs" style="color:#f59e0b;"></i> ${p.desc || p.nome || 'Peça'}</td>
                    <td>${formatarMoeda(p.total != null ? p.total : ((p.valor || p.preco || 0) * (p.qtd || 1)))}</td>
                    <td>
                      <select class="form-control form-control-sm portal-item-decisao" data-item-id="${p.id}" style="background:#0f172a;color:#fff;border:1px solid #475569;font-size:0.8rem;padding:2px 4px;">
                        <option value="aprovado" selected>Aprovar</option>
                        <option value="adiado">Adiar (CRM)</option>
                        <option value="recusado">Recusar</option>
                      </select>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="background:#1e293b;padding:14px;border-radius:8px;border:1px solid #334155;margin-bottom:16px;">
          <h5 style="margin:0 0 10px 0;font-size:0.9rem;color:#38bdf8;">Identificação do Aprovador (Validação Jurídica):</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:0.8rem;color:#94a3b8;">Nome Completo:</label>
              <input type="text" id="portal-aprovador-nome" class="form-control form-control-sm" placeholder="Nome do Gestor" style="background:#0f172a;color:#fff;border:1px solid #475569;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:#94a3b8;">CPF ou Documento:</label>
              <input type="text" id="portal-aprovador-doc" class="form-control form-control-sm" placeholder="000.000.000-00" style="background:#0f172a;color:#fff;border:1px solid #475569;">
            </div>
          </div>
          <div style="margin-top:8px;">
            <label style="font-size:0.8rem;color:#94a3b8;">Cargo / Função:</label>
            <input type="text" id="portal-aprovador-cargo" class="form-control form-control-sm" placeholder="Ex: Gerente de Frotas" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-aprovacao-externa">Fechar</button>
          <button class="btn btn-sm btn-success" data-act="submeter-decisao-portal-publico">
            <i class="fas fa-check-double"></i> Confirmar Decisão com Assinatura Digital
          </button>
        </div>
      </div>
    `;
  }

  root.formatarMoedaB2B = formatarMoeda;
  root.renderPainelLinksAprovacaoExternaHtml = renderPainelLinksAprovacaoExternaHtml;
  root.modalGerarLinkAprovacaoFrotistaHtml = modalGerarLinkAprovacaoFrotistaHtml;
  root.modalPortalPublicoAprovacaoFrotistaHtml = modalPortalPublicoAprovacaoFrotistaHtml;

})(typeof window !== 'undefined' ? window : globalThis);

