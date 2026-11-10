// js/modules/patio_boxes_gargalos_actions.js
// Handlers e ações interativas de boxes pesados, alocação, transferência e gargalos

(function (root) {
  'use strict';

  function abrirModalAlocarBox(boxId, osIdAtual) {
    if (typeof S === 'undefined') return;
    const boxes = S.patioBoxes || [];
    const box = boxes.find(b => b.id === boxId) || { id: boxId };
    const osList = (S.os || []).filter(o => o.st !== 'finalizada' && o.st !== 'entregue' && !o.boxAtualId);

    if (typeof abrirModalGenerico === 'function' && typeof modalAlocarTransferirBoxHtml === 'function') {
      abrirModalGenerico(modalAlocarTransferirBoxHtml({ box, boxes, osList, osIdAtual }));
    }
  }

  async function alocarVeiculoBoxAction(boxId) {
    const selOS = document.getElementById('sel-os-alocar');
    const osId = selOS ? selOS.value : null;
    if (!osId) {
      if (typeof torrar === 'function') torrar('Selecione uma OS válida.');
      return;
    }

    if (typeof torrar === 'function') torrar('Alocando veículo no box...');
    try {
      const res = await fetch('/api/patio/boxes/alocar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId, osId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao alocar veículo no box.');
        return;
      }
      if (typeof torrar === 'function') torrar('Veículo alocado no box com sucesso!');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao alocar box.');
    }
  }

  async function transferirVeiculoBoxAction(osId) {
    const selBox = document.getElementById('sel-box-destino');
    const txtMotivo = document.getElementById('txt-motivo-transf');
    const boxDestinoId = selBox ? selBox.value : null;
    const motivo = txtMotivo ? txtMotivo.value.trim() : 'Transferência de box';

    if (!boxDestinoId) {
      if (typeof torrar === 'function') torrar('Selecione o box destino.');
      return;
    }

    if (typeof torrar === 'function') torrar('Transferindo veículo entre boxes...');
    try {
      const res = await fetch('/api/patio/boxes/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId, boxDestinoId, motivo })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao transferir veículo.');
        return;
      }
      if (typeof torrar === 'function') torrar('Veículo transferido de box com sucesso!');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao transferir box.');
    }
  }

  async function liberarBoxPatioAction(boxId) {
    const exigirQualidade = confirm('Deseja validar checklist técnico obrigatório pré-entrega antes de liberar o box?');
    if (typeof torrar === 'function') torrar('Liberando box...');

    try {
      const res = await fetch('/api/patio/boxes/liberar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId, exigirInspecaoQualidade: exigirQualidade })
      });
      const data = await res.json();
      if (res.status === 412 || !res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Checklist de qualidade obrigatório não realizado ou reprovado.');
        return;
      }
      if (typeof torrar === 'function') torrar(`Box liberado! Tempo ocupado: ${data.tempoOcupacaoMinutos || 0} min.`);
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao liberar box.');
    }
  }

  function abrirModalGargaloParada(osId, boxId) {
    if (typeof abrirModalGenerico === 'function' && typeof modalRegistrarGargaloParadaHtml === 'function') {
      abrirModalGenerico(modalRegistrarGargaloParadaHtml({ osId, boxId }));
    }
  }

  async function registrarGargaloParadaAction(osId, boxId) {
    const selMotivo = document.getElementById('sel-gargalo-motivo');
    const txtObs = document.getElementById('txt-gargalo-obs');
    const motivoParada = selMotivo ? selMotivo.value : 'outros';
    const observacao = txtObs ? txtObs.value.trim() : '';

    if (typeof torrar === 'function') torrar('Registrando parada / gargalo no box...');
    try {
      const res = await fetch('/api/patio/gargalos/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ osId, boxId, motivoParada, observacao })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao registrar gargalo.');
        return;
      }
      if (typeof torrar === 'function') torrar('Gargalo registrado. Box colocado em alerta de parada.');
      if (typeof fecharModalGenerico === 'function') fecharModalGenerico();
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao registrar gargalo.');
    }
  }

  async function encerrarGargaloParadaAction(gargaloId) {
    const resolucao = prompt('Informe a resolução do gargalo:', 'Peça entregue / aprovação liberada') || 'Gargalo resolvido';
    if (typeof torrar === 'function') torrar('Encerrando gargalo...');

    try {
      const res = await fetch(`/api/patio/gargalos/${encodeURIComponent(gargaloId)}/encerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolucao })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof torrar === 'function') torrar(data.error || 'Erro ao encerrar gargalo.');
        return;
      }
      if (typeof torrar === 'function') torrar('Gargalo encerrado! Box retomou status produtivo.');
      if (typeof carregarEstado === 'function') await carregarEstado();
      if (typeof render === 'function') render();
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de rede ao encerrar gargalo.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const boxId = btn.getAttribute('data-box-id');
      const osId = btn.getAttribute('data-os-id');
      const gargaloId = btn.getAttribute('data-gargalo-id');

      if (act === 'abrir-alocar-box' && boxId) {
        abrirModalAlocarBox(boxId);
      } else if (act === 'transferir-veiculo-box' && osId) {
        abrirModalAlocarBox(boxId, osId);
      } else if (act === 'liberar-box-patio' && boxId) {
        liberarBoxPatioAction(boxId);
      } else if (act === 'abrir-registrar-gargalo' && osId) {
        abrirModalGargaloParada(osId, boxId);
      } else if (act === 'encerrar-gargalo-patio' && gargaloId) {
        encerrarGargaloParadaAction(gargaloId);
      }
    });
  }

  root.abrirModalAlocarBox = abrirModalAlocarBox;
  root.alocarVeiculoBoxAction = alocarVeiculoBoxAction;
  root.transferirVeiculoBoxAction = transferirVeiculoBoxAction;
  root.liberarBoxPatioAction = liberarBoxPatioAction;
  root.abrirModalGargaloParada = abrirModalGargaloParada;
  root.registrarGargaloParadaAction = registrarGargaloParadaAction;
  root.encerrarGargaloParadaAction = encerrarGargaloParadaAction;

})(typeof window !== 'undefined' ? window : globalThis);

