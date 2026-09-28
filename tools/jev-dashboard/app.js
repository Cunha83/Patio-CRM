'use strict';

function calculateRoi(v, price = 0.042) {
  for (const [key, value] of Object.entries(v)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Valor inválido: ${key}`);
  }
  if (!(v.hour > 0) || !(v.fx > 0) || !(v.tokens > 0) || v.tokens > 64000) throw new Error('Hora, câmbio e tokens precisam ser positivos; contexto máximo 64.000 tokens.');
  const apiUSD = v.calls * v.tokens / 1e6 * price;
  const apiBRL = apiUSD * v.fx;
  const initial = v.build * v.hour;
  const monthlyCost = apiBRL + v.maintenance * v.hour + v.extras;
  const net = v.minutes / 60 * v.hour + v.avoided - monthlyCost;
  return { apiUSD, apiBRL, initial, net, payback: net > 0 ? initial / net : null,
    minutesForSixMonths: Math.max(0, (initial / 6 + monthlyCost - v.avoided) * 60 / v.hour) };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { calculateRoi };

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cls = status => status === 'AGORA' ? 'now' : status === 'DEPOIS' ? 'later' : 'no';
  const brl = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const badge = c => `<span class="badge ${cls(c.status)}">${escape(c.status)}</span>`;
  let data, filter = 'TODOS', toastTimer;

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  async function copyPrompt(id, fieldId) {
    const item = data.cases.find(c => c.id === id);
    if (!item) return;
    const field = $(fieldId);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível');
      await navigator.clipboard.writeText(item.prompt);
      toast(`Prompt ${item.number} copiado.`);
    } catch {
      field.focus(); field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* Seleção manual permanece disponível. */ }
      toast(copied ? `Prompt ${item.number} copiado.` : 'Texto selecionado. Use Ctrl+C para copiar.');
    }
  }
  function promptBlock(c, prefix) {
    const id = `${prefix}-${c.id}`;
    return `<label for="${id}">Prompt de implementação ${c.number}</label><textarea id="${id}" class="prompt-field" readonly spellcheck="false">${escape(c.prompt)}</textarea><button type="button" class="copy-button" data-copy="${c.id}" data-field="${id}">Copiar Prompt</button>`;
  }
  function renderCards() {
    const query = normalize($('search').value);
    const visible = data.cases.filter(c => (filter === 'TODOS' || c.status === filter) && normalize([c.title, c.category, c.summary, ...c.files].join(' ')).includes(query));
    $('result-count').textContent = `${visible.length} de ${data.cases.length} decisões · abra a análise para ver fluxo, riscos, evidências e critérios de aceite.`;
    $('empty').hidden = visible.length > 0;
    $('cards').innerHTML = visible.map(c => `<article class="case-card ${cls(c.status)}" id="card-${c.id}" aria-labelledby="title-${c.id}">
      <div class="card-top"><span class="case-number">${c.number} /</span>${badge(c)}</div>
      <div class="card-category">${escape(c.category)}</div><h3 id="title-${c.id}">${escape(c.title)}</h3><p class="summary">${escape(c.summary)}</p>
      <div class="score-row"><span class="score">${c.score}<small> / 10</small></span><span>UTILIDADE INCREMENTAL</span></div><div class="score-bar" aria-hidden="true"><i style="width:${c.score * 10}%"></i></div>
      <div class="card-meta"><span>${escape(c.stage)}</span><strong>${c.hours.join('–')} h ${c.status === 'NÃO USAR' ? 'evitáveis' : 'estimadas'}</strong></div>
      <div class="card-actions"><button type="button" class="detail-button" data-open="${c.id}" aria-label="Ver análise: ${escape(c.title)}">Ver análise completa <span aria-hidden="true">↗</span></button>
      <details class="prompt-details"><summary>Prompt para outro agente</summary>${c.status === 'NÃO USAR' ? '<p>O prompt preserva a alternativa determinística; não integra Jev.</p>' : ''}${promptBlock(c, 'card-prompt')}</details></div></article>`).join('');
  }
  const block = (title, text, wide = false) => `<div class="detail-block${wide ? ' detail-wide' : ''}"><h3>${escape(title)}</h3><p>${escape(text)}</p></div>`;
  function openCase(id) {
    const c = data.cases.find(item => item.id === id);
    if (!c) return;
    $('dialog-category').textContent = `${c.number} / ${c.category}`;
    $('dialog-content').innerHTML = `<h2 id="dialog-title">${escape(c.title)}</h2><div class="dialog-intro">${badge(c)}<span>Utilidade <strong>${c.score}/10</strong></span><span>Impacto ${c.impact}/10</span><span>Complexidade ${c.complexity}/10</span></div>
      <p class="dialog-verdict">${escape(c.decision)}</p><div class="detail-grid">
      ${block('O fluxo atual', c.current)}${block('Onde entraria o Jev', c.flow)}${block('Benefício esperado', c.benefit, true)}
      <div class="detail-block"><h3>Prós</h3><ul>${c.pros.map(p => `<li>${escape(p)}</li>`).join('')}</ul></div><div class="detail-block"><h3>Contras</h3><ul>${c.cons.map(p => `<li>${escape(p)}</li>`).join('')}</ul></div>
      ${block('Complexidade e custo de implementação', `${c.hours.join('–')} h · ${brl(c.hours[0] * 100)}–${brl(c.hours[1] * 100)} com hora hipotética de R$ 100. ${c.status === 'NÃO USAR' ? 'Custo evitável de tentar Jev; não é orçamento recomendado. Recomendação: zero investimento em Jev neste fluxo.' : 'Estimativa inclui integração e avaliação; não inclui espera de acesso ao fornecedor nem validações contratuais.'}`)}
      ${block('Custo recorrente', c.tokens ? `Payload ilustrativo de ${c.tokens.toLocaleString('pt-BR')} tokens por chamada: US$ ${(1000 * c.tokens / 1e6 * data.pricePerMillionUSD).toFixed(4)} a cada 1.000 chamadas só de Jev. Incluir OCR/áudio, fallback, revisões e manutenção. Volume e tokens reais não foram medidos.` : 'Não contratar Jev para este fluxo. Custos atuais do CRM permanecem; eventuais correções determinísticas exigem escopo próprio.')}
      ${block('Riscos e limitações', c.risks, true)}${block('Escala ou evento que justifica reavaliar', c.trigger, true)}${block('Critérios de aceite propostos', c.acceptance, true)}${block('Observabilidade', c.metrics)}${block('Fallback e reversão', c.fallback)}
      <div class="detail-block detail-wide"><h3>Arquivos e fluxos afetados</h3><div class="file-list">${c.files.map(f => `<code>${escape(f)}</code>`).join('')}</div></div>
      <div class="detail-block detail-wide"><h3>Evidências do código · snapshot desta análise</h3>${c.evidence.map(e => `<details class="evidence"><summary>${escape(e.file)}:${e.line}</summary><pre>${escape(e.excerpt)}</pre><p class="hash">SHA-256 do arquivo: ${e.sha256}</p></details>`).join('')}</div></div>
      <div class="dialog-prompt"><h3>Pronto para outro agente</h3><p>${c.status === 'NÃO USAR' ? 'Este prompt implementa/verifica a alternativa sem Jev, preservando a recomendação de não usar.' : 'Implementação opcional, testes, observabilidade e fallback. Não autoriza ativação automática em produção.'}</p>${promptBlock(c, 'dialog-prompt')}</div>`;
    $('case-dialog').showModal();
    $('case-dialog').scrollTop = 0;
  }
  function renderStatic() {
    $('verdict-text').textContent = data.verdict;
    const now = data.cases.filter(c => c.status === 'AGORA').length;
    const later = data.cases.filter(c => c.status === 'DEPOIS').length;
    const no = data.cases.filter(c => c.status === 'NÃO USAR').length;
    const stats = [ ['DECISÕES AVALIADAS', data.cases.length, 'Cobertura dos fluxos relevantes', ''], ['AGORA', now.toString().padStart(2, '0'), 'Experimento de suporte', 'now'], ['DEPOIS', later.toString().padStart(2, '0'), 'Dependem de escala e evidência', 'later'], ['NÃO USAR', no.toString().padStart(2, '0'), 'Simplicidade tem retorno', 'no'] ];
    $('stats').innerHTML = stats.map(s => `<div class="stat ${s[3]}"><div class="stat-label">${s[0]}</div><div class="stat-value">${s[1]}</div><small>${s[2]}</small></div>`).join('');
    $('pilot').textContent = data.pilot;
    $('methodology').textContent = data.methodology;
    $('scope').textContent = data.scope;
    $('entry-points').innerHTML = data.cases.filter(c => c.status !== 'NÃO USAR').map(c => `<button type="button" class="entry-point" data-open="${c.id}"><span>${c.number}</span><span>${escape(c.title)}</span><span aria-hidden="true">↗</span></button>`).join('');
    $('points').innerHTML = data.cases.map(c => `<button type="button" class="point ${cls(c.status)}" data-open="${c.id}" style="left:${c.complexity * 10}%;bottom:${c.impact * 10}%" aria-label="${c.number}: ${escape(c.title)}, impacto ${c.impact}, complexidade ${c.complexity}, ${c.status}">${c.number}</button>`).join('');
    $('matrix-legend').innerHTML = data.cases.map(c => `<button type="button" class="legend-item" data-open="${c.id}"><span>${c.number}</span><span class="legend-text">${escape(c.title)}</span><small>${c.impact} × ${c.complexity}</small></button>`).join('');
    $('next').innerHTML = data.next.map((n, i) => `<div class="next-item"><span class="num">PASSO 0${i + 1}</span><h3>${escape(n.title)}</h3><p>${escape(n.text)}</p></div>`).join('');
    $('sources').innerHTML = data.sources.map(s => `<div class="source"><a href="${escape(s.url)}" target="_blank" rel="noreferrer">${escape(s.title)} ↗</a><p>${escape(s.note)}</p></div>`).join('');
  }
  function updateRoi() {
    const ids = ['calls', 'tokens', 'fx', 'hour', 'build', 'maintenance', 'minutes', 'avoided', 'extras'];
    try {
      const values = Object.fromEntries(ids.map(id => {
        if (!$(id).value.trim() || !$(id).checkValidity()) throw new Error('Preencha valores válidos em todos os campos.');
        return [id, Number($(id).value)];
      }));
      const r = calculateRoi(values, data.pricePerMillionUSD);
      $('net').textContent = brl(r.net);
      $('net').classList.toggle('negative', r.net < 0);
      $('net-label').textContent = r.net > 0 ? 'Ganho hipotético após custos recorrentes' : 'Custos adicionais sem economia comprovada';
      $('api-cost').textContent = `${brl(r.apiBRL)} / mês (US$ ${r.apiUSD.toLocaleString('pt-BR', { maximumFractionDigits: 4 })})`;
      $('initial').textContent = brl(r.initial);
      $('payback').textContent = r.payback === null ? 'Sem retorno neste cenário' : `${r.payback.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`;
      $('break-even').textContent = Math.ceil(r.minutesForSixMonths).toLocaleString('pt-BR') + ' min';
      $('roi-status').textContent = r.payback !== null && r.payback <= 6 ? 'Hipótese com retorno em até 6 meses. Verifique os ganhos em comparação controlada.' : 'Este cenário ainda não justifica a integração. Meça ganho real antes de investir.';
    } catch (error) {
      for (const id of ['net', 'api-cost', 'initial', 'payback', 'break-even']) $(id).textContent = '—';
      $('net-label').textContent = '';
      $('roi-status').textContent = error.message;
    }
  }
  document.addEventListener('click', event => {
    const open = event.target.closest('[data-open]');
    if (open && data) return openCase(open.dataset.open);
    const copy = event.target.closest('[data-copy]');
    if (copy && data) return void copyPrompt(copy.dataset.copy, copy.dataset.field);
    const f = event.target.closest('[data-filter]');
    if (f && data) {
      filter = f.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === f)));
      renderCards();
    }
  });
  $('close-dialog').addEventListener('click', () => $('case-dialog').close());
  $('case-dialog').addEventListener('click', e => { if (e.target === $('case-dialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
  $('search').addEventListener('input', () => { if (data) renderCards(); });
  $('roi-form').addEventListener('input', () => { if (data) updateRoi(); });
  $('roi-form').addEventListener('submit', e => e.preventDefault());
  fetch('/analysis.json').then(r => { if (!r.ok) throw new Error('Dados da análise indisponíveis.'); return r.json(); }).then(result => {
    data = result; renderStatic(); renderCards(); updateRoi();
  }).catch(error => { $('load-error').hidden = false; $('load-error').textContent = `${error.message} Execute node tools/jev-dashboard/build.cjs e recarregue a página.`; });
}
