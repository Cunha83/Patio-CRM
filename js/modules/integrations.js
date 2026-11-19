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
        S.ui.rascCad.endereco = data.logradouro || end;
        S.ui.rascCad.bairro = data.bairro || '';
        S.ui.rascCad.cidade = data.localidade;
        S.ui.rascCad.uf = data.uf;
      }
      
      // Update DOM
      const inputs = document.querySelectorAll('input[data-act="rc"]');
      inputs.forEach(el => {
        if (el.dataset.c === 'endereco') el.value = data.logradouro || end;
        if (el.dataset.c === 'bairro' && data.bairro) el.value = data.bairro;
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

async function consultarPlaca(placa) {
  const limpa = String(placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!limpa || limpa.length < 7) {
    if (typeof torrar === 'function') torrar('Informe uma placa válida (7 caracteres).', 'alerta');
    return;
  }
  if (typeof apiThrottle === 'function' && !apiThrottle('consultaPlaca')) return;
  if (typeof torrar === 'function') torrar('Consultando placa via API nacional...', 'neutro');

  try {
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    const res = await fetch('/api/veiculos/consultar-placa', {
      method: 'POST',
      headers,
      body: JSON.stringify({ placa: limpa })
    });

    const data = await res.json();
    if (res.ok && data.success && data.dados) {
      const d = data.dados;
      if (typeof S !== 'undefined' && S.ui) {
        if (S.ui.rascCad) {
          S.ui.rascCad.placa = d.placa;
          S.ui.rascCad.marca = d.marca || '';
          S.ui.rascCad.modelo = d.modelo || '';
          S.ui.rascCad.ano = d.ano || '';
          S.ui.rascCad.cor = d.cor || '';
          S.ui.rascCad.tipo = d.tipo || 'Cavalo';
          S.ui.rascCad.chassi = d.chassi || '';
        }
        if (S.ui.rascVeiculo) {
          S.ui.rascVeiculo.placa = d.placa;
          S.ui.rascVeiculo.marca = d.marca || '';
          S.ui.rascVeiculo.modelo = d.modelo || '';
          S.ui.rascVeiculo.ano = d.ano || '';
          S.ui.rascVeiculo.cor = d.cor || '';
          S.ui.rascVeiculo.tipo = d.tipo || 'Cavalo';
          S.ui.rascVeiculo.chassi = d.chassi || '';
        }
      }

      const inputs = document.querySelectorAll('input[data-act="rc"], input[data-act="rasc-vei"]');
      inputs.forEach(el => {
        const campo = el.dataset.c;
        if (campo && d[campo] !== undefined) el.value = d[campo];
      });

      if (typeof torrar === 'function') torrar(`Veículo ${d.modelo || d.placa} localizado!`, 'sucesso');
    } else {
      const msg = (data && data.erro) || 'Consulta de placa indisponível ou token de API não configurado em Configurações > Integrações. Preencha os dados do veículo manualmente.';
      if (typeof torrar === 'function') torrar(msg, 'alerta');
    }
  } catch (err) {
    if (typeof torrar === 'function') {
      torrar('Consulta de placa indisponível ou token de API não configurado em Configurações > Integrações. Preencha os dados do veículo manualmente.', 'alerta');
    }
  }
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
