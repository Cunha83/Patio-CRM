/* Submódulo de Seleção de Voz e TTS do Assistente: agent_config_voice_tts.js */
/* Pátio-CRM — Submódulo extraído de js/modules/agent_config.js (< 350 linhas) */

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

if (typeof window !== 'undefined') {
  window.popularSelectVozesModal = popularSelectVozesModal;
  window.aoMudarVozModal = aoMudarVozModal;
  window.aoMudarVozInline = aoMudarVozInline;
  window.selecionarSugestaoNome = selecionarSugestaoNome;
  window.atualizarGeneroSelecionado = atualizarGeneroSelecionado;
  window.executarTesteModalVoz = executarTesteModalVoz;
}
if (typeof globalThis !== 'undefined') {
  globalThis.popularSelectVozesModal = popularSelectVozesModal;
  globalThis.aoMudarVozModal = aoMudarVozModal;
  globalThis.aoMudarVozInline = aoMudarVozInline;
  globalThis.selecionarSugestaoNome = selecionarSugestaoNome;
  globalThis.atualizarGeneroSelecionado = atualizarGeneroSelecionado;
  globalThis.executarTesteModalVoz = executarTesteModalVoz;
}
