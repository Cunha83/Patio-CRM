/**
 * Módulo: events_patio_os.js
 * Pátio-CRM — Handlers de Eventos: Ordens de Serviço (OS), Itens, Faturamento e Veículos
 * Arquitetura Modular (< 350 linhas).
 */

function textoOrcamento(o) {
  const v = V(o.vei);
  const pecas = (o.pecas || []).map(p => `• ${p.nome} (${p.qtd}x ${brl(p.valor)}) = ${brl(p.qtd * p.valor)}`).join('\n');
  const servicos = (o.servicos || []).map(s => `• ${s.nome} = ${brl(s.valor)}`).join('\n');
  return `*ORÇAMENTO — OS #${o.num}*
*Veículo:* ${v.marca} ${v.modelo} (Placa: ${v.placa})
${pecas ? `\n*Peças:*\n${pecas}` : ''}
${servicos ? `\n*Serviços:*\n${servicos}` : ''}
\n*Total:* ${brl(totOS(o))}
*Previsão de Entrega:* ${dataBR(o.prev)}`;
}

function tratarEventosPatioOS(a, b, e, o) {
  switch (a) {
    case 'abrir-os': S.ui.osAberta = b.dataset.id; S.ui.abaOS = 'servicos'; S.ui.picker = null; S.ui.busca = ''; abrirFolha(folhaOS); return true;
    case 'aba-os': S.ui.abaOS = b.dataset.k; S.ui.picker = null; S.ui.busca = ''; renderFolha(); return true;
    case 'nova-os': S.ui.rascunho = null; abrirFolha(() => novaOSFolha(b.dataset.box)); return true;
    case 'toggle-tipo-entrada': {
      const tipo = b.dataset.tipo || 'simples';
      S.ui.rascunho = S.ui.rascunho || {};
      S.ui.rascunho.tipoEntrada = tipo;
      renderFolha();
      return true;
    }
    case 'mudar-alvo-item': {
      if (!o) return true;
      const tipo = b.dataset.tipo;
      const idx = parseInt(b.dataset.idx, 10);
      const lista = o[tipo];
      if (Array.isArray(lista) && lista[idx]) {
        lista[idx].alvo = lista[idx].alvo === 'carreta' ? 'cavalo' : 'carreta';
        salvar();
        renderFolha();
      }
      return true;
    }
    case 'voltar-os': S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); return true;
    case 'imprimir-os': imprimirOS(o, b.dataset.formato || 'a4'); return true;
    case 'imprimir-os-termica': imprimirOS(o, 'termica'); return true;
    case 'copiar-orc': {
      if (!o) { torrar('Nenhuma OS selecionada.', 'alerta'); return true; }
      copiar(textoOrcamento(o));
      torrar('Orçamento copiado para a área de transferência!', 'sucesso');
      return true;
    }
    case 'checkout-pix': {
      const osId = b.dataset.osId || (o && o.id);
      const vlr = b.dataset.valor || (o && (o.total || totOS(o)));
      const cli = b.dataset.cliente || (o && o.cliente);
      if (typeof abrirModalCheckoutPix === 'function') abrirModalCheckoutPix(osId, vlr, cli);
      return true;
    }
    case 'simular-webhook-pix': {
      const txid = b.dataset.txid;
      const osId = b.dataset.osId;
      b.disabled = true;
      b.textContent = 'Processando liquidação via webhook...';
      fetch('/api/webhooks/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid, status: 'PAGO' })
      })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            if (o) { o.pago = true; o.formaPgto = 'pix'; o.saldoPendente = 0; }
            if (osId && Array.isArray(S.os)) {
              const target = S.os.find(x => x.id === osId || String(x.num) === String(osId));
              if (target) { target.pago = true; target.formaPgto = 'pix'; target.saldoPendente = 0; }
            }
            salvar();
            document.getElementById('modal-checkout-pix-overlay')?.remove();
            render();
            torrar('⚡ Pagamento Pix conciliado e liquidado com sucesso!', 'sucesso');
          } else {
            torrar(d.error || 'Erro na conciliação Pix.', 'erro');
            b.disabled = false;
            b.textContent = '⚡ Simular Confirmação Webhook Pix';
          }
        })
        .catch(() => {
          torrar('Falha de conexão com webhook Pix.', 'erro');
          b.disabled = false;
          b.textContent = '⚡ Simular Confirmação Webhook Pix';
        });
      return true;
    }
    case 'duplicar-os': {
      const osId = b.dataset.id || (o && o.id);
      if (!osId) return true;
      fetch('/api/os/duplicar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: osId }) })
        .then(r => r.json())
        .then(d => {
          if (d.success && d.item) {
            S.os.push(d.item); salvar(); render(); torrar(`OS duplicada com sucesso! Nova OS #${d.item.num}`, 'sucesso');
          } else { torrar(d.error || 'Erro ao duplicar OS.', 'erro'); }
        }).catch(() => torrar('Erro de rede ao duplicar OS.', 'erro'));
      return true;
    }
    case 'excluir-os':
      pedirConfirmacao('os' + o.id, 'Toque de novo para excluir a OS permanentemente', () => {
        S._excluidos = S._excluidos || {};
        S._excluidos.os = S._excluidos.os || [];
        if (!S._excluidos.os.includes(o.id)) S._excluidos.os.push(o.id);
        S.os = S.os.filter(x => x.id !== o.id);
        salvar(); fecharFolha(); render(); torrar('OS excluída');
      });
      return true;
    case 'picker': S.ui.picker = b.dataset.p; S.ui.busca = ''; renderFolha(); return true;
    case 'fechar-picker': S.ui.picker = null; S.ui.busca = ''; renderFolha(); return true;
    case 'add-item': {
      const tipo = b.dataset.t, refId = b.dataset.r;
      const isPeca = tipo === 'pecas';
      const ref = isPeca ? P(refId) : Srv(refId);
      o[tipo] = o[tipo] || [];
      o[tipo].push({ id: uid('item'), nome: ref.nome, cod: ref.cod || '', qtd: 1, valor: isPeca ? ref.venda : ref.valor });
      salvar(); renderFolha(); render(); torrar('Item adicionado à OS'); return true;
    }
    case 'qtd': {
      const lista = o[b.dataset.t], item = lista.find(x => x.id === b.dataset.i);
      if (item) { item.qtd = Math.max(1, item.qtd + Number(b.dataset.d)); salvar(); renderFolha(); render(); }
      return true;
    }
    case 'consumir-peca-os': {
      const pecaId = b.dataset.pecaId, itemId = b.dataset.itemId;
      if (o && Array.isArray(o.pecas)) {
        const item = o.pecas.find(x => x.id === itemId || x.pecaId === pecaId);
        if (item) {
          item.st = 'consumida'; item.status = 'consumida'; item.consumidoEm = new Date().toISOString();
          salvar(); renderFolha(); render(); torrar('Peça consumida com sucesso na OS!');
        }
      }
      return true;
    }
    case 'rm-item': o[b.dataset.t] = o[b.dataset.t].filter(x => x.id !== b.dataset.i); salvar(); renderFolha(); render(); return true;
    case 'faturar-os-modal': abrirFolha(folhaFaturarOS); return true;
    case 'confirmar-faturamento': processarFaturamentoOS(o); fecharFolha(); render(); torrar(`OS ${o.num} faturada e entregue com sucesso!`); return true;
    case 'criar-os': {
      const r = S.ui.rascunho || {};
      if (!r.vei || r.vei === 'novo') { torrar('Selecione a placa do veículo'); return true; }
      let veiId = r.vei;
      let cliId = S.clientes[0] ? S.clientes[0].id : '';
      let pendenciaCadastral = false, pendencias = [];

      if (r.vei === 'sem_placa') {
        pendenciaCadastral = true; pendencias = ['placa_pendente'];
        const veicTemp = { id: uid('v'), cli: cliId, placa: 'SEM-PLACA', marca: 'Pendente', modelo: 'Veículo Não Identificado', ano: '', cor: 'Não informada', km: +r.km || 0, tipo: 'Cavalo Mecânico', pendenciaCadastral: true, pendencias: ['placa_pendente'], criadoEm: Date.now() };
        S.veiculos = S.veiculos || []; S.veiculos.push(veicTemp); veiId = veicTemp.id;
      } else {
        const v = V(r.vei); if (v && v.cli) cliId = v.cli;
      }

      const boxEscolhido = r.box || null;
      const statusInicial = boxEscolhido ? 'executando' : 'fila';
      const maxNum = (S.os || []).reduce((max, x) => Math.max(max, parseInt(x.num, 10) || 1000), 1040);
      const novoNum = S.proxNum ? S.proxNum++ : (maxNum + 1);

      const nova = {
        id: uid('os'), num: novoNum, box: boxEscolhido, vei: veiId, cli: cliId, mec: r.mec || '', st: statusInicial,
        pendenciaCadastral, pendencias, abertura: hoje(), prev: r.prev || addDias(hoje(), 1), km: +r.km || 0, queixa: r.queixa || '',
        servicos: [{ id: 'srv_' + Date.now(), nome: 'Diagnóstico e Check-in de Pátio', qtd: 1, valor: 150 }],
        pecas: [], desc: 0, pago: false, obs: pendenciaCadastral ? 'Abertura com pendência cadastral de placa.' : ''
      };

      S.os = S.os || []; S.os.unshift(nova); S.ui.rascunho = null; S.ui.osAberta = nova.id; S.ui.abaOS = 'servicos';
      salvar(); fecharFolha(); abrirFolha(folhaOS); render();
      if (pendenciaCadastral) torrar(`OS ${nova.num} aberta no pátio! Lembre-se de anexar a foto da placa.`);
      else torrar(`✅ OS ${nova.num} aberta com sucesso (${boxEscolhido ? `alocada no ${B(boxEscolhido).nome}` : 'colocada na Fila de Espera'})!`);
      return true;
    }
    case 'salvar-veiculo': {
      const r = S.ui.rascVeiculo;
      if (!r || !r.placa) { torrar('Digite a placa do caminhão'); return true; }
      const novoId = uid('v');
      S.veiculos.push({ id: novoId, cli: r.cli || S.clientes[0].id, placa: r.placa.toUpperCase(), marca: r.marca || '', modelo: r.modelo || '', ano: r.ano || '', km: +r.km || 0, tipo: r.tipo || 'Cavalo Mecânico' });
      salvar(); torrar('Veículo cadastrado!');
      S.ui.rascunho = S.ui.rascunho || {}; S.ui.rascunho.vei = novoId; S.ui.rascVeiculo = null; abrirFolha(novaOSFolha); return true;
    }
    case 'buscar-placa-veiculo': {
      const rV = S.ui.rascVeiculo;
      if (!rV || !rV.placa || rV.placa.length < 7) { torrar('Digite uma placa válida!'); return true; }
      if (!apiThrottle('placa')) return true;
      const cred = S.cfg.apibrasil;
      if (!cred || !cred.deviceToken || !cred.bearerToken) { torrar('Credenciais da APIBrasil não preenchidas em Configurações.'); return true; }
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
      return true;
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
      return true;
    }
    default:
      return false;
  }
}

function tratarChangePatioOS(a, el, e, o) {
  if (a === 'campo-articulado') {
    S.ui.rascunho = S.ui.rascunho || {};
    const campo = el.dataset.campo;
    if (campo) S.ui.rascunho[campo] = el.value;
    return true;
  }
  if (a === 'campo-os' && o) { renderFolha(); render(); return true; }
  if (a === 'val-item' && o) { renderFolha(); render(); return true; }
  if (a === 'upload-foto-os') {
    const file = el.files && el.files[0];
    if (!file) return true;
    const osId = el.dataset.os || (o ? o.id : null);
    if (!osId) return true;

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
              await carregarEstado(); renderFolha(); render();
            } else { torrar(confData.error || 'Erro ao confirmar alteração.'); }
          } else { torrar('Substituição cancelada.'); }
          return;
        }

        if (data.ok || data.success) {
          torrar(data.mensagem || 'Placa identificada e conciliada com sucesso!');
          await carregarEstado(); renderFolha(); render();
        } else { torrar(data.error || 'Não foi possível reconhecer a placa.'); }
      } catch (err) { torrar('Erro ao enviar foto para conciliação.'); }
      finally { el.value = ''; }
    };
    fr.readAsDataURL(file);
    return true;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.textoOrcamento = textoOrcamento;
  window.tratarEventosPatioOS = tratarEventosPatioOS;
  window.tratarChangePatioOS = tratarChangePatioOS;
}
if (typeof globalThis !== 'undefined') {
  globalThis.textoOrcamento = textoOrcamento;
  globalThis.tratarEventosPatioOS = tratarEventosPatioOS;
  globalThis.tratarChangePatioOS = tratarChangePatioOS;
}

