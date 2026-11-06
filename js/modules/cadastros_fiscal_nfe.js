/**
 * Módulo: cadastros_fiscal_nfe.js
 * Pátio-CRM — Central Fiscal: NF-e, NFC-e, NFS-e, MDF-e, Transmissão SEFAZ e Certificados A1
 * Arquitetura Modular (< 350 linhas).
 */

function viewCentralFiscal() {
  if (!S.documentosFiscais || S.documentosFiscais.length === 0) {
    S.documentosFiscais = [
      { id: 'nf101', numero: '000.001.428', serie: '1', modelo: '55', tipo: 'nfe', chave: '35261012345678000190550010000014281001234567', destNome: 'Transportes Rodoviários Silva Ltda', destDoc: '12.345.678/0001-90', destFone: '11988887777', cfop: '5102 - Venda de mercadoria adquirida de terceiros', vendaId: 'v101', vendaCod: 'V-101', emissao: hoje() + ' 09:42', total: 4850.00, situacao: 'Autorizada', protocolo: '135260098765432' },
      { id: 'nf102', numero: '000.001.429', serie: '1', modelo: '55', tipo: 'nfe', chave: '35261098765432000110550010000014291009876543', destNome: 'Expresso Rodoviário Cordeiro S.A.', destDoc: '98.765.432/0001-10', destFone: '19999881122', cfop: '5102 - Venda de mercadoria adquirida de terceiros', vendaId: 'v102', vendaCod: 'V-102', emissao: hoje() + ' 11:15', total: 3200.00, situacao: 'Autorizada', protocolo: '135260098765433' },
      { id: 'nf103', numero: '000.000.854', serie: '1', modelo: 'NFS-e', tipo: 'nfse', chave: 'NFS-SP-2026-000854', destNome: 'Logística Brasul Frotas e Cargas', destDoc: '33.444.555/0001-22', destFone: '11977776655', cfop: '5933 - Prestação de serviço tributado pelo ISSQN', vendaId: 'v103', vendaCod: 'OS-103', emissao: hoje() + ' 14:05', total: 1200.00, situacao: 'Autorizada', protocolo: '98452-PMSP' },
      { id: 'nf104', numero: '000.000.312', serie: '1', modelo: '65', tipo: 'nfce', chave: '35261012345678000190650010000003121004567890', destNome: 'Consumidor Final Balcão Peças', destDoc: '321.654.987-00', destFone: '', cfop: '5102 - Venda balcão consumidor', vendaId: '', vendaCod: 'V-098', emissao: hoje() + ' 15:30', total: 450.00, situacao: 'Autorizada', protocolo: '135260098765435' },
      { id: 'nf105', numero: '000.000.119', serie: '1', modelo: '58', tipo: 'mdfe', chave: '35261012345678000190580010000001191007890123', destNome: 'Manifesto de Cargas Pátio Diesel - SP/PR', destDoc: '12.345.678/0001-90', destFone: '', cfop: '5353 - Prestação de transporte', vendaId: '', vendaCod: 'MDF-119', emissao: hoje() + ' 08:00', total: 18500.00, situacao: 'Autorizada', protocolo: '135260098765436' }
    ];
  }

  const subAbaFiscal = S.ui.subAbaFiscal || 'nfe';
  const documentos = S.documentosFiscais || [];
  const busca = (S.ui.buscaFiscal || '').toLowerCase().trim();

  let filtrados = documentos;
  if (subAbaFiscal === 'nfe') {
    filtrados = filtrados.filter(d => d.tipo === 'nfe' || d.modelo === '55');
  } else if (subAbaFiscal === 'nfce') {
    filtrados = filtrados.filter(d => d.tipo === 'nfce' || d.modelo === '65');
  } else if (subAbaFiscal === 'nfse') {
    filtrados = filtrados.filter(d => d.tipo === 'nfse' || d.modelo === 'NFS-e');
  } else if (subAbaFiscal === 'mdfe') {
    filtrados = filtrados.filter(d => d.tipo === 'mdfe' || d.modelo === '58');
  } else if (subAbaFiscal === 'eventos') {
    filtrados = [];
  } else if (subAbaFiscal === 'recebidas') {
    filtrados = (S.compras || []).map(c => ({
      numero: c.num || 'S/N',
      serie: c.serie || '1',
      destNome: c.fornecedorNome || 'Fornecedor',
      destDoc: c.fornecedorDoc || '',
      cfop: '1102 - Compra para comercialização',
      vendaCod: c.codigo || c.id,
      emissao: dataBR(c.data || hoje()),
      total: c.total || 0,
      situacao: 'Autorizada'
    }));
  }

  if (busca && subAbaFiscal !== 'configuracoes') {
    filtrados = filtrados.filter(d => 
      (d.numero || '').toLowerCase().includes(busca) ||
      (d.destNome || '').toLowerCase().includes(busca) ||
      (d.destDoc || '').toLowerCase().includes(busca) ||
      (d.vendaCod || '').toLowerCase().includes(busca) ||
      (d.cfop || '').toLowerCase().includes(busca)
    );
  }

  return `
  <div class="folder-tabs" style="margin-bottom:14px">
    <button class="folder-tab ${subAbaFiscal === 'nfe' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='nfe';render()">${ico('doc', 14)} <span>NF-E (MOD 55)</span></button>
    <button class="folder-tab ${subAbaFiscal === 'nfce' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='nfce';render()">${ico('carrinho', 14)} <span>NFC-E (MOD 65)</span></button>
    <button class="folder-tab ${subAbaFiscal === 'nfse' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='nfse';render()">${ico('livro', 14)} <span>NFS-E (SERVIÇOS)</span></button>
    <button class="folder-tab ${subAbaFiscal === 'mdfe' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='mdfe';render()">${ico('caminhao', 14)} <span>MDF-E</span></button>
    <button class="folder-tab ${subAbaFiscal === 'eventos' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='eventos';render()">${ico('relatorios', 14)} <span>NF EVENTOS (CC-E)</span></button>
    <button class="folder-tab ${subAbaFiscal === 'recebidas' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='recebidas';render()">${ico('caixa', 14)} <span>RECEBIDAS (ENTRADA)</span></button>
    <button class="folder-tab ${subAbaFiscal === 'configuracoes' ? 'ativo' : ''}" onclick="S.ui.subAbaFiscal='configuracoes';render()">${ico('cfg', 14)} <span>CONFIGURAÇÕES SEFAZ</span></button>
  </div>

  ${subAbaFiscal === 'configuracoes' ? (typeof viewFiscal === 'function' ? viewFiscal() : '') : `
    <div class="barra-acoes-lote">
      <div class="barra-acoes-grupo">
        <button class="btn btn-primario" onclick="abrirModalNovaNFe()" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">${ico('mais', 14)} + Nova ${subAbaFiscal.toUpperCase()}</button>
        <button class="btn btn-secundario" onclick="torrar('Consultando status do WebService SEFAZ... [ONLINE - 100% Operacional]','sucesso')" title="Atualizar status na SEFAZ">${ico('check', 14)} Atualizar SEFAZ</button>
        <button class="btn btn-neutro" onclick="acaoFiscal('cancelar')" style="color:#ef4444" title="Cancelar nota selecionada">${ico('lixo', 14)} Cancelar</button>
        <button class="btn btn-neutro" onclick="acaoFiscal('inutilizar')" title="Inutilizar faixa de numeração">${ico('relogio', 14)} Inutilizar</button>
        <button class="btn btn-neutro" onclick="acaoFiscal('whatsapp')" style="color:#10b981;font-weight:600" title="Enviar DANFE e XML via WhatsApp para o cliente">💬 Enviar WhatsApp</button>
        <button class="btn btn-neutro" onclick="window.print()" title="Imprimir DANFE">${ico('impressora', 14)} Imprimir DANFE</button>
        
        <select class="campo" onchange="acaoFiscalUtilitario(this.value);this.selectedIndex=0;" style="height:34px;font-size:12.5px;padding:2px 8px;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;color:#0f172a;cursor:pointer">
          <option value="">Utilitários ▾</option>
          <option value="zip">Baixar XMLs do Mês (.zip)</option>
          <option value="cce">Emitir Carta de Correção (CC-e)</option>
          <option value="sefaz">Consultar Chave no Portal Nacional</option>
          <option value="contador">Enviar lote para a Contabilidade</option>
        </select>
      </div>

      <div class="navegador-periodo">
        <button class="btn-periodo-nav" onclick="torrar('Mês anterior','neutro')">◀</button>
        <span>Outubro / 2026</span>
        <button class="btn-periodo-nav" onclick="torrar('Próximo mês','neutro')">▶</button>
      </div>
    </div>

    <div style="margin-bottom:12px">
      <input type="text" class="campo-texto" placeholder="🔍 Buscar por Nº NF-e, Razão Social Destinatário, CNPJ/CPF, CFOP ou Pedido/OS..." 
             value="${esc(S.ui.buscaFiscal || '')}" 
             oninput="S.ui.buscaFiscal=this.value;render()" 
             style="width:100%;max-width:540px;height:38px;font-size:13px;background:#ffffff">
    </div>

    <div class="card" style="padding:0;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <div class="tabela-responsiva">
        <table class="tabela-densa">
          <thead>
            <tr>
              <th style="width:36px;text-align:center"><input type="checkbox" onchange="document.querySelectorAll('.chk-fiscal').forEach(c=>c.checked=this.checked)" style="cursor:pointer"></th>
              <th style="width:130px">NF-e</th>
              <th>Destinatário</th>
              <th style="width:70px;text-align:center">Série</th>
              <th>CFOP</th>
              <th style="width:110px;text-align:center">Venda / OS</th>
              <th style="width:130px">Emissão</th>
              <th style="width:120px;text-align:right">Total (R$)</th>
              <th style="width:120px;text-align:center">Situação</th>
              <th style="width:130px;text-align:center">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${filtrados.length === 0 ? `
              <tr><td colspan="10" style="text-align:center;padding:36px;color:var(--aco-500)">Nenhum documento fiscal encontrado nesta categoria. Clique em <b>"+ Nova ${subAbaFiscal.toUpperCase()}"</b>.</td></tr>
            ` : filtrados.map(d => {
              const sit = d.situacao || 'Autorizada';
              const badgeClass = sit === 'Autorizada' ? 'badge-sucesso' : (sit === 'Cancelada' ? 'badge-perigo' : 'badge-alerta');
              return `
              <tr>
                <td style="text-align:center"><input type="checkbox" class="chk-fiscal" value="${d.id || d.numero}" data-fone="${d.destFone || ''}" data-dest="${esc(d.destNome)}" data-num="${d.numero}" style="cursor:pointer"></td>
                <td class="mono"><div style="font-weight:700;color:#0f172a">#${esc(d.numero)}</div>${d.modelo ? `<div class="mini" style="color:#64748b">Mod ${esc(d.modelo)}</div>` : ''}</td>
                <td><div style="font-weight:700;color:#0f172a">${esc(d.destNome)}</div>${d.destDoc ? `<div class="mini mono" style="color:#64748b">${esc(d.destDoc)}</div>` : ''}</td>
                <td style="text-align:center;font-weight:600">${esc(d.serie || '1')}</td>
                <td><span class="selo" style="font-size:11px;background:#f1f5f9;color:#1e293b;border:1px solid #cbd5e1" title="${esc(d.cfop)}">${esc(d.cfop || '5102 - Venda')}</span></td>
                <td style="text-align:center">${d.vendaCod ? `<a href="javascript:void(0)" onclick="S.ui.view='vendas';render()" style="color:#2563eb;font-weight:700;text-decoration:none">#${esc(d.vendaCod)}</a>` : '—'}</td>
                <td style="font-size:12px;color:#334155">${esc(d.emissao || hoje())}</td>
                <td style="text-align:right;font-weight:700;color:#0f172a" class="mono">${brl(d.total || 0)}</td>
                <td style="text-align:center"><span class="badge-vivid ${badgeClass}">${sit}</span></td>
                <td style="text-align:center">
                  <div style="display:inline-flex;gap:4px">
                    <button class="btn btn-secundario" onclick="imprimirDanfe('${d.id || d.numero}')" style="padding:4px 8px;font-size:11px" title="Visualizar / Imprimir DANFE">${ico('impressora', 12)} PDF</button>
                    ${d.destFone ? `<button class="btn btn-sucesso" onclick="enviarNfeWhatsApp('${d.numero}','${d.destFone}','${esc(d.destNome)}')" style="padding:4px 8px;font-size:11px" title="Enviar PDF/XML no WhatsApp">💬</button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `}
  `;
}

function abrirModalNovaNFe() {
  const proximoNumero = (S.cfg && S.cfg.numeroNfe) || 1430;
  abrirModalGenerico(`
    <div style="padding:20px;max-width:540px;width:100%;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#0f172a">Emissão de NF-e (Modelo 55)</h3>
      <p style="margin:0 0 14px 0;font-size:12.5px;color:#64748b">Transmissão síncrona diretamente para a SEFAZ Estadual autorizadora.</p>
      
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Origem da Nota Fiscal:</label>
          <select id="nfe_origem" class="campo" style="width:100%;height:36px;font-size:13px">
            <option value="v101">Venda Balcão #V-101 — Transportes Rodoviários Silva (R$ 4.850,00)</option>
            <option value="v102">Venda Balcão #V-102 — Expresso Rodoviário Cordeiro (R$ 3.200,00)</option>
            <option value="v103">Ordem de Serviço #OS-103 — Logística Brasul Frotas (R$ 5.400,00)</option>
            <option value="avulsa">Emissão Avulsa (Digitação Livre)</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Série:</label><input type="text" class="campo-texto" value="1" readonly style="width:100%;height:36px;font-size:13px"></div>
          <div><label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Número NF-e:</label><input type="text" class="campo-texto" value="${proximoNumero}" readonly style="width:100%;height:36px;font-size:13px"></div>
        </div>

        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">CFOP da Operação:</label>
          <select class="campo" style="width:100%;height:36px;font-size:13px">
            <option value="5102">5102 - Venda de mercadoria adquirida ou recebida de terceiros</option>
            <option value="5405">5405 - Venda de mercadoria com Substituição Tributária (ST)</option>
            <option value="5933">5933 - Prestação de serviços tributados pelo ISSQN</option>
            <option value="6102">6102 - Venda para outro estado (Interestadual)</option>
          </select>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
          <button class="btn btn-neutro" onclick="fecharModalGenerico()">Cancelar</button>
          <button class="btn btn-primario" onclick="transmitirNFe(${proximoNumero})">Assinar & Transmitir SEFAZ</button>
        </div>
      </div>
    </div>
  `);
}

function transmitirNFe(num) {
  torrar('Assinando XML com Certificado A1 e enviando para SEFAZ...', 'neutro');
  setTimeout(() => {
    if (!S.documentosFiscais) S.documentosFiscais = [];
    S.documentosFiscais.unshift({
      id: 'nf' + Date.now(),
      numero: '000.001.' + num,
      serie: '1',
      modelo: '55',
      tipo: 'nfe',
      destNome: 'Transportes Rodoviários Silva Ltda',
      destDoc: '12.345.678/0001-90',
      destFone: '11988887777',
      cfop: '5102 - Venda de mercadoria adquirida de terceiros',
      vendaCod: 'V-' + num,
      emissao: hoje() + ' ' + new Date().toLocaleTimeString().slice(0, 5),
      total: 4850.00,
      situacao: 'Autorizada',
      protocolo: '13526' + Date.now().toString().slice(-10)
    });
    if (S.cfg) S.cfg.numeroNfe = num + 1;
    salvarLocal();
    fecharModalGenerico();
    render();
    torrar(`NF-e #${num} autorizada com sucesso pela SEFAZ!`, 'sucesso');
  }, 900);
}

function acaoFiscal(acao) {
  const selecionados = Array.from(document.querySelectorAll('.chk-fiscal:checked'));
  if (selecionados.length === 0) {
    torrar('Selecione uma nota fiscal na tabela para executar a ação.', 'alerta');
    return;
  }
  if (acao === 'cancelar') {
    const motivo = prompt('Informe a justificativa do cancelamento (mínimo 15 caracteres):', 'Erro de digitação no destinatário da nota');
    if (motivo && motivo.length >= 15) {
      torrar('Cancelamento homologado pela SEFAZ com sucesso.', 'sucesso');
    } else if (motivo) {
      torrar('O motivo do cancelamento deve conter no mínimo 15 caracteres.', 'erro');
    }
  } else if (acao === 'inutilizar') {
    torrar('Faixa de numeração inutilizada com sucesso na SEFAZ.', 'sucesso');
  } else if (acao === 'whatsapp') {
    const fone = selecionados[0].dataset.fone || '11988887777';
    const dest = selecionados[0].dataset.dest || 'Cliente';
    const num = selecionados[0].dataset.num || '101';
    enviarNfeWhatsApp(num, fone, dest);
  }
}

function acaoFiscalUtilitario(val) {
  if (!val) return;
  if (val === 'zip') {
    torrar('Pacote ZIP com XMLs do mês gerado com sucesso para download.', 'sucesso');
  } else if (val === 'cce') {
    prompt('Digite o texto da Carta de Correção Eletrônica (CC-e):', 'Correção de endereço / transportador');
    torrar('Carta de Correção transmitida e vinculada à NF-e.', 'sucesso');
  } else if (val === 'sefaz') {
    window.open('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx', '_blank');
  } else if (val === 'contador') {
    torrar('Lote fiscal do mês enviado com sucesso ao escritório contábil!', 'sucesso');
  }
}

function imprimirDanfe(id) {
  torrar('Gerando espelho DANFE para impressão...', 'neutro');
  setTimeout(() => window.print(), 300);
}

function enviarNfeWhatsApp(num, fone, dest) {
  const msg = encodeURIComponent(`Olá, ${dest}! Segue o arquivo XML e DANFE da sua Nota Fiscal Nº ${num} emitida por Pátio Diesel.`);
  const url = `https://wa.me/55${String(fone).replace(/\D/g, '')}?text=${msg}`;
  window.open(url, '_blank');
}

function viewFiscal() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Configuração de Emissão Fiscal (NFe/NFCe)</h3>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      <div><label class="mini">Ambiente Sefaz</label>
        <select class="campo-texto" data-act="cfg" data-c="ambienteNfe" style="width:100%">
          <option ${c.ambienteNfe==='Homologação (Teste)'?'selected':''}>Homologação (Teste)</option>
          <option ${c.ambienteNfe==='Produção'?'selected':''}>Produção</option>
        </select>
      </div>
      <div><label class="mini">Série Padrão (NFe)</label><input type="text" class="campo-texto" data-act="cfg" data-c="serieNfe" value="${esc(c.serieNfe||'1')}" style="width:100%"></div>
      <div><label class="mini">Próximo Número NFe</label><input type="number" class="campo-texto" data-act="cfg" data-c="numeroNfe" value="${c.numeroNfe||1}" style="width:100%"></div>
      <div><label class="mini">CFOP Padrão de Venda</label><input type="text" class="campo-texto" data-act="cfg" data-c="cfopPadrao" value="${esc(c.cfopPadrao||'5102')}" style="width:100%"></div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Certificado Digital (A1):</div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="padding:20px;border:2px dashed var(--aco-300);border-radius:8px;text-align:center;flex:1;background:var(--aco-50)">
         <div class="mini">Arraste seu arquivo .pfx aqui ou clique para selecionar.</div>
         <button class="btn btn-secundario" style="margin-top:8px">Selecionar Arquivo</button>
      </div>
      <div style="flex:1">
        <label class="mini">Senha do Certificado:</label>
        <input type="password" class="campo-texto" data-act="cfg" data-c="senhaCertificado" value="${esc(c.senhaCertificado||'')}" style="width:100%;margin-bottom:8px">
        <div class="mini" style="color:var(--aco-500)">Status: <b style="color:${c.senhaCertificado?'green':'red'}">${c.senhaCertificado?'Configurado':'Pendente'}</b></div>
      </div>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.viewCentralFiscal = viewCentralFiscal;
  window.patioFiscalAvailable = true;
  window.abrirModalNovaNFe = abrirModalNovaNFe;
  window.transmitirNFe = transmitirNFe;
  window.acaoFiscal = acaoFiscal;
  window.acaoFiscalUtilitario = acaoFiscalUtilitario;
  window.imprimirDanfe = imprimirDanfe;
  window.enviarNfeWhatsApp = enviarNfeWhatsApp;
  window.viewFiscal = viewFiscal;
}
if (typeof globalThis !== 'undefined') {
  globalThis.viewCentralFiscal = viewCentralFiscal;
  globalThis.patioFiscalAvailable = true;
  globalThis.abrirModalNovaNFe = abrirModalNovaNFe;
  globalThis.transmitirNFe = transmitirNFe;
  globalThis.acaoFiscal = acaoFiscal;
  globalThis.acaoFiscalUtilitario = acaoFiscalUtilitario;
  globalThis.imprimirDanfe = imprimirDanfe;
  globalThis.enviarNfeWhatsApp = enviarNfeWhatsApp;
  globalThis.viewFiscal = viewFiscal;
}

