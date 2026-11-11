// js/modules/patio_terminal_box_actions.js
// Ações Interativas e Listeners Delegados do Terminal Operacional de Box
// Teto Modular: <= 350 linhas

(function (root) {
  'use strict';

  function fecharModalBox() {
    if (typeof root.fecharModalGenerico === 'function') {
      root.fecharModalGenerico();
    }
  }

  async function carregarTerminalBoxAction(boxId, mecanicoId) {
    try {
      let url = '/api/patio/terminal-box/painel?';
      if (boxId) url += `boxId=${encodeURIComponent(boxId)}&`;
      if (mecanicoId) url += `mecanicoId=${encodeURIComponent(mecanicoId)}&`;

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar dados do terminal.');
      }

      if (typeof root.renderPainelTerminalBoxEDespachoHtml === 'function') {
        const container = document.getElementById('container-terminal-box');
        if (container) {
          container.innerHTML = root.renderPainelTerminalBoxEDespachoHtml(data.dados);
        }
      }
      return data.dados;
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao carregar terminal de box.');
      return null;
    }
  }

  function abrirModalEspecialidadeMecanico(dados = {}) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalConfigurarEspecialidadeMecanicoHtml === 'function') {
      root.abrirModalGenerico(root.modalConfigurarEspecialidadeMecanicoHtml(dados));
    }
  }

  async function salvarEspecialidadeMecanicoAction() {
    const elId = document.getElementById('mec-perfil-id');
    const elNome = document.getElementById('mec-perfil-nome');
    const elTurno = document.getElementById('mec-perfil-turno');
    const elAtivo = document.getElementById('mec-perfil-ativo');

    const mecanicoId = elId ? elId.value.trim() : '';
    if (!mecanicoId) {
      if (typeof root.torrar === 'function') root.torrar('ID do mecânico é obrigatório.');
      return;
    }

    const especialidades = {
      suspensao_pesada: Number(document.getElementById('esp-suspensao')?.value) || 0,
      freios_ar: Number(document.getElementById('esp-freios')?.value) || 0,
      alinhamento_laser: Number(document.getElementById('esp-alinhamento')?.value) || 0,
      motor_diesel: Number(document.getElementById('esp-motor')?.value) || 0
    };

    try {
      const res = await fetch(`/api/patio/mecanicos/${encodeURIComponent(mecanicoId)}/especialidades`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: elNome ? elNome.value.trim() : '',
          turno: elTurno ? elTurno.value : 'diurno',
          ativo: elAtivo ? elAtivo.checked : true,
          especialidades
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar perfil.');
      }

      fecharModalBox();
      if (typeof root.torrar === 'function') {
        root.torrar('Perfil técnico do mecânico atualizado com sucesso!');
      }
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao salvar perfil.');
    }
  }

  async function executarDespachoInteligenteAction(mecanicoId, boxId, osId, servicoId) {
    try {
      const res = await fetch('/api/patio/despacho-inteligente/alocar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osId,
          servicoId: servicoId || 'srv_auto',
          boxId,
          mecanicoIdEscolhido: mecanicoId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao alocar mecânico.');
      }

      if (typeof root.torrar === 'function') {
        root.torrar(`Mecânico despachado para o Box ${boxId || ''} com sucesso!`);
      }
      await carregarTerminalBoxAction(boxId, mecanicoId);
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha no despacho inteligente.');
    }
  }

  function abrirModalEvidenciaPecaCondenada(osId, boxId) {
    if (typeof root.abrirModalGenerico === 'function' && typeof root.modalRegistrarEvidenciaPecaCondenadaHtml === 'function') {
      root.abrirModalGenerico(root.modalRegistrarEvidenciaPecaCondenadaHtml({ osId, boxId }));
    }
  }

  async function confirmarEvidenciaPecaCondenadaAction() {
    const elOsId = document.getElementById('evidencia-os-id');
    const elBoxId = document.getElementById('evidencia-box-id');
    const elDesc = document.getElementById('evidencia-peca-desc');
    const elCod = document.getElementById('evidencia-peca-cod');
    const elQtd = document.getElementById('evidencia-peca-qtd');
    const elVlr = document.getElementById('evidencia-peca-vlr');
    const elMotivo = document.getElementById('evidencia-motivo-condenacao');
    const elFoto = document.getElementById('evidencia-foto-url');
    const elObs = document.getElementById('evidencia-obs');

    const osId = elOsId ? elOsId.value.trim() : '';
    const pecaDescricao = elDesc ? elDesc.value.trim() : '';

    if (!osId || !pecaDescricao) {
      if (typeof root.torrar === 'function') root.torrar('OS e Descrição da Peça são obrigatórios.');
      return;
    }

    try {
      const payload = {
        osId,
        boxId: elBoxId ? elBoxId.value.trim() : null,
        pecaDescricao,
        codigoFabricante: elCod ? elCod.value.trim() : '',
        quantidade: Number(elQtd ? elQtd.value : 1) || 1,
        valorUnitario: Number(elVlr ? elVlr.value : 0) || 0,
        motivoCondenacao: elMotivo ? elMotivo.value : 'desgaste_excessivo_desmontagem',
        fotos: elFoto && elFoto.value.trim() ? [elFoto.value.trim()] : [],
        observacao: elObs ? elObs.value.trim() : ''
      };

      const res = await fetch('/api/patio/terminal-box/evidencia-peca-condenada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao registrar condenação de peça.');
      }

      fecharModalBox();
      if (typeof root.torrar === 'function') {
        root.torrar('Peça condenada registrada! Box travado aguardando frotista.');
      }
      await carregarTerminalBoxAction(payload.boxId);
    } catch (err) {
      if (typeof root.torrar === 'function') root.torrar(err.message || 'Falha ao registrar evidência.');
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const boxId = btn.getAttribute('data-box-id');
      const osId = btn.getAttribute('data-os-id');
      const mecanicoId = btn.getAttribute('data-mecanico-id');
      const servicoId = btn.getAttribute('data-servico-id');

      if (act === 'atualizar-terminal-box') {
        carregarTerminalBoxAction(boxId, mecanicoId);
      } else if (act === 'abrir-modal-evidencia-peca-condenada') {
        abrirModalEvidenciaPecaCondenada(osId, boxId);
      } else if (act === 'confirmar-evidencia-peca-condenada') {
        confirmarEvidenciaPecaCondenadaAction();
      } else if (act === 'abrir-modal-especialidade-mecanico') {
        abrirModalEspecialidadeMecanico({ mecanicoId });
      } else if (act === 'salvar-especialidade-mecanico') {
        salvarEspecialidadeMecanicoAction();
      } else if (act === 'executar-despacho-inteligente') {
        executarDespachoInteligenteAction(mecanicoId, boxId, osId, servicoId);
      } else if (act === 'fechar-modal-box') {
        fecharModalBox();
      }
    });
  }

  root.fecharModalBox = fecharModalBox;
  root.carregarTerminalBoxAction = carregarTerminalBoxAction;
  root.abrirModalEspecialidadeMecanico = abrirModalEspecialidadeMecanico;
  root.salvarEspecialidadeMecanicoAction = salvarEspecialidadeMecanicoAction;
  root.executarDespachoInteligenteAction = executarDespachoInteligenteAction;
  root.abrirModalEvidenciaPecaCondenada = abrirModalEvidenciaPecaCondenada;
  root.confirmarEvidenciaPecaCondenadaAction = confirmarEvidenciaPecaCondenadaAction;

})(typeof window !== 'undefined' ? window : globalThis);
