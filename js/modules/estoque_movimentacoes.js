/**
 * Módulo: estoque_movimentacoes.js
 * Pátio-CRM — Movimentações, Compras, Ajustes e Fichas de Peças
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function abrirModalAjusteEstoque(tipo) {
    const t = tipo === 'saida' ? 'Baixa / Perda' : 'Entrada Avulsa';
    const pecas = S.pecas || [];
    const pecaOptions = pecas.map(p => `<option value="${p.id}">${esc(p.nome)} (Saldo: ${p.qtd || 0})</option>`).join('');

    abrirModalGenerico(`
      <div style="padding:20px;max-width:440px;width:100%;background:#ffffff;border-radius:10px">
        <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#0f172a">Ajuste de Estoque: ${t}</h3>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Selecione o Produto/Peça:</label>
            <select id="ajuste_peca_id" class="campo" style="width:100%;height:36px;font-size:13px">${pecaOptions}</select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Quantidade a ajustar:</label>
            <input type="number" id="ajuste_qtd" class="campo-texto" min="1" value="1" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Motivo / Justificativa:</label>
            <input type="text" id="ajuste_motivo" class="campo-texto" placeholder="Ex: Quebra, Garantia de fábrica, Contagem física..." style="width:100%;height:36px;font-size:13px">
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
            <button class="btn btn-neutro" onclick="fecharModalGenerico()">Cancelar</button>
            <button class="btn btn-primario" onclick="confirmarAjusteEstoque('${tipo || 'entrada'}')">Confirmar Ajuste</button>
          </div>
        </div>
      </div>
    `);
  }

  async function confirmarAjusteEstoque(tipo) {
    const pecaId = document.getElementById('ajuste_peca_id')?.value;
    const qtd = Number(document.getElementById('ajuste_qtd')?.value || 1);
    const motivo = document.getElementById('ajuste_motivo')?.value || '';
    const peca = (S.pecas || []).find(p => p.id === pecaId);
    if (!peca) return;

    const tipoMov = (tipo === 'saida') ? 'SAIDA_OS' : 'AJUSTE';
    const novaQtd = (tipo === 'saida') ? Math.max(0, (Number(peca.qtd) || 0) - qtd) : ((Number(peca.qtd) || 0) + qtd);

    try {
      const resp = await fetch('/api/estoque/movimentar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: tipoMov,
          produtoId: pecaId,
          qtd: (tipoMov === 'AJUSTE') ? novaQtd : qtd,
          motivo: motivo || `Ajuste manual (${tipo})`
        })
      });
      const dados = await resp.json();
      if (!dados.success) {
        if (typeof torrar === 'function') torrar(dados.error || 'Erro ao movimentar estoque.', 'erro');
        return;
      }
      peca.qtd = dados.saldoAtual !== undefined ? dados.saldoAtual : novaQtd;
    } catch (e) {
      peca.qtd = novaQtd;
    }

    if (typeof salvar === 'function') salvar();
    else if (typeof salvarLocal === 'function') salvarLocal();
    if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
    if (typeof render === 'function') render();
    if (typeof torrar === 'function') torrar(`Ajuste no estoque de ${peca.nome} persistido com sucesso! Saldo: ${peca.qtd}`, 'sucesso');
  }

  function viewNecessidadesCompra() {
    const reqs = S.partRequirements || [];
    return `
    <div class="card">
      <div class="entre" style="margin-bottom:12px">
        <h3 style="font-size:15px;font-weight:700">Necessidades de Compra de Peças</h3>
        <div class="mini">Geradas automaticamente por falta de estoque em OSs aprovadas</div>
      </div>
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>Origem OS</th><th>Peça / Descrição</th>
              <th style="text-align:center;width:100px">Qtd Solicitada</th>
              <th style="text-align:center;width:100px">Atendida</th>
              <th style="text-align:center;width:100px">Urgência</th>
              <th style="text-align:center;width:120px">Status</th>
              <th style="text-align:right;width:120px">Data</th>
            </tr>
          </thead>
          <tbody>
            ${reqs.length ? reqs.map(r => `
              <tr>
                <td><b>OS #${esc(r.osNum || r.osId || '—')}</b></td>
                <td><b>${esc(r.pecaNome || r.nome || 'Peça')}</b></td>
                <td style="text-align:center;font-weight:700">${r.quantidadeSolicitada || r.qtd || 1}</td>
                <td style="text-align:center">${r.quantidadeAtendida || 0}</td>
                <td style="text-align:center"><span class="selo ${r.urgencia === 'alta' ? 'selo-bloqueado' : 'selo-aprovacao'}">${(r.urgencia || 'normal').toUpperCase()}</span></td>
                <td style="text-align:center"><span class="selo">${(r.status || 'pendente').toUpperCase()}</span></td>
                <td style="text-align:right" class="mini">${r.criadoEm ? new Date(r.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--aco-400)">Nenhuma necessidade de compra pendente.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function viewCotacoesCompra() {
    const quotes = S.purchaseQuotes || [];
    return `
    <div class="card">
      <div class="entre" style="margin-bottom:12px">
        <h3 style="font-size:15px;font-weight:700">Cotações com Fornecedores</h3>
        <div class="mini">Comparativo determinístico de preços, prazos e impacto em OS</div>
      </div>
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>Cotação #</th><th>Itens Solicitados</th><th>Fornecedores Consultados</th>
              <th style="text-align:center;width:120px">Status</th>
              <th style="text-align:right;width:120px">Abertura</th>
            </tr>
          </thead>
          <tbody>
            ${quotes.length ? quotes.map(q => `
              <tr>
                <td><b>#${esc(q.numero || q.id)}</b></td>
                <td>${(q.itens || []).map(i => esc(i.nome || i.pecaNome)).join(', ') || '—'}</td>
                <td>${(q.fornecedores || []).length} fornecedor(es)</td>
                <td style="text-align:center"><span class="selo ${q.status === 'aberta' ? 'selo-aprovacao' : 'selo-finalizada'}">${(q.status || 'aberta').toUpperCase()}</span></td>
                <td style="text-align:right" class="mini">${q.criadoEm ? new Date(q.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-400)">Nenhuma cotação cadastrada.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function viewPedidosCompra() {
    const orders = S.purchaseOrders || [];
    return `
    <div class="card">
      <div class="entre" style="margin-bottom:12px">
        <h3 style="font-size:15px;font-weight:700">Pedidos de Compra</h3>
        <div class="mini">Ordens emitidas, alçadas de aprovação e recebimento de mercadorias</div>
      </div>
      <div class="tabela-responsiva">
        <table class="tabela">
          <thead>
            <tr>
              <th>Pedido #</th><th>Fornecedor</th>
              <th style="text-align:right;width:120px">Valor Total</th>
              <th style="text-align:center;width:120px">Previsão</th>
              <th style="text-align:center;width:150px">Status / Alçada</th>
              <th style="text-align:right;width:120px">Data</th>
            </tr>
          </thead>
          <tbody>
            ${orders.length ? orders.map(o => `
              <tr>
                <td><b>#${esc(o.numero || o.id)}</b></td>
                <td>${esc(o.fornecedorNome || o.fornecedorId || '—')}</td>
                <td style="text-align:right;font-weight:700" class="num">${brl(o.valorTotal || 0)}</td>
                <td style="text-align:center" class="mini">${o.previsaoEntrega ? new Date(o.previsaoEntrega).toLocaleDateString('pt-BR') : '—'}</td>
                <td style="text-align:center">
                  <span class="selo ${o.status === 'aguardando_aprovacao' ? 'selo-alerta' : o.status === 'recebido' ? 'selo-finalizada' : 'selo-aprovacao'}">
                    ${(o.status || 'rascunho').toUpperCase().replace('_', ' ')}
                  </span>
                </td>
                <td style="text-align:right" class="mini">${o.criadoEm ? new Date(o.criadoEm).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--aco-400)">Nenhum pedido de compra emitido.</td></tr>
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

  // Exportações explícitas para window e globalThis
  const exportsMov = {
    abrirModalAjusteEstoque,
    confirmarAjusteEstoque,
    viewNecessidadesCompra,
    viewCotacoesCompra,
    viewPedidosCompra,
    folhaPeca,
    folhaNovaPeca
  };
  Object.assign(global, exportsMov);
  if (typeof window !== 'undefined') Object.assign(window, exportsMov);
})(typeof window !== 'undefined' ? window : globalThis);

