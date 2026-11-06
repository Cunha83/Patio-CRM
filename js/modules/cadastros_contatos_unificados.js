/* =====================================================================
   PÁTIO CRM — CONTATOS UNIFICADOS (CLIENTES, FORNECEDORES & TRANSPORTADORES)
   Submódulo de listagem, busca e filtragem da base de contatos
   ===================================================================== */

function viewContatosUnificados(abaAtiva) {
  const subAba = abaAtiva || (S.ui && S.ui.subAbaContatos) || 'clientes';
  if (S.ui) S.ui.subAbaContatos = subAba;

  // Garante dados mockados para veículos pesados se vazios
  if (!S.clientes || S.clientes.length === 0) {
    S.clientes = [
      { id: 'cli1', codigo: 'CLI-001', nome: 'Transportes Rodoviários Silva Ltda', fantasia: 'TransSilva Logística', doc: '12.345.678/0001-90', fone: '(11) 98888-7777', cidade: 'São Paulo', uf: 'SP', tags: ['Frota Scania', 'Bitrem Graneleiro', 'Linha Pesada'], contato: 'Sr. Marcos' },
      { id: 'cli2', codigo: 'CLI-002', nome: 'Expresso Rodoviário Cordeiro S.A.', fantasia: 'Expresso Cordeiro', doc: '98.765.432/0001-10', fone: '(19) 99988-1122', cidade: 'Campinas', uf: 'SP', tags: ['Volvo FH 540', 'Câmara Frigorífica', 'Pesado'], contato: 'Dona Helena' },
      { id: 'cli3', codigo: 'CLI-003', nome: 'Logística Brasul Frotas e Cargas', fantasia: 'Brasul Frotas', doc: '33.444.555/0001-22', fone: '(11) 97777-6655', cidade: 'Guarulhos', uf: 'SP', tags: ['Mercedes Actros', 'Baú Carga Geral'], contato: 'Dr. Paulo' }
    ];
  }

  if (!S.fornecedores || S.fornecedores.length === 0) {
    S.fornecedores = [
      { id: 'for1', codigo: 'FOR-001', nome: 'Suspentech Indústria e Comércio de Autopeças', fantasia: 'Suspentech Suspensões', doc: '05.123.456/0001-88', fone: '(54) 3211-9000', cidade: 'Caxias do Sul', uf: 'RS', tags: ['Molas Parabólicas', 'Suspensão a Ar', 'Pinos Cementados'], contato: 'Depto Vendas' },
      { id: 'for2', codigo: 'FOR-002', nome: 'Fras-le Componentes de Fricção e Freios S.A.', fantasia: 'Fras-le Freios', doc: '88.765.432/0001-99', fone: '(54) 3289-1000', cidade: 'Caxias do Sul', uf: 'RS', tags: ['Lonas Heavy Duty', 'Pastilhas Freio', 'Tambores'], contato: 'Comercial' },
      { id: 'for3', codigo: 'FOR-003', nome: 'Cindumel Molas e Componentes Automotivos', fantasia: 'Cindumel Molas', doc: '61.222.333/0001-44', fone: '(11) 2468-1200', cidade: 'Guarulhos', uf: 'SP', tags: ['Lâminas Mestra', 'Grampos Aço 1045'], contato: 'Vendas SP' }
    ];
  }

  if (!S.transportadores || S.transportadores.length === 0) {
    S.transportadores = [
      { id: 'tra1', codigo: 'TRA-001', nome: 'TransVale Cargas Pesadas & Pranchas Especiais', fantasia: 'TransVale Log', doc: '14.555.666/0001-77', fone: '(41) 98765-4321', cidade: 'Curitiba', uf: 'PR', tags: ['Prancha Rebaixada', 'Transporte Chassi', 'Socorro Pesado'], contato: 'Operações' },
      { id: 'tra2', codigo: 'TRA-002', nome: 'RodoExpress Logística e Distribuição Rodoviária', fantasia: 'RodoExpress', doc: '22.333.444/0001-55', fone: '(11) 99123-4567', cidade: 'São Bernardo do Campo', uf: 'SP', tags: ['Truck 6x2', 'Entrega Expressa Peças'], contato: 'Expedição' }
    ];
  }

  const clientes = S.clientes || [];
  const fornecedores = S.fornecedores || [];
  const transportadores = S.transportadores || [];
  const busca = ((S.ui && S.ui.buscaCad) || '').toLowerCase().trim();

  let listaAtual = [];
  let singularTipo = 'cliente';
  let labelNovo = '+ Novo Cliente';

  if (subAba === 'fornecedores') {
    listaAtual = fornecedores;
    singularTipo = 'fornecedor';
    labelNovo = '+ Novo Fornecedor';
  } else if (subAba === 'transportadores') {
    listaAtual = transportadores;
    singularTipo = 'transportador';
    labelNovo = '+ Novo Transportador';
  } else {
    listaAtual = clientes;
    singularTipo = 'cliente';
    labelNovo = '+ Novo Cliente';
  }

  if (busca) {
    listaAtual = listaAtual.filter(item => {
      const tagsStr = (item.tags || []).join(' ').toLowerCase();
      return (item.nome || '').toLowerCase().includes(busca) ||
             (item.fantasia || '').toLowerCase().includes(busca) ||
             (item.codigo || item.id || '').toLowerCase().includes(busca) ||
             (item.doc || '').toLowerCase().includes(busca) ||
             (item.fone || '').toLowerCase().includes(busca) ||
             (item.cidade || '').toLowerCase().includes(busca) ||
             tagsStr.includes(busca);
    });
  }

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px">
    <div style="display:flex;gap:8px;border-bottom:2px solid var(--aco-200);padding-bottom:2px">
      <button class="btn ${subAba === 'clientes' ? 'btn-primario' : 'btn-neutro'}" 
              onclick="if(typeof viewContatosUnificados==='function')document.getElementById('conteudo-cadastros').innerHTML=viewContatosUnificados('clientes')" 
              style="padding:6px 14px;font-size:13px;font-weight:700">
        🏢 Clientes & Frotistas (${clientes.length})
      </button>
      <button class="btn ${subAba === 'fornecedores' ? 'btn-primario' : 'btn-neutro'}" 
              onclick="if(typeof viewContatosUnificados==='function')document.getElementById('conteudo-cadastros').innerHTML=viewContatosUnificados('fornecedores')" 
              style="padding:6px 14px;font-size:13px;font-weight:700">
        🏭 Fornecedores de Peças (${fornecedores.length})
      </button>
      <button class="btn ${subAba === 'transportadores' ? 'btn-primario' : 'btn-neutro'}" 
              onclick="if(typeof viewContatosUnificados==='function')document.getElementById('conteudo-cadastros').innerHTML=viewContatosUnificados('transportadores')" 
              style="padding:6px 14px;font-size:13px;font-weight:700">
        🚛 Transportadores & Fretes (${transportadores.length})
      </button>
    </div>

    <div style="display:flex;gap:8px;align-items:center">
      <input type="text" class="campo-texto" placeholder="🔍 Buscar por Razão, CNPJ, Telefone, Cidade ou Tag..." 
             value="${esc((S.ui && S.ui.buscaCad) || '')}" 
             oninput="S.ui.buscaCad=this.value;if(typeof viewContatosUnificados==='function')document.getElementById('conteudo-cadastros').innerHTML=viewContatosUnificados('${subAba}')" 
             style="width:300px;height:36px;font-size:12.5px">
      <button class="btn btn-sucesso" data-act="novo-cad" data-t="${singularTipo}" style="height:36px;padding:0 14px;font-size:12.5px;font-weight:700">
        ${labelNovo}
      </button>
    </div>
  </div>

  <div class="card" style="box-shadow:var(--sombra-p)">
    <div class="tabela-responsiva">
      <table class="tabela" style="width:100%">
        <thead>
          <tr style="background:var(--aco-050);border-bottom:2px solid var(--aco-200)">
            <th style="width:90px;font-size:11px;text-transform:uppercase;color:var(--aco-600)">Código</th>
            <th style="font-size:11px;text-transform:uppercase;color:var(--aco-600)">Razão Social / Nome Fantasia</th>
            <th style="width:150px;font-size:11px;text-transform:uppercase;color:var(--aco-600)">CNPJ / CPF</th>
            <th style="width:130px;font-size:11px;text-transform:uppercase;color:var(--aco-600)">Contato / Tel</th>
            <th style="width:140px;font-size:11px;text-transform:uppercase;color:var(--aco-600)">Localidade</th>
            <th style="font-size:11px;text-transform:uppercase;color:var(--aco-600)">Segmentação / Tags de Frota</th>
            <th style="width:130px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--aco-600)">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${listaAtual.length === 0 ? `
            <tr>
              <td colspan="7" style="text-align:center;padding:32px;color:var(--aco-500)">
                Nenhum registro encontrado para o filtro atual.
              </td>
            </tr>
          ` : listaAtual.map(item => `
            <tr style="border-bottom:1px solid var(--aco-100)">
              <td>
                <span class="mono" style="font-size:11px;background:var(--aco-100);padding:2px 6px;border-radius:4px;color:var(--aco-700)">
                  ${esc(item.codigo || item.id)}
                </span>
              </td>
              <td>
                <div style="font-weight:700;color:var(--aco-900);font-size:13px">${esc(item.nome)}</div>
                ${item.fantasia ? `<div class="mini" style="color:var(--aco-500)">${esc(item.fantasia)}</div>` : ''}
              </td>
              <td>
                <span class="mono" style="font-size:12px;color:var(--aco-700)">${esc(item.doc || '—')}</span>
              </td>
              <td>
                <div style="font-size:12px"><b>${esc(item.fone || '—')}</b></div>
                ${item.contato ? `<div class="mini" style="color:var(--aco-500)">${esc(item.contato)}</div>` : ''}
              </td>
              <td>
                <div style="font-size:12px">${esc(item.cidade || '—')}${item.uf ? ' / ' + esc(item.uf) : ''}</div>
              </td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  ${(item.tags || []).map(tg => `
                    <span style="font-size:10.5px;background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:12px;font-weight:600">
                      ${esc(tg)}
                    </span>
                  `).join('') || '<span class="mini" style="color:var(--aco-400)">Sem tags</span>'}
                </div>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="${singularTipo}" data-id="${item.id}" title="Editar Dados Cadastrais">
                    ${ico('edit', 14)}
                  </button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="${singularTipo}" data-id="${item.id}" title="Excluir Registro">
                    ${ico('lixo', 14)}
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function tabelaClientes() { return viewContatosUnificados('clientes'); }
function tabelaFornecedores() { return viewContatosUnificados('fornecedores'); }
function tabelaTransportadores() { return viewContatosUnificados('transportadores'); }

const exportsContatos = { viewContatosUnificados, tabelaClientes, tabelaFornecedores, tabelaTransportadores };
if (typeof window !== 'undefined') Object.assign(window, exportsContatos);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsContatos);

