/**
 * Módulo: events_estoque_compras.js
 * Pátio-CRM — Handlers de Eventos: Peças, Almoxarifado, Entrada de Notas XML e OCR
 * Arquitetura Modular (< 350 linhas).
 */

function lerArquivosXML(files) {
  if (!files || !files.length) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      S.ui.nota = lerXML(fr.result);
      renderFolha();
    } catch (err) {
      torrar('Erro ao interpretar arquivo XML de NF-e.');
    }
  };
  fr.readAsText(files[0], 'UTF-8');
}

function tratarEventosEstoqueCompras(a, b, e, o) {
  switch (a) {
    case 'nova-compra':
      if (typeof abrirModalNovaCompra === 'function') abrirModalNovaCompra();
      return true;

    case 'filtro-estoque':
      S.ui.filtroEstoque = b.dataset.f;
      render();
      return true;

    case 'aba-estoque':
      S.ui.abaEstoque = b.dataset.subaba;
      render();
      return true;

    case 'ver-peca':
      S.ui.pecaAberta = b.dataset.id;
      abrirFolha(folhaPeca);
      return true;

    case 'mov-peca': {
      const p = P(S.ui.pecaAberta);
      p.qtd = Math.max(0, p.qtd + Number(b.dataset.d));
      salvar(); renderFolha(); render();
      return true;
    }

    case 'mov-peca-grid': {
      const p = P(b.dataset.id);
      p.qtd = Math.max(0, p.qtd + Number(b.dataset.d));
      salvar(); render();
      return true;
    }

    case 'nova-peca':
      S.ui.rascPeca = null;
      abrirFolha(folhaNovaPeca);
      return true;

    case 'salvar-peca': {
      const r = S.ui.rascPeca || {};
      if (!r.nome) { torrar('Descrição da peça é obrigatória'); return true; }
      S.pecas.push({
        id: uid('p'),
        cod: r.cod || ('MAN-' + Math.floor(Math.random() * 9000 + 1000)),
        nome: r.nome,
        un: r.un || 'un',
        qtd: +r.qtd || 0,
        min: +r.min || 1,
        custo: +r.custo || 0,
        venda: +r.venda || 0,
        loc: r.loc || '—',
        forn: r.forn || '—'
      });
      salvar(); S.ui.rascPeca = null; fecharFolha(); render();
      torrar('Peça cadastrada no almoxarifado!');
      return true;
    }

    case 'excluir-peca':
    case 'excluir-peca-id': {
      const pId = b.dataset.id || S.ui.pecaAberta;
      pedirConfirmacao('pc' + pId, 'Toque de novo para excluir a peça', () => {
        S._excluidos = S._excluidos || {};
        S._excluidos.pecas = S._excluidos.pecas || [];
        if (!S._excluidos.pecas.includes(pId)) S._excluidos.pecas.push(pId);
        S.pecas = S.pecas.filter(x => x.id !== pId);
        salvar(); fecharFolha(); render(); torrar('Peça removida.');
      });
      return true;
    }

    case 'duplicar-produto': {
      const prodId = b.dataset.id;
      if (!prodId) return true;
      fetch('/api/produtos/duplicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prodId })
      })
        .then(r => r.json())
        .then(d => {
          if (d.success && d.item) {
            S.pecas.push(d.item);
            salvar();
            render();
            torrar(`Produto duplicado com sucesso: ${d.item.nome}`, 'sucesso');
          } else {
            torrar(d.error || 'Erro ao duplicar produto.', 'erro');
          }
        })
        .catch(() => torrar('Erro de rede ao duplicar produto.', 'erro'));
      return true;
    }

    case 'importar-xml':
      S.ui.nota = null;
      abrirFolha(folhaXML);
      return true;

    case 'confirmar-xml':
      confirmarXML();
      return true;

    case 'ocr-entrada':
      abrirFolha(folhaSimulacaoOCR);
      return true;

    case 'importar-exemplo-ocr': {
      S.pecas.push(
        { id: uid('p'), cod: 'LON-HD291', nome: 'Jogo de Lonas de Freio Heavy Duty', un: 'jg', qtd: 4, min: 2, custo: 480.00, venda: 780.00, loc: 'Prat. A-04', forn: 'ZF do Brasil' },
        { id: uid('p'), cod: 'CIL-M204', nome: 'Cilindro Mestre de Embreagem', un: 'un', qtd: 2, min: 1, custo: 960.00, venda: 1550.00, loc: 'Prat. C-02', forn: 'ZF do Brasil' }
      );
      S.contas.push({ id: uid('ct'), tipo: 'pagar', desc: 'NF-e 784102 — ZF do Brasil', parte: 'ZF do Brasil', valor: 3840.00, venc: addDias(hoje(), 28), pago: false, cat: 'Fornecedores Peças', doc: 'NF-784102' });
      salvar(); fecharFolha(); render();
      torrar('OCR processado: 2 peças e R$ 3.840,00 lançados!');
      return true;
    }

    case 'carregar-exemplo-ocr':
      torrar('Exemplo de OCR carregado para conferência.', 'sucesso');
      return true;

    default:
      return false;
  }
}

function tratarChangeEstoqueCompras(a, el, e, o) {
  if (a === 'campo-peca') { renderFolha(); render(); return true; }
  if (a === 'arquivo-xml') { lerArquivosXML(el.files); return true; }
  return false;
}

if (typeof window !== 'undefined') {
  window.lerArquivosXML = lerArquivosXML;
  window.tratarEventosEstoqueCompras = tratarEventosEstoqueCompras;
  window.tratarChangeEstoqueCompras = tratarChangeEstoqueCompras;
}
if (typeof globalThis !== 'undefined') {
  globalThis.lerArquivosXML = lerArquivosXML;
  globalThis.tratarEventosEstoqueCompras = tratarEventosEstoqueCompras;
  globalThis.tratarChangeEstoqueCompras = tratarChangeEstoqueCompras;
}

