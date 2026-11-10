'use strict';

/**
 * Pátio CRM — UI de Produtividade de Pátio, Apontamento de Horas e Comissões
 * Módulo de templates visuais (< 250 linhas) para gestão de boxes, mecânicos e cronômetros.
 */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatMoeda(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderPainelProdutividadePatioHtml(dados = {}) {
  const apontamentos = Array.isArray(dados.apontamentos) ? dados.apontamentos : [];
  const resumoEquipe = Array.isArray(dados.equipe) ? dados.equipe : [];

  const emExecucao = apontamentos.filter(a => a.status === 'em_execucao').length;
  const pausados = apontamentos.filter(a => a.status === 'pausado').length;
  const concluidos = apontamentos.filter(a => a.status === 'concluido').length;

  const totalComissaoLiberada = resumoEquipe.reduce((acc, e) => acc + (Number(e.valorComissaoTotalLiberada) || 0), 0);
  const totalComissaoRetida = resumoEquipe.reduce((acc, e) => acc + (Number(e.valorComissaoRetida) || 0), 0);

  const statusBadges = {
    em_execucao: '<span class="badge" style="background:#dcfce7;color:#166534;border:1px solid #86efac">⚡ Em Execução</span>',
    pausado: '<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d">⏸️ Pausado</span>',
    concluido: '<span class="badge" style="background:#e0f2fe;color:#075985;border:1px solid #7dd3fc">✅ Concluído</span>'
  };

  const linhasApontamentos = apontamentos.map(apt => {
    const badge = statusBadges[apt.status] || apt.status;
    let acoesHtml = '';

    if (apt.status === 'em_execucao') {
      acoesHtml = `
        <button class="btn btn-sm btn-outline" data-act="pausar-apontamento-servico" data-id="${apt.id}">Pausar</button>
        <button class="btn btn-sm btn-primario" data-act="concluir-apontamento-servico" data-id="${apt.id}">Concluir</button>
      `;
    } else if (apt.status === 'pausado') {
      acoesHtml = `
        <button class="btn btn-sm btn-outline" data-act="retomar-apontamento-servico" data-id="${apt.id}">Retomar</button>
        <button class="btn btn-sm btn-primario" data-act="concluir-apontamento-servico" data-id="${apt.id}">Concluir</button>
      `;
    } else {
      acoesHtml = `<span style="font-size:12px;color:var(--aco-500)">Finalizado</span>`;
    }

    const efClass = (apt.indiceEficiencia >= 100) ? 'color:#16a34a;font-weight:700' : 'color:#d97706;font-weight:600';

    return `
      <tr style="border-bottom:1px solid var(--aco-150)">
        <td style="padding:8px"><b>#${escapeHtml(apt.osNum || apt.osId)}</b></td>
        <td style="padding:8px">${escapeHtml(apt.servicoNome || 'Serviço')}</td>
        <td style="padding:8px">${escapeHtml(apt.mecanicoNome || 'Mecânico')}</td>
        <td style="padding:8px">${escapeHtml(apt.boxId || 'Pátio')}</td>
        <td style="padding:8px">${badge}</td>
        <td style="padding:8px">${apt.horasVendidas || 0}h / ${apt.horasTrabalhadas || 0}h</td>
        <td style="padding:8px;${efClass}">${apt.status === 'concluido' ? `${apt.indiceEficiencia}%` : '-'}</td>
        <td style="padding:8px;text-align:right">${acoesHtml}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="painel-produtividade-patio">
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div class="card card-p" style="border-left:4px solid #22c55e">
          <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Em Execução</div>
          <div style="font-size:22px;font-weight:700;color:#166534">${emExecucao}</div>
        </div>
        <div class="card card-p" style="border-left:4px solid #f59e0b">
          <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Pausados</div>
          <div style="font-size:22px;font-weight:700;color:#92400e">${pausados}</div>
        </div>
        <div class="card card-p" style="border-left:4px solid #3b82f6">
          <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Concluídos (Mês)</div>
          <div style="font-size:22px;font-weight:700;color:#1e40af">${concluidos}</div>
        </div>
        <div class="card card-p" style="border-left:4px solid #6366f1">
          <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Comissões Liberadas</div>
          <div style="font-size:18px;font-weight:700;color:#4338ca">${formatMoeda(totalComissaoLiberada)}</div>
          <div style="font-size:11px;color:var(--aco-500)">Retidas: ${formatMoeda(totalComissaoRetida)}</div>
        </div>
      </div>

      <div class="card card-p">
        <h4 style="font-size:15px;font-weight:700;margin-bottom:12px">Apontamentos em Tempo Real</h4>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid var(--aco-200);text-align:left;color:var(--aco-600)">
                <th style="padding:8px">OS</th>
                <th style="padding:8px">Serviço</th>
                <th style="padding:8px">Mecânico</th>
                <th style="padding:8px">Box</th>
                <th style="padding:8px">Status</th>
                <th style="padding:8px">Vendidas / Reais</th>
                <th style="padding:8px">Eficiência</th>
                <th style="padding:8px;text-align:right">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${linhasApontamentos || '<tr><td colspan="8" style="padding:16px;text-align:center;color:var(--aco-500)">Nenhum apontamento registrado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function modalIniciarApontamentoHtml(os, mecanicos = [], boxes = []) {
  const servicos = (os && (os.servicos || os.services)) || [];
  const servicosAprovados = servicos.filter(s => {
    const st = String(s.statusItem || s.status || '').toLowerCase();
    return st !== 'recusado' && st !== 'adiado';
  });

  const optServicos = servicosAprovados.map(s => `
    <option value="${s.id || s.servicoId}" data-horas="${s.horasPadrao || 1}" data-valor="${s.valor || 0}">
      ${escapeHtml(s.desc || s.nome || 'Serviço')} (${formatMoeda(s.valor || 0)})
    </option>
  `).join('');

  const optMecanicos = (mecanicos || []).map(m => `
    <option value="${m.id}">${escapeHtml(m.nome || m.nomeCompleto)}</option>
  `).join('');

  const optBoxes = (boxes || ['Box 01', 'Box 02', 'Box 03', 'Pátio Rápido']).map(b => `
    <option value="${b}">${b}</option>
  `).join('');

  return `
    <div class="modal-iniciar-apontamento" style="max-width:480px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-200);padding-bottom:10px;margin-bottom:12px">
        <h3 style="font-size:16px;font-weight:700">Iniciar Apontamento de Serviço</h3>
        <button class="btn-fechar" onclick="fecharModalGenerico()">&times;</button>
      </div>
      <p style="font-size:12px;color:var(--aco-600);margin-bottom:12px">
        OS: <b>#${escapeHtml(os.num || os.id)}</b> • Placa: <b>${escapeHtml(os.placa || 'N/A')}</b>
      </p>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Serviço Aprovado:</label>
        <select id="sel-apt-servico" class="input input-sm" style="width:100%">${optServicos}</select>
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Mecânico Responsável:</label>
        <select id="sel-apt-mecanico" class="input input-sm" style="width:100%">${optMecanicos}</select>
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Box de Execução:</label>
        <select id="sel-apt-box" class="input input-sm" style="width:100%">${optBoxes}</select>
      </div>

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Horas Padrão Vendidas:</label>
        <input type="number" id="num-apt-horas" class="input input-sm" step="0.5" value="1.0" style="width:100%">
      </div>

      <div class="entre" style="justify-content:flex-end;gap:8px">
        <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
        <button class="btn btn-primario" data-act="iniciar-apontamento-servico" data-os="${os.id}">
          Iniciar Cronômetro
        </button>
      </div>
    </div>
  `;
}

function modalConfigurarComissaoMecanicoHtml(mecanico, regraAtual = {}) {
  const base = regraAtual.percentualBase != null ? regraAtual.percentualBase : 10;
  const bonus = regraAtual.bonusEficienciaPercentual != null ? regraAtual.bonusEficienciaPercentual : 2;
  const meta = regraAtual.metaEficienciaMinima != null ? regraAtual.metaEficienciaMinima : 100;
  const gatilho = regraAtual.modalidadeGatilho || 'os_finalizada';

  return `
    <div class="modal-config-comissao" style="max-width:480px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-200);padding-bottom:10px;margin-bottom:12px">
        <h3 style="font-size:16px;font-weight:700">Regra de Comissão Técnica</h3>
        <button class="btn-fechar" onclick="fecharModalGenerico()">&times;</button>
      </div>
      <p style="font-size:12px;color:var(--aco-600);margin-bottom:12px">
        Mecânico: <b>${escapeHtml(mecanico.nome || mecanico.nomeCompleto || mecanico.id)}</b>
      </p>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Percentual Base sobre Mão de Obra (%):</label>
        <input type="number" id="num-com-base" class="input input-sm" step="0.5" value="${base}" style="width:100%">
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Bônus por Atingimento de Eficiência (%):</label>
        <input type="number" id="num-com-bonus" class="input input-sm" step="0.5" value="${bonus}" style="width:100%">
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Meta de Eficiência Mínima (%):</label>
        <input type="number" id="num-com-meta" class="input input-sm" step="5" value="${meta}" style="width:100%">
      </div>

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Gatilho de Liberação da Comissão:</label>
        <select id="sel-com-gatilho" class="input input-sm" style="width:100%">
          <option value="os_finalizada" ${gatilho === 'os_finalizada' ? 'selected' : ''}>OS Finalizada / Faturada</option>
          <option value="os_recebida" ${gatilho === 'os_recebida' ? 'selected' : ''}>OS Paga / Liquidada</option>
        </select>
      </div>

      <div class="entre" style="justify-content:flex-end;gap:8px">
        <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-regra-comissao-mecanico" data-mecanico="${mecanico.id}">
          Salvar Regra
        </button>
      </div>
    </div>
  `;
}

const uiExports = {
  renderPainelProdutividadePatioHtml,
  modalIniciarApontamentoHtml,
  modalConfigurarComissaoMecanicoHtml
};

if (typeof window !== 'undefined') Object.assign(window, uiExports);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, uiExports);
