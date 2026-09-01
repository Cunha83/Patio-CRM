/* =====================================================================
   PÁTIO CRM — NÚCLEO DA APLICAÇÃO, NAVEGAÇÃO & EVENTOS GLOBAIS
===================================================================== */

/* ---------------- Casca & Navegação ---------------- */
function renderNav() {
  const v = S.ui.view || 'patio';
  const itens = [
    ['patio', 'Pátio & Boxes', 'patio'],
    ['painel', 'Painel & KPIs', 'painel'],
    ['estoque', 'Almoxarifado', 'pecas'],
    ['financeiro', 'Financeiro', 'fin'],
    ['mensagens', 'WhatsApp CRM', 'zap'],
    ['cadastros', 'Cadastros', 'cad'],
    ['relatorios', 'Relatórios & Backup', 'relatorios'],
    ['configuracoes', 'Configurações', 'cfg']
  ];

  const html = `
  <div class="nav-marca">
    <div class="chapa">${ico('patio', 18)}</div>
    <div>
      <div style="font-weight:700;font-size:15px;color:#fff;line-height:1.2">PÁTIO DIESEL</div>
      <div style="font-size:11px;color:var(--aco-400)">Gestão de Oficina Pesada</div>
    </div>
  </div>
  <div class="nav-links">
    ${itens.map(([k, label, iconName]) => `
      <button class="nav-link ${v === k ? 'ativo' : ''}" data-act="ir" data-v="${k}">
        ${ico(iconName, 18)}
        <span>${label}</span>
      </button>
    `).join('')}
  </div>
  <div class="nav-rodape">
    <div class="mini" style="color:var(--aco-400);font-size:11px">Versão 2.4 Modular</div>
    <div id="status-salvo" style="color:var(--verde);font-size:11px;font-weight:600;min-height:16px">● Salvo localmente</div>
  </div>`;

  const navEl = document.getElementById('nav');
  if (navEl) navEl.innerHTML = html;
}

function renderTopo() {
  const v = S.ui.view || 'patio';
  const titulos = {
    patio: 'Pátio Operacional & Boxes',
    painel: 'Painel Geral de Desempenho',
    estoque: 'Almoxarifado & Peças',
    financeiro: 'Gestão Financeira & DRE',
    mensagens: 'Comunicação & Cobrança WhatsApp',
    cadastros: 'Cadastros & Frotas',
    relatorios: 'Relatórios & Exportações',
    configuracoes: 'Configurações da Oficina'
  };

  return `
  <header class="topo">
    <div class="marca">
      <div class="chapa">${ico('patio', 18)}</div>
      <div>
        <h1>PÁTIO DIESEL</h1>
        <div class="sub">${titulos[v] || 'CRM'}</div>
      </div>
    </div>
    <div class="topo-titulo-desktop" style="font-weight:700;font-size:16px;color:#fff">
      ${titulos[v] || 'Oficina'}
    </div>
    <div class="dir">
      <div class="pill-topo">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--verde)"></span>
        <span>${esc(S.cfg.empresa)}</span>
      </div>
      <button class="btn btn-primario" data-act="nova-os" style="height:32px;font-size:12.5px;padding:0 12px;border-radius:16px">
        ${ico('mais', 14)} Nova OS
      </button>
    </div>
  </header>`;
}

/* ---------------- Render Principal ---------------- */
function render() {
  renderNav();
  const v = S.ui.view || 'patio';
  let conteudo = '';

  if (v === 'patio') conteudo = viewPatio();
  else if (v === 'painel') conteudo = viewPainelInicial();
  else if (v === 'estoque') conteudo = viewEstoque();
  else if (v === 'financeiro') conteudo = viewFinanceiro();
  else if (v === 'mensagens') conteudo = viewMensagens();
  else if (v === 'cadastros') conteudo = viewCadastros();
  else if (v === 'relatorios') conteudo = viewRelatorios();
  else if (v === 'configuracoes') conteudo = viewConfiguracoes();

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = renderTopo() + `<main class="wrap">${conteudo}</main>`;
  }

  // Renderiza gráficos caso a view demande
  if (v === 'painel') {
    setTimeout(renderGraficosPainel, 100);
  } else if (v === 'relatorios') {
    setTimeout(initRelatoriosCharts, 100);
  }
}

/* ---------------- Painel Inicial / KPIs ---------------- */
function viewPainelInicial() {
  const osLista = S.os || [];
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const osAndamento = osLista.filter(o => o.st === 'executando');
  const pecasCriticas = (S.pecas || []).filter(p => (p.qtd || 0) <= (p.min || 1));

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Consolidado em contas</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('patio', 14)} Veículos em Execução</div>
      <div class="v">${osAndamento.length}</div>
      <div class="d">Boxes ocupados</div>
    </div>
    <div class="kpi ${totalRec > 0 ? 'bom' : 'neutro'}">
      <div class="r">${ico('doc', 14)} A Receber (30d)</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} faturas de clientes</div>
    </div>
    <div class="kpi ${pecasCriticas.length ? 'alerta' : 'bom'}">
      <div class="r">${ico('pecas', 14)} Peças p/ Repor</div>
      <div class="v">${pecasCriticas.length}</div>
      <div class="d">Abaixo do estoque mínimo</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Fluxo Financeiro Semanal (Entradas vs Saídas)</div>
      <div class="mini" style="margin-bottom:12px">Comparativo consolidado dos últimos dias</div>
      <div style="height:220px;position:relative">
        <canvas id="grafico-fluxo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Ocupação do Pátio</div>
      <div class="mini" style="margin-bottom:12px">Distribuição dos veículos nos boxes</div>
      <div style="height:220px;position:relative">
        <canvas id="grafico-ocupacao"></canvas>
      </div>
    </div>
  </div>`;
}

function renderGraficosPainel() {
  if (typeof Chart === 'undefined') return;

  const ctxFluxo = document.getElementById('grafico-fluxo');
  if (ctxFluxo) {
    if (window._chartFluxo) window._chartFluxo.destroy();
    window._chartFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Hoje'],
        datasets: [
          { label: 'Entradas (R$)', data: [4200, 3100, 5800, 4900, 7200, 6400], backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Saídas (R$)', data: [2100, 1800, 3400, 2900, 4100, 3200], backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  const ctxOcup = document.getElementById('grafico-ocupacao');
  if (ctxOcup) {
    if (window._chartOcup) window._chartOcup.destroy();
    const osLista = S.os || [];
    window._chartOcup = new Chart(ctxOcup, {
      type: 'doughnut',
      data: {
        labels: ['Em Execução', 'Parado Peça', 'Aprovação', 'Na Fila'],
        datasets: [{
          data: [
            osLista.filter(o => o.st === 'executando').length || 1,
            osLista.filter(o => o.st === 'peca').length,
            osLista.filter(o => o.st === 'aprovacao').length,
            osLista.filter(o => o.st === 'fila').length
          ],
          backgroundColor: ['#2563eb', '#f59e0b', '#8b5cf6', '#cbd5e1']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

/* ---------------- Configurações do Sistema ---------------- */
function viewConfiguracoes() {
  const cfg = S.cfg || {};

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div style="font-weight:700;font-size:18px;margin-bottom:6px">Configurações da Oficina & Parâmetros</div>
    <div class="mini" style="margin-bottom:16px">Dados impressos nas ordens de serviço, recibos e cabeçalhos.</div>

    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Nome da Oficina / Razão Social:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.empresa || '')}" data-act="cfg" data-c="empresa" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.cnpj || '')}" data-act="cfg" data-c="cnpj" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Telefone / WhatsApp Comercial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.fone || '')}" data-act="cfg" data-c="fone" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Endereço Completo:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.endereco || '')}" data-act="cfg" data-c="endereco" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Chave PIX Oficial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.chavePix || '')}" data-act="cfg" data-c="chavePix" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Inicial do Caixa (R$):</label>
          <input type="number" class="campo-texto" value="${cfg.saldoInicial || 0}" data-act="cfg" data-c="saldoInicial" step="100" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Termo Padrão de Garantia de Serviços:</label>
        <textarea class="campo-texto" data-act="cfg" data-c="termoGarantia" rows="2" style="width:100%">${esc(cfg.termoGarantia || '')}</textarea>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Integração APIBrasil (Consulta de Placas)</div>
        <div class="mini" style="margin-bottom:10px">Insira as credenciais para puxar marca, modelo e cor pela placa automaticamente.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">DeviceToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.deviceToken) || '')}" data-act="cfg-apibrasil" data-c="deviceToken" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">BearerToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.bearerToken) || '')}" data-act="cfg-apibrasil" data-c="bearerToken" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-perigo" data-act="zerar">Restaurar Demonstração</button>
        <button class="btn btn-primario" data-act="salvar-cfg">Salvar Alterações</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- Gerenciamento de Modais / Folhas ---------------- */
function abrirFolha(fn) {
  folhaAtual = fn;
  renderFolha();
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.add('on');
  if (folha) folha.classList.add('on');
}

function renderFolha() {
  const folha = document.getElementById('folha');
  if (folha && folhaAtual) {
    folha.innerHTML = folhaAtual();
  }
}

function fecharFolha() {
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.remove('on');
  if (folha) folha.classList.remove('on');
  folhaAtual = null;
}

function pedirConfirmacao(chave, msg, fn) {
  if (confirmando === chave) {
    confirmando = null;
    fn();
    return;
  }
  confirmando = chave;
  torrar(msg);
  setTimeout(() => {
    if (confirmando === chave) confirmando = null;
  }, 4000);
}

function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).catch(() => caiuNoTextarea(texto));
  } else {
    caiuNoTextarea(texto);
  }
}

function caiuNoTextarea(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}

function textoOrcamento(o) {
  const v = V(o.vei), c = C(o.cli);
  const l = [`*${S.cfg.empresa}* — Orçamento OS ${o.num}`, `${v.placa} · ${v.modelo}`, `Cliente: ${c.nome}`, ''];
  if (o.servicos.length) {
    l.push('*Serviços*');
    o.servicos.forEach(i => l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd * i.valor)}`));
    l.push('');
  }
  if (o.pecas.length) {
    l.push('*Peças*');
    o.pecas.forEach(i => l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd * i.valor)}`));
    l.push('');
  }
  if (o.desc) l.push(`Desconto: −${brl(o.desc)}`);
  l.push(`*Total: ${brl(totOS(o))}*`);
  l.push(`Previsão de entrega: ${dataBRfull(o.prev)}`);
  return l.join('\n');
}

/* =====================================================================
   DELEGAÇÃO GLOBAL DE EVENTOS (CLICK, INPUT, CHANGE)
===================================================================== */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  const o = OSatual();

  switch (a) {
    case 'ir': S.ui.view = b.dataset.v; S.ui.busca = ''; render(); break;
    case 'filtro': S.ui.filtro = b.dataset.f; render(); break;
    case 'filtro-fin': S.ui.filtroFin = b.dataset.f; render(); break;
    case 'filtro-estoque': S.ui.filtroEstoque = b.dataset.f; render(); break;
    case 'fechar': fecharFolha(); break;

    /* --- OS --- */
    case 'abrir-os': S.ui.osAberta = b.dataset.id; S.ui.abaOS = 'servicos'; S.ui.picker = null; S.ui.busca = ''; abrirFolha(folhaOS); break;
    case 'nova-os': S.ui.rascunho = null; abrirFolha(() => novaOSFolha(b.dataset.box)); break;
    case 'voltar-os': S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    case 'imprimir-os': imprimirOS(o); break;
    case 'copiar-orc': copiar(textoOrcamento(o)); torrar('Orçamento copiado para o WhatsApp!'); break;
    case 'excluir-os': pedirConfirmacao('os' + o.id, 'Toque de novo para excluir a OS permanentemente', () => { S.os = S.os.filter(x => x.id !== o.id); fecharFolha(); render(); torrar('OS excluída'); }); break;
    case 'aba-os': S.ui.abaOS = b.dataset.k; S.ui.picker = null; renderFolha(); break;
    case 'picker': S.ui.picker = b.dataset.p; S.ui.busca = ''; renderFolha(); break;
    case 'fechar-picker': S.ui.picker = null; S.ui.busca = ''; renderFolha(); break;
    case 'add-item': {
      const tipo = b.dataset.t, refId = b.dataset.r;
      const isPeca = tipo === 'pecas';
      const ref = isPeca ? P(refId) : Serv(refId);
      o[tipo] = o[tipo] || [];
      o[tipo].push({ id: uid('item'), nome: ref.nome, cod: ref.cod || '', qtd: 1, valor: isPeca ? ref.venda : ref.valor });
      salvar(); renderFolha(); render(); torrar('Item adicionado à OS'); break;
    }
    case 'qtd': {
      const lista = o[b.dataset.t], item = lista.find(x => x.id === b.dataset.i);
      if (item) { item.qtd = Math.max(1, item.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); }
      break;
    }
    case 'rm-item': o[b.dataset.t] = o[b.dataset.t].filter(x => x.id !== b.dataset.i); salvar(); renderFolha(); render(); break;
    case 'faturar-os-modal': abrirFolha(folhaFaturarOS); break;
    case 'confirmar-faturamento': processarFaturamentoOS(o); fecharFolha(); render(); torrar(`OS ${o.num} faturada e entregue com sucesso!`); break;

    case 'salvar-veiculo': {
      const r = S.ui.rascVeiculo;
      if (!r || !r.placa) { torrar('Digite a placa do caminhão'); break; }
      const novoId = uid('v');
      S.veiculos.push({ id: novoId, cli: r.cli || S.clientes[0].id, placa: r.placa.toUpperCase(), marca: r.marca || '', modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo Mecânico' });
      salvar(); torrar('Veículo cadastrado!');
      S.ui.rascunho = S.ui.rascunho || {}; S.ui.rascunho.vei = novoId; S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    }
    case 'buscar-placa-veiculo': {
      const rV = S.ui.rascVeiculo;
      if (!rV || !rV.placa || rV.placa.length < 7) { torrar('Digite uma placa válida!'); break; }
      const cred = S.cfg.apibrasil;
      if (!cred || !cred.deviceToken || !cred.bearerToken) { torrar('Credenciais da APIBrasil não preenchidas em Configurações.'); break; }
      b.innerHTML = '...';
      fetch('https://gateway.apibrasil.io/api/v2/veiculos/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'DeviceToken': cred.deviceToken, 'Authorization': 'Bearer ' + cred.bearerToken },
        body: JSON.stringify({ placa: rV.placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })
      })
      .then(r => r.json())
      .then(res => {
        b.innerHTML = ico('busca', 14) + ' Consultar';
        if (res && res.error === false && res.data) {
          rV.marca = res.data.marca || ''; rV.modelo = res.data.modelo || ''; rV.cor = res.data.cor || '';
          renderFolha(); torrar('Dados da placa obtidos com sucesso!');
        } else { torrar(res.message || 'Placa não localizada.'); }
      })
      .catch(() => { b.innerHTML = ico('busca', 14) + ' Consultar'; torrar('Erro de rede na consulta.'); });
      break;
    }
    case 'ver-historico-veiculo': {
      const vei = V(b.dataset.id);
      abrirFolha(() => `
        <div class="card card-p" style="max-width:650px;margin:0 auto">
          <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
            <h3 style="font-size:17px;font-weight:700">Histórico de Manutenções</h3>
            <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
          </div>
          ${abaHistoricoVeiculo(vei)}
        </div>
      `);
      break;
    }

    /* --- Estoque & OCR --- */
    case 'ver-peca': S.ui.pecaAberta = b.dataset.id; abrirFolha(folhaPeca); break;
    case 'mov-peca': { const p = P(S.ui.pecaAberta); p.qtd = Math.max(0, p.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); break; }
    case 'mov-peca-grid': { const p = P(b.dataset.id); p.qtd = Math.max(0, p.qtd + Number(b.dataset.d)); salvar(); render(); break; }
    case 'nova-peca': S.ui.rascPeca = null; abrirFolha(folhaNovaPeca); break;
    case 'salvar-peca': {
      const r = S.ui.rascPeca || {};
      if (!r.nome) { torrar('Descrição da peça é obrigatória'); break; }
      S.pecas.push({ id: uid('p'), cod: r.cod || ('MAN-' + Math.floor(Math.random() * 9000 + 1000)), nome: r.nome, un: r.un || 'un', qtd: +r.qtd || 0, min: +r.min || 1, custo: +r.custo || 0, venda: +r.venda || 0, loc: r.loc || '—', forn: r.forn || '—' });
      salvar(); S.ui.rascPeca = null; fecharFolha(); render(); torrar('Peça cadastrada no almoxarifado!'); break;
    }
    case 'excluir-peca':
    case 'excluir-peca-id': {
      const pId = b.dataset.id || S.ui.pecaAberta;
      pedirConfirmacao('pc' + pId, 'Toque de novo para excluir a peça', () => {
        S.pecas = S.pecas.filter(x => x.id !== pId);
        salvar(); fecharFolha(); render(); torrar('Peça removida.');
      });
      break;
    }
    case 'importar-xml': S.ui.nota = null; abrirFolha(folhaXML); break;
    case 'confirmar-xml': confirmarXML(); break;
    case 'ocr-entrada': abrirFolha(folhaSimulacaoOCR); break;
    case 'importar-exemplo-ocr': {
      S.pecas.push(
        { id: uid('p'), cod: 'LON-HD291', nome: 'Jogo de Lonas de Freio Heavy Duty', un: 'jg', qtd: 4, min: 2, custo: 480.00, venda: 780.00, loc: 'Prat. A-04', forn: 'ZF do Brasil' },
        { id: uid('p'), cod: 'CIL-M204', nome: 'Cilindro Mestre de Embreagem', un: 'un', qtd: 2, min: 1, custo: 960.00, venda: 1550.00, loc: 'Prat. C-02', forn: 'ZF do Brasil' }
      );
      S.contas.push({ id: uid('ct'), tipo: 'pagar', desc: 'NF-e 784102 — ZF do Brasil', parte: 'ZF do Brasil', valor: 3840.00, venc: addDias(hoje(), 28), pago: false, cat: 'Fornecedores Peças', doc: 'NF-784102' });
      salvar(); fecharFolha(); render(); torrar('OCR processado: 2 peças e R$ 3.840,00 lançados!'); break;
    }

    /* --- Financeiro --- */
    case 'aba-fin': S.ui.abaFin = b.dataset.k; render(); break;
    case 'baixar': {
      const c = S.contas.find(x => x.id === b.dataset.id);
      baixarConta(c); render(); torrar(`${c.tipo === 'receber' ? 'Recebimento' : 'Pagamento'} efetuado · ${brl(c.valor)}`); break;
    }
    case 'imprimir-recibo': imprimirRecibo(b.dataset.id); break;
    case 'nova-conta': S.ui.contaTipo = b.dataset.t; S.ui.rascConta = null; abrirFolha(folhaConta); break;
    case 'salvar-conta': {
      const r = S.ui.rascConta || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); break; }
      S.contas.push({ id: uid('ct'), tipo: S.ui.contaTipo, desc: r.desc, parte: r.parte || '—', valor: +r.valor, venc: r.venc || hoje(), pago: false, cat: r.cat || 'Outros', doc: '' });
      salvar(); S.ui.rascConta = null; fecharFolha(); render(); torrar('Título lançado!'); break;
    }
    case 'novo-mov': S.ui.rascMov = null; abrirFolha(folhaMov); break;
    case 'salvar-mov': {
      const r = S.ui.rascMov || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); break; }
      S.movimentos.push({ id: uid('mv'), data: r.data || hoje(), tipo: r.tipo || 'entrada', desc: r.desc, valor: +r.valor, cat: r.cat || 'Geral', conc: false });
      salvar(); S.ui.rascMov = null; fecharFolha(); render(); torrar('Movimento registrado no caixa!'); break;
    }
    case 'limpar-extrato': S.extrato = []; salvar(); render(); torrar('Extrato limpo'); break;

    /* --- WhatsApp --- */
    case 'aba-zap': S.ui.abaZap = b.dataset.k; render(); break;
    case 'liga-zap': S.zap.ativo = !S.zap.ativo; salvar(); render(); break;
    case 'ver-api': abrirFolha(folhaAPI); break;
    case 'disparar-camp': {
      const camp = S.ui.camp || {};
      const lista = destinatarios(camp.seg);
      if (!lista.length) { torrar('Nenhum destinatário nesse segmento'); break; }
      if (!camp.texto) { torrar('Escreva a mensagem da campanha'); break; }
      S.ui.disparo = { nome: camp.nome || 'Campanha', seg: camp.seg, texto: camp.texto, lista, ix: 0, enviados: 0 };
      abrirFolha(folhaDisparo); break;
    }
    case 'disparo-enviar': {
      const d = S.ui.disparo, cli = d.lista[d.ix];
      registrarEnvio({ chave: 'camp_' + cli.id + '_' + Date.now(), tipo: 'campanha', rotulo: d.nome, cliente: cli.nome, fone: cli.fone, texto: preencher(d.texto, ctxCliente(cli)), status: 'enviado' });
      d.enviados++; d.ix++; renderFolha(); break;
    }
    case 'disparo-pular': S.ui.disparo.ix++; renderFolha(); break;
    case 'fechar-disparo': {
      const d = S.ui.disparo;
      if (d && d.enviados) S.zap.campanhas.push({ id: uid('cp'), nome: d.nome, seg: d.seg, data: hoje(), enviados: d.enviados });
      S.ui.disparo = null; fecharFolha(); render(); break;
    }
    case 'add-regra': S.zap.regua.push({ id: uid('r'), quando: 5, ativo: true, nome: 'Nova Etapa de Cobrança', texto: 'Olá {contato}, sobre o título de {valor} vencido em {venc}: consegue nos dar uma posição? Obrigado, {empresa}.' }); salvar(); render(); break;
    case 'rm-regra': S.zap.regua = S.zap.regua.filter(x => x.id !== b.dataset.i); salvar(); render(); break;
    case 'copiar-camp': copiar(S.ui.camp.texto); torrar('Texto copiado!'); break;
    case 'copiar-var': copiar(b.dataset.v); torrar(b.dataset.v + ' copiado'); break;
    case 'limpar-hist': pedirConfirmacao('hist', 'Toque de novo para limpar o histórico', () => { S.zap.envios = []; salvar(); render(); }); break;

    /* --- Cadastros --- */
    case 'aba-cad': S.ui.abaCad = b.dataset.k; render(); break;
    case 'ver-cliente': S.ui.cliAberto = b.dataset.id; abrirFolha(folhaCliente); break;
    case 'novo-cad': S.ui.cadTipo = b.dataset.t; S.ui.rascCad = {}; abrirFolha(folhaCadastro); break;
    case 'editar-cliente': S.ui.cadTipo = 'cliente'; S.ui.rascCad = JSON.parse(JSON.stringify(S.clientes.find(x => x.id === b.dataset.id))); abrirFolha(folhaCadastro); break;
    case 'bloquear-cliente': {
      const cl = S.clientes.find(x => x.id === b.dataset.id);
      if (cl) { cl.bloqueado = !cl.bloqueado; salvar(); renderFolha(); render(); torrar(cl.bloqueado ? 'Cliente bloqueado para faturamento' : 'Cliente desbloqueado'); }
      break;
    }
    case 'excluir-cliente': pedirConfirmacao('excli' + b.dataset.id, 'Toque de novo para excluir o cliente', () => { S.clientes = S.clientes.filter(x => x.id !== b.dataset.id); salvar(); render(); torrar('Cliente excluído'); }); break;
    case 'salvar-cad': {
      const r = S.ui.rascCad || {}, t = S.ui.cadTipo;
      if (t === 'cliente') {
        if (!r.nome) { torrar('Razão Social / Nome é obrigatório'); break; }
        if (r.id) {
          const idx = S.clientes.findIndex(x => x.id === r.id);
          if (idx >= 0) S.clientes[idx] = { ...S.clientes[idx], ...r };
        } else {
          S.clientes.push({ id: uid('cli'), nome: r.nome, fantasia: r.fantasia || '', doc: r.doc || '', fone: r.fone || '', email: r.email || '', contato: r.contato || '', prazo: +r.prazo || 0, ie: r.ie || '', endereco: r.endereco || '', cidade: r.cidade || '', uf: r.uf || '', cep: r.cep || '', optin: true, bloqueado: false });
        }
      }
      if (t === 'servico') {
        if (!r.nome) { torrar('Descrição do serviço é obrigatória'); break; }
        S.servicos.push({ id: uid('s'), nome: r.nome, valor: +r.valor || 0, horas: +r.horas || 1 });
      }
      if (t === 'box') {
        if (!r.nome) { torrar('Nome do box é obrigatório'); break; }
        S.boxes.push({ id: uid('b'), nome: r.nome, tipo: r.tipo || 'Geral' });
      }
      salvar(); S.ui.rascCad = null; fecharFolha(); render(); torrar('Cadastro realizado com sucesso!'); break;
    }

    /* --- Relatórios & Backup --- */
    case 'mudar-periodo-rel': setPeriodoRelatorio(b.dataset.p); break;
    case 'imprimir-relatorio-executivo': imprimirRelatorioExecutivo(); break;
    case 'exportar-relatorio-html': exportarRelatorioHTML(); break;
    case 'compartilhar-whatsapp-relatorio': compartilharResumoWhatsApp(); break;
    case 'exportar-csv': exportarCSV(b.dataset.tipo); break;
    case 'exportar-backup-json': exportarBackupJSON(); break;
    case 'imprimir-fechamento-caixa': imprimirFechamentoCaixa(); break;

    /* --- Config & Reset --- */
    case 'salvar-cfg': salvar(); torrar('Configurações salvas!'); break;
    case 'zerar': pedirConfirmacao('zerar', 'Toque de novo para restaurar a demonstração inicial', () => { S = sementes(); salvar(); render(); torrar('Dados de demonstração restaurados!'); }); break;
  }
});

/* ---------------- Inputs Reativos ---------------- */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, c = el.dataset.c, v = el.value, o = OSatual();
  const guarda = (obj) => { obj[c] = v; };

  if (a === 'busca-placa-patio') { S.ui.buscaPlaca = v; render(); return; }
  if (a === 'busca-estoque') { S.ui.buscaEstoque = v; render(); return; }
  if (a === 'busca-picker') { S.ui.busca = v; renderFolha(); return; }

  if (a === 'rasc') { guarda(S.ui.rascunho = S.ui.rascunho || {}); if (c === 'vei' && v === 'novo') { abrirFolha(() => folhaNovoVeiculo(S.ui.rascunho.cli)); } }
  if (a === 'rasc-vei') guarda(S.ui.rascVeiculo = S.ui.rascVeiculo || {});
  if (a === 'rasc-fat') guarda(S.ui.rascFaturar = S.ui.rascFaturar || {});
  if (a === 'rp') guarda(S.ui.rascPeca = S.ui.rascPeca || {});
  if (a === 'rc') guarda(S.ui.rascCad = S.ui.rascCad || {});
  if (a === 'rct') guarda(S.ui.rascConta = S.ui.rascConta || {});
  if (a === 'rmv') guarda(S.ui.rascMov = S.ui.rascMov || {});
  if (a === 'cfg') { S.cfg[c] = c === 'saldoInicial' ? (+v || 0) : v; salvar(); }
  if (a === 'cfg-apibrasil') { (S.cfg.apibrasil = S.cfg.apibrasil || {})[c] = v; salvar(); }
  if (a === 'camp') { (S.ui.camp = S.ui.camp || {})[c] = v; salvar(); }
  if (a === 'api-cfg') { S.zap.api = S.zap.api || {}; S.zap.api[c] = v; salvar(); }
  if (a === 'regra') { const r = S.zap.regua.find(x => x.id === el.dataset.i); if (r) r[c] = c === 'quando' ? (+v || 0) : v; salvar(); }
  if (a === 'campo-peca') { const p = P(S.ui.pecaAberta); p[c] = ['min', 'custo', 'venda', 'qtd'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'campo-os' && o) { o[c] = ['km', 'desc'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'val-item' && o) { const i = o[el.dataset.t].find(x => x.id === el.dataset.i); if (i) i.valor = +v || 0; salvar(); }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, o = OSatual();

  if (a === 'mudar-status-os' && o) { o.st = el.value; salvar(); renderFolha(); render(); torrar(`OS ${o.num}: ${ST[o.st].r}`); }
  if (a === 'campo-os' && o) { renderFolha(); render(); }
  if (a === 'val-item' && o) { renderFolha(); render(); }
  if (a === 'campo-peca') { renderFolha(); render(); }
  if (a === 'camp-modelo') {
    const m = S.zap.modelos[+el.value];
    if (m) { S.ui.camp = S.ui.camp || {}; S.ui.camp.texto = m.texto; S.ui.camp.nome = m.nome; render(); }
  }
  if (a === 'arquivo-xml') { lerArquivosXML(el.files); }
  if (a === 'restaurar-backup-json') { if (el.files && el.files[0]) restaurarBackupJSON(el.files[0]); }
});

function lerArquivosXML(files) {
  if (!files || !files.length) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      S.ui.nota = lerXML(fr.result);
      renderFolha();
    } catch (err) {
      torrar('Erro ao interpretar arquivo XML de NF-e.');
    }
  };
  fr.readAsText(files[0], 'UTF-8');
}

document.getElementById('vidro')?.addEventListener('click', fecharFolha);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && folhaAtual) fecharFolha(); });

/* =====================================================================
   INICIALIZAÇÃO DO SISTEMA (BOOT)
===================================================================== */
(async function boot() {
  const salvo = await armazem.ler();
  const precisaAtualizar = !salvo || !salvo.os || !salvo.v_agosto;
  S = precisaAtualizar ? sementes() : salvo;
  if (precisaAtualizar) {
    await armazem.gravar(S);
  }

  S.ui = Object.assign({
    view: 'patio',
    filtro: 'todos',
    abaFin: 'dashboard',
    abaOS: 'servicos',
    abaCad: 'clientes',
    abaZap: 'cobranca',
    busca: '',
    buscaPlaca: ''
  }, S.ui || {});

  S.extrato = S.extrato || [];
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.compras = S.compras || [];
  if (!S.zap || !S.zap.regua) S.zap = zapPadrao();

  render();
})();
