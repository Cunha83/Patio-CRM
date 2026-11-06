/**
 * Módulo: events_patio_boxes.js
 * Pátio-CRM — Handlers de Eventos: Boxes Físicos, Alocação, Gargalos, Apontamento e Vistoria
 * Arquitetura Modular (< 350 linhas).
 */

function tratarEventosPatioBoxes(a, b, e, o) {
  switch (a) {
    case 'iniciar-box-card': {
      const osId = b.dataset.id;
      const alvo = (S.os || []).find(x => x.id === osId);
      if (!alvo) return true;
      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && x.box).map(x => x.box));
      const boxLivre = boxesValidos.find(bx => !boxesOcupados.has(bx.id));
      if (boxLivre) {
        alvo.box = boxLivre.id; alvo.boxId = boxLivre.id; alvo.st = 'executando'; alvo.etapaPatio = 'em_execucao'; alvo.motivoPausa = null;
        salvar(); render();
        torrar(`🟢 OS ${alvo.num}: Alocada no ${boxLivre.nome}! Status: Em Execução.`);
      } else {
        torrar('⚠️ Todos os boxes estão ocupados no momento!');
      }
      return true;
    }

    case 'alocar-box-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) { torrar('OS não encontrada para alocação.', 'erro'); return true; }

      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== alvo.id && x.st !== 'finalizada' && (x.box || x.boxId)).map(x => x.box || x.boxId));
      let boxEscolhido = b.dataset.box;
      if (!boxEscolhido) {
        const boxLivre = boxesValidos.find(bx => !boxesOcupados.has(bx.id));
        if (!boxLivre) { torrar('⚠️ Todos os boxes estão ocupados no momento!', 'aviso'); return true; }
        boxEscolhido = boxLivre.id;
      }

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/alocar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: boxEscolhido, mecanico: alvo.mecanico || '' })
      }).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { torrar(d.mensagem || d.error || 'Box já ocupado ou indisponível.', 'aviso'); return; }
        alvo.box = boxEscolhido; alvo.boxId = boxEscolhido; alvo.st = 'executando'; alvo.etapaPatio = 'em_execucao'; alvo.motivoPausa = null;
        salvar(); render();
        const nomeBox = (boxesValidos.find(bx => bx.id === boxEscolhido) || {}).nome || boxEscolhido;
        torrar(`🏗️ OS ${alvo.num}: Alocada no ${nomeBox}!`, 'sucesso');
      }).catch(() => {
        alvo.box = boxEscolhido; alvo.boxId = boxEscolhido; alvo.st = 'executando';
        salvar(); render();
        torrar(`🏗️ OS ${alvo.num}: Box atualizado localmente.`);
      });
      return true;
    }

    case 'pausar-os-gargalo': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) return true;
      const motivo = prompt('Motivo do gargalo ou parada mecânica:', alvo.motivoPausa || 'Aguardando peças');
      if (!motivo || !motivo.trim()) return true;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/apontamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'pausar', motivo: motivo.trim() })
      }).then(async () => {
        alvo.etapaPatio = 'pausado_gargalo'; alvo.motivoPausa = motivo.trim(); alvo.st = 'peca';
        salvar(); render();
        torrar(`⏸️ OS ${alvo.num}: Pausada com gargalo (${motivo.trim()})`, 'aviso');
      }).catch(() => {
        alvo.etapaPatio = 'pausado_gargalo'; alvo.motivoPausa = motivo.trim(); alvo.st = 'peca';
        salvar(); render();
        torrar(`⏸️ OS ${alvo.num}: Pausada localmente.`);
      });
      return true;
    }

    case 'liberar-box-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) return true;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/liberar-box`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: alvo.box || alvo.boxId })
      }).then(async () => {
        alvo.box = null; alvo.boxId = null; salvar(); render();
        torrar(`🔓 OS ${alvo.num}: Box liberado com sucesso!`, 'sucesso');
      }).catch(() => {
        alvo.box = null; alvo.boxId = null; salvar(); render();
        torrar(`🔓 OS ${alvo.num}: Box liberado localmente.`);
      });
      return true;
    }

    case 'retomar-os-gargalo': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) return true;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/liberar-gargalo-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: 'Peça recebida no pátio' })
      }).then(async () => {
        alvo.etapaPatio = 'em_execucao'; alvo.motivoPausa = null; alvo.st = 'executando';
        const bId = alvo.box || alvo.boxId;
        if (bId && Array.isArray(S.boxes)) {
          const bx = S.boxes.find(x => x.id === bId);
          if (bx) bx.status = 'ocupado';
        }
        salvar(); render();
        torrar(`🚀 OS ${alvo.num}: Gargalo liberado e box destravado!`, 'sucesso');
      }).catch(() => {
        alvo.etapaPatio = 'em_execucao'; alvo.motivoPausa = null; alvo.st = 'executando';
        salvar(); render();
        torrar(`🚀 OS ${alvo.num}: Retomada localmente.`);
      });
      return true;
    }

    case 'requisitar-peca-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) return true;

      const pecaIdent = prompt(`Informe o código ou nome da peça para a OS #${alvo.num}:`, 'MOL-01');
      if (!pecaIdent || !pecaIdent.trim()) return true;

      const qtdStr = prompt('Quantidade solicitada:', '1');
      const qtd = parseFloat(qtdStr) || 1;
      if (qtd <= 0) return true;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/requisitar-peca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecaIdOuNome: pecaIdent.trim(), quantidade: qtd })
      }).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { torrar(d.mensagem || d.error || 'Estoque insuficiente ou peça não localizada.', 'aviso'); return; }
        if (!Array.isArray(alvo.pecasUtilizadas)) alvo.pecasUtilizadas = [];
        if (d.peca) alvo.pecasUtilizadas.push(d.peca);
        if (d.totalPecasOS != null) alvo.totalPecas = d.totalPecasOS;
        salvar(); render();
        torrar(`🔩 Peça vinculada à OS #${alvo.num} com sucesso!`, 'sucesso');
      }).catch(() => { torrar('Erro de rede ao requisitar peça.', 'erro'); });
      return true;
    }

    case 'copiar-aviso-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) return true;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/aviso-cliente`).then(async r => {
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
      }).catch(() => { torrar('Erro ao consultar aviso da OS.', 'erro'); });
      return true;
    }

    case 'aprovar-checklist-os': {
      const osId = b.dataset.id || b.dataset.os || (o && o.id);
      const alvo = (S.os || []).find(x => String(x.id) === String(osId));
      if (!alvo) return true;

      fetch(`/api/financeiro/os/${encodeURIComponent(osId)}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'aprovar_todos', observacao: 'Vistoria aprovada via painel do pátio' })
      }).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { torrar(d.mensagem || d.error || 'Falha ao aprovar checklist técnico.', 'aviso'); return; }
        alvo.statusChecklist = 'aprovado';
        if (d.checklistTecnico) alvo.checklistTecnico = d.checklistTecnico;
        salvar(); render();
        torrar(`🛡️ Vistoria técnica da OS #${alvo.num || alvo.id} aprovada com sucesso!`, 'sucesso');
      }).catch(() => { torrar('Erro de rede ao aprovar checklist.', 'erro'); });
      return true;
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
      if (!placa) { torrar('Placa não identificada para esta OS.', 'aviso'); return true; }

      fetch(`/api/financeiro/patio/placa/${encodeURIComponent(placa)}/historico`).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { torrar(d.mensagem || d.error || 'Erro ao consultar histórico da placa.', 'aviso'); return; }
        const garantiaTxt = d.emGarantiaAtiva ? '🛡️ EM GARANTIA ATIVA (90 dias)' : '⚪ Fora da garantia';
        const pecasResumo = Array.isArray(d.pecasAplicadasHistorico) && d.pecasAplicadasHistorico.length > 0
          ? d.pecasAplicadasHistorico.map(p => `${p.nome} (qtd: ${p.quantidadeTotal})`).join(', ') : 'Nenhuma peça registrada';
        const msg = `Dossiê Placa ${d.placa}:\n- Status: ${garantiaTxt}\n- Total de OSs: ${d.totalOS || 0}\n- OSs Concluídas: ${d.totalConcluidas || 0}\n- Peças Históricas: ${pecasResumo}`;
        if (typeof alert === 'function') alert(msg);
        torrar(`🔍 Placa ${d.placa}: ${d.totalOS || 0} OS(s) | ${garantiaTxt}`, d.emGarantiaAtiva ? 'sucesso' : 'neutro');
      }).catch(() => { torrar('Erro de rede ao consultar histórico da placa.', 'erro'); });
      return true;
    }
    default:
      return false;
  }
}

function tratarChangePatioBoxes(a, el, e, o) {
  if (a === 'mudar-status-os' && o) {
    const novoSt = el.value;
    o.st = novoSt;
    if (novoSt === 'executando' && !o.box) {
      const boxesValidos = S.boxes || [];
      const boxesOcupados = new Set((S.os || []).filter(x => x.id !== o.id && x.st !== 'finalizada' && x.box).map(x => x.box));
      const boxLivre = boxesValidos.find(b => !boxesOcupados.has(b.id));
      if (boxLivre) { o.box = boxLivre.id; torrar(`🟢 OS ${o.num}: Alocada no ${boxLivre.nome} e Em Execução!`); }
      else { torrar(`⚠️ Todos os boxes cheios! OS ${o.num} Em Execução no pátio.`); }
    } else if (novoSt === 'fila') {
      o.box = null; torrar(`OS ${o.num}: Retornou para a Fila (Box liberado).`);
    } else {
      torrar(`OS ${o.num}: ${ST[o.st].r}`);
    }
    salvar(); renderFolha(); render();
    return true;
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
        if (boxLivre) { alvo.box = boxLivre.id; torrar(`🟢 OS ${alvo.num}: Alocada no ${boxLivre.nome} e Em Execução!`); }
        else { torrar(`⚠️ Todos os boxes cheios! OS ${alvo.num} Em Execução no pátio.`); }
      } else if (novoSt === 'fila') {
        alvo.box = null; torrar(`OS ${alvo.num}: Retornou para a Fila (Box liberado).`);
      } else {
        torrar(`OS ${alvo.num}: ${ST[alvo.st].r}`);
      }
      salvar(); render();
      if (typeof fetch === 'function') {
        fetch('/api/patio/box-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boxId: alvo.box, osId: alvo.id, placa: alvo.placa, status: novoSt })
        }).catch(() => {});
      }
    }
    return true;
  }

  if (a === 'mudar-box-os' && o) {
    const novoBox = el.value || null;
    o.box = novoBox;
    if (novoBox && o.st === 'fila') {
      o.st = 'executando'; torrar(`🟢 OS ${o.num}: Alocada no ${B(novoBox).nome} (Em Execução)`);
    } else if (!novoBox) {
      o.st = 'fila'; torrar(`OS ${o.num}: Movida para Fila de Espera (Sem Box)`);
    } else {
      torrar(`OS ${o.num}: Movida para ${B(novoBox).nome}`);
    }
    salvar(); renderFolha();
    if (typeof fetch === 'function') {
      fetch('/api/patio/box-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: novoBox, osId: o.id, placa: o.placa, status: o.st })
      }).catch(() => {});
    }
    render();
    return true;
  }

  return false;
}

if (typeof window !== 'undefined') {
  window.tratarEventosPatioBoxes = tratarEventosPatioBoxes;
  window.tratarChangePatioBoxes = tratarChangePatioBoxes;
}
if (typeof globalThis !== 'undefined') {
  globalThis.tratarEventosPatioBoxes = tratarEventosPatioBoxes;
  globalThis.tratarChangePatioBoxes = tratarChangePatioBoxes;
}
