// js/modules/financeiro_bordero_modal.js
// Modal de Cobrança B2B e Espelho Analítico de Faturamento de Frotas

(function (root) {
  'use strict';

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function moeda(v) {
    if (typeof root.fmtMoeda === 'function') return root.fmtMoeda(v);
    const n = Number(v) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function dataBr(d) {
    if (!d) return '-';
    const partes = String(d).split('T')[0].split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return d;
  }

  function modalDetalhesBorderoHtml(bordero) {
    if (!bordero) return '<div class="p-4 text-center text-muted">Borderô não encontrado.</div>';

    const totais = bordero.totais || {};
    const parcelas = Array.isArray(bordero.parcelas) ? bordero.parcelas : [];
    const resumoOS = Array.isArray(bordero.resumoOS) ? bordero.resumoOS : [];

    const statusBadge = bordero.status === 'cancelado'
      ? '<span class="badge badge-danger">CANCELADO</span>'
      : (bordero.status === 'liquidado'
        ? '<span class="badge badge-success">LIQUIDADO</span>'
        : '<span class="badge badge-info">FATURADO</span>');

    let parcelasHtml = '';
    if (parcelas.length === 0) {
      parcelasHtml = '<p class="text-muted small">Nenhuma duplicata vinculada.</p>';
    } else {
      parcelasHtml = parcelas.map(p => `
        <div class="card p-3 mb-2 bg-light border">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <strong>Parcela ${p.numero || 1} / ${parcelas.length}</strong>
            <span class="badge badge-primary font-weight-bold">${moeda(p.valor)}</span>
          </div>
          <div class="small text-muted mb-2">Vencimento: <strong>${dataBr(p.vencimento)}</strong></div>
          ${p.linhaDigitavel ? `
            <div class="mb-2">
              <span class="small font-weight-bold text-secondary">Linha Digitável:</span>
              <div class="input-group input-group-sm mt-1">
                <input type="text" class="form-control font-monospace text-monospace small" value="${esc(p.linhaDigitavel)}" readonly id="ld_${p.numero}">
                <div class="input-group-append">
                  <button class="btn btn-outline-secondary" type="button" data-act="copiar-linha-digitavel" data-linha="${esc(p.linhaDigitavel)}">
                    📋 Copiar
                  </button>
                </div>
              </div>
            </div>` : ''}
          ${p.pixCopiaECola ? `
            <div>
              <span class="small font-weight-bold text-success">Pix Copia e Cola:</span>
              <div class="input-group input-group-sm mt-1">
                <input type="text" class="form-control font-monospace text-monospace small" value="${esc(p.pixCopiaECola)}" readonly>
                <div class="input-group-append">
                  <button class="btn btn-outline-success" type="button" data-act="copiar-pix-bordero" data-pix="${esc(p.pixCopiaECola)}">
                    ⚡ Copiar Pix
                  </button>
                </div>
              </div>
            </div>` : ''}
        </div>
      `).join('');
    }

    let osTableRows = '';
    if (resumoOS.length === 0) {
      osTableRows = '<tr><td colspan="6" class="text-center text-muted small py-3">Nenhuma OS associada</td></tr>';
    } else {
      osTableRows = resumoOS.map(os => {
        let articuladoInfo = '';
        if (Array.isArray(os.discriminacaoArticulado) && os.discriminacaoArticulado.length > 0) {
          articuladoInfo = `<div class="mt-1 small">` + os.discriminacaoArticulado.map(da => `
            <span class="badge ${da.alvo === 'carreta' ? 'badge-warning' : 'badge-info'} mr-1">
              ${da.alvo === 'carreta' ? '🚛 Carreta' : '🚜 Cavalo'} ${esc(da.placa)}: ${moeda(da.total)}
            </span>
          `).join('') + `</div>`;
        }

        return `
          <tr>
            <td class="font-weight-bold">#${esc(os.num || os.id)}</td>
            <td>
              <span class="badge badge-dark">${esc(os.placa)}</span>
              <div class="small text-muted">${esc(os.modelo || '')}</div>
              ${articuladoInfo}
            </td>
            <td class="text-right text-muted">${moeda(os.totalMaoDeObra || 0)}</td>
            <td class="text-right text-muted">${moeda(os.totalPecas || 0)}</td>
            <td class="text-right font-weight-bold text-primary">${moeda(os.totalOS || 0)}</td>
          </tr>
        `;
      }).join('');
    }

    return `
      <div class="modal-bordero-container" style="max-width: 900px; margin: 0 auto;">
        <div class="d-flex justify-content-between align-items-center pb-3 border-bottom mb-3">
          <div>
            <h4 class="mb-0 text-primary">Borderô de Faturamento: <strong>${esc(bordero.num || bordero.id)}</strong> ${statusBadge}</h4>
            <div class="text-muted small mt-1">
              🏢 <strong>${esc(bordero.clienteNome || 'Transportadora')}</strong> &bull; CNPJ/CPF: ${esc(bordero.clienteDoc || '-')}
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="fecharModalGenerico()">&times; Fechar</button>
        </div>

        <div class="row">
          <div class="col-md-6 mb-3">
            <h6 class="text-secondary font-weight-bold border-bottom pb-2 mb-2">📑 Duplicatas e Cobrança B2B</h6>
            ${parcelasHtml}
          </div>

          <div class="col-md-6 mb-3">
            <h6 class="text-secondary font-weight-bold border-bottom pb-2 mb-2">📊 Resumo Consolidado</h6>
            <div class="card p-3 bg-light border">
              <div class="d-flex justify-content-between py-1 small">
                <span>Total Mão de Obra:</span>
                <strong>${moeda(totais.totalMaoDeObra)}</strong>
              </div>
              <div class="d-flex justify-content-between py-1 small">
                <span>Total Peças:</span>
                <strong>${moeda(totais.totalPecas)}</strong>
              </div>
              <div class="d-flex justify-content-between py-1 small text-muted border-top mt-1 pt-1">
                <span>Subtotal Bruto:</span>
                <span>${moeda(totais.subtotalBruto)}</span>
              </div>
              ${totais.descontoGeral > 0 ? `
              <div class="d-flex justify-content-between py-1 small text-danger">
                <span>Desconto Aplicado:</span>
                <span>- ${moeda(totais.descontoGeral)}</span>
              </div>` : ''}
              ${totais.totalRetencoes > 0 ? `
              <div class="d-flex justify-content-between py-1 small text-warning">
                <span>Retenções Federais/Mun. (ISS/IRRF):</span>
                <span>- ${moeda(totais.totalRetencoes)}</span>
              </div>` : ''}
              <div class="d-flex justify-content-between py-2 border-top mt-2 font-weight-bold text-dark h5 mb-0">
                <span>Valor Líquido a Pagar:</span>
                <span class="text-success">${moeda(totais.totalLiquido)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3">
          <h6 class="text-secondary font-weight-bold border-bottom pb-2 mb-2">🚛 Espelho Analítico de Ordens de Serviço (${resumoOS.length})</h6>
          <div class="table-responsive border rounded" style="max-height: 260px; overflow-y: auto;">
            <table class="table table-sm table-hover mb-0">
              <thead class="thead-light">
                <tr>
                  <th>OS</th>
                  <th>Veículo / Conjunto</th>
                  <th class="text-right">M.O.</th>
                  <th class="text-right">Peças</th>
                  <th class="text-right">Total OS</th>
                </tr>
              </thead>
              <tbody>
                ${osTableRows}
              </tbody>
            </table>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
          <div>
            ${bordero.status !== 'cancelado' ? `
              <button class="btn btn-outline-danger btn-sm" data-act="cancelar-bordero-modal" data-id="${esc(bordero.id)}">
                🚫 Cancelar Faturamento
              </button>` : ''}
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-dark btn-sm mr-2" data-act="imprimir-espelho-bordero" data-id="${esc(bordero.id)}">
              🖨️ Imprimir Espelho
            </button>
            <button class="btn btn-success btn-sm" data-act="enviar-wa-bordero-modal" data-id="${esc(bordero.id)}">
              💬 Enviar por WhatsApp
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function abrirModalDetalhesBordero(borderoId) {
    let bordero = null;
    const S = root.S || {};
    if (Array.isArray(S.borderos)) {
      bordero = S.borderos.find(b => b.id === borderoId);
    }

    if (!bordero && root.fleetBorderoService && typeof root.fleetBorderoService.obterBorderoPorId === 'function') {
      bordero = root.fleetBorderoService.obterBorderoPorId(borderoId);
    }

    if (!bordero) {
      if (typeof root.toast === 'function') root.toast('Borderô não encontrado na memória local.', 'warning');
      return;
    }

    if (typeof root.abrirModalGenerico === 'function') {
      root.abrirModalGenerico(modalDetalhesBorderoHtml(bordero));
    } else if (typeof root.abrirFolha === 'function') {
      root.abrirFolha(() => modalDetalhesBorderoHtml(bordero));
    }
  }

  function gerarTextoWhatsAppBordero(bordero) {
    if (!bordero) return '';
    const totais = bordero.totais || {};
    const parcelas = Array.isArray(bordero.parcelas) ? bordero.parcelas : [];
    const resumoOS = Array.isArray(bordero.resumoOS) ? bordero.resumoOS : [];

    let msg = `*FATURAMENTO DE FROTA - BORDERÔ ${bordero.num || bordero.id}*\n`;
    msg += `Cliente: *${bordero.clienteNome || 'Transportadora'}*\n`;
    msg += `Qtd de Ordens de Serviço: ${resumoOS.length}\n`;
    msg += `Valor Líquido: *${moeda(totais.totalLiquido)}*\n\n`;

    if (parcelas.length > 0) {
      msg += `*Vencimentos / Duplicatas:*\n`;
      parcelas.forEach(p => {
        msg += `• Parcela ${p.numero}: ${moeda(p.valor)} venc. ${dataBr(p.vencimento)}\n`;
        if (p.linhaDigitavel) msg += `  Linha: \`${p.linhaDigitavel}\`\n`;
        if (p.pixCopiaECola) msg += `  Pix: \`${p.pixCopiaECola}\`\n`;
      });
      msg += `\n`;
    }

    msg += `*Resumo dos Veículos Atendidos:*\n`;
    resumoOS.forEach(os => {
      msg += `• OS #${os.num || os.id} - ${os.placa} (${os.modelo || 'Caminhão'}): ${moeda(os.totalOS)}\n`;
      if (Array.isArray(os.discriminacaoArticulado)) {
        os.discriminacaoArticulado.forEach(da => {
          msg += `  - ${da.alvo.toUpperCase()} (${da.placa}): ${moeda(da.total)}\n`;
        });
      }
    });

    return msg;
  }

  // Exportações públicas
  root.modalDetalhesBorderoHtml = modalDetalhesBorderoHtml;
  root.abrirModalDetalhesBordero = abrirModalDetalhesBordero;
  root.gerarTextoWhatsAppBordero = gerarTextoWhatsAppBordero;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      modalDetalhesBorderoHtml,
      abrirModalDetalhesBordero,
      gerarTextoWhatsAppBordero
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
