/* =====================================================================
   PÁTIO CRM — EQUIPE, BOXES & EMPRESA
   Submódulo de mecânicos, boxes físicos da oficina e dados da empresa
   ===================================================================== */

function tabelaMecanicos() {
  const busca = ((S.ui && S.ui.buscaCad) || '').toLowerCase().trim();
  let lista = S.mecanicos || [];

  if (busca) {
    lista = lista.filter(m => 
      (m.nome || '').toLowerCase().includes(busca) ||
      (m.especialidade || '').toLowerCase().includes(busca)
    );
  }

  return `
  <div style="margin-bottom:12px">
    <input type="text" class="campo-texto" placeholder="🔍 Buscar mecânico por nome ou especialidade..." 
           value="${esc((S.ui && S.ui.buscaCad) || '')}" 
           oninput="S.ui.buscaCad=this.value;render()" 
           style="width:100%;max-width:480px;height:36px;font-size:13px">
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Nome do Colaborador</th>
            <th>Especialidade</th>
            <th>Telefone / WhatsApp</th>
            <th style="width:120px;text-align:center">OS em Andamento</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum mecânico cadastrado.</td></tr>` : lista.map(m => {
            const osEmAndamento = (S.os || []).filter(o => o.mecanico === m.id && o.st === 'executando');
            return `
            <tr>
              <td><div style="font-weight:700;color:var(--aco-900)">${esc(m.nome)}</div></td>
              <td><span class="selo">${esc(m.especialidade || 'Geral')}</span></td>
              <td class="mono">${esc(m.fone || '—')}</td>
              <td style="text-align:center">
                <span class="selo ${osEmAndamento.length ? 'selo-executando' : 'selo-fila'}">${osEmAndamento.length} OS</span>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="mecanico" data-id="${m.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="mecanico" data-id="${m.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function tabelaBoxes() {
  const lista = S.boxes || [];

  return `
  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Identificação do Box</th>
            <th>Especialidade / Equipamento</th>
            <th style="width:160px;text-align:center">Status Atual</th>
            <th style="width:120px;text-align:center">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista.length === 0 ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--aco-500)">Nenhum box cadastrado.</td></tr>` : lista.map(b => {
            const osNoBox = (S.os || []).find(o => o.box === b.id && o.st !== 'finalizada' && o.st !== 'cancelada');
            return `
            <tr>
              <td><b>${esc(b.nome)}</b></td>
              <td><span class="selo">${esc(b.tipo || 'Geral')}</span></td>
              <td style="text-align:center">
                <span class="selo ${osNoBox ? 'selo-executando' : 'selo-finalizada'}">
                  ${osNoBox ? `Ocupado (OS ${osNoBox.num})` : '● Livre'}
                </span>
              </td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <button class="btn-icone" data-act="editar-cad" data-t="box" data-id="${b.id}" title="Editar">${ico('edit', 14)}</button>
                  <button class="btn-icone-perigo" data-act="excluir-cad" data-t="box" data-id="${b.id}" title="Excluir">${ico('lixo', 14)}</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function viewEmpresa() {
  const c = S.cfg || {};
  const logoSrc = (c.identidadeVisual && (c.identidadeVisual.logoUrl || c.identidadeVisual.logo)) || c.logoEmpresa;
  const instSrc = (c.identidadeVisual && (c.identidadeVisual.imagemInstitucionalUrl || c.identidadeVisual.imagemInstitucional)) || c.imagemInstitucional;

  return `
  <div class="card card-p" style="max-width:880px;margin:0 auto">
    <div style="margin-bottom:16px;border-bottom:1px solid var(--aco-150);padding-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3 style="font-weight:700;font-size:17px;margin:0">Dados Cadastrais da Empresa</h3>
        <div class="mini" style="color:var(--aco-500)">Informações impressas em ordens de serviço, notas fiscais, orçamentos e relatórios.</div>
      </div>
      <button class="btn btn-primario" data-act="salvar-cfg">${ico('check', 14)} Salvar Alterações</button>
    </div>

    <!-- 1. IDENTIDADE VISUAL DUAL (LOGO + FACHADA) -->
    <div style="margin-bottom:24px;background:var(--aco-50,#f8fafc);border:1px solid var(--aco-200,#e2e8f0);border-radius:10px;padding:16px">
      <div style="font-weight:700;font-size:14px;color:var(--aco-800);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <span>🖼️ Identidade Visual da Empresa</span>
        <span class="selo selo-finalizada" style="font-size:10px">PNG, JPEG ou WEBP (máx. 2MB)</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <!-- CARD LOGOTIPO -->
        <div style="background:#fff;border:1px solid var(--aco-200,#cbd5e1);border-radius:8px;padding:14px;display:flex;flex-direction:column;align-items:center;text-align:center">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">Logotipo da Oficina / Empresa</div>
          <div style="width:100%;height:110px;background:#f8fafc;border:1px dashed var(--aco-300,#94a3b8);border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;overflow:hidden">
            ${logoSrc ? `
              <img src="${esc(logoSrc)}" alt="Logo" style="max-height:95px;max-width:90%;object-fit:contain">
            ` : `
              <div style="color:var(--aco-400);font-size:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                ${ico('patio', 28)}
                <span>Sem logotipo carregado</span>
              </div>
            `}
          </div>
          <input type="file" id="cfg-input-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none">
          <div style="display:flex;gap:6px">
            <button class="btn btn-secundario" type="button" onclick="document.getElementById('cfg-input-logo').click()" style="font-size:12px;padding:5px 12px">
              ${ico('upload', 14)} Escolher Logo
            </button>
            ${logoSrc ? `
              <button class="btn btn-perigo" type="button" data-act="remover-logo" style="font-size:12px;padding:5px 10px" title="Remover logotipo">
                ${ico('lixo', 14)}
              </button>
            ` : ''}
          </div>
          <div class="mini" style="color:var(--aco-500);margin-top:6px">Aparece na barra superior, nas OS e orçamentos.</div>
        </div>

        <!-- CARD IMAGEM INSTITUCIONAL / FACHADA -->
        <div style="background:#fff;border:1px solid var(--aco-200,#cbd5e1);border-radius:8px;padding:14px;display:flex;flex-direction:column;align-items:center;text-align:center">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">Imagem Institucional / Fachada</div>
          <div style="width:100%;height:110px;background:#f8fafc;border:1px dashed var(--aco-300,#94a3b8);border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;overflow:hidden">
            ${instSrc ? `
              <img src="${esc(instSrc)}" alt="Fachada" style="max-height:100px;max-width:95%;object-fit:cover;border-radius:4px">
            ` : `
              <div style="color:var(--aco-400);font-size:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                ${ico('cad', 28)}
                <span>Sem imagem institucional</span>
              </div>
            `}
          </div>
          <input type="file" id="cfg-input-institucional" accept="image/png,image/jpeg,image/webp" style="display:none">
          <div style="display:flex;gap:6px">
            <button class="btn btn-secundario" type="button" onclick="document.getElementById('cfg-input-institucional').click()" style="font-size:12px;padding:5px 12px">
              ${ico('upload', 14)} Escolher Imagem
            </button>
            ${instSrc ? `
              <button class="btn btn-perigo" type="button" data-act="remover-institucional" style="font-size:12px;padding:5px 10px" title="Remover imagem institucional">
                ${ico('lixo', 14)}
              </button>
            ` : ''}
          </div>
          <div class="mini" style="color:var(--aco-500);margin-top:6px">Usada na ficha da oficina, link de rastreio e CRM.</div>
        </div>
      </div>
    </div>

    <!-- 2. DADOS GERAIS -->
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:16px">
      <div>
        <label class="mini" style="font-weight:700">Razão Social / Nome da Empresa</label>
        <input type="text" class="campo-texto" value="${esc(c.empresa || '')}" oninput="S.cfg.empresa=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">CNPJ / CPF</label>
        <input type="text" class="campo-texto mono" value="${esc(c.cnpj || '')}" oninput="S.cfg.cnpj=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:20px">
      <div>
        <label class="mini" style="font-weight:700">Endereço Completo (Rua, Número, Bairro, Cidade/UF)</label>
        <input type="text" class="campo-texto" value="${esc(c.endereco || '')}" oninput="S.cfg.endereco=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Telefone / WhatsApp Comercial</label>
        <input type="text" class="campo-texto mono" value="${esc(c.fone || '')}" oninput="S.cfg.fone=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <!-- 3. PARAMETRIZAÇÃO FISCAL -->
    <div style="margin-bottom:12px;border-top:1px solid var(--aco-150);padding-top:16px">
      <h4 style="font-weight:700;font-size:14px;margin:0 0 12px 0;color:var(--aco-800)">Parametrização Fiscal & Tributária</h4>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:24px">
      <div>
        <label class="mini" style="font-weight:700">Regime Tributário</label>
        <select class="campo-texto" onchange="S.cfg.regimeTributario=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
          <option ${c.regimeTributario === 'Simples Nacional' ? 'selected' : ''}>Simples Nacional</option>
          <option ${c.regimeTributario === 'Lucro Presumido' ? 'selected' : ''}>Lucro Presumido</option>
          <option ${c.regimeTributario === 'Lucro Real' ? 'selected' : ''}>Lucro Real</option>
        </select>
      </div>
      <div>
        <label class="mini" style="font-weight:700">CNAE Principal</label>
        <input type="text" class="campo-texto" value="${esc(c.cnae || '4520-0/01')}" oninput="S.cfg.cnae=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Inscrição Estadual (IE)</label>
        <input type="text" class="campo-texto" value="${esc(c.ie || '')}" oninput="S.cfg.ie=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Inscrição Municipal (IM)</label>
        <input type="text" class="campo-texto" value="${esc(c.im || '')}" oninput="S.cfg.im=this.value;salvar()" style="width:100%;height:36px;font-size:13px">
      </div>
    </div>

    <!-- 4. ASSISTENTE DE IA & WHATSAPP -->
    <div style="margin-bottom:12px;border-top:1px solid var(--aco-150);padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <h4 style="font-weight:700;font-size:14px;margin:0;color:var(--aco-800)">Assistente Virtual & Voz da Oficina</h4>
        <div class="mini" style="color:var(--aco-500)">Personalize a identidade da IA que interage com seus clientes.</div>
      </div>
      <button type="button" class="btn btn-neutro btn-pequeno" onclick="if(typeof abrirConfiguracoesAgente === 'function') abrirConfiguracoesAgente();">
        ⚙️ Configurar Voz Avançada
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label class="mini" style="font-weight:700">Nome do Agente / Assistente</label>
        <input type="text" class="campo-texto" value="${esc((c.assistente && c.assistente.displayName) || 'Verônica')}" style="width:100%;height:36px;font-size:13px" oninput="if(!S.cfg.assistente)S.cfg.assistente={};S.cfg.assistente.displayName=this.value;salvar()">
      </div>
      <div>
        <label class="mini" style="font-weight:700">Gênero de Voz (TTS)</label>
        <select class="campo-texto" style="width:100%;height:36px;font-size:13px" onchange="if(!S.cfg.assistente)S.cfg.assistente={};S.cfg.assistente.voiceGender=this.value;salvar()">
          <option value="female" ${(!c.assistente || c.assistente.voiceGender !== 'male') ? 'selected' : ''}>👩 Voz Feminina</option>
          <option value="male" ${(c.assistente && c.assistente.voiceGender === 'male') ? 'selected' : ''}>👨 Voz Masculina</option>
        </select>
      </div>
    </div>
  </div>`;
}

const exportsEquipe = { tabelaMecanicos, tabelaBoxes, viewEmpresa };
if (typeof window !== 'undefined') Object.assign(window, exportsEquipe);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsEquipe);

