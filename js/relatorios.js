/* =====================================================================
   PÁTIO CRM — MÓDULO DE RELATÓRIOS, EXPORTAÇÕES & BACKUP
===================================================================== */

function viewRelatorios() {
  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('download', 14)} Exportação CSV</div>
      <div class="v" style="font-size:18px">Formatos Excel</div>
      <div class="d">OSs, Clientes, Peças e Financeiro</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('cfg', 14)} Backup de Dados</div>
      <div class="v" style="font-size:18px">Arquivo .JSON</div>
      <div class="d">Segurança total offline</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('imprimir', 14)} Fechamento Diário</div>
      <div class="v" style="font-size:18px">Impressão Caixa</div>
      <div class="d">Conferência física e digital</div>
    </div>
    <div class="kpi aviso">
      <div class="r">${ico('patio', 14)} Produtividade</div>
      <div class="v" style="font-size:18px">Boxes & Equipe</div>
      <div class="d">Performance dos mecânicos</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
    <!-- Bloco de Exportações CSV/Excel -->
    <div class="card card-p">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px">Exportações em Planilha (CSV / Excel)</div>
      <div class="mini" style="margin-bottom:16px">Baixe relatórios tabulares compatíveis com Excel, Google Sheets e PowerBI.</div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="entre" style="padding:10px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Relatório Completo de Ordens de Serviço</b>
            <div class="mini">${(S.os || []).length} ordens registradas com valores e peças</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="os" style="font-size:12px;padding:6px 12px">
            ${ico('download', 14)} Baixar CSV
          </button>
        </div>

        <div class="entre" style="padding:10px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Posição Atual de Estoque & Peças</b>
            <div class="mini">${(S.pecas || []).length} itens com saldo, custo e venda</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="pecas" style="font-size:12px;padding:6px 12px">
            ${ico('download', 14)} Baixar CSV
          </button>
        </div>

        <div class="entre" style="padding:10px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Extrato Financeiro & Movimentações</b>
            <div class="mini">${(S.movimentos || []).length} lançamentos de entradas e saídas</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="financeiro" style="font-size:12px;padding:6px 12px">
            ${ico('download', 14)} Baixar CSV
          </button>
        </div>

        <div class="entre" style="padding:10px;background:var(--aco-050);border-radius:8px">
          <div>
            <b>Base Cadastral de Clientes & Frotas</b>
            <div class="mini">${(S.clientes || []).length} clientes cadastrados</div>
          </div>
          <button class="btn btn-secundario" data-act="exportar-csv" data-tipo="clientes" style="font-size:12px;padding:6px 12px">
            ${ico('download', 14)} Baixar CSV
          </button>
        </div>
      </div>
    </div>

    <!-- Bloco de Backup, Restauração e Fechamento -->
    <div class="card card-p">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px">Backup, Restauração & Caixa</div>
      <div class="mini" style="margin-bottom:16px">Garantia de integridade e conferência física do dia a dia.</div>

      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="padding:12px;border:1px solid var(--aco-200);border-radius:8px">
          <b>Fechamento Diário de Caixa</b>
          <div class="mini" style="margin-top:2px;margin-bottom:8px">Gera comprovante para conferência dos recebimentos e pagamentos do dia.</div>
          <button class="btn btn-primario" data-act="imprimir-fechamento-caixa" style="font-size:12px;padding:6px 12px">
            ${ico('imprimir', 14)} Imprimir Fechamento de Hoje (${dataBR(hoje())})
          </button>
        </div>

        <div style="padding:12px;border:1px solid var(--aco-200);border-radius:8px">
          <b>Exportar Backup do Banco de Dados (.JSON)</b>
          <div class="mini" style="margin-top:2px;margin-bottom:8px">Baixe todos os dados da oficina em um único arquivo de segurança.</div>
          <button class="btn btn-secundario" data-act="exportar-backup-json" style="font-size:12px;padding:6px 12px">
            ${ico('download', 14)} Fazer Download do Backup
          </button>
        </div>

        <div style="padding:12px;border:1px solid var(--aco-200);border-radius:8px">
          <b>Restaurar Banco de Dados via Backup</b>
          <div class="mini" style="margin-top:2px;margin-bottom:8px">Substitui os dados locais a partir de um arquivo JSON previamente salvo.</div>
          <label class="btn btn-secundario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 12px">
            ${ico('upload', 14)} Selecionar Arquivo de Backup
            <input type="file" accept=".json" data-act="restaurar-backup-json" style="display:none">
          </label>
        </div>
      </div>
    </div>
  </div>`;
}

/* =====================================================================
   FUNÇÕES DE EXPORTAÇÃO CSV
===================================================================== */
function exportarCSV(tipo) {
  let csv = '', nomeArquivo = '';

  if (tipo === 'os') {
    nomeArquivo = `patio_ordens_servico_${hoje()}.csv`;
    csv = 'Numero;Data Abertura;Status;Placa;Modelo;Cliente;Mecanico;Servicos (R$);Pecas (R$);Desconto (R$);Total (R$)\n';
    (S.os || []).forEach(o => {
      const v = V(o.vei), c = C(o.cli);
      const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
      const total = totOS(o);
      csv += `${o.num};"${o.abertura}";"${ST[o.st].r}";"${v.placa}";"${v.modelo}";"${c.nome}";"${o.mec || ''}";${totServ.toFixed(2)};${totPec.toFixed(2)};${(o.desc || 0).toFixed(2)};${total.toFixed(2)}\n`;
    });
  } else if (tipo === 'pecas') {
    nomeArquivo = `patio_estoque_pecas_${hoje()}.csv`;
    csv = 'Codigo;Descricao;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Localizacao;Fornecedor\n';
    (S.pecas || []).forEach(p => {
      csv += `"${p.cod}";"${p.nome}";"${p.un || 'un'}";${p.qtd};${p.min};${p.custo.toFixed(2)};${p.venda.toFixed(2)};"${p.loc || ''}";"${p.forn || ''}"\n`;
    });
  } else if (tipo === 'financeiro') {
    nomeArquivo = `patio_movimentacoes_caixa_${hoje()}.csv`;
    csv = 'Data;Tipo;Descricao;Categoria;Forma;Valor (R$);Conciliado\n';
    (S.movimentos || []).forEach(m => {
      csv += `"${m.data}";"${m.tipo}";"${m.desc}";"${m.cat || 'Geral'}";"${m.forma || ''}";${m.valor.toFixed(2)};${m.conc ? 'Sim' : 'Nao'}\n`;
    });
  } else if (tipo === 'clientes') {
    nomeArquivo = `patio_clientes_${hoje()}.csv`;
    csv = 'Razao Social;Fantasia;CNPJ_CPF;Telefone;Contato;Cidade;UF;Prazo (dias)\n';
    (S.clientes || []).forEach(c => {
      csv += `"${c.nome}";"${c.fantasia || ''}";"${c.doc || ''}";"${c.fone || ''}";"${c.contato || ''}";"${c.cidade || ''}";"${c.uf || ''}";${c.prazo || 0}\n`;
    });
  }

  baixarArquivo(csv, nomeArquivo, 'text/csv;charset=utf-8;');
  torrar(`Relatório exportado: ${nomeArquivo}`);
}

function exportarBackupJSON() {
  const dados = JSON.stringify(S, null, 2);
  const nome = `backup_patio_crm_${hoje()}_${Date.now()}.json`;
  baixarArquivo(dados, nome, 'application/json');
  torrar('Backup completo baixado com sucesso!');
}

function restaurarBackupJSON(arquivo) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const obj = JSON.parse(fr.result);
      if (obj && obj.os && obj.clientes && obj.pecas) {
        S = obj;
        salvar();
        render();
        torrar('Backup restaurado com sucesso!');
      } else {
        torrar('Arquivo de backup inválido ou incompatível.');
      }
    } catch (e) {
      torrar('Erro ao processar arquivo JSON de backup.');
    }
  };
  fr.readAsText(arquivo);
}

function baixarArquivo(conteudo, nome, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =====================================================================
   FECHAMENTO DIÁRIO DE CAIXA (IMPRESSÃO)
===================================================================== */
function imprimirFechamentoCaixa() {
  const dH = hoje();
  const movsHoje = (S.movimentos || []).filter(m => m.data === dH);
  const entradas = movsHoje.filter(m => m.tipo === 'entrada');
  const saidas = movsHoje.filter(m => m.tipo === 'saida');
  const totEntradas = soma(entradas, m => m.valor);
  const totSaidas = soma(saidas, m => m.valor);
  const saldoFinal = saldoCaixa();

  const janela = window.open('', '_blank');
  if (!janela) return;

  janela.document.write(`
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Fechamento Diário de Caixa — ${dataBRfull(dH)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12.5px; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #94a3b8; border-radius: 6px; }
      .topo { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th { background: #f1f5f9; text-align: left; padding: 6px; border-bottom: 1px solid #cbd5e1; }
      td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
      .totais { background: #f8fafc; padding: 10px; border-radius: 6px; margin-top: 14px; border: 1px solid #cbd5e1; }
      .tot-linha { display: flex; justify-content: space-between; margin-bottom: 4px; }
      .ass { margin-top: 40px; display: flex; justify-content: space-between; }
      .campo-ass { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="topo">
      <h2 style="margin:0">${esc(S.cfg.empresa)}</h2>
      <div style="font-size:14px;font-weight:bold;margin-top:4px">FECHAMENTO DIÁRIO DE CAIXA</div>
      <div>Data de Referência: ${dataBRfull(dH)} às ${horaBR()}</div>
    </div>

    <div style="font-weight:bold;margin-bottom:4px">ENTRADAS DO DIA (${entradas.length})</div>
    <table>
      <thead><tr><th>Descrição</th><th>Forma</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${entradas.map(e => `<tr><td>${esc(e.desc)}</td><td>${esc(e.forma || 'Pix')}</td><td style="text-align:right">${brl(e.valor)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center">Nenhuma entrada hoje</td></tr>'}
      </tbody>
    </table>

    <div style="font-weight:bold;margin-bottom:4px">SAÍDAS DO DIA (${saidas.length})</div>
    <table>
      <thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${saidas.map(s => `<tr><td>${esc(s.desc)}</td><td>${esc(s.cat || 'Geral')}</td><td style="text-align:right">${brl(s.valor)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center">Nenhuma saída hoje</td></tr>'}
      </tbody>
    </table>

    <div class="totais">
      <div class="tot-linha"><span>(+) Total de Entradas:</span><b style="color:#10b981">${brl(totEntradas)}</b></div>
      <div class="tot-linha"><span>(−) Total de Saídas:</span><b style="color:#ef4444">${brl(totSaidas)}</b></div>
      <div class="tot-linha" style="font-size:14px;font-weight:bold;border-top:1px solid #94a3b8;padding-top:6px;margin-top:6px">
        <span>(=) SALDO FINAL CONSOLIDADO EM CAIXA:</span>
        <span>${brl(saldoFinal)}</span>
      </div>
    </div>

    <div class="ass">
      <div class="campo-ass">Responsável pelo Caixa</div>
      <div class="campo-ass">Gerência Financeira</div>
    </div>

    <script>window.onload = () => window.print();<\/script>
  </body>
  </html>`);
  janela.document.close();
}
