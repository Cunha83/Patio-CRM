/* =====================================================================
   PÁTIO CRM — ESTORNO CONTÁBIL AUDITADO & EXPORTAÇÃO CSV
===================================================================== */

function folhaEstornoMovimento() {
  const mov = (S.ui && S.ui.movimentoEstorno) || null;
  if (!mov) {
    return `
    <div class="card card-p" style="max-width:480px;margin:0 auto">
      <div class="entre" style="margin-bottom:12px">
        <h3 style="margin:0;font-size:16px;font-weight:700">↩️ Estorno Contábil</h3>
        <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
      </div>
      <p style="color:var(--aco-600)">Nenhuma movimentação selecionada para estorno.</p>
      <div style="text-align:right"><button class="btn btn-secundario" onclick="fecharFolha()">Fechar</button></div>
    </div>`;
  }

  const isEntrada = mov.tipo === 'entrada' || mov.tipo === 'receita';
  return `
  <div class="card card-p" style="max-width:500px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--tijolo)">↩️ Estorno Contábil Auditado</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="background:rgba(239, 68, 68, 0.06);border:1px solid rgba(239, 68, 68, 0.2);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12.5px;color:var(--aco-800);line-height:1.4">
      ⚠️ <b>Atenção:</b> Esta operação mantém a imutabilidade contábil. O lançamento original será mantido e marcado como estornado, e uma movimentação compensatória inversa (${isEntrada ? 'Saída' : 'Entrada'} de ${brl(mov.valor)}) será lançada imediatamente para reverter o saldo do caixa. Apenas perfis autorizados (Dono/Admin) podem executar o estorno.
    </div>

    <div style="font-size:13px;display:flex;flex-direction:column;gap:8px;margin-bottom:14px;background:var(--aco-050);padding:12px;border-radius:6px;border:1px solid var(--aco-200)">
      <div><b>Lançamento:</b> ${esc(mov.desc || mov.descricao || 'Movimento')}</div>
      <div><b>Valor Original:</b> <span class="num" style="font-weight:700;color:${isEntrada ? 'var(--verde)' : 'var(--tijolo)'}">${isEntrada ? '+' : '−'} ${brl(mov.valor)}</span></div>
      <div><b>Origem:</b> ${mov.origem === 'whatsapp' ? '📱 WhatsApp' : '💻 Painel Web'} ${mov.autorNumero ? `(📞 ${esc(mov.autorNumero)})` : ''}</div>
      <div><b>Data:</b> ${dataBR(mov.data || hoje())}</div>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-weight:600;display:block;margin-bottom:4px;font-size:13px">
        Motivo Obrigatório do Estorno <span style="color:var(--tijolo)">*</span>:
      </label>
      <input type="text" id="estorno-motivo-input" class="campo-texto" placeholder="Ex: Lançamento em duplicidade via WhatsApp, valor digitado incorreto" style="width:100%;height:36px;font-size:13px">
      <div class="mini" style="color:var(--aco-500);margin-top:3px">Mínimo de 3 caracteres. Ficará registrado de forma perene no log de auditoria.</div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-perigo" onclick="confirmarEstornoMovimento('${mov.id}')" style="font-weight:700;padding:0 18px">
        ${ico('check', 14)} Confirmar Estorno
      </button>
    </div>
  </div>`;
}

function solicitarEstornoMovimento(id) {
  const mov = (S.movimentos || []).find(m => m.id === id);
  if (!mov) {
    if (typeof torrar === 'function') torrar('Movimentação não encontrada');
    else alert('Movimentação não encontrada');
    return;
  }
  if (mov.estornado) {
    if (typeof torrar === 'function') torrar('Esta movimentação já foi estornada anteriormente');
    else alert('Esta movimentação já foi estornada anteriormente');
    return;
  }
  if (mov.estornoDeId || mov.subtipo === 'estorno') {
    if (typeof torrar === 'function') torrar('Não é possível estornar um lançamento compensatório de estorno');
    else alert('Não é possível estornar um lançamento compensatório de estorno');
    return;
  }

  S.ui = S.ui || {};
  S.ui.movimentoEstorno = mov;
  if (typeof abrirFolha === 'function') {
    abrirFolha(folhaEstornoMovimento);
    setTimeout(() => {
      const el = document.getElementById('estorno-motivo-input');
      if (el) el.focus();
    }, 100);
  } else {
    const motivo = prompt('Informe o motivo do estorno contábil (mínimo 3 caracteres):');
    if (motivo) {
      executarEstornoMovimento(id, motivo);
    }
  }
}

async function confirmarEstornoMovimento(id) {
  const el = document.getElementById('estorno-motivo-input');
  const motivo = el ? el.value.trim() : '';
  if (!motivo || motivo.length < 3) {
    if (typeof torrar === 'function') torrar('Informe o motivo do estorno (mínimo 3 caracteres)');
    else alert('Informe o motivo do estorno (mínimo 3 caracteres)');
    return;
  }
  await executarEstornoMovimento(id, motivo);
}

async function executarEstornoMovimento(id, motivo) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };

    const res = await fetch(`/api/financeiro/movimentacoes/${encodeURIComponent(id)}/estornar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao realizar estorno contábil');
    }

    // Atualiza estado local de forma reativa
    if (data.movimentoEstornado) {
      const idx = (S.movimentos || []).findIndex(m => m.id === data.movimentoEstornado.id);
      if (idx !== -1) {
        S.movimentos[idx] = data.movimentoEstornado;
      }
    }
    if (data.movimentoCompensatorio) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimentoCompensatorio);
    }
    if (data.caixa) {
      const cIdx = (S.caixas || []).findIndex(c => c.id === data.caixa.id);
      if (cIdx !== -1) {
        S.caixas[cIdx] = data.caixa;
      }
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    if (typeof torrar === 'function') torrar(data.mensagem || 'Estorno realizado com sucesso!');
    else alert(data.mensagem || 'Estorno realizado com sucesso!');
  } catch (err) {
    if (typeof torrar === 'function') torrar(`Falha no estorno: ${err.message}`);
    else alert(`Falha no estorno: ${err.message}`);
  }
}

async function exportarMovimentacoesCSV() {
  try {
    const fOrigem = (S.ui && S.ui.filtroOrigemMov) || 'todos';
    const fMeio = (S.ui && S.ui.filtroMeioPagamentoMov) || 'todos';
    const params = new URLSearchParams();
    params.set('formato', 'csv');
    if (fOrigem !== 'todos') params.set('origem', fOrigem);
    if (fMeio !== 'todos') params.set('meioPagamento', fMeio);

    const res = await fetch(`/api/financeiro/exportar?${params.toString()}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const sha256 = res.headers.get('X-Export-SHA256');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato_financeiro_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    if (typeof torrar === 'function') {
      torrar(`Exportação CSV concluída! SHA-256: ${sha256 ? sha256.slice(0, 12) + '...' : 'OK'}`);
    }
  } catch (err) {
    console.error('[Exportar CSV] Falha:', err);
    if (typeof torrar === 'function') {
      torrar(`Erro na exportação CSV: ${err.message}`);
    }
  }
}

if (typeof window !== 'undefined') {
  window.folhaEstornoMovimento = folhaEstornoMovimento;
  window.solicitarEstornoMovimento = solicitarEstornoMovimento;
  window.confirmarEstornoMovimento = confirmarEstornoMovimento;
  window.executarEstornoMovimento = executarEstornoMovimento;
  window.exportarMovimentacoesCSV = exportarMovimentacoesCSV;
}
if (typeof globalThis !== 'undefined') {
  globalThis.folhaEstornoMovimento = folhaEstornoMovimento;
  globalThis.solicitarEstornoMovimento = solicitarEstornoMovimento;
  globalThis.confirmarEstornoMovimento = confirmarEstornoMovimento;
  globalThis.executarEstornoMovimento = executarEstornoMovimento;
  globalThis.exportarMovimentacoesCSV = exportarMovimentacoesCSV;
}

