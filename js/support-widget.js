/* Suporte do produto: histórico no servidor, sem credenciais ou conversas no navegador. */
(() => {
  'use strict';
  if (document.getElementById('patio-support')) return;
  const host = document.createElement('div');
  host.id = 'patio-support'; host.style.cssText = 'position:relative;z-index:10000';
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <button class="launcher" aria-expanded="false">Ajuda e suporte</button>
    <section class="panel" aria-label="Suporte Pátio CRM" hidden>
      <header class="support-header"><div><h2>Como podemos ajudar?</h2><p>Assistente virtual · Pátio CRM</p></div><button class="icon-button" aria-label="Fechar suporte">×</button></header>
      <div class="notice" role="status" hidden></div>
      <div class="intro"><h3>Suporte para sua operação</h3><p class="privacy"></p><label class="consent" hidden><input type="checkbox">Autorizo o envio da minha dúvida ao Google Gemini para identificar o assunto. É opcional.</label><button class="primary start">Iniciar atendimento</button><div class="history" aria-label="Seus atendimentos"></div></div>
      <div class="ticket-strip" hidden></div><div class="messages" role="log" aria-label="Conversa" aria-live="polite" hidden></div>
      <form class="composer" hidden><label for="support-text">Sua mensagem</label><textarea id="support-text" maxlength="4000" placeholder="Descreva a tela e a dificuldade. Não envie senhas." required></textarea><div class="composer-row"><small>Respostas baseadas na ajuda do sistema</small><button class="primary" type="submit">Enviar</button></div></form>
      <div class="actions" hidden><button class="secondary handoff">Pedir atendimento humano</button><button class="secondary resolve">Encerrar</button><button class="secondary back">Meus atendimentos</button></div>
    </section>`;
  const $ = s => root.querySelector(s);
  const labels = { bot: 'Assistente virtual', waiting_human: 'Aguardando equipe', human: 'Atendimento humano', resolved: 'Encerrado' };
  let ticket = null, busy = false, pending = null, createId = null;
  const key = () => crypto.randomUUID();
  // O carregamento do estilo usa a mesma identidade e oficina das chamadas do chat.
  host.hidden = true;
  fetch('/api/support/assets/support.css', { credentials: 'same-origin', headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {} })
    .then(async response => { if (!response.ok) throw new Error(); const style = document.createElement('style'); style.textContent = await response.text(); root.prepend(style); host.hidden = false; })
    .catch(() => { host.remove(); });
  function notice(text = '') { $('.notice').textContent = text; $('.notice').hidden = !text; }
  async function api(path, body) {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const response = await fetch('/api/support' + path, { method: body ? 'POST' : 'GET', headers, credentials: 'same-origin', ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível acessar o suporte.'), { status: response.status });
    return data;
  }
  function render(data) {
    const changed = !ticket || ticket.id !== data.id || ticket.version !== data.version;
    if (ticket?.id !== data.id) $('textarea').value = '';
    ticket = data;
    $('.intro').hidden = true;
    for (const s of ['.ticket-strip', '.messages', '.actions']) $(s).hidden = false;
    $('.composer').hidden = data.status === 'resolved';
    $('.handoff').hidden = data.status !== 'bot'; $('.resolve').hidden = data.status === 'resolved';
    $('.ticket-strip').textContent = `${data.protocol} · ${labels[data.status]}`;
    if (!changed) return;
    const messages = $('.messages'); messages.replaceChildren();
    for (const m of data.messages) {
      const bubble = document.createElement('div'); bubble.className = 'bubble ' + m.role;
      const label = document.createElement('small'); label.textContent = ({ user: 'Você', assistant: 'Assistente virtual', human: 'Equipe de suporte', system: 'Protocolo' })[m.role];
      const content = document.createElement('div'); content.textContent = m.text;
      bubble.append(label, content);
      if (m.references?.length) { const ref = document.createElement('div'); ref.className = 'reference'; ref.textContent = 'Base: ' + m.references.map(r => r.title).join(', '); bubble.append(ref); }
      messages.append(bubble);
    }
    messages.scrollTop = messages.scrollHeight;
  }
  async function run(fn) {
    if (busy) return; busy = true; notice();
    root.querySelectorAll('button').forEach(b => b.disabled = true);
    try { await fn(); } catch (e) { notice(e.message); }
    finally { busy = false; root.querySelectorAll('button').forEach(b => b.disabled = false); }
  }
  async function home() {
    const [meta, list] = await Promise.all([api('/meta'), api('/tickets')]);
    ticket = null; pending = null;
    $('.intro').hidden = false;
    for (const s of ['.ticket-strip', '.messages', '.composer', '.actions']) $(s).hidden = true;
    $('.privacy').textContent = meta.privacyNotice;
    $('.consent').hidden = !meta.aiAvailable;
    $('.history').replaceChildren();
    for (const t of list.tickets) {
      const button = document.createElement('button'); button.className = 'secondary';
      button.textContent = `${t.protocol} · ${labels[t.status]}`;
      button.onclick = () => run(async () => render(await api('/tickets/' + t.id)));
      $('.history').append(button);
    }
  }
  $('.launcher').onclick = () => {
    const open = $('.panel').hidden; $('.panel').hidden = !open; $('.launcher').hidden = open;
    $('.launcher').setAttribute('aria-expanded', String(open));
    if (open) { $('.icon-button').focus(); run(home); }
  };
  function close() { $('.panel').hidden = true; $('.launcher').hidden = false; $('.launcher').setAttribute('aria-expanded', 'false'); $('.launcher').focus(); }
  $('.icon-button').onclick = close;
  root.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('.start').onclick = () => run(async () => {
    createId ||= key();
    render(await api('/tickets', { requestId: createId, aiConsent: $('.consent input').checked }));
    createId = null; $('textarea').focus();
  });
  $('.back').onclick = () => run(home);
  async function mutate(operation, text = '') {
    if (!pending || pending.operation !== operation || pending.text !== text || pending.id !== ticket.id) pending = { operation, text, id: ticket.id, requestId: key(), version: ticket.version };
    try {
      render(await api(`/tickets/${ticket.id}/${operation}`, pending)); pending = null;
    } catch (e) {
      if (e.status === 409) { render(await api('/tickets/' + ticket.id)); pending = null; }
      throw e;
    }
  }
  $('.composer').onsubmit = e => { e.preventDefault(); const text = $('textarea').value.trim(); if (!text) return; run(async () => { await mutate('messages', text); $('textarea').value = ''; }); };
  $('.handoff').onclick = () => run(() => mutate('handoff'));
  $('.resolve').onclick = () => run(() => mutate('resolve'));
  setInterval(async () => {
    if (busy || $('.panel').hidden || document.hidden || !ticket || !['waiting_human', 'human'].includes(ticket.status)) return;
    const id = ticket.id;
    try { const data = await api('/tickets/' + id); if (!busy && ticket?.id === id) render(data); } catch (_) { notice('Não foi possível atualizar a conversa. Reabra o suporte para tentar novamente.'); }
  }, 8000);
})();
