/**
 * Módulo: cadastros_plano_contas_actions.js
 * Pátio-CRM — Operações de CRUD, Validação Contábil e Restauração de Padrões do Plano de Contas
 * Arquitetura Modular (< 350 linhas).
 */

function atualizarPaiRascPlanoConta(paiId) {
  const r = S.ui.rascPlanoConta = S.ui.rascPlanoConta || {};
  r.paiId = paiId || null;
  const lista = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);

  if (paiId) {
    const pai = lista.find(c => c.id === paiId);
    if (pai) {
      r.tipo = pai.tipo;
      r.classe = 'analitica';
      if (!r.idOriginal) {
        const filhas = lista.filter(c => c.paiId === pai.id || (c.codigo && pai.codigo && c.codigo.startsWith(pai.codigo + '.')));
        let maxSeq = 0;
        filhas.forEach(f => {
          const parts = f.codigo.split('.');
          const last = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(last) && last > maxSeq) maxSeq = last;
        });
        r.codigo = `${pai.codigo}.${String(maxSeq + 1).padStart(2, '0')}`;
      }
    }
  } else {
    if (!r.idOriginal && !r.codigo) {
      r.codigo = '3';
    }
    r.classe = 'sintetica';
  }
  if (typeof renderFolha === 'function') renderFolha();
}

function salvarPlanoConta() {
  const r = S.ui.rascPlanoConta;
  if (!r) return;

  const codigo = String(r.codigo || '').trim();
  const nome = String(r.nome || '').trim();

  if (!codigo) {
    torrar('O código contábil é obrigatório.');
    return;
  }
  if (!nome) {
    torrar('A descrição/nome da conta é obrigatória.');
    return;
  }

  const lista = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);
  const idOriginal = r.idOriginal;

  const dupCod = lista.find(c => c.id !== idOriginal && c.codigo.toLowerCase() === codigo.toLowerCase());
  if (dupCod) {
    torrar(`O código "${codigo}" já está em uso pela conta "${dupCod.nome}".`);
    return;
  }

  const dupNome = lista.find(c => c.id !== idOriginal && c.nome.toLowerCase() === nome.toLowerCase());
  if (dupNome) {
    torrar(`Já existe uma conta com o nome "${nome}" (${dupNome.codigo}).`);
    return;
  }

  if (idOriginal) {
    const index = lista.findIndex(c => c.id === idOriginal);
    if (index >= 0) {
      const contaAntiga = lista[index];
      const nomeAntigo = contaAntiga.nome;

      if (nomeAntigo !== nome) {
        let atualizadosContas = 0;
        (S.contas || []).forEach(ct => {
          if (ct.cat === nomeAntigo || ct.categoria === nomeAntigo) {
            ct.cat = nome;
            if (ct.categoria) ct.categoria = nome;
            atualizadosContas++;
          }
        });

        let atualizadosMov = 0;
        (S.movimentos || []).forEach(mv => {
          if (mv.cat === nomeAntigo || mv.categoria === nomeAntigo) {
            mv.cat = nome;
            if (mv.categoria) mv.categoria = nome;
            atualizadosMov++;
          }
        });

        if (atualizadosContas > 0 || atualizadosMov > 0) {
          console.info(`[PlanoContas] Nome alterado de "${nomeAntigo}" para "${nome}". Atualizados ${atualizadosContas} títulos e ${atualizadosMov} movimentos.`);
        }
      }

      lista[index] = {
        id: idOriginal,
        codigo,
        nome,
        tipo: r.tipo || 'despesa',
        classe: r.classe || 'analitica',
        paiId: r.paiId || null,
        ativo: r.ativo !== false,
        padrao: contaAntiga.padrao
      };
    }
  } else {
    lista.push({
      id: r.id || `pc_${Date.now()}`,
      codigo,
      nome,
      tipo: r.tipo || 'despesa',
      classe: r.classe || 'analitica',
      paiId: r.paiId || null,
      ativo: r.ativo !== false,
      padrao: false
    });
  }

  S.cfg.planoDeContas = lista;
  salvar();
  fecharFolha();
  render();
  torrar(idOriginal ? 'Conta contábil atualizada com sucesso!' : 'Conta contábil criada com sucesso!');
}

function excluirPlanoConta(id) {
  const lista = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);
  const conta = lista.find(c => c.id === id);
  if (!conta) {
    torrar('Conta não encontrada.');
    return;
  }

  const filhas = lista.filter(c => c.paiId === id);
  if (filhas.length > 0) {
    alert(`Não é possível excluir a conta "${conta.nome}" (${conta.codigo}) pois ela possui ${filhas.length} subconta(s) vinculada(s):\n- ${filhas.map(f => f.codigo + ' ' + f.nome).slice(0, 5).join('\n- ')}\n\nExclua ou altere o pai das subcontas antes de excluir esta conta.`);
    return;
  }

  const contasVinculadas = (S.contas || []).filter(c => c.cat === conta.nome || c.categoria === conta.nome || c.planoContaId === conta.id || c.cat === conta.id);
  const movVinculados = (S.movimentos || []).filter(m => m.cat === conta.nome || m.categoria === conta.nome || m.planoContaId === conta.id || m.cat === conta.id);
  const totalVinculos = contasVinculadas.length + movVinculados.length;

  if (totalVinculos > 0) {
    alert(`Não é possível excluir a conta "${conta.nome}" (${conta.codigo}) pois existem ${totalVinculos} lançamento(s) financeiro(s) vinculado(s) a ela (${contasVinculadas.length} títulos a pagar/receber e ${movVinculados.length} movimentações de caixa).\n\nDica de Auditoria: Em vez de excluir, utilize a opção "Desativar" para manter a integridade do histórico contábil e do DRE.`);
    return;
  }

  if (!confirm(`Tem certeza que deseja excluir a conta contábil "${conta.nome}" (${conta.codigo})?`)) {
    return;
  }

  S.cfg.planoDeContas = lista.filter(c => c.id !== id);
  salvar();
  render();
  torrar('Conta contábil excluída com sucesso!');
}

function toggleStatusPlanoConta(id) {
  const lista = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);
  const conta = lista.find(c => c.id === id);
  if (!conta) return;
  conta.ativo = !conta.ativo;
  S.cfg.planoDeContas = lista;
  salvar();
  render();
  torrar(conta.ativo ? `Conta "${conta.nome}" ativada!` : `Conta "${conta.nome}" inativada!`);
}

function restaurarPlanoContasPadrao() {
  const padroes = [
    { id: 'pc_1', codigo: '1', nome: 'Receitas Operacionais', tipo: 'receita', classe: 'sintetica', paiId: null, ativo: true, padrao: true },
    { id: 'pc_1_01', codigo: '1.01', nome: 'Serviços', tipo: 'receita', classe: 'analitica', paiId: 'pc_1', ativo: true, padrao: true },
    { id: 'pc_1_02', codigo: '1.02', nome: 'Peças', tipo: 'receita', classe: 'analitica', paiId: 'pc_1', ativo: true, padrao: true },
    { id: 'pc_2', codigo: '2', nome: 'Custos e Despesas', tipo: 'despesa', classe: 'sintetica', paiId: null, ativo: true, padrao: true },
    { id: 'pc_2_01', codigo: '2.01', nome: 'Pessoal', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
    { id: 'pc_2_02', codigo: '2.02', nome: 'Fixas', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
    { id: 'pc_2_03', codigo: '2.03', nome: 'Impostos', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
    { id: 'pc_2_04', codigo: '2.04', nome: 'Outros', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true }
  ];

  const atuais = (typeof normalizarPlanoDeContas === 'function')
    ? normalizarPlanoDeContas(S.cfg.planoDeContas)
    : (S.cfg.planoDeContas || []);
  let adicionados = 0;

  padroes.forEach(p => {
    const jaExiste = atuais.some(a => a.codigo === p.codigo || a.nome.toLowerCase() === p.nome.toLowerCase());
    if (!jaExiste) {
      atuais.push(p);
      adicionados++;
    }
  });

  S.cfg.planoDeContas = atuais;
  salvar();
  render();
  if (adicionados > 0) {
    torrar(`${adicionados} conta(s) padrão restaurada(s)!`);
  } else {
    torrar('Todas as contas padrão já estão presentes no plano.');
  }
}

if (typeof window !== 'undefined') {
  window.atualizarPaiRascPlanoConta = atualizarPaiRascPlanoConta;
  window.salvarPlanoConta = salvarPlanoConta;
  window.excluirPlanoConta = excluirPlanoConta;
  window.toggleStatusPlanoConta = toggleStatusPlanoConta;
  window.restaurarPlanoContasPadrao = restaurarPlanoContasPadrao;
}
if (typeof globalThis !== 'undefined') {
  globalThis.atualizarPaiRascPlanoConta = atualizarPaiRascPlanoConta;
  globalThis.salvarPlanoConta = salvarPlanoConta;
  globalThis.excluirPlanoConta = excluirPlanoConta;
  globalThis.toggleStatusPlanoConta = toggleStatusPlanoConta;
  globalThis.restaurarPlanoContasPadrao = restaurarPlanoContasPadrao;
}

