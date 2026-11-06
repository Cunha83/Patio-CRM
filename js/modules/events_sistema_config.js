/**
 * Módulo: events_sistema_config.js
 * Pátio-CRM — Handlers de Eventos: Sistema, Onboarding, Configurações, Logos, Backups e Migração
 * Arquitetura Modular (< 350 linhas).
 */

// Estado de confirmação em 2 etapas gerenciado via state.js (confirmando)
let _searchTimer = null;

function pedirConfirmacao(chave, msg, fn) {
  if (confirmando === chave) {
    confirmando = null;
    fn();
    return;
  }
  confirmando = chave;
  torrar(msg);
  setTimeout(() => {
    if (confirmando === chave) confirmando = null;
  }, 4000);
}

function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).catch(() => caiuNoTextarea(texto));
  } else {
    caiuNoTextarea(texto);
  }
}

function caiuNoTextarea(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}

function debounceSearch(fn, ms = 250) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(fn, ms);
}

function tratarEventosSistemaConfig(a, b, e, o) {
  switch (a) {
    case 'carregar-demo': {
      torrar('Carregando dados de demonstração...', 'neutro');
      fetch('/api/onboarding/demo-data', { method: 'POST', credentials: 'same-origin' })
        .then(r => r.json())
        .then(d => {
          if (d.sucesso) {
            torrar('Dados de demonstração carregados!', 'sucesso');
            setTimeout(() => location.reload(), 500);
          } else {
            torrar(d.erro || 'Erro ao carregar dados de exemplo.', 'erro');
          }
        })
        .catch(() => torrar('Erro de comunicação ao carregar dados de exemplo.', 'erro'));
      return true;
    }

    case 'remover-demo': {
      pedirConfirmacao('remover-demo', 'Tem certeza que deseja remover todos os dados de demonstração?', () => {
        torrar('Removendo dados de demonstração...', 'neutro');
        fetch('/api/onboarding/demo-data', { method: 'DELETE', credentials: 'same-origin' })
          .then(r => r.json())
          .then(d => {
            if (d.sucesso) {
              torrar('Dados de demonstração removidos!', 'sucesso');
              setTimeout(() => location.reload(), 500);
            } else {
              torrar(d.erro || 'Erro ao remover dados de exemplo.', 'erro');
            }
          })
          .catch(() => torrar('Erro de comunicação ao remover dados de exemplo.', 'erro'));
      });
      return true;
    }

    case 'concluir-onboarding':
      S.cfg = S.cfg || {};
      S.cfg.onboardingConcluido = true;
      salvar(); render();
      torrar('Guia de implantação concluído! Bom trabalho na oficina.', 'sucesso');
      return true;

    case 'reabrir-onboarding':
      S.cfg = S.cfg || {};
      S.cfg.onboardingConcluido = false;
      salvar(); render();
      torrar('Guia de implantação reaberto.');
      return true;

    case 'ir':
      navegarPara(b.dataset.v);
      return true;

    case 'filtro':
      S.ui.filtro = b.dataset.f;
      render();
      return true;

    case 'fechar':
      fecharFolha();
      return true;

    case 'excluir-lote': {
      const entidade = b.dataset.entidade || 'os';
      const checkboxes = document.querySelectorAll(`input[name="sel-${entidade}"]:checked`);
      const ids = Array.from(checkboxes).map(c => c.value);
      if (!ids.length) {
        torrar('Selecione ao menos um item para excluir.');
        return true;
      }
      pedirConfirmacao('lote_' + entidade, `Confirmar exclusão de ${ids.length} item(ns)?`, () => {
        fetch(`/api/${entidade}/lote`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids })
        })
          .then(r => r.json())
          .then(d => {
            if (d.success) {
              const idsSet = new Set(ids);
              if (entidade === 'os') S.os = S.os.filter(x => !idsSet.has(x.id));
              else if (entidade === 'produtos' || entidade === 'pecas') S.pecas = S.pecas.filter(x => !idsSet.has(x.id));
              salvar(); render();
              torrar(`${d.count} item(ns) excluído(s) com sucesso!`, 'sucesso');
            } else {
              torrar(d.error || 'Erro ao excluir itens em lote.', 'erro');
            }
          })
          .catch(() => torrar('Erro de rede ao excluir em lote.', 'erro'));
      });
      return true;
    }

    case 'exportar-csv':
      exportarCSV(b.dataset.tipo);
      return true;

    case 'exportar-backup-json':
      exportarBackupJSON();
      return true;

    case 'abrir-importador-sistemas':
      abrirImportadorSistemas();
      return true;

    case 'baixar-template-csv':
      baixarTemplateCSV(b.dataset.tipo);
      return true;

    case 'cancelar-migracao':
      window._dadosMigracao = null;
      renderFolha();
      return true;

    case 'executar-importacao-confirmada':
      executarImportacaoConfirmada();
      return true;

    case 'remover-logo': {
      if (S.cfg && S.cfg.identidadeVisual) {
        S.cfg.identidadeVisual.logo = null;
        S.cfg.identidadeVisual.logoUrl = null;
      }
      if (S.cfg) S.cfg.logoEmpresa = null;
      fetch('/api/configuracoes/empresa/logo', { method: 'DELETE' }).catch(() => {});
      salvar(); render();
      torrar('Logotipo removido.', 'sucesso');
      return true;
    }

    case 'remover-institucional': {
      if (S.cfg && S.cfg.identidadeVisual) {
        S.cfg.identidadeVisual.imagemInstitucional = null;
        S.cfg.identidadeVisual.imagemInstitucionalUrl = null;
      }
      if (S.cfg) S.cfg.imagemInstitucional = null;
      fetch('/api/configuracoes/empresa/imagem-institucional', { method: 'DELETE' }).catch(() => {});
      salvar(); render();
      torrar('Imagem institucional removida.', 'sucesso');
      return true;
    }

    case 'salvar-cfg':
      salvar();
      torrar('Configurações salvas!');
      return true;

    case 'zerar':
      pedirConfirmacao('zerar', 'Toque de novo para restaurar a demonstração inicial', () => {
        S = sementes();
        salvar(); render();
        torrar('Dados de demonstração restaurados!');
      });
      return true;

    default:
      return false;
  }
}

function tratarChangeSistemaConfig(a, el, e, o) {
  if (el.id === 'cfg-input-logo') {
    const file = el.files && el.files[0];
    if (!file) return true;
    if (file.size > 2 * 1024 * 1024) { torrar('Arquivo muito grande! Máximo permitido: 2MB.', 'erro'); return true; }
    const reader = new FileReader();
    torrar('Processando logotipo...', 'neutro');
    reader.onload = async ev => {
      const base64 = ev.target.result;
      try {
        const r = await fetch('/api/configuracoes/empresa/logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logoBase64: base64, mimeType: file.type || 'image/png' })
        });
        const res = await r.json();
        const url = res.url || base64;
        S.cfg = S.cfg || {};
        S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
        S.cfg.identidadeVisual.logoUrl = url;
        S.cfg.identidadeVisual.logo = url;
        S.cfg.logoEmpresa = url;
        salvar(); render();
        torrar('Logotipo salvo com sucesso!', 'sucesso');
      } catch (err) {
        S.cfg = S.cfg || {};
        S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
        S.cfg.identidadeVisual.logo = base64;
        S.cfg.logoEmpresa = base64;
        salvar(); render();
        torrar('Logotipo salvo localmente!', 'sucesso');
      }
    };
    reader.readAsDataURL(file);
    return true;
  }

  if (el.id === 'cfg-input-institucional') {
    const file = el.files && el.files[0];
    if (!file) return true;
    if (file.size > 2 * 1024 * 1024) { torrar('Arquivo muito grande! Máximo permitido: 2MB.', 'erro'); return true; }
    const reader = new FileReader();
    torrar('Processando imagem institucional...', 'neutro');
    reader.onload = async ev => {
      const base64 = ev.target.result;
      try {
        const r = await fetch('/api/configuracoes/empresa/imagem-institucional', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagemBase64: base64, mimeType: file.type || 'image/png' })
        });
        const res = await r.json();
        const url = res.url || base64;
        S.cfg = S.cfg || {};
        S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
        S.cfg.identidadeVisual.imagemInstitucionalUrl = url;
        S.cfg.identidadeVisual.imagemInstitucional = url;
        S.cfg.imagemInstitucional = url;
        salvar(); render();
        torrar('Imagem institucional salva com sucesso!', 'sucesso');
      } catch (err) {
        S.cfg = S.cfg || {};
        S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
        S.cfg.identidadeVisual.imagemInstitucional = base64;
        S.cfg.imagemInstitucional = base64;
        salvar(); render();
        torrar('Imagem institucional salva localmente!', 'sucesso');
      }
    };
    reader.readAsDataURL(file);
    return true;
  }

  if (a === 'mudar-perfil') {
    S.ui = S.ui || {};
    S.ui.perfilAtivo = el.value || 'todos';
    salvar(); render();
    return true;
  }

  if (a === 'cfg') {
    S.cfg[el.dataset.c] = el.dataset.tipo === 'number' ? (+el.value || 0) : el.value;
    salvar(); render();
    return true;
  }

  if (a === 'cfg-prev') {
    S.cfg.manutencaoPreventiva = S.cfg.manutencaoPreventiva || {};
    S.cfg.manutencaoPreventiva[el.dataset.c] = (+el.value || 0);
    salvar(); render();
    return true;
  }

  if (a === 'restaurar-backup-json' || a === 'arquivo-migracao-input') {
    if (el.files && el.files.length > 0) {
      abrirFolha(folhaImportacaoSistemas);
      processarArquivosMigracao(el.files);
      el.value = '';
    }
    return true;
  }

  return false;
}

if (typeof window !== 'undefined') {
  window.pedirConfirmacao = pedirConfirmacao;
  window.copiar = copiar;
  window.caiuNoTextarea = caiuNoTextarea;
  window.debounceSearch = debounceSearch;
  window.tratarEventosSistemaConfig = tratarEventosSistemaConfig;
  window.tratarChangeSistemaConfig = tratarChangeSistemaConfig;
}
if (typeof globalThis !== 'undefined') {
  globalThis.pedirConfirmacao = pedirConfirmacao;
  globalThis.copiar = copiar;
  globalThis.caiuNoTextarea = caiuNoTextarea;
  globalThis.debounceSearch = debounceSearch;
  globalThis.tratarEventosSistemaConfig = tratarEventosSistemaConfig;
  globalThis.tratarChangeSistemaConfig = tratarChangeSistemaConfig;
}
