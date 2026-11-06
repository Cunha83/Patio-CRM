/**
 * Módulo: app_sync_auth.js
 * Pátio-CRM — Sincronização em Tempo Real, Autenticação de Sessão e Status de Conexão
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  let _checandoSync = false;

  function obterTokenSessao() {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem('patio_auth_token')) ||
             (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('patio_auth_token')) || '';
    } catch (_) {
      return '';
    }
  }

  function obterHeadersRequisicao(headersExtras = {}) {
    const token = obterTokenSessao();
    const headers = Object.assign({}, headersExtras);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function verificarAutenticacaoAtiva() {
    try {
      const token = obterTokenSessao();
      if (!token) {
        if (typeof abrirModalLogin === 'function') {
          setTimeout(abrirModalLogin, 60);
        }
        return false;
      }

      const meRes = await fetch('/api/auth/me', {
        headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : { 'Authorization': `Bearer ${token}` }
      });

      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user) {
          S.user = meData.user;
          S.perfil = meData.user.role;
          S.ui = S.ui || {};
          S.ui.perfilAtivo = meData.user.role;
          return true;
        }
      } else if (meRes.status === 401 || meRes.status === 403) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('patio_auth_token');
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('patio_auth_token');
        if (typeof abrirModalLogin === 'function') {
          setTimeout(abrirModalLogin, 60);
        }
      }
    } catch (_) {}
    return false;
  }

  async function checarAtualizacoesServidor() {
    if (_checandoSync) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof pendingLocalSave !== 'undefined' && pendingLocalSave) return;
    if (typeof folhaAtual !== 'undefined' && folhaAtual) return;

    const generation = typeof localGeneration !== 'undefined' ? localGeneration : 0;
    _checandoSync = true;

    try {
      const res = await fetch('/api/versao');
      if (res.ok) {
        const info = await res.json();
        const versaoLocal = (S && S.versao) || 0;
        const osLocal = (S && S.os || []).length;
        const veiLocal = (S && S.veiculos || []).length;

        if ((info.versao && info.versao > versaoLocal) || info.totalOS !== osLocal || info.totalVei !== veiLocal) {
          const resEst = await fetch('/api/estado');
          if (resEst.ok) {
            const novo = await resEst.json();
            if (novo && novo.os) {
              if (pendingLocalSave || folhaAtual || (typeof localGeneration !== 'undefined' && generation !== localGeneration)) return;
              const ui = S.ui;
              S = novo;
              S.ui = ui;
              if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
                S.ui.perfilAtivo = 'mecanico';
              }
              if (typeof armazem !== 'undefined' && armazem && typeof PatioSync !== 'undefined' && PatioSync.clone) {
                armazem.base = PatioSync.clone(novo);
              }
              try {
                if (typeof localStorage !== 'undefined' && typeof CHAVE !== 'undefined') {
                  localStorage.setItem(CHAVE, JSON.stringify(S));
                }
              } catch (_) {}

              if (!folhaAtual && typeof render === 'function') {
                render();
                const statusEl = document.getElementById('status-salvo');
                if (statusEl) {
                  statusEl.textContent = '● Pátio Atualizado';
                  statusEl.style.color = 'var(--verde)';
                  setTimeout(() => { if (statusEl) statusEl.textContent = '● Salvo'; }, 2000);
                }
              }
            }
          }
        }
      }
    } catch (_) {
    } finally {
      _checandoSync = false;
    }
  }

  function iniciarPollingSincronizacao(intervaloMs = 5000) {
    if (typeof setInterval !== 'undefined') {
      setInterval(checarAtualizacoesServidor, intervaloMs);
    }
  }

  // Exportações explícitas para window e globalThis
  global.obterTokenSessao = obterTokenSessao;
  global.obterHeadersRequisicao = obterHeadersRequisicao;
  global.verificarAutenticacaoAtiva = verificarAutenticacaoAtiva;
  global.checarAtualizacoesServidor = checarAtualizacoesServidor;
  global.iniciarPollingSincronizacao = iniciarPollingSincronizacao;

  if (typeof window !== 'undefined') {
    window.obterTokenSessao = obterTokenSessao;
    window.obterHeadersRequisicao = obterHeadersRequisicao;
    window.verificarAutenticacaoAtiva = verificarAutenticacaoAtiva;
    window.checarAtualizacoesServidor = checarAtualizacoesServidor;
    window.iniciarPollingSincronizacao = iniciarPollingSincronizacao;
  }
})(typeof window !== 'undefined' ? window : globalThis);

