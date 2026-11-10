// js/modules/patio_boxes_gargalos_ui.js
// Gestão Visual de Boxes Pesados, Ocupação e Monitoramento de SLA de Gargalos

(function (root) {
  'use strict';

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  function renderMapaBoxesEGargalosHtml(dados = {}) {
    const boxes = Array.isArray(dados.boxes) ? dados.boxes : [];
    const ind = dados.indicadores || {};

    const totalBoxes = ind.totalBoxes || boxes.length || 0;
    const livres = ind.boxesLivres != null ? ind.boxesLivres : boxes.filter(b => b.status === 'livre').length;
    const ocupados = ind.boxesOcupadosProdutivos != null ? ind.boxesOcupadosProdutivos : boxes.filter(b => b.status === 'ocupado').length;
    const travados = ind.boxesBloqueadosGargalo != null ? ind.boxesBloqueadosGargalo : boxes.filter(b => b.status === 'bloqueado_gargalo').length;
    const taxaOcupacao = ind.taxaOcupacaoPercentual != null ? ind.taxaOcupacaoPercentual : 0;
    const estourados = ind.gargalosEstouradosCount || 0;

    const cardsBoxes = boxes.map(b => {
      let statusColor = '#22c55e';
      let statusLabel = '🟢 Livre';
      let bgStyle = 'background:#f0fdf4;border:1px solid #86efac;';

      if (b.status === 'ocupado') {
        statusColor = '#3b82f6';
        statusLabel = '🔵 Em Produção';
        bgStyle = 'background:#eff6ff;border:1px solid #93c5fd;';
      } else if (b.status === 'bloqueado_gargalo') {
        statusColor = '#ef4444';
        statusLabel = '🔴 Parada / Gargalo';
        bgStyle = 'background:#fef2f2;border:1px solid #fca5a5;';
      }

      let infoOcupacao = `<div style="font-size:12px;color:var(--aco-500);margin:8px 0">Nenhum veículo alocado</div>`;
      let acoesHtml = `
        <button class="btn btn-sm btn-outline" data-act="abrir-alocar-box" data-box-id="${esc(b.id)}" onclick="abrirModalAlocarBox('${esc(b.id)}')">Alocar Veículo</button>
      `;

      if (b.status !== 'livre') {
        infoOcupacao = `
          <div style="font-size:12px;margin:8px 0">
            <div>Placa: <b>${esc(b.placaAtual || 'N/A')}</b> (OS #${esc(b.osAtualId || '')})</div>
            <div style="color:var(--aco-600)">${esc(b.clienteNome || 'Cliente')}</div>
            <div style="font-size:11px;color:var(--aco-500);margin-top:4px">Ocupado há: <b>${b.tempoOcupadoAtualMinutos || 0} min</b></div>
          </div>
        `;

        if (b.status === 'bloqueado_gargalo') {
          const g = b.gargaloAtivo;
          const slaTag = g && g.statusSla === 'sla_estourado'
            ? '<span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:700">⚠️ SLA Estourado</span>'
            : '<span class="badge" style="background:#fef3c7;color:#92400e">Alerta SLA</span>';

          infoOcupacao += `
            <div style="background:#fff;padding:6px;border-radius:4px;border:1px solid #f87171;font-size:11px;margin-bottom:8px">
              <div><b>Motivo:</b> ${esc(g?.motivoParada || 'Gargalo')} ${slaTag}</div>
              <div style="color:#b91c1c">Parado há: ${g?.tempoParadoMinutos || b.tempoOcupadoAtualMinutos || 0} min (SLA: ${g?.slaMaximoMinutos || 60}m)</div>
            </div>
          `;
          acoesHtml = `
            <button class="btn btn-sm btn-success" data-act="encerrar-gargalo-patio" data-gargalo-id="${esc(b.gargaloAtivoId)}" onclick="encerrarGargaloParadaAction('${esc(b.gargaloAtivoId)}')">Liberar Gargalo</button>
            <button class="btn btn-sm btn-outline" data-act="transferir-veiculo-box" data-os-id="${esc(b.osAtualId)}" onclick="abrirModalAlocarBox('${esc(b.id)}', '${esc(b.osAtualId)}')">Transferir</button>
          `;
        } else {
          acoesHtml = `
            <button class="btn btn-sm btn-danger" data-act="abrir-registrar-gargalo" data-os-id="${esc(b.osAtualId)}" data-box-id="${esc(b.id)}" onclick="abrirModalGargaloParada('${esc(b.osAtualId)}', '${esc(b.id)}')">Parada / Gargalo</button>
            <button class="btn btn-sm btn-outline" data-act="transferir-veiculo-box" data-os-id="${esc(b.osAtualId)}" onclick="abrirModalAlocarBox('${esc(b.id)}', '${esc(b.osAtualId)}')">Transferir</button>
            <button class="btn btn-sm btn-primario" data-act="liberar-box-patio" data-box-id="${esc(b.id)}" onclick="liberarBoxPatioAction('${esc(b.id)}')">Liberar</button>
          `;
        }
      }

      return `
        <div class="card card-box" style="${bgStyle};padding:12px;border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:700;font-size:13px">${esc(b.codigo)}</span>
            <span style="font-size:11px;font-weight:600;color:${statusColor}">${statusLabel}</span>
          </div>
          <div style="font-size:12px;color:var(--aco-700);margin-top:2px">${esc(b.nome)}</div>
          ${infoOcupacao}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            ${acoesHtml}
          </div>
        </div>
      `;
    }).join('');

    const rankingOfensores = Object.entries(ind.tempoMedioParadaPorMotivo || {}).map(([motivo, o]) => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--aco-100)">
        <span><b>${esc(motivo)}:</b> ${o.count} ocorrência(s)</span>
        <span style="color:#b91c1c">Média: ${o.tempoMedioMinutos} min</span>
      </div>
    `).join('');

    return `
      <div class="painel-boxes-gargalos">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
          <div class="card card-p" style="border-left:4px solid #3b82f6">
            <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Taxa de Ocupação</div>
            <div style="font-size:22px;font-weight:700;color:#1e40af">${taxaOcupacao}%</div>
            <div style="font-size:11px;color:var(--aco-500)">${ocupados + travados} de ${totalBoxes} boxes ativos</div>
          </div>
          <div class="card card-p" style="border-left:4px solid #22c55e">
            <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Boxes Livres</div>
            <div style="font-size:22px;font-weight:700;color:#166534">${livres}</div>
            <div style="font-size:11px;color:var(--aco-500)">Disponíveis para entrada</div>
          </div>
          <div class="card card-p" style="border-left:4px solid #ef4444">
            <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Boxes Travados</div>
            <div style="font-size:22px;font-weight:700;color:#991b1b">${travados}</div>
            <div style="font-size:11px;color:#dc2626">SLA Estourados: ${estourados}</div>
          </div>
        </div>

        <div style="margin-bottom:16px">
          <h4 style="margin:0 0 12px 0;font-size:14px;font-weight:700">📍 Mapa Operacional de Boxes Pesados</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:12px">
            ${cardsBoxes || '<div class="text-muted">Nenhum box cadastrado no pátio.</div>'}
          </div>
        </div>

        ${rankingOfensores ? `
          <div class="card card-p" style="margin-top:16px">
            <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:700">⏱️ Principais Ofensores de Parada no Pátio</h4>
            ${rankingOfensores}
          </div>
        ` : ''}
      </div>
    `;
  }

  function modalAlocarTransferirBoxHtml(dados = {}) {
    const boxAlvo = dados.box || {};
    const boxes = Array.isArray(dados.boxes) ? dados.boxes : [];
    const osList = Array.isArray(dados.osList) ? dados.osList : [];
    const osIdAtual = dados.osIdAtual || '';
    const isTransferencia = Boolean(osIdAtual);

    const opcoesOS = osList.map(o => `
      <option value="${esc(o.id)}" ${o.id === osIdAtual ? 'selected' : ''}>#${esc(o.num || o.id)} - ${esc(o.placa || '')} (${esc(o.clienteNome || 'Cliente')})</option>
    `).join('');

    const opcoesBoxes = boxes.filter(b => b.status === 'livre').map(b => `
      <option value="${esc(b.id)}">${esc(b.codigo)} - ${esc(b.nome)}</option>
    `).join('');

    return `
      <div class="modal-box" style="max-width:500px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
          <h3 style="margin:0;font-size:16px;font-weight:700">${isTransferencia ? '🔄 Transferir Veículo de Box' : '📥 Alocar Veículo no Box'}</h3>
          <button class="btn btn-sm btn-ghost" onclick="fecharModalGenerico()">✕</button>
        </div>

        ${isTransferencia ? `
          <div style="margin-bottom:10px">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Box Destino (Livre):</label>
            <select id="sel-box-destino" class="form-input" style="width:100%">
              ${opcoesBoxes || '<option value="">Nenhum box livre no momento</option>'}
            </select>
          </div>
          <div style="margin-bottom:14px">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Motivo da Transferência:</label>
            <input type="text" id="txt-motivo-transf" class="form-input" value="Molas arqueadas; transferido para alinhamento" style="width:100%">
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
            <button class="btn btn-primario" onclick="transferirVeiculoBoxAction('${esc(osIdAtual)}')">Confirmar Transferência</button>
          </div>
        ` : `
          <div style="margin-bottom:14px">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Selecione a Ordem de Serviço / Veículo:</label>
            <select id="sel-os-alocar" class="form-input" style="width:100%">
              ${opcoesOS || '<option value="">Nenhuma OS disponível para alocação</option>'}
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
            <button class="btn btn-primario" onclick="alocarVeiculoBoxAction('${esc(boxAlvo.id)}')">Confirmar Alocação</button>
          </div>
        `}
      </div>
    `;
  }

  function modalRegistrarGargaloParadaHtml(dados = {}) {
    const osId = dados.osId || '';
    const boxId = dados.boxId || '';

    return `
      <div class="modal-box" style="max-width:500px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#991b1b">⚠️ Registrar Parada / Gargalo no Box</h3>
          <button class="btn btn-sm btn-ghost" onclick="fecharModalGenerico()">✕</button>
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Motivo do Gargalo:</label>
          <select id="sel-gargalo-motivo" class="form-input" style="width:100%">
            <option value="aguardando_peca">Aguardando Peça (SLA: 120 min)</option>
            <option value="aguardando_aprovacao_frotista">Aguardando Aprovação Frotista (SLA: 90 min)</option>
            <option value="aguardando_prensa_usinagem">Aguardando Prensa / Usinagem (SLA: 60 min)</option>
            <option value="aguardando_ferramenta_especial">Aguardando Ferramenta Especial (SLA: 45 min)</option>
            <option value="outros">Outros / Imprevisto Operacional (SLA: 60 min)</option>
          </select>
        </div>

        <div style="margin-bottom:14px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Observações Detalhadas:</label>
          <textarea id="txt-gargalo-obs" class="form-input" rows="2" style="width:100%" placeholder="Ex: Grampos 1 polegada encomendados do fornecedor"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
          <button class="btn btn-primario" style="background:#dc2626" onclick="registrarGargaloParadaAction('${esc(osId)}', '${esc(boxId)}')">Registrar Gargalo</button>
        </div>
      </div>
    `;
  }

  root.renderMapaBoxesEGargalosHtml = renderMapaBoxesEGargalosHtml;
  root.modalAlocarTransferirBoxHtml = modalAlocarTransferirBoxHtml;
  root.modalRegistrarGargaloParadaHtml = modalRegistrarGargaloParadaHtml;

})(typeof window !== 'undefined' ? window : globalThis);

