/* =====================================================================
   PÁTIO CRM — IMPORTADOR DE XML DE COMPRAS (NF-e MODELO 55)
   Submódulo extraído de js/compras.js (< 350 linhas)
   ===================================================================== */

async function processarXMLCompra(arquivo) {
  if (!arquivo) return;
  if (typeof arquivo !== 'string' && arquivo.name && !arquivo.name.toLowerCase().endsWith('.xml')) {
    torrar('Selecione um arquivo XML de NF-e válido.', 'erro');
    return;
  }

  torrar('Lendo XML da NF-e...', 'neutro');

  try {
    const textoXML = typeof arquivo === 'string' ? arquivo : (arquivo && arquivo.text ? await arquivo.text() : '');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(textoXML, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      torrar('Arquivo XML inválido ou corrompido.', 'erro');
      return;
    }

    const getVal = (parent, tag) => {
      if (!parent) return '';
      const el = parent.getElementsByTagName(tag)[0];
      return el ? (el.textContent || '').trim() : '';
    };

    // 1. Dados da Identificação da Nota
    const ide = xmlDoc.getElementsByTagName('ide')[0];
    const nNF = getVal(ide, 'nNF') || 'S/N';
    const dhEmi = getVal(ide, 'dhEmi') || getVal(ide, 'dEmi') || hoje();
    const dataEmissao = dhEmi.substring(0, 10);

    // 2. Dados do Emitente (Fornecedor)
    const emit = xmlDoc.getElementsByTagName('emit')[0];
    const cnpjEmit = getVal(emit, 'CNPJ') || getVal(emit, 'CPF');
    const nomeEmit = getVal(emit, 'xNome') || 'Fornecedor XML';
    const fantEmit = getVal(emit, 'xFant') || nomeEmit;
    const enderEmit = emit ? emit.getElementsByTagName('enderEmit')[0] : null;
    const munEmit = getVal(enderEmit, 'xMun');
    const ufEmit = getVal(enderEmit, 'UF');
    const foneEmit = getVal(enderEmit, 'fone');

    // Vincula ou cria fornecedor em S.fornecedores
    S.fornecedores = S.fornecedores || [];
    let fornecedor = S.fornecedores.find(f => (cnpjEmit && f.doc === cnpjEmit) || f.nome.toLowerCase() === nomeEmit.toLowerCase());
    if (!fornecedor) {
      fornecedor = {
        id: uid('forn'),
        nome: nomeEmit,
        fantasia: fantEmit,
        doc: cnpjEmit,
        cidade: munEmit,
        uf: ufEmit,
        fone: foneEmit,
        contato: 'Importado via XML'
      };
      S.fornecedores.push(fornecedor);
    }

    // 3. Dados dos Itens / Produtos (<det>)
    const detList = xmlDoc.getElementsByTagName('det');
    const itensImportados = [];
    S.pecas = S.pecas || [];

    for (let i = 0; i < detList.length; i++) {
      const det = detList[i];
      const prod = det.getElementsByTagName('prod')[0];
      if (!prod) continue;

      const cProd = getVal(prod, 'cProd');
      const xProd = getVal(prod, 'xProd');
      const ncm = getVal(prod, 'NCM');
      const cfop = getVal(prod, 'CFOP');
      const uCom = getVal(prod, 'uCom') || 'un';
      const qCom = parseFloat(getVal(prod, 'qCom')) || 1;
      const vUnCom = parseFloat(getVal(prod, 'vUnCom')) || 0;
      const vProd = parseFloat(getVal(prod, 'vProd')) || (qCom * vUnCom);

      itensImportados.push({
        cod: cProd,
        nome: xProd,
        ncm,
        cfop,
        un: uCom,
        qtd: qCom,
        custo: vUnCom,
        total: vProd
      });

      // Vincula ao estoque existente ou cria nova peça
      let peca = S.pecas.find(p => (cProd && p.cod === cProd) || p.nome.toLowerCase() === xProd.toLowerCase());
      if (peca) {
        peca.qtd = (Number(peca.qtd) || 0) + qCom;
        peca.custo = vUnCom;
        peca.ncm = ncm || peca.ncm;
        peca.cfop = cfop || peca.cfop;
      } else {
        // Sugere categoria com base no nome
        let catSugerida = 'Suspensão';
        const nomeLower = xProd.toLowerCase();
        if (nomeLower.includes('mola')) catSugerida = 'Molas';
        else if (nomeLower.includes('freio') || nomeLower.includes('pastilha') || nomeLower.includes('lona') || nomeLower.includes('disco')) catSugerida = 'Freio';
        else if (nomeLower.includes('embreagem') || nomeLower.includes('disco embr')) catSugerida = 'Embreagem';
        else if (nomeLower.includes('bucha') || nomeLower.includes('eixo')) catSugerida = 'Embuchamento de Eixo';
        else if (nomeLower.includes('cardan') || nomeLower.includes('cruzeta')) catSugerida = 'Cardan';
        else if (nomeLower.includes('filtro') || nomeLower.includes('oleo') || nomeLower.includes('motor')) catSugerida = 'Motor';

        peca = {
          id: uid('p'),
          cod: cProd,
          nome: xProd,
          categoria: catSugerida,
          un: uCom,
          custo: vUnCom,
          venda: +(vUnCom * 1.5).toFixed(2), // Margem padrão de 50%
          qtd: qCom,
          min: 2,
          ncm,
          cfop
        };
        S.pecas.push(peca);
      }
    }

    // 4. Total da NF
    const totalEl = xmlDoc.getElementsByTagName('total')[0];
    const vNF = parseFloat(getVal(totalEl, 'vNF')) || itensImportados.reduce((acc, it) => acc + it.total, 0);

    // 5. Duplicatas / Contas a Pagar (<cobr><dup>)
    const dupList = xmlDoc.getElementsByTagName('dup');
    S.contasPagar = S.contasPagar || [];
    const duplicatasImportadas = [];

    if (dupList.length > 0) {
      for (let j = 0; j < dupList.length; j++) {
        const dup = dupList[j];
        const nDup = getVal(dup, 'nDup') || (j + 1);
        const dVenc = getVal(dup, 'dVenc') || hoje();
        const vDup = parseFloat(getVal(dup, 'vDup')) || (vNF / dupList.length);

        const conta = {
          id: uid('cp'),
          parte: fornecedor.nome,
          fornecedorId: fornecedor.id,
          desc: `NF-e ${nNF} - Parc. ${nDup}`,
          valor: vDup,
          venc: dVenc,
          tipo: 'pagar',
          st: 'pendente',
          pago: false,
          cat: 'Peças',
          categoria: 'Peças',
          doc: String(nNF || ''),
          origem: 'compra_xml'
        };
        S.contasPagar.push(conta);
        S.contas = S.contas || [];
        if (!S.contas.some(x => x.id === conta.id)) S.contas.push(conta);
        duplicatasImportadas.push(conta);
      }
    } else {
      // Se não houver duplicatas expressas, cria uma fatura a pagar com vencimento em 28 dias
      const dataVenc = new Date();
      dataVenc.setDate(dataVenc.getDate() + 28);
      const conta = {
        id: uid('cp'),
        parte: fornecedor.nome,
        fornecedorId: fornecedor.id,
        desc: `NF-e ${nNF} - Compra de Peças`,
        valor: vNF,
        venc: dataVenc.toISOString().substring(0, 10),
        tipo: 'pagar',
        st: 'pendente',
        pago: false,
        cat: 'Peças',
        categoria: 'Peças',
        doc: String(nNF || ''),
        origem: 'compra_xml'
      };
      S.contasPagar.push(conta);
      S.contas = S.contas || [];
      if (!S.contas.some(x => x.id === conta.id)) S.contas.push(conta);
      duplicatasImportadas.push(conta);
    }

    // 6. Registra a Compra
    S.compras = S.compras || [];
    const novaCompra = {
      id: uid('comp'),
      codigo: 'C' + (S.compras.length + 101),
      num: nNF,
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome,
      fornecedorDoc: fornecedor.doc,
      data: dataEmissao,
      total: vNF,
      itens: itensImportados,
      duplicatas: duplicatasImportadas,
      situacao: 'Finalizada',
      obs: 'Importado automaticamente via XML SEFAZ'
    };
    S.compras.unshift(novaCompra);

    salvar();
    render();

    torrar(`NF-e ${nNF} importada com sucesso! ${itensImportados.length} itens adicionados ao estoque.`, 'sucesso');
  } catch (err) {
    console.error('Erro ao processar XML de compra:', err);
    torrar('Erro ao processar arquivo XML: ' + err.message, 'erro');
  }
}

const processarXmlNfe = processarXMLCompra;

if (typeof window !== 'undefined') {
  window.processarXMLCompra = processarXMLCompra;
  window.processarXmlNfe = processarXmlNfe;
}
if (typeof globalThis !== 'undefined') {
  globalThis.processarXMLCompra = processarXMLCompra;
  globalThis.processarXmlNfe = processarXmlNfe;
}

