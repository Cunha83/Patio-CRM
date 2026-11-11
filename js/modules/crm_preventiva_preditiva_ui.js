// js/modules/crm_preventiva_preditiva_ui.js
// Interface Visual do Radar de Manutenção Preventiva Preditiva de Frotas
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function renderBadgeStatus(status) {
    const map = {
      vencida: '<span class="badge" style="background:#ef4444;color:#fff;">🔴 Vencida</span>',
      critica_proxima: '<span class="badge" style="background:#ea580c;color:#fff;">🟠 Crítica (&le; 1.500 km)</span>',
      atencao_programar: '<span class="badge" style="background:#eab308;color:#000;">🟡 Em Atenção</span>',
      em_dia: '<span class="badge" style="background:#22c55e;color:#fff;">🟢 Em Dia</span>'
    };
    return map[status] || `<span class="badge">${status || 'N/A'}</span>`;
  }

  function renderBadgeSeveridade(sev) {
    const map = {
      severa_fora_estrada: '<span class="badge" style="background:#7c2d12;color:#fdba74;" title="Fator 0.70x">Severa (Off-Road)</span>',
      mista: '<span class="badge" style="background:#1e3a8a;color:#93c5fd;" title="Fator 0.85x">Mista</span>',
      rodoviaria: '<span class="badge" style="background:#065f46;color:#6ee7b7;" title="Fator 1.0x">Rodoviária</span>'
    };
    return map[sev] || `<span class="badge">${sev || 'Rodoviária'}</span>`;
  }

  function renderPainelPreventivaPreditivaHtml(dados = {}) {
    const kpis = dados.kpis || {};
    const alertas = Array.isArray(dados.alertas) ? dados.alertas : [];

    return `
      <div class="card p-3" style="background:var(--bg-card,#1e293b);border-radius:8px;border:1px solid #334155;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h4 style="margin:0;font-size:1.15rem;color:#38bdf8;">
              <i class="fas fa-satellite-dish"></i> Radar de Manutenção Preventiva Preditiva
            </h4>
            <small style="color:#94a3b8;">Projeção contínua por KM, tempo e severidade de rota para frotas pesadas</small>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline-info" data-act="abrir-telemetria-km">
              <i class="fas fa-tachometer-alt"></i> Atualizar KM
            </button>
            <button class="btn btn-sm btn-outline-warning" data-act="abrir-plano-preventivo">
              <i class="fas fa-cog"></i> Configurar Plano
            </button>
            <button class="btn btn-sm btn-success" data-act="disparar-regua-preventiva-whatsapp">
              <i class="fab fa-whatsapp"></i> Disparar Régua WhatsApp
            </button>
          </div>
        </div>

        <!-- Cards de KPIs do Radar -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:16px;">
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #ef4444;">
            <span style="font-size:0.8rem;color:#fca5a5;">Vencidas (Parada Iminente)</span>
            <div style="font-size:1.4rem;font-weight:bold;color:#ef4444;">${kpis.vencidasCount || 0}</div>
          </div>
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #ea580c;">
            <span style="font-size:0.8rem;color:#fdba74;">Críticas (&le; 1.500 km ou 7 dias)</span>
            <div style="font-size:1.4rem;font-weight:bold;color:#ea580c;">${kpis.criticasCount || 0}</div>
          </div>
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #eab308;">
            <span style="font-size:0.8rem;color:#fde047;">Em Atenção Programável</span>
            <div style="font-size:1.4rem;font-weight:bold;color:#eab308;">${kpis.atencaoCount || 0}</div>
          </div>
          <div style="background:#0f172a;padding:12px;border-radius:6px;border:1px solid #22c55e;">
            <span style="font-size:0.8rem;color:#86efac;">Receita Preventiva Potencial</span>
            <div style="font-size:1.4rem;font-weight:bold;color:#22c55e;">${formatarMoeda(kpis.receitaPreventivaPotencialTotal)}</div>
          </div>
        </div>

        <!-- Tabela Semafórica de Alertas Preditivos -->
        <div class="table-responsive" style="max-height:420px;overflow-y:auto;">
          <table class="table table-dark table-hover table-sm" style="margin:0;font-size:0.85rem;">
            <thead>
              <tr style="background:#0f172a;color:#94a3b8;">
                <th>Placa / Veículo</th>
                <th>Cliente / Frota</th>
                <th>Sistema Técnico</th>
                <th>KM Estimado</th>
                <th>Restam (KM / Dias)</th>
                <th>Severidade</th>
                <th>Status</th>
                <th style="text-align:right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${alertas.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:16px;color:#64748b;">Nenhum alerta preventivo gerado. Configure planos para monitorar a frota.</td></tr>' : alertas.map(a => `
                <tr>
                  <td><strong>${a.placa}</strong> <span style="color:#94a3b8;">(${a.modeloVeiculo || 'Pesado'})</span></td>
                  <td>${a.clienteNome || '-'}</td>
                  <td><span style="color:#38bdf8;">${a.sistemaTecnico}</span></td>
                  <td>${(a.kmEstimadoAtual || 0).toLocaleString()} km</td>
                  <td>
                    <strong>${a.kmRestante <= 0 ? '<span style="color:#ef4444;">0 km (VENCIDA)</span>' : `${a.kmRestante.toLocaleString()} km`}</strong>
                    <small style="color:#94a3b8;">(${a.diasRestantes <= 0 ? '0d' : `${a.diasRestantes}d`})</small>
                  </td>
                  <td>${renderBadgeSeveridade(a.severidadeOperacao)}</td>
                  <td>${renderBadgeStatus(a.statusPreventivo)}</td>
                  <td style="text-align:right;white-space:nowrap;">
                    ${a.statusContato === 'convertido_os' ? `
                      <span class="badge" style="background:#1e40af;color:#fff;">OS #${a.osGeradaId ? a.osGeradaId.slice(-4) : 'Gerada'}</span>
                    ` : `
                      <button class="btn btn-xs btn-success" data-act="converter-alerta-preventivo-os" data-alerta-id="${a.id}" title="Gerar Agendamento / OS">
                        <i class="fas fa-calendar-plus"></i> Agendar OS
                      </button>
                    `}
                    ${a.statusContato === 'notificado_whatsapp' ? `
                      <span title="Notificado via WhatsApp" style="color:#22c55e;margin-left:4px;"><i class="fab fa-whatsapp"></i></span>
                    ` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function modalConfigurarPlanoPreventivoHtml(dados = {}) {
    return `
      <div class="modal-dialog-b2b" style="max-width:520px;background:#1e293b;border-radius:10px;padding:20px;color:#f8fafc;box-shadow:0 10px 25px rgba(0,0,0,0.6);border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h4 style="margin:0;font-size:1.1rem;color:#38bdf8;">
            <i class="fas fa-cog"></i> Configurar Plano Preventivo por Veículo
          </h4>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-preventiva" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Placa do Veículo:</label>
            <input type="text" id="plano-placa" class="form-control form-control-sm" placeholder="Ex: ABC1D23" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Modelo do Caminhão:</label>
            <input type="text" id="plano-modelo" class="form-control form-control-sm" placeholder="Ex: Scania R450 6x2" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
        </div>

        <div style="margin-bottom:10px;">
          <label style="font-size:0.8rem;color:#cbd5e1;">Sistema Técnico:</label>
          <select id="plano-sistema" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border:1px solid #475569;">
            <option value="suspensao_traseira">Suspensão Traseira e Lâminas de Mola</option>
            <option value="molas_e_eixos">Embuchamento de Manga de Eixo e Pinos</option>
            <option value="freios_e_cuicas">Sistema de Freios e Cuícas Pneumáticas</option>
            <option value="alinhamento_laser">Alinhamento Técnico a Laser e Geometria</option>
            <option value="revisao_geral_chassi">Revisão Geral e Reaperto de Grampos</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Intervalo KM Padrão:</label>
            <input type="number" id="plano-km-padrao" class="form-control form-control-sm" value="20000" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Severidade da Operação:</label>
            <select id="plano-severidade" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border:1px solid #475569;">
              <option value="rodoviaria">Rodoviária (Fator 1.0x)</option>
              <option value="mista">Mista (Fator 0.85x)</option>
              <option value="severa_fora_estrada">Severa / Fora de Estrada (Fator 0.70x)</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">KM da Última Revisão:</label>
            <input type="number" id="plano-km-ultima" class="form-control form-control-sm" placeholder="Ex: 80000" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:#cbd5e1;">Valor Estimado (R$):</label>
            <input type="number" id="plano-valor-estimado" class="form-control form-control-sm" placeholder="Ex: 2500" style="background:#0f172a;color:#fff;border:1px solid #475569;">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-preventiva">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="salvar-plano-preventivo">
            <i class="fas fa-save"></i> Salvar Plano
          </button>
        </div>
      </div>
    `;
  }

  function modalAtualizarKmTelemetriaHtml(dados = {}) {
    return `
      <div class="modal-dialog-b2b" style="max-width:400px;background:#1e293b;border-radius:10px;padding:20px;color:#f8fafc;box-shadow:0 10px 25px rgba(0,0,0,0.6);border:1px solid #334155;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h4 style="margin:0;font-size:1.1rem;color:#38bdf8;">
            <i class="fas fa-tachometer-alt"></i> Atualizar Telemetria / Hodômetro
          </h4>
          <button type="button" class="btn-close-modal" data-act="fechar-modal-preventiva" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;">&times;</button>
        </div>

        <div style="margin-bottom:10px;">
          <label style="font-size:0.8rem;color:#cbd5e1;">Placa do Veículo:</label>
          <input type="text" id="telemetria-placa" class="form-control form-control-sm" placeholder="Ex: ALF1A10" style="background:#0f172a;color:#fff;border:1px solid #475569;">
        </div>

        <div style="margin-bottom:10px;">
          <label style="font-size:0.8rem;color:#cbd5e1;">KM Atual do Hodômetro:</label>
          <input type="number" id="telemetria-km-atual" class="form-control form-control-sm" placeholder="Ex: 115000" style="background:#0f172a;color:#fff;border:1px solid #475569;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:0.8rem;color:#cbd5e1;">KM Médio Diário Estimado:</label>
          <input type="number" id="telemetria-km-medio" class="form-control form-control-sm" placeholder="Ex: 350" style="background:#0f172a;color:#fff;border:1px solid #475569;">
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-preventiva">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="salvar-telemetria-km">
            <i class="fas fa-check"></i> Atualizar Telemetria
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelPreventivaPreditivaHtml = renderPainelPreventivaPreditivaHtml;
  root.modalConfigurarPlanoPreventivoHtml = modalConfigurarPlanoPreventivoHtml;
  root.modalAtualizarKmTelemetriaHtml = modalAtualizarKmTelemetriaHtml;

})(typeof window !== 'undefined' ? window : globalThis);
