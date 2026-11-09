// js/modules/analista_comissoes_ui.js
// Extrato Analítico de Produtividade e Fechamento de Comissões de Mecânicos

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

  function obterDataIso(o) {
    return (o.finalizadoEm || o.concluidoEm || o.dataSaida || o.data || o.criadoEm || '').slice(0, 10);
  }

  function calcularExtratoComissoes(state, periodo, filtroMecanico) {
    const S = state || root.S || {};
    const per = periodo || (S.ui && S.ui.comissoesPeriodo) || 'quinzena_1';
    const mecFiltro = filtroMecanico || (S.ui && S.ui.comissoesMecanicoId) || 'all';

    const osList = Array.isArray(S.os) ? S.os : [];
    const mecanicos = Array.isArray(S.mecanicos) ? S.mecanicos : (Array.isArray(S.workers) ? S.workers : []);

    const itens = [];
    let totalMaoDeObra = 0;
    let totalComissao = 0;

    osList.forEach(o => {
      // Considera apenas OSs finalizadas ou com faturamento
      const isFinalizada = o.st === 'finalizada' || o.etapaPatio === 'pronto_retirada' || o.concluidoEm || o.finalizadoEm;
      if (!isFinalizada && o.st !== 'entregue') return;

      const dStr = obterDataIso(o);
      if (dStr) {
        const dia = parseInt(dStr.slice(8, 10), 10) || 1;
        if (per === 'quinzena_1' && dia > 15) return;
        if (per === 'quinzena_2' && dia <= 15) return;
      }

      const nomeMec = (o.mecanico || 'Oficina Geral').trim();
      const mecObj = mecanicos.find(m => (m.nome || '').trim().toLowerCase() === nomeMec.toLowerCase());
      const mecId = (mecObj && mecObj.id) ? mecObj.id : nomeMec;

      if (mecFiltro !== 'all' && mecFiltro !== mecId && mecFiltro !== nomeMec) {
        return;
      }

      let moOS = 0;
      let comissaoOS = 0;

      if (Array.isArray(o.servicos) && o.servicos.length > 0) {
        o.servicos.forEach(s => {
          const val = Number(s.preco || s.valor || 0);
          moOS += val;
          const taxa = Number(s.comissaoPct != null ? s.comissaoPct : (mecObj && mecObj.taxaComissaoPct != null ? mecObj.taxaComissaoPct : 20));
          comissaoOS += val * (taxa / 100);
        });
      } else if (Number(o.totalMaoDeObra) > 0) {
        moOS = Number(o.totalMaoDeObra);
        const taxa = Number(mecObj && mecObj.taxaComissaoPct != null ? mecObj.taxaComissaoPct : 20);
        comissaoOS = moOS * (taxa / 100);
      }

      if (moOS > 0 || comissaoOS > 0) {
        const taxaMedia = moOS > 0 ? ((comissaoOS / moOS) * 100) : 0;
        totalMaoDeObra += moOS;
        totalComissao += comissaoOS;
        itens.push({
          osId: o.id,
          num: o.num || o.id,
          placa: o.placa || '-',
          cliente: o.cliente || 'Consumidor',
          mecanico: nomeMec,
          valorMaoDeObra: moOS,
          taxaMedia: taxaMedia,
          valorComissao: comissaoOS,
          data: dStr
        });
      }
    });

    return {
      periodo: per,
      filtroMecanico: mecFiltro,
      qtdOS: itens.length,
      totalMaoDeObra: Math.round(totalMaoDeObra * 100) / 100,
      totalComissao: Math.round(totalComissao * 100) / 100,
      itens
    };
  }

  function blocoExtratoComissoesHtml() {
    const S = root.S || {};
    const periodo = (S.ui && S.ui.comissoesPeriodo) || 'quinzena_1';
    const filtroMec = (S.ui && S.ui.comissoesMecanicoId) || 'all';

    const calc = calcularExtratoComissoes(S, periodo, filtroMec);
    const mecanicos = Array.isArray(S.mecanicos) ? S.mecanicos : (Array.isArray(S.workers) ? S.workers : []);

    let opcoesMec = `<option value="all" ${filtroMec === 'all' ? 'selected' : ''}>Todos os Mecânicos</option>`;
    mecanicos.forEach(m => {
      const idVal = m.id || m.nome;
      opcoesMec += `<option value="${esc(idVal)}" ${filtroMec === idVal ? 'selected' : ''}>${esc(m.nome)}</option>`;
    });

    let linhasTabela = '';
    if (calc.itens.length === 0) {
      linhasTabela = `<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma comissão apurada para os filtros selecionados.</td></tr>`;
    } else {
      linhasTabela = calc.itens.map(it => `
        <tr>
          <td class="font-weight-bold">#${esc(it.num)}</td>
          <td>
            <span class="badge badge-dark">${esc(it.placa)}</span>
            <span class="small text-muted ml-1">${esc(it.cliente)}</span>
          </td>
          <td><b>${esc(it.mecanico)}</b></td>
          <td class="text-right">${moeda(it.valorMaoDeObra)}</td>
          <td class="text-center"><span class="badge badge-secondary">${it.taxaMedia.toFixed(0)}%</span></td>
          <td class="text-right font-weight-bold text-success">${moeda(it.valorComissao)}</td>
        </tr>
      `).join('');
    }

    return `
      <div class="card card-p mb-4" style="background:#fff;border:1px solid var(--aco-200);border-radius:8px;padding:16px;">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pb-2 mb-3 border-bottom">
          <div>
            <h5 class="mb-0 text-primary font-weight-bold">🤝 Extrato de Comissões e Produtividade</h5>
            <small class="text-muted">Apuração quinzenal e mensal de mão de obra para fechamento de folha operacional.</small>
          </div>
          <div class="d-flex align-items-center gap-2">
            <select class="form-control form-control-sm mr-2" style="max-width:200px" data-act="filtro-mecanico-comissao">
              ${opcoesMec}
            </select>
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn ${periodo === 'quinzena_1' ? 'btn-primary' : 'btn-outline-primary'}" data-act="mudar-periodo-comissoes" data-periodo="quinzena_1">
                1ª Quinzena (01-15)
              </button>
              <button type="button" class="btn ${periodo === 'quinzena_2' ? 'btn-primary' : 'btn-outline-primary'}" data-act="mudar-periodo-comissoes" data-periodo="quinzena_2">
                2ª Quinzena (16-31)
              </button>
              <button type="button" class="btn ${periodo === 'mes_completo' ? 'btn-primary' : 'btn-outline-primary'}" data-act="mudar-periodo-comissoes" data-periodo="mes_completo">
                Mês Completo
              </button>
            </div>
          </div>
        </div>

        <div class="row mb-3">
          <div class="col-md-3 mb-2">
            <div class="p-3 bg-light border rounded">
              <span class="small text-muted font-weight-bold d-block">Mão de Obra Faturada</span>
              <span class="h5 font-weight-bold text-dark mb-0">${moeda(calc.totalMaoDeObra)}</span>
            </div>
          </div>
          <div class="col-md-3 mb-2">
            <div class="p-3 bg-light border rounded">
              <span class="small text-success font-weight-bold d-block">Total de Comissões a Pagar</span>
              <span class="h5 font-weight-bold text-success mb-0">${moeda(calc.totalComissao)}</span>
            </div>
          </div>
          <div class="col-md-3 mb-2">
            <div class="p-3 bg-light border rounded">
              <span class="small text-muted font-weight-bold d-block">Qtd OSs Atendidas</span>
              <span class="h5 font-weight-bold text-dark mb-0">${calc.qtdOS}</span>
            </div>
          </div>
          <div class="col-md-3 mb-2">
            <div class="p-3 bg-light border rounded">
              <span class="small text-muted font-weight-bold d-block">Comissão Média / OS</span>
              <span class="h5 font-weight-bold text-dark mb-0">${calc.qtdOS > 0 ? moeda(calc.totalComissao / calc.qtdOS) : moeda(0)}</span>
            </div>
          </div>
        </div>

        <div class="table-responsive border rounded" style="max-height: 320px; overflow-y: auto;">
          <table class="table table-sm table-hover mb-0">
            <thead class="thead-light">
              <tr>
                <th>OS</th>
                <th>Veículo / Frota</th>
                <th>Mecânico</th>
                <th class="text-right">Mão de Obra</th>
                <th class="text-center">%</th>
                <th class="text-right">Comissão Líquida</th>
              </tr>
            </thead>
            <tbody>
              ${linhasTabela}
            </tbody>
          </table>
        </div>

        <div class="d-flex justify-content-end mt-3">
          <button class="btn btn-outline-secondary btn-sm" data-act="copiar-extrato-comissoes">
            📋 Copiar Relatório de Fechamento
          </button>
        </div>
      </div>
    `;
  }

  function gerarTextoExtratoComissoes(calc) {
    if (!calc) return '';
    let msg = `*EXTRATO DE COMISSÕES - PÁTIO CRM*\n`;
    msg += `Período: ${calc.periodo === 'quinzena_1' ? '1ª Quinzena' : (calc.periodo === 'quinzena_2' ? '2ª Quinzena' : 'Mês Completo')}\n`;
    msg += `Mão de Obra Total: ${moeda(calc.totalMaoDeObra)}\n`;
    msg += `Total de Comissões: *${moeda(calc.totalComissao)}*\n`;
    msg += `Qtd OSs: ${calc.qtdOS}\n\n`;
    msg += `*Detalhamento por Ordem de Serviço:*\n`;
    calc.itens.forEach(it => {
      msg += `• OS #${it.num} (${it.placa}) - ${it.mecanico}: ${moeda(it.valorComissao)} (${it.taxaMedia.toFixed(0)}% sobre ${moeda(it.valorMaoDeObra)})\n`;
    });
    return msg;
  }

  // Exportações públicas
  root.calcularExtratoComissoes = calcularExtratoComissoes;
  root.blocoExtratoComissoesHtml = blocoExtratoComissoesHtml;
  root.gerarTextoExtratoComissoes = gerarTextoExtratoComissoes;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      calcularExtratoComissoes,
      blocoExtratoComissoesHtml,
      gerarTextoExtratoComissoes
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

