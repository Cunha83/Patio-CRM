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

module.exports = router;
