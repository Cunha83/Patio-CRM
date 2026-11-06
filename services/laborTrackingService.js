'use strict';

const laborWorkers = require('./labor/laborWorkers');
const laborTrackingCore = require('./labor/laborTrackingCore');
const laborTrackingLifecycle = require('./labor/laborTrackingLifecycle');

module.exports = {
  // Helpers e Gestão de Colaboradores
  gerarId: laborWorkers.gerarId,
  arredondar: laborWorkers.arredondar,
  registrarAuditoria: laborWorkers.registrarAuditoria,
  garantirColecoesLabor: laborWorkers.garantirColecoesLabor,
  cadastrarColaborador: laborWorkers.cadastrarColaborador,
  listarColaboradores: laborWorkers.listarColaboradores,
  obterColaborador: laborWorkers.obterColaborador,
  atualizarColaborador: laborWorkers.atualizarColaborador,

  // Início, Pausa e Retomada de Apontamento
  iniciarApontamento: laborTrackingCore.iniciarApontamento,
  pausarApontamento: laborTrackingCore.pausarApontamento,
  retomarApontamento: laborTrackingCore.retomarApontamento,

  // Encerramento, Ajuste e Consulta
  encerrarApontamento: laborTrackingLifecycle.encerrarApontamento,
  ajustarApontamentoManual: laborTrackingLifecycle.ajustarApontamentoManual,
  listarApontamentos: laborTrackingLifecycle.listarApontamentos
};
