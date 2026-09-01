/* =====================================================================
   PÁTIO — CRM/ERP de oficina de caminhões
   Dados ficam salvos no armazenamento do artefato (window.storage),
   com fallback em memória caso não exista.
===================================================================== */
const CHAVE='patio_oficina_v1';
let S=null, salvarTimer=null;

const armazem={
  async ler(){ try{ const r=await window.storage.get(CHAVE); return r? JSON.parse(r.value):null; }catch(e){ return null; } },
  async gravar(o){ try{ await window.storage.set(CHAVE, JSON.stringify(o)); }catch(e){ /* segue em memória */ } }
};
function salvar(){ clearTimeout(salvarTimer); salvarTimer=setTimeout(()=>armazem.gravar(S),300); }

/* ---------------- utilidades ---------------- */
const uid=(p='id')=>p+'_'+Math.random().toString(36).slice(2,9);
const brl=n=>(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brlCurto=n=>{n=n||0;return n>=1000? 'R$ '+(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'k' : brl(n);};
const hoje=()=>new Date().toISOString().slice(0,10);
const dataBR=d=>d? d.slice(8,10)+'/'+d.slice(5,7):'';
const dataBRfull=d=>d? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const diasEntre=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
function addDias(d,n){const x=new Date(d+'T12:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);}
function mesRef(d){return d.slice(0,7);}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function torrar(msg){const t=document.getElementById('torrada');t.textContent=msg;t.classList.add('on');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('on'),2400);}

const ST={
  fila:{r:'Na fila',c:'var(--aco-300)'},
  aprovacao:{r:'Aguardando aprovação',c:'var(--ardosia)'},
  executando:{r:'Em execução',c:'var(--petroleo)'},
  peca:{r:'Parado por peça',c:'var(--sinal)'},
  finalizada:{r:'Finalizada',c:'var(--verde)'}
};

/* ---------------- ícones ---------------- */
const ico=(n,s=20)=>{
  const p={
    patio:'<path d="M3 17V9a1 1 0 0 1 1-1h10v9M14 11h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    caixa:'<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>',
    grana:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    gente:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 8.2a3 3 0 0 1 0 5.6M17.5 19c0-2.2-.6-3.6-1.5-4.5"/>',
    painel:'<path d="M4 19V11M9.3 19V5M14.7 19v-6M20 19V8"/>',
    busca:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    nota:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    cifrao:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    eng:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    arq:'<path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M2 15h10M2 18h10"/>',
    mais:'<path d="M12 5v14M5 12h14"/>',
    x:'<path d="m6 6 12 12M18 6 6 18"/>',
    alerta:'<path d="M12 4.5 2.8 20h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    seta:'<path d="m9 5 7 7-7 7"/>',
    check:'<path d="m5 12.5 4.5 4.5L19 7"/>',
    upload:'<path d="M12 16V5M8 9l4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    banco:'<path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5.5 10.5V17M10 10.5V17M14 10.5V17M18.5 10.5V17M3.5 20h17"/>',
    nota:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    relogio:'<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 2"/>',
    chave:'<path d="M14.5 7.5a4 4 0 1 0-3.9 5L9 14l-2 .3-.3 2L5 18l-2-.3.3-2 5-5.2a4 4 0 0 1 6.2-3z"/>',
    zap:'<path d="M20 11.8c0 4-3.4 7.2-7.6 7.2-1.3 0-2.5-.3-3.6-.8L4 19.5l1.4-4.2A6.9 6.9 0 0 1 4.8 11.8C4.8 7.9 8.2 4.7 12.4 4.7S20 7.9 20 11.8z"/>',
    megafone:'<path d="M4 10v4a1 1 0 0 0 1 1h3l6 4V5L8 9H5a1 1 0 0 0-1 1z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>',
    lista:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    loja:'<path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>',
    pix:'<path d="M12 22l-10-10 10-10 10 10z"/>',
    grafico:'<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    livro:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    baixo:'<path d="m6 9 6 6 6-6"/>',
    dir:'<path d="M5 12h14M12 5l7 7-7 7"/>'
  }[n]||'';
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
};

/* ---------------- dados iniciais (demo com cara de oficina de verdade) ---------------- */
function sementes(){
  const d=hoje();
  const clientes=[
    {id:'cli1',nome:'Transportes Ribeirão',doc:'12.345.678/0001-90',fone:'(16) 99812-4400',contato:'Marlene',prazo:28,optin:true},
    {id:'cli2',nome:'Frigorífico Boi Dourado',doc:'09.887.221/0001-33',fone:'(16) 99730-1188',contato:'Seu Almir',prazo:14,optin:true},
    {id:'cli3',nome:'Agro Canavial Log',doc:'21.554.900/0001-07',fone:'(16) 98811-2233',contato:'Douglas',prazo:30,optin:true},
    {id:'cli4',nome:'Wilson Batista (autônomo)',doc:'188.229.331-04',fone:'(16) 99120-8877',contato:'Wilson',prazo:0,optin:false}
  ];
  const veiculos=[
    {id:'v1',cli:'cli1',placa:'RJK-7C21',modelo:'Scania R450 6x2',ano:'2019',km:684300,tipo:'Cavalo'},
    {id:'v2',cli:'cli1',placa:'FTG-2D08',modelo:'Randon SR Graneleiro',ano:'2017',km:0,tipo:'Carreta'},
    {id:'v3',cli:'cli2',placa:'BWA-9911',modelo:'Volvo FH 540',ano:'2021',km:412870,tipo:'Cavalo'},
    {id:'v4',cli:'cli3',placa:'QNP-5J77',modelo:'Mercedes Actros 2651',ano:'2020',km:530115,tipo:'Cavalo'},
    {id:'v5',cli:'cli4',placa:'GHE-4408',modelo:'VW Constellation 24.280',ano:'2015',km:791600,tipo:'Truck'},
    {id:'v6',cli:'cli3',placa:'LPO-1A55',modelo:'Iveco Hi-Way 480',ano:'2018',km:602440,tipo:'Cavalo'}
  ];
  const pecas=[
    {id:'p1',cod:'FIL-1023',nome:'Filtro de óleo Scania R450',un:'un',qtd:8,min:4,custo:78.9,venda:139.9,loc:'A1',forn:'Distripeças'},
    {id:'p2',cod:'FIL-2210',nome:'Filtro Racor separador água',un:'un',qtd:3,min:5,custo:96.5,venda:172,loc:'A2',forn:'Distripeças'},
    {id:'p3',cod:'OLE-15W40',nome:'Óleo motor 15W40 CK-4 (litro)',un:'L',qtd:184,min:60,custo:23.4,venda:39.9,loc:'B1',forn:'Lubrimax'},
    {id:'p4',cod:'PAS-880',nome:'Pastilha freio dianteira Volvo FH',un:'jg',qtd:2,min:2,custo:612,venda:1090,loc:'C3',forn:'Freios Sul'},
    {id:'p5',cod:'LON-450',nome:'Lona de freio traseira (jogo)',un:'jg',qtd:5,min:2,custo:389,venda:690,loc:'C1',forn:'Freios Sul'},
    {id:'p6',cod:'ROL-2211',nome:'Rolamento cubo roda dianteiro',un:'un',qtd:6,min:3,custo:274,venda:498,loc:'C2',forn:'Rolamar'},
    {id:'p7',cod:'CRR-118',nome:'Correia poli-V 8PK 1870',un:'un',qtd:4,min:3,custo:118,venda:215,loc:'A4',forn:'Distripeças'},
    {id:'p8',cod:'BOM-DAG',nome:"Bomba d'água Actros",un:'un',qtd:1,min:1,custo:1180,venda:1980,loc:'D1',forn:'Truck Parts'},
    {id:'p9',cod:'AMO-770',nome:'Amortecedor traseiro carreta',un:'un',qtd:9,min:4,custo:198,venda:349,loc:'D2',forn:'Suspensul'},
    {id:'p10',cod:'FEX-6M',nome:'Feixe de mola parabólico 6 lâminas',un:'un',qtd:2,min:2,custo:1420,venda:2390,loc:'Pátio',forn:'Suspensul'},
    {id:'p11',cod:'ARL-24',nome:'Arla 32 (litro)',un:'L',qtd:410,min:200,custo:2.6,venda:5.4,loc:'B2',forn:'Lubrimax'},
    {id:'p12',cod:'FIL-AR9',nome:'Filtro de ar externo',un:'un',qtd:7,min:4,custo:164,venda:289,loc:'A3',forn:'Distripeças'},
    {id:'p13',cod:'BAT-150',nome:'Bateria 150Ah',un:'un',qtd:4,min:2,custo:690,venda:1090,loc:'E1',forn:'Baterias RP'},
    {id:'p14',cod:'MAN-EMB',nome:'Kit embreagem 430mm',un:'kit',qtd:1,min:1,custo:3980,venda:6250,loc:'E2',forn:'Truck Parts'}
  ];
  const servicos=[
    {id:'s1',nome:'Troca de óleo e filtros',valor:380,horas:2},
    {id:'s2',nome:'Revisão de freios (por eixo)',valor:520,horas:3},
    {id:'s3',nome:'Alinhamento de direção',valor:290,horas:1.5},
    {id:'s4',nome:'Troca de feixe de molas',valor:980,horas:5},
    {id:'s5',nome:'Diagnóstico eletrônico',valor:250,horas:1},
    {id:'s6',nome:'Retífica de cabeçote',valor:2800,horas:16},
    {id:'s7',nome:'Troca de embreagem',valor:2200,horas:10},
    {id:'s8',nome:'Solda e reforço de chassi',valor:1450,horas:8},
    {id:'s9',nome:'Manutenção suspensão pneumática',valor:760,horas:4}
  ];
  const mecanicos=[
    {id:'m1',nome:'Zé Carlos',esp:'Motor'},{id:'m2',nome:'Dinho',esp:'Freios/Suspensão'},
    {id:'m3',nome:'Rafa',esp:'Elétrica/Diagnóstico'},{id:'m4',nome:'Baiano',esp:'Solda/Chassi'}
  ];
  const boxes=[
    {id:'b1',nome:'BOX 01',tipo:'Elevador'},{id:'b2',nome:'BOX 02',tipo:'Elevador'},
    {id:'b3',nome:'BOX 03',tipo:'Vala'},{id:'b4',nome:'BOX 04',tipo:'Vala'},
    {id:'b5',nome:'BOX 05',tipo:'Solda'},{id:'b6',nome:'PÁTIO',tipo:'Externo'}
  ];
  const os=[
    {id:'os1',num:1042,box:'b1',vei:'v1',cli:'cli1',mec:'m1',st:'executando',abertura:addDias(d,-2),prev:d,km:684300,
      queixa:'Revisão de 40 mil + perda de força em subida',
      servicos:[{id:uid('i'),ref:'s1',nome:'Troca de óleo e filtros',qtd:1,valor:380},{id:uid('i'),ref:'s5',nome:'Diagnóstico eletrônico',qtd:1,valor:250}],
      pecas:[{id:uid('i'),ref:'p1',nome:'Filtro de óleo Scania R450',qtd:1,valor:139.9},{id:uid('i'),ref:'p3',nome:'Óleo motor 15W40 CK-4 (litro)',qtd:38,valor:39.9}],
      desc:0,pago:false,obs:''},
    {id:'os2',num:1043,box:'b2',vei:'v3',cli:'cli2',mec:'m2',st:'aprovacao',abertura:addDias(d,-1),prev:addDias(d,1),km:412870,
      queixa:'Freio dianteiro chiando e pedal baixo',
      servicos:[{id:uid('i'),ref:'s2',nome:'Revisão de freios (por eixo)',qtd:2,valor:520}],
      pecas:[{id:uid('i'),ref:'p4',nome:'Pastilha freio dianteira Volvo FH',qtd:2,valor:1090}],
      desc:0,pago:false,obs:'Cliente pediu orçamento por WhatsApp antes de liberar.'},
    {id:'os3',num:1044,box:'b3',vei:'v4',cli:'cli3',mec:'m1',st:'peca',abertura:addDias(d,-4),prev:addDias(d,2),km:530115,
      queixa:"Superaquecendo — suspeita de bomba d'água",
      servicos:[{id:uid('i'),ref:'s5',nome:'Diagnóstico eletrônico',qtd:1,valor:250}],
      pecas:[{id:uid('i'),ref:'p8',nome:"Bomba d'água Actros",qtd:1,valor:1980}],
      desc:0,pago:false,obs:'Bomba pedida no fornecedor Truck Parts, chega quarta.'},
    {id:'os4',num:1045,box:'b5',vei:'v5',cli:'cli4',mec:'m4',st:'executando',abertura:addDias(d,-1),prev:addDias(d,1),km:791600,
      queixa:'Trinca na longarina traseira',
      servicos:[{id:uid('i'),ref:'s8',nome:'Solda e reforço de chassi',qtd:1,valor:1450}],
      pecas:[],desc:0,pago:false,obs:''},
    {id:'os5',num:1041,box:'b4',vei:'v6',cli:'cli3',mec:'m2',st:'finalizada',abertura:addDias(d,-6),prev:addDias(d,-3),km:602440,
      queixa:'Feixe de molas quebrado lado motorista',
      servicos:[{id:uid('i'),ref:'s4',nome:'Troca de feixe de molas',qtd:1,valor:980}],
      pecas:[{id:uid('i'),ref:'p10',nome:'Feixe de mola parabólico 6 lâminas',qtd:1,valor:2390}],
      desc:100,pago:true,obs:'Entregue e faturado.'}
  ];
  const contas=[
    // A Receber Vencidas
    {id:'c1',tipo:'receber',desc:'OS 1012 — Scania',parte:'Transportes Ribeirão',valor:5800,venc:addDias(d,-12),pago:false,cat:'Serviços',doc:'NFS 8812'},
    {id:'c2',tipo:'receber',desc:'OS 1025 — Volvo',parte:'Frigorífico Boi Dourado',valor:3150,venc:addDias(d,-5),pago:false,cat:'Serviços',doc:'NFS 8820'},
    // A Receber Hoje
    {id:'c3',tipo:'receber',desc:'OS 1030 — Iveco',parte:'Agro Canavial Log',valor:7200,venc:d,pago:false,cat:'Serviços',doc:'NFS 8830'},
    {id:'c4',tipo:'receber',desc:'OS 1031 — Mercedes',parte:'Logística BR',valor:4100,venc:d,pago:false,cat:'Peças',doc:'NFS 8831'},
    // A Receber Amanhã e Futuro
    {id:'c5',tipo:'receber',desc:'OS 1035 — Scania',parte:'Transportes Ribeirão',valor:12400,venc:addDias(d,1),pago:false,cat:'Serviços',doc:'NFS 8835'},
    {id:'c6',tipo:'receber',desc:'OS 1036 — Man',parte:'Expresso Sul',valor:950,venc:addDias(d,1),pago:false,cat:'Peças',doc:'NFS 8836'},
    {id:'c7',tipo:'receber',desc:'OS 1039 — Daf',parte:'Trans Norte',valor:6300,venc:addDias(d,4),pago:false,cat:'Serviços',doc:'NFS 8839'},
    {id:'c8',tipo:'receber',desc:'OS 1041 — Iveco',parte:'Agro Canavial Log',valor:3270,venc:addDias(d,6),pago:false,cat:'Serviços',doc:'NFS 8841'},
    
    // A Pagar Atrasadas
    {id:'c9',tipo:'pagar',desc:'Peças motor',parte:'Distribuidora Diesel',valor:8500,venc:addDias(d,-3),pago:false,cat:'Peças',doc:'NF 1290'},
    {id:'c10',tipo:'pagar',desc:'Serviços torno',parte:'Tornearia João',valor:1200,venc:addDias(d,-1),pago:false,cat:'Outros',doc:'NF 334'},
    // A Pagar Hoje
    {id:'c11',tipo:'pagar',desc:'Conta de Luz',parte:'CPFL',valor:1850,venc:d,pago:false,cat:'Fixas',doc:'Fatura'},
    {id:'c12',tipo:'pagar',desc:'Óleo lubrificante',parte:'Lubrax',valor:3400,venc:d,pago:false,cat:'Peças',doc:'NF 887'},
    // A Pagar Amanhã e Futuro
    {id:'c13',tipo:'pagar',desc:'Folha Pagamento',parte:'Equipe',valor:14500,venc:addDias(d,1),pago:false,cat:'Pessoal',doc:''},
    {id:'c14',tipo:'pagar',desc:'Impostos Municipais',parte:'Prefeitura',valor:2100,venc:addDias(d,1),pago:false,cat:'Impostos',doc:'Guia ISS'},
    {id:'c15',tipo:'pagar',desc:'Aluguel',parte:'Imobiliária',valor:6500,venc:addDias(d,5),pago:false,cat:'Fixas',doc:'Boleto'},
    {id:'c16',tipo:'pagar',desc:'Peças freio',parte:'Freios Sul',valor:4200,venc:addDias(d,12),pago:false,cat:'Peças',doc:'NF 44821'}
  ];

  const movimentos=[];
  for(let i=0; i<150; i++){
    const dataMov = addDias(d, -i);
    // Entradas simuladas
    if(Math.random()>0.4) movimentos.push({id:uid('mv'),data:dataMov,tipo:'entrada',desc:'Faturamento de OS',valor:1500+Math.random()*6000,cat:Math.random()>0.7?'Peças':'Serviços',conc:true});
    // Saídas fixas mensais
    if(dataMov.endsWith('-05')) movimentos.push({id:uid('mv'),data:dataMov,tipo:'saida',desc:'Folha de Pagamento',valor:14000+Math.random()*1000,cat:'Pessoal',conc:true});
    if(dataMov.endsWith('-10')) movimentos.push({id:uid('mv'),data:dataMov,tipo:'saida',desc:'Aluguel Galpão',valor:6500,cat:'Fixas',conc:true});
    if(dataMov.endsWith('-15')) movimentos.push({id:uid('mv'),data:dataMov,tipo:'saida',desc:'Impostos e Tributos',valor:3000+Math.random()*1000,cat:'Impostos',conc:true});
    // Saídas variáveis
    if(Math.random()>0.6) movimentos.push({id:uid('mv'),data:dataMov,tipo:'saida',desc:'Compra de Peças',valor:1000+Math.random()*4000,cat:'Peças',conc:true});
    if(Math.random()>0.8) movimentos.push({id:uid('mv'),data:dataMov,tipo:'saida',desc:'Despesas Gerais',valor:200+Math.random()*600,cat:'Outros',conc:true});
  }
  return {
    ui:{view:'patio',filtro:'todos',abaFin:'dashboard',abaOS:'servicos',osAberta:null,busca:''},
    cfg:{empresa:'Oficina Fort Diesel',saldoInicial:38000},
    clientes,veiculos,pecas,servicos,mecanicos,boxes,os,contas,movimentos,
    extrato:[], proxNum:1046, nfsRecebidas:[], zap:zapPadrao()
  };
}

function zapPadrao(){
  return {
    ativo:true, modo:'manual', janela:'08:00 às 18:00', soUteis:true,
    regua:[
      {id:'r1',quando:-3,ativo:true,nome:'Lembrete antes de vencer',
       texto:'Oi {contato}, tudo bem? Aqui é da {oficina}.\nPassando pra lembrar: o título de {valor} ({doc}) vence em {venc}, daqui a {dias} dias.\nQualquer coisa é só chamar por aqui.'},
      {id:'r2',quando:0,ativo:true,nome:'No dia do vencimento',
       texto:'Bom dia, {contato}! O título de {valor} da {oficina} vence hoje ({venc}).\nSe já pagou, me manda o comprovante que eu baixo aqui na hora.'},
      {id:'r3',quando:2,ativo:true,nome:'Cobrança leve (2 dias)',
       texto:'{contato}, o título de {valor} venceu em {venc} e ainda consta em aberto aqui na {oficina}.\nConsegue me dar uma posição hoje? Se precisar dividir, a gente resolve.'},
      {id:'r4',quando:10,ativo:false,nome:'Cobrança firme (10 dias)',
       texto:'{contato}, seguimos com {valor} em aberto desde {venc} ({dias} dias).\nPreciso regularizar antes de liberar novos serviços. Me chama pra combinar o pagamento.'}
    ],
    modelos:[
      {nome:'Promoção de revisão',texto:'{contato}, tudo certo? Aqui é da {oficina}.\nEssa semana estamos com revisão preventiva completa (óleo, filtros e freios) com 15% de desconto pra quem agenda até sexta.\nQuer que eu reserve um box pro {placa}?'},
      {nome:'Aviso de manutenção preventiva',texto:'{contato}, faz um tempo que o {placa} não passa aqui na {oficina}.\nRodar com a preventiva em dia sai bem mais barato que quebrar na estrada. Quer que eu separe um horário?'},
      {nome:'Mutirão de fim de mês',texto:'{contato}, no sábado a {oficina} abre em mutirão: check-up de freios e suspensão sem custo, com café por conta da casa.\nSó preciso saber quantos caminhões você traz.'}
    ],
    envios:[], campanhas:[]
  };
}

/* ---------------- seletores derivados ---------------- */
const V=id=>S.veiculos.find(x=>x.id===id)||{placa:'—',modelo:'—'};
const C=id=>S.clientes.find(x=>x.id===id)||{nome:'—'};
const P=id=>S.pecas.find(x=>x.id===id);
const B=id=>S.boxes.find(x=>x.id===id)||{nome:'—'};
const M=id=>S.mecanicos.find(x=>x.id===id)||{nome:'Sem responsável'};
const soma=(a,f)=>a.reduce((t,x)=>t+f(x),0);
const totServ=o=>soma(o.servicos,i=>i.qtd*i.valor);
const totPec=o=>soma(o.pecas,i=>i.qtd*i.valor);
const totOS=o=>totServ(o)+totPec(o)-(o.desc||0);
const osAbertas=()=>S.os.filter(o=>o.st!=='finalizada');
const emAberto=t=>S.contas.filter(c=>c.tipo===t&&!c.pago);
const saldoCaixa=()=>S.cfg.saldoInicial+soma(S.movimentos,m=>m.tipo==='entrada'?m.valor:-m.valor);
const estoqueCritico=()=>S.pecas.filter(p=>p.qtd<=p.min);
const custoPecasOS=o=>soma(o.pecas,i=>{const p=P(i.ref);return (p?p.custo:i.valor*.55)*i.qtd;});

/* ---------------- casca + navegação ---------------- */
const VIEWS={
  painel:{r:'Painel inicial',ico:'painel',nav:true},
  patio:{r:'Vendas',ico:'cifrao',nav:true},
  compras:{r:'Compras',ico:'caixa',nav:true},
  cadastros:{r:'Clientes',ico:'gente',nav:true},
  estoque:{r:'Produtos',ico:'eng',nav:true},
  vitrine:{r:'Vitrine Online',ico:'loja',nav:true},
  boletos:{r:'Boletos',ico:'nota',nav:true},
  mensagens:{r:'Cobranças',ico:'zap',nav:true},
  pix:{r:'Pix',ico:'pix',nav:true},
  notas:{r:'Nfe / Fiscal',ico:'arq',nav:true},
  relatorios:{r:'Relatórios',ico:'grafico',nav:true},
  configuracoes:{r:'Configurações',ico:'eng',nav:true},
  suporte:{r:'Suporte online',ico:'chat',nav:true}
};
function renderNav(){
  document.getElementById('nav').innerHTML=`
    <div class="nav-logo">
      <div class="chapa"></div><h2>${esc(S.cfg.empresa)}</h2>
    </div>
  ` + Object.entries(VIEWS).filter(([k,v])=>v.nav).map(([k,v])=>`
    <button data-act="ir" data-v="${k}" ${S.ui.view===k?'aria-current="page"':''}>
      <div class="pt"></div>${ico(v.ico,20)}<span>${v.r}</span>
    </button>`).join('');
}
function renderTopo(){
  const n=osAbertas().length, atraso=emAberto('receber').filter(c=>c.venc<hoje()).length;
  return `<header class="topo">
    <div class="marca">
      <div class="chapa"></div>
      <div>
        <h1>${esc(S.cfg.empresa)}</h1>
        <div class="sub">${n} ${n===1?'OS aberta':'OS abertas'} · caixa ${brlCurto(saldoCaixa())}</div>
      </div>
    </div>
    <div class="dir">
      ${atraso?`<span class="pill-topo" style="background:rgba(176,57,42,.25)">${ico('alerta',14)} ${atraso}</span>`:''}
      <span class="pill-topo mono">${dataBR(hoje())}</span>
    </div>
  </header>`;
}

function viewFaturamento() {
  const osFaturaveis = S.os.filter(o => o.st === 'finalizada' && !o.faturada);
  const totalFaturavel = soma(osFaturaveis, o => totOS(o));
  
  const fatMes = soma(S.os.filter(o => o.st === 'finalizada' && o.faturada && mesRef(o.fechamento) === mesRef(hoje())), o => totOS(o));

  return `
    <div class="tit-sec" style="margin-top:0">Faturamento e Cobranças</div>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="card card-p" style="border-left:4px solid var(--verde)">
        <div class="mini" style="font-weight:600;color:var(--verde)">Total Faturado (Mês)</div>
        <div class="num" style="font-size:24px;font-weight:700;margin-top:4px">${brl(fatMes)}</div>
      </div>
      <div class="card card-p" style="border-left:4px solid var(--petroleo)">
        <div class="mini" style="font-weight:600;color:var(--petroleo)">Aguardando Faturamento</div>
        <div class="num" style="font-size:24px;font-weight:700;margin-top:4px">${brl(totalFaturavel)}</div>
      </div>
      <button class="card card-p box-hov" style="background:var(--petroleo);color:#fff;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px" onclick="faturarTudo()">
        ${ico('eng', 24)}
        <div style="text-align:left">
          <div style="font-size:15px;font-weight:600">Faturar Pendentes</div>
          <div style="font-size:12px;opacity:0.8">Gerar ${osFaturaveis.length} cobranças</div>
        </div>
      </button>
    </div>
    <div class="card">
      <div class="tit-card">Ordens de Serviço Finalizadas (Pendentes)</div>
      ${!osFaturaveis.length?'<div class="vazia">Tudo faturado e em dia.</div>':
        `<table class="tb">
          <thead><tr><th>OS</th><th>Cliente</th><th>Data Fechamento</th><th class="n">Valor</th><th>Ações</th></tr></thead>
          <tbody>${osFaturaveis.map(o=>`<tr>
            <td><b style="color:var(--petroleo)">${o.num}</b></td>
            <td>${esc(C(o.cli).nome)}</td>
            <td>${dataBR(o.fechamento||hoje())}</td>
            <td class="n" style="font-weight:600">${brl(totOS(o))}</td>
            <td style="text-align:right">
              <button class="bt sm v" onclick="faturarOS('${o.id}')">Faturar Agora</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>`
      }
    </div>
  `;
}

window.faturarOS = function(id) {
  const o = S.os.find(x => x.id === id);
  if(o) { o.faturada = true; render(); torrar('OS faturada e cobrança enviada!'); }
}
window.faturarTudo = function() {
  const p = S.os.filter(o => o.st === 'finalizada' && !o.faturada);
  p.forEach(o => o.faturada = true); render(); torrar(`${p.length} OSs faturadas!`);
}

function viewNotasFiscais() {
  const notas = S.notasFiscais || [];
  const autorizadas = notas.filter(n => n.status === 'Autorizada');
  const rejeitadas = notas.filter(n => n.status === 'Rejeitada' || n.status === 'Denegada');
  const canceladas = notas.filter(n => n.status === 'Cancelada');

  return `
    <div class="tit-sec" style="margin-top:0">Gestão Fiscal (NFe / NFSe)</div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="card card-p">
        <div class="mini" style="font-weight:600">Total Emitidas (Mês)</div>
        <div class="num" style="font-size:24px;font-weight:700;margin-top:4px">${autorizadas.length}</div>
      </div>
      <div class="card card-p">
        <div class="mini" style="font-weight:600;color:var(--tijolo)">Rejeitadas/Denegadas</div>
        <div class="num" style="font-size:24px;font-weight:700;margin-top:4px;color:var(--tijolo)">${rejeitadas.length}</div>
      </div>
      <div class="card card-p">
        <div class="mini" style="font-weight:600;color:var(--aco-500)">Canceladas</div>
        <div class="num" style="font-size:24px;font-weight:700;margin-top:4px;color:var(--aco-500)">${canceladas.length}</div>
      </div>
      <button class="card card-p box-hov" onclick="abrirFolha(folhaEmitirNF)" style="background:var(--petroleo);color:#fff;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px">
        ${ico('mais', 24)}
        <div style="font-size:15px;font-weight:600">Emitir NFe Avulsa</div>
      </button>
    </div>
    
    <div class="card">
      <div class="tit-card">Histórico de Emissões</div>
      ${!notas.length?'<div class="vazia">Nenhuma nota emitida.</div>':
        `<table class="tb">
          <thead><tr><th>Nº / Série</th><th>Data Emissão</th><th>Tomador / Cliente</th><th class="n">Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${notas.slice().reverse().map(n=>`<tr>
            <td class="mono">${n.numero} - ${n.serie}</td>
            <td>${dataBR(n.data)}</td>
            <td>${esc(n.cliente)}</td>
            <td class="n">${brl(n.valor)}</td>
            <td>
              ${n.status === 'Autorizada' ? `<span class="pill-topo" style="background:var(--verde-fraco);color:#166534">Autorizada 🟢</span>` : ''}
              ${n.status === 'Cancelada' ? `<span class="pill-topo" style="background:var(--aco-200);color:var(--aco-700)">Cancelada ⚪</span>` : ''}
              ${n.status === 'Rejeitada' ? `<span class="pill-topo" style="background:var(--tijolo-fraco);color:var(--tijolo)">Rejeitada 🔴</span>` : ''}
            </td>
            <td style="text-align:right">
              <button class="bt sm">XML</button>
              <button class="bt sm">DANFE</button>
              ${n.status === 'Autorizada' ? `<button class="bt sm d" onclick="cancelarNF('${n.id}')">Cancelar</button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
        </table>`
      }
    </div>
  `;
}

window.folhaEmitirNF = function() {
  return `
    <div class="folha-tit">Simulação de Emissão NFe/NFSe</div>
    <div class="folha-scroll">
      <div class="card" style="margin-bottom:14px">
        <label class="lbl">Cliente / Tomador</label>
        <select id="nfe-cli" class="inp">
          ${S.clientes.map(c => `<option value="${c.nome}">${esc(c.nome)}</option>`).join('')}
        </select>
        <br><br>
        <label class="lbl">Valor da Nota (R$)</label>
        <input type="number" id="nfe-valor" class="inp" placeholder="0.00">
        <br><br>
        <label class="lbl">Natureza da Operação</label>
        <input class="inp" value="Prestação de Serviço" disabled>
      </div>
      <button class="bt-azul" style="width:100%;padding:12px;font-size:16px" onclick="simularEnvioSefaz()">
        Transmitir para SEFAZ
      </button>
    </div>
  `;
}

window.simularEnvioSefaz = function() {
  const cli = document.getElementById('nfe-cli').value;
  const val = +document.getElementById('nfe-valor').value;
  if(!val) return torrar('Informe o valor');
  
  fecharFolha();
  torrar('Transmitindo para SEFAZ...', 2000);
  
  setTimeout(() => {
    S.notasFiscais = S.notasFiscais || [];
    const sucesso = Math.random() > 0.1; // 90% chance of success
    S.notasFiscais.push({
      id: uid('nf'), numero: Math.floor(Math.random()*9000+1000), serie: '1', data: hoje(), cliente: cli, valor: val,
      status: sucesso ? 'Autorizada' : 'Rejeitada'
    });
    render();
    if(sucesso) torrar('Nota autorizada com sucesso!');
    else torrar('Sefaz rejeitou a nota (Erro Simulado).', 3000);
  }, 1500);
}

window.cancelarNF = function(id) {
  const n = S.notasFiscais.find(x => x.id === id);
  if(n) { n.status = 'Cancelada'; render(); torrar('Nota fiscal cancelada.'); }
}

function viewCompras() {
  const comprasMes = soma(S.compras||[], c => mesRef(c.data)===mesRef(hoje()) ? c.valor : 0);
  const lista = (S.compras||[]).slice().sort((a,b)=>a.data<b.data?1:-1);
  return `
    <div class="tit-sec" style="margin-top:0">Gestão de Compras & Entradas</div>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr);margin-bottom:20px">
      <div class="card card-p" style="border-left:4px solid var(--petroleo)">
        <div class="mini" style="font-weight:600;color:var(--petroleo)">Total Comprado (Mês)</div>
        <div class="num" style="font-size:24px;font-weight:700;margin-top:4px">${brl(comprasMes)}</div>
      </div>
      <button class="card card-p box-hov" onclick="document.getElementById('ocr-input').click()" style="background:var(--petroleo);color:#fff;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px">
        ${ico('mais', 28)}
        <div style="text-align:left">
          <div style="font-size:16px;font-weight:600">Nova Entrada Automática</div>
          <div style="font-size:12px;opacity:0.8">Tirar Foto ou Enviar Arquivo</div>
        </div>
      </button>
      <input type="file" id="ocr-input" accept="image/*,application/pdf" capture="environment" onchange="iniciarLeituraOCR(this)" style="display:none">
    </div>
    
    <div class="card">
      <div class="tit-card">Histórico de Entradas</div>
      ${!lista.length?'<div class="vazia">Nenhuma compra registrada ainda.</div>':
        `<table class="tb">
          <thead><tr><th>Data</th><th>Fornecedor</th><th>Itens</th><th class="n">Total</th></tr></thead>
          <tbody>${lista.map(c=>`<tr>
            <td>${dataBR(c.data)}</td>
            <td>${esc(c.forn)}<div class="mini">${esc(c.cnpj)}</div></td>
            <td>${c.itens.length} itens</td>
            <td class="n">${brl(c.valor)}</td>
          </tr>`).join('')}</tbody>
        </table>`
      }
    </div>
  `;
}

function iniciarLeituraOCR(input) {
  if(!input.files||!input.files.length) return;
  abrirFolha(folhaSimulacaoOCR);
  setTimeout(() => {
    abrirFolha(folhaEntradaCompra);
  }, 2500);
}

function folhaSimulacaoOCR() {
  return `
    <div class="folha-tit">Processamento de Inteligência Artificial</div>
    <div style="padding:40px 20px;text-align:center">
      <div class="load-spinner" style="width:40px;height:40px;border-radius:50%;border:4px solid var(--aco-200);border-top-color:var(--petroleo);animation:spin 1s linear infinite;margin:0 auto 20px"></div>
      <h3 style="color:var(--petroleo)">Lendo o documento...</h3>
      <p style="color:var(--aco-500);font-size:14px;margin-top:10px">O modelo de IA está extraindo os fornecedores, tributos e categorizando os itens da nota fiscal/pedido.</p>
    </div>
    <style>@keyframes spin { 100% { transform:rotate(360deg); } }</style>
  `;
}

window.salvarCompraOCR = function() {
  const forn = document.getElementById('compra-forn').value;
  const cnpj = document.getElementById('compra-cnpj').value;
  const data = document.getElementById('compra-data').value;
  const valor = +document.getElementById('compra-valor').value;
  
  const itens = [];
  document.querySelectorAll('.item-nome').forEach(el => {
    const idx = el.dataset.idx;
    const nome = el.value;
    const qtd = +document.querySelector(`.item-qtd[data-idx="${idx}"]`).value;
    const un = document.querySelector(`.item-un[data-idx="${idx}"]`).value;
    const valorUnit = +document.querySelector(`.item-valor[data-idx="${idx}"]`).value;
    const ncm = document.querySelector(`.item-ncm[data-idx="${idx}"]`).value;
    const cfop = document.querySelector(`.item-cfop[data-idx="${idx}"]`).value;
    const cat = document.querySelector(`.item-cat[data-idx="${idx}"]`).value;
    itens.push({nome, qtd, un, valor: valorUnit, ncm, cfop, cat});
  });
  
  S.compras.push({ id: uid('cp'), data, forn, cnpj, valor, itens });
  S.contas.push({ id: uid('c'), tipo: 'pagar', desc: 'Compra: ' + forn, parte: forn, valor: valor, venc: addDias(data, 28), pago: false, cat: 'Peças', doc: '' });
  
  let atualizadas = 0, novas = 0;
  itens.forEach(i => {
    if(i.cat === 'estoque') {
      const p = S.pecas.find(x => x.nome.toLowerCase() === i.nome.toLowerCase() || x.cod === i.ncm);
      if(p) {
        p.qtd += i.qtd; p.custo = i.valor; p.venda = Math.max(p.venda, +(i.valor * 1.75).toFixed(2));
        atualizadas++;
      } else {
        S.pecas.push({
          id: uid('p'), cod: i.ncm || ('IMP-'+Math.floor(Math.random()*9e3+1e3)), nome: i.nome, un: i.un,
          qtd: i.qtd, min: 1, custo: i.valor, venda: +(i.valor * 1.75).toFixed(2), loc: 'A receber', forn: forn
        });
        novas++;
      }
    }
  });
  
  fecharFolha(); S.ui.view = 'compras'; render();
  torrar(`Compra salva! ${novas} novas peças cadastradas, ${atualizadas} peças atualizadas.`);
};

function folhaEntradaCompra() {
  const mockOCR = {
    forn: 'Distribuidora AutoPeças S/A', cnpj: '12.345.678/0001-90', data: hoje(), valor: 2450.50, impostos: 318.56,
    chave: '3523 0912 3456 7800 0190 5500 1000 0012 3412 3456',
    itens: [
      {nome: 'Filtro de Óleo Diesel R450', un: 'un', qtd: 10, valor: 45.00, ncm: '84212300', cfop: '5102', cat: 'estoque'},
      {nome: 'Óleo Motor 15W40 (Tambor 200L)', un: 'L', qtd: 200, valor: 10.00, ncm: '27101932', cfop: '5102', cat: 'estoque'},
      {nome: 'Desengraxante Industrial 5L', un: 'gl', qtd: 2, valor: 85.00, ncm: '34022000', cfop: '5102', cat: 'uso'}
    ]
  };

  return `
    <div class="folha-tit">Revisão de Dados (OCR IA)</div>
    <div class="folha-scroll" style="padding-bottom:100px">
      <div class="card" style="margin-bottom:14px;background:var(--sinal-fraco);border:1px solid rgba(245,158,11,0.3)">
        <div class="mini" style="color:var(--sinal)">IA detectou 100% de confiança nesta extração.</div>
      </div>
      
      <div class="card card-p" style="margin-bottom:14px">
        <label class="lbl">Fornecedor</label>
        <input id="compra-forn" class="inp" value="${mockOCR.forn}" style="margin-bottom:8px;font-weight:600">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div style="flex:1"><label class="lbl">CNPJ</label><input id="compra-cnpj" class="inp" value="${mockOCR.cnpj}"></div>
          <div style="flex:1"><label class="lbl">Data Emissão</label><input type="date" id="compra-data" class="inp" value="${mockOCR.data}"></div>
        </div>
        <div style="display:flex;gap:8px">
          <div style="flex:1"><label class="lbl">Valor Total (R$)</label><input type="number" id="compra-valor" class="inp" value="${mockOCR.valor}" step="0.01" style="font-weight:bold;color:var(--petroleo)"></div>
          <div style="flex:1"><label class="lbl">Impostos Retidos (R$)</label><input type="number" class="inp" value="${mockOCR.impostos}" step="0.01" disabled></div>
        </div>
      </div>
      
      <div class="tit-sec">Itens Reconhecidos (${mockOCR.itens.length})</div>
      ${mockOCR.itens.map((it, idx) => `
        <div class="card card-p" style="margin-bottom:8px;border-left:3px solid var(--petroleo)">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <input class="inp item-nome" data-idx="${idx}" value="${it.nome}" style="flex:2" placeholder="Descrição do Produto">
            <input type="number" class="inp item-qtd" data-idx="${idx}" value="${it.qtd}" style="flex:1" placeholder="Qtd">
            <input class="inp item-un" data-idx="${idx}" value="${it.un}" style="flex:1" placeholder="UN">
            <input type="number" class="inp item-valor" data-idx="${idx}" value="${it.valor}" style="flex:1" placeholder="R$ Unit" step="0.01">
          </div>
          <div style="display:flex;gap:8px">
            <div style="flex:1"><label class="lbl">NCM</label><input class="inp item-ncm" data-idx="${idx}" value="${it.ncm}" placeholder="NCM"></div>
            <div style="flex:1"><label class="lbl">CFOP</label><input class="inp item-cfop" data-idx="${idx}" value="${it.cfop}" placeholder="CFOP"></div>
            <div style="flex:2"><label class="lbl">Destinação</label>
              <select class="inp item-cat" data-idx="${idx}">
                <option value="estoque" ${it.cat==='estoque'?'selected':''}>Estoque / Revenda</option>
                <option value="uso" ${it.cat==='uso'?'selected':''}>Uso e Consumo</option>
              </select>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    
    <div style="position:absolute;bottom:0;left:0;width:100%;padding:14px;background:#fff;border-top:1px solid var(--aco-200);box-shadow:0 -4px 10px rgba(0,0,0,0.05)">
      <button class="bt-azul" style="width:100%;padding:14px;font-size:15px" onclick="salvarCompraOCR()">
        ${ico('check',20)} Confirmar e Lançar Entrada
      </button>
    </div>
  `;
}

function render(){
  const v=S.ui.view;
  const corpo={
    patio:viewPatio, 
    estoque:viewEstoque, 
    financeiro:viewFinanceiro, 
    mensagens:viewMensagens, 
    cadastros:viewCadastros, 
    painel:viewPainelInicial, 
    faturamento:viewFaturamento, 
    compras:viewCompras, 
    notas:viewNotasFiscais,
    vitrine:viewEmBreve,
    boletos:viewEmBreve,
    pix:viewEmBreve,
    relatorios:viewEmBreve,
    configuracoes:viewConfiguracoes,
    suporte:viewEmBreve
  }[v]();
  const topo = v === 'painel' ? '' : renderTopo();
  document.getElementById('app').innerHTML=topo+`<main class="wrap">${corpo}</main>`;
  if(v==='patio' && typeof renderGraficosDashboard === 'function') setTimeout(renderGraficosDashboard, 0);
  if(v==='financeiro' && typeof renderGraficosFinanceiro === 'function') setTimeout(renderGraficosFinanceiro, 0);
  if(v==='painel' && typeof renderGraficosPainelInicial === 'function') setTimeout(renderGraficosPainelInicial, 0);
  renderNav();
  salvar();
}

function viewEmBreve() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:70vh;color:var(--aco-500)">
      ${ico('eng', 48)}
      <h2 style="margin-top:16px;color:var(--aco-700)">Módulo em construção</h2>
      <p>Esta funcionalidade estará disponível em breve.</p>
    </div>
  `;
}

function viewConfiguracoes() {
  const c = S.cfg.apibrasil || {};
  return `
    <div class="tit-sec" style="margin-top:0">Configurações do Sistema</div>
    
    <div class="card card-p">
      <div style="font-weight:650;margin-bottom:12px;color:var(--aco-900);display:flex;align-items:center;gap:8px">
        ${ico('eng', 18)} Integração APIBrasil (Consulta de Placas)
      </div>
      <p class="mini" style="margin-bottom:16px">Insira suas credenciais da APIBrasil para permitir a busca automática de dados de veículos (Marca, Modelo, Cor) a partir da Placa. Crie sua conta em apibrasil.com.br.</p>
      
      <div class="dupla">
        <label class="campo"><span>Device Token</span>
          <input type="text" value="${esc(c.deviceToken||'')}" data-act="cfg-apibrasil" data-c="deviceToken" placeholder="ex: 12345678-abcd-1234...">
        </label>
        <label class="campo"><span>Bearer Token</span>
          <input type="password" value="${esc(c.bearerToken||'')}" data-act="cfg-apibrasil" data-c="bearerToken" placeholder="ex: eyJhbGciOiJIUzI1NiIsInR5c...">
        </label>
      </div>
      <p class="mini" style="color:var(--verde)">As alterações são salvas automaticamente.</p>
    </div>
  `;
}

function viewPainelInicial() {
  const d = hoje();
  const recAberto = emAberto('receber'), pagAberto = emAberto('pagar');
  
  const recHoje = recAberto.filter(c => c.venc === d);
  const pagHoje = pagAberto.filter(c => c.venc === d);
  
  // Semana = 7 dias a partir de hoje
  const dataFimSemana = addDias(d, 7);
  const recSemana = recAberto.filter(c => c.venc >= d && c.venc <= dataFimSemana);
  const pagSemana = pagAberto.filter(c => c.venc >= d && c.venc <= dataFimSemana);

  // Atrasados
  const recAtrasado = recAberto.filter(c => c.venc < d);
  const pagAtrasado = pagAberto.filter(c => c.venc < d);

  const kpiCard = (titulo, totalValor, qtd, iconCor, bgBase, stripCor, titleColor) => `
    <div style="background:#fff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1);display:flex;flex-direction:column;flex:1;min-width:220px;border-top:4px solid ${bgBase};overflow:hidden">
      <div style="padding:16px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:24px;font-weight:700;color:${titleColor}">${qtd}</span>
            <span style="font-size:13px;color:var(--aco-500);line-height:1.2">${titulo}</span>
          </div>
          <div style="font-size:13px;color:var(--aco-400);margin-top:4px">Total <span style="font-weight:600;color:${titleColor}">${brl(totalValor)}</span></div>
        </div>
        <div style="color:${titleColor};opacity:0.3;transform:scale(1.5)">${ico('dir',24)}</div>
      </div>
      <div style="background:${stripCor};color:#fff;font-size:11px;font-weight:600;text-align:center;padding:4px;cursor:pointer">Mais detalhes &rsaquo;</div>
    </div>
  `;

  return `
    <div style="margin:-16px -16px 16px -16px;padding:12px 24px;background:var(--aco-500);color:#fff;display:flex;align-items:center;justify-content:space-between">
      <h2 style="margin:0;font-size:18px;font-weight:400">Painel inicial</h2>
      <div style="display:flex;gap:12px">
        <button style="background:var(--sinal);color:#fff;border:none;padding:6px 12px;border-radius:4px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px">${ico('livro', 14)} Tutoriais</button>
        <button style="background:var(--verde);color:#fff;border:none;padding:6px 12px;border-radius:4px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px" data-act="nova-os">+ Novo ${ico('baixo', 14)}</button>
      </div>
    </div>
    
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px">
      ${kpiCard('Contas a receber hoje', soma(recHoje,c=>c.valor), recHoje.length, '#10b981', '#10b981', '#34d399', '#059669')}
      ${kpiCard('Contas a pagar hoje', soma(pagHoje,c=>c.valor), pagHoje.length, '#ef4444', '#ef4444', '#f87171', '#dc2626')}
      ${kpiCard('A receber na semana', soma(recSemana,c=>c.valor), recSemana.length, '#10b981', '#10b981', '#34d399', '#059669')}
      ${kpiCard('A pagar na semana', soma(pagSemana,c=>c.valor), pagSemana.length, '#ef4444', '#ef4444', '#f87171', '#dc2626')}
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px">
      <!-- Coluna da Esquerda -->
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="card card-p" style="padding:0;overflow:hidden">
          <div style="background:var(--aco-500);color:#fff;padding:8px 12px;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px">${ico('nota', 14)} Quadro de avisos</div>
          <div style="padding:16px">
            <div style="background:#f3e8ff;border-radius:8px;padding:24px;text-align:center;margin-bottom:20px">
               <h3 style="color:#6b21a8;margin:0 0 8px 0">Banner Ilustrativo do App</h3>
               <p style="color:#9333ea;font-size:13px;margin:0">Mantenha seu negócio sempre atualizado.</p>
            </div>
            <ul style="list-style:none;padding:0;margin:0;font-size:13px;color:var(--aco-700)">
               <li style="margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="color:var(--verde)">${ico('dir',12)}</span> <span>Há <b>${recAtrasado.length}</b> financeiros a receber atrasados. Total <b>${brl(soma(recAtrasado,c=>c.valor))}</b> <a href="#" style="color:var(--petroleo);text-decoration:none">(detalhar)</a>.</span></li>
               <li style="margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="color:var(--tijolo)">${ico('dir',12)}</span> <span>Há <b>${pagAtrasado.length}</b> financeiros a pagar atrasados. Total <b>${brl(soma(pagAtrasado,c=>c.valor))}</b> <a href="#" style="color:var(--petroleo);text-decoration:none">(detalhar)</a>.</span></li>
            </ul>
          </div>
        </div>

        <div class="card card-p" style="padding:0;overflow:hidden">
          <div style="background:var(--aco-500);color:#fff;padding:8px 12px;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">${ico('grafico', 14)} Vendas por mês</div>
          </div>
          <div style="padding:16px;height:300px">
            <canvas id="chart-bar-vendas"></canvas>
          </div>
        </div>
      </div>

      <!-- Coluna da Direita -->
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="card card-p" style="padding:0;overflow:hidden">
          <div style="background:var(--aco-500);color:#fff;padding:8px 12px;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">${ico('eng', 14)} Vendas por categoria</div>
            <div style="font-size:11px;font-weight:normal">Agosto 2026 ${ico('baixo',10)}</div>
          </div>
          <div style="padding:16px;height:300px">
            <canvas id="chart-pie-cat"></canvas>
          </div>
        </div>

        <div class="card card-p" style="padding:0;overflow:hidden">
          <div style="background:var(--aco-500);color:#fff;padding:8px 12px;font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">${ico('nota', 14)} Resultado consolidado</div>
            <div style="font-size:11px;font-weight:normal">Agosto 2026 ${ico('baixo',10)}</div>
          </div>
          <div style="padding:16px;font-size:13px">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--aco-150)">
              <span style="color:var(--aco-500)">+ Receita bruta</span>
              <span style="font-weight:600">R$ 18.621,15</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--aco-150)">
              <span style="color:var(--aco-500)">- Impostos</span>
              <span style="font-weight:600">R$ 458,62</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;color:var(--verde);font-weight:700">
              <span>= Receita líquida</span>
              <span>R$ 18.162,53</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =====================================================================
   PÁTIO — cada card é um box com o veículo que está nele
===================================================================== */
function viewPatio(){
  const f=S.ui.filtro;
  const contagem=k=>k==='todos'?osAbertas().length:S.os.filter(o=>o.st===k&&o.st!=='finalizada').length;
  const chips=[['todos','Tudo'],['executando','Em execução'],['peca','Parado por peça'],['aprovacao','Aguardando OK'],['fila','Na fila'],['finalizada','Finalizadas']];
  
  let listaOS=S.os;
  const isBusca = !!S.ui.buscaPlaca;
  if(isBusca) {
    const q = S.ui.buscaPlaca.toUpperCase().trim();
    listaOS = listaOS.filter(o => {
      const v = V(o.vei);
      return v && v.placa.toUpperCase().includes(q);
    });
  } else {
    listaOS = listaOS.filter(o=> f==='todos'? o.st!=='finalizada' : o.st===f);
  }

  // cada box vira um card; boxes livres aparecem como vaga aberta
  const cards=[];
  if(isBusca) {
    listaOS.forEach(o => {
      const b = S.boxes.find(x => x.id === o.box) || {nome: '?', id: o.box};
      cards.push(cardOS(o, b));
    });
  } else {
    const ocupado={}; listaOS.forEach(o=>{ (ocupado[o.box]=ocupado[o.box]||[]).push(o); });
    S.boxes.forEach(b=>{
      const lista=ocupado[b.id]||[];
      if(lista.length) lista.forEach(o=>cards.push(cardOS(o,b)));
      else if(f==='todos') cards.push(cardLivre(b));
    });
  }
  const semPeca=S.os.filter(o=>o.st==='peca').length;

  // --- dados financeiros para o dashboard ---
  const recAberto=emAberto('receber'), pagAberto=emAberto('pagar');
  const d=hoje();
  const recHoje=recAberto.filter(c=>c.venc===d), pagHoje=pagAberto.filter(c=>c.venc===d);
  const recAmanha=recAberto.filter(c=>c.venc===addDias(d,1)), pagAmanha=pagAberto.filter(c=>c.venc===addDias(d,1));
  const boletosAtrasados=pagAberto.filter(c=>c.venc<d);
  const recVencidos=recAberto.filter(c=>c.venc<d);
  // clientes com boletos em aberto
  const cliAberto={};
  recAberto.forEach(c=>{cliAberto[c.parte]=(cliAberto[c.parte]||{valor:0,qtd:0,vencido:false});cliAberto[c.parte].valor+=c.valor;cliAberto[c.parte].qtd++;if(c.venc<d) cliAberto[c.parte].vencido=true;});
  const cliList=Object.entries(cliAberto).sort((a,b)=>b[1].valor-a[1].valor);
  // fornecedores a pagar
  const fornAberto={};
  pagAberto.forEach(c=>{fornAberto[c.parte]=(fornAberto[c.parte]||{valor:0,qtd:0,vencido:false});fornAberto[c.parte].valor+=c.valor;fornAberto[c.parte].qtd++;if(c.venc<d) fornAberto[c.parte].vencido=true;});
  const fornList=Object.entries(fornAberto).sort((a,b)=>b[1].valor-a[1].valor);

  const dashboardHTML = `
    <div class="tit-sec" style="margin-top:0">Dashboard em Tempo Real</div>
    <div style="display:flex; flex-wrap:wrap; gap:14px; margin-bottom: 14px;">
      <div class="card card-p" style="padding: 14px; flex: 1 1 250px;">
        <div class="mini" style="font-weight:600">Status das OS</div>
        <div style="height:140px; margin-top:8px"><canvas id="grafico-status"></canvas></div>
      </div>
      <button class="card card-p box-hov" data-act="nav-fin" data-aba="receber" data-filtro="tudo" style="padding: 14px; flex: 1 1 250px; text-align:left; border:0; cursor:pointer">
        <div class="mini" style="font-weight:600">A Receber</div>
        <div style="height:140px; margin-top:8px; pointer-events:none"><canvas id="grafico-rec"></canvas></div>
      </button>
      <button class="card card-p box-hov" data-act="nav-fin" data-aba="pagar" data-filtro="tudo" style="padding: 14px; flex: 1 1 250px; text-align:left; border:0; cursor:pointer">
        <div class="mini" style="font-weight:600">A Pagar</div>
        <div style="height:140px; margin-top:8px; pointer-events:none"><canvas id="grafico-pag"></canvas></div>
      </button>
    </div>

    ${boletosAtrasados.length?`<button class="aviso-fila box-hov" data-act="nav-fin" data-aba="pagar" data-filtro="atrasados" style="background:var(--tijolo-fraco);color:#991b1b;border:0;width:100%;text-align:left;cursor:pointer">${ico('alerta',18)}<div><b>${boletosAtrasados.length} ${boletosAtrasados.length===1?'boleto atrasado':'boletos atrasados'} — total ${brl(soma(boletosAtrasados,c=>c.valor))}</b> ${boletosAtrasados.slice(0,2).map(c=>esc(c.parte)+' ('+brl(c.valor)+')').join(', ')}</div></button>`:''}

    <div class="tit-sec">${ico('relogio',14)} Previsão Financeira (Clique para ver os lançamentos)</div>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px">
      <button class="card card-p box-hov" data-act="nav-fin" data-aba="receber" data-filtro="hoje" style="border-left:4px solid var(--verde);text-align:left;border-top:0;border-right:0;border-bottom:0">
        <div class="mini" style="font-weight:600;color:var(--verde)">A receber hoje</div>
        <div class="num" style="font-size:22px;font-weight:700;margin-top:4px">${recHoje.length?brl(soma(recHoje,c=>c.valor)):'—'}</div>
        <div class="mini">${recHoje.length} ${recHoje.length===1?'título':'títulos'}${recHoje.length?' · '+recHoje.map(c=>esc(c.parte)).join(', '):''}</div>
      </button>
      <button class="card card-p box-hov" data-act="nav-fin" data-aba="pagar" data-filtro="hoje" style="border-left:4px solid var(--tijolo);text-align:left;border-top:0;border-right:0;border-bottom:0">
        <div class="mini" style="font-weight:600;color:var(--tijolo)">A pagar hoje</div>
        <div class="num" style="font-size:22px;font-weight:700;margin-top:4px">${pagHoje.length?brl(soma(pagHoje,c=>c.valor)):'—'}</div>
        <div class="mini">${pagHoje.length} ${pagHoje.length===1?'título':'títulos'}${pagHoje.length?' · '+pagHoje.map(c=>esc(c.parte)).join(', '):''}</div>
      </button>
      <button class="card card-p box-hov" data-act="nav-fin" data-aba="receber" data-filtro="amanha" style="border-left:4px solid var(--petroleo);text-align:left;border-top:0;border-right:0;border-bottom:0">
        <div class="mini" style="font-weight:600;color:var(--petroleo)">A receber amanhã</div>
        <div class="num" style="font-size:22px;font-weight:700;margin-top:4px">${recAmanha.length?brl(soma(recAmanha,c=>c.valor)):'—'}</div>
        <div class="mini">${recAmanha.length} ${recAmanha.length===1?'título':'títulos'}${recAmanha.length?' · '+recAmanha.map(c=>esc(c.parte)).join(', '):''}</div>
      </button>
      <button class="card card-p box-hov" data-act="nav-fin" data-aba="pagar" data-filtro="amanha" style="border-left:4px solid var(--ardosia);text-align:left;border-top:0;border-right:0;border-bottom:0">
        <div class="mini" style="font-weight:600;color:var(--ardosia)">A pagar amanhã</div>
        <div class="num" style="font-size:22px;font-weight:700;margin-top:4px">${pagAmanha.length?brl(soma(pagAmanha,c=>c.valor)):'—'}</div>
        <div class="mini">${pagAmanha.length} ${pagAmanha.length===1?'título':'títulos'}${pagAmanha.length?' · '+pagAmanha.map(c=>esc(c.parte)).join(', '):''}</div>
      </button>
    </div>

    <div class="kpis" style="grid-template-columns:1fr 1fr;margin-bottom:14px">
      <div>
        <div class="tit-sec" style="margin-top:0">${ico('gente',14)} Clientes com boletos em aberto</div>
        <div class="lista">${cliList.length?cliList.map(([nome,v])=>`<div class="item">
          <div class="cor" style="background:${v.vencido?'var(--tijolo)':'var(--petroleo)'}"></div>
          <div class="txt"><div class="t1">${esc(nome)}</div><div class="t2">${v.qtd} ${v.qtd===1?'título':'títulos'}${v.vencido?' · <span style="color:var(--tijolo)">tem vencido</span>':''}</div></div>
          <div class="v">${brl(v.valor)}</div>
        </div>`).join(''):'<div class="card vazia"><b>Nenhum cliente devendo</b></div>'}</div>
        <div class="lista">${fornList.length?fornList.map(([nome,v])=>`<div class="item">
          <div class="cor" style="background:${v.vencido?'var(--tijolo)':'var(--sinal)'}"></div>
          <div class="txt"><div class="t1">${esc(nome)}</div><div class="t2">${v.qtd} ${v.qtd===1?'título':'títulos'}${v.vencido?' · <span style="color:var(--tijolo)">tem atrasado</span>':''}</div></div>
          <div class="v">${brl(v.valor)}</div>
        </div>`).join(''):'<div class="card vazia"><b>Nenhum fornecedor pendente</b></div>'}</div>
      </div>
    </div>
  `;

  return dashboardHTML + `
  ${semPeca?`<div class="aviso-fila">${ico('alerta',18)}<div><b>${semPeca} ${semPeca===1?'caminhão parado':'caminhões parados'} esperando peça.</b> Cada dia parado é box sem faturar — cobra o fornecedor.</div></div>`:''}
  <div style="margin: 14px 0;">
    <input type="text" placeholder="🔍 Pesquisar OS por placa..." data-act="busca-placa-patio" value="${esc(S.ui.buscaPlaca||'')}" style="width:100%;padding:12px 16px;border-radius:8px;border:1px solid var(--aco-200);background:#fff;font-size:15px;font-family:var(--ui);box-shadow:0 1px 3px rgba(0,0,0,0.05)">
  </div>
  <div class="trilho">${chips.map(([k,r])=>`<button class="chip" data-act="filtro" data-f="${k}" aria-pressed="${f===k}">${r}${k!=='finalizada'?`<span class="n">${contagem(k)}</span>`:''}</button>`).join('')}</div>
  <div class="patio">${cards.join('')||`<div class="card vazia"><b>Nenhuma OS encontrada</b></div>`}</div>
  <button class="bt-flut" data-act="nova-os">${ico('mais',19)} Nova OS</button>`;
}

let chartStatus = null, chartRec = null, chartPag = null;
let dashboardCharts={};

function renderGraficosPainelInicial() {
  if(!window.Chart) return;
  if(dashboardCharts.cat) { try { dashboardCharts.cat.destroy(); } catch(e){} }
  if(dashboardCharts.bar) { try { dashboardCharts.bar.destroy(); } catch(e){} }
  
  const ctxCat = document.getElementById('chart-pie-cat');
  const ctxBar = document.getElementById('chart-bar-vendas');
  if(!ctxCat || !ctxBar) return;

  const chartOptsPie = {responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:10}}}}};
  
  // Dummy data para categoria
  dashboardCharts.cat = new Chart(ctxCat, {
    type: 'pie',
    data: {
      labels: ['Suspensão', 'Freio', 'Motor', 'Elétrica', 'Diversos'],
      datasets: [{
        data: [35, 25, 20, 10, 10],
        backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'],
        borderWidth: 0
      }]
    },
    options: chartOptsPie
  });

  const chartOptsBar = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:10}}}},
    scales: { y: { beginAtZero: true } }
  };
  
  // Dummy data para barra de faturamento
  dashboardCharts.bar = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: ['Abr', 'Mai', 'Jun', 'Jul', 'Ago'],
      datasets: [
        {
          label: 'Faturamento',
          data: [12000, 15000, 14000, 18000, 18621],
          backgroundColor: '#38bdf8',
          order: 1
        },
        {
          label: 'Quantidade',
          data: [15, 20, 18, 25, 28],
          type: 'line',
          borderColor: '#10b981',
          borderWidth: 2,
          pointBackgroundColor: '#10b981',
          yAxisID: 'y1',
          order: 0
        }
      ]
    },
    options: {
      ...chartOptsBar,
      scales: {
        y: { type: 'linear', display: true, position: 'left', beginAtZero: true },
        y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderGraficosDashboard() {
  if(!window.Chart) return;
  const ctxStatus = document.getElementById('grafico-status');
  const ctxRec = document.getElementById('grafico-rec');
  const ctxPag = document.getElementById('grafico-pag');
  
  if(chartStatus) chartStatus.destroy();
  if(chartRec) chartRec.destroy();
  if(chartPag) chartPag.destroy();
  
  if(ctxStatus) {
    const abertas = osAbertas();
    const cFila = abertas.filter(o=>o.st==='fila').length;
    const cAprov = abertas.filter(o=>o.st==='aprovacao').length;
    const cExec = abertas.filter(o=>o.st==='executando').length;
    const cPeca = abertas.filter(o=>o.st==='peca').length;

    chartStatus = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Na Fila', 'Aprovação', 'Executando', 'Peça'],
        datasets: [{
          data: [cFila, cAprov, cExec, cPeca],
          backgroundColor: ['#94a3b8', '#8b5cf6', '#2563eb', '#f59e0b'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }

  const h = hoje();

  if(ctxRec) {
    const rec = emAberto('receber');
    const vVencido = soma(rec.filter(c=>c.venc<h), c=>c.valor);
    const vHoje = soma(rec.filter(c=>c.venc===h), c=>c.valor);
    const vAVencer = soma(rec.filter(c=>c.venc>h), c=>c.valor);
    
    chartRec = new Chart(ctxRec, {
      type: 'doughnut',
      data: {
        labels: ['Vencido', 'Hoje', 'A Vencer'],
        datasets: [{
          data: [vVencido, vHoje, vAVencer],
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }

  if(ctxPag) {
    const cats = categorizarContas('pagar');
    const cores = ['#2563eb','#8b5cf6','#f59e0b','#ef4444','#10b981','#94a3b8'];
    
    chartPag = new Chart(ctxPag, {
      type: 'doughnut',
      data: {
        labels: cats.map(c=>c.cat),
        datasets: [{
          data: cats.map(c=>c.valor),
          backgroundColor: cores.slice(0, cats.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }
}
function cardOS(o,b){
  const v=V(o.vei), c=C(o.cli), dias=diasEntre(o.abertura,hoje());
  const atrasada=o.prev<hoje()&&o.st!=='finalizada';
  return `<button class="box" data-st="${o.st}" data-act="abrir-os" data-id="${o.id}">
    <div class="box-topo">
      <div class="tag-box"><small>BOX</small>${esc(b.nome.replace(/\D/g,'')||'PÁT')}</div>
      <div style="min-width:0;flex:1">
        <span class="placa">${esc(v.placa)}</span>
        <div class="modelo">${esc(v.modelo)}</div>
        <div class="cliente">${esc(c.nome)}</div>
      </div>
      <div class="mini mono" style="text-align:right;white-space:nowrap">OS ${o.num}<br><span style="color:${atrasada?'var(--tijolo)':'var(--aco-400)'}">${dias===0?'hoje':dias+'d'}</span></div>
    </div>
    <div class="box-rodape">
      <span class="selo" data-st="${o.st}">${ST[o.st].r}</span>
      <span class="mini">${o.servicos.length}serv · ${o.pecas.length}peç</span>
      <span class="val">${brl(totOS(o))}</span>
    </div>
  </button>`;
}
function cardLivre(b){
  return `<button class="box vazio" data-st="livre" data-act="nova-os" data-box="${b.id}">
    <div class="box-topo">
      <div class="tag-box"><small>BOX</small>${esc(b.nome.replace(/\D/g,'')||'PÁT')}</div>
      <div style="flex:1">
        <div class="modelo" style="color:var(--aco-500)">Box livre · ${esc(b.tipo)}</div>
        <div class="cliente">Toque para colocar um caminhão aqui</div>
      </div>
      ${ico('mais',20)}
    </div>
  </button>`;
}

/* =====================================================================
   FOLHA (pop-up) genérica
===================================================================== */
let folhaAtual=null;
function abrirFolha(fn){ folhaAtual=fn; renderFolha(); document.getElementById('vidro').classList.add('on'); document.getElementById('folha').classList.add('on'); document.body.style.overflow='hidden'; }
function renderFolha(){ if(folhaAtual) document.getElementById('folha').innerHTML=folhaAtual(); }
function fecharFolha(){ document.getElementById('vidro').classList.remove('on'); document.getElementById('folha').classList.remove('on'); document.body.style.overflow=''; folhaAtual=null; S.ui.osAberta=null; setTimeout(()=>{ if(!folhaAtual) document.getElementById('folha').innerHTML=''; },260); }
function cabecaFolha(titulo,sub,extra=''){
  return `<div class="folha-topo"><div class="alca"></div>
    <div class="entre"><div style="min-width:0">
      <h2 style="font-size:17px">${titulo}</h2>
      <div class="mini" style="margin-top:1px">${sub}</div>
    </div>
    <button class="bt sm" data-act="fechar">${ico('x',17)}</button></div>${extra}</div>`;
}

/* =====================================================================
   FOLHA DA ORDEM DE SERVIÇO
===================================================================== */
function OSatual(){ return S.os.find(o=>o.id===S.ui.osAberta); }
function folhaOS(){
  const o=OSatual(); if(!o) return '';
  const v=V(o.vei), c=C(o.cli), b=B(o.box);
  const abas=[['servicos','Serviços'],['pecas','Peças'],['ficha','Ficha']];
  const extra=`<div class="abas">${abas.map(([k,r])=>`<button data-act="aba-os" data-k="${k}" aria-selected="${S.ui.abaOS===k}">${r}${k==='servicos'?` (${o.servicos.length})`:k==='pecas'?` (${o.pecas.length})`:''}</button>`).join('')}</div>`;
  const cabeca=cabecaFolha(
    `<span class="placa" style="font-size:16px">${esc(v.placa)}</span> <span style="font-size:14px;color:var(--aco-500);font-weight:500">${esc(v.modelo)}</span>`,
    `OS ${o.num} · ${esc(b.nome)} · ${esc(c.nome)} · <span class="selo" data-st="${o.st}">${ST[o.st].r}</span>`, extra);

  let corpo='';
  if(S.ui.picker) corpo=painelPicker(o);
  else if(S.ui.abaOS==='servicos') corpo=abaItens(o,'servicos');
  else if(S.ui.abaOS==='pecas') corpo=abaItens(o,'pecas');
  else corpo=abaFicha(o);

  const acoes={fila:['Iniciar serviço','p','executando'],aprovacao:['Cliente aprovou','v','executando'],
    executando:['Finalizar e faturar','v','FATURAR'],peca:['A peça chegou','s','executando'],finalizada:['Reabrir OS','', 'executando']}[o.st];
  return cabeca+`<div class="folha-corpo">${corpo}</div>
  <div class="folha-pe">
    <div style="flex:1;min-width:0">
      <div class="mini">Total da OS</div>
      <div class="num" style="font-size:19px;font-weight:680">${brl(totOS(o))}</div>
    </div>
    <button class="bt ${acoes[1]}" data-act="acao-os" data-alvo="${acoes[2]}">${acoes[0]}</button>
  </div>`;
}
function abaItens(o,tipo){
  const itens=o[tipo];
  const linhas=itens.map(i=>{
    const p=tipo==='pecas'?P(i.ref):null;
    const falta=p&&p.qtd<i.qtd;
    return `<div class="linha-item">
      <div class="txt">
        <div style="font-size:13.5px;font-weight:600">${esc(i.nome)}</div>
        <div class="mini">${p?`<span class="mono">${esc(p.cod)}</span> · estoque ${p.qtd}${p.un}`:'mão de obra'} ${falta?'<span style="color:var(--tijolo)">· falta no estoque</span>':''}</div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:7px">
          <span class="mini">unit.</span>
          <input class="num" type="number" step="0.01" value="${i.valor}" data-act="val-item" data-t="${tipo}" data-i="${i.id}"
            style="width:96px;padding:5px 7px;border:1.5px solid var(--aco-150);border-radius:8px;font-size:13px">
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px">
        <div class="qtd">
          <button data-act="qtd" data-t="${tipo}" data-i="${i.id}" data-d="-1">−</button>
          <span>${i.qtd}</span>
          <button data-act="qtd" data-t="${tipo}" data-i="${i.id}" data-d="1">+</button>
        </div>
        <div class="num" style="font-weight:650;font-size:14px">${brl(i.qtd*i.valor)}</div>
        <button class="mini" data-act="rm-item" data-t="${tipo}" data-i="${i.id}" style="color:var(--tijolo)">remover</button>
      </div>
    </div>`;
  }).join('');
  const rotulo=tipo==='servicos'?'serviço':'peça';
  return `<div class="lista">${linhas||`<div class="vazia"><b>Nenhum ${rotulo} lançado</b>Adiciona o que já foi feito — o total atualiza sozinho.</div>`}
    <div class="total-linha">Subtotal ${tipo==='servicos'?'de mão de obra':'de peças'}<b>${brl(tipo==='servicos'?totServ(o):totPec(o))}</b></div>
  </div>
  <button class="bt p g" style="margin-top:11px" data-act="picker" data-p="${tipo}">${ico('mais',18)} Adicionar ${rotulo}</button>`;
}
function painelPicker(o){
  const tipo=S.ui.picker, q=(S.ui.busca||'').toLowerCase();
  const base=tipo==='servicos'
    ? S.servicos.filter(s=>s.nome.toLowerCase().includes(q))
    : S.pecas.filter(p=>(p.nome+' '+p.cod).toLowerCase().includes(q));
  const linhas=base.map(x=>tipo==='servicos'
    ? `<button class="item" data-act="add-item" data-t="servicos" data-r="${x.id}">
        <div class="txt"><div class="t1">${esc(x.nome)}</div><div class="t2">≈ ${x.horas}h de box</div></div>
        <div class="v">${brl(x.valor)}<small>adicionar</small></div></button>`
    : `<button class="item" data-act="add-item" data-t="pecas" data-r="${x.id}">
        <div class="cor" style="background:${x.qtd<=x.min?'var(--tijolo)':'var(--verde)'}"></div>
        <div class="txt"><div class="t1">${esc(x.nome)}</div><div class="t2"><span class="mono">${esc(x.cod)}</span> · ${x.qtd}${x.un} em estoque · ${esc(x.loc)}</div></div>
        <div class="v">${brl(x.venda)}<small>adicionar</small></div></button>`).join('');
  return `<div class="entre" style="margin-bottom:9px">
      <h3 style="font-size:15px">Adicionar ${tipo==='servicos'?'serviço':'peça'}</h3>
      <button class="bt sm" data-act="fechar-picker">voltar</button></div>
    <div class="busca">${ico('busca',18)}<input placeholder="Buscar por nome ou código" value="${esc(S.ui.busca||'')}" data-act="busca-picker" autocomplete="off"></div>
    <div class="lista">${linhas||`<div class="vazia"><b>Nada encontrado</b>Cadastre em Cadastros ou ajuste a busca.</div>`}</div>`;
}
function abaFicha(o){
  const v=V(o.vei), c=C(o.cli);
  const opt=(arr,sel,lbl)=>arr.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(lbl(x))}</option>`).join('');
  const lucro=totOS(o)-custoPecasOS(o);
  return `<div class="card card-p">
    <label class="campo"><span>Queixa do motorista / entrada</span><textarea rows="2" data-act="campo-os" data-c="queixa">${esc(o.queixa)}</textarea></label>
    <div class="dupla">
      <label class="campo"><span>Box</span><select data-act="campo-os" data-c="box">${opt(S.boxes,o.box,x=>x.nome)}</select></label>
      <label class="campo"><span>Responsável</span><select data-act="campo-os" data-c="mec">${opt(S.mecanicos,o.mec,x=>x.nome+' · '+x.esp)}</select></label>
    </div>
    <div class="dupla">
      <label class="campo"><span>KM na entrada</span><input type="number" value="${o.km}" data-act="campo-os" data-c="km"></label>
      <label class="campo"><span>Previsão de entrega</span><input type="date" value="${o.prev}" data-act="campo-os" data-c="prev"></label>
    </div>
    <div class="dupla">
      <label class="campo"><span>Status</span><select data-act="campo-os" data-c="st">${Object.entries(ST).map(([k,x])=>`<option value="${k}" ${o.st===k?'selected':''}>${x.r}</option>`).join('')}</select></label>
      <label class="campo"><span>Desconto (R$)</span><input type="number" step="0.01" value="${o.desc||0}" data-act="campo-os" data-c="desc"></label>
    </div>
    <label class="campo" style="margin-bottom:0"><span>Observações internas</span><textarea rows="2" data-act="campo-os" data-c="obs">${esc(o.obs||'')}</textarea></label>
  </div>

  <div class="tit-sec">Resultado da ordem</div>
  <div class="card">
    <div class="total-linha">Mão de obra<b>${brl(totServ(o))}</b></div>
    <div class="total-linha">Peças (venda)<b>${brl(totPec(o))}</b></div>
    <div class="total-linha">Custo das peças<b style="color:var(--tijolo)">− ${brl(custoPecasOS(o))}</b></div>
    <div class="total-linha">Desconto<b style="color:var(--tijolo)">− ${brl(o.desc||0)}</b></div>
    <div class="total-geral"><span>Margem estimada</span><b>${brl(lucro)}</b></div>
  </div>

  <div class="tit-sec">Cliente e veículo</div>
  <div class="card card-p">
    <div style="font-weight:600">${esc(c.nome)}</div>
    <div class="mini">${esc(c.doc)} · ${esc(c.fone)} · ${esc(c.contato||'')}</div>
    <div class="mini" style="margin-top:4px">Prazo combinado: ${c.prazo? c.prazo+' dias':'à vista'}</div>
    <div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--aco-100)">
      <span class="placa">${esc(v.placa)}</span> <span class="mini">${esc(v.modelo)} · ${esc(v.ano)} · ${esc(v.tipo)}</span>
    </div>
  </div>
  <div style="display:flex;gap:9px;margin-top:12px">
    <button class="bt g" data-act="copiar-orc">Copiar orçamento</button>
    <button class="bt d g" data-act="excluir-os">Excluir OS</button>
  </div>`;
}

/* ---------------- ações da OS ---------------- */
function addItem(tipo,ref){
  const o=OSatual(); if(!o) return;
  const fonte=tipo==='servicos'?S.servicos.find(x=>x.id===ref):P(ref);
  const existe=o[tipo].find(i=>i.ref===ref);
  if(existe) existe.qtd++;
  else o[tipo].push({id:uid('i'),ref,nome:fonte.nome,qtd:1,valor:tipo==='servicos'?fonte.valor:fonte.venda});
  torrar(`${fonte.nome} lançado na OS ${o.num}`);
  S.ui.picker=null; S.ui.busca=''; renderFolha(); render();
}
function faturarOS(o){
  // baixa estoque
  let semEstoque=[];
  o.pecas.forEach(i=>{ const p=P(i.ref); if(!p) return;
    if(p.qtd<i.qtd) semEstoque.push(p.nome);
    p.qtd=Math.max(0,p.qtd-i.qtd);
  });
  const c=C(o.cli), total=totOS(o);
  const doc='NFS '+(8840+S.contas.filter(x=>x.doc&&x.doc.startsWith('NFS')).length+2);
  if(c.prazo>0){
    S.contas.push({id:uid('ct'),tipo:'receber',desc:`OS ${o.num} — ${V(o.vei).modelo} ${V(o.vei).placa}`,parte:c.nome,valor:total,venc:addDias(hoje(),c.prazo),pago:false,cat:'Serviços',os:o.id,doc});
    torrar(`OS ${o.num} faturada · ${brl(total)} a receber em ${c.prazo} dias`);
  }else{
    S.movimentos.push({id:uid('mv'),data:hoje(),tipo:'entrada',desc:`OS ${o.num} — recebido à vista`,valor:total,cat:'Serviços',conc:false});
    torrar(`OS ${o.num} recebida à vista · ${brl(total)} no caixa`);
  }
  o.st='finalizada'; o.pago=c.prazo===0; o.fechamento=hoje();
  if(semEstoque.length) setTimeout(()=>torrar('Estoque ficou negativo em: '+semEstoque[0]),2600);
}
function novaOSFolha(boxPre){
  const rasc=S.ui.rascunho=S.ui.rascunho||{box:boxPre||S.boxes[0].id,vei:'',cli:'',mec:S.mecanicos[0].id,queixa:'',km:0,prev:addDias(hoje(),1)};
  if(boxPre) rasc.box=boxPre;
  
  // Se o veiculo estiver preenchido mas o cliente não, puxa o cliente
  if (rasc.vei && !rasc.cli) {
    const vx = V(rasc.vei);
    if (vx) rasc.cli = vx.cli;
  }
  
  const clientes = S.clientes.sort((a,b)=>a.nome.localeCompare(b.nome));
  const veis = rasc.cli ? S.veiculos.filter(v => v.cli === rasc.cli) : [];
  
  return cabecaFolha('Abrir ordem de serviço',`Entrada de veículo · OS ${S.proxNum}`)+
  `<div class="folha-corpo">
    <div class="card card-p">
      <label class="campo"><span>Cliente</span>
        <select data-act="rasc" data-c="cli">
          <option value="">Selecione o cliente…</option>
          ${clientes.map(c=>`<option value="${c.id}" ${rasc.cli===c.id?'selected':''}>${c.nome}</option>`).join('')}
        </select></label>
      <label class="campo"><span>Veículo ${!rasc.cli ? '(Selecione um cliente primeiro)' : ''}</span>
        <select data-act="rasc" data-c="vei" ${!rasc.cli ? 'disabled' : ''}>
          <option value="">Escolher placa…</option>
          ${veis.map(v=>`<option value="${v.id}" ${rasc.vei===v.id?'selected':''}>${v.placa} · ${v.modelo}</option>`).join('')}
          <option value="novo" style="font-weight:bold;color:var(--petroleo)">+ Cadastrar nova placa...</option>
        </select></label>
      <div class="dupla">
        <label class="campo"><span>Box</span><select data-act="rasc" data-c="box">${S.boxes.map(b=>`<option value="${b.id}" ${rasc.box===b.id?'selected':''}>${b.nome}</option>`).join('')}</select></label>
        <label class="campo"><span>Responsável</span><select data-act="rasc" data-c="mec">${S.mecanicos.map(m=>`<option value="${m.id}" ${rasc.mec===m.id?'selected':''}>${m.nome}</option>`).join('')}</select></label>
      </div>
      <div class="dupla">
        <label class="campo"><span>KM atual</span><input type="number" value="${rasc.km||''}" data-act="rasc" data-c="km" placeholder="0"></label>
        <label class="campo"><span>Previsão</span><input type="date" value="${rasc.prev}" data-act="rasc" data-c="prev"></label>
      </div>
      <label class="campo" style="margin-bottom:0"><span>Queixa do motorista</span><textarea rows="3" data-act="rasc" data-c="queixa" placeholder="O que ele reclamou? Barulho, fumaça, perda de força…">${esc(rasc.queixa)}</textarea></label>
    </div>
    <p class="mini" style="padding:10px 4px">Serviços e peças você lança depois, com o caminhão já no box.</p>
  </div>
  </div>
  <div class="folha-pe">
    <button class="bt g" data-act="fechar">Cancelar</button>
    <button class="bt p g" data-act="criar-os" ${!rasc.vei || rasc.vei==='novo' ? 'disabled style="opacity:0.5"' : ''}>Abrir OS</button>
  </div>`;
}

function folhaNovoVeiculo(cli_id) {
  const rascV = S.ui.rascVeiculo = S.ui.rascVeiculo || { placa: '', marca: '', modelo: '', cor: '', cli: cli_id };
  
  const modelosPorMarca = {
    'Volvo': ['FH', 'FM', 'VM', 'FMX', 'NH', 'Outros'],
    'Scania': ['Série R', 'Série S', 'Série G', 'Série P', 'Série XT', 'Outros'],
    'Mercedes-Benz': ['Actros', 'Arocs', 'Atego', 'Accelo', 'Axor', 'Outros'],
    'Iveco': ['S-Way', 'Tector', 'Hi-Way', 'Stralis', 'Daily', 'Outros'],
    'DAF': ['XF', 'CF', 'LF', 'Outros'],
    'MAN': ['TGX', 'TGS', 'TGM', 'Outros'],
    'Volkswagen': ['Meteor', 'Constellation', 'Delivery', 'Outros'],
    'Outros': ['Outros']
  };

  const marcas = Object.keys(modelosPorMarca);
  const modelos = rascV.marca ? (modelosPorMarca[rascV.marca] || ['Outros']) : [];

  return cabecaFolha('Cadastrar Veículo', 'Novo veículo para o cliente') +
  `<div class="folha-corpo">
    <div class="card card-p">
      <div class="dupla">
        <label class="campo"><span>Placa</span>
          <div style="display:flex;gap:8px">
            <input type="text" data-act="rasc-vei" data-c="placa" value="${esc(rascV.placa)}" placeholder="ABC-1234" style="text-transform:uppercase;flex:1">
            <button class="bt p" data-act="buscar-placa-veiculo" style="flex:none;padding:0 12px" title="Consultar dados da placa">${ico('busca', 18)}</button>
          </div>
        </label>
        <label class="campo"><span>Cor</span>
          <input type="text" data-act="rasc-vei" data-c="cor" value="${esc(rascV.cor)}" placeholder="Branco, Prata...">
        </label>
      </div>
      <div class="dupla">
        <label class="campo"><span>Fabricante / Marca</span>
          <select data-act="rasc-vei" data-c="marca">
            <option value="">Selecione...</option>
            ${marcas.map(m => `<option value="${m}" ${rascV.marca === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
        <label class="campo"><span>Modelo</span>
          <select data-act="rasc-vei" data-c="modelo" ${!rascV.marca ? 'disabled' : ''}>
            <option value="">Selecione...</option>
            ${modelos.map(m => `<option value="${m}" ${rascV.modelo === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
  </div>
  <div class="folha-pe">
    <button class="bt g" data-act="voltar-os">Voltar</button>
    <button class="bt p" data-act="salvar-veiculo" ${(!rascV.placa || !rascV.marca || !rascV.modelo) ? 'disabled style="opacity:0.5"' : ''}>Salvar Veículo</button>
  </div>`;
}

/* =====================================================================
   ESTOQUE
===================================================================== */
function viewEstoque(){
  const q=(S.ui.busca||'').toLowerCase();
  const lista=S.pecas.filter(p=>(p.nome+' '+p.cod+' '+p.forn).toLowerCase().includes(q));
  const valorCusto=soma(S.pecas,p=>p.qtd*p.custo), criticos=estoqueCritico();
  return `
  <div class="kpis">
    <div class="kpi neutro"><div class="r">${ico('caixa',14)} Capital parado</div><div class="v">${brlCurto(valorCusto)}</div><div class="d">${S.pecas.length} itens cadastrados</div></div>
    <div class="kpi ${criticos.length?'alerta':'bom'}"><div class="r">${ico('alerta',14)} Abaixo do mínimo</div><div class="v">${criticos.length}</div><div class="d">${criticos.length?'repor antes de travar box':'estoque saudável'}</div></div>
  </div>
  <div style="display:flex;gap:9px;margin:12px 0">
    <button class="bt s g" data-act="importar-xml">${ico('nota',18)} Entrada por XML</button>
    <button class="bt g" data-act="nova-peca">${ico('mais',18)} Nova peça</button>
  </div>
  <div class="busca">${ico('busca',18)}<input placeholder="Buscar peça, código ou fornecedor" value="${esc(S.ui.busca||'')}" data-act="busca-geral" autocomplete="off"></div>
  ${criticos.length?`<div class="aviso-fila">${ico('alerta',18)}<div><b>${criticos.length} ${criticos.length===1?'item bateu':'itens bateram'} o mínimo.</b> ${esc(criticos.slice(0,2).map(p=>p.nome).join(', '))}${criticos.length>2?' e mais…':''}</div></div>`:''}
  <div class="lista">${lista.map(p=>{
    const pc=Math.min(100,Math.round(p.qtd/Math.max(1,p.min*2)*100));
    const cls=p.qtd<=p.min?'baixo':p.qtd<=p.min*1.5?'medio':'';
    return `<button class="item" data-act="ver-peca" data-id="${p.id}">
      <div class="txt">
        <div class="t1">${esc(p.nome)}</div>
        <div class="t2"><span class="mono">${esc(p.cod)}</span> · ${esc(p.loc)} · ${esc(p.forn)}</div>
        <div class="barra-prog"><i class="${cls}" style="width:${pc}%"></i></div>
      </div>
      <div class="v">${p.qtd}<small>mín ${p.min}${p.un}</small></div>
    </button>`;}).join('')||`<div class="card vazia"><b>Sem peças nessa busca</b>Importe um XML de compra ou cadastre na mão.</div>`}</div>`;
}
function folhaPeca(){
  const p=P(S.ui.pecaAberta); if(!p) return '';
  const usos=S.os.filter(o=>o.pecas.some(i=>i.ref===p.id)&&o.st!=='finalizada');
  return cabecaFolha(esc(p.nome),`<span class="mono">${esc(p.cod)}</span> · ${esc(p.forn)}`)+
  `<div class="folha-corpo">
    <div class="card card-p" style="text-align:center">
      <div class="mini">Saldo atual</div>
      <div class="num" style="font-size:38px;font-weight:680;line-height:1.1">${p.qtd}<span style="font-size:16px;color:var(--aco-400)"> ${esc(p.un)}</span></div>
      <div style="display:flex;gap:9px;justify-content:center;margin-top:11px">
        <button class="bt" data-act="mov-peca" data-d="-1">− 1</button>
        <button class="bt" data-act="mov-peca" data-d="1">+ 1</button>
        <button class="bt" data-act="mov-peca" data-d="10">+ 10</button>
      </div>
    </div>
    <div class="card card-p" style="margin-top:11px">
      <div class="dupla">
        <label class="campo"><span>Estoque mínimo</span><input type="number" value="${p.min}" data-act="campo-peca" data-c="min"></label>
        <label class="campo"><span>Localização</span><input value="${esc(p.loc)}" data-act="campo-peca" data-c="loc"></label>
      </div>
      <div class="dupla">
        <label class="campo"><span>Custo (R$)</span><input type="number" step="0.01" value="${p.custo}" data-act="campo-peca" data-c="custo"></label>
        <label class="campo"><span>Venda (R$)</span><input type="number" step="0.01" value="${p.venda}" data-act="campo-peca" data-c="venda"></label>
      </div>
      <label class="campo" style="margin-bottom:0"><span>Fornecedor</span><input value="${esc(p.forn)}" data-act="campo-peca" data-c="forn"></label>
      <div class="mini" style="margin-top:9px">Margem por unidade: <b class="num">${brl(p.venda-p.custo)}</b> (${Math.round((p.venda/Math.max(.01,p.custo)-1)*100)}%)</div>
    </div>
    ${usos.length?`<div class="tit-sec">Reservada em OS abertas</div><div class="lista">${usos.map(o=>`<button class="item" data-act="abrir-os" data-id="${o.id}"><div class="txt"><div class="t1">OS ${o.num} · ${esc(V(o.vei).placa)}</div><div class="t2">${esc(C(o.cli).nome)}</div></div><div class="v">${o.pecas.find(i=>i.ref===p.id).qtd}<small>un</small></div></button>`).join('')}</div>`:''}
  </div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Fechar</button><button class="bt d g" data-act="excluir-peca">Excluir peça</button></div>`;
}
function folhaNovaPeca(){
  const r=S.ui.rascPeca=S.ui.rascPeca||{cod:'',nome:'',un:'un',qtd:0,min:1,custo:0,venda:0,loc:'',forn:''};
  return cabecaFolha('Cadastrar peça','Entra no estoque na hora')+
  `<div class="folha-corpo"><div class="card card-p">
    <label class="campo"><span>Descrição</span><input value="${esc(r.nome)}" data-act="rp" data-c="nome" placeholder="Ex.: Filtro de ar externo"></label>
    <div class="dupla">
      <label class="campo"><span>Código</span><input value="${esc(r.cod)}" data-act="rp" data-c="cod"></label>
      <label class="campo"><span>Unidade</span><input value="${esc(r.un)}" data-act="rp" data-c="un"></label>
    </div>
    <div class="dupla">
      <label class="campo"><span>Quantidade</span><input type="number" value="${r.qtd}" data-act="rp" data-c="qtd"></label>
      <label class="campo"><span>Mínimo</span><input type="number" value="${r.min}" data-act="rp" data-c="min"></label>
    </div>
    <div class="dupla">
      <label class="campo"><span>Custo</span><input type="number" step="0.01" value="${r.custo}" data-act="rp" data-c="custo"></label>
      <label class="campo"><span>Venda</span><input type="number" step="0.01" value="${r.venda}" data-act="rp" data-c="venda"></label>
    </div>
    <div class="dupla">
      <label class="campo"><span>Local</span><input value="${esc(r.loc)}" data-act="rp" data-c="loc" placeholder="A1"></label>
      <label class="campo"><span>Fornecedor</span><input value="${esc(r.forn)}" data-act="rp" data-c="forn"></label>
    </div>
  </div></div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Cancelar</button><button class="bt p g" data-act="salvar-peca">Salvar peça</button></div>`;
}

/* =====================================================================
   ENTRADA DE NOTA FISCAL POR XML
===================================================================== */
function txt(no,nome){
  if(!no) return '';
  const achar=n=>{ if(n.localName===nome) return n; for(const f of n.children||[]){const r=achar(f); if(r) return r;} return null; };
  const alvo=achar(no); return alvo? (alvo.textContent||'').trim():'';
}
function todos(no,nome){
  const out=[]; (function anda(n){ if(n.localName===nome) out.push(n); for(const f of n.children||[]) anda(f); })(no); return out;
}
function lerXML(texto){
  const doc=new DOMParser().parseFromString(texto,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('XML inválido');
  const raiz=doc.documentElement;
  const emit=todos(raiz,'emit')[0];
  const nota={
    emitente:txt(emit,'xNome')||'Fornecedor não identificado',
    cnpj:txt(emit,'CNPJ')||'',
    numero:txt(todos(raiz,'ide')[0],'nNF')||'s/nº',
    emissao:(txt(todos(raiz,'ide')[0],'dhEmi')||txt(todos(raiz,'ide')[0],'dEmi')||hoje()).slice(0,10),
    total:parseFloat(txt(todos(raiz,'ICMSTot')[0],'vNF')||'0')||0,
    itens:[], parcelas:[]
  };
  todos(raiz,'det').forEach(det=>{
    const prod=todos(det,'prod')[0]; if(!prod) return;
    nota.itens.push({
      cod:txt(prod,'cProd'), nome:txt(prod,'xProd'), un:txt(prod,'uCom')||'un',
      qtd:parseFloat(txt(prod,'qCom')||'0')||0, custo:parseFloat(txt(prod,'vUnCom')||'0')||0
    });
  });
  todos(raiz,'dup').forEach(d=>nota.parcelas.push({venc:txt(d,'dVenc')||addDias(hoje(),28),valor:parseFloat(txt(d,'vDup')||'0')||0}));
  if(!nota.parcelas.length&&nota.total) nota.parcelas.push({venc:addDias(hoje(),28),valor:nota.total});
  if(!nota.total) nota.total=soma(nota.itens,i=>i.qtd*i.custo);
  return nota;
}
function folhaXML(){
  const n=S.ui.nota;
  const corpo=!n
    ? `<label class="file-zona" style="display:block">
         ${ico('upload',26)}<b style="margin-top:8px">Selecionar arquivo XML</b>
         <span>NF-e de compra do fornecedor. Dá pra mandar vários de uma vez.</span>
         <input type="file" accept=".xml,text/xml" multiple data-act="arquivo-xml" style="display:none">
       </label>
       <div class="tit-sec">O que acontece ao importar</div>
       <div class="card card-p mini" style="line-height:1.7">
         As peças da nota entram no estoque com o custo real da NF-e.<br>
         Item já cadastrado tem o saldo somado e o custo atualizado.<br>
         Cada duplicata vira uma conta a pagar com o vencimento da nota.
       </div>`
    : `<div class="card card-p">
         <div style="font-weight:650;font-size:15px">${esc(n.emitente)}</div>
         <div class="mini">NF-e ${esc(n.numero)} · emissão ${dataBRfull(n.emissao)} ${n.cnpj?'· '+esc(n.cnpj):''}</div>
         <div class="num" style="font-size:22px;font-weight:680;margin-top:7px">${brl(n.total)}</div>
       </div>
       <div class="tit-sec">Itens (${n.itens.length})</div>
       <div class="card" style="padding:4px 8px 8px">
         <table class="tabelinha"><thead><tr><th>Item</th><th style="text-align:right">Qtd</th><th style="text-align:right">Custo</th></tr></thead>
         <tbody>${n.itens.map(i=>{
            const ja=S.pecas.find(p=>p.cod===i.cod||p.nome.toLowerCase()===i.nome.toLowerCase());
            return `<tr><td>${esc(i.nome)}<div class="mini">${ja?'atualiza saldo':'peça nova'}</div></td><td class="n">${i.qtd}${esc(i.un)}</td><td class="n">${brl(i.custo)}</td></tr>`;
         }).join('')}</tbody></table>
       </div>
       <div class="tit-sec">Duplicatas</div>
       <div class="lista">${n.parcelas.map((p,ix)=>`<div class="item"><div class="txt"><div class="t1">Parcela ${ix+1}</div><div class="t2">vence ${dataBRfull(p.venc)}</div></div><div class="v">${brl(p.valor)}</div></div>`).join('')}</div>`;
  return cabecaFolha('Entrada de nota fiscal','Importar XML da NF-e de compra')+
    `<div class="folha-corpo">${corpo}</div>
     <div class="folha-pe">
       <button class="bt g" data-act="fechar">${n?'Descartar':'Fechar'}</button>
       ${n?`<button class="bt v g" data-act="confirmar-xml">Lançar no estoque</button>`:''}
     </div>`;
}
function confirmarXML(){
  const n=S.ui.nota; if(!n) return;
  let novas=0,atualizadas=0;
  n.itens.forEach(i=>{
    const p=S.pecas.find(x=>x.cod===i.cod||x.nome.toLowerCase()===i.nome.toLowerCase());
    if(p){ p.qtd+=i.qtd; p.custo=i.custo||p.custo; p.venda=Math.max(p.venda,+(i.custo*1.75).toFixed(2)); atualizadas++; }
    else { S.pecas.push({id:uid('p'),cod:i.cod||('IMP-'+Math.floor(Math.random()*9e3+1e3)),nome:i.nome,un:i.un,qtd:i.qtd,min:1,
      custo:i.custo,venda:+(i.custo*1.75).toFixed(2),loc:'A receber',forn:n.emitente}); novas++; }
  });
  n.parcelas.forEach((p,ix)=>S.contas.push({id:uid('ct'),tipo:'pagar',desc:`NF ${n.numero} — ${n.itens.length} ${n.itens.length===1?'item':'itens'}${n.parcelas.length>1?` (${ix+1}/${n.parcelas.length})`:''}`,
    parte:n.emitente,valor:p.valor,venc:p.venc,pago:false,cat:'Peças',doc:'NF '+n.numero}));
  S.nfsRecebidas.push({num:n.numero,forn:n.emitente,total:n.total,data:n.emissao});
  S.ui.nota=null; fecharFolha(); render();
  torrar(`Nota lançada · ${novas} peças novas, ${atualizadas} atualizadas`);
}

/* =====================================================================
   FINANCEIRO
===================================================================== */
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
  let abertos=rec.filter(c=>!c.pago);
  
  const d = hoje();
  const f = S.ui.filtroFin || 'tudo';
  if(f === 'atrasados') abertos = abertos.filter(c=>c.venc < d);
  else if(f === 'hoje') abertos = abertos.filter(c=>c.venc <= d);
  else if(f === 'amanha') abertos = abertos.filter(c=>c.venc === addDias(d,1) || c.venc < d); // Include overdue? Sure, usually they want to see what is due.
  else if(f === 'semana') abertos = abertos.filter(c=>c.venc <= addDias(d,7));
  else if(f === 'quinzena') abertos = abertos.filter(c=>c.venc <= addDias(d,15));
  else if(f === 'mes') abertos = abertos.filter(c=>c.venc <= addDias(d,30));
  
  // se o filtro não for 'tudo', ajusta 'amanha' para ver só o dia de amanhã estrito
  if(f === 'amanha') abertos = rec.filter(c=>!c.pago && c.venc === addDias(d,1));

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
  
  <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">
    <button data-act="filtro-fin" data-f="tudo" class="bt-filtro ${f==='tudo'?'on':''}">${ico('relogio',14)} Todos</button>
    <button data-act="filtro-fin" data-f="atrasados" class="bt-filtro ${f==='atrasados'?'on':''}"><span style="color:${f==='atrasados'?'#fff':'var(--tijolo)'}">Atrasados</span></button>
    <button data-act="filtro-fin" data-f="hoje" class="bt-filtro ${f==='hoje'?'on':''}">Até Hoje</button>
    <button data-act="filtro-fin" data-f="semana" class="bt-filtro ${f==='semana'?'on':''}">Próximos 7 Dias</button>
    <button data-act="filtro-fin" data-f="quinzena" class="bt-filtro ${f==='quinzena'?'on':''}">Próximos 15 Dias</button>
    <button data-act="filtro-fin" data-f="mes" class="bt-filtro ${f==='mes'?'on':''}">Próximos 30 Dias</button>
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
  let abertos=pag.filter(c=>!c.pago);

  const d = hoje();
  const f = S.ui.filtroFin || 'tudo';
  if(f === 'atrasados') abertos = abertos.filter(c=>c.venc < d);
  else if(f === 'hoje') abertos = abertos.filter(c=>c.venc <= d);
  else if(f === 'amanha') abertos = abertos.filter(c=>c.venc === addDias(d,1) || c.venc < d);
  else if(f === 'semana') abertos = abertos.filter(c=>c.venc <= addDias(d,7));
  else if(f === 'quinzena') abertos = abertos.filter(c=>c.venc <= addDias(d,15));
  else if(f === 'mes') abertos = abertos.filter(c=>c.venc <= addDias(d,30));
  
  if(f === 'amanha') abertos = pag.filter(c=>!c.pago && c.venc === addDias(d,1));

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
  
  <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">
    <button data-act="filtro-fin" data-f="tudo" class="bt-filtro ${f==='tudo'?'on':''}">${ico('relogio',14)} Todos</button>
    <button data-act="filtro-fin" data-f="atrasados" class="bt-filtro ${f==='atrasados'?'on':''}"><span style="color:${f==='atrasados'?'#fff':'var(--tijolo)'}">Atrasados</span></button>
    <button data-act="filtro-fin" data-f="hoje" class="bt-filtro ${f==='hoje'?'on':''}">Até Hoje</button>
    <button data-act="filtro-fin" data-f="semana" class="bt-filtro ${f==='semana'?'on':''}">Próximos 7 Dias</button>
    <button data-act="filtro-fin" data-f="quinzena" class="bt-filtro ${f==='quinzena'?'on':''}">Próximos 15 Dias</button>
    <button data-act="filtro-fin" data-f="mes" class="bt-filtro ${f==='mes'?'on':''}">Próximos 30 Dias</button>
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

function cliZap(c) { return S.clientes.find(x=>x.nome===c.parte); }
function textoCobrancaRapida() { return "Olá {nome}, tudo bem? Aqui é da {empresa}. Estou passando para lembrar do vencimento no valor de {valor} para o dia {vencimento}. Qualquer dúvida, estamos à disposição!"; }
function ctxCobranca(c, cli) { return {nome: cli? (cli.contato||cli.nome) : c.parte, empresa: S.cfg.empresa, valor: brl(c.valor), vencimento: dataBR(c.venc)}; }

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

/* ===== CHART RENDERING FOR FINANCIAL MODULE ===== */
let finCharts = {};
function renderGraficosFinanceiro(){
  if(!window.Chart) return;
  Object.values(finCharts).forEach(c=>{try{c.destroy();}catch(e){}});
  finCharts={};
  
  const chartOpts = {responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:10}}}}};
  const barOpts = {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{display:false},x:{grid:{display:false}}}};

  // Dashboard: Fluxo 6 meses
  const ctxFluxoDash = document.getElementById('grafico-fluxo-dash');
  if(ctxFluxoDash){
    const meses=[]; const base=new Date();
    for(let i=5;i>=0;i--){const d=new Date(base.getFullYear(),base.getMonth()-i,1);meses.push(d.toISOString().slice(0,7));}
    const ent=meses.map(m=>soma(S.movimentos.filter(x=>x.tipo==='entrada'&&mesRef(x.data)===m),x=>x.valor));
    const sai=meses.map(m=>soma(S.movimentos.filter(x=>x.tipo==='saida'&&mesRef(x.data)===m),x=>x.valor));
    const rot=meses.map(m=>['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m.slice(5,7)-1]);
    finCharts.fluxoDash = new Chart(ctxFluxoDash,{type:'bar',data:{labels:rot,datasets:[
      {label:'Entradas',data:ent,backgroundColor:'#10b981',borderRadius:4},
      {label:'Saidas',data:sai,backgroundColor:'#ef4444',borderRadius:4}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:10}}}},scales:{y:{display:false},x:{grid:{display:false}}}}});
  }

  // Dashboard: Categorias a pagar
  const ctxCatPagar = document.getElementById('grafico-cat-pagar');
  if(ctxCatPagar){
    const cats=categorizarContas('pagar');
    const cores=['#2563eb','#8b5cf6','#f59e0b','#ef4444','#10b981','#94a3b8'];
    finCharts.catPagar = new Chart(ctxCatPagar,{type:'doughnut',data:{labels:cats.map(c=>c.cat),datasets:[{data:cats.map(c=>c.valor),backgroundColor:cores.slice(0,cats.length),borderWidth:0}]},options:chartOpts});
  }

  // Fluxo de Caixa: Barras 6 meses
  const ctxFluxo = document.getElementById('grafico-fluxo');
  if(ctxFluxo){
    const meses=[]; const base=new Date();
    for(let i=5;i>=0;i--){const d=new Date(base.getFullYear(),base.getMonth()-i,1);meses.push(d.toISOString().slice(0,7));}
    const ent=meses.map(m=>soma(S.movimentos.filter(x=>x.tipo==='entrada'&&mesRef(x.data)===m),x=>x.valor));
    const sai=meses.map(m=>soma(S.movimentos.filter(x=>x.tipo==='saida'&&mesRef(x.data)===m),x=>x.valor));
    const saldo=meses.map((m,i)=>ent[i]-sai[i]);
    const rot=meses.map(m=>['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m.slice(5,7)-1]);
    finCharts.fluxo = new Chart(ctxFluxo,{type:'bar',data:{labels:rot,datasets:[
      {label:'Entradas',data:ent,backgroundColor:'#10b981',borderRadius:4},
      {label:'Saidas',data:sai,backgroundColor:'#ef4444',borderRadius:4},
      {label:'Resultado',data:saldo,type:'line',borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.1)',fill:true,tension:0.3,pointRadius:4}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:11}}}},scales:{y:{ticks:{callback:v=>v>=1000?(v/1000)+'k':v}},x:{grid:{display:false}}}}});
  }

  // DRE: Receitas
  const ctxRecDre = document.getElementById('grafico-rec-dre');
  if(ctxRecDre){
    const mes=mesRef(hoje());
    const entradas=S.movimentos.filter(m=>m.tipo==='entrada'&&mesRef(m.data)===mes);
    const recServ=soma(entradas.filter(m=>m.cat==='Serviços'),m=>m.valor);
    const recPecas=soma(entradas.filter(m=>m.cat==='Peças'),m=>m.valor);
    const recOutros=soma(entradas.filter(m=>m.cat!=='Serviços'&&m.cat!=='Peças'),m=>m.valor);
    finCharts.recDre = new Chart(ctxRecDre,{type:'doughnut',data:{labels:['Servicos','Pecas','Outros'],datasets:[{data:[recServ,recPecas,recOutros],backgroundColor:['#10b981','#2563eb','#94a3b8'],borderWidth:0}]},options:chartOpts});
  }

  // DRE: Despesas
  const ctxDespDre = document.getElementById('grafico-desp-dre');
  if(ctxDespDre){
    const mes=mesRef(hoje());
    const saidas=S.movimentos.filter(m=>m.tipo==='saida'&&mesRef(m.data)===mes);
    const cats=['Peças','Pessoal','Fixas','Impostos','Outros'];
    const vals=cats.map(cat=>cat==='Outros'?soma(saidas.filter(m=>!['Peças','Pessoal','Fixas','Impostos'].includes(m.cat)),m=>m.valor):soma(saidas.filter(m=>m.cat===cat),m=>m.valor));
    const cores=['#ef4444','#f59e0b','#8b5cf6','#2563eb','#94a3b8'];
    finCharts.despDre = new Chart(ctxDespDre,{type:'doughnut',data:{labels:cats,datasets:[{data:vals,backgroundColor:cores,borderWidth:0}]},options:chartOpts});
  }
}


/* ---------------- conciliação bancária ---------------- */
function blocoBanco(){
  const ext=S.extrato||[];
  if(!ext.length) return `
    <label class="file-zona" style="display:block">
      ${ico('banco',26)}<b style="margin-top:8px">Importar extrato do banco</b>
      <span>Arquivo OFX, TXT ou CSV baixado do internet banking.</span>
      <input type="file" accept=".ofx,.txt,.csv,.OFX" multiple data-act="arquivo-extrato" style="display:none">
    </label>
    <div class="tit-sec">Como funciona</div>
    <div class="card card-p mini" style="line-height:1.7">
      Cada linha do extrato é comparada com os títulos em aberto por valor e data.<br>
      Achando o par, o sistema sugere a baixa — você só confirma.<br>
      O que não bater vira lançamento avulso no caixa, sem sujar o saldo.
    </div>
    <div class="tit-sec">Formato CSV aceito</div>
    <div class="card card-p"><code class="mono" style="font-size:12px">data;valor;descrição<br>2026-08-28;-3860,00;FORNEC FREIOS SUL<br>2026-08-29;4420,00;TED FRIGORIFICO BOI</code></div>`;
  const pend=ext.filter(l=>!l.ok).length;
  return `
  <div class="entre" style="margin-bottom:10px">
    <div><h3 style="font-size:15px">Extrato importado</h3><div class="mini">${ext.length} lançamentos · ${pend} para conciliar</div></div>
    <button class="bt sm" data-act="limpar-extrato">Limpar</button>
  </div>
  <div class="lista">${ext.map(l=>{
    const sug=l.ok?null:casarLancamento(l);
    return `<div class="item">
      <div class="cor" style="background:${l.ok?'var(--verde)':sug?'var(--sinal)':'var(--aco-150)'}"></div>
      <div class="txt">
        <div class="t1">${esc(l.desc)}</div>
        <div class="t2">${dataBRfull(l.data)} ${l.ok?'· conciliado':sug?`· casa com <b>${esc(sug.desc)}</b>`:'· sem par no sistema'}</div>
        ${l.ok?'':`<div style="display:flex;gap:7px;margin-top:7px">
          ${sug?`<button class="bt sm v" data-act="conciliar" data-id="${l.id}" data-c="${sug.id}">Conciliar</button>`:''}
          <button class="bt sm" data-act="conciliar-avulso" data-id="${l.id}">Lançar avulso</button>
        </div>`}
      </div>
      <div class="v" style="color:${l.valor>=0?'var(--verde)':'var(--tijolo)'}">${l.valor>=0?'+':'−'} ${brl(Math.abs(l.valor))}</div>
    </div>`;}).join('')}</div>`;
}
function casarLancamento(l){
  const tipo=l.valor>=0?'receber':'pagar';
  return S.contas.find(c=>c.tipo===tipo&&!c.pago&&Math.abs(c.valor-Math.abs(l.valor))<0.02&&Math.abs(diasEntre(c.venc,l.data))<=10)||null;
}
function lerExtrato(texto){
  const linhas=[];
  if(/<STMTTRN>/i.test(texto)){
    texto.split(/<STMTTRN>/i).slice(1).forEach(bl=>{
      const g=t=>{const m=bl.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i'));return m?m[1].trim():'';};
      const d=g('DTPOSTED').slice(0,8);
      if(!d) return;
      linhas.push({id:uid('ex'),data:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,valor:parseFloat(g('TRNAMT').replace(',','.'))||0,
        desc:(g('MEMO')||g('NAME')||'Lançamento bancário').trim(),ok:false});
    });
  }else{
    texto.split(/\r?\n/).forEach(ln=>{
      if(!ln.trim()) return;
      const c=ln.split(/[;\t]|,(?=\s*-?\d)/).map(s=>s.trim().replace(/^"|"$/g,''));
      if(c.length<2) return;
      let d=c[0]; if(/^\d{2}\/\d{2}\/\d{4}$/.test(d)) d=d.slice(6)+'-'+d.slice(3,5)+'-'+d.slice(0,2);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const v=parseFloat(String(c[1]).replace(/\./g,'').replace(',','.'));
      if(isNaN(v)) return;
      linhas.push({id:uid('ex'),data:d,valor:v,desc:c[2]||'Lançamento bancário',ok:false});
    });
  }
  return linhas;
}
function baixarConta(c,data){
  c.pago=true; c.dataPag=data||hoje();
  S.movimentos.push({id:uid('mv'),data:c.dataPag,tipo:c.tipo==='receber'?'entrada':'saida',desc:c.desc,valor:c.valor,cat:c.cat,conc:true});
}

/* =====================================================================
   WHATSAPP — cobrança automática e campanhas
===================================================================== */
const soDigitos=f=>String(f||'').replace(/\D/g,'');
function foneZap(f){ let d=soDigitos(f); if(!d) return ''; if(d.length<=11) d='55'+d; return d; }
function linkZap(fone,texto){ return 'https://wa.me/'+foneZap(fone)+'?text='+encodeURIComponent(texto); }
function preencher(txt,ctx){ return String(txt||'').replace(/\{(\w+)\}/g,(m,k)=>ctx[k]!=null?ctx[k]:m); }
function ultimaVisita(cliId){
  const d=S.os.filter(o=>o.cli===cliId).map(o=>o.fechamento||o.abertura).sort();
  return d.length?d[d.length-1]:null;
}
function ctxCobranca(c,cli){
  const os=S.os.find(o=>o.id===c.os);
  return {contato:(cli&&cli.contato)||c.parte,cliente:c.parte,valor:brl(c.valor),venc:dataBRfull(c.venc),
    dias:Math.abs(diasEntre(hoje(),c.venc)),doc:c.doc||c.desc,oficina:S.cfg.empresa,
    placa:os?V(os.vei).placa:(S.veiculos.find(v=>cli&&v.cli===cli.id)||{}).placa||'seu veículo'};
}
function ctxCliente(cli){
  const v=S.veiculos.find(x=>x.cli===cli.id)||{};
  const ult=ultimaVisita(cli.id);
  return {contato:cli.contato||cli.nome,cliente:cli.nome,oficina:S.cfg.empresa,placa:v.placa||'seu caminhão',
    modelo:v.modelo||'',dias:ult?diasEntre(ult,hoje()):0,valor:'',venc:'',doc:''};
}
function filaCobranca(){
  const fila=[];
  S.contas.filter(c=>c.tipo==='receber'&&!c.pago).forEach(c=>{
    const cli=S.clientes.find(x=>x.nome===c.parte);
    // etapa mais avançada que já saiu para este título: as anteriores não voltam a aparecer
    let jaFeito=-Infinity;
    S.zap.envios.forEach(e=>{
      if(!e.chave||e.chave.indexOf(c.id+'|')!==0) return;
      const r=S.zap.regua.find(x=>x.id===e.chave.split('|')[1]);
      if(r&&r.quando>jaFeito) jaFeito=r.quando;
    });
    S.zap.regua.filter(r=>r.ativo).forEach(r=>{
      const disparo=addDias(c.venc,r.quando);
      if(disparo>hoje()) return;
      if(r.quando<=jaFeito) return;
      const chave=c.id+'|'+r.id;
      if(S.zap.envios.some(e=>e.chave===chave)) return;
      fila.push({chave,conta:c,regra:r,cli,disparo,
        quadro:r.quando<0?'antes':r.quando===0?'hoje':'atraso',
        texto:preencher(r.texto,ctxCobranca(c,cli))});
    });
  });
  // um título só cobra uma vez por vez: fica a etapa mais avançada que já venceu
  const porTitulo={};
  fila.forEach(f=>{ const at=porTitulo[f.conta.id]; if(!at||f.regra.quando>at.regra.quando) porTitulo[f.conta.id]=f; });
  return Object.values(porTitulo).sort((a,b)=>b.regra.quando-a.regra.quando||a.disparo.localeCompare(b.disparo));
}
function acharNaFila(chave){ return filaCobranca().find(f=>f.chave===chave); }
function registrarEnvio(reg){ S.zap.envios.unshift(Object.assign({id:uid('en'),data:hoje(),hora:new Date().toTimeString().slice(0,5)},reg)); salvar(); }

const SEGMENTOS={
  optin:{r:'Todos que aceitam receber',f:c=>true},
  frota:{r:'Frotistas (2+ veículos)',f:c=>S.veiculos.filter(v=>v.cli===c.id).length>=2},
  sumidos:{r:'Sem passar há 90 dias',f:c=>{const u=ultimaVisita(c.id);return !u||diasEntre(u,hoje())>90;}},
  emdia:{r:'Sem nada em atraso',f:c=>!S.contas.some(x=>x.tipo==='receber'&&!x.pago&&x.parte===c.nome&&x.venc<hoje())},
  recentes:{r:'Atendidos nos últimos 60 dias',f:c=>{const u=ultimaVisita(c.id);return u&&diasEntre(u,hoje())<=60;}}
};
function destinatarios(seg){
  return S.clientes.filter(c=>c.optin!==false&&soDigitos(c.fone).length>=10&&(SEGMENTOS[seg]||SEGMENTOS.optin).f(c));
}

function viewMensagens(){
  const a=S.ui.abaZap||'cobranca';
  const abas=[['cobranca','Cobrança'],['campanhas','Campanhas'],['regua','Régua'],['historico','Histórico']];
  const corpo={cobranca:blocoCobranca,campanhas:blocoCampanhas,regua:blocoRegua,historico:blocoHistorico}[a]();
  return `<div class="abas" style="margin-bottom:12px">${abas.map(([k,r])=>`<button data-act="aba-zap" data-k="${k}" aria-selected="${a===k}">${r}</button>`).join('')}</div>${corpo}`;
}

function blocoCobranca(){
  const fila=filaCobranca();
  const hojeEnv=S.zap.envios.filter(e=>e.data===hoje()&&e.status==='enviado').length;
  const risco=soma(emAberto('receber').filter(c=>c.venc<hoje()),c=>c.valor);
  const cards=fila.map(f=>`
    <div class="msg" data-q="${f.quadro}">
      <div class="cab">
        <div style="flex:1;min-width:0">
          <div style="font-weight:650;font-size:14.5px">${esc(f.conta.parte)}</div>
          <div class="mini">${esc(f.regra.nome)} · vence ${dataBRfull(f.conta.venc)} · ${esc((f.cli&&f.cli.fone)||'sem telefone')}</div>
        </div>
        <div style="text-align:right">
          <div class="num" style="font-weight:680;font-size:15px">${brl(f.conta.valor)}</div>
          <span class="selo" data-st="${f.quadro==='atraso'?'peca':f.quadro==='hoje'?'aprovacao':'executando'}">${f.quadro==='antes'?'lembrete':f.quadro==='hoje'?'vence hoje':(-diasEntre(hoje(),f.conta.venc))+'d em atraso'}</span>
        </div>
      </div>
      <div class="balao">${esc(f.texto)}</div>
      <div class="acoes">
        ${(f.cli&&soDigitos(f.cli.fone).length>=10)
          ? `<a class="bt zap" href="${linkZap(f.cli.fone,f.texto)}" target="_blank" rel="noopener" data-act="enviar-cob" data-k="${f.chave}">${ico('zap',17)} Enviar</a>`
          : `<button class="bt" disabled>Sem telefone cadastrado</button>`}
        <button class="bt sm" data-act="copiar-cob" data-k="${f.chave}">Copiar</button>
        <button class="bt sm" data-act="pular-cob" data-k="${f.chave}">Pular</button>
      </div>
    </div>`).join('');
  return `
  <div class="kpis">
    <div class="kpi ${fila.length?'aviso':'bom'}"><div class="r">Na fila agora</div><div class="v">${fila.length}</div><div class="d">${fila.length?'mensagens prontas':'ninguém pra cobrar'}</div></div>
    <div class="kpi bom"><div class="r">Enviadas hoje</div><div class="v">${hojeEnv}</div><div class="d">${S.zap.envios.length} no total</div></div>
    <div class="kpi ${risco?'alerta':'bom'}"><div class="r">Vencido em aberto</div><div class="v">${brlCurto(risco)}</div><div class="d">o que a régua persegue</div></div>
    <div class="kpi neutro"><div class="r">Modo</div><div class="v" style="font-size:17px;padding-top:5px">${S.zap.modo==='api'?'Automático':'Confirmar 1 a 1'}</div><div class="d">${S.zap.janela}</div></div>
  </div>
  <div class="tit-sec">Fila de cobrança</div>
  ${fila.length?cards:`<div class="card vazia"><b>Fila limpa</b>Nenhum título entrou nas datas da régua. Volta amanhã.</div>`}`;
}

function blocoCampanhas(){
  const c=S.ui.camp=S.ui.camp||{nome:'',seg:'optin',texto:S.zap.modelos[0].texto};
  const alvo=destinatarios(c.seg);
  const exemplo=alvo[0]?preencher(c.texto,ctxCliente(alvo[0])):'Escolha um segmento com clientes.';
  const semOptin=S.clientes.filter(x=>x.optin===false).length;
  return `
  <div class="card card-p">
    <div class="contador"><b>${alvo.length}</b><span class="mini">${alvo.length===1?'cliente vai receber':'clientes vão receber'}${semOptin?` · ${semOptin} fora por opt-out`:''}</span></div>
    <label class="campo"><span>Segmento</span>
      <select data-act="camp" data-c="seg">${Object.entries(SEGMENTOS).map(([k,s])=>`<option value="${k}" ${c.seg===k?'selected':''}>${s.r} (${destinatarios(k).length})</option>`).join('')}</select></label>
    <label class="campo"><span>Modelo pronto</span>
      <select data-act="camp-modelo"><option value="">Escolher um modelo…</option>${S.zap.modelos.map((m,i)=>`<option value="${i}">${esc(m.nome)}</option>`).join('')}</select></label>
    <label class="campo"><span>Nome da campanha</span><input value="${esc(c.nome)}" data-act="camp" data-c="nome" placeholder="Promoção de revisão — setembro"></label>
    <label class="campo" style="margin-bottom:6px"><span>Mensagem</span><textarea rows="6" data-act="camp" data-c="texto">${esc(c.texto)}</textarea></label>
    <div class="chave">${['{contato}','{cliente}','{placa}','{modelo}','{oficina}','{dias}'].map(v=>`<button data-act="copiar-var" data-v="${v}">${v}</button>`).join('')}</div>
  </div>
  <div class="tit-sec">Como vai chegar pro ${esc(alvo[0]?(alvo[0].contato||alvo[0].nome):'cliente')}</div>
  <div class="balao" style="margin-left:0">${esc(exemplo)}</div>
  <div class="acoes" style="margin-left:0">
    <button class="bt zap g" data-act="disparar-camp">${ico('megafone',17)} Disparar para ${alvo.length}</button>
  </div>
  <div style="display:flex;gap:8px;margin-top:9px">
    <button class="bt g" data-act="copiar-numeros">${ico('lista',17)} Copiar números</button>
    <button class="bt g" data-act="copiar-camp">Copiar mensagem</button>
  </div>
  <div class="card card-p mini" style="margin-top:11px;line-height:1.7">
    Lista de transmissão do WhatsApp só entrega pra quem tem o seu número salvo na agenda — e o teto é 256 contatos por lista.
    Por isso o disparo aqui vai um a um, que chega em todo mundo e não queima o número.
  </div>
  ${S.zap.campanhas.length?`<div class="tit-sec">Campanhas anteriores</div><div class="lista">${S.zap.campanhas.slice().reverse().map(x=>`
    <div class="item"><div class="cor" style="background:var(--verde)"></div>
      <div class="txt"><div class="t1">${esc(x.nome)}</div><div class="t2">${dataBRfull(x.data)} · ${esc(SEGMENTOS[x.seg]?SEGMENTOS[x.seg].r:x.seg)}</div></div>
      <div class="v">${x.enviados}<small>enviadas</small></div></div>`).join('')}</div>`:''}`;
}

function folhaDisparo(){
  const d=S.ui.disparo; if(!d) return '';
  if(d.ix>=d.lista.length){
    return cabecaFolha('Campanha concluída',`${d.enviados} de ${d.lista.length} enviadas`)+
    `<div class="folha-corpo">
      <div class="card card-p" style="text-align:center">
        <div style="color:var(--verde)">${ico('check',34)}</div>
        <div class="contador" style="justify-content:center"><b>${d.enviados}</b><span class="mini">mensagens disparadas</span></div>
        <div class="mini">Tudo registrado no histórico, com data e hora.</div>
      </div>
    </div>
    <div class="folha-pe"><button class="bt v g" data-act="fechar-disparo">Fechar</button></div>`;
  }
  const cli=d.lista[d.ix], texto=preencher(d.texto,ctxCliente(cli));
  return cabecaFolha(esc(cli.nome),`${d.ix+1} de ${d.lista.length} · ${esc(cli.fone)}`)+
  `<div class="folha-corpo">
    <div class="barra-prog" style="height:7px;margin-bottom:12px"><i style="width:${d.ix/d.lista.length*100}%"></i></div>
    <div class="balao" style="margin-left:0">${esc(texto)}</div>
    <a class="bt zap g" href="${linkZap(cli.fone,texto)}" target="_blank" rel="noopener" data-act="disparo-enviar">${ico('zap',18)} Abrir conversa e enviar</a>
    <p class="mini" style="padding:10px 4px">O WhatsApp abre com a mensagem escrita. Você só confere e toca em enviar — aí volta aqui que já pulei pro próximo.</p>
  </div>
  <div class="folha-pe">
    <button class="bt g" data-act="disparo-pular">Pular este</button>
    <button class="bt g" data-act="fechar-disparo">Parar</button>
  </div>`;
}

function blocoRegua(){
  const z=S.zap;
  return `
  <div class="card card-p">
    <div class="entre">
      <div style="flex:1"><div style="font-weight:650">Cobrança automática</div>
        <div class="mini">Monta a fila sozinha conforme o vencimento chega</div></div>
      <button class="liga" data-act="liga-zap" aria-pressed="${z.ativo}"><i></i></button>
    </div>
    <div class="entre" style="margin-top:13px;padding-top:13px;border-top:1px solid var(--aco-100)">
      <div style="flex:1"><div style="font-weight:650">Só em dias úteis</div>
        <div class="mini">Sábado e domingo a fila espera segunda</div></div>
      <button class="liga" data-act="liga-uteis" aria-pressed="${z.soUteis}"><i></i></button>
    </div>
    <label class="campo" style="margin:13px 0 0"><span>Janela de envio</span><input value="${esc(z.janela)}" data-act="zap-cfg" data-c="janela"></label>
  </div>

  <div class="tit-sec">Etapas da régua</div>
  ${z.regua.map(r=>{
    const cls=r.quando<0?'antes':r.quando===0?'dia0':'dep';
    const rot=r.quando<0?`D${r.quando}`:r.quando===0?'D0':`D+${r.quando}`;
    return `<div class="regra">
      <div class="passo">
        <span class="dia ${cls}">${rot}</span>
        <div style="flex:1;min-width:0"><input value="${esc(r.nome)}" data-act="regra" data-i="${r.id}" data-c="nome"
          style="width:100%;border:0;font-weight:650;font-size:14px;background:none;padding:0"></div>
        <button class="liga" data-act="liga-regra" data-i="${r.id}" aria-pressed="${r.ativo}"><i></i></button>
      </div>
      <div class="dupla" style="margin-bottom:8px">
        <label class="campo" style="margin:0"><span>Dias em relação ao vencimento</span>
          <input type="number" value="${r.quando}" data-act="regra" data-i="${r.id}" data-c="quando"></label>
        <div style="display:flex;align-items:flex-end"><button class="bt d sm g" data-act="rm-regra" data-i="${r.id}">Remover etapa</button></div>
      </div>
      <textarea rows="4" data-act="regra" data-i="${r.id}" data-c="texto"
        style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--aco-150);font-size:13.5px">${esc(r.texto)}</textarea>
    </div>`;}).join('')}
  <button class="bt g" data-act="add-regra">${ico('mais',18)} Adicionar etapa</button>
  <div class="card card-p" style="margin-top:12px">
    <div class="mini" style="margin-bottom:7px">Variáveis que você pode usar no texto (toque pra copiar):</div>
    <div class="chave">${['{contato}','{cliente}','{valor}','{venc}','{dias}','{doc}','{placa}','{oficina}'].map(v=>`<button data-act="copiar-var" data-v="${v}">${v}</button>`).join('')}</div>
  </div>
  <div class="tit-sec">Envio 100% automático</div>
  <div class="card card-p">
    <div class="mini" style="line-height:1.7">Do jeito atual, o app monta a mensagem e você confirma o envio — funciona hoje, sem servidor e sem risco de bloqueio.
    Pra sair sozinho de madrugada, precisa de um servidor rodando com a API oficial do WhatsApp.</div>
    <button class="bt p g" style="margin-top:11px" data-act="ver-api">Ver o que é preciso</button>
  </div>`;
}

function folhaAPI(){
  const z=S.zap;
  return cabecaFolha('Envio automático de verdade','WhatsApp Cloud API, da Meta')+
  `<div class="folha-corpo">
    <div class="card card-p">
      <div style="font-weight:650;margin-bottom:6px">O que você precisa ter</div>
      <div class="mini" style="line-height:1.8">
        Conta no WhatsApp Business Platform e um número dedicado — não use o número pessoal.<br>
        Modelos de mensagem aprovados pela Meta: cobrança entra como utilidade (barato e liberado), promoção entra como marketing (precisa de opt-in).<br>
        Um servidor pequeno rodando o disparo uma vez por dia. VPS de R$ 20 dá conta.
      </div>
    </div>
    <div class="tit-sec">Onde guardar as credenciais</div>
    <div class="card card-p">
      <label class="campo"><span>ID do número (phone_number_id)</span><input value="${esc((z.api&&z.api.phoneId)||'')}" data-act="api-cfg" data-c="phoneId" placeholder="1234567890"></label>
      <label class="campo"><span>Endpoint do seu servidor</span><input value="${esc((z.api&&z.api.url)||'')}" data-act="api-cfg" data-c="url" placeholder="https://seu-servidor.com/cobranca"></label>
      <div class="mini">O token fica no servidor, nunca aqui. Qualquer credencial dentro de uma tela é credencial vazada.</div>
    </div>
    <div class="tit-sec">Chamada que o servidor faz</div>
    <div class="card card-p"><code class="mono" style="font-size:11.5px;line-height:1.6;display:block;white-space:pre-wrap">POST /v21.0/${esc((z.api&&z.api.phoneId)||'PHONE_ID')}/messages
Authorization: Bearer SEU_TOKEN

{
  "messaging_product": "whatsapp",
  "to": "5516998124400",
  "type": "template",
  "template": {
    "name": "lembrete_vencimento",
    "language": { "code": "pt_BR" },
    "components": [{ "type": "body", "parameters": [
      { "type": "text", "text": "Marlene" },
      { "type": "text", "text": "R$ 3.270,00" },
      { "type": "text", "text": "06/09/2026" }
    ]}]
  }
}</code></div>
    <div class="card card-p mini" style="margin-top:11px;line-height:1.7">
      Fora da janela de 24h só passa modelo aprovado — texto livre é recusado.<br>
      Bibliotecas não oficiais (as que leem o WhatsApp Web) funcionam, custam zero e derrubam o número quando a Meta percebe. Pra cobrança de cliente, não vale o risco.
    </div>
  </div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Fechar</button>
    <button class="bt p g" data-act="copiar-payload">Copiar exemplo</button></div>`;
}

function blocoHistorico(){
  const e=S.zap.envios;
  if(!e.length) return `<div class="card vazia"><b>Nada enviado ainda</b>Cada mensagem que sair fica registrada aqui com data, hora e texto.</div>`;
  return `<div class="lista">${e.slice(0,60).map(x=>`
    <div class="item">
      <div class="cor" style="background:${x.status==='enviado'?'var(--verde)':x.status==='pulado'?'var(--aco-300)':'var(--sinal)'}"></div>
      <div class="txt"><div class="t1">${esc(x.cliente)}</div>
        <div class="t2">${dataBRfull(x.data)} ${esc(x.hora||'')} · ${esc(x.rotulo||x.tipo)}${x.status==='pulado'?' · pulado':''}</div></div>
      <div class="v" style="font-size:12.5px;font-family:var(--ui);color:var(--aco-400)">${x.valor?brl(x.valor):'campanha'}</div>
    </div>`).join('')}</div>
  <button class="bt g" style="margin-top:11px" data-act="limpar-hist">Limpar histórico</button>`;
}

/* =====================================================================
   CADASTROS
===================================================================== */
function viewCadastros(){
  const a=S.ui.abaCad||'clientes';
  const abas=[['clientes','Clientes'],['frota','Frota'],['servicos','Serviços'],['equipe','Equipe e boxes']];
  let corpo='';
  if(a==='clientes') corpo=`
    <button class="bt p g" style="margin-bottom:11px" data-act="novo-cad" data-t="cliente">${ico('mais',18)} Novo cliente</button>
    <div class="lista">${S.clientes.map(c=>{
      const frota=S.veiculos.filter(v=>v.cli===c.id).length;
      const aberto=soma(S.contas.filter(x=>x.tipo==='receber'&&!x.pago&&x.parte===c.nome),x=>x.valor);
      const isBlock = c.bloqueado;
      return `<div class="item" style="flex-direction:column;align-items:stretch;gap:8px;padding-bottom:8px">
        <div style="display:flex;align-items:center;gap:12px;cursor:pointer" data-act="ver-cliente" data-id="${c.id}">
          <div class="txt" style="flex:1">
            <div class="t1" style="${isBlock?'text-decoration:line-through;color:var(--aco-400)':''}">${esc(c.nome)} ${isBlock?'<span style="color:var(--tijolo);font-size:11px;font-weight:600">(BLOQUEADO)</span>':''}</div>
            <div class="t2">${esc(c.fone)} • ${frota} ${frota===1?'veículo':'veículos'} • ${c.prazo?c.prazo+' dias':'à vista'}</div>
          </div>
          <div class="v" style="text-align:right">${aberto?brl(aberto):'-'}<br><small>${aberto?'em aberto':'sem pendência'}</small></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:6px;border-top:1px dashed var(--aco-200);padding-top:8px">
          <button class="bt sm" data-act="bloquear-cliente" data-id="${c.id}">${isBlock?ico('check',14)+' Desbloquear':ico('alerta',14)+' Bloquear'}</button>
          <button class="bt sm" data-act="editar-cliente" data-id="${c.id}">Editar</button>
          <button class="bt sm d" data-act="excluir-cliente" data-id="${c.id}">Excluir</button>
        </div>
      </div>`;}).join('')}</div>`;
  else if(a==='frota') corpo=`
    <button class="bt p g" style="margin-bottom:11px" data-act="novo-cad" data-t="veiculo">${ico('mais',18)} Novo veículo</button>
    <div class="lista">${S.veiculos.map(v=>{
      const hist=S.os.filter(o=>o.vei===v.id).length;
      return `<div class="item"><div class="txt"><div class="t1"><span class="placa">${esc(v.placa)}</span> ${esc(v.modelo)}</div>
        <div class="t2">${esc(C(v.cli).nome)} · ${esc(v.tipo)} · ${esc(v.ano)}</div></div>
        <div class="v">${hist}<small>OS</small></div></div>`;}).join('')}</div>`;
  else if(a==='servicos') corpo=`
    <button class="bt p g" style="margin-bottom:11px" data-act="novo-cad" data-t="servico">${ico('mais',18)} Novo serviço</button>
    <div class="lista">${S.servicos.map(s=>`<div class="item"><div class="txt"><div class="t1">${esc(s.nome)}</div><div class="t2">${s.horas}h de box · ${brl(s.valor/Math.max(.5,s.horas))}/h</div></div><div class="v">${brl(s.valor)}</div></div>`).join('')}</div>`;
  else corpo=`
    <div class="tit-sec">Mecânicos</div>
    <div class="lista">${S.mecanicos.map(m=>{
      const carga=S.os.filter(o=>o.mec===m.id&&o.st!=='finalizada').length;
      return `<div class="item"><div class="txt"><div class="t1">${esc(m.nome)}</div><div class="t2">${esc(m.esp)}</div></div><div class="v">${carga}<small>OS ativas</small></div></div>`;}).join('')}</div>
    <div class="tit-sec">Boxes</div>
    <div class="lista">${S.boxes.map(b=>{
      const o=S.os.find(x=>x.box===b.id&&x.st!=='finalizada');
      return `<div class="item"><div class="txt"><div class="t1">${esc(b.nome)}</div><div class="t2">${esc(b.tipo)}</div></div>
        <div class="v" style="font-family:var(--ui);font-size:12.5px;font-weight:600;color:${o?'var(--petroleo)':'var(--aco-400)'}">${o?esc(V(o.vei).placa):'livre'}</div></div>`;}).join('')}</div>
    <button class="bt g" style="margin-top:11px" data-act="novo-cad" data-t="box">${ico('mais',18)} Novo box</button>
    <div class="tit-sec">Empresa</div>
    <div class="card card-p">
      <label class="campo"><span>Nome da oficina</span><input value="${esc(S.cfg.empresa)}" data-act="cfg" data-c="empresa"></label>
      <label class="campo" style="margin-bottom:0"><span>Saldo inicial do caixa (R$)</span><input type="number" step="0.01" value="${S.cfg.saldoInicial}" data-act="cfg" data-c="saldoInicial"></label>
    </div>
    <button class="bt d g" style="margin-top:14px" data-act="zerar">Restaurar dados de demonstração</button>`;
  return `<div class="abas" style="margin-bottom:12px">${abas.map(([k,r])=>`<button data-act="aba-cad" data-k="${k}" aria-selected="${a===k}">${r}</button>`).join('')}</div>${corpo}`;
}

function folhaCliente(){
  const c=C(S.ui.cliAberto); if(!c.id) return '';
  const frota=S.veiculos.filter(v=>v.cli===c.id);
  const titulos=S.contas.filter(x=>x.tipo==='receber'&&x.parte===c.nome&&!x.pago);
  const ordens=S.os.filter(o=>o.cli===c.id);
  const gasto=soma(ordens.filter(o=>o.st==='finalizada'),o=>totOS(o));
  
  const addr = [c.endereco, c.numero, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ');

  return cabecaFolha(esc(c.nome),`${esc(c.doc)} • ${esc(c.fone)}`)+
  `<div class="folha-corpo">
    <button class="bt-azul" style="margin-bottom:12px;width:100%" data-act="editar-cliente" data-id="${c.id}">Editar Cadastro Completo</button>
    <div class="card card-p" style="margin-bottom:12px;font-size:13px;line-height:1.5;color:var(--aco-700)">
      ${c.fantasia ? `<b>Fantasia:</b> ${esc(c.fantasia)}<br>` : ''}
      ${c.ie ? `<b>IE:</b> ${esc(c.ie)}<br>` : ''}
      ${c.email ? `<b>E-mail:</b> ${esc(c.email)}<br>` : ''}
      ${c.contato ? `<b>Contato:</b> ${esc(c.contato)}<br>` : ''}
      ${addr ? `<b>Endereço:</b> ${esc(addr)} ${c.cep ? `(CEP: ${esc(c.cep)})` : ''}` : ''}
      ${!c.fantasia && !addr && !c.email ? `<i>Cadastro básico. Edite para preencher os dados completos.</i>` : ''}
    </div>
    <div class="kpis">
      <div class="kpi neutro"><div class="r">Já faturado</div><div class="v">${brlCurto(gasto)}</div><div class="d">${ordens.length} ordens</div></div>
      <div class="kpi ${titulos.length?'aviso':'bom'}"><div class="r">Em aberto</div><div class="v">${brlCurto(soma(titulos,t=>t.valor))}</div><div class="d">${titulos.length} títulos</div></div>
    </div>
    <div class="tit-sec">Frota</div>
    <div class="lista">${frota.map(v=>`<div class="item"><div class="txt"><div class="t1"><span class="placa">${esc(v.placa)}</span></div><div class="t2">${esc(v.modelo)} · ${(v.km||0).toLocaleString('pt-BR')} km</div></div>
      <div class="v" style="font-size:12.5px;font-family:var(--ui)">${esc(v.tipo)}</div></div>`).join('')||'<div class="vazia">Sem veículos cadastrados</div>'}</div>
    <div class="tit-sec">Ordens de serviço</div>
    <div class="lista">
      ${(() => {
        if (!ordens.length) return '<div class="vazia">Nenhuma OS ainda</div>';
        
        // Agrupar ordens por placa
        const byVei = {};
        ordens.forEach(o => {
          if (!byVei[o.vei]) byVei[o.vei] = [];
          byVei[o.vei].push(o);
        });

        return Object.entries(byVei).map(([veiId, osArr]) => {
          const vei = V(veiId);
          const placa = vei ? vei.placa : 'Desconhecida';
          return `<div style="background:#f9f9fa;padding:8px 12px;font-size:13px;font-weight:600;color:var(--aco-600);border-bottom:1px solid var(--aco-200);border-top:1px solid var(--aco-200);margin-top:-1px">${esc(placa)}</div>
            ${osArr.slice().reverse().map(o => `<button class="item" data-act="abrir-os" data-id="${o.id}" style="padding-left:12px;border-top:0">
              <div class="cor" style="background:${ST[o.st].c}"></div>
              <div class="txt"><div class="t1">OS ${o.num}</div><div class="t2">${dataBRfull(o.abertura)} • ${ST[o.st].r}</div></div>
              <div class="v">${brl(totOS(o))}</div></button>`).join('')}`;
        }).join('');
      })()}
    </div>
    <div class="card card-p" style="margin-top:12px">
      <label class="campo"><span>Prazo de pagamento (dias · 0 = à vista)</span>
        <input type="number" value="${c.prazo}" data-act="campo-cli" data-c="prazo"></label>
      <div class="entre" style="padding-top:9px;border-top:1px solid var(--aco-100)">
        <div style="flex:1"><div style="font-weight:650;font-size:14px">Aceita campanhas</div>
          <div class="mini">Cobrança continua saindo mesmo desligado</div></div>
        <button class="liga" data-act="liga-optin" aria-pressed="${c.optin!==false}"><i></i></button>
      </div>
    </div>
    ${soDigitos(c.fone).length>=10?`<a class="bt zap g" style="margin-top:11px" href="${linkZap(c.fone,'Oi '+((c.contato||c.nome))+', aqui é da '+S.cfg.empresa+'.')}" target="_blank" rel="noopener">${ico('zap',18)} Chamar no WhatsApp</a>`:''}
  </div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Fechar</button></div>`;
}
window.buscarCNPJ = async function() {
  const cnpj = (S.ui.rascCad.doc || '').replace(/\D/g, '');
  if(cnpj.length !== 14) return torrar('CNPJ inválido (digite 14 números)');
  
  const b = document.getElementById('bt-busca-cnpj');
  if(b) b.innerHTML = 'Buscando...';
  
  try {
    const res = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
    if(!res.ok) throw new Error('Não encontrado');
    const data = await res.json();
    
    // Auto-fill state
    S.ui.rascCad.nome = data.razao_social || '';
    S.ui.rascCad.fantasia = data.nome_fantasia || '';
    S.ui.rascCad.cep = data.cep || '';
    S.ui.rascCad.endereco = data.logradouro || '';
    S.ui.rascCad.numero = data.numero || '';
    S.ui.rascCad.complemento = data.complemento || '';
    S.ui.rascCad.bairro = data.bairro || '';
    S.ui.rascCad.cidade = data.municipio || '';
    S.ui.rascCad.uf = data.uf || '';
    S.ui.rascCad.fone = data.ddd_telefone_1 || '';
    S.ui.rascCad.email = data.email || '';
    
    torrar('Dados preenchidos!');
    renderFolha(); // re-render folha
  } catch(e) {
    torrar('Erro ou CNPJ não encontrado');
    if(b) b.innerHTML = 'Buscar CNPJ';
  }
}

window.folhaCadastroCliente = function(){
  const r=S.ui.rascCad=S.ui.rascCad||{};
  const campo = (k, l, tp) => `<label class="campo"><span>${l}</span><input ${tp?'type="'+tp+'"':''} value="${esc(r[k]??'')}" data-act="rc" data-c="${k}"></label>`;
  
  return cabecaFolha(r.id?'Editar Cliente':'Novo Cliente', 'Cadastro Completo Classe A')+
  `<div class="folha-corpo" style="display:flex;flex-direction:column;gap:16px;">
    
    <div class="card card-p">
      <div class="tit-sec" style="margin:0 0 10px 0;font-size:14px">Identificação</div>
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px">
        <div style="flex:1">${campo('doc', 'CNPJ ou CPF')}</div>
        <button id="bt-busca-cnpj" class="bt-azul" style="margin-bottom:1px;padding:9px 12px;border:none;cursor:pointer" onclick="buscarCNPJ()">${ico('lupa', 16)} Buscar</button>
      </div>
      ${campo('nome', 'Razão Social / Nome Completo')}
      ${campo('fantasia', 'Nome Fantasia')}
      ${campo('ie', 'Inscrição Estadual (IE)')}
    </div>

    <div class="card card-p">
      <div class="tit-sec" style="margin:0 0 10px 0;font-size:14px">Contato</div>
      ${campo('fone', 'WhatsApp / Telefone')}
      ${campo('email', 'E-mail principal', 'email')}
      ${campo('contato', 'Pessoa de Contato')}
    </div>

    <div class="card card-p">
      <div class="tit-sec" style="margin:0 0 10px 0;font-size:14px">Endereço</div>
      <div style="display:flex;gap:8px">${campo('cep', 'CEP')}${campo('uf', 'UF')}</div>
      ${campo('endereco', 'Logradouro (Rua, Av.)')}
      <div style="display:flex;gap:8px">${campo('numero', 'Número')}${campo('complemento', 'Complemento')}</div>
      <div style="display:flex;gap:8px">${campo('bairro', 'Bairro')}${campo('cidade', 'Cidade')}</div>
    </div>
    
    <div class="card card-p">
      <div class="tit-sec" style="margin:0 0 10px 0;font-size:14px">Configuração Comercial</div>
      ${campo('prazo', 'Prazo padrão de faturamento (dias)', 'number')}
    </div>
    
  </div>
  <div class="folha-pe">
    <button class="bt g" data-act="fechar">Cancelar</button>
    <button class="bt p g" data-act="salvar-cad">Salvar Cadastro Completo</button>
  </div>`;
}

function folhaCadastro(){
  const t=S.ui.cadTipo, r=S.ui.rascCad=S.ui.rascCad||{};
  if (t === 'cliente') return folhaCadastroCliente();
  const campos={
    cliente:[['nome','Nome / razão social'],['doc','CNPJ ou CPF'],['fone','Telefone'],['contato','Pessoa de contato'],['prazo','Prazo de pagamento (dias)','number']],
    veiculo:[['placa','Placa'],['modelo','Modelo'],['ano','Ano'],['tipo','Tipo (cavalo, carreta, truck)'],['km','KM atual','number']],
    servico:[['nome','Descrição do serviço'],['valor','Valor (R$)','number'],['horas','Horas de box','number']],
    box:[['nome','Nome do box'],['tipo','Tipo (elevador, vala, solda)']]
  }[t];
  const extra=t==='veiculo'?`<label class="campo"><span>Cliente dono</span><select data-act="rc" data-c="cli">${S.clientes.map(c=>`<option value="${c.id}" ${r.cli===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></label>`:'';
  const titulo={cliente:'Novo cliente',veiculo:'Novo veículo',servico:'Novo serviço',box:'Novo box'}[t];
  return cabecaFolha(titulo,'Cadastro rápido')+
  `<div class="folha-corpo"><div class="card card-p">
    ${extra}
    ${campos.map(([k,l,tp])=>`<label class="campo"><span>${l}</span><input ${tp?'type="'+tp+'"':''} value="${esc(r[k]??'')}" data-act="rc" data-c="${k}"></label>`).join('')}
  </div></div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Cancelar</button><button class="bt p g" data-act="salvar-cad">Salvar</button></div>`;
}
function folhaConta(){
  const t=S.ui.contaTipo, r=S.ui.rascConta=S.ui.rascConta||{desc:'',parte:'',valor:0,venc:hoje(),cat:t==='receber'?'Serviços':'Fixas'};
  return cabecaFolha(t==='receber'?'Novo recebimento':'Nova conta a pagar','Entra no fluxo de caixa previsto')+
  `<div class="folha-corpo"><div class="card card-p">
    <label class="campo"><span>Descrição</span><input value="${esc(r.desc)}" data-act="rct" data-c="desc" placeholder="${t==='receber'?'OS 1050 — Scania':'Aluguel, energia, peças…'}"></label>
    <label class="campo"><span>${t==='receber'?'Cliente':'Fornecedor'}</span><input value="${esc(r.parte)}" data-act="rct" data-c="parte"></label>
    <div class="dupla">
      <label class="campo"><span>Valor (R$)</span><input type="number" step="0.01" value="${r.valor||''}" data-act="rct" data-c="valor"></label>
      <label class="campo"><span>Vencimento</span><input type="date" value="${r.venc}" data-act="rct" data-c="venc"></label>
    </div>
    <label class="campo" style="margin-bottom:0"><span>Categoria</span>
      <select data-act="rct" data-c="cat">${['Serviços','Peças','Pessoal','Fixas','Impostos','Outros'].map(x=>`<option ${r.cat===x?'selected':''}>${x}</option>`).join('')}</select></label>
  </div></div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Cancelar</button><button class="bt p g" data-act="salvar-conta">Salvar título</button></div>`;
}
function folhaMov(){
  const r=S.ui.rascMov=S.ui.rascMov||{tipo:'entrada',desc:'',valor:0,data:hoje(),cat:'Outros'};
  return cabecaFolha('Movimentar caixa','Entrada ou saída avulsa')+
  `<div class="folha-corpo"><div class="card card-p">
    <label class="campo"><span>Tipo</span><select data-act="rmv" data-c="tipo"><option value="entrada" ${r.tipo==='entrada'?'selected':''}>Entrada</option><option value="saida" ${r.tipo==='saida'?'selected':''}>Saída</option></select></label>
    <label class="campo"><span>Descrição</span><input value="${esc(r.desc)}" data-act="rmv" data-c="desc"></label>
    <div class="dupla">
      <label class="campo"><span>Valor (R$)</span><input type="number" step="0.01" value="${r.valor||''}" data-act="rmv" data-c="valor"></label>
      <label class="campo"><span>Data</span><input type="date" value="${r.data}" data-act="rmv" data-c="data"></label>
    </div>
    <label class="campo" style="margin-bottom:0"><span>Categoria</span><select data-act="rmv" data-c="cat">${['Serviços','Peças','Pessoal','Fixas','Impostos','Outros'].map(x=>`<option ${r.cat===x?'selected':''}>${x}</option>`).join('')}</select></label>
  </div></div>
  <div class="folha-pe"><button class="bt g" data-act="fechar">Cancelar</button><button class="bt p g" data-act="salvar-mov">Lançar</button></div>`;
}

/* =====================================================================
   PAINEL
===================================================================== */
function viewPainel(){
  const mes=mesRef(hoje());
  const finalizadasMes=S.os.filter(o=>o.st==='finalizada'&&(o.fechamento||o.abertura).slice(0,7)===mes);
  const fatMes=soma(finalizadasMes,o=>totOS(o));
  const ticket=finalizadasMes.length?fatMes/finalizadasMes.length:0;
  const abertas=osAbertas();
  const wip=soma(abertas,o=>totOS(o));
  const ocup=S.boxes.filter(b=>abertas.some(o=>o.box===b.id)).length;
  const margem=soma(finalizadasMes,o=>totOS(o)-custoPecasOS(o));
  // ranking de serviços
  const cont={}; S.os.forEach(o=>o.servicos.forEach(i=>cont[i.nome]=(cont[i.nome]||0)+i.qtd*i.valor));
  const rank=Object.entries(cont).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxR=rank.length?rank[0][1]:1;
  const paradas=S.os.filter(o=>o.st==='peca');
  const atrasadas=abertas.filter(o=>o.prev<hoje());
  return `
  <div class="kpis">
    <div class="kpi bom"><div class="r">Faturado no mês</div><div class="v">${brlCurto(fatMes)}</div><div class="d">${finalizadasMes.length} OS entregues</div></div>
    <div class="kpi neutro"><div class="r">Em execução</div><div class="v">${brlCurto(wip)}</div><div class="d">${abertas.length} OS no pátio</div></div>
    <div class="kpi aviso"><div class="r">Ticket médio</div><div class="v">${brlCurto(ticket)}</div><div class="d">por ordem entregue</div></div>
    <div class="kpi ${margem>0?'bom':'alerta'}"><div class="r">Margem do mês</div><div class="v">${brlCurto(margem)}</div><div class="d">depois do custo de peças</div></div>
  </div>

  <div class="tit-sec">Ocupação dos boxes</div>
  <div class="card card-p">
    <div class="entre"><span style="font-weight:600">${ocup} de ${S.boxes.length} boxes ocupados</span><span class="num" style="font-weight:650">${Math.round(ocup/S.boxes.length*100)}%</span></div>
    <div class="barra-prog" style="height:9px;margin-top:9px"><i style="width:${ocup/S.boxes.length*100}%"></i></div>
    <div class="mini" style="margin-top:8px">Box vazio é dinheiro parado; box entupido é prazo estourando. O ponto ótimo fica perto de 80%.</div>
  </div>

  ${(paradas.length||atrasadas.length)?`<div class="tit-sec">Precisa de você</div><div class="lista">
    ${atrasadas.map(o=>`<button class="item" data-act="abrir-os" data-id="${o.id}"><div class="cor" style="background:var(--tijolo)"></div>
      <div class="txt"><div class="t1">OS ${o.num} passou da previsão</div><div class="t2">${esc(V(o.vei).placa)} · ${esc(C(o.cli).nome)} · previa ${dataBR(o.prev)}</div></div>${ico('seta',18)}</button>`).join('')}
    ${paradas.map(o=>`<button class="item" data-act="abrir-os" data-id="${o.id}"><div class="cor" style="background:var(--sinal)"></div>
      <div class="txt"><div class="t1">OS ${o.num} parada esperando peça</div><div class="t2">${esc(V(o.vei).placa)} · ${diasEntre(o.abertura,hoje())} dias no box</div></div>${ico('seta',18)}</button>`).join('')}
  </div>`:''}

  <div class="tit-sec">Serviços que mais faturam</div>
  <div class="card card-p">
    ${rank.map(([n,v])=>`<div style="margin-bottom:10px">
      <div class="entre" style="font-size:13px"><span>${esc(n)}</span><b class="num">${brl(v)}</b></div>
      <div class="barra-prog"><i style="width:${v/maxR*100}%"></i></div></div>`).join('')||'<div class="mini">Sem histórico ainda.</div>'}
  </div>

  <div class="tit-sec">Compras e notas recebidas</div>
  <div class="lista">${(S.nfsRecebidas.slice(-5).reverse().map(n=>`<div class="item"><div class="txt"><div class="t1">NF ${esc(n.num)} · ${esc(n.forn)}</div><div class="t2">${dataBRfull(n.data)}</div></div><div class="v">${brl(n.total)}</div></div>`).join(''))||'<div class="card vazia"><b>Nenhuma nota importada</b>Use a entrada por XML no estoque.</div>'}</div>`;
}

/* =====================================================================
   INTERAÇÕES
===================================================================== */
let confirmando=null;
function pedirConfirmacao(chave,msg,fn){
  if(confirmando===chave){ confirmando=null; fn(); return; }
  confirmando=chave; torrar(msg); setTimeout(()=>{ if(confirmando===chave) confirmando=null; },4000);
}
function copiar(texto){
  if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(texto).catch(()=>caiuNoTextarea(texto));
  caiuNoTextarea(texto);
}
function caiuNoTextarea(t){
  const ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} ta.remove();
}
function textoOrcamento(o){
  const v=V(o.vei), c=C(o.cli);
  const l=[`*${S.cfg.empresa}* — Orçamento OS ${o.num}`,`${v.placa} · ${v.modelo}`,`Cliente: ${c.nome}`,''];
  if(o.servicos.length){ l.push('*Serviços*'); o.servicos.forEach(i=>l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd*i.valor)}`)); l.push(''); }
  if(o.pecas.length){ l.push('*Peças*'); o.pecas.forEach(i=>l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd*i.valor)}`)); l.push(''); }
  if(o.desc) l.push(`Desconto: −${brl(o.desc)}`);
  l.push(`*Total: ${brl(totOS(o))}*`);
  l.push(`Previsão de entrega: ${dataBRfull(o.prev)}`);
  return l.join('\n');
}
function focoBusca(){
  const i=document.querySelector('[data-act="busca-picker"],[data-act="busca-geral"],[data-act="busca-placa-patio"]');
  if(i){ i.focus(); const v=i.value; i.value=''; i.value=v; }
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const a=b.dataset.act;
  const o=OSatual();
  switch(a){
    case 'ir': S.ui.view=b.dataset.v; S.ui.busca=''; render(); break;
    case 'nav-fin': S.ui.view='financeiro'; S.ui.abaFin=b.dataset.aba; S.ui.filtroFin=b.dataset.filtro; S.ui.busca=''; render(); break;
    case 'filtro': S.ui.filtro=b.dataset.f; render(); break;
    case 'filtro-fin': S.ui.filtroFin=b.dataset.f; render(); break;
    case 'fechar': S.ui.nota=null; S.ui.rascunho=null; S.ui.rascCad=null; S.ui.rascConta=null; S.ui.rascMov=null; S.ui.rascPeca=null; fecharFolha(); break;

    /* --- OS --- */
    case 'abrir-os': S.ui.osAberta=b.dataset.id; S.ui.abaOS='servicos'; S.ui.picker=null; S.ui.busca=''; abrirFolha(folhaOS); break;
    case 'nova-os': S.ui.rascunho=null; abrirFolha(()=>novaOSFolha(b.dataset.box)); break;
    case 'voltar-os': S.ui.rascVeiculo=null; abrirFolha(novaOSFolha); break;
    case 'salvar-veiculo': {
       const r = S.ui.rascVeiculo;
       if (!r.placa || !r.marca || !r.modelo) return;
       const newId = uid('vei');
       S.veiculos.push({ id: newId, cli: r.cli, placa: r.placa.toUpperCase(), marca: r.marca, modelo: r.modelo, cor: r.cor });
       salvar();
       torrar('Veículo cadastrado!');
       S.ui.rascunho.vei = newId; 
       S.ui.rascVeiculo = null;
       abrirFolha(novaOSFolha);
       break;
    }
    case 'buscar-placa-veiculo': {
       const rV = S.ui.rascVeiculo;
       if(!rV || !rV.placa || rV.placa.length < 7) {
         torrar('Digite uma placa válida!');
         return;
       }
       
       const cred = S.cfg.apibrasil;
       if(!cred || !cred.deviceToken || !cred.bearerToken) {
          torrar('Credenciais da APIBrasil não configuradas! Preencha na aba Configurações.');
          return;
       }

       b.innerHTML = '...'; b.disabled = true;
       const p = rV.placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
       
       fetch('https://gateway.apibrasil.io/api/v2/veiculos/consultar', {
          method: 'POST',
          headers: {
             'Content-Type': 'application/json',
             'DeviceToken': cred.deviceToken,
             'Authorization': 'Bearer ' + cred.bearerToken
          },
          body: JSON.stringify({ placa: p })
       })
       .then(r => r.json())
       .then(res => {
          b.innerHTML = ico('busca',18); b.disabled = false;
          
          if(res && res.error === false && res.data) {
             rV.marca = res.data.marca || '';
             rV.modelo = res.data.modelo || '';
             rV.cor = res.data.cor || '';
             // Outros dados disponíveis na APIBrasil: chassi, motor, uf, municipio
             renderFolha();
             torrar('Dados da placa obtidos com sucesso!');
          } else {
             torrar(res.message || 'Placa não encontrada ou sem resposta.');
          }
       })
       .catch(err => {
          b.innerHTML = ico('busca',18); b.disabled = false;
          torrar('Erro de rede ao consultar a API.');
          console.error(err);
       });
       break;
    }
    case 'aba-os': S.ui.abaOS=b.dataset.k; S.ui.picker=null; renderFolha(); break;
    case 'picker': S.ui.picker=b.dataset.p; S.ui.busca=''; renderFolha(); break;
    case 'fechar-picker': S.ui.picker=null; S.ui.busca=''; renderFolha(); break;
    case 'add-item': addItem(b.dataset.t,b.dataset.r); break;
    case 'qtd': {
      const lista=o[b.dataset.t], i=lista.find(x=>x.id===b.dataset.i);
      i.qtd=Math.max(1,i.qtd+ +b.dataset.d); renderFolha(); render(); break;
    }
    case 'rm-item': o[b.dataset.t]=o[b.dataset.t].filter(x=>x.id!==b.dataset.i); renderFolha(); render(); break;
    case 'acao-os':
      if(b.dataset.alvo==='FATURAR'){
        if(!o.servicos.length&&!o.pecas.length){ torrar('Lança pelo menos um serviço antes de faturar'); break; }
        faturarOS(o); fecharFolha(); render();
      }else{ o.st=b.dataset.alvo; renderFolha(); render(); torrar(`OS ${o.num}: ${ST[o.st].r.toLowerCase()}`); }
      break;
    case 'criar-os': {
      const r=S.ui.rascunho||{};
      if(!r.vei){ torrar('Escolhe a placa do veículo'); break; }
      const v=V(r.vei);
      const nova={id:uid('os'),num:S.proxNum++,box:r.box,vei:r.vei,cli:v.cli,mec:r.mec,st:'fila',abertura:hoje(),
        prev:r.prev||addDias(hoje(),1),km:+r.km||v.km||0,queixa:r.queixa||'',servicos:[],pecas:[],desc:0,pago:false,obs:''};
      S.os.push(nova); S.ui.rascunho=null; S.ui.osAberta=nova.id; S.ui.abaOS='servicos';
      abrirFolha(folhaOS); render(); torrar(`OS ${nova.num} aberta no ${B(r.box).nome}`); break;
    }
    case 'copiar-orc': copiar(textoOrcamento(o)); torrar('Orçamento copiado — cola no WhatsApp'); break;
    case 'excluir-os': pedirConfirmacao('os'+o.id,'Toque de novo para excluir a OS',()=>{ S.os=S.os.filter(x=>x.id!==o.id); fecharFolha(); render(); torrar('OS excluída'); }); break;

    /* --- estoque --- */
    case 'ver-peca': S.ui.pecaAberta=b.dataset.id; abrirFolha(folhaPeca); break;
    case 'mov-peca': { const p=P(S.ui.pecaAberta); p.qtd=Math.max(0,p.qtd+ +b.dataset.d); renderFolha(); render(); break; }
    case 'excluir-peca': pedirConfirmacao('pc','Toque de novo para excluir a peça',()=>{ S.pecas=S.pecas.filter(x=>x.id!==S.ui.pecaAberta); fecharFolha(); render(); }); break;
    case 'nova-peca': S.ui.rascPeca=null; abrirFolha(folhaNovaPeca); break;
    case 'salvar-peca': {
      const r=S.ui.rascPeca||{};
      if(!r.nome){ torrar('Faltou a descrição da peça'); break; }
      S.pecas.push({id:uid('p'),cod:r.cod||('MAN-'+Math.floor(Math.random()*9e3+1e3)),nome:r.nome,un:r.un||'un',
        qtd:+r.qtd||0,min:+r.min||1,custo:+r.custo||0,venda:+r.venda||0,loc:r.loc||'—',forn:r.forn||'—'});
      S.ui.rascPeca=null; fecharFolha(); render(); torrar('Peça cadastrada'); break;
    }
    case 'importar-xml': S.ui.nota=null; abrirFolha(folhaXML); break;
    case 'confirmar-xml': confirmarXML(); break;

    /* --- financeiro --- */
    case 'aba-fin': S.ui.abaFin=b.dataset.k; render(); break;
    case 'baixar': { const c=S.contas.find(x=>x.id===b.dataset.id); baixarConta(c); render(); torrar(`${c.tipo==='receber'?'Recebido':'Pago'} · ${brl(c.valor)}`); break; }
    case 'nova-conta': S.ui.contaTipo=b.dataset.t; S.ui.rascConta=null; abrirFolha(folhaConta); break;
    case 'salvar-conta': {
      const r=S.ui.rascConta||{};
      if(!r.desc||!+r.valor){ torrar('Descrição e valor, por favor'); break; }
      S.contas.push({id:uid('ct'),tipo:S.ui.contaTipo,desc:r.desc,parte:r.parte||'—',valor:+r.valor,venc:r.venc||hoje(),pago:false,cat:r.cat||'Outros',doc:''});
      S.ui.rascConta=null; fecharFolha(); render(); torrar('Título lançado'); break;
    }
    case 'novo-mov': S.ui.rascMov=null; abrirFolha(folhaMov); break;
    case 'salvar-mov': {
      const r=S.ui.rascMov||{};
      if(!r.desc||!+r.valor){ torrar('Descrição e valor, por favor'); break; }
      S.movimentos.push({id:uid('mv'),data:r.data||hoje(),tipo:r.tipo||'entrada',desc:r.desc,valor:+r.valor,cat:r.cat||'Outros',conc:false});
      S.ui.rascMov=null; fecharFolha(); render(); torrar('Caixa movimentado'); break;
    }
    case 'conciliar': {
      const l=S.extrato.find(x=>x.id===b.dataset.id), c=S.contas.find(x=>x.id===b.dataset.c);
      baixarConta(c,l.data); l.ok=true; render(); torrar('Conciliado com '+c.desc); break;
    }
    case 'conciliar-avulso': {
      const l=S.extrato.find(x=>x.id===b.dataset.id);
      S.movimentos.push({id:uid('mv'),data:l.data,tipo:l.valor>=0?'entrada':'saida',desc:l.desc,valor:Math.abs(l.valor),cat:'Outros',conc:true});
      l.ok=true; render(); torrar('Lançado no caixa'); break;
    }
    case 'limpar-extrato': S.extrato=[]; render(); break;

    /* --- whatsapp --- */
    case 'aba-zap': S.ui.abaZap=b.dataset.k; render(); break;
    case 'enviar-cob': {
      const f=acharNaFila(b.dataset.k); if(!f) break;
      setTimeout(()=>{ registrarEnvio({chave:f.chave,tipo:'cobranca',rotulo:f.regra.nome,cliente:f.conta.parte,
        fone:f.cli?f.cli.fone:'',valor:f.conta.valor,texto:f.texto,status:'enviado'}); render(); torrar('Cobrança registrada no histórico'); },600);
      break;
    }
    case 'copiar-cob': { const f=acharNaFila(b.dataset.k); if(f){ copiar(f.texto); torrar('Mensagem copiada'); } break; }
    case 'pular-cob': {
      const f=acharNaFila(b.dataset.k); if(!f) break;
      registrarEnvio({chave:f.chave,tipo:'cobranca',rotulo:f.regra.nome,cliente:f.conta.parte,fone:'',valor:f.conta.valor,texto:f.texto,status:'pulado'});
      render(); torrar('Etapa pulada'); break;
    }
    case 'cobrar-titulo': {
      const c=S.contas.find(x=>x.id===b.dataset.id), cl=cliZap(c);
      setTimeout(()=>{ registrarEnvio({chave:'avulso_'+c.id+'_'+Date.now(),tipo:'cobranca',rotulo:'Cobrança avulsa',
        cliente:c.parte,fone:cl?cl.fone:'',valor:c.valor,texto:preencher(textoCobrancaRapida(),ctxCobranca(c,cl)),status:'enviado'}); render(); },600);
      break;
    }
    case 'copiar-var': copiar(b.dataset.v); torrar(b.dataset.v+' copiado'); break;
    case 'copiar-camp': copiar(S.ui.camp.texto); torrar('Mensagem copiada'); break;
    case 'copiar-numeros': {
      const nums=destinatarios(S.ui.camp.seg).map(c=>'+'+foneZap(c.fone)).join('\n');
      copiar(nums); torrar(`${destinatarios(S.ui.camp.seg).length} números copiados`); break;
    }
    case 'disparar-camp': {
      const c=S.ui.camp, lista=destinatarios(c.seg);
      if(!lista.length){ torrar('Esse segmento não tem ninguém'); break; }
      if(!c.texto.trim()){ torrar('Escreve a mensagem primeiro'); break; }
      S.ui.disparo={nome:c.nome||'Campanha sem nome',seg:c.seg,texto:c.texto,lista,ix:0,enviados:0};
      abrirFolha(folhaDisparo); break;
    }
    case 'disparo-enviar': {
      const d=S.ui.disparo, cli=d.lista[d.ix];
      setTimeout(()=>{
        registrarEnvio({chave:'camp_'+cli.id+'_'+Date.now(),tipo:'campanha',rotulo:d.nome,cliente:cli.nome,
          fone:cli.fone,texto:preencher(d.texto,ctxCliente(cli)),status:'enviado'});
        d.enviados++; d.ix++; renderFolha();
      },600);
      break;
    }
    case 'disparo-pular': S.ui.disparo.ix++; renderFolha(); break;
    case 'fechar-disparo': {
      const d=S.ui.disparo;
      if(d&&d.enviados) S.zap.campanhas.push({id:uid('cp'),nome:d.nome,seg:d.seg,data:hoje(),enviados:d.enviados});
      S.ui.disparo=null; fecharFolha(); render();
      if(d&&d.enviados) torrar(`${d.enviados} mensagens registradas`);
      break;
    }
    case 'liga-zap': S.zap.ativo=!S.zap.ativo; render(); break;
    case 'liga-uteis': S.zap.soUteis=!S.zap.soUteis; render(); break;
    case 'liga-regra': { const r=S.zap.regua.find(x=>x.id===b.dataset.i); r.ativo=!r.ativo; render(); break; }
    case 'liga-optin': { const c=C(S.ui.cliAberto); c.optin=c.optin===false; renderFolha(); salvar(); break; }
    case 'rm-regra': S.zap.regua=S.zap.regua.filter(x=>x.id!==b.dataset.i); render(); break;
    case 'add-regra': S.zap.regua.push({id:uid('r'),quando:5,ativo:false,nome:'Nova etapa',
      texto:'{contato}, sobre o título de {valor} vencido em {venc}: consegue me dar uma posição?'}); render(); break;
    case 'ver-api': abrirFolha(folhaAPI); break;
    case 'copiar-payload': copiar(document.querySelector('#folha code').textContent); torrar('Exemplo copiado'); break;
    case 'limpar-hist': pedirConfirmacao('hist','Toque de novo para apagar o histórico',()=>{ S.zap.envios=[]; render(); }); break;

    /* --- cadastros --- */
    case 'aba-cad': S.ui.abaCad=b.dataset.k; render(); break;
    case 'ver-cliente': S.ui.cliAberto=b.dataset.id; abrirFolha(folhaCliente); break;
    case 'novo-cad': S.ui.cadTipo=b.dataset.t; S.ui.rascCad=(b.dataset.t==='veiculo'?{cli:S.clientes[0].id}:{}); abrirFolha(folhaCadastro); break;
    case 'editar-cliente': S.ui.cadTipo='cliente'; S.ui.rascCad=JSON.parse(JSON.stringify(S.clientes.find(x=>x.id===b.dataset.id))); abrirFolha(folhaCadastro); break;
    case 'excluir-cliente':
      pedirConfirmacao('excli'+b.dataset.id, 'Toque de novo para excluir este cliente', () => {
        S.clientes = S.clientes.filter(x => x.id !== b.dataset.id); render(); torrar('Cliente excluído');
      }); break;
    case 'bloquear-cliente': {
      const cl = S.clientes.find(x => x.id === b.dataset.id);
      if(cl) { cl.bloqueado = !cl.bloqueado; render(); torrar(cl.bloqueado ? 'Cliente bloqueado' : 'Cliente desbloqueado'); }
      break;
    }
    case 'salvar-cad': {
      const r=S.ui.rascCad||{}, t=S.ui.cadTipo;
      if(t==='cliente'){ 
        if(!r.nome){torrar('Falta a razão social ou nome');break;}
        if(r.id) {
          const idx = S.clientes.findIndex(x=>x.id===r.id);
          if(idx>=0) {
            S.clientes[idx] = {...S.clientes[idx], ...r};
            // Se o nome/razão social foi alterado, seria bom varrer e alterar `parte` nas contas para não quebrar o link
          }
        } else {
          S.clientes.push({
            id:uid('cli'),
            nome:r.nome,
            fantasia:r.fantasia||'',
            doc:r.doc||'',
            fone:r.fone||'',
            email:r.email||'',
            contato:r.contato||'',
            prazo:+r.prazo||0,
            ie:r.ie||'',
            cep:r.cep||'',
            endereco:r.endereco||'',
            numero:r.numero||'',
            complemento:r.complemento||'',
            bairro:r.bairro||'',
            cidade:r.cidade||'',
            uf:r.uf||'',
            optin:true
          });
        }
      }
      if(t==='veiculo'){ if(!r.placa){torrar('Falta a placa');break;} S.veiculos.push({id:uid('v'),cli:r.cli||S.clientes[0].id,placa:(r.placa||'').toUpperCase(),modelo:r.modelo||'',ano:r.ano||'',km:+r.km||0,tipo:r.tipo||'Cavalo'}); }
      if(t==='servico'){ if(!r.nome){torrar('Falta a descrição');break;} S.servicos.push({id:uid('s'),nome:r.nome,valor:+r.valor||0,horas:+r.horas||1}); }
      if(t==='box'){ if(!r.nome){torrar('Falta o nome');break;} S.boxes.push({id:uid('b'),nome:r.nome,tipo:r.tipo||'Geral'}); }
      S.ui.rascCad=null; fecharFolha(); render(); torrar('Cadastrado'); break;
    }
    case 'zerar': pedirConfirmacao('zerar','Toque de novo para restaurar a demonstração',()=>{ S=sementes(); render(); torrar('Dados de demonstração restaurados'); }); break;
  }
});
document.getElementById('vidro').addEventListener('click',fecharFolha);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&folhaAtual) fecharFolha(); });

/* --- digitação --- */
document.addEventListener('input',e=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  const a=el.dataset.act, c=el.dataset.c, v=el.value, o=OSatual();
  const guarda=(obj)=>{ obj[c]=v; };
  if(a==='busca-picker'||a==='busca-geral'||a==='busca-placa-patio'){ if(a==='busca-placa-patio') { S.ui.buscaPlaca=v; render(); } else { S.ui.busca=v; a==='busca-picker'?renderFolha():render(); } focoBusca(); return; }
  if(a==='rasc') { 
     guarda(S.ui.rascunho=S.ui.rascunho||{}); 
     if(c==='cli'){ S.ui.rascunho.vei=''; renderFolha(); } 
     if(c==='vei' && v==='novo') { 
        S.ui.rascunho.vei=''; 
        abrirFolha(() => folhaNovoVeiculo(S.ui.rascunho.cli));
     }
  }
  if(a==='rasc-vei') {
     const rv = S.ui.rascVeiculo=S.ui.rascVeiculo||{};
     rv[c]=v;
     if(c==='marca') { rv.modelo=''; renderFolha(); }
  }
  if(a==='rp') guarda(S.ui.rascPeca=S.ui.rascPeca||{});
  if(a==='rc') guarda(S.ui.rascCad=S.ui.rascCad||{});
  if(a==='rct') guarda(S.ui.rascConta=S.ui.rascConta||{});
  if(a==='rmv') guarda(S.ui.rascMov=S.ui.rascMov||{});
  if(a==='cfg'){ S.cfg[c]=c==='saldoInicial'?(+v||0):v; salvar(); }
  if(a==='cfg-apibrasil') { (S.cfg.apibrasil = S.cfg.apibrasil || {})[c] = v; salvar(); }
  if(a==='camp'){ (S.ui.camp=S.ui.camp||{})[c]=v; salvar(); }
  if(a==='zap-cfg'){ S.zap[c]=v; salvar(); }
  if(a==='api-cfg'){ S.zap.api=S.zap.api||{}; S.zap.api[c]=v; salvar(); }
  if(a==='regra'){ const r=S.zap.regua.find(x=>x.id===el.dataset.i); if(r) r[c]=c==='quando'?(+v||0):v; salvar(); }
  if(a==='campo-cli'){ const cl=C(S.ui.cliAberto); cl[c]=+v||0; salvar(); }
  if(a==='campo-peca'){ const p=P(S.ui.pecaAberta); p[c]=['min','custo','venda'].includes(c)?(+v||0):v; salvar(); }
  if(a==='campo-os'&&o){ o[c]=['km','desc'].includes(c)?(+v||0):v; salvar(); }
  if(a==='val-item'&&o){ const i=o[el.dataset.t].find(x=>x.id===el.dataset.i); if(i) i.valor=+v||0; salvar(); }
});
document.addEventListener('change',e=>{
  const el=e.target.closest('[data-act]'); if(!el) return;
  const a=el.dataset.act, o=OSatual();
  if(a==='campo-os'&&o){ renderFolha(); render(); }
  if(a==='val-item'&&o){ renderFolha(); render(); }
  if(a==='campo-peca'||a==='cfg'||a==='campo-cli'){ render(); if(a!=='cfg') renderFolha(); }
  if(a==='camp'&&el.dataset.c==='seg'){ render(); }
  if(a==='camp-modelo'){ const m=S.zap.modelos[+el.value]; if(m){ S.ui.camp=S.ui.camp||{}; S.ui.camp.texto=m.texto; if(!S.ui.camp.nome) S.ui.camp.nome=m.nome; render(); } }
  if(a==='regra'&&el.dataset.c==='quando'){ render(); }
  if(a==='arquivo-xml'){ lerArquivos(el.files,'xml'); }
  if(a==='arquivo-extrato'){ lerArquivos(el.files,'extrato'); }
});
function lerArquivos(files,tipo){
  if(!files||!files.length) return;
  const arr=[...files]; let pendentes=arr.length; const acumulado=[];
  arr.forEach(f=>{
    lerTexto(f,texto=>{
      try{
        if(tipo==='xml'){ acumulado.push(lerXML(texto)); }
        else { acumulado.push(...lerExtrato(texto)); }
      }catch(err){ torrar('Não consegui ler '+f.name); }
      if(--pendentes===0) finalizarLeitura(tipo,acumulado);
    },()=>{ torrar('Falha ao abrir '+f.name); if(--pendentes===0) finalizarLeitura(tipo,acumulado); });
  });
}
/* NF-e vem em UTF-8, OFX de banco brasileiro costuma vir em ISO-8859-1 — testa os dois */
function lerTexto(f,ok,erro){
  const fr=new FileReader();
  fr.onload=()=>{
    if(/\uFFFD/.test(fr.result)){
      const fr2=new FileReader();
      fr2.onload=()=>ok(fr2.result); fr2.onerror=erro;
      fr2.readAsText(f,'ISO-8859-1');
    }else ok(fr.result);
  };
  fr.onerror=erro;
  fr.readAsText(f,'UTF-8');
}
function finalizarLeitura(tipo,dados){
  if(tipo==='xml'){
    if(!dados.length){ torrar('Nenhuma NF-e válida no arquivo'); return; }
    if(dados.length===1){ S.ui.nota=dados[0]; renderFolha(); }
    else{ // vários XMLs: lança todos de uma vez
      dados.forEach(n=>{ S.ui.nota=n; confirmarXML(); });
      torrar(`${dados.length} notas lançadas no estoque`);
    }
  }else{
    if(!dados.length){ torrar('Não achei lançamentos nesse arquivo'); return; }
    S.extrato=(S.extrato||[]).concat(dados);
    S.ui.abaFin='banco'; render();
    torrar(`${dados.length} lançamentos importados`);
  }
}

/* =====================================================================
   BOOT
===================================================================== */
(async function(){
  const salvo=await armazem.ler();
  S=salvo&&salvo.os? salvo : sementes();
  if(!S.v2_financeiro) {
    const s = sementes();
    S.contas = s.contas;
    S.movimentos = s.movimentos;
    S.v2_financeiro = true;
  }
  S.ui=Object.assign({view:'patio',filtro:'todos',abaFin:'dashboard',filtroFin:'tudo',abaOS:'servicos',abaCad:'clientes',abaZap:'cobranca',busca:''},S.ui||{});
  S.extrato=S.extrato||[]; S.nfsRecebidas=S.nfsRecebidas||[]; S.compras=S.compras||[];
  if(!S.zap||!S.zap.regua) S.zap=zapPadrao();
  S.zap.envios=S.zap.envios||[]; S.zap.campanhas=S.zap.campanhas||[]; S.zap.modelos=S.zap.modelos||zapPadrao().modelos;
  S.clientes.forEach(c=>{ if(c.optin===undefined) c.optin=true; });
  render();
})();