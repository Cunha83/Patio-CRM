const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrLoadState,
  salvarEstado,
  mutateTenantState,
  extractTenantId,
  requirePermission,
  getAiClient,
  safeJsonParse
} = require('../lib/serverContext');
const voiceActionEngine = require('../services/voiceActionEngine');
const preOSEngine = require('../services/preOSEngine');
const {
  validarTokenAcao,
  consumirTokenAcao,
  reservarTokenAcao
} = require('../lib/tokens/securityToken');
const {
  filterStateByRole,
  PersistenceError
} = require('../lib/repository/stateRepository');

const limiterUploads = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: 'Limite de uploads temporariamente excedido.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/api/upload-nota', async (req, res) => {
  try {
    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ error: 'Nenhuma imagem recebida.' });
    const ai = getAiClient();
    if (!ai) return res.status(500).json({ error: 'Google Gen AI não configurado no servidor.' });

    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `Extraia os dados desta Nota Fiscal ou recibo de autopeças/serviços.
Retorne APENAS um JSON estrito no seguinte formato:
{
  "fornecedor": "Nome da Empresa Emissora",
  "numero_nf": "Número da NF ou Danfe",
  "data_emissao": "YYYY-MM-DD",
  "valor_total": 0.00,
  "itens": [
    {
      "nome": "Nome da Peça ou Serviço",
      "quantidade": 1,
      "valor_unitario": 0.00,
      "valor_total": 0.00
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ]
        }
      ]
    });

    const dadosNF = safeJsonParse(response.text);
    if (!dadosNF || !dadosNF.itens || !Array.isArray(dadosNF.itens)) {
      return res.status(422).json({ error: 'Não foi possível extrair os itens da nota fiscal com clareza.' });
    }

    let finalState = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      if (!draft.pecas) draft.pecas = [];
      for (const item of dadosNF.itens) {
        const existing = draft.pecas.find(p => p.nome.toLowerCase() === item.nome.toLowerCase());
        if (existing) {
          existing.qtd = (existing.qtd || 0) + (Number(item.quantidade) || 1);
          existing.custo = Number(item.valor_unitario) || existing.custo;
        } else {
          draft.pecas.push({
            id: 'p_' + Date.now() + Math.floor(Math.random() * 1000),
            cod: 'NF-' + Math.floor(Math.random() * 900 + 100),
            nome: item.nome,
            un: 'un',
            qtd: Number(item.quantidade) || 1,
            min: 1,
            custo: Number(item.valor_unitario) || 0,
            venda: (Number(item.valor_unitario) || 0) * 1.5,
            loc: 'Pátio',
            forn: dadosNF.fornecedor || ''
          });
        }
      }
      finalState = draft;
      return draft;
    });

    if (!mutateRes.ok) {
      return res.status(mutateRes.status || 500).json({ success: false, error: mutateRes.error || 'Falha ao persistir dados da nota fiscal.' });
    }

    res.json({
      success: true,
      message: 'Nota fiscal lida com sucesso via IA!',
      dadosProcessados: dadosNF,
      newState: finalState
    });
  } catch (err) {
    console.error('[API /api/upload-nota] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Integração IA: Ditado de Áudio para Abertura de OS ───── */
router.post('/api/processar-audio-os', async (req, res) => {
  try {
    const { audioBase64, catalogoServicos, catalogoPecas } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'Nenhum áudio recebido.' });
    const ai = getAiClient();
    if (!ai) return res.status(500).json({ error: 'Google Gen AI não configurado.' });

    const matches = audioBase64.match(/^data:(.+);base64,(.+)$/);
    let mimeType = 'audio/webm';
    let base64Data = audioBase64;
    if (matches && matches.length === 3) {
      mimeType = matches[1].split(';')[0];
      base64Data = matches[2];
    }

    const prompt = `Você é um assistente de oficina mecânica diesel pesada.
O mecânico ditou um áudio com serviços e peças de uma ordem de serviço.
Catálogo de serviços: ${JSON.stringify(catalogoServicos || [])}
Catálogo de peças: ${JSON.stringify(catalogoPecas || [])}
Retorne APENAS um JSON estrito:
{
  "servicos_identificados": [
    { "id_catalogo": "id ou null", "nome": "nome do serviço", "qtd": 1, "valor": 0.00 }
  ],
  "pecas_identificadas": [
    { "id_catalogo": "id ou null", "nome": "nome da peça", "qtd": 1, "valor": 0.00 }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ]
    });

    const dados = safeJsonParse(response.text);
    if (!dados || typeof dados !== 'object') {
      return res.status(422).json({ error: 'Não foi possível extrair os serviços e peças do áudio informado.' });
    }
    res.json({ success: true, dadosProcessados: dados });
  } catch (err) {
    console.error('[API /api/processar-audio-os] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Camada Inteligente de Entrada e Operação por Voz ──────── */
router.post('/api/comando-voz', async (req, res) => {
  let tokenReservado = null;
  try {
    const texto = req.body?.texto || req.body?.text;
    const { audioBase64, mimeType, context, token: directToken } = req.body || {};
    if (!texto && !audioBase64) {
      return res.status(400).json({ error: 'Nenhum texto ou áudio fornecido para interpretação.' });
    }

    const secCtx = req.securityContext || {};
    const tenantId = extractTenantId(req);
    const actorId = secCtx.actorId || 'operador';
    const role = secCtx.role || 'mecanico';
    const permissions = Array.isArray(secCtx.permissions) ? [...secCtx.permissions] : [];
    const isSenderAdmin = permissions.includes('*') || ['admin', 'tenant_admin', 'platform_admin'].includes(role);

    // Aceitar do cliente apenas campos contextuais não-privilegiados permitidos
    const clientCtx = (context && typeof context === 'object') ? context : {};
    const tokenInformado = (typeof directToken === 'string' && directToken) ||
                           (typeof clientCtx.confirmToken === 'string' && clientCtx.confirmToken) ||
                           (typeof clientCtx.token === 'string' && clientCtx.token) || null;

    const safeContext = {
      canal: typeof clientCtx.canal === 'string' ? clientCtx.canal.slice(0, 32) : 'web',
      activeOsId: typeof clientCtx.activeOsId === 'string' ? clientCtx.activeOsId.slice(0, 64) : (typeof clientCtx.activeOsId === 'number' ? clientCtx.activeOsId : null),
      activeBoxId: typeof clientCtx.activeBoxId === 'string' ? clientCtx.activeBoxId.slice(0, 32) : null,
      activeQuotationId: typeof clientCtx.activeQuotationId === 'string' ? clientCtx.activeQuotationId.slice(0, 64) : null,
      activeServiceId: typeof clientCtx.activeServiceId === 'string' ? clientCtx.activeServiceId.slice(0, 64) : null,
      origem: typeof clientCtx.origem === 'string' ? clientCtx.origem.slice(0, 32) : 'web',
      confirmToken: tokenInformado,
      autoConsumirToken: false,
      // Segurança inegociável derivada exclusivamente do req.securityContext
      tenantId,
      actorId,
      role,
      permissions,
      isSenderAdmin
    };

    let fullState = await getOrLoadState(req);
    // Projeta o estado estritamente de acordo com o papel do usuário autenticado
    const projectedState = filterStateByRole(fullState, safeContext);

    // 1. Interpretação FORA da fila de escrita (sem segurar mutex durante IA ou fallback)
    const interpretado = await voiceActionEngine.interpretarComando({
      input: { text: texto, audioBase64, mimeType },
      context: safeContext,
      state: projectedState,
      aiClient: getAiClient()
    });

    const acoesApenasLeitura = [
      'consultar_status', 'duvida_geral', 'ajuda_sistema_treinamento',
      'consultar_financeiro', 'consultar_estoque', 'consultar_estoque_peca',
      'consultar_fornecedor_peca', 'consultar_equipe_livre', 'consultar_mecanico_trabalho',
      'consultar_box_mecanico', 'consultar_tempo_os', 'consultar_mecanico_mais_produtivo',
      'consultar_retrabalho', 'consultar_custo_mao_obra_os', 'consultar_custo_real_os',
      'consultar_gargalo_operacao', 'consultar_entregas_risco', 'consultar_alertas_operacao',
      'consultar_resumo_operacional', 'consultar_orcamento', 'consultar_desconto_seguro',
      'consultar_sugestao_preco', 'consultar_margem_orcamento', 'consultar_servicos_pouca_margem',
      'consultar_servico_mais_retrabalho', 'consultar_custo_medio_servico', 'consultar_adequacao_preco_servico',
      'consultar_preventiva_frota', 'consultar_frota_cliente', 'consultar_contatos_crm',
      'consultar_manutencao_veiculo', 'consultar_pos_venda',
      'consultar_previsao_caixa', 'consultar_auditoria_financeira'
    ];

    const intencaoOuAcao = interpretado?.intencao || interpretado?.acao;
    const isLeitura = acoesApenasLeitura.includes(intencaoOuAcao) || interpretado?.negado;

    // Se for ação apenas de leitura ou negada, executa sobre o snapshot de leitura e retorna
    if (isLeitura) {
      const resultadoExec = await voiceActionEngine.executarAcao({
        interpretado,
        input: { text: texto, audioBase64, mimeType },
        context: safeContext,
        state: projectedState
      });
      return res.json({
        success: resultadoExec.ok !== false,
        ...resultadoExec,
        interpretado,
        novoEstado: null
      });
    }

    // Se a intenção for confirmação de ação, resolve e reserva o token contra concorrência
    if (intencaoOuAcao === 'confirmar_acao') {
      const tokenParaConfirmar = voiceActionEngine.buscarTokenPendente({
        canal: safeContext.canal,
        remetente: actorId,
        token: tokenInformado
      });

      if (!tokenParaConfirmar) {
        return res.status(400).json({
          success: false,
          ok: false,
          error: 'Não há token de confirmação informado para a ação.'
        });
      }

      // Reserva atômica de concorrência antes de entrar na fila de escrita
      const reserva = reservarTokenAcao(tokenParaConfirmar, { tenantId, actorId });
      if (!reserva.ok) {
        return res.status(reserva.concorrencia ? 409 : 400).json({
          success: false,
          ok: false,
          error: reserva.error || 'Token de confirmação inválido ou expirado.'
        });
      }
      tokenReservado = tokenParaConfirmar;
      safeContext.confirmToken = tokenParaConfirmar;
    }

    // 2. Ação de mutação de dados: aplica as alterações atomicamente dentro de mutateTenantState
    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      const resultadoExec = await voiceActionEngine.executarAcao({
        interpretado,
        input: { text: texto, audioBase64, mimeType },
        context: { ...safeContext, autoConsumirToken: false },
        state: draft
      });
      resultadoFinal = {
        ...resultadoExec,
        interpretado
      };

      if (resultadoExec.ok === false || resultadoExec.negado) {
        return { abort: true, status: 400, error: resultadoExec.resposta || 'Comando de voz rejeitado.' };
      }

      if (resultadoExec.pendenteConfirmacao) {
        // Ação de alto risco que gerou token de confirmação pendente em memória — não persiste agora
        return { abort: true, status: 200, pendente: true };
      }

      return draft;
    });

    if (mutateRes.aborted && mutateRes.mutatorResult?.pendente) {
      return res.json({
        success: true,
        ...resultadoFinal,
        novoEstado: null
      });
    }

    if (!mutateRes.ok) {
      if (tokenReservado) {
        voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
        tokenReservado = null;
      }
      return res.status(mutateRes.status || 400).json({
        success: false,
        error: mutateRes.error || 'Falha ao processar comando de voz.'
      });
    }

    // Gravação no banco teve SUCESSO DURÁVEL: agora sim consumimos o token definitivamente
    if (tokenReservado) {
      voiceActionEngine.consumirAcaoPendente(tokenReservado, { tenantId, actorId });
      tokenReservado = null;
    }

    return res.json({
      success: resultadoFinal?.ok !== false,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (tokenReservado) {
      voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
      tokenReservado = null;
    }
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/comando-voz] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/comando-voz/confirmar', async (req, res) => {
  let tokenReservado = null;
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token de confirmação não fornecido.' });

    const secCtx = req.securityContext || {};
    const tenantId = extractTenantId(req);
    const actorId = secCtx.actorId || 'operador';
    const role = secCtx.role || 'mecanico';
    const permissions = Array.isArray(secCtx.permissions) ? [...secCtx.permissions] : [];
    const isSenderAdmin = permissions.includes('*') || ['admin', 'tenant_admin', 'platform_admin'].includes(role);

    // Reserva atômica de concorrência antes de entrar na fila de escrita
    const reserva = reservarTokenAcao(token, { tenantId, actorId });
    if (!reserva.ok) {
      return res.status(reserva.concorrencia ? 409 : 400).json({
        success: false,
        ok: false,
        resposta: reserva.error,
        error: reserva.error || 'Token de confirmação inválido ou expirado.'
      });
    }
    tokenReservado = token;

    const safeContext = {
      confirmToken: token,
      confirmadoPeloUsuario: true,
      autoConsumirToken: false,
      tenantId,
      actorId,
      role,
      permissions,
      isSenderAdmin
    };

    let resultadoFinal = null;
    const mutateRes = await mutateTenantState(req, async (draft) => {
      const resultado = await voiceActionEngine.interpretarEExecutar({
        input: { text: 'confirmar' },
        context: { ...safeContext, autoConsumirToken: false },
        state: draft,
        aiClient: getAiClient()
      });
      resultadoFinal = resultado;
      if (!resultado.ok) {
        return { abort: true, status: 400, error: resultado.resposta || 'Falha ao confirmar ação de voz.' };
      }
      return draft;
    });

    if (!mutateRes.ok) {
      if (tokenReservado) {
        voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
        tokenReservado = null;
      }
      return res.status(mutateRes.status || 400).json({
        success: false,
        ok: false,
        resposta: mutateRes.error || 'Falha ao confirmar ação de voz.',
        error: mutateRes.error || 'Falha ao confirmar ação de voz.'
      });
    }

    // Token é consumido SOMENTE após a gravação atômica durável com sucesso no SQLite
    voiceActionEngine.consumirAcaoPendente(token, { tenantId, actorId });
    tokenReservado = null;

    res.json({
      success: resultadoFinal?.ok !== false,
      ...resultadoFinal,
      novoEstado: { versao: mutateRes.versao }
    });
  } catch (err) {
    if (tokenReservado) {
      voiceActionEngine.abortarConfirmacaoAcao(tokenReservado);
      tokenReservado = null;
    }
    if (err instanceof PersistenceError || err.name === 'PersistenceError') {
      return res.status(err.status || 409).json({
        success: false,
        ok: false,
        error: err.message,
        conflict: err.conflict,
        versao: err.versao
      });
    }
    console.error('[API /api/comando-voz/confirmar] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Conciliação de Veículos e Anexo de Foto de OS ─────────── */

module.exports = router;
