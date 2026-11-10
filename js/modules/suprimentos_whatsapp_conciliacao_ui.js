// js/modules/suprimentos_whatsapp_conciliacao_ui.js
// Templates e componentes visuais para Suprimentos/CMP, Conciliação Bancária e Agente WhatsApp

(function (root) {
  'use strict';

  function fmtMoeda(val) {
    return 'R$ ' + (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtData(val) {
    if (!val) return '—';
    const s = String(val).slice(0, 10);
    const [y, m, d] = s.split('-');
    return (d && m && y) ? `${d}/${m}/${y}` : s;
  }

  function renderPainelSuprimentosEConciliacaoHtml(state, options = {}) {
    const pedidos = Array.isArray(state?.purchaseOrders) ? state.purchaseOrders : [];
    const reconciliacoes = Array.isArray(state?.bankReconciliations) ? state.bankReconciliations : [];
    const filaRecepcao = Array.isArray(state?.receptionQueue) ? state.receptionQueue : [];

    const pedidosPendentes = pedidos.filter(p => p.status !== 'recebido' && p.status !== 'cancelado');
    const totalPendenteCompras = pedidosPendentes.reduce((acc, p) => acc + Number(p.valorTotalPedido || 0), 0);

    return `
      <div class="suprimentos-conciliacao-painel" style="padding: 16px; font-family: inherit;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; font-size: 1.4rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
              <span>📦</span> Suprimentos, Conciliação Bancária & Agente WhatsApp
            </h2>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 0.88rem;">
              Entrada de NF com CMP, conciliação multi-extrato (PDF/OFX/API) e inteligência operacional WhatsApp.
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-outline-primary" data-act="abrir-importar-extrato" style="padding: 6px 14px; font-size: 0.85rem;">
              🏦 Importar Extrato (PDF/OFX)
            </button>
            <button class="btn btn-success" data-act="abrir-simulador-agente-whatsapp" style="padding: 6px 14px; font-size: 0.85rem;">
              💬 Simulador WhatsApp
            </button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 24px;">
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Compras a Receber</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #ea580c; margin-top: 4px;">${pedidosPendentes.length} pedidos</div>
            <div style="font-size: 0.82rem; color: #94a3b8; margin-top: 2px;">${fmtMoeda(totalPendenteCompras)}</div>
          </div>
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #16a34a; text-transform: uppercase;">Lotes Conciliados</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #16a34a; margin-top: 4px;">${reconciliacoes.length} lotes</div>
            <div style="font-size: 0.82rem; color: #94a3b8; margin-top: 2px;">PDF / OFX / API Open Finance</div>
          </div>
          <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #2563eb; text-transform: uppercase;">Recepção de Pátio</div>
            <div style="font-size: 1.35rem; font-weight: 700; color: #2563eb; margin-top: 4px;">${filaRecepcao.length} na fila</div>
            <div style="font-size: 0.82rem; color: #94a3b8; margin-top: 2px;">Pré-check-ins via WhatsApp</div>
          </div>
        </div>

        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #334155;">
            Pedidos de Compra de Peças Pesadas & Custo Médio Ponderado (CMP)
          </div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; color: #475569; border-bottom: 1px solid #cbd5e1;">
                  <th style="padding: 10px 14px;">ID / Pedido</th>
                  <th style="padding: 10px 14px;">Fornecedor</th>
                  <th style="padding: 10px 14px;">OS Vinculada</th>
                  <th style="padding: 10px 14px;">Itens / Qtd</th>
                  <th style="padding: 10px 14px;">Valor Total</th>
                  <th style="padding: 10px 14px;">Status</th>
                  <th style="padding: 10px 14px; text-align: right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${pedidos.length === 0 ? `
                  <tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8;">Nenhum pedido de compra registrado.</td></tr>
                ` : pedidos.map(p => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 10px 14px; font-weight: 600;">${p.id.slice(0, 12)}</td>
                    <td style="padding: 10px 14px;">${p.fornecedorNome || '—'}</td>
                    <td style="padding: 10px 14px;">${p.osVinculadaId ? `#${p.osVinculadaId}` : '—'}</td>
                    <td style="padding: 10px 14px;">${p.itens?.length || 0} itens</td>
                    <td style="padding: 10px 14px; font-weight: 600;">${fmtMoeda(p.valorTotalPedido)}</td>
                    <td style="padding: 10px 14px;">
                      <span style="background: ${p.status === 'recebido' ? '#dcfce7' : '#ffedd5'}; color: ${p.status === 'recebido' ? '#15803d' : '#c2410c'}; padding: 3px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">
                        ${p.status === 'recebido' ? 'Recebido' : 'Aguardando Entrega'}
                      </span>
                    </td>
                    <td style="padding: 10px 14px; text-align: right;">
                      ${p.status !== 'recebido' ? `
                        <button class="btn btn-sm btn-primary" data-act="abrir-receber-nf-compra" data-pedido-id="${p.id}" style="padding: 4px 10px; font-size: 0.8rem;">
                          📥 Receber NF & Destravar Box
                        </button>
                      ` : `
                        <span style="color: #64748b; font-size: 0.8rem;">NF ${p.numeroNF || 'OK'}</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function modalReceberNotaCompraHtml(pedido) {
    const dataHoje = new Date().toISOString().slice(0, 10);
    return `
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 1.25rem;">
          📥 Recebimento de NF de Compra & Recálculo de CMP
        </h3>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 16px;">
          Fornecedor: <strong>${pedido?.fornecedorNome || '—'}</strong> | 
          Valor Total: <strong style="color: #0f172a;">${fmtMoeda(pedido?.valorTotalPedido)}</strong>
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.84rem; color: #475569;">
          ℹ O recebimento recalcula o Custo Médio Ponderado (CMP), lança as parcelas no Contas a Pagar e, se houver OS vinculada, encerra o gargalo de peça e destrava o Box automaticamente.
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Número da Nota Fiscal (NF):</label>
            <input type="text" id="txt-rcv-nf" placeholder="Ex: NF-58491" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Data de Recebimento:</label>
            <input type="date" id="txt-rcv-data" value="${dataHoje}" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Chave de Acesso da NF-e (Opcional):</label>
          <input type="text" id="txt-rcv-chave" placeholder="44 dígitos da NF-e" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #334155;">
            <input type="checkbox" id="chk-rcv-reserva" checked>
            Reservar peças automaticamente na OS e destravar Box 'aguardando_peca'
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary" data-act="fechar-modal-generico" style="padding: 8px 16px;">Cancelar</button>
          <button class="btn btn-success" data-act="confirmar-receber-nf-compra" data-pedido-id="${pedido?.id}" style="padding: 8px 18px; font-weight: 600;">
            ✔ Confirmar Recebimento & Entrada CMP
          </button>
        </div>
      </div>
    `;
  }

  function modalImportarExtratoBancarioHtml() {
    return `
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 1.25rem;">
          🏦 Importação & Conciliação Bancária Automatizada
        </h3>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 16px;">
          Cole extratos em formato PDF texto ou OFX/CNAB para baixa atômica de borderôs e fornecedores.
        </p>

        <div style="margin-bottom: 14px;">
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Formato do Extrato:</label>
          <select id="sel-ext-formato" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <option value="pdf_texto">Texto Extraído de PDF Bancário</option>
            <option value="ofx_cnab">Arquivo OFX / Retorno CNAB</option>
            <option value="api_json">JSON Estruturado / Open Finance</option>
          </select>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Conteúdo do Extrato:</label>
          <textarea id="txt-ext-conteudo" rows="8" placeholder="Ex: 10/11/2026 PIX RECEBIDO - BORD-7201 + 2.500,00" class="form-control" style="width: 100%; padding: 8px; font-family: monospace; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px;"></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary" data-act="fechar-modal-generico" style="padding: 8px 16px;">Cancelar</button>
          <button class="btn btn-primary" data-act="processar-extrato-bancario" style="padding: 8px 18px; font-weight: 600;">
            ⚡ Conciliar Transações Automaticamente
          </button>
        </div>
      </div>
    `;
  }

  function modalSimuladorAgenteWhatsAppHtml() {
    return `
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 1.25rem;">
          💬 Simulador de Conversa — Agente WhatsApp Multi-Skill
        </h3>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 16px;">
          Teste as Skills de Recepção de Pátio e Analista Financeiro da Gerência.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Perfil do Remetente:</label>
            <select id="sel-wpp-perfil" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
              <option value="cliente">Cliente / Motorista Frotista</option>
              <option value="gerencia">Gerência / Diretoria (RBAC Liberado)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Telefone / Remetente:</label>
            <input type="text" id="txt-wpp-remetente" value="5511988887777" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Mensagem de Teste:</label>
          <input type="text" id="txt-wpp-mensagem" placeholder="Ex: Qual a situação da carreta placa XYZ9A99? ou Verônica, passe o briefing" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
        </div>

        <div id="wpp-simulador-resposta" style="display: none; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.88rem; white-space: pre-line;"></div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary" data-act="fechar-modal-generico" style="padding: 8px 16px;">Fechar</button>
          <button class="btn btn-success" data-act="enviar-comando-agente-whatsapp" style="padding: 8px 18px; font-weight: 600;">
            📨 Enviar Mensagem para o Agente
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelSuprimentosEConciliacaoHtml = renderPainelSuprimentosEConciliacaoHtml;
  root.modalReceberNotaCompraHtml = modalReceberNotaCompraHtml;
  root.modalImportarExtratoBancarioHtml = modalImportarExtratoBancarioHtml;
  root.modalSimuladorAgenteWhatsAppHtml = modalSimuladorAgenteWhatsAppHtml;

})(typeof window !== 'undefined' ? window : globalThis);

