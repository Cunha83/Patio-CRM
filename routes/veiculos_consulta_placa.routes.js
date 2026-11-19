'use strict';

/**
 * PÁTIO CRM — ROTA DE CONSULTA DE PLACA VIA API REAL
 * Integração com provedor homologado ou fallback orientativo transparente (Zero Mocks).
 * Arquitetura Modular (< 350 linhas).
 */

const express = require('express');
const router = express.Router();
const { getOrLoadState, extractTenantId } = require('../lib/serverContext');

router.post('/api/veiculos/consultar-placa', async (req, res) => {
  try {
    const { placa } = req.body || {};
    const limpa = String(placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!limpa || limpa.length < 7) {
      return res.status(400).json({
        success: false,
        disponivel: false,
        erro: 'Placa inválida. Forneça uma placa completa (Mercosul ou padrão antigo).'
      });
    }

    const state = await getOrLoadState(req);
    const cfg = (state && state.cfg) || {};
    const cred = cfg.apibrasil || (cfg.integracoes && cfg.integracoes.apibrasil) || {};
    const token = cred.bearerToken || cred.token || process.env.API_PLACA_TOKEN;
    const deviceToken = cred.deviceToken || process.env.API_PLACA_DEVICE_TOKEN;

    // Se nenhuma credencial configurada, retorna indisponibilidade explícita sem mock
    if (!token && !deviceToken) {
      return res.status(200).json({
        success: false,
        disponivel: false,
        codigo: 'TOKEN_NAO_CONFIGURADO',
        erro: 'Consulta de placa indisponível ou token de API não configurado em Configurações > Integrações. Preencha os dados do veículo manualmente.'
      });
    }

    // Consulta real ao gateway configurado
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (deviceToken) headers['DeviceToken'] = deviceToken;

    const response = await fetch('https://gateway.apibrasil.io/api/v2/veiculos/consultar', {
      method: 'POST',
      headers,
      body: JSON.stringify({ placa: limpa })
    });

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        disponivel: false,
        erro: `Falha na consulta externa da placa (${response.status}). Preencha os dados manualmente.`
      });
    }

    const data = await response.json();
    if (data && data.error === false && data.data) {
      const v = data.data;
      return res.status(200).json({
        success: true,
        disponivel: true,
        dados: {
          placa: limpa,
          marca: v.marca || '',
          modelo: v.modelo || '',
          ano: v.ano || v.anoModelo || '',
          cor: v.cor || '',
          chassi: v.chassi || '',
          tipo: v.tipo || v.especie || 'Cavalo Mecânico'
        }
      });
    }

    return res.status(200).json({
      success: false,
      disponivel: false,
      erro: data.message || 'Veículo não localizado na base nacional. Preencha manualmente.'
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      disponivel: false,
      erro: 'Consulta de placa indisponível ou token de API não configurado em Configurações > Integrações. Preencha os dados do veículo manualmente.'
    });
  }
});

module.exports = router;
