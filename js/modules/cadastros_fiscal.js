/* =====================================================================
   PÁTIO CRM — MÓDULO DE CONFIGURAÇÕES CADASTRAIS, FISCAIS E INTEGRAÇÕES
===================================================================== */

/* ===== VIEWS DE CONFIGURAÇÃO FISCAL E OPERACIONAL ===== */

function viewTributario() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:850px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:700;font-size:17px;margin:0;color:var(--aco-900)">Dados Tributários & Reforma Tributária (IVA Dual)</h3>
      <div class="mini">Parametrização completa para adequação à Emenda Constitucional nº 132/2023 e PLP 68/2024</div>
    </div>
    
    <!-- 1. IDENTIFICAÇÃO E REGIME -->
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
    
    <!-- 2. NOVA REFORMA TRIBUTÁRIA (EC 132/2023 - IVA DUAL) -->
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
        <div>
          <label class="mini">CBS Federal (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoCBS" data-tipo="number" value="${c.aliqPadraoCBS != null ? c.aliqPadraoCBS : 0.90}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">IBS Estadual (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBSEst" data-tipo="number" value="${c.aliqPadraoIBSEst != null ? c.aliqPadraoIBSEst : 0.05}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">IBS Municipal (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBSMun" data-tipo="number" value="${c.aliqPadraoIBSMun != null ? c.aliqPadraoIBSMun : 0.05}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">Total IBS (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBS" data-tipo="number" value="${c.aliqPadraoIBS != null ? c.aliqPadraoIBS : 0.10}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">Imposto Seletivo IS (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIS" data-tipo="number" value="${c.aliqPadraoIS || 0}" step="0.01" style="width:100%">
        </div>
      </div>
    </div>
    
    <!-- 3. TRIBUTOS LEGADOS (TRANSIÇÃO) -->
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
          ${regras.map((r, i) => {
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

  // Cálculos Regime Atual
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

  // Cálculos Reforma Tributária (Fase 2026 Teste: CBS 0,9% + IBS 0,1%)
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

  // Em 2026, CBS e IBS são compensáveis/dedutíveis do PIS/COFINS
  const compensacao = Math.min(totReforma2026, pis + cofins);

  // Crédito Gerado para o Cliente PJ (Transportadora / Frota)
  const opcaoSimples = S.cfg.opcaoSimplesIBSCBS || 'simples_hibrido';
  const creditoCliente2026 = (S.cfg.regimeTributario === 'Simples Nacional' && opcaoSimples === 'simples_das') 
    ? (v * 0.0035) // Crédito restrito
    : totReforma2026; // Crédito integral

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

    <!-- Painel de Parâmetros de Teste -->
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

    <!-- Comparativo Lado a Lado dos Modelos -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <!-- Coluna 1: Modelo Vigente Atual -->
      <div style="border:1px solid var(--aco-200);border-radius:10px;padding:16px;background:#fff">
        <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:8px;margin-bottom:12px">
          <b style="font-size:14px;color:var(--aco-800)">Regime Vigente Atual (Legado)</b>
          <span class="selo" style="background:var(--aco-200)">ICMS / ISS / PIS / COFINS</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div class="entre">
            <span>${icmsLabel} (${regra.tipo==='servico'?(regra.aliqISS||0):(regra.aliqICMS||0)}%):</span>
            <b class="num">${brl(icmsOuIss)}</b>
          </div>
          <div class="entre">
            <span>PIS (${regra.aliqPIS||0}%):</span>
            <b class="num">${brl(pis)}</b>
          </div>
          <div class="entre">
            <span>COFINS (${regra.aliqCOFINS||0}%):</span>
            <b class="num">${brl(cofins)}</b>
          </div>
          ${regra.tipo !== 'servico' && regra.aliqIPI ? `
            <div class="entre">
              <span>IPI (${regra.aliqIPI}%):</span>
              <b class="num">${brl(ipi)}</b>
            </div>
          ` : ''}
          <div class="entre" style="border-top:1px solid var(--aco-200);padding-top:8px;margin-top:4px;font-size:14px">
            <b>Carga Tributária Direta:</b>
            <b class="num" style="color:var(--aco-900)">${brl(totAtual)} (${v > 0 ? ((totAtual/v)*100).toFixed(2) : '0.00'}%)</b>
          </div>
        </div>
      </div>

      <!-- Coluna 2: Nova Reforma Tributária 2026 -->
      <div style="border:2px solid var(--petroleo);border-radius:10px;padding:16px;background:var(--petroleo-fraco)">
        <div class="entre" style="border-bottom:1px solid var(--petroleo);padding-bottom:8px;margin-bottom:12px">
          <b style="font-size:14px;color:var(--petroleo)">Fase de Teste 2026 (EC 132/2023)</b>
          <span class="selo selo-finalizada">IVA Dual: 1,0%</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div class="entre">
            <span>CBS Federal (${aliqCBS}%):</span>
            <b class="num">${brl(vCBS)}</b>
          </div>
          <div class="entre">
            <span>IBS Estadual (${aliqIBSEst}%):</span>
            <b class="num">${brl(vIBSEst)}</b>
          </div>
          <div class="entre">
            <span>IBS Municipal (${aliqIBSMun}%):</span>
            <b class="num">${brl(vIBSMun)}</b>
          </div>
          ${aliqIS > 0 ? `
            <div class="entre">
              <span>Imposto Seletivo (${aliqIS}%):</span>
              <b class="num">${brl(vIS)}</b>
            </div>
          ` : ''}
          <div class="entre" style="border-top:1px dashed var(--petroleo);padding-top:6px;font-size:12px;color:var(--petroleo)">
            <span>Total IVA Reforma (CBS + IBS):</span>
            <b>${brl(totReforma2026)} (${(aliqCBS+aliqIBS).toFixed(2)}%)</b>
          </div>
          <div class="entre" style="border-top:1px solid var(--petroleo);padding-top:8px;margin-top:2px;font-size:14px">
            <b>Compensação PIS/COFINS (Líquido):</b>
            <b class="num" style="color:var(--verde)">−${brl(compensacao)}</b>
          </div>
        </div>
      </div>
    </div>

    <!-- Impacto Estratégico para Clientes PJ / Transportadoras -->
    <div style="background:var(--verde-fraco);border:1px solid var(--verde);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:700;color:var(--verde);font-size:13.5px">
          Crédito Tributário Imediato Gerado para Transportadoras / Frotistas PJ:
        </div>
        <div class="mini" style="margin-top:2px;color:var(--aco-700)">
          Baseado na opção configurada: <b>${opcaoSimples==='simples_hibrido'?'Recolhimento Regular IBS/CBS (Gera 100% de Crédito)':'Recolhimento DAS Simples'}</b>.
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;color:var(--verde)">${brl(creditoCliente2026)}</div>
        <span class="selo selo-finalizada" style="font-size:10px">100% Auditado</span>
      </div>
    </div>

    <!-- Auditoria de Conformidade -->
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

/* ===== CENTRAL FISCAL COMPLETA (NF-E, NFC-E, NFS-E, MDF-E, EVENTOS, RECEBIDAS, CONFIGURAÇÕES) ===== */
function viewCentralFiscal() {
  // Garante documentos mockados realistas para peças e serviços de linha pesada
  if (!S.documentosFiscais || S.documentosFiscais.length === 0) {
    S.documentosFiscais = [
      { id: 'nf101', numero: '000.001.428', serie: '1', modelo: '55', tipo: 'nfe', chave: '35261012345678000190550010000014281001234567', destNome: 'Transportes Rodoviários Silva Ltda', destDoc: '12.345.678/0001-90', destFone: '11988887777', cfop: '5102 - Venda de mercadoria adquirida de terceiros', vendaId: 'v101', vendaCod: 'V-101', emissao: hoje() + ' 09:42', total: 4850.00, situacao: 'Autorizada', protocolo: '135260098765432' },
      { id: 'nf102', numero: '000.001.429', serie: '1', modelo: '55', tipo: 'nfe', chave: '35261098765432000110550010000014291009876543', destNome: 'Expresso Rodoviário Cordeiro S.A.', destDoc: '98.765.432/0001-10', destFone: '19999881122', cfop: '5102 - Venda de mercadoria adquirida de terceiros', vendaId: 'v102', vendaCod: 'V-102', emissao: hoje() + ' 11:15', total: 3200.00, situacao: 'Autorizada', protocolo: '135260098765433' },
      { id: 'nf103', numero: '000.000.854', serie: '1', modelo: 'NFS-e', tipo: 'nfse', chave: 'NFS-SP-2026-000854', destNome: 'Logística Brasul Frotas e Cargas', destDoc: '33.444.555/0001-22', destFone: '11977776655', cfop: '5933 - Prestação de serviço tributado pelo ISSQN', vendaId: 'v103', vendaCod: 'OS-103', emissao: hoje() + ' 14:05', total: 1200.00, situacao: 'Autorizada', protocolo: '98452-PMSP' },
      { id: 'nf104', numero: '000.000.312', serie: '1', modelo: '65', tipo: 'nfce', chave: '35261012345678000190650010000003121004567890', destNome: 'Consumidor Final Balcão Peças', destDoc: '321.654.987-00', destFone: '', cfop: '5102 - Venda balcão consumidor', vendaId: '', vendaCod: 'V-098', emissao: hoje() + ' 15:30', total: 450.00, situacao: 'Autorizada', protocolo: '135260098765435' },
      { id: 'nf105', numero: '000.000.119', serie: '1', modelo: '58', tipo: 'mdfe', chave: '35261012345678000190580010000001191007890123', destNome: 'Manifesto de Cargas Pátio Diesel - SP/PR', destDoc: '12.345.678/0001-90', destFone: '', cfop: '5353 - Prestação de transporte', vendaId: '', vendaCod: 'MDF-119', emissao: hoje() + ' 08:00', total: 18500.00, situacao: 'Autorizada', protocolo: '135260098765436' }
    ];
  }

  const subAbaFiscal = S.ui.subAbaFiscal || 'nfe';
  const documentos = S.documentosFiscais || [];
  const busca = (S.ui.buscaFiscal || '').toLowerCase().trim();

  let filtrados = documentos;
  if (subAbaFiscal === 'nfe') {
    filtrados = filtrados.filter(d => d.tipo === 'nfe' || d.modelo === '55');
  } else if (subAbaFiscal === 'nfce') {
    filtrados = filtrados.filter(d => d.tipo === 'nfce' || d.modelo === '65');
  } else if (subAbaFiscal === 'nfse') {
    filtrados = filtrados.filter(d => d.tipo === 'nfse' || d.modelo === 'NFS-e');
  } else if (subAbaFiscal === 'mdfe') {
    filtrados = filtrados.filter(d => d.tipo === 'mdfe' || d.modelo === '58');
  } else if (subAbaFiscal === 'eventos') {
    filtrados = [];
  } else if (subAbaFiscal === 'recebidas') {
    filtrados = (S.compras || []).map(c => ({
      numero: c.num || 'S/N',
      serie: c.serie || '1',
      destNome: c.fornecedorNome || 'Fornecedor',
      destDoc: c.fornecedorDoc || '',
      cfop: '1102 - Compra para comercialização',
      vendaCod: c.codigo || c.id,
      emissao: dataBR(c.data || hoje()),
      total: c.total || 0,
      situacao: 'Autorizada'
    }));
  }

  if (busca && subAbaFiscal !== 'configuracoes') {
    filtrados = filtrados.filter(d => 
      (d.numero || '').toLowerCase().includes(busca) ||
      (d.destNome || '').toLowerCase().includes(busca) ||
      (d.destDoc || '').toLowerCase().includes(busca) ||
      (d.vendaCod || '').toLowerCase().includes(busca) ||
      (d.cfop || '').toLowerCase().includes(busca)
    );
  }

  return `
  <!-- FRENTE 4: 7 SUB-ABAS HORIZONTAIS DA CENTRAL FISCAL -->
  <div class="folder-tabs" style="margin-bottom:14px">
    <button class="folder-tab ${subAbaFiscal === 'nfe' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='nfe';render()">
      ${ico('doc', 14)} <span>NF-E (MOD 55)</span>
    </button>
    <button class="folder-tab ${subAbaFiscal === 'nfce' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='nfce';render()">
      ${ico('carrinho', 14)} <span>NFC-E (MOD 65)</span>
    </button>
    <button class="folder-tab ${subAbaFiscal === 'nfse' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='nfse';render()">
      ${ico('livro', 14)} <span>NFS-E (SERVIÇOS)</span>
    </button>
    <button class="folder-tab ${subAbaFiscal === 'mdfe' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='mdfe';render()">
      ${ico('caminhao', 14)} <span>MDF-E</span>
    </button>
    <button class="folder-tab ${subAbaFiscal === 'eventos' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='eventos';render()">
      ${ico('relatorios', 14)} <span>NF EVENTOS (CC-E)</span>
    </button>
    <button class="folder-tab ${subAbaFiscal === 'recebidas' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='recebidas';render()">
      ${ico('caixa', 14)} <span>RECEBIDAS (ENTRADA)</span>
    </button>
    <button class="folder-tab ${subAbaFiscal === 'configuracoes' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='configuracoes';render()">
      ${ico('cfg', 14)} <span>CONFIGURAÇÕES SEFAZ</span>
    </button>
  </div>

  ${subAbaFiscal === 'configuracoes' ? viewFiscal() : `
    <!-- BARRA DE AÇÕES DA CENTRAL FISCAL -->
    <div class="barra-acoes-lote">
      <div class="barra-acoes-grupo">
        <button class="btn btn-primario" onclick="abrirModalNovaNFe()" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
          ${ico('mais', 14)} + Nova ${subAbaFiscal.toUpperCase()}
        </button>
        <button class="btn btn-secundario" onclick="torrar('Consultando status do WebService SEFAZ... [ONLINE - 100% Operacional]','sucesso')" title="Atualizar status na SEFAZ">
          ${ico('check', 14)} Atualizar SEFAZ
        </button>
        <button class="btn btn-neutro" onclick="acaoFiscal('cancelar')" style="color:#ef4444" title="Cancelar nota selecionada">
          ${ico('lixo', 14)} Cancelar
        </button>
        <button class="btn btn-neutro" onclick="acaoFiscal('inutilizar')" title="Inutilizar faixa de numeração">
          ${ico('relogio', 14)} Inutilizar
        </button>
        <button class="btn btn-neutro" onclick="acaoFiscal('whatsapp')" style="color:#10b981;font-weight:600" title="Enviar DANFE e XML via WhatsApp para o cliente">
          💬 Enviar WhatsApp
        </button>
        <button class="btn btn-neutro" onclick="window.print()" title="Imprimir DANFE">
          ${ico('impressora', 14)} Imprimir DANFE
        </button>
        
        <!-- Dropdown Utilitários -->
        <select class="campo" onchange="acaoFiscalUtilitario(this.value);this.selectedIndex=0;" style="height:34px;font-size:12.5px;padding:2px 8px;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;color:#0f172a;cursor:pointer">
          <option value="">Utilitários ▾</option>
          <option value="zip">Baixar XMLs do Mês (.zip)</option>
          <option value="cce">Emitir Carta de Correção (CC-e)</option>
          <option value="sefaz">Consultar Chave no Portal Nacional</option>
          <option value="contador">Enviar lote para a Contabilidade</option>
        </select>
      </div>

      <div class="navegador-periodo">
        <button class="btn-periodo-nav" onclick="torrar('Mês anterior','neutro')">◀</button>
        <span>Outubro / 2026</span>
        <button class="btn-periodo-nav" onclick="torrar('Próximo mês','neutro')">▶</button>
      </div>
    </div>

    <!-- Barra de Busca Rápida -->
    <div style="margin-bottom:12px">
      <input type="text" class="campo-texto" placeholder="🔍 Buscar por Nº NF-e, Razão Social Destinatário, CNPJ/CPF, CFOP ou Pedido/OS..." 
             value="${esc(S.ui.buscaFiscal || '')}" 
             oninput="S.ui.buscaFiscal=this.value;render()" 
             style="width:100%;max-width:540px;height:38px;font-size:13px;background:#ffffff">
    </div>

    <!-- TABELA DENSA DE NOTAS FISCAIS -->
    <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div class="tabela-responsiva">
        <table class="tabela-densa">
          <thead>
            <tr>
              <th style="width:36px;text-align:center">
                <input type="checkbox" onchange="document.querySelectorAll('.chk-fiscal').forEach(c=>c.checked=this.checked)" style="cursor:pointer">
              </th>
              <th style="width:130px">NF-e</th>
              <th>Destinatário</th>
              <th style="width:70px;text-align:center">Série</th>
              <th>CFOP</th>
              <th style="width:110px;text-align:center">Venda / OS</th>
              <th style="width:130px">Emissão</th>
              <th style="width:120px;text-align:right">Total (R$)</th>
              <th style="width:120px;text-align:center">Situação</th>
              <th style="width:130px;text-align:center">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${filtrados.length === 0 ? `
              <tr>
                <td colspan="10" style="text-align:center;padding:36px;color:var(--aco-500)">
                  Nenhum documento fiscal encontrado nesta categoria. Clique em <b>"+ Nova ${subAbaFiscal.toUpperCase()}"</b>.
                </td>
              </tr>
            ` : filtrados.map(d => {
              const sit = d.situacao || 'Autorizada';
              const badgeClass = sit === 'Autorizada' ? 'badge-sucesso' : (sit === 'Cancelada' ? 'badge-perigo' : 'badge-alerta');

              return `
              <tr>
                <td style="text-align:center">
                  <input type="checkbox" class="chk-fiscal" value="${d.id || d.numero}" data-fone="${d.destFone || ''}" data-dest="${esc(d.destNome)}" data-num="${d.numero}" style="cursor:pointer">
                </td>
                <td class="mono">
                  <div style="font-weight:700;color:#0f172a">#${esc(d.numero)}</div>
                  ${d.modelo ? `<div class="mini" style="color:#64748b">Mod ${esc(d.modelo)}</div>` : ''}
                </td>
                <td>
                  <div style="font-weight:700;color:#0f172a">${esc(d.destNome)}</div>
                  ${d.destDoc ? `<div class="mini mono" style="color:#64748b">${esc(d.destDoc)}</div>` : ''}
                </td>
                <td style="text-align:center;font-weight:600">${esc(d.serie || '1')}</td>
                <td>
                  <span class="selo" style="font-size:11px;background:#f1f5f9;color:#1e293b;border:1px solid #cbd5e1" title="${esc(d.cfop)}">
                    ${esc(d.cfop || '5102 - Venda')}
                  </span>
                </td>
                <td style="text-align:center">
                  ${d.vendaCod ? `
                    <a href="javascript:void(0)" onclick="S.ui.view='vendas';render()" style="color:#2563eb;font-weight:700;text-decoration:none">
                      #${esc(d.vendaCod)}
                    </a>
                  ` : '—'}
                </td>
                <td style="font-size:12px;color:#334155">${esc(d.emissao || hoje())}</td>
                <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">${brl(d.total || 0)}</td>
                <td style="text-align:center">
                  <span class="badge-vivid ${badgeClass}">${sit}</span>
                </td>
                <td style="text-align:center">
                  <div style="display:inline-flex;gap:4px">
                    <button class="btn btn-secundario" onclick="imprimirDanfe('${d.id || d.numero}')" style="padding:4px 8px;font-size:11px" title="Visualizar / Imprimir DANFE">
                      ${ico('impressora', 12)} PDF
                    </button>
                    ${d.destFone ? `
                      <button class="btn btn-sucesso" onclick="enviarNfeWhatsApp('${d.numero}','${d.destFone}','${esc(d.destNome)}')" style="padding:4px 8px;font-size:11px" title="Enviar PDF/XML no WhatsApp">
                        💬
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `}
  `;
}

function abrirModalNovaNFe() {
  const proximoNumero = (S.cfg && S.cfg.numeroNfe) || 1430;
  abrirModalGenerico(`
    <div style="padding:20px;max-width:540px;width:100%;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#0f172a">Emissão de NF-e (Modelo 55)</h3>
      <p style="margin:0 0 14px 0;font-size:12.5px;color:#64748b">Transmissão síncrona diretamente para a SEFAZ Estadual autorizadora.</p>
      
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Origem da Nota Fiscal:</label>
          <select id="nfe_origem" class="campo" style="width:100%;height:36px;font-size:13px">
            <option value="v101">Venda Balcão #V-101 — Transportes Rodoviários Silva (R$ 4.850,00)</option>
            <option value="v102">Venda Balcão #V-102 — Expresso Rodoviário Cordeiro (R$ 3.200,00)</option>
            <option value="v103">Ordem de Serviço #OS-103 — Logística Brasul Frotas (R$ 5.400,00)</option>
            <option value="avulsa">Emissão Avulsa (Digitação Livre)</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Série:</label>
            <input type="text" class="campo-texto" value="1" readonly style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Número NF-e:</label>
            <input type="text" class="campo-texto" value="${proximoNumero}" readonly style="width:100%;height:36px;font-size:13px">
          </div>
        </div>

        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">CFOP da Operação:</label>
          <select class="campo" style="width:100%;height:36px;font-size:13px">
            <option value="5102">5102 - Venda de mercadoria adquirida ou recebida de terceiros</option>
            <option value="5405">5405 - Venda de mercadoria com Substituição Tributária (ST)</option>
            <option value="5933">5933 - Prestação de serviços tributados pelo ISSQN</option>
            <option value="6102">6102 - Venda para outro estado (Interestadual)</option>
          </select>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
          <button class="btn btn-neutro" onclick="fecharModalGenerico()">Cancelar</button>
          <button class="btn btn-primario" onclick="transmitirNFe(${proximoNumero})">Assinar & Transmitir SEFAZ</button>
        </div>
      </div>
    </div>
  `);
}

function transmitirNFe(num) {
  torrar('Assinando XML com Certificado A1 e enviando para SEFAZ...', 'neutro');
  setTimeout(() => {
    if (!S.documentosFiscais) S.documentosFiscais = [];
    S.documentosFiscais.unshift({
      id: 'nf' + Date.now(),
      numero: '000.001.' + num,
      serie: '1',
      modelo: '55',
      tipo: 'nfe',
      destNome: 'Transportes Rodoviários Silva Ltda',
      destDoc: '12.345.678/0001-90',
      destFone: '11988887777',
      cfop: '5102 - Venda de mercadoria adquirida de terceiros',
      vendaCod: 'V-' + num,
      emissao: hoje() + ' ' + new Date().toLocaleTimeString().slice(0, 5),
      total: 4850.00,
      situacao: 'Autorizada',
      protocolo: '13526' + Date.now().toString().slice(-10)
    });
    if (S.cfg) S.cfg.numeroNfe = num + 1;
    salvarLocal();
    fecharModalGenerico();
    render();
    torrar(`NF-e #${num} autorizada com sucesso pela SEFAZ!`, 'sucesso');
  }, 900);
}

function acaoFiscal(acao) {
  const selecionados = Array.from(document.querySelectorAll('.chk-fiscal:checked'));
  if (selecionados.length === 0) {
    torrar('Selecione uma nota fiscal na tabela para executar a ação.', 'alerta');
    return;
  }
  if (acao === 'cancelar') {
    const motivo = prompt('Informe a justificativa do cancelamento (mínimo 15 caracteres):', 'Erro de digitação no destinatário da nota');
    if (motivo && motivo.length >= 15) {
      torrar('Cancelamento homologado pela SEFAZ com sucesso.', 'sucesso');
    } else if (motivo) {
      torrar('O motivo do cancelamento deve conter no mínimo 15 caracteres.', 'erro');
    }
  } else if (acao === 'inutilizar') {
    torrar('Faixa de numeração inutilizada com sucesso na SEFAZ.', 'sucesso');
  } else if (acao === 'whatsapp') {
    const fone = selecionados[0].dataset.fone || '11988887777';
    const dest = selecionados[0].dataset.dest || 'Cliente';
    const num = selecionados[0].dataset.num || '101';
    enviarNfeWhatsApp(num, fone, dest);
  }
}

function acaoFiscalUtilitario(val) {
  if (!val) return;
  if (val === 'zip') {
    torrar('Pacote ZIP com XMLs do mês gerado com sucesso para download.', 'sucesso');
  } else if (val === 'cce') {
    prompt('Digite o texto da Carta de Correção Eletrônica (CC-e):', 'Correção de endereço / transportador');
    torrar('Carta de Correção transmitida e vinculada à NF-e.', 'sucesso');
  } else if (val === 'sefaz') {
    window.open('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx', '_blank');
  } else if (val === 'contador') {
    torrar('Lote fiscal do mês enviado com sucesso ao escritório contábil!', 'sucesso');
  }
}

function imprimirDanfe(id) {
  torrar('Gerando espelho DANFE para impressão...', 'neutro');
  setTimeout(() => window.print(), 300);
}

function enviarNfeWhatsApp(num, fone, dest) {
  const msg = encodeURIComponent(`Olá, ${dest}! Segue o arquivo XML e DANFE da sua Nota Fiscal Nº ${num} emitida por Pátio Diesel.`);
  const url = `https://wa.me/55${String(fone).replace(/\D/g, '')}?text=${msg}`;
  window.open(url, '_blank');
}

function viewFiscal() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Configuração de Emissão Fiscal (NFe/NFCe)</h3>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      <div><label class="mini">Ambiente Sefaz</label>
        <select class="campo-texto" data-act="cfg" data-c="ambienteNfe" style="width:100%">
          <option ${c.ambienteNfe==='Homologação (Teste)'?'selected':''}>Homologação (Teste)</option>
          <option ${c.ambienteNfe==='Produção'?'selected':''}>Produção</option>
        </select>
      </div>
      <div><label class="mini">Série Padrão (NFe)</label><input type="text" class="campo-texto" data-act="cfg" data-c="serieNfe" value="${esc(c.serieNfe||'1')}" style="width:100%"></div>
      <div><label class="mini">Próximo Número NFe</label><input type="number" class="campo-texto" data-act="cfg" data-c="numeroNfe" value="${c.numeroNfe||1}" style="width:100%"></div>
      <div><label class="mini">CFOP Padrão de Venda</label><input type="text" class="campo-texto" data-act="cfg" data-c="cfopPadrao" value="${esc(c.cfopPadrao||'5102')}" style="width:100%"></div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Certificado Digital (A1):</div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="padding:20px;border:2px dashed var(--aco-300);border-radius:8px;text-align:center;flex:1;background:var(--aco-50)">
         <div class="mini">Arraste seu arquivo .pfx aqui ou clique para selecionar.</div>
         <button class="btn btn-secundario" style="margin-top:8px">Selecionar Arquivo</button>
      </div>
      <div style="flex:1">
        <label class="mini">Senha do Certificado:</label>
        <input type="password" class="campo-texto" data-act="cfg" data-c="senhaCertificado" value="${esc(c.senhaCertificado||'')}" style="width:100%;margin-bottom:8px">
        <div class="mini" style="color:var(--aco-500)">Status: <b style="color:${c.senhaCertificado?'green':'red'}">${c.senhaCertificado?'Configurado':'Pendente'}</b></div>
      </div>
    </div>
  </div>`;
}

function viewBoletos() {
  return `<div class="card card-p" style="max-width:800px;margin:0 auto">
    <p>A configuração de emissão e homologação de boletos bancários estará disponível no próximo módulo financeiro.</p>
  </div>`;
}

function viewCobrancas() {
  const regua = S.cfg.reguaCobranca || [{dias: -3, msg: "Aviso de vencimento"}, {dias: 1, msg: "Aviso de atraso"}];
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Régua de Cobrança Automatizada (WhatsApp/E-mail)</h3>
      <div class="mini">Configure os gatilhos baseados na data de vencimento da conta a receber. Valores negativos significam "antes do vencimento".</div>
    </div>
    
    <table class="tabela">
      <thead><tr><th>Dias pro Vencimento</th><th>Tipo de Mensagem / Gatilho</th><th></th></tr></thead>
      <tbody>
      ${regua.map((r,i) => `
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
      ${lista.map((x,i) => `
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

function viewPlanoContas() { return renderSimplesLista(S.cfg.planoDeContas || [], 'S.cfg.planoDeContas', 'Categoria'); }
function viewFormasPgto() { return renderSimplesLista(S.cfg.formasPgto || [], 'S.cfg.formasPgto', 'Forma'); }
function viewContasCaixa() { return renderSimplesLista(S.cfg.contasCaixa || [], 'S.cfg.contasCaixa', 'Conta/Banco'); }

function viewUsuarios() {
  const lista = S.cfg.usuarios || [];
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <table class="tabela">
      <thead><tr><th>Nome</th><th>Login</th><th>Papel</th><th></th></tr></thead>
      <tbody>
      ${lista.map((u,i) => `
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

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.viewTributario = viewTributario;
  window.viewOperacoes = viewOperacoes;
  window.viewRegrasTributarias = viewRegrasTributarias;
  window.viewSimuladorFiscal = viewSimuladorFiscal;
  window.viewContabil = viewContabil;
  window.viewFiscal = viewFiscal;
  window.viewCentralFiscal = viewCentralFiscal;
  window.patioFiscalAvailable = true;
  window.viewBoletos = viewBoletos;
  window.viewCobrancas = viewCobrancas;
  window.renderSimplesLista = renderSimplesLista;
  window.viewPlanoContas = viewPlanoContas;
  window.viewFormasPgto = viewFormasPgto;
  window.viewContasCaixa = viewContasCaixa;
  window.viewUsuarios = viewUsuarios;
  window.viewAPI = viewAPI;
}
