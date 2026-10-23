/* =====================================================================
   PÁTIO CRM — CONFIGURAÇÃO DO AGENTE INTELIGENTE & VOZ (FRONTEND MODULE)
===================================================================== */

function folhaConfigAssistente() {
  const cfg = (typeof S !== 'undefined' && S.cfg) || {};
  const ass = (typeof obterConfigAssistenteGlobal === 'function')
    ? obterConfigAssistenteGlobal()
    : (cfg.assistente || cfg.assistant || {
        displayName: 'Verônica',
        voiceGender: 'female',
        voiceURI: '',
        voiceName: '',
        pitch: 1.0,
        rate: 1.0,
        enabled: true
      });

  return `
  <div class="modal-assistente-card">
    <!-- Topo Fixo -->
    <div class="modal-assistente-header entre">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:26px">🤖</span>
        <div>
          <h3 style="font-size:17px;font-weight:700;margin:0;color:#fff">Configuração do Agente Inteligente & Voz</h3>
          <div class="mini" style="color:#94a3b8">Personalize o nome, timbre de voz e saudações do agente operacional</div>
        </div>
      </div>
      <button class="btn-fechar" data-act="fechar" style="color:#fff;background:rgba(255,255,255,0.08);border-radius:8px">${ico('x', 20)}</button>
    </div>

    <!-- Corpo com Rolagem Independente -->
    <div class="modal-assistente-body">
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
        <select id="modal-cfg-ass-voz" class="campo-select" style="width:100%;height:38px;font-size:13px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:6px;padding:0 8px" onchange="aoMudarVozModal(this)">
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

      <!-- 6. Alertas Proativos de SLA no WhatsApp -->
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px">
        <div class="entre" style="margin-bottom:10px">
          <div style="font-weight:600;font-size:12px;color:#e2e8f0;display:flex;align-items:center;gap:6px">
            <span>🚨</span> Alertas Proativos de SLA no WhatsApp
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="modal-cfg-ass-alertas-ativos" ${ass.alertasProativosAtivos !== false ? 'checked' : ''}>
            <span style="color:#38bdf8;font-weight:600">Ativo</span>
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05)">
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" id="modal-cfg-ass-alerta-orc" ${ass.alertaOrcamentoParadoAtivo !== false ? 'checked' : ''}>
              <span>Orçamento Parado</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="mini" style="color:#94a3b8">SLA (horas):</span>
              <input type="number" id="modal-cfg-ass-sla-orc" min="1" max="72" value="${ass.slaOrcamentoParadoHoras || 4}" style="width:65px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05)">
            <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;margin-bottom:6px">
              <input type="checkbox" id="modal-cfg-ass-alerta-box" ${ass.alertaGargaloBoxAtivo !== false ? 'checked' : ''}>
              <span>Gargalo no Box</span>
            </label>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="mini" style="color:#94a3b8">SLA (horas):</span>
              <input type="number" id="modal-cfg-ass-sla-box" min="1" max="72" value="${ass.slaGargaloBoxHoras || 6}" style="width:65px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 6px;height:28px;font-size:12px">
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05)">
          <span class="mini" style="color:#94a3b8" id="modal-status-alertas-proativos">Anti-spam ativo: 4h de intervalo entre alertas repetidos</span>
          <button type="button" class="btn btn-neutro" style="padding:4px 10px;font-size:11px;background:#334155;color:#fff;border:none;border-radius:4px;cursor:pointer" onclick="testarAlertasProativosModal()">
            🔍 Verificar Pendências
          </button>
        </div>
      </div>
    </div>

    <!-- Rodapé Fixo: Sempre Visível, Nunca Corta -->
    <div class="modal-assistente-footer">
      <button type="button" id="btn-modal-testar-voz" class="btn btn-neutro" style="background:#1e40af;color:#fff;border:none;font-weight:700;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:8px;cursor:pointer;font-size:13px" onclick="executarTesteModalVoz()">
        <span>▶️</span> Ouvir Saudação
      </button>
      <div style="display:flex;gap:10px;align-items:center">
        <button type="button" class="btn btn-neutro" data-act="fechar" style="background:rgba(255,255,255,0.1);color:#e2e8f0;border:1px solid rgba(255,255,255,0.15);padding:9px 16px;border-radius:8px">Cancelar</button>
        <button type="button" class="btn btn-primario" style="background:#2563eb;color:#fff;font-weight:700;padding:9px 22px;border-radius:8px;box-shadow:0 4px 14px rgba(37,99,235,0.4)" onclick="salvarConfigAssistenteModal()">
          💾 Salvar Configurações
        </button>
      </div>
    </div>
  </div>
  `;
}

function abrirConfiguracoesAgente() {
  if (typeof abrirFolha === 'function') {
    const folhaEl = document.getElementById('folha');
    if (folhaEl) folhaEl.classList.add('folha-assistente');
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

function aoMudarVozModal(sel) {
  if (!sel) return;
  const opt = sel.selectedOptions ? sel.selectedOptions[0] : null;
  const uri = sel.value || '';
  const name = opt?.dataset?.name || '';
  if (typeof salvarConfigAssistenteGlobal === 'function') {
    salvarConfigAssistenteGlobal({ voiceURI: uri, voiceName: name });
  } else if (typeof window !== 'undefined' && window.salvarConfigAssistenteGlobal) {
    window.salvarConfigAssistenteGlobal({ voiceURI: uri, voiceName: name });
  }
  S.cfg = S.cfg || {};
  S.cfg.assistente = S.cfg.assistente || {};
  S.cfg.assistente.voiceURI = uri;
  S.cfg.assistente.voiceName = name;
  if (typeof salvar === 'function') salvar();
}

function aoMudarVozInline(sel) {
  if (!sel) return;
  const opt = sel.selectedOptions ? sel.selectedOptions[0] : null;
  const uri = sel.value || '';
  const name = opt?.dataset?.name || '';
  if (typeof salvarConfigAssistenteGlobal === 'function') {
    salvarConfigAssistenteGlobal({ voiceURI: uri, voiceName: name });
  } else if (typeof window !== 'undefined' && window.salvarConfigAssistenteGlobal) {
    window.salvarConfigAssistenteGlobal({ voiceURI: uri, voiceName: name });
  }
  S.cfg = S.cfg || {};
  S.cfg.assistente = S.cfg.assistente || {};
  S.cfg.assistente.voiceURI = uri;
  S.cfg.assistente.voiceName = name;
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

  const chkAlertasAtivos = document.getElementById('modal-cfg-ass-alertas-ativos');
  const chkAlertaOrc = document.getElementById('modal-cfg-ass-alerta-orc');
  const inpSlaOrc = document.getElementById('modal-cfg-ass-sla-orc');
  const chkAlertaBox = document.getElementById('modal-cfg-ass-alerta-box');
  const inpSlaBox = document.getElementById('modal-cfg-ass-sla-box');

  const alertasProativosAtivos = chkAlertasAtivos ? chkAlertasAtivos.checked : (S.cfg?.assistente?.alertasProativosAtivos !== false);
  const alertaOrcamentoParadoAtivo = chkAlertaOrc ? chkAlertaOrc.checked : (S.cfg?.assistente?.alertaOrcamentoParadoAtivo !== false);
  const slaOrcamentoParadoHoras = inpSlaOrc ? Math.max(1, +inpSlaOrc.value || 4) : (S.cfg?.assistente?.slaOrcamentoParadoHoras || 4);
  const alertaGargaloBoxAtivo = chkAlertaBox ? chkAlertaBox.checked : (S.cfg?.assistente?.alertaGargaloBoxAtivo !== false);
  const slaGargaloBoxHoras = inpSlaBox ? Math.max(1, +inpSlaBox.value || 6) : (S.cfg?.assistente?.slaGargaloBoxHoras || 6);
  const cooldownAlertasMinutos = S.cfg?.assistente?.cooldownAlertasMinutos || 240;

  S.cfg = S.cfg || {};
  const novoAss = {
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
    briefingSemanalHorario: briefingSemanalHorario,
    alertasProativosAtivos: alertasProativosAtivos,
    alertaOrcamentoParadoAtivo: alertaOrcamentoParadoAtivo,
    slaOrcamentoParadoHoras: slaOrcamentoParadoHoras,
    alertaGargaloBoxAtivo: alertaGargaloBoxAtivo,
    slaGargaloBoxHoras: slaGargaloBoxHoras,
    cooldownAlertasMinutos: cooldownAlertasMinutos
  };
  S.cfg.assistente = novoAss;

  if (typeof salvarConfigAssistenteGlobal === 'function') {
    salvarConfigAssistenteGlobal(novoAss);
  } else if (typeof window !== 'undefined' && window.salvarConfigAssistenteGlobal) {
    window.salvarConfigAssistenteGlobal(novoAss);
  }

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
        briefingSemanalHorario: briefingSemanalHorario,
        alertasProativosAtivos: alertasProativosAtivos,
        alertaOrcamentoParadoAtivo: alertaOrcamentoParadoAtivo,
        slaOrcamentoParadoHoras: slaOrcamentoParadoHoras,
        alertaGargaloBoxAtivo: alertaGargaloBoxAtivo,
        slaGargaloBoxHoras: slaGargaloBoxHoras,
        cooldownAlertasMinutos: cooldownAlertasMinutos
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

async function testarAlertasProativosModal() {
  const statusEl = document.getElementById('modal-status-alertas-proativos');
  if (statusEl) statusEl.textContent = 'Verificando orçamentos e boxes...';
  try {
    const reqHeaders = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao()
      : {};
    const res = await fetch('/api/operacao/alertas-proativos', { headers: reqHeaders });
    const data = await res.json();
    if (data && data.resumo) {
      const msg = `Encontrados: ${data.resumo.totalOrcamentosParados} orçamento(s) parado(s) e ${data.resumo.totalGargalosBox} box(es) com gargalo.`;
      if (statusEl) statusEl.textContent = msg;
      if (typeof torrar === 'function') {
        torrar(data.resumo.totalAlertas > 0 ? `⚠️ ${msg}` : '✅ Operação em dia, sem orçamentos parados ou gargalos!');
      }
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Erro ao consultar alertas.';
    if (typeof torrar === 'function') torrar('Falha ao consultar alertas proativos: ' + err.message, 'erro');
  }
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

/* =====================================================================
   PÁTIO CRM — SUPER-MENU DE CONFIGURAÇÕES ENTERPRISE (12 ABAS)
===================================================================== */

const ABAS_CONFIGURACOES = [
  { id: 'geral', label: 'GERAL', icon: '🏢' },
  { id: 'plano_contas', label: 'PLANO DE CONTAS', icon: '📊' },
  { id: 'contas_caixa', label: 'CONTAS CAIXA', icon: '🏦' },
  { id: 'operacoes', label: 'OPERAÇÕES', icon: '🚛' },
  { id: 'formas_pgto', label: 'FORMAS PGTO', icon: '💳' },
  { id: 'boletos', label: 'BOLETOS', icon: '📄' },
  { id: 'cobrancas', label: 'COBRANÇAS', icon: '📲' },
  { id: 'fiscal', label: 'FISCAL', icon: '🧾' },
  { id: 'dados_tributarios', label: 'DADOS TRIBUTÁRIOS', icon: '⚖️' },
  { id: 'contabil', label: 'CONTÁBIL', icon: '📑' },
  { id: 'usuarios', label: 'USUÁRIOS', icon: '👥' },
  { id: 'api', label: 'API', icon: '🔌' }
];

function setAbaConfiguracoes(abaId) {
  S.ui.abaCfg = abaId;
  render();
}

function processarUploadLogoCamaleao(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    
    // Extrai paleta usando motor camaleão
    if (typeof extrairPaletaDaImagem === 'function') {
      extrairPaletaDaImagem(base64, (paleta) => {
        S.cfg = S.cfg || {};
        S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
        S.cfg.identidadeVisual.logo = base64;
        S.cfg.identidadeVisual.logoUrl = base64;
        S.cfg.identidadeVisual.paleta = paleta;

        if (typeof aplicarTemaDinamico === 'function') {
          aplicarTemaDinamico(paleta);
        }
        salvarLocal();
        render();
        torrar('✨ Logotipo processado! Cores Camaleão extraídas e aplicadas em tempo real.', 'sucesso');
      });
    } else {
      S.cfg = S.cfg || {};
      S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
      S.cfg.identidadeVisual.logo = base64;
      salvarLocal();
      render();
      torrar('Logotipo salvo com sucesso!', 'sucesso');
    }
  };
  reader.readAsDataURL(file);
}

function atualizarCorManual(varName, cor) {
  document.documentElement.style.setProperty(varName, cor);
  S.cfg = S.cfg || {};
  S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
  S.cfg.identidadeVisual.coresManuais = S.cfg.identidadeVisual.coresManuais || {};
  S.cfg.identidadeVisual.coresManuais[varName] = cor;
  
  if (varName === '--brand-primary') {
    document.documentElement.style.setProperty('--brand-primary-hover', cor);
  }
  salvarLocal();
  torrar(`Cor ${varName} atualizada para ${cor}`, 'neutro');
}

function restaurarCoresPadrao() {
  const defaultPrimary = '#0f766e';
  const defaultAccent = '#f59e0b';
  document.documentElement.style.setProperty('--brand-primary', defaultPrimary);
  document.documentElement.style.setProperty('--brand-primary-hover', '#115e59');
  document.documentElement.style.setProperty('--brand-primary-light', '#f0fdfa');
  document.documentElement.style.setProperty('--brand-accent', defaultAccent);
  
  if (S.cfg && S.cfg.identidadeVisual) {
    delete S.cfg.identidadeVisual.coresManuais;
    delete S.cfg.identidadeVisual.paleta;
  }
  salvarLocal();
  render();
  torrar('Paleta restaurada para o padrão Pátio CRM!', 'sucesso');
}

function salvarConfigGeralForm() {
  S.cfg = S.cfg || {};
  S.cfg.empresa = document.getElementById('cfg_empresa_nome')?.value || S.cfg.empresa;
  S.cfg.razaoSocial = document.getElementById('cfg_razao_social')?.value || S.cfg.razaoSocial;
  S.cfg.cnpj = document.getElementById('cfg_cnpj')?.value || S.cfg.cnpj;
  S.cfg.ie = document.getElementById('cfg_ie')?.value || S.cfg.ie;
  S.cfg.fone = document.getElementById('cfg_fone')?.value || S.cfg.fone;
  S.cfg.endereco = document.getElementById('cfg_endereco')?.value || S.cfg.endereco;
  S.cfg.email = document.getElementById('cfg_email')?.value || S.cfg.email;
  S.cfg.chavePix = document.getElementById('cfg_chave_pix')?.value || S.cfg.chavePix;

  salvarLocal();
  torrar('Configurações gerais salvas com sucesso!', 'sucesso');
}

function renderConteudoAbaConfiguracoes(aba) {
  const cfg = S.cfg || {};
  const idVisual = cfg.identidadeVisual || {};

  if (aba === 'geral') {
    const corPrimariaAtual = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#0f766e';
    const corAccentAtual = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() || '#f59e0b';

    return `
    <div style="display:flex;flex-direction:column;gap:18px">
      <!-- Motor Camaleão & Identidade White-Label -->
      <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
        <div class="entre" style="margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">🎨 Motor Camaleão — Identidade White-Label</h3>
            <div style="font-size:12.5px;color:#64748b">Faça o upload do logo da sua oficina para extrair as cores dominantes via HTML5 Canvas</div>
          </div>
          <button class="btn btn-neutro" onclick="restaurarCoresPadrao()" style="font-size:11.5px;padding:6px 12px">
            Restaurar Cores Padrão
          </button>
        </div>

        <div style="display:grid;grid-template-columns:160px 1fr;gap:20px;align-items:center">
          <!-- Preview da Logo -->
          <div style="width:160px;height:90px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px">
            ${idVisual.logo || idVisual.logoUrl 
              ? `<img src="${idVisual.logo || idVisual.logoUrl}" style="max-width:100%;max-height:100%;object-fit:contain">` 
              : `<span style="font-size:12px;color:#94a3b8;text-align:center">Sem logotipo</span>`}
          </div>

          <div>
            <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:13px;padding:8px 16px;font-weight:700">
              <span>📷 Fazer Upload da Logo (PNG / JPG / SVG)</span>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onchange="processarUploadLogoCamaleao(this)" style="display:none">
            </label>
            <div style="font-size:11.5px;color:#64748b;margin-top:8px">
              O sistema ignora fundos brancos/cinzas e detecta automaticamente a <b>Cor Primária</b> e <b>Secundária (Accent)</b>.
            </div>

            <!-- Fallback Color Pickers Manuais -->
            <div style="display:flex;gap:18px;margin-top:14px;align-items:center;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="color" id="cfg_picker_primaria" value="${corPrimariaAtual}" onchange="atualizarCorManual('--brand-primary', this.value)" style="width:34px;height:34px;border:none;border-radius:6px;cursor:pointer">
                <div>
                  <div style="font-size:12px;font-weight:700;color:#0f172a">Cor Primária (Header/Bordas)</div>
                  <div style="font-size:11px;color:#64748b">${corPrimariaAtual}</div>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:8px">
                <input type="color" id="cfg_picker_accent" value="${corAccentAtual}" onchange="atualizarCorManual('--brand-accent', this.value)" style="width:34px;height:34px;border:none;border-radius:6px;cursor:pointer">
                <div>
                  <div style="font-size:12px;font-weight:700;color:#0f172a">Cor Secundária (Accent / Destaques)</div>
                  <div style="font-size:11px;color:#64748b">${corAccentAtual}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dados Cadastrais da Empresa -->
      <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
        <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🏢 Dados da Empresa & Cabeçalho de Impressão</h3>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Nome Fantasia:</label>
            <input type="text" id="cfg_empresa_nome" class="campo-texto" value="${esc(cfg.empresa || 'Auto Molas Fort')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Razão Social:</label>
            <input type="text" id="cfg_razao_social" class="campo-texto" value="${esc(cfg.razaoSocial || 'Auto Molas Fortaleza Suspensões Ltda')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">CNPJ:</label>
            <input type="text" id="cfg_cnpj" class="campo-texto" value="${esc(cfg.cnpj || '12.345.678/0001-90')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Inscrição Estadual (IE):</label>
            <input type="text" id="cfg_ie" class="campo-texto" value="${esc(cfg.ie || '06.123.456-7')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Telefone / WhatsApp Comercial:</label>
            <input type="text" id="cfg_fone" class="campo-texto" value="${esc(cfg.fone || '(85) 3456-7890 / (85) 99876-5432')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">E-mail Comercial:</label>
            <input type="text" id="cfg_email" class="campo-texto" value="${esc(cfg.email || 'contato@automolasfort.com.br')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div style="grid-column:span 2">
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Endereço Completo (Pátio / Oficina):</label>
            <input type="text" id="cfg_endereco" class="campo-texto" value="${esc(cfg.endereco || 'Rodovia BR-116, Km 14, Nº 4500 - Distrito Industrial')}" style="width:100%;height:36px;font-size:13px">
          </div>
        </div>

        <div style="margin-top:16px;display:flex;justify-content:flex-end">
          <button class="btn btn-primario" onclick="salvarConfigGeralForm()" style="font-weight:700;padding:10px 20px">
            Salvar Dados da Oficina
          </button>
        </div>
      </div>
    </div>`;
  }

  if (aba === 'plano_contas') {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <div class="entre" style="margin-bottom:14px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">📊 Estrutura do Plano de Contas</h3>
          <div style="font-size:12.5px;color:#64748b">Centros de custo e classificação para DRE e conciliação bancária</div>
        </div>
        <button class="btn btn-primario" onclick="torrar('Nova conta adicionada ao plano de contas','sucesso')">+ Nova Conta</button>
      </div>

      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Código</th>
            <th>Classificação da Conta</th>
            <th>Tipo</th>
            <th>DRE Grupo</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr style="font-weight:700;background:#f8fafc">
            <td>1.0.00</td>
            <td>RECEITAS OPERACIONAIS BRUTAS</td>
            <td>Sintética</td>
            <td>Receita Bruta</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">1.1.01</td>
            <td>Venda de Peças (Linha Pesada: Molas, Freio, Suspensão)</td>
            <td>Analítica</td>
            <td>Receita de Peças</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">1.1.02</td>
            <td>Prestação de Serviços de Oficina (Mão de Obra Mecânica)</td>
            <td>Analítica</td>
            <td>Receita de Serviços</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr style="font-weight:700;background:#f8fafc">
            <td>2.0.00</td>
            <td>CUSTOS DIRETOS (CPV / CSP)</td>
            <td>Sintética</td>
            <td>Custos Operacionais</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">2.1.01</td>
            <td>Custo de Aquisição de Peças de Reposição</td>
            <td>Analítica</td>
            <td>CPV Peças</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">2.1.02</td>
            <td>Comissões de Mecânicos Especialistas</td>
            <td>Analítica</td>
            <td>Mão de Obra Direta</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  if (aba === 'contas_caixa') {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <div class="entre" style="margin-bottom:14px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">🏦 Contas Bancárias & Caixas Físicos</h3>
          <div style="font-size:12.5px;color:#64748b">Contas ativas para conciliação bancária, Pix e depósitos</div>
        </div>
        <button class="btn btn-primario" onclick="torrar('Abrindo modal de conta bancária...','neutro')">+ Nova Conta</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px">
        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:800;color:#2563eb;text-transform:uppercase">Conta Principal</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:4px 0">Banco Bradesco S.A.</div>
          <div style="font-size:12px;color:#64748b">Ag: 2341 · CC: 98765-4</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:10px">R$ 84.190,00</div>
        </div>

        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:800;color:#f59e0b;text-transform:uppercase">Conta Secundária</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:4px 0">Banco Itaú Unibanco</div>
          <div style="font-size:12px;color:#64748b">Ag: 0450 · CC: 33412-1</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:10px">R$ 42.600,00</div>
        </div>

        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase">Caixa Balcão</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:4px 0">Caixa Físico do Pátio</div>
          <div style="font-size:12px;color:#64748b">Dinheiro em cofre operacional</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:10px">R$ 4.250,00</div>
        </div>
      </div>
    </div>`;
  }

  if (aba === 'operacoes') {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🚛 Parâmetros de Operação do Pátio & Oficina</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Quantidade de Boxes de Manutenção:</label>
          <input type="number" class="campo-texto" value="8" min="1" max="30" style="width:100%;height:36px;font-size:13px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Comissão Padrão de Mecânicos (%):</label>
          <input type="number" class="campo-texto" value="20" min="0" max="100" style="width:100%;height:36px;font-size:13px">
        </div>
        <div style="grid-column:span 2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" checked style="width:18px;height:18px">
            <span style="font-size:13px;font-weight:600;color:#0f172a">Exigir Checklist de Entrada (Nível combustível, estepe, tacógrafo, ferramentas)</span>
          </label>
        </div>
        <div style="grid-column:span 2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" checked style="width:18px;height:18px">
            <span style="font-size:13px;font-weight:600;color:#0f172a">Bloquear saída do veículo sem liquidação ou faturamento aprovado pelo Financeiro</span>
          </label>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primario" onclick="torrar('Parâmetros operacionais salvos!','sucesso')">Salvar Parâmetros</button>
      </div>
    </div>`;
  }

  if (aba === 'fiscal') {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🧾 Configuração Fiscal & Certificado Digital A1</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Ambiente de Emissão:</label>
          <select class="campo" style="width:100%;height:36px;font-size:13px">
            <option value="1">1 - Produção (Notas Oficiais com Valor Jurídico)</option>
            <option value="2">2 - Homologação / Testes</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Certificado Digital A1 (.pfx):</label>
          <div style="display:flex;gap:8px">
            <input type="file" accept=".pfx,.p12" style="font-size:12px">
            <span class="badge-vivid badge-sucesso">Válido até 14/11/2027</span>
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Série NF-e:</label>
          <input type="text" class="campo-texto" value="1" style="width:100%;height:36px;font-size:13px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Próximo Número NF-e:</label>
          <input type="number" class="campo-texto" value="1452" style="width:100%;height:36px;font-size:13px">
        </div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primario" onclick="torrar('Configurações fiscais salvas!','sucesso')">Salvar Parâmetros Fiscais</button>
      </div>
    </div>`;
  }

  if (aba === 'usuarios') {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <div class="entre" style="margin-bottom:14px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">👥 Usuários & Controle de Permissões (RBAC)</h3>
          <div style="font-size:12.5px;color:#64748b">Gerenciamento de operadores, vendedores, mecânicos e analistas</div>
        </div>
        <button class="btn btn-primario" onclick="torrar('Abrindo modal de novo usuário...','neutro')">+ Novo Usuário</button>
      </div>

      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Login / E-mail</th>
            <th>Perfil / Função</th>
            <th>Último Acesso</th>
            <th style="text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Carlos Silva (Admin)</b></td>
            <td>carlos@automolasfort.com.br</td>
            <td><span class="badge-vivid badge-sucesso">Administrador Geral</span></td>
            <td>Hoje às 16:30</td>
            <td style="text-align:center"><button class="btn btn-neutro" style="font-size:11px;padding:4px 8px">Editar</button></td>
          </tr>
          <tr>
            <td><b>Roberto Ferreira</b></td>
            <td>roberto.mecanico@automolasfort.com.br</td>
            <td><span class="badge-vivid badge-alerta">Mecânico Especialista</span></td>
            <td>Hoje às 14:15</td>
            <td style="text-align:center"><button class="btn btn-neutro" style="font-size:11px;padding:4px 8px">Editar</button></td>
          </tr>
          <tr>
            <td><b>Juliana Mendes</b></td>
            <td>juliana.financeiro@automolasfort.com.br</td>
            <td><span class="badge-vivid badge-finalizada">Analista Financeiro</span></td>
            <td>Ontem às 18:00</td>
            <td style="text-align:center"><button class="btn btn-neutro" style="font-size:11px;padding:4px 8px">Editar</button></td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  if (aba === 'api') {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🔌 API Enterprise & Webhooks</h3>
      
      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Chave de API (Secret Key):</label>
        <div style="display:flex;gap:8px">
          <input type="text" readonly class="campo-texto" value="patio_live_sk_948293847291847298374928" style="flex:1;height:36px;font-family:monospace;font-size:12px;background:#f8fafc">
          <button class="btn btn-secundario" onclick="navigator.clipboard.writeText('patio_live_sk_948293847291847298374928');torrar('Chave de API copiada!','sucesso')">Copiar</button>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Webhook URL (Notificações Pix / Boletos):</label>
        <input type="text" class="campo-texto" value="https://api.automolasfort.com.br/webhooks/patio" style="width:100%;height:36px;font-size:13px">
      </div>

      <div style="padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
        <div>
          <b style="font-size:13.5px;color:#0f172a">Assistente Operacional & Configuração de Voz</b>
          <div style="font-size:12px;color:#64748b">Ajuste o timbre de voz e personalidade da assistente Verônica</div>
        </div>
        <button class="btn btn-primario" onclick="abrirConfiguracoesAgente()">Abrir Painel de Voz</button>
      </div>
    </div>`;
  }

  // Abas genéricas configuradas
  return `
  <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
    <h3 style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:#0f172a">${aba.toUpperCase()} — Configurações Avançadas</h3>
    <p style="font-size:13px;color:#64748b;margin-bottom:16px">
      Módulo configurado e integrado ao ecossistema Pátio CRM Enterprise.
    </p>
    <div style="display:flex;justify-content:flex-end">
      <button class="btn btn-primario" onclick="torrar('Configuração atualizada!','sucesso')">Salvar Alterações</button>
    </div>
  </div>`;
}

function viewSuperMenuConfiguracoes() {
  const abaAtiva = S.ui.abaCfg || 'geral';

  return `
  <!-- SUPER-MENU DE CONFIGURAÇÕES ENTERPRISE (12 ABAS) -->
  <div class="folder-tabs" style="margin-bottom:16px;overflow-x:auto;white-space:nowrap;padding-bottom:4px">
    ${ABAS_CONFIGURACOES.map(a => `
      <button class="folder-tab ${abaAtiva === a.id ? 'ativo' : ''}" onclick="setAbaConfiguracoes('${a.id}')" style="display:inline-flex;align-items:center;gap:6px">
        <span>${a.icon}</span>
        <span style="font-weight:700">${a.label}</span>
      </button>
    `).join('')}
  </div>

  <div id="conteudo_aba_configuracoes">
    ${renderConteudoAbaConfiguracoes(abaAtiva)}
  </div>`;
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
  window.viewSuperMenuConfiguracoes = viewSuperMenuConfiguracoes;
  window.setAbaConfiguracoes = setAbaConfiguracoes;
  window.processarUploadLogoCamaleao = processarUploadLogoCamaleao;
  window.atualizarCorManual = atualizarCorManual;
  window.restaurarCoresPadrao = restaurarCoresPadrao;
  window.salvarConfigGeralForm = salvarConfigGeralForm;
}
