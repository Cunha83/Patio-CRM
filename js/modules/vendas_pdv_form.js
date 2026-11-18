/**
 * Módulo: vendas_pdv_form.js
 * Pátio-CRM — PDV Balcão, Carrinho de Peças/Serviços e Conclusão de Vendas
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function abrirModalNovaVenda() {
    S.ui.rascVenda = {
      clienteId: (S.clientes && S.clientes[0]?.id) || '',
      vendedorId: (S.mecanicos && S.mecanicos[0]?.id) || '',
      data: hoje(), prev: hoje(), tipo: 'Balcão', formaPgto: 'Pix', desconto: 0,
      pecas: [], servicos: []
    };
    abrirFolha(folhaNovaVenda);
  }

  function abrirCadastroClienteParaVenda() {
    if (!S.ui) S.ui = {};
    S.ui.cadTipo = 'cliente';
    S.ui.rascCad = { doc: '', nome: '', fantasia: '', fone: '', email: '', contato: '', endereco: '', cidade: '', uf: '', cep: '', ie: '' };
    S.ui.retornoVenda = true;
    if (typeof abrirFolha === 'function') abrirFolha(folhaCadastro);
  }

  function recalcularTotaisVendaDOM() {
    const r = S.ui.rascVenda;
    if (!r) return;
    let subPecas = 0;
    (r.pecas || []).forEach((it, idx) => {
      const qtd = Math.max(0, it.qtd || 0), val = Math.max(0, it.valor || 0);
      const sub = qtd * val;
      subPecas += sub;
      const elSub = document.getElementById(`subtotal-peca-${idx}`);
      if (elSub) elSub.textContent = brl(sub);
    });
    let subServicos = 0;
    (r.servicos || []).forEach((it, idx) => {
      const qtd = Math.max(0, it.qtd || 0), val = Math.max(0, it.valor || 0);
      const sub = qtd * val;
      subServicos += sub;
      const elSub = document.getElementById(`subtotal-servico-${idx}`);
      if (elSub) elSub.textContent = brl(sub);
    });
    const desc = Math.max(0, Number(r.desconto || 0));
    const total = Math.max(0, subPecas + subServicos - desc);
    const totalEl = document.getElementById('venda-total-liquido');
    if (totalEl) totalEl.textContent = `Total Líquido: ${brl(total)}`;
  }

  function calcularPrecoMinimoPeca(pecaId) {
    const p = (S.pecas || []).find(x => x.id === pecaId);
    if (!p) return 0;
    const custo = Number(p.custo || 0);
    const markupMin = Number((S.cfg?.empresa?.markupMinimo) || (S.cfg?.markupMinimo) || 15);
    return custo * (1 + markupMin / 100);
  }

  function buscarPecaPorCodigo(cod, idx) {
    const busca = String(cod || '').toLowerCase().trim();
    if (!busca) return;
    const p = (S.pecas || []).find(x => (x.cod || '').toLowerCase() === busca || (x.cod || '').toLowerCase().startsWith(busca));
    if (p) {
      selecionarPecaAutocomplete(p.id, idx);
    } else {
      torrar(`Peça com código "${cod}" não encontrada no almoxarifado.`, 'alerta');
    }
  }

  function filtrarAutocompletePecas(termo, idx) {
    const box = document.getElementById(`autocomplete-pecas-${idx}`);
    if (!box) return;
    const busca = String(termo || '').toLowerCase().trim();
    const filtradas = (S.pecas || []).filter(p => (p.nome || '').toLowerCase().includes(busca) || (p.cod || '').toLowerCase().includes(busca)).slice(0, 8);
    if (!filtradas.length) {
      box.style.display = 'none';
      return;
    }
    box.innerHTML = filtradas.map(p => `
      <div onclick="selecionarPecaAutocomplete('${p.id}', ${idx})" style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px;display:flex;justify-content:space-between" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#fff'">
        <span><b>${esc(p.cod || '—')}</b> - ${esc(p.nome)}</span>
        <span style="color:#059669;font-weight:700">Estoque: ${p.qtd || 0} un | ${brl(p.venda || 0)}</span>
      </div>
    `).join('');
    box.style.display = 'block';
  }

  function selecionarPecaAutocomplete(pecaId, idx) {
    const p = (S.pecas || []).find(x => x.id === pecaId);
    if (!p || !S.ui.rascVenda?.pecas[idx]) return;
    const it = S.ui.rascVenda.pecas[idx];
    it.pecaId = p.id;
    it.cod = p.cod || '';
    it.sku = p.cod || '';
    it.nome = p.nome;
    it.valor = Math.max(0, Number(p.venda || 0));
    renderFolha();
  }

  function folhaNovaVenda() {
    const r = S.ui.rascVenda || {};
    const clientes = S.clientes || [], mecanicos = S.mecanicos || [], pecas = S.pecas || [], servicos = S.servicos || [];
    const subPecas = (r.pecas || []).reduce((acc, it) => acc + (Math.max(0, it.qtd || 0) * Math.max(0, it.valor || 0)), 0);
    const subServicos = (r.servicos || []).reduce((acc, it) => acc + (Math.max(0, it.qtd || 0) * Math.max(0, it.valor || 0)), 0);
    const desconto = Math.max(0, Number(r.desconto || 0));
    const totalVenda = Math.max(0, subPecas + subServicos - desconto);

    return `
    <div class="card card-p" style="max-width:860px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0">Nova Venda (Balcão de Peças & Serviços)</h3>
          <div class="mini" style="color:var(--aco-500)">Lançamento com dedução imediata no estoque e geração de Contas a Receber.</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <!-- Cabeçalho da Venda -->
      <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <div class="entre" style="margin-bottom:2px">
            <label class="mini" style="font-weight:700">Cliente / Sacado</label>
            <button type="button" class="btn-link" onclick="abrirCadastroClienteParaVenda()" style="font-size:11px;font-weight:700;color:var(--brand-primary,#0f766e);cursor:pointer">+ Novo (CNPJ)</button>
          </div>
          <select class="campo-texto" onchange="if(this.value==='novo'){abrirCadastroClienteParaVenda()}else{S.ui.rascVenda.clienteId=this.value}" style="width:100%;height:36px;font-size:13px">
            <option value="">— Selecione o Cliente —</option>
            ${clientes.map(c => `<option value="${c.id}" ${r.clienteId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            <option value="novo">+ Cadastrar Novo Cliente (CNPJ/CPF)...</option>
          </select>
        </div>
        <div>
          <label class="mini" style="font-weight:700">Vendedor / Consultor</label>
          <select class="campo-texto" onchange="S.ui.rascVenda.vendedorId=this.value" style="width:100%;height:36px;font-size:13px">
            <option value="">— Selecione —</option>
            ${mecanicos.map(m => `<option value="${m.id}" ${r.vendedorId === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="mini" style="font-weight:700">Forma de Pagamento</label>
          <select class="campo-texto" onchange="S.ui.rascVenda.formaPgto=this.value" style="width:100%;height:36px;font-size:13px">
            <option value="Pix" ${r.formaPgto === 'Pix' ? 'selected' : ''}>⚡ Pix (À vista)</option>
            <option value="Boleto" ${r.formaPgto === 'Boleto' ? 'selected' : ''}>📄 Boleto Faturado (28d)</option>
            <option value="Cartão" ${r.formaPgto === 'Cartão' ? 'selected' : ''}>💳 Cartão Débito/Crédito</option>
            <option value="Dinheiro" ${r.formaPgto === 'Dinheiro' ? 'selected' : ''}>💵 Dinheiro em Caixa</option>
          </select>
        </div>
      </div>

      <!-- PEÇAS DA VENDA COM BUSCA DUPLA -->
      <div style="background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:8px;padding:12px;margin-bottom:14px">
        <div class="entre" style="margin-bottom:8px">
          <span style="font-weight:700;font-size:13px">📦 Peças / Mercadorias (${(r.pecas || []).length})</span>
          <button class="btn btn-secundario btn-pequeno" onclick="adicionarItemRascVenda('peca')">+ Adicionar Peça</button>
        </div>
        ${(r.pecas || []).length === 0 ? `<div class="mini" style="text-align:center;padding:10px;color:var(--aco-500)">Nenhuma peça adicionada.</div>` : `
          <table class="tabela" style="margin:0">
            <thead>
              <tr><th>Código SKU + Descrição da Peça</th><th style="width:75px;text-align:center">Estoque</th><th style="width:75px;text-align:center">Qtd</th><th style="width:105px;text-align:right">Valor Unit.</th><th style="width:105px;text-align:right">Subtotal</th><th style="width:36px"></th></tr>
            </thead>
            <tbody>
              ${r.pecas.map((it, idx) => {
                const pRef = pecas.find(p => p.id === it.pecaId) || {};
                const est = Number(pRef.qtd || 0);
                const pMin = calcularPrecoMinimoPeca(it.pecaId);
                return `
                <tr>
                  <td>
                    <div style="display:flex;gap:6px;align-items:center;position:relative">
                      <input type="text" placeholder="SKU/Cód" value="${esc(it.sku || it.cod || pRef.cod || '')}" onkeydown="if(event.key==='Enter'){event.preventDefault();buscarPecaPorCodigo(this.value, ${idx});}" onchange="buscarPecaPorCodigo(this.value, ${idx})" style="width:85px;height:32px;font-size:11.5px;font-family:var(--mono);font-weight:700" title="Pressione Enter para selecionar pelo SKU">
                      <div style="position:relative;flex:1">
                        <input type="text" placeholder="Digite para buscar peça..." value="${esc(it.nome || '')}" oninput="filtrarAutocompletePecas(this.value, ${idx})" onfocus="filtrarAutocompletePecas(this.value, ${idx})" style="width:100%;height:32px;font-size:12px">
                        <div id="autocomplete-pecas-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 8px 16px rgba(0,0,0,0.15);z-index:999;max-height:160px;overflow-y:auto"></div>
                      </div>
                    </div>
                  </td>
                  <td style="text-align:center"><span class="selo ${est < (it.qtd || 1) ? 'selo-peca' : 'selo-finalizada'}">${est} un</span></td>
                  <td style="text-align:center"><input type="number" class="campo-texto" value="${Math.max(1, it.qtd || 1)}" min="1" step="1" onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()" oninput="S.ui.rascVenda.pecas[${idx}].qtd=Math.max(1,Math.abs(+this.value||1));recalcularTotaisVendaDOM()" style="width:65px;height:32px;text-align:center"></td>
                  <td style="text-align:right">
                    <input type="number" class="campo-texto" value="${Math.max(0, it.valor || 0)}" min="0" step="0.50" onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()" oninput="S.ui.rascVenda.pecas[${idx}].valor=Math.max(0,Math.abs(+this.value||0));recalcularTotaisVendaDOM()" style="width:95px;height:32px;text-align:right" title="${pMin>0?'Mínimo: '+brl(pMin):''}">
                  </td>
                  <td style="text-align:right;font-weight:700" class="num" id="subtotal-peca-${idx}">${brl(Math.max(1, it.qtd || 1) * Math.max(0, it.valor || 0))}</td>
                  <td style="text-align:center"><button class="btn-icone-perigo" onclick="S.ui.rascVenda.pecas.splice(${idx}, 1);renderFolha()">${ico('lixo', 14)}</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>

      <!-- SERVIÇOS DA VENDA -->
      <div style="background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:8px;padding:12px;margin-bottom:16px">
        <div class="entre" style="margin-bottom:8px">
          <span style="font-weight:700;font-size:13px">🔧 Mão de Obra / Serviços (${(r.servicos || []).length})</span>
          <button class="btn btn-secundario btn-pequeno" onclick="adicionarItemRascVenda('servico')">+ Adicionar Serviço</button>
        </div>
        ${(r.servicos || []).length === 0 ? `<div class="mini" style="text-align:center;padding:10px;color:var(--aco-500)">Nenhum serviço adicionado.</div>` : `
          <table class="tabela" style="margin:0">
            <thead>
              <tr><th>Serviço</th><th style="width:80px;text-align:center">Qtd</th><th style="width:110px;text-align:right">Valor Unit.</th><th style="width:110px;text-align:right">Subtotal</th><th style="width:40px"></th></tr>
            </thead>
            <tbody>
              ${r.servicos.map((it, idx) => `
                <tr>
                  <td><select class="campo-texto" onchange="S.ui.rascVenda.servicos[${idx}].servicoId=this.value;atualizarItemRascVenda('servico', ${idx});renderFolha()" style="width:100%;height:32px;font-size:12px"><option value="">— Selecione o Serviço —</option>${servicos.map(s => `<option value="${s.id}" ${it.servicoId === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></td>
                  <td style="text-align:center"><input type="number" class="campo-texto" value="${Math.max(1, it.qtd || 1)}" min="1" step="1" onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()" oninput="S.ui.rascVenda.servicos[${idx}].qtd=Math.max(1,Math.abs(+this.value||1));recalcularTotaisVendaDOM()" style="width:65px;height:32px;text-align:center"></td>
                  <td style="text-align:right"><input type="number" class="campo-texto" value="${Math.max(0, it.valor || 0)}" min="0" step="0.50" onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()" oninput="S.ui.rascVenda.servicos[${idx}].valor=Math.max(0,Math.abs(+this.value||0));recalcularTotaisVendaDOM()" style="width:95px;height:32px;text-align:right"></td>
                  <td style="text-align:right;font-weight:700" class="num" id="subtotal-servico-${idx}">${brl(Math.max(1, it.qtd || 1) * Math.max(0, it.valor || 0))}</td>
                  <td style="text-align:center"><button class="btn-icone-perigo" onclick="S.ui.rascVenda.servicos.splice(${idx}, 1);renderFolha()">${ico('lixo', 14)}</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>

      <!-- Desconto e Totais -->
      <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--aco-200);border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px">
          <label class="mini" style="font-weight:700">Desconto Geral (R$):</label>
          <input type="number" class="campo-texto" value="${Math.max(0, r.desconto || 0)}" min="0" step="1" onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()" oninput="S.ui.rascVenda.desconto=Math.max(0,Math.abs(+this.value||0));recalcularTotaisVendaDOM()" style="width:110px;height:34px;text-align:right">
        </div>
        <div style="font-size:18px;font-weight:800;color:var(--verde)" id="venda-total-liquido">Total Líquido: ${brl(totalVenda)}</div>
      </div>

      <!-- Rodapé -->
      <div style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--aco-150);padding-top:14px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" onclick="salvarNovaVendaConfirmada()" style="font-weight:700;padding:0 24px">
          ${ico('check', 14)} Concluir Venda & Baixar Estoque
        </button>
      </div>
    </div>`;
  }

  function adicionarItemRascVenda(tipo) {
    S.ui.rascVenda = S.ui.rascVenda || {};
    if (tipo === 'peca') {
      S.ui.rascVenda.pecas = S.ui.rascVenda.pecas || [];
      const pPrim = (S.pecas && S.pecas[0]) || {};
      S.ui.rascVenda.pecas.push({ pecaId: pPrim.id || '', cod: pPrim.cod || '', sku: pPrim.cod || '', nome: pPrim.nome || '', qtd: 1, valor: Math.max(0, Number(pPrim.venda || 0)) });
    } else {
      S.ui.rascVenda.servicos = S.ui.rascVenda.servicos || [];
      const sPrim = (S.servicos && S.servicos[0]) || {};
      S.ui.rascVenda.servicos.push({ servicoId: sPrim.id || '', nome: sPrim.nome || '', qtd: 1, valor: Math.max(0, Number(sPrim.valor || 0)) });
    }
    renderFolha();
  }

  function atualizarItemRascVenda(tipo, idx) {
    if (tipo === 'peca') {
      const it = S.ui.rascVenda.pecas[idx], p = (S.pecas || []).find(x => x.id === it.pecaId);
      if (p) { it.cod = p.cod || ''; it.sku = p.cod || ''; it.nome = p.nome; it.valor = Math.max(0, Number(p.venda || 0)); }
    } else {
      const it = S.ui.rascVenda.servicos[idx], s = (S.servicos || []).find(x => x.id === it.servicoId);
      if (s) { it.nome = s.nome; it.valor = Math.max(0, Number(s.valor || 0)); }
    }
  }

  function salvarNovaVendaConfirmada() {
    const r = S.ui.rascVenda;
    if (!r) return;
    if (!r.clienteId) { torrar('Selecione o cliente para a venda.', 'erro'); return; }
    const temItens = (r.pecas && r.pecas.length > 0) || (r.servicos && r.servicos.length > 0);
    if (!temItens) { torrar('Adicione ao menos uma peça ou serviço na venda.', 'erro'); return; }

    if (Number(r.desconto) < 0 || (r.pecas || []).some(p => Number(p.qtd) <= 0 || Number(p.valor) < 0) || (r.servicos || []).some(s => Number(s.qtd) <= 0 || Number(s.valor) < 0)) {
      torrar('Valores e quantidades não podem ser negativos.', 'erro');
      return;
    }

    // Trava de Preço Mínimo (Markup de Proteção)
    const role = (S.user && S.user.role) || S.perfil || 'admin';
    const isGerente = role === 'admin' || role === 'gerente';
    for (const it of (r.pecas || [])) {
      const pMin = calcularPrecoMinimoPeca(it.pecaId);
      if (!isGerente && Number(it.valor) < pMin && pMin > 0) {
        torrar(`Preço de "${it.nome}" abaixo do piso (${brl(pMin)}). Requer autorização de Gerente Geral.`, 'erro');
        return;
      }
    }

    const cli = (S.clientes || []).find(c => c.id === r.clienteId) || {};
    const vend = (S.mecanicos || []).find(m => m.id === r.vendedorId) || {};
    const subP = (r.pecas || []).reduce((acc, it) => acc + (Math.max(1, it.qtd) * Math.max(0, it.valor)), 0);
    const subS = (r.servicos || []).reduce((acc, it) => acc + (Math.max(1, it.qtd) * Math.max(0, it.valor)), 0);
    const total = Math.max(0, subP + subS - Math.max(0, Number(r.desconto || 0)));

    // 1. Dedução de Estoque Físico das Peças
    S.pecas = S.pecas || [];
    (r.pecas || []).forEach(it => {
      const p = S.pecas.find(x => x.id === it.pecaId);
      if (p) p.qtd = Math.max(0, (Number(p.qtd) || 0) - (Number(it.qtd) || 0));
    });

    // 2. Geração de Conta a Receber
    S.contasReceber = S.contasReceber || [];
    const prazoDias = r.formaPgto === 'Boleto' ? (cli.prazo || 28) : 0;
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + prazoDias);

    const novaConta = {
      id: uid('cr'), parte: cli.nome || 'Cliente Balcão', cli: cli.id,
      desc: `Venda #${'V' + ((S.vendas || []).length + 101)} (${r.formaPgto || 'À vista'})`,
      valor: total, venc: dataVenc.toISOString().substring(0, 10), tipo: 'receber',
      st: (r.formaPgto === 'Pix' || r.formaPgto === 'Dinheiro') ? 'paga' : 'pendente',
      origem: 'venda_direta'
    };
    S.contasReceber.push(novaConta);

    if (novaConta.st === 'paga') {
      S.lancamentosCaixa = S.lancamentosCaixa || [];
      S.lancamentosCaixa.push({ id: uid('cx'), data: hoje(), desc: `Recebimento Venda Balcão - ${cli.nome}`, tipo: 'entrada', valor: total, forma: r.formaPgto });
    }

    // 3. Registra a Venda
    S.vendas = S.vendas || [];
    S.vendas.unshift({
      id: uid('vd'), codigo: 'V' + (S.vendas.length + 101),
      clienteId: cli.id, clienteNome: cli.nome, clienteDoc: cli.doc,
      vendedorId: vend.id, vendedorNome: vend.nome,
      data: r.data || hoje(), prev: r.prev || hoje(), tipo: r.tipo || 'Balcão',
      formaPgto: r.formaPgto || 'Pix', desconto: Math.max(0, Number(r.desconto || 0)),
      pecas: r.pecas || [], servicos: r.servicos || [], total, situacao: 'Finalizada'
    });

    salvar(); fecharFolha(); render();
    torrar('Venda concluída com sucesso! Estoque e financeiro atualizados.', 'sucesso');
  }

  // Exportações explícitas para window e globalThis
  const exportsPDV = {
    abrirModalNovaVenda, abrirCadastroClienteParaVenda, folhaNovaVenda,
    adicionarItemRascVenda, atualizarItemRascVenda,
    recalcularTotaisVendaDOM, atualizarTotaisVendaNoDOM: recalcularTotaisVendaDOM,
    calcularPrecoMinimoPeca, validarPrecoMinimo: calcularPrecoMinimoPeca,
    buscarPecaPorCodigo, filtrarAutocompletePecas, selecionarPecaAutocomplete,
    salvarNovaVendaConfirmada
  };

  Object.assign(global, exportsPDV);
  if (typeof window !== 'undefined') Object.assign(window, exportsPDV);
})(typeof window !== 'undefined' ? window : globalThis);
