'use strict';

/**
 * Pátio CRM — Fluxo Completo de Entrada de Veículo e Abertura de OS
 * Fachada Modular (< 60 linhas).
 *
 * Submódulos:
 * - services/vehicle/vehicleEntryResolver.js: Identificação de veículo, cliente e alocação de box
 * - services/vehicle/vehicleEntryOSBuilder.js: Triagem Pré-OS, construção da OS e resposta WhatsApp
 */

const { getOrLoadState } = require('../lib/serverContext');
const { resolverVeiculoECliente, resolverAlocacaoBox } = require('./vehicle/vehicleEntryResolver');
const { finalizarAberturaOS } = require('./vehicle/vehicleEntryOSBuilder');
const {
  resolverConjuntoArticulado,
  segregarItensPorVeiculo
} = require('./vehicle/vehicleArticulatedResolver');

async function processarEntradaVeiculo({
  placa,
  placaCarreta = null,
  placasImplementos = [],
  clienteNome,
  clienteFone,
  textoOriginal,
  servicos = [],
  req = null
}) {
  const targetState = await getOrLoadState(req);
  if (!targetState.os) targetState.os = [];
  if (!targetState.veiculos) targetState.veiculos = [];
  if (!targetState.clientes) targetState.clientes = [];
  if (!targetState.boxes) targetState.boxes = [];

  const { isSemPlaca, placaLimpa, veiculo, statusCadastro, clienteAssociado } = await resolverVeiculoECliente({
    placa,
    clienteNome,
    clienteFone,
    textoOriginal,
    targetState
  });

  const conjunto = resolverConjuntoArticulado({
    placaPrincipal: placaLimpa,
    placaCarreta,
    placasImplementos,
    textoOriginal,
    targetState,
    veiculoPrincipal: veiculo,
    clienteAssociado
  });

  const { boxLivre, boxIdAlocado, statusOS, textoAlocacao } = resolverAlocacaoBox({
    textoOriginal,
    targetState
  });

  return await finalizarAberturaOS({
    targetState,
    req,
    veiculo,
    isSemPlaca,
    placaLimpa,
    clienteNome,
    clienteFone,
    clienteAssociado,
    statusCadastro,
    boxLivre,
    boxIdAlocado,
    statusOS,
    textoAlocacao,
    servicos,
    textoOriginal,
    conjunto
  });
}

module.exports = {
  processarEntradaVeiculo,
  resolverConjuntoArticulado,
  segregarItensPorVeiculo
};
