// js/modules/patio_portaria_inteligente_ui.js
// Renderizador Visual da Portaria Inteligente & Fast Check-in 360º
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMoney(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function renderPainelPortariaInteligenteHtml(dados = {}) {
    const kpis = dados.kpis || dados || {};
    const logs = Array.isArray(dados.logs) ? dados.logs : (Array.isArray(dados.movimentacoes) ? dados.movimentacoes : []);

    const totalNoPatio = kpis.veiculosNoPatioCount ?? logs.filter(l => l.statusPortaria === 'em_patio').length;
    const totalEntradas = kpis.entradasHojeCount ?? logs.length;
    const totalSaidas = kpis.saidasHojeCount ?? logs.filter(l => l.statusPortaria === 'liberado_saida').length;
    const totalBloqueados = kpis.veiculosEmAtrasoCount ?? logs.filter(l => l.bloqueadoCredito).length;

    let html = `
    <div class="portaria-inteligente-wrapper" style="padding: 1.25rem; background: var(--bg-card, #fff); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-color, #e2e8f0); padding-bottom: 1rem; margin-bottom: 1.25rem;">
        <div>
          <h2 style="margin: 0; font-size: 1.4rem; display: flex; align-items: center; gap: 0.5rem;">
            🚛 Portaria Inteligente & Fast Check-in 360º
          </h2>
          <small style="color: var(--text-muted, #64748b);">Controle de Acesso de Cancela, Triagem Integrada e Liberação Segura</small>
        </div>
        <div style="display: flex; gap: 0.75rem;">
          <button type="button" class="btn btn-sm btn-outline-primary" data-act="atualizar-painel-portaria">
            🔄 Atualizar Painel
          </button>
        </div>
      </div>

      <!-- Barra de Triagem Rápida -->
      <div class="card p-3 mb-4" style="background: #f8fafc; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px; margin-bottom: 1.25rem;">
        <h4 style="margin: 0 0 0.75rem 0; font-size: 1rem; color: #1e293b;">🔍 Triagem Rápida na Cancela</h4>
        <div style="display: grid; grid-template-columns: 2fr 1.5fr auto; gap: 0.75rem; align-items: end;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 0.25rem;">Placa do Cavalo / Carreta</label>
            <input type="text" id="input-triagem-placa" class="form-control" placeholder="Ex: BRA2E19" style="text-transform: uppercase; font-weight: bold;">
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 0.25rem;">KM Hodômetro</label>
            <input type="number" id="input-triagem-km" class="form-control" placeholder="Ex: 95000">
          </div>
          <div>
            <button type="button" class="btn btn-primary" data-act="triagem-placa-portaria" style="height: 38px;">
              ⚡ Triagem 360º
            </button>
          </div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="padding: 1rem; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <div style="font-size: 0.8rem; color: #1e40af; font-weight: 600;">VEÍCULOS NO PÁTIO</div>
          <div style="font-size: 1.8rem; font-weight: bold; color: #1e3a8a;">${totalNoPatio}</div>
        </div>
        <div style="padding: 1rem; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;">
          <div style="font-size: 0.8rem; color: #166534; font-weight: 600;">ENTRADAS HOJE</div>
          <div style="font-size: 1.8rem; font-weight: bold; color: #14532d;">${totalEntradas}</div>
        </div>
        <div style="padding: 1rem; background: #faf5ff; border-left: 4px solid #a855f7; border-radius: 4px;">
          <div style="font-size: 0.8rem; color: #6b21a8; font-weight: 600;">SAÍDAS HOJE</div>
          <div style="font-size: 1.8rem; font-weight: bold; color: #581c87;">${totalSaidas}</div>
        </div>
        <div style="padding: 1rem; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
          <div style="font-size: 0.8rem; color: #991b1b; font-weight: 600;">TRAVAS / PENDÊNCIAS</div>
          <div style="font-size: 1.8rem; font-weight: bold; color: #7f1d1d;">${totalBloqueados}</div>
        </div>
      </div>

      <!-- Listagem de Movimentações -->
      <div class="table-responsive">
        <table class="table table-hover" style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color, #e2e8f0); text-align: left;">
              <th style="padding: 0.6rem;">Placa</th>
              <th style="padding: 0.6rem;">Cliente / Transportadora</th>
              <th style="padding: 0.6rem;">Entrada</th>
              <th style="padding: 0.6rem;">Status</th>
              <th style="padding: 0.6rem;">Box / OS</th>
              <th style="padding: 0.6rem;">Garantia / Crédito</th>
              <th style="padding: 0.6rem; text-align: center;">Ações</th>
            </tr>
          </thead>
          <tbody>`;

    if (!logs || logs.length === 0) {
      html += `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted, #64748b);">Nenhuma movimentação de portaria registrada no período.</td></tr>`;
    } else {
      logs.forEach(log => {
        const statusBadge = log.statusPortaria === 'em_patio'
          ? '<span class="badge badge-primary" style="background:#3b82f6;color:#fff;padding:0.25rem 0.5rem;border-radius:4px;">No Pátio</span>'
          : '<span class="badge badge-success" style="background:#22c55e;color:#fff;padding:0.25rem 0.5rem;border-radius:4px;">Liberado Saída</span>';

        const creditoBadge = log.bloqueadoCredito
          ? (log.garantiaIsenta
              ? '<span class="badge badge-warning" style="background:#f59e0b;color:#fff;padding:0.25rem 0.4rem;border-radius:4px;">Garantia Isenta</span>'
              : '<span class="badge badge-danger" style="background:#ef4444;color:#fff;padding:0.25rem 0.4rem;border-radius:4px;">Trava Crédito</span>')
          : '<span class="badge badge-success" style="background:#10b981;color:#fff;padding:0.25rem 0.4rem;border-radius:4px;">Crédito OK</span>';

        html += `
            <tr style="border-bottom: 1px solid var(--border-color, #e2e8f0);">
              <td style="padding: 0.6rem; font-weight: bold;">${escapeHtml(log.placa)}</td>
              <td style="padding: 0.6rem;">${escapeHtml(log.clienteNome || 'Cliente Avulso')}</td>
              <td style="padding: 0.6rem;">${escapeHtml(log.dataEntrada ? log.dataEntrada.substring(11, 16) : '-')}</td>
              <td style="padding: 0.6rem;">${statusBadge}</td>
              <td style="padding: 0.6rem;">${escapeHtml(log.boxNome || log.boxId || '-')} / OS: ${escapeHtml(log.osId || '-')}</td>
              <td style="padding: 0.6rem;">${creditoBadge}</td>
              <td style="padding: 0.6rem; text-align: center;">`;

        if (log.statusPortaria === 'em_patio') {
          html += `
                <button type="button" class="btn btn-sm btn-outline-danger" data-act="abrir-saida-portaria" data-log-id="${escapeHtml(log.id)}">
                  🏁 Registrar Saída
                </button>`;
        } else {
          html += `<small style="color: #64748b;">${escapeHtml(log.dataSaida ? log.dataSaida.substring(11, 16) : 'Concluído')}</small>`;
        }

        html += `</td></tr>`;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    </div>`;

    return html;
  }

  function modalFastCheckinPortaria360Html(triagem = {}) {
    const analise = triagem.analiseCreditoCliente || {};
    const garantias = Array.isArray(triagem.garantiasAtivas) ? triagem.garantiasAtivas : [];
    const preventivas = Array.isArray(triagem.preventivasVencidas) ? triagem.preventivasVencidas : [];
    const demandas = Array.isArray(triagem.oportunidadesReprimidas) ? triagem.oportunidadesReprimidas : [];
    const boxSugestao = triagem.sugestaoBox || null;

    let html = `
    <div class="modal-portaria-content" style="max-width: 680px; margin: 0 auto; padding: 1rem;">
      <h3 style="margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
        ⚡ Fast Check-in 360º — Placa: <strong>${escapeHtml(triagem.placa || '')}</strong>
      </h3>

      <!-- Alertas 360: Crédito, Garantia, Preventiva -->
      <div style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.6rem;">`;

    if (triagem.garantiaIsenta) {
      html += `
        <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 0.6rem 0.8rem; border-radius: 4px; color: #166534; font-size: 0.85rem;">
          🛡️ <strong>Garantia Ativa Detectada:</strong> Veículo possui cobertura de garantia vigente para o sistema. Entrada isenta de trava financeira!
        </div>`;
    }

    if (triagem.bloqueadoCredito && !triagem.garantiaIsenta) {
      html += `
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 0.6rem 0.8rem; border-radius: 4px; color: #991b1b; font-size: 0.85rem;">
          ⚠️ <strong>Trava de Crédito Ativa:</strong> Cliente possui títulos vencidos ou limite excedido (${formatMoney(analise.saldoDevedorTotal)} em aberto).
        </div>`;
    }

    if (preventivas.length > 0) {
      html += `
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 0.6rem 0.8rem; border-radius: 4px; color: #1e40af; font-size: 0.85rem;">
          ⏰ <strong>${preventivas.length} Preventiva(s) Preditiva(s) Vencida(s):</strong> Aproveitar parada de pátio para incluir na OS.
        </div>`;
    }

    if (demandas.length > 0) {
      html += `
        <div style="background: #faf5ff; border-left: 4px solid #a855f7; padding: 0.6rem 0.8rem; border-radius: 4px; color: #6b21a8; font-size: 0.85rem;">
          📋 <strong>${demandas.length} Demanda(s) Reprimida(s):</strong> Itens orçados anteriormente não aprovados.
        </div>`;
    }

    html += `
      </div>

      <!-- Formulário de Fast Check-in -->
      <form id="form-fast-checkin-portaria" onsubmit="return false;">
        <input type="hidden" id="fast-checkin-placa" value="${escapeHtml(triagem.placa || '')}">
        <input type="hidden" id="fast-checkin-cliente-id" value="${escapeHtml(triagem.clienteId || '')}">

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 600;">Cliente / Transportadora</label>
            <input type="text" id="fast-checkin-cliente-nome" class="form-control" value="${escapeHtml(triagem.clienteNome || '')}" placeholder="Razão Social / Nome">
          </div>
          <div>
            <label style="font-size: 0.8rem; font-weight: 600;">KM Entrada</label>
            <input type="number" id="fast-checkin-km" class="form-control" value="${triagem.kmEntrada || triagem.kmAtual || 0}">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 600;">Motorista</label>
            <input type="text" id="fast-checkin-motorista" class="form-control" placeholder="Nome do motorista">
          </div>
          <div>
            <label style="font-size: 0.8rem; font-weight: 600;">Telefone / WhatsApp</label>
            <input type="text" id="fast-checkin-telefone" class="form-control" placeholder="(00) 00000-0000">
          </div>
        </div>

        <div style="margin-bottom: 0.75rem;">
          <label style="font-size: 0.8rem; font-weight: 600;">Motivo de Entrada / Reclamação do Motorista</label>
          <textarea id="fast-checkin-motivo" class="form-control" rows="2" placeholder="Ex: Quebra de mola traseira, estalo ao esterçar..."></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem; background: #f8fafc; padding: 0.75rem; border-radius: 4px;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">Box Alocado</label>
            <input type="text" id="fast-checkin-box-id" class="form-control" value="${escapeHtml(boxSugestao?.id || '')}" placeholder="ID do Box">
            <small style="color: #64748b;">${boxSugestao ? `Sugestão: ${escapeHtml(boxSugestao.nome || boxSugestao.codigo)}` : 'Nenhum box livre detectado'}</small>
          </div>
          <div style="display: flex; flex-direction: column; justify-content: center; gap: 0.4rem;">
            <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; margin: 0; cursor: pointer;">
              <input type="checkbox" id="fast-checkin-abrir-os" checked> <strong>Abrir OS Automática</strong>
            </label>
            <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; margin: 0; cursor: pointer;">
              <input type="checkbox" id="fast-checkin-alocar-box" checked> <strong>Alocar Box no Check-in</strong>
            </label>
          </div>
        </div>`;

    if (triagem.bloqueadoCredito && !triagem.garantiaIsenta) {
      html += `
        <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 0.75rem; border-radius: 4px; margin-bottom: 0.75rem;">
          <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; color: #be123c; font-weight: bold; cursor: pointer;">
            <input type="checkbox" id="fast-checkin-override-credito"> Desbloqueio Gerencial de Crédito (Override)
          </label>
          <input type="text" id="fast-checkin-motivo-override" class="form-control mt-1" placeholder="Motivo obrigatório da liberação gerencial" style="margin-top: 0.4rem;">
        </div>`;
    }

    html += `
        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 0.75rem;">
          <button type="button" class="btn btn-secondary" data-act="fechar-modal-portaria">Cancelar</button>
          <button type="button" class="btn btn-success" data-act="confirmar-fast-checkin-portaria">
            🚀 Confirmar Fast Check-in 360º
          </button>
        </div>
      </form>
    </div>`;

    return html;
  }

  function modalRegistrarSaidaPortariaHtml(log = {}) {
    let html = `
    <div class="modal-portaria-content" style="max-width: 520px; margin: 0 auto; padding: 1rem;">
      <h3 style="margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
        🏁 Saída de Veículo — Cancela
      </h3>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem;">
          <div>Placa: <strong>${escapeHtml(log.placa || '-')}</strong></div>
          <div>Cliente: <strong>${escapeHtml(log.clienteNome || '-')}</strong></div>
          <div>Box Alocado: <strong>${escapeHtml(log.boxNome || log.boxId || '-')}</strong></div>
          <div>OS Vinculada: <strong>${escapeHtml(log.osId || '-')}</strong></div>
        </div>
      </div>

      <form id="form-saida-portaria" onsubmit="return false;">
        <input type="hidden" id="saida-log-id" value="${escapeHtml(log.id || '')}">

        <div style="margin-bottom: 0.75rem;">
          <label style="font-size: 0.8rem; font-weight: 600;">KM de Saída (Hodômetro)</label>
          <input type="number" id="saida-km" class="form-control" value="${log.kmEntrada || 0}" placeholder="KM no momento da saída">
        </div>

        <div style="margin-bottom: 0.75rem; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 0.6rem;">
          <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; margin: 0; cursor: pointer;">
            <input type="checkbox" id="saida-exigir-qualidade" checked>
            <strong>Exigir Checklist de Inspeção de Qualidade Aprovado</strong>
          </label>
          <small style="color: #92400e; display: block; margin-top: 0.25rem;">
            Previne saída de veículos sem torque de grampos e teste de rodagem.
          </small>
        </div>

        <div style="margin-bottom: 0.75rem;">
          <label style="font-size: 0.8rem; font-weight: 600;">Observações da Cancela</label>
          <textarea id="saida-observacao" class="form-control" rows="2" placeholder="Observações de saída..."></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 0.75rem;">
          <button type="button" class="btn btn-secondary" data-act="fechar-modal-portaria">Cancelar</button>
          <button type="button" class="btn btn-danger" data-act="confirmar-saida-portaria">
            🏁 Liberar Saída na Cancela
          </button>
        </div>
      </form>
    </div>`;

    return html;
  }

  root.escapeHtml = escapeHtml;
  root.formatMoney = formatMoney;
  root.renderPainelPortariaInteligenteHtml = renderPainelPortariaInteligenteHtml;
  root.modalFastCheckinPortaria360Html = modalFastCheckinPortaria360Html;
  root.modalRegistrarSaidaPortariaHtml = modalRegistrarSaidaPortariaHtml;

})(typeof window !== 'undefined' ? window : globalThis);

