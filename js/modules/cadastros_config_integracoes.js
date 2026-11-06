/**
 * Módulo: cadastros_config_integracoes.js
 * Pátio-CRM — Configurações Gerais: Boletos, Réguas de Cobrança, Formas de Pgto, Contas Caixa, Usuários e APIs
 * Arquitetura Modular (< 350 linhas).
 */

function viewBoletos() {
  return `<div class="card card-p" style="max-width:800px;margin:0 auto">
    <p>A configuração de emissão e homologação de boletos bancários estará disponível no próximo módulo financeiro.</p>
  </div>`;
}

function viewCobrancas() {
  const regua = S.cfg.reguaCobranca || [{ dias: -3, msg: "Aviso de vencimento" }, { dias: 1, msg: "Aviso de atraso" }];
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Régua de Cobrança Automatizada (WhatsApp/E-mail)</h3>
      <div class="mini">Configure os gatilhos baseados na data de vencimento da conta a receber. Valores negativos significam "antes do vencimento".</div>
    </div>
    
    <table class="tabela">
      <thead><tr><th>Dias pro Vencimento</th><th>Tipo de Mensagem / Gatilho</th><th></th></tr></thead>
      <tbody>
      ${regua.map((r, i) => `
        <tr>
          <td style="width:150px"><input type="number" class="campo-texto" value="${r.dias}" oninput="S.cfg.reguaCobranca[${i}].dias=+this.value" style="width:100%"></td>
          <td><input type="text" class="campo-texto" value="${esc(r.msg)}" oninput="S.cfg.reguaCobranca[${i}].msg=this.value" style="width:100%"></td>
          <td style="width:40px"><button class="btn-icone-perigo" onclick="S.cfg.reguaCobranca.splice(${i},1); render()">${ico('lixo', 14)||'X'}</button></td>
        </tr>
      `).join('')}
      </tbody>
    </table>
    
    <div style="margin-top:12px">
      <button class="btn btn-secundario" onclick="(S.cfg.reguaCobranca = S.cfg.reguaCobranca||[]).push({dias:0, msg:'Nova Regra'}); render()">+ Adicionar Gatilho</button>
    </div>
  </div>`;
}

function renderSimplesLista(lista, objPath, itemName) {
  return `
  <div class="card card-p" style="max-width:600px;margin:0 auto">
    <div style="margin-bottom:12px;font-weight:600">${itemName}s cadastrados:</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${lista.map((x, i) => `
        <div style="display:flex;gap:8px">
          <input type="text" class="campo-texto" value="${esc(x.nome || x)}" style="flex:1" oninput="const L = ${objPath}; if(typeof L[${i}]==='string'){L[${i}]=this.value}else{L[${i}].nome=this.value}">
          <button class="btn-icone-perigo" onclick="${objPath}.splice(${i},1); render()" title="Remover">${ico('lixo', 14)||'X'}</button>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <input type="text" class="campo-texto" id="novo_item_${itemName}" placeholder="Adicionar novo..." style="flex:1">
      <button class="btn btn-secundario" onclick="const v=document.getElementById('novo_item_${itemName}').value; if(v){ ${objPath}.push(v); salvar(); render(); }">Adicionar</button>
    </div>
    <div style="margin-top:24px;border-top:1px solid var(--aco-150);padding-top:12px;text-align:right">
      <button class="btn btn-primario" data-act="salvar-cfg">Salvar Lista</button>
    </div>
  </div>`;
}

function viewFormasPgto() { return renderSimplesLista(S.cfg.formasPgto || [], 'S.cfg.formasPgto', 'Forma'); }
function viewContasCaixa() { return renderSimplesLista(S.cfg.contasCaixa || [], 'S.cfg.contasCaixa', 'Conta/Banco'); }

function viewUsuarios() {
  const lista = S.cfg.usuarios || [];
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <table class="tabela">
      <thead><tr><th>Nome</th><th>Login</th><th>Papel</th><th></th></tr></thead>
      <tbody>
      ${lista.map((u, i) => `
        <tr>
          <td><input type="text" class="campo-texto" value="${esc(u.nome)}" oninput="S.cfg.usuarios[${i}].nome=this.value" style="width:100%"></td>
          <td><input type="text" class="campo-texto" value="${esc(u.login)}" oninput="S.cfg.usuarios[${i}].login=this.value" style="width:100%"></td>
          <td>
            <select class="campo-texto" oninput="S.cfg.usuarios[${i}].papel=this.value" style="width:100%">
              <option ${u.papel==='Gerente'?'selected':''}>Gerente</option>
              <option ${u.papel==='Consultor'?'selected':''}>Consultor</option>
              <option ${u.papel==='Caixa'?'selected':''}>Caixa</option>
            </select>
          </td>
          <td style="width:40px"><button class="btn-icone-perigo" onclick="S.cfg.usuarios.splice(${i},1); render()">${ico('lixo', 14)||'X'}</button></td>
        </tr>
      `).join('')}
      </tbody>
    </table>
    <div style="margin-top:12px">
      <button class="btn btn-secundario" onclick="S.cfg.usuarios.push({nome:'Novo', login:'novo', papel:'Consultor'}); render()">+ Adicionar Usuário</button>
    </div>
    <div style="margin-top:24px;border-top:1px solid var(--aco-150);padding-top:12px;text-align:right">
      <button class="btn btn-primario" data-act="salvar-cfg">Salvar Usuários</button>
    </div>
  </div>`;
}

function viewAPI() {
  const i = S.cfg.integracoes || { whatsapp: {}, serasa: {}, placas: {}, fiscal: {} };
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Central de Integrações e APIs</h3>
      <div class="mini">Preencha os tokens das plataformas que a oficina utiliza.</div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">WhatsApp (API Brasil)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">DeviceToken</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.whatsapp.deviceToken=this.value" value="${esc(i.whatsapp?.deviceToken||'')}" style="width:100%"></div>
      <div><label class="mini">Bearer Token</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.whatsapp.bearerToken=this.value" value="${esc(i.whatsapp?.bearerToken||'')}" style="width:100%"></div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Consulta Veicular (Sinesp / CheckPlaca)</div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:20px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">API Key de Consulta de Placa</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.placas.apiKey=this.value" value="${esc(i.placas?.apiKey||'')}" style="width:100%"></div>
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Consulta de Crédito (Serasa Experian)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">Client ID</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.serasa.clientId=this.value" value="${esc(i.serasa?.clientId||'')}" style="width:100%"></div>
      <div><label class="mini">Client Secret</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.serasa.clientSecret=this.value" value="${esc(i.serasa?.clientSecret||'')}" style="width:100%"></div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Consulta Fiscal (ReceitaWS / Sintegra)</div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">API Key ReceitaWS (Opcional - para volume alto)</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.fiscal.apiKey=this.value" value="${esc(i.fiscal?.apiKey||'')}" style="width:100%"></div>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.viewBoletos = viewBoletos;
  window.viewCobrancas = viewCobrancas;
  window.renderSimplesLista = renderSimplesLista;
  window.viewFormasPgto = viewFormasPgto;
  window.viewContasCaixa = viewContasCaixa;
  window.viewUsuarios = viewUsuarios;
  window.viewAPI = viewAPI;
}
if (typeof globalThis !== 'undefined') {
  globalThis.viewBoletos = viewBoletos;
  globalThis.viewCobrancas = viewCobrancas;
  globalThis.renderSimplesLista = renderSimplesLista;
  globalThis.viewFormasPgto = viewFormasPgto;
  globalThis.viewContasCaixa = viewContasCaixa;
  globalThis.viewUsuarios = viewUsuarios;
  globalThis.viewAPI = viewAPI;
}

