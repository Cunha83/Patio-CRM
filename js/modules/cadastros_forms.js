/* =====================================================================
   PÁTIO CRM — FORMULÁRIOS & FOLHAS DE CADASTROS (CLIENTES, PEÇAS, ETC.)
   ===================================================================== */

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
  const t = S.ui.cadTipo || 'cliente';
  const r = S.ui.rascCad = S.ui.rascCad || {};

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
              <input type="text" class="campo-texto" placeholder="00.000.000/0000-00" data-act="rc" data-c="doc" value="${esc(r.doc || '')}" style="width:100%;height:34px" id="doc_cli" oninput="if(this.value && this.value.replace(/\D/g,'').length===14)verificarAutoConsultaCnpj(this.value)" onchange="if(this.value && this.value.replace(/\D/g,'').length >= 11) abrirModalConsultaCliente(this.value)">
              <button type="button" class="btn btn-primario" onclick="abrirModalConsultaCliente(document.getElementById('doc_cli').value)" style="padding:0 10px;font-size:12px;font-weight:600;white-space:nowrap" title="Consultar dados via API (Sintegra & Serasa)" id="btn_consultar_cli">🔍 Consultar</button>
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
            <label style="font-weight:600;display:block;margin-bottom:4px">Prazo Padrão (Dias):</label>
            <input type="number" class="campo-texto" placeholder="28" data-act="rc" data-c="prazo" value="${r.prazo || 0}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:140px 1fr 140px;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CEP:</label>
            <div style="display:flex;gap:4px"><input type="text" class="campo-texto" placeholder="00000-000" data-act="rc" data-c="cep" value="${esc(r.cep || '')}" style="width:100%;height:34px" id="cep_cli" onblur="if(typeof buscarCep==='function')buscarCep(this.value, 'cli')"><button class="btn btn-secundario" onclick="if(typeof buscarCep==='function')buscarCep(document.getElementById('cep_cli').value, 'cli')" style="padding:0 8px" title="Buscar CEP">🔍</button></div>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Logradouro / Endereço:</label>
            <input type="text" class="campo-texto" placeholder="Av. Principal, 1000" data-act="rc" data-c="endereco" value="${esc(r.endereco || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Inscrição Estadual:</label>
            <input type="text" class="campo-texto" data-act="rc" data-c="ie" value="${esc(r.ie || '')}" style="width:100%;height:34px">
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

        <div style="background:var(--aco-50);border:1px solid var(--aco-150);border-radius:8px;padding:10px 14px">
          <div style="font-weight:700;font-size:12px;color:#1e293b;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>🛡️ Análise de Crédito & Birô (Serasa Experian)</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:10px">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px;font-size:11.5px">Score Serasa (0-1000):</label>
              <input type="number" class="campo-texto" placeholder="Ex: 720" data-act="rc" data-c="scoreSerasa" value="${r.scoreSerasa ?? ''}" id="score_serasa_input" style="width:100%;height:32px">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px;font-size:11.5px">Situação de Risco / Crédito:</label>
              <input type="text" class="campo-texto" placeholder="Ex: Baixo Risco / Regular" data-act="rc" data-c="situacaoSerasa" value="${esc(r.situacaoSerasa || '')}" id="situacao_serasa_input" style="width:100%;height:32px">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px;font-size:11.5px">Consulta Realizada:</label>
              <input type="text" class="campo-texto" readonly value="${r.consultaSerasaRealizada ? 'Sim (Verificado)' : (r.scoreSerasa ? 'Manual' : 'Pendente')}" id="consulta_serasa_status" style="width:100%;height:32px;background:var(--aco-100);color:#475569">
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">
          ${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Cliente
        </button>
      </div>
    </div>`;
  }

  /* ---------- PRODUTO: Formulário simplificado (tributos vêm do CFOP) ---------- */
  if (t === 'produto') {
    const regras = (S.cfg.regrasTributarias||[]).filter(x => x.tipo === 'produto');
    const origemOpts = ['0 – Nacional','1 – Estrangeira (Importação Direta)','2 – Estrangeira (Adquirida Mercado Interno)','3 – Nacional c/ Conteúdo Importação > 40%'];
    const selOrigem = origemOpts.map(x => `<option value="${x.split(' – ')[0]}" ${(r.origem||'0')===x.split(' – ')[0]?'selected':''}>${x}</option>`).join('');
    const regraSel = regras.find(x => x.cfop === r.cfop);

    return `
    <div class="card card-p" style="max-width:640px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Produto / Peça</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div style="display:grid;grid-template-columns:100px 1fr;gap:10px">
          <div><label class="mini">Código</label><input class="campo-texto" data-act="rc" data-c="cod" value="${esc(r.cod||'')}" style="width:100%"></div>
          <div><label class="mini">Nome da Peça / Produto</label><input class="campo-texto" data-act="rc" data-c="nome" value="${esc(r.nome||'')}" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">Unidade</label><input class="campo-texto" data-act="rc" data-c="un" value="${esc(r.un||'un')}" style="width:100%"></div>
          <div><label class="mini">Custo (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="custo" value="${r.custo||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">Preço Venda (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="venda" value="${r.venda||0}" step="0.01" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
          <div><label class="mini">NCM</label><input class="campo-texto" data-act="rc" data-c="ncm" value="${esc(r.ncm||'')}" placeholder="0000.00.00" style="width:100%"></div>
          <div><label class="mini">CEST</label><input class="campo-texto" data-act="rc" data-c="cest" value="${esc(r.cest||'')}" placeholder="00.000.00" style="width:100%"></div>
          <div><label class="mini">cClassTrib (RTC)</label><input class="campo-texto" data-act="rc" data-c="cClassTrib" value="${esc(r.cClassTrib||'')}" placeholder="Ex: 010101" style="width:100%" title="Código de Classificação Tributária da Reforma Tributária"></div>
          <div><label class="mini">Origem</label><select class="campo-texto" data-act="rc" data-c="origem" style="width:100%">${selOrigem}</select></div>
        </div>

        <div style="border-top:1px solid var(--aco-150);padding-top:12px;margin-top:4px">
          <label class="mini" style="font-weight:700">CFOP de Saída (Perfil Tributário)</label>
          <select class="campo-texto" data-act="rc" data-c="cfop" style="width:100%">
            <option value="">— Selecione o CFOP —</option>
            ${regras.map(rg => `<option value="${rg.cfop}" ${r.cfop===rg.cfop?'selected':''}>${rg.cfop} – ${esc(rg.desc)}</option>`).join('')}
          </select>
          ${regraSel ? `<div class="mini" style="margin-top:6px;padding:8px;background:var(--aco-50);border-radius:6px;line-height:1.6">
            <b>Regime Atual:</b> ICMS: ${regraSel.aliqICMS}% (CST ${regraSel.cstICMS}) · IPI: ${regraSel.aliqIPI}% · PIS: ${regraSel.aliqPIS}% · COFINS: ${regraSel.aliqCOFINS}%<br>
            <b style="color:var(--petroleo)">Nova Reforma (EC 132/2023):</b> CBS: ${regraSel.aliqCBS != null ? regraSel.aliqCBS : 0.9}% · IBS: ${regraSel.aliqIBS != null ? regraSel.aliqIBS : 0.1}% (Est: ${regraSel.aliqIBSEst||0.05}% / Mun: ${regraSel.aliqIBSMun||0.05}%) · CST RTC: ${regraSel.cstIBSCBS||'01'} · cClassTrib: ${esc(r.cClassTrib || regraSel.cClassTrib || '010101')}
          </div>` : `<div class="mini" style="margin-top:6px;color:var(--aco-500)">Configure as regras tributárias em <b>Cadastros → Regras Tributárias</b>.</div>`}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Produto</button>
      </div>
    </div>`;
  }

  /* ---------- SERVIÇO: Formulário simplificado (tributos vêm do CFOP/ISS) ---------- */
  if (t === 'servico') {
    const regrasS = (S.cfg.regrasTributarias||[]).filter(x => x.tipo === 'servico');
    const regraSel = regrasS.find(x => x.cfop === r.cfop);

    return `
    <div class="card card-p" style="max-width:650px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Serviço</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div><label class="mini">Descrição do Serviço</label><input class="campo-texto" data-act="rc" data-c="nome" value="${esc(r.nome||'')}" style="width:100%"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">Valor (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="valor" value="${r.valor||0}" step="0.50" style="width:100%"></div>
          <div><label class="mini">Horas de Box</label><input type="number" class="campo-texto" data-act="rc" data-c="horas" value="${r.horas||1}" style="width:100%"></div>
          <div><label class="mini">CNAE</label><input class="campo-texto" data-act="rc" data-c="cnae" value="${esc(r.cnae||'')}" placeholder="4520-0/01" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="mini">Código Serviço (LC 116/2003)</label><input class="campo-texto" data-act="rc" data-c="codServLC116" value="${esc(r.codServLC116||'')}" placeholder="Ex: 14.01" style="width:100%"></div>
          <div><label class="mini">cClassTrib (Reforma Tributária / RTC)</label><input class="campo-texto" data-act="rc" data-c="cClassTrib" value="${esc(r.cClassTrib||'')}" placeholder="Ex: 010101" style="width:100%" title="Código de Classificação Tributária da Reforma Tributária"></div>
        </div>

        <div style="border-top:1px solid var(--aco-150);padding-top:12px;margin-top:4px">
          <label class="mini" style="font-weight:700">CFOP / Regra Tributária</label>
          <select class="campo-texto" data-act="rc" data-c="cfop" style="width:100%">
            <option value="">— Selecione —</option>
            ${regrasS.map(rg => `<option value="${rg.cfop}" ${r.cfop===rg.cfop?'selected':''}>${rg.cfop} – ${esc(rg.desc)}</option>`).join('')}
          </select>
          ${regraSel ? `<div class="mini" style="margin-top:6px;padding:8px;background:var(--aco-50);border-radius:6px;line-height:1.6">
            <b>Regime Atual:</b> ISS: ${regraSel.aliqISS||0}% ${regraSel.issRetido==='S'?'(Retido)':''} · PIS: ${regraSel.aliqPIS}% · COFINS: ${regraSel.aliqCOFINS}%<br>
            <b style="color:var(--petroleo)">Nova Reforma (EC 132/2023):</b> CBS: ${regraSel.aliqCBS != null ? regraSel.aliqCBS : 0.9}% · IBS: ${regraSel.aliqIBS != null ? regraSel.aliqIBS : 0.1}% (Est: ${regraSel.aliqIBSEst||0.05}% / Mun: ${regraSel.aliqIBSMun||0.05}%) · CST RTC: ${regraSel.cstIBSCBS||'01'} · cClassTrib: ${esc(r.cClassTrib || regraSel.cClassTrib || '010101')}
          </div>` : `<div class="mini" style="margin-top:6px;color:var(--aco-500)">Configure as regras tributárias em <b>Cadastros → Regras Tributárias</b>.</div>`}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Serviço</button>
      </div>
    </div>`;
  }

  /* ---------- REGRA TRIBUTÁRIA ---------- */
  if (t === 'regra-tributaria') {
    const sel = (arr, val) => arr.map(x => `<option value="${x.split(' – ')[0]}" ${(r[val]||'')=== x.split(' – ')[0]?'selected':''}>${x}</option>`).join('');
    const cstICMS = ['00 – Tributada integralmente','10 – Tributada com cobrança por ST','20 – Com redução de base de cálculo','30 – Isenta/não tributada, com ST','40 – Isenta','41 – Não tributada','50 – Suspensão','51 – Diferimento','60 – ICMS cobrado anteriormente por ST','70 – Redução da BC e cobrança ST','90 – Outros'];
    const cstIPI = ['00 – Entrada com recuperação de crédito','01 – Entrada tributada com alíquota zero','49 – Outras entradas','50 – Saída tributada','51 – Saída tributada com alíquota zero','52 – Saída isenta','53 – Saída não tributada','54 – Saída imune','55 – Saída com suspensão','99 – Outras saídas'];
    const cstPISCOFINS = ['01 – Operação Tributável (BC = Valor da Operação)','02 – Operação Tributável (BC = Valor da Operação - Alíquota Diferenciada)','04 – Operação Tributável (ST)','05 – Operação Tributável (Substituição Tributária)','06 – Operação Tributável (Alíquota Zero)','07 – Operação Isenta da Contribuição','08 – Operação sem Incidência da Contribuição','09 – Operação com Suspensão da Contribuição','49 – Outras Operações de Saída','99 – Outras Operações'];
    const cstRTC = [
      '01 – Tributada integralmente com alíquota padrão',
      '02 – Tributada com alíquota diferenciada / reduzida',
      '03 – Tributada com redução de base de cálculo',
      '04 – Tributada por valor fixo (ad rem)',
      '05 – Imunidade',
      '06 – Não incidência',
      '07 – Isenção',
      '08 – Suspensão',
      '09 – Diferimento',
      '90 – Outros / Regime Específico'
    ];

    let camposImpostos = '';
    if (r.tipo === 'produto' || r.tipo === 'entrada') {
      camposImpostos = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">CST ICMS</label><select class="campo-texto" data-act="rc" data-c="cstICMS" style="width:100%">${sel(cstICMS,'cstICMS')}</select></div>
          <div><label class="mini">Alíq. ICMS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqICMS" value="${r.aliqICMS||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">Redução BC ICMS</label><input type="number" class="campo-texto" data-act="rc" data-c="redBCICMS" value="${r.redBCICMS||0}" step="0.01" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">CST IPI</label><select class="campo-texto" data-act="rc" data-c="cstIPI" style="width:100%">${sel(cstIPI,'cstIPI')}</select></div>
          <div><label class="mini">Alíq. IPI (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqIPI" value="${r.aliqIPI||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">% MVA (ST)</label><input type="number" class="campo-texto" data-act="rc" data-c="mvaICMS" value="${r.mvaICMS||0}" step="0.01" style="width:100%"></div>
        </div>
      `;
    } else if (r.tipo === 'servico') {
      camposImpostos = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="mini">Alíquota ISS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqISS" value="${r.aliqISS||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">ISS Retido?</label>
            <select class="campo-texto" data-act="rc" data-c="issRetido" style="width:100%">
              <option value="N" ${r.issRetido!=='S'?'selected':''}>Não</option>
              <option value="S" ${r.issRetido==='S'?'selected':''}>Sim</option>
            </select>
          </div>
        </div>
      `;
    }

    return `
    <div class="card card-p" style="max-width:760px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <h3 style="font-size:17px;font-weight:700">Regra Tributária (CFOP)</h3>
          <div class="mini">Convivência Harmoniosa: Sistema Legado & Nova Reforma Tributária</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div style="display:grid;grid-template-columns:120px 1fr 150px;gap:10px">
          <div><label class="mini">CFOP</label><input type="text" class="campo-texto" data-act="rc" data-c="cfop" value="${esc(r.cfop||'')}" style="width:100%;font-weight:bold"></div>
          <div><label class="mini">Descrição (Uso interno)</label><input type="text" class="campo-texto" data-act="rc" data-c="desc" value="${esc(r.desc||'')}" style="width:100%"></div>
          <div><label class="mini">Tipo de Operação</label>
            <select class="campo-texto" onchange="S.ui.rascCad.tipo=this.value;renderFolha()" style="width:100%">
              <option value="produto" ${r.tipo==='produto'?'selected':''}>Produto/Saída</option>
              <option value="entrada" ${r.tipo==='entrada'?'selected':''}>Produto/Entrada</option>
              <option value="servico" ${r.tipo==='servico'?'selected':''}>Serviço (NFS-e)</option>
            </select>
          </div>
        </div>

        <!-- 1. TRIBUTOS DO MODELO ATUAL / TRANSIÇÃO -->
        <div style="border:1px solid var(--aco-200);border-radius:8px;padding:12px;background:#fff">
          <div style="font-weight:700;color:var(--aco-800);margin-bottom:8px;font-size:12px">1. Tributos Atuais (ICMS, ISS, IPI, PIS, COFINS):</div>
          ${camposImpostos}
          
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:10px">
            <div><label class="mini">CST PIS</label><select class="campo-texto" data-act="rc" data-c="cstPIS" style="width:100%">${sel(cstPISCOFINS,'cstPIS')}</select></div>
            <div><label class="mini">Alíq. PIS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqPIS" value="${r.aliqPIS||0}" step="0.01" style="width:100%"></div>
            <div><label class="mini">CST COFINS</label><select class="campo-texto" data-act="rc" data-c="cstCOFINS" style="width:100%">${sel(cstPISCOFINS,'cstCOFINS')}</select></div>
            <div><label class="mini">Alíq. COFINS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqCOFINS" value="${r.aliqCOFINS||0}" step="0.01" style="width:100%"></div>
          </div>
        </div>

        <!-- 2. BLOCO DA NOVA REFORMA TRIBUTÁRIA (EC 132/2023 - IVA DUAL & IS) -->
        <div style="border:1px solid var(--petroleo);border-radius:8px;padding:14px;background:var(--petroleo-fraco)">
          <div class="entre" style="margin-bottom:10px">
            <div style="font-weight:700;color:var(--petroleo);font-size:13px">
              2. Nova Reforma Tributária (IVA Dual: CBS Federal / IBS Subnacional & Imposto Seletivo)
            </div>
            <span class="selo selo-finalizada" style="font-size:10.5px">Vigência EC 132/2023</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini">CST IBS/CBS (RTC)</label>
              <select class="campo-texto" data-act="rc" data-c="cstIBSCBS" style="width:100%">
                ${sel(cstRTC, 'cstIBSCBS')}
              </select>
            </div>
            <div>
              <label class="mini">Classificação Fiscal (cClassTrib RTC)</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="cClassTrib" value="${esc(r.cClassTrib || '010101')}" placeholder="Ex: 010101" style="width:100%">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini">CBS Federal (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqCBS" value="${r.aliqCBS != null ? r.aliqCBS : 0.90}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">IBS Estadual (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIBSEst" value="${r.aliqIBSEst != null ? r.aliqIBSEst : 0.05}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">IBS Municipal (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIBSMun" value="${r.aliqIBSMun != null ? r.aliqIBSMun : 0.05}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">Total IBS (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIBS" value="${r.aliqIBS != null ? r.aliqIBS : 0.10}" step="0.01" style="width:100%">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
            <div>
              <label class="mini">Redução BC IBS/CBS (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="redBCIBSCBS" value="${r.redBCIBSCBS || 0}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">CST Imposto Seletivo (IS)</label>
              <select class="campo-texto" data-act="rc" data-c="cstIS" style="width:100%">
                <option value="00" ${(r.cstIS||'00')==='00'?'selected':''}>00 – Não incidente</option>
                <option value="01" ${r.cstIS==='01'?'selected':''}>01 – Tributado</option>
                <option value="07" ${r.cstIS==='07'?'selected':''}>07 – Isento</option>
              </select>
            </div>
            <div>
              <label class="mini">Alíq. Imposto Seletivo (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIS" value="${r.aliqIS || 0}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">Princípio do Destino</label>
              <select class="campo-texto" data-act="rc" data-c="indDestino" style="width:100%">
                <option value="1" ${(r.indDestino||'1')==='1'?'selected':''}>Local do Consumo (Destino)</option>
                <option value="0" ${r.indDestino==='0'?'selected':''}>Estabelecimento Prestador</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600">${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Regra</button>
      </div>
    </div>`;
  }

  /* ---------- Formulário genérico para demais entidades ---------- */
  const campos = {
    veiculo: [['placa','Placa'],['modelo','Modelo'],['ano','Ano'],['tipo','Tipo (cavalo, carreta, truck)'],['km','KM atual','number']],
    fornecedor: [['nome','Razão social'],['fantasia','Nome fantasia'],['doc','CNPJ'],['fone','Telefone'],['email','E-mail'],['contato','Pessoa de contato'],['cep','CEP'],['endereco','Endereço'],['cidade','Cidade'],['uf','UF']],
    mecanico: [['nome','Nome do mecânico'],['especialidade','Especialidade (Geral, Freios, Elétrica)'],['fone','Telefone']],
    box: [['nome','Nome do box'],['tipo','Tipo (elevador, vala, solda)']]
  }[t];

  const extra = t === 'veiculo' ? `<div style="margin-bottom:10px"><label style="font-weight:600;display:block;margin-bottom:4px">Cliente dono</label><select data-act="rc" data-c="cli" style="width:100%;height:34px" class="campo-select">${(S.clientes||[]).map(c=>`<option value="${c.id}" ${r.cli===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></div>` : '';
  const titulo = {veiculo:'Novo veículo',box:'Novo box',fornecedor:'Novo fornecedor',mecanico:'Novo mecânico'}[t];

  return `
    <div class="card card-p" style="max-width:500px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">${titulo}</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
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

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.folhaCliente = folhaCliente;
  window.folhaCadastro = folhaCadastro;
}
