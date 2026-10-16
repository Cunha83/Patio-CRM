const { getAiClient } = require('../lib/serverContext');

/**
 * Consulta Online de Dados do Veículo (APIBrasil / IA / Fallback)
 */
async function consultarDadosVeiculoOnline(placa, cfg = {}) {
  const placaLimpa = (placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!placaLimpa) {
    return {
      marca: 'Não Identificada',
      modelo: 'Caminhão',
      ano: '',
      cor: '',
      tipo: '',
      km: 0,
      origem: 'Placa Inválida'
    };
  }

  // Opção A: APIBrasil se credenciais estiverem preenchidas no .env ou no sistema
  const deviceToken = process.env.APIBRASIL_DEVICE_TOKEN || cfg?.apibrasil?.deviceToken;
  const bearerToken = process.env.APIBRASIL_BEARER_TOKEN || cfg?.apibrasil?.bearerToken;

  if (deviceToken && bearerToken) {
    try {
      console.log(`[Consulta Online] Consultando placa ${placaLimpa} na base nacional via APIBrasil...`);
      const resp = await fetch('https://gateway.apibrasil.io/api/v2/veiculos/dados', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DeviceToken': deviceToken,
          'Authorization': 'Bearer ' + bearerToken
        },
        body: JSON.stringify({ placa: placaLimpa }),
        signal: AbortSignal.timeout(8000)
      });
      const data = await resp.json();
      const veic = data?.data || data?.dados || data;
      if (veic && (veic.marca || veic.modelo)) {
        console.log(`[Consulta Online] Sucesso APIBrasil: ${veic.marca} ${veic.modelo} (${veic.ano || veic.anoModelo})`);
        return {
          marca: veic.marca || veic.brand || 'Caminhão',
          modelo: veic.modelo || veic.model || 'Linha Pesada',
          ano: String(veic.anoModelo || veic.ano || '2022'),
          cor: veic.cor || veic.color || 'Branco',
          tipo: veic.segmento || veic.tipo_veiculo || veic.tipo || 'Cavalo Mecânico',
          municipio: veic.municipio || veic.cidade || '',
          uf: veic.uf || '',
          chassi: veic.chassi || '',
          km: 0,
          origem: 'APIBrasil (Base Nacional Denatran)'
        };
      }
    } catch (e) {
      console.warn('[Consulta Online] Erro ao consultar APIBrasil:', e.message);
    }
  }

  // Opção B: Consulta Inteligente via IA Gemini se disponível
  const ai = getAiClient();
  if (ai) {
    try {
      const prompt = `Consulte ou identifique as informações veiculares correspondentes à placa automotiva brasileira "${placaLimpa}".
Se você identificar o veículo ou se for um caminhão/veículo pesado comercial brasileiro, retorne APENAS um JSON estrito:
{
  "marca": "Ex: Volvo / Scania / Mercedes-Benz / DAF / Iveco / Volkswagen",
  "modelo": "Ex: FH 540 Globetrotter / R 450 Highline / Actros 2651 / XF 480 / Constellation 24.280",
  "ano": "2022",
  "cor": "Branco",
  "tipo": "Cavalo Mecânico"
}
Retorne exclusivamente o JSON, sem markdown ou texto extra.`;

      const respAI = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      let txt = (respAI.text || '').trim();
      if (txt.startsWith('```')) txt = txt.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(txt);
      if (parsed && parsed.modelo) {
        return {
          marca: parsed.marca || 'Volvo',
          modelo: parsed.modelo || 'FH 540',
          ano: String(parsed.ano || '2022'),
          cor: parsed.cor || 'Branco',
          tipo: parsed.tipo || 'Cavalo Mecânico',
          km: 0,
          origem: 'Consulta Online IA'
        };
      }
    } catch (eAI) {
      console.warn('[Consulta Online] Falha na consulta IA:', eAI.message);
    }
  }

  // Opção C: Fallback para quando todas as consultas online falham
  return {
    marca: 'Não Identificada',
    modelo: 'Caminhão',
    ano: '',
    cor: '',
    tipo: '',
    km: 0,
    origem: 'Cadastro Pendente'
  };
}

module.exports = {
  consultarDadosVeiculoOnline
};
