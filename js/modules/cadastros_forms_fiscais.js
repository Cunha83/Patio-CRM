/* =====================================================================
   PÁTIO CRM — FORMULÁRIOS CADASTRAIS FISCAIS & TRIBUTÁRIOS
   Submódulo para formulários de peças com NCM/CEST, serviços e regras tributárias
   ===================================================================== */

function folhaCadastroFiscal(t, r) {
  /* ---------- PRODUTO: Formulário simplificado (tributos vêm do CFOP) ---------- */
  if (t === 'produto') {
    const regras = ((S.cfg && S.cfg.regrasTributarias) || []).filter(x => x.tipo === 'produto');
    const origemOpts = ['0 – Nacional','1 – Estrangeira (Importação Direta)','2 – Estrangeira (Adquirida Mercado Interno)','3 – Nacional c/ Conteúdo Importação > 40%'];
    const selOrigem = origemOpts.map(x => `<option value="${x.split(' – ')[0]}" ${(r.origem||'0')===x.split(' – ')[0]?'selected':''}>${x}</option>`).join('');
    const regraSel = regras.find(x => x.cfop === r.cfop);
    const categorias = ['Suspensão', 'Molas', 'Freio', 'Embreagem', 'Embuchamento de Eixo', 'Cardan', 'Motor', 'Outros'];

    return `
    <div class="card card-p" style="max-width:640px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">${r.id ? 'Editar Produto / Peça' : 'Novo Produto / Peça'}</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div style="display:grid;grid-template-columns:100px 1fr 140px;gap:10px">
          <div><label class="mini">Código</label><input class="campo-texto" data-act="rc" data-c="cod" value="${esc(r.cod||'')}" style="width:100%"></div>
          <div><label class="mini">Nome da Peça / Descrição</label><input class="campo-texto" data-act="rc" data-c="nome" value="${esc(r.nome||'')}" style="width:100%"></div>
          <div>
            <label class="mini">Categoria</label>
            <select class="campo-texto" data-act="rc" data-c="categoria" style="width:100%">
              ${categorias.map(cat => `<option value="${cat}" ${(r.categoria||'Suspensão')===cat?'selected':''}>${cat}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:80px 1fr 1fr 1fr 1fr;gap:10px">
          <div><label class="mini">Unidade</label><input class="campo-texto" data-act="rc" data-c="un" value="${esc(r.un||'un')}" style="width:100%"></div>
          <div><label class="mini">Custo (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="custo" value="${r.custo||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">Preço Venda (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="venda" value="${r.venda||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">Estoque Atual</label><input type="number" class="campo-texto" data-act="rc" data-c="qtd" value="${r.qtd != null ? r.qtd : 0}" step="1" style="width:100%"></div>
          <div><label class="mini">Estoque Mínimo</label><input type="number" class="campo-texto" data-act="rc" data-c="min" value="${r.min != null ? r.min : 1}" step="1" style="width:100%"></div>
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
    const regrasS = ((S.cfg && S.cfg.regrasTributarias) || []).filter(x => x.tipo === 'servico');
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
            <select class="campo-texto" onchange="S.ui.rascCad.tipo=this.value;if(typeof renderFolha==='function')renderFolha();else if(typeof abrirFolha==='function')abrirFolha(folhaCadastro);" style="width:100%">
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
        <div style="border:1px solid var(--petroleo);border-radius:8px;padding:14px;background:var(--petroleo-fraco,#f0fdf4)">
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

  return '';
}

const exportsFormsFiscais = { folhaCadastroFiscal };
if (typeof window !== 'undefined') Object.assign(window, exportsFormsFiscais);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsFormsFiscais);

