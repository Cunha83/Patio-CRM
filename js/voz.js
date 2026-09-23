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

  const VoiceProviderAdapter = {
    provider: 'webSpeech',
    getAvailableVoices() {
      if (typeof window === 'undefined' || !window.speechSynthesis) return [];
      return window.speechSynthesis.getVoices() || [];
    },
    resolveVoice({ gender, lang = 'pt-BR', voiceURI = '', voiceName = '' } = {}) {
      const allVoices = this.getAvailableVoices();
      if (!allVoices || allVoices.length === 0) {
        return { voice: null, fallback: true, requiresPitchCompensation: false, reason: 'no_voices_loaded' };
      }

      const assCfg = (typeof S !== 'undefined' && S?.cfg?.assistente) || {};
      const targetURI = (voiceURI !== undefined && voiceURI !== '') ? voiceURI : (assCfg.voiceURI || '');
      const targetName = (voiceName !== undefined && voiceName !== '') ? voiceName : (assCfg.voiceName || '');
      const effGender = (gender !== undefined && gender !== '') ? gender : (assCfg.voiceGender || 'female');

      // 1. Prioridade máxima: voz explicitamente selecionada pelo usuário (por URI ou Nome)
      if (targetURI || targetName) {
        const exact = allVoices.find(v => (targetURI && v.voiceURI === targetURI) || (targetName && v.name === targetName));
        if (exact) {
          const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
          const isMale = maleRegex.test(exact.name);
          return {
            voice: exact,
            fallback: false,
            provider: 'webSpeech',
            gender: effGender,
            requiresPitchCompensation: (effGender === 'female' && isMale)
          };
        }
      }

      // 2. Filtra vozes em Português (dá preferência para pt-BR)
      const ptBrVoices = allVoices.filter(v => /pt[-_]br/i.test(v.lang || ''));
      const ptAllVoices = allVoices.filter(v => (v.lang || '').toLowerCase().startsWith('pt'));
      const list = ptBrVoices.length > 0 ? ptBrVoices : (ptAllVoices.length > 0 ? ptAllVoices : allVoices);

      const maleRegex = /male|masculin|homem|ricardo|jorge|daniel|antonio|antônio|felipe|gustavo|carlos|pedro|joao|joão|david|paulo/i;
      const femaleRegex = /female|feminin|mulher|luciana|maria|helena|vitoria|vitória|francisca|raquel|camila|brenda|thalita|elza|leticia|letícia|manuela|leide|fernanda|gabriela|juliana|carolina|ana|ines|inês|joana|catarina|clara|amalia|amália|yelda|helia|hélia|zira/i;

      let matched = null;
      if (effGender === 'male') {
        matched = list.find(v => maleRegex.test(v.name)) || allVoices.find(v => maleRegex.test(v.name));
      } else {
        matched = list.find(v => femaleRegex.test(v.name)) || allVoices.find(v => femaleRegex.test(v.name));
      }

      if (matched) {
        return { voice: matched, fallback: false, requiresPitchCompensation: false, provider: 'webSpeech', gender: effGender };
      }

      // Se procurava feminina e nenhuma bateu o regex de nomes femininos:
      // Tenta encontrar qualquer voz na lista que NÃO seja explicitamente masculina
      if (effGender === 'female') {
        const nonMale = list.find(v => !maleRegex.test(v.name));
        if (nonMale) {
          return { voice: nonMale, fallback: true, requiresPitchCompensation: false, provider: 'webSpeech', gender: effGender };
        }
      }

      // Fallback final: primeira voz disponível
      const fallbackVoice = list[0] || allVoices[0] || null;
      const isFallbackMale = fallbackVoice ? maleRegex.test(fallbackVoice.name) : false;
      const requiresPitchShift = (effGender === 'female' && isFallbackMale);

      console.info(`[VoiceProviderAdapter] Nenhuma voz exclusiva de gênero "${effGender}" encontrada; utilizando voz padrão.`);
      return {
        voice: fallbackVoice,
        fallback: true,
        requiresPitchCompensation: requiresPitchShift,
        provider: 'webSpeech',
        gender: effGender
      };
    },
    speak({ text, gender, lang = 'pt-BR', voiceURI, voiceName, pitch, rate, onEnd, onError } = {}) {
      if (typeof window === 'undefined' || !window.speechSynthesis || !text) return false;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;

        const assCfg = (typeof S !== 'undefined' && S?.cfg?.assistente) || {};
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
      const nome = displayName || (typeof S !== 'undefined' && S?.cfg?.assistente?.displayName) || 'Verônica';
      const genero = voiceGender || (typeof S !== 'undefined' && S?.cfg?.assistente?.voiceGender) || 'female';
      const artigo = genero === 'male' ? 'o' : 'a';
      const pronto = genero === 'male' ? 'pronto' : 'pronta';
      const frase = text || `Olá! Eu sou ${artigo} ${nome}, seu assistente inteligente no Pátio CRM. A voz foi configurada com sucesso e estou ${pronto} para ajudar a sua oficina!`;
      return this.speak({
        text: frase,
        gender: genero,
        voiceURI,
        voiceName,
        pitch,
        rate,
        onEnd,
        onError
      });
    }
  };

  function falarTexto(texto) {
    if (!audioFeedbackAtivo || !window.speechSynthesis || !texto) return;
    const assCfg = (typeof S !== 'undefined' && S?.cfg?.assistente) || {};
    VoiceProviderAdapter.speak({
      text: texto,
      gender: assCfg.voiceGender || 'female',
      voiceURI: assCfg.voiceURI,
      voiceName: assCfg.voiceName,
      pitch: assCfg.pitch,
      rate: assCfg.rate,
      lang: 'pt-BR'
    });
  }

  function toggleTTS() {
    audioFeedbackAtivo = !audioFeedbackAtivo;
    localStorage.setItem('patio_voz_tts', audioFeedbackAtivo ? 'true' : 'false');
    renderDrawer();
    torrar(audioFeedbackAtivo ? '🔊 Resposta por voz ativada' : '🔇 Resposta por voz silenciada');
  }

  function abrirDrawer() {
    drawerAberto = true;
    let el = document.getElementById('gaveta-voz');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gaveta-voz';
      el.className = 'gaveta-voz';
      document.body.appendChild(el);
    }
    el.classList.add('ativa');
    renderDrawer();
  }

  function fecharDrawer() {
    drawerAberto = false;
    const el = document.getElementById('gaveta-voz');
    if (el) el.classList.remove('ativa');
  }

  function toggleDrawer() {
    if (drawerAberto && !gravando) {
      fecharDrawer();
    } else {
      abrirDrawer();
      if (!gravando) iniciarGravacao();
    }
  }

  async function iniciarGravacao() {
    if (gravando || processando) return;
    transcricaoAtual = '';
    abrirDrawer();

    if (temSpeechAPI) {
      iniciarSpeechRecognition();
    } else {
      iniciarMediaRecorder();
    }
  }

  function iniciarSpeechRecognition() {
    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        gravando = true;
        atualizarBotaoFlutuante();
        renderDrawer();
      };

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcricaoAtual = event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        renderTranscricao(transcricaoAtual || interim);
      };

      recognition.onerror = (event) => {
        console.warn('[PatioVoz] Erro no reconhecimento SpeechAPI:', event.error);
        if (event.error !== 'no-speech') {
          torrar('Microfone: ' + event.error);
        }
        pararGravacao();
      };

      recognition.onend = () => {
        const textoFinal = transcricaoAtual.trim();
        gravando = false;
        atualizarBotaoFlutuante();
        renderDrawer();

        if (textoFinal) {
          enviarComandoTexto(textoFinal);
        }
      };

      recognition.start();
    } catch (e) {
      console.warn('[PatioVoz] Falha ao iniciar SpeechRecognition, usando MediaRecorder:', e);
      iniciarMediaRecorder();
    }
  }

  async function iniciarMediaRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstart = () => {
        gravando = true;
        atualizarBotaoFlutuante();
        renderDrawer();
      };

      mediaRecorder.onstop = async () => {
        gravando = false;
        atualizarBotaoFlutuante();
        stream.getTracks().forEach(track => track.stop());

        if (audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result;
            enviarComandoAudio(base64, 'audio/webm');
          };
          reader.readAsDataURL(blob);
        }
      };

      mediaRecorder.start();
    } catch (err) {
      torrar('Não foi possível acessar o microfone. Verifique as permissões.');
      console.error('[PatioVoz] Erro getUserMedia:', err);
      gravando = false;
      atualizarBotaoFlutuante();
      renderDrawer();
    }
  }

  function pararGravacao() {
    if (recognition && gravando) {
      try { recognition.stop(); } catch (_) {}
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch (_) {}
    }
    gravando = false;
    atualizarBotaoFlutuante();
    renderDrawer();
  }

  async function enviarComandoTexto(texto) {
    if (!texto || !texto.trim()) return;
    processando = true;
    renderDrawer();

    const activeOsId = (typeof folhaAtual !== 'undefined' && folhaAtual && S?.ui?.osAberta) ? S.ui.osAberta : null;

    try {
      const res = await fetch('/api/comando-voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: texto.trim(),
          context: {
            canal: 'web',
            activeOsId: activeOsId
          }
        })
      });

      const data = await res.json();
      processarRespostaDoServidor(data, texto);
    } catch (err) {
      torrar('Erro ao processar comando de voz com o servidor.');
      console.error('[PatioVoz] Erro POST /api/comando-voz:', err);
    } finally {
      processando = false;
      renderDrawer();
    }
  }

  async function enviarComandoAudio(audioBase64, mimeType) {
    if (!audioBase64) return;
    processando = true;
    renderDrawer();

    const activeOsId = (typeof folhaAtual !== 'undefined' && folhaAtual && S?.ui?.osAberta) ? S.ui.osAberta : null;

    try {
      const res = await fetch('/api/comando-voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          context: {
            canal: 'web',
            activeOsId: activeOsId
          }
        })
      });

      const data = await res.json();
      processarRespostaDoServidor(data, '[Áudio processado]');
    } catch (err) {
      torrar('Erro ao enviar áudio para o servidor.');
      console.error('[PatioVoz] Erro audio POST /api/comando-voz:', err);
    } finally {
      processando = false;
      renderDrawer();
    }
  }

  async function confirmarAcaoPendente(token) {
    if (!token) return;
    processando = true;
    renderDrawer();

    try {
      const res = await fetch('/api/comando-voz/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await res.json();
      processarRespostaDoServidor(data, 'Ação confirmada');
    } catch (err) {
      torrar('Erro ao confirmar ação pendente.');
    } finally {
      processando = false;
      renderDrawer();
    }
  }

  async function cancelarAcaoPendente(token) {
    fecharDrawer();
    torrar('Ação cancelada com segurança.');
  }

  async function processarRespostaDoServidor(data, comandoOriginal) {
    if (!data) return;

    // Adiciona ao histórico recente
    historicoComandos.unshift({
      comando: comandoOriginal,
      resposta: data.resposta || 'Comando executado.',
      acao: data.acao,
      osId: data.osId,
      numOS: data.numOS,
      pendenteConfirmacao: data.pendenteConfirmacao,
      token: data.token,
      dataHora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    if (historicoComandos.length > 5) historicoComandos.length = 5;

    // Fala a resposta se áudio estiver ativo
    if (data.resposta) {
      falarTexto(data.resposta);
      torrar(data.resposta, 3500);
    }

    // Se o estado foi atualizado no servidor, sincroniza no cliente
    if (data.novoEstado || data.ok) {
      try {
        const resEstado = await fetch('/api/estado');
        if (resEstado.ok) {
          const novo = await resEstado.json();
          if (novo && novo.os) {
            const ui = S.ui;
            S = novo;
            S.ui = ui;
            if (typeof PatioSync !== 'undefined') {
              armazem.base = PatioSync.clone(novo);
            }
            try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}

            // Se abriu uma nova OS, direciona a interface diretamente para ela!
            if (data.acao === 'abrir_os' && data.osId) {
              S.ui.osAberta = data.osId;
              S.ui.abaOS = 'servicos';
              S.ui.view = 'patio';
              if (typeof abrirFolha === 'function' && typeof folhaOS === 'function') {
                abrirFolha(folhaOS);
              }
            } else if (typeof renderFolha === 'function' && folhaAtual) {
              // Atualiza a folha aberta caso a reclamação ou km tenham mudado
              renderFolha();
            }

            if (typeof render === 'function') render();
          }
        }
      } catch (errSync) {
        console.warn('[PatioVoz] Erro ao sincronizar estado após voz:', errSync);
      }
    }

    renderDrawer();
  }

  function renderTranscricao(texto) {
    const el = document.getElementById('voz-transcricao-ao-vivo');
    if (el) {
      el.textContent = texto || 'Fale agora...';
      el.classList.toggle('ativo', !!texto);
    }
  }

  function atualizarBotaoFlutuante() {
    const btn = document.getElementById('btn-voz-flutuante');
    if (!btn) return;
    if (gravando) {
      btn.classList.add('gravando');
      btn.setAttribute('title', 'Ouvindo... Clique para parar');
      btn.innerHTML = `${ico('onda', 24)}<span class="pulso-voz"></span>`;
    } else if (processando) {
      btn.classList.remove('gravando');
      btn.classList.add('processando');
      btn.setAttribute('title', 'Processando inteligência...');
      btn.innerHTML = `${ico('relogio', 24)}`;
    } else {
      btn.classList.remove('gravando', 'processando');
      btn.setAttribute('title', 'Falar com o Pátio CRM');
      btn.innerHTML = `${ico('mic', 24)}`;
    }
  }

  function renderDrawer() {
    const el = document.getElementById('gaveta-voz');
    if (!el) return;

    const ultimo = historicoComandos[0] || null;

    let htmlAcaoPendente = '';
    if (ultimo && ultimo.pendenteConfirmacao && ultimo.token) {
      htmlAcaoPendente = `
        <div class="card-alerta-risco">
          <div class="card-alerta-topo">
            ${ico('alerta', 20)}
            <strong>Ação Crítica — Confirmação Necessária</strong>
          </div>
          <p>${esc(ultimo.resposta)}</p>
          <div class="acoes-alerta">
            <button class="btn btn-perigo" onclick="PatioVoz.confirmarAcaoPendente('${ultimo.token}')">${ico('check', 16)} Confirmar Execução</button>
            <button class="btn btn-neutro" onclick="PatioVoz.cancelarAcaoPendente('${ultimo.token}')">${ico('x', 16)} Cancelar</button>
          </div>
        </div>
      `;
    }

    let htmlHistorico = '';
    if (historicoComandos.length > 0) {
      htmlHistorico = `
        <div class="voz-historico-lista">
          <div class="voz-hist-titulo">Últimas Interações:</div>
          ${historicoComandos.map(h => `
            <div class="voz-hist-item">
              <div class="voz-hist-tempo">${h.dataHora}</div>
              <div class="voz-hist-comando">🗣️ "${esc(h.comando)}"</div>
              <div class="voz-hist-resposta">🤖 ${esc(h.resposta)}</div>
              ${h.numOS ? `<button class="btn btn-pequeno btn-neutro mt-4" onclick="S.ui.osAberta='${h.osId}'; abrirFolha(folhaOS);">${ico('doc', 14)} Abrir OS #${h.numOS}</button>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    const nomeAssistente = (typeof S !== 'undefined' && S?.cfg?.assistente?.displayName) || 'Verônica';

    el.innerHTML = `
      <div class="gaveta-voz-topo">
        <div class="gaveta-voz-titulo">
          ${ico('mic', 20)}
          <span>Assistente ${esc(nomeAssistente)}</span>
        </div>
        <div class="gaveta-voz-controles">
          <button class="btn-icone-mini" onclick="PatioVoz.abrirConfiguracao()" title="Configurações do Agente (Nome e Voz)">
            ⚙️
          </button>
          <button class="btn-icone-mini ${audioFeedbackAtivo ? 'ativo' : ''}" onclick="PatioVoz.toggleTTS()" title="${audioFeedbackAtivo ? 'Voz ativada (clique para silenciar)' : 'Voz silenciada (clique para ativar)'}">
            ${audioFeedbackAtivo ? ico('som', 18) : ico('mudo', 18)}
          </button>
          <button class="btn-icone-mini" onclick="PatioVoz.fecharDrawer()" title="Fechar">${ico('x', 18)}</button>
        </div>
      </div>

      <div class="gaveta-voz-conteudo">
        <div class="voz-status-area">
          <div class="voz-microfone-central ${gravando ? 'gravando' : ''} ${processando ? 'processando' : ''}" onclick="${gravando ? 'PatioVoz.pararGravacao()' : 'PatioVoz.iniciarGravacao()'}">
            ${gravando ? ico('onda', 36) : (processando ? ico('relogio', 36) : ico('mic', 36))}
            ${gravando ? '<span class="pulso-voz-anel"></span>' : ''}
          </div>
          <div class="voz-status-texto">
            ${gravando ? 'Ouvindo... Fale normalmente' : (processando ? 'Processando...' : 'Toque no microfone para falar')}
          </div>
          <div id="voz-transcricao-ao-vivo" class="voz-transcricao-box">
            ${transcricaoAtual ? esc(transcricaoAtual) : `Ex: "${esc(nomeAssistente)}, quais caminhões estão perto da revisão?"`}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;justify-content:center">
            <button class="btn btn-pequeno btn-neutro" style="font-size:11px" onclick="PatioVoz.enviarComandoTexto('Quais caminhões estão perto da revisão?')">🔍 Preventivas Próximas</button>
            <button class="btn btn-pequeno btn-neutro" style="font-size:11px" onclick="PatioVoz.enviarComandoTexto('Tem algum pós-venda pendente hoje?')">📞 Pós-Venda Pendente</button>
            <button class="btn btn-pequeno btn-neutro" style="font-size:11px" onclick="PatioVoz.enviarComandoTexto('Quantos veículos da frota estão na oficina?')">🚛 Frota na Oficina</button>
          </div>
        </div>

        ${htmlAcaoPendente}

        <div class="voz-input-texto-area">
          <input type="text" id="input-voz-texto" class="input-voz" placeholder="Ou digite o que você precisa..." onkeydown="if(event.key==='Enter') PatioVoz.enviarTextoDigitado()">
          <button class="btn btn-primario" onclick="PatioVoz.enviarTextoDigitado()">${ico('zap_send', 16)}</button>
        </div>

        ${htmlHistorico}

        <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--aco-200);text-align:center">
          <button class="btn btn-pequeno btn-neutro" style="font-size:11.5px;gap:6px;width:100%;display:flex;align-items:center;justify-content:center" onclick="PatioVoz.abrirConfiguracao()">
            ⚙️ Configurar Nome e Voz do Agente (${esc(nomeAssistente)})
          </button>
        </div>
      </div>
    `;
  }

  function abrirConfiguracao() {
    fecharDrawer();
    if (typeof abrirConfiguracoesAgente === 'function') {
      abrirConfiguracoesAgente();
    } else if (typeof abrirFolha === 'function' && typeof folhaConfigAssistente === 'function') {
      abrirFolha(folhaConfigAssistente);
    } else if (typeof irParaView === 'function') {
      irParaView('configuracoes');
    }
  }

  function enviarTextoDigitado() {
    const input = document.getElementById('input-voz-texto');
    if (!input || !input.value.trim()) return;
    const txt = input.value.trim();
    input.value = '';
    enviarComandoTexto(txt);
  }

  function injetarBotaoFlutuante() {
    if (document.getElementById('btn-voz-flutuante')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-voz-flutuante';
    btn.className = 'btn-voz-flutuante';
    btn.innerHTML = `${ico('mic', 24)}`;
    btn.setAttribute('title', 'Falar com o Pátio CRM');
    btn.onclick = toggleDrawer;
    document.body.appendChild(btn);
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injetarBotaoFlutuante);
  } else {
    injetarBotaoFlutuante();
  }

  return {
    iniciarGravacao,
    pararGravacao,
    toggleDrawer,
    abrirDrawer,
    fecharDrawer,
    toggleTTS,
    enviarComandoTexto,
    enviarTextoDigitado,
    confirmarAcaoPendente,
    cancelarAcaoPendente,
    testarVoz: (opts) => VoiceProviderAdapter.testarVoz(opts),
    abrirConfiguracao,
    getAvailableVoices: () => VoiceProviderAdapter.getAvailableVoices(),
    resolveVoice: (opts) => VoiceProviderAdapter.resolveVoice(opts),
    VoiceProviderAdapter
  };
})();

window.PatioVoz = PatioVoz;
