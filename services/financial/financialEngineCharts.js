'use strict';

const {
  dataISO,
  addDias,
  diasEntre,
  formatarDataBR,
  formatarMoedaCurta,
  obterIntervaloFiltro
} = require('./engineHelpers');

/**
 * Gera as séries para os 5 Gráficos Executivos.
 */
function gerarSeriesGraficos(state = {}, options = {}) {
  const dataRef = options.dataRef || dataISO();
  const filtro = options.filtro || '30d';
  const { de, ate, ref } = obterIntervaloFiltro(filtro, dataRef, options.customDe, options.customAte);

  const cfg = state.cfg || {};
  const saldoInicial = Number(cfg.saldoInicial) || 0;
  const movimentos = state.movimentos || [];
  const contas = state.contas || [];

  // GRÁFICO 1 & 3: Fluxo de Caixa Diário & Evolução do Saldo
  const listaDias = [];
  let curr = de;
  while (curr <= ate && listaDias.length < 120) {
    listaDias.push(curr);
    curr = addDias(curr, 1);
  }

  const mapaEntradas = {};
  const mapaSaidas = {};
  movimentos.forEach(m => {
    const d = (m.data || '').slice(0, 10);
    const v = Number(m.valor) || 0;
    if (m.tipo === 'entrada') mapaEntradas[d] = (mapaEntradas[d] || 0) + v;
    else if (m.tipo === 'saida') mapaSaidas[d] = (mapaSaidas[d] || 0) + v;
  });

  const entradasAntes = movimentos
    .filter(m => m.tipo === 'entrada' && (m.data || '').slice(0, 10) < de)
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const saidasAntes = movimentos
    .filter(m => m.tipo === 'saida' && (m.data || '').slice(0, 10) < de)
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  let saldoAcumulado = saldoInicial + entradasAntes - saidasAntes;

  const labelsFluxo = [];
  const dadosEntradas = [];
  const dadosSaidas = [];
  const dadosEvolucaoSaldo = [];

  listaDias.forEach(dia => {
    const ent = +(mapaEntradas[dia] || 0).toFixed(2);
    const sai = +(mapaSaidas[dia] || 0).toFixed(2);
    saldoAcumulado = +(saldoAcumulado + ent - sai).toFixed(2);

    labelsFluxo.push(formatarDataBR(dia));
    dadosEntradas.push(ent);
    dadosSaidas.push(sai);
    dadosEvolucaoSaldo.push(saldoAcumulado);
  });

  // GRÁFICO 2: Receber x Pagar (Comparativo por Faixas)
  const emAberto = contas.filter(c => !c.pago);
  const faixas = [
    { label: 'Vencidos', min: -9999, max: -1 },
    { label: 'Hoje', min: 0, max: 0 },
    { label: 'Até 7d', min: 1, max: 7 },
    { label: '8 a 15d', min: 8, max: 15 },
    { label: '16 a 30d', min: 16, max: 30 },
    { label: '> 30d', min: 31, max: 9999 }
  ];

  const labelsRxP = faixas.map(f => f.label);
  const dadosRxPReceber = faixas.map(f => {
    return +emAberto
      .filter(c => c.tipo === 'receber' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  });
  const dadosRxPPagar = faixas.map(f => {
    return +emAberto
      .filter(c => c.tipo === 'pagar' && diasEntre(ref, c.venc) >= f.min && diasEntre(ref, c.venc) <= f.max)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0).toFixed(2);
  });

  // GRÁFICO 4: Projeção Financeira (Próximos 30 Dias)
  const totalEntradasGeral = movimentos
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const totalSaidasGeral = movimentos
    .filter(m => m.tipo === 'saida')
    .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
  const saldoAtualHoje = +(saldoInicial + totalEntradasGeral - totalSaidasGeral).toFixed(2);

  const labelsProjecao = [];
  const dadosProjecaoSaldo = [];

  for (let i = 0; i <= 30; i += 3) {
    const diaProj = addDias(ref, i);
    const recAte = emAberto
      .filter(c => c.tipo === 'receber' && c.venc >= ref && c.venc <= diaProj)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    const pagAte = emAberto
      .filter(c => c.tipo === 'pagar' && c.venc >= ref && c.venc <= diaProj)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);

    labelsProjecao.push(i === 0 ? 'Hoje' : formatarDataBR(diaProj));
    dadosProjecaoSaldo.push(+(saldoAtualHoje + recAte - pagAte).toFixed(2));
  }

  // GRÁFICO 5: Distribuição das Despesas por Categoria
  const movsPeriodo = movimentos.filter(m => {
    const d = (m.data || '').slice(0, 10);
    return d >= de && d <= ate;
  });

  const mapaCategorias = {};
  movsPeriodo
    .filter(m => m.tipo === 'saida')
    .forEach(m => {
      const cat = (m.cat || 'Outras Despesas').trim();
      mapaCategorias[cat] = (mapaCategorias[cat] || 0) + (Number(m.valor) || 0);
    });

  if (Object.keys(mapaCategorias).length === 0) {
    emAberto
      .filter(c => c.tipo === 'pagar')
      .forEach(c => {
        const cat = (c.cat || 'Fornecedores Peças').trim();
        mapaCategorias[cat] = (mapaCategorias[cat] || 0) + (Number(c.valor) || 0);
      });
  }

  const entradasCat = Object.entries(mapaCategorias)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const labelsCategorias = entradasCat.map(e => e[0]);
  const dadosCategorias = entradasCat.map(e => +e[1].toFixed(2));
  const coresCategorias = [
    '#3b82f6',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#8b5cf6',
    '#64748b'
  ];

  return {
    grafico1Fluxo: {
      labels: labelsFluxo,
      entradas: dadosEntradas,
      saidas: dadosSaidas,
      totalEntradas: dadosEntradas.reduce((a, b) => a + b, 0),
      totalSaidas: dadosSaidas.reduce((a, b) => a + b, 0)
    },
    grafico2ReceberXPagar: {
      labels: labelsRxP,
      receber: dadosRxPReceber,
      pagar: dadosRxPPagar
    },
    grafico3EvolucaoSaldo: {
      labels: labelsFluxo,
      saldo: dadosEvolucaoSaldo
    },
    grafico4Projecao: {
      labels: labelsProjecao,
      saldoProjetado: dadosProjecaoSaldo
    },
    grafico5Despesas: {
      labels: labelsCategorias,
      dados: dadosCategorias,
      cores: coresCategorias.slice(0, labelsCategorias.length)
    }
  };
}

function gerarSVGBarrasFluxo(fluxo = {}, width = 960, height = 200) {
  const labels = fluxo.labels || [];
  const entradas = fluxo.entradas || [];
  const saidas = fluxo.saidas || [];

  if (labels.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width / 2}" y="${height / 2}" fill="#64748b" font-size="16" text-anchor="middle">Nenhuma movimentação no período</text>
    </svg>`;
  }

  const count = Math.min(labels.length, 14);
  const startIdx = labels.length - count;
  const lSlice = labels.slice(startIdx);
  const eSlice = entradas.slice(startIdx);
  const sSlice = saidas.slice(startIdx);

  const maxVal = Math.max(...eSlice, ...sSlice, 100);
  const padLeft = 70;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const groupW = chartW / count;
  const barW = Math.max(8, Math.min(22, (groupW - 10) / 2));

  let barsSvg = '';
  for (let i = 0; i < count; i++) {
    const eVal = eSlice[i] || 0;
    const sVal = sSlice[i] || 0;
    const eH = (eVal / maxVal) * chartH;
    const sH = (sVal / maxVal) * chartH;

    const groupX = padLeft + (i * groupW) + (groupW / 2);
    const eX = groupX - barW - 2;
    const sX = groupX + 2;

    const eY = padTop + chartH - eH;
    const sY = padTop + chartH - sH;

    if (eH > 0) {
      barsSvg += `<rect x="${eX}" y="${eY}" width="${barW}" height="${eH}" rx="3" fill="#10b981" opacity="0.9"/>`;
    }
    if (sH > 0) {
      barsSvg += `<rect x="${sX}" y="${sY}" width="${barW}" height="${sH}" rx="3" fill="#ef4444" opacity="0.9"/>`;
    }

    barsSvg += `<text x="${groupX}" y="${height - 10}" fill="#94a3b8" font-size="11" font-weight="600" text-anchor="middle">${lSlice[i]}</text>`;
  }

  let gridSvg = '';
  for (let g = 0; g <= 3; g++) {
    const yVal = padTop + (chartH / 3) * g;
    const valorGuia = maxVal * (1 - g / 3);
    gridSvg += `<line x1="${padLeft}" y1="${yVal}" x2="${width - padRight}" y2="${yVal}" stroke="#1e293b" stroke-dasharray="4,4" stroke-width="1"/>`;
    gridSvg += `<text x="${padLeft - 10}" y="${yVal + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${formatarMoedaCurta(valorGuia)}</text>`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${gridSvg}
    ${barsSvg}
  </svg>`;
}

function gerarSVGProjecao(projecao = {}, width = 960, height = 180) {
  const labels = projecao.labels || [];
  const dados = projecao.saldoProjetado || [];

  if (labels.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${width / 2}" y="${height / 2}" fill="#64748b" font-size="16" text-anchor="middle">Sem projeção disponível</text>
    </svg>`;
  }

  const padLeft = 70;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 35;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minVal = Math.min(...dados, 0);
  const maxVal = Math.max(...dados, 1000);
  const range = maxVal - minVal || 1;

  const points = dados.map((v, i) => {
    const x = padLeft + (i / (dados.length - 1 || 1)) * chartW;
    const y = padTop + chartH - ((v - minVal) / range) * chartH;
    return { x, y, val: v, label: labels[i] };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padTop + chartH} L ${points[0].x.toFixed(1)} ${padTop + chartH} Z`;

  let gridSvg = '';
  for (let g = 0; g <= 2; g++) {
    const yVal = padTop + (chartH / 2) * g;
    const valorGuia = maxVal - (range / 2) * g;
    gridSvg += `<line x1="${padLeft}" y1="${yVal}" x2="${width - padRight}" y2="${yVal}" stroke="#1e293b" stroke-dasharray="4,4" stroke-width="1"/>`;
    gridSvg += `<text x="${padLeft - 10}" y="${yVal + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${formatarMoedaCurta(valorGuia)}</text>`;
  }

  let circlesSvg = '';
  points.forEach((p, idx) => {
    circlesSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#38bdf8" stroke="#0b0f19" stroke-width="2"/>`;
    if (idx % 2 === 0 || idx === points.length - 1) {
      circlesSvg += `<text x="${p.x.toFixed(1)}" y="${height - 10}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="middle">${p.label}</text>`;
    }
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
    ${gridSvg}
    <path d="${areaD}" fill="url(#projGrad)"/>
    <path d="${pathD}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
    ${circlesSvg}
  </svg>`;
}

module.exports = {
  gerarSeriesGraficos,
  gerarSVGBarrasFluxo,
  gerarSVGProjecao
};

