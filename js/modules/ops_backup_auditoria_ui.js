/**
 * js/modules/ops_backup_auditoria_ui.js
 *
 * Componentes de UI: Cofre de Backup Criptografado SHA-256 e
 * Painel de Governança e Auditoria de Integridade Cruzada do ERP.
 * Teto Modular: <= 245 linhas
 */

(function(root) {
  'use strict';

  const esc = s => (!s ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  function renderPainelBackupEAuditoriaIntegridadeHtml(dados = {}) {
    const snapshots = dados.snapshots || [];
    const auditorias = dados.auditorias || [];
    const ultimoLaudo = auditorias[0] || { scoreIntegridadeErp: 100, statusGeral: 'integro', totalInconsistencias: 0 };
    const score = Number(ultimoLaudo.scoreIntegridadeErp ?? 100);
    const badgeCor = score >= 90 ? 'success' : (score >= 60 ? 'warning' : 'danger');

    return `
      <div class="backup-auditoria-container p-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="mb-0">🛡️ Cofre de Backup SHA-256 & Integridade Cruzada ERP</h5>
            <small class="text-muted">Snapshots atômicos anti-tamper, restauração verificada e governança 360º.</small>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-primary" data-act="abrir-modal-gerar-snapshot-btn">📸 Novo Snapshot</button>
            <button class="btn btn-sm btn-outline-info" data-act="executar-auditoria-integridade-btn">🔍 Auditar ERP</button>
            <button class="btn btn-sm btn-outline-warning" data-act="executar-auditoria-com-reparo-btn">🛠️ Auto-Reparar</button>
            <button class="btn btn-sm btn-outline-secondary" data-act="atualizar-painel-backup-auditoria-btn">🔄 Atualizar</button>
          </div>
        </div>

        <!-- CARDS DE GOVERNANÇA E SAÚDE -->
        <div class="row g-2 mb-3">
          <div class="col-md-3">
            <div class="card p-2 text-center border-${badgeCor} shadow-sm">
              <span class="text-muted small">Score de Integridade ERP</span>
              <h4 class="text-${badgeCor} my-1">${score}/100</h4>
              <span class="badge bg-${badgeCor}">${esc(ultimoLaudo.statusGeral?.toUpperCase() || 'ÍNTEGRO')}</span>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 text-center border-primary shadow-sm">
              <span class="text-muted small">Snapshots no Cofre</span>
              <h4 class="text-primary my-1">${snapshots.length}</h4>
              <small class="text-muted">Protegidos com SHA-256</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 text-center border-info shadow-sm">
              <span class="text-muted small">Auditorias Realizadas</span>
              <h4 class="text-info my-1">${auditorias.length}</h4>
              <small class="text-muted">Inconsistências: ${ultimoLaudo.totalInconsistencias || 0}</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-2 text-center border-success shadow-sm">
              <span class="text-muted small">Release Ativa</span>
              <h4 class="text-success my-1">v2.1.0</h4>
              <small class="text-muted">Autonomous Enterprise</small>
            </div>
          </div>
        </div>

        <!-- COFRE DE SNAPSHOTS -->
        <div class="card p-3 mb-3 shadow-sm">
          <h6 class="mb-2">📦 Cofre de Snapshots e Backups Atômicos (Anti-Tamper SHA-256)</h6>
          <div class="table-responsive" style="max-height: 200px; overflow-y: auto;">
            <table class="table table-sm table-hover small mb-0">
              <thead><tr><th>ID Snapshot</th><th>Data/Hora</th><th>Motivo</th><th>Registros</th><th>Hash SHA-256</th><th>Ação</th></tr></thead>
              <tbody>
                ${snapshots.length === 0 ? '<tr><td colspan="6" class="text-muted text-center">Nenhum snapshot no cofre</td></tr>' : snapshots.map(s => `
                  <tr>
                    <td><code>${esc(s.snapshotId)}</code></td>
                    <td>${new Date(s.criadoEm).toLocaleString()}</td>
                    <td>${esc(s.motivo)}</td>
                    <td><span class="badge bg-secondary">${s.totalRegistrosAuditados} itens</span></td>
                    <td><span class="badge bg-dark font-monospace">${String(s.checksumSha256 || '').slice(0, 12)}...</span></td>
                    <td>
                      <button class="btn btn-xs btn-outline-danger" data-act="abrir-modal-restaurar-snapshot-btn" data-snapshot-id="${esc(s.snapshotId)}">Restaurar</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- HISTÓRICO DE AUDITORIAS -->
        <div class="card p-3 shadow-sm">
          <h6 class="mb-2">📋 Histórico de Auditorias de Integridade Cruzada</h6>
          <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
            <table class="table table-sm table-hover small mb-0">
              <thead><tr><th>Laudo ID</th><th>Data</th><th>Score</th><th>Status</th><th>Inconsistências</th><th>Reparos</th></tr></thead>
              <tbody>
                ${auditorias.length === 0 ? '<tr><td colspan="6" class="text-muted text-center">Nenhuma auditoria registrada</td></tr>' : auditorias.map(a => `
                  <tr>
                    <td><code>${esc(a.laudoId)}</code></td>
                    <td>${new Date(a.timestamp).toLocaleString()}</td>
                    <td><strong>${a.scoreIntegridadeErp}</strong></td>
                    <td><span class="badge bg-${a.scoreIntegridadeErp >= 90 ? 'success' : (a.scoreIntegridadeErp >= 60 ? 'warning' : 'danger')}">${esc(a.statusGeral)}</span></td>
                    <td>${a.totalInconsistencias || 0}</td>
                    <td>${a.totalReparos || 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function modalGerarSnapshotBackupHtml() {
    return `
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">📸 Gerar Snapshot de Backup SHA-256</h5><button type="button" class="btn-close" data-act="fechar-modal-generico-btn"></button></div>
        <div class="modal-body">
          <p class="small text-muted">Este procedimento captura e serializa atomicamente todas as coleções operacionais e calcula o hash SHA-256 criptográfico para prevenção de adulteração.</p>
          <div class="mb-2">
            <label class="form-label small">Motivo do Snapshot</label>
            <input id="snpMotivoInput" type="text" class="form-control form-control-sm" value="backup_preventivo_producao" placeholder="Ex: virada_sprint, antes_migracao">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary btn-sm" data-act="fechar-modal-generico-btn">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" data-act="confirmar-gerar-snapshot-action">Gerar e Assinar</button>
        </div>
      </div></div>
    `;
  }

  function modalRestaurarSnapshotBackupHtml(snapshot = {}) {
    const sId = snapshot.snapshotId || snapshot.id || '';
    return `
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header bg-danger text-white"><h5 class="modal-title">⚠️ Restaurar Snapshot de Backup</h5><button type="button" class="btn-close btn-close-white" data-act="fechar-modal-generico-btn"></button></div>
        <div class="modal-body">
          <div class="alert alert-warning small mb-3">
            <strong>Atenção:</strong> A restauração sobrescreverá atomicamente os dados do ERP com o conteúdo do snapshot selecionado após validação criptográfica do hash SHA-256.
          </div>
          <div class="mb-2"><label class="form-label small">ID do Snapshot</label><input id="rstSnapshotIdInput" type="text" class="form-control form-control-sm" value="${esc(sId)}" readonly></div>
          <div class="mb-2"><label class="form-label small">Hash Criptográfico SHA-256</label><input type="text" class="form-control form-control-sm font-monospace" value="${esc(snapshot.checksumSha256 || 'Calculado automaticamente')}" readonly></div>
          <div class="form-check mt-3">
            <input class="form-check-input" type="checkbox" id="chkConfirmarRestauracao">
            <label class="form-check-label small text-danger" for="chkConfirmarRestauracao">
              Estou ciente e autorizo a restauração atômica do banco.
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary btn-sm" data-act="fechar-modal-generico-btn">Cancelar</button>
          <button type="button" class="btn btn-danger btn-sm" data-act="confirmar-restaurar-snapshot-action">Restaurar Banco</button>
        </div>
      </div></div>
    `;
  }

  root.renderPainelBackupEAuditoriaIntegridadeHtml = renderPainelBackupEAuditoriaIntegridadeHtml;
  root.modalGerarSnapshotBackupHtml = modalGerarSnapshotBackupHtml;
  root.modalRestaurarSnapshotBackupHtml = modalRestaurarSnapshotBackupHtml;

})(typeof window !== 'undefined' ? window : globalThis);

