/* Submódulo de Renderização de Abas Gerais de Configurações: agent_config_tabs.js */
/* Pátio-CRM — Submódulo extraído de js/modules/agent_config.js (< 350 linhas) */

function renderAbaGeral() {
  const cfg = S.cfg || {};
  const idVisual = cfg.identidadeVisual || {};
  const corPrimariaAtual = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#0f766e';
  const corAccentAtual = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() || '#f59e0b';
    return `
    <div style="display:flex;flex-direction:column;gap:18px">
      <!-- Motor Camaleão & Identidade White-Label -->
      <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
        <div class="entre" style="margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
          <div>
            <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">🎨 Motor Camaleão — Identidade White-Label</h3>
            <div style="font-size:12.5px;color:#64748b">Faça o upload do logo da sua oficina para extrair as cores dominantes via HTML5 Canvas</div>
          </div>
          <button class="btn btn-neutro" onclick="restaurarCoresPadrao()" style="font-size:11.5px;padding:6px 12px">
            Restaurar Cores Padrão
          </button>
        </div>

        <div style="display:grid;grid-template-columns:160px 1fr;gap:20px;align-items:center">
          <!-- Preview da Logo -->
          <div style="width:160px;height:90px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px">
            ${idVisual.logo || idVisual.logoUrl 
              ? `<img src="${idVisual.logo || idVisual.logoUrl}" style="max-width:100%;max-height:100%;object-fit:contain">` 
              : `<span style="font-size:12px;color:#94a3b8;text-align:center">Sem logotipo</span>`}
          </div>

          <div>
            <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-size:13px;padding:8px 16px;font-weight:700">
              <span>📷 Fazer Upload da Logo (PNG / JPG / SVG)</span>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onchange="processarUploadLogoCamaleao(this)" style="display:none">
            </label>
            <div style="font-size:11.5px;color:#64748b;margin-top:8px">
              O sistema ignora fundos brancos/cinzas e detecta automaticamente a <b>Cor Primária</b> e <b>Secundária (Accent)</b>.
            </div>

            <!-- Fallback Color Pickers Manuais -->
            <div style="display:flex;gap:18px;margin-top:14px;align-items:center;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="color" id="cfg_picker_primaria" value="${corPrimariaAtual}" onchange="atualizarCorManual('--brand-primary', this.value)" style="width:34px;height:34px;border:none;border-radius:6px;cursor:pointer">
                <div>
                  <div style="font-size:12px;font-weight:700;color:#0f172a">Cor Primária (Header/Bordas)</div>
                  <div style="font-size:11px;color:#64748b">${corPrimariaAtual}</div>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:8px">
                <input type="color" id="cfg_picker_accent" value="${corAccentAtual}" onchange="atualizarCorManual('--brand-accent', this.value)" style="width:34px;height:34px;border:none;border-radius:6px;cursor:pointer">
                <div>
                  <div style="font-size:12px;font-weight:700;color:#0f172a">Cor Secundária (Accent / Destaques)</div>
                  <div style="font-size:11px;color:#64748b">${corAccentAtual}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dados Cadastrais da Empresa -->
      <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
        <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🏢 Dados da Empresa & Cabeçalho de Impressão</h3>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Nome Fantasia:</label>
            <input type="text" id="cfg_empresa_nome" class="campo-texto" value="${esc(cfg.empresa || 'Auto Molas Fort')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Razão Social:</label>
            <input type="text" id="cfg_razao_social" class="campo-texto" value="${esc(cfg.razaoSocial || 'Auto Molas Fortaleza Suspensões Ltda')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">CNPJ:</label>
            <input type="text" id="cfg_cnpj" class="campo-texto" value="${esc(cfg.cnpj || '12.345.678/0001-90')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Inscrição Estadual (IE):</label>
            <input type="text" id="cfg_ie" class="campo-texto" value="${esc(cfg.ie || '06.123.456-7')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Telefone / WhatsApp Comercial:</label>
            <input type="text" id="cfg_fone" class="campo-texto" value="${esc(cfg.fone || '(85) 3456-7890 / (85) 99876-5432')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">E-mail Comercial:</label>
            <input type="text" id="cfg_email" class="campo-texto" value="${esc(cfg.email || 'contato@automolasfort.com.br')}" style="width:100%;height:36px;font-size:13px">
          </div>
          <div style="grid-column:span 2">
            <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Endereço Completo (Pátio / Oficina):</label>
            <input type="text" id="cfg_endereco" class="campo-texto" value="${esc(cfg.endereco || 'Rodovia BR-116, Km 14, Nº 4500 - Distrito Industrial')}" style="width:100%;height:36px;font-size:13px">
          </div>
        </div>

        <div style="margin-top:16px;display:flex;justify-content:flex-end">
          <button class="btn btn-primario" onclick="salvarConfigGeralForm()" style="font-weight:700;padding:10px 20px">
            Salvar Dados da Oficina
          </button>
        </div>
      </div>
    </div>`;
}

function renderAbaPlanoContas() {
  const cfg = S.cfg || {};
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <div class="entre" style="margin-bottom:14px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">📊 Estrutura do Plano de Contas</h3>
          <div style="font-size:12.5px;color:#64748b">Centros de custo e classificação para DRE e conciliação bancária</div>
        </div>
        <button class="btn btn-primario" onclick="torrar('Nova conta adicionada ao plano de contas','sucesso')">+ Nova Conta</button>
      </div>

      <table class="tabela-densa">
        <thead>
          <tr>
            <th>Código</th>
            <th>Classificação da Conta</th>
            <th>Tipo</th>
            <th>DRE Grupo</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr style="font-weight:700;background:#f8fafc">
            <td>1.0.00</td>
            <td>RECEITAS OPERACIONAIS BRUTAS</td>
            <td>Sintética</td>
            <td>Receita Bruta</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">1.1.01</td>
            <td>Venda de Peças (Linha Pesada: Molas, Freio, Suspensão)</td>
            <td>Analítica</td>
            <td>Receita de Peças</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">1.1.02</td>
            <td>Prestação de Serviços de Oficina (Mão de Obra Mecânica)</td>
            <td>Analítica</td>
            <td>Receita de Serviços</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr style="font-weight:700;background:#f8fafc">
            <td>2.0.00</td>
            <td>CUSTOS DIRETOS (CPV / CSP)</td>
            <td>Sintética</td>
            <td>Custos Operacionais</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">2.1.01</td>
            <td>Custo de Aquisição de Peças de Reposição</td>
            <td>Analítica</td>
            <td>CPV Peças</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
          <tr>
            <td style="padding-left:20px">2.1.02</td>
            <td>Comissões de Mecânicos Especialistas</td>
            <td>Analítica</td>
            <td>Mão de Obra Direta</td>
            <td style="text-align:center"><span class="badge-vivid badge-sucesso">Ativa</span></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function renderAbaContasCaixa() {
  const cfg = S.cfg || {};
  return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <div class="entre" style="margin-bottom:14px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">🏦 Contas Bancárias & Caixas Físicos</h3>
          <div style="font-size:12.5px;color:#64748b">Contas ativas para conciliação bancária, Pix e depósitos</div>
        </div>
        <button class="btn btn-primario" onclick="torrar('Abrindo modal de conta bancária...','neutro')">+ Nova Conta</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px">
        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:800;color:#2563eb;text-transform:uppercase">Conta Principal</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:4px 0">Banco Bradesco S.A.</div>
          <div style="font-size:12px;color:#64748b">Ag: 2341 · CC: 98765-4</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:10px">R$ 84.190,00</div>
        </div>

        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:800;color:#f59e0b;text-transform:uppercase">Conta Secundária</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:4px 0">Banco Itaú Unibanco</div>
          <div style="font-size:12px;color:#64748b">Ag: 0450 · CC: 33412-1</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:10px">R$ 42.600,00</div>
        </div>

        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase">Caixa Balcão</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a;margin:4px 0">Caixa Físico do Pátio</div>
          <div style="font-size:12px;color:#64748b">Dinheiro em cofre operacional</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:10px">R$ 4.250,00</div>
        </div>
      </div>
    </div>`;
}

function renderAbaOperacoes() {
  const cfg = S.cfg || {};
  return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🚛 Parâmetros de Operação do Pátio & Oficina</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Quantidade de Boxes de Manutenção:</label>
          <input type="number" class="campo-texto" value="8" min="1" max="30" style="width:100%;height:36px;font-size:13px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Comissão Padrão de Mecânicos (%):</label>
          <input type="number" class="campo-texto" value="20" min="0" max="100" style="width:100%;height:36px;font-size:13px">
        </div>
        <div style="grid-column:span 2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" checked style="width:18px;height:18px">
            <span style="font-size:13px;font-weight:600;color:#0f172a">Exigir Checklist de Entrada (Nível combustível, estepe, tacógrafo, ferramentas)</span>
          </label>
        </div>
        <div style="grid-column:span 2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" checked style="width:18px;height:18px">
            <span style="font-size:13px;font-weight:600;color:#0f172a">Bloquear saída do veículo sem liquidação ou faturamento aprovado pelo Financeiro</span>
          </label>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primario" onclick="torrar('Parâmetros operacionais salvos!','sucesso')">Salvar Parâmetros</button>
      </div>
    </div>`;
}

function renderAbaFiscalConfig() {
  const cfg = S.cfg || {};
  return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🧾 Configuração Fiscal & Certificado Digital A1</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Ambiente de Emissão:</label>
          <select class="campo" style="width:100%;height:36px;font-size:13px">
            <option value="1">1 - Produção (Notas Oficiais com Valor Jurídico)</option>
            <option value="2">2 - Homologação / Testes</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Certificado Digital A1 (.pfx):</label>
          <div style="display:flex;gap:8px">
            <input type="file" accept=".pfx,.p12" style="font-size:12px">
            <span class="badge-vivid badge-sucesso">Válido até 14/11/2027</span>
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Série NF-e:</label>
          <input type="text" class="campo-texto" value="1" style="width:100%;height:36px;font-size:13px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Próximo Número NF-e:</label>
          <input type="number" class="campo-texto" value="1452" style="width:100%;height:36px;font-size:13px">
        </div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primario" onclick="torrar('Configurações fiscais salvas!','sucesso')">Salvar Parâmetros Fiscais</button>
      </div>
    </div>`;
}

if (typeof window !== 'undefined') {
  window.renderAbaGeral = renderAbaGeral;
  window.renderAbaPlanoContas = renderAbaPlanoContas;
  window.renderAbaContasCaixa = renderAbaContasCaixa;
  window.renderAbaOperacoes = renderAbaOperacoes;
  window.renderAbaFiscalConfig = renderAbaFiscalConfig;
}
if (typeof globalThis !== 'undefined') {
  globalThis.renderAbaGeral = renderAbaGeral;
  globalThis.renderAbaPlanoContas = renderAbaPlanoContas;
  globalThis.renderAbaContasCaixa = renderAbaContasCaixa;
  globalThis.renderAbaOperacoes = renderAbaOperacoes;
  globalThis.renderAbaFiscalConfig = renderAbaFiscalConfig;
}
