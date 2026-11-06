/**
 * Módulo Orquestrador e Fachada: vendas.js
 * Pátio-CRM — Módulo de Vendas (Produtos & Serviços Direto / Balcão)
 * Inspirado no modelo eGestor ERP com baixa em estoque e contas a receber.
 * Arquitetura Modular (< 300 linhas).
 *
 * Submódulos especializados em js/modules/:
 * - vendas_pdv_form.js: abertura de nova venda, PDV balcão, carrinho e finalização
 * - vendas_lote_acoes.js: visualização de detalhes, exclusão, ações em lote e WhatsApp
 */

function viewVendas() {
  // Garante dados mockados realistas para o setor de veículos pesados se vazio
  if (!S.vendas || S.vendas.length === 0) {
    S.vendas = [
      { id: 'v101', codigo: 'V-101', clienteNome: 'Transportes Rodoviários Silva Ltda', clienteDoc: '12.345.678/0001-90', clienteFone: '11988887777', vendedorNome: 'Marcos Diesel', data: hoje(), prev: hoje(), tipo: 'Balcão / OS', situacao: 'Finalizada', total: 4850.00, temFinanceiroPendente: true, temAnexoNfe: true, itens: [{ cod: 'MOL-01', nome: 'Feixe de Molas Scania R440 Traseiro Reforçado', qtd: 2, valor: 2100.00 }, { cod: 'BUC-04', nome: 'Bucha de Bronze do Eixo Tensor', qtd: 4, valor: 162.50 }] },
      { id: 'v102', codigo: 'V-102', clienteNome: 'Expresso Rodoviário Cordeiro', clienteDoc: '98.765.432/0001-10', clienteFone: '19999881122', vendedorNome: 'Roberto Molas', data: hoje(), prev: hoje(), tipo: 'Peças Balcão', situacao: 'Entregue', total: 3200.00, temFinanceiroPendente: false, temAnexoNfe: true, itens: [{ cod: 'FRE-02', nome: 'Jogo de Lonas de Freio Master Volvo FH', qtd: 4, valor: 450.00 }, { cod: 'TAM-01', nome: 'Tambor de Freio Dianteiro Volvo', qtd: 2, valor: 700.00 }] },
      { id: 'v103', codigo: 'V-103', clienteNome: 'Logística Brasul Frotas', clienteDoc: '33.444.555/0001-22', clienteFone: '11977776655', vendedorNome: 'Marcos Diesel', data: hoje(), prev: hoje(), tipo: 'Ordem de Serviço', situacao: 'Em espera', total: 5400.00, temFinanceiroPendente: true, temAnexoNfe: false, itens: [{ cod: 'EMB-01', nome: 'Kit Embreagem Sachs 430mm Mercedes Actros', qtd: 1, valor: 4200.00 }, { cod: 'SRV-02', nome: 'Mão de Obra Troca de Embreagem Pesada', qtd: 1, valor: 1200.00 }] }
    ];
  }

  const vendas = S.vendas || [];
  const filtro = S.ui.filtroVendas || 'todas';
  const busca = (S.ui.buscaVendas || '').toLowerCase().trim();

  // Filtragem
  let filtradas = vendas;
  if (filtro !== 'todas') {
    filtradas = filtradas.filter(v => (v.situacao || 'Finalizada').toLowerCase() === filtro.toLowerCase());
  }
  if (busca) {
    filtradas = filtradas.filter(v => 
      (v.codigo || '').toLowerCase().includes(busca) ||
      (v.clienteNome || '').toLowerCase().includes(busca) ||
      (v.vendedorNome || '').toLowerCase().includes(busca) ||
      (v.id || '').toLowerCase().includes(busca)
    );
  }

  // KPIs de Vendas
  const totalFaturado = vendas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
  const totalHoje = vendas.filter(v => v.data === hoje()).reduce((acc, v) => acc + (Number(v.total) || 0), 0);
  const ticketMedio = vendas.length > 0 ? (totalFaturado / vendas.length) : 0;
  const emEspera = vendas.filter(v => (v.situacao || 'Finalizada') === 'Em espera').length;
  const subAbaVendas = S.ui.subAbaVendas || 'vendas';

  return `
  <!-- KPIs de Vendas estilo eGestor -->
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Faturamento Total</div>
      <div class="v">${brlCurto(totalFaturado)}</div>
      <div class="d">${vendas.length} vendas realizadas</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Vendas Hoje</div>
      <div class="v">${brlCurto(totalHoje)}</div>
      <div class="d">Movimentação do dia atual</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('cartao', 14)} Ticket Médio</div>
      <div class="v">${brlCurto(ticketMedio)}</div>
      <div class="d">Média por pedido / venda</div>
    </div>
    <div class="kpi ${emEspera > 0 ? 'alerta' : 'bom'}">
      <div class="r">${ico('relogio', 14)} Em Espera</div>
      <div class="v">${emEspera}</div>
      <div class="d">Aguardando entrega ou faturamento</div>
    </div>
  </div>

  <!-- FRENTE 3: FOLDER TABS NO TOPO -->
  <div class="folder-tabs">
    <button class="folder-tab ${subAbaVendas === 'vendas' ? 'ativo' : ''}" onclick="S.ui.subAbaVendas='vendas';render()">
      ${ico('carrinho', 15)} <span>VENDAS / ORDENS DE SERVIÇO</span>
    </button>
    <button class="folder-tab ${subAbaVendas === 'devolucoes' ? 'ativo' : ''}" onclick="S.ui.subAbaVendas='devolucoes';render()">
      ${ico('relogio', 15)} <span>DEVOLUÇÕES DE BALCÃO</span>
    </button>
  </div>

  <!-- BARRA DE AÇÕES EM LOTE & NAVEGADOR DE PERÍODO -->
  <div class="barra-acoes-lote">
    <div class="barra-acoes-grupo">
      <button class="btn btn-primario" onclick="abrirModalNovaVenda()" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
        ${ico('mais', 14)} Nova Venda
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteVendas('duplicar')" title="Duplicar venda selecionada">
        ${ico('doc', 14)} Duplicar
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteVendas('nfe')" title="Gerar NF-e a partir da venda">
        ${ico('relatorios', 14)} Gerar XML/NF
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteVendas('whatsapp')" style="color:#047857;border-color:#6ee7b7" title="Enviar resumo da venda por WhatsApp ao cliente">
        ${ico('zap', 14)} Enviar por WhatsApp
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteVendas('imprimir')" title="Imprimir espelho de venda">
        ${ico('imprimir', 14)} Imprimir
      </button>
      <button class="btn btn-neutro" onclick="acaoEmLoteVendas('excluir')" style="color:#b91c1c" title="Excluir selecionadas">
        ${ico('lixo', 14)} Excluir
      </button>
    </div>

    <!-- Navegador de Período -->
    <div class="barra-acoes-grupo">
      <div class="navegador-periodo">
        <button type="button" onclick="torrar('Filtrando Mês Anterior')">&lt;</button>
        <span class="periodo-label">Outubro 2026</span>
        <button type="button" onclick="torrar('Filtrando Próximo Mês')">&gt;</button>
      </div>
      <button class="btn btn-neutro" onclick="torrar('Período resetado para o Mês Atual')" style="font-size:12px;font-weight:600">
        Mês Atual
      </button>
    </div>
  </div>

  <!-- Campo de Busca e Chips de Situação -->
  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:1">
      <input type="text" class="campo-texto" placeholder="🔍 Buscar por Cliente, Código ou Vendedor..." 
             value="${esc(S.ui.buscaVendas || '')}" 
             oninput="S.ui.buscaVendas=this.value;render()" 
             style="max-width:400px;width:100%;height:36px;font-size:13px">

      <div class="chips" style="display:inline-flex;gap:4px">
        <button class="chip ${filtro === 'todas' ? 'ativo' : ''}" onclick="S.ui.filtroVendas='todas';render()">Todas (${vendas.length})</button>
        <button class="chip ${filtro === 'finalizada' ? 'ativo' : ''}" onclick="S.ui.filtroVendas='finalizada';render()">Finalizadas</button>
        <button class="chip ${filtro === 'em espera' ? 'ativo' : ''}" onclick="S.ui.filtroVendas='em espera';render()">Em espera (${emEspera})</button>
        <button class="chip ${filtro === 'entregue' ? 'ativo' : ''}" onclick="S.ui.filtroVendas='entregue';render()">Entregues</button>
      </div>
    </div>
  </div>

  <!-- TABELA DENSA DE ALTO CONTRASTE COM SELEÇÃO MÚLTIPLA -->
  <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <div class="tabela-responsiva">
      <table class="tabela-densa">
        <thead>
          <tr>
            <th style="width:36px;text-align:center">
              <input type="checkbox" onchange="document.querySelectorAll('.chk-venda').forEach(c=>c.checked=this.checked)" style="cursor:pointer">
            </th>
            <th style="width:110px">Cód</th>
            <th>Cliente / Razão Social</th>
            <th>Vendedor / Mecânico</th>
            <th style="width:100px">Data</th>
            <th style="width:100px">Entrega</th>
            <th style="width:110px">Tipo</th>
            <th style="width:120px;text-align:center">Situação</th>
            <th style="width:130px;text-align:right">Total</th>
            <th style="width:160px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtradas.length === 0 ? `
            <tr>
              <td colspan="10" style="text-align:center;padding:32px;color:var(--aco-500)">
                Nenhuma venda encontrada. Clique em <b>"Nova Venda"</b> para registrar uma venda direta de balcão de peças ou serviços.
              </td>
            </tr>
          ` : filtradas.map(v => {
            const sit = v.situacao || 'Finalizada';
            const badgeClass = sit === 'Finalizada' ? 'badge-info' : (sit === 'Entregue' ? 'badge-sucesso' : 'badge-alerta');
            const temPendente = v.temFinanceiroPendente !== false;
            const temAnexo = v.temAnexoNfe || false;

            return `
            <tr>
              <td style="text-align:center">
                <input type="checkbox" class="chk-venda" value="${v.id}" style="cursor:pointer">
              </td>
              <td class="mono">
                <div style="display:inline-flex;align-items:center;gap:4px">
                  <span style="font-weight:700">#${esc(v.codigo || v.id || '')}</span>
                  ${temPendente ? `<span title="Financeiro a receber pendente" style="color:#ef4444;font-weight:800;font-size:12px;cursor:help">$</span>` : ''}
                  ${temAnexo ? `<span title="Nota Fiscal / Anexo gerado" style="color:#2563eb;font-size:12px;cursor:help">📎</span>` : ''}
                </div>
              </td>
              <td>
                <div style="font-weight:700;color:#0f172a">${esc(v.clienteNome || 'Cliente Balcão')}</div>
                ${v.clienteDoc ? `<div class="mini mono" style="color:#64748b">${esc(v.clienteDoc)}</div>` : ''}
              </td>
              <td>${esc(v.vendedorNome || '—')}</td>
              <td>${dataBR(v.data || hoje())}</td>
              <td>${dataBR(v.prev || v.data || hoje())}</td>
              <td><span class="selo" style="font-size:11px">${esc(v.tipo || 'Balcão')}</span></td>
              <td style="text-align:center">
                <span class="badge-vivid ${badgeClass}">${sit}</span>
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(v.total || 0)}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn btn-neutro" onclick="enviarVendaWhatsApp('${v.id}')" style="padding:4px 7px;font-size:11px;color:#047857;border-color:#6ee7b7" title="Enviar Resumo no WhatsApp do Cliente">
                    ${ico('zap', 12)}
                  </button>
                  <button class="btn btn-secundario" onclick="abrirDetalhesVenda('${v.id}')" style="padding:4px 8px;font-size:11px" title="Ver Detalhes">
                    ${ico('doc', 12)} Ver
                  </button>
                  ${sit === 'Em espera' ? `
                    <button class="btn btn-sucesso" onclick="faturarVendaEmEspera('${v.id}')" style="padding:4px 8px;font-size:11px" title="Faturar e Baixar Estoque">
                      ${ico('check', 12)}
                    </button>
                  ` : ''}
                  <button class="btn-icone-perigo" onclick="excluirVenda('${v.id}')" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// Exportações explícitas no escopo global e sincronização
(function (global) {
  'use strict';

  const funcoesVendas = [
    'viewVendas',
    'abrirModalNovaVenda',
    'folhaNovaVenda',
    'adicionarItemRascVenda',
    'atualizarItemRascVenda',
    'salvarNovaVendaConfirmada',
    'abrirDetalhesVenda',
    'excluirVenda',
    'faturarVendaEmEspera',
    'enviarVendaWhatsApp',
    'acaoEmLoteVendas'
  ];

  funcoesVendas.forEach((nomeFn) => {
    if (typeof global[nomeFn] === 'function') {
      if (typeof window !== 'undefined') window[nomeFn] = global[nomeFn];
      if (typeof globalThis !== 'undefined') globalThis[nomeFn] = global[nomeFn];
    }
  });

  if (typeof window !== 'undefined') {
    window.viewVendas = viewVendas;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.viewVendas = viewVendas;
  }
})(typeof window !== 'undefined' ? window : globalThis);
