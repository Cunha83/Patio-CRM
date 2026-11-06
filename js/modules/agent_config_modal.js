/* Submódulo de Drawer e Modal de Configuração do Assistente: agent_config_modal.js */
/* Pátio-CRM — Submódulo extraído de js/modules/agent_config.js (< 350 linhas) */

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


if (typeof window !== 'undefined') {
  window.folhaConfigAssistente = folhaConfigAssistente;
  window.abrirConfiguracoesAgente = abrirConfiguracoesAgente;
}
if (typeof globalThis !== 'undefined') {
  globalThis.folhaConfigAssistente = folhaConfigAssistente;
  globalThis.abrirConfiguracoesAgente = abrirConfiguracoesAgente;
}
