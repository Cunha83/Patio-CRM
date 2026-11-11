// js/modules/patio_terminal_box_ui.js
// Renderizador Visual do Terminal Operacional de Box & Despacho Inteligente
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

  function renderPainelTerminalBoxEDespachoHtml(dados = {}) {
    const box = dados.box || {};
    const mecanico = dados.mecanico || {};
    const os = dados.osAtiva || {};
    const apontamento = dados.apontamentoAtivo || null;
    const evidencias = Array.isArray(dados.evidenciasCondenadas) ? dados.evidenciasCondenadas : [];
    const ranking = Array.isArray(dados.rankingDespacho) ? dados.rankingDespacho : [];

    const statusBox = box.status || 'livre';
    let badgeClass = 'badge-success';
    let statusLabel = 'Livre';
    if (statusBox === 'ocupado') {
      badgeClass = 'badge-primary';
      statusLabel = 'Em Execução';
    } else if (statusBox === 'parado') {
      badgeClass = 'badge-danger';
      statusLabel = 'Parado por Gargalo';
    }

    let html = `
    <div class="terminal-box-wrapper" style="padding: 1.25rem; background: var(--bg-card, #fff); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-color, #e2e8f0); padding-bottom: 1rem; margin-bottom: 1.25rem;">
        <div>
          <h2 style="margin: 0; font-size: 1.4rem; display: flex; align-items: center; gap: 0.5rem;">
            🛠️ Terminal Operacional: <strong>${escapeHtml(box.nome || box.codigo || 'Box de Oficina')}</strong>
          </h2>
          <small style="color: var(--text-muted, #64748b);">Responsável no Chão: <strong>${escapeHtml(mecanico.nome || box.mecanicoResponsavelNome || 'Não alocado')}</strong></small>
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <span class="badge ${badgeClass}" style="font-size: 0.9rem; padding: 0.4rem 0.8rem; border-radius: 4px;">
            ${statusLabel}
          </span>
          <button type="button" class="btn btn-sm btn-outline-primary" data-act="atualizar-terminal-box" data-box-id="${escapeHtml(box.id || '')}">
            🔄 Atualizar
          </button>
        </div>
      </div>`;

    if (box.gargaloAtivo) {
      html += `
      <div class="alert alert-danger" style="margin-bottom: 1rem; padding: 0.75rem 1rem; border-left: 4px solid #ef4444; background: #fee2e2; color: #991b1b; border-radius: 4px;">
        <strong>⚠️ Box Travado:</strong> ${escapeHtml(box.gargaloAtivo)} — Aguardando liberação operacional ou aprovação do frotista.
      </div>`;
    }

    html += `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.5rem;">
        <div class="card p-3" style="border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px;">
          <h3 style="font-size: 1.1rem; margin-top: 0; margin-bottom: 0.75rem;">📋 Ordem de Serviço em Atendimento</h3>`;

    if (os && os.id) {
      html += `
          <p style="margin: 0 0 0.5rem 0;"><strong>OS:</strong> #${escapeHtml(os.num || os.id)} — <strong>Placa:</strong> ${escapeHtml(os.placa || 'Sem placa')}</p>
          <p style="margin: 0 0 0.5rem 0;"><strong>Cliente:</strong> ${escapeHtml(os.clienteNome || 'Cliente Balcão')}</p>
          <p style="margin: 0 0 0.75rem 0;"><strong>Total Atual:</strong> ${formatMoney(os.total || os.valorTotal || 0)}</p>
          
          <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-warning btn-sm" data-act="abrir-modal-evidencia-peca-condenada" data-os-id="${escapeHtml(os.id)}" data-box-id="${escapeHtml(box.id || '')}">
              📸 Condenar Peça na Desmontagem
            </button>
          </div>`;
    } else {
      html += `<p style="color: var(--text-muted, #64748b); font-style: italic;">Nenhuma OS vinculada a este box no momento.</p>`;
    }

    html += `
        </div>
        <div class="card p-3" style="border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px;">
          <h3 style="font-size: 1.1rem; margin-top: 0; margin-bottom: 0.75rem;">⏱️ Apontamento em Tempo Real</h3>`;

    if (apontamento && apontamento.status === 'em_execucao') {
      html += `
          <p style="margin: 0 0 0.5rem 0; color: #16a34a;"><strong>● Execução em Andamento</strong></p>
          <p style="margin: 0 0 0.5rem 0;"><strong>Mecânico:</strong> ${escapeHtml(apontamento.mecanicoNome || mecanico.nome || 'Mecânico')}</p>
          <p style="margin: 0 0 0.5rem 0;"><strong>Início:</strong> ${new Date(apontamento.dataInicio || apontamento.timestamp).toLocaleTimeString('pt-BR')}</p>`;
    } else {
      html += `
          <p style="color: var(--text-muted, #64748b); font-style: italic;">Nenhum serviço sendo executado no cronômetro agora.</p>
          <button type="button" class="btn btn-primary btn-sm" data-act="abrir-modal-despacho-inteligente" data-box-id="${escapeHtml(box.id || '')}" data-os-id="${escapeHtml(os.id || '')}">
            🎯 Despachar Serviço por Especialidade
          </button>`;
    }

    html += `
        </div>
      </div>`;

    if (evidencias.length > 0) {
      html += `
      <div style="margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">🔍 Peças Condenadas na Desmontagem</h3>
        <table class="table table-bordered table-sm" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: var(--bg-hover, #f8fafc);">
              <th>Data/Hora</th>
              <th>Peça Condenada</th>
              <th>Código</th>
              <th>Qtd</th>
              <th>Total</th>
              <th>Motivo Técnico</th>
              <th>Status Aprovação</th>
            </tr>
          </thead>
          <tbody>`;
      for (const ev of evidencias) {
        const stAprov = ev.status === 'aprovada_frotista' ? 'badge-success' : 'badge-warning';
        html += `
            <tr>
              <td>${new Date(ev.criadoEm || ev.timestamp).toLocaleDateString('pt-BR')} ${new Date(ev.criadoEm || ev.timestamp).toLocaleTimeString('pt-BR')}</td>
              <td><strong>${escapeHtml(ev.pecaDescricao)}</strong></td>
              <td><code>${escapeHtml(ev.codigoFabricante || '-')}</code></td>
              <td>${ev.quantidade}</td>
              <td>${formatMoney(ev.valorTotal)}</td>
              <td>${escapeHtml(ev.motivoCondenacao)}</td>
              <td><span class="badge ${stAprov}">${escapeHtml(ev.status)}</span></td>
            </tr>`;
      }
      html += `
          </tbody>
        </table>
      </div>`;
    }

    if (ranking.length > 0) {
      html += `
      <div>
        <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">🧠 Ranking de Despacho Inteligente</h3>
        <div style="display: flex; gap: 0.5rem; flex-direction: column;">`;
      for (const r of ranking) {
        html += `
          <div style="padding: 0.6rem 0.8rem; border: 1px solid var(--border-color, #e2e8f0); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${escapeHtml(r.nome)}</strong> — Score: <span class="badge badge-info">${r.scoreDespacho} pts</span>
              <br><small style="color: var(--text-muted, #64748b);">${escapeHtml(r.justificativa)}</small>
            </div>
            <button type="button" class="btn btn-outline-primary btn-sm" data-act="executar-despacho-inteligente" data-mecanico-id="${escapeHtml(r.mecanicoId)}" data-box-id="${escapeHtml(box.id || '')}" data-os-id="${escapeHtml(os.id || '')}">
              Alocar
            </button>
          </div>`;
      }
      html += `
        </div>
      </div>`;
    }

    html += `</div>`;
    return html;
  }

  function modalRegistrarEvidenciaPecaCondenadaHtml(dados = {}) {
    const osId = dados.osId || '';
    const boxId = dados.boxId || '';
    return `
    <div class="modal-condenar-peca" style="padding: 1rem;">
      <h3 style="margin-top: 0; font-size: 1.3rem;">⚠️ Condenação de Peça na Desmontagem</h3>
      <p style="color: var(--text-muted, #64748b); font-size: 0.9rem;">
        Esta ação insere a peça na OS, trava o box no gargalo <em>aguardando_aprovacao_frotista</em> e gera link tokenizado para aprovação externa do frotista.
      </p>
      <form id="form-evidencia-peca-condenada" onsubmit="return false;">
        <input type="hidden" id="evidencia-os-id" value="${escapeHtml(osId)}">
        <input type="hidden" id="evidencia-box-id" value="${escapeHtml(boxId)}">

        <div class="form-group mb-2">
          <label for="evidencia-peca-desc"><strong>Descrição da Peça Condenada *</strong></label>
          <input type="text" id="evidencia-peca-desc" class="form-control" placeholder="Ex: Lâmina Mestra Feixe Traseiro" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" class="mb-2">
          <div class="form-group">
            <label for="evidencia-peca-cod">Código Fabricante</label>
            <input type="text" id="evidencia-peca-cod" class="form-control" placeholder="Ex: MB-940325-TR">
          </div>
          <div class="form-group">
            <label for="evidencia-peca-qtd">Quantidade *</label>
            <input type="number" id="evidencia-peca-qtd" class="form-control" value="1" min="1" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" class="mb-2">
          <div class="form-group">
            <label for="evidencia-peca-vlr">Valor Unitário Estimado (R$)</label>
            <input type="number" id="evidencia-peca-vlr" class="form-control" value="0.00" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label for="evidencia-motivo-condenacao">Motivo Técnico *</label>
            <select id="evidencia-motivo-condenacao" class="form-control">
              <option value="desgaste_excessivo_desmontagem">Desgaste Excessivo na Desmontagem</option>
              <option value="fadiga_material_trinca_olhete">Trinca / Fadiga Estrutural</option>
              <option value="rosca_espanada_alongamento">Rosca Espanada / Alongamento</option>
              <option value="folga_excessiva_embuchamento">Folga Excessiva Embuchamento</option>
              <option value="empenamento_eixo">Empenamento Estrutural</option>
            </select>
          </div>
        </div>

        <div class="form-group mb-2">
          <label for="evidencia-foto-url">Foto / Evidência da Peça (URL)</label>
          <input type="url" id="evidencia-foto-url" class="form-control" placeholder="https://storage... ou anexar foto">
        </div>

        <div class="form-group mb-3">
          <label for="evidencia-obs">Parecer Técnico do Mecânico</label>
          <textarea id="evidencia-obs" class="form-control" rows="2" placeholder="Detalhes do desgaste ou risco de quebra"></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" data-act="fechar-modal-box">Cancelar</button>
          <button type="button" class="btn btn-danger" data-act="confirmar-evidencia-peca-condenada">
            🚨 Confirmar Condenação & Travar Box
          </button>
        </div>
      </form>
    </div>`;
  }

  function modalConfigurarEspecialidadeMecanicoHtml(dados = {}) {
    const mecanicoId = dados.mecanicoId || '';
    const nome = dados.nome || '';
    const esp = dados.especialidades || {};

    return `
    <div class="modal-especialidades-mecanico" style="padding: 1rem;">
      <h3 style="margin-top: 0; font-size: 1.3rem;">🎯 Matriz de Especialidades do Mecânico</h3>
      <form id="form-perfil-mecanico" onsubmit="return false;">
        <input type="hidden" id="mec-perfil-id" value="${escapeHtml(mecanicoId)}">

        <div class="form-group mb-2">
          <label for="mec-perfil-nome"><strong>Nome do Mecânico</strong></label>
          <input type="text" id="mec-perfil-nome" class="form-control" value="${escapeHtml(nome)}" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" class="mb-2">
          <div class="form-group">
            <label for="mec-perfil-turno">Turno</label>
            <select id="mec-perfil-turno" class="form-control">
              <option value="diurno">Diurno</option>
              <option value="noturno">Noturno</option>
            </select>
          </div>
          <div class="form-group" style="display: flex; align-items: center; margin-top: 1.5rem;">
            <label style="cursor: pointer;">
              <input type="checkbox" id="mec-perfil-ativo" ${dados.ativo !== false ? 'checked' : ''}> Mecânico Ativo
            </label>
          </div>
        </div>

        <h4 style="font-size: 1rem; margin: 1rem 0 0.5rem 0;">Nível Técnico por Especialidade (0 = Inapto, 1 = Básico, 2 = Pleno, 3 = Especialista):</h4>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" class="mb-2">
          <div class="form-group">
            <label for="esp-suspensao">Suspensão Pesada (Feixes/Bolsas)</label>
            <input type="number" id="esp-suspensao" class="form-control" min="0" max="3" value="${esp.suspensao_pesada || 0}">
          </div>
          <div class="form-group">
            <label for="esp-freios">Freios a Ar (Válvulas/Cuícas)</label>
            <input type="number" id="esp-freios" class="form-control" min="0" max="3" value="${esp.freios_ar || 0}">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" class="mb-3">
          <div class="form-group">
            <label for="esp-alinhamento">Alinhamento a Laser de Chassi</label>
            <input type="number" id="esp-alinhamento" class="form-control" min="0" max="3" value="${esp.alinhamento_laser || 0}">
          </div>
          <div class="form-group">
            <label for="esp-motor">Motor Diesel Pesado</label>
            <input type="number" id="esp-motor" class="form-control" min="0" max="3" value="${esp.motor_diesel || 0}">
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" data-act="fechar-modal-box">Cancelar</button>
          <button type="button" class="btn btn-primary" data-act="salvar-especialidade-mecanico">
            💾 Salvar Perfil Técnico
          </button>
        </div>
      </form>
    </div>`;
  }

  root.renderPainelTerminalBoxEDespachoHtml = renderPainelTerminalBoxEDespachoHtml;
  root.modalRegistrarEvidenciaPecaCondenadaHtml = modalRegistrarEvidenciaPecaCondenadaHtml;
  root.modalConfigurarEspecialidadeMecanicoHtml = modalConfigurarEspecialidadeMecanicoHtml;

})(typeof window !== 'undefined' ? window : globalThis);
