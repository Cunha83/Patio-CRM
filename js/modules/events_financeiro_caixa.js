/**
 * Módulo: events_financeiro_caixa.js
 * Pátio-CRM — Handlers de Eventos: Gestão Financeira, Títulos, Tesouraria, Caixa e Extratos
 * Arquitetura Modular (< 350 lines).
 */

function tratarEventosFinanceiroCaixa(a, b, e, o) {
  switch (a) {
    case 'aba-fin':
      S.ui.abaFin = b.dataset.k;
      render();
      return true;

    case 'mudar-periodo-bi':
      S.ui.periodoBI = b.dataset.p;
      render();
      return true;

    case 'cobrar-titulo': {
      const id = b.dataset.id;
      const tit = (S.contasReceber || []).find(x => x.id === id) || (S.contas || []).find(x => x.id === id);
      if (!tit) {
        torrar('Título não encontrado.', 'alerta');
        return true;
      }
      const tel = (tit.telefone || tit.fone || '').replace(/\D/g, '');
      const pixKey = (S.cfg && S.cfg.oficina && S.cfg.oficina.pix) || (S.cfg && S.cfg.pixChave) || 'financeiro';
      const msg = `Olá, ${tit.cliente || tit.parte || 'Cliente'}! Lembramos do título ${tit.doc || tit.id} no valor de ${brl(tit.valor)} com vencimento em ${dataBR(tit.venc)}. Chave Pix da oficina: ${pixKey}`;
      copiar(msg);
      if (tel && typeof window !== 'undefined') {
        window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(msg)}`, '_blank');
      }
      torrar('Mensagem de cobrança copiada / aberta no WhatsApp!', 'sucesso');
      return true;
    }

    case 'conciliar-avulso': {
      const id = b.dataset.id;
      const item = (S.extrato || []).find(x => x.id === id);
      if (item) {
        item.conciliado = true;
        salvar();
        render();
        torrar('Lançamento de extrato conciliado com sucesso!', 'sucesso');
      } else {
        torrar('Item de extrato não encontrado.', 'alerta');
      }
      return true;
    }

    case 'filtro-fin':
      S.ui.filtroFin = b.dataset.f;
      render();
      return true;

    case 'filtro-origem-mov':
      S.ui.filtroOrigemMov = b.dataset.o;
      render();
      return true;

    case 'filtro-meio-mov':
      S.ui.filtroMeioPagamentoMov = b.dataset.m;
      render();
      return true;

    case 'exportar-csv-financeiro':
      if (typeof exportarMovimentacoesCSV === 'function') exportarMovimentacoesCSV();
      return true;

    case 'estornar-mov':
      if (typeof solicitarEstornoMovimento === 'function') solicitarEstornoMovimento(b.dataset.id);
      return true;

    case 'aplicar-filtro-fin-custom': {
      const de = document.getElementById('fin_filtro_de')?.value;
      const ate = document.getElementById('fin_filtro_ate')?.value;
      if (!de || !ate) {
        torrar('Selecione as datas inicial e final');
        return true;
      }
      S.ui.filtroFin = 'custom';
      S.ui.filtroFinDe = de;
      S.ui.filtroFinAte = ate;
      render();
      return true;
    }

    case 'baixar': {
      if (typeof folhaBaixarTituloVeronica === 'function') {
        abrirFolha(() => folhaBaixarTituloVeronica(b.dataset.id));
      } else {
        const c = S.contas.find(x => x.id === b.dataset.id);
        baixarConta(c);
        render();
        torrar(`${c.tipo === 'receber' ? 'Recebimento' : 'Pagamento'} efetuado · ${brl(c.valor)}`);
      }
      return true;
    }

    case 'faturar-os-prazo': {
      const osId = b.dataset.id || (S.ui && S.ui.osAberta);
      if (osId && typeof folhaFaturarOS === 'function') {
        abrirFolha(() => folhaFaturarOS(osId));
      }
      return true;
    }

    case 'liberar-os-excepcional': {
      const osId = b.dataset.id || (S.ui && S.ui.osAberta);
      if (osId && typeof folhaLiberarSaidaExcepcional === 'function') {
        abrirFolha(() => folhaLiberarSaidaExcepcional(osId));
      }
      return true;
    }

    case 'copiar-aviso-cobranca': {
      const osId = b.dataset.id || (S.ui && S.ui.osAberta);
      if (osId && typeof copiarAvisoCobranca === 'function') {
        copiarAvisoCobranca(osId);
      }
      return true;
    }

    case 'imprimir-recibo':
      imprimirRecibo(b.dataset.id);
      return true;

    case 'nova-conta':
      S.ui.contaTipo = b.dataset.t;
      S.ui.rascConta = null;
      abrirFolha(folhaConta);
      return true;

    case 'salvar-conta': {
      const r = S.ui.rascConta || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); return true; }
      S.contas.push({
        id: uid('ct'),
        tipo: S.ui.contaTipo,
        desc: r.desc,
        parte: r.parte || '—',
        valor: +r.valor,
        venc: r.venc || hoje(),
        pago: false,
        cat: r.cat || 'Outros',
        doc: ''
      });
      salvar(); S.ui.rascConta = null; fecharFolha(); render();
      torrar('Título lançado!');
      return true;
    }

    case 'novo-mov':
      S.ui.rascMov = null;
      abrirFolha(folhaMov);
      return true;

    case 'salvar-mov': {
      const r = S.ui.rascMov || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); return true; }
      S.movimentos.push({
        id: uid('mv'),
        data: r.data || hoje(),
        tipo: r.tipo || 'entrada',
        desc: r.desc,
        valor: +r.valor,
        cat: r.cat || 'Geral',
        conc: false
      });
      salvar(); S.ui.rascMov = null; fecharFolha(); render();
      torrar('Movimento registrado no caixa!');
      return true;
    }

    case 'limpar-extrato':
      S.extrato = [];
      salvar(); render();
      torrar('Extrato limpo');
      return true;

    case 'imprimir-fechamento-caixa':
      imprimirFechamentoCaixa();
      return true;

    default:
      return false;
  }
}

function tratarChangeFinanceiroCaixa(a, el, e, o) {
  if (a === 'arquivo-extrato') {
    const files = el.files;
    if (!files || !files.length) return true;
    torrar('Processando arquivo(s) de extrato...', 'neutro');
    let importados = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const txt = ev.target.result;
        const linhas = txt.split(/\r?\n/).filter(l => l.trim().length > 0);
        S.extrato = S.extrato || [];
        linhas.forEach(linha => {
          if (linha.includes(';') || linha.includes(',')) {
            const cols = linha.split(/[,;]/);
            if (cols.length >= 2) {
              const valorNum = parseFloat(cols[cols.length - 1].replace(/[^\d.-]/g, '')) || 0;
              if (valorNum !== 0) {
                S.extrato.push({
                  id: typeof uid === 'function' ? uid('ext') : 'ext_' + Date.now() + Math.random().toString(36).slice(2, 6),
                  data: cols[0].trim() || hoje(),
                  desc: cols.slice(1, cols.length - 1).join(' ').trim() || 'Lançamento bancário',
                  valor: valorNum,
                  conciliado: false
                });
                importados++;
              }
            }
          }
        });
        salvar();
        render();
        torrar(`Extrato importado com ${importados || linhas.length} lançamentos.`, 'sucesso');
      };
      reader.readAsText(file);
    });
    return true;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.tratarEventosFinanceiroCaixa = tratarEventosFinanceiroCaixa;
  window.tratarChangeFinanceiroCaixa = tratarChangeFinanceiroCaixa;
}
if (typeof globalThis !== 'undefined') {
  globalThis.tratarEventosFinanceiroCaixa = tratarEventosFinanceiroCaixa;
  globalThis.tratarChangeFinanceiroCaixa = tratarChangeFinanceiroCaixa;
}

