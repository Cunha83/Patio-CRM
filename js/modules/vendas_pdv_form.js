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
      data: hoje(),
      prev: hoje(),
      tipo: 'Balcão',
      formaPgto: 'Pix',
      desconto: 0,
      pecas: [],
      servicos: []
    };
    abrirFolha(folhaNovaVenda);
  }

  function folhaNovaVenda() {
    const r = S.ui.rascVenda || {};
    const clientes = S.clientes || [];
    const mecanicos = S.mecanicos || [];
    const pecas = S.pecas || [];
    const servicos = S.servicos || [];

    const subtotalPecas = (r.pecas || []).reduce((acc, it) => acc + (it.qtd * it.valor), 0);
    const subtotalServicos = (r.servicos || []).reduce((acc, it) => acc + (it.qtd * it.valor), 0);
    const desconto = Number(r.desconto || 0);
    const totalVenda = Math.max(0, subtotalPecas + subtotalServicos - desconto);

    return `
    <div class="card card-p" style="max-width:820px;margin:0 auto">
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
          <label class="mini" style="font-weight:700">Cliente / Sacado</label>
          <select class="campo-texto" onchange="S.ui.rascVenda.clienteId=this.value" style="width:100%;height:36px;font-size:13px">
            <option value="">— Selecione o Cliente —</option>
            ${clientes.map(c => `<option value="${c.id}" ${r.clienteId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
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

      <!-- PEÇAS DA VENDA -->
      <div style="background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:8px;padding:12px;margin-bottom:14px">
        <div class="entre" style="margin-bottom:8px">
          <span style="font-weight:700;font-size:13px">📦 Peças / Mercadorias (${(r.pecas || []).length})</span>
          <button class="btn btn-secundario btn-pequeno" onclick="adicionarItemRascVenda('peca')">+ Adicionar Peça</button>
        </div>

        ${(r.pecas || []).length === 0 ? `
          <div class="mini" style="text-align:center;padding:10px;color:var(--aco-500)">Nenhuma peça adicionada.</div>
        ` : `
          <table class="tabela" style="margin:0">
            <thead>
              <tr>
                <th>Peça</th>
                <th style="width:80px;text-align:center">Estoque</th>
                <th style="width:80px;text-align:center">Qtd</th>
                <th style="width:110px;text-align:right">Valor Unit.</th>
                <th style="width:110px;text-align:right">Subtotal</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody>
              ${r.pecas.map((it, idx) => {
                const pRef = pecas.find(p => p.id === it.pecaId) || {};
                const est = Number(pRef.qtd || 0);
                return `
                <tr>
                  <td>
                    <select class="campo-texto" onchange="S.ui.rascVenda.pecas[${idx}].pecaId=this.value;atualizarItemRascVenda('peca', ${idx});renderFolha()" style="width:100%;height:32px;font-size:12px">
                      <option value="">— Selecione a Peça —</option>
                      ${pecas.map(p => `<option value="${p.id}" ${it.pecaId === p.id ? 'selected' : ''}>${esc(p.cod ? p.cod + ' - ' : '')}${esc(p.nome)}</option>`).join('')}
                    </select>
                  </td>
                  <td style="text-align:center">
                    <span class="selo ${est < (it.qtd || 1) ? 'selo-peca' : 'selo-finalizada'}">${est} un</span>
                  </td>
                  <td style="text-align:center">
                    <input type="number" class="campo-texto" value="${it.qtd || 1}" min="1" step="1" oninput="S.ui.rascVenda.pecas[${idx}].qtd=+this.value||1;renderFolha()" style="width:65px;height:32px;text-align:center">
                  </td>
                  <td style="text-align:right">
                    <input type="number" class="campo-texto" value="${it.valor || 0}" step="0.50" oninput="S.ui.rascVenda.pecas[${idx}].valor=+this.value||0;renderFolha()" style="width:95px;height:32px;text-align:right">
                  </td>
                  <td style="text-align:right;font-weight:700" class="num">
                    ${brl((it.qtd || 1) * (it.valor || 0))}
                  </td>
                  <td style="text-align:center">
                    <button class="btn-icone-perigo" onclick="S.ui.rascVenda.pecas.splice(${idx}, 1);renderFolha()">${ico('lixo', 14)}</button>
                  </td>
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

        ${(r.servicos || []).length === 0 ? `
          <div class="mini" style="text-align:center;padding:10px;color:var(--aco-500)">Nenhum serviço adicionado.</div>
        ` : `
          <table class="tabela" style="margin:0">
            <thead>
              <tr>
                <th>Serviço</th>
                <th style="width:80px;text-align:center">Qtd</th>
                <th style="width:110px;text-align:right">Valor Unit.</th>
                <th style="width:110px;text-align:right">Subtotal</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody>
              ${r.servicos.map((it, idx) => `
                <tr>
                  <td>
                    <select class="campo-texto" onchange="S.ui.rascVenda.servicos[${idx}].servicoId=this.value;atualizarItemRascVenda('servico', ${idx});renderFolha()" style="width:100%;height:32px;font-size:12px">
                      <option value="">— Selecione o Serviço —</option>
                      ${servicos.map(s => `<option value="${s.id}" ${it.servicoId === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
                    </select>
                  </td>
                  <td style="text-align:center">
                    <input type="number" class="campo-texto" value="${it.qtd || 1}" min="1" step="1" oninput="S.ui.rascVenda.servicos[${idx}].qtd=+this.value||1;renderFolha()" style="width:65px;height:32px;text-align:center">
                  </td>
                  <td style="text-align:right">
                    <input type="number" class="campo-texto" value="${it.valor || 0}" step="0.50" oninput="S.ui.rascVenda.servicos[${idx}].valor=+this.value||0;renderFolha()" style="width:95px;height:32px;text-align:right">
                  </td>
                  <td style="text-align:right;font-weight:700" class="num">
                    ${brl((it.qtd || 1) * (it.valor || 0))}
                  </td>
                  <td style="text-align:center">
                    <button class="btn-icone-perigo" onclick="S.ui.rascVenda.servicos.splice(${idx}, 1);renderFolha()">${ico('lixo', 14)}</button>
                  </td>
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
          <input type="number" class="campo-texto" value="${r.desconto || 0}" step="1" oninput="S.ui.rascVenda.desconto=+this.value||0;renderFolha()" style="width:110px;height:34px;text-align:right">
        </div>
        <div style="font-size:18px;font-weight:800;color:var(--verde)">
          Total Líquido: ${brl(totalVenda)}
        </div>
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
      S.ui.rascVenda.pecas.push({
        pecaId: pPrim.id || '',
        nome: pPrim.nome || '',
        qtd: 1,
        valor: Number(pPrim.venda || 0)
      });
    } else {
      S.ui.rascVenda.servicos = S.ui.rascVenda.servicos || [];
      const sPrim = (S.servicos && S.servicos[0]) || {};
      S.ui.rascVenda.servicos.push({
        servicoId: sPrim.id || '',
        nome: sPrim.nome || '',
        qtd: 1,
        valor: Number(sPrim.valor || 0)
      });
    }
    renderFolha();
  }

  function atualizarItemRascVenda(tipo, idx) {
    if (tipo === 'peca') {
      const it = S.ui.rascVenda.pecas[idx];
      const p = (S.pecas || []).find(x => x.id === it.pecaId);
      if (p) {
        it.nome = p.nome;
        it.valor = Number(p.venda || 0);
      }
    } else {
      const it = S.ui.rascVenda.servicos[idx];
      const s = (S.servicos || []).find(x => x.id === it.servicoId);
      if (s) {
        it.nome = s.nome;
        it.valor = Number(s.valor || 0);
      }
    }
  }

  function salvarNovaVendaConfirmada() {
    const r = S.ui.rascVenda;
    if (!r) return;
    if (!r.clienteId) {
      torrar('Selecione o cliente para a venda.', 'erro');
      return;
    }
    const temItens = (r.pecas && r.pecas.length > 0) || (r.servicos && r.servicos.length > 0);
    if (!temItens) {
      torrar('Adicione ao menos uma peça ou serviço na venda.', 'erro');
      return;
    }

    const cli = (S.clientes || []).find(c => c.id === r.clienteId) || {};
    const vend = (S.mecanicos || []).find(m => m.id === r.vendedorId) || {};

    const subP = (r.pecas || []).reduce((acc, it) => acc + (it.qtd * it.valor), 0);
    const subS = (r.servicos || []).reduce((acc, it) => acc + (it.qtd * it.valor), 0);
    const total = Math.max(0, subP + subS - Number(r.desconto || 0));

    // 1. Dedução de Estoque Físico das Peças
    S.pecas = S.pecas || [];
    (r.pecas || []).forEach(it => {
      const p = S.pecas.find(x => x.id === it.pecaId);
      if (p) {
        p.qtd = Math.max(0, (Number(p.qtd) || 0) - (Number(it.qtd) || 0));
      }
    });

    // 2. Geração de Conta a Receber
    S.contasReceber = S.contasReceber || [];
    const prazoDias = r.formaPgto === 'Boleto' ? (cli.prazo || 28) : 0;
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + prazoDias);

    const novaConta = {
      id: uid('cr'),
      parte: cli.nome || 'Cliente Balcão',
      cli: cli.id,
      desc: `Venda #${'V' + ((S.vendas || []).length + 101)} (${r.formaPgto || 'À vista'})`,
      valor: total,
      venc: dataVenc.toISOString().substring(0, 10),
      tipo: 'receber',
      st: r.formaPgto === 'Pix' || r.formaPgto === 'Dinheiro' ? 'paga' : 'pendente',
      origem: 'venda_direta'
    };
    S.contasReceber.push(novaConta);

    // Se foi pago na hora em dinheiro/pix, lança movimento no caixa
    if (novaConta.st === 'paga') {
      S.lancamentosCaixa = S.lancamentosCaixa || [];
      S.lancamentosCaixa.push({
        id: uid('cx'),
        data: hoje(),
        desc: `Recebimento Venda Balcão - ${cli.nome}`,
        tipo: 'entrada',
        valor: total,
        forma: r.formaPgto
      });
    }

    // 3. Registra a Venda
    S.vendas = S.vendas || [];
    S.vendas.unshift({
      id: uid('vd'),
      codigo: 'V' + (S.vendas.length + 101),
      clienteId: cli.id,
      clienteNome: cli.nome,
      clienteDoc: cli.doc,
      vendedorId: vend.id,
      vendedorNome: vend.nome,
      data: r.data || hoje(),
      prev: r.prev || hoje(),
      tipo: r.tipo || 'Balcão',
      formaPgto: r.formaPgto || 'Pix',
      desconto: r.desconto || 0,
      pecas: r.pecas || [],
      servicos: r.servicos || [],
      total,
      situacao: 'Finalizada'
    });

    salvar();
    fecharFolha();
    render();
    torrar('Venda concluída com sucesso! Estoque e financeiro atualizados.', 'sucesso');
  }

  // Exportações explícitas para window e globalThis
  global.abrirModalNovaVenda = abrirModalNovaVenda;
  global.folhaNovaVenda = folhaNovaVenda;
  global.adicionarItemRascVenda = adicionarItemRascVenda;
  global.atualizarItemRascVenda = atualizarItemRascVenda;
  global.salvarNovaVendaConfirmada = salvarNovaVendaConfirmada;

  if (typeof window !== 'undefined') {
    window.abrirModalNovaVenda = abrirModalNovaVenda;
    window.folhaNovaVenda = folhaNovaVenda;
    window.adicionarItemRascVenda = adicionarItemRascVenda;
    window.atualizarItemRascVenda = atualizarItemRascVenda;
    window.salvarNovaVendaConfirmada = salvarNovaVendaConfirmada;
  }
})(typeof window !== 'undefined' ? window : globalThis);

