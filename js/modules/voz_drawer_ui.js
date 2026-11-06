/* =====================================================================
   PÁTIO CRM — INTERFACE DE DRAWER, BOTÃO FLUTUANTE E TRANSCRIÇÃO DE VOZ
   Submódulo extraído de js/voz.js (< 350 linhas)
   ===================================================================== */

(function () {
  'use strict';

  const estado = (typeof window !== 'undefined' && window.__PatioVozState) || {
    gravando: false,
    processando: false,
    audioFeedbackAtivo: true,
    drawerAberto: false,
    transcricaoAtual: '',
    historicoComandos: []
  };
  if (typeof window !== 'undefined') window.__PatioVozState = estado;

  function toggleTTS() {
    estado.audioFeedbackAtivo = !estado.audioFeedbackAtivo;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('patio_voz_tts', estado.audioFeedbackAtivo ? 'true' : 'false');
    }
    renderDrawer();
    if (typeof torrar === 'function') {
      torrar(estado.audioFeedbackAtivo ? '🔊 Resposta por voz ativada' : '🔇 Resposta por voz silenciada');
    }
  }

  function abrirDrawer() {
    estado.drawerAberto = true;
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
    estado.drawerAberto = false;
    const el = document.getElementById('gaveta-voz');
    if (el) el.classList.remove('ativa');
  }

  function toggleDrawer() {
    if (estado.drawerAberto && !estado.gravando) {
      fecharDrawer();
    } else {
      abrirDrawer();
      if (!estado.gravando && window.__PatioVozRecording) {
        window.__PatioVozRecording.iniciarGravacao();
      }
    }
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
    btn.classList.toggle('gravando', estado.gravando);
    btn.classList.toggle('processando', estado.processando);

    const icone = btn.querySelector('.voz-icone-status');
    if (icone) {
      if (estado.gravando) icone.innerHTML = '🔴';
      else if (estado.processando) icone.innerHTML = '⏳';
      else icone.innerHTML = '🎙️';
    }
  }

  function renderDrawer() {
    const el = document.getElementById('gaveta-voz');
    if (!el) return;

    let statusTexto = 'Pronto para ouvir';
    if (estado.gravando) {
      statusTexto = '<span style="color:#ef4444;font-weight:700">Ouvindo...</span> Fale naturalmente';
    } else if (estado.processando) {
      statusTexto = '<span style="color:#3b82f6;font-weight:700">Processando NLU com IA...</span>';
    }

    let htmlAcaoPendente = '';
    const ultimoComando = estado.historicoComandos[0];
    if (ultimoComando && ultimoComando.pendenteConfirmacao && ultimoComando.token) {
      htmlAcaoPendente = `
        <div class="voz-card-confirmacao">
          <div class="voz-confirmacao-titulo">⚠️ Confirmação Necessária</div>
          <div class="voz-confirmacao-texto">${ultimoComando.resposta}</div>
          <div class="voz-confirmacao-botoes">
            <button class="btn btn-sucesso btn-pequeno" onclick="PatioVoz.confirmarAcaoPendente('${ultimoComando.token}')">Confirmar</button>
            <button class="btn btn-neutro btn-pequeno" onclick="PatioVoz.cancelarAcaoPendente('${ultimoComando.token}')">Cancelar</button>
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="gaveta-voz-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:20px">🎙️</span>
          <div>
            <div style="font-weight:700;font-size:15px">Assistente Operacional de Pátio</div>
            <div class="mini" style="color:var(--aco-500)">${statusTexto}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="btn-icone" onclick="PatioVoz.toggleTTS()" title="${estado.audioFeedbackAtivo ? 'Silenciar voz' : 'Ativar voz'}">
            ${estado.audioFeedbackAtivo ? '🔊' : '🔇'}
          </button>
          <button class="btn-icone" onclick="PatioVoz.abrirConfiguracao()" title="Configurar Assistente e Vozes">
            ⚙️
          </button>
          <button class="btn-fechar" onclick="PatioVoz.fecharDrawer()">✕</button>
        </div>
      </div>

      <div class="gaveta-voz-corpo">
        ${htmlAcaoPendente}

        <div class="gaveta-voz-historico">
          <div class="mini" style="font-weight:700;margin-bottom:6px;color:var(--aco-500)">HISTÓRICO RECENTE</div>
          ${estado.historicoComandos.length === 0 ? `
            <div class="mini" style="color:var(--aco-400);text-align:center;padding:16px">Nenhum comando recente.</div>
          ` : `
            ${estado.historicoComandos.map(h => `
              <div class="voz-item-historico">
                <div class="mini" style="color:var(--aco-500);display:flex;justify-content:space-between">
                  <span>${h.dataHora}</span>
                  <span class="mono">${h.acao || ''}</span>
                </div>
                <div style="font-size:12px;font-weight:600;margin:2px 0">"${h.comando}"</div>
                <div style="font-size:12px;color:var(--aco-700)">${h.resposta}</div>
              </div>
            `).join('')}
          `}
        </div>

        <div class="gaveta-voz-controles">
          <div id="voz-transcricao-ao-vivo" class="voz-transcricao-box ${estado.gravando ? 'ativo' : ''}">
            ${estado.transcricaoAtual || (estado.gravando ? 'Fale agora...' : 'Toque no microfone ou digite abaixo')}
          </div>

          <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
            <button class="btn ${estado.gravando ? 'btn-perigo' : 'btn-primario'}" style="flex:1;height:42px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px" onclick="${estado.gravando ? 'PatioVoz.pararGravacao()' : 'PatioVoz.iniciarGravacao()'}">
              <span>${estado.gravando ? '⏹️ Parar Gravação' : '🎙️ Falar Comando'}</span>
            </button>
          </div>

          <div style="display:flex;gap:6px;margin-top:10px">
            <input type="text" id="input-voz-texto" class="campo-texto" placeholder="Ou digite o comando aqui..." style="flex:1;height:34px;font-size:12px" onkeydown="if(event.key==='Enter') PatioVoz.enviarTextoDigitado()">
            <button class="btn btn-secundario btn-pequeno" onclick="PatioVoz.enviarTextoDigitado()">Enviar</button>
          </div>

          <div class="mini" style="margin-top:10px;color:var(--aco-400);font-size:11px;line-height:1.4">
            <b>Exemplos:</b> "Mover OS 102 para o box 3", "Finalizar OS 105", "Iniciar serviço de suspensão na OS 101", "Ver faturamento de hoje".
          </div>
        </div>
      </div>
    `;
  }

  function abrirConfiguracao() {
    if (typeof abrirModalConfigAssistente === 'function') {
      abrirModalConfigAssistente();
    } else if (typeof viewConfiguracoes === 'function') {
      if (typeof switchTab === 'function') switchTab('config');
    }
  }

  function enviarTextoDigitado() {
    const input = document.getElementById('input-voz-texto');
    if (!input || !input.value.trim()) return;
    const txt = input.value.trim();
    input.value = '';
    if (window.__PatioVozRecording) {
      window.__PatioVozRecording.enviarComandoTexto(txt);
    }
  }

  function injetarBotaoFlutuante() {
    if (document.getElementById('btn-voz-flutuante')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-voz-flutuante';
    btn.className = 'btn-voz-flutuante';
    btn.title = 'Assistente de Voz do Pátio (Clique para falar)';
    btn.innerHTML = '<span class="voz-icone-status">🎙️</span>';
    btn.onclick = () => toggleDrawer();
    document.body.appendChild(btn);
  }

  const uiModule = {
    toggleTTS,
    abrirDrawer,
    fecharDrawer,
    toggleDrawer,
    renderTranscricao,
    atualizarBotaoFlutuante,
    renderDrawer,
    abrirConfiguracao,
    enviarTextoDigitado,
    injetarBotaoFlutuante
  };

  if (typeof window !== 'undefined') {
    window.__PatioVozUI = uiModule;
  }
})();

