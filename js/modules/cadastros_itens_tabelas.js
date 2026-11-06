/* =====================================================================
   PÁTIO CRM — TABELAS DE ITENS (VEÍCULOS, PRODUTOS/PEÇAS & SERVIÇOS)
   Submódulo de listagem e ações cadastrais para veículos, peças e serviços
   ===================================================================== */

function tabelaVeiculos() {
  const busca = ((S.ui && S.ui.buscaCad) || '').toLowerCase().trim();
  let lista = S.veiculos || [];

  if (busca) {
    lista = lista.filter(v => {
      const cl = (typeof C === 'function' ? C(v.cli) : (v.cli || {})) || {};
      return (v.placa || '').toLowerCase().includes(busca) ||
        (v.modelo || '').toLowerCase().includes(busca) ||
        (cl.nome || '').toLowerCase().includes(busca);
    });
  }

  return `
  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar por Placa, Modelo ou Proprietário..." 
           value="${esc((S.ui && S.ui.buscaCad) || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Marca & Modelo</th>
            <th>Proprietário / Cliente</th>
            <th>Tipo</th>
            <th style="width:110px;text-align:right">KM Registrado</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum veículo encontrado.</td></tr>` : lista.map(v => {
            const cl = (typeof C === 'function' ? C(v.cli) : (v.cli || {})) || {};
            return `
            <tr>
              <td><span class="placa">${esc(v.placa)}</span></td>
              <td><b>${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</b><div class="mini">Ano: ${esc(v.ano || '—')}</div></td>
              <td><b>${esc(cl.nome || 'Cliente não vinculado')}</b></td>
              <td><span class="selo">${esc(v.tipo || 'Cavalo')}</span></td>
              <td style="text-align:right" class="num">${(v.km || 0).toLocaleString('pt-BR')} km</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn btn-secundario" data-act="ver-historico-veiculo" data-id="${v.id}" style="padding:4px 8px;font-size:11px" title="Ver Histórico de OS">
                    ${ico('historico', 12)} OS
                  </button>
                  <button class="btn-icone" data-act="editar-cad" data-t="veiculo" data-id="${v.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="veiculo" data-id="${v.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function tabelaProdutos() {
  const categorias = ['Todas', 'Suspensão', 'Molas', 'Freio', 'Embreagem', 'Embuchamento de Eixo', 'Cardan', 'Motor', 'Outros'];
  const catAtiva = (S.ui && S.ui.catProdutoAtiva) || 'Todas';
  const busca = ((S.ui && S.ui.buscaCad) || '').toLowerCase().trim();

  let lista = S.pecas || [];
  if (catAtiva !== 'Todas') {
    lista = lista.filter(p => (p.categoria || 'Suspensão') === catAtiva);
  }
  if (busca) {
    lista = lista.filter(p => 
      (p.cod || '').toLowerCase().includes(busca) ||
      (p.nome || '').toLowerCase().includes(busca) ||
      (p.ncm || '').toLowerCase().includes(busca) ||
      (p.categoria || '').toLowerCase().includes(busca)
    );
  }

  return `
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    ${categorias.map(cat => `
      <button class="btn ${catAtiva === cat ? 'btn-primario' : 'btn-neutro'}" 
              onclick="S.ui.catProdutoAtiva='${cat}';render()" 
              style="font-size:11.5px;padding:4px 10px;border-radius:14px">
        ${cat}
      </button>
    `).join('')}
  </div>

  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar peça por código, descrição ou NCM..." 
           value="${esc((S.ui && S.ui.buscaCad) || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th style="width:100px">Código</th>
            <th>Descrição da Peça</th>
            <th style="width:140px">Categoria</th>
            <th style="width:100px;text-align:center">Estoque</th>
            <th style="width:110px;text-align:right">Custo</th>
            <th style="width:110px;text-align:right">Venda</th>
            <th style="width:90px;text-align:center">Margem</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhuma peça encontrada.</td></tr>` : lista.map(p => {
            const custo = Number(p.custo || 0);
            const venda = Number(p.venda || 0);
            const margem = custo > 0 ? Math.round(((venda - custo) / custo) * 100) : 0;
            const estoque = Number(p.qtd != null ? p.qtd : 0);
            const min = Number(p.min != null ? p.min : 1);
            const critico = estoque <= min;

            return `
            <tr>
              <td class="mono"><b>${esc(p.cod || '—')}</b></td>
              <td>
                <div style="font-weight:700;color:var(--aco-900)">${esc(p.nome)}</div>
                <div class="mini mono" style="color:var(--aco-500)">NCM: ${esc(p.ncm || '—')} · CFOP: ${esc(p.cfop || '5102')}</div>
              </td>
              <td><span class="selo">${esc(p.categoria || 'Suspensão')}</span></td>
              <td style="text-align:center">
                <span class="selo ${critico ? 'selo-peca' : 'selo-finalizada'}">
                  ${estoque} ${esc(p.un || 'un')}
                </span>
              </td>
              <td style="text-align:right" class="num">${brl(custo)}</td>
              <td style="text-align:right;font-weight:700;color:var(--verde)" class="num">${brl(venda)}</td>
              <td style="text-align:center;font-weight:600;color:${margem >= 30 ? 'var(--verde)' : 'var(--laranja)'}">
                ${margem}%
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="produto" data-id="${p.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="produto" data-id="${p.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function tabelaServicos() {
  const busca = ((S.ui && S.ui.buscaCad) || '').toLowerCase().trim();
  let lista = S.servicos || [];

  if (busca) {
    lista = lista.filter(s => 
      (s.nome || '').toLowerCase().includes(busca) ||
      (s.cnae || '').toLowerCase().includes(busca) ||
      (s.codServLC116 || '').toLowerCase().includes(busca)
    );
  }

  return `
  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar serviço por descrição, CNAE ou código..." 
           value="${esc((S.ui && S.ui.buscaCad) || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Serviço</th>
            <th style="width:120px;text-align:center">Tempo Est.</th>
            <th style="width:200px">Fiscal (CNAE / ISS)</th>
            <th style="width:140px;text-align:right">Valor (R$)</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum serviço cadastrado.</td></tr>` : lista.map(s => `
            <tr>
              <td><b>${esc(s.nome)}</b></td>
              <td style="text-align:center"><span class="selo">${s.horas || 1} h</span></td>
              <td class="mini">CNAE: ${esc(s.cnae || '—')}<br>LC 116: ${esc(s.codServLC116 || '14.01')}</td>
              <td style="text-align:right;font-weight:700" class="num">${brl(s.valor)}</td>
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
  </div>`;
}

const exportsItens = { tabelaVeiculos, tabelaProdutos, tabelaServicos };
if (typeof window !== 'undefined') Object.assign(window, exportsItens);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsItens);

