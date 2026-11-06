/* =====================================================================
   PÁTIO CRM — ANALISTA FINANCEIRA: BI & PRODUTIVIDADE OPERACIONAL
   Métricas de Mão de Obra, Comissões de Mecânicos e Ocupação de Boxes
   ===================================================================== */

function calcularProdutividadeFrontend(periodo = 'mensal') {
  const osList = (typeof S !== 'undefined' && Array.isArray(S.os)) ? S.os : [];
  const boxes = (typeof S !== 'undefined' && Array.isArray(S.boxes) && S.boxes.length > 0) ? S.boxes : [
    { id: 'BOX-01', nome: 'Box 01' },
    { id: 'BOX-02', nome: 'Box 02' },
    { id: 'BOX-03', nome: 'Box 03' },
    { id: 'BOX-04', nome: 'Box 04' }
  ];

  const agora = new Date();
  const hojeStr = agora.toISOString().slice(0, 10);
  const corteSemanal = new Date(agora.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const inicioMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;

  const osFiltradas = osList.filter(o => {
    const d = (o.concluidoEm || o.finalizadoEm || o.dataSaida || o.data || o.criadoEm || '').slice(0, 10);
    if (!d) return true;
    if (periodo === 'semanal') return d >= corteSemanal && d <= hojeStr;
    if (periodo === 'mensal') return d >= inicioMes;
    return true;
  });

  const mecSet = new Set();
  const workers = (typeof S !== 'undefined' && Array.isArray(S.workers))
    ? S.workers
    : ((typeof S !== 'undefined' && Array.isArray(S.mecanicos)) ? S.mecanicos : []);

  workers.forEach(w => {
    if (w.nome) mecSet.add(w.nome.trim());
  });
  osFiltradas.forEach(o => {
    if (o.mecanico) mecSet.add(String(o.mecanico).trim());
  });

  const produtividadeMecanicos = [];
  let totalMaoDeObraGeral = 0;
  let totalComissoesGeral = 0;
  let totalMinutosBoxGeral = 0;
  let qtdOSTempoGeral = 0;
  let totalOSConcluidasGeral = 0;

  mecSet.forEach(nomeMec => {
    const osDoMec = osFiltradas.filter(o => o.mecanico && String(o.mecanico).trim().toLowerCase() === nomeMec.toLowerCase());
    const totalOS = osDoMec.length;
    const concluidas = osDoMec.filter(o => o.st === 'finalizada' || o.etapaPatio === 'pronto_retirada' || o.concluidoEm);
    const totalOSConcluidas = concluidas.length;

    let maoDeObraTotal = 0;
    let maoDeObraComissionavel = 0;
    let minutosBox = 0;
    let qtdOSTempo = 0;

    osDoMec.forEach(o => {
      let mob = 0;
      if (Array.isArray(o.servicos) && o.servicos.length > 0) {
        mob = o.servicos.reduce((acc, s) => acc + (Number(s.valor || s.preco || s.total) || 0), 0);
      } else if (o.totalServicos != null) {
        mob = Number(o.totalServicos) || 0;
      } else {
        const tot = Number(o.total || o.valorTotal || (typeof totOS === 'function' ? totOS(o) : 0)) || 0;
        const pec = Number(o.totalPecas) || 0;
        mob = Math.max(0, tot - pec);
      }

      maoDeObraTotal += mob;
      if (!o.isRetornoGarantia && !o.isentoGarantia) {
        maoDeObraComissionavel += mob;
      }

      const dur = Number(o.tempoOcupacaoMinutos || o.tempoBoxMinutos) || (
        o.alocadoEm && o.concluidoEm ? Math.round((new Date(o.concluidoEm) - new Date(o.alocadoEm)) / 60000) : 0
      );
      if (dur > 0) {
        minutosBox += dur;
        qtdOSTempo++;
      }
    });

    const valorComissao = Math.round(maoDeObraComissionavel * 0.20 * 100) / 100;
    const tempoMedio = qtdOSTempo > 0 ? Math.round(minutosBox / qtdOSTempo) : 0;

    totalMaoDeObraGeral += maoDeObraTotal;
    totalComissoesGeral += valorComissao;
    totalOSConcluidasGeral += totalOSConcluidas;
    totalMinutosBoxGeral += minutosBox;
    qtdOSTempoGeral += qtdOSTempo;

    produtividadeMecanicos.push({
      nome: nomeMec,
      totalOS,
      totalOSConcluidas,
      totalMaoDeObra: maoDeObraTotal,
      maoDeObraComissionavel,
      valorComissao,
      tempoMedioMinutos: tempoMedio
    });
  });

  produtividadeMecanicos.sort((a, b) => b.totalMaoDeObra - a.totalMaoDeObra);

  const produtividadeBoxes = boxes.map(b => {
    const osDoBox = osFiltradas.filter(o => o.box === b.id || o.boxId === b.id);
    const totalAtendimentos = osDoBox.length;
    let minBox = 0;
    let qtdMin = 0;
    osDoBox.forEach(o => {
      const dur = Number(o.tempoOcupacaoMinutos || o.tempoBoxMinutos) || 0;
      if (dur > 0) {
        minBox += dur;
        qtdMin++;
      }
    });
    const tempoMedioGiro = qtdMin > 0 ? Math.round(minBox / qtdMin) : 0;
    return {
      id: b.id,
      nome: b.nome || b.id,
      totalAtendimentos,
      tempoMedioGiro
    };
  });

  produtividadeBoxes.sort((a, b) => b.totalAtendimentos - a.totalAtendimentos);

  const tempoMedioBoxGeral = qtdOSTempoGeral > 0 ? Math.round(totalMinutosBoxGeral / qtdOSTempoGeral) : 0;
  const taxaGiroOficina = boxes.length > 0 ? +(totalOSConcluidasGeral / boxes.length).toFixed(1) : 0;

  return {
    periodo,
    totalMaoDeObra: totalMaoDeObraGeral,
    totalComissoes: totalComissoesGeral,
    totalOSConcluidas: totalOSConcluidasGeral,
    tempoMedioBoxMinutos: tempoMedioBoxGeral,
    taxaGiroOficina,
    mecanicos: produtividadeMecanicos,
    boxes: produtividadeBoxes
  };
}

function dashboardBiProdutividadeHtml() {
  const periodoAtivo = (typeof S !== 'undefined' && S && S.ui && S.ui.periodoBi) || 'mensal';
  const bi = calcularProdutividadeFrontend(periodoAtivo);
  const brlFmt = typeof brl === 'function' ? brl : (n => `R$ ${Number(n || 0).toFixed(2)}`);

  const maxMoB = bi.mecanicos.length > 0 && bi.mecanicos[0].totalMaoDeObra > 0 ? bi.mecanicos[0].totalMaoDeObra : 1;
  const maxBox = bi.boxes.length > 0 && bi.boxes[0].totalAtendimentos > 0 ? bi.boxes[0].totalAtendimentos : 1;

  const tempoFmt = (min) => {
    if (!min) return '0 min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  return `
    <div class="card card-p" style="margin-top:16px;background:#fcfcfd;border:1px solid var(--aco-200)">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--aco-900);display:flex;align-items:center;gap:6px">
            <span>📈</span> <b>Painel de Produtividade & Indicadores</b><!-- Dashboard BI & Produtividade -->
          </div>
          <div class="mini">Indicadores de desempenho operacional de boxes, ranking de mecânicos e provisão de comissões.</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="chip ${periodoAtivo === 'semanal' ? 'ativo' : ''}" data-act="mudar-periodo-bi" data-periodo="semanal" style="font-size:12px;cursor:pointer;padding:4px 10px;border-radius:16px;${periodoAtivo === 'semanal' ? 'background:#3b82f6;color:#fff;font-weight:700;' : ''}">
            📅 Visão Semanal
          </button>
          <button class="chip ${periodoAtivo === 'mensal' ? 'ativo' : ''}" data-act="mudar-periodo-bi" data-periodo="mensal" style="font-size:12px;cursor:pointer;padding:4px 10px;border-radius:16px;${periodoAtivo === 'mensal' ? 'background:#3b82f6;color:#fff;font-weight:700;' : ''}">
            🗓️ Visão Mensal
          </button>
        </div>
      </div>

      <!-- CARTÕES DE KPI (Cards) -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
        <div style="background:rgba(99, 102, 241, 0.06);border:1px solid rgba(99, 102, 241, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#4f46e5">💰 Faturamento Mão de Obra</div>
          <div style="font-size:18px;font-weight:800;color:#4f46e5" class="num">${brlFmt(bi.totalMaoDeObra)}</div>
          <div class="mini">Faturamento de serviços executados</div>
        </div>

        <div style="background:rgba(14, 165, 233, 0.06);border:1px solid rgba(14, 165, 233, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#0284c7">⏱️ Tempo Médio de Box</div>
          <div style="font-size:18px;font-weight:800;color:#0284c7" class="num">${tempoFmt(bi.tempoMedioBoxMinutos)}</div>
          <div class="mini">Permanência média por veículo</div>
        </div>

        <div style="background:rgba(16, 185, 129, 0.06);border:1px solid rgba(16, 185, 129, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:var(--verde)">🔄 Taxa de Giro de Oficina</div>
          <div style="font-size:18px;font-weight:800;color:var(--verde)" class="num">${bi.taxaGiroOficina} OS/box</div>
          <div class="mini">${bi.totalOSConcluidas} OS(s) concluída(s) no período</div>
        </div>

        <div style="background:rgba(245, 158, 11, 0.06);border:1px solid rgba(245, 158, 11, 0.3);border-radius:8px;padding:12px">
          <div class="mini" style="font-weight:600;color:#b45309">🤝 Total Comissões (20%)</div>
          <div style="font-size:18px;font-weight:800;color:#b45309" class="num">${brlFmt(bi.totalComissoes)}</div>
          <div class="mini">Comissões a pagar (sem garantia)</div>
        </div>
      </div>

      <!-- VISUAIS / GRÁFICOS EM BARRAS RESPONSIVOS -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px">
        <!-- Ranking de Mecânicos -->
        <div style="background:#fff;border:1px solid var(--aco-200);border-radius:8px;padding:14px">
          <div style="font-weight:700;font-size:14px;color:var(--aco-800);margin-bottom:10px;display:flex;align-items:center;gap:6px">
            👨‍🔧 <span>Ranking de Produtividade por Mecânico</span>
          </div>
          ${bi.mecanicos.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:10px">
              ${bi.mecanicos.map(m => {
                const pct = Math.min(100, Math.round((m.totalMaoDeObra / maxMoB) * 100));
                return `
                  <div>
                    <div class="entre" style="font-size:12px;margin-bottom:2px">
                      <b style="color:var(--aco-900)">${typeof esc === 'function' ? esc(m.nome) : m.nome}</b>
                      <span><b>${brlFmt(m.totalMaoDeObra)}</b> · <small style="color:#b45309">Comissão: ${brlFmt(m.valorComissao)}</small></span>
                    </div>
                    <div style="background:var(--aco-100);border-radius:4px;height:8px;overflow:hidden">
                      <div style="background:#6366f1;width:${pct}%;height:100%;border-radius:4px"></div>
                    </div>
                    <div class="mini" style="margin-top:2px;color:var(--aco-500)">
                      ${m.totalOS} OS(s) atendida(s) · ${m.totalOSConcluidas} concluída(s)
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="mini" style="text-align:center;padding:14px;color:var(--aco-500)">Nenhum mecânico com produção no período.</div>
          `}
        </div>

        <!-- Ocupação por Box -->
        <div style="background:#fff;border:1px solid var(--aco-200);border-radius:8px;padding:14px">
          <div style="font-weight:700;font-size:14px;color:var(--aco-800);margin-bottom:10px;display:flex;align-items:center;gap:6px">
            🏗️ <span>Atendimentos & Ocupação por Box</span>
          </div>
          ${bi.boxes.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:10px">
              ${bi.boxes.map(b => {
                const pct = Math.min(100, Math.round((b.totalAtendimentos / maxBox) * 100));
                return `
                  <div>
                    <div class="entre" style="font-size:12px;margin-bottom:2px">
                      <b style="color:var(--aco-900)">${typeof esc === 'function' ? esc(b.nome) : b.nome}</b>
                      <span><b>${b.totalAtendimentos} atendimento(s)</b></span>
                    </div>
                    <div style="background:var(--aco-100);border-radius:4px;height:8px;overflow:hidden">
                      <div style="background:#0ea5e9;width:${pct}%;height:100%;border-radius:4px"></div>
                    </div>
                    <div class="mini" style="margin-top:2px;color:var(--aco-500)">
                      Giro médio: ${tempoFmt(b.tempoMedioGiro)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="mini" style="text-align:center;padding:14px;color:var(--aco-500)">Nenhum box cadastrado no pátio.</div>
          `}
        </div>
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.calcularProdutividadeFrontend = calcularProdutividadeFrontend;
  window.dashboardBiProdutividadeHtml = dashboardBiProdutividadeHtml;
}
if (typeof globalThis !== 'undefined') {
  globalThis.calcularProdutividadeFrontend = calcularProdutividadeFrontend;
  globalThis.dashboardBiProdutividadeHtml = dashboardBiProdutividadeHtml;
}

