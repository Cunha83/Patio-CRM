/* =====================================================================
   PÁTIO CRM — MÓDULO DE CADASTROS (CLIENTES, VEÍCULOS, SERVIÇOS & BOXES)
===================================================================== */

function viewCadastros() {
  const abas = [
    ['clientes', 'Clientes & Frotas (' + (S.clientes ? S.clientes.length : 0) + ')'],
    ['veiculos', 'Veículos / Caminhões (' + (S.veiculos ? S.veiculos.length : 0) + ')'],
    ['servicos', 'Tabela de Serviços (' + (S.servicos ? S.servicos.length : 0) + ')'],
    ['boxes', 'Boxes do Pátio (' + (S.boxes ? S.boxes.length : 0) + ')']
  ];
  const a = S.ui.abaCad || 'clientes';

  let corpo = '';
  if (a === 'clientes') corpo = tabelaClientes();
  else if (a === 'veiculos') corpo = tabelaVeiculos();
  else if (a === 'servicos') corpo = tabelaServicos();
  else corpo = tabelaBoxes();

  return `
  <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div class="abas" style="margin:0">
      ${abas.map(([k, r]) => `<button data-act="aba-cad" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      ${a === 'clientes' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="cliente">${ico('mais', 14)} Novo Cliente</button>` : ''}
      ${a === 'veiculos' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="veiculo">${ico('mais', 14)} Novo Veículo</button>` : ''}
      ${a === 'servicos' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="servico">${ico('mais', 14)} Novo Serviço</button>` : ''}
      ${a === 'boxes' ? `<button class="btn btn-primario" data-act="novo-cad" data-t="box">${ico('mais', 14)} Novo Box</button>` : ''}
    </div>
  </div>

  ${corpo}`;
}

/* ===== TABELA CLIENTES ===== */
function tabelaClientes() {
  const lista = S.clientes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Razão Social / Nome Fantasia</th>
            <th>CNPJ / CPF</th>
            <th>Contato & WhatsApp</th>
            <th>Cidade / UF</th>
            <th style="width:90px;text-align:center">Prazo</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(c => `
            <tr style="${c.bloqueado ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.nome)}</div>
                ${c.fantasia ? `<div class="mini">${esc(c.fantasia)}</div>` : ''}
              </td>
              <td class="mono">${esc(c.doc || '—')}</td>
              <td>
                <div>${esc(c.contato || '—')}</div>
                <div class="mini mono">${esc(c.fone || '—')}</div>
              </td>
              <td>${esc(c.cidade || '—')}${c.uf ? '/' + esc(c.uf) : ''}</td>
              <td style="text-align:center"><span class="selo">${c.prazo ? c.prazo + 'd' : 'À vista'}</span></td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="ver-cliente" data-id="${c.id}" title="Ficha do Cliente">${ico('doc', 14)}</button>
                  <button class="btn-icone" data-act="editar-cliente" data-id="${c.id}" title="Editar Dados">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cliente" data-id="${c.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA VEÍCULOS ===== */
function tabelaVeiculos() {
  const lista = S.veiculos || [];

  return `
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
            <th style="width:110px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(v => {
            const cl = C(v.cli);
            return `
            <tr>
              <td><span class="placa">${esc(v.placa)}</span></td>
              <td><b>${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</b><div class="mini">Ano: ${esc(v.ano || '—')}</div></td>
              <td>${esc(cl.nome)}</td>
              <td><span class="selo">${esc(v.tipo || 'Cavalo')}</span></td>
              <td style="text-align:right" class="num">${(v.km || 0).toLocaleString('pt-BR')} km</td>
              <td style="text-align:center">
                <button class="btn btn-secundario" data-act="ver-historico-veiculo" data-id="${v.id}" style="padding:4px 8px;font-size:12px">
                  ${ico('historico', 12)} Histórico
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA SERVIÇOS ===== */
function tabelaServicos() {
  const lista = S.servicos || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Serviço</th>
            <th style="width:120px;text-align:center">Tempo Estimado</th>
            <th style="width:140px;text-align:right">Valor Tabelado</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(s => `
            <tr>
              <td><b>${esc(s.nome)}</b></td>
              <td style="text-align:center"><span class="selo">${s.horas || 1} horas</span></td>
              <td style="text-align:right;font-weight:700" class="num">${brl(s.valor)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA BOXES ===== */
function tabelaBoxes() {
  const lista = S.boxes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Identificação do Box</th>
            <th>Especialidade</th>
            <th style="width:120px;text-align:center">Status Atual</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(b => {
            const osNoBox = (S.os || []).find(o => o.box === b.id && o.st !== 'finalizada');
            return `
            <tr>
              <td><b>${esc(b.nome)}</b></td>
              <td><span class="selo">${esc(b.tipo || 'Geral')}</span></td>
              <td style="text-align:center">
                <span class="selo ${osNoBox ? 'selo-executando' : 'selo-fila'}">
                  ${osNoBox ? `Ocupado (OS ${osNoBox.num})` : 'Livre'}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaCliente() {
  const c = C(S.ui.cliAberto);
  if (!c) return '<div class="card card-p">Cliente não encontrado.</div>';

  const veiculosCli = (S.veiculos || []).filter(v => v.cli === c.id);
  const osCli = (S.os || []).filter(o => o.cli === c.id);
  const contasCli = (S.contas || []).filter(ct => ct.parte === c.nome);

  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:18px;font-weight:700">${esc(c.nome)}</h3>
        <div class="mini">CNPJ/CPF: <span class="mono">${esc(c.doc || '—')}</span> · Tel: <b>${esc(c.fone || '—')}</b></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn ${c.bloqueado ? 'btn-sucesso' : 'btn-perigo'}" data-act="bloquear-cliente" data-id="${c.id}" style="font-size:12px;padding:4px 10px">
          ${c.bloqueado ? 'Desbloquear' : 'Bloquear Crédito'}
        </button>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi bom" style="padding:10px;text-align:center">
        <div class="mini">Veículos Cadastrados</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${veiculosCli.length}</div>
      </div>
      <div class="kpi neutro" style="padding:10px;text-align:center">
        <div class="mini">Total de OSs</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${osCli.length}</div>
      </div>
      <div class="kpi aviso" style="padding:10px;text-align:center">
        <div class="mini">Prazo de Pagamento</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${c.prazo ? c.prazo + ' dias' : 'À Vista'}</div>
      </div>
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:8px">Veículos / Frota (${veiculosCli.length}):</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${veiculosCli.map(v => `
        <span class="placa" style="padding:4px 10px;font-size:13px">${esc(v.placa)} — ${esc(v.modelo)}</span>
      `).join('') || '<div class="mini">Nenhum veículo vinculado.</div>'}
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:8px">Endereço & Localização:</div>
    <div class="mini" style="font-size:13px;color:var(--aco-700);line-height:1.5">
      ${esc(c.endereco || '—')}${c.numero ? ', ' + esc(c.numero) : ''} · ${esc(c.bairro || '')}<br>
      ${esc(c.cidade || '—')}/${esc(c.uf || '')} · CEP: ${esc(c.cep || '—')}
    </div>
  </div>`;
}

function folhaCadastro() {
  const tipo = S.ui.cadTipo || 'cliente';
  const r = S.ui.rascCad = S.ui.rascCad || {};

  if (tipo === 'cliente') {
    return `
    <div class="card card-p" style="max-width:600px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">${r.id ? 'Editar Cliente' : 'Novo Cliente / Transportadora'}</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Razão Social / Nome Completo:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Transportes Rodoviários Silva Ltda" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nome Fantasia:</label>
            <input type="text" class="campo-texto" placeholder="Ex: Silva Transportes" data-act="rc" data-c="fantasia" value="${esc(r.fantasia || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ / CPF:</label>
            <input type="text" class="campo-texto" placeholder="00.000.000/0000-00" data-act="rc" data-c="doc" value="${esc(r.doc || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">WhatsApp / Telefone:</label>
            <input type="text" class="campo-texto" placeholder="(11) 98888-7777" data-act="rc" data-c="fone" value="${esc(r.fone || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Contato Responsável:</label>
            <input type="text" class="campo-texto" placeholder="Ex: Carlos (Gerente Frota)" data-act="rc" data-c="contato" value="${esc(r.contato || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Prazo Padrão (Dias):</label>
            <input type="number" class="campo-texto" placeholder="28" data-act="rc" data-c="prazo" value="${r.prazo || 0}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:140px 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CEP:</label>
            <input type="text" class="campo-texto" placeholder="00000-000" data-act="rc" data-c="cep" value="${esc(r.cep || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Logradouro / Endereço:</label>
            <input type="text" class="campo-texto" placeholder="Av. Principal, 1000" data-act="rc" data-c="endereco" value="${esc(r.endereco || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Cidade:</label>
            <input type="text" class="campo-texto" placeholder="Campinas" data-act="rc" data-c="cidade" value="${esc(r.cidade || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">UF:</label>
            <input type="text" class="campo-texto" placeholder="SP" data-act="rc" data-c="uf" value="${esc(r.uf || '')}" style="width:100%;height:34px;text-transform:uppercase">
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">
          ${ico('check', 14)} Salvar Cliente
        </button>
      </div>
    </div>`;
  }

  if (tipo === 'servico') {
    return `
    <div class="card card-p" style="max-width:480px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Serviço na Tabela</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Serviço:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Troca de Tambor e Lona de Freio" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Valor Mão de Obra (R$):</label>
            <input type="number" class="campo-texto" placeholder="0.00" data-act="rc" data-c="valor" value="${r.valor || ''}" step="0.50" style="width:100%;height:34px;font-weight:700">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Horas Estimadas:</label>
            <input type="number" class="campo-texto" placeholder="2.0" data-act="rc" data-c="horas" value="${r.horas || 1}" step="0.5" style="width:100%;height:34px">
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad">Salvar Serviço</button>
      </div>
    </div>`;
  }

  if (tipo === 'box') {
    return `
    <div class="card card-p" style="max-width:450px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Box de Atendimento</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Nome / Identificação:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Box 07 — Lavador / Lubrificação" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Especialidade:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Mecânica Geral / Freios" data-act="rc" data-c="tipo" value="${esc(r.tipo || '')}" style="width:100%;height:34px">
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad">Salvar Box</button>
      </div>
    </div>`;
  }

  return '';
}
