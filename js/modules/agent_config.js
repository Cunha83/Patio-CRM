/* =====================================================================
   PÁTIO CRM — CONFIGURAÇÃO DO AGENTE INTELIGENTE & VOZ (FRONTEND MODULE)
===================================================================== */

function folhaConfigAssistente() {
  const cfg = (typeof S !== 'undefined' && S.cfg) || {};
  const ass = cfg.assistente || cfg.assistant || {
    displayName: 'Verônica',
    voiceGender: 'female',
    voiceURI: '',
    voiceName: '',
    pitch: 1.0,
    rate: 1.0,
    enabled: true
  };

  return `
  <div class="card card-p" style="max-width:580px;margin:0 auto;background:#182235;color:#fff;border-radius:12px;border:1px solid #334155;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
    <div class="entre" style="border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">🤖</span>
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0;color:#fff">Configuração do Agente Inteligente & Voz</h3>
          <div class="mini" style="color:#94a3b8">Personalize o nome, timbre de voz e saudações do agente operacional</div>
        </div>
      </div>
      <button class="btn-fechar" data-act="fechar" style="color:#fff">${ico('x', 20)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- 1. Nome do Agente -->
      <div>
        <label style="font-weight:700;display:block;margin-bottom:6px;font-size:13px;color:#f8fafc">Nome do Agente / Assistente Virtual:</label>
        <input type="text" id="modal-cfg-ass-nome" class="campo-texto" value="${esc(ass.displayName || 'Verônica')}" placeholder="Ex: Verônica, Sofia, Carlos, Atlas, Jarvis..." style="width:100%;height:38px;font-size:14px;font-weight:600;padding:0 12px;border-radius:6px;background:#0f172a;color:#fff;border:1px solid #475569">
        
        <!-- Sugestões rápidas de nomes -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="mini" style="color:#94a3b8;margin-right:2px">Sugestões rápidas:</span>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Verônica', 'female')">Verônica 👩</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Sofia', 'female')">Sofia 👩</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Bia', 'female')">Bia 👩</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Carlos', 'male')">Carlos 👨</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Atlas', 'male')">Atlas 👨</button>
          <button type="button" class="btn-chip" onclick="selecionarSugestaoNome('Jarvis', 'male')">Jarvis 👨</button>
        </div>
      </div>

      <!-- 2. Gênero da Voz -->
      <div>
        <label style="font-weight:700;display:block;margin-bottom:6px;font-size:13px;color:#f8fafc">Gênero da Voz (Síntese / Respostas Faladas):</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:8px;cursor:pointer;border:1px solid ${ass.voiceGender !== 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)'}" id="label-genero-female">
            <input type="radio" name="modal-cfg-ass-genero" value="female" ${ass.voiceGender !== 'male' ? 'checked' : ''} onchange="atualizarGeneroSelecionado('female')">
            <div>
              <div style="font-weight:700;font-size:13px">👩 Voz Feminina (Padrão)</div>
              <div class="mini" style="color:#94a3b8">Timbre natural e claro</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:8px;cursor:pointer;border:1px solid ${ass.voiceGender === 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)'}" id="label-genero-male">
            <input type="radio" name="modal-cfg-ass-genero" value="male" ${ass.voiceGender === 'male' ? 'checked' : ''} onchange="atualizarGeneroSelecionado('male')">
            <div>
              <div style="font-weight:700;font-size:13px">👨 Voz Masculina</div>
              <div class="mini" style="color:#94a3b8">Timbre grave e firme</div>
            </div>
          </label>
        </div>
      </div>

      <!-- 3. Seleção de Voz Instalada no Navegador / Sistema -->
      <div>
        <div class="entre" style="margin-bottom:6px">
          <label style="font-weight:700;font-size:13px;color:#f8fafc">Voz do Sistema Operacional / Navegador:</label>
          <span class="mini" style="color:#60a5fa" id="modal-voz-detectada-status">Detectando vozes...</span>
        </div>
        <select id="modal-cfg-ass-voz" class="campo-select" style="width:100%;height:38px;font-size:13px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:6px;padding:0 8px">
          <option value="">Carregando vozes disponíveis...</option>
        </select>
        <div class="mini" style="color:#94a3b8;margin-top:4px">
          💡 O Pátio CRM sincroniza com as vozes de alta resolução do seu Windows, Edge ou Chrome.
        </div>
      </div>

      <!-- 4. Ajuste Fino: Tom (Pitch) e Velocidade (Rate) -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px">
        <div style="font-weight:600;font-size:12px;margin-bottom:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px">
          <span>🎚️</span> Ajuste Fino de Tom e Velocidade
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div>
            <div class="entre mini" style="margin-bottom:4px;color:#cbd5e1">
              <span>Tom da Voz (Pitch):</span>
              <strong id="val-pitch">${ass.pitch || 1.0}x</strong>
            </div>
            <input type="range" id="modal-cfg-ass-pitch" min="0.7" max="1.4" step="0.05" value="${ass.pitch || 1.0}" style="width:100%" oninput="document.getElementById('val-pitch').textContent = Number(this.value).toFixed(2) + 'x'">
            <div class="entre mini" style="color:#64748b;font-size:10px">
              <span>Grave (0.7x)</span>
              <span>Agudo (1.4x)</span>
            </div>
          </div>
          <div>
            <div class="entre mini" style="margin-bottom:4px;color:#cbd5e1">
              <span>Velocidade de Fala:</span>
              <strong id="val-rate">${ass.rate || 1.0}x</strong>
            </div>
            <input type="range" id="modal-cfg-ass-rate" min="0.8" max="1.3" step="0.05" value="${ass.rate || 1.0}" style="width:100%" oninput="document.getElementById('val-rate').textContent = Number(this.value).toFixed(2) + 'x'">
            <div class="entre mini" style="color:#64748b;font-size:10px">
              <span>Lenta (0.8x)</span>
              <span>Rápida (1.3x)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Briefings Executivos Gerenciais -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px">
        <div style="font-weight:600;font-size:12px;margin-bottom:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px">
          <span>📊</span> Briefings Executivos para Gestores
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" id="modal-cfg-ass-briefing-diario" ${ass.briefingDiarioAtivo ? 'checked' : ''}>
              <span>Briefing Diário Matinal</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="mini" style="color:#94a3b8">Horário:</span>
              <input type="time" id="modal-cfg-ass-briefing-diario-horario" value="${ass.briefingDiarioHorario || '07:30'}" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
            </div>
          </div>
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" id="modal-cfg-ass-briefing-semanal" ${ass.briefingSemanalAtivo ? 'checked' : ''}>
              <span>Briefing Semanal Gerencial</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px">
              <select id="modal-cfg-ass-briefing-semanal-dia" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
                <option value="segunda" ${(ass.briefingSemanalDia || 'segunda') === 'segunda' ? 'selected' : ''}>Segunda-feira</option>
                <option value="sexta" ${(ass.briefingSemanalDia) === 'sexta' ? 'selected' : ''}>Sexta-feira</option>
                <option value="sabado" ${(ass.briefingSemanalDia) === 'sabado' ? 'selected' : ''}>Sábado</option>
              </select>
              <input type="time" id="modal-cfg-ass-briefing-semanal-horario" value="${ass.briefingSemanalHorario || '08:00'}" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Teste ao Vivo de Voz -->
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);padding:10px 14px;border-radius:8px">
        <div>
          <div style="font-weight:700;font-size:13px;color:#93c5fd">Testar Pronúncia & Áudio</div>
          <div class="mini" style="color:#cbd5e1" id="modal-teste-status">Clique para ouvir como o assistente falará na sua oficina.</div>
        </div>
        <button type="button" id="btn-modal-testar-voz" class="btn btn-neutro" style="background:#1e40af;color:#fff;border:none;font-weight:700;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;cursor:pointer" onclick="executarTesteModalVoz()">
          <span>▶️</span> Ouvir Saudação
        </button>
      </div>

      <!-- 7. Rodapé de Ações -->
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:14px">
        <button type="button" class="btn btn-neutro" data-act="fechar" style="background:rgba(255,255,255,0.1);color:#fff;border:none">Cancelar</button>
        <button type="button" class="btn btn-primario" style="background:#2563eb;color:#fff;font-weight:700;padding:8px 20px" onclick="salvarConfigAssistenteModal()">
          💾 Salvar Configurações
        </button>
      </div>
    </div>
  </div>
  `;
}

function abrirConfiguracoesAgente() {
  if (typeof abrirFolha === 'function') {
    abrirFolha(folhaConfigAssistente);
    setTimeout(() => {
      popularSelectVozesModal('modal-cfg-ass-voz');
    }, 20);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        popularSelectVozesModal('modal-cfg-ass-voz');
      };
    }
  } else if (typeof irParaView === 'function') {
    irParaView('configuracoes');
  }
}

function popularSelectVozesModal(selectId = 'modal-cfg-ass-voz') {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const voices = (typeof window !== 'undefined' && window.speechSynthesis)
    ? window.speechSynthesis.getVoices()
    : [];

  const assCfg = (typeof S !== 'undefined' && S?.cfg?.assistente) || {};
  const currentURI = assCfg.voiceURI || '';
  const currentName = assCfg.voiceName || '';

  sel.innerHTML = '';

  const optAuto = document.createElement('option');
  optAuto.value = '';
  optAuto.textContent = '✨ Seleção Automática Inteligente (padrão)';
  if (!currentURI && !currentName) optAuto.selected = true;
  sel.appendChild(optAuto);

  if (!voices || voices.length === 0) {
    const statusEl = document.getElementById('modal-voz-detectada-status');
    if (statusEl) statusEl.textContent = 'Usando voz nativa do navegador';
    return;
  }

  const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
  const femaleRegex = /female|feminin|mulher|luciana|maria|helena|vitoria|vitória|francisca|raquel|camila|brenda|thalita|elza|leticia|letícia|manuela|leide|fernanda|gabriela|juliana|carolina|ana|ines|inês|joana|catarina|clara|amalia|amália|yelda|helia|hélia|zira/i;

  const ptBrVoices = [];
  const ptOtherVoices = [];
  const otherVoices = [];

  voices.forEach(v => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    if (lang.startsWith('pt-br')) {
      ptBrVoices.push(v);
    } else if (lang.startsWith('pt')) {
      ptOtherVoices.push(v);
    } else {
      otherVoices.push(v);
    }
  });

  function adicionarGrupo(titulo, lista) {
    if (!lista || lista.length === 0) return;
    const grp = document.createElement('optgroup');
    grp.label = titulo;
    lista.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.name;
      opt.dataset.name = v.name;
      opt.dataset.uri = v.voiceURI || '';
      opt.dataset.lang = v.lang || '';
      
      let tagGenero = '';
      if (femaleRegex.test(v.name)) tagGenero = ' (👩 Feminina)';
      else if (maleRegex.test(v.name)) tagGenero = ' (👨 Masculina)';

      opt.textContent = `${v.name} [${v.lang}]${tagGenero}`;
      if ((currentURI && v.voiceURI === currentURI) || (currentName && v.name === currentName)) {
        opt.selected = true;
      }
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  adicionarGrupo('🇧🇷 Vozes em Português do Brasil', ptBrVoices);
  adicionarGrupo('🇵🇹 Vozes em Português (Outras)', ptOtherVoices);
  adicionarGrupo('🌐 Outras Vozes do Sistema', otherVoices.slice(0, 15));

  const totalPt = ptBrVoices.length + ptOtherVoices.length;
  const statusEl = document.getElementById('modal-voz-detectada-status');
  if (statusEl) {
    statusEl.textContent = `${voices.length} vozes detectadas (${totalPt} em Português)`;
  }
}

function aoMudarVozInline(sel) {
  if (!sel) return;
  const opt = sel.selectedOptions ? sel.selectedOptions[0] : null;
  S.cfg = S.cfg || {};
  S.cfg.assistente = S.cfg.assistente || {};
  S.cfg.assistente.voiceURI = sel.value;
  S.cfg.assistente.voiceName = opt?.dataset?.name || '';
  salvar();
}

function selecionarSugestaoNome(nome, genero) {
  const inp = document.getElementById('modal-cfg-ass-nome');
  if (inp) inp.value = nome;
  if (genero) {
    const rad = document.querySelector(`input[name="modal-cfg-ass-genero"][value="${genero}"]`);
    if (rad) {
      rad.checked = true;
      atualizarGeneroSelecionado(genero);
    }
  }
}

function atualizarGeneroSelecionado(genero) {
  const lFemale = document.getElementById('label-genero-female');
  const lMale = document.getElementById('label-genero-male');
  if (lFemale) lFemale.style.borderColor = genero === 'female' ? '#3b82f6' : 'rgba(255,255,255,0.1)';
  if (lMale) lMale.style.borderColor = genero === 'male' ? '#3b82f6' : 'rgba(255,255,255,0.1)';
}

function executarTesteModalVoz() {
  const inpNome = document.getElementById('modal-cfg-ass-nome') || document.querySelector('input[data-act="cfg-assistente"][data-c="displayName"]');
  const nome = (inpNome ? inpNome.value.trim() : '') || 'Verônica';

  const radGenero = document.querySelector('input[name="modal-cfg-ass-genero"]:checked') || document.querySelector('select[data-act="cfg-assistente"][data-c="voiceGender"]');
  const genero = (radGenero ? radGenero.value : 'female');

  const selVoz = document.getElementById('modal-cfg-ass-voz') || document.getElementById('cfg-ass-voz-inline');
  const voiceURI = selVoz ? selVoz.value : '';
  const selectedOpt = selVoz && selVoz.selectedOptions ? selVoz.selectedOptions[0] : null;
  const voiceName = selectedOpt?.dataset?.name || '';

  const inpPitch = document.getElementById('modal-cfg-ass-pitch');
  const inpRate = document.getElementById('modal-cfg-ass-rate');
  const pitch = inpPitch ? +inpPitch.value : null;
  const rate = inpRate ? +inpRate.value : null;

  const btn = document.getElementById('btn-modal-testar-voz') || document.getElementById('btn-inline-testar-voz');
  const statusEl = document.getElementById('modal-teste-status');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🔊</span> Falando...';
  }
  if (statusEl) {
    statusEl.textContent = `Reproduzindo áudio de "${nome}"...`;
  }

  if (typeof PatioVoz !== 'undefined' && PatioVoz.testarVoz) {
    PatioVoz.testarVoz({
      displayName: nome,
      voiceGender: genero,
      voiceURI,
      voiceName,
      pitch,
      rate,
      onEnd: () => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>▶️</span> Ouvir Saudação';
        }
        if (statusEl) {
          statusEl.textContent = 'Áudio reproduzido com sucesso!';
        }
      },
      onError: () => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>▶️</span> Ouvir Saudação';
        }
        if (statusEl) {
          statusEl.textContent = 'Verifique se o som do dispositivo está ativo.';
        }
      }
    });
  } else {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>▶️</span> Ouvir Saudação';
    }
  }
}

async function salvarConfigAssistenteModal() {
  const inpNome = document.getElementById('modal-cfg-ass-nome');
  const nome = (inpNome ? inpNome.value.trim() : '') || 'Verônica';

  const radGenero = document.querySelector('input[name="modal-cfg-ass-genero"]:checked');
  const genero = radGenero ? radGenero.value : 'female';

  const selVoz = document.getElementById('modal-cfg-ass-voz');
  const voiceURI = selVoz ? selVoz.value : '';
  const selectedOpt = selVoz && selVoz.selectedOptions ? selVoz.selectedOptions[0] : null;
  const voiceName = selectedOpt?.dataset?.name || '';

  const inpPitch = document.getElementById('modal-cfg-ass-pitch');
  const inpRate = document.getElementById('modal-cfg-ass-rate');
  const pitch = inpPitch ? +inpPitch.value : 1.0;
  const rate = inpRate ? +inpRate.value : 1.0;

  const chkBriefingDiario = document.getElementById('modal-cfg-ass-briefing-diario');
  const inpBriefingDiarioHora = document.getElementById('modal-cfg-ass-briefing-diario-horario');
  const chkBriefingSemanal = document.getElementById('modal-cfg-ass-briefing-semanal');
  const selBriefingSemanalDia = document.getElementById('modal-cfg-ass-briefing-semanal-dia');
  const inpBriefingSemanalHora = document.getElementById('modal-cfg-ass-briefing-semanal-horario');

  const briefingDiarioAtivo = chkBriefingDiario ? chkBriefingDiario.checked : Boolean(S.cfg?.assistente?.briefingDiarioAtivo);
  const briefingDiarioHorario = inpBriefingDiarioHora ? inpBriefingDiarioHora.value : (S.cfg?.assistente?.briefingDiarioHorario || '07:30');
  const briefingSemanalAtivo = chkBriefingSemanal ? chkBriefingSemanal.checked : Boolean(S.cfg?.assistente?.briefingSemanalAtivo);
  const briefingSemanalDia = selBriefingSemanalDia ? selBriefingSemanalDia.value : (S.cfg?.assistente?.briefingSemanalDia || 'segunda');
  const briefingSemanalHorario = inpBriefingSemanalHora ? inpBriefingSemanalHora.value : (S.cfg?.assistente?.briefingSemanalHorario || '08:00');

  S.cfg = S.cfg || {};
  S.cfg.assistente = {
    ...(S.cfg.assistente || {}),
    displayName: nome,
    voiceGender: genero,
    voiceURI: voiceURI,
    voiceName: voiceName,
    pitch: pitch,
    rate: rate,
    enabled: true,
    briefingDiarioAtivo: briefingDiarioAtivo,
    briefingDiarioHorario: briefingDiarioHorario,
    briefingSemanalAtivo: briefingSemanalAtivo,
    briefingSemanalDia: briefingSemanalDia,
    briefingSemanalHorario: briefingSemanalHorario
  };

  salvar();

  try {
    const reqHeaders = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    await fetch('/api/configuracoes/assistente', {
      method: 'PUT',
      headers: reqHeaders,
      body: JSON.stringify({
        displayName: nome,
        voiceGender: genero,
        voiceURI: voiceURI,
        voiceName: voiceName,
        pitch: pitch,
        rate: rate,
        enabled: true,
        briefingDiarioAtivo: briefingDiarioAtivo,
        briefingDiarioHorario: briefingDiarioHorario,
        briefingSemanalAtivo: briefingSemanalAtivo,
        briefingSemanalDia: briefingSemanalDia,
        briefingSemanalHorario: briefingSemanalHorario
      })
    });
  } catch (err) {
    console.warn('[Assistente] Erro ao sincronizar com /api/configuracoes/assistente:', err);
  }

  torrar(`✅ Assistente configurado como "${nome}" (${genero === 'male' ? 'Voz Masculina' : 'Voz Feminina'})!`);

  if (typeof fecharFolha === 'function') {
    fecharFolha();
  }

  render();
}

async function gerarEVisualizarBriefing() {
  torrar('📊 Gerando briefing gerencial...', 'info');
  try {
    const reqHeaders = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    const res = await fetch('/api/assistente/briefing/gerar', {
      method: 'POST',
      headers: reqHeaders
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Erro ${res.status} ao gerar briefing.`);
    }

    const data = await res.json();
    if (!data.success || !data.briefing) {
      throw new Error(data.error || 'Não foi possível compilar os dados do briefing.');
    }

    const briefing = data.briefing;
    const modalHtml = () => `
      <div class="card card-p" style="max-width:640px;margin:0 auto;background:#1e293b;color:#f8fafc;border-radius:12px;border:1px solid #475569;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
        <div class="entre" style="border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:24px">📊</span>
            <div>
              <h3 style="font-size:16px;font-weight:700;margin:0;color:#fff">Briefing Executivo Gerencial</h3>
              <div class="mini" style="color:#94a3b8">Consolidação em tempo real: Pátio + Financeiro</div>
            </div>
          </div>
          <button class="btn-fechar" data-act="fechar" style="color:#fff">${ico('x', 20)}</button>
        </div>

        <pre style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;color:#38bdf8;font-size:12px;line-height:1.5;max-height:380px;overflow-y:auto;white-space:pre-wrap;font-family:monospace">${esc(briefing.textoFormatado)}</pre>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px">
          <span class="mini" style="color:#94a3b8">Gerado em: ${new Date(briefing.geradoEm).toLocaleString('pt-BR')}</span>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-neutro" style="background:rgba(255,255,255,0.1);color:#fff;border:none" onclick="copiar(${JSON.stringify(briefing.textoFormatado)})">📋 Copiar Texto</button>
            <button type="button" class="btn btn-primario" data-act="fechar">Fechar</button>
          </div>
        </div>
      </div>
    `;

    if (typeof abrirFolha === 'function') {
      abrirFolha(modalHtml);
    } else {
      alert(briefing.textoFormatado);
    }
  } catch (err) {
    console.error('[Briefing] Erro:', err);
    torrar(`❌ ${err.message}`, 'erro');
  }
}

if (typeof window !== 'undefined') {
  window.folhaConfigAssistente = folhaConfigAssistente;
  window.abrirConfiguracoesAgente = abrirConfiguracoesAgente;
  window.popularSelectVozesModal = popularSelectVozesModal;
  window.aoMudarVozInline = aoMudarVozInline;
  window.selecionarSugestaoNome = selecionarSugestaoNome;
  window.atualizarGeneroSelecionado = atualizarGeneroSelecionado;
  window.executarTesteModalVoz = executarTesteModalVoz;
  window.salvarConfigAssistenteModal = salvarConfigAssistenteModal;
  window.gerarEVisualizarBriefing = gerarEVisualizarBriefing;
}
