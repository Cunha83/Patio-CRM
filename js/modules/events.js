/**
 * Módulo Orquestrador e Roteador DOM: events.js
 * Pátio-CRM — Roteamento Centralizado de Eventos (Click, Input, Change, Keydown)
 * Arquitetura Modular (< 150 linhas).
 *
 * Delegações para submódulos de domínio:
 * - events_patio_os.js: ordens de serviço, itens, faturamento e veículos
 * - events_patio_boxes.js: boxes físicos, alocação, gargalos e apontamento
 * - events_estoque_compras.js: peças, compras, XML de fornecedores e OCR
 * - events_financeiro_caixa.js: títulos, cobrança, extrato e fechamento de caixa
 * - events_whatsapp_voz.js: réguas de cobrança, relatórios gerenciais e voz
 * - events_cadastros.js: CRUD de cadastros gerais e matriz tributária
 * - events_sistema_config.js: onboarding, preferências, logos, backups e migração
 */

// 1. ROTEAMENTO DE CLIQUES
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  const o = typeof OSatual === 'function' ? OSatual() : null;

  if (typeof tratarEventosPatioOS === 'function' && tratarEventosPatioOS(a, b, e, o)) return;
  if (typeof tratarEventosPatioBoxes === 'function' && tratarEventosPatioBoxes(a, b, e, o)) return;
  if (typeof tratarEventosEstoqueCompras === 'function' && tratarEventosEstoqueCompras(a, b, e, o)) return;
  if (typeof tratarEventosFinanceiroCaixa === 'function' && tratarEventosFinanceiroCaixa(a, b, e, o)) return;
  if (typeof tratarEventosFinanceiroBordero === 'function' && tratarEventosFinanceiroBordero(a, b, e, o)) return;
  if (typeof tratarEventosWhatsAppVoz === 'function' && tratarEventosWhatsAppVoz(a, b, e, o)) return;
  if (typeof tratarEventosCadastros === 'function' && tratarEventosCadastros(a, b, e, o)) return;
  if (typeof tratarEventosSistemaConfig === 'function' && tratarEventosSistemaConfig(a, b, e, o)) return;
});

// 2. ROTEAMENTO DE INPUTS REATIVOS
document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, o = typeof OSatual === 'function' ? OSatual() : null;
  const deb = typeof debounceSearch === 'function' ? debounceSearch : (fn => fn());

  if (a === 'busca') { S.ui.busca = el.value; renderFolha(); }
  if (a === 'busca-placa') { deb(() => { S.ui.buscaPlaca = el.value; render(); }); }
  if (a === 'busca-os') { deb(() => { S.ui.buscaOS = el.value; render(); }); }
  if (a === 'busca-cli') { deb(() => { S.ui.buscaCli = el.value; render(); }); }
  if (a === 'busca-peca') { deb(() => { S.ui.buscaPeca = el.value; render(); }); }
  if (a === 'busca-fin') { deb(() => { S.ui.buscaFin = el.value; render(); }); }
  if (a === 'busca-zap') { deb(() => { S.ui.buscaZap = el.value; render(); }); }
  if (a === 'busca-historico') { deb(() => { S.ui.buscaHistorico = el.value; render(); }); }
  if (a === 'busca-vendas') { deb(() => { S.ui.buscaVendas = el.value; render(); }); }
  if (a === 'rasc') { S.ui.rascunho = S.ui.rascunho || {}; S.ui.rascunho[el.dataset.c] = el.value; }
  if (a === 'rasc-v') { S.ui.rascVeiculo = S.ui.rascVeiculo || {}; S.ui.rascVeiculo[el.dataset.c] = el.value; }
  if (a === 'rasc-p') { S.ui.rascPeca = S.ui.rascPeca || {}; S.ui.rascPeca[el.dataset.c] = el.value; }
  if (a === 'rasc-c') { S.ui.rascCad = S.ui.rascCad || {}; S.ui.rascCad[el.dataset.c] = el.value; }
  if (a === 'camp-txt') { S.ui.camp = S.ui.camp || {}; S.ui.camp.texto = el.value; render(); }
  if (a === 'camp-nome') { S.ui.camp = S.ui.camp || {}; S.ui.camp.nome = el.value; }
  if (a === 'camp-seg') { S.ui.camp = S.ui.camp || {}; S.ui.camp.seg = el.value; render(); }
  if (a === 'regra-txt') { const r = (S.zap.regua || []).find(x => x.id === el.dataset.i); if (r) { r.texto = el.value; salvar(); } }
  if (a === 'regra-quando') { const r = (S.zap.regua || []).find(x => x.id === el.dataset.i); if (r) { r.quando = +el.value; salvar(); } }
  if (a === 'campo-os' && o) { o[el.dataset.c] = el.value; salvar(); }
  if (a === 'desc-os' && o) { o.desc = +el.value || 0; salvar(); renderFolha(); }
  if (a === 'km-os' && o) { o.km = +el.value || 0; salvar(); }
  if (a === 'val-item' && o) { const item = (o[el.dataset.t] || []).find(x => x.id === el.dataset.i); if (item) { item.valor = +el.value || 0; salvar(); } }
  if (a === 'campo-peca') { const p = typeof P === 'function' ? P(S.ui.pecaAberta) : null; if (p) { p[el.dataset.c] = el.dataset.tipo === 'number' ? (+el.value || 0) : el.value; salvar(); } }
});

// 3. ROTEAMENTO DE MUTAÇÕES CHANGE
document.addEventListener('change', e => {
  if (e.target && (e.target.id === 'cfg-input-logo' || e.target.id === 'cfg-input-institucional')) {
    if (typeof tratarChangeSistemaConfig === 'function' && tratarChangeSistemaConfig('', e.target, e, null)) return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  const o = typeof OSatual === 'function' ? OSatual() : null;

  if (typeof tratarChangePatioOS === 'function' && tratarChangePatioOS(a, el, e, o)) return;
  if (typeof tratarChangePatioBoxes === 'function' && tratarChangePatioBoxes(a, el, e, o)) return;
  if (typeof tratarChangeEstoqueCompras === 'function' && tratarChangeEstoqueCompras(a, el, e, o)) return;
  if (typeof tratarChangeFinanceiroCaixa === 'function' && tratarChangeFinanceiroCaixa(a, el, e, o)) return;
  if (typeof tratarChangeFinanceiroBordero === 'function' && tratarChangeFinanceiroBordero(a, el, e, o)) return;
  if (typeof tratarChangeWhatsAppVoz === 'function' && tratarChangeWhatsAppVoz(a, el, e, o)) return;
  if (typeof tratarChangeSistemaConfig === 'function' && tratarChangeSistemaConfig(a, el, e, o)) return;
});

// 4. ATALHOS GLOBAIS E FECHAMENTO
document.getElementById('vidro')?.addEventListener('click', fecharFolha);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && folhaAtual) fecharFolha(); });

// 5. EXPORTAÇÕES PÚBLICAS
(function (global) {
  'use strict';
  const exportsEvents = ['pedirConfirmacao', 'copiar', 'caiuNoTextarea', 'textoOrcamento', 'debounceSearch', 'lerArquivosXML'];
  exportsEvents.forEach(fn => {
    if (typeof global[fn] === 'function') {
      if (typeof window !== 'undefined') window[fn] = global[fn];
      if (typeof globalThis !== 'undefined') globalThis[fn] = global[fn];
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
