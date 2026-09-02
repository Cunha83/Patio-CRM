/* =====================================================================
   FINANCEIRO — MÓDULO COMPLETO
===================================================================== */
function viewFinanceiro(){
  const rec=emAberto('receber'), pag=emAberto('pagar');
  const vencidasR=rec.filter(c=>c.venc<hoje()), vencidasP=pag.filter(c=>c.venc<hoje());
  const mes=mesRef(hoje());
  const entradaMes=soma(S.movimentos.filter(m=>m.tipo==='entrada'&&mesRef(m.data)===mes),m=>m.valor);
  const saidaMes=soma(S.movimentos.filter(m=>m.tipo==='saida'&&mesRef(m.data)===mes),m=>m.valor);
  const totalRec=soma(rec,c=>c.valor), totalPag=soma(pag,c=>c.valor);
  const abas=[['dashboard','Dashboard'],['receber','A Receber'],['pagar','A Pagar'],['caixa','Fluxo de Caixa'],['dre','DRE'],['banco','Banco']];
  const a=S.ui.abaFin;
  let corpo='';
  if(a==='dashboard') corpo=blocoDashboardFin();
  else if(a==='receber') corpo=blocoContasReceber();
  else if(a==='pagar') corpo=blocoContasPagar();
  else if(a==='caixa') corpo=blocoFluxoCaixa();
  else if(a==='dre') corpo=blocoDRE();
  else corpo=blocoBanco();
  return `
  <div class="kpis">
    <div class="kpi bom"><div class="r">${ico('grana',14)} Em caixa</div><div class="v">${brlCurto(saldoCaixa())}</div><div class="d">saldo consolidado</div></div>
    <div class="kpi neutro"><div class="r">A receber</div><div class="v">${brlCurto(totalRec)}</div><div class="d">${rec.length} títulos${vencidasR.length?' · <span style="color:var(--tijolo)">'+vencidasR.length+' vencidos</span>':''}</div></div>
    <div class="kpi ${vencidasP.length?'alerta':'aviso'}"><div class="r">A pagar</div><div class="v">${brlCurto(totalPag)}</div><div class="d">${pag.length} títulos${vencidasP.length?' · <span style="color:var(--tijolo)">'+vencidasP.length+' vencidos</span>':''}</div></div>
    <div class="kpi ${entradaMes-saidaMes>=0?'bom':'alerta'}"><div class="r">Resultado do mês</div><div class="v">${brlCurto(entradaMes-saidaMes)}</div><div class="d">${brlCurto(entradaMes)} - ${brlCurto(saidaMes)}</div></div>
  </div>
  <div class="abas" style="margin-bottom:12px">${abas.map(([k,r])=>`<button data-act="aba-fin" data-k="${k}" aria-selected="${a===k}">${r}</button>`).join('')}</div>
  ${corpo}`;
}

/* ===== DASHBOARD FINANCEIRO ===== */
function blocoDashboardFin(){
  const rec=emAberto('receber'), pag=emAberto('pagar');
  const totalRec=soma(rec,c=>c.valor), totalPag=soma(pag,c=>c.valor);
  const vencidasR=rec.filter(c=>c.venc<hoje()), vencidasP=pag.filter(c=>c.venc<hoje());
  const previsto=saldoCaixa()+totalRec-totalPag;
  const aging=agingReceber();
  const catPagar=categorizarContas('pagar');
  
  return `
  <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Saldo Projetado (30d)</div>
      <div class="num" style="font-size:28px;font-weight:700;margin-top:8px;color:${previsto>=0?'var(--verde)':'var(--tijolo)'}">${brl(previsto)}</div>
      <div class="mini" style="margin-top:4px">Caixa + recebimentos - pagamentos</div>
    </div>
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Inadimplencia</div>
      <div class="num" style="font-size:28px;font-weight:700;margin-top:8px;color:var(--tijolo)">${brl(soma(vencidasR,c=>c.valor))}</div>
      <div class="mini" style="margin-top:4px">${vencidasR.length} titulos vencidos</div>
    </div>
    <div class="card card-p" style="text-align:center">
      <div class="mini" style="font-weight:600">Compromissos Atrasados</div>
      <div class="num" style="font-size:28px;font-weight:700;margin-top:8px;color:var(--sinal)">${brl(soma(vencidasP,c=>c.valor))}</div>
      <div class="mini" style="margin-top:4px">${vencidasP.length} contas vencidas</div>
    </div>
  </div>
  
  <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:14px">
    <div class="card card-p">
      <div class="mini" style="font-weight:600;margin-bottom:8px">Fluxo de Caixa - 6 meses</div>
      <div style="height:180px"><canvas id="grafico-fluxo-dash"></canvas></div>
    </div>
    <div class="card card-p">
      <div class="mini" style="font-weight:600;margin-bottom:8px">Contas a Pagar por Categoria</div>
      <div style="height:180px"><canvas id="grafico-cat-pagar"></canvas></div>
    </div>
  </div>

  <div class="tit-sec">Aging - Contas a Receber</div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha">
      <thead><tr><th>Faixa</th><th style="text-align:right">Qtd</th><th style="text-align:right">Total (R$)</th><th style="text-align:right">% Total</th><th>Barra</th></tr></thead>
      <tbody>${aging.map(a=>`<tr>
        <td style="font-weight:600;color:${a.cor}">${a.faixa}</td>
        <td class="n">${a.qtd}</td><td class="n">${brl(a.valor)}</td>
        <td class="n">${a.perc}%</td>
        <td><div class="barra-prog" style="width:120px"><i class="${a.cls}" style="width:${a.perc}%"></i></div></td>
      </tr>`).join('')}
      <tr style="font-weight:700;border-top:2px solid var(--aco-300)">
        <td>TOTAL</td><td class="n">${soma(aging,a=>a.qtd)}</td><td class="n">${brl(soma(aging,a=>a.valor))}</td><td class="n">100%</td><td></td>
      </tr></tbody>
    </table>
  </div>
  
  <div class="tit-sec">Ranking de Clientes por Faturamento</div>
  <div class="card card-p">${rankingClientes()}</div>`;
}

function agingReceber(){
  const rec=emAberto('receber');
  const d=hoje();
  const faixas=[
    {faixa:'A vencer',f:c=>c.venc>=d,cor:'var(--verde)',cls:''},
    {faixa:'1-30 dias',f:c=>c.venc<d&&diasEntre(c.venc,d)<=30,cor:'var(--sinal)',cls:'medio'},
    {faixa:'31-60 dias',f:c=>c.venc<d&&diasEntre(c.venc,d)>30&&diasEntre(c.venc,d)<=60,cor:'var(--tijolo)',cls:'baixo'},
    {faixa:'61-90 dias',f:c=>c.venc<d&&diasEntre(c.venc,d)>60&&diasEntre(c.venc,d)<=90,cor:'var(--tijolo)',cls:'baixo'},
    {faixa:'+ de 90 dias',f:c=>c.venc<d&&diasEntre(c.venc,d)>90,cor:'var(--tijolo)',cls:'baixo'}
  ];
  const total=Math.max(1,soma(rec,c=>c.valor));
  return faixas.map(fx=>{
    const itens=rec.filter(fx.f);
    const val=soma(itens,c=>c.valor);
    return {...fx,qtd:itens.length,valor:val,perc:Math.round(val/total*100)};
  });
}

function categorizarContas(tipo){
  const lista=S.contas.filter(c=>c.tipo===tipo&&!c.pago);
  const cats={};
  lista.forEach(c=>{const k=c.cat||'Outros';cats[k]=(cats[k]||{qtd:0,valor:0});cats[k].qtd++;cats[k].valor+=c.valor;});
  const total=Math.max(1,soma(lista,c=>c.valor));
  return Object.entries(cats).sort((a,b)=>b[1].valor-a[1].valor).map(([k,v])=>({cat:k,...v,perc:Math.round(v.valor/total*100)}));
}

function rankingClientes(){
  const rank={};
  S.os.forEach(o=>{
    const c=C(o.cli);
    if(!rank[o.cli]) rank[o.cli]={nome:c.nome,fat:0,os:0,ticket:0};
    rank[o.cli].fat+=totOS(o); rank[o.cli].os++;
  });
  const list=Object.values(rank).sort((a,b)=>b.fat-a.fat).slice(0,6);
  list.forEach(r=>r.ticket=r.os?r.fat/r.os:0);
  const max=list.length?list[0].fat:1;
  return list.map((r,i)=>`<div style="margin-bottom:12px">
    <div class="entre" style="font-size:13px"><span><b style="color:var(--petroleo)">#${i+1}</b> ${esc(r.nome)}</span><b class="num">${brl(r.fat)}</b></div>
    <div class="mini">${r.os} OS - Ticket medio ${brl(r.ticket)}</div>
    <div class="barra-prog" style="margin-top:4px"><i style="width:${r.fat/max*100}%"></i></div>
  </div>`).join('')||'<div class="mini">Sem dados ainda.</div>';
}

/* ===== CONTAS A RECEBER - RELATORIO COMPLETO ===== */
function blocoContasReceber(){
  const rec=S.contas.filter(c=>c.tipo==='receber');
  const abertos=rec.filter(c=>!c.pago);
  const totalAberto=soma(abertos,c=>c.valor);
  const maiorTitulo=abertos.length?abertos.reduce((a,b)=>b.valor>a.valor?b:a,abertos[0]):null;
  const vencidos=abertos.filter(c=>c.venc<hoje());
  const totalVencido=soma(vencidos,c=>c.valor);
  const cronograma=cronogramaDiario(abertos,14);
  const porCliente={};
  abertos.forEach(c=>{const k=c.parte;porCliente[k]=(porCliente[k]||{qtd:0,valor:0});porCliente[k].qtd++;porCliente[k].valor+=c.valor;});
  const clienteList=Object.entries(porCliente).sort((a,b)=>b[1].valor-a[1].valor);
  
  return `
  <div class="card card-p" style="background:var(--petroleo);color:#fff;border-radius:var(--raio);margin-bottom:14px">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:2px">CONTAS A RECEBER</h2>
    <div style="font-size:13px;opacity:0.8">${esc(S.cfg.empresa)} | Relatorio Gerencial | Emissao: ${dataBRfull(hoje())}</div>
  </div>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--petroleo)">
      <div class="mini" style="font-weight:600">TOTAL EM ABERTO</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--petroleo);margin-top:6px">${brl(totalAberto)}</div>
      <div class="mini" style="margin-top:4px">${abertos.length} titulos</div>
    </div>
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--tijolo)">
      <div class="mini" style="font-weight:600">VENCIDO</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--tijolo);margin-top:6px">${brl(totalVencido)}</div>
      <div class="mini" style="margin-top:4px">${vencidos.length} titulos em atraso</div>
    </div>
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--sinal)">
      <div class="mini" style="font-weight:600">MAIOR TITULO</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--sinal);margin-top:6px">${maiorTitulo?brl(maiorTitulo.valor):'--'}</div>
      <div class="mini" style="margin-top:4px">${maiorTitulo?esc(maiorTitulo.parte):'--'}</div>
    </div>
  </div>
  <div class="tit-sec">Resumo por Cliente</div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha">
      <thead><tr><th>SACADO / CLIENTE</th><th style="text-align:right">QTD</th><th style="text-align:right">TOTAL (R$)</th><th style="text-align:right">% TOTAL</th></tr></thead>
      <tbody>${clienteList.map(([k,v])=>`<tr>
        <td style="font-weight:600">${esc(k)}</td>
        <td class="n">${v.qtd}</td><td class="n">${brl(v.valor)}</td>
        <td class="n">${Math.round(v.valor/Math.max(1,totalAberto)*100)}%</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--aco-050);border-top:2px solid var(--aco-300)">
        <td>TOTAL</td><td class="n">${abertos.length}</td><td class="n">${brl(totalAberto)}</td><td class="n">100%</td>
      </tr></tbody>
    </table>
  </div>
  <div class="tit-sec">Cronograma de Vencimentos</div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha">
      <thead><tr><th>DATA</th><th>DIA DA SEMANA</th><th style="text-align:right">QTD</th><th style="text-align:right">TOTAL (R$)</th><th style="text-align:right">%</th><th>PRINCIPAIS COMPROMISSOS</th></tr></thead>
      <tbody>${cronograma.map(dia=>`<tr${dia.atrasado?' style="color:var(--tijolo)"':''}>
        <td class="mono" style="white-space:nowrap">${dataBRfull(dia.data)}</td>
        <td>${dia.diaSemana}</td>
        <td class="n">${dia.qtd}</td><td class="n">${brl(dia.valor)}</td>
        <td class="n">${dia.perc}%</td>
        <td style="font-size:12px">${esc(dia.resumo)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>
  <div class="tit-sec">Todos os Titulos</div>
  <button class="bt p g" style="margin-bottom:11px" data-act="nova-conta" data-t="receber">${ico('mais',18)} Lancar recebimento</button>
  ${listaContasDetalhada('receber')}`;
}

/* ===== CONTAS A PAGAR - RELATORIO COMPLETO ===== */
function blocoContasPagar(){
  const pag=S.contas.filter(c=>c.tipo==='pagar');
  const abertos=pag.filter(c=>!c.pago);
  const totalAberto=soma(abertos,c=>c.valor);
  const maiorSaida=abertos.length?abertos.reduce((a,b)=>b.valor>a.valor?b:a,abertos[0]):null;
  const porDia={};
  abertos.forEach(c=>{porDia[c.venc]=(porDia[c.venc]||0)+c.valor;});
  const maiorDia=Object.entries(porDia).sort((a,b)=>b[1]-a[1])[0];
  const catPagar=categorizarContas('pagar');
  const cronograma=cronogramaDiario(abertos,14);
  
  return `
  <div class="card card-p" style="background:var(--petroleo);color:#fff;border-radius:var(--raio);margin-bottom:14px">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:2px">RELATORIO DE CONTAS A PAGAR</h2>
    <div style="font-size:13px;opacity:0.8">${esc(S.cfg.empresa)} | Situacao: A Pagar | Emissao: ${dataBRfull(hoje())}</div>
  </div>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--petroleo)">
      <div class="mini" style="font-weight:600">TOTAL GERAL A PAGAR</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--petroleo);margin-top:6px">${brl(totalAberto)}</div>
      <div class="mini" style="margin-top:4px">Soma de ${abertos.length} compromissos</div>
    </div>
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--tijolo)">
      <div class="mini" style="font-weight:600">MAIOR SAIDA INDIVIDUAL</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--tijolo);margin-top:6px">${maiorSaida?brl(maiorSaida.valor):'--'}</div>
      <div class="mini" style="margin-top:4px">${maiorSaida?esc(maiorSaida.parte):'--'}</div>
    </div>
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--sinal)">
      <div class="mini" style="font-weight:600">MAIOR CONCENTRACAO DIARIA</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--sinal);margin-top:6px">${maiorDia?brl(maiorDia[1]):'--'}</div>
      <div class="mini" style="margin-top:4px">${maiorDia?'Data: '+dataBRfull(maiorDia[0]):'--'}</div>
    </div>
  </div>
  <div class="tit-sec">Resumo por Categoria</div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha">
      <thead><tr><th>CATEGORIA</th><th style="text-align:right">QTD</th><th style="text-align:right">TOTAL (R$)</th><th style="text-align:right">% TOTAL</th></tr></thead>
      <tbody>${catPagar.map(c=>`<tr>
        <td style="font-weight:600">${esc(c.cat)}</td>
        <td class="n">${c.qtd}</td><td class="n">${brl(c.valor)}</td>
        <td class="n">${c.perc}%</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--aco-050);border-top:2px solid var(--aco-300)">
        <td>TOTAL</td><td class="n">${soma(catPagar,c=>c.qtd)}</td><td class="n">${brl(soma(catPagar,c=>c.valor))}</td><td class="n">100%</td>
      </tr></tbody>
    </table>
  </div>
  <div class="tit-sec">Cronograma Diario de Vencimentos</div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha">
      <thead><tr><th>DATA VENCIMENTO</th><th>DIA DA SEMANA</th><th style="text-align:right">QTD TITULOS</th><th style="text-align:right">TOTAL DO DIA (R$)</th><th style="text-align:right">% DO TOTAL</th><th>PRINCIPAIS COMPROMISSOS DO DIA</th></tr></thead>
      <tbody>${cronograma.map(dia=>`<tr${dia.atrasado?' style="color:var(--tijolo)"':''}>
        <td class="mono" style="white-space:nowrap">${dataBRfull(dia.data)}</td>
        <td>${dia.diaSemana}</td>
        <td class="n">${dia.qtd}</td><td class="n">${brl(dia.valor)}</td>
        <td class="n">${dia.perc}%</td>
        <td style="font-size:12px">${esc(dia.resumo)}</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:var(--aco-050);border-top:2px solid var(--aco-300)">
        <td colspan="2">TOTAL GERAL</td>
        <td class="n">${soma(cronograma,d=>d.qtd)}</td>
        <td class="n">${brl(soma(cronograma,d=>d.valor))}</td>
        <td class="n">100%</td><td></td>
      </tr></tbody>
    </table>
  </div>
  <div class="tit-sec">Todos os Titulos</div>
  <button class="bt s g" style="margin-bottom:11px" data-act="nova-conta" data-t="pagar">${ico('mais',18)} Lancar conta a pagar</button>
  ${listaContasDetalhada('pagar')}`;
}

/* ===== HELPERS FINANCEIROS ===== */
const DIAS_SEMANA=['Domingo','Segunda-feira','Terca-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sabado'];

function cronogramaDiario(contas,dias){
  const porDia={};
  contas.forEach(c=>{
    if(!porDia[c.venc]) porDia[c.venc]={data:c.venc,qtd:0,valor:0,itens:[]};
    porDia[c.venc].qtd++;
    porDia[c.venc].valor+=c.valor;
    porDia[c.venc].itens.push(c);
  });
  const total=Math.max(1,soma(contas,c=>c.valor));
  return Object.values(porDia).sort((a,b)=>a.data.localeCompare(b.data)).map(d=>{
    const dt=new Date(d.data+'T12:00');
    const resumo=d.itens.slice(0,3).map(c=>`${c.parte} (${brl(c.valor)})`).join(' + ')+(d.itens.length>3?' e mais...':'');
    return {...d,diaSemana:DIAS_SEMANA[dt.getDay()],perc:(d.valor/total*100).toFixed(1),atrasado:d.data<hoje(),resumo};
  });
}

function listaContasDetalhada(tipo){
  const lista=S.contas.filter(c=>c.tipo===tipo).sort((x,y)=>(x.pago-y.pago)||x.venc.localeCompare(y.venc));
  return `<div class="lista">${lista.map(c=>{
    const atras=!c.pago&&c.venc<hoje(), hj=!c.pago&&c.venc===hoje();
    const cor=c.pago?'var(--aco-150)':atras?'var(--tijolo)':hj?'var(--sinal)':'var(--petroleo)';
    return `<div class="item">
      <div class="cor" style="background:${cor}"></div>
      <div class="txt">
        <div class="t1" style="${c.pago?'color:var(--aco-400);text-decoration:line-through':''}">${esc(c.desc)}</div>
        <div class="t2">${esc(c.parte)} ${c.doc?'- '+esc(c.doc)+' ':''}vence ${dataBRfull(c.venc)} ${atras?`<span style="color:var(--tijolo)">- ${-diasEntre(hoje(),c.venc)}d em atraso</span>`:hj?'<span style="color:#8A5B00">- hoje</span>':''}</div>
      </div>
      <div style="text-align:right">
        <div class="v">${brl(c.valor)}</div>
        ${c.pago?'<div class="mini" style="color:var(--verde)">baixado</div>'
          :`<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:5px">
              ${tipo==='receber'&&cliZap(c)?`<a class="bt sm zap" href="${linkZap(cliZap(c).fone,preencher(textoCobrancaRapida(),ctxCobranca(c,cliZap(c))))}" target="_blank" rel="noopener" data-act="cobrar-titulo" data-id="${c.id}">${ico('zap',15)}</a>`:''}
              <button class="bt sm ${tipo==='receber'?'v':'d'}" data-act="baixar" data-id="${c.id}">${tipo==='receber'?'Recebi':'Paguei'}</button>
            </div>`}
      </div>
    </div>`;}).join('')||`<div class="card vazia"><b>Nada por aqui</b>Sem titulos ${tipo==='receber'?'a receber':'a pagar'}.</div>`}</div>`;
}

/* ===== FLUXO DE CAIXA ===== */
function blocoFluxoCaixa(){
  const meses=[]; const base=new Date();
  for(let i=5;i>=0;i--){const d=new Date(base.getFullYear(),base.getMonth()-i,1);meses.push(d.toISOString().slice(0,7));}
  const ent=meses.map(m=>soma(S.movimentos.filter(x=>x.tipo==='entrada'&&mesRef(x.data)===m),x=>x.valor));
  const sai=meses.map(m=>soma(S.movimentos.filter(x=>x.tipo==='saida'&&mesRef(x.data)===m),x=>x.valor));
  const rot=meses.map(m=>['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m.slice(5,7)-1]);
  const previsto=saldoCaixa()+soma(emAberto('receber').filter(c=>c.venc<=addDias(hoje(),30)),c=>c.valor)-soma(emAberto('pagar').filter(c=>c.venc<=addDias(hoje(),30)),c=>c.valor);
  
  const fluxoDiario=[];
  let saldoAcum=saldoCaixa();
  for(let i=0;i<14;i++){
    const dia=addDias(hoje(),i);
    const entDia=soma(S.contas.filter(c=>c.tipo==='receber'&&!c.pago&&c.venc===dia),c=>c.valor);
    const saiDia=soma(S.contas.filter(c=>c.tipo==='pagar'&&!c.pago&&c.venc===dia),c=>c.valor);
    saldoAcum+=entDia-saiDia;
    fluxoDiario.push({dia,entDia,saiDia,saldo:saldoAcum});
  }
  
  return `
  <div class="card card-p" style="background:var(--petroleo);color:#fff;border-radius:var(--raio);margin-bottom:14px">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:2px">FLUXO DE CAIXA</h2>
    <div style="font-size:13px;opacity:0.8">${esc(S.cfg.empresa)} | Emissao: ${dataBRfull(hoje())}</div>
  </div>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--verde)">
      <div class="mini" style="font-weight:600">SALDO HOJE</div>
      <div class="num" style="font-size:26px;font-weight:700;color:var(--verde);margin-top:6px">${brl(saldoCaixa())}</div>
    </div>
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--petroleo)">
      <div class="mini" style="font-weight:600">PROJECAO 30 DIAS</div>
      <div class="num" style="font-size:26px;font-weight:700;color:${previsto>=0?'var(--petroleo)':'var(--tijolo)'};margin-top:6px">${brl(previsto)}</div>
    </div>
    <div class="card card-p" style="text-align:center;border-top:3px solid var(--sinal)">
      <div class="mini" style="font-weight:600">RESULTADO MES</div>
      <div class="num" style="font-size:26px;font-weight:700;color:${ent[5]-sai[5]>=0?'var(--verde)':'var(--tijolo)'};margin-top:6px">${brl(ent[5]-sai[5])}</div>
    </div>
  </div>
  <div class="card card-p">
    <div class="entre" style="margin-bottom:8px"><h3 style="font-size:15px">Entradas vs. Saidas - 6 meses</h3></div>
    <div style="height:220px"><canvas id="grafico-fluxo"></canvas></div>
  </div>
  <div class="tit-sec">Projecao Diaria - Proximos 14 Dias</div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha">
      <thead><tr><th>DATA</th><th>DIA</th><th style="text-align:right;color:var(--verde)">ENTRADAS</th><th style="text-align:right;color:var(--tijolo)">SAIDAS</th><th style="text-align:right">SALDO PROJETADO</th></tr></thead>
      <tbody>${fluxoDiario.map(d=>{
        const dt=new Date(d.dia+'T12:00');
        return `<tr${d.saldo<0?' style="background:var(--tijolo-fraco)"':''}>
          <td class="mono" style="white-space:nowrap">${dataBRfull(d.dia)}</td>
          <td>${DIAS_SEMANA[dt.getDay()].slice(0,3)}</td>
          <td class="n" style="color:var(--verde)">${d.entDia?'+'+brl(d.entDia):'--'}</td>
          <td class="n" style="color:var(--tijolo)">${d.saiDia?'-'+brl(d.saiDia):'--'}</td>
          <td class="n" style="font-weight:700;color:${d.saldo>=0?'var(--verde)':'var(--tijolo)'}"><b>${brl(d.saldo)}</b></td>
        </tr>`;}).join('')}
      </tbody>
    </table>
  </div>
  <div class="tit-sec">Movimentacoes Recentes</div>
  <button class="bt g" style="margin-bottom:11px" data-act="novo-mov">${ico('mais',18)} Lancar entrada ou saida no caixa</button>
  <div class="lista">${S.movimentos.slice().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,25).map(m=>`
    <div class="item">
      <div class="cor" style="background:${m.tipo==='entrada'?'var(--verde)':'var(--tijolo)'}"></div>
      <div class="txt"><div class="t1">${esc(m.desc)}</div><div class="t2">${dataBRfull(m.data)} - ${esc(m.cat)} ${m.conc?'- conciliado':'- <span style="color:var(--sinal-escuro,#8A5B00)">nao conciliado</span>'}</div></div>
      <div class="v" style="color:${m.tipo==='entrada'?'var(--verde)':'var(--tijolo)'}">${m.tipo==='entrada'?'+':'-'} ${brl(m.valor)}</div>
    </div>`).join('')}</div>`;
}

/* ===== DRE SIMPLIFICADO ===== */
function blocoDRE(){
  const mes=mesRef(hoje());
  const entradas=S.movimentos.filter(m=>m.tipo==='entrada'&&mesRef(m.data)===mes);
  const saidas=S.movimentos.filter(m=>m.tipo==='saida'&&mesRef(m.data)===mes);
  const recServ=soma(entradas.filter(m=>m.cat==='Serviços'),m=>m.valor);
  const recPecas=soma(entradas.filter(m=>m.cat==='Peças'),m=>m.valor);
  const recOutros=soma(entradas.filter(m=>m.cat!=='Serviços'&&m.cat!=='Peças'),m=>m.valor);
  const totalRec=recServ+recPecas+recOutros;
  
  const custoPec=soma(saidas.filter(m=>m.cat==='Peças'),m=>m.valor);
  const pessoal=soma(saidas.filter(m=>m.cat==='Pessoal'),m=>m.valor);
  const fixas=soma(saidas.filter(m=>m.cat==='Fixas'),m=>m.valor);
  const impostos=soma(saidas.filter(m=>m.cat==='Impostos'),m=>m.valor);
  const outrasDesp=soma(saidas.filter(m=>m.cat!=='Peças'&&m.cat!=='Pessoal'&&m.cat!=='Fixas'&&m.cat!=='Impostos'),m=>m.valor);
  const totalDesp=custoPec+pessoal+fixas+impostos+outrasDesp;
  const resultado=totalRec-totalDesp;
  const margem=totalRec?Math.round(resultado/totalRec*100):0;
  
  const nomeMes=['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][new Date().getMonth()];
  
  return `
  <div class="card card-p" style="background:var(--petroleo);color:#fff;border-radius:var(--raio);margin-bottom:14px">
    <h2 style="font-size:20px;font-weight:700;margin-bottom:2px">DRE - DEMONSTRATIVO DE RESULTADOS</h2>
    <div style="font-size:13px;opacity:0.8">${esc(S.cfg.empresa)} | ${nomeMes} de ${new Date().getFullYear()}</div>
  </div>
  <div class="card" style="overflow-x:auto">
    <table class="tabelinha" style="font-size:14px">
      <thead><tr style="background:var(--aco-050)"><th colspan="2" style="font-size:14px;padding:12px">DEMONSTRACAO DO RESULTADO DO EXERCICIO</th></tr></thead>
      <tbody>
      <tr style="background:var(--verde-fraco)"><td style="font-weight:700;padding:10px 8px">RECEITAS</td><td class="n" style="font-weight:700;font-size:16px;padding:10px 8px">${brl(totalRec)}</td></tr>
      <tr><td style="padding-left:24px">Servicos de mao de obra</td><td class="n">${brl(recServ)}</td></tr>
      <tr><td style="padding-left:24px">Venda de pecas</td><td class="n">${brl(recPecas)}</td></tr>
      <tr><td style="padding-left:24px">Outras receitas</td><td class="n">${brl(recOutros)}</td></tr>
      <tr style="background:var(--tijolo-fraco)"><td style="font-weight:700;padding:10px 8px">DESPESAS E CUSTOS</td><td class="n" style="font-weight:700;font-size:16px;color:var(--tijolo);padding:10px 8px">- ${brl(totalDesp)}</td></tr>
      <tr><td style="padding-left:24px">Custo de pecas / materia-prima</td><td class="n" style="color:var(--tijolo)">- ${brl(custoPec)}</td></tr>
      <tr><td style="padding-left:24px">Folha / Salarios / Pessoal</td><td class="n" style="color:var(--tijolo)">- ${brl(pessoal)}</td></tr>
      <tr><td style="padding-left:24px">Despesas fixas (aluguel, energia, etc)</td><td class="n" style="color:var(--tijolo)">- ${brl(fixas)}</td></tr>
      <tr><td style="padding-left:24px">Impostos</td><td class="n" style="color:var(--tijolo)">- ${brl(impostos)}</td></tr>
      <tr><td style="padding-left:24px">Outras despesas</td><td class="n" style="color:var(--tijolo)">- ${brl(outrasDesp)}</td></tr>
      <tr style="background:${resultado>=0?'var(--verde)':'var(--tijolo)'};color:#fff">
        <td style="font-weight:700;font-size:16px;padding:14px 8px">RESULTADO DO PERIODO</td>
        <td class="n" style="font-weight:700;font-size:20px;padding:14px 8px">${brl(resultado)}</td>
      </tr>
      <tr style="background:var(--aco-050)">
        <td style="font-weight:600">Margem liquida</td>
        <td class="n" style="font-weight:700;font-size:16px;color:${margem>=0?'var(--verde)':'var(--tijolo)'}">${margem}%</td>
      </tr>
      </tbody>
    </table>
  </div>
  <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:14px">
    <div class="card card-p">
      <div class="mini" style="font-weight:600;margin-bottom:8px">Composicao das Receitas</div>
      <div style="height:160px"><canvas id="grafico-rec-dre"></canvas></div>
    </div>
    <div class="card card-p">
      <div class="mini" style="font-weight:600;margin-bottom:8px">Composicao das Despesas</div>
      <div style="height:160px"><canvas id="grafico-desp-dre"></canvas></div>
    </div>
  </div>`;
}
