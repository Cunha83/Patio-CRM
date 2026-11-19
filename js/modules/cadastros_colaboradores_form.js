/**
 * Submódulo: cadastros_colaboradores_form.js
 * Pátio-CRM — Formulário Cadastral Completo de Colaboradores e Mecânicos
 * Dossiê: Dados Pessoais, Endereço com CEP Automático e Documentação Profissional (CNH/CTPS)
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function folhaCadastroColaborador(r = {}) {
    const isEdicao = Boolean(r && r.id);
    const cargos = [
      'Mecânico / Alinhador de Chassi',
      'Mecânico / Suspensão e Molas',
      'Mecânico / Freios e Pneumática',
      'Consultor Técnico / Vendas',
      'Encarregado de Pátio / Gerente',
      'Administrativo / Financeiro',
      'Eletricista Pesado',
      'Auxiliar de Oficina'
    ];
    const categoriasCnh = ['— Sem CNH —', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'];
    const statusColab = ['Ativo', 'Férias', 'Afastado', 'Inativo'];

    return `
    <div class="card card-p" style="max-width:740px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0;color:var(--aco-900)">
            ${isEdicao ? 'Editar Colaborador / Mecânico' : 'Novo Colaborador / Mecânico'}
          </h3>
          <div class="mini" style="color:var(--aco-500)">Dossiê profissional, endereço residencial e habilitação técnica.</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${typeof ico === 'function' ? ico('x', 18) : '✕'}</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
        <!-- SEÇÃO 1: DADOS PESSOAIS -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span>👤</span> <span>Dados Pessoais</span>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini" style="font-weight:700">Nome Completo *</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="nome" value="${esc(r.nome || '')}" placeholder="Ex: Roberto da Silva Santos" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">CPF *</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="cpf" value="${esc(r.cpf || '')}" placeholder="000.000.000-00" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">RG</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="rg" value="${esc(r.rg || '')}" placeholder="00.000.000-0" style="width:100%;height:34px">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1.2fr 1.5fr;gap:10px">
            <div>
              <label class="mini" style="font-weight:700">Data de Nascimento</label>
              <input type="date" class="campo-texto" data-act="rc" data-c="nascimento" value="${esc(r.nascimento || '')}" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">WhatsApp / Telefone *</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="fone" value="${esc(r.fone || '')}" placeholder="(00) 90000-0000" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">E-mail Profissional/Pessoal</label>
              <input type="email" class="campo-texto" data-act="rc" data-c="email" value="${esc(r.email || '')}" placeholder="colaborador@email.com" style="width:100%;height:34px">
            </div>
          </div>
        </div>

        <!-- SEÇÃO 2: ENDEREÇO RESIDENCIAL -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span>📍</span> <span>Endereço Residencial</span>
          </div>
          <div style="display:grid;grid-template-columns:130px 1fr 90px 120px;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini" style="font-weight:700">CEP</label>
              <div style="display:flex;gap:4px">
                <input type="text" class="campo-texto" id="cep_colab" data-act="rc" data-c="cep" value="${esc(r.cep || '')}" placeholder="00000-000" style="width:100%;height:34px">
                <button type="button" class="btn btn-secundario" onclick="if(typeof buscarCep==='function')buscarCep(document.getElementById('cep_colab').value, 'colab')" style="padding:0 8px" title="Buscar CEP">🔍</button>
              </div>
            </div>
            <div>
              <label class="mini" style="font-weight:700">Logradouro / Rua</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="endereco" value="${esc(r.endereco || '')}" placeholder="Rua das Flores" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">Número</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="numero" value="${esc(r.numero || '')}" placeholder="123" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">Complemento</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="complemento" value="${esc(r.complemento || '')}" placeholder="Apto 201" style="width:100%;height:34px">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1.5fr 1.5fr 70px;gap:10px">
            <div>
              <label class="mini" style="font-weight:700">Bairro</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="bairro" value="${esc(r.bairro || '')}" placeholder="Bairro" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">Cidade</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="cidade" value="${esc(r.cidade || '')}" placeholder="Cidade" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">UF</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="uf" value="${esc(r.uf || '')}" placeholder="UF" maxlength="2" style="width:100%;height:34px;text-transform:uppercase">
            </div>
          </div>
        </div>

        <!-- SEÇÃO 3: DOCUMENTAÇÃO PROFISSIONAL & HABILITAÇÃO -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          <div style="font-weight:700;font-size:12.5px;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span>🚛</span> <span>Documentação Profissional & Habilitação</span>
          </div>
          <div style="display:grid;grid-template-columns:1.8fr 1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="mini" style="font-weight:700">Cargo / Função *</label>
              <select class="campo-texto" data-act="rc" data-c="especialidade" style="width:100%;height:34px">
                ${cargos.map(c => `<option value="${c}" ${(r.especialidade || r.cargo) === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="mini" style="font-weight:700">Data de Admissão</label>
              <input type="date" class="campo-texto" data-act="rc" data-c="admissao" value="${esc(r.admissao || '')}" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">Status Operacional</label>
              <select class="campo-texto" data-act="rc" data-c="status" style="width:100%;height:34px">
                ${statusColab.map(st => `<option value="${st}" ${(r.status || 'Ativo') === st ? 'selected' : ''}>${st}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1.2fr 1fr 100px 90px 100px;gap:10px">
            <div>
              <label class="mini" style="font-weight:700">CTPS / PIS-PASEP</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="ctps" value="${esc(r.ctps || '')}" placeholder="Nº / Série / PIS" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">CNH (Número)</label>
              <input type="text" class="campo-texto" data-act="rc" data-c="cnh" value="${esc(r.cnh || '')}" placeholder="Nº Habilitação" style="width:100%;height:34px">
            </div>
            <div>
              <label class="mini" style="font-weight:700">Cat. CNH</label>
              <select class="campo-texto" data-act="rc" data-c="categoriaCnh" style="width:100%;height:34px">
                ${categoriasCnh.map(cat => `<option value="${cat}" ${(r.categoriaCnh || '— Sem CNH —') === cat ? 'selected' : ''}>${cat}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="mini" style="font-weight:700">Comissão (%)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="comissao" value="${r.comissao != null ? r.comissao : 0}" step="0.5" min="0" max="100" style="width:100%;height:34px;text-align:right">
            </div>
            <div>
              <label class="mini" style="font-weight:700">Custo/Hora (R$)</label>
              <input type="number" class="campo-texto" data-act="rc" data-c="custoHora" value="${r.custoHora != null ? r.custoHora : 80}" step="1" min="0" style="width:100%;height:34px;text-align:right">
            </div>
          </div>
        </div>
      </div>

      <!-- RODAPÉ COM AÇÕES -->
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;border-top:1px solid var(--aco-150);padding-top:14px">
        <button type="button" class="btn btn-secundario" data-act="fechar">Cancelar</button>
        <button type="button" class="btn btn-primario" data-act="salvar-cad" data-t="mecanico" style="font-weight:700;padding:0 22px">
          ${typeof ico === 'function' ? ico('check', 14) : '✓'} Salvar Colaborador
        </button>
      </div>
    </div>`;
  }

  const exportsColaboradoresForm = {
    folhaCadastroColaborador
  };

  Object.assign(global, exportsColaboradoresForm);
  if (typeof window !== 'undefined') Object.assign(window, exportsColaboradoresForm);
})(typeof window !== 'undefined' ? window : globalThis);
