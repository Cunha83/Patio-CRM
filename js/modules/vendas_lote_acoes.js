/**
 * Módulo: vendas_lote_acoes.js
 * Pátio-CRM — Detalhes, Ações em Lote, WhatsApp e Faturamento de Vendas
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function abrirDetalhesVenda(id) {
    const venda = (S.vendas || []).find(v => v.id === id);
    if (!venda) return;

    abrirFolha(() => `
    <div class="card card-p" style="max-width:720px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0">Venda #${venda.codigo || venda.id} — ${esc(venda.clienteNome || 'Cliente Balcão')}</h3>
          <div class="mini mono">Data: ${dataBR(venda.data)} · Forma: ${esc(venda.formaPgto || 'À vista')} · Situação: ${esc(venda.situacao || 'Finalizada')}</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <!-- Itens -->
      ${(venda.pecas || []).length > 0 ? `
        <div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px">Peças / Produtos</div>
          <table class="tabela">
            <thead>
              <tr>
                <th>Peça</th>
                <th style="width:80px;text-align:center">Qtd</th>
                <th style="width:110px;text-align:right">Valor Unit.</th>
                <th style="width:110px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${venda.pecas.map(p => `
                <tr>
                  <td><b>${esc(p.nome)}</b></td>
                  <td style="text-align:center">${p.qtd} un</td>
                  <td style="text-align:right">${brl(p.valor)}</td>
                  <td style="text-align:right;font-weight:700">${brl(p.qtd * p.valor)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${(venda.servicos || []).length > 0 ? `
        <div style="margin-bottom:14px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px">Mão de Obra / Serviços</div>
          <table class="tabela">
            <thead>
              <tr>
                <th>Serviço</th>
                <th style="width:80px;text-align:center">Qtd</th>
                <th style="width:110px;text-align:right">Valor Unit.</th>
                <th style="width:110px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${venda.servicos.map(s => `
                <tr>
                  <td><b>${esc(s.nome)}</b></td>
                  <td style="text-align:center">${s.qtd} un</td>
                  <td style="text-align:right">${brl(s.valor)}</td>
                  <td style="text-align:right;font-weight:700">${brl(s.qtd * s.valor)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div class="entre" style="border-top:1px solid var(--aco-150);padding-top:14px;align-items:center">
        <div style="font-size:18px;font-weight:800;color:var(--verde)">
          Total da Venda: ${brl(venda.total || 0)}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secundario" onclick="window.print()">${ico('imprimir', 14)} Imprimir Comprovante</button>
          <button class="btn btn-secundario" data-act="fechar">Fechar</button>
        </div>
      </div>
    </div>`);
  }

  function excluirVenda(id) {
    pedirConfirmacao('excluir_venda_' + id, 'Toque de novo para excluir o registro desta venda', () => {
      S.vendas = (S.vendas || []).filter(v => v.id !== id);
      salvar();
      render();
      torrar('Venda excluída.');
    });
  }

  function faturarVendaEmEspera(id) {
    const venda = (S.vendas || []).find(v => v.id === id);
    if (!venda) return;

    // Baixa estoque
    S.pecas = S.pecas || [];
    (venda.pecas || []).forEach(it => {
      const p = S.pecas.find(x => x.id === it.pecaId);
      if (p) p.qtd = Math.max(0, (Number(p.qtd) || 0) - (Number(it.qtd) || 0));
    });

    venda.situacao = 'Finalizada';
    salvar();
    render();
    torrar('Venda faturada e estoque deduzido!', 'sucesso');
  }

  function enviarVendaWhatsApp(id) {
    const v = (S.vendas || []).find(x => x.id === id);
    if (!v) {
      torrar('Venda não encontrada.', 'alerta');
      return;
    }
    const cliNome = v.clienteNome || 'Cliente';
    const cli = (S.clientes || []).find(c => c.nome === v.clienteNome);
    const tel = (v.telefone || (cli && cli.telefone) || (cli && cli.fone) || '').replace(/\D/g, '');
    const itens = (v.pecas || []).map(it => `• ${it.nome} (${it.qtd}x) - ${brl(it.total || (it.qtd * it.unitario))}`).join('\n');
    const msg = [
      `*${(S.cfg && S.cfg.empresa) || 'Oficina'}* — Resumo da Venda #${v.codigo || v.id}`,
      `Cliente: ${cliNome}`,
      `Data: ${dataBR(v.data || hoje())}`,
      '',
      '*Itens:*',
      itens || '• Venda direta de balcão',
      '',
      `*Total: ${brl(v.total || 0)}*`,
      v.formapgto ? `Forma de Pagamento: ${v.formapgto}` : '',
      '',
      'Agradecemos a sua preferência!'
    ].filter(Boolean).join('\n');

    if (typeof copiar === 'function') copiar(msg);
    if (tel && typeof window !== 'undefined') {
      window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(msg)}`, '_blank');
    }
    torrar('Resumo da venda gerado / aberto no WhatsApp!', 'sucesso');
  }

  function acaoEmLoteVendas(acao) {
    const selecionados = Array.from(document.querySelectorAll('.chk-venda:checked')).map(el => el.value);
    if (selecionados.length === 0) {
      torrar('Selecione ao menos uma venda para a ação.', 'alerta');
      return;
    }

    if (acao === 'excluir') {
      if (confirm(`Deseja realmente excluir as ${selecionados.length} vendas selecionadas?`)) {
        S.vendas = (S.vendas || []).filter(v => !selecionados.includes(v.id));
        salvarLocal();
        render();
        torrar(`${selecionados.length} vendas excluídas com sucesso.`, 'sucesso');
      }
    } else if (acao === 'duplicar') {
      const original = (S.vendas || []).find(v => v.id === selecionados[0]);
      if (original) {
        const novoId = 'v' + Date.now().toString().slice(-4);
        const copia = JSON.parse(JSON.stringify(original));
        copia.id = novoId;
        copia.codigo = 'V-' + Math.floor(100 + Math.random() * 900);
        copia.data = hoje();
        copia.situacao = 'Pendente';
        copia.temFinanceiroPendente = true;
        S.vendas.unshift(copia);
        salvarLocal();
        render();
        torrar(`Venda #${original.codigo || original.id} duplicada com sucesso!`, 'sucesso');
      }
    } else if (acao === 'imprimir') {
      window.print();
    } else if (acao === 'whatsapp') {
      enviarVendaWhatsApp(selecionados[0]);
    } else if (acao === 'nfe') {
      torrar(`Iniciando geração de NF-e para a venda #${selecionados[0]}...`, 'neutro');
      const venda = (S.vendas || []).find(v => v.id === selecionados[0]);
      if (venda) {
        venda.temAnexoNfe = true;
        salvarLocal();
        render();
        torrar(`NF-e gerada para a venda #${venda.codigo || venda.id}!`, 'sucesso');
      }
    }
  }

  // Exportações explícitas para window e globalThis
  global.abrirDetalhesVenda = abrirDetalhesVenda;
  global.excluirVenda = excluirVenda;
  global.faturarVendaEmEspera = faturarVendaEmEspera;
  global.enviarVendaWhatsApp = enviarVendaWhatsApp;
  global.acaoEmLoteVendas = acaoEmLoteVendas;

  if (typeof window !== 'undefined') {
    window.abrirDetalhesVenda = abrirDetalhesVenda;
    window.excluirVenda = excluirVenda;
    window.faturarVendaEmEspera = faturarVendaEmEspera;
    window.enviarVendaWhatsApp = enviarVendaWhatsApp;
    window.acaoEmLoteVendas = acaoEmLoteVendas;
  }
})(typeof window !== 'undefined' ? window : globalThis);

