/**
 * Módulo: events_cadastros.js
 * Pátio-CRM — Handlers de Eventos: Cadastros de Clientes, Fornecedores, Mecânicos, Serviços e Matriz Fiscal
 * Arquitetura Modular (< 350 linhas).
 */

function tratarEventosCadastros(a, b, e, o) {
  switch (a) {
    case 'aba-cad':
      S.ui.abaCad = b.dataset.k;
      render();
      return true;

    case 'ver-cliente':
      S.ui.cliAberto = b.dataset.id;
      abrirFolha(folhaCliente);
      return true;

    case 'novo-cad':
      S.ui.cadTipo = b.dataset.t;
      S.ui.rascCad = {};
      abrirFolha(folhaCadastro);
      return true;

    case 'editar-cliente':
      S.ui.cadTipo = 'cliente';
      S.ui.rascCad = JSON.parse(JSON.stringify(S.clientes.find(x => x.id === b.dataset.id)));
      abrirFolha(folhaCadastro);
      return true;

    case 'editar-regra-fiscal': {
      const regra = (S.cfg.regrasTributarias || []).find(x => x.cfop === b.dataset.cfop);
      if (regra) {
        S.ui.rascCad = JSON.parse(JSON.stringify(regra));
        S.ui.cadTipo = 'regra-tributaria';
        abrirFolha(folhaCadastro);
      }
      return true;
    }

    case 'bloquear-cliente': {
      const cl = S.clientes.find(x => x.id === b.dataset.id);
      if (cl) {
        cl.bloqueado = !cl.bloqueado;
        salvar(); renderFolha(); render();
        torrar(cl.bloqueado ? 'Cliente bloqueado para faturamento' : 'Cliente desbloqueado');
      }
      return true;
    }

    case 'excluir-cliente':
      pedirConfirmacao('excli' + b.dataset.id, 'Toque de novo para excluir o cliente', () => {
        const cId = b.dataset.id;
        S._excluidos = S._excluidos || {};
        S._excluidos.clientes = S._excluidos.clientes || [];
        if (!S._excluidos.clientes.includes(cId)) S._excluidos.clientes.push(cId);
        S.clientes = S.clientes.filter(x => x.id !== cId);
        salvar(); render(); torrar('Cliente excluído');
      });
      return true;

    case 'editar-cad': {
      const tipo = b.dataset.t, id = b.dataset.id;
      let item = null;
      if (tipo === 'cliente') item = (S.clientes || []).find(x => x.id === id);
      else if (tipo === 'veiculo') item = (S.veiculos || []).find(x => x.id === id);
      else if (tipo === 'fornecedor') item = (S.fornecedores || []).find(x => x.id === id);
      else if (tipo === 'produto') item = (S.pecas || []).find(x => x.id === id);
      else if (tipo === 'servico') item = (S.servicos || []).find(x => x.id === id);
      else if (tipo === 'mecanico') item = (S.mecanicos || []).find(x => x.id === id);
      else if (tipo === 'box') item = (S.boxes || []).find(x => x.id === id);
      if (item) {
        S.ui.cadTipo = tipo;
        S.ui.rascCad = JSON.parse(JSON.stringify(item));
        abrirFolha(folhaCadastro);
      }
      return true;
    }

    case 'excluir-cad': {
      const tipo = b.dataset.t, id = b.dataset.id;
      pedirConfirmacao('excluir_' + tipo + '_' + id, 'Toque de novo para confirmar a exclusão', () => {
        if (tipo === 'cliente') S.clientes = (S.clientes || []).filter(x => x.id !== id);
        else if (tipo === 'veiculo') S.veiculos = (S.veiculos || []).filter(x => x.id !== id);
        else if (tipo === 'fornecedor') S.fornecedores = (S.fornecedores || []).filter(x => x.id !== id);
        else if (tipo === 'produto') S.pecas = (S.pecas || []).filter(x => x.id !== id);
        else if (tipo === 'servico') S.servicos = (S.servicos || []).filter(x => x.id !== id);
        else if (tipo === 'mecanico') S.mecanicos = (S.mecanicos || []).filter(x => x.id !== id);
        else if (tipo === 'box') S.boxes = (S.boxes || []).filter(x => x.id !== id);
        salvar(); render(); torrar('Registro excluído com sucesso!');
      });
      return true;
    }

    case 'salvar-cad': {
      const r = S.ui.rascCad || {}, t = S.ui.cadTipo;
      if (t === 'cliente') {
        if (!r.nome) { torrar('Razão Social / Nome é obrigatório'); return true; }
        if (r.id) {
          const idx = (S.clientes || []).findIndex(x => x.id === r.id);
          if (idx >= 0) S.clientes[idx] = { ...S.clientes[idx], ...r, scoreSerasa: (r.scoreSerasa !== undefined && r.scoreSerasa !== '' && r.scoreSerasa !== null) ? Number(r.scoreSerasa) : (S.clientes[idx].scoreSerasa ?? null), situacaoSerasa: r.situacaoSerasa ?? S.clientes[idx].situacaoSerasa ?? null, consultaSerasaRealizada: r.consultaSerasaRealizada !== undefined ? Boolean(r.consultaSerasaRealizada) : (S.clientes[idx].consultaSerasaRealizada || false) };
        } else {
          S.clientes = S.clientes || [];
          S.clientes.push({ id: uid('cli'), nome: r.nome, fantasia: r.fantasia || '', doc: r.doc || '', fone: r.fone || '', email: r.email || '', contato: r.contato || '', prazo: +r.prazo || 0, ie: r.ie || '', endereco: r.endereco || '', cidade: r.cidade || '', uf: r.uf || '', cep: r.cep || '', optin: true, bloqueado: false, scoreSerasa: (r.scoreSerasa !== undefined && r.scoreSerasa !== '' && r.scoreSerasa !== null) ? Number(r.scoreSerasa) : null, situacaoSerasa: r.situacaoSerasa ?? null, consultaSerasaRealizada: Boolean(r.consultaSerasaRealizada) });
        }
      }
      if (t === 'fornecedor') {
        if (!r.nome) { torrar('Razão Social do Fornecedor é obrigatória'); return true; }
        S.fornecedores = S.fornecedores || [];
        if (r.id) {
          const idx = S.fornecedores.findIndex(x => x.id === r.id);
          if (idx >= 0) S.fornecedores[idx] = { ...S.fornecedores[idx], ...r };
        } else {
          S.fornecedores.push({ id: uid('f'), nome: r.nome, fantasia: r.fantasia||'', doc: r.doc||'', fone: r.fone||'', email: r.email||'', contato: r.contato||'', cidade: r.cidade||'', uf: r.uf||'', cep: r.cep||'', endereco: r.endereco||'' });
        }
      }
      if (t === 'mecanico') {
        if (!r.nome) { torrar('Nome do mecânico é obrigatório'); return true; }
        S.mecanicos = S.mecanicos || [];
        if (r.id) {
          const idx = S.mecanicos.findIndex(x => x.id === r.id);
          if (idx >= 0) S.mecanicos[idx] = { ...S.mecanicos[idx], ...r };
        } else {
          S.mecanicos.push({ id: uid('m'), nome: r.nome, especialidade: r.especialidade||'Geral', fone: r.fone||'' });
        }
      }
      if (t === 'produto') {
        if (!r.nome) { torrar('Nome do produto é obrigatório'); return true; }
        S.pecas = S.pecas || [];
        if (r.id) {
          const idx = S.pecas.findIndex(x => x.id === r.id);
          if (idx >= 0) S.pecas[idx] = { ...S.pecas[idx], ...r, categoria: r.categoria || S.pecas[idx].categoria || 'Suspensão', custo: +r.custo||0, venda: +r.venda||0, qtd: r.qtd !== undefined ? +r.qtd : (S.pecas[idx].qtd || 0), min: r.min !== undefined ? +r.min : (S.pecas[idx].min || 1), cClassTrib: r.cClassTrib || S.pecas[idx].cClassTrib || '' };
        } else {
          S.pecas.push({ id: uid('p'), cod: r.cod||'', nome: r.nome, categoria: r.categoria||'Suspensão', un: r.un||'un', ncm: r.ncm||'', cest: r.cest||'', origem: r.origem||'0', cfop: r.cfop||'', cClassTrib: r.cClassTrib||'', custo: +r.custo||0, venda: +r.venda||0, qtd: +r.qtd||0, min: +r.min||1 });
        }
      }
      if (t === 'servico') {
        if (!r.nome) { torrar('Descrição do serviço é obrigatória'); return true; }
        S.servicos = S.servicos || [];
        if (r.id) {
          const idx = S.servicos.findIndex(x => x.id === r.id);
          if (idx >= 0) S.servicos[idx] = { ...S.servicos[idx], ...r, valor: +r.valor||0, horas: +r.horas||1, cClassTrib: r.cClassTrib || S.servicos[idx].cClassTrib || '' };
        } else {
          S.servicos.push({ id: uid('s'), nome: r.nome, valor: +r.valor||0, horas: +r.horas||1, cnae: r.cnae||'', codServLC116: r.codServLC116||'', cfop: r.cfop||'', cClassTrib: r.cClassTrib||'' });
        }
      }
      if (t === 'regra-tributaria') {
        if (!r.cfop || !r.desc) { torrar('CFOP e Descrição são obrigatórios'); return true; }
        if (!S.cfg.regrasTributarias) S.cfg.regrasTributarias = [];
        let idx = S.cfg.regrasTributarias.findIndex(x => x.cfop === r.cfop);
        let nova = { ...r };
        ['aliqICMS','redBCICMS','mvaICMS','aliqICMSST','aliqFCP','aliqIPI','aliqPIS','aliqCOFINS','aliqIBS','aliqIBSEst','aliqIBSMun','aliqCBS','aliqIS','redBCIBSCBS','aliqISS'].forEach(k => nova[k] = +(nova[k]||0));
        if (!nova.aliqIBS && (nova.aliqIBSEst || nova.aliqIBSMun)) {
          nova.aliqIBS = +(nova.aliqIBSEst + nova.aliqIBSMun).toFixed(4);
        }
        nova.cstIBSCBS = nova.cstIBSCBS || '01';
        nova.cClassTrib = nova.cClassTrib || '010101';
        nova.cstIS = nova.cstIS || '00';
        nova.indDestino = nova.indDestino || '1';
        if (idx >= 0) S.cfg.regrasTributarias[idx] = nova;
        else S.cfg.regrasTributarias.push(nova);
      }
      if (t === 'box') {
        if (!r.nome) { torrar('Nome do box é obrigatório'); return true; }
        S.boxes = S.boxes || [];
        if (r.id) {
          const idx = S.boxes.findIndex(x => x.id === r.id);
          if (idx >= 0) S.boxes[idx] = { ...S.boxes[idx], ...r };
        } else {
          S.boxes.push({ id: uid('b'), nome: r.nome, tipo: r.tipo || 'Geral' });
        }
      }
      if (t === 'veiculo') {
        if (!r.placa) { torrar('Falta a placa'); return true; }
        S.veiculos = S.veiculos || [];
        if (r.id) {
          const idx = S.veiculos.findIndex(x => x.id === r.id);
          if (idx >= 0) S.veiculos[idx] = { ...S.veiculos[idx], ...r, placa: (r.placa || '').toUpperCase(), km: +r.km || 0 };
        } else {
          S.veiculos.push({ id: uid('v'), cli: r.cli || S.clientes[0]?.id, placa: (r.placa || '').toUpperCase(), modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo' });
        }
      }
      salvar(); S.ui.rascCad = null; fecharFolha(); render();
      torrar('Cadastro salvo com sucesso!', 'sucesso');
      return true;
    }

    default:
      return false;
  }
}

if (typeof window !== 'undefined') {
  window.tratarEventosCadastros = tratarEventosCadastros;
}
if (typeof globalThis !== 'undefined') {
  globalThis.tratarEventosCadastros = tratarEventosCadastros;
}

