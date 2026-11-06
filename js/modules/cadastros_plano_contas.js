/**
 * Módulo: cadastros_plano_contas.js
 * Pátio-CRM — Estrutura Contábil da Oficina: Visualização em Árvore e Folha de Conta
 * Arquitetura Modular (< 350 linhas).
 */

function viewPlanoContas() {
  if (!S.cfg) S.cfg = {};
  S.cfg.planoDeContas = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);

  const lista = [...(S.cfg.planoDeContas || [])];
  const busca = (S.ui.buscaPlano || '').toLowerCase().trim();
  const filtroTipo = S.ui.filtroPlanoTipo || 'todos';

  lista.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, { numeric: true, sensitivity: 'base' }));

  const filtrados = lista.filter(item => {
    if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false;
    if (busca) {
      const matchCod = (item.codigo || '').toLowerCase().includes(busca);
      const matchNome = (item.nome || '').toLowerCase().includes(busca);
      return matchCod || matchNome;
    }
    return true;
  });

  const totalReceitas = lista.filter(c => c.tipo === 'receita').length;
  const totalDespesas = lista.filter(c => c.tipo === 'despesa').length;

  return `
  <div class="card card-p" style="max-width:980px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;border-bottom:1px solid var(--aco-150,#e2e8f0);padding-bottom:14px">
      <div>
        <div style="font-weight:700;font-size:16px;color:var(--aco-900,#0f172a)">Estrutura Contábil da Oficina</div>
        <div style="font-size:12px;color:var(--aco-600,#475569);margin-top:2px">
          ${lista.length} contas cadastradas (${totalReceitas} receitas, ${totalDespesas} custos/despesas)
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-neutro" onclick="restaurarPlanoContasPadrao()" title="Recupera ou atualiza as contas padrão do sistema">
          ${ico('recarregar', 14) || '↺'} Restaurar Padrões
        </button>
        <button class="btn btn-primario" onclick="abrirFolhaPlanoConta()" style="font-weight:600">
          ${ico('mais', 14) || '+'} Nova Conta
        </button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:200px;position:relative">
        <input type="text" class="campo-texto" placeholder="Buscar por código ou descrição..." 
               value="${esc(S.ui.buscaPlano || '')}" 
               oninput="S.ui.buscaPlano = this.value; render()" 
               style="width:100%;height:36px;padding-left:32px">
        <div style="position:absolute;left:10px;top:9px;color:var(--aco-400,#94a3b8)">
          ${ico('lupa', 16) || '🔍'}
        </div>
      </div>

      <div style="display:flex;gap:6px">
        <button class="btn ${filtroTipo === 'todos' ? 'btn-primario' : 'btn-neutro'}" 
                onclick="S.ui.filtroPlanoTipo = 'todos'; render()" style="font-size:12px;padding:6px 12px">
          Todos (${lista.length})
        </button>
        <button class="btn ${filtroTipo === 'receita' ? 'btn-primario' : 'btn-neutro'}" 
                onclick="S.ui.filtroPlanoTipo = 'receita'; render()" style="font-size:12px;padding:6px 12px">
          Receitas (${totalReceitas})
        </button>
        <button class="btn ${filtroTipo === 'despesa' ? 'btn-primario' : 'btn-neutro'}" 
                onclick="S.ui.filtroPlanoTipo = 'despesa'; render()" style="font-size:12px;padding:6px 12px">
          Despesas (${totalDespesas})
        </button>
      </div>
    </div>

    <div style="overflow-x:auto;border:1px solid var(--aco-200,#cbd5e1);border-radius:8px">
      <table class="tabela" style="width:100%;border-collapse:collapse;margin:0">
        <thead>
          <tr style="background:var(--aco-100,#f1f5f9);text-align:left;font-size:12px;color:var(--aco-700,#334155)">
            <th style="padding:10px 14px;width:120px">Código</th>
            <th style="padding:10px 14px">Descrição / Nome da Conta</th>
            <th style="padding:10px 14px;width:110px;text-align:center">Tipo</th>
            <th style="padding:10px 14px;width:100px;text-align:center">Classe</th>
            <th style="padding:10px 14px;width:90px;text-align:center">Status</th>
            <th style="padding:10px 14px;width:180px;text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtrados.length === 0 ? `
            <tr>
              <td colspan="6" style="text-align:center;padding:28px;color:var(--aco-500,#64748b)">
                Nenhuma conta encontrada para o filtro informado.
              </td>
            </tr>
          ` : filtrados.map(c => {
            const ehSintetica = c.classe === 'sintetica';
            const nivel = (c.codigo || '').split('.').length;
            const recuo = (nivel - 1) * 24;
            const bgLinha = ehSintetica ? 'background:rgba(241, 245, 249, 0.6);' : '';
            const pesoFonte = ehSintetica ? 'font-weight:700;color:var(--aco-900,#0f172a);' : 'font-weight:500;color:var(--aco-800,#1e293b);';
            const badgeTipo = c.tipo === 'receita'
              ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534">Receita</span>'
              : '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b">Despesa</span>';
            const badgeClasse = ehSintetica
              ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#e0f2fe;color:#075985">Sintética</span>'
              : '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3e8ff;color:#6b21a8">Analítica</span>';
            const badgeStatus = c.ativo !== false
              ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#ecfdf5;color:#047857">Ativo</span>'
              : '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f1f5f9;color:#64748b">Inativo</span>';

            return `
              <tr style="${bgLinha}border-bottom:1px solid var(--aco-150,#e2e8f0)">
                <td style="padding:10px 14px;font-family:monospace;font-size:13px;${pesoFonte}">${esc(c.codigo)}</td>
                <td style="padding:10px 14px;${pesoFonte}">
                  <div style="display:flex;align-items:center;padding-left:${recuo}px">
                    ${recuo > 0 ? '<span style="color:var(--aco-400,#94a3b8);margin-right:6px">└─</span>' : ''}
                    <span>${ehSintetica ? '📁 ' : '📄 '}</span>
                    <span style="margin-left:4px">${esc(c.nome)}</span>
                  </div>
                </td>
                <td style="padding:10px 14px;text-align:center">${badgeTipo}</td>
                <td style="padding:10px 14px;text-align:center">${badgeClasse}</td>
                <td style="padding:10px 14px;text-align:center">${badgeStatus}</td>
                <td style="padding:10px 14px;text-align:right">
                  <div style="display:inline-flex;gap:4px;align-items:center">
                    ${ehSintetica ? `<button class="btn btn-neutro" style="padding:4px 8px;font-size:11px" onclick="abrirFolhaPlanoConta(null, '${esc(c.id)}')" title="Adicionar subconta em ${esc(c.nome)}">+ Subconta</button>` : ''}
                    <button class="btn btn-neutro" style="padding:4px 8px;font-size:11px" onclick="abrirFolhaPlanoConta('${esc(c.id)}')" title="Editar conta">${ico('lapis', 12) || '✏️'}</button>
                    <button class="btn btn-neutro" style="padding:4px 8px;font-size:11px" onclick="toggleStatusPlanoConta('${esc(c.id)}')" title="${c.ativo !== false ? 'Desativar conta' : 'Ativar conta'}">${c.ativo !== false ? 'Desativar' : 'Ativar'}</button>
                    <button class="btn-icone-perigo" style="padding:4px 6px" onclick="excluirPlanoConta('${esc(c.id)}')" title="Excluir conta">${ico('lixo', 14) || '🗑️'}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaPlanoConta() {
  const r = S.ui.rascPlanoConta || {};
  const isEdicao = !!r.idOriginal;
  const lista = (typeof normalizarPlanoDeContas === 'function') ? normalizarPlanoDeContas(S.cfg.planoDeContas) : (S.cfg.planoDeContas || []);
  const sinteticas = lista.filter(c => c.classe === 'sintetica' && c.id !== r.idOriginal);

  return `
  <div class="card card-p" style="max-width:520px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:16px">
      <h3 style="font-size:17px;font-weight:700;margin:0">${isEdicao ? 'Editar Conta Contábil' : 'Nova Conta Contábil'}</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18) || '✕'}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Conta Pai (Agrupadora):</label>
        <select class="campo-select" style="width:100%;height:36px" onchange="atualizarPaiRascPlanoConta(this.value)">
          <option value="">Nenhuma (Conta Sintética Raiz)</option>
          ${sinteticas.map(s => `
            <option value="${esc(s.id)}" ${r.paiId === s.id ? 'selected' : ''}>
              ${esc(s.codigo)} - ${esc(s.nome)} (${s.tipo === 'receita' ? 'Receita' : 'Despesa'})
            </option>
          `).join('')}
        </select>
        <div style="font-size:11px;color:var(--aco-500);margin-top:3px">Subcontas herdam o tipo da conta-mãe sintética.</div>
      </div>

      <div style="display:grid;grid-template-columns:130px 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Código Contábil *:</label>
          <input type="text" class="campo-texto" placeholder="Ex: 1.03" value="${esc(r.codigo || '')}" oninput="S.ui.rascPlanoConta.codigo = this.value.trim()" style="width:100%;height:36px;font-family:monospace;font-weight:600">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Descrição / Nome da Conta *:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Combustíveis e Lubrificantes" value="${esc(r.nome || '')}" oninput="S.ui.rascPlanoConta.nome = this.value" style="width:100%;height:36px;font-weight:600">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Operação:</label>
          <select class="campo-select" style="width:100%;height:36px" ${r.paiId ? 'disabled' : ''} onchange="S.ui.rascPlanoConta.tipo = this.value">
            <option value="receita" ${r.tipo === 'receita' ? 'selected' : ''}>Receita Operacional (+)</option>
            <option value="despesa" ${r.tipo === 'despesa' ? 'selected' : ''}>Custo / Despesa (−)</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Classe da Conta:</label>
          <select class="campo-select" style="width:100%;height:36px" onchange="S.ui.rascPlanoConta.classe = this.value">
            <option value="analitica" ${r.classe === 'analitica' ? 'selected' : ''}>Analítica (Recebe Lançamentos)</option>
            <option value="sintetica" ${r.classe === 'sintetica' ? 'selected' : ''}>Sintética (Totalizadora)</option>
          </select>
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Status da Conta:</label>
        <select class="campo-select" style="width:100%;height:36px" onchange="S.ui.rascPlanoConta.ativo = (this.value === 'true')">
          <option value="true" ${r.ativo !== false ? 'selected' : ''}>Ativo (Disponível para seleção)</option>
          <option value="false" ${r.ativo === false ? 'selected' : ''}>Inativo (Oculto em novos lançamentos)</option>
        </select>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;border-top:1px solid var(--aco-150);padding-top:14px">
      <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
      <button class="btn btn-primario" onclick="salvarPlanoConta()" style="font-weight:600;padding:0 20px">${ico('check', 14) || '✓'} Salvar Conta</button>
    </div>
  </div>`;
}

function abrirFolhaPlanoConta(contaId = null, paiIdSugerido = null) {
  if (!S.cfg) S.cfg = {};
  S.cfg.planoDeContas = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);
  const lista = S.cfg.planoDeContas;

  if (contaId) {
    const encontrada = lista.find(c => c.id === contaId);
    if (!encontrada) {
      torrar('Conta contábil não encontrada.');
      return;
    }
    S.ui.rascPlanoConta = {
      idOriginal: encontrada.id,
      id: encontrada.id,
      codigo: encontrada.codigo,
      nome: encontrada.nome,
      tipo: encontrada.tipo,
      classe: encontrada.classe,
      paiId: encontrada.paiId || null,
      ativo: encontrada.ativo !== false,
      padrao: !!encontrada.padrao
    };
  } else {
    let pai = null;
    if (paiIdSugerido) {
      pai = lista.find(c => c.id === paiIdSugerido);
    }

    let tipo = pai ? pai.tipo : 'despesa';
    let classe = pai ? 'analitica' : 'sintetica';
    let codigoSugerido = '';

    if (pai) {
      const filhas = lista.filter(c => c.paiId === pai.id || (c.codigo && pai.codigo && c.codigo.startsWith(pai.codigo + '.')));
      let maxSeq = 0;
      filhas.forEach(f => {
        const parts = f.codigo.split('.');
        const last = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(last) && last > maxSeq) maxSeq = last;
      });
      codigoSugerido = `${pai.codigo}.${String(maxSeq + 1).padStart(2, '0')}`;
    } else {
      const raizes = lista.filter(c => !c.paiId && !c.codigo.includes('.'));
      let maxRoot = 0;
      raizes.forEach(r => {
        const num = parseInt(r.codigo, 10);
        if (!isNaN(num) && num > maxRoot) maxRoot = num;
      });
      codigoSugerido = String(maxRoot + 1);
    }

    S.ui.rascPlanoConta = {
      idOriginal: null,
      id: `pc_${Date.now()}`,
      codigo: codigoSugerido,
      nome: '',
      tipo,
      classe,
      paiId: pai ? pai.id : null,
      ativo: true,
      padrao: false
    };
  }

  abrirFolha(folhaPlanoConta);
}

if (typeof window !== 'undefined') {
  window.viewPlanoContas = viewPlanoContas;
  window.folhaPlanoConta = folhaPlanoConta;
  window.abrirFolhaPlanoConta = abrirFolhaPlanoConta;
}
if (typeof globalThis !== 'undefined') {
  globalThis.viewPlanoContas = viewPlanoContas;
  globalThis.folhaPlanoConta = folhaPlanoConta;
  globalThis.abrirFolhaPlanoConta = abrirFolhaPlanoConta;
}

