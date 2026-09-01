/* =====================================================================
   PÁTIO CRM — MÓDULO DE ESTOQUE, ALMOXARIFADO & ENTRADA DE NOTAS
===================================================================== */

function viewEstoque() {
  const pecas = S.pecas || [];
  const filtro = S.ui.filtroEstoque || 'todos';
  const busca = (S.ui.buscaEstoque || '').toLowerCase().trim();

  // Cálculos de KPIs de Estoque
  const totalItensFisicos = soma(pecas, p => p.qtd);
  const valorTotalCusto = soma(pecas, p => (p.qtd || 0) * (p.custo || 0));
  const valorTotalVenda = soma(pecas, p => (p.qtd || 0) * (p.venda || 0));
  const pecasCriticas = pecas.filter(p => (p.qtd || 0) <= (p.min || 1));

  // Filtragem
  let filtradas = pecas;
  if (filtro === 'critico') {
    filtradas = pecasCriticas;
  }
  if (busca) {
    filtradas = filtradas.filter(p => {
      return (p.nome || '').toLowerCase().includes(busca) ||
             (p.cod || '').toLowerCase().includes(busca) ||
             (p.forn || '').toLowerCase().includes(busca) ||
             (p.loc || '').toLowerCase().includes(busca);
    });
  }

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('pecas', 14)} Variedade de Peças</div>
      <div class="v">${pecas.length}</div>
      <div class="d">${totalItensFisicos} unidades em almoxarifado</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('caixa', 14)} Capital Imobilizado (Custo)</div>
      <div class="v">${brlCurto(valorTotalCusto)}</div>
      <div class="d">Projetado Venda: ${brlCurto(valorTotalVenda)}</div>
    </div>
    <div class="kpi ${pecasCriticas.length ? 'alerta' : 'bom'}">
      <div class="r">${ico('alerta', 14)} Estoque Crítico</div>
      <div class="v">${pecasCriticas.length}</div>
      <div class="d">Itens abaixo do estoque mínimo</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Margem Média</div>
      <div class="v">${valorTotalCusto > 0 ? (((valorTotalVenda - valorTotalCusto) / valorTotalCusto) * 100).toFixed(0) + '%' : '—'}</div>
      <div class="d">Markup global praticado</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="chip" data-act="filtro-estoque" data-f="todos" aria-pressed="${filtro === 'todos'}">
        Todas as Peças <span class="n">${pecas.length}</span>
      </button>
      <button class="chip" data-act="filtro-estoque" data-f="critico" aria-pressed="${filtro === 'critico'}" style="${pecasCriticas.length ? 'color:var(--tijolo)' : ''}">
        Estoque Crítico <span class="n">${pecasCriticas.length}</span>
      </button>
    </div>

    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="campo-busca" style="position:relative">
        <input type="text" class="campo-texto" placeholder="Buscar código, peça ou local..." data-act="busca-estoque" value="${esc(S.ui.buscaEstoque || '')}" style="width:220px;padding-left:30px;height:34px;font-size:13px;border-radius:20px">
        <span style="position:absolute;left:10px;top:8px;color:var(--aco-400);pointer-events:none">${ico('busca', 14)}</span>
      </div>

      <button class="btn btn-secundario" data-act="importar-xml" style="height:34px;font-size:13px;border-radius:20px">
        ${ico('upload', 14)} Importar XML NF-e
      </button>
      <button class="btn btn-secundario" data-act="ocr-entrada" style="height:34px;font-size:13px;border-radius:20px">
        ${ico('doc', 14)} Leitura OCR / Danfe
      </button>
      <button class="btn btn-primario" data-act="nova-peca" style="height:34px;font-size:13px;border-radius:20px">
        ${ico('mais', 14)} Nova Peça
      </button>
    </div>
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Código / Peça</th>
            <th>Localização</th>
            <th>Fornecedor</th>
            <th style="width:110px;text-align:center">Estoque / Mín.</th>
            <th style="width:110px;text-align:right">Custo</th>
            <th style="width:110px;text-align:right">Venda</th>
            <th style="width:80px;text-align:center">Margem</th>
            <th style="width:100px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtradas.length ? filtradas.map(p => {
            const isCritico = (p.qtd || 0) <= (p.min || 1);
            const margem = p.custo > 0 ? (((p.venda - p.custo) / p.custo) * 100).toFixed(0) : 0;

            return `
            <tr style="${isCritico ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(p.nome)}</div>
                <div class="mini"><span class="mono">${esc(p.cod || 'S/CÓD')}</span> · Unidade: ${esc(p.un || 'un')}</div>
              </td>
              <td><span class="selo" style="background:var(--aco-100)">${esc(p.loc || '—')}</span></td>
              <td style="font-size:13px;color:var(--aco-600)">${esc(p.forn || '—')}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;align-items:center;gap:4px">
                  <button class="btn-micro" data-act="mov-peca-grid" data-id="${p.id}" data-d="-1">−</button>
                  <span class="num ${isCritico ? 'texto-alerta' : ''}" style="font-weight:700;min-width:26px">
                    ${p.qtd}
                  </span>
                  <button class="btn-micro" data-act="mov-peca-grid" data-id="${p.id}" data-d="1">+</button>
                </div>
                <div class="mini">mín: ${p.min || 1}</div>
              </td>
              <td style="text-align:right" class="num">${brl(p.custo)}</td>
              <td style="text-align:right;font-weight:600" class="num">${brl(p.venda)}</td>
              <td style="text-align:center">
                <span class="selo ${margem >= 50 ? 'selo-finalizada' : 'selo-aprovacao'}" style="font-size:11px">
                  +${margem}%
                </span>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="ver-peca" data-id="${p.id}" title="Editar Peça">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-peca-id" data-id="${p.id}" title="Excluir Peça">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr>
              <td colspan="8" style="text-align:center;padding:36px;color:var(--aco-400)">
                Nenhuma peça cadastrada ou encontrada com esses filtros.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaPeca() {
  const p = P(S.ui.pecaAberta);
  if (!p) return '<div class="card card-p">Peça não encontrada.</div>';

  const margem = p.custo > 0 ? (((p.venda - p.custo) / p.custo) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">${esc(p.nome)}</h3>
        <div class="mini">Código Fabricante: <span class="mono">${esc(p.cod)}</span></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-perigo" data-act="excluir-peca">${ico('lixo', 14)} Excluir</button>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição Completa da Peça:</label>
        <input type="text" class="campo-texto" value="${esc(p.nome)}" data-act="campo-peca" data-c="nome" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Código / Ref:</label>
          <input type="text" class="campo-texto" value="${esc(p.cod)}" data-act="campo-peca" data-c="cod" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Unidade:</label>
          <input type="text" class="campo-texto" value="${esc(p.un || 'un')}" data-act="campo-peca" data-c="un" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Localização:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Prat. A-01" value="${esc(p.loc || '')}" data-act="campo-peca" data-c="loc" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Atual em Estoque:</label>
          <div style="display:flex;gap:4px">
            <button class="btn btn-secundario" data-act="mov-peca" data-d="-1" style="height:34px;padding:0 12px">−</button>
            <input type="number" class="campo-texto" value="${p.qtd}" data-act="campo-peca" data-c="qtd" style="width:100%;height:34px;text-align:center;font-weight:700">
            <button class="btn btn-secundario" data-act="mov-peca" data-d="1" style="height:34px;padding:0 12px">+</button>
          </div>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Estoque Mínimo de Alerta:</label>
          <input type="number" class="campo-texto" value="${p.min || 1}" data-act="campo-peca" data-c="min" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Custo (R$):</label>
          <input type="number" class="campo-texto" value="${p.custo}" data-act="campo-peca" data-c="custo" step="0.50" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Venda (R$):</label>
          <input type="number" class="campo-texto" value="${p.venda}" data-act="campo-peca" data-c="venda" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>

      <div class="kpi bom" style="padding:10px;display:flex;justify-content:space-between;align-items:center">
        <span class="mini">Margem de Lucro Bruta (Markup):</span>
        <span class="num" style="font-size:16px;font-weight:700;color:var(--verde)">+${margem}%</span>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Fornecedor Principal:</label>
        <input type="text" class="campo-texto" value="${esc(p.forn || '')}" data-act="campo-peca" data-c="forn" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-primario" data-act="fechar">Salvar e Fechar</button>
    </div>
  </div>`;
}

function folhaNovaPeca() {
  const r = S.ui.rascPeca = S.ui.rascPeca || { un: 'un', qtd: 0, min: 1, custo: 0, venda: 0 };

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Cadastrar Nova Peça no Almoxarifado</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição da Peça / Insumo:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Filtro de Combustível Scania DC13" data-act="rp" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Código Original / Ref:</label>
          <input type="text" class="campo-texto" placeholder="Ex: SCN-20412" data-act="rp" data-c="cod" value="${esc(r.cod || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Unidade:</label>
          <input type="text" class="campo-texto" placeholder="un, jg, lt, pc" data-act="rp" data-c="un" value="${esc(r.un || 'un')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Localização Física:</label>
          <input type="text" class="campo-texto" placeholder="Prat. B-02" data-act="rp" data-c="loc" value="${esc(r.loc || '')}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Quantidade Inicial:</label>
          <input type="number" class="campo-texto" placeholder="0" data-act="rp" data-c="qtd" value="${r.qtd || ''}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Estoque Mínimo:</label>
          <input type="number" class="campo-texto" placeholder="2" data-act="rp" data-c="min" value="${r.min || 1}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Custo (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rp" data-c="custo" value="${r.custo || ''}" step="0.50" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Preço de Venda (R$):</label>
          <input type="number" class="campo-texto" placeholder="0.00" data-act="rp" data-c="venda" value="${r.venda || ''}" step="0.50" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Fornecedor Principal:</label>
        <input type="text" class="campo-texto" placeholder="Ex: Fras-le / ZF do Brasil" data-act="rp" data-c="forn" value="${esc(r.forn || '')}" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" data-act="salvar-peca" style="font-weight:600;padding:0 18px">
        ${ico('check', 14)} Salvar Peça
      </button>
    </div>
  </div>`;
}

/* =====================================================================
   IMPORTAÇÃO DE NOTA FISCAL ELETRÔNICA (XML)
===================================================================== */
function folhaXML() {
  const nota = S.ui.nota;

  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Importação de NF-e via XML</h3>
        <div class="mini">Entrada automática de peças e geração de Contas a Pagar</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    ${!nota ? `
      <div style="border:2px dashed var(--aco-300);padding:30px 20px;border-radius:10px;text-align:center;background:var(--aco-050)">
        <div style="margin-bottom:10px;color:var(--petroleo)">${ico('upload', 36)}</div>
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">Selecione o arquivo .XML da Nota Fiscal</div>
        <div class="mini" style="margin-bottom:16px">Você pode selecionar um ou vários arquivos de fornecedores de autopeças.</div>
        <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          ${ico('doc', 14)} Escolher Arquivo XML
          <input type="file" accept=".xml" data-act="arquivo-xml" multiple style="display:none">
        </label>
      </div>
    ` : `
      <div style="background:var(--aco-050);padding:12px;border-radius:8px;margin-bottom:14px;border:1px solid var(--aco-150)">
        <div class="entre">
          <div><b>NF-e Nº:</b> ${esc(nota.num)} · <b>Série:</b> ${esc(nota.serie || '1')}</div>
          <div class="num" style="font-weight:700;font-size:15px;color:var(--verde)">${brl(nota.total)}</div>
        </div>
        <div class="mini" style="margin-top:4px">
          <b>Fornecedor:</b> ${esc(nota.forn)} · CNPJ: ${esc(nota.cnpj || '—')} · Emissão: ${dataBRfull(nota.data)}
        </div>
      </div>

      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Itens Identificados na Nota Fiscal (${nota.itens.length}):</div>
      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--aco-150);border-radius:6px;margin-bottom:14px">
        <table class="tabela" style="font-size:12.5px">
          <thead>
            <tr>
              <th>Cód. / Descrição</th>
              <th style="width:60px;text-align:center">Qtd</th>
              <th style="width:90px;text-align:right">Custo Unit.</th>
              <th style="width:90px;text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${nota.itens.map(it => `
              <tr>
                <td><b>${esc(it.nome)}</b><div class="mini mono">${esc(it.cod)}</div></td>
                <td style="text-align:center">${it.qtd} ${esc(it.un)}</td>
                <td style="text-align:right">${brl(it.custo)}</td>
                <td style="text-align:right;font-weight:600">${brl(it.qtd * it.custo)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-sucesso" data-act="confirmar-xml" style="font-weight:600;padding:0 18px">
          ${ico('check', 14)} Confirmar Entrada no Estoque & Contas a Pagar
        </button>
      </div>
    `}
  </div>`;
}

function lerXML(texto) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(texto, 'text/xml');
  const txt = (no, tag) => {
    const el = no ? no.getElementsByTagName(tag)[0] : null;
    return el ? el.textContent.trim() : '';
  };

  const infNFe = xml.getElementsByTagName('infNFe')[0];
  if (!infNFe) throw new Error('Estrutura de NF-e não reconhecida.');

  const ide = infNFe.getElementsByTagName('ide')[0];
  const emit = infNFe.getElementsByTagName('emit')[0];
  const totalNo = infNFe.getElementsByTagName('ICMSTot')[0] || infNFe.getElementsByTagName('total')[0];

  const num = txt(ide, 'nNF');
  const serie = txt(ide, 'serie');
  const data = (txt(ide, 'dhEmi') || txt(ide, 'dEmi') || hoje()).slice(0, 10);
  const forn = txt(emit, 'xNome') || txt(emit, 'xFant') || 'Fornecedor';
  const cnpj = txt(emit, 'CNPJ') || txt(emit, 'CPF');
  const total = parseFloat(txt(totalNo, 'vNF') || '0');

  const detList = infNFe.getElementsByTagName('det');
  const itens = [];

  for (let i = 0; i < detList.length; i++) {
    const prod = detList[i].getElementsByTagName('prod')[0];
    if (!prod) continue;
    itens.push({
      cod: txt(prod, 'cProd'),
      nome: txt(prod, 'xProd'),
      un: txt(prod, 'uCom') || 'un',
      qtd: parseFloat(txt(prod, 'qCom') || '1'),
      custo: parseFloat(txt(prod, 'vUnCom') || '0')
    });
  }

  return { num, serie, data, forn, cnpj, total, itens };
}

function confirmarXML() {
  const n = S.ui.nota;
  if (!n) return;

  // 1. Atualizar ou criar peças no almoxarifado
  n.itens.forEach(it => {
    let p = S.pecas.find(x => x.cod === it.cod || x.nome.toLowerCase() === it.nome.toLowerCase());
    if (p) {
      p.qtd = (p.qtd || 0) + it.qtd;
      p.custo = it.custo;
      if (p.venda <= it.custo) p.venda = Math.round(it.custo * 1.6);
    } else {
      S.pecas.push({
        id: uid('p'),
        cod: it.cod,
        nome: it.nome,
        un: it.un,
        qtd: it.qtd,
        min: 2,
        custo: it.custo,
        venda: Math.round(it.custo * 1.6),
        loc: 'Almoxarifado',
        forn: n.forn
      });
    }
  });

  // 2. Registrar no Contas a Pagar
  S.contas.push({
    id: uid('ct'),
    tipo: 'pagar',
    desc: `NF-e ${n.num} — ${n.forn}`,
    parte: n.forn,
    valor: n.total,
    venc: addDias(hoje(), 28),
    pago: false,
    cat: 'Fornecedores Peças',
    doc: `NF-${n.num}`
  });

  // 3. Salvar registro de NF recebida
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.nfsRecebidas.unshift(n);

  S.ui.nota = null;
  fecharFolha();
  render();
  torrar(`NF ${n.num} importada: ${n.itens.length} itens lançados no estoque!`);
}

/* =====================================================================
   LEITURA OCR & DANFE INTELIGENTE
===================================================================== */
function folhaSimulacaoOCR() {
  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Leitor OCR de Notas & Danfe</h3>
        <div class="mini">Reconhecimento visual automático para notas em PDF ou foto</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="border:2px dashed var(--aco-300);padding:24px;border-radius:10px;text-align:center;background:var(--aco-050);margin-bottom:16px">
      <div style="margin-bottom:8px;color:var(--ardosia)">${ico('qr', 36)}</div>
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">Envie a Foto ou PDF da Nota Fiscal / Danfe</div>
      <div class="mini" style="margin-bottom:14px">O sistema fará o escaneamento inteligente de itens, valores e fornecedor.</div>
      <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        ${ico('upload', 14)} Selecionar Arquivo para OCR
        <input type="file" accept="image/*,application/pdf" data-act="arquivo-ocr" style="display:none">
      </label>
    </div>

    <div class="card card-p" style="background:var(--branco);border:1px solid var(--aco-150)">
      <div class="entre" style="margin-bottom:10px">
        <span style="font-weight:600;font-size:13px">Simulação de Nota Escaneada (Exemplo):</span>
        <button class="btn btn-secundario" data-act="carregar-exemplo-ocr" style="font-size:12px;padding:4px 10px">Carregar Exemplo Real</button>
      </div>
      <div style="font-size:12.5px;color:var(--aco-700);line-height:1.5">
        <b>Fornecedor:</b> ZF do Brasil Sistemas Automotivos Ltda<br>
        <b>CNPJ:</b> 61.088.883/0001-08 · <b>NF Nº:</b> 784102 · <b>Total:</b> R$ 3.840,00<br>
        <b>Itens Detectados:</b> 4x Jogo de Lonas de Freio Heavy Duty (R$ 480,00 un) + 2x Cilindro Mestre de Embreagem (R$ 960,00 un).
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="fechar">Fechar</button>
      <button class="btn btn-sucesso" data-act="importar-exemplo-ocr" style="font-weight:600;padding:0 16px">
        ${ico('check', 14)} Lançar Dados Reconhecidos
      </button>
    </div>
  </div>`;
}
