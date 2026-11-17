/**
 * Módulo: fiscal_xml_distribuicao_ui.js
 * Pátio-CRM — Interface da Aba "XMLs Recebidos (Contra CNPJ)" no Módulo Fiscal SPA
 * Arquitetura Modular (< 200 linhas).
 */

(function (global) {
  'use strict';

  async function sincronizarXmlsSefazFrontend() {
    try {
      torrar('Conectando à SEFAZ Nacional para consultar notas contra o CNPJ da empresa...', 'neutro');
      const r = await fetch('/api/fiscal/nfe/buscar-xml-destinatario', {
        method: 'POST',
        headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' }
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        torrar(data.error || 'Erro ao sincronizar XMLs na SEFAZ.', 'erro');
        return;
      }
      if (typeof carregarEstado === 'function') await carregarEstado();
      torrar(`Sincronização concluída! ${data.novosCapturados || 0} novo(s) XML(s) localizado(s).`, 'sucesso');
      render();
    } catch (err) {
      torrar('Falha de rede ao sincronizar com a SEFAZ.', 'erro');
    }
  }

  async function importarXmlDiretoFrontend(chave) {
    try {
      torrar('Importando XML para Almoxarifado (recalculando CMP) e gerando Contas a Pagar...', 'neutro');
      const r = await fetch('/api/fiscal/nfe/importar-xml', {
        method: 'POST',
        headers: typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave })
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        torrar(data.error || 'Erro ao importar XML para estoque/financeiro.', 'erro');
        return;
      }
      if (typeof carregarEstado === 'function') await carregarEstado();
      torrar(`NF-e importada! ${data.itensImportados || 0} peças com CMP recalculado e Contas a Pagar gerada.`, 'sucesso');
      render();
    } catch (err) {
      torrar('Falha de rede ao importar XML.', 'erro');
    }
  }

  function viewFiscalXmlDistribuicao() {
    const cfg = (S.config && S.config.empresa) || S.emitente || S.cfg || {};
    const cnpj = (cfg.cnpj || cfg.doc || cfg.documento || '').replace(/\D/g, '');
    const xmls = S.fiscalXmlsRecebidos || [];

    return `
    <div style="background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">XMLs Recebidos (Manifestação / Distribuição DF-e)</h3>
          <div style="font-size:12.5px;color:#64748b">
            CNPJ Ativo da Oficina: <strong style="color:${cnpj ? '#0f766e' : '#dc2626'};font-family:var(--mono)">${cnpj || 'Não configurado (configure em Emitente/Parâmetros)'}</strong>
          </div>
        </div>
        <div>
          <button class="btn btn-primario" onclick="sincronizarXmlsSefazFrontend()" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">
            ${ico('check', 14)} Sincronizar XMLs na SEFAZ
          </button>
        </div>
      </div>
    </div>

    ${!cnpj ? `
      <div class="card card-p" style="border-left:4px solid #ef4444;background:#fef2f2;color:#991b1b;margin-bottom:14px">
        <strong style="display:block;margin-bottom:4px">⚠️ CNPJ da Empresa Não Configurado</strong>
        <span>Para buscar notas emitidas contra sua oficina, informe o CNPJ na aba <b>"CONFIGURAÇÕES SEFAZ / Emitente e parâmetros"</b>.</span>
      </div>
    ` : ''}

    <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div class="tabela-responsiva">
        <table class="tabela-densa">
          <thead>
            <tr>
              <th style="width:130px">NF-e / Série</th>
              <th>Fornecedor / Emitente</th>
              <th style="width:180px">Chave de Acesso</th>
              <th style="width:110px">Emissão</th>
              <th style="width:120px;text-align:right">Total (R$)</th>
              <th style="width:120px;text-align:center">Situação</th>
              <th style="width:230px;text-align:center">Ação</th>
            </tr>
          </thead>
          <tbody>
            ${xmls.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align:center;padding:36px;color:var(--aco-500)">
                  Nenhum XML de NF-e capturado ainda. Clique em <b>"Sincronizar XMLs na SEFAZ"</b> para buscar as notas emitidas contra o CNPJ da sua oficina.
                </td>
              </tr>
            ` : xmls.map(x => `
              <tr>
                <td style="font-weight:700">#${esc(x.numero)} <span style="font-weight:400;color:#64748b">(${esc(x.serie)})</span></td>
                <td>
                  <div style="font-weight:600">${esc(x.fornecedorNome)}</div>
                  <div class="mini" style="color:#64748b">CNPJ: ${esc(x.fornecedorCnpj)} · ${esc(x.fornecedorUf || 'BR')}</div>
                </td>
                <td style="font-family:var(--mono);font-size:11px" title="${esc(x.chave)}">
                  ${esc(x.chave.slice(0, 6))}...${esc(x.chave.slice(-8))}
                </td>
                <td>${esc(x.emissao || '-')}</td>
                <td style="text-align:right;font-weight:700" class="num">${brl(x.valorTotal)}</td>
                <td style="text-align:center">
                  <span class="selo ${x.importado ? 'selo-finalizada' : 'selo-peca'}">
                    ${x.importado ? '✓ Importado' : '● Disponível'}
                  </span>
                </td>
                <td style="text-align:center">
                  ${x.importado ? `
                    <span style="font-size:11.5px;color:#059669;font-weight:600">✓ Integrado no Almoxarifado</span>
                  ` : `
                    <button class="btn btn-secundario btn-pequeno" onclick="importarXmlDiretoFrontend('${esc(x.chave)}')" style="font-weight:700">
                      Importar XML para Estoque & Financeiro
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  const exportsFiscalXml = {
    sincronizarXmlsSefazFrontend,
    importarXmlDiretoFrontend,
    viewFiscalXmlDistribuicao
  };

  Object.assign(global, exportsFiscalXml);
  if (typeof window !== 'undefined') Object.assign(window, exportsFiscalXml);
})(typeof window !== 'undefined' ? window : globalThis);
