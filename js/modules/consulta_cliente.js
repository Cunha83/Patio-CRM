/* =====================================================================
   PÁTIO CRM — CONSULTA INTEGRADA DE CLIENTES (SINTEGRA & SERASA)
===================================================================== */

let _docConsultaPendente = '';
let _ultimoDocConsultado = '';

function verificarAutoConsultaCnpj(val) {
  if (!val) return;
  const digitos = String(val).replace(/\D/g, '');
  if (digitos.length === 14 && digitos !== _ultimoDocConsultado) {
    _ultimoDocConsultado = digitos;
    abrirModalConsultaCliente(val);
  }
}

function abrirModalConsultaCliente(doc) {
  const val = String(doc || (document.getElementById('doc_cli') && document.getElementById('doc_cli').value) || '').trim();
  const digitos = val.replace(/\D/g, '');
  if (!digitos || (digitos.length !== 11 && digitos.length !== 14)) {
    if (typeof torrar === 'function') {
      torrar('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) para consulta.', 'alerta');
    }
    return;
  }

  _docConsultaPendente = digitos;
  const tipoDoc = digitos.length === 14 ? 'CNPJ' : 'CPF';
  const docFmt = digitos.length === 14
    ? digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

  let modalEl = document.getElementById('modal-consulta-cliente') || document.getElementById('modal-dialog-serasa');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'modal-consulta-cliente';
    modalEl.className = 'modal-consulta-cliente modal-dialog-serasa';
    modalEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div style="background:#ffffff;color:#0f172a;border-radius:12px;max-width:440px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);padding:24px;border:1px solid #e2e8f0;animation:fadeIn 0.15s ease">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:42px;height:42px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:22px">🔍</div>
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a">Consulta de Cliente</h3>
          <div style="font-size:12px;color:#64748b">${tipoDoc}: <b>${docFmt}</b></div>
        </div>
      </div>

      <div style="margin-bottom:20px;font-size:14px;color:#334155;line-height:1.5">
        <p style="margin:0 0 8px 0;font-weight:700;color:#0f172a;font-size:15px">Deseja consultar também junto ao SERASA?</p>
        <p style="margin:0;font-size:13px;color:#64748b">
          Caso selecione <b>Sim</b>, o sistema consultará o score de crédito e restrições financeiras além dos dados fiscais do Sintegra. Caso selecione <b>Não</b>, puxará apenas a Inscrição Estadual, razão social e endereço.
        </p>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <button type="button" id="btn-modal-serasa-sim" class="btn btn-primario" onclick="confirmarConsultaCliente(true)" style="height:40px;justify-content:center;font-weight:600;font-size:13px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer">
          Sim, consultar também junto ao SERASA
        </button>
        <button type="button" id="btn-modal-serasa-nao" class="btn btn-secundario" onclick="confirmarConsultaCliente(false)" style="height:40px;justify-content:center;font-weight:600;font-size:13px;background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer">
          Não, consultar apenas Sintegra
        </button>
        <button type="button" class="btn btn-neutro" onclick="fecharModalConsultaCliente()" style="height:32px;justify-content:center;font-size:12px;background:transparent;color:#94a3b8;border:none;cursor:pointer">
          Cancelar
        </button>
      </div>
    </div>
  `;
  modalEl.style.display = 'flex';
}

function fecharModalConsultaCliente() {
  const modalEl = document.getElementById('modal-consulta-cliente') || document.getElementById('modal-dialog-serasa');
  if (modalEl) modalEl.style.display = 'none';
  _docConsultaPendente = '';
}

async function confirmarConsultaCliente(incluirSerasa) {
  const doc = _docConsultaPendente;
  fecharModalConsultaCliente();
  if (!doc) return;
  await executarConsultaCliente(doc, incluirSerasa);
}

async function executarConsultaCliente(doc, incluirSerasa) {
  if (typeof torrar === 'function') {
    torrar(incluirSerasa ? 'Consultando Sintegra + SERASA...' : 'Consultando Sintegra...', 'neutro');
  }

  const tagEl = document.getElementById('tag_serasa');
  if (tagEl && incluirSerasa) {
    tagEl.textContent = 'Consultando Serasa...';
    tagEl.style.background = 'var(--aco-200)';
    tagEl.style.color = 'inherit';
  }

  try {
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : {
          'Content-Type': 'application/json',
          'x-tenant-id': (typeof window !== 'undefined' && (window.__PATIO_TENANT_ID || window.sessionStorage?.getItem('patio_tenant'))) || 'default'
        };

    const res = await fetch('/api/integracoes/consulta-cliente', {
      method: 'POST',
      headers,
      body: JSON.stringify({ doc, incluirSerasa })
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      if (body.disponivel === false || body.codigo === 'INTEGRACAO_NAO_CONFIGURADA') {
        if (tagEl) {
          tagEl.textContent = 'Consulta externa não configurada';
          tagEl.style.background = 'var(--aco-150)';
          tagEl.style.color = 'var(--aco-600)';
        }
        const inpStatus = document.getElementById('consulta_serasa_status');
        if (inpStatus) inpStatus.value = 'Não configurado (Manual)';
        if (typeof torrar === 'function') {
          torrar(body.mensagem || 'Consulta externa indisponível. Campos liberados para preenchimento manual.', 'alerta');
        }
        return;
      }
      if (typeof torrar === 'function') {
        torrar(body.error || body.erro || 'Não foi possível consultar os dados externos. Preencha manualmente.', 'erro');
      }
      return;
    }

    const d = body.dados;
    if (!d) return;

    if (typeof S !== 'undefined') {
      S.ui = S.ui || {};
      S.ui.rascCad = S.ui.rascCad || {};
      S.ui.rascCad.doc = d.doc || d.cnpj || d.cpf || doc;
      S.ui.rascCad.nome = d.nome || '';
      S.ui.rascCad.fantasia = d.fantasia || '';
      S.ui.rascCad.ie = d.ie || '';
      S.ui.rascCad.cep = d.cep || '';
      S.ui.rascCad.endereco = d.endereco || '';
      S.ui.rascCad.bairro = d.bairro || '';
      S.ui.rascCad.cidade = d.cidade || '';
      S.ui.rascCad.uf = d.uf || '';
      S.ui.rascCad.fone = d.fone || '';
      if (d.scoreSerasa !== null && d.scoreSerasa !== undefined) {
        S.ui.rascCad.scoreSerasa = d.scoreSerasa;
        S.ui.rascCad.situacaoSerasa = d.situacaoSerasa;
        S.ui.rascCad.consultaSerasaRealizada = Boolean(d.consultaSerasaRealizada);
      }
    }

    // Preenchimento automático nos inputs do DOM
    const camposMap = {
      doc: d.doc || d.cnpj || d.cpf || doc,
      nome: d.nome || '',
      fantasia: d.fantasia || '',
      ie: d.ie || '',
      cep: d.cep || '',
      endereco: d.endereco || '',
      bairro: d.bairro || '',
      cidade: d.cidade || '',
      uf: d.uf || '',
      fone: d.fone || ''
    };

    for (const [k, val] of Object.entries(camposMap)) {
      const el = document.querySelector(`input[data-act="rc"][data-c="${k}"]`);
      if (el) el.value = val;
    }

    const inpDoc = document.getElementById('doc_cli');
    if (inpDoc && camposMap.doc) inpDoc.value = camposMap.doc;

    const inpCep = document.getElementById('cep_cli');
    if (inpCep && camposMap.cep) inpCep.value = camposMap.cep;

    if (tagEl) {
      if (d.scoreSerasa) {
        tagEl.textContent = `Score Serasa: ${d.scoreSerasa} (${d.scoreSerasa >= 700 ? '✔️ Alto' : d.scoreSerasa >= 500 ? '⚠️ Regular' : '❌ Baixo'})`;
        tagEl.style.background = d.scoreSerasa >= 500 ? 'var(--verde)' : 'var(--tijolo)';
        tagEl.style.color = '#fff';
      } else {
        tagEl.textContent = d.consultaSerasaRealizada ? 'Score: Não retornado' : 'Serasa não consultado';
        tagEl.style.background = 'var(--aco-200)';
        tagEl.style.color = 'inherit';
      }
    }

    const inpScore = document.getElementById('score_serasa_input');
    if (inpScore && d.scoreSerasa !== undefined && d.scoreSerasa !== null) {
      inpScore.value = d.scoreSerasa;
    }
    const inpSit = document.getElementById('situacao_serasa_input');
    if (inpSit && d.situacaoSerasa) {
      inpSit.value = d.situacaoSerasa;
    }
    const inpStatus = document.getElementById('consulta_serasa_status');
    if (inpStatus) {
      inpStatus.value = d.consultaSerasaRealizada ? 'Sim (Verificado)' : (d.scoreSerasa ? 'Manual' : 'Pendente');
    }

    if (typeof torrar === 'function') {
      const msg = incluirSerasa
        ? `Dados carregados com sucesso! Score Serasa: ${d.scoreSerasa || '—'}`
        : 'Dados cadastrais e Sintegra importados com sucesso!';
      torrar(msg, 'sucesso');
    }
  } catch (err) {
    console.error('Erro ao executar consulta cliente:', err);
    if (typeof torrar === 'function') {
      torrar('Erro ao conectar com serviço de consulta.', 'erro');
    }
  }
}

if (typeof window !== 'undefined') {
  window.abrirModalConsultaCliente = abrirModalConsultaCliente;
  window.fecharModalConsultaCliente = fecharModalConsultaCliente;
  window.confirmarConsultaCliente = confirmarConsultaCliente;
  window.executarConsultaCliente = executarConsultaCliente;
  window.verificarAutoConsultaCnpj = verificarAutoConsultaCnpj;
}
