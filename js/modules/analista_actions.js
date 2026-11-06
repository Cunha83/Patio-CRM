/* =====================================================================
   PÁTIO CRM — ANALISTA FINANCEIRA: AÇÕES DE FATURAMENTO E COBRANÇA
   Faturamento a Prazo, Baixa de Títulos, Liberação Excepcional e Cobrança
   ===================================================================== */

function folhaFaturarOS(osId) {
  const osList = Array.isArray(S.os) ? S.os : [];
  const o = osList.find(x => String(x.id) === String(osId) || String(x.num) === String(osId));
  if (!o) {
    return `<div class="card card-p"><p>OS #${esc(osId)} não encontrada.</p><button class="btn btn-secundario" onclick="fecharFolha()">Voltar</button></div>`;
  }

  const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
  const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
  const lib = typeof calcularStatusLiberacaoOSFrontend === 'function' ? calcularStatusLiberacaoOSFrontend(o) : { total: 0, totalPago: 0, saldoRestante: 0 };
  const hojeStr = typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10);
  const dataVencPadrao = typeof addDias === 'function' ? addDias(hojeStr, 30) : hojeStr;

  return `
  <div class="card card-p" style="max-width:540px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">📄 Faturar a Prazo — OS #${esc(o.num || o.id)}</h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span><b>Cliente:</b> ${esc(c.fantasia || c.nome || 'Geral')}</span>
        <span><b>Veículo / Placa:</b> ${esc(v.placa || '—')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span>Total Orçado: <b>${typeof brl === 'function' ? brl(lib.total) : lib.total}</b></span>
        <span style="color:var(--verde)">Total Pago: <b>${typeof brl === 'function' ? brl(lib.totalPago) : lib.totalPago}</b></span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;border-top:1px dashed var(--aco-200);padding-top:6px;margin-top:6px">
        <span style="font-weight:700;color:var(--tijolo)">Saldo a Faturar:</span>
        <span style="font-weight:800;color:var(--tijolo)" class="num">${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Parcelas:</label>
          <select id="fat-parcelas" class="campo-select" style="width:100%;height:36px;font-weight:700">
            <option value="1">1x (Parcela Única)</option>
            <option value="2">2x Quinzenal / Mensal</option>
            <option value="3">3x Mensal</option>
            <option value="4">4x Mensal</option>
            <option value="6">6x Mensal</option>
            <option value="12">12x Mensal</option>
          </select>
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Meio de Pagamento:</label>
          <select id="fat-meio" class="campo-select" style="width:100%;height:36px;font-weight:700">
            <option value="boleto">Boleto Bancário</option>
            <option value="pix">PIX Parcelado</option>
            <option value="promissoria">Nota Promissória</option>
            <option value="cheque">Cheque Pré-datado</option>
            <option value="cartao_credito">Cartão de Crédito</option>
          </select>
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Data do Primeiro Vencimento:</label>
        <input type="date" id="fat-venc-inicial" class="campo-texto" value="${dataVencPadrao}" style="width:100%;height:36px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Observações / Condições Comerciais:</label>
        <textarea id="fat-obs" class="campo-texto" placeholder="Ex: Faturado para 30/60 dias conforme aprovação da diretoria" style="width:100%;height:54px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="faturarOSApi('${o.id || o.num}', document.getElementById('fat-parcelas').value, document.getElementById('fat-meio').value, document.getElementById('fat-venc-inicial').value, document.getElementById('fat-obs').value);" style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Confirmar Faturamento a Prazo
      </button>
    </div>
  </div>`;
}

async function faturarOSApi(osId, parcelas, meioPagamento, vencimentoInicial, observacao) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/faturar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parcelas: Number(parcelas) || 1,
        meioPagamento: meioPagamento || 'boleto',
        vencimentoInicial,
        observacao
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao faturar OS a prazo');

    if (Array.isArray(data.titulos)) {
      S.contas = S.contas || [];
      data.titulos.forEach(tit => {
        const jaExiste = S.contas.some(c => c.id === tit.id);
        if (!jaExiste) S.contas.push(tit);
      });
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Faturamento a prazo concluído com sucesso!');
  } catch (err) {
    alert(`Falha no faturamento: ${err.message}`);
  }
}

function folhaBaixarTituloVeronica(contaId) {
  const contas = Array.isArray(S.contas) ? S.contas : [];
  const c = contas.find(x => String(x.id) === String(contaId));
  if (!c) {
    return `<div class="card card-p"><p>Título #${esc(contaId)} não encontrado.</p><button class="btn btn-secundario" onclick="fecharFolha()">Voltar</button></div>`;
  }

  const isReceber = c.tipo === 'receber';
  const hojeStr = typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10);

  return `
  <div class="card card-p" style="max-width:480px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">
        ${isReceber ? '🟢 Baixa de Título a Receber' : '🔴 Liquidação de Conta a Pagar'}
      </h3>
      <button class="btn-fechar" onclick="fecharFolha()">${ico('x', 18)}</button>
    </div>

    <div style="background:var(--aco-50);border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="font-weight:700;color:var(--aco-900);font-size:14px;margin-bottom:4px">
        ${esc(c.desc || c.descricao || 'Título Financeiro')}
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--aco-700);margin-bottom:4px">
        <span>Parte: <b>${esc(c.parte || '—')}</b></span>
        <span>Vencimento: <b>${typeof dataBR === 'function' ? dataBR(c.venc) : c.venc}</b></span>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--aco-200);padding-top:6px;margin-top:6px;font-size:15px">
        <span style="font-weight:700">Valor a Liquidar:</span>
        <span style="font-weight:800;color:${isReceber ? 'var(--verde)' : 'var(--tijolo)'}" class="num">
          ${typeof brl === 'function' ? brl(c.valor) : c.valor}
        </span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Meio de Pagamento Utilizado:</label>
        <select id="liq-meio" class="campo-select" style="width:100%;height:36px;font-weight:700">
          <option value="dinheiro">Dinheiro Físico (Caixa)</option>
          <option value="pix" selected>PIX</option>
          <option value="cartao_debito">Cartão de Débito</option>
          <option value="cartao_credito">Cartão de Crédito</option>
          <option value="transferencia">Transferência Bancária (TED/DOC)</option>
          <option value="boleto">Boleto Liquidado</option>
        </select>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Data da Liquidação:</label>
        <input type="date" id="liq-data" class="campo-texto" value="${hojeStr}" style="width:100%;height:36px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="liquidarTituloApi('${c.id}', document.getElementById('liq-meio').value, document.getElementById('liq-data').value);" style="font-weight:700;padding:0 20px">
        ${ico('check', 14)} Confirmar Liquidação no Caixa
      </button>
    </div>
  </div>`;
}

async function liquidarTituloApi(tituloId, meioPagamento, dataPagamento) {
  try {
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/titulos/${encodeURIComponent(tituloId)}/liquidar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        meioPagamento: meioPagamento || 'dinheiro',
        dataPagamento: dataPagamento || (typeof hoje === 'function' ? hoje() : new Date().toISOString().slice(0, 10))
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao liquidar título');

    if (data.titulo) {
      const idx = (S.contas || []).findIndex(c => String(c.id) === String(data.titulo.id));
      if (idx !== -1) S.contas[idx] = data.titulo;
    }
    if (data.movimentacao) {
      S.movimentos = S.movimentos || [];
      S.movimentos.push(data.movimentacao);
    }
    if (data.saldoCaixaAtual != null && Array.isArray(S.caixas)) {
      const cx = S.caixas.find(c => c.status === 'aberto');
      if (cx) cx.saldoAtual = data.saldoCaixaAtual;
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Título liquidado com sucesso!');
  } catch (err) {
    alert(`Falha na liquidação: ${err.message}`);
  }
}

function folhaLiberarSaidaExcepcional(osId) {
  const osList = Array.isArray(S.os) ? S.os : [];
  const o = osList.find(x => String(x.id) === String(osId) || String(x.num) === String(osId));
  if (!o) {
    return `<div class="card card-p"><p>OS #${typeof esc === 'function' ? esc(osId) : osId} não encontrada.</p><button class="btn btn-secundario" onclick="fecharFolha()">Voltar</button></div>`;
  }

  const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
  const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
  const lib = typeof calcularStatusLiberacaoOSFrontend === 'function' ? calcularStatusLiberacaoOSFrontend(o) : { saldoRestante: 0 };

  return `
  <div class="card card-p" style="max-width:520px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700;color:var(--aco-900)">
        🔓 Liberação Excepcional de Pátio — OS #${typeof esc === 'function' ? esc(o.num || o.id) : (o.num || o.id)}
      </h3>
      <button class="btn-fechar" onclick="fecharFolha()">${typeof ico === 'function' ? ico('x', 18) : '✕'}</button>
    </div>

    <div style="background:rgba(147, 51, 234, 0.06);border:1px solid rgba(147, 51, 234, 0.3);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span><b>Cliente:</b> ${typeof esc === 'function' ? esc(c.fantasia || c.nome || 'Geral') : (c.fantasia || c.nome || 'Geral')}</span>
        <span><b>Veículo / Placa:</b> ${typeof esc === 'function' ? esc(v.placa || '—') : (v.placa || '—')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px dashed rgba(147, 51, 234, 0.3);padding-top:6px;margin-top:6px;font-size:14px">
        <span style="font-weight:700;color:var(--tijolo)">Saldo Pendente no Pátio:</span>
        <span style="font-weight:800;color:var(--tijolo)" class="num">${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="background:var(--aco-50);padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);color:var(--aco-700)">
        ⚠️ <b>Atenção RBAC:</b> Esta operação autoriza a saída física do veículo do pátio mesmo com saldo devedor. É restrita a <b>Donos e Administradores</b> e será registrada na trilha de auditoria contábil.
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Justificativa da Liberação (mínimo 5 caracteres):</label>
        <textarea id="lib-justificativa" class="campo-texto" placeholder="Ex: Autorizado pelo gestor para faturamento mensal no dia 25" style="width:100%;height:80px;resize:vertical"></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Cancelar</button>
      <button class="btn btn-sucesso" onclick="liberarSaidaPatioExcepcionalApi('${o.id || o.num}', document.getElementById('lib-justificativa').value);" style="background:#6b21a8;border-color:#581c87;font-weight:700;padding:0 20px">
        ${typeof ico === 'function' ? ico('check', 14) : '✓'} Conceder Liberação Excepcional
      </button>
    </div>
  </div>`;
}

async function liberarSaidaPatioExcepcionalApi(osId, justificativa) {
  try {
    if (!justificativa || justificativa.trim().length < 5) {
      alert('A justificativa para liberação excepcional deve ter no mínimo 5 caracteres.');
      return;
    }
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : { 'Content-Type': 'application/json' };
    const res = await fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/liberar-saida`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ forcarLiberacao: true, justificativa: justificativa.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Erro ao conceder liberação excepcional');

    const osList = Array.isArray(S.os) ? S.os : [];
    const target = osList.find(x => String(x.id || x.num) === String(osId));
    if (target) {
      target.statusLiberacaoPatio = 'liberado_excepcional';
      target.liberacaoExcepcional = data.liberacaoExcepcional;
    }

    if (typeof fecharFolha === 'function') fecharFolha();
    if (typeof salvar === 'function') salvar();
    if (typeof render === 'function') render();
    alert(data.mensagem || 'Liberação excepcional de pátio concedida com sucesso!');
  } catch (err) {
    alert(`Falha na liberação excepcional: ${err.message}`);
  }
}

function gerarTextoCobrancaFrontend(osId) {
  const osList = Array.isArray(S.os) ? S.os : [];
  const o = osList.find(x => String(x.id || x.num) === String(osId)) || {};
  const v = typeof V === 'function' ? V(o.vei) : (o.veiculo || {});
  const c = typeof C === 'function' ? C(o.cli) : (o.cliente || {});
  const lib = typeof calcularStatusLiberacaoOSFrontend === 'function' ? calcularStatusLiberacaoOSFrontend(o) : { total: 0, saldoRestante: 0 };
  const cfg = S.cfg || {};

  const clienteNome = c.fantasia || c.nome || 'Cliente';
  const veiculoInfo = [v.marca, v.modelo, (v.placa ? `Placa ${v.placa}` : '')].filter(Boolean).join(' ') || (v.placa ? `Placa ${v.placa}` : 'Veículo');
  const nomeOficina = cfg.nomeOficina || cfg.empresa || cfg.nomeFantasia || 'Oficina';
  const chavePix = cfg.chavePix || cfg.pix || (cfg.financeiro && cfg.financeiro.chavePix) || 'financeiro@oficina.com.br';

  return `Olá, *${clienteNome}*! Aqui é da oficina *${nomeOficina}*.\n` +
    `Constatamos pendência financeira referente à OS *#${o.num || o.id || osId}* (*${veiculoInfo}*).\n` +
    `Valor total: ${typeof brl === 'function' ? brl(lib.total) : lib.total} | Saldo pendente: ${typeof brl === 'function' ? brl(lib.saldoRestante) : lib.saldoRestante}.\n` +
    `Chave Pix para quitação rápida: *${chavePix}*\n` +
    `Qualquer dúvida estamos à disposição!`;
}

function copiarAvisoCobranca(osId) {
  const texto = gerarTextoCobrancaFrontend(osId);
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(texto).then(() => {
      alert('📲 Texto de cobrança copiado com sucesso para a área de transferência! Cole no WhatsApp do cliente.');
    }).catch(() => {
      prompt('Copie o texto de cobrança abaixo:', texto);
    });
  } else {
    prompt('Copie o texto de cobrança abaixo:', texto);
  }
}

if (typeof window !== 'undefined') {
  window.folhaFaturarOS = folhaFaturarOS;
  window.faturarOSApi = faturarOSApi;
  window.folhaBaixarTituloVeronica = folhaBaixarTituloVeronica;
  window.liquidarTituloApi = liquidarTituloApi;
  window.folhaLiberarSaidaExcepcional = folhaLiberarSaidaExcepcional;
  window.liberarSaidaPatioExcepcionalApi = liberarSaidaPatioExcepcionalApi;
  window.gerarTextoCobrancaFrontend = gerarTextoCobrancaFrontend;
  window.copiarAvisoCobranca = copiarAvisoCobranca;
}
