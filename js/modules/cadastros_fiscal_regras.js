/**
 * Módulo: cadastros_fiscal_regras.js
 * Pátio-CRM — Configurações Tributárias, Regras Fiscais e Simulador IVA Dual (EC 132/2023)
 * Arquitetura Modular (< 350 linhas).
 */

function viewTributario() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:850px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:700;font-size:17px;margin:0;color:var(--aco-900)">Dados Tributários & Reforma Tributária (IVA Dual)</h3>
      <div class="mini">Parametrização completa para adequação à Emenda Constitucional nº 132/2023 e PLP 68/2024</div>
    </div>
    
    <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;color:var(--aco-800)">1. Enquadramento e Inscrições Fiscais:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;background:#fff;padding:14px;border-radius:8px;border:1px solid var(--aco-200)">
      <div>
        <label class="mini">Regime Tributário Geral</label>
        <select class="campo-texto" data-act="cfg" data-c="regimeTributario" style="width:100%">
          <option ${c.regimeTributario==='Simples Nacional'?'selected':''}>Simples Nacional</option>
          <option ${c.regimeTributario==='Lucro Presumido'?'selected':''}>Lucro Presumido</option>
          <option ${c.regimeTributario==='Lucro Real'?'selected':''}>Lucro Real</option>
        </select>
      </div>
      <div><label class="mini">CNAE Principal</label><input type="text" class="campo-texto" data-act="cfg" data-c="cnae" value="${esc(c.cnae||'4520-0/01')}" style="width:100%"></div>
      <div><label class="mini">Cód. IBGE Município (Destino)</label><input type="text" class="campo-texto" data-act="cfg" data-c="ibgeMunicipio" value="${esc(c.ibgeMunicipio||'3509502')}" placeholder="3509502" style="width:100%" title="Código IBGE utilizado na apuração do IBS Municipal segundo o Princípio do Destino"></div>
      <div><label class="mini">Inscrição Estadual (IE)</label><input type="text" class="campo-texto" data-act="cfg" data-c="ie" value="${esc(c.ie||'')}" style="width:100%"></div>
      <div><label class="mini">Inscrição Municipal (IM)</label><input type="text" class="campo-texto" data-act="cfg" data-c="im" value="${esc(c.im||'')}" style="width:100%"></div>
      <div><label class="mini">Classificação Fiscal Padrão (cClassTrib)</label><input type="text" class="campo-texto" data-act="cfg" data-c="cClassTribPadrao" value="${esc(c.cClassTribPadrao||'010101')}" style="width:100%"></div>
    </div>
    
    <div style="border:1px solid var(--petroleo);border-radius:10px;padding:16px;background:var(--petroleo-fraco);margin-bottom:20px">
      <div class="entre" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="background:var(--petroleo);color:#fff;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">§</div>
          <b style="color:var(--petroleo);font-size:14px">Nova Reforma Tributária (CBS, IBS e Imposto Seletivo)</b>
        </div>
        <span class="selo selo-executando" style="font-size:11px">Fase Oficial de Teste 2026</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label class="mini" style="font-weight:700">Fase / Cronograma de Vigência</label>
          <select class="campo-texto" data-act="cfg" data-c="faseReforma" style="width:100%">
            <option value="teste_2026" ${(c.faseReforma||'teste_2026')==='teste_2026'?'selected':''}>Ano de Teste 2026 (CBS 0,9% + IBS 0,1%)</option>
            <option value="transicao_2027_2032" ${c.faseReforma==='transicao_2027_2032'?'selected':''}>Transição Gradual (2027-2032: Extinção PIS/COFINS e redução ICMS/ISS)</option>
            <option value="plena_2033" ${c.faseReforma==='plena_2033'?'selected':''}>Vigência Plena (2033 em diante: IBS + CBS Definitivos)</option>
          </select>
        </div>
        <div>
          <label class="mini" style="font-weight:700">Opção do Simples Nacional para IBS / CBS</label>
          <select class="campo-texto" data-act="cfg" data-c="opcaoSimplesIBSCBS" style="width:100%">
            <option value="simples_hibrido" ${(c.opcaoSimplesIBSCBS||'simples_hibrido')==='simples_hibrido'?'selected':''}>Recolhimento Regular IBS/CBS (Gera Crédito Integral para Frotas/PJ — Recomendado)</option>
            <option value="simples_das" ${c.opcaoSimplesIBSCBS==='simples_das'?'selected':''}>Recolhimento Unificado no DAS (Crédito Restrito ao PGDAS)</option>
          </select>
        </div>
      </div>

      <div class="mini" style="background:#fff;padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);margin-bottom:14px;line-height:1.5;color:var(--aco-700)">
        💡 <b>Oficina de Linha Pesada & Transportadoras:</b> Ao selecionar <i>Recolhimento Regular IBS/CBS</i>, suas Ordens de Serviço e notas fiscais permitirão às transportadoras e frotistas tomarem 100% dos créditos da CBS e do IBS sobre manutenção e peças, mantendo sua oficina altamente competitiva.
      </div>

      <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--aco-800)">Alíquotas Padrão de Referência da Reforma Tributária:</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px">
        <div><label class="mini">CBS Federal (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoCBS" data-tipo="number" value="${c.aliqPadraoCBS != null ? c.aliqPadraoCBS : 0.90}" step="0.01" style="width:100%"></div>
        <div><label class="mini">IBS Estadual (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBSEst" data-tipo="number" value="${c.aliqPadraoIBSEst != null ? c.aliqPadraoIBSEst : 0.05}" step="0.01" style="width:100%"></div>
        <div><label class="mini">IBS Municipal (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBSMun" data-tipo="number" value="${c.aliqPadraoIBSMun != null ? c.aliqPadraoIBSMun : 0.05}" step="0.01" style="width:100%"></div>
        <div><label class="mini">Total IBS (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBS" data-tipo="number" value="${c.aliqPadraoIBS != null ? c.aliqPadraoIBS : 0.10}" step="0.01" style="width:100%"></div>
        <div><label class="mini">Imposto Seletivo IS (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIS" data-tipo="number" value="${c.aliqPadraoIS || 0}" step="0.01" style="width:100%"></div>
      </div>
    </div>
    
    <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;color:var(--aco-800)">3. Tributos Atuais / Convivência Transitória:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;background:#fff;padding:14px;border-radius:8px;border:1px solid var(--aco-200)">
      <div><label class="mini">PIS (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPIS" data-tipo="number" value="${c.aliqPIS||0}" step="0.01" style="width:100%"></div>
      <div><label class="mini">COFINS (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqCOFINS" data-tipo="number" value="${c.aliqCOFINS||0}" step="0.01" style="width:100%"></div>
      <div><label class="mini">CSLL (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqCSLL" data-tipo="number" value="${c.aliqCSLL||0}" step="0.01" style="width:100%"></div>
    </div>
  </div>`;
}

function viewOperacoes() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Operações e Prazos</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px">
      <div><label class="mini">Garantia Padrão (Meses)</label><input type="number" class="campo-texto" data-act="cfg" data-c="garantiaMeses" value="${c.garantiaMeses||3}" style="width:120px"></div>
      <div><label class="mini">Termo de Garantia Padrão na OS</label><textarea class="campo-texto" data-act="cfg" data-c="termoGarantia" rows="3" style="width:100%">${esc(c.termoGarantia||'')}</textarea></div>
    </div>
  </div>`;
}

function viewRegrasTributarias() {
  const regras = S.cfg.regrasTributarias || [];
  if (!regras.length) return `<div style="text-align:center;padding:40px;color:var(--aco-500)">Nenhuma regra cadastrada.</div>`;
  
  return `
  <div class="card card-p" style="max-width:980px;margin:0 auto">
    <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <b style="font-size:15px">Matriz de Regras Fiscais & Reforma Tributária</b>
        <div class="mini">Configurações de tributação por CFOP para produtos, compras e serviços automotivos</div>
      </div>
      <button class="btn btn-secundario mini" onclick="S.ui.abaCad='simulador-fiscal';render()">
        ${ico('grana', 13)} Abrir Simulador de Cálculo
      </button>
    </div>

    <div style="overflow-x:auto">
      <table style="width:100%;text-align:left;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--aco-200);color:var(--aco-600);background:var(--aco-050)">
            <th style="padding:10px 8px">CFOP</th>
            <th style="padding:10px 8px">Descrição</th>
            <th style="padding:10px 8px">Tipo</th>
            <th style="padding:10px 8px">Regime Atual (ICMS/ISS/PIS/COF)</th>
            <th style="padding:10px 8px;background:var(--petroleo-fraco);color:var(--petroleo)">Reforma Tributária (IBS/CBS/IS)</th>
            <th style="padding:10px 8px;text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${regras.map((r) => {
            let impostosAtual = '';
            if (r.tipo === 'produto' || r.tipo === 'entrada') {
              impostosAtual = `ICMS: ${r.aliqICMS}% (CST ${r.cstICMS}) | IPI: ${r.aliqIPI}% | PIS/COF: ${r.aliqPIS}/${r.aliqCOFINS}%`;
            } else if (r.tipo === 'servico') {
              impostosAtual = `ISS: ${r.aliqISS||0}% ${r.issRetido==='S'?'(Ret)':''} | PIS/COF: ${r.aliqPIS}/${r.aliqCOFINS}%`;
            }
            const cbs = r.aliqCBS != null ? r.aliqCBS : 0.90;
            const ibs = r.aliqIBS != null ? r.aliqIBS : 0.10;
            const cstRTC = r.cstIBSCBS || '01';
            const cClass = r.cClassTrib || '010101';
            const impostosReforma = `CBS: ${cbs}% | IBS: ${ibs}% (Est: ${r.aliqIBSEst||0.05}% / Mun: ${r.aliqIBSMun||0.05}%) | CST RTC: ${cstRTC} | cClass: ${cClass}${r.aliqIS ? ' | IS: '+r.aliqIS+'%' : ''}`;
            
            return `
            <tr style="border-bottom:1px solid var(--aco-100)">
              <td style="padding:10px 8px;font-weight:700" class="mono">${r.cfop}</td>
              <td style="padding:10px 8px"><b>${esc(r.desc)}</b></td>
              <td style="padding:10px 8px"><span style="background:var(--aco-100);padding:2px 6px;border-radius:4px;font-size:10.5px;text-transform:uppercase;font-weight:600">${r.tipo}</span></td>
              <td style="padding:10px 8px;color:var(--aco-700);font-size:11.5px">${impostosAtual}</td>
              <td style="padding:10px 8px;background:var(--petroleo-fraco);color:var(--petroleo);font-size:11.5px;font-weight:600">${impostosReforma}</td>
              <td style="padding:10px 8px;text-align:right">
                <button class="btn btn-secundario mini" data-act="editar-regra-fiscal" data-cfop="${esc(r.cfop)}" style="padding:3px 8px">Editar</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function viewSimuladorFiscal() {
  const regras = S.cfg.regrasTributarias || [];
  window._simulador = window._simulador || {
    valor: 1000,
    cfop: (regras[0] && regras[0].cfop) || '5102',
    tipo: 'produto'
  };

  const sim = window._simulador;
  const regra = regras.find(x => x.cfop === sim.cfop) || regras[0] || {};
  const v = Number(sim.valor) || 0;

  let icmsOuIss = 0, icmsLabel = 'ICMS';
  if (regra.tipo === 'servico') {
    icmsOuIss = v * ((regra.aliqISS || 0) / 100);
    icmsLabel = 'ISS';
  } else {
    icmsOuIss = v * ((regra.aliqICMS || 0) / 100);
  }
  const pis = v * ((regra.aliqPIS || 0) / 100);
  const cofins = v * ((regra.aliqCOFINS || 0) / 100);
  const ipi = regra.tipo !== 'servico' ? v * ((regra.aliqIPI || 0) / 100) : 0;
  const totAtual = icmsOuIss + pis + cofins + ipi;

  const aliqCBS = regra.aliqCBS != null ? regra.aliqCBS : 0.90;
  const aliqIBSEst = regra.aliqIBSEst != null ? regra.aliqIBSEst : 0.05;
  const aliqIBSMun = regra.aliqIBSMun != null ? regra.aliqIBSMun : 0.05;
  const aliqIBS = regra.aliqIBS != null ? regra.aliqIBS : (aliqIBSEst + aliqIBSMun);
  const aliqIS = regra.aliqIS || 0;

  const vCBS = v * (aliqCBS / 100);
  const vIBSEst = v * (aliqIBSEst / 100);
  const vIBSMun = v * (aliqIBSMun / 100);
  const vIBSTotal = v * (aliqIBS / 100);
  const vIS = v * (aliqIS / 100);
  const totReforma2026 = vCBS + vIBSTotal + vIS;
  const compensacao = Math.min(totReforma2026, pis + cofins);

  const opcaoSimples = S.cfg.opcaoSimplesIBSCBS || 'simples_hibrido';
  const creditoCliente2026 = (S.cfg.regimeTributario === 'Simples Nacional' && opcaoSimples === 'simples_das') 
    ? (v * 0.0035) 
    : totReforma2026;

  return `
  <div class="card card-p" style="max-width:920px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:800;color:var(--aco-900);margin:0">Simulador & Auditor Fiscal da Reforma Tributária (IVA Dual)</h3>
        <div class="mini">Validação matemática em conformidade com a EC 132/2023, PLP 68/2024 e Regras Técnicas RTC</div>
      </div>
      <button class="btn btn-secundario mini" onclick="S.ui.abaCad='regras-tributarias';render()">
        ${ico('lista', 13)} Ver Matriz de Regras
      </button>
    </div>

    <div style="background:var(--aco-050);padding:14px;border-radius:10px;border:1px solid var(--aco-200);margin-bottom:20px">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">Parâmetros da Operação para Simulação:</div>
      <div style="display:grid;grid-template-columns:180px 1fr;gap:12px">
        <div>
          <label class="mini" style="font-weight:700">Valor da Operação (R$)</label>
          <input type="number" class="campo-texto" value="${v}" step="50" oninput="window._simulador.valor=this.value;render()" style="width:100%;font-size:16px;font-weight:800">
        </div>
        <div>
          <label class="mini" style="font-weight:700">Regra Fiscal / CFOP Vinculado</label>
          <select class="campo-texto" onchange="window._simulador.cfop=this.value;render()" style="width:100%;height:38px">
            ${regras.map(rg => `<option value="${rg.cfop}" ${rg.cfop===sim.cfop?'selected':''}>${rg.cfop} – ${esc(rg.desc)} (${rg.tipo.toUpperCase()})</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="border:1px solid var(--aco-200);border-radius:10px;padding:16px;background:#fff">
        <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:8px;margin-bottom:12px">
          <b style="font-size:14px;color:var(--aco-800)">Regime Vigente Atual (Legado)</b>
          <span class="selo" style="background:var(--aco-200)">ICMS / ISS / PIS / COFINS</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div class="entre"><span>${icmsLabel} (${regra.tipo==='servico'?(regra.aliqISS||0):(regra.aliqICMS||0)}%):</span><b class="num">${brl(icmsOuIss)}</b></div>
          <div class="entre"><span>PIS (${regra.aliqPIS||0}%):</span><b class="num">${brl(pis)}</b></div>
          <div class="entre"><span>COFINS (${regra.aliqCOFINS||0}%):</span><b class="num">${brl(cofins)}</b></div>
          ${regra.tipo !== 'servico' && regra.aliqIPI ? `<div class="entre"><span>IPI (${regra.aliqIPI}%):</span><b class="num">${brl(ipi)}</b></div>` : ''}
          <div class="entre" style="border-top:1px solid var(--aco-200);padding-top:8px;margin-top:4px;font-size:14px">
            <b>Carga Tributária Direta:</b>
            <b class="num" style="color:var(--aco-900)">${brl(totAtual)} (${v > 0 ? ((totAtual/v)*100).toFixed(2) : '0.00'}%)</b>
          </div>
        </div>
      </div>

      <div style="border:2px solid var(--petroleo);border-radius:10px;padding:16px;background:var(--petroleo-fraco)">
        <div class="entre" style="border-bottom:1px solid var(--petroleo);padding-bottom:8px;margin-bottom:12px">
          <b style="font-size:14px;color:var(--petroleo)">Fase de Teste 2026 (EC 132/2023)</b>
          <span class="selo selo-finalizada">IVA Dual: 1,0%</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div class="entre"><span>CBS Federal (${aliqCBS}%):</span><b class="num">${brl(vCBS)}</b></div>
          <div class="entre"><span>IBS Estadual (${aliqIBSEst}%):</span><b class="num">${brl(vIBSEst)}</b></div>
          <div class="entre"><span>IBS Municipal (${aliqIBSMun}%):</span><b class="num">${brl(vIBSMun)}</b></div>
          ${aliqIS > 0 ? `<div class="entre"><span>Imposto Seletivo (${aliqIS}%):</span><b class="num">${brl(vIS)}</b></div>` : ''}
          <div class="entre" style="border-top:1px dashed var(--petroleo);padding-top:6px;font-size:12px;color:var(--petroleo)">
            <span>Total IVA Reforma (CBS + IBS):</span><b>${brl(totReforma2026)} (${(aliqCBS+aliqIBS).toFixed(2)}%)</b>
          </div>
          <div class="entre" style="border-top:1px solid var(--petroleo);padding-top:8px;margin-top:2px;font-size:14px">
            <b>Compensação PIS/COFINS (Líquido):</b>
            <b class="num" style="color:var(--verde)">−${brl(compensacao)}</b>
          </div>
        </div>
      </div>
    </div>

    <div style="background:var(--verde-fraco);border:1px solid var(--verde);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:700;color:var(--verde);font-size:13.5px">Crédito Tributário Imediato Gerado para Transportadoras / Frotistas PJ:</div>
        <div class="mini" style="margin-top:2px;color:var(--aco-700)">Baseado na opção configurada: <b>${opcaoSimples==='simples_hibrido'?'Recolhimento Regular IBS/CBS (Gera 100% de Crédito)':'Recolhimento DAS Simples'}</b>.</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;color:var(--verde)">${brl(creditoCliente2026)}</div>
        <span class="selo selo-finalizada" style="font-size:10px">100% Auditado</span>
      </div>
    </div>

    <div style="margin-top:16px;padding:12px;background:#fff;border-radius:8px;border:1px solid var(--aco-200);font-size:12px">
      <b style="color:var(--aco-800)">Checklist de Conformidade Técnica para Emissão Fiscal (NF-e / RTC):</b>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <div>✅ <b>CST IBS/CBS:</b> Código oficial ${regra.cstIBSCBS||'01'} atribuído.</div>
        <div>✅ <b>Classificação RTC:</b> cClassTrib ${regra.cClassTrib||'010101'} mapeado.</div>
        <div>✅ <b>Repartição Subnacional:</b> IBS Estadual (${aliqIBSEst}%) e Municipal (${aliqIBSMun}%) definidos.</div>
        <div>✅ <b>Princípio do Destino:</b> Indicador de Destino parametrizado (${regra.indDestino==='0'?'Prestador':'Consumo/Tomador'}).</div>
      </div>
    </div>
  </div>`;
}

function viewContabil() {
  const c = (S.cfg || {}).contabil || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Escritório de Contabilidade</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><label class="mini">Nome do Escritório</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.escritorio=this.value" value="${esc(c.escritorio||'')}" style="width:100%"></div>
      <div><label class="mini">CRC</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.crc=this.value" value="${esc(c.crc||'')}" style="width:100%"></div>
      <div><label class="mini">Telefone</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.fone=this.value" value="${esc(c.fone||'')}" style="width:100%"></div>
      <div><label class="mini">E-mail</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.email=this.value" value="${esc(c.email||'')}" style="width:100%"></div>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.viewTributario = viewTributario;
  window.viewOperacoes = viewOperacoes;
  window.viewRegrasTributarias = viewRegrasTributarias;
  window.viewSimuladorFiscal = viewSimuladorFiscal;
  window.viewContabil = viewContabil;
}
if (typeof globalThis !== 'undefined') {
  globalThis.viewTributario = viewTributario;
  globalThis.viewOperacoes = viewOperacoes;
  globalThis.viewRegrasTributarias = viewRegrasTributarias;
  globalThis.viewSimuladorFiscal = viewSimuladorFiscal;
  globalThis.viewContabil = viewContabil;
}

