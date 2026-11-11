// js/modules/patio_prontuario_laudo_ui.js
// Interface Visual do Prontuário Técnico 360º por Placa/Eixo, Rastreabilidade e Laudos SHA-256
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarEixoNome(eixo = '') {
    const map = {
      eixo_1_direcional: '1º Eixo (Direcional)',
      eixo_2_tracao: '2º Eixo (Tração)',
      eixo_3_truck_apoio: '3º Eixo (Truck / Apoio)',
      eixo_4_quarto_direcional: '4º Eixo (Direcional Auxiliar)',
      eixo_carreta_1: 'Eixo Carreta 1',
      eixo_carreta_2: 'Eixo Carreta 2',
      eixo_carreta_3: 'Eixo Carreta 3'
    };
    return map[eixo] || eixo.replace(/_/g, ' ').toUpperCase();
  }

  function formatarLadoNome(lado = '') {
    const map = {
      esquerdo_motorista: 'Esq. (Motorista)',
      direito_passageiro: 'Dir. (Passageiro)',
      ambos_central: 'Ambos / Central'
    };
    return map[lado] || lado;
  }

  function badgeGarantia(status) {
    if (status === 'cobertura_ativa') {
      return '<span class="badge" style="background:#166534;color:#86efac;padding:3px 8px;border-radius:4px;font-size:0.75rem;">🟢 VIGENTE</span>';
    }
    if (status === 'expirada_por_km') {
      return '<span class="badge" style="background:#991b1b;color:#fca5a5;padding:3px 8px;border-radius:4px;font-size:0.75rem;">⛔ EXPIRADA (KM)</span>';
    }
    if (status === 'expirada_por_tempo') {
      return '<span class="badge" style="background:#854d0e;color:#fef08a;padding:3px 8px;border-radius:4px;font-size:0.75rem;">⏱️ EXPIRADA (DIAS)</span>';
    }
    return `<span class="badge" style="background:#334155;color:#94a3b8;padding:3px 8px;border-radius:4px;font-size:0.75rem;">${status || 'N/A'}</span>`;
  }

  function renderPainelProntuarioTecnicoPlacaHtml(prontuario = {}) {
    const ind = prontuario.indicadoresProntuario || {};
    const placa = prontuario.placa || 'N/A';
    const totalOS = ind.totalOS || 0;
    const totalInvestido = Number(ind.totalInvestidoHistorico || 0);
    const kmMonitorado = Number(ind.kmTotalMonitorado || 0);
    const cpk = Number(ind.custoPorKmRodado || 0);
    const garantiasAtivas = Number(ind.totalGarantiasAtivasCount || 0);

    const intervencoes = Array.isArray(prontuario.intervencoesEixo) ? prontuario.intervencoesEixo : [];
    const laudos = Array.isArray(prontuario.laudosTecnicos) ? prontuario.laudosTecnicos : [];

    return `
      <div class="card p-3" style="background:var(--bg-card,#1e293b);border-radius:8px;border:1px solid #334155;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h4 style="margin:0;font-size:1.15rem;color:#38bdf8;">
              <i class="fas fa-truck-monster"></i> Prontuário Técnico 360º — Placa ${placa}
            </h4>
            <small style="color:#94a3b8;">Rastreabilidade por Eixo/Lado, Garantias Vencidas/Vigentes e Laudos Periciais</small>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-outline-info" data-act="abrir-modal-intervencao-eixo" data-placa="${placa}">
              <i class="fas fa-plus-circle"></i> Nova Intervenção
            </button>
            <button class="btn btn-sm btn-outline-warning" data-act="abrir-modal-laudo-tecnico" data-placa="${placa}">
              <i class="fas fa-file-contract"></i> Emitir Laudo Técnico
            </button>
          </div>
        </div>

        <!-- Indicadores Chave 360º -->
        <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:10px;margin-bottom:16px;">
          <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;">
            <span style="font-size:0.75rem;color:#94a3b8;">Total OSs</span>
            <div style="font-size:1.2rem;font-weight:bold;color:#f8fafc;">${totalOS}</div>
          </div>
          <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;">
            <span style="font-size:0.75rem;color:#94a3b8;">Investimento Total</span>
            <div style="font-size:1.2rem;font-weight:bold;color:#38bdf8;">${formatarMoeda(totalInvestido)}</div>
          </div>
          <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;">
            <span style="font-size:0.75rem;color:#94a3b8;">KM Monitorado</span>
            <div style="font-size:1.2rem;font-weight:bold;color:#f8fafc;">${kmMonitorado.toLocaleString('pt-BR')} km</div>
          </div>
          <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #334155;">
            <span style="font-size:0.75rem;color:#94a3b8;">Custo / KM (CPK)</span>
            <div style="font-size:1.2rem;font-weight:bold;color:#e2e8f0;">R$ ${cpk.toFixed(2)}</div>
          </div>
          <div style="background:#0f172a;padding:10px;border-radius:6px;border:1px solid #166534;">
            <span style="font-size:0.75rem;color:#86efac;">Garantias Ativas</span>
            <div style="font-size:1.2rem;font-weight:bold;color:#4ade80;">${garantiasAtivas}</div>
          </div>
        </div>

        <!-- Rastreabilidade de Intervenções por Eixo -->
        <h5 style="font-size:0.95rem;color:#e2e8f0;margin-bottom:8px;">
          <i class="fas fa-layer-group"></i> Intervenções e Peças por Eixo / Posição
        </h5>
        <div class="table-responsive" style="max-height:240px;overflow-y:auto;margin-bottom:16px;">
          <table class="table table-dark table-hover table-sm" style="margin:0;font-size:0.85rem;">
            <thead>
              <tr style="background:#0f172a;color:#94a3b8;">
                <th>Eixo / Posição</th>
                <th>Lado</th>
                <th>Sistema</th>
                <th>Descrição Peça/Serviço</th>
                <th>KM Aplicação</th>
                <th>Limite Garantia</th>
                <th>Status Garantia</th>
              </tr>
            </thead>
            <tbody>
              ${intervencoes.length === 0 ? '<tr><td colspan="7" class="text-center text-muted p-2">Nenhuma intervenção registrada por eixo.</td></tr>' :
                intervencoes.map(i => `
                  <tr>
                    <td><strong>${formatarEixoNome(i.eixoPosicao)}</strong></td>
                    <td>${formatarLadoNome(i.lado)}</td>
                    <td>${(i.componenteSistema || '').replace(/_/g, ' ')}</td>
                    <td>${i.descricaoItem || '-'}</td>
                    <td>${Number(i.kmNaAplicacao || 0).toLocaleString('pt-BR')} km</td>
                    <td>${Number(i.kmFimGarantia || 0).toLocaleString('pt-BR')} km / ${i.dataFimGarantia || '-'}</td>
                    <td>${badgeGarantia(i.statusGarantia)}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Laudos Técnicos Emitidos e Assinados -->
        <h5 style="font-size:0.95rem;color:#e2e8f0;margin-bottom:8px;">
          <i class="fas fa-shield-alt"></i> Laudos Técnicos Periciais de Suspensão (SHA-256)
        </h5>
        <div class="table-responsive" style="max-height:180px;overflow-y:auto;">
          <table class="table table-dark table-hover table-sm" style="margin:0;font-size:0.85rem;">
            <thead>
              <tr style="background:#0f172a;color:#94a3b8;">
                <th>Data</th>
                <th>Responsável Técnico</th>
                <th>Parecer Pericial</th>
                <th>KM</th>
                <th>Assinatura SHA-256</th>
              </tr>
            </thead>
            <tbody>
              ${laudos.length === 0 ? '<tr><td colspan="5" class="text-center text-muted p-2">Nenhum laudo pericial emitido para esta placa.</td></tr>' :
                laudos.map(l => `
                  <tr>
                    <td>${l.timestamp ? l.timestamp.split('T')[0] : '-'}</td>
                    <td>${l.responsavelTecnico || '-'}</td>
                    <td><span class="badge" style="background:#0284c7;color:#fff;">${l.parecerFinal}</span></td>
                    <td>${Number(l.kmInspecao || 0).toLocaleString('pt-BR')} km</td>
                    <td><code style="color:#38bdf8;font-size:0.75rem;" title="${l.hashAutenticidadeLaudo}">${l.hashAutenticidadeLaudo.slice(0, 16)}...</code></td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function modalRegistrarIntervencaoEixoHtml(dados = {}) {
    const placa = dados.placa || '';
    return `
      <div style="background:#1e293b;padding:20px;border-radius:8px;color:#f8fafc;max-width:550px;margin:auto;">
        <h4 style="margin-top:0;margin-bottom:16px;color:#38bdf8;font-size:1.15rem;">
          <i class="fas fa-wrench"></i> Registrar Intervenção Técnica por Eixo
        </h4>

        <div class="form-group mb-2">
          <label style="font-size:0.85rem;color:#94a3b8;">Placa do Veículo:</label>
          <input type="text" id="intervencao-placa" class="form-control form-control-sm" value="${placa}" ${placa ? 'readonly' : ''} style="background:#0f172a;color:#fff;border-color:#334155;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Posição do Eixo:</label>
            <select id="intervencao-eixo-posicao" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border-color:#334155;">
              <option value="eixo_1_direcional">1º Eixo (Direcional)</option>
              <option value="eixo_2_tracao" selected>2º Eixo (Tração)</option>
              <option value="eixo_3_truck_apoio">3º Eixo (Truck / Apoio)</option>
              <option value="eixo_4_quarto_direcional">4º Eixo (Direcional Auxiliar)</option>
              <option value="eixo_carreta_1">Eixo Carreta 1</option>
              <option value="eixo_carreta_2">Eixo Carreta 2</option>
              <option value="eixo_carreta_3">Eixo Carreta 3</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Lado / Posição:</label>
            <select id="intervencao-lado" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border-color:#334155;">
              <option value="esquerdo_motorista">Esquerdo (Motorista)</option>
              <option value="direito_passageiro" selected>Direito (Passageiro)</option>
              <option value="ambos_central">Ambos / Central</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Sistema / Componente:</label>
            <select id="intervencao-componente" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border-color:#334155;">
              <option value="feixe_de_molas" selected>Feixe de Molas</option>
              <option value="balanca_suspensao">Balança de Suspensão</option>
              <option value="embuchamento_pinos">Embuchamento e Pinos</option>
              <option value="amortecedor">Amortecedor</option>
              <option value="freios_cuicas">Freios / Cuícas / Tambores</option>
              <option value="suportes_grampos">Suportes e Grampos</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">KM no Momento da Troca:</label>
            <input type="number" id="intervencao-km" class="form-control form-control-sm" placeholder="ex: 120000" style="background:#0f172a;color:#fff;border-color:#334155;">
          </div>
        </div>

        <div class="form-group mb-2">
          <label style="font-size:0.85rem;color:#94a3b8;">Descrição da Peça / Serviço Aplicado:</label>
          <input type="text" id="intervencao-descricao" class="form-control form-control-sm" placeholder="ex: Lâmina mestra 90mm reforçada" style="background:#0f172a;color:#fff;border-color:#334155;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Garantia em KM:</label>
            <input type="number" id="intervencao-garantia-km" class="form-control form-control-sm" value="20000" style="background:#0f172a;color:#fff;border-color:#334155;">
          </div>
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Garantia em Dias:</label>
            <input type="number" id="intervencao-garantia-dias" class="form-control form-control-sm" value="90" style="background:#0f172a;color:#fff;border-color:#334155;">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-prontuario">Cancelar</button>
          <button class="btn btn-sm btn-primary" data-act="salvar-intervencao-eixo">
            <i class="fas fa-save"></i> Salvar Intervenção
          </button>
        </div>
      </div>
    `;
  }

  function modalEmitirLaudoTecnicoHtml(dados = {}) {
    const placa = dados.placa || '';
    return `
      <div style="background:#1e293b;padding:20px;border-radius:8px;color:#f8fafc;max-width:550px;margin:auto;">
        <h4 style="margin-top:0;margin-bottom:16px;color:#f59e0b;font-size:1.15rem;">
          <i class="fas fa-file-contract"></i> Emitir Laudo Técnico de Suspensão
        </h4>

        <div class="form-group mb-2">
          <label style="font-size:0.85rem;color:#94a3b8;">Placa do Veículo:</label>
          <input type="text" id="laudo-placa" class="form-control form-control-sm" value="${placa}" ${placa ? 'readonly' : ''} style="background:#0f172a;color:#fff;border-color:#334155;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">KM da Inspeção Pericial:</label>
            <input type="number" id="laudo-km" class="form-control form-control-sm" placeholder="ex: 125000" style="background:#0f172a;color:#fff;border-color:#334155;">
          </div>
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Parecer Final:</label>
            <select id="laudo-parecer" class="form-control form-control-sm" style="background:#0f172a;color:#fff;border-color:#334155;">
              <option value="apto_operacao_rodoviaria" selected>Apto para Operação Rodoviária</option>
              <option value="apto_com_restricoes">Apto com Restrições</option>
              <option value="inapto_risco_grave">Inapto (Risco Grave / Parada Obrigatória)</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Responsável Técnico:</label>
            <input type="text" id="laudo-responsavel" class="form-control form-control-sm" placeholder="ex: Eng. Roberto Silva" style="background:#0f172a;color:#fff;border-color:#334155;">
          </div>
          <div>
            <label style="font-size:0.85rem;color:#94a3b8;">Registro no Conselho (CREA/CFT):</label>
            <input type="text" id="laudo-conselho" class="form-control form-control-sm" placeholder="ex: CREA-SP 123456" style="background:#0f172a;color:#fff;border-color:#334155;">
          </div>
        </div>

        <div class="form-group mb-3">
          <label style="font-size:0.85rem;color:#94a3b8;">Recomendações e Parecer Técnico:</label>
          <textarea id="laudo-recomendacoes" class="form-control form-control-sm" rows="3" placeholder="Observações periciais de segurança e alinhamento..." style="background:#0f172a;color:#fff;border-color:#334155;"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-sm btn-secondary" data-act="fechar-modal-prontuario">Cancelar</button>
          <button class="btn btn-sm btn-warning" data-act="salvar-laudo-tecnico">
            <i class="fas fa-check-double"></i> Assinar Digitalmente (SHA-256)
          </button>
        </div>
      </div>
    `;
  }

  root.renderPainelProntuarioTecnicoPlacaHtml = renderPainelProntuarioTecnicoPlacaHtml;
  root.modalRegistrarIntervencaoEixoHtml = modalRegistrarIntervencaoEixoHtml;
  root.modalEmitirLaudoTecnicoHtml = modalEmitirLaudoTecnicoHtml;

})(typeof window !== 'undefined' ? window : globalThis);
