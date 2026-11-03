/* =====================================================================
   PÁTIO CRM — DEMONSTRATIVO DE RESULTADOS (DRE) & BOLETIM DE FECHAMENTO
===================================================================== */

function blocoDRE() {
  const mes = mesRef(hoje());
  const movsMes = S.movimentos.filter(m => mesRef(m.data) === mes);
  const recMes = soma(movsMes.filter(m => m.tipo === 'entrada'), m => m.valor);
  const despesasPecas = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Fornecedores Peças'), m => m.valor);
  const despesasPessoal = soma(movsMes.filter(m => m.tipo === 'saida' && m.cat === 'Pessoal & Salários'), m => m.valor);
  const despesasFixas = soma(movsMes.filter(m => m.tipo === 'saida' && ['Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const outrasDesp = soma(movsMes.filter(m => m.tipo === 'saida' && !['Fornecedores Peças', 'Pessoal & Salários', 'Estrutura & Aluguel', 'Água / Luz / Internet'].includes(m.cat)), m => m.valor);
  const totalDesp = despesasPecas + despesasPessoal + despesasFixas + outrasDesp;
  const lucroLiq = recMes - totalDesp;
  const margemLiq = recMes > 0 ? ((lucroLiq / recMes) * 100).toFixed(1) : 0;

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div class="entre" style="border-bottom:2px solid var(--aco-900);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Demonstrativo Gerencial de Resultados (Regime de Caixa)</h3>
        <div class="mini">Apurado a partir de movimentações financeiras de caixa realizadas (${dataBR(hoje())})</div>
      </div>
      <div class="num" style="font-size:22px;font-weight:700;color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">
        ${brl(lucroLiq)} <span style="font-size:13px">(${margemLiq}%)</span>
      </div>
    </div>

    <div style="background:var(--aco-050);border-left:4px solid var(--primario);padding:10px 14px;border-radius:6px;font-size:12px;color:var(--aco-700);margin-bottom:16px;line-height:1.4">
      📊 <b>Critério Gerencial Operacional:</b> Este demonstrativo é apurado exclusivamente a partir de movimentações financeiras de caixa realizadas (entradas e saídas efetivas) para acompanhamento da saúde operacional da oficina mecânica. Não se confunde com DRE Contábil societária ou escrituração fiscal oficial, que devem ser emitidas através do ERP fiscal-contábil externo integrado da empresa.
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px">
      <div class="entre" style="font-weight:700;font-size:14.5px;color:var(--aco-900);background:var(--aco-050);padding:8px">
        <span>(+) RECEITA BRUTA OPERACIONAL REALIZADA</span>
        <span class="num">${brl(recMes)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Custos de Peças e Insumos Pagos (CMV Caixa)</span>
        <span class="num">${brl(despesasPecas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas com Folha de Pagamento / Mecânicos Pagas</span>
        <span class="num">${brl(despesasPessoal)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Despesas Fixas Pagas (Aluguel, Luz, Água, Internet)</span>
        <span class="num">${brl(despesasFixas)}</span>
      </div>

      <div class="entre" style="padding-left:14px;color:var(--aco-700)">
        <span>(−) Outras Despesas Operacionais e Administrativas</span>
        <span class="num">${brl(outrasDesp)}</span>
      </div>

      <div class="entre" style="font-weight:700;font-size:15px;border-top:2px solid var(--aco-300);padding-top:12px;margin-top:8px">
        <span>(=) RESULTADO OPERACIONAL GERENCIAL DE CAIXA</span>
        <span class="num" style="color:${lucroLiq >= 0 ? 'var(--verde)' : 'var(--tijolo)'}">${brl(lucroLiq)}</span>
      </div>
    </div>
  </div>`;
}

function folhaBoletimFechamento() {
  const caixaAberto = (Array.isArray(S.caixas) ? S.caixas : []).find(c => c.status === 'aberto');
  const ultimoCaixaFechado = (Array.isArray(S.caixas) ? S.caixas : []).find(c => c.status === 'fechado');
  const caixaRef = caixaAberto || ultimoCaixaFechado;

  let textoBoletim = '';
  if (caixaRef && caixaRef.fechamento && caixaRef.fechamento.resumoTextoWhatsapp) {
    textoBoletim = caixaRef.fechamento.resumoTextoWhatsapp;
  } else if (caixaAberto) {
    const movsCaixa = (S.movimentos || []).filter(m => (m.caixaId === caixaAberto.id) || (Array.isArray(caixaAberto.movimentacoesIds) && caixaAberto.movimentacoesIds.includes(m.id)));
    const totalEnt = movsCaixa.filter(m => m.tipo === 'entrada').reduce((a, b) => a + (Number(b.valor) || 0), 0);
    const totalSai = movsCaixa.filter(m => m.tipo === 'saida').reduce((a, b) => a + (Number(b.valor) || 0), 0);
    const saldoAtual = (Number(caixaAberto.saldoInicial) || 0) + totalEnt - totalSai;
    const qtdWpp = movsCaixa.filter(m => m.origem === 'whatsapp').length;
    const qtdWeb = movsCaixa.filter(m => (m.origem || 'web') !== 'whatsapp').length;

    textoBoletim = `⏳ *FECHAMENTO PARCIAL DE CAIXA* ⏳\n\n` +
      `• Turno: #${caixaAberto.id}\n` +
      `• Operador: ${caixaAberto.operador || 'Operador'}\n\n` +
      `💰 MOVIMENTAÇÃO:\n` +
      `• Fundo Inicial: ${brl(caixaAberto.saldoInicial || 0)}\n` +
      `• (+) Entradas: ${brl(totalEnt)}\n` +
      `• (-) Saídas: ${brl(totalSai)}\n` +
      `• (=) Saldo Atual: ${brl(saldoAtual)}\n\n` +
      `📊 QUEBRA POR ORIGEM:\n` +
      `• 📱 WhatsApp: ${qtdWpp} lançamentos\n` +
      `• 💻 Web / Balcão: ${qtdWeb} lançamentos\n\n` +
      `_Status: Turno em andamento._`;
  } else {
    textoBoletim = `Nenhum turno de caixa registrado ou encerrado no sistema.`;
  }

  return `
  <div style="max-width:540px;margin:0 auto">
    <div style="font-weight:700;font-size:16px;color:var(--aco-900);margin-bottom:8px;display:flex;align-items:center;gap:8px">
      📜 Boletim de Fechamento de Caixa Auditado
    </div>
    <div class="mini" style="margin-bottom:14px;color:var(--aco-600)">
      Boletim consolidado com quebra por canais (WhatsApp vs Web), meios de pagamento e estornos.
    </div>

    <div style="margin-bottom:16px">
      <textarea id="boletim-fechamento-textarea" class="campo-texto mono" readonly style="width:100%;height:220px;font-size:12px;line-height:1.5;padding:10px;background:var(--aco-050)">${esc(textoBoletim)}</textarea>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--aco-150);padding-top:12px;gap:8px">
      <button class="btn btn-secundario" onclick="fecharFolha()">Fechar</button>
      <button class="btn btn-primario" onclick="copiarBoletimFechamento()" style="font-weight:700">
        📋 Copiar para WhatsApp
      </button>
    </div>
  </div>`;
}

function abrirBoletimFechamentoModal() {
  if (typeof abrirFolha === 'function') {
    abrirFolha(folhaBoletimFechamento);
  } else {
    alert('Boletim de fechamento disponível no painel.');
  }
}

function copiarBoletimFechamento() {
  const el = document.getElementById('boletim-fechamento-textarea');
  if (el) {
    if (typeof copiar === 'function') {
      copiar(el.value);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(el.value);
    }
    if (typeof torrar === 'function') torrar('Boletim copiado com sucesso para a área de transferência!');
    else alert('Boletim copiado!');
  }
}

if (typeof window !== 'undefined') {
  window.blocoDRE = blocoDRE;
  window.folhaBoletimFechamento = folhaBoletimFechamento;
  window.abrirBoletimFechamentoModal = abrirBoletimFechamentoModal;
  window.copiarBoletimFechamento = copiarBoletimFechamento;
}
if (typeof globalThis !== 'undefined') {
  globalThis.blocoDRE = blocoDRE;
  globalThis.folhaBoletimFechamento = folhaBoletimFechamento;
  globalThis.abrirBoletimFechamentoModal = abrirBoletimFechamentoModal;
  globalThis.copiarBoletimFechamento = copiarBoletimFechamento;
}

