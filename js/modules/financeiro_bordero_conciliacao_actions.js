// js/modules/financeiro_bordero_conciliacao_actions.js
// Ações e orquestração de conciliação de borderôs B2B e governança de crédito

(function (root) {
  'use strict';

  function encontrarBordero(borderoId) {
    if (typeof S === 'undefined') return null;
    const borderos = [
      ...(Array.isArray(S.borderosFrotistas) ? S.borderosFrotistas : []),
      ...(Array.isArray(S.borderos) ? S.borderos : [])
    ];
    return borderos.find(b => b.id === borderoId || b.num === borderoId) || null;
  }

  function encontrarCliente(clienteId) {
    if (typeof S === 'undefined' || !Array.isArray(S.clientes)) return { id: clienteId, nome: clienteId };
    return S.clientes.find(c => c.id === clienteId) || { id: clienteId, nome: clienteId };
  }

  function abrirModalLiquidarBordero(borderoId) {
    const bordero = encontrarBordero(borderoId);
    if (!bordero) {
      if (typeof torrar === 'function') torrar('Borderô não encontrado.');
      return;
    }
    const contas = Array.isArray(S?.contas) ? S.contas.filter(c => c.borderoId === bordero.id) : [];

    if (typeof abrirModalGenerico === 'function' && typeof modalLiquidarBorderoB2BHtml === 'function') {
      abrirModalGenerico(modalLiquidarBorderoB2BHtml(bordero, contas));
    }
  }

  async function liquidarBorderoAction(borderoId) {
    const inValor = document.getElementById('txt-liq-valor');
    const inForma = document.getElementById('sel-liq-forma');
    const inData = document.getElementById('txt-liq-data');
    const inObs = document.getElementById('txt-liq-obs');

    const valorRecebido = Number(inValor?.value || 0);
    const formaPagamento = inForma?.value || 'ted';
    const dataLiquidacao = inData?.value || new Date().toISOString();
    const observacoes = inObs?.value?.trim() || '';

    if (valorRecebido <= 0) {
      if (typeof torrar === 'function') torrar('Informe um valor recebido válido para liquidação.');
      return;
    }

    if (typeof torrar === 'function') torrar('Processando liquidação em cascata do borderô...');

    try {
      const res = await fetch(`/api/financeiro/borderos/${encodeURIComponent(borderoId)}/liquidar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorRecebido, formaPagamento, dataLiquidacao, observacoes })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao liquidar borderô.');
        return;
      }

      if (typeof torrar === 'function') torrar('Borderô liquidado com sucesso! OSs baixadas e comissões liberadas.');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao liquidar borderô.');
    }
  }

  async function estornarLiquidacaoBorderoAction(borderoId) {
    const motivo = prompt('Informe a justificativa do estorno:', 'Estorno por cancelamento de TED') || '';
    if (!motivo) return;

    if (typeof torrar === 'function') torrar('Processando estorno da liquidação...');

    try {
      const res = await fetch(`/api/financeiro/borderos/${encodeURIComponent(borderoId)}/estornar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao estornar liquidação.');
        return;
      }

      if (typeof torrar === 'function') torrar('Liquidação estornada com sucesso. OSs retornadas para pendente.');
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao estornar borderô.');
    }
  }

  async function abrirModalPoliticaCredito(clienteId) {
    const cliente = encontrarCliente(clienteId);
    let risco = {};

    try {
      const resRisco = await fetch(`/api/financeiro/credito-frotistas/${encodeURIComponent(clienteId)}/risco`);
      if (resRisco.ok) {
        const dataRisco = await resRisco.json();
        risco = dataRisco.avaliacao || {};
      }
    } catch (e) {
      // Ignora erro de rede na pré-consulta
    }

    const politica = S?.creditPolicies?.[clienteId] || cliente?.politicaCredito || {
      limiteCredito: 0,
      diasToleranciaAtraso: 5,
      bloqueioAutomatico: true
    };

    if (typeof abrirModalGenerico === 'function' && typeof modalPoliticaCreditoFrotistaHtml === 'function') {
      abrirModalGenerico(modalPoliticaCreditoFrotistaHtml(cliente, politica, risco));
    }
  }

  async function salvarPoliticaCreditoAction(clienteId) {
    const inLimite = document.getElementById('txt-pol-limite');
    const inTolerancia = document.getElementById('txt-pol-tolerancia');
    const inBloqueio = document.getElementById('chk-pol-bloqueio');

    const limiteCredito = Number(inLimite?.value || 0);
    const diasToleranciaAtraso = Number(inTolerancia?.value || 5);
    const bloqueioAutomatico = inBloqueio ? inBloqueio.checked : true;

    if (typeof torrar === 'function') torrar('Salvando política de crédito frotista...');

    try {
      const res = await fetch(`/api/financeiro/credito-frotistas/${encodeURIComponent(clienteId)}/politica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limiteCredito, diasToleranciaAtraso, bloqueioAutomatico })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao salvar política de crédito.');
        return;
      }

      if (typeof torrar === 'function') torrar('Política de crédito atualizada com sucesso!');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao salvar política de crédito.');
    }
  }

  async function confirmarOverrideCreditoAction(clienteId) {
    const inValor = document.getElementById('txt-ovr-valor');
    const inUsuario = document.getElementById('txt-ovr-usuario');
    const inMotivo = document.getElementById('txt-ovr-motivo');

    const valorNovoServico = Number(inValor?.value || 0);
    const usuarioLiberacao = inUsuario?.value?.trim() || '';
    const motivoLiberacao = inMotivo?.value?.trim() || '';

    if (!usuarioLiberacao || !motivoLiberacao) {
      if (typeof torrar === 'function') torrar('Preencha o usuário e o motivo para registrar o override gerencial.');
      return;
    }

    if (typeof torrar === 'function') torrar('Aplicando override de crédito gerencial...');

    try {
      const res = await fetch(`/api/financeiro/credito-frotistas/${encodeURIComponent(clienteId)}/validar-trava`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valorNovoServico,
          permitirOverride: true,
          usuarioLiberacao,
          motivoLiberacao
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao aplicar override gerencial.');
        return;
      }

      if (typeof torrar === 'function') torrar('Override gerencial concedido e auditado! Nova OS autorizada.');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao aplicar override.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const borderoId = btn.getAttribute('data-bordero-id');
      const clienteId = btn.getAttribute('data-cliente-id');

      if (act === 'abrir-modal-liquidar-bordero' && borderoId) {
        abrirModalLiquidarBordero(borderoId);
      } else if (act === 'confirmar-liquidacao-bordero' && borderoId) {
        liquidarBorderoAction(borderoId);
      } else if (act === 'estornar-liquidacao-bordero' && borderoId) {
        estornarLiquidacaoBorderoAction(borderoId);
      } else if (act === 'abrir-modal-politica-credito' && clienteId) {
        abrirModalPoliticaCredito(clienteId);
      } else if (act === 'salvar-politica-credito' && clienteId) {
        salvarPoliticaCreditoAction(clienteId);
      } else if (act === 'confirmar-override-credito' && clienteId) {
        confirmarOverrideCreditoAction(clienteId);
      } else if (act === 'fechar-modal-generico') {
        if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      }
    });
  }

  root.abrirModalLiquidarBordero = abrirModalLiquidarBordero;
  root.liquidarBorderoAction = liquidarBorderoAction;
  root.estornarLiquidacaoBorderoAction = estornarLiquidacaoBorderoAction;
  root.abrirModalPoliticaCredito = abrirModalPoliticaCredito;
  root.salvarPoliticaCreditoAction = salvarPoliticaCreditoAction;
  root.confirmarOverrideCreditoAction = confirmarOverrideCreditoAction;

})(typeof window !== 'undefined' ? window : globalThis);

