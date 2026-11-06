/* =====================================================================
   PÁTIO CRM — RECONHECIMENTO DE VOZ, GRAVAÇÃO E NLU COM SERVIDOR
   Submódulo extraído de js/voz.js (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  const estado = (typeof window !== 'undefined' && window.__PatioVozState) || {
    gravando: false,
    processando: false,
    audioFeedbackAtivo: true,
    recognition: null,
    mediaRecorder: null,
    audioChunks: [],
    drawerAberto: false,
    transcricaoAtual: '',
    historicoComandos: []
  };
  if (typeof window !== 'undefined') window.__PatioVozState = estado;

  const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const temSpeechAPI = !!SpeechRecognition;

  async function iniciarGravacao() {
    if (estado.gravando || estado.processando) return;
    estado.transcricaoAtual = '';
    if (typeof window !== 'undefined' && window.__PatioVozUI && window.__PatioVozUI.abrirDrawer) {
      window.__PatioVozUI.abrirDrawer();
    }

    if (temSpeechAPI) {
      iniciarSpeechRecognition();
    } else {
      iniciarMediaRecorder();
    }
  }

  function iniciarSpeechRecognition() {
    try {
      estado.recognition = new SpeechRecognition();
      estado.recognition.lang = 'pt-BR';
      estado.recognition.continuous = false;
      estado.recognition.interimResults = true;

      estado.recognition.onstart = () => {
        estado.gravando = true;
        if (window.__PatioVozUI) {
          window.__PatioVozUI.atualizarBotaoFlutuante();
          window.__PatioVozUI.renderDrawer();
        }
      };

      estado.recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            estado.transcricaoAtual = event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (window.__PatioVozUI) {
          window.__PatioVozUI.renderTranscricao(estado.transcricaoAtual || interim);
        }
      };

      estado.recognition.onerror = (event) => {
        console.warn('[PatioVoz] Erro no reconhecimento SpeechAPI:', event.error);
        if (event.error !== 'no-speech' && typeof torrar === 'function') {
          torrar('Microfone: ' + event.error);
        }
        pararGravacao();
      };

      estado.recognition.onend = () => {
        const textoFinal = estado.transcricaoAtual.trim();
        estado.gravando = false;
        if (window.__PatioVozUI) {
          window.__PatioVozUI.atualizarBotaoFlutuante();
          window.__PatioVozUI.renderDrawer();
        }

        if (textoFinal) {
          enviarComandoTexto(textoFinal);
        }
      };

      estado.recognition.start();
    } catch (e) {
      console.warn('[PatioVoz] Falha ao iniciar SpeechRecognition, usando MediaRecorder:', e);
      iniciarMediaRecorder();
    }
  }

  async function iniciarMediaRecorder() {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof torrar === 'function') torrar('Navegador sem suporte para gravação de áudio.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      estado.audioChunks = [];
      estado.mediaRecorder = new MediaRecorder(stream);

      estado.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) estado.audioChunks.push(e.data);
      };

      estado.mediaRecorder.onstart = () => {
        estado.gravando = true;
        if (window.__PatioVozUI) {
          window.__PatioVozUI.atualizarBotaoFlutuante();
          window.__PatioVozUI.renderDrawer();
        }
      };

      estado.mediaRecorder.onstop = async () => {
        estado.gravando = false;
        if (window.__PatioVozUI) {
          window.__PatioVozUI.atualizarBotaoFlutuante();
        }
        stream.getTracks().forEach(track => track.stop());

        if (estado.audioChunks.length > 0) {
          const blob = new Blob(estado.audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result;
            enviarComandoAudio(base64, 'audio/webm');
          };
          reader.readAsDataURL(blob);
        }
      };

      estado.mediaRecorder.start();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Não foi possível acessar o microfone. Verifique as permissões.');
      console.error('[PatioVoz] Erro getUserMedia:', err);
      estado.gravando = false;
      if (window.__PatioVozUI) {
        window.__PatioVozUI.atualizarBotaoFlutuante();
        window.__PatioVozUI.renderDrawer();
      }
    }
  }

  function pararGravacao() {
    if (estado.recognition && estado.gravando) {
      try { estado.recognition.stop(); } catch (_) {}
    }
    if (estado.mediaRecorder && estado.mediaRecorder.state === 'recording') {
      try { estado.mediaRecorder.stop(); } catch (_) {}
    }
    estado.gravando = false;
    if (window.__PatioVozUI) {
      window.__PatioVozUI.atualizarBotaoFlutuante();
      window.__PatioVozUI.renderDrawer();
    }
  }

  async function enviarComandoTexto(texto) {
    if (!texto || !texto.trim()) return;
    estado.processando = true;
    if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();

    const activeOsId = (typeof folhaAtual !== 'undefined' && folhaAtual && typeof S !== 'undefined' && S?.ui?.osAberta) ? S.ui.osAberta : null;

    try {
      const res = await fetch('/api/comando-voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: texto.trim(),
          context: { canal: 'web', activeOsId: activeOsId }
        })
      });

      const data = await res.json();
      await processarRespostaDoServidor(data, texto);
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro ao processar comando de voz com o servidor.');
      console.error('[PatioVoz] Erro POST /api/comando-voz:', err);
    } finally {
      estado.processando = false;
      if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();
    }
  }

  async function enviarComandoAudio(audioBase64, mimeType) {
    if (!audioBase64) return;
    estado.processando = true;
    if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();

    const activeOsId = (typeof folhaAtual !== 'undefined' && folhaAtual && typeof S !== 'undefined' && S?.ui?.osAberta) ? S.ui.osAberta : null;

    try {
      const res = await fetch('/api/comando-voz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          context: { canal: 'web', activeOsId: activeOsId }
        })
      });

      const data = await res.json();
      await processarRespostaDoServidor(data, '[Áudio processado]');
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro ao enviar áudio para o servidor.');
      console.error('[PatioVoz] Erro audio POST /api/comando-voz:', err);
    } finally {
      estado.processando = false;
      if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();
    }
  }

  async function confirmarAcaoPendente(token) {
    if (!token) return;
    estado.processando = true;
    if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();

    try {
      const res = await fetch('/api/comando-voz/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await res.json();
      await processarRespostaDoServidor(data, 'Ação confirmada');
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro ao confirmar ação pendente.');
    } finally {
      estado.processando = false;
      if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();
    }
  }

  async function cancelarAcaoPendente(token) {
    if (window.__PatioVozUI) window.__PatioVozUI.fecharDrawer();
    if (typeof torrar === 'function') torrar('Ação cancelada com segurança.');
  }

  async function processarRespostaDoServidor(data, comandoOriginal) {
    if (!data) return;

    estado.historicoComandos.unshift({
      comando: comandoOriginal,
      resposta: data.resposta || 'Comando executado.',
      acao: data.acao,
      osId: data.osId,
      numOS: data.numOS,
      pendenteConfirmacao: data.pendenteConfirmacao,
      token: data.token,
      dataHora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    if (estado.historicoComandos.length > 5) estado.historicoComandos.length = 5;

    if (data.resposta) {
      if (typeof falarTexto === 'function') falarTexto(data.resposta);
      else if (window.PatioVoz && window.PatioVoz.falarTexto) window.PatioVoz.falarTexto(data.resposta);
      if (typeof torrar === 'function') torrar(data.resposta, 3500);
    }

    if (data.novoEstado || data.ok) {
      try {
        const resEstado = await fetch('/api/estado');
        if (resEstado.ok) {
          const novo = await resEstado.json();
          if (novo && novo.os && typeof S !== 'undefined') {
            const ui = S.ui;
            S = novo;
            S.ui = ui;
            if (typeof PatioSync !== 'undefined' && typeof armazem !== 'undefined') {
              armazem.base = PatioSync.clone(novo);
            }
            try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}

            if (data.acao === 'abrir_os' && data.osId) {
              S.ui.osAberta = data.osId;
              S.ui.abaOS = 'servicos';
              S.ui.view = 'patio';
              if (typeof abrirFolha === 'function' && typeof folhaOS === 'function') {
                abrirFolha(folhaOS);
              }
            } else if (typeof renderFolha === 'function' && typeof folhaAtual !== 'undefined' && folhaAtual) {
              renderFolha();
            }

            if (typeof render === 'function') render();
          }
        }
      } catch (errSync) {
        console.warn('[PatioVoz] Erro ao sincronizar estado após voz:', errSync);
      }
    }

    if (window.__PatioVozUI) window.__PatioVozUI.renderDrawer();
  }

  const recordingModule = {
    iniciarGravacao,
    pararGravacao,
    enviarComandoTexto,
    enviarComandoAudio,
    confirmarAcaoPendente,
    cancelarAcaoPendente,
    processarRespostaDoServidor
  };

  if (typeof window !== 'undefined') {
    window.__PatioVozRecording = recordingModule;
  }
})();

