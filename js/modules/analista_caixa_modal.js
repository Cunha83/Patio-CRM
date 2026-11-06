/* =====================================================================
   PÁTIO CRM — ANALISTA FINANCEIRA: MODAIS DE CAIXA E TESOURARIA
   Abertura, Lançamentos, Fechamento com Conferência Cega e Estornos
   ===================================================================== */

function folhaAbrirCaixaVeronica() {
  return `
  <div class="card card-p" style="max-width:480px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">🔓 Abertura de Caixa Diário</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="background:var(--aco-50);padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);color:var(--aco-700)">
        Informe o saldo inicial físico (fundo de troco) disponível no caixa para iniciar o turno de atendimento.
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Inicial em Dinheiro (R$):</label>
        <input type="number" id="cx-saldo-inicial" class="campo-texto" placeholder="0.00" value="0.00" step="1.00" style="width:100%;height:38px;font-size:16px;font-weight:700;color:var(--verde)">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Operador Responsável:</label>
        <input type="text" id="cx-operador" class="campo-texto" placeholder="Nome do operador" value="${esc((S.user && S.user.nome) || 'Caixa Principal')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Observações de Abertura:</label>
        <textarea id="cx-obs" class="campo-texto" placeholder="Ex: Turno da manhã, troco conferido" style="width:100%;height:60px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="
        const s = document.getElementById('cx-saldo-inicial').value;
        const op = document.getElementById('cx-operador').value;
        const obs = document.getElementById('cx-obs').value;
        abrirCaixaApi(s, obs, op);
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Confirmar Abertura
      </button>
    </div>
  </div>`;
}

function folhaLancamentoCaixaVeronica() {
  return `
  <div class="card card-p" style="max-width:520px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">➕ Lançamento no Caixa Ativo</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Tipo de Movimento:</label>
          <select id="mov-tipo" class="campo-select" style="width:100%;height:36px;font-weight:700">
            <option value="receita">Receita (Entrada +)</option>
            <option value="suprimento">Suprimento de Caixa (+)</option>
            <option value="despesa">Despesa (Saída −)</option>
            <option value="sangria">Sangria de Caixa (−)</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Valor (R$):</label>
          <input type="number" id="mov-valor" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:36px;font-weight:700;font-size:15px">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Forma de Pagamento:</label>
          <select id="mov-forma" class="campo-select" style="width:100%;height:34px">
            <option value="dinheiro">Dinheiro (Espécie)</option>
            <option value="pix">PIX</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="boleto">Boleto Bancário</option>
            <option value="transferencia">Transferência / TED</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Categoria de Custo:</label>
          <select id="mov-categoria" class="campo-select" style="width:100%;height:34px">
            <option value="Serviços">Serviços da Oficina</option>
            <option value="Peças">Venda de Peças</option>
            <option value="Combustível">Combustível / Deslocamento</option>
            <option value="Alimentação">Alimentação / Copa</option>
            <option value="Materiais">Materiais de Uso e Consumo</option>
            <option value="Geral">Outras Movimentações</option>
          </select>
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Descrição do Lançamento:</label>
        <input type="text" id="mov-desc" class="campo-texto" placeholder="Ex: Adiantamento de cliente OS #12, compra de parafuso" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-primario" onclick="
        const tipo = document.getElementById('mov-tipo').value;
        const valor = document.getElementById('mov-valor').value;
        const forma = document.getElementById('mov-forma').value;
        const cat = document.getElementById('mov-categoria').value;
        const desc = document.getElementById('mov-desc').value;
        lancarMovimentoApi({ tipo, valor, formaPagamento: forma, categoria: cat, descricao: desc });
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Lançar no Caixa
      </button>
    </div>
  </div>`;
}

function folhaFecharCaixaVeronica() {
  return `
  <div class="card card-p" style="max-width:540px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">🔒 Fechamento e Conciliação Cega</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="background:var(--aco-50);padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);color:var(--aco-700)">
        <b>Conferência Cega:</b> Digite os totais reais apurados fisicamente e nos comprovantes de maquininhas/banco. O sistema fará a conciliação automática com o saldo registrado.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Dinheiro Físico (R$):</label>
          <input type="number" id="conf-dinheiro" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Comprovantes PIX (R$):</label>
          <input type="number" id="conf-pix" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Cartões Débito/Crédito (R$):</label>
          <input type="number" id="conf-cartao" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Boletos / TEDs (R$):</label>
          <input type="number" id="conf-outros" class="campo-texto" placeholder="0.00" step="0.50" style="width:100%;height:34px;font-weight:700">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Observações de Fechamento:</label>
        <textarea id="conf-obs" class="campo-texto" placeholder="Ex: Sobra de troco justificada, conferência conferida com gerente" style="width:100%;height:50px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-perigo" onclick="
        const din = document.getElementById('conf-dinheiro').value;
        const pix = document.getElementById('conf-pix').value;
        const car = document.getElementById('conf-cartao').value;
        const out = document.getElementById('conf-outros').value;
        const obs = document.getElementById('conf-obs').value;
        fecharCaixaApi({ dinheiro: din, pix, cartao: car, outros: out }, obs);
      " style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Encerrar Caixa
      </button>
    </div>
  </div>`;
}

/* ---------------- Chamadas de API Financeira da Verônica ---------------- */

async function abrirCaixaApi(saldoInicial, observacoes, operador) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/financeiro/caixa/abrir', {
      method: 'POST',
      headers,
      body: JSON.stringify({ saldoInicial: Number(saldoInicial) || 0, observacoes, operador })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao abrir caixa');
    
    // Atualiza estado local
    if (data.caixa) {
      S.caixas = S.caixas || [];
      S.caixas.push(data.caixa);
    }
    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Caixa aberto com sucesso!');
  } catch (err) {
    alert(err.message);
  }
}

async function lancarMovimentoApi(payload) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/financeiro/movimentacoes', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao lançar movimentação');

    if (data.movimento) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimento);
    }
    if (data.caixa) {
      const idx = (S.caixas || []).findIndex(c => c.id === data.caixa.id);
      if (idx !== -1) S.caixas[idx] = data.caixa;
    }
    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Lançamento registrado com sucesso!');
  } catch (err) {
    alert(err.message);
  }
}

async function fecharCaixaApi(conferenciaCega, observacoes) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch('/api/financeiro/caixa/fechar', {
      method: 'POST',
      headers,
      body: JSON.stringify({ conferenciaCega, observacoes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao fechar caixa');

    if (data.fechamento && data.fechamento.caixaId) {
      const idx = (S.caixas || []).findIndex(c => c.id === data.fechamento.caixaId);
      if (idx !== -1) {
        S.caixas[idx].status = 'fechado';
        S.caixas[idx].fechamento = data.fechamento;
      }
    }
    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Caixa encerrado com sucesso!');
  } catch (err) {
    alert(err.message);
  }
}

async function estornarMovimentoApi(movimentoId, motivo) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/movimentacoes/${encodeURIComponent(movimentoId)}/estornar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar estorno contábil');

    if (data.movimentoEstornado) {
      const idx = (S.movimentos || []).findIndex(m => m.id === data.movimentoEstornado.id);
      if (idx !== -1) S.movimentos[idx] = data.movimentoEstornado;
    }
    if (data.movimentoCompensatorio) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimentoCompensatorio);
    }
    if (data.caixa) {
      const cIdx = (S.caixas || []).findIndex(c => c.id === data.caixa.id);
      if (cIdx !== -1) S.caixas[cIdx] = data.caixa;
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Estorno contábil realizado com sucesso!');
  } catch (err) {
    alert(`Falha no estorno: ${err.message}`);
  }
}

if (typeof window !== 'undefined') {
  window.folhaAbrirCaixaVeronica = folhaAbrirCaixaVeronica;
  window.folhaLancamentoCaixaVeronica = folhaLancamentoCaixaVeronica;
  window.folhaFecharCaixaVeronica = folhaFecharCaixaVeronica;
  window.abrirCaixaApi = abrirCaixaApi;
  window.lancarMovimentoApi = lancarMovimentoApi;
  window.fecharCaixaApi = fecharCaixaApi;
  window.estornarMovimentoApi = estornarMovimentoApi;
}

