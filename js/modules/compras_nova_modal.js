/* =====================================================================
   PÁTIO CRM — MODAL E FLUXOS DE NOVA COMPRA, DETALHES E ENTRADA
   Submódulo extraído de js/compras.js (< 350 linhas)
   ===================================================================== */

function abrirModalNovaCompra() {
  S.ui.rascCompra = {
    fornecedorId: (S.fornecedores && S.fornecedores[0]?.id) || '',
    num: '',
    data: hoje(),
    cat: 'Peças',
    itens: []
  };
  abrirFolha(folhaNovaCompra);
}

function folhaNovaCompra() {
  const r = S.ui.rascCompra || {};
  const fornecedores = S.fornecedores || [];
  const pecas = S.pecas || [];

  const totalCompra = (r.itens || []).reduce((acc, it) => acc + (it.qtd * it.custo), 0);

  return `
  <div class="card card-p" style="max-width:760px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700;margin:0">Nova Compra de Peças / Mercadorias</h3>
        <div class="mini" style="color:var(--aco-500)">Lançamento com entrada de estoque e geração de Contas a Pagar.</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <!-- Cabeçalho da Compra -->
    <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr 1.2fr;gap:12px;margin-bottom:16px">
      <div>
        <label class="mini" style="font-weight:700">Fornecedor</label>
        <select class="campo-texto" onchange="S.ui.rascCompra.fornecedorId=this.value" style="width:100%;height:36px;font-size:13px">
          <option value="">— Selecione o Fornecedor —</option>
          ${fornecedores.map(f => `<option value="${f.id}" ${r.fornecedorId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="mini" style="font-weight:700">Número da Nota Fiscal</label>
        <input type="text" class="campo-texto" placeholder="Ex: 84920" value="${esc(r.num || '')}" oninput="S.ui.rascCompra.num=this.value" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Data da Compra</label>
        <input type="date" class="campo-texto" value="${r.data || hoje()}" onchange="S.ui.rascCompra.data=this.value" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Plano de Contas / Categoria</label>
        <select class="campo-texto" onchange="S.ui.rascCompra.cat=this.value" style="width:100%;height:36px;font-size:13px">
          ${typeof renderOptionsPlanoDeContas === 'function' ? renderOptionsPlanoDeContas(r.cat || 'Peças', 'despesa') : '<option value="Peças">Peças</option>'}
        </select>
      </div>
    </div>

    <!-- Itens Comprados -->
    <div style="background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:8px;padding:12px;margin-bottom:16px">
      <div class="entre" style="margin-bottom:10px">
        <span style="font-weight:700;font-size:13px">Itens da Compra (${(r.itens || []).length})</span>
        <button class="btn btn-secundario btn-pequeno" onclick="adicionarItemRascCompra()">+ Adicionar Peça</button>
      </div>

      ${(r.itens || []).length === 0 ? `
        <div class="mini" style="text-align:center;padding:16px;color:var(--aco-500)">Nenhum item adicionado à compra ainda.</div>
      ` : `
        <table class="tabela" style="margin:0">
          <thead>
            <tr>
              <th>Peça / Produto</th>
              <th style="width:90px;text-align:center">Qtd</th>
              <th style="width:120px;text-align:right">Custo Unit.</th>
              <th style="width:120px;text-align:right">Subtotal</th>
              <th style="width:50px;text-align:center"></th>
            </tr>
          </thead>
          <tbody>
            ${r.itens.map((it, idx) => `
              <tr>
                <td>
                  <select class="campo-texto" onchange="S.ui.rascCompra.itens[${idx}].pecaId=this.value;atualizarItemRascCompra(${idx});renderFolha()" style="width:100%;height:32px;font-size:12px">
                    <option value="">— Selecione a Peça —</option>
                    ${pecas.map(p => `<option value="${p.id}" ${it.pecaId === p.id ? 'selected' : ''}>${esc(p.cod ? p.cod + ' - ' : '')}${esc(p.nome)}</option>`).join('')}
                  </select>
                </td>
                <td style="text-align:center">
                  <input type="number" class="campo-texto" value="${it.qtd || 1}" min="1" step="1" oninput="S.ui.rascCompra.itens[${idx}].qtd=+this.value||1;renderFolha()" style="width:70px;height:32px;text-align:center">
                </td>
                <td style="text-align:right">
                  <input type="number" class="campo-texto" value="${it.custo || 0}" step="0.01" oninput="S.ui.rascCompra.itens[${idx}].custo=+this.value||0;renderFolha()" style="width:100px;height:32px;text-align:right">
                </td>
                <td style="text-align:right;font-weight:700" class="num">
                  ${brl((it.qtd || 1) * (it.custo || 0))}
                </td>
                <td style="text-align:center">
                  <button class="btn-icone-perigo" onclick="S.ui.rascCompra.itens.splice(${idx}, 1);renderFolha()">${ico('lixo', 14)}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <!-- Rodapé & Total -->
    <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px;align-items:center">
      <div style="font-size:16px;font-weight:700">
        Total da Compra: <span style="color:var(--verde)">${brl(totalCompra)}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" onclick="salvarNovaCompraConfirmada()" style="font-weight:700;padding:0 20px">
          ${ico('check', 14)} Finalizar & Atualizar Estoque
        </button>
      </div>
    </div>
  </div>`;
}

function adicionarItemRascCompra() {
  S.ui.rascCompra = S.ui.rascCompra || { itens: [] };
  S.ui.rascCompra.itens = S.ui.rascCompra.itens || [];
  const pecaPrimeira = (S.pecas && S.pecas[0]) || {};
  S.ui.rascCompra.itens.push({
    pecaId: pecaPrimeira.id || '',
    nome: pecaPrimeira.nome || '',
    qtd: 1,
    custo: Number(pecaPrimeira.custo || 0)
  });
  renderFolha();
}

function atualizarItemRascCompra(idx) {
  const it = S.ui.rascCompra.itens[idx];
  if (!it) return;
  const p = (S.pecas || []).find(x => x.id === it.pecaId);
  if (p) {
    it.nome = p.nome;
    it.custo = Number(p.custo || 0);
  }
}

function salvarNovaCompraConfirmada() {
  const r = S.ui.rascCompra;
  if (!r) return;
  if (!r.fornecedorId) {
    torrar('Selecione o fornecedor da compra.', 'erro');
    return;
  }
  if (!r.itens || r.itens.length === 0) {
    torrar('Adicione ao menos um item na compra.', 'erro');
    return;
  }

  const forn = (S.fornecedores || []).find(f => f.id === r.fornecedorId) || {};
  const total = r.itens.reduce((acc, it) => acc + (it.qtd * it.custo), 0);

  // 1. Atualiza estoque de cada item
  S.pecas = S.pecas || [];
  r.itens.forEach(it => {
    const p = S.pecas.find(x => x.id === it.pecaId);
    if (p) {
      p.qtd = (Number(p.qtd) || 0) + (Number(it.qtd) || 0);
      if (it.custo > 0) p.custo = it.custo;
    }
  });

  // 2. Gera Conta a Pagar vinculada ao Plano de Contas
  S.contasPagar = S.contasPagar || [];
  S.contas = S.contas || [];
  const dataVenc = new Date();
  dataVenc.setDate(dataVenc.getDate() + 28);
  const idContaPagar = uid('cp');
  const catCompra = r.cat || 'Peças';
  const descConta = `Compra ${r.num ? 'NF-e ' + r.num : 'de Peças'}`;
  const vencStr = dataVenc.toISOString().substring(0, 10);

  const novaContaPagar = {
    id: idContaPagar,
    parte: forn.nome || 'Fornecedor',
    fornecedorId: forn.id,
    desc: descConta,
    valor: total,
    venc: vencStr,
    tipo: 'pagar',
    st: 'pendente',
    pago: false,
    cat: catCompra,
    categoria: catCompra,
    doc: r.num || '',
    origem: 'compra_manual'
  };

  S.contasPagar.push(novaContaPagar);
  if (!S.contas.some(x => x.id === idContaPagar)) {
    S.contas.push(novaContaPagar);
  }

  // 3. Salva a compra
  S.compras = S.compras || [];
  S.compras.unshift({
    id: uid('comp'),
    codigo: 'C' + (S.compras.length + 101),
    num: r.num || 'S/N',
    fornecedorId: forn.id,
    fornecedorNome: forn.nome,
    fornecedorDoc: forn.doc,
    data: r.data || hoje(),
    cat: catCompra,
    categoria: catCompra,
    total,
    itens: r.itens,
    situacao: 'Finalizada',
    obs: 'Lançamento manual de compra'
  });

  salvar();
  fecharFolha();
  render();
  torrar('Compra registrada com sucesso! Estoque e contas a pagar atualizados.', 'sucesso');
}

function abrirDetalhesCompra(id) {
  const compra = (S.compras || []).find(c => c.id === id);
  if (!compra) return;

  abrirFolha(() => `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700;margin:0">Compra #${compra.codigo || compra.id} — ${esc(compra.fornecedorNome || '')}</h3>
        <div class="mini mono">NF-e: ${esc(compra.num || 'S/N')} · Data: ${dataBR(compra.data)}</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">Itens Comprados</div>
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Item</th>
            <th style="width:80px;text-align:center">Qtd</th>
            <th style="width:110px;text-align:right">Custo Unit.</th>
            <th style="width:110px;text-align:right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${(compra.itens || []).map(it => `
            <tr>
              <td>
                <div style="font-weight:600">${esc(it.nome)}</div>
                ${it.cod ? `<div class="mini mono">${esc(it.cod)}</div>` : ''}
              </td>
              <td style="text-align:center">${it.qtd} ${esc(it.un || 'un')}</td>
              <td style="text-align:right">${brl(it.custo)}</td>
              <td style="text-align:right;font-weight:700">${brl((it.qtd || 1) * (it.custo || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px;align-items:center">
      <div style="font-size:16px;font-weight:700">
        Total: <span style="color:var(--verde)">${brl(compra.total || 0)}</span>
      </div>
      <button class="btn btn-secundario" data-act="fechar">Fechar</button>
    </div>
  </div>`);
}

function excluirCompra(id) {
  pedirConfirmacao('excluir_compra_' + id, 'Toque de novo para excluir o registro desta compra', () => {
    S.compras = (S.compras || []).filter(c => c.id !== id);
    salvar();
    render();
    torrar('Compra excluída.');
  });
}

function darEntradaEstoqueCompra(id) {
  const compra = (S.compras || []).find(c => c.id === id);
  if (!compra) return;

  S.pecas = S.pecas || [];
  (compra.itens || []).forEach(it => {
    const p = S.pecas.find(x => x.id === it.pecaId || x.cod === it.cod || x.nome.toLowerCase() === it.nome.toLowerCase());
    if (p) {
      p.qtd = (Number(p.qtd) || 0) + (Number(it.qtd) || 0);
    }
  });

  compra.situacao = 'Finalizada';
  salvar();
  render();
  torrar('Entrada de estoque concluída com sucesso!', 'sucesso');
}

if (typeof window !== 'undefined') {
  window.abrirModalNovaCompra = abrirModalNovaCompra;
  window.folhaNovaCompra = folhaNovaCompra;
  window.adicionarItemRascCompra = adicionarItemRascCompra;
  window.atualizarItemRascCompra = atualizarItemRascCompra;
  window.salvarNovaCompraConfirmada = salvarNovaCompraConfirmada;
  window.abrirDetalhesCompra = abrirDetalhesCompra;
  window.excluirCompra = excluirCompra;
  window.darEntradaEstoqueCompra = darEntradaEstoqueCompra;
}
if (typeof globalThis !== 'undefined') {
  globalThis.abrirModalNovaCompra = abrirModalNovaCompra;
  globalThis.folhaNovaCompra = folhaNovaCompra;
  globalThis.adicionarItemRascCompra = adicionarItemRascCompra;
  globalThis.atualizarItemRascCompra = atualizarItemRascCompra;
  globalThis.salvarNovaCompraConfirmada = salvarNovaCompraConfirmada;
  globalThis.abrirDetalhesCompra = abrirDetalhesCompra;
  globalThis.excluirCompra = excluirCompra;
  globalThis.darEntradaEstoqueCompra = darEntradaEstoqueCompra;
}

