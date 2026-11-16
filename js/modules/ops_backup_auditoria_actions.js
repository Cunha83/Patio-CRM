/**
 * js/modules/ops_backup_auditoria_actions.js
 *
 * Ações e Delegação Global de Eventos DOM para Cofre de Backup e Auditoria de Integridade.
 * Teto Modular: <= 245 linhas
 */

(function(root) {
  'use strict';

  async function apiFetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  function abrirModalGerarSnapshot() {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalGerarSnapshotBackupHtml === 'function') {
      root.abrirModalGenerico(root.modalGerarSnapshotBackupHtml());
    }
  }

  async function confirmarGerarSnapshotAction() {
    const motivo = document.getElementById('snpMotivoInput')?.value || 'backup_preventivo_producao';
    try {
      const data = await apiFetchJson('/api/ops/backups/gerar-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('Snapshot SHA-256 gerado e armazenado com sucesso!', 'success');
      await atualizarPainelBackupAuditoriaAction();
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(err.message, 'error');
    }
  }

  function abrirModalRestaurarSnapshot(snapshotId) {
    const snapshots = root._ultimoOpsHistorico?.snapshots || [];
    const snapshot = snapshots.find(s => s.snapshotId === snapshotId || s.id === snapshotId) || { snapshotId };
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalRestaurarSnapshotBackupHtml === 'function') {
      root.abrirModalGenerico(root.modalRestaurarSnapshotBackupHtml(snapshot));
    }
  }

  async function confirmarRestaurarSnapshotAction() {
    const snapshotId = document.getElementById('rstSnapshotIdInput')?.value;
    const confirmado = document.getElementById('chkConfirmarRestauracao')?.checked;

    if (!confirmado) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao('É necessário marcar a caixa de confirmação de restauração.', 'warning');
      return;
    }

    try {
      const data = await apiFetchJson('/api/ops/backups/restaurar-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId, confirmarRestauracao: true })
      });
      if (typeof root.fecharModalGenerico === 'function') root.fecharModalGenerico();
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Banco restaurado com sucesso! ${data.totalRegistrosRestaurados} itens restaurados.`, 'success');
      await atualizarPainelBackupAuditoriaAction();
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(`Falha ao restaurar: ${err.message}`, 'error');
    }
  }

  async function executarAuditoriaIntegridadeAction(reparar = false) {
    try {
      const data = await apiFetchJson('/api/ops/auditoria/integridade-cruzada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repararInconsistenciasLeves: !!reparar })
      });
      const msg = reparar
        ? `Auditoria concluída com auto-reparo! Score: ${data.laudo?.scoreIntegridadeErp}/100.`
        : `Auditoria concluída! Score de Integridade: ${data.laudo?.scoreIntegridadeErp}/100.`;
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(msg, data.laudo?.scoreIntegridadeErp >= 90 ? 'success' : 'warning');
      await atualizarPainelBackupAuditoriaAction();
      return data;
    } catch (err) {
      if (typeof root.mostrarNotificacao === 'function') root.mostrarNotificacao(err.message, 'error');
    }
  }

  async function atualizarPainelBackupAuditoriaAction() {
    try {
      const data = await apiFetchJson('/api/ops/backups/historico');
      root._ultimoOpsHistorico = data;
      return data;
    } catch (_) {}
  }

  function initDelegacaoEventosBackupAuditoria() {
    if (typeof document === 'undefined') return;
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'abrir-modal-gerar-snapshot-btn') abrirModalGerarSnapshot();
      else if (act === 'confirmar-gerar-snapshot-action') confirmarGerarSnapshotAction();
      else if (act === 'abrir-modal-restaurar-snapshot-btn') {
        const sId = btn.getAttribute('data-snapshot-id');
        abrirModalRestaurarSnapshot(sId);
      }
      else if (act === 'confirmar-restaurar-snapshot-action') confirmarRestaurarSnapshotAction();
      else if (act === 'executar-auditoria-integridade-btn') executarAuditoriaIntegridadeAction(false);
      else if (act === 'executar-auditoria-com-reparo-btn') executarAuditoriaIntegridadeAction(true);
      else if (act === 'atualizar-painel-backup-auditoria-btn') atualizarPainelBackupAuditoriaAction();
    });
  }

  initDelegacaoEventosBackupAuditoria();

  root.abrirModalGerarSnapshot = abrirModalGerarSnapshot;
  root.confirmarGerarSnapshotAction = confirmarGerarSnapshotAction;
  root.abrirModalRestaurarSnapshot = abrirModalRestaurarSnapshot;
  root.confirmarRestaurarSnapshotAction = confirmarRestaurarSnapshotAction;
  root.executarAuditoriaIntegridadeAction = executarAuditoriaIntegridadeAction;
  root.atualizarPainelBackupAuditoriaAction = atualizarPainelBackupAuditoriaAction;

})(typeof window !== 'undefined' ? window : globalThis);

