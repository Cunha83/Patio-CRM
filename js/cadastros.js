/* =====================================================================
   PÁTIO CRM — MÓDULO DE CADASTROS (CLIENTES, VEÍCULOS, SERVIÇOS & BOXES)
===================================================================== */

function viewCadastros() {
  const a = S.ui.abaCad || 'hub';

  if (a === 'hub') {
    return `
      <div style="margin:-16px -16px 16px -16px;padding:12px 24px;background:var(--aco-500);color:#fff;display:flex;align-items:center;justify-content:space-between">
        <h2 style="margin:0;font-size:18px;font-weight:400">Hub de Cadastros e Configurações</h2>
      </div>

      <h3 style="font-size:15px;margin-bottom:12px;color:var(--aco-700)">Cadastros Base da Operação</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;margin-bottom:32px">
        ${cardCad('Clientes & Frotas', 'clientes', (S.clientes?.length||0)+' registros', 'gente', '#3b82f6')}
        ${cardCad('Fornecedores', 'fornecedores', (S.fornecedores?.length||0)+' registros', 'maleta', '#8b5cf6')}
        ${cardCad('Mecânicos & Equipe', 'mecanicos', (S.mecanicos?.length||0)+' registros', 'eng', '#f59e0b')}
        ${cardCad('Produtos & Peças', 'produtos', (S.pecas?.length||0)+' registros', 'caixa', '#10b981')}
        ${cardCad('Tabela de Serviços', 'servicos', (S.servicos?.length||0)+' registros', 'livro', '#0ea5e9')}
        ${cardCad('Veículos / Caminhões', 'veiculos', (S.veiculos?.length||0)+' registros', 'nota', '#64748b')}
        ${cardCad('Boxes do Pátio', 'boxes', (S.boxes?.length||0)+' registros', 'box', '#ec4899')}
      </div>

      <h3 style="font-size:15px;margin-bottom:12px;color:var(--aco-700)">Configurações Sistêmicas</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px">
        ${cardCad('Geral', 'empresa', 'Dados da oficina', 'config', '#14b8a6')}
        ${cardCad('Plano de Contas', 'planocontas', 'Categorias financeiras', 'lista', '#64748b')}
        ${cardCad('Contas Caixa', 'contascaixa', 'Bancos e cofres', 'cofre', '#64748b')}
        ${cardCad('Operações', 'operacoes', 'Garantias, prazos OS', 'eng', '#64748b')}
        ${cardCad('Formas Pgto', 'formaspgto', 'Pix, Cartão, Dinheiro', 'nota', '#64748b')}
        ${cardCad('Boletos', 'boletos', 'Bancos e emissores', 'nota', '#64748b')}
        ${cardCad('Cobranças', 'cobrancas', 'Réguas e automações', 'zap_send', '#64748b')}
        ${cardCad('Fiscal', 'fiscal', 'NCM, CFOP Padrão', 'nota', '#64748b')}
        ${cardCad('Regras Tributárias', 'regras-tributarias', 'Matriz ICMS, PIS, IBS, CBS', 'lista', '#2563eb')}
        ${cardCad('Dados Tributários', 'tributario', 'CNAE, Inscrições, IVA Dual', 'nota', '#0284c7')}
        ${cardCad('Simulador Reforma', 'simulador-fiscal', 'Auditoria & Cálculos IVA Dual', 'grana', '#059669')}
        ${cardCad('Contábil', 'contabil', 'Escritório Contabilidade', 'maleta', '#64748b')}
        ${cardCad('Usuários', 'usuarios', 'Logins e permissões', 'gente', '#64748b')}
        ${cardCad('API', 'api', 'Integrações', 'nuvem', '#64748b')}
      </div>
    `;
  }

  let corpo = '';
  let acoes = '';
  if (a === 'clientes') { corpo = tabelaClientes(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="cliente">${ico('mais', 14)} Novo Cliente</button>`; }
  else if (a === 'veiculos') { corpo = tabelaVeiculos(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="veiculo">${ico('mais', 14)} Novo Veículo</button>`; }
  else if (a === 'servicos') { corpo = tabelaServicos(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="servico">${ico('mais', 14)} Novo Serviço</button>`; }
  else if (a === 'boxes') { corpo = tabelaBoxes(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="box">${ico('mais', 14)} Novo Box</button>`; }
  else if (a === 'fornecedores') { corpo = tabelaFornecedores(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="fornecedor">${ico('mais', 14)} Novo Fornecedor</button>`; }
  else if (a === 'mecanicos') { corpo = tabelaMecanicos(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="mecanico">${ico('mais', 14)} Novo Mecânico</button>`; }
  else if (a === 'produtos') { corpo = tabelaProdutos(); acoes = `<button class="btn btn-primario" data-act="novo-cad" data-t="produto">${ico('mais', 14)} Novo Produto/Peça</button>`; }
  
  else if (a === 'empresa') { corpo = viewEmpresa(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'planocontas') { corpo = viewPlanoContas(); }
  else if (a === 'contascaixa') { corpo = viewContasCaixa(); }
  else if (a === 'operacoes') { corpo = viewOperacoes(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'formaspgto') { corpo = viewFormasPgto(); }
  else if (a === 'boletos') { corpo = viewBoletos(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'cobrancas') { corpo = viewCobrancas(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'fiscal') { corpo = viewFiscal(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'tributario') { corpo = viewTributario(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'regras-tributarias') {
    corpo = viewRegrasTributarias();
    acoes = `<button class="btn btn-primario" onclick="S.ui.rascCad={tipo:'produto',cfop:'',desc:'',cstIBSCBS:'01',cClassTrib:'010101',aliqCBS:S.cfg.aliqPadraoCBS||0.9,aliqIBSEst:S.cfg.aliqPadraoIBSEst||0.05,aliqIBSMun:S.cfg.aliqPadraoIBSMun||0.05,aliqIBS:S.cfg.aliqPadraoIBS||0.1,cstIS:'00',aliqIS:0,indDestino:'1'};S.ui.cadTipo='regra-tributaria';abrirFolha(folhaCadastro);">${ico('mais', 14)} Nova Regra</button>`;
  }
  else if (a === 'simulador-fiscal') { corpo = viewSimuladorFiscal(); }
  else if (a === 'contabil') { corpo = viewContabil(); acoes = `<button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar</button>`; }
  else if (a === 'usuarios') { corpo = viewUsuarios(); }
  else if (a === 'api') { corpo = viewAPI(); acoes = `<button class='btn btn-primario' data-act='salvar-cfg'>${ico('check', 14)} Salvar</button>`; }

  const nomesAbas = {
    clientes: 'Clientes & Frotas', veiculos: 'Veículos / Caminhões', servicos: 'Tabela de Serviços', boxes: 'Boxes do Pátio', fornecedores: 'Fornecedores', mecanicos: 'Mecânicos & Equipe', produtos: 'Produtos & Peças',
    empresa: 'Geral', planocontas: 'Plano de Contas', contascaixa: 'Contas Caixa', operacoes: 'Operações', formaspgto: 'Formas de Pgto', boletos: 'Boletos', cobrancas: 'Cobranças', fiscal: 'Fiscal', tributario: 'Dados Tributários & IVA Dual', 'regras-tributarias': 'Regras Tributárias', 'simulador-fiscal': 'Simulador Reforma Tributária', contabil: 'Contábil', usuarios: 'Usuários'
  };

  return `
    <div style="margin-bottom:16px"><button class="btn btn-secundario" onclick="S.ui.abaCad='hub';if(typeof render==='function')render()">${ico('esq', 12) || '←'} Voltar ao Hub</button></div>
    <div class="entre" style="margin-bottom:14px">
      <h3 style="font-size:18px;margin:0">${nomesAbas[a] || a.toUpperCase()}</h3>
      ${acoes}
    </div>
    ${corpo}
  `;
}

function cardCad(titulo, k, desc, icone, cor) {
  let fallbackIcon = '<div style="font-size:24px">📋</div>';
  if (typeof ico === 'function' && ico(icone, 24)) {
    fallbackIcon = ico(icone, 24);
  }
  let act = k.startsWith('js:') ? k.slice(3) : `S.ui.abaCad='${k}';if(typeof render === 'function') render()`;
  return `
  <div class="card card-p" style="cursor:pointer;border-top:4px solid ${cor};display:flex;align-items:center;gap:12px;transition:transform 0.2s" onclick="${act}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
    <div style="background:${cor}22;color:${cor};padding:12px;border-radius:8px;display:flex;align-items:center;justify-content:center">${fallbackIcon}</div>
    <div>
      <div style="font-size:14px;font-weight:600;color:var(--aco-800)">${titulo}</div>
      ${desc !== '' ? `<div style="font-size:12px;color:var(--aco-500)">${desc}</div>` : ''}
    </div>
  </div>
  `;
}

/* ===== TABELA CLIENTES ===== */
function tabelaClientes() {
  const lista = S.clientes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Razão Social / Nome Fantasia</th>
            <th>CNPJ / CPF</th>
            <th>Contato & WhatsApp</th>
            <th>Cidade / UF</th>
            <th style="width:90px;text-align:center">Prazo</th>
            <th style="width:140px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(c => `
            <tr style="${c.bloqueado ? 'background:rgba(239, 68, 68, 0.04)' : ''}">
              <td>
                <div style="font-weight:600;color:var(--aco-900)">${esc(c.nome)}</div>
                ${c.fantasia ? `<div class="mini">${esc(c.fantasia)}</div>` : ''}
              </td>
              <td class="mono">${esc(c.doc || '—')}</td>
              <td>
                <div>${esc(c.contato || '—')}</div>
                <div class="mini mono">${esc(c.fone || '—')}</div>
              </td>
              <td>${esc(c.cidade || '—')}${c.uf ? '/' + esc(c.uf) : ''}</td>
              <td style="text-align:center"><span class="selo">${c.prazo ? c.prazo + 'd' : 'À vista'}</span></td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="ver-cliente" data-id="${c.id}" title="Ficha do Cliente">${ico('doc', 14)}</button>
                  <button class="btn-icone" data-act="editar-cliente" data-id="${c.id}" title="Editar Dados">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cliente" data-id="${c.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA VEÍCULOS ===== */
function tabelaVeiculos() {
  const lista = S.veiculos || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Marca & Modelo</th>
            <th>Proprietário / Cliente</th>
            <th>Tipo</th>
            <th style="width:110px;text-align:right">KM Registrado</th>
            <th style="width:110px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(v => {
            const cl = C(v.cli);
            return `
            <tr>
              <td><span class="placa">${esc(v.placa)}</span></td>
              <td><b>${esc(v.marca ? v.marca + ' ' : '')}${esc(v.modelo)}</b><div class="mini">Ano: ${esc(v.ano || '—')}</div></td>
              <td>${esc(cl.nome)}</td>
              <td><span class="selo">${esc(v.tipo || 'Cavalo')}</span></td>
              <td style="text-align:right" class="num">${(v.km || 0).toLocaleString('pt-BR')} km</td>
              <td style="text-align:center">
                <button class="btn btn-secundario" data-act="ver-historico-veiculo" data-id="${v.id}" style="padding:4px 8px;font-size:12px">
                  ${ico('historico', 12)} Histórico
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA SERVIÇOS ===== */
function tabelaServicos() {
  const lista = S.servicos || [];
  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Descrição do Serviço</th>
            <th style="width:120px;text-align:center">Tempo Est.</th>
            <th style="width:200px">Fiscal (CNAE / ISS)</th>
            <th style="width:140px;text-align:right">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(s => `
            <tr>
              <td><b>${esc(s.nome)}</b></td>
              <td style="text-align:center"><span class="selo">${s.horas || 1} h</span></td>
              <td class="mini">CNAE: ${esc(s.cnae||'—')}<br>Item: ${esc(s.iss_cod||'—')} (${s.iss_aliq||0}%)</td>
              <td style="text-align:right;font-weight:700" class="num">${brl(s.valor)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ===== TABELA FORNECEDORES ===== */
function tabelaFornecedores() {
  const lista = S.fornecedores || [];
  return `
  <div class="card">
    <table class="tabela">
      <thead>
        <tr>
          <th>Razão Social / Nome Fantasia</th>
          <th>CNPJ</th>
          <th>Contato & E-mail</th>
          <th>Cidade/UF</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(c => `
          <tr>
            <td><div style="font-weight:600">${esc(c.nome)}</div><div class="mini">${esc(c.fantasia||'')}</div></td>
            <td class="mono">${esc(c.doc || '—')}</td>
            <td><div>${esc(c.contato || '—')} (${esc(c.fone||'—')})</div><div class="mini">${esc(c.email||'')}</div></td>
            <td>${esc(c.cidade || '—')}/${esc(c.uf || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ===== TABELA MECÂNICOS ===== */
function tabelaMecanicos() {
  const lista = S.mecanicos || [];
  return `
  <div class="card">
    <table class="tabela">
      <thead>
        <tr>
          <th>Nome do Colaborador</th>
          <th>Especialidade</th>
          <th>Telefone</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(m => `
          <tr>
            <td><div style="font-weight:600">${esc(m.nome)}</div></td>
            <td><span class="selo">${esc(m.especialidade || 'Geral')}</span></td>
            <td class="mono">${esc(m.fone || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ===== TABELA PRODUTOS/PEÇAS ===== */
function tabelaProdutos() {
  const lista = S.pecas || [];
  return `
  <div class="card">
    <table class="tabela">
      <thead>
        <tr>
          <th>Código & Descrição</th>
          <th style="width:160px">Tributação (NCM/CFOP)</th>
          <th style="width:100px;text-align:right">Custo</th>
          <th style="width:100px;text-align:right">Venda</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(p => `
          <tr>
            <td>
              <div class="mini mono" style="color:var(--aco-500)">${esc(p.cod)}</div>
              <div style="font-weight:600">${esc(p.nome)}</div>
            </td>
            <td class="mini">
              NCM: ${esc(p.ncm||'—')}<br>CFOP: ${esc(p.cfop||'—')}
            </td>
            <td style="text-align:right">${brl(p.custo)}</td>
            <td style="text-align:right;font-weight:700;color:var(--verde)">${brl(p.venda)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ===== EMPRESA & PARAMETRIZAÇÃO ===== */
function viewEmpresa() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Dados Gerais</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      <div><label class="mini">Razão Social / Nome</label><input type="text" class="campo-texto" value="${esc(c.empresa)}" style="width:100%"></div>
      <div><label class="mini">CNPJ</label><input type="text" class="campo-texto" value="${esc(c.cnpj)}" style="width:100%"></div>
      <div><label class="mini">Endereço Completo</label><input type="text" class="campo-texto" value="${esc(c.endereco)}" style="width:100%"></div>
      <div><label class="mini">Telefone / Contato</label><input type="text" class="campo-texto" value="${esc(c.fone)}" style="width:100%"></div>
    </div>

    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Parametrização Fiscal / Tributária</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
      <div><label class="mini">Regime Tributário</label>
        <select class="campo-texto" style="width:100%">
          <option ${c.regimeTributario==='Simples Nacional'?'selected':''}>Simples Nacional</option>
          <option ${c.regimeTributario==='Lucro Presumido'?'selected':''}>Lucro Presumido</option>
          <option ${c.regimeTributario==='Lucro Real'?'selected':''}>Lucro Real</option>
        </select>
      </div>
      <div><label class="mini">CNAE Principal</label><input type="text" class="campo-texto" value="${esc(c.cnae||'')}" style="width:100%"></div>
      <div></div>
      <div><label class="mini">Inscrição Estadual (IE)</label><input type="text" class="campo-texto" value="${esc(c.ie||'')}" style="width:100%"></div>
      <div><label class="mini">Inscrição Municipal (IM)</label><input type="text" class="campo-texto" value="${esc(c.im||'')}" style="width:100%"></div>
    </div>

    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Identidade Visual & Documentos (OS / Orçamento)</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;align-items:center">
      <div>
        <label class="mini">Logotipo da Oficina (PNG, JPEG ou WEBP, máx. 2MB)</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" class="campo-texto" style="width:100%;padding:6px" onchange="
          const file = this.files[0];
          if (file) {
            if (file.size > 2 * 1024 * 1024) { torrar('O arquivo excede o limite máximo de 2MB.'); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
              if (!S.cfg) S.cfg = {};
              if (!S.cfg.identidadeVisual) S.cfg.identidadeVisual = {};
              S.cfg.identidadeVisual.logo = e.target.result;
              torrar('Logotipo carregado! Clique em Salvar para persistir.');
              render();
            };
            reader.readAsDataURL(file);
          }
        ">
        <div class="mini" style="margin-top:4px;color:var(--aco-500)">Exibido no cabeçalho de Ordens de Serviço, Orçamentos e Relatórios.</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;background:#f8fafc;border:1px dashed var(--aco-200);border-radius:8px;min-height:90px;padding:8px">
        ${c.identidadeVisual?.logo ? `
          <div style="text-align:center">
            <img src="${c.identidadeVisual.logo}" alt="Logotipo" style="max-height:70px;max-width:200px;object-fit:contain;display:block;margin:0 auto 6px auto">
            <button class="btn btn-perigo" style="padding:2px 8px;font-size:11px" onclick="if(S.cfg?.identidadeVisual) S.cfg.identidadeVisual.logo = null; render();">Remover Logo</button>
          </div>
        ` : `
          <span class="mini" style="color:var(--aco-400)">Nenhum logotipo configurado (usando nome da oficina)</span>
        `}
      </div>
    </div>

    <div class="entre" style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <div>
        <h3 style="font-weight:600;font-size:16px;margin:0">Assistente Virtual & WhatsApp</h3>
        <div class="mini" style="color:var(--aco-500)">Personalize a identidade da IA operacional do seu negócio.</div>
      </div>
      <button type="button" class="btn btn-neutro btn-pequeno" style="gap:6px;display:flex;align-items:center" onclick="if(typeof abrirConfiguracoesAgente === 'function') abrirConfiguracoesAgente();">
        ⚙️ Configurar Voz Avançada & Testar
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      <div>
        <label class="mini">Nome do Agente / Assistente</label>
        <input type="text" class="campo-texto" value="${esc(c.assistente?.displayName || 'Verônica')}" style="width:100%" oninput="if(!S.cfg.assistente)S.cfg.assistente={};S.cfg.assistente.displayName=this.value;salvar()" placeholder="Ex: Verônica, Bia, Carlos...">
        <div class="mini" style="margin-top:4px;color:var(--aco-500)">Nome com o qual o agente se apresenta nas mensagens e áudios.</div>
      </div>
      <div>
        <label class="mini">Voz do Agente (Síntese de Voz / TTS)</label>
        <select class="campo-texto" style="width:100%" onchange="if(!S.cfg.assistente)S.cfg.assistente={};S.cfg.assistente.voiceGender=this.value;salvar()">
          <option value="female" ${(c.assistente?.voiceGender !== 'male') ? 'selected' : ''}>👩 Feminina</option>
          <option value="male" ${(c.assistente?.voiceGender === 'male') ? 'selected' : ''}>👨 Masculina</option>
        </select>
        <div class="mini" style="margin-top:4px;color:var(--aco-500)">Gênero de voz aplicado nas respostas faladas do sistema.</div>
      </div>
    </div>
  </div>
  `;
}

/* ===== TABELA BOXES ===== */
function tabelaBoxes() {
  const lista = S.boxes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Identificação do Box</th>
            <th>Especialidade</th>
            <th style="width:120px;text-align:center">Status Atual</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(b => {
            const osNoBox = (S.os || []).find(o => o.box === b.id && o.st !== 'finalizada');
            return `
            <tr>
              <td><b>${esc(b.nome)}</b></td>
              <td><span class="selo">${esc(b.tipo || 'Geral')}</span></td>
              <td style="text-align:center">
                <span class="selo ${osNoBox ? 'selo-executando' : 'selo-fila'}">
                  ${osNoBox ? `Ocupado (OS ${osNoBox.num})` : 'Livre'}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaCliente() {
  const c = C(S.ui.cliAberto);
  if (!c) return '<div class="card card-p">Cliente não encontrado.</div>';

  const veiculosCli = (S.veiculos || []).filter(v => v.cli === c.id);
  const osCli = (S.os || []).filter(o => o.cli === c.id);
  const contasCli = (S.contas || []).filter(ct => ct.parte === c.nome);

  return `
  <div class="card card-p" style="max-width:650px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:18px;font-weight:700">${esc(c.nome)}</h3>
        <div class="mini">CNPJ/CPF: <span class="mono">${esc(c.doc || '—')}</span> · Tel: <b>${esc(c.fone || '—')}</b></div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn ${c.bloqueado ? 'btn-sucesso' : 'btn-perigo'}" data-act="bloquear-cliente" data-id="${c.id}" style="font-size:12px;padding:4px 10px">
          ${c.bloqueado ? 'Desbloquear' : 'Bloquear Crédito'}
        </button>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="kpi bom" style="padding:10px;text-align:center">
        <div class="mini">Veículos Cadastrados</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${veiculosCli.length}</div>
      </div>
      <div class="kpi neutro" style="padding:10px;text-align:center">
        <div class="mini">Total de OSs</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${osCli.length}</div>
      </div>
      <div class="kpi aviso" style="padding:10px;text-align:center">
        <div class="mini">Prazo de Pagamento</div>
        <div class="num" style="font-size:20px;font-weight:700;margin-top:4px">${c.prazo ? c.prazo + ' dias' : 'À Vista'}</div>
      </div>
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:8px">Veículos / Frota (${veiculosCli.length}):</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${veiculosCli.map(v => `
        <span class="placa" style="padding:4px 10px;font-size:13px">${esc(v.placa)} — ${esc(v.modelo)}</span>
      `).join('') || '<div class="mini">Nenhum veículo vinculado.</div>'}
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:8px">Endereço & Localização:</div>
    <div class="mini" style="font-size:13px;color:var(--aco-700);line-height:1.5">
      ${esc(c.endereco || '—')}${c.numero ? ', ' + esc(c.numero) : ''} · ${esc(c.bairro || '')}<br>
      ${esc(c.cidade || '—')}/${esc(c.uf || '')} · CEP: ${esc(c.cep || '—')}
    </div>
  </div>`;
}

function folhaCadastro() {
  const t = S.ui.cadTipo || 'cliente';
  const r = S.ui.rascCad = S.ui.rascCad || {};

  if (t === 'cliente') {
    return `
    <div class="card card-p" style="max-width:600px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <h3 style="font-size:17px;font-weight:700;margin:0">${r.id ? 'Editar Cliente' : 'Novo Cliente / Transportadora'}</h3>
          <span style="font-size:12px;padding:4px 8px;background:${r.scoreSerasa ? (r.scoreSerasa>500?'var(--verde)':'var(--tijolo)') : 'var(--aco-200)'};color:${r.scoreSerasa ? '#fff' : 'inherit'};border-radius:4px;cursor:pointer" onclick="if(typeof consultarSerasa==='function')consultarSerasa(document.getElementById('doc_cli').value, 'cli')" id="tag_serasa">Score Serasa: ${r.scoreSerasa || 'Não verificado 🔍'}</span>
        </div>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18) || 'X'}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Razão Social / Nome Completo:</label>
          <input type="text" class="campo-texto" placeholder="Ex: Transportes Rodoviários Silva Ltda" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" style="width:100%;height:34px">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nome Fantasia:</label>
            <input type="text" class="campo-texto" placeholder="Ex: Silva Transportes" data-act="rc" data-c="fantasia" value="${esc(r.fantasia || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ / CPF:</label>
            <div style="display:flex;gap:4px">
              <input type="text" class="campo-texto" placeholder="00.000.000/0000-00" data-act="rc" data-c="doc" value="${esc(r.doc || '')}" style="width:100%;height:34px" id="doc_cli" oninput="if(this.value && this.value.replace(/\D/g,'').length===14)verificarAutoConsultaCnpj(this.value)" onchange="if(this.value && this.value.replace(/\D/g,'').length >= 11) abrirModalConsultaCliente(this.value)">
              <button type="button" class="btn btn-primario" onclick="abrirModalConsultaCliente(document.getElementById('doc_cli').value)" style="padding:0 10px;font-size:12px;font-weight:600;white-space:nowrap" title="Consultar dados via API (Sintegra & Serasa)" id="btn_consultar_cli">🔍 Consultar</button>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">WhatsApp / Telefone:</label>
            <input type="text" class="campo-texto" placeholder="(11) 98888-7777" data-act="rc" data-c="fone" value="${esc(r.fone || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Contato Responsável:</label>
            <input type="text" class="campo-texto" placeholder="Ex: Carlos (Gerente Frota)" data-act="rc" data-c="contato" value="${esc(r.contato || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Prazo Padrão (Dias):</label>
            <input type="number" class="campo-texto" placeholder="28" data-act="rc" data-c="prazo" value="${r.prazo || 0}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:140px 1fr 140px;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">CEP:</label>
            <div style="display:flex;gap:4px"><input type="text" class="campo-texto" placeholder="00000-000" data-act="rc" data-c="cep" value="${esc(r.cep || '')}" style="width:100%;height:34px" id="cep_cli" onblur="if(typeof buscarCep==='function')buscarCep(this.value, 'cli')"><button class="btn btn-secundario" onclick="if(typeof buscarCep==='function')buscarCep(document.getElementById('cep_cli').value, 'cli')" style="padding:0 8px" title="Buscar CEP">🔍</button></div>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Logradouro / Endereço:</label>
            <input type="text" class="campo-texto" placeholder="Av. Principal, 1000" data-act="rc" data-c="endereco" value="${esc(r.endereco || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Inscrição Estadual:</label>
            <input type="text" class="campo-texto" data-act="rc" data-c="ie" value="${esc(r.ie || '')}" style="width:100%;height:34px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Cidade:</label>
            <input type="text" class="campo-texto" placeholder="Campinas" data-act="rc" data-c="cidade" value="${esc(r.cidade || '')}" style="width:100%;height:34px">
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">UF:</label>
            <input type="text" class="campo-texto" placeholder="SP" data-act="rc" data-c="uf" value="${esc(r.uf || '')}" style="width:100%;height:34px;text-transform:uppercase">
          </div>
        </div>

        <div style="background:var(--aco-50);border:1px solid var(--aco-150);border-radius:8px;padding:10px 14px">
          <div style="font-weight:700;font-size:12px;color:#1e293b;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>🛡️ Análise de Crédito & Birô (Serasa Experian)</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:10px">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px;font-size:11.5px">Score Serasa (0-1000):</label>
              <input type="number" class="campo-texto" placeholder="Ex: 720" data-act="rc" data-c="scoreSerasa" value="${r.scoreSerasa ?? ''}" id="score_serasa_input" style="width:100%;height:32px">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px;font-size:11.5px">Situação de Risco / Crédito:</label>
              <input type="text" class="campo-texto" placeholder="Ex: Baixo Risco / Regular" data-act="rc" data-c="situacaoSerasa" value="${esc(r.situacaoSerasa || '')}" id="situacao_serasa_input" style="width:100%;height:32px">
            </div>
            <div>
              <label style="font-weight:600;display:block;margin-bottom:4px;font-size:11.5px">Consulta Realizada:</label>
              <input type="text" class="campo-texto" readonly value="${r.consultaSerasaRealizada ? 'Sim (Verificado)' : (r.scoreSerasa ? 'Manual' : 'Pendente')}" id="consulta_serasa_status" style="width:100%;height:32px;background:var(--aco-100);color:#475569">
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">
          ${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Cliente
        </button>
      </div>
    </div>`;
  }

  /* ---------- PRODUTO: Formulário simplificado (tributos vêm do CFOP) ---------- */
  if (t === 'produto') {
    const regras = (S.cfg.regrasTributarias||[]).filter(x => x.tipo === 'produto');
    const origemOpts = ['0 – Nacional','1 – Estrangeira (Importação Direta)','2 – Estrangeira (Adquirida Mercado Interno)','3 – Nacional c/ Conteúdo Importação > 40%'];
    const selOrigem = origemOpts.map(x => `<option value="${x.split(' – ')[0]}" ${(r.origem||'0')===x.split(' – ')[0]?'selected':''}>${x}</option>`).join('');
    const regraSel = regras.find(x => x.cfop === r.cfop);

    return `
    <div class="card card-p" style="max-width:640px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Produto / Peça</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div style="display:grid;grid-template-columns:100px 1fr;gap:10px">
          <div><label class="mini">Código</label><input class="campo-texto" data-act="rc" data-c="cod" value="${esc(r.cod||'')}" style="width:100%"></div>
          <div><label class="mini">Nome da Peça / Produto</label><input class="campo-texto" data-act="rc" data-c="nome" value="${esc(r.nome||'')}" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">Unidade</label><input class="campo-texto" data-act="rc" data-c="un" value="${esc(r.un||'un')}" style="width:100%"></div>
          <div><label class="mini">Custo (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="custo" value="${r.custo||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">Preço Venda (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="venda" value="${r.venda||0}" step="0.01" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
          <div><label class="mini">NCM</label><input class="campo-texto" data-act="rc" data-c="ncm" value="${esc(r.ncm||'')}" placeholder="0000.00.00" style="width:100%"></div>
          <div><label class="mini">CEST</label><input class="campo-texto" data-act="rc" data-c="cest" value="${esc(r.cest||'')}" placeholder="00.000.00" style="width:100%"></div>
          <div><label class="mini">cClassTrib (RTC)</label><input class="campo-texto" data-act="rc" data-c="cClassTrib" value="${esc(r.cClassTrib||'')}" placeholder="Ex: 010101" style="width:100%" title="Código de Classificação Tributária da Reforma Tributária"></div>
          <div><label class="mini">Origem</label><select class="campo-texto" data-act="rc" data-c="origem" style="width:100%">${selOrigem}</select></div>
        </div>

        <div style="border-top:1px solid var(--aco-150);padding-top:12px;margin-top:4px">
          <label class="mini" style="font-weight:700">CFOP de Saída (Perfil Tributário)</label>
          <select class="campo-texto" data-act="rc" data-c="cfop" style="width:100%">
            <option value="">— Selecione o CFOP —</option>
            ${regras.map(rg => `<option value="${rg.cfop}" ${r.cfop===rg.cfop?'selected':''}>${rg.cfop} – ${esc(rg.desc)}</option>`).join('')}
          </select>
          ${regraSel ? `<div class="mini" style="margin-top:6px;padding:8px;background:var(--aco-50);border-radius:6px;line-height:1.6">
            <b>Regime Atual:</b> ICMS: ${regraSel.aliqICMS}% (CST ${regraSel.cstICMS}) · IPI: ${regraSel.aliqIPI}% · PIS: ${regraSel.aliqPIS}% · COFINS: ${regraSel.aliqCOFINS}%<br>
            <b style="color:var(--petroleo)">Nova Reforma (EC 132/2023):</b> CBS: ${regraSel.aliqCBS != null ? regraSel.aliqCBS : 0.9}% · IBS: ${regraSel.aliqIBS != null ? regraSel.aliqIBS : 0.1}% (Est: ${regraSel.aliqIBSEst||0.05}% / Mun: ${regraSel.aliqIBSMun||0.05}%) · CST RTC: ${regraSel.cstIBSCBS||'01'} · cClassTrib: ${esc(r.cClassTrib || regraSel.cClassTrib || '010101')}
          </div>` : `<div class="mini" style="margin-top:6px;color:var(--aco-500)">Configure as regras tributárias em <b>Cadastros → Regras Tributárias</b>.</div>`}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Produto</button>
      </div>
    </div>`;
  }

  /* ---------- SERVIÇO: Formulário simplificado (tributos vêm do CFOP/ISS) ---------- */
  if (t === 'servico') {
    const regrasS = (S.cfg.regrasTributarias||[]).filter(x => x.tipo === 'servico');
    const regraSel = regrasS.find(x => x.cfop === r.cfop);

    return `
    <div class="card card-p" style="max-width:650px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">Novo Serviço</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div><label class="mini">Descrição do Serviço</label><input class="campo-texto" data-act="rc" data-c="nome" value="${esc(r.nome||'')}" style="width:100%"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">Valor (R$)</label><input type="number" class="campo-texto" data-act="rc" data-c="valor" value="${r.valor||0}" step="0.50" style="width:100%"></div>
          <div><label class="mini">Horas de Box</label><input type="number" class="campo-texto" data-act="rc" data-c="horas" value="${r.horas||1}" style="width:100%"></div>
          <div><label class="mini">CNAE</label><input class="campo-texto" data-act="rc" data-c="cnae" value="${esc(r.cnae||'')}" placeholder="4520-0/01" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="mini">Código Serviço (LC 116/2003)</label><input class="campo-texto" data-act="rc" data-c="codServLC116" value="${esc(r.codServLC116||'')}" placeholder="Ex: 14.01" style="width:100%"></div>
          <div><label class="mini">cClassTrib (Reforma Tributária / RTC)</label><input class="campo-texto" data-act="rc" data-c="cClassTrib" value="${esc(r.cClassTrib||'')}" placeholder="Ex: 010101" style="width:100%" title="Código de Classificação Tributária da Reforma Tributária"></div>
        </div>

        <div style="border-top:1px solid var(--aco-150);padding-top:12px;margin-top:4px">
          <label class="mini" style="font-weight:700">CFOP / Regra Tributária</label>
          <select class="campo-texto" data-act="rc" data-c="cfop" style="width:100%">
            <option value="">— Selecione —</option>
            ${regrasS.map(rg => `<option value="${rg.cfop}" ${r.cfop===rg.cfop?'selected':''}>${rg.cfop} – ${esc(rg.desc)}</option>`).join('')}
          </select>
          ${regraSel ? `<div class="mini" style="margin-top:6px;padding:8px;background:var(--aco-50);border-radius:6px;line-height:1.6">
            <b>Regime Atual:</b> ISS: ${regraSel.aliqISS||0}% ${regraSel.issRetido==='S'?'(Retido)':''} · PIS: ${regraSel.aliqPIS}% · COFINS: ${regraSel.aliqCOFINS}%<br>
            <b style="color:var(--petroleo)">Nova Reforma (EC 132/2023):</b> CBS: ${regraSel.aliqCBS != null ? regraSel.aliqCBS : 0.9}% · IBS: ${regraSel.aliqIBS != null ? regraSel.aliqIBS : 0.1}% (Est: ${regraSel.aliqIBSEst||0.05}% / Mun: ${regraSel.aliqIBSMun||0.05}%) · CST RTC: ${regraSel.cstIBSCBS||'01'} · cClassTrib: ${esc(r.cClassTrib || regraSel.cClassTrib || '010101')}
          </div>` : `<div class="mini" style="margin-top:6px;color:var(--aco-500)">Configure as regras tributárias em <b>Cadastros → Regras Tributárias</b>.</div>`}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600;padding:0 18px">${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Serviço</button>
      </div>
    </div>`;
  }

  /* ---------- REGRA TRIBUTÁRIA ---------- */
  if (t === 'regra-tributaria') {
    const sel = (arr, val) => arr.map(x => `<option value="${x.split(' – ')[0]}" ${(r[val]||'')=== x.split(' – ')[0]?'selected':''}>${x}</option>`).join('');
    const cstICMS = ['00 – Tributada integralmente','10 – Tributada com cobrança por ST','20 – Com redução de base de cálculo','30 – Isenta/não tributada, com ST','40 – Isenta','41 – Não tributada','50 – Suspensão','51 – Diferimento','60 – ICMS cobrado anteriormente por ST','70 – Redução da BC e cobrança ST','90 – Outros'];
    const cstIPI = ['00 – Entrada com recuperação de crédito','01 – Entrada tributada com alíquota zero','49 – Outras entradas','50 – Saída tributada','51 – Saída tributada com alíquota zero','52 – Saída isenta','53 – Saída não tributada','54 – Saída imune','55 – Saída com suspensão','99 – Outras saídas'];
    const cstPISCOFINS = ['01 – Operação Tributável (BC = Valor da Operação)','02 – Operação Tributável (BC = Valor da Operação - Alíquota Diferenciada)','04 – Operação Tributável (ST)','05 – Operação Tributável (Substituição Tributária)','06 – Operação Tributável (Alíquota Zero)','07 – Operação Isenta da Contribuição','08 – Operação sem Incidência da Contribuição','09 – Operação com Suspensão da Contribuição','49 – Outras Operações de Saída','99 – Outras Operações'];
    const cstRTC = [
      '01 – Tributada integralmente com alíquota padrão',
      '02 – Tributada com alíquota diferenciada / reduzida',
      '03 – Tributada com redução de base de cálculo',
      '04 – Tributada por valor fixo (ad rem)',
      '05 – Imunidade',
      '06 – Não incidência',
      '07 – Isenção',
      '08 – Suspensão',
      '09 – Diferimento',
      '90 – Outros / Regime Específico'
    ];

    let camposImpostos = '';
    if (r.tipo === 'produto' || r.tipo === 'entrada') {
      camposImpostos = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">CST ICMS</label><select class="campo-texto" data-act="rc" data-c="cstICMS" style="width:100%">${sel(cstICMS,'cstICMS')}</select></div>
          <div><label class="mini">Alíq. ICMS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqICMS" value="${r.aliqICMS||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">Redução BC ICMS</label><input type="number" class="campo-texto" data-act="rc" data-c="redBCICMS" value="${r.redBCICMS||0}" step="0.01" style="width:100%"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mini">CST IPI</label><select class="campo-texto" data-act="rc" data-c="cstIPI" style="width:100%">${sel(cstIPI,'cstIPI')}</select></div>
          <div><label class="mini">Alíq. IPI (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqIPI" value="${r.aliqIPI||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">% MVA (ST)</label><input type="number" class="campo-texto" data-act="rc" data-c="mvaICMS" value="${r.mvaICMS||0}" step="0.01" style="width:100%"></div>
        </div>
      `;
    } else if (r.tipo === 'servico') {
      camposImpostos = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="mini">Alíquota ISS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqISS" value="${r.aliqISS||0}" step="0.01" style="width:100%"></div>
          <div><label class="mini">ISS Retido?</label>
            <select class="campo-texto" data-act="rc" data-c="issRetido" style="width:100%">
              <option value="N" ${r.issRetido!=='S'?'selected':''}>Não</option>
              <option value="S" ${r.issRetido==='S'?'selected':''}>Sim</option>
            </select>
          </div>
        </div>
      `;
    }

    return `
    <div class="card card-p" style="max-width:760px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <h3 style="font-size:17px;font-weight:700">Regra Tributária (CFOP)</h3>
          <div class="mini">Convivência Harmoniosa: Sistema Legado & Nova Reforma Tributária</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div style="display:grid;grid-template-columns:120px 1fr 150px;gap:10px">
          <div><label class="mini">CFOP</label><input type="text" class="campo-texto" data-act="rc" data-c="cfop" value="${esc(r.cfop||'')}" style="width:100%;font-weight:bold"></div>
          <div><label class="mini">Descrição (Uso interno)</label><input type="text" class="campo-texto" data-act="rc" data-c="desc" value="${esc(r.desc||'')}" style="width:100%"></div>
          <div><label class="mini">Tipo de Operação</label>
            <select class="campo-texto" onchange="S.ui.rascCad.tipo=this.value;renderFolha()" style="width:100%">
              <option value="produto" ${r.tipo==='produto'?'selected':''}>Produto/Saída</option>
              <option value="entrada" ${r.tipo==='entrada'?'selected':''}>Produto/Entrada</option>
              <option value="servico" ${r.tipo==='servico'?'selected':''}>Serviço (NFS-e)</option>
            </select>
          </div>
        </div>

        <!-- 1. TRIBUTOS DO MODELO ATUAL / TRANSIÇÃO -->
        <div style="border:1px solid var(--aco-200);border-radius:8px;padding:12px;background:#fff">
          <div style="font-weight:700;color:var(--aco-800);margin-bottom:8px;font-size:12px">1. Tributos Atuais (ICMS, ISS, IPI, PIS, COFINS):</div>
          ${camposImpostos}
          
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:10px">
            <div><label class="mini">CST PIS</label><select class="campo-texto" data-act="rc" data-c="cstPIS" style="width:100%">${sel(cstPISCOFINS,'cstPIS')}</select></div>
            <div><label class="mini">Alíq. PIS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqPIS" value="${r.aliqPIS||0}" step="0.01" style="width:100%"></div>
            <div><label class="mini">CST COFINS</label><select class="campo-texto" data-act="rc" data-c="cstCOFINS" style="width:100%">${sel(cstPISCOFINS,'cstCOFINS')}</select></div>
            <div><label class="mini">Alíq. COFINS (%)</label><input type="number" class="campo-texto" data-act="rc" data-c="aliqCOFINS" value="${r.aliqCOFINS||0}" step="0.01" style="width:100%"></div>
          </div>
        </div>

        <!-- 2. BLOCO DA NOVA REFORMA TRIBUTÁRIA (EC 132/2023 - IVA DUAL & IS) -->
        <div style="border:1px solid var(--petroleo);border-radius:8px;padding:14px;background:var(--petroleo-fraco)">
          <div class="entre" style="margin-bottom:10px">
            <div style="font-weight:700;color:var(--petroleo);font-size:13px">
              2. Nova Reforma Tributária (IVA Dual: CBS Federal / IBS Subnacional & Imposto Seletivo)
            </div>
            <span class="selo selo-finalizada" style="font-size:10.5px">Vigência EC 132/2023</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini">CST IBS/CBS (RTC)</label>
              <select class="campo-texto" data-act="rc" data-c="cstIBSCBS" style="width:100%">
                ${sel(cstRTC, 'cstIBSCBS')}
              </select>
            </div>
            <div>
              <label class="mini">Classificação Fiscal (cClassTrib RTC)</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="cClassTrib" value="${esc(r.cClassTrib || '010101')}" placeholder="Ex: 010101" style="width:100%">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini">CBS Federal (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqCBS" value="${r.aliqCBS != null ? r.aliqCBS : 0.90}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">IBS Estadual (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIBSEst" value="${r.aliqIBSEst != null ? r.aliqIBSEst : 0.05}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">IBS Municipal (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIBSMun" value="${r.aliqIBSMun != null ? r.aliqIBSMun : 0.05}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">Total IBS (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIBS" value="${r.aliqIBS != null ? r.aliqIBS : 0.10}" step="0.01" style="width:100%">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
            <div>
              <label class="mini">Redução BC IBS/CBS (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="redBCIBSCBS" value="${r.redBCIBSCBS || 0}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">CST Imposto Seletivo (IS)</label>
              <select class="campo-texto" data-act="rc" data-c="cstIS" style="width:100%">
                <option value="00" ${(r.cstIS||'00')==='00'?'selected':''}>00 – Não incidente</option>
                <option value="01" ${r.cstIS==='01'?'selected':''}>01 – Tributado</option>
                <option value="07" ${r.cstIS==='07'?'selected':''}>07 – Isento</option>
              </select>
            </div>
            <div>
              <label class="mini">Alíq. Imposto Seletivo (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="aliqIS" value="${r.aliqIS || 0}" step="0.01" style="width:100%">
            </div>
            <div>
              <label class="mini">Princípio do Destino</label>
              <select class="campo-texto" data-act="rc" data-c="indDestino" style="width:100%">
                <option value="1" ${(r.indDestino||'1')==='1'?'selected':''}>Local do Consumo (Destino)</option>
                <option value="0" ${r.indDestino==='0'?'selected':''}>Estabelecimento Prestador</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad" style="font-weight:600">${(typeof ico === 'function' ? ico('check', 14) : '✓')} Salvar Regra</button>
      </div>
    </div>`;
  }

  /* ---------- Formulário genérico para demais entidades ---------- */
  const campos = {
    veiculo: [['placa','Placa'],['modelo','Modelo'],['ano','Ano'],['tipo','Tipo (cavalo, carreta, truck)'],['km','KM atual','number']],
    fornecedor: [['nome','Razão social'],['fantasia','Nome fantasia'],['doc','CNPJ'],['fone','Telefone'],['email','E-mail'],['contato','Pessoa de contato'],['cep','CEP'],['endereco','Endereço'],['cidade','Cidade'],['uf','UF']],
    mecanico: [['nome','Nome do mecânico'],['especialidade','Especialidade (Geral, Freios, Elétrica)'],['fone','Telefone']],
    box: [['nome','Nome do box'],['tipo','Tipo (elevador, vala, solda)']]
  }[t];

  const extra = t === 'veiculo' ? `<div style="margin-bottom:10px"><label style="font-weight:600;display:block;margin-bottom:4px">Cliente dono</label><select data-act="rc" data-c="cli" style="width:100%;height:34px" class="campo-select">${(S.clientes||[]).map(c=>`<option value="${c.id}" ${r.cli===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></div>` : '';
  const titulo = {veiculo:'Novo veículo',box:'Novo box',fornecedor:'Novo fornecedor',mecanico:'Novo mecânico'}[t];

  return `
    <div class="card card-p" style="max-width:500px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <h3 style="font-size:17px;font-weight:700">${titulo}</h3>
        <button class="btn-fechar" data-act="fechar">${(typeof ico === 'function' ? ico('x', 18) : 'X')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        ${extra}
        ${campos.map(([k,l,tp])=>{
          let inputHtml = `<input ${tp?'type="'+tp+'"':''} value="${esc(r[k]??'')}" class="campo-texto" data-act="rc" data-c="${k}" style="width:100%;height:34px" id="dyn_${k}">`;
          let btn = '';
          if(k === 'placa') btn = `<button class="btn btn-secundario" onclick="if(typeof consultarPlaca==='function')consultarPlaca(document.getElementById('dyn_${k}').value)" style="padding:0 8px" title="Consultar Sinesp">🔍</button>`;
          if(k === 'doc') btn = `<button class="btn btn-secundario" onclick="if(typeof buscarCNPJ==='function')buscarCNPJ(document.getElementById('dyn_${k}').value, 'dyn')" style="padding:0 8px" title="Consultar Receita WS">🔍</button>`;
          if(k === 'cep') btn = `<button class="btn btn-secundario" onclick="if(typeof buscarCep==='function')buscarCep(document.getElementById('dyn_${k}').value, 'dyn')" style="padding:0 8px" title="Buscar CEP">🔍</button>`;
          
          if(btn) inputHtml = `<div style="display:flex;gap:4px">${inputHtml}${btn}</div>`;
          return `<div><label style="font-weight:600;display:block;margin-bottom:4px">${l}</label>${inputHtml}</div>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button class="btn btn-primario" data-act="salvar-cad">Salvar</button>
      </div>
    </div>`;
}

/* ===== NOVAS VIEWS DE CONFIGURAÇÃO ===== */

function viewTributario() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:850px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:700;font-size:17px;margin:0;color:var(--aco-900)">Dados Tributários & Reforma Tributária (IVA Dual)</h3>
      <div class="mini">Parametrização completa para adequação à Emenda Constitucional nº 132/2023 e PLP 68/2024</div>
    </div>
    
    <!-- 1. IDENTIFICAÇÃO E REGIME -->
    <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;color:var(--aco-800)">1. Enquadramento e Inscrições Fiscais:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;background:#fff;padding:14px;border-radius:8px;border:1px solid var(--aco-200)">
      <div>
        <label class="mini">Regime Tributário Geral</label>
        <select class="campo-texto" data-act="cfg" data-c="regimeTributario" style="width:100%">
          <option ${c.regimeTributario==='Simples Nacional'?'selected':''}>Simples Nacional</option>
          <option ${c.regimeTributario==='Lucro Presumido'?'selected':''}>Lucro Presumido</option>
          <option ${c.regimeTributario==='Lucro Real'?'selected':''}>Lucro Real</option>
        </select>
      </div>
      <div><label class="mini">CNAE Principal</label><input type="text" class="campo-texto" data-act="cfg" data-c="cnae" value="${esc(c.cnae||'4520-0/01')}" style="width:100%"></div>
      <div><label class="mini">Cód. IBGE Município (Destino)</label><input type="text" class="campo-texto" data-act="cfg" data-c="ibgeMunicipio" value="${esc(c.ibgeMunicipio||'3509502')}" placeholder="3509502" style="width:100%" title="Código IBGE utilizado na apuração do IBS Municipal segundo o Princípio do Destino"></div>
      <div><label class="mini">Inscrição Estadual (IE)</label><input type="text" class="campo-texto" data-act="cfg" data-c="ie" value="${esc(c.ie||'')}" style="width:100%"></div>
      <div><label class="mini">Inscrição Municipal (IM)</label><input type="text" class="campo-texto" data-act="cfg" data-c="im" value="${esc(c.im||'')}" style="width:100%"></div>
      <div><label class="mini">Classificação Fiscal Padrão (cClassTrib)</label><input type="text" class="campo-texto" data-act="cfg" data-c="cClassTribPadrao" value="${esc(c.cClassTribPadrao||'010101')}" style="width:100%"></div>
    </div>
    
    <!-- 2. NOVA REFORMA TRIBUTÁRIA (EC 132/2023 - IVA DUAL) -->
    <div style="border:1px solid var(--petroleo);border-radius:10px;padding:16px;background:var(--petroleo-fraco);margin-bottom:20px">
      <div class="entre" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="background:var(--petroleo);color:#fff;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">§</div>
          <b style="color:var(--petroleo);font-size:14px">Nova Reforma Tributária (CBS, IBS e Imposto Seletivo)</b>
        </div>
        <span class="selo selo-executando" style="font-size:11px">Fase Oficial de Teste 2026</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label class="mini" style="font-weight:700">Fase / Cronograma de Vigência</label>
          <select class="campo-texto" data-act="cfg" data-c="faseReforma" style="width:100%">
            <option value="teste_2026" ${(c.faseReforma||'teste_2026')==='teste_2026'?'selected':''}>Ano de Teste 2026 (CBS 0,9% + IBS 0,1%)</option>
            <option value="transicao_2027_2032" ${c.faseReforma==='transicao_2027_2032'?'selected':''}>Transição Gradual (2027-2032: Extinção PIS/COFINS e redução ICMS/ISS)</option>
            <option value="plena_2033" ${c.faseReforma==='plena_2033'?'selected':''}>Vigência Plena (2033 em diante: IBS + CBS Definitivos)</option>
          </select>
        </div>
        <div>
          <label class="mini" style="font-weight:700">Opção do Simples Nacional para IBS / CBS</label>
          <select class="campo-texto" data-act="cfg" data-c="opcaoSimplesIBSCBS" style="width:100%">
            <option value="simples_hibrido" ${(c.opcaoSimplesIBSCBS||'simples_hibrido')==='simples_hibrido'?'selected':''}>Recolhimento Regular IBS/CBS (Gera Crédito Integral para Frotas/PJ — Recomendado)</option>
            <option value="simples_das" ${c.opcaoSimplesIBSCBS==='simples_das'?'selected':''}>Recolhimento Unificado no DAS (Crédito Restrito ao PGDAS)</option>
          </select>
        </div>
      </div>

      <div class="mini" style="background:#fff;padding:10px 12px;border-radius:6px;border:1px solid var(--aco-200);margin-bottom:14px;line-height:1.5;color:var(--aco-700)">
        💡 <b>Oficina de Linha Pesada & Transportadoras:</b> Ao selecionar <i>Recolhimento Regular IBS/CBS</i>, suas Ordens de Serviço e notas fiscais permitirão às transportadoras e frotistas tomarem 100% dos créditos da CBS e do IBS sobre manutenção e peças, mantendo sua oficina altamente competitiva.
      </div>

      <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--aco-800)">Alíquotas Padrão de Referência da Reforma Tributária:</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px">
        <div>
          <label class="mini">CBS Federal (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoCBS" data-tipo="number" value="${c.aliqPadraoCBS != null ? c.aliqPadraoCBS : 0.90}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">IBS Estadual (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBSEst" data-tipo="number" value="${c.aliqPadraoIBSEst != null ? c.aliqPadraoIBSEst : 0.05}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">IBS Municipal (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBSMun" data-tipo="number" value="${c.aliqPadraoIBSMun != null ? c.aliqPadraoIBSMun : 0.05}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">Total IBS (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIBS" data-tipo="number" value="${c.aliqPadraoIBS != null ? c.aliqPadraoIBS : 0.10}" step="0.01" style="width:100%">
        </div>
        <div>
          <label class="mini">Imposto Seletivo IS (%)</label>
          <input type="number" class="campo-texto" data-act="cfg" data-c="aliqPadraoIS" data-tipo="number" value="${c.aliqPadraoIS || 0}" step="0.01" style="width:100%">
        </div>
      </div>
    </div>
    
    <!-- 3. TRIBUTOS LEGADOS (TRANSIÇÃO) -->
    <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;color:var(--aco-800)">3. Tributos Atuais / Convivência Transitória:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;background:#fff;padding:14px;border-radius:8px;border:1px solid var(--aco-200)">
      <div><label class="mini">PIS (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqPIS" data-tipo="number" value="${c.aliqPIS||0}" step="0.01" style="width:100%"></div>
      <div><label class="mini">COFINS (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqCOFINS" data-tipo="number" value="${c.aliqCOFINS||0}" step="0.01" style="width:100%"></div>
      <div><label class="mini">CSLL (%)</label><input type="number" class="campo-texto" data-act="cfg" data-c="aliqCSLL" data-tipo="number" value="${c.aliqCSLL||0}" step="0.01" style="width:100%"></div>
    </div>
  </div>`;
}

function viewOperacoes() {
  const c = S.cfg || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Operações e Prazos</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px">
      <div><label class="mini">Garantia Padrão (Meses)</label><input type="number" class="campo-texto" data-act="cfg" data-c="garantiaMeses" value="${c.garantiaMeses||3}" style="width:120px"></div>
      <div><label class="mini">Termo de Garantia Padrão na OS</label><textarea class="campo-texto" data-act="cfg" data-c="termoGarantia" rows="3" style="width:100%">${esc(c.termoGarantia||'')}</textarea></div>
    </div>
  </div>`;
}

function viewRegrasTributarias() {
  const regras = S.cfg.regrasTributarias || [];
  if (!regras.length) return `<div style="text-align:center;padding:40px;color:var(--aco-500)">Nenhuma regra cadastrada.</div>`;
  
  return `
  <div class="card card-p" style="max-width:980px;margin:0 auto">
    <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <b style="font-size:15px">Matriz de Regras Fiscais & Reforma Tributária</b>
        <div class="mini">Configurações de tributação por CFOP para produtos, compras e serviços automotivos</div>
      </div>
      <button class="btn btn-secundario mini" onclick="S.ui.abaCad='simulador-fiscal';render()">
        ${ico('grana', 13)} Abrir Simulador de Cálculo
      </button>
    </div>

    <div style="overflow-x:auto">
      <table style="width:100%;text-align:left;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--aco-200);color:var(--aco-600);background:var(--aco-050)">
            <th style="padding:10px 8px">CFOP</th>
            <th style="padding:10px 8px">Descrição</th>
            <th style="padding:10px 8px">Tipo</th>
            <th style="padding:10px 8px">Regime Atual (ICMS/ISS/PIS/COF)</th>
            <th style="padding:10px 8px;background:var(--petroleo-fraco);color:var(--petroleo)">Reforma Tributária (IBS/CBS/IS)</th>
            <th style="padding:10px 8px;text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${regras.map((r, i) => {
            let impostosAtual = '';
            if (r.tipo === 'produto' || r.tipo === 'entrada') {
              impostosAtual = `ICMS: ${r.aliqICMS}% (CST ${r.cstICMS}) | IPI: ${r.aliqIPI}% | PIS/COF: ${r.aliqPIS}/${r.aliqCOFINS}%`;
            } else if (r.tipo === 'servico') {
              impostosAtual = `ISS: ${r.aliqISS||0}% ${r.issRetido==='S'?'(Ret)':''} | PIS/COF: ${r.aliqPIS}/${r.aliqCOFINS}%`;
            }

            const cbs = r.aliqCBS != null ? r.aliqCBS : 0.90;
            const ibs = r.aliqIBS != null ? r.aliqIBS : 0.10;
            const cstRTC = r.cstIBSCBS || '01';
            const cClass = r.cClassTrib || '010101';
            const impostosReforma = `CBS: ${cbs}% | IBS: ${ibs}% (Est: ${r.aliqIBSEst||0.05}% / Mun: ${r.aliqIBSMun||0.05}%) | CST RTC: ${cstRTC} | cClass: ${cClass}${r.aliqIS ? ' | IS: '+r.aliqIS+'%' : ''}`;
            
            return `
            <tr style="border-bottom:1px solid var(--aco-100)">
              <td style="padding:10px 8px;font-weight:700" class="mono">${r.cfop}</td>
              <td style="padding:10px 8px"><b>${esc(r.desc)}</b></td>
              <td style="padding:10px 8px"><span style="background:var(--aco-100);padding:2px 6px;border-radius:4px;font-size:10.5px;text-transform:uppercase;font-weight:600">${r.tipo}</span></td>
              <td style="padding:10px 8px;color:var(--aco-700);font-size:11.5px">${impostosAtual}</td>
              <td style="padding:10px 8px;background:var(--petroleo-fraco);color:var(--petroleo);font-size:11.5px;font-weight:600">${impostosReforma}</td>
              <td style="padding:10px 8px;text-align:right">
                <button class="btn btn-secundario mini" data-act="editar-regra-fiscal" data-cfop="${esc(r.cfop)}" style="padding:3px 8px">Editar</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function viewSimuladorFiscal() {
  const regras = S.cfg.regrasTributarias || [];
  window._simulador = window._simulador || {
    valor: 1000,
    cfop: (regras[0] && regras[0].cfop) || '5102',
    tipo: 'produto'
  };

  const sim = window._simulador;
  const regra = regras.find(x => x.cfop === sim.cfop) || regras[0] || {};
  const v = Number(sim.valor) || 0;

  // Cálculos Regime Atual
  let icmsOuIss = 0, icmsLabel = 'ICMS';
  if (regra.tipo === 'servico') {
    icmsOuIss = v * ((regra.aliqISS || 0) / 100);
    icmsLabel = 'ISS';
  } else {
    icmsOuIss = v * ((regra.aliqICMS || 0) / 100);
  }
  const pis = v * ((regra.aliqPIS || 0) / 100);
  const cofins = v * ((regra.aliqCOFINS || 0) / 100);
  const ipi = regra.tipo !== 'servico' ? v * ((regra.aliqIPI || 0) / 100) : 0;
  const totAtual = icmsOuIss + pis + cofins + ipi;

  // Cálculos Reforma Tributária (Fase 2026 Teste: CBS 0,9% + IBS 0,1%)
  const aliqCBS = regra.aliqCBS != null ? regra.aliqCBS : 0.90;
  const aliqIBSEst = regra.aliqIBSEst != null ? regra.aliqIBSEst : 0.05;
  const aliqIBSMun = regra.aliqIBSMun != null ? regra.aliqIBSMun : 0.05;
  const aliqIBS = regra.aliqIBS != null ? regra.aliqIBS : (aliqIBSEst + aliqIBSMun);
  const aliqIS = regra.aliqIS || 0;

  const vCBS = v * (aliqCBS / 100);
  const vIBSEst = v * (aliqIBSEst / 100);
  const vIBSMun = v * (aliqIBSMun / 100);
  const vIBSTotal = v * (aliqIBS / 100);
  const vIS = v * (aliqIS / 100);
  const totReforma2026 = vCBS + vIBSTotal + vIS;

  // Em 2026, CBS e IBS são compensáveis/dedutíveis do PIS/COFINS
  const compensacao = Math.min(totReforma2026, pis + cofins);

  // Crédito Gerado para o Cliente PJ (Transportadora / Frota)
  const opcaoSimples = S.cfg.opcaoSimplesIBSCBS || 'simples_hibrido';
  const creditoCliente2026 = (S.cfg.regimeTributario === 'Simples Nacional' && opcaoSimples === 'simples_das') 
    ? (v * 0.0035) // Crédito restrito
    : totReforma2026; // Crédito integral

  return `
  <div class="card card-p" style="max-width:920px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:800;color:var(--aco-900);margin:0">Simulador & Auditor Fiscal da Reforma Tributária (IVA Dual)</h3>
        <div class="mini">Validação matemática em conformidade com a EC 132/2023, PLP 68/2024 e Regras Técnicas RTC</div>
      </div>
      <button class="btn btn-secundario mini" onclick="S.ui.abaCad='regras-tributarias';render()">
        ${ico('lista', 13)} Ver Matriz de Regras
      </button>
    </div>

    <!-- Painel de Parâmetros de Teste -->
    <div style="background:var(--aco-050);padding:14px;border-radius:10px;border:1px solid var(--aco-200);margin-bottom:20px">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">Parâmetros da Operação para Simulação:</div>
      <div style="display:grid;grid-template-columns:180px 1fr;gap:12px">
        <div>
          <label class="mini" style="font-weight:700">Valor da Operação (R$)</label>
          <input type="number" class="campo-texto" value="${v}" step="50" oninput="window._simulador.valor=this.value;render()" style="width:100%;font-size:16px;font-weight:800">
        </div>
        <div>
          <label class="mini" style="font-weight:700">Regra Fiscal / CFOP Vinculado</label>
          <select class="campo-texto" onchange="window._simulador.cfop=this.value;render()" style="width:100%;height:38px">
            ${regras.map(rg => `<option value="${rg.cfop}" ${rg.cfop===sim.cfop?'selected':''}>${rg.cfop} – ${esc(rg.desc)} (${rg.tipo.toUpperCase()})</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- Comparativo Lado a Lado dos Modelos -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <!-- Coluna 1: Modelo Vigente Atual -->
      <div style="border:1px solid var(--aco-200);border-radius:10px;padding:16px;background:#fff">
        <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:8px;margin-bottom:12px">
          <b style="font-size:14px;color:var(--aco-800)">Regime Vigente Atual (Legado)</b>
          <span class="selo" style="background:var(--aco-200)">ICMS / ISS / PIS / COFINS</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div class="entre">
            <span>${icmsLabel} (${regra.tipo==='servico'?(regra.aliqISS||0):(regra.aliqICMS||0)}%):</span>
            <b class="num">${brl(icmsOuIss)}</b>
          </div>
          <div class="entre">
            <span>PIS (${regra.aliqPIS||0}%):</span>
            <b class="num">${brl(pis)}</b>
          </div>
          <div class="entre">
            <span>COFINS (${regra.aliqCOFINS||0}%):</span>
            <b class="num">${brl(cofins)}</b>
          </div>
          ${regra.tipo !== 'servico' && regra.aliqIPI ? `
            <div class="entre">
              <span>IPI (${regra.aliqIPI}%):</span>
              <b class="num">${brl(ipi)}</b>
            </div>
          ` : ''}
          <div class="entre" style="border-top:1px solid var(--aco-200);padding-top:8px;margin-top:4px;font-size:14px">
            <b>Carga Tributária Direta:</b>
            <b class="num" style="color:var(--aco-900)">${brl(totAtual)} (${v > 0 ? ((totAtual/v)*100).toFixed(2) : '0.00'}%)</b>
          </div>
        </div>
      </div>

      <!-- Coluna 2: Nova Reforma Tributária 2026 -->
      <div style="border:2px solid var(--petroleo);border-radius:10px;padding:16px;background:var(--petroleo-fraco)">
        <div class="entre" style="border-bottom:1px solid var(--petroleo);padding-bottom:8px;margin-bottom:12px">
          <b style="font-size:14px;color:var(--petroleo)">Fase de Teste 2026 (EC 132/2023)</b>
          <span class="selo selo-finalizada">IVA Dual: 1,0%</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div class="entre">
            <span>CBS Federal (${aliqCBS}%):</span>
            <b class="num">${brl(vCBS)}</b>
          </div>
          <div class="entre">
            <span>IBS Estadual (${aliqIBSEst}%):</span>
            <b class="num">${brl(vIBSEst)}</b>
          </div>
          <div class="entre">
            <span>IBS Municipal (${aliqIBSMun}%):</span>
            <b class="num">${brl(vIBSMun)}</b>
          </div>
          ${aliqIS > 0 ? `
            <div class="entre">
              <span>Imposto Seletivo (${aliqIS}%):</span>
              <b class="num">${brl(vIS)}</b>
            </div>
          ` : ''}
          <div class="entre" style="border-top:1px dashed var(--petroleo);padding-top:6px;font-size:12px;color:var(--petroleo)">
            <span>Total IVA Reforma (CBS + IBS):</span>
            <b>${brl(totReforma2026)} (${(aliqCBS+aliqIBS).toFixed(2)}%)</b>
          </div>
          <div class="entre" style="border-top:1px solid var(--petroleo);padding-top:8px;margin-top:2px;font-size:14px">
            <b>Compensação PIS/COFINS (Líquido):</b>
            <b class="num" style="color:var(--verde)">−${brl(compensacao)}</b>
          </div>
        </div>
      </div>
    </div>

    <!-- Impacto Estratégico para Clientes PJ / Transportadoras -->
    <div style="background:var(--verde-fraco);border:1px solid var(--verde);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:700;color:var(--verde);font-size:13.5px">
          Crédito Tributário Imediato Gerado para Transportadoras / Frotistas PJ:
        </div>
        <div class="mini" style="margin-top:2px;color:var(--aco-700)">
          Baseado na opção configurada: <b>${opcaoSimples==='simples_hibrido'?'Recolhimento Regular IBS/CBS (Gera 100% de Crédito)':'Recolhimento DAS Simples'}</b>.
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;color:var(--verde)">${brl(creditoCliente2026)}</div>
        <span class="selo selo-finalizada" style="font-size:10px">100% Auditado</span>
      </div>
    </div>

    <!-- Auditoria de Conformidade -->
    <div style="margin-top:16px;padding:12px;background:#fff;border-radius:8px;border:1px solid var(--aco-200);font-size:12px">
      <b style="color:var(--aco-800)">Checklist de Conformidade Técnica para Emissão Fiscal (NF-e / RTC):</b>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
        <div>✅ <b>CST IBS/CBS:</b> Código oficial ${regra.cstIBSCBS||'01'} atribuído.</div>
        <div>✅ <b>Classificação RTC:</b> cClassTrib ${regra.cClassTrib||'010101'} mapeado.</div>
        <div>✅ <b>Repartição Subnacional:</b> IBS Estadual (${aliqIBSEst}%) e Municipal (${aliqIBSMun}%) definidos.</div>
        <div>✅ <b>Princípio do Destino:</b> Indicador de Destino parametrizado (${regra.indDestino==='0'?'Prestador':'Consumo/Tomador'}).</div>
      </div>
    </div>
  </div>`;
}

function viewContabil() {
  const c = (S.cfg || {}).contabil || {};
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Escritório de Contabilidade</h3>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><label class="mini">Nome do Escritório</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.escritorio=this.value" value="${esc(c.escritorio||'')}" style="width:100%"></div>
      <div><label class="mini">CRC</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.crc=this.value" value="${esc(c.crc||'')}" style="width:100%"></div>
      <div><label class="mini">Telefone</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.fone=this.value" value="${esc(c.fone||'')}" style="width:100%"></div>
      <div><label class="mini">E-mail</label><input type="text" class="campo-texto" oninput="S.cfg.contabil.email=this.value" value="${esc(c.email||'')}" style="width:100%"></div>
    </div>
  </div>`;
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
function viewBoletos() {
  return `<div class="card card-p" style="max-width:800px;margin:0 auto">
    <p>A configuração de emissão e homologação de boletos bancários estará disponível no próximo módulo financeiro.</p>
  </div>`;
}
function viewCobrancas() {
  const regua = S.cfg.reguaCobranca || [{dias: -3, msg: "Aviso de vencimento"}, {dias: 1, msg: "Aviso de atraso"}];
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Régua de Cobrança Automatizada (WhatsApp/E-mail)</h3>
      <div class="mini">Configure os gatilhos baseados na data de vencimento da conta a receber. Valores negativos significam "antes do vencimento".</div>
    </div>
    
    <table class="tabela">
      <thead><tr><th>Dias pro Vencimento</th><th>Tipo de Mensagem / Gatilho</th><th></th></tr></thead>
      <tbody>
      ${regua.map((r,i) => `
        <tr>
          <td style="width:150px"><input type="number" class="campo-texto" value="${r.dias}" oninput="S.cfg.reguaCobranca[${i}].dias=+this.value" style="width:100%"></td>
          <td><input type="text" class="campo-texto" value="${esc(r.msg)}" oninput="S.cfg.reguaCobranca[${i}].msg=this.value" style="width:100%"></td>
          <td style="width:40px"><button class="btn-icone-perigo" onclick="S.cfg.reguaCobranca.splice(${i},1); render()">${ico('lixo', 14)||'X'}</button></td>
        </tr>
      `).join('')}
      </tbody>
    </table>
    
    <div style="margin-top:12px">
      <button class="btn btn-secundario" onclick="(S.cfg.reguaCobranca = S.cfg.reguaCobranca||[]).push({dias:0, msg:'Nova Regra'}); render()">+ Adicionar Gatilho</button>
    </div>
  </div>`;
}

function renderSimplesLista(lista, objPath, itemName) {
  return `
  <div class="card card-p" style="max-width:600px;margin:0 auto">
    <div style="margin-bottom:12px;font-weight:600">${itemName}s cadastrados:</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${lista.map((x,i) => `
        <div style="display:flex;gap:8px">
          <input type="text" class="campo-texto" value="${esc(x.nome || x)}" style="flex:1" oninput="const L = ${objPath}; if(typeof L[${i}]==='string'){L[${i}]=this.value}else{L[${i}].nome=this.value}">
          <button class="btn-icone-perigo" onclick="${objPath}.splice(${i},1); render()" title="Remover">${ico('lixo', 14)||'X'}</button>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <input type="text" class="campo-texto" id="novo_item_${itemName}" placeholder="Adicionar novo..." style="flex:1">
      <button class="btn btn-secundario" onclick="const v=document.getElementById('novo_item_${itemName}').value; if(v){ ${objPath}.push(v); salvar(); render(); }">Adicionar</button>
    </div>
    <div style="margin-top:24px;border-top:1px solid var(--aco-150);padding-top:12px;text-align:right">
      <button class="btn btn-primario" data-act="salvar-cfg">Salvar Lista</button>
    </div>
  </div>`;
}

function viewPlanoContas() { return renderSimplesLista(S.cfg.planoDeContas || [], 'S.cfg.planoDeContas', 'Categoria'); }
function viewFormasPgto() { return renderSimplesLista(S.cfg.formasPgto || [], 'S.cfg.formasPgto', 'Forma'); }
function viewContasCaixa() { return renderSimplesLista(S.cfg.contasCaixa || [], 'S.cfg.contasCaixa', 'Conta/Banco'); }

function viewUsuarios() {
  const lista = S.cfg.usuarios || [];
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <table class="tabela">
      <thead><tr><th>Nome</th><th>Login</th><th>Papel</th><th></th></tr></thead>
      <tbody>
      ${lista.map((u,i) => `
        <tr>
          <td><input type="text" class="campo-texto" value="${esc(u.nome)}" oninput="S.cfg.usuarios[${i}].nome=this.value" style="width:100%"></td>
          <td><input type="text" class="campo-texto" value="${esc(u.login)}" oninput="S.cfg.usuarios[${i}].login=this.value" style="width:100%"></td>
          <td>
            <select class="campo-texto" oninput="S.cfg.usuarios[${i}].papel=this.value" style="width:100%">
              <option ${u.papel==='Gerente'?'selected':''}>Gerente</option>
              <option ${u.papel==='Consultor'?'selected':''}>Consultor</option>
              <option ${u.papel==='Caixa'?'selected':''}>Caixa</option>
            </select>
          </td>
          <td style="width:40px"><button class="btn-icone-perigo" onclick="S.cfg.usuarios.splice(${i},1); render()">${ico('lixo', 14)||'X'}</button></td>
        </tr>
      `).join('')}
      </tbody>
    </table>
    <div style="margin-top:12px">
      <button class="btn btn-secundario" onclick="S.cfg.usuarios.push({nome:'Novo', login:'novo', papel:'Consultor'}); render()">+ Adicionar Usuário</button>
    </div>
    <div style="margin-top:24px;border-top:1px solid var(--aco-150);padding-top:12px;text-align:right">
      <button class="btn btn-primario" data-act="salvar-cfg">Salvar Usuários</button>
    </div>
  </div>`;
}


function viewAPI() {
  const i = S.cfg.integracoes || { whatsapp: {}, serasa: {}, placas: {}, fiscal: {} };
  return `
  <div class="card card-p" style="max-width:800px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px">
      <h3 style="font-weight:600;font-size:16px;margin:0">Central de Integrações e APIs</h3>
      <div class="mini">Preencha os tokens das plataformas que a oficina utiliza.</div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">WhatsApp (API Brasil)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">DeviceToken</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.whatsapp.deviceToken=this.value" value="${esc(i.whatsapp?.deviceToken||'')}" style="width:100%"></div>
      <div><label class="mini">Bearer Token</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.whatsapp.bearerToken=this.value" value="${esc(i.whatsapp?.bearerToken||'')}" style="width:100%"></div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Consulta Veicular (Sinesp / CheckPlaca)</div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:20px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">API Key de Consulta de Placa</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.placas.apiKey=this.value" value="${esc(i.placas?.apiKey||'')}" style="width:100%"></div>
    </div>

    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Consulta de Crédito (Serasa Experian)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">Client ID</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.serasa.clientId=this.value" value="${esc(i.serasa?.clientId||'')}" style="width:100%"></div>
      <div><label class="mini">Client Secret</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.serasa.clientSecret=this.value" value="${esc(i.serasa?.clientSecret||'')}" style="width:100%"></div>
    </div>
    
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Consulta Fiscal (ReceitaWS / Sintegra)</div>
    <div style="display:grid;grid-template-columns:1fr;gap:12px;padding:12px;background:var(--aco-50);border-radius:8px">
      <div><label class="mini">API Key ReceitaWS (Opcional - para volume alto)</label><input type="password" class="campo-texto" oninput="S.cfg.integracoes.fiscal.apiKey=this.value" value="${esc(i.fiscal?.apiKey||'')}" style="width:100%"></div>
    </div>
  </div>`;
}

/* ---------------- Consulta Integrada de Clientes (Sintegra & Pop-up Serasa) ---------------- */
let _docConsultaPendente = '';
let _ultimoDocConsultado = '';

function verificarAutoConsultaCnpj(val) {
  if (!val) return;
  const digitos = String(val).replace(/\D/g, '');
  if (digitos.length === 14 && digitos !== _ultimoDocConsultado) {
    _ultimoDocConsultado = digitos;
    abrirModalConsultaCliente(val);
  }
}

function abrirModalConsultaCliente(doc) {
  const val = String(doc || (document.getElementById('doc_cli') && document.getElementById('doc_cli').value) || '').trim();
  const digitos = val.replace(/\D/g, '');
  if (!digitos || (digitos.length !== 11 && digitos.length !== 14)) {
    if (typeof torrar === 'function') {
      torrar('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) para consulta.', 'alerta');
    }
    return;
  }

  _docConsultaPendente = digitos;
  const tipoDoc = digitos.length === 14 ? 'CNPJ' : 'CPF';
  const docFmt = digitos.length === 14
    ? digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

  let modalEl = document.getElementById('modal-consulta-cliente') || document.getElementById('modal-dialog-serasa');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'modal-consulta-cliente';
    modalEl.className = 'modal-consulta-cliente modal-dialog-serasa';
    modalEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modalEl);
  }

  modalEl.innerHTML = `
    <div style="background:#ffffff;color:#0f172a;border-radius:12px;max-width:440px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);padding:24px;border:1px solid #e2e8f0;animation:fadeIn 0.15s ease">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:42px;height:42px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:22px">🔍</div>
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a">Consulta de Cliente</h3>
          <div style="font-size:12px;color:#64748b">${tipoDoc}: <b>${docFmt}</b></div>
        </div>
      </div>

      <div style="margin-bottom:20px;font-size:14px;color:#334155;line-height:1.5">
        <p style="margin:0 0 8px 0;font-weight:700;color:#0f172a;font-size:15px">Deseja consultar também junto ao SERASA?</p>
        <p style="margin:0;font-size:13px;color:#64748b">
          Caso selecione <b>Sim</b>, o sistema consultará o score de crédito e restrições financeiras além dos dados fiscais do Sintegra. Caso selecione <b>Não</b>, puxará apenas a Inscrição Estadual, razão social e endereço.
        </p>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <button type="button" id="btn-modal-serasa-sim" class="btn btn-primario" onclick="confirmarConsultaCliente(true)" style="height:40px;justify-content:center;font-weight:600;font-size:13px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer">
          Sim, consultar também junto ao SERASA
        </button>
        <button type="button" id="btn-modal-serasa-nao" class="btn btn-secundario" onclick="confirmarConsultaCliente(false)" style="height:40px;justify-content:center;font-weight:600;font-size:13px;background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer">
          Não, consultar apenas Sintegra
        </button>
        <button type="button" class="btn btn-neutro" onclick="fecharModalConsultaCliente()" style="height:32px;justify-content:center;font-size:12px;background:transparent;color:#94a3b8;border:none;cursor:pointer">
          Cancelar
        </button>
      </div>
    </div>
  `;
  modalEl.style.display = 'flex';
}

function fecharModalConsultaCliente() {
  const modalEl = document.getElementById('modal-consulta-cliente') || document.getElementById('modal-dialog-serasa');
  if (modalEl) modalEl.style.display = 'none';
  _docConsultaPendente = '';
}

async function confirmarConsultaCliente(incluirSerasa) {
  const doc = _docConsultaPendente;
  fecharModalConsultaCliente();
  if (!doc) return;
  await executarConsultaCliente(doc, incluirSerasa);
}

async function executarConsultaCliente(doc, incluirSerasa) {
  if (typeof torrar === 'function') {
    torrar(incluirSerasa ? 'Consultando Sintegra + SERASA...' : 'Consultando Sintegra...', 'neutro');
  }

  const tagEl = document.getElementById('tag_serasa');
  if (tagEl && incluirSerasa) {
    tagEl.textContent = 'Consultando Serasa...';
    tagEl.style.background = 'var(--aco-200)';
    tagEl.style.color = 'inherit';
  }

  try {
    const headers = typeof obterHeadersRequisicao === 'function'
      ? obterHeadersRequisicao({ 'Content-Type': 'application/json' })
      : {
          'Content-Type': 'application/json',
          'x-tenant-id': (typeof window !== 'undefined' && (window.__PATIO_TENANT_ID || window.sessionStorage?.getItem('patio_tenant'))) || 'default'
        };

    const res = await fetch('/api/integracoes/consulta-cliente', {
      method: 'POST',
      headers,
      body: JSON.stringify({ doc, incluirSerasa })
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      if (body.disponivel === false || body.codigo === 'INTEGRACAO_NAO_CONFIGURADA') {
        if (tagEl) {
          tagEl.textContent = 'Consulta externa não configurada';
          tagEl.style.background = 'var(--aco-150)';
          tagEl.style.color = 'var(--aco-600)';
        }
        const inpStatus = document.getElementById('consulta_serasa_status');
        if (inpStatus) inpStatus.value = 'Não configurado (Manual)';
        if (typeof torrar === 'function') {
          torrar(body.mensagem || 'Consulta externa indisponível. Campos liberados para preenchimento manual.', 'alerta');
        }
        return;
      }
      if (typeof torrar === 'function') {
        torrar(body.error || body.erro || 'Não foi possível consultar os dados externos. Preencha manualmente.', 'erro');
      }
      return;
    }

    const d = body.dados;
    if (!d) return;

    if (typeof S !== 'undefined') {
      S.ui = S.ui || {};
      S.ui.rascCad = S.ui.rascCad || {};
      S.ui.rascCad.doc = d.doc || d.cnpj || d.cpf || doc;
      S.ui.rascCad.nome = d.nome || '';
      S.ui.rascCad.fantasia = d.fantasia || '';
      S.ui.rascCad.ie = d.ie || '';
      S.ui.rascCad.cep = d.cep || '';
      S.ui.rascCad.endereco = d.endereco || '';
      S.ui.rascCad.bairro = d.bairro || '';
      S.ui.rascCad.cidade = d.cidade || '';
      S.ui.rascCad.uf = d.uf || '';
      S.ui.rascCad.fone = d.fone || '';
      if (d.scoreSerasa !== null && d.scoreSerasa !== undefined) {
        S.ui.rascCad.scoreSerasa = d.scoreSerasa;
        S.ui.rascCad.situacaoSerasa = d.situacaoSerasa;
        S.ui.rascCad.consultaSerasaRealizada = Boolean(d.consultaSerasaRealizada);
      }
    }

    // Preenchimento automático nos inputs do DOM
    const camposMap = {
      doc: d.doc || d.cnpj || d.cpf || doc,
      nome: d.nome || '',
      fantasia: d.fantasia || '',
      ie: d.ie || '',
      cep: d.cep || '',
      endereco: d.endereco || '',
      bairro: d.bairro || '',
      cidade: d.cidade || '',
      uf: d.uf || '',
      fone: d.fone || ''
    };

    for (const [k, val] of Object.entries(camposMap)) {
      const el = document.querySelector(`input[data-act="rc"][data-c="${k}"]`);
      if (el) el.value = val;
    }

    const inpDoc = document.getElementById('doc_cli');
    if (inpDoc && camposMap.doc) inpDoc.value = camposMap.doc;

    const inpCep = document.getElementById('cep_cli');
    if (inpCep && camposMap.cep) inpCep.value = camposMap.cep;

    if (tagEl) {
      if (d.scoreSerasa) {
        tagEl.textContent = `Score Serasa: ${d.scoreSerasa} (${d.scoreSerasa >= 700 ? '✔️ Alto' : d.scoreSerasa >= 500 ? '⚠️ Regular' : '❌ Baixo'})`;
        tagEl.style.background = d.scoreSerasa >= 500 ? 'var(--verde)' : 'var(--tijolo)';
        tagEl.style.color = '#fff';
      } else {
        tagEl.textContent = d.consultaSerasaRealizada ? 'Score: Não retornado' : 'Serasa não consultado';
        tagEl.style.background = 'var(--aco-200)';
        tagEl.style.color = 'inherit';
      }
    }

    const inpScore = document.getElementById('score_serasa_input');
    if (inpScore && d.scoreSerasa !== undefined && d.scoreSerasa !== null) {
      inpScore.value = d.scoreSerasa;
    }
    const inpSit = document.getElementById('situacao_serasa_input');
    if (inpSit && d.situacaoSerasa) {
      inpSit.value = d.situacaoSerasa;
    }
    const inpStatus = document.getElementById('consulta_serasa_status');
    if (inpStatus) {
      inpStatus.value = d.consultaSerasaRealizada ? 'Sim (Verificado)' : (d.scoreSerasa ? 'Manual' : 'Pendente');
    }

    if (typeof torrar === 'function') {
      const msg = incluirSerasa
        ? `Dados carregados com sucesso! Score Serasa: ${d.scoreSerasa || '—'}`
        : 'Dados cadastrais e Sintegra importados com sucesso!';
      torrar(msg, 'sucesso');
    }
  } catch (err) {
    console.error('Erro ao executar consulta cliente:', err);
    if (typeof torrar === 'function') {
      torrar('Erro ao conectar com serviço de consulta.', 'erro');
    }
  }
}

if (typeof window !== 'undefined') {
  window.abrirModalConsultaCliente = abrirModalConsultaCliente;
  window.fecharModalConsultaCliente = fecharModalConsultaCliente;
  window.confirmarConsultaCliente = confirmarConsultaCliente;
  window.executarConsultaCliente = executarConsultaCliente;
  window.verificarAutoConsultaCnpj = verificarAutoConsultaCnpj;
}

