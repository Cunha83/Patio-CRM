/* =====================================================================
   PÁTIO CRM — MÓDULO DE ESTOQUE, ALMOXARIFADO & ENTRADA DE NOTAS
===================================================================== */

function calcularSaldosPeca(p) {
  const fisico = Number(p.qtd ?? p.estoqueFisico ?? 0);
  let reservado = Number(p.reservado ?? 0);
  if (Array.isArray(S.os)) {
    for (const o of S.os) {
      if (o.st === 'cancelada' || o.st === 'finalizada') continue;
      for (const item of (o.pecas || [])) {
        if ((item.pecaId === p.id || item.id === p.id) && (item.st === 'reservada' || item.status === 'reservada')) {
          reservado += Number(item.qtd || 0);
        }
      }
    }
  }
  const disponivel = Math.max(0, fisico - reservado);
  return { fisico, reservado, disponivel };
}

function viewEstoque() {
  // Garante dados mockados realistas para o setor pesado se vazio
  if (!S.pecas || S.pecas.length === 0) {
    S.pecas = [
      { id: 'p1', cod: 'MOL-SC-01', nome: 'Feixe de Molas Scania R440 Traseiro Reforçado', cat: 'Molas', custo: 1350.00, venda: 2100.00, qtd: 8, min: 2, un: 'feixe', loc: 'Rua A-01' },
      { id: 'p2', cod: 'FRE-VO-02', nome: 'Jogo de Lonas de Freio Master Volvo FH Heavy Duty', cat: 'Freio', custo: 260.00, venda: 450.00, qtd: 24, min: 6, un: 'jogo', loc: 'Prat. B-03' },
      { id: 'p3', cod: 'TAM-VO-01', nome: 'Tambor de Freio Dianteiro Volvo FH/FM 10 Furos', cat: 'Freio', custo: 420.00, venda: 700.00, qtd: 0, min: 2, un: 'peça', loc: 'Rua C-02' },
      { id: 'p4', cod: 'EMB-MB-01', nome: 'Kit Embreagem Sachs 430mm Mercedes Actros / Axor', cat: 'Embreagem', custo: 2800.00, venda: 4200.00, qtd: 3, min: 1, un: 'kit', loc: 'Box Central' },
      { id: 'p5', cod: 'BUC-SC-04', nome: 'Bucha de Bronze do Eixo Tensor Scania 30mm', cat: 'Componentes Embuchamento de Eixo', custo: 85.00, venda: 162.50, qtd: 16, min: 4, un: 'un', loc: 'Gaveta D-12' },
      { id: 'p6', cod: 'SUS-MB-09', nome: 'Amortecedor Dianteiro Pesado Monroe Mercedes Axor', cat: 'Suspensão', custo: 320.00, venda: 580.00, qtd: 6, min: 2, un: 'par', loc: 'Rua A-04' },
      { id: 'p7', cod: 'CAR-SP-03', nome: 'Cruzeta do Cardan Spicer Heavy Duty Série 1810', cat: 'Cardan', custo: 180.00, venda: 340.00, qtd: 12, min: 3, un: 'un', loc: 'Prat. E-01' }
    ];
  }

  if (!S.servicos || S.servicos.length === 0) {
    S.servicos = [
      { id: 'srv1', cod: 'SRV-01', nome: 'Alinhamento e Geometria a Laser Eixo Dianteiro e Tração', cat: 'Suspensão', preco: 450.00, tempo: '2h' },
      { id: 'srv2', cod: 'SRV-02', nome: 'Substituição de Kit de Embreagem Pesada e Rolamento', cat: 'Embreagem', preco: 1200.00, tempo: '5h' },
      { id: 'srv3', cod: 'SRV-03', nome: 'Arqueamento e Troca de Lâminas de Feixe de Molas', cat: 'Molas', preco: 680.00, tempo: '3h30' },
      { id: 'srv4', cod: 'SRV-04', nome: 'Rebitagem de Lonas e Retífica de Tambores de Freio', cat: 'Freio', preco: 380.00, tempo: '2h' },
      { id: 'srv5', cod: 'SRV-05', nome: 'Embuchamento Completo de Eixo Dianteiro Manga de Eixo', cat: 'Componentes Embuchamento de Eixo', preco: 950.00, tempo: '4h' }
    ];
  }

  const pecas = S.pecas || [];
  const servicos = S.servicos || [];
  const subAba = S.ui.subAbaEstoque || 'produtos';
  const filtro = S.ui.filtroEstoque || 'todos';
  const busca = (S.ui.buscaEstoque || '').toLowerCase().trim();
  const linhasPorPagina = S.ui.linhasPorPaginaEstoque || 100;

  // Cálculos de KPIs de Estoque
  let totalFisico = 0;
  let totalReservado = 0;
  let totalDisponivel = 0;
  let valorTotalCusto = 0;
  let valorTotalVenda = 0;
  let pecasCriticasCount = 0;

  const pecasComSaldos = pecas.map(p => {
    const saldos = calcularSaldosPeca(p);
    totalFisico += saldos.fisico;
    totalReservado += saldos.reservado;
    totalDisponivel += saldos.disponivel;
    valorTotalCusto += (saldos.fisico * (p.custo || 0));
    valorTotalVenda += (saldos.fisico * (p.venda || 0));
    const isCritico = saldos.disponivel <= (p.min || 1);
    if (isCritico) pecasCriticasCount++;
    return { ...p, saldos, isCritico };
  });

  // Filtragem Almoxarifado
  let filtradasPecas = pecasComSaldos;
  if (filtro === 'critico') {
    filtradasPecas = filtradasPecas.filter(p => p.isCritico);
  } else if (filtro === 'reservado') {
    filtradasPecas = filtradasPecas.filter(p => p.saldos.reservado > 0);
  }

  if (busca) {
    filtradasPecas = filtradasPecas.filter(p => 
      (p.nome || '').toLowerCase().includes(busca) ||
      (p.cod || '').toLowerCase().includes(busca) ||
      (p.cat || '').toLowerCase().includes(busca) ||
      (p.loc || '').toLowerCase().includes(busca)
    );
  }

  let filtradosServicos = servicos;
  if (busca) {
    filtradosServicos = filtradosServicos.filter(s =>
      (s.nome || '').toLowerCase().includes(busca) ||
      (s.cod || '').toLowerCase().includes(busca) ||
      (s.cat || '').toLowerCase().includes(busca)
    );
  }

  return `
  <!-- KPIs de Estoque estilo eGestor -->
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('pecas', 14)} Estoque Físico vs Disponível</div>
      <div class="v">${totalDisponivel} <span style="font-size:13px;font-weight:normal;color:var(--aco-500)">/ ${totalFisico} un</span></div>
      <div class="d">${totalReservado} un reservadas para OSs</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('caixa', 14)} Capital Imobilizado</div>
      <div class="v">${brlCurto(valorTotalCusto)}</div>
      <div class="d">Projetado Venda: ${brlCurto(valorTotalVenda)}</div>
    </div>
    <div class="kpi ${pecasCriticasCount ? 'perigo' : 'bom'}">
      <div class="r">${ico('alerta', 14)} Itens Críticos / Ruptura</div>
      <div class="v">${pecasCriticasCount}</div>
      <div class="d">Itens zerados ou abaixo do mínimo</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('livro', 14)} Serviços Padronizados</div>
      <div class="v">${servicos.length}</div>
      <div class="d">Tabela de mão de obra pesada</div>
    </div>
  </div>

  <!-- FRENTE 3: FOLDER TABS NO TOPO -->
  <div class="folder-tabs">
    <button class="folder-tab ${subAba === 'produtos' ? 'ativo' : ''}" onclick="S.ui.subAbaEstoque='produtos';render()">
      ${ico('caixa', 15)} <span>PRODUTOS & PEÇAS (${pecas.length})</span>
    </button>
    <button class="folder-tab ${subAba === 'servicos' ? 'ativo' : ''}" onclick="S.ui.subAbaEstoque='servicos';render()">
      ${ico('livro', 15)} <span>SERVIÇOS & MÃO DE OBRA (${servicos.length})</span>
    </button>
    <button class="folder-tab ${subAba === 'ajuste' ? 'ativo' : ''}" onclick="S.ui.subAbaEstoque='ajuste';render()">
      ${ico('patio', 15)} <span>AJUSTE DE ESTOQUE & INVENTÁRIO</span>
    </button>
  </div>

  <!-- BARRA DE AÇÕES EM LOTE & FILTROS -->
  <div class="barra-acoes-lote">
    <div class="barra-acoes-grupo">
      ${subAba === 'produtos' ? `
        <button class="btn btn-primario" data-act="nova-peca" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
          ${ico('mais', 14)} + Novo Produto
        </button>
        <button class="btn btn-secundario" data-act="importar-xml" style="font-weight:600;display:inline-flex;align-items:center;gap:6px">
          ${ico('upload', 14)} Importar XML NF-e
        </button>
      ` : (subAba === 'servicos' ? `
        <button class="btn btn-primario" data-act="novo-cad" data-t="servico" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
          ${ico('mais', 14)} + Novo Serviço
        </button>
      ` : `
        <button class="btn btn-primario" onclick="abrirModalAjusteEstoque()" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
          ${ico('mais', 14)} + Novo Ajuste Manual
        </button>
      `)}

      <button class="btn btn-neutro" onclick="window.print()" title="Imprimir catálogo">
        ${ico('impressora', 14)} Imprimir
      </button>
    </div>

    <!-- Seletor de Paginação (100 linhas por página) -->
    <div style="display:inline-flex;align-items:center;gap:8px">
      <label style="font-size:12px;color:#64748b;font-weight:600">Exibir:</label>
      <select class="campo" onchange="S.ui.linhasPorPaginaEstoque=Number(this.value);render()" style="height:32px;font-size:12px;padding:2px 8px;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;color:#0f172a">
        <option value="25" ${linhasPorPagina === 25 ? 'selected' : ''}>25 linhas por página</option>
        <option value="50" ${linhasPorPagina === 50 ? 'selected' : ''}>50 linhas por página</option>
        <option value="100" ${linhasPorPagina === 100 ? 'selected' : ''}>100 linhas por página</option>
        <option value="200" ${linhasPorPagina === 200 ? 'selected' : ''}>200 linhas por página</option>
      </select>
    </div>
  </div>

  <!-- Barra de Busca Rápida -->
  <div class="entre" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input type="text" class="campo-texto" placeholder="🔍 Buscar por código, referência (ex: filtro de combustível, molas, pinos, lonas)..." 
             value="${esc(S.ui.buscaEstoque || '')}" 
             oninput="S.ui.buscaEstoque=this.value;render()" 
             style="width:480px;height:38px;font-size:13px;background:#ffffff">

      ${subAba === 'produtos' ? `
        <div class="chips" style="display:inline-flex;gap:4px">
          <button class="chip ${filtro === 'todos' ? 'ativo' : ''}" onclick="S.ui.filtroEstoque='todos';render()">Todos (${pecas.length})</button>
          <button class="chip ${filtro === 'critico' ? 'ativo' : ''}" onclick="S.ui.filtroEstoque='critico';render()">Estoque Crítico (${pecasCriticasCount})</button>
          <button class="chip ${filtro === 'reservado' ? 'ativo' : ''}" onclick="S.ui.filtroEstoque='reservado';render()">Com Reserva</button>
        </div>
      ` : ''}
    </div>
  </div>

  <!-- TABELA DENSA CONFORME A SUB-ABA -->
  ${subAba === 'produtos' ? `
    <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div class="tabela-responsiva">
        <table class="tabela-densa">
          <thead>
            <tr>
              <th style="width:36px;text-align:center">
                <input type="checkbox" onchange="document.querySelectorAll('.chk-peca').forEach(c=>c.checked=this.checked)" style="cursor:pointer">
              </th>
              <th style="width:110px">Cód</th>
              <th>Produto / Peça</th>
              <th style="width:180px">Categoria</th>
              <th style="width:130px;text-align:right">Preço Venda</th>
              <th style="width:130px;text-align:center">Estoque</th>
              <th style="width:120px;text-align:center">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${filtradasPecas.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align:center;padding:36px;color:var(--aco-500)">
                  Nenhum produto encontrado. Clique em <b>"+ Novo Produto"</b> para cadastrar.
                </td>
              </tr>
            ` : filtradasPecas.slice(0, linhasPorPagina).map(p => {
              const disponivel = p.saldos ? p.saldos.disponivel : (p.qtd || 0);
              const isZerado = disponivel <= 0;
              const isBaixo = disponivel <= (p.min || 1);
              const badgeClass = isZerado ? 'badge-perigo' : (isBaixo ? 'badge-alerta' : 'badge-sucesso');
              const badgeLabel = isZerado ? 'Zerado (0 un)' : (isBaixo ? `Crítico (${disponivel} un)` : `${disponivel} ${p.un || 'un'}`);

              return `
              <tr>
                <td style="text-align:center">
                  <input type="checkbox" class="chk-peca" value="${p.id}" style="cursor:pointer">
                </td>
                <td class="mono">
                  <span style="font-weight:700">#${esc(p.cod || p.id || '')}</span>
                </td>
                <td>
                  <div style="font-weight:700;color:#0f172a">${esc(p.nome)}</div>
                  <div class="mini mono" style="color:#64748b">
                    <span>${p.un || 'un'}</span> · <span>Loc: ${esc(p.loc || 'Padrão')}</span> · <span>Mín: ${p.min || 1}</span>
                  </div>
                </td>
                <td>
                  <span class="selo" style="font-weight:600;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1">${esc(p.cat || 'Geral')}</span>
                </td>
                <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">
                  ${brl(p.venda || 0)}
                </td>
                <td style="text-align:center">
                  <span class="badge-vivid ${badgeClass}">${badgeLabel}</span>
                </td>
                <td style="text-align:center">
                  <div style="display:inline-flex;gap:4px">
                    <button class="btn-icone" data-act="ver-peca" data-id="${p.id}" title="Editar">${ico('edit', 14)}</button>
                    <button class="btn-icone-perigo" data-act="excluir-peca-id" data-id="${p.id}" title="Excluir">${ico('lixo', 14)}</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : (subAba === 'servicos' ? `
    <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div class="tabela-responsiva">
        <table class="tabela-densa">
          <thead>
            <tr>
              <th style="width:110px">Cód</th>
              <th>Serviço / Mão de Obra</th>
              <th style="width:180px">Categoria</th>
              <th style="width:130px;text-align:right">Preço Venda</th>
              <th style="width:130px;text-align:center">Tempo Médio</th>
              <th style="width:120px;text-align:center">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${filtradosServicos.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align:center;padding:36px;color:var(--aco-500)">
                  Nenhum serviço cadastrado. Clique em <b>"+ Novo Serviço"</b> para adicionar.
                </td>
              </tr>
            ` : filtradosServicos.slice(0, linhasPorPagina).map(s => `
              <tr>
                <td class="mono">
                  <span style="font-weight:700">#${esc(s.cod || s.id || '')}</span>
                </td>
                <td>
                  <div style="font-weight:700;color:#0f172a">${esc(s.nome)}</div>
                </td>
                <td>
                  <span class="selo" style="font-weight:600;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1">${esc(s.cat || 'Serviços')}</span>
                </td>
                <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">
                  ${brl(s.preco || 0)}
                </td>
                <td style="text-align:center">
                  <span class="badge-vivid badge-info">${esc(s.tempo || '1h')}</span>
                </td>
                <td style="text-align:center">
                  <div style="display:inline-flex;gap:4px">
                    <button class="btn-icone" data-act="editar-cad" data-t="servico" data-id="${s.id}" title="Editar">${ico('edit', 14)}</button>
                    <button class="btn-icone-perigo" data-act="excluir-cad" data-t="servico" data-id="${s.id}" title="Excluir">${ico('lixo', 14)}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : `
    <!-- SUB-ABA AJUSTE DE ESTOQUE -->
    <div class="card" style="padding:20px;border:1px solid #cbd5e1">
      <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#0f172a">Ajuste de Estoque & Balanço Físico</h3>
      <p style="margin:0 0 16px 0;font-size:13px;color:#64748b">
        Realize correções de contagem física, perdas, devoluções de garantia ou entradas avulsas sem nota fiscal.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px">
        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">Entrada Avulsa de Peças</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:12px">Adiciona saldo positivo sem vínculo com NF-e de compra</div>
          <button class="btn btn-primario" onclick="abrirModalAjusteEstoque('entrada')" style="font-size:12px">+ Registrar Entrada</button>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">Baixa / Perda / Garantia</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:12px">Subtrai saldo para itens avariados ou enviados a fabricante</div>
          <button class="btn btn-secundario" onclick="abrirModalAjusteEstoque('saida')" style="font-size:12px;color:#ef4444">- Registrar Baixa</button>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px">Inventário / Balanço Geral</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:12px">Importe planilha CSV ou faça contagem física guiada</div>
          <button class="btn btn-neutro" onclick="torrar('Planilha de inventário disponível para download.','neutro')" style="font-size:12px">📋 Baixar Planilha</button>
        </div>
      </div>
    </div>
  `)}
  `;
}

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

function confirmarAjusteEstoque(tipo) {
  const pecaId = document.getElementById('ajuste_peca_id')?.value;
  const qtd = Number(document.getElementById('ajuste_qtd')?.value || 1);
  const peca = (S.pecas || []).find(p => p.id === pecaId);
  if (!peca) return;
  if (tipo === 'saida') {
    peca.qtd = Math.max(0, (peca.qtd || 0) - qtd);
  } else {
    peca.qtd = (peca.qtd || 0) + qtd;
  }
  salvarLocal();
  fecharModalGenerico();
  render();
  torrar(`Ajuste no estoque de ${peca.nome} efetuado com sucesso!`, 'sucesso');
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
            <th>Origem OS</th>
            <th>Peça / Descrição</th>
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
            <th>Cotação #</th>
            <th>Itens Solicitados</th>
            <th>Fornecedores Consultados</th>
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
            <th>Pedido #</th>
            <th>Fornecedor</th>
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
  salvar();
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

if (typeof window !== 'undefined') {
  window.viewEstoque = viewEstoque;
  window.calcularSaldosPeca = calcularSaldosPeca;
}

