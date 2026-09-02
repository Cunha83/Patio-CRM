/* =====================================================================
   PÁTIO CRM — MÓDULO DE PÁTIO, BOXES & ORDENS DE SERVIÇO (OS)
===================================================================== */

function viewPatio() {
  const osLista = S.os || [];
  const filtro = S.ui.filtro || 'todos';
  const buscaPlaca = (S.ui.buscaPlaca || '').trim().toUpperCase();

  // Filtragem
  let filtradas = osLista;
  if (filtro !== 'todos') {
    filtradas = filtradas.filter(o => o.st === filtro);
  }
  if (buscaPlaca) {
    filtradas = filtradas.filter(o => {
      const v = V(o.vei), c = C(o.cli);
      return v.placa.includes(buscaPlaca) || v.modelo.toUpperCase().includes(buscaPlaca) || c.nome.toUpperCase().includes(buscaPlaca);
    });
  }

  // Contagens por status para os chips
  const contagens = {
    todos: osLista.length,
    fila: osLista.filter(o => o.st === 'fila').length,
    aprovacao: osLista.filter(o => o.st === 'aprovacao').length,
    executando: osLista.filter(o => o.st === 'executando').length,
    peca: osLista.filter(o => o.st === 'peca').length,
    finalizada: osLista.filter(o => o.st === 'finalizada').length
  };

  const chips = [
    ['todos', 'Todos os Boxes', contagens.todos],
    ['executando', 'Em Execução', contagens.executando],
    ['peca', 'Parado por Peça', contagens.peca],
    ['aprovacao', 'Aguardando Aprovação', contagens.aprovacao],
    ['fila', 'Na Fila', contagens.fila],
    ['finalizada', 'Finalizadas', contagens.finalizada]
  ];

  // Grade de Boxes do Pátio
  const cardsHtml = S.boxes.map(box => {
    // Procura OS ativa no box
    const osDoBox = filtradas.find(o => o.box === box.id && o.st !== 'finalizada');
    if (osDoBox) return cardOS(osDoBox, box);
    // Se o filtro estiver em finalizada ou não for 'todos', e não houver OS correspondente
    if (filtro === 'finalizada') {
      const fin = filtradas.find(o => o.box === box.id && o.st === 'finalizada');
      return fin ? cardOS(fin, box) : '';
    }
    return filtro === 'todos' ? cardLivre(box) : '';
  }).filter(Boolean).join('');

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('patio', 14)} Em Atendimento</div>
      <div class="v">${contagens.executando}</div>
      <div class="d">${contagens.executando} veículos nos boxes</div>
    </div>
    <div class="kpi ${contagens.peca ? 'aviso' : 'neutro'}">
      <div class="r">${ico('pecas', 14)} Parados p/ Peça</div>
      <div class="v">${contagens.peca}</div>
      <div class="d">Aguardando almoxarifado/fornecedor</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('doc', 14)} Aguardando Aprovação</div>
      <div class="v">${contagens.aprovacao}</div>
      <div class="d">Orçamentos enviados</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Finalizadas no Mês</div>
      <div class="v">${contagens.finalizada}</div>
      <div class="d">Veículos liberados</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div class="trilho" style="padding:0;margin:0">
      ${chips.map(([k, label, total]) => `
        <button class="chip" data-act="filtro" data-f="${k}" aria-pressed="${filtro === k}">
          ${label} <span class="n">${total}</span>
        </button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="campo-busca" style="position:relative">
        <input type="text" class="campo-texto" placeholder="Buscar placa, cliente ou modelo..." data-act="busca-placa-patio" value="${esc(S.ui.buscaPlaca || '')}" style="width:230px;padding-left:30px;height:34px;font-size:13px;border-radius:20px;background:var(--branco);border:1px solid var(--aco-150)">
        <span style="position:absolute;left:10px;top:8px;color:var(--aco-400);pointer-events:none">${ico('busca', 14)}</span>
      </div>
      <button class="btn btn-primario" data-act="nova-os" style="height:34px;font-size:13px;padding:0 14px;border-radius:20px">
        ${ico('mais', 14)} Nova OS
      </button>
    </div>
  </div>

  <div class="patio">
    ${cardsHtml || '<div class="card card-p vazia" style="grid-column:1/-1;text-align:center;padding:40px"><b>Nenhum veículo encontrado</b>Nenhuma Ordem de Serviço com os critérios selecionados.</div>'}
  </div>`;
}

function cardOS(o, b) {
  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const stInfo = ST[o.st] || ST.fila;
  const qtdItens = (o.servicos ? o.servicos.length : 0) + (o.pecas ? o.pecas.length : 0);

  return `
  <div class="box card" data-act="abrir-os" data-id="${o.id}" data-st="${o.st}">
    <div class="box-topo">
      <div class="tag-box">
        ${esc(b ? b.nome.split('—')[0].trim() : 'PÁTIO')}
        <small>${esc(b ? (b.tipo || 'Geral') : 'Livre')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="placa">${esc(v.placa)}</span>
          <span class="selo" data-st="${o.st}">${stInfo.r}</span>
        </div>
        <div class="modelo">${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</div>
        <div class="cliente" title="${esc(c.nome)}">${esc(c.fantasia || c.nome)}</div>
      </div>
    </div>

    ${o.queixa ? `<div class="mini" style="margin-top:10px;color:var(--aco-600);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"><b>Queixa:</b> ${esc(o.queixa)}</div>` : ''}

    <div class="box-rodape">
      <span class="mini" style="display:flex;align-items:center;gap:4px">
        ${ico('relogio', 12)} OS ${o.num} · ${qtdItens} itens
      </span>
      <div class="val">${brl(total)}</div>
    </div>
  </div>`;
}

function cardLivre(b) {
  return `
  <div class="box card" data-st="livre" style="border:2px dashed var(--aco-200);background:rgba(255,255,255,0.6)">
    <div class="box-topo">
      <div class="tag-box" style="background:var(--aco-400)">
        ${esc(b.nome.split('—')[0].trim())}
        <small>${esc(b.tipo || 'Geral')}</small>
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;color:var(--aco-500);font-size:14px;margin-top:2px">Box Disponível</div>
        <div class="mini" style="color:var(--aco-400)">Pronto para receber caminhão</div>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      <button class="btn btn-secundario" data-act="nova-os" data-box="${b.id}" style="font-size:12px;padding:6px 12px;border-radius:14px">
        ${ico('mais', 12)} Ocupar Box
      </button>
    </div>
  </div>`;
}

/* =====================================================================
   MODAL / FOLHA DE ORDEM DE SERVIÇO DETALHADA
===================================================================== */
function OSatual() {
  return (S.os || []).find(o => o.id === S.ui.osAberta);
}

function folhaOS() {
  const o = OSatual();
  if (!o) return '<div class="card card-p">Ordem de Serviço não encontrada.</div>';

  const v = V(o.vei), c = C(o.cli), b = B(o.box);
  const total = totOS(o);
  const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
  const aba = S.ui.abaOS || 'servicos';

  const cabecalho = `
  <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:14px">
    <div>
      <div style="display:flex;align-items:center;gap:8px">
        <h2 style="font-size:18px;font-weight:700">OS ${o.num} — <span class="placa">${esc(v.placa)}</span></h2>
        <span class="selo" data-st="${o.st}">${ST[o.st].r}</span>
      </div>
      <div class="mini" style="margin-top:4px">
        ${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)} · Cliente: <b>${esc(c.nome)}</b> · ${esc(b.nome)}
      </div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-secundario" data-act="imprimir-os" title="Imprimir Ordem de Serviço">${ico('imprimir', 14)} Imprimir</button>
      <button class="btn btn-secundario" data-act="copiar-orc" title="Copiar orçamento para WhatsApp">${ico('copiar', 14)} WhatsApp</button>
      <button class="btn btn-perigo" data-act="excluir-os" title="Excluir OS">${ico('lixo', 14)}</button>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>
  </div>`;

  const tabs = [
    ['servicos', 'Serviços & Mão de Obra (' + (o.servicos ? o.servicos.length : 0) + ')'],
    ['pecas', 'Peças Aplicadas (' + (o.pecas ? o.pecas.length : 0) + ')'],
    ['ficha', 'Ficha & Diagnóstico'],
    ['historico', 'Histórico do Veículo']
  ];

  const abasHtml = `
  <div class="abas" style="margin-bottom:14px">
    ${tabs.map(([k, label]) => `
      <button data-act="aba-os" data-k="${k}" aria-selected="${aba === k}">${label}</button>
    `).join('')}
  </div>`;

  let conteudoAba = '';
  if (aba === 'servicos') conteudoAba = abaItens(o, 'servicos');
  else if (aba === 'pecas') conteudoAba = abaItens(o, 'pecas');
  else if (aba === 'ficha') conteudoAba = abaFicha(o, v, c, b);
  else conteudoAba = abaHistoricoVeiculo(v);

  // Barra Inferior de Ações e Totais
  const rodapeHtml = `
  <div class="os-rodape-fixo" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--aco-150);background:var(--branco);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:12px;align-items:center">
      <div>
        <div class="mini">Mão de Obra: <b>${brl(totServ)}</b> · Peças: <b>${brl(totPec)}</b></div>
        <div style="font-size:18px;font-weight:700;color:var(--aco-900)">Total: ${brl(total)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label class="mini" style="font-weight:600">Desconto (R$):</label>
        <input type="number" class="campo-texto" style="width:90px;height:30px;font-size:13px" value="${o.desc || 0}" data-act="campo-os" data-c="desc" min="0" step="10">
      </div>
    </div>

    <div style="display:flex;gap:8px;align-items:center">
      <select class="campo-select" data-act="mudar-status-os" style="height:34px;font-size:13px;border-radius:8px;font-weight:600">
        <option value="fila" ${o.st === 'fila' ? 'selected' : ''}>Na Fila</option>
        <option value="executando" ${o.st === 'executando' ? 'selected' : ''}>Em Execução</option>
        <option value="peca" ${o.st === 'peca' ? 'selected' : ''}>Parado p/ Peça</option>
        <option value="aprovacao" ${o.st === 'aprovacao' ? 'selected' : ''}>Aguardando Aprovação</option>
        <option value="finalizada" ${o.st === 'finalizada' ? 'selected' : ''}>Finalizada</option>
      </select>

      ${o.st !== 'finalizada' ? `
        <button class="btn btn-sucesso" data-act="faturar-os-modal" style="height:34px;padding:0 16px;font-weight:600">
          ${ico('check', 14)} Faturar & Entregar
        </button>
      ` : `
        <span class="selo selo-finalizada" style="font-size:13px;padding:6px 12px">OS Faturada / Finalizada</span>
      `}
    </div>
  </div>`;

  return `<div class="folha-os-container">${cabecalho}${abasHtml}${conteudoAba}${rodapeHtml}</div>`;
}

function abaItens(o, tipo) {
  const itens = o[tipo] || [];
  const isPeca = tipo === 'pecas';

  return `
  <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:13px;font-weight:600;color:var(--aco-600)">
      ${isPeca ? 'Peças e Insumos Utilizados' : 'Serviços e Mão de Obra Lançada'}
    </div>
    <button class="btn btn-secundario" data-act="picker" data-p="${tipo}" style="font-size:12.5px;padding:5px 12px">
      ${ico('mais', 13)} Adicionar ${isPeca ? 'Peça do Almoxarifado' : 'Serviço da Tabela'}
    </button>
  </div>

  ${S.ui.picker === tipo ? painelPicker(o, tipo) : ''}

  <div class="tabela-responsiva">
    <table class="tabela">
      <thead>
        <tr>
          <th>Descrição</th>
          <th style="width:90px;text-align:center">Qtd</th>
          <th style="width:120px;text-align:right">Valor Unit.</th>
          <th style="width:120px;text-align:right">Subtotal</th>
          <th style="width:50px"></th>
        </tr>
      </thead>
      <tbody>
        ${itens.length ? itens.map(item => `
          <tr>
            <td>
              <div style="font-weight:600;color:var(--aco-900)">${esc(item.nome)}</div>
              ${item.cod ? `<div class="mini">Cód: ${esc(item.cod)}</div>` : ''}
            </td>
            <td style="text-align:center">
              <div style="display:inline-flex;align-items:center;gap:4px">
                <button class="btn-micro" data-act="qtd" data-t="${tipo}" data-i="${item.id}" data-d="-1">−</button>
                <span class="num" style="min-width:24px;display:inline-block">${item.qtd}</span>
                <button class="btn-micro" data-act="qtd" data-t="${tipo}" data-i="${item.id}" data-d="1">+</button>
              </div>
            </td>
            <td style="text-align:right">
              <input type="number" class="campo-texto" style="width:95px;text-align:right;height:28px;font-size:13px" value="${item.valor}" data-act="val-item" data-t="${tipo}" data-i="${item.id}" step="0.50">
            </td>
            <td style="text-align:right;font-weight:600" class="num">
              ${brl(item.qtd * item.valor)}
            </td>
            <td style="text-align:center">
              <button class="btn-icone-perigo" data-act="rm-item" data-t="${tipo}" data-i="${item.id}" title="Remover item">${ico('lixo', 14)}</button>
            </td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="5" style="text-align:center;color:var(--aco-400);padding:24px">
              Nenhum ${isPeca ? 'peça lançada' : 'serviço lançado'} nesta OS.
            </td>
          </tr>
        `}
      </tbody>
    </table>
  </div>`;
}

function painelPicker(o, tipo) {
  const isPeca = tipo === 'pecas';
  const catalogo = isPeca ? S.pecas : S.servicos;
  const busca = (S.ui.busca || '').toLowerCase().trim();

  const filtrados = catalogo.filter(item => {
    return (item.nome || '').toLowerCase().includes(busca) ||
           (item.cod && item.cod.toLowerCase().includes(busca)) ||
           (item.forn && item.forn.toLowerCase().includes(busca));
  });

  return `
  <div class="card card-p" style="margin-bottom:14px;background:var(--aco-100);border:1px solid var(--aco-200)">
    <div class="entre" style="margin-bottom:10px">
      <div style="font-weight:600;font-size:13px">${isPeca ? 'Selecionar Peça do Almoxarifado' : 'Selecionar Serviço'}</div>
      <button class="btn-fechar" data-act="fechar-picker">${ico('x', 14)}</button>
    </div>
    <div style="margin-bottom:10px">
      <input type="text" class="campo-texto" placeholder="Digitar para buscar..." data-act="busca-picker" value="${esc(S.ui.busca || '')}" autofocus style="height:32px;font-size:13px;width:100%">
    </div>
    <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${filtrados.map(item => `
        <div class="entre item-picker" style="padding:6px 10px;background:var(--branco);border-radius:6px;font-size:13px">
          <div>
            <div style="font-weight:600">${esc(item.nome)}</div>
            <div class="mini">${isPeca ? `Cód: ${esc(item.cod)} · Estoque: <b>${item.qtd} ${item.un}</b> · ${esc(item.loc || '—')}` : `Tempo est.: ${item.horas}h`}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="num" style="font-weight:600">${brl(isPeca ? item.venda : item.valor)}</span>
            <button class="btn btn-primario" data-act="add-item" data-t="${tipo}" data-r="${item.id}" style="padding:3px 10px;font-size:12px">
              ${ico('mais', 12)} Inserir
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function abaFicha(o, v, c, b) {
  return `
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
    <div class="card card-p">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--aco-600)">Dados do Veículo & Cliente</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div><b>Placa:</b> <span class="placa">${esc(v.placa)}</span></div>
        <div><b>Modelo/Marca:</b> ${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)} (${esc(v.ano || '—')})</div>
        <div><b>Cliente:</b> ${esc(c.nome)}</div>
        <div><b>Telefone:</b> ${esc(c.fone || '—')}</div>
        <div><b>Mecânico Responsável:</b> ${esc(o.mec || 'Não atribuído')}</div>
        <div><b>Box Designado:</b> ${esc(b.nome)}</div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--aco-600)">Prazos & Quilometragem</div>
      <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
        <div>
          <label class="mini" style="font-weight:600;display:block">KM Atual do Veículo:</label>
          <input type="number" class="campo-texto" value="${o.km || 0}" data-act="campo-os" data-c="km" style="width:100%;height:32px">
        </div>
        <div>
          <label class="mini" style="font-weight:600;display:block">Previsão de Conclusão / Entrega:</label>
          <input type="date" class="campo-texto" value="${o.prev || hoje()}" data-act="campo-os" data-c="prev" style="width:100%;height:32px">
        </div>
      </div>
    </div>
  </div>

  <div class="card card-p" style="margin-top:14px">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--aco-600)">Queixa do Motorista / Diagnóstico de Entrada</div>
    <textarea class="campo-texto" data-act="campo-os" data-c="queixa" rows="2" style="width:100%;resize:vertical">${esc(o.queixa || '')}</textarea>

    <div style="font-weight:600;font-size:13px;margin-top:12px;margin-bottom:8px;color:var(--aco-600)">Observações Técnicas / Laudo</div>
    <textarea class="campo-texto" data-act="campo-os" data-c="obs" rows="2" style="width:100%;resize:vertical">${esc(o.obs || '')}</textarea>
  </div>`;
}

function abaHistoricoVeiculo(v) {
  const osPassadas = (S.os || []).filter(o => o.vei === v.id);

  return `
  <div class="card card-p">
    <div class="entre" style="margin-bottom:12px">
      <div>
        <div style="font-weight:700;font-size:15px">Histórico de Manutenções — Placa ${esc(v.placa)}</div>
        <div class="mini">Total de ${osPassadas.length} passagens registradas na oficina</div>
      </div>
    </div>

    <div class="timeline" style="display:flex;flex-direction:column;gap:12px">
      ${osPassadas.map(pass => `
        <div class="item-timeline" style="border-left:3px solid var(--petroleo);padding-left:12px;position:relative">
          <div class="entre">
            <span style="font-weight:600;font-size:13.5px">OS ${pass.num} · ${dataBRfull(pass.abertura)}</span>
            <span class="selo" data-st="${pass.st}">${ST[pass.st].r}</span>
          </div>
          <div class="mini" style="margin-top:2px">KM: <b>${(pass.km || 0).toLocaleString('pt-BR')} km</b> · Mecânico: ${esc(pass.mec || '—')}</div>
          ${pass.queixa ? `<div style="font-size:12.5px;color:var(--aco-700);margin-top:4px"><b>Queixa:</b> ${esc(pass.queixa)}</div>` : ''}
          <div class="mini" style="margin-top:4px;color:var(--aco-500)">
            Serviços: ${(pass.servicos || []).map(s => s.nome).join(', ') || 'Nenhum'} | 
            Peças: ${(pass.pecas || []).map(p => p.nome).join(', ') || 'Nenhuma'}
          </div>
          <div class="num" style="font-weight:700;font-size:13px;margin-top:4px;color:var(--aco-900)">
            Valor Total: ${brl(totOS(pass))}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

/* =====================================================================
   MODAL DE FATURAMENTO / CHECKOUT DA OS COM BAIXA DE ESTOQUE
===================================================================== */
function folhaFaturarOS() {
  const o = OSatual();
  if (!o) return '<div class="card card-p">Nenhuma OS selecionada.</div>';

  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const rasc = S.ui.rascFaturar = S.ui.rascFaturar || {
    forma: 'pix',
    parcelas: 1,
    vencimento: hoje(),
    baixarEstoque: true,
    emitirRecibo: true
  };

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Faturar e Entregar OS ${o.num}</h3>
        <div class="mini">Veículo: <span class="placa">${esc(v.placa)}</span> · Cliente: ${esc(c.nome)}</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div class="kpi bom" style="text-align:center;padding:14px;margin-bottom:14px">
      <div class="r" style="justify-content:center">Valor a Faturar</div>
      <div class="v" style="font-size:30px">${brl(total)}</div>
      <div class="d">${o.servicos.length} serviços · ${o.pecas.length} peças aplicadas</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Condição de Pagamento:</label>
        <select class="campo-select" data-act="rasc-fat" data-c="forma" style="width:100%;height:36px;font-weight:600">
          <option value="pix" ${rasc.forma === 'pix' ? 'selected' : ''}>À Vista — PIX Instantâneo</option>
          <option value="dinheiro" ${rasc.forma === 'dinheiro' ? 'selected' : ''}>À Vista — Dinheiro em Espécie</option>
          <option value="cartao_debito" ${rasc.forma === 'cartao_debito' ? 'selected' : ''}>Cartão de Débito</option>
          <option value="cartao_credito" ${rasc.forma === 'cartao_credito' ? 'selected' : ''}>Cartão de Crédito</option>
          <option value="boleto_28d" ${rasc.forma === 'boleto_28d' ? 'selected' : ''}>Faturado — Boleto 28 Dias</option>
          <option value="boleto_15_30_45" ${rasc.forma === 'boleto_15_30_45' ? 'selected' : ''}>Faturado — 3 Parcelas (15/30/45 dias)</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">1º Vencimento:</label>
          <input type="date" class="campo-texto" value="${rasc.vencimento || hoje()}" data-act="rasc-fat" data-c="vencimento" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Nº de Parcelas:</label>
          <input type="number" class="campo-texto" value="${rasc.parcelas || 1}" data-act="rasc-fat" data-c="parcelas" min="1" max="12" style="width:100%;height:34px">
        </div>
      </div>

      <div style="background:var(--aco-050);border:1px solid var(--aco-150);border-radius:8px;padding:10px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer">
          <input type="checkbox" checked disabled>
          Baixar automaticamente as peças utilizadas do almoxarifado
        </label>
        <div class="mini" style="margin-left:24px;margin-top:2px">Atualiza o saldo físico no módulo de estoque.</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-sucesso" data-act="confirmar-faturamento" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Concluir Faturamento
      </button>
    </div>
  </div>`;
}

function processarFaturamentoOS(o) {
  const rasc = S.ui.rascFaturar || {};
  const v = V(o.vei), c = C(o.cli);
  const total = totOS(o);
  const forma = rasc.forma || 'pix';
  const parcelas = Number(rasc.parcelas) || 1;
  const valorParc = total / parcelas;

  // 1. Baixar peças do estoque
  if (o.pecas && o.pecas.length) {
    o.pecas.forEach(item => {
      const pecaEstoque = S.pecas.find(p => p.id === item.id || p.nome === item.nome);
      if (pecaEstoque) {
        pecaEstoque.qtd = Math.max(0, (pecaEstoque.qtd || 0) - (Number(item.qtd) || 1));
      }
    });
  }

  // 2. Gerar Lançamento Financeiro (Recebimento Imediato ou Contas a Receber)
  const isImediato = ['pix', 'dinheiro', 'cartao_debito'].includes(forma);

  if (isImediato) {
    // Entrada direta no caixa
    S.movimentos.push({
      id: uid('mv'),
      data: hoje(),
      tipo: 'entrada',
      desc: `Recebimento OS ${o.num} (${esc(v.placa)}) — ${esc(c.nome)}`,
      valor: total,
      cat: 'Serviços & Peças',
      conc: true,
      forma: forma.toUpperCase()
    });
    o.pago = true;
  } else {
    // Títulos a receber parcelados
    for (let p = 1; p <= parcelas; p++) {
      const diasVenc = forma === 'boleto_15_30_45' ? p * 15 : (forma === 'boleto_28d' ? 28 : (p - 1) * 30);
      const dataVenc = addDias(rasc.vencimento || hoje(), diasVenc);
      S.contas.push({
        id: uid('ct'),
        tipo: 'receber',
        desc: `OS ${o.num} (Parc. ${p}/${parcelas}) — ${esc(v.placa)}`,
        parte: c.nome,
        valor: valorParc,
        venc: dataVenc,
        pago: false,
        cat: 'Serviços & Peças',
        doc: `NF-${o.num}/${p}`,
        osId: o.id
      });
    }
  }

  // 3. Atualizar status da OS
  o.st = 'finalizada';
  o.formaPgto = forma;
  salvar();
}

/* =====================================================================
   IMPRESSÃO PROFISSIONAL DE OS / ORÇAMENTO
===================================================================== */
function imprimirOS(o) {
  if (!o) o = OSatual();
  if (!o) return;

  const v = V(o.vei), c = C(o.cli);
  const cfg = S.cfg;
  const total = totOS(o);
  const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
  const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));

  const janela = window.open('', '_blank');
  if (!janela) {
    torrar('Por favor, permita popups para imprimir o comprovante.');
    return;
  }

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>OS ${o.num} — ${cfg.empresa}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.4; }
      .topo { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
      .empresa { font-size: 20px; font-weight: bold; color: #0f172a; }
      .num-os { font-size: 22px; font-weight: bold; color: #2563eb; text-align: right; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 12px; border-bottom: 1px solid #cbd5e1; }
      td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
      .totais { margin-left: auto; width: 300px; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; margin-bottom: 20px; }
      .tot-linha { display: flex; justify-content: space-between; margin-bottom: 4px; }
      .tot-final { font-size: 16px; font-weight: bold; border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 6px; }
      .assinaturas { display: flex; justify-content: space-between; margin-top: 40px; }
      .campo-ass { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 6px; font-size: 12px; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="topo">
      <div>
        <div class="empresa">${esc(cfg.empresa)}</div>
        <div>CNPJ: ${esc(cfg.cnpj)} · Tel: ${esc(cfg.fone)}</div>
        <div>${esc(cfg.endereco)}</div>
      </div>
      <div>
        <div class="num-os">ORDEM DE SERVIÇO Nº ${o.num}</div>
        <div>Emissão: ${dataBRfull(o.abertura)} ${horaBR()}</div>
        <div>Previsão: ${dataBRfull(o.prev)}</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <div><b>CLIENTE:</b> ${esc(c.nome)}</div>
        <div><b>CNPJ/CPF:</b> ${esc(c.doc || '—')}</div>
        <div><b>CONTATO / FONE:</b> ${esc(c.contato || '—')} (${esc(c.fone || '—')})</div>
      </div>
      <div>
        <div><b>VEÍCULO:</b> ${esc(v.marca || '')} ${esc(v.modelo || '')}</div>
        <div><b>PLACA:</b> <span style="font-family:monospace;font-weight:bold;font-size:14px">${esc(v.placa)}</span></div>
        <div><b>KM REGISTRADO:</b> ${(o.km || 0).toLocaleString('pt-BR')} km</div>
      </div>
    </div>

    ${o.queixa ? `<div style="margin-bottom:14px;background:#fff;padding:8px;border-left:3px solid #f59e0b"><b>Diagnóstico / Queixa do Cliente:</b> ${esc(o.queixa)}</div>` : ''}

    <div style="font-weight:bold;margin-bottom:6px">1. SERVIÇOS EXECUTADOS / MÃO DE OBRA</div>
    <table>
      <thead>
        <tr><th>Descrição do Serviço</th><th style="width:60px;text-align:center">Qtd</th><th style="width:100px;text-align:right">Valor Unit.</th><th style="width:100px;text-align:right">Subtotal</th></tr>
      </thead>
      <tbody>
        ${(o.servicos || []).map(s => `<tr><td>${esc(s.nome)}</td><td style="text-align:center">${s.qtd}</td><td style="text-align:right">${brl(s.valor)}</td><td style="text-align:right">${brl(s.qtd * s.valor)}</td></tr>`).join('')}
      </tbody>
    </table>

    <div style="font-weight:bold;margin-bottom:6px">2. PEÇAS E MATERIAIS APLICADOS</div>
    <table>
      <thead>
        <tr><th>Descrição da Peça / Código</th><th style="width:60px;text-align:center">Qtd</th><th style="width:100px;text-align:right">Valor Unit.</th><th style="width:100px;text-align:right">Subtotal</th></tr>
      </thead>
      <tbody>
        ${(o.pecas || []).map(p => `<tr><td>${esc(p.nome)}</td><td style="text-align:center">${p.qtd}</td><td style="text-align:right">${brl(p.valor)}</td><td style="text-align:right">${brl(p.qtd * p.valor)}</td></tr>`).join('')}
      </tbody>
    </table>

    <div class="totais">
      <div class="tot-linha"><span>Total de Serviços:</span><span>${brl(totServ)}</span></div>
      <div class="tot-linha"><span>Total de Peças:</span><span>${brl(totPec)}</span></div>
      ${o.desc ? `<div class="tot-linha" style="color:#ef4444"><span>Desconto Concedido:</span><span>−${brl(o.desc)}</span></div>` : ''}
      <div class="tot-linha tot-final"><span>TOTAL GERAL:</span><span>${brl(total)}</span></div>
    </div>

    <div style="font-size:11px;color:#64748b;margin-bottom:30px">
      <b>Termo de Garantia:</b> ${esc(cfg.termoGarantia || 'Garantia legal de 90 dias conforme CDC.')}
    </div>

    <div class="assinaturas">
      <div class="campo-ass">${esc(cfg.empresa)}<br><small>Responsável Técnico</small></div>
      <div class="campo-ass">${esc(c.nome)}<br><small>Assinatura do Cliente / Motorista</small></div>
    </div>

    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}

function novaOSFolha(boxId) {
  const rasc = S.ui.rascunho = S.ui.rascunho || { box: boxId || (S.boxes[0] ? S.boxes[0].id : 'b1') };
  const veiculos = S.veiculos || [];
  const clientes = S.clientes || [];

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Abertura de Ordem de Serviço</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Selecione o Veículo / Placa:</label>
        <select class="campo-select" data-act="rasc" data-c="vei" style="width:100%;height:36px;font-weight:600">
          <option value="">-- Escolha pela placa --</option>
          ${veiculos.map(v => {
            const cl = C(v.cli);
            return `<option value="${v.id}" ${rasc.vei === v.id ? 'selected' : ''}>${esc(v.placa)} — ${esc(v.modelo)} (${esc(cl.nome)})</option>`;
          }).join('')}
          <option value="novo">+ Cadastrar Novo Caminhão / Placa...</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Box de Destino:</label>
          <select class="campo-select" data-act="rasc" data-c="box" style="width:100%;height:34px">
            ${S.boxes.map(b => `<option value="${b.id}" ${rasc.box === b.id ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">KM Atual do Painel:</label>
          <input type="number" class="campo-texto" placeholder="Ex: 350000" data-act="rasc" data-c="km" value="${rasc.km || ''}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Mecânico Responsável:</label>
          <input type="text" class="campo-texto" placeholder="Nome do mecânico" data-act="rasc" data-c="mec" value="${esc(rasc.mec || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Previsão de Entrega:</label>
          <input type="date" class="campo-texto" data-act="rasc" data-c="prev" value="${rasc.prev || addDias(hoje(), 1)}" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Queixa do Motorista / Problema Relatado:</label>
        <textarea class="campo-texto" placeholder="Ex: Falha na aceleração, vazamento de ar na cuíca traseira..." data-act="rasc" data-c="queixa" rows="3" style="width:100%">${esc(rasc.queixa || '')}</textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="criar-os" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Abrir Ordem de Serviço
      </button>
    </div>
  </div>`;
}

function folhaNovoVeiculo(cliId) {
  const r = S.ui.rascVeiculo = S.ui.rascVeiculo || { cli: cliId || (S.clientes[0] ? S.clientes[0].id : '') };

  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:16px;font-weight:700">Cadastrar Novo Veículo</h3>
      <button class="btn-fechar" data-act="voltar-os">${ico('voltar', 16)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Proprietário / Cliente:</label>
        <select class="campo-select" data-act="rasc-vei" data-c="cli" style="width:100%;height:34px">
          ${S.clientes.map(c => `<option value="${c.id}" ${r.cli === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Placa do Veículo:</label>
        <div style="display:flex;gap:6px">
          <input type="text" class="campo-texto" placeholder="ABC1D23" data-act="rasc-vei" data-c="placa" value="${esc(r.placa || '')}" style="font-family:var(--mono);text-transform:uppercase;height:34px;flex:1">
          <button class="btn btn-secundario" data-act="buscar-placa-veiculo" title="Consultar dados via APIBrasil">${ico('busca', 14)} Consultar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Marca / Montadora:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Scania" data-act="rasc-vei" data-c="marca" value="${esc(r.marca || '')}" style="height:34px;width:100%">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Modelo:</label>
          <input type="text" class="campo-texto" placeholder="Ex: R 450 6x2" data-act="rasc-vei" data-c="modelo" value="${esc(r.modelo || '')}" style="height:34px;width:100%">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Ano de Fabricação:</label>
          <input type="text" class="campo-texto" placeholder="2021" data-act="rasc-vei" data-c="ano" value="${esc(r.ano || '')}" style="height:34px;width:100%">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Cor Predominante:</label>
          <input type="text" class="campo-texto" placeholder="Branco" data-act="rasc-vei" data-c="cor" value="${esc(r.cor || '')}" style="height:34px;width:100%">
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="voltar-os">Voltar</button>
      <button class="btn btn-primario" data-act="salvar-veiculo">Salvar e Prosseguir</button>
    </div>
  </div>`;
}
