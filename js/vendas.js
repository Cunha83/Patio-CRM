/* =====================================================================
   PÁTIO CRM — MÓDULO DE VENDAS (PRODUTOS & SERVIÇOS DIRETO / BALCÃO)
   INSPIRADO NO MODELO eGestor ERP COM BAIXA EM ESTOQUE E CONTAS A RECEBER
===================================================================== */

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

  <!-- KPIs de Vendas estilo ERP -->
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Faturamento Total</div>
      <div class="v">${brlCurto(totalFaturado)}</div>
      <div class="d">${vendas.length} vendas registradas</div>
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

/* =====================================================================
   MODAL NOVA VENDA
===================================================================== */
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

/* =====================================================================
   DETALHES E EXCLUSÃO DE VENDA
===================================================================== */
function abrirDetalhesVenda(id) {
  const venda = (S.vendas || []).find(v => v.id === id);
  if (!venda) return;

  abrirFolha(() => `
  <div class="card card-p" style="max-width:720px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:700;margin:0">Venda #${venda.codigo || venda.id} — ${esc(venda.clienteNome || 'Cliente Balcão')}</h3>
        <div class="mini mono">Data: ${dataBR(venda.data)} · Forma: ${esc(venda.formaPgto || 'À vista')} · Situação: ${esc(venda.situacao || 'Finalizada')}</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <!-- Itens -->
    ${(venda.pecas || []).length > 0 ? `
      <div style="margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px">Peças / Produtos</div>
        <table class="tabela">
          <thead>
            <tr>
              <th>Peça</th>
              <th style="width:80px;text-align:center">Qtd</th>
              <th style="width:110px;text-align:right">Valor Unit.</th>
              <th style="width:110px;text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${venda.pecas.map(p => `
              <tr>
                <td><b>${esc(p.nome)}</b></td>
                <td style="text-align:center">${p.qtd} un</td>
                <td style="text-align:right">${brl(p.valor)}</td>
                <td style="text-align:right;font-weight:700">${brl(p.qtd * p.valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    ${(venda.servicos || []).length > 0 ? `
      <div style="margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px">Mão de Obra / Serviços</div>
        <table class="tabela">
          <thead>
            <tr>
              <th>Serviço</th>
              <th style="width:80px;text-align:center">Qtd</th>
              <th style="width:110px;text-align:right">Valor Unit.</th>
              <th style="width:110px;text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${venda.servicos.map(s => `
              <tr>
                <td><b>${esc(s.nome)}</b></td>
                <td style="text-align:center">${s.qtd} un</td>
                <td style="text-align:right">${brl(s.valor)}</td>
                <td style="text-align:right;font-weight:700">${brl(s.qtd * s.valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px;align-items:center">
      <div style="font-size:18px;font-weight:800;color:var(--verde)">
        Total da Venda: ${brl(venda.total || 0)}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" onclick="window.print()">${ico('imprimir', 14)} Imprimir Comprovante</button>
        <button class="btn btn-secundario" data-act="fechar">Fechar</button>
      </div>
    </div>
  </div>`);
}

function excluirVenda(id) {
  pedirConfirmacao('excluir_venda_' + id, 'Toque de novo para excluir o registro desta venda', () => {
    S.vendas = (S.vendas || []).filter(v => v.id !== id);
    salvar();
    render();
    torrar('Venda excluída.');
  });
}

function faturarVendaEmEspera(id) {
  const venda = (S.vendas || []).find(v => v.id === id);
  if (!venda) return;

  // Baixa estoque
  S.pecas = S.pecas || [];
  (venda.pecas || []).forEach(it => {
    const p = S.pecas.find(x => x.id === it.pecaId);
    if (p) p.qtd = Math.max(0, (Number(p.qtd) || 0) - (Number(it.qtd) || 0));
  });

  venda.situacao = 'Finalizada';
  salvar();
  render();
  torrar('Venda faturada e estoque deduzido!', 'sucesso');
}

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.viewVendas = viewVendas;
  window.abrirModalNovaVenda = abrirModalNovaVenda;
  window.folhaNovaVenda = folhaNovaVenda;
  window.adicionarItemRascVenda = adicionarItemRascVenda;
  window.atualizarItemRascVenda = atualizarItemRascVenda;
  window.salvarNovaVendaConfirmada = salvarNovaVendaConfirmada;
  window.abrirDetalhesVenda = abrirDetalhesVenda;
  window.excluirVenda = excluirVenda;
  window.faturarVendaEmEspera = faturarVendaEmEspera;
}
