/* =====================================================================
   PÁTIO CRM — FORMULÁRIOS & FOLHAS DE CADASTROS (CLIENTES, VEÍCULOS, ETC.)
   Submódulo para fichas de clientes e formulários cadastrais operacionais
   ===================================================================== */

function folhaCliente() {
  const c = (typeof C === 'function' ? C(S.ui && S.ui.cliAberto) : null);
  if (!c) return '<div class="card card-p">Cliente não encontrado.</div>';

  const veiculosCli = (S.veiculos || []).filter(v => v.cli === c.id);
  const osCli = (S.os || []).filter(o => o.cli === c.id);

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
  const t = (S.ui && S.ui.cadTipo) || 'cliente';
  const r = (S.ui && (S.ui.rascCad = S.ui.rascCad || {})) || {};

  if (t === 'cliente') {
    return `
    <div class="card card-p" style="max-width:600px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <h3 style="font-size:17px;font-weight:700;margin:0">${r.id ? 'Editar Cliente' : 'Novo Cliente / Transportadora'}</h3>
          <span style="font-size:12px;padding:4px 8px;background:${r.scoreSerasa ? (r.scoreSerasa>500?'var(--verde)':'var(--tijolo)') : 'var(--aco-200)'};color:${r.scoreSerasa ? '#fff' : 'inherit'};border-radius:4px;cursor:pointer" onclick="if(typeof consultarSerasa==='function')consultarSerasa(document.getElementById('doc_cli').value, 'cli')" id="tag_serasa">Score Serasa: ${r.scoreSerasa || 'Não verificado 🔍'}</span>
        </div>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18) || 'X'}</button>
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
            <div style="display:flex;gap:4px">
              <input type="text" class="campo-texto" placeholder="00.000.000/0000-00" data-act="rc" data-c="doc" value="${esc(r.doc || '')}" style="width:100%;height:34px" id="doc_cli" oninput="if(this.value && this.value.replace(/\D/g,'').length===14 && typeof verificarAutoConsultaCnpj==='function')verificarAutoConsultaCnpj(this.value)" onchange="if(this.value && this.value.replace(/\D/g,'').length >= 11 && typeof abrirModalConsultaCliente==='function') abrirModalConsultaCliente(this.value)">
              <button type="button" class="btn btn-primario" onclick="if(typeof abrirModalConsultaCliente==='function')abrirModalConsultaCliente(document.getElementById('doc_cli').value)" style="padding:0 10px;font-size:12px;font-weight:600;white-space:nowrap" title="Consultar dados via API (Sintegra & Serasa)" id="btn_consultar_cli">🔍 Consultar</button>
            </div>
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
            <label style="font-weight:600;display:block;margin-bottom:4px">E-mail Financeiro / NFe:</label>
            <input type="email" class="campo-texto" placeholder="financeiro@empresa.com" data-act="rc" data-c="email" value="${esc(r.email || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:130px 1fr 60px 100px;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CEP:</label>
            <div style="display:flex;gap:4px">
              <input type="text" class="campo-texto" placeholder="00000-000" data-act="rc" data-c="cep" value="${esc(r.cep || '')}" style="width:100%;height:34px" id="cep_cli">
              <button type="button" class="btn btn-secundario" onclick="if(typeof buscarCep==='function')buscarCep(document.getElementById('cep_cli').value, 'cli')" style="padding:0 8px" title="Buscar CEP">🔍</button>
            </div>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Logradouro / Endereço:</label>
            <input type="text" class="campo-texto" placeholder="Av. das Nações" data-act="rc" data-c="endereco" value="${esc(r.endereco || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nº:</label>
            <input type="text" class="campo-texto" placeholder="100" data-act="rc" data-c="numero" value="${esc(r.numero || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">UF:</label>
            <input type="text" class="campo-texto" placeholder="SP" data-act="rc" data-c="uf" value="${esc(r.uf || 'SP')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Bairro:</label>
            <input type="text" class="campo-texto" placeholder="Distrito Industrial" data-act="rc" data-c="bairro" value="${esc(r.bairro || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Cidade:</label>
            <input type="text" class="campo-texto" placeholder="São Paulo" data-act="rc" data-c="cidade" value="${esc(r.cidade || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Inscrição Estadual (IE):</label>
            <input type="text" class="campo-texto" placeholder="Isento ou Nº" data-act="rc" data-c="ie" value="${esc(r.ie || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid var(--aco-150);padding-top:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Condição Padrão de Faturamento:</label>
            <select class="campo-select" data-act="rc" data-c="prazo" style="width:100%;height:34px">
              <option value="0" ${!r.prazo ? 'selected' : ''}>À Vista (PIX / Dinheiro)</option>
              <option value="15" ${r.prazo == 15 ? 'selected' : ''}>Boleto 15 Dias</option>
              <option value="28" ${r.prazo == 28 ? 'selected' : ''}>Boleto 28 Dias (Padrão Transportadoras)</option>
              <option value="30" ${r.prazo == 30 ? 'selected' : ''}>Boleto 30 Dias</option>
              <option value="45" ${r.prazo == 45 ? 'selected' : ''}>Boleto 45 Dias</option>
            </select>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Limite de Crédito em Aberto (R$):</label>
            <input type="number" class="campo-texto" placeholder="Ex: 15000" data-act="rc" data-c="limiteCredito" value="${r.limiteCredito || 0}" step="500" style="width:100%;height:34px">
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

  // Delegação para formulários fiscais se for produto, serviço ou regra tributária
  if (['produto', 'servico', 'regra-tributaria'].includes(t)) {
    if (typeof folhaCadastroFiscal === 'function') {
      return folhaCadastroFiscal(t, r);
    }
  }

  /* ---------- Formulário genérico para demais entidades ---------- */
  const campos = {
    veiculo: [['placa','Placa'],['modelo','Modelo'],['ano','Ano'],['tipo','Tipo (cavalo, carreta, truck)'],['km','KM atual','number']],
    fornecedor: [['nome','Razão social'],['fantasia','Nome fantasia'],['doc','CNPJ'],['fone','Telefone'],['email','E-mail'],['contato','Pessoa de contato'],['cep','CEP'],['endereco','Endereço'],['cidade','Cidade'],['uf','UF']],
    mecanico: [['nome','Nome do mecânico'],['especialidade','Especialidade (Geral, Freios, Elétrica)'],['fone','Telefone']],
    box: [['nome','Nome do box'],['tipo','Tipo (elevador, vala, solda)']]
  }[t] || [];

  const extra = t === 'veiculo' ? `<div style="margin-bottom:10px"><label style="font-weight:600;display:block;margin-bottom:4px">Cliente dono</label><select data-act="rc" data-c="cli" style="width:100%;height:34px" class="campo-select">${(S.clientes||[]).map(c=>`<option value="${c.id}" ${r.cli===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></div>` : '';
  const titulo = (r.id ? 'Editar ' : 'Novo ') + ({veiculo:'veículo',box:'box',fornecedor:'fornecedor',mecanico:'mecânico'}[t] || t);

  return `
    <div class="card card-p" style="max-width:500px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">${titulo}</h3>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18) || 'X'}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        ${extra}
        ${campos.map(([k,l,tp])=>{
          let inputHtml = `<input ${tp?'type="'+tp+'"':''} value="${esc(r[k]??'')}" class="campo-texto" data-act="rc" data-c="${k}" style="width:100%;height:34px" id="dyn_${k}">`;
          let btn = '';
          if(k === 'placa') btn = `<button class="btn btn-secundario" onclick="if(typeof consultarPlaca==='function')consultarPlaca(document.getElementById('dyn_${k}').value)" style="padding:0 8px" title="Consultar Sinesp">🔍</button>`;
          if(k === 'doc') btn = `<button class="btn btn-secundario" onclick="if(typeof buscarCNPJ==='function')buscarCNPJ(document.getElementById('dyn_${k}').value, 'dyn')" style="padding:0 8px" title="Consultar Receita WS">🔍</button>`;
          if(k === 'cep') btn = `<button class="btn btn-secundario" onclick="if(typeof buscarCep==='function')buscarCep(document.getElementById('dyn_${k}').value, 'dyn')" style="padding:0 8px" title="Buscar CEP">🔍</button>`;
          
          if(btn) inputHtml = `<div style="display:flex;gap:4px">${inputHtml}${btn}</div>`;
          return `<div><label style="font-weight:600;display:block;margin-bottom:4px">${l}</label>${inputHtml}</div>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad">Salvar</button>
      </div>
    </div>`;
}

const exportsCadForms = { folhaCliente, folhaCadastro };
if (typeof window !== 'undefined') Object.assign(window, exportsCadForms);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsCadForms);
