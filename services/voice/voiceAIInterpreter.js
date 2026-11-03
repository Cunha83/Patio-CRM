'use strict';

const { safeJsonParse } = require('./voiceSecurity');
const { interpretarPorRegras } = require('./voiceRulesInterpreter');

function construirPromptIA(contextoInfo, catalogoServicos = [], catalogoPecas = []) {
  return `Você é o Motor de Inteligência Operacional do Pátio CRM (gestão para oficinas mecânicas pesadas diesel e leves).
Sua missão é interpretar a fala natural de mecânicos, gerentes de pátio e proprietários da oficina (que muitas vezes falam informalmente, com gírias e as mãos na graxa) e transformá-la em uma AÇÃO ESTRUTURADA DE NEGÓCIO.

CONTEXTO ATUAL DO OPERADOR:
${JSON.stringify(contextoInfo, null, 2)}

CATÁLOGO RESUMIDO DE SERVIÇOS DA OFICINA:
${JSON.stringify(catalogoServicos.slice(0, 15), null, 2)}

CATÁLOGO RESUMIDO DE PEÇAS:
${JSON.stringify(catalogoPecas.slice(0, 15), null, 2)}

REGRAS CRÍTICAS DE NEGÓCIO DA OFICINA:
1. RECLAMAÇÃO/SINTOMA DO CLIENTE vs DIAGNÓSTICO/SERVIÇO COBRADO:
   - Toda queixa ou relato de defeito ("barulho na roda", "volante vibrando", "não gela", "pedal baixo", "fumaça preta", "motor engasgando") DEVE ser gravado no array "os.reclamacoes".
   - NUNCA transforme um relato de problema em serviço ou peça faturada antes do orçamento! Isso é um sintoma do cliente, não um serviço aprovado.
   - Só coloque itens em "itens_solicitados.servicos" ou "itens_solicitados.pecas" se o operador ordenar explicitamente a execução de um trabalho ou uso de peça (ex: "adicione o serviço de troca de óleo", "coloque 2 filtros racor").
2. CONTEXTO E CONTINUIDADE:
   - Se o operador disser "coloca também que...", "adiciona...", "mais uma coisa: o ar não gela", associe isso imediatamente à OS ativa indicada no contexto ("activeOsId"), sem exigir que ele repita a placa ou o cliente.
   - Se o operador disser "não, a quilometragem é 128 mil, não 120", interprete como intencao="corrigir_campo" com campo="km" e valor=128000.
3. CONVERSÃO DE UNIDADES E NÚMEROS:
   - "82 mil" = 82000; "128 mil" = 128000; "duzentos e cinquenta mil" = 250000.
4. CLASSIFICAÇÃO DE RISCO:
   - baixo: abrir_os, adicionar_reclamacao, corrigir_campo, consultar_status, mover_box livre.
   - medio: box já ocupado (conflito de espaço), múltiplos clientes homônimos.
   - alto: excluir_os, cancelar_os, faturar_os/fechar caixa (exige confirmação do operador).
5. RESPOSTA FALADA (HUMANA E CURTA):
   - Gere uma resposta concisa, educada e direta em português brasileiro (1 a 2 frases no máximo), ideal para ser falada via sintetizador de áudio para o mecânico que está com as mãos ocupadas. Ex: "Certo! Abri a OS #1049 para o Onix branco do Carlos com 82 mil km e anotei as queixas do freio e da vibração."

RETORNE APENAS UM JSON VÁLIDO SEGUINDO ESTE ESQUEMA:
{
  "intencao": "abrir_os" | "adicionar_reclamacao" | "corrigir_campo" | "adicionar_itens" | "mover_box" | "consultar_status" | "excluir_os" | "faturar_os" | "consultar_financeiro" | "consultar_estoque" | "ajuda_sistema_treinamento" | "duvida_geral" | "confirmar_acao" | "cancelar_acao_pendente",
  "risco": "baixo" | "medio" | "alto",
  "motivo_risco": "string explicativa se medio ou alto",
  "cliente": {
    "nome": "Nome do cliente",
    "fone": "telefone se houver"
  },
  "veiculo": {
    "marca": "ex: Chevrolet, Scania, Volvo, etc.",
    "modelo": "ex: Onix, FH 540, etc.",
    "ano": "YYYY",
    "cor": "ex: Branco",
    "placa": "ABC1234 ou null",
    "km": 82000,
    "tipo": "Passeio" | "Cavalo Mecânico" | "Truck" | "Picape" | "VUC"
  },
  "os": {
    "id_alvo": "id se referenciou uma OS específica ou null",
    "num": null,
    "box": null,
    "km": 82000,
    "reclamacoes": ["Sintoma 1", "Sintoma 2"]
  },
  "correcoes": [
    { "campo": "km" | "placa" | "cor" | "modelo" | "cliente", "valor": "novo valor" }
  ],
  "itens_solicitados": {
    "servicos": [ { "nome": "nome", "qtd": 1, "valor": 0 } ],
    "pecas": [ { "nome": "nome", "qtd": 1, "valor": 0 } ]
  },
  "resposta_falada": "Mensagem curta, humana e natural para confirmação ao operador."
}`;
}

/**
 * Interpretação Multimodal: Texto ou Áudio via Gemini AI (com fallback por regras)
 */
async function interpretarComando({ input, context = {}, state = {}, aiClient = null }) {
  const rawInput = typeof input === 'string' ? { text: input } : (input || {});
  const { text, audioBase64, mimeType } = rawInput;

  // Se Gemini AI disponível e configurado
  if (aiClient && (text || audioBase64)) {
    try {
      const contextoInfo = {
        canal: context.canal || 'web',
        activeOsId: context.activeOsId || null,
        activeVehicleId: context.activeVehicleId || null,
        activeClientId: context.activeClientId || null,
        remetente: context.remetente || 'Operador',
        isSenderAdmin: !!context.isSenderAdmin,
        isContextOperacao: !!context.isContextOperacao
      };

      const catalogoServicos = (state.servicos || []).map(s => ({ id: s.id, nome: s.nome, valor: s.valor }));
      const catalogoPecas = (state.pecas || []).map(p => ({ id: p.id, nome: p.nome, venda: p.venda }));

      const systemPrompt = construirPromptIA(contextoInfo, catalogoServicos, catalogoPecas);

      const parts = [];
      if (audioBase64) {
        let cleanBase64 = audioBase64;
        let cleanMime = mimeType || 'audio/webm';
        const m = audioBase64.match(/^data:(.+);base64,(.+)$/);
        if (m) {
          cleanMime = m[1].split(';')[0];
          cleanBase64 = m[2];
        }
        parts.push({ inlineData: { mimeType: cleanMime, data: cleanBase64 } });
        parts.push({ text: `Interprete o áudio falado pelo operador no contexto da oficina mecânica e retorne o JSON estrito.` });
      } else {
        parts.push({ text: `Comando falado ou digitado pelo operador: "${text}"\nInterprete e retorne o JSON estrito.` });
      }

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              ...parts
            ]
          }
        ]
      });

      const parsed = safeJsonParse(response.text);
      if (parsed && parsed.intencao) {
        return parsed;
      }
    } catch (err) {
      console.warn('[VoiceActionEngine] Erro ao consultar Gemini AI, acionando fallback por regras:', err.message);
    }
  }

  // Fallback por regras heurísticas caso o Gemini não esteja configurado ou ocorra falha de rede/cota
  if (audioBase64 && !text) {
    return {
      intencao: 'falha_transcricao_audio',
      risco: 'baixo',
      resposta_falada: '🎙️ *Áudio recebido no Pátio CRM!*\n\nNão foi possível transcrever a gravação de voz no momento. Por favor, envie o comando em texto (ex: *Abrir OS placa ABC1234*) ou envie a foto da placa do caminhão.'
    };
  }

  return interpretarPorRegras(text || '', context, state);
}

module.exports = {
  construirPromptIA,
  interpretarComando
};

