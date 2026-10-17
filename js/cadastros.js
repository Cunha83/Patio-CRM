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


// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.cardCad = cardCad;
  window.viewCadastros = viewCadastros;
  window.tabelaClientes = tabelaClientes;
  window.tabelaVeiculos = tabelaVeiculos;
  window.tabelaServicos = tabelaServicos;
  window.tabelaFornecedores = tabelaFornecedores;
  window.tabelaMecanicos = tabelaMecanicos;
  window.tabelaProdutos = tabelaProdutos;
  window.viewEmpresa = viewEmpresa;
  window.tabelaBoxes = tabelaBoxes;
}
