'use strict';

/**
 * Pátio CRM — Ações Interativas de Produtividade de Pátio e Apontamento
 * Módulo de handlers e comunicação REST (< 200 linhas).
 */

function abrirModalIniciarApontamento(osId) {
  if (typeof S === 'undefined' || !S.os) return;
  const os = S.os.find(o => o.id === osId);
  if (!os) {
    if (typeof torrar === 'function') torrar('OS não encontrada.');
    return;
  }
  const mecanicos = S.equipe || S.mecanicos || S.colaboradores || [];
  const boxes = S.boxes || ['Box 01', 'Box 02', 'Box 03', 'Pátio Rápido'];
  if (typeof abrirModalGenerico === 'function' && typeof modalIniciarApontamentoHtml === 'function') {
    abrirModalGenerico(modalIniciarApontamentoHtml(os, mecanicos, boxes));
  }
}

async function confirmarIniciarApontamento(osId) {
  const selServico = document.getElementById('sel-apt-servico');
  const selMecanico = document.getElementById('sel-apt-mecanico');
  const selBox = document.getElementById('sel-apt-box');
  const numHoras = document.getElementById('num-apt-horas');

  const servicoId = selServico ? selServico.value : null;
  const mecanicoId = selMecanico ? selMecanico.value : null;
  const mecanicoNome = selMecanico && selMecanico.options[selMecanico.selectedIndex] ? selMecanico.options[selMecanico.selectedIndex].text : '';
  const boxId = selBox ? selBox.value : null;
  const horasPadrao = numHoras ? Number(numHoras.value) : 1;

  if (typeof torrar === 'function') torrar('Iniciando cronometragem...');
  try {
    const res = await fetch('/api/patio/apontamentos/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ osId, servicoId, mecanicoId, mecanicoNome, boxId, horasPadrao })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao iniciar apontamento.');
      return;
    }
    if (typeof torrar === 'function') torrar('Apontamento iniciado com sucesso!');
    if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao iniciar apontamento.');
  }
}

async function pausarApontamento(apontamentoId) {
  const motivo = prompt('Informe o motivo da pausa:', 'Aguardando peça / apoio');
  if (motivo === null) return;

  if (typeof torrar === 'function') torrar('Pausando apontamento...');
  try {
    const res = await fetch(`/api/patio/apontamentos/${encodeURIComponent(apontamentoId)}/pausar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao pausar apontamento.');
      return;
    }
    if (typeof torrar === 'function') torrar('Apontamento pausado!');
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao pausar.');
  }
}

async function retomarApontamento(apontamentoId) {
  if (typeof torrar === 'function') torrar('Retomando execução...');
  try {
    const res = await fetch(`/api/patio/apontamentos/${encodeURIComponent(apontamentoId)}/retomar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao retomar apontamento.');
      return;
    }
    if (typeof torrar === 'function') torrar('Apontamento retomado com sucesso!');
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao retomar.');
  }
}

async function concluirApontamento(apontamentoId) {
  const observacao = prompt('Observação de conclusão (opcional):', '');
  if (observacao === null) return;

  if (typeof torrar === 'function') torrar('Concluindo serviço...');
  try {
    const res = await fetch(`/api/patio/apontamentos/${encodeURIComponent(apontamentoId)}/concluir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observacao })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao concluir apontamento.');
      return;
    }
    if (typeof torrar === 'function') torrar(`Concluído! Eficiência: ${data.apontamento?.indiceEficiencia || 0}%`);
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao concluir.');
  }
}

function abrirModalConfigurarComissaoMecanico(mecanicoId) {
  if (typeof S === 'undefined') return;
  const equipe = S.equipe || S.mecanicos || S.colaboradores || [];
  const mec = equipe.find(m => m.id === mecanicoId) || { id: mecanicoId, nome: mecanicoId };
  const regras = S.mechanicCommissionRules || [];
  const regra = regras.find(r => r.mecanicoId === mecanicoId) || {};

  if (typeof abrirModalGenerico === 'function' && typeof modalConfigurarComissaoMecanicoHtml === 'function') {
    abrirModalGenerico(modalConfigurarComissaoMecanicoHtml(mec, regra));
  }
}

async function salvarRegraComissaoMecanico(mecanicoId) {
  const numBase = document.getElementById('num-com-base');
  const numBonus = document.getElementById('num-com-bonus');
  const numMeta = document.getElementById('num-com-meta');
  const selGatilho = document.getElementById('sel-com-gatilho');

  const payload = {
    percentualBase: numBase ? Number(numBase.value) : 10,
    bonusEficienciaPercentual: numBonus ? Number(numBonus.value) : 0,
    metaEficienciaMinima: numMeta ? Number(numMeta.value) : 100,
    modalidadeGatilho: selGatilho ? selGatilho.value : 'os_finalizada'
  };

  if (typeof torrar === 'function') torrar('Salvando regra de comissão...');
  try {
    const res = await fetch(`/api/patio/mecanicos/${encodeURIComponent(mecanicoId)}/regra-comissao`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (typeof torrar === 'function') torrar(data.error || 'Erro ao salvar regra.');
      return;
    }
    if (typeof torrar === 'function') torrar('Regra de comissão salva com sucesso!');
    if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
    if (typeof carregarEstado === 'function') await carregarEstado();
    if (typeof render === 'function') render();
  } catch (err) {
    if (typeof torrar === 'function') torrar('Erro de rede ao salvar regra.');
  }
}

const actionExports = {
  abrirModalIniciarApontamento,
  confirmarIniciarApontamento,
  pausarApontamento,
  retomarApontamento,
  concluirApontamento,
  abrirModalConfigurarComissaoMecanico,
  salvarRegraComissaoMecanico
};

if (typeof window !== 'undefined') Object.assign(window, actionExports);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, actionExports);

