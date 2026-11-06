/**
 * Módulo: app_modals_sheets.js
 * Pátio-CRM — Gerenciador de Modais, Folhas Laterais e Toasts
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function abrirFolha(fn) {
    folhaAtual = fn;
    renderFolha();
    const vidro = document.getElementById('vidro');
    const folha = document.getElementById('folha');
    if (vidro) vidro.classList.add('on');
    if (folha) folha.classList.add('on');
  }

  function renderFolha() {
    const folha = document.getElementById('folha');
    if (folha && folhaAtual) {
      folha.innerHTML = typeof folhaAtual === 'function' ? folhaAtual() : folhaAtual;
    }
  }

  function fecharFolha() {
    const vidro = document.getElementById('vidro');
    const folha = document.getElementById('folha');
    if (vidro) vidro.classList.remove('on');
    if (folha) {
      folha.classList.remove('on');
      folha.classList.remove('folha-assistente');
    }
    folhaAtual = null;
  }

  function abrirModalGenerico(html) {
    abrirFolha(typeof html === 'function' ? html : () => html);
  }

  function fecharModalGenerico() {
    fecharFolha();
  }

  // Notificação toast genérica caso não haja implementador ativo
  function exibirToastGenerico(msg, tipo = 'info') {
    if (typeof torrar === 'function') {
      torrar(msg, tipo);
    }
  }

  // Exportações explícitas no escopo global
  global.abrirFolha = abrirFolha;
  global.renderFolha = renderFolha;
  global.fecharFolha = fecharFolha;
  global.abrirModalGenerico = abrirModalGenerico;
  global.fecharModalGenerico = fecharModalGenerico;
  global.exibirToastGenerico = exibirToastGenerico;

  if (typeof window !== 'undefined') {
    window.abrirFolha = abrirFolha;
    window.renderFolha = renderFolha;
    window.fecharFolha = fecharFolha;
    window.abrirModalGenerico = abrirModalGenerico;
    window.fecharModalGenerico = fecharModalGenerico;
    window.exibirToastGenerico = exibirToastGenerico;
  }
})(typeof window !== 'undefined' ? window : globalThis);

