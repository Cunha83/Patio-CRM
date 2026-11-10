// js/modules/patio_qualidade_folha_actions.js
// Handlers interativos para Checklist de Qualidade Pré-Entrega, Retrabalho e Folha de Comissões

(function (root) {
  'use strict';

  function abrirModalInspecaoQualidade(osId) {
    if (typeof S === 'undefined' || !S.os) return;
    const os = S.os.find(o => o.id === osId || String(o.num) === String(osId));
    if (!os) {
      if (typeof torrar === 'function') torrar('OS não encontrada.');
      return;
    }
    const equipe = S.equipe || S.mecanicos || S.colaboradores || [];
    if (typeof abrirModalGenerico === 'function' && typeof modalInspecaoQualidadeOSHtml === 'function') {
      abrirModalGenerico(modalInspecaoQualidadeOSHtml(os, equipe));
    }
  }

  async function confirmarInspecaoQualidade(osId) {
    const chkTorque = document.getElementById('chk-insp-torque');
    const chkPino = document.getElementById('chk-insp-pino');
    const chkEmbuchamento = document.getElementById('chk-insp-embuchamento');
    const chkRodagem = document.getElementById('chk-insp-rodagem');
    const txtNome = document.getElementById('txt-insp-nome');
    const txtObs = document.getElementById('txt-insp-obs');

    const payload = {
      torqueGramposOk: chkTorque ? chkTorque.checked : false,
      pinoCentroOk: chkPino ? chkPino.checked : false,
      embuchamentoOk: chkEmbuchamento ? chkEmbuchamento.checked : false,
      testeRodagemOk: chkRodagem ? chkRodagem.checked : false,
      inspetorNome: txtNome ? txtNome.value.trim() : 'Inspetor',
      observacoes: txtObs ? txtObs.value.trim() : ''
    };

    if (typeof torrar === 'function') torrar('Salvando checklist técnico...');
    try {
      const res = await fetch(`/api/patio/os/${encodeURIComponent(osId)}/inspecao-qualidade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao salvar checklist.');
        return;
      }

      if (data.inspecao && data.inspecao.aprovado) {
        if (typeof torrar === 'function') torrar('Inspeção APROVADA! Veículo liberado para entrega.');
      } else {
        if (typeof torrar === 'function') torrar('Atenção: Inspeção REPROVADA. Pendências apontadas.');
      }

      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao salvar checklist.');
    }
  }

  async function validarELiberarOS(osId) {
    if (typeof torrar === 'function') torrar('Validando checklist de qualidade...');
    try {
      const res = await fetch(`/api/patio/os/${encodeURIComponent(osId)}/validar-liberacao`);
      const data = await res.json();

      if (res.status === 412 || !data.liberado) {
        if (typeof torrar === 'function') torrar('⚠️ Bloqueio de Entrega: Checklist pré-entrega obrigatório não aprovado.');
        abrirModalInspecaoQualidade(osId);
        return false;
      }

      if (typeof torrar === 'function') torrar('✅ OS liberada para entrega com garantia técnica assegurada!');
      return true;
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao validar liberação da OS.');
      return false;
    }
  }

  function abrirModalRetrabalho(osId) {
    if (typeof S === 'undefined' || !S.os) return;
    const os = S.os.find(o => o.id === osId || String(o.num) === String(osId));
    if (!os) {
      if (typeof torrar === 'function') torrar('OS de origem não encontrada.');
      return;
    }
    const equipe = S.equipe || S.mecanicos || S.colaboradores || [];
    if (typeof abrirModalGenerico === 'function' && typeof modalAbrirRetrabalhoHtml === 'function') {
      abrirModalGenerico(modalAbrirRetrabalhoHtml(os, equipe));
    }
  }

  async function confirmarAbrirRetrabalho(osOrigemId) {
    const selMecanico = document.getElementById('sel-ret-mecanico');
    const selCausa = document.getElementById('sel-ret-causa');
    const numValor = document.getElementById('num-ret-valor');
    const numHoras = document.getElementById('num-ret-horas');
    const txtMotivo = document.getElementById('txt-ret-motivo');

    const payload = {
      osOrigemId,
      mecanicoOrigemId: selMecanico ? selMecanico.value : null,
      causaRaiz: selCausa ? selCausa.value : 'falha_execucao',
      valorMaoObraAfetada: numValor ? Number(numValor.value) : 0,
      horasRetrabalhoEstimadas: numHoras ? Number(numHoras.value) : 1,
      motivoRetrabalho: txtMotivo ? txtMotivo.value.trim() : 'Garantia de suspensão'
    };

    if (typeof torrar === 'function') torrar('Abrindo OS de Garantia/Retrabalho...');
    try {
      const res = await fetch('/api/patio/rework/abrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao abrir OS de garantia.');
        return;
      }

      if (typeof torrar === 'function') torrar(`OS de Garantia #${data.novaOS?.num || ''} criada sem custo ao cliente.`);
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao abrir garantia.');
    }
  }

  async function abrirModalLancarVale(mecanicoId) {
    const valStr = prompt('Informe o valor do adiantamento / vale (R$):', '100.00');
    if (!valStr) return;
    const valor = Number(valStr);
    if (isNaN(valor) || valor <= 0) {
      if (typeof torrar === 'function') torrar('Valor de vale inválido.');
      return;
    }
    const motivo = prompt('Informe o motivo do vale:', 'Adiantamento quinzenal') || 'Adiantamento';

    if (typeof torrar === 'function') torrar('Registrando vale...');
    try {
      const res = await fetch('/api/patio/comissoes/vales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mecanicoId, valor, motivo })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao registrar vale.');
        return;
      }
      if (typeof torrar === 'function') torrar('Vale registrado com sucesso!');
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao registrar vale.');
    }
  }

  async function abrirModalFolhaComissoes(mecanicoId, competencia) {
    const comp = competencia || new Date().toISOString().slice(0, 7);
    if (typeof torrar === 'function') torrar('Calculando prévia da folha...');

    try {
      const res = await fetch(`/api/patio/comissoes/folha/previa?mecanicoId=${encodeURIComponent(mecanicoId)}&competencia=${encodeURIComponent(comp)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao calcular prévia.');
        return;
      }

      if (typeof abrirModalGenerico === 'function' && typeof modalFechamentoFolhaComissoesHtml === 'function') {
        abrirModalGenerico(modalFechamentoFolhaComissoesHtml(data));
      }
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao calcular folha.');
    }
  }

  async function confirmarFecharFolha(mecanicoId, competencia) {
    if (typeof torrar === 'function') torrar('Fechando folha de comissões...');
    try {
      const res = await fetch('/api/patio/comissoes/folha/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mecanicoId, competencia })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao fechar folha.');
        return;
      }

      if (typeof torrar === 'function') torrar('Folha fechada com sucesso! Título a pagar gerado.');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao fechar folha.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const osId = btn.getAttribute('data-os-id') || btn.getAttribute('data-id');
      const mecanicoId = btn.getAttribute('data-mecanico-id') || btn.getAttribute('data-id');

      if (act === 'abrir-inspecao-qualidade' && osId) {
        abrirModalInspecaoQualidade(osId);
      } else if (act === 'validar-liberacao-qualidade' && osId) {
        validarELiberarOS(osId);
      } else if (act === 'abrir-garantia-retrabalho' && osId) {
        abrirModalRetrabalho(osId);
      } else if (act === 'lancar-vale-mecanico' && mecanicoId) {
        abrirModalLancarVale(mecanicoId);
      } else if (act === 'fechar-folha-mecanico' && mecanicoId) {
        abrirModalFolhaComissoes(mecanicoId);
      }
    });
  }

  root.abrirModalInspecaoQualidade = abrirModalInspecaoQualidade;
  root.confirmarInspecaoQualidade = confirmarInspecaoQualidade;
  root.validarELiberarOS = validarELiberarOS;
  root.abrirModalRetrabalho = abrirModalRetrabalho;
  root.confirmarAbrirRetrabalho = confirmarAbrirRetrabalho;
  root.abrirModalLancarVale = abrirModalLancarVale;
  root.abrirModalFolhaComissoes = abrirModalFolhaComissoes;
  root.confirmarFecharFolha = confirmarFecharFolha;

})(typeof window !== 'undefined' ? window : globalThis);
