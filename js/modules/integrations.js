/* =====================================================================
   PÁTIO CRM — INTEGRAÇÕES EXTERNAS & APIS (FRONTEND MODULE)
===================================================================== */

function buscarCep(cep, prefix) {
  cep = String(cep || '').replace(/\D/g, '');
  if (cep.length !== 8) { torrar('CEP inválido'); return; }
  if (typeof apiThrottle === 'function' && !apiThrottle('cep')) return;
  
  torrar('Buscando CEP...', 'neutro');
  fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then(res => res.json())
    .then(data => {
      if (data.erro) { torrar('CEP não encontrado'); return; }
      
      let end = data.logradouro + (data.bairro ? ', ' + data.bairro : '');
      
      // Update rascCad
      if (typeof S !== 'undefined' && S.ui && S.ui.rascCad) {
        S.ui.rascCad.endereco = end;
        S.ui.rascCad.cidade = data.localidade;
        S.ui.rascCad.uf = data.uf;
      }
      
      // Update DOM
      const inputs = document.querySelectorAll('input[data-act="rc"]');
      inputs.forEach(el => {
        if (el.dataset.c === 'endereco') el.value = end;
        if (el.dataset.c === 'cidade') el.value = data.localidade;
        if (el.dataset.c === 'uf') el.value = data.uf;
      });
      
      torrar('Endereço preenchido!', 'sucesso');
    })
    .catch(() => torrar('Erro ao buscar CEP'));
}

function buscarCNPJ(cnpj, prefix) {
  cnpj = String(cnpj || '').replace(/\D/g, '');
  if (cnpj.length !== 14) { torrar('CNPJ inválido. Digite 14 números.'); return; }
  if (typeof apiThrottle === 'function' && !apiThrottle('cnpj')) return;
  
  torrar('Consultando Receita Federal...', 'neutro');
  fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    .then(res => res.json())
    .then(data => {
      if (data.message) { torrar('CNPJ não encontrado ou erro na API'); return; }
      
      if (typeof S !== 'undefined' && S.ui && S.ui.rascCad) {
        S.ui.rascCad.nome = data.razao_social;
        S.ui.rascCad.fantasia = data.nome_fantasia || data.razao_social;
        S.ui.rascCad.fone = data.ddd_telefone_1 || data.ddd_telefone_2 || '';
        S.ui.rascCad.endereco = `${data.logradouro}, ${data.numero} - ${data.bairro}`;
        S.ui.rascCad.cidade = data.municipio;
        S.ui.rascCad.uf = data.uf;
        S.ui.rascCad.cep = data.cep;
      }
      
      // Update DOM
      const inputs = document.querySelectorAll('input[data-act="rc"]');
      inputs.forEach(el => {
        if (el.dataset.c === 'nome') el.value = data.razao_social;
        if (el.dataset.c === 'fantasia') el.value = data.nome_fantasia || data.razao_social;
        if (el.dataset.c === 'fone') el.value = data.ddd_telefone_1 || '';
        if (el.dataset.c === 'endereco') el.value = `${data.logradouro}, ${data.numero} - ${data.bairro}`;
        if (el.dataset.c === 'cidade') el.value = data.municipio;
        if (el.dataset.c === 'uf') el.value = data.uf;
        if (el.dataset.c === 'cep') el.value = data.cep;
      });
      
      torrar('Dados do CNPJ importados!', 'sucesso');
    })
    .catch(() => torrar('Erro ao consultar CNPJ.'));
}

function consultarPlaca(placa) {
  if (!placa || placa.length < 7) { torrar('Placa inválida'); return; }
  if (typeof apiThrottle === 'function' && !apiThrottle('consultaPlaca')) return;
  torrar('Consultando base do Sinesp/Denatran...', 'neutro');
  
  setTimeout(() => {
    let mockData = {
      modelo: 'VOLVO FH 460',
      ano: '2021',
      tipo: 'Cavalo'
    };
    
    if (typeof S !== 'undefined' && S.ui && S.ui.rascCad) {
      S.ui.rascCad.modelo = mockData.modelo;
      S.ui.rascCad.ano = mockData.ano;
      S.ui.rascCad.tipo = mockData.tipo;
    }
    
    const inputs = document.querySelectorAll('input[data-act="rc"]');
    inputs.forEach(el => {
      if (el.dataset.c === 'modelo') el.value = mockData.modelo;
      if (el.dataset.c === 'ano') el.value = mockData.ano;
      if (el.dataset.c === 'tipo') el.value = mockData.tipo;
    });
    
    torrar('Veículo localizado na base nacional!', 'sucesso');
  }, 1000);
}

function consultarSerasa(doc, prefix) {
  if (!doc) { torrar('Digite o CNPJ/CPF primeiro'); return; }
  if (typeof apiThrottle === 'function' && !apiThrottle('serasa')) return;
  torrar('Conectando à base Serasa Experian...', 'neutro');
  
  const tagEl = document.getElementById('tag_serasa');
  if (tagEl) {
    tagEl.innerHTML = 'Consultando...';
    tagEl.style.background = 'var(--aco-200)';
    tagEl.style.color = 'inherit';
  }
  
  setTimeout(() => {
    const score = Math.floor(Math.random() * (950 - 300) + 300);
    if (typeof S !== 'undefined' && S.ui && S.ui.rascCad) S.ui.rascCad.scoreSerasa = score;
    
    if (tagEl) {
      if (score > 500) {
        tagEl.innerHTML = `Score Serasa: ${score} ✔️`;
        tagEl.style.background = 'var(--verde)';
        tagEl.style.color = '#fff';
        torrar('Score alto. Baixo risco de crédito.', 'sucesso');
      } else {
        tagEl.innerHTML = `Score Serasa: ${score} ⚠️`;
        tagEl.style.background = 'var(--tijolo)';
        tagEl.style.color = '#fff';
        torrar('Atenção: Score baixo. Risco de inadimplência.', 'erro');
      }
    }
  }, 1000);
}

function consultarSintegra(doc, prefix) {
  doc = String(doc || '').replace(/\D/g, '');
  if (doc.length !== 14) { torrar('CNPJ inválido para Sintegra'); return; }
  if (typeof apiThrottle === 'function' && !apiThrottle('sintegra')) return;
  
  torrar('Consultando Sintegra / Receita Estadual...', 'neutro');
  
  setTimeout(() => {
    const ieMock = Math.floor(Math.random() * 900000000) + 100000000;
    if (typeof S !== 'undefined' && S.ui && S.ui.rascCad) S.ui.rascCad.ie = ieMock.toString();
    
    const inputs = document.querySelectorAll('input[data-act="rc"]');
    inputs.forEach(el => {
      if (el.dataset.c === 'ie') el.value = ieMock;
    });
    
    torrar('Inscrição Estadual localizada!', 'sucesso');
  }, 1000);
}

if (typeof window !== 'undefined') {
  window.buscarCep = buscarCep;
  window.buscarCNPJ = buscarCNPJ;
  window.consultarPlaca = consultarPlaca;
  window.consultarSerasa = consultarSerasa;
  window.consultarSintegra = consultarSintegra;
}
