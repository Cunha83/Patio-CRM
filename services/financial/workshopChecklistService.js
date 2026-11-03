/**
 * services/financial/workshopChecklistService.js
 * Vistoria técnica pesada e checklist de segurança de suspensão e freios.
 * Modularizado sob teto de 350 linhas conforme regras de engenharia.
 */

const ITENS_CHECKLIST_PADRAO = [
  { id: 'grampos_feixe_molas', nome: 'Torque/Reaperto de Grampos e Feixe de Molas', status: 'pendente' },
  { id: 'pino_centro_alinhamento', nome: 'Pino de Centro e Alinhamento de Eixo', status: 'pendente' },
  { id: 'embuchamento_balanca', nome: 'Folga de Embuchamento, Tensor e Balança', status: 'pendente' },
  { id: 'sistema_pneumatico_freio', nome: 'Estanqueidade Pneumática, Cuícas e Catracas de Freio', status: 'pendente' },
  { id: 'reaperto_final_rodas', nome: 'Reaperto Final e Conferência de Segurança', status: 'pendente' }
];

/**
 * 8.1.1 obterChecklistTecnicoOS
 * Retorna o checklist técnico da OS com laudo detalhado e inicialização padrão.
 */
function obterChecklistTecnicoOS(state = {}, osId) {
  const osNorm = String(osId || '').replace(/^#/, '').trim();
  if (!Array.isArray(state.os)) state.os = [];
  const o = state.os.find(x => String(x.id || '').replace(/^#/, '').trim() === osNorm || String(x.num || '').replace(/^#/, '').trim() === osNorm);
  if (!o) {
    const err = new Error(`Ordem de serviço #${osNorm} não encontrada.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'OS_NAO_ENCONTRADA';
    throw err;
  }

  const veiculos = Array.isArray(state.veiculos) ? state.veiculos : [];
  const v = veiculos.find(x => x && (x.id === o.vei || x.placa === o.placa)) || o.veiculo || {};
  const placa = o.placa || v.placa || 'SEM-PLACA';

  if (!o.checklistTecnico || !Array.isArray(o.checklistTecnico.itens)) {
    o.checklistTecnico = {
      status: o.statusChecklist || 'pendente',
      itens: ITENS_CHECKLIST_PADRAO.map(item => ({ ...item })),
      aprovadoPor: null,
      reprovadoPor: null,
      avaliadoEm: null,
      observacao: null
    };
  }

  const statusChecklist = o.statusChecklist || o.checklistTecnico.status || 'pendente';
  o.checklistTecnico.status = statusChecklist;
  o.statusChecklist = statusChecklist;

  const itens = o.checklistTecnico.itens;
  const aprovadoPor = o.checklistTecnico.aprovadoPor || null;
  const reprovadoPor = o.checklistTecnico.reprovadoPor || null;
  const avaliadoEm = o.checklistTecnico.avaliadoEm || null;
  const observacao = o.checklistTecnico.observacao || null;

  const statusIcone = statusChecklist === 'aprovado'
    ? '✅ *APROVADO*'
    : (statusChecklist === 'reprovado_critico' ? '❌ *REPROVADO CRÍTICO*' : '🟡 *PENDENTE DE VISTORIA*');

  const itensTexto = itens.map((it, idx) => {
    const stIcon = it.status === 'ok' ? '✅ OK' : (it.status === 'falha' ? '❌ FALHA' : '⏳ Pendente');
    return `${idx + 1}. [${stIcon}] ${it.nome}`;
  }).join('\n');

  const laudoTextoWhatsapp = `🛡️ *LAUDO DE VISTORIA TÉCNICA PESADA* 🔧\n\n` +
    `• *OS:* #${o.num || o.id || osNorm} | *Placa:* ${placa}\n` +
    `• *Status Geral:* ${statusIcone}\n` +
    `• *Avaliador:* ${aprovadoPor || reprovadoPor || 'Não avaliado'}\n` +
    `${avaliadoEm ? `• *Data/Hora:* ${avaliadoEm}\n` : ''}\n` +
    `📋 *Itens de Suspensão e Freios:*\n` +
    `${itensTexto}\n` +
    `${observacao ? `\n_Observações Técnicas:_ ${observacao}` : ''}\n\n` +
    `${statusChecklist === 'reprovado_critico' ? '⚠️ *ATENÇÃO:* Veículo retido com falha crítica de segurança. Conclusão bloqueada até reparação e reteste.' : (statusChecklist === 'aprovado' ? '🛡️ *Veículo liberado nos padrões técnicos de rodagem e segurança.*' : '⏳ Aguardando apontamento de vistoria.')}`;

  return {
    sucesso: true,
    ok: true,
    osId: o.id || osNorm,
    num: o.num || o.id || osNorm,
    placa,
    statusChecklist,
    itens,
    aprovadoPor,
    reprovadoPor,
    avaliadoEm,
    observacao,
    laudoTextoWhatsapp
  };
}

/**
 * 8.1.2 registrarChecklistTecnicoOS
 * Registra aprovação ou reprovação crítica do checklist técnico de segurança.
 */
function registrarChecklistTecnicoOS(state = {}, payload = {}) {
  const osIdRaw = payload.osId;
  if (!osIdRaw) {
    const err = new Error('Identificador da OS (osId) é obrigatório.');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'OS_ID_OBRIGATORIO';
    throw err;
  }

  const osNorm = String(osIdRaw).replace(/^#/, '').trim();
  if (!Array.isArray(state.os)) state.os = [];
  const osAlvo = state.os.find(o => String(o.id) === osNorm || String(o.num) === osNorm);
  if (!osAlvo) {
    const err = new Error(`Ordem de serviço #${osNorm} não encontrada.`);
    err.status = 404;
    err.statusCode = 404;
    err.code = 'OS_NAO_ENCONTRADA';
    throw err;
  }

  // Garante checklist inicializado
  obterChecklistTecnicoOS(state, osAlvo.id);

  const modo = String(payload.modo || '').toLowerCase().trim();
  const observacao = payload.observacao ? String(payload.observacao).trim() : null;
  const operador = payload.operador || 'operador';
  const operadorNome = (typeof operador === 'object' ? operador.nome || operador.actorId : operador) || 'Técnico Responsável';
  const agoraISO = payload.agora || new Date().toISOString();

  const isAprovar = modo === 'aprovar_todos' || modo === 'aprovar' || modo === 'ok' ||
    (Array.isArray(payload.itens) && payload.itens.length > 0 && payload.itens.every(i => i.status === 'ok'));

  const isReprovar = modo === 'reprovar' || modo === 'falha' || Boolean(payload.itemFalha) ||
    (Array.isArray(payload.itens) && payload.itens.some(i => i.status === 'falha'));

  if (!isAprovar && !isReprovar) {
    const err = new Error('Modo de vistoria inválido. Use "aprovar_todos" ou "reprovar".');
    err.status = 400;
    err.statusCode = 400;
    err.code = 'MODO_CHECKLIST_INVALIDO';
    throw err;
  }

  if (isAprovar) {
    osAlvo.checklistTecnico.itens.forEach(it => {
      it.status = 'ok';
    });
    osAlvo.checklistTecnico.status = 'aprovado';
    osAlvo.statusChecklist = 'aprovado';
    osAlvo.checklistTecnico.aprovadoPor = operadorNome;
    osAlvo.checklistTecnico.reprovadoPor = null;
    osAlvo.checklistTecnico.avaliadoEm = agoraISO;
    osAlvo.checklistTecnico.observacao = observacao || 'Todos os itens aprovados nos testes de rodagem e segurança.';

    if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
    osAlvo.historicoPatio.push({
      tipo: 'checklist_tecnico',
      status: 'aprovado',
      operador: operadorNome,
      data: agoraISO,
      observacao: osAlvo.checklistTecnico.observacao
    });
  } else {
    // Reprovação
    const itemFalhaRaw = String(payload.itemFalha || '').toLowerCase().trim();
    let falhaAplicada = false;

    if (Array.isArray(payload.itens)) {
      payload.itens.forEach(pItem => {
        const itemExistente = osAlvo.checklistTecnico.itens.find(it => it.id === pItem.id || it.nome.toLowerCase() === String(pItem.nome || '').toLowerCase());
        if (itemExistente) {
          itemExistente.status = pItem.status || 'falha';
          if (pItem.status === 'falha') falhaAplicada = true;
        }
      });
    }

    if (!falhaAplicada && itemFalhaRaw) {
      const itemExistente = osAlvo.checklistTecnico.itens.find(it =>
        it.id.toLowerCase() === itemFalhaRaw ||
        it.nome.toLowerCase().includes(itemFalhaRaw) ||
        itemFalhaRaw.includes(it.id.toLowerCase())
      );
      if (itemExistente) {
        itemExistente.status = 'falha';
        falhaAplicada = true;
      }
    }

    if (!falhaAplicada) {
      const defaultFalha = osAlvo.checklistTecnico.itens.find(it => it.id === 'sistema_pneumatico_freio') || osAlvo.checklistTecnico.itens[0];
      if (defaultFalha) defaultFalha.status = 'falha';
    }

    osAlvo.checklistTecnico.status = 'reprovado_critico';
    osAlvo.statusChecklist = 'reprovado_critico';
    osAlvo.checklistTecnico.aprovadoPor = null;
    osAlvo.checklistTecnico.reprovadoPor = operadorNome;
    osAlvo.checklistTecnico.avaliadoEm = agoraISO;
    osAlvo.checklistTecnico.observacao = observacao || (payload.itemFalha ? `Falha crítica detectada: ${payload.itemFalha}` : 'Falha crítica detectada na vistoria técnica');

    if (!Array.isArray(osAlvo.historicoPatio)) osAlvo.historicoPatio = [];
    osAlvo.historicoPatio.push({
      tipo: 'checklist_tecnico',
      status: 'reprovado_critico',
      operador: operadorNome,
      data: agoraISO,
      observacao: osAlvo.checklistTecnico.observacao
    });
  }

  return obterChecklistTecnicoOS(state, osAlvo.id);
}

module.exports = {
  ITENS_CHECKLIST_PADRAO,
  obterChecklistTecnicoOS,
  registrarChecklistTecnicoOS
};
