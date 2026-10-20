/* =====================================================================
   PÁTIO CRM — DELEGAÇÃO GLOBAL DE EVENTOS (CLICK, INPUT, CHANGE, KEYDOWN)
===================================================================== */

function pedirConfirmacao(chave, msg, fn) {
  if (confirmando === chave) {
    confirmando = null;
    fn();
    return;
  }
  confirmando = chave;
  torrar(msg);
  setTimeout(() => {
    if (confirmando === chave) confirmando = null;
  }, 4000);
}

function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).catch(() => caiuNoTextarea(texto));
  } else {
    caiuNoTextarea(texto);
  }
}

function caiuNoTextarea(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}

function textoOrcamento(o) {
  const v = V(o.vei), c = C(o.cli);
  const l = [`*${S.cfg.empresa}* — Orçamento OS ${o.num}`, `${v.placa} · ${v.modelo}`, `Cliente: ${c.nome}`, ''];
  if (o.servicos.length) {
    l.push('*Serviços*');
    o.servicos.forEach(i => l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd * i.valor)}`));
    l.push('');
  }
  if (o.pecas.length) {
    l.push('*Peças*');
    o.pecas.forEach(i => l.push(`• ${i.nome} (${i.qtd}x) — ${brl(i.qtd * i.valor)}`));
    l.push('');
  }
  if (o.desc) l.push(`Desconto: −${brl(o.desc)}`);
  l.push(`*Total: ${brl(totOS(o))}*`);
  l.push(`Previsão de entrega: ${dataBRfull(o.prev)}`);
  return l.join('\n');
}

/* =====================================================================
   DELEGAÇÃO GLOBAL DE EVENTOS: CLICK
===================================================================== */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  const o = OSatual();

  switch (a) {
    case 'carregar-demo': {
      torrar('Carregando dados de demonstração...', 'neutro');
      fetch('/api/onboarding/demo-data', { method: 'POST', credentials: 'same-origin' })
        .then(r => r.json())
        .then(d => {
          if (d.sucesso) {
            torrar('Dados de demonstração carregados!', 'sucesso');
            setTimeout(() => location.reload(), 500);
          } else {
            torrar(d.erro || 'Erro ao carregar dados demo.', 'erro');
          }
        })
        .catch(() => torrar('Erro de comunicação ao carregar dados demo.', 'erro'));
      break;
    }
    case 'remover-demo': {
      pedirConfirmacao('remover-demo', 'Tem certeza que deseja remover todos os dados de demonstração?', () => {
        torrar('Removendo dados de demonstração...', 'neutro');
        fetch('/api/onboarding/demo-data', { method: 'DELETE', credentials: 'same-origin' })
          .then(r => r.json())
          .then(d => {
            if (d.sucesso) {
              torrar('Dados de demonstração removidos!', 'sucesso');
              setTimeout(() => location.reload(), 500);
            } else {
              torrar(d.erro || 'Erro ao remover dados demo.', 'erro');
            }
          })
          .catch(() => torrar('Erro de comunicação ao remover dados demo.', 'erro'));
      });
      break;
    }
    case 'concluir-onboarding': {
      S.cfg = S.cfg || {};
      S.cfg.onboardingConcluido = true;
      salvar();
      render();
      torrar('Onboarding concluído! Bom trabalho na oficina.', 'sucesso');
      break;
    }
    case 'reabrir-onboarding': {
      S.cfg = S.cfg || {};
      S.cfg.onboardingConcluido = false;
      salvar();
      render();
      torrar('Guia de implantação reaberto.');
      break;
    }
    case 'remover-logo': {
      fetch('/api/configuracoes/empresa/logo', { method: 'DELETE', credentials: 'same-origin' })
        .then(r => r.json())
        .then(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.logo;
            delete S.cfg.identidadeVisual.logoUrl;
            delete S.cfg.identidadeVisual.logoHash;
          }
          salvar();
          render();
          torrar('Logotipo removido.');
        })
        .catch(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.logo;
            delete S.cfg.identidadeVisual.logoUrl;
          }
          salvar();
          render();
        });
      break;
    }
    case 'remover-institucional': {
      fetch('/api/configuracoes/empresa/imagem-institucional', { method: 'DELETE', credentials: 'same-origin' })
        .then(r => r.json())
        .then(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.imagemInstitucional;
            delete S.cfg.identidadeVisual.imagemInstitucionalUrl;
            delete S.cfg.identidadeVisual.imagemInstitucionalHash;
          }
          salvar();
          render();
          torrar('Imagem institucional removida.');
        })
        .catch(() => {
          if (S.cfg && S.cfg.identidadeVisual) {
            delete S.cfg.identidadeVisual.imagemInstitucional;
            delete S.cfg.identidadeVisual.imagemInstitucionalUrl;
          }
          salvar();
          render();
        });
      break;
    }
    case 'ir':
      if (S.ui.view === 'operacao' && typeof destruirGraficosOperacionais === 'function') {
        destruirGraficosOperacionais();
      }
      S.ui.view = b.dataset.v; S.ui.busca = ''; render(); break;
    case 'filtro': S.ui.filtro = b.dataset.f; render(); break;
    case 'filtro-fin': S.ui.filtroFin = b.dataset.f; render(); break;
    case 'filtro-estoque': S.ui.filtroEstoque = b.dataset.f; render(); break;
    case 'aba-estoque': S.ui.abaEstoque = b.dataset.a; render(); break;
    case 'fechar': fecharFolha(); break;

    /* --- OS --- */
    case 'abrir-os': S.ui.osAberta = b.dataset.id; S.ui.abaOS = 'servicos'; S.ui.picker = null; S.ui.busca = ''; abrirFolha(folhaOS); break;
    case 'aba-os': S.ui.abaOS = b.dataset.k; S.ui.picker = null; S.ui.busca = ''; renderFolha(); break;
    case 'nova-os': S.ui.rascunho = null; abrirFolha(() => novaOSFolha(b.dataset.box)); break;
    case 'voltar-os': S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    case 'imprimir-os': imprimirOS(o); break;
    case 'excluir-os': pedirConfirmacao('os' + o.id, 'Toque de novo para excluir a OS permanentemente', () => {
      S._excluidos = S._excluidos || {};
      S._excluidos.os = S._excluidos.os || [];
      if (!S._excluidos.os.includes(o.id)) S._excluidos.os.push(o.id);
      S.os = S.os.filter(x => x.id !== o.id);
      salvar();
      fecharFolha();
      render();
      torrar('OS excluída');
    }); break;
    case 'picker': S.ui.picker = b.dataset.p; S.ui.busca = ''; renderFolha(); break;
    case 'fechar-picker': S.ui.picker = null; S.ui.busca = ''; renderFolha(); break;
    case 'add-item': {
      const tipo = b.dataset.t, refId = b.dataset.r;
      const isPeca = tipo === 'pecas';
      const ref = isPeca ? P(refId) : Srv(refId);
      o[tipo] = o[tipo] || [];
      o[tipo].push({ id: uid('item'), nome: ref.nome, cod: ref.cod || '', qtd: 1, valor: isPeca ? ref.venda : ref.valor });
      salvar(); renderFolha(); render(); torrar('Item adicionado à OS'); break;
    }
    case 'qtd': {
      const lista = o[b.dataset.t], item = lista.find(x => x.id === b.dataset.i);
      if (item) { item.qtd = Math.max(1, item.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); }
      break;
    }
    case 'consumir-peca-os': {
      const pecaId = b.dataset.pecaId;
      const itemId = b.dataset.itemId;
      if (o && Array.isArray(o.pecas)) {
        const item = o.pecas.find(x => x.id === itemId || x.pecaId === pecaId);
        if (item) {
          item.st = 'consumida';
          item.status = 'consumida';
          item.consumidoEm = new Date().toISOString();
          salvar();
          renderFolha();
          render();
          torrar('Peça consumida com sucesso na OS!');
        }
      }
      break;
    }
    case 'rm-item': o[b.dataset.t] = o[b.dataset.t].filter(x => x.id !== b.dataset.i); salvar(); renderFolha(); render(); break;
    case 'faturar-os-modal': abrirFolha(folhaFaturarOS); break;
    case 'confirmar-faturamento': processarFaturamentoOS(o); fecharFolha(); render(); torrar(`OS ${o.num} faturada e entregue com sucesso!`); break;

    case 'criar-os': {
      const r = S.ui.rascunho || {};
      if (!r.vei || r.vei === 'novo') { torrar('Selecione a placa do veículo'); break; }

      let veiId = r.vei;
      let cliId = S.clientes[0] ? S.clientes[0].id : '';
      let pendenciaCadastral = false;
      let pendencias = [];

      if (r.vei === 'sem_placa') {
        pendenciaCadastral = true;
        pendencias = ['placa_pendente'];
        const veicTemp = {
          id: uid('v'),
          cli: cliId,
          placa: 'SEM-PLACA',
          marca: 'Pendente',
          modelo: 'Veículo Não Identificado',
          ano: '',
          cor: 'Não informada',
          km: +r.km || 0,
          tipo: 'Cavalo Mecânico',
          pendenciaCadastral: true,
          pendencias: ['placa_pendente'],
          criadoEm: Date.now()
        };
        S.veiculos = S.veiculos || [];
        S.veiculos.push(veicTemp);
        veiId = veicTemp.id;
      } else {
        const v = V(r.vei);
        if (v && v.cli) cliId = v.cli;
      }

      const boxEscolhido = r.box || null;
      const statusInicial = boxEscolhido ? 'executando' : 'fila';
      const maxNum = (S.os || []).reduce((max, x) => Math.max(max, parseInt(x.num, 10) || 1000), 1040);
      const novoNum = S.proxNum ? S.proxNum++ : (maxNum + 1);

      const nova = {
        id: uid('os'),
        num: novoNum,
        box: boxEscolhido,
        vei: veiId,
        cli: cliId,
        mec: r.mec || '',
        st: statusInicial,
        pendenciaCadastral: pendenciaCadastral,
        pendencias: pendencias,
        abertura: hoje(),
        prev: r.prev || addDias(hoje(), 1),
        km: +r.km || 0,
        queixa: r.queixa || '',
        servicos: [
          { id: 'srv_' + Date.now(), nome: 'Diagnóstico e Check-in de Pátio', qtd: 1, valor: 150 }
        ],
        pecas: [],
        desc: 0,
        pago: false,
        obs: pendenciaCadastral ? 'Abertura com pendência cadastral de placa.' : ''
      };

      S.os = S.os || [];
      S.os.unshift(nova);
      S.ui.rascunho = null;
      S.ui.osAberta = nova.id;
      S.ui.abaOS = 'servicos';
      salvar();
      fecharFolha();
      abrirFolha(folhaOS);
      render();
      if (pendenciaCadastral) {
        torrar(`OS ${nova.num} aberta no pátio! Lembre-se de anexar a foto da placa.`);
      } else {
        const localMsg = boxEscolhido ? `alocada no ${B(boxEscolhido).nome}` : 'colocada na Fila de Espera';
        torrar(`✅ OS ${nova.num} aberta com sucesso (${localMsg})!`);
      }
      break;
    }

    case 'iniciar-box-card': {
      const osId = b.dataset.id;
      const alvo = (S.os || []).find(x => x.id === osId);
      if (!alvo) break;
      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && x.box).map(x => x.box));
      const boxLivre = boxesValidos.find(bx => !boxesOcupados.has(bx.id));
      if (boxLivre) {
        alvo.box = boxLivre.id;
        alvo.boxId = boxLivre.id;
        alvo.st = 'executando';
        alvo.etapaPatio = 'em_execucao';
        alvo.motivoPausa = null;
        salvar();
        render();
        torrar(`🟢 OS ${alvo.num}: Alocada no ${boxLivre.nome}! Status: Em Execução.`);
      } else {
        torrar('⚠️ Todos os boxes estão ocupados no momento!');
      }
      break;
    }

    case 'alocar-box-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) { torrar('OS não encontrada para alocação.', 'erro'); break; }

      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && (x.box || x.boxId)).map(x => x.box || x.boxId));
      let boxEscolhido = b.dataset.box;
      if (!boxEscolhido) {
        const boxLivre = boxesValidos.find(bx => !boxesOcupados.has(bx.id));
        if (!boxLivre) {
          torrar('⚠️ Todos os boxes estão ocupados no momento!', 'aviso');
          break;
        }
        boxEscolhido = boxLivre.id;
      }

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/alocar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: boxEscolhido, mecanico: alvo.mecanico || '' })
      })
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            torrar(d.mensagem || d.error || 'Box já ocupado ou indisponível.', 'aviso');
            return;
          }
          alvo.box = boxEscolhido;
          alvo.boxId = boxEscolhido;
          alvo.st = 'executando';
          alvo.etapaPatio = 'em_execucao';
          alvo.motivoPausa = null;
          salvar();
          render();
          const nomeBox = (boxesValidos.find(bx => bx.id === boxEscolhido) || {}).nome || boxEscolhido;
          torrar(`🏗️ OS ${alvo.num}: Alocada no ${nomeBox}!`, 'sucesso');
        })
        .catch(() => {
          alvo.box = boxEscolhido;
          alvo.boxId = boxEscolhido;
          alvo.st = 'executando';
          salvar();
          render();
          torrar(`🏗️ OS ${alvo.num}: Box atualizado localmente.`);
        });
      break;
    }

    case 'pausar-os-gargalo': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) break;
      const motivo = prompt('Motivo do gargalo ou parada mecânica:', alvo.motivoPausa || 'Aguardando peças');
      if (!motivo || !motivo.trim()) break;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/apontamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'pausar', motivo: motivo.trim() })
      })
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          alvo.etapaPatio = 'pausado_gargalo';
          alvo.motivoPausa = motivo.trim();
          alvo.st = 'peca';
          salvar();
          render();
          torrar(`⏸️ OS ${alvo.num}: Pausada com gargalo (${motivo.trim()})`, 'aviso');
        })
        .catch(() => {
          alvo.etapaPatio = 'pausado_gargalo';
          alvo.motivoPausa = motivo.trim();
          alvo.st = 'peca';
          salvar();
          render();
          torrar(`⏸️ OS ${alvo.num}: Pausada localmente.`);
        });
      break;
    }

    case 'liberar-box-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) break;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/liberar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: alvo.box || alvo.boxId })
      })
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          alvo.box = null;
          alvo.boxId = null;
          salvar();
          render();
          torrar(`🔓 OS ${alvo.num}: Box liberado com sucesso!`, 'sucesso');
        })
        .catch(() => {
          alvo.box = null;
          alvo.boxId = null;
          salvar();
          render();
          torrar(`🔓 OS ${alvo.num}: Box liberado localmente.`);
        });
      break;
    }

    case 'retomar-os-gargalo': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) break;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/liberar-gargalo-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: 'Peça recebida no pátio' })
      })
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          alvo.etapaPatio = 'em_execucao';
          alvo.motivoPausa = null;
          alvo.st = 'executando';
          const bId = alvo.box || alvo.boxId;
          if (bId && Array.isArray(S.boxes)) {
            const bx = S.boxes.find(x => x.id === bId);
            if (bx) bx.status = 'ocupado';
          }
          salvar();
          render();
          torrar(`🚀 OS ${alvo.num}: Gargalo liberado e box destravado!`, 'sucesso');
        })
        .catch(() => {
          alvo.etapaPatio = 'em_execucao';
          alvo.motivoPausa = null;
          alvo.st = 'executando';
          salvar();
          render();
          torrar(`🚀 OS ${alvo.num}: Retomada localmente.`);
        });
      break;
    }

    case 'requisitar-peca-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) break;

      const pecaIdent = prompt(`Informe o código ou nome da peça para a OS #${alvo.num}:`, 'MOL-01');
      if (!pecaIdent || !pecaIdent.trim()) break;

      const qtdStr = prompt('Quantidade solicitada:', '1');
      const qtd = parseFloat(qtdStr) || 1;
      if (qtd <= 0) break;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/requisitar-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaIdOuNome: pecaIdent.trim(), quantidade: qtd })
      })
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            torrar(d.mensagem || d.error || 'Estoque insuficiente ou peça não localizada.', 'aviso');
            return;
          }
          if (!Array.isArray(alvo.pecasUtilizadas)) alvo.pecasUtilizadas = [];
          if (d.peca) alvo.pecasUtilizadas.push(d.peca);
          if (d.totalPecasOS != null) alvo.totalPecas = d.totalPecasOS;
          salvar();
          render();
          torrar(`🔩 Peça vinculada à OS #${alvo.num} com sucesso!`, 'sucesso');
        })
        .catch(() => {
          torrar('Erro de rede ao requisitar peça.', 'erro');
        });
      break;
    }

    case 'copiar-aviso-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) break;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/aviso-cliente`)
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          const texto = d.textoWhatsapp || d.textoCobranca;
          if (texto && navigator && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
            torrar(`📲 Aviso da OS #${alvo.num || alvo.id} copiado para a área de transferência!`, 'sucesso');
          } else if (texto) {
            prompt('Copie o texto estruturado para o WhatsApp:', texto);
          } else {
            torrar('Não foi possível gerar o aviso para esta OS.', 'aviso');
          }
        })
        .catch(() => {
          torrar('Erro ao consultar aviso da OS.', 'erro');
        });
      break;
    }

    case 'aprovar-checklist-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) break;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'aprovar_todos', observacao: 'Vistoria aprovada via painel do pátio' })
      })
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            torrar(d.mensagem || d.error || 'Falha ao aprovar checklist técnico.', 'aviso');
            return;
          }
          alvo.statusChecklist = 'aprovado';
          if (d.checklistTecnico) alvo.checklistTecnico = d.checklistTecnico;
          salvar();
          render();
          torrar(`🛡️ Vistoria técnica da OS #${alvo.num || alvo.id} aprovada com sucesso!`, 'sucesso');
        })
        .catch(() => {
          torrar('Erro de rede ao aprovar checklist.', 'erro');
        });
      break;
    }

    case 'historico-placa-os': {
      const osId = b.dataset.osId || b.dataset.id || (o && o.id);
      let placa = b.dataset.placa;
      if (!placa) {
        const alvo = (S.os || []).find(x => String(x.id) === String(osId));
        if (alvo) {
          const v = typeof V === 'function' ? V(alvo.vei) : null;
          placa = alvo.placa || (v && v.placa) || '';
        }
      }
      if (!placa) {
        torrar('Placa não identificada para esta OS.', 'aviso');
        break;
      }

      fetch(`/api/financeiro/patio/placa/${encodeURIComponent(placa)}/historico`)
        .then(async r => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            torrar(d.mensagem || d.error || 'Erro ao consultar histórico da placa.', 'aviso');
            return;
          }
          const garantiaTxt = d.emGarantiaAtiva ? '🛡️ EM GARANTIA ATIVA (90 dias)' : '⚪ Fora da garantia';
          const pecasResumo = Array.isArray(d.pecasAplicadasHistorico) && d.pecasAplicadasHistorico.length > 0
            ? d.pecasAplicadasHistorico.map(p => `${p.nome} (qtd: ${p.quantidadeTotal})`).join(', ')
            : 'Nenhuma peça registrada';
          const msg = `Dossiê Placa ${d.placa}:\n- Status: ${garantiaTxt}\n- Total de OSs: ${d.totalOS || 0}\n- OSs Concluídas: ${d.totalConcluidas || 0}\n- Peças Históricas: ${pecasResumo}`;
          if (typeof alert === 'function') {
            alert(msg);
          }
          torrar(`🔍 Placa ${d.placa}: ${d.totalOS || 0} OS(s) | ${garantiaTxt}`, d.emGarantiaAtiva ? 'sucesso' : 'neutro');
        })
        .catch(() => {
          torrar('Erro de rede ao consultar histórico da placa.', 'erro');
        });
      break;
    }

    case 'salvar-veiculo': {
      const r = S.ui.rascVeiculo;
      if (!r || !r.placa) { torrar('Digite a placa do caminhão'); break; }
      const novoId = uid('v');
      S.veiculos.push({ id: novoId, cli: r.cli || S.clientes[0].id, placa: r.placa.toUpperCase(), marca: r.marca || '', modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo Mecânico' });
      salvar(); torrar('Veículo cadastrado!');
      S.ui.rascunho = S.ui.rascunho || {}; S.ui.rascunho.vei = novoId; S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); break;
    }
    case 'buscar-placa-veiculo': {
      const rV = S.ui.rascVeiculo;
      if (!rV || !rV.placa || rV.placa.length < 7) { torrar('Digite uma placa válida!'); break; }
      if (!apiThrottle('placa')) break;
      const cred = S.cfg.apibrasil;
      if (!cred || !cred.deviceToken || !cred.bearerToken) { torrar('Credenciais da APIBrasil não preenchidas em Configurações.'); break; }
      b.innerHTML = '...';
      fetch('https://gateway.apibrasil.io/api/v2/veiculos/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'DeviceToken': cred.deviceToken, 'Authorization': 'Bearer ' + cred.bearerToken },
        body: JSON.stringify({ placa: rV.placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })
      })
      .then(r => r.json())
      .then(res => {
        b.innerHTML = ico('busca', 14) + ' Consultar';
        if (res && res.error === false && res.data) {
          rV.marca = res.data.marca || ''; rV.modelo = res.data.modelo || ''; rV.cor = res.data.cor || '';
          renderFolha(); torrar('Dados da placa obtidos com sucesso!');
        } else { torrar(res.message || 'Placa não localizada.'); }
      })
      .catch(() => { b.innerHTML = ico('busca', 14) + ' Consultar'; torrar('Erro de rede na consulta.'); });
      break;
    }
    case 'ver-historico-veiculo': {
      const vei = V(b.dataset.id);
      abrirFolha(() => `
        <div class="card card-p" style="max-width:650px;margin:0 auto">
          <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
            <h3 style="font-size:17px;font-weight:700">Histórico de Manutenções</h3>
            <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
          </div>
          ${abaHistoricoVeiculo(vei)}
        </div>
      `);
      break;
    }

    /* --- Estoque & OCR --- */
    case 'ver-peca': S.ui.pecaAberta = b.dataset.id; abrirFolha(folhaPeca); break;
    case 'mov-peca': { const p = P(S.ui.pecaAberta); p.qtd = Math.max(0, p.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); break; }
    case 'mov-peca-grid': { const p = P(b.dataset.id); p.qtd = Math.max(0, p.qtd + Number(b.dataset.d)); salvar(); render(); break; }
    case 'nova-peca': S.ui.rascPeca = null; abrirFolha(folhaNovaPeca); break;
    case 'salvar-peca': {
      const r = S.ui.rascPeca || {};
      if (!r.nome) { torrar('Descrição da peça é obrigatória'); break; }
      S.pecas.push({ id: uid('p'), cod: r.cod || ('MAN-' + Math.floor(Math.random() * 9000 + 1000)), nome: r.nome, un: r.un || 'un', qtd: +r.qtd || 0, min: +r.min || 1, custo: +r.custo || 0, venda: +r.venda || 0, loc: r.loc || '—', forn: r.forn || '—' });
      salvar(); S.ui.rascPeca = null; fecharFolha(); render(); torrar('Peça cadastrada no almoxarifado!'); break;
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
      break;
    }
    case 'importar-xml': S.ui.nota = null; abrirFolha(folhaXML); break;
    case 'confirmar-xml': confirmarXML(); break;
    case 'ocr-entrada': abrirFolha(folhaSimulacaoOCR); break;
    case 'importar-exemplo-ocr': {
      S.pecas.push(
        { id: uid('p'), cod: 'LON-HD291', nome: 'Jogo de Lonas de Freio Heavy Duty', un: 'jg', qtd: 4, min: 2, custo: 480.00, venda: 780.00, loc: 'Prat. A-04', forn: 'ZF do Brasil' },
        { id: uid('p'), cod: 'CIL-M204', nome: 'Cilindro Mestre de Embreagem', un: 'un', qtd: 2, min: 1, custo: 960.00, venda: 1550.00, loc: 'Prat. C-02', forn: 'ZF do Brasil' }
      );
      S.contas.push({ id: uid('ct'), tipo: 'pagar', desc: 'NF-e 784102 — ZF do Brasil', parte: 'ZF do Brasil', valor: 3840.00, venc: addDias(hoje(), 28), pago: false, cat: 'Fornecedores Peças', doc: 'NF-784102' });
      salvar(); fecharFolha(); render(); torrar('OCR processado: 2 peças e R$ 3.840,00 lançados!'); break;
    }

    /* --- Financeiro --- */
    case 'aba-fin': S.ui.abaFin = b.dataset.k; render(); break;
    case 'filtro-fin': {
      S.ui.filtroFin = b.dataset.f;
      render();
      break;
    }
    case 'filtro-origem-mov': {
      S.ui.filtroOrigemMov = b.dataset.o;
      render();
      break;
    }
    case 'filtro-meio-mov': {
      S.ui.filtroMeioPagamentoMov = b.dataset.m;
      render();
      break;
    }
    case 'exportar-csv-financeiro': {
      if (typeof exportarMovimentacoesCSV === 'function') {
        exportarMovimentacoesCSV();
      }
      break;
    }
    case 'estornar-mov': {
      if (typeof solicitarEstornoMovimento === 'function') {
        solicitarEstornoMovimento(b.dataset.id);
      }
      break;
    }
    case 'aplicar-filtro-fin-custom': {
      const de = document.getElementById('fin_filtro_de')?.value;
      const ate = document.getElementById('fin_filtro_ate')?.value;
      if (!de || !ate) {
        torrar('Selecione as datas inicial e final');
        break;
      }
      S.ui.filtroFin = 'custom';
      S.ui.filtroFinDe = de;
      S.ui.filtroFinAte = ate;
      render();
      break;
    }
    case 'baixar': {
      if (typeof folhaBaixarTituloVeronica === 'function') {
        abrirFolha(() => folhaBaixarTituloVeronica(b.dataset.id));
      } else {
        const c = S.contas.find(x => x.id === b.dataset.id);
        baixarConta(c); render(); torrar(`${c.tipo === 'receber' ? 'Recebimento' : 'Pagamento'} efetuado · ${brl(c.valor)}`);
      }
      break;
    }
    case 'faturar-os-prazo': {
      const osId = b.dataset.id || (S.ui && S.ui.osAberta);
      if (osId && typeof folhaFaturarOS === 'function') {
        abrirFolha(() => folhaFaturarOS(osId));
      }
      break;
    }
    case 'liberar-os-excepcional': {
      const osId = b.dataset.id || (S.ui && S.ui.osAberta);
      if (osId && typeof folhaLiberarSaidaExcepcional === 'function') {
        abrirFolha(() => folhaLiberarSaidaExcepcional(osId));
      }
      break;
    }
    case 'copiar-aviso-cobranca': {
      const osId = b.dataset.id || (S.ui && S.ui.osAberta);
      if (osId && typeof copiarAvisoCobranca === 'function') {
        copiarAvisoCobranca(osId);
      }
      break;
    }
    case 'imprimir-recibo': imprimirRecibo(b.dataset.id); break;
    case 'nova-conta': S.ui.contaTipo = b.dataset.t; S.ui.rascConta = null; abrirFolha(folhaConta); break;
    case 'salvar-conta': {
      const r = S.ui.rascConta || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); break; }
      S.contas.push({ id: uid('ct'), tipo: S.ui.contaTipo, desc: r.desc, parte: r.parte || '—', valor: +r.valor, venc: r.venc || hoje(), pago: false, cat: r.cat || 'Outros', doc: '' });
      salvar(); S.ui.rascConta = null; fecharFolha(); render(); torrar('Título lançado!'); break;
    }
    case 'novo-mov': S.ui.rascMov = null; abrirFolha(folhaMov); break;
    case 'salvar-mov': {
      const r = S.ui.rascMov || {};
      if (!r.desc || !+r.valor) { torrar('Preencha a descrição e valor'); break; }
      S.movimentos.push({ id: uid('mv'), data: r.data || hoje(), tipo: r.tipo || 'entrada', desc: r.desc, valor: +r.valor, cat: r.cat || 'Geral', conc: false });
      salvar(); S.ui.rascMov = null; fecharFolha(); render(); torrar('Movimento registrado no caixa!'); break;
    }
    case 'limpar-extrato': S.extrato = []; salvar(); render(); torrar('Extrato limpo'); break;

    /* --- WhatsApp --- */
    case 'aba-zap': S.ui.abaZap = b.dataset.k; render(); break;
    case 'liga-zap': S.zap.ativo = !S.zap.ativo; salvar(); render(); break;
    case 'ver-api': abrirFolha(folhaAPI); break;
    case 'conectar-wpp':
    case 'recarregar-qr-wpp': {
      S.ui.wppStatus = { status: 'carregando' };
      abrirFolha(folhaConectarWpp);
      fetch('/api/whatsapp/status')
        .then(r => r.json())
        .then(data => {
          S.ui.wppStatus = data;
          if (folhaAtual === folhaConectarWpp) renderFolha();
        })
        .catch(err => {
          S.ui.wppStatus = { status: 'erro' };
          if (folhaAtual === folhaConectarWpp) renderFolha();
        });
      break;
    }
    case 'disparar-camp': {
      const camp = S.ui.camp || {};
      const lista = destinatarios(camp.seg);
      if (!lista.length) { torrar('Nenhum destinatário nesse segmento'); break; }
      if (!camp.texto) { torrar('Escreva a mensagem da campanha'); break; }
      S.ui.disparo = { nome: camp.nome || 'Campanha', seg: camp.seg, texto: camp.texto, lista, ix: 0, enviados: 0 };
      abrirFolha(folhaDisparo); break;
    }
    case 'disparo-enviar': {
      const d = S.ui.disparo, cli = d.lista[d.ix];
      registrarEnvio({ chave: 'camp_' + cli.id + '_' + Date.now(), tipo: 'campanha', rotulo: d.nome, cliente: cli.nome, fone: cli.fone, texto: preencher(d.texto, ctxCliente(cli)), status: 'enviado' });
      d.enviados++; d.ix++; renderFolha(); break;
    }
    case 'disparo-pular': S.ui.disparo.ix++; renderFolha(); break;
    case 'fechar-disparo': {
      const d = S.ui.disparo;
      if (d && d.enviados) S.zap.campanhas.push({ id: uid('cp'), nome: d.nome, seg: d.seg, data: hoje(), enviados: d.enviados });
      S.ui.disparo = null; fecharFolha(); render(); break;
    }
    case 'add-regra': S.zap.regua.push({ id: uid('r'), quando: 5, ativo: true, nome: 'Nova Etapa de Cobrança', texto: 'Olá {contato}, sobre o título de {valor} vencido em {venc}: consegue nos dar uma posição? Obrigado, {empresa}.' }); salvar(); render(); break;
    case 'rm-regra': S.zap.regua = S.zap.regua.filter(x => x.id !== b.dataset.i); salvar(); render(); break;
    case 'copiar-camp': copiar(S.ui.camp.texto); torrar('Texto copiado!'); break;
    case 'copiar-var': copiar(b.dataset.v); torrar(b.dataset.v + ' copiado'); break;
    case 'limpar-hist': pedirConfirmacao('hist', 'Toque de novo para limpar o histórico', () => { S.zap.envios = []; salvar(); render(); }); break;
    case 'preview-relatorio-admin': {
      torrar('Carregando prévia do relatório executivo...');
      fetch('/api/whatsapp/relatorio-preview')
        .then(r => r.json())
        .then(data => {
          if (data && data.mensagensAdmin) {
            const txt = data.mensagensAdmin.join('\n\n════════════════════════════\n\n');
            abrirFolha(() => folhaRelatorioPreview(txt));
          } else if (data && data.texto) {
            abrirFolha(() => folhaRelatorioPreview(data.texto));
          } else {
            torrar('Erro ao compilar prévia do relatório.');
          }
        })
        .catch(() => torrar('Erro de comunicação com o servidor.'));
      break;
    }
    case 'preview-relatorio-operacao': {
      torrar('Carregando prévia operacional...');
      fetch('/api/whatsapp/relatorio-preview')
        .then(r => r.json())
        .then(data => {
          if (data && data.mensagensOperacao) {
            const txt = data.mensagensOperacao.join('\n\n════════════════════════════\n\n');
            abrirFolha(() => folhaRelatorioOperacaoPreview(txt));
          } else {
            torrar('Erro ao compilar prévia operacional.');
          }
        })
        .catch(() => torrar('Erro de comunicação com o servidor.'));
      break;
    }
    case 'ver-imagem-preview': {
      abrirFolha(() => folhaImagemPreview());
      break;
    }
    case 'disparar-grupo-admin': {
      torrar('Disparando relatório completo + JPG para Grupo Admin...');
      fetch('/api/whatsapp/disparar-grupo/admin', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            torrar('✅ Relatório executivo e Imagem JPG enviados com sucesso ao Grupo de Administração!');
          } else {
            torrar(`⚠️ ${data?.error || 'Falha ao enviar para o Grupo de Administração.'}`);
          }
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      break;
    }
    case 'disparar-grupo-operacao': {
      torrar('Disparando relatório sem finanças para Grupo Operação...');
      fetch('/api/whatsapp/disparar-grupo/operacao', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            torrar('✅ Relatório operacional enviado com sucesso ao Grupo de Operação!');
          } else {
            torrar(`⚠️ ${data?.error || 'Falha ao enviar para o Grupo de Operação.'}`);
          }
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      break;
    }
    case 'atualizar-grupos-wpp': {
      torrar('Buscando grupos no WhatsApp Web...');
      fetch('/api/whatsapp/grupos')
        .then(r => r.json())
        .then(d => {
          if (d && d.grupos) {
            S.ui.gruposWpp = d.grupos;
            S.ui.gruposWppCarregados = true;
            torrar(`✅ ${d.grupos.length} grupos sincronizados com sucesso!`);
            render();
          } else {
            torrar(`⚠️ ${d?.error || 'Não foi possível listar os grupos.'}`);
          }
        })
        .catch(() => torrar('Erro ao consultar grupos no servidor.'));
      break;
    }
    case 'salvar-config-grupos': {
      const gAdminInput = document.getElementById('cfg_grupo_admin_id');
      const gOpInput = document.getElementById('cfg_grupo_op_id');
      const horaInput = document.getElementById('cfg_hora_relatorio');
      const autoInput = document.getElementById('cfg_auto_envio');
      const diasUteisInput = document.getElementById('cfg_apenas_dias_uteis');

      const gAdminId = (gAdminInput ? gAdminInput.value : '').trim();
      const gOpId = (gOpInput ? gOpInput.value : '').trim();
      const horaStr = horaInput ? horaInput.value : '07:30';
      const autoBool = autoInput ? autoInput.checked : true;
      const diasUteisBool = diasUteisInput ? diasUteisInput.checked : true;

      S.cfg = S.cfg || {};
      S.cfg.grupoAdminId = gAdminId;
      S.cfg.grupoOperacaoId = gOpId;
      S.cfg.horaRelatorioDiario = horaStr;
      S.cfg.envioAutomaticoRelatorio = autoBool;
      S.cfg.relatorioApenasDiasUteis = diasUteisBool;
      salvar();

      fetch('/api/whatsapp/config-grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupoAdminId: gAdminId,
          grupoOperacaoId: gOpId,
          horaRelatorio: horaStr,
          envioAutomatico: autoBool,
          apenasDiasUteis: diasUteisBool
        })
      })
        .then(r => r.json())
        .then(() => {
          torrar('Configurações dos grupos salvas com sucesso!');
          render();
        })
        .catch(() => {
          torrar('Salvo localmente!');
          render();
        });
      break;
    }
    case 'disparar-relatorio-admin': {
      torrar('Disparando relatório executivo aos administradores...');
      fetch('/api/whatsapp/disparar-relatorio-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.success) {
            torrar(`✅ Relatório enviado com sucesso para ${data.totalEnviados} administrador(es)!`);
          } else {
            torrar(`⚠️ ${data?.error || 'Não foi possível enviar o relatório via WhatsApp.'}`);
          }
        })
        .catch(() => torrar('Erro ao solicitar disparo ao servidor.'));
      break;
    }
    case 'salvar-config-relatorio': {
      const fonesInput = document.getElementById('cfg_admin_fones');
      const horaInput = document.getElementById('cfg_hora_relatorio');
      const autoInput = document.getElementById('cfg_auto_envio');

      const fonesStr = fonesInput ? fonesInput.value : '';
      const horaStr = horaInput ? horaInput.value : '08:00';
      const autoBool = autoInput ? autoInput.checked : true;

      const fonesArr = fonesStr.split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean);

      S.cfg = S.cfg || {};
      S.cfg.adminFones = fonesArr;
      S.cfg.horaRelatorioDiario = horaStr;
      S.cfg.envioAutomaticoRelatorio = autoBool;
      salvar();

      fetch('/api/whatsapp/config-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminFones: fonesArr, horaRelatorio: horaStr, envioAutomatico: autoBool })
      })
        .then(r => r.json())
        .then(() => {
          torrar('Configurações do relatório salvas com sucesso!');
          render();
        })
        .catch(() => {
          torrar('Salvo localmente!');
          render();
        });
      break;
    }
    case 'copiar-texto-relatorio': {
      const txt = b.dataset.txt;
      if (txt) {
        copiar(txt);
        torrar('Texto do relatório copiado!');
      }
      break;
    }

    /* --- Cadastros --- */
    case 'aba-cad': S.ui.abaCad = b.dataset.k; render(); break;
    case 'ver-cliente': S.ui.cliAberto = b.dataset.id; abrirFolha(folhaCliente); break;
    case 'novo-cad': S.ui.cadTipo = b.dataset.t; S.ui.rascCad = {}; abrirFolha(folhaCadastro); break;
    case 'editar-cliente': S.ui.cadTipo = 'cliente'; S.ui.rascCad = JSON.parse(JSON.stringify(S.clientes.find(x => x.id === b.dataset.id))); abrirFolha(folhaCadastro); break;
    case 'editar-regra-fiscal': {
      const regra = (S.cfg.regrasTributarias || []).find(x => x.cfop === b.dataset.cfop);
      if (regra) {
        S.ui.rascCad = JSON.parse(JSON.stringify(regra));
        S.ui.cadTipo = 'regra-tributaria';
        abrirFolha(folhaCadastro);
      }
      break;
    }
    case 'bloquear-cliente': {
      const cl = S.clientes.find(x => x.id === b.dataset.id);
      if (cl) { cl.bloqueado = !cl.bloqueado; salvar(); renderFolha(); render(); torrar(cl.bloqueado ? 'Cliente bloqueado para faturamento' : 'Cliente desbloqueado'); }
      break;
    }
    case 'excluir-cliente': pedirConfirmacao('excli' + b.dataset.id, 'Toque de novo para excluir o cliente', () => {
      const cId = b.dataset.id;
      S._excluidos = S._excluidos || {};
      S._excluidos.clientes = S._excluidos.clientes || [];
      if (!S._excluidos.clientes.includes(cId)) S._excluidos.clientes.push(cId);
      S.clientes = S.clientes.filter(x => x.id !== cId);
      salvar();
      render();
      torrar('Cliente excluído');
    }); break;
    case 'salvar-cad': {
      const r = S.ui.rascCad || {}, t = S.ui.cadTipo;
      if (t === 'cliente') {
        if (!r.nome) { torrar('Razão Social / Nome é obrigatório'); break; }
        if (r.id) {
          const idx = S.clientes.findIndex(x => x.id === r.id);
          if (idx >= 0) S.clientes[idx] = { ...S.clientes[idx], ...r, scoreSerasa: (r.scoreSerasa !== undefined && r.scoreSerasa !== '' && r.scoreSerasa !== null) ? Number(r.scoreSerasa) : (S.clientes[idx].scoreSerasa ?? null), situacaoSerasa: r.situacaoSerasa ?? S.clientes[idx].situacaoSerasa ?? null, consultaSerasaRealizada: r.consultaSerasaRealizada !== undefined ? Boolean(r.consultaSerasaRealizada) : (S.clientes[idx].consultaSerasaRealizada || false) };
        } else {
          S.clientes.push({ id: uid('cli'), nome: r.nome, fantasia: r.fantasia || '', doc: r.doc || '', fone: r.fone || '', email: r.email || '', contato: r.contato || '', prazo: +r.prazo || 0, ie: r.ie || '', endereco: r.endereco || '', cidade: r.cidade || '', uf: r.uf || '', cep: r.cep || '', optin: true, bloqueado: false, scoreSerasa: (r.scoreSerasa !== undefined && r.scoreSerasa !== '' && r.scoreSerasa !== null) ? Number(r.scoreSerasa) : null, situacaoSerasa: r.situacaoSerasa ?? null, consultaSerasaRealizada: Boolean(r.consultaSerasaRealizada) });
        }
      }
      if (t === 'fornecedor') {
        if (!r.nome) { torrar('Razão Social do Fornecedor é obrigatória'); break; }
        S.fornecedores.push({ id: uid('f'), nome: r.nome, fantasia: r.fantasia||'', doc: r.doc||'', fone: r.fone||'', email: r.email||'', contato: r.contato||'', cidade: r.cidade||'', uf: r.uf||'' });
      }
      if (t === 'mecanico') {
        if (!r.nome) { torrar('Nome do mecânico é obrigatório'); break; }
        S.mecanicos.push({ id: uid('m'), nome: r.nome, especialidade: r.especialidade||'Geral', fone: r.fone||'' });
      }
      if (t === 'produto') {
        if (!r.nome) { torrar('Nome do produto é obrigatório'); break; }
        if (r.id) {
          const idx = S.pecas.findIndex(x => x.id === r.id);
          if (idx >= 0) S.pecas[idx] = { ...S.pecas[idx], ...r, custo: +r.custo||0, venda: +r.venda||0, cClassTrib: r.cClassTrib || S.pecas[idx].cClassTrib || '' };
        } else {
          S.pecas.push({ id: uid('p'), cod: r.cod||'', nome: r.nome, un: r.un||'un', ncm: r.ncm||'', cest: r.cest||'', origem: r.origem||'0', cfop: r.cfop||'', cClassTrib: r.cClassTrib||'', custo: +r.custo||0, venda: +r.venda||0 });
        }
      }
      if (t === 'servico') {
        if (!r.nome) { torrar('Descrição do serviço é obrigatória'); break; }
        if (r.id) {
          const idx = S.servicos.findIndex(x => x.id === r.id);
          if (idx >= 0) S.servicos[idx] = { ...S.servicos[idx], ...r, valor: +r.valor||0, horas: +r.horas||1, cClassTrib: r.cClassTrib || S.servicos[idx].cClassTrib || '' };
        } else {
          S.servicos.push({ id: uid('s'), nome: r.nome, valor: +r.valor||0, horas: +r.horas||1, cnae: r.cnae||'', codServLC116: r.codServLC116||'', cfop: r.cfop||'', cClassTrib: r.cClassTrib||'' });
        }
      }
      if (t === 'regra-tributaria') {
        if (!r.cfop || !r.desc) { torrar('CFOP e Descrição são obrigatórios'); break; }
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
        if (!r.nome) { torrar('Nome do box é obrigatório'); break; }
        S.boxes.push({ id: uid('b'), nome: r.nome, tipo: r.tipo || 'Geral' });
      }
      if (t === 'veiculo') {
        if (!r.placa) { torrar('Falta a placa'); break; }
        S.veiculos.push({ id: uid('v'), cli: r.cli || S.clientes[0]?.id, placa: (r.placa || '').toUpperCase(), modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo' });
      }
      salvar(); S.ui.rascCad = null; fecharFolha(); render(); torrar('Cadastro realizado com sucesso!'); break;
    }

    /* --- Relatórios & Backup --- */
    case 'exportar-csv': exportarCSV(b.dataset.tipo); break;
    case 'exportar-backup-json': exportarBackupJSON(); break;
    case 'imprimir-fechamento-caixa': imprimirFechamentoCaixa(); break;
    case 'abrir-importador-sistemas': abrirImportadorSistemas(); break;
    case 'baixar-template-csv': baixarTemplateCSV(b.dataset.tipo); break;
    case 'cancelar-migracao': window._dadosMigracao = null; renderFolha(); break;
    case 'executar-importacao-confirmada': executarImportacaoConfirmada(); break;

    /* --- Config & Reset --- */
    case 'remover-logo': {
      if (S.cfg?.identidadeVisual) {
        S.cfg.identidadeVisual.logo = null;
        salvar();
        render();
        torrar('Logotipo removido.');
      }
      break;
    }
    case 'salvar-cfg': salvar(); torrar('Configurações salvas!'); break;
    case 'zerar': pedirConfirmacao('zerar', 'Toque de novo para restaurar a demonstração inicial', () => { S = sementes(); salvar(); render(); torrar('Dados de demonstração restaurados!'); }); break;
  }
});

/* =====================================================================
   INPUTS REATIVOS & DEBOUNCE
===================================================================== */
let _searchTimer = null;
function debounceSearch(fn, ms = 250) { clearTimeout(_searchTimer); _searchTimer = setTimeout(fn, ms); }

document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, c = el.dataset.c, v = el.value, o = OSatual();
  const guarda = (obj) => { obj[c] = v; };

  if (a === 'busca-placa-patio') { S.ui.buscaPlaca = v; debounceSearch(() => render()); return; }
  if (a === 'busca-estoque') { S.ui.buscaEstoque = v; debounceSearch(() => render()); return; }
  if (a === 'busca-picker') { S.ui.busca = v; debounceSearch(() => renderFolha()); return; }

  if (a === 'rasc') { guarda(S.ui.rascunho = S.ui.rascunho || {}); if (c === 'vei' && v === 'novo') { abrirFolha(() => folhaNovoVeiculo(S.ui.rascunho.cli)); } }
  if (a === 'rasc-vei') guarda(S.ui.rascVeiculo = S.ui.rascVeiculo || {});
  if (a === 'rasc-fat') guarda(S.ui.rascFaturar = S.ui.rascFaturar || {});
  if (a === 'rp') guarda(S.ui.rascPeca = S.ui.rascPeca || {});
  if (a === 'rc') guarda(S.ui.rascCad = S.ui.rascCad || {});
  if (a === 'rct') guarda(S.ui.rascConta = S.ui.rascConta || {});
  if (a === 'rmv') guarda(S.ui.rascMov = S.ui.rascMov || {});
  if (a === 'cfg') { S.cfg[c] = c === 'saldoInicial' ? (+v || 0) : v; salvar(); }
  if (a === 'cfg-assistente') { (S.cfg.assistente = S.cfg.assistente || {})[c] = v; salvar(); }
  if (a === 'cfg-apibrasil') { (S.cfg.apibrasil = S.cfg.apibrasil || {})[c] = v; salvar(); }
  if (a === 'camp') { (S.ui.camp = S.ui.camp || {})[c] = v; salvar(); }
  if (a === 'api-cfg') { S.zap.api = S.zap.api || {}; S.zap.api[c] = v; salvar(); }
  if (a === 'regra') { const r = S.zap.regua.find(x => x.id === el.dataset.i); if (r) r[c] = c === 'quando' ? (+v || 0) : v; salvar(); }
  if (a === 'campo-peca') { const p = P(S.ui.pecaAberta); p[c] = ['min', 'custo', 'venda', 'qtd'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'campo-os' && o) { o[c] = ['km', 'desc'].includes(c) ? (+v || 0) : v; salvar(); }
  if (a === 'val-item' && o) { const i = o[el.dataset.t].find(x => x.id === el.dataset.i); if (i) i.valor = +v || 0; salvar(); }
});

/* =====================================================================
   DELEGAÇÃO GLOBAL DE EVENTOS: CHANGE
===================================================================== */
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'cfg-input-logo') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      torrar('Arquivo muito grande! Máximo permitido: 2MB.', 'erro');
      return;
    }
    const formData = new FormData();
    formData.append('arquivo', file);
    torrar('Enviando logotipo...', 'neutro');
    fetch('/api/configuracoes/empresa/logo', {
      method: 'POST',
      body: formData
    })
      .then(r => r.json())
      .then(res => {
        if (res.sucesso) {
          S.cfg = S.cfg || {};
          S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
          S.cfg.identidadeVisual.logoUrl = res.url;
          S.cfg.identidadeVisual.logoHash = res.hash;
          S.cfg.identidadeVisual.logo = res.url;
          salvar();
          render();
          torrar('Logotipo salvo com sucesso!', 'sucesso');
        } else {
          torrar(res.erro || 'Erro ao enviar logotipo.', 'erro');
        }
      })
      .catch(err => {
        console.error('Erro upload logo:', err);
        torrar('Falha no upload do logotipo.', 'erro');
      });
    return;
  }

  if (e.target && e.target.id === 'cfg-input-institucional') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      torrar('Arquivo muito grande! Máximo permitido: 2MB.', 'erro');
      return;
    }
    const formData = new FormData();
    formData.append('arquivo', file);
    torrar('Enviando imagem institucional...', 'neutro');
    fetch('/api/configuracoes/empresa/imagem-institucional', {
      method: 'POST',
      body: formData
    })
      .then(r => r.json())
      .then(res => {
        if (res.sucesso) {
          S.cfg = S.cfg || {};
          S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
          S.cfg.identidadeVisual.imagemInstitucionalUrl = res.url;
          S.cfg.identidadeVisual.imagemInstitucionalHash = res.hash;
          S.cfg.identidadeVisual.imagemInstitucional = res.url;
          salvar();
          render();
          torrar('Imagem institucional salva com sucesso!', 'sucesso');
        } else {
          torrar(res.erro || 'Erro ao enviar imagem.', 'erro');
        }
      })
      .catch(err => {
        console.error('Erro upload imagem:', err);
        torrar('Falha no upload da imagem.', 'erro');
      });
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, o = OSatual();

  if (a === 'mudar-perfil') {
    S.ui = S.ui || {};
    S.ui.perfilAtivo = el.value || 'todos';
    salvar();
    render();
    return;
  }

  if (a === 'cfg') {
    S.cfg[el.dataset.c] = el.dataset.tipo === 'number' ? (+el.value || 0) : el.value;
    salvar();
    render();
    return;
  }

  if (a === 'cfg-prev') {
    S.cfg.manutencaoPreventiva = S.cfg.manutencaoPreventiva || {};
    S.cfg.manutencaoPreventiva[el.dataset.c] = (+el.value || 0);
    salvar();
    render();
    return;
  }

  if (a === 'cfg-assistente') {
    (S.cfg.assistente = S.cfg.assistente || {})[el.dataset.c] = el.value;
    salvar();
    render();
    return;
  }

  if (a === 'cfg-assistente-bool') {
    (S.cfg.assistente = S.cfg.assistente || {})[el.dataset.c] = el.checked;
    salvar();
    render();
    return;
  }

  if (a === 'mudar-status-os' && o) {
    const novoSt = el.value;
    o.st = novoSt;

    if (novoSt === 'executando' && !o.box) {
      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== o.id && x.st !== 'finalizada' && x.box).map(x => x.box));
      const boxLivre = boxesValidos.find(b => !boxesOcupados.has(b.id));
      if (boxLivre) {
        o.box = boxLivre.id;
        torrar(`🟢 OS ${o.num}: Alocada no ${boxLivre.nome} e Em Execução!`);
      } else {
        torrar(`⚠️ Todos os boxes cheios! OS ${o.num} Em Execução no pátio.`);
      }
    } else if (novoSt === 'fila') {
      o.box = null;
      torrar(`OS ${o.num}: Retornou para a Fila (Box liberado).`);
    } else {
      torrar(`OS ${o.num}: ${ST[o.st].r}`);
    }
    salvar();
    renderFolha();
    render();
  }

  if (a === 'mudar-status-card') {
    const osId = el.dataset.id;
    const alvo = (S.os || []).find(x => x.id === osId);
    if (alvo) {
      const novoSt = el.value;
      alvo.st = novoSt;
      if (novoSt === 'executando' && !alvo.box) {
        const boxesValidos = S.boxes || [];
        const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && x.box).map(x => x.box));
        const boxLivre = boxesValidos.find(b => !boxesOcupados.has(b.id));
        if (boxLivre) {
          alvo.box = boxLivre.id;
          torrar(`🟢 OS ${alvo.num}: Alocada no ${boxLivre.nome} e Em Execução!`);
        } else {
          torrar(`⚠️ Todos os boxes cheios! OS ${alvo.num} Em Execução no pátio.`);
        }
      } else if (novoSt === 'fila') {
        alvo.box = null;
        torrar(`OS ${alvo.num}: Retornou para a Fila (Box liberado).`);
      } else {
        torrar(`OS ${alvo.num}: ${ST[alvo.st].r}`);
      }
      salvar();
      render();
    }
  }

  if (a === 'mudar-box-os' && o) {
    const novoBox = el.value || null;
    o.box = novoBox;
    if (novoBox && o.st === 'fila') {
      o.st = 'executando';
      torrar(`🟢 OS ${o.num}: Alocada no ${B(novoBox).nome} (Em Execução)`);
    } else if (!novoBox) {
      o.st = 'fila';
      torrar(`OS ${o.num}: Movida para Fila de Espera (Sem Box)`);
    } else {
      torrar(`OS ${o.num}: Movida para ${B(novoBox).nome}`);
    }
    salvar();
    renderFolha();
    render();
  }
  if (a === 'campo-os' && o) { renderFolha(); render(); }
  if (a === 'val-item' && o) { renderFolha(); render(); }
  if (a === 'campo-peca') { renderFolha(); render(); }
  if (a === 'camp-modelo') {
    const m = S.zap.modelos[+el.value];
    if (m) { S.ui.camp = S.ui.camp || {}; S.ui.camp.texto = m.texto; S.ui.camp.nome = m.nome; render(); }
  }
  if (a === 'arquivo-xml') { lerArquivosXML(el.files); }
  if (a === 'restaurar-backup-json' || a === 'arquivo-migracao-input') {
    if (el.files && el.files.length > 0) {
      abrirFolha(folhaImportacaoSistemas);
      processarArquivosMigracao(el.files);
      el.value = '';
    }
  }

  if (a === 'upload-foto-os') {
    const file = el.files && el.files[0];
    if (!file) return;
    const osId = el.dataset.os || (o ? o.id : null);
    if (!osId) return;

    torrar('Processando foto e reconhecendo placa...');
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const base64 = fr.result;
        const res = await fetch(`/api/os/${encodeURIComponent(osId)}/anexar-foto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagemBase64: base64 })
        });
        const data = await res.json();

        if (res.status === 409 || data.conflito) {
          const confirma = confirm(data.mensagem || `Conflito de placa: substituir ${data.placaAtual} por ${data.placaDetectada}?`);
          if (confirma) {
            torrar('Confirmando substituição de placa...');
            const confRes = await fetch(`/api/os/${encodeURIComponent(osId)}/anexar-foto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokenConfirmacao: data.tokenConfirmacao, confirmarConflito: true })
            });
            const confData = await confRes.json();
            if (confData.ok || confData.success) {
              torrar(confData.mensagem || 'Placa atualizada com sucesso!');
              await carregarEstado();
              renderFolha();
              render();
            } else {
              torrar(confData.error || 'Erro ao confirmar alteração.');
            }
          } else {
            torrar('Substituição cancelada.');
          }
          return;
        }

        if (data.ok || data.success) {
          torrar(data.mensagem || 'Placa identificada e conciliada com sucesso!');
          await carregarEstado();
          renderFolha();
          render();
        } else {
          torrar(data.error || 'Não foi possível reconhecer a placa.');
        }
      } catch (err) {
        torrar('Erro ao enviar foto para conciliação.');
      } finally {
        el.value = '';
      }
    };
    fr.readAsDataURL(file);
  }
});

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

document.getElementById('vidro')?.addEventListener('click', fecharFolha);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && folhaAtual) fecharFolha(); });

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.pedirConfirmacao = pedirConfirmacao;
  window.copiar = copiar;
  window.caiuNoTextarea = caiuNoTextarea;
  window.textoOrcamento = textoOrcamento;
  window.debounceSearch = debounceSearch;
  window.lerArquivosXML = lerArquivosXML;
}
