/* Submódulo de Ações, Persistência e Briefing do Assistente: agent_config_actions.js */
/* Pátio-CRM — Submódulo extraído de js/modules/agent_config.js (< 350 linhas) */


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


if (typeof window !== 'undefined') {
  window.salvarConfigAssistenteModal = salvarConfigAssistenteModal;
  window.testarAlertasProativosModal = testarAlertasProativosModal;
  window.gerarEVisualizarBriefing = gerarEVisualizarBriefing;
}
if (typeof globalThis !== 'undefined') {
  globalThis.salvarConfigAssistenteModal = salvarConfigAssistenteModal;
  globalThis.testarAlertasProativosModal = testarAlertasProativosModal;
  globalThis.gerarEVisualizarBriefing = gerarEVisualizarBriefing;
}
