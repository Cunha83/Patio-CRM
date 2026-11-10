// js/modules/patio_qualidade_folha_ui.js
// Templates visuais para Checklist de Qualidade Pré-Entrega, Retrabalho e Folha de Comissões

(function (root) {
  'use strict';

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  function moeda(val) {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function renderPainelQualidadeFolhaHtml(dados = {}) {
    const inspecoes = Array.isArray(dados.inspecoes) ? dados.inspecoes : [];
    const retrabalhos = Array.isArray(dados.retrabalhos) ? dados.retrabalhos : [];
    const vales = Array.isArray(dados.vales) ? dados.vales : [];

    const totalAprovadas = inspecoes.filter(i => i.status === 'aprovada').length;
    const totalReprovadas = inspecoes.filter(i => i.status === 'reprovada').length;
    const totalRetrabalhos = retrabalhos.length;
    const custoRetrabalho = retrabalhos.reduce((acc, r) => acc + (Number(r.valorMaoObraAfetada) || 0), 0);
    const totalValesPendentes = vales.filter(v => v.status === 'pendente').reduce((acc, v) => acc + (Number(v.valor) || 0), 0);

    const linhasRetrabalho = retrabalhos.map(r => {
      const badgeCausa = r.causaRaiz === 'falha_execucao'
        ? '<span class="badge" style="background:#fee2e2;color:#991b1b;border:1px solid #f87171">Falha Execução</span>'
        : '<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d">Peça / Outro</span>';

      return `
        <tr style="border-bottom:1px solid var(--aco-150)">
          <td style="padding:8px"><b>#${esc(r.osRetrabalhoId || r.id)}</b></td>
          <td style="padding:8px">OS #${esc(r.osOrigemId)}</td>
          <td style="padding:8px">${esc(r.mecanicoOrigemId || 'Mecânico')}</td>
          <td style="padding:8px">${badgeCausa}</td>
          <td style="padding:8px">${moeda(r.valorMaoObraAfetada)}</td>
          <td style="padding:8px">${esc(r.motivoRetrabalho)}</td>
          <td style="padding:8px">${r.estornarComissao ? '⚠️ Estorno Ativo' : 'Isento'}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="painel-qualidade-folha">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));gap:12px;margin-bottom:16px">
          <div class="card card-p" style="border-left:4px solid #16a34a">
            <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Inspeções Aprovadas</div>
            <div style="font-size:22px;font-weight:700;color:#166534">${totalAprovadas}</div>
            <div style="font-size:11px;color:#dc2626">Reprovadas: ${totalReprovadas}</div>
          </div>
          <div class="card card-p" style="border-left:4px solid #dc2626">
            <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Garantia / Retrabalhos</div>
            <div style="font-size:22px;font-weight:700;color:#991b1b">${totalRetrabalhos}</div>
            <div style="font-size:11px;color:var(--aco-500)">Custo MO: ${moeda(custoRetrabalho)}</div>
          </div>
          <div class="card card-p" style="border-left:4px solid #f59e0b">
            <div style="font-size:11px;color:var(--aco-500);text-transform:uppercase">Vales em Aberto</div>
            <div style="font-size:20px;font-weight:700;color:#b45309">${moeda(totalValesPendentes)}</div>
            <div style="font-size:11px;color:var(--aco-500)">Adiantamentos a descontar</div>
          </div>
        </div>

        <div class="card card-p" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h4 style="margin:0;font-size:14px;font-weight:700;color:var(--aco-800)">🛠️ Ocorrências Recentes de Garantia e Retrabalho</h4>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:var(--aco-50);text-align:left;border-bottom:2px solid var(--aco-200)">
                  <th style="padding:8px">OS Garantia</th>
                  <th style="padding:8px">OS Origem</th>
                  <th style="padding:8px">Mecânico Origem</th>
                  <th style="padding:8px">Causa Raiz</th>
                  <th style="padding:8px">Valor Mão de Obra</th>
                  <th style="padding:8px">Motivo / Falha</th>
                  <th style="padding:8px">Impacto Folha</th>
                </tr>
              </thead>
              <tbody>
                ${linhasRetrabalho || '<tr><td colspan="7" style="padding:16px;text-align:center;color:var(--aco-500)">Nenhuma ocorrência de retrabalho registrada.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function modalInspecaoQualidadeOSHtml(os = {}, inspetores = []) {
    const osNum = os.num || os.id || 'N/A';
    const placa = os.placa || os.veiculoPlaca || 'Sem placa';
    const insp = os.inspecaoQualidade || {};

    return `
      <div class="modal-box" style="max-width:540px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--aco-900)">🔍 Checklist Técnico Pré-Entrega — OS #${esc(osNum)}</h3>
          <button class="btn btn-sm btn-ghost" onclick="fecharModalGenerico()">✕</button>
        </div>

        <div style="font-size:13px;color:var(--aco-600);margin-bottom:12px">
          Veículo: <b>${esc(placa)}</b> — ${esc(os.modelo || 'Caminhão/Carreta')}
        </div>

        <div style="background:var(--aco-50);padding:12px;border-radius:6px;border:1px solid var(--aco-200);margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--aco-700);text-transform:uppercase;margin-bottom:8px">Critérios de Segurança e Suspensão Pesada:</div>
          
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
            <input type="checkbox" id="chk-insp-torque" ${insp.torqueGramposOk ? 'checked' : ''}>
            <span><b>Torque dos Grampos de Mola:</b> Apertado com torquímetro conforme especificação técnica</span>
          </label>

          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
            <input type="checkbox" id="chk-insp-pino" ${insp.pinoCentroOk ? 'checked' : ''}>
            <span><b>Pino de Centro e Alinhamento:</b> Centralização de eixo e feixes conferidos</span>
          </label>

          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
            <input type="checkbox" id="chk-insp-embuchamento" ${insp.embuchamentoOk ? 'checked' : ''}>
            <span><b>Embuchamento e Tirantes:</b> Folgas de buchas, pinos e balancins aferidas</span>
          </label>

          <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;cursor:pointer">
            <input type="checkbox" id="chk-insp-rodagem" ${insp.testeRodagemOk ? 'checked' : ''}>
            <span><b>Teste de Rodagem e Pátio:</b> Sem estalos, rangidos ou instabilidade dinâmica</span>
          </label>
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Inspetor / Responsável Técnico:</label>
          <input type="text" id="txt-insp-nome" class="form-input" value="${esc(insp.inspetorNome || 'Engenheiro / Chefe de Oficina')}" style="width:100%">
        </div>

        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Observações Técnicas:</label>
          <textarea id="txt-insp-obs" class="form-input" rows="2" style="width:100%" placeholder="Ex: Grampos torquiados a 650 Nm, alinhamento visual em esquadro.">${esc(insp.observacoes || '')}</textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
          <button class="btn btn-primario" onclick="confirmarInspecaoQualidade('${os.id}')">Salvar Checklist e Liberar</button>
        </div>
      </div>
    `;
  }

  function modalAbrirRetrabalhoHtml(osOrigem = {}, equipe = []) {
    const osNum = osOrigem.num || osOrigem.id || 'N/A';
    const placa = osOrigem.placa || 'Sem placa';

    const opcoesMecanicos = equipe.map(m => `
      <option value="${m.id}">${esc(m.nome || m.id)}</option>
    `).join('');

    return `
      <div class="modal-box" style="max-width:540px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#991b1b">⚠️ Abertura de OS de Garantia e Retrabalho</h3>
          <button class="btn btn-sm btn-ghost" onclick="fecharModalGenerico()">✕</button>
        </div>

        <div style="font-size:13px;color:var(--aco-600);margin-bottom:12px">
          OS Origem: <b>#${esc(osNum)}</b> — Veículo: <b>${esc(placa)}</b> (Custo Cliente: R$ 0,00)
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Mecânico de Origem Responsável:</label>
          <select id="sel-ret-mecanico" class="form-input" style="width:100%">
            ${opcoesMecanicos || '<option value="">Selecione o mecânico...</option>'}
          </select>
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Causa Raiz:</label>
          <select id="sel-ret-causa" class="form-input" style="width:100%">
            <option value="falha_execucao">Falha de Execução / Montagem (Anula bônus e estorna comissão)</option>
            <option value="peca_defeituosa">Defeito de Fabricação da Peça (Garantia do Fornecedor)</option>
            <option value="mau_uso_cliente">Sobrecarga / Desgaste Severo de Operação</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Valor Mão de Obra Afetada (R$):</label>
            <input type="number" id="num-ret-valor" class="form-input" value="0.00" step="0.01" style="width:100%">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Horas Retrabalho Estimadas:</label>
            <input type="number" id="num-ret-horas" class="form-input" value="1.0" step="0.5" style="width:100%">
          </div>
        </div>

        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Motivo do Retrabalho / Falha Identificada:</label>
          <textarea id="txt-ret-motivo" class="form-input" rows="2" style="width:100%" placeholder="Descreva o que ocorreu..."></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
          <button class="btn btn-primario" style="background:#dc2626" onclick="confirmarAbrirRetrabalho('${osOrigem.id}')">Abrir OS de Garantia</button>
        </div>
      </div>
    `;
  }

  function modalFechamentoFolhaComissoesHtml(previa = {}) {
    const mecId = previa.mecanicoId || 'Mecânico';
    const comp = previa.competencia || 'Mês Atual';
    const prod = previa.produtividade || {};

    const alertaRetrabalho = previa.perdeuBonusPorRetrabalho
      ? `<div style="background:#fee2e2;color:#991b1b;border:1px solid #f87171;padding:8px 12px;border-radius:4px;font-size:12px;margin-bottom:12px">
          ⚠️ <b>Atenção:</b> Bônus de eficiência anulado devido a ${previa.ocorrenciasRetrabalho.length} ocorrência(s) de retrabalho por falha de execução.
         </div>`
      : '';

    return `
      <div class="modal-box" style="max-width:580px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--aco-900)">💼 Fechamento de Folha de Comissões — Comp. ${esc(comp)}</h3>
          <button class="btn btn-sm btn-ghost" onclick="fecharModalGenerico()">✕</button>
        </div>

        <div style="font-size:13px;color:var(--aco-600);margin-bottom:12px">
          Mecânico: <b>${esc(mecId)}</b>
        </div>

        ${alertaRetrabalho}

        <div style="background:var(--aco-50);padding:12px;border-radius:6px;border:1px solid var(--aco-200);margin-bottom:14px;font-size:13px">
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span>Comissão Base Apurada:</span>
            <b>${moeda(prod.valorComissaoBase)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:${previa.perdeuBonusPorRetrabalho ? '#991b1b' : '#166534'}">
            <span>Bônus de Eficiência:</span>
            <b>${previa.perdeuBonusPorRetrabalho ? 'R$ 0,00 (Anulado)' : moeda(previa.valorBonusEficiencia)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:#dc2626">
            <span>(-) Estorno de Comissão (Retrabalho):</span>
            <b>- ${moeda(previa.valorEstornoComissaoRetrabalho)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:#d97706">
            <span>(-) Vales e Adiantamentos do Mês:</span>
            <b>- ${moeda(previa.totalValesDescontar)}</b>
          </div>
          <hr style="border:none;border-top:1px dashed var(--aco-300);margin:8px 0">
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:15px;color:#1e40af">
            <span><b>Líquido a Pagar (Contas a Pagar):</b></span>
            <b>${moeda(previa.valorLiquidoPagar)}</b>
          </div>
          ${previa.saldoDevedorProximoMes > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#dc2626">
              <span>Saldo Devedor / Próximo Mês:</span>
              <b>${moeda(previa.saldoDevedorProximoMes)}</b>
            </div>
          ` : ''}
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-outline" onclick="fecharModalGenerico()">Cancelar</button>
          <button class="btn btn-primario" onclick="confirmarFecharFolha('${mecId}', '${comp}')">Confirmar e Gerar Título a Pagar</button>
        </div>
      </div>
    `;
  }

  root.renderPainelQualidadeFolhaHtml = renderPainelQualidadeFolhaHtml;
  root.modalInspecaoQualidadeOSHtml = modalInspecaoQualidadeOSHtml;
  root.modalAbrirRetrabalhoHtml = modalAbrirRetrabalhoHtml;
  root.modalFechamentoFolhaComissoesHtml = modalFechamentoFolhaComissoesHtml;

})(typeof window !== 'undefined' ? window : globalThis);
