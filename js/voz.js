/* =====================================================================
   PÁTIO CRM — CAMADA INTELIGENTE DE ENTRADA E OPERAÇÃO POR VOZ (FRONTEND)
   Permite que mecânicos e gerentes de pátio operem o sistema falando naturalmente.
===================================================================== */

const PatioVoz = (function () {
  let gravando = false;
  let processando = false;
  let audioFeedbackAtivo = localStorage.getItem('patio_voz_tts') !== 'false';
  let recognition = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let drawerAberto = false;
  let transcricaoAtual = '';
  let historicoComandos = [];

  // Inicializa suporte a Web Speech API se suportado pelo navegador
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const temSpeechAPI = !!SpeechRecognition;

  const CHAVE_STORAGE_ASSISTENTE = 'patio_assistente_config';

  function obterConfigAssistenteGlobal() {
    let cfg = null;
    if (typeof window !== 'undefined' && window.__PATIO_VOICE_CONFIG__) {
      cfg = window.__PATIO_VOICE_CONFIG__;
    }
    if ((!cfg || !cfg.displayName) && typeof S !== 'undefined' && S?.cfg?.assistente) {
      cfg = S.cfg.assistente;
    }
    if ((!cfg || !cfg.displayName) && typeof localStorage !== 'undefined') {
      try {
        const sal = localStorage.getItem(CHAVE_STORAGE_ASSISTENTE);
        if (sal) cfg = JSON.parse(sal);
      } catch (_) {}
    }
    if (!cfg) {
      cfg = {
        displayName: 'Verônica',
        voiceGender: 'female',
        voiceURI: '',
        voiceName: '',
        pitch: 1.0,
        rate: 1.0,
        enabled: true
      };
    }
    if (typeof window !== 'undefined') window.__PATIO_VOICE_CONFIG__ = cfg;
    if (typeof S !== 'undefined' && S.cfg) S.cfg.assistente = cfg;
    return cfg;
  }

  function salvarConfigAssistenteGlobal(novosDados) {
    const atual = obterConfigAssistenteGlobal();
    const mesclado = Object.assign({}, atual, novosDados || {});
    if (typeof window !== 'undefined') window.__PATIO_VOICE_CONFIG__ = mesclado;
    if (typeof S !== 'undefined') {
      S.cfg = S.cfg || {};
      S.cfg.assistente = mesclado;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CHAVE_STORAGE_ASSISTENTE, JSON.stringify(mesclado));
      } catch (_) {}
    }
    if (typeof VoiceProviderAdapter !== 'undefined' && typeof VoiceProviderAdapter.invalidateCache === 'function') {
      VoiceProviderAdapter.invalidateCache();
    }
    return mesclado;
  }

  let cachedVoiceInstance = null;
  let cachedConfigKey = null;

  const VoiceProviderAdapter = {
    provider: 'webSpeech',
    invalidateCache() {
      cachedVoiceInstance = null;
      cachedConfigKey = null;
    },
    getAvailableVoices() {
      if (typeof window === 'undefined' || !window.speechSynthesis) return [];
      return window.speechSynthesis.getVoices() || [];
    },
    resolveVoice({ gender, lang = 'pt-BR', voiceURI = '', voiceName = '', voices = null, forceRecalculate = false } = {}) {
      const allVoices = (voices && Array.isArray(voices)) ? voices : this.getAvailableVoices();
      if (!allVoices || allVoices.length === 0) {
        return { voice: null, fallback: true, requiresPitchCompensation: false, reason: 'no_voices_loaded' };
      }

      const assCfg = obterConfigAssistenteGlobal();
      const targetURI = (voiceURI !== undefined && voiceURI !== '') ? voiceURI : (assCfg.voiceURI || '');
      const targetName = (voiceName !== undefined && voiceName !== '') ? voiceName : (assCfg.voiceName || '');
      const effGender = (gender !== undefined && gender !== '') ? gender : (assCfg.voiceGender || 'female');

      // Verifica cache em memória se nada mudou e não for voz mockada em teste
      const configKey = `${targetURI}__${targetName}__${effGender}__${allVoices.length}`;
      if (!voices && !forceRecalculate && cachedVoiceInstance && cachedConfigKey === configKey) {
        return cachedVoiceInstance;
      }

      const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
      const femaleRegex = /female|feminin|mulher|luciana|maria|helena|vitoria|vitória|francisca|raquel|camila|brenda|thalita|elza|leticia|letícia|manuela|leide|fernanda|gabriela|juliana|carolina|ana|ines|inês|joana|catarina|clara|amalia|amália|yelda|helia|hélia|zira/i;

      // 1. Prioridade máxima: voz explicitamente selecionada pelo usuário (por URI ou Nome)
      if (targetURI || targetName) {
        // 1a. Busca exata por voiceURI ou name
        let exact = allVoices.find(v => (targetURI && v.voiceURI === targetURI) || (targetName && v.name === targetName));
        
        // 1b. Busca tolerante a maiúsculas/minúsculas
        if (!exact) {
          const uriLow = (targetURI || '').toLowerCase();
          const nameLow = (targetName || '').toLowerCase();
          exact = allVoices.find(v => 
            (uriLow && (v.voiceURI || '').toLowerCase() === uriLow) ||
            (nameLow && (v.name || '').toLowerCase() === nameLow) ||
            (uriLow && (v.name || '').toLowerCase() === uriLow) ||
            (nameLow && (v.voiceURI || '').toLowerCase() === nameLow)
          );
        }

        // 1c. Correspondência de substring quando o nome salvo difere de tags do navegador
        if (!exact && (targetName || targetURI)) {
          const searchKey = (targetName || targetURI).toLowerCase().replace(/\s*\[.*\]\s*/g, '').trim();
          if (searchKey.length > 3) {
            exact = allVoices.find(v => {
              const vNameLow = (v.name || '').toLowerCase();
              return vNameLow.includes(searchKey) || searchKey.includes(vNameLow);
            });
          }
        }

        if (exact) {
          const isMale = maleRegex.test(exact.name);
          const result = {
            voice: exact,
            fallback: false,
            provider: 'webSpeech',
            gender: effGender,
            requiresPitchCompensation: (effGender === 'female' && isMale)
          };
          if (!voices) {
            cachedVoiceInstance = result;
            cachedConfigKey = configKey;
          }
          return result;
        }
      }

      // 2. Filtra vozes em Português (dá preferência para pt-BR)
      const ptBrVoices = allVoices.filter(v => /pt[-_]br/i.test(v.lang || ''));
      const ptAllVoices = allVoices.filter(v => (v.lang || '').toLowerCase().startsWith('pt'));
      const list = ptBrVoices.length > 0 ? ptBrVoices : (ptAllVoices.length > 0 ? ptAllVoices : allVoices);

      let matched = null;
      if (effGender === 'male') {
        matched = list.find(v => maleRegex.test(v.name)) || allVoices.find(v => maleRegex.test(v.name));
      } else {
        matched = list.find(v => femaleRegex.test(v.name)) || allVoices.find(v => femaleRegex.test(v.name));
      }

      if (matched) {
        const result = { voice: matched, fallback: false, requiresPitchCompensation: false, provider: 'webSpeech', gender: effGender };
        if (!voices) {
          cachedVoiceInstance = result;
          cachedConfigKey = configKey;
        }
        return result;
      }

      // Se procurava feminina e nenhuma bateu o regex de nomes femininos:
      // Tenta encontrar qualquer voz na lista que NÃO seja explicitamente masculina
      if (effGender === 'female') {
        const nonMale = list.find(v => !maleRegex.test(v.name));
        if (nonMale) {
          const result = { voice: nonMale, fallback: true, requiresPitchCompensation: false, provider: 'webSpeech', gender: effGender };
          if (!voices) {
            cachedVoiceInstance = result;
            cachedConfigKey = configKey;
          }
          return result;
        }
      }

      // Fallback final: primeira voz disponível
      const fallbackVoice = list[0] || allVoices[0] || null;
      const isFallbackMale = fallbackVoice ? maleRegex.test(fallbackVoice.name) : false;
      const requiresPitchShift = (effGender === 'female' && isFallbackMale);

      const result = {
        voice: fallbackVoice,
        fallback: true,
        requiresPitchCompensation: requiresPitchShift,
        provider: 'webSpeech',
        gender: effGender
      };
      if (!voices) {
        cachedVoiceInstance = result;
        cachedConfigKey = configKey;
      }
      return result;
    },
    speak({ text, gender, lang = 'pt-BR', voiceURI, voiceName, pitch, rate, onEnd, onError } = {}) {
      if (typeof window === 'undefined' || !window.speechSynthesis || !text) return false;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;

        const assCfg = obterConfigAssistenteGlobal();
        const effGender = (gender !== undefined && gender !== '') ? gender : (assCfg.voiceGender || 'female');
        const effURI = (voiceURI !== undefined && voiceURI !== '') ? voiceURI : (assCfg.voiceURI || '');
        const effName = (voiceName !== undefined && voiceName !== '') ? voiceName : (assCfg.voiceName || '');

        const resolution = this.resolveVoice({
          gender: effGender,
          lang,
          voiceURI: effURI,
          voiceName: effName
        });

        if (resolution.voice) utterance.voice = resolution.voice;

        // Determina afinação (pitch) e velocidade (rate)
        let calcPitch = 1.0;
        let calcRate = 1.0;

        if (effGender === 'male') {
          calcPitch = 0.92;
          calcRate = 1.0;
        } else {
          // Se a voz selecionada ou de fallback for masculina mas o gênero escolhido for feminino,
          // compensa elevando o pitch para uma frequência feminina natural (1.32)
          calcPitch = resolution.requiresPitchCompensation ? 1.32 : 1.05;
          calcRate = 1.03;
        }

        const userPitch = (pitch !== undefined && pitch !== null) ? Number(pitch) : (assCfg.pitch !== undefined && assCfg.pitch !== null ? Number(assCfg.pitch) : null);
        const userRate = (rate !== undefined && rate !== null) ? Number(rate) : (assCfg.rate !== undefined && assCfg.rate !== null ? Number(assCfg.rate) : null);

        utterance.pitch = Math.max(0.5, Math.min(2.0, (userPitch !== null && Number.isFinite(userPitch)) ? userPitch : calcPitch));
        utterance.rate = Math.max(0.5, Math.min(2.0, (userRate !== null && Number.isFinite(userRate)) ? userRate : calcRate));

        if (onEnd) utterance.onend = onEnd;
        if (onError) utterance.onerror = onError;

        window.speechSynthesis.speak(utterance);
        return true;
      } catch (err) {
        console.warn('[VoiceProviderAdapter] Erro ao sintetizar áudio:', err);
        return false;
      }
    },
    testarVoz({ text, displayName, voiceGender, voiceURI, voiceName, pitch, rate, onEnd, onError } = {}) {
      const assCfg = obterConfigAssistenteGlobal();
      const nome = displayName || assCfg.displayName || 'Verônica';
      const genero = voiceGender || assCfg.voiceGender || 'female';
      const artigo = genero === 'male' ? 'o' : 'a';
      const pronto = genero === 'male' ? 'pronto' : 'pronta';
      const frase = text || `Olá! Eu sou ${artigo} ${nome}, seu assistente inteligente no Pátio CRM. A voz foi configurada com sucesso e estou ${pronto} para ajudar a sua oficina!`;
      return this.speak({
        text: frase,
        gender: genero,
        voiceURI: (voiceURI !== undefined && voiceURI !== '') ? voiceURI : assCfg.voiceURI,
        voiceName: (voiceName !== undefined && voiceName !== '') ? voiceName : assCfg.voiceName,
        pitch: (pitch !== undefined && pitch !== null) ? pitch : assCfg.pitch,
        rate: (rate !== undefined && rate !== null) ? rate : assCfg.rate,
        onEnd,
        onError
      });
    }
  };

  function falarTexto(texto, { forcar = false, onEnd, onError } = {}) {
    if (!texto) return;
    if (!forcar && !audioFeedbackAtivo) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const assCfg = obterConfigAssistenteGlobal();
    VoiceProviderAdapter.speak({
      text: texto,
      gender: assCfg.voiceGender || 'female',
      voiceURI: assCfg.voiceURI,
      voiceName: assCfg.voiceName,
      pitch: assCfg.pitch,
      rate: assCfg.rate,
      lang: 'pt-BR',
      onEnd,
      onError
    });
  }


  return {
    iniciarGravacao: () => window.__PatioVozRecording?.iniciarGravacao?.(),
    pararGravacao: () => window.__PatioVozRecording?.pararGravacao?.(),
    toggleDrawer: () => window.__PatioVozUI?.toggleDrawer?.(),
    abrirDrawer: () => window.__PatioVozUI?.abrirDrawer?.(),
    fecharDrawer: () => window.__PatioVozUI?.fecharDrawer?.(),
    toggleTTS: () => window.__PatioVozUI?.toggleTTS?.(),
    enviarComandoTexto: (txt) => window.__PatioVozRecording?.enviarComandoTexto?.(txt),
    enviarTextoDigitado: () => window.__PatioVozUI?.enviarTextoDigitado?.(),
    confirmarAcaoPendente: (t) => window.__PatioVozRecording?.confirmarAcaoPendente?.(t),
    cancelarAcaoPendente: (t) => window.__PatioVozRecording?.cancelarAcaoPendente?.(t),
    testarVoz: (opts) => VoiceProviderAdapter.testarVoz(opts),
    abrirConfiguracao: () => window.__PatioVozUI?.abrirConfiguracao?.(),
    getAvailableVoices: () => VoiceProviderAdapter.getAvailableVoices(),
    resolveVoice: (opts) => VoiceProviderAdapter.resolveVoice(opts),
    falarTexto,
    speak: (opts) => VoiceProviderAdapter.speak(opts),
    invalidateCache: () => VoiceProviderAdapter.invalidateCache(),
    obterConfigAssistenteGlobal,
    salvarConfigAssistenteGlobal,
    VoiceProviderAdapter
  };
})();

if (typeof window !== "undefined") {
  window.PatioVoz = PatioVoz;
  window.VoiceProviderAdapter = PatioVoz.VoiceProviderAdapter;
  window.falarTexto = (texto, opts) => PatioVoz.falarTexto(texto, opts);
  window.obterConfigAssistenteGlobal = () => PatioVoz.obterConfigAssistenteGlobal();
  window.salvarConfigAssistenteGlobal = (novos) => PatioVoz.salvarConfigAssistenteGlobal(novos);

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      if (window.PatioVoz && window.PatioVoz.invalidateCache) {
        window.PatioVoz.invalidateCache();
      }
    };
  }
}
if (typeof globalThis !== "undefined") {
  globalThis.PatioVoz = PatioVoz;
  globalThis.VoiceProviderAdapter = PatioVoz.VoiceProviderAdapter;
  globalThis.falarTexto = (texto, opts) => PatioVoz.falarTexto(texto, opts);
  globalThis.obterConfigAssistenteGlobal = () => PatioVoz.obterConfigAssistenteGlobal();
  globalThis.salvarConfigAssistenteGlobal = (novos) => PatioVoz.salvarConfigAssistenteGlobal(novos);
}