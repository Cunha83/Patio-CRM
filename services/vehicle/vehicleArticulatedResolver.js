'use strict';

/**
 * Pátio CRM — Resolução e Segregação de Conjuntos Articulados (Cavalo + Carreta)
 * Submódulo de Linha Pesada (< 200 linhas).
 */

const { gerarId } = require('../../lib/serverContext');

function normalizarPlaca(p) {
  if (!p || typeof p !== 'string') return '';
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extrai placa de implemento/carreta a partir de texto livre
 */
function extrairPlacaImplementoTexto(textoOriginal = '', placaPrincipal = '') {
  if (!textoOriginal || typeof textoOriginal !== 'string') return null;
  const principalLimpa = normalizarPlaca(placaPrincipal);

  // Regex para placas no padrão Brasil antigo (ABC-1234) ou Mercosul (ABC1D23)
  const regexPlacas = /\b([A-Z]{3}[- ]?[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}[- ]?[0-9]{4})\b/gi;
  const matches = [...textoOriginal.matchAll(regexPlacas)].map(m => normalizarPlaca(m[0]));

  for (const m of matches) {
    if (m && m !== principalLimpa) {
      // Se tiver termo indicativo nas proximidades ou for a 2ª placa do texto
      const regexContexto = new RegExp(`(?:carreta|semirreboque|reboque|bitrem|engatad[oa]|implemento)[^A-Z0-9]*${m}|${m}[^A-Z0-9]*(?:carreta|semirreboque|reboque)`, 'i');
      if (regexContexto.test(textoOriginal) || matches.length >= 2) {
        return m;
      }
    }
  }

  // Busca explícita "carreta: XYZ1234" ou "carreta XYZ1234"
  const matchExplicito = textoOriginal.match(/(?:carreta|semirreboque|reboque)\s*(?:nº|de\s+placa|placa|:)?\s*([A-Z0-9-]{7,8})/i);
  if (matchExplicito && matchExplicito[1]) {
    const candidata = normalizarPlaca(matchExplicito[1]);
    if (candidata && candidata !== principalLimpa) return candidata;
  }

  return null;
}

/**
 * Resolve e cadastra o conjunto articulado no estado do tenant
 */
function resolverConjuntoArticulado({
  placaPrincipal,
  placaCarreta = null,
  placasImplementos = [],
  textoOriginal = '',
  targetState,
  veiculoPrincipal,
  clienteAssociado
}) {
  const implementosPlacas = [];

  if (placaCarreta) {
    const cLimpa = normalizarPlaca(placaCarreta);
    if (cLimpa) implementosPlacas.push(cLimpa);
  }

  if (Array.isArray(placasImplementos)) {
    placasImplementos.forEach(p => {
      const cLimpa = normalizarPlaca(p);
      if (cLimpa && !implementosPlacas.includes(cLimpa)) {
        implementosPlacas.push(cLimpa);
      }
    });
  }

  // Tenta extrair do texto livre caso não informado em parâmetro
  if (implementosPlacas.length === 0 && textoOriginal) {
    const extraida = extrairPlacaImplementoTexto(textoOriginal, placaPrincipal);
    if (extraida && !implementosPlacas.includes(extraida)) {
      implementosPlacas.push(extraida);
    }
  }

  if (implementosPlacas.length === 0) {
    return {
      isArticulado: false,
      tipoConjunto: 'simples',
      cavalo: {
        id: veiculoPrincipal?.id || null,
        placa: veiculoPrincipal?.placa || normalizarPlaca(placaPrincipal),
        modelo: veiculoPrincipal?.modelo || 'Caminhão',
        marca: veiculoPrincipal?.marca || ''
      },
      implementos: []
    };
  }

  const implementosResolvidos = [];
  const cliId = clienteAssociado?.id || veiculoPrincipal?.cli || null;

  for (const placaImp of implementosPlacas) {
    let vImp = targetState.veiculos.find(v => normalizarPlaca(v.placa) === placaImp);
    if (!vImp) {
      vImp = {
        id: gerarId('v'),
        cli: cliId,
        placa: placaImp,
        marca: 'Implemento Rodoviário',
        modelo: 'Semirreboque / Carreta',
        ano: String(new Date().getFullYear()),
        cor: 'Não informada',
        tipo: 'Carreta',
        eixos: 3,
        km: 0,
        pendenciaCadastral: false,
        pendencias: [],
        criadoEm: Date.now()
      };
      targetState.veiculos.push(vImp);
    } else if (cliId && !vImp.cli) {
      vImp.cli = cliId;
    }

    implementosResolvidos.push({
      id: vImp.id,
      placa: vImp.placa,
      tipo: vImp.tipo || 'Carreta',
      modelo: vImp.modelo || 'Semirreboque',
      eixos: vImp.eixos || 3
    });
  }

  return {
    isArticulado: true,
    tipoConjunto: implementosResolvidos.length > 1 ? 'bitrem_rodotrem' : 'cavalo_carreta',
    cavalo: {
      id: veiculoPrincipal?.id || null,
      placa: veiculoPrincipal?.placa || normalizarPlaca(placaPrincipal),
      modelo: veiculoPrincipal?.modelo || 'Cavalo Mecânico',
      marca: veiculoPrincipal?.marca || ''
    },
    implementos: implementosResolvidos
  };
}

/**
 * Segrega itens e valores de uma OS entre Cavalo e Implementos
 */
function segregarItensPorVeiculo(os = {}) {
  const placaCavalo = os.conjunto?.cavalo?.placa || os.placa || '';
  const conjunto = os.conjunto || { isArticulado: false, implementos: [] };

  const resultado = {
    cavalo: {
      placa: placaCavalo,
      servicos: [],
      pecas: [],
      total: 0
    },
    implementos: {},
    totalGeral: 0
  };

  (conjunto.implementos || []).forEach(imp => {
    resultado.implementos[imp.placa] = {
      placa: imp.placa,
      tipo: imp.tipo || 'Carreta',
      servicos: [],
      pecas: [],
      total: 0
    };
  });

  const classificarAlvo = (item) => {
    if (item.placaAlvo && resultado.implementos[item.placaAlvo]) {
      return resultado.implementos[item.placaAlvo];
    }
    if (item.alvo === 'carreta' || item.alvo === 'implemento') {
      const primeiroImp = Object.values(resultado.implementos)[0];
      if (primeiroImp) return primeiroImp;
    }
    return resultado.cavalo;
  };

  (os.servicos || []).forEach(srv => {
    const destino = classificarAlvo(srv);
    const vlr = (Number(srv.qtd) || 1) * (Number(srv.valor || srv.preco) || 0);
    destino.servicos.push(srv);
    destino.total = Math.round((destino.total + vlr) * 100) / 100;
    resultado.totalGeral = Math.round((resultado.totalGeral + vlr) * 100) / 100;
  });

  (os.pecas || []).forEach(peca => {
    const destino = classificarAlvo(peca);
    const vlr = (Number(peca.qtd) || 1) * (Number(peca.valor || peca.preco) || 0);
    destino.pecas.push(peca);
    destino.total = Math.round((destino.total + vlr) * 100) / 100;
    resultado.totalGeral = Math.round((resultado.totalGeral + vlr) * 100) / 100;
  });

  return resultado;
}

module.exports = {
  normalizarPlaca,
  extrairPlacaImplementoTexto,
  resolverConjuntoArticulado,
  segregarItensPorVeiculo
};

