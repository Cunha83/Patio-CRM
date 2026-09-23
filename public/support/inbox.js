(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { waiting_human: 'Aguardando equipe', human: 'Em atendimento', resolved: 'Encerrado', bot: 'Assistente virtual' };
  let ticket = null, busy = false, pending = null;
  async function api(path, body) {
    const response = await fetch('/api/platform/support-desk' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível carregar os atendimentos.'), { status: response.status });
    return data;
  }
  function show(data) {
    const changed = ticket?.id !== data.id || ticket?.version !== data.version;
    ticket = data; $('empty').hidden = true; $('detail').hidden = false;
    $('status').textContent = `${data.protocol} · Oficina ${data.tenantId} · ${labels[data.status]}${data.priority === 'urgent' ? ' · Urgente' : ''}`;
    $('claim').hidden = data.status !== 'waiting_human'; $('form').hidden = data.status !== 'human'; $('resolve').hidden = data.status !== 'human';
    if (!changed) return;
    $('messages').replaceChildren();
    for (const m of data.messages) {
      const bubble = document.createElement('div'); bubble.className = 'bubble ' + m.role;
      const label = document.createElement('small'); label.textContent = ({ user: 'Solicitante', assistant: 'Assistente virtual', human: 'Equipe de suporte', system: 'Protocolo' })[m.role];
      const text = document.createElement('div'); text.textContent = m.text; bubble.append(label, text);
      if (m.references?.length) { const ref = document.createElement('div'); ref.className = 'reference'; ref.textContent = 'Base: ' + m.references.map(r => r.title).join(', '); bubble.append(ref); }
      $('messages').append(bubble);
    }
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  async function refresh() {
    const data = await api('/tickets'); $('list').replaceChildren();
    if (!data.tickets.length) $('list').textContent = 'Nenhum atendimento na fila.';
    for (const t of data.tickets) {
      const b = document.createElement('button'); b.className = 'desk-item'; b.setAttribute('aria-pressed', String(ticket?.id === t.id));
      const title = document.createElement('strong'); title.textContent = t.protocol + (t.priority === 'urgent' ? ' · Urgente' : '');
      const desc = document.createElement('small'); desc.textContent = `${t.tenantId} · ${labels[t.status]}`; b.append(title, desc);
      b.onclick = () => run(async () => { show(await api('/tickets/' + t.id)); $('reply').value = ''; pending = null; await refresh(); }); $('list').append(b);
    }
    if (ticket) show(await api('/tickets/' + ticket.id));
  }
  async function run(fn) {
    if (busy) return; busy = true; $('notice').hidden = true;
    document.querySelectorAll('button').forEach(b => b.disabled = true);
    try { await fn(); } catch (e) { $('notice').textContent = e.message; $('notice').hidden = false; }
    finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
  }
  async function act(operation, text = '') {
    if (!pending || pending.operation !== operation || pending.text !== text || pending.id !== ticket.id) pending = { operation, text, id: ticket.id, version: ticket.version, requestId: crypto.randomUUID() };
    try { show(await api(`/tickets/${ticket.id}/${operation}`, pending)); pending = null; }
    catch (e) { if (e.status === 409) { show(await api('/tickets/' + ticket.id)); pending = null; } throw e; }
    await refresh();
  }
  $('refresh').onclick = () => run(refresh);
  $('claim').onclick = () => run(() => act('claim'));
  $('resolve').onclick = () => run(() => act('resolve'));
  $('form').onsubmit = e => { e.preventDefault(); const text = $('reply').value.trim(); if (text) run(async () => { await act('reply', text); $('reply').value = ''; }); };
  setInterval(() => { if (!document.hidden && !busy) run(refresh); }, 10000);
  run(refresh);
})();
