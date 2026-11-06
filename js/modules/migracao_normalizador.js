/* Submódulo Normalizador de Dados Externos (Sistemas Legados): migracao_normalizador.js */
/* Pátio-CRM — Submódulo extraído de js/relatorios.js (< 350 linhas) */

  function normalizarDadosExternos(texto, nomeArquivo) {
  const ext = (nomeArquivo || '').split('.').pop().toLowerCase();
  const resultado = {
    tipoDetectado: 'desconhecido',
    formatoOrigem: ext === 'json' ? 'JSON' : 'CSV/Texto',
    dados: {
      clientes: [],
      veiculos: [],
      pecas: [],
      servicos: [],
      fornecedores: [],
      contas: [],
      os: []
    }
  };

  if (ext === 'json') {
    let parsed;
    try { parsed = JSON.parse(texto); } catch (e) { throw new Error('Arquivo JSON inválido ou corrompido.'); }

    if (Array.isArray(parsed)) {
      // Array avulso de itens
      if (parsed.length === 0) throw new Error('O arquivo JSON está vazio.');
      const primeiro = parsed[0] || {};
      const chaves = Object.keys(primeiro).map(limparChaveHeader);
      const tem = (termos) => termos.some(t => chaves.some(h => h.includes(t)));

      let ent = 'clientes';
      if (tem(['placa'])) ent = 'veiculos';
      else if (tem(['estoque', 'custo', 'venda', 'ncm', 'cod'])) ent = 'pecas';
      else if (tem(['servico', 'iss', 'horas'])) ent = 'servicos';
      else if (tem(['fornecedor'])) ent = 'fornecedores';
      else if (tem(['vencimento', 'pagar', 'receber'])) ent = 'contas';

      resultado.tipoDetectado = `Lista de ${ent.toUpperCase()}`;
      resultado.dados[ent] = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Objeto com coleções completas
      resultado.tipoDetectado = 'Backup Completo de Sistema';

      // Clientes
      const rawCli = parsed.clientes || parsed.clients || parsed.customers || parsed.contatos || [];
      resultado.dados.clientes = rawCli.map(c => ({
        id: c.id || uid('c'),
        nome: c.nome || c.razao_social || c.razao || c.razaoSocial || c.client_name || c.cliente || c.name || 'Cliente Sem Nome',
        fantasia: c.fantasia || c.nome_fantasia || c.trade_name || '',
        doc: (c.doc || c.cnpj || c.cpf || c.documento || c.document || '').replace(/[^\d\.\-\/]/g, ''),
        fone: (c.fone || c.telefone || c.celular || c.whatsapp || c.phone || c.tel || '').replace(/\D/g, ''),
        email: c.email || c.e_mail || c.mail || '',
        contato: c.contato || c.responsavel || '',
        prazo: parseInt(c.prazo || c.prazo_dias || 0, 10) || 0,
        ie: c.ie || c.inscricao_estadual || '',
        endereco: c.endereco || c.rua || c.logradouro || '',
        cidade: c.cidade || c.municipio || c.city || '',
        uf: (c.uf || c.estado || c.state || '').toUpperCase().slice(0, 2),
        cep: c.cep || '',
        optin: c.optin !== false,
        bloqueado: !!c.bloqueado
      }));

      // Veículos
      const rawVei = parsed.veiculos || parsed.vehicles || parsed.frota || parsed.caminhoes || [];
      resultado.dados.veiculos = rawVei.map(v => ({
        id: v.id || uid('v'),
        cli: v.cli || v.cliente_id || '',
        placa: (v.placa || v.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
        marca: v.marca || v.brand || 'Caminhão',
        modelo: v.modelo || v.model || 'Pesado',
        ano: String(v.ano || v.year || ''),
        km: normalizarNumero(v.km || v.quilometragem || v.odometer),
        tipo: v.tipo || v.tipo_veiculo || 'Cavalo Mecânico'
      }));

      // Peças / Estoque
      const rawPec = parsed.pecas || parsed.parts || parsed.produtos || parsed.products || parsed.estoque || [];
      resultado.dados.pecas = rawPec.map(p => ({
        id: p.id || uid('p'),
        cod: p.cod || p.codigo || p.sku || p.referencia || ('P-' + Date.now().toString().slice(-4)),
        nome: p.nome || p.descricao || p.description || p.item || 'Item de Peça',
        un: p.un || p.unidade || 'un',
        qtd: normalizarNumero(p.qtd || p.quantidade || p.estoque || p.saldo || p.stock),
        min: normalizarNumero(p.min || p.estoque_minimo || p.minimo || 1),
        custo: normalizarNumero(p.custo || p.preco_custo || p.valor_custo || p.cost),
        venda: normalizarNumero(p.venda || p.preco_venda || p.preco || p.price),
        loc: p.loc || p.localizacao || p.prateleira || '',
        forn: p.forn || p.fornecedor || '',
        ncm: p.ncm || '',
        cfop: p.cfop || '5102',
        cest: p.cest || '',
        origem: p.origem || '0 - Nacional'
      }));

      // Serviços
      const rawSrv = parsed.servicos || parsed.services || [];
      resultado.dados.servicos = rawSrv.map(s => ({
        id: s.id || uid('s'),
        nome: s.nome || s.descricao || s.servico || 'Serviço Mecânico',
        valor: normalizarNumero(s.valor || s.preco || s.preco_venda),
        horas: normalizarNumero(s.horas || s.tempo || 1),
        iss_cod: s.iss_cod || '14.01',
        iss_aliq: normalizarNumero(s.iss_aliq || 5),
        cnae: s.cnae || '4520-0/01'
      }));

      // Fornecedores
      const rawForn = parsed.fornecedores || parsed.suppliers || [];
      resultado.dados.fornecedores = rawForn.map(f => ({
        id: f.id || uid('f'),
        nome: f.nome || f.razao_social || f.fornecedor || 'Fornecedor',
        fantasia: f.fantasia || '',
        doc: (f.doc || f.cnpj || '').replace(/[^\d\.\-\/]/g, ''),
        fone: (f.fone || f.telefone || '').replace(/\D/g, ''),
        email: f.email || '',
        contato: f.contato || '',
        cidade: f.cidade || '',
        uf: (f.uf || '').toUpperCase().slice(0, 2)
      }));

      // Contas a Pagar / Receber
      const rawContas = parsed.contas || parsed.bills || parsed.financial || parsed.financeiro || [];
      resultado.dados.contas = rawContas.map(c => ({
        id: c.id || uid('ct'),
        tipo: (c.tipo || 'pagar').toLowerCase().includes('rec') ? 'receber' : 'pagar',
        desc: c.desc || c.descricao || 'Lançamento Financeiro',
        parte: c.parte || c.favorecido || c.cliente || c.fornecedor || 'Geral',
        valor: normalizarNumero(c.valor || c.valor_total),
        venc: normalizarData(c.venc || c.vencimento || c.data_vencimento || hoje()),
        pago: !!(c.pago || c.status === 'pago' || c.liquidado),
        cat: c.cat || c.categoria || 'Geral',
        doc: c.doc || c.numero_documento || ''
      }));

      // Ordens de Serviço
      const rawOS = parsed.os || parsed.ordens || parsed.work_orders || [];
      resultado.dados.os = rawOS.map(o => ({
        id: o.id || uid('os'),
        num: o.num || o.numero || (1000 + Math.floor(Math.random() * 9000)),
        box: o.box || null,
        vei: o.vei || o.veiculo_id || '',
        cli: o.cli || o.cliente_id || '',
        mec: o.mec || o.mecanico || 'Oficina',
        st: ['fila', 'aprovacao', 'executando', 'peca', 'finalizada'].includes(o.st) ? o.st : 'fila',
        abertura: normalizarData(o.abertura || o.data_abertura || hoje()),
        prev: normalizarData(o.prev || o.previsao || hoje()),
        km: normalizarNumero(o.km),
        queixa: o.queixa || o.problema || o.relato || '',
        servicos: Array.isArray(o.servicos) ? o.servicos : [],
        pecas: Array.isArray(o.pecas) ? o.pecas : [],
        desc: normalizarNumero(o.desc),
        pago: !!o.pago,
        formaPgto: o.formaPgto || '',
        obs: o.obs || ''
      }));

      // Se tiver configurações no arquivo, mantém
      if (parsed.cfg && typeof parsed.cfg === 'object') {
        resultado.dados.cfg = parsed.cfg;
      }
    }
  } else {
    // Processamento CSV / Planilha Tabular
    const { headers, rows } = parseCSVUniversal(texto);
    if (rows.length === 0) throw new Error('Nenhum registro encontrado na planilha enviada.');

    const entidade = detectarEntidadeCSV(headers);
    resultado.tipoDetectado = `Planilha de ${entidade.toUpperCase()}`;

    // Mapa de nomes de colunas normalizados
    const mapaH = {};
    headers.forEach(h => { mapaH[limparChaveHeader(h)] = h; });
    const getVal = (row, termos) => {
      for (const t of termos) {
        for (const k in mapaH) {
          if (k.includes(t)) {
            const v = row[mapaH[k]];
            if (v !== undefined && v !== '') return v;
          }
        }
      }
      return '';
    };

    if (entidade === 'clientes') {
      resultado.dados.clientes = rows.map(r => ({
        id: uid('c'),
        nome: getVal(r, ['razaosocial', 'razao', 'nome', 'cliente']) || 'Cliente Sem Nome',
        fantasia: getVal(r, ['fantasia', 'nomefantasia']),
        doc: getVal(r, ['cnpj', 'cpf', 'doc', 'documento']).replace(/[^\d\.\-\/]/g, ''),
        fone: getVal(r, ['telefone', 'fone', 'celular', 'whatsapp']).replace(/\D/g, ''),
        contato: getVal(r, ['contato', 'responsavel']),
        email: getVal(r, ['email', 'mail']),
        cidade: getVal(r, ['cidade', 'municipio']),
        uf: getVal(r, ['uf', 'estado']).toUpperCase().slice(0, 2),
        cep: getVal(r, ['cep']),
        endereco: getVal(r, ['endereco', 'rua', 'logradouro']),
        ie: getVal(r, ['inscricaoestadual', 'ie']),
        prazo: parseInt(getVal(r, ['prazo', 'prazodias']) || 0, 10) || 0,
        optin: true,
        bloqueado: false
      }));
    } else if (entidade === 'veiculos') {
      resultado.dados.veiculos = rows.map(r => {
        const placa = getVal(r, ['placa']).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cliInfo = getVal(r, ['cliente', 'proprietario', 'cnpj', 'cpf']);
        // Tenta achar cliente existente por nome ou doc
        let cliId = '';
        if (cliInfo && S && S.clientes) {
          const cliInfoLimpo = cliInfo.replace(/\D/g, '');
          const achado = S.clientes.find(c =>
            (cliInfoLimpo && (c.doc || '').replace(/\D/g, '') === cliInfoLimpo) ||
            ((c.nome || '').toLowerCase() === cliInfo.toLowerCase()) ||
            ((c.fantasia || '').toLowerCase() === cliInfo.toLowerCase())
          );
          if (achado) cliId = achado.id;
        }

        return {
          id: uid('v'),
          cli: cliId || (S && S.clientes && S.clientes[0] ? S.clientes[0].id : ''),
          _clienteRef: cliInfo,
          placa: placa || 'PLACA',
          modelo: getVal(r, ['modelo', 'descricao']) || 'Caminhão',
          marca: getVal(r, ['marca', 'fabricante']) || 'Pesado',
          ano: String(getVal(r, ['ano', 'anomodelo']) || ''),
          km: normalizarNumero(getVal(r, ['km', 'quilometragem'])),
          tipo: getVal(r, ['tipo', 'carroceria']) || 'Cavalo Mecânico'
        };
      });
    } else if (entidade === 'pecas') {
      resultado.dados.pecas = rows.map(r => ({
        id: uid('p'),
        cod: getVal(r, ['codigo', 'cod', 'sku', 'referencia']) || ('P-' + Date.now().toString().slice(-4)),
        nome: getVal(r, ['descricao', 'nome', 'item', 'peca']) || 'Peça Importada',
        un: getVal(r, ['unidade', 'un']) || 'un',
        qtd: normalizarNumero(getVal(r, ['estoqueatual', 'estoque', 'qtd', 'quantidade', 'saldo'])),
        min: normalizarNumero(getVal(r, ['estoqueminimo', 'min', 'minimo'])) || 1,
        custo: normalizarNumero(getVal(r, ['precocusto', 'custo', 'valorcusto'])),
        venda: normalizarNumero(getVal(r, ['precovenda', 'venda', 'preco', 'valorvenda'])),
        loc: getVal(r, ['localizacao', 'loc', 'prateleira']),
        forn: getVal(r, ['fornecedor', 'forn']),
        ncm: getVal(r, ['ncm']),
        cfop: getVal(r, ['cfop']) || '5102',
        cest: getVal(r, ['cest']),
        origem: '0 - Nacional'
      }));
    } else if (entidade === 'servicos') {
      resultado.dados.servicos = rows.map(r => ({
        id: uid('s'),
        nome: getVal(r, ['descricao', 'servico', 'nome']) || 'Serviço Mecânico',
        valor: normalizarNumero(getVal(r, ['precopadrao', 'preco', 'valor'])),
        horas: normalizarNumero(getVal(r, ['tempoestimado', 'horas', 'tempo'])) || 1,
        iss_cod: getVal(r, ['codigoiss', 'isscod']) || '14.01',
        iss_aliq: normalizarNumero(getVal(r, ['aliquotaiss', 'issaliq'])) || 5,
        cnae: '4520-0/01'
      }));
    } else if (entidade === 'contas') {
      resultado.dados.contas = rows.map(r => {
        const rawTipo = getVal(r, ['tipo']).toLowerCase();
        const tipo = rawTipo.includes('rec') ? 'receber' : 'pagar';
        const rawPago = getVal(r, ['pago', 'status']).toLowerCase();
        const pago = rawPago === 'sim' || rawPago === 'pago' || rawPago === 's' || rawPago === '1';

        return {
          id: uid('ct'),
          tipo,
          desc: getVal(r, ['descricao', 'desc']) || 'Título Financeiro',
          parte: getVal(r, ['favorecido', 'cliente', 'fornecedor', 'parte']) || 'Geral',
          valor: normalizarNumero(getVal(r, ['valor', 'valortotal'])),
          venc: normalizarData(getVal(r, ['vencimento', 'venc', 'datavencimento']) || hoje()),
          pago,
          cat: getVal(r, ['categoria', 'cat']) || 'Geral',
          doc: getVal(r, ['numerodocumento', 'documento', 'doc'])
        };
      });
    }
  }

  return resultado;
}

// Download de Templates em CSV com formato perfeito

if (typeof window !== 'undefined') {
  window.normalizarDadosExternos = normalizarDadosExternos;
}
if (typeof globalThis !== 'undefined') {
  globalThis.normalizarDadosExternos = normalizarDadosExternos;
}
