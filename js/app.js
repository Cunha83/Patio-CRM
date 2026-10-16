/* =====================================================================
   PÁTIO CRM — CONTROLLER PRINCIPAL DA APLICAÇÃO (SPA)
===================================================================== */

/* ---------------- Render Principal ---------------- */
function render() {
  renderNav();
  const v = S.ui.view || 'patio';
  let conteudo = '';

  if (v === 'operacao') conteudo = typeof viewDashboardOperacional === 'function' ? viewDashboardOperacional() : '<div class="card card-p">Carregando painel operacional...</div>';
  else if (v === 'patio') conteudo = viewPatio();
  else if (v === 'painel') conteudo = viewPainelInicial();
  else if (v === 'estoque') conteudo = viewEstoque();
  else if (v === 'financeiro') conteudo = viewFinanceiro();
  else if (v === 'mensagens') conteudo = viewMensagens();
  else if (v === 'cadastros') conteudo = viewCadastros();
  else if (v === 'relatorios') conteudo = viewRelatorios();
  else if (v === 'configuracoes') conteudo = viewConfiguracoes();

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = renderTopo() + `<main class="wrap">${renderOnboardingBanner()}${conteudo}</main>`;
  }

  // Renderiza gráficos caso a view demande
  if (v === 'operacao' && typeof inicializarGraficosOperacionais === 'function') {
    setTimeout(inicializarGraficosOperacionais, 100);
  }
  if (v === 'painel') {
    setTimeout(renderGraficosPainel, 100);
  }
  if (v === 'financeiro' && (!S.ui.abaFin || S.ui.abaFin === 'dashboard')) {
    setTimeout(renderGraficosFinanceiro, 60);
  }
  if (v === 'configuracoes') {
    setTimeout(() => {
      if (typeof popularSelectVozesModal === 'function') {
        popularSelectVozesModal('cfg-ass-voz-inline');
      }
    }, 60);
  }
}

/* ---------------- Painel Inicial / KPIs ---------------- */
function viewPainelInicial() {
  const osLista = S.os || [];
  const rec = emAberto('receber'), pag = emAberto('pagar');
  const totalRec = soma(rec, c => c.valor);
  const totalPag = soma(pag, c => c.valor);
  const osAndamento = osLista.filter(o => o.st === 'executando');
  const pecasCriticas = (S.pecas || []).filter(p => (p.qtd || 0) <= (p.min || 1));

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('grana', 14)} Saldo em Caixa</div>
      <div class="v">${brlCurto(saldoCaixa())}</div>
      <div class="d">Consolidado em contas</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('patio', 14)} Veículos em Execução</div>
      <div class="v">${osAndamento.length}</div>
      <div class="d">Boxes ocupados</div>
    </div>
    <div class="kpi ${totalRec > 0 ? 'bom' : 'neutro'}">
      <div class="r">${ico('doc', 14)} A Receber (30d)</div>
      <div class="v">${brlCurto(totalRec)}</div>
      <div class="d">${rec.length} faturas de clientes</div>
    </div>
    <div class="kpi ${pecasCriticas.length ? 'alerta' : 'bom'}">
      <div class="r">${ico('pecas', 14)} Peças p/ Repor</div>
      <div class="v">${pecasCriticas.length}</div>
      <div class="d">Abaixo do estoque mínimo</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Fluxo Financeiro Semanal (Entradas vs Saídas)</div>
      <div class="mini" style="margin-bottom:12px">Comparativo consolidado dos últimos dias</div>
      <div style="height:220px;position:relative">
        <canvas id="grafico-fluxo"></canvas>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">Ocupação do Pátio</div>
      <div class="mini" style="margin-bottom:12px">Distribuição dos veículos nos boxes</div>
      <div style="height:220px;position:relative">
        <canvas id="grafico-ocupacao"></canvas>
      </div>
    </div>
  </div>
  
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    ${blocoTitulosPainel(rec, 'Títulos a Receber (Próx. 7 Dias ou Atrasados)', 'receber')}
    ${blocoTitulosPainel(pag, 'Títulos a Pagar (Próx. 7 Dias ou Atrasados)', 'pagar')}
  </div>`;
}

function blocoTitulosPainel(lista, titulo, tipo) {
  const dH = hoje();
  // Filtra títulos que vencem em até 7 dias ou que já estão atrasados
  let filtrados = lista.filter(c => {
    const diff = diasEntre(dH, c.venc);
    return diff <= 7;
  }).sort((a,b) => new Date(a.venc) - new Date(b.venc)).slice(0, 5); // Pega os 5 mais urgentes

  let htmlLista = filtrados.length === 0 ? `<div class="mini" style="color:var(--aco-500);text-align:center;padding:12px">Nenhum título para o período.</div>` : filtrados.map(c => {
    const diff = diasEntre(dH, c.venc);
    let cor = diff < 0 ? 'var(--tijolo)' : (diff === 0 ? 'var(--laranja)' : 'var(--aco-700)');
    let descVenc = diff < 0 ? `${Math.abs(diff)}d atraso` : (diff === 0 ? 'Hoje' : `em ${diff}d`);
    
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--aco-100)">
      <div>
        <div style="font-weight:600;font-size:13px;color:var(--aco-800)">${esc(c.parte)}</div>
        <div style="font-size:11px;color:${cor}">${dataBR(c.venc)} (${descVenc})</div>
      </div>
      <div style="font-weight:700;font-size:14px;color:${tipo === 'receber' ? 'var(--verde)' : 'var(--aco-800)'}">
        ${brlCurto(c.valor)}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="card card-p">
    <div class="entre" style="margin-bottom:12px;border-bottom:1px solid var(--aco-200);padding-bottom:8px">
      <div style="font-weight:700;font-size:14px">${titulo}</div>
      ${ico(tipo==='receber'?'doc':'maleta', 14)}
    </div>
    ${htmlLista}
    ${filtrados.length > 0 ? `<div style="text-align:center;margin-top:10px"><button class="btn btn-secundario" onclick="S.ui.view='financeiro';render()" style="font-size:11px;padding:4px 8px">Ver Financeiro Completo</button></div>` : ''}
  </div>`;
}

function renderGraficosPainel() {
  if (typeof Chart === 'undefined') return;

  const ctxFluxo = document.getElementById('grafico-fluxo');
  if (ctxFluxo) {
    if (window._chartFluxo) window._chartFluxo.destroy();
    window._chartFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Hoje'],
        datasets: [
          { label: 'Entradas (R$)', data: [4200, 3100, 5800, 4900, 7200, 6400], backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Saídas (R$)', data: [2100, 1800, 3400, 2900, 4100, 3200], backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  const ctxOcup = document.getElementById('grafico-ocupacao');
  if (ctxOcup) {
    if (window._chartOcup) window._chartOcup.destroy();
    const osLista = S.os || [];
    window._chartOcup = new Chart(ctxOcup, {
      type: 'doughnut',
      data: {
        labels: ['Em Execução', 'Parado Peça', 'Aprovação', 'Na Fila'],
        datasets: [{
          data: [
            osLista.filter(o => o.st === 'executando').length || 1,
            osLista.filter(o => o.st === 'peca').length,
            osLista.filter(o => o.st === 'aprovacao').length,
            osLista.filter(o => o.st === 'fila').length
          ],
          backgroundColor: ['#2563eb', '#f59e0b', '#8b5cf6', '#cbd5e1']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

/* ---------------- Configurações do Sistema ---------------- */
function viewConfiguracoes() {
  const cfg = S.cfg || {};

  return `
  <div class="card card-p" style="max-width:700px;margin:0 auto">
    <div style="font-weight:700;font-size:18px;margin-bottom:6px">Configurações da Oficina & Parâmetros</div>
    <div class="mini" style="margin-bottom:16px">Dados impressos nas ordens de serviço, recibos e cabeçalhos.</div>

    <div style="display:flex;flex-direction:column;gap:14px;font-size:13px">
      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Nome da Oficina / Razão Social:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.empresa || '')}" data-act="cfg" data-c="empresa" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">CNPJ:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.cnpj || '')}" data-act="cfg" data-c="cnpj" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Telefone / WhatsApp Comercial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.fone || '')}" data-act="cfg" data-c="fone" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Endereço Completo:</label>
        <input type="text" class="campo-texto" value="${esc(cfg.endereco || '')}" data-act="cfg" data-c="endereco" style="width:100%;height:34px">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Chave PIX Oficial:</label>
          <input type="text" class="campo-texto" value="${esc(cfg.chavePix || '')}" data-act="cfg" data-c="chavePix" style="width:100%;height:34px">
        </div>
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Saldo Inicial do Caixa (R$):</label>
          <input type="number" class="campo-texto" value="${cfg.saldoInicial || 0}" data-act="cfg" data-c="saldoInicial" step="100" style="width:100%;height:34px">
        </div>
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Termo Padrão de Garantia de Serviços:</label>
        <textarea class="campo-texto" data-act="cfg" data-c="termoGarantia" rows="2" style="width:100%">${esc(cfg.termoGarantia || '')}</textarea>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Identidade Visual & Logotipo</div>
        <div class="mini" style="margin-bottom:10px">O logotipo será impresso nas ordens de serviço, orçamentos, recibos e relatórios.</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div id="cfg-logo-preview" style="width:120px;height:60px;border:1px dashed var(--aco-300);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden">
            ${(cfg.identidadeVisual?.logoUrl || cfg.identidadeVisual?.logo) ? `<img src="${cfg.identidadeVisual.logoUrl || cfg.identidadeVisual.logo}" style="max-height:100%;max-width:100%;object-fit:contain">` : '<span class="mini" style="color:var(--aco-400)">Sem Logo</span>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="cfg-input-logo" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div style="display:flex;gap:8px">
              <button class="btn btn-neutro btn-pequeno" type="button" onclick="document.getElementById('cfg-input-logo').click()">Selecionar Logo</button>
              ${(cfg.identidadeVisual?.logoUrl || cfg.identidadeVisual?.logo) ? '<button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-logo">Remover</button>' : ''}
            </div>
            <span class="mini" style="color:var(--aco-500)">Tamanho máximo: 2MB.</span>
          </div>
        </div>

        <div style="font-weight:600;font-size:13px;margin:12px 0 4px 0">Imagem Institucional (Aprovação Digital):</div>
        <div class="mini" style="margin-bottom:10px">Exibida no cabeçalho da página pública de aprovação de orçamentos para os clientes.</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div id="cfg-institucional-preview" style="width:120px;height:60px;border:1px dashed var(--aco-300);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden">
            ${(cfg.identidadeVisual?.imagemInstitucionalUrl || cfg.identidadeVisual?.imagemInstitucional) ? `<img src="${cfg.identidadeVisual.imagemInstitucionalUrl || cfg.identidadeVisual.imagemInstitucional}" style="max-height:100%;max-width:100%;object-fit:contain">` : '<span class="mini" style="color:var(--aco-400)">Sem Imagem</span>'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="cfg-input-institucional" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div style="display:flex;gap:8px">
              <button class="btn btn-neutro btn-pequeno" type="button" onclick="document.getElementById('cfg-input-institucional').click()">Selecionar Imagem</button>
              ${(cfg.identidadeVisual?.imagemInstitucionalUrl || cfg.identidadeVisual?.imagemInstitucional) ? '<button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-institucional">Remover</button>' : ''}
            </div>
            <span class="mini" style="color:var(--aco-500)">Tamanho máximo: 2MB.</span>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div class="entre" style="margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:14px">Assistente Virtual & Voz</div>
            <div class="mini" style="margin-bottom:4px">Personalize o nome, timbre de voz e teste a pronúncia da inteligência operacional da sua oficina.</div>
          </div>
          <button type="button" class="btn btn-neutro btn-pequeno" style="gap:6px;display:flex;align-items:center;white-space:nowrap" onclick="if(typeof abrirConfiguracoesAgente==='function')abrirConfiguracoesAgente()">
            ⚙️ Personalizar no Modal Completo
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Nome do Assistente:</label>
            <input type="text" id="cfg-ass-nome-inline" class="campo-texto" value="${esc(cfg.assistente?.displayName || 'Verônica')}" data-act="cfg-assistente" data-c="displayName" placeholder="Ex: Verônica, Sofia, Carlos, Atlas" style="width:100%;height:34px">
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center">
              <span class="mini" style="color:var(--aco-500);font-size:10.5px">Sugestões:</span>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Verônica';(S.cfg.assistente.voiceGender='female');salvar();render();">Verônica 👩</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Sofia';(S.cfg.assistente.voiceGender='female');salvar();render();">Sofia 👩</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Carlos';(S.cfg.assistente.voiceGender='male');salvar();render();">Carlos 👨</button>
              <button type="button" class="btn-chip" style="font-size:10.5px;padding:2px 7px" onclick="(S.cfg.assistente=S.cfg.assistente||{}).displayName='Atlas';(S.cfg.assistente.voiceGender='male');salvar();render();">Atlas 👨</button>
            </div>
          </div>
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Gênero da Voz Sintetizada:</label>
            <select class="campo-texto" data-act="cfg-assistente" data-c="voiceGender" style="width:100%;height:34px">
              <option value="female" ${(cfg.assistente?.voiceGender || 'female') === 'female' ? 'selected' : ''}>👩 Feminina (Padrão)</option>
              <option value="male" ${(cfg.assistente?.voiceGender) === 'male' ? 'selected' : ''}>👨 Masculina</option>
            </select>
            <div class="mini" style="margin-top:4px;color:var(--aco-500)">Gênero aplicado nos filtros de voz e nas saudações do pós-venda.</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;align-items:end;margin-bottom:10px">
          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px">Voz Específica do Navegador / Sistema Operacional:</label>
            <select id="cfg-ass-voz-inline" class="campo-texto" data-act="cfg-assistente" data-c="voiceURI" style="width:100%;height:34px" onchange="if(typeof aoMudarVozInline==='function')aoMudarVozInline(this)">
              <option value="">✨ Seleção Automática Inteligente</option>
            </select>
          </div>
          <div>
            <button type="button" id="btn-inline-testar-voz" class="btn btn-neutro" style="width:100%;height:34px;gap:6px;display:flex;align-items:center;justify-content:center;font-weight:600" onclick="if(typeof executarTesteModalVoz==='function')executarTesteModalVoz()">
              <span>▶️</span> Ouvir Saudação
            </button>
          </div>
        </div>

        <!-- Briefing Executivo Diário e Semanal -->
        <div style="background:var(--aco-100, rgba(0,0,0,0.03));border:1px solid var(--aco-200);border-radius:8px;padding:12px;margin-top:10px">
          <div class="entre" style="margin-bottom:8px">
            <div>
              <span style="font-weight:700;font-size:13px">📊 Briefings Executivos para Gestores</span>
              <div class="mini" style="color:var(--aco-500)">Consolidação diária e semanal de pátio e financeiro.</div>
            </div>
            <button type="button" class="btn btn-neutro btn-pequeno" onclick="if(typeof gerarEVisualizarBriefing==='function')gerarEVisualizarBriefing()" style="font-weight:600;display:flex;align-items:center;gap:4px">
              <span>📈</span> Visualizar Briefing Agora
            </button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
            <div style="border-right:1px solid var(--aco-200);padding-right:10px">
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;cursor:pointer;margin-bottom:6px">
                <input type="checkbox" data-act="cfg-assistente-bool" data-c="briefingDiarioAtivo" ${cfg.assistente?.briefingDiarioAtivo ? 'checked' : ''}>
                <span>Briefing Diário Matinal</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="mini" style="white-space:nowrap">Horário:</span>
                <input type="time" class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" value="${cfg.assistente?.briefingDiarioHorario || '07:30'}" data-act="cfg-assistente" data-c="briefingDiarioHorario">
              </div>
            </div>
            <div>
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;cursor:pointer;margin-bottom:6px">
                <input type="checkbox" data-act="cfg-assistente-bool" data-c="briefingSemanalAtivo" ${cfg.assistente?.briefingSemanalAtivo ? 'checked' : ''}>
                <span>Briefing Semanal Gerencial</span>
              </label>
              <div style="display:flex;gap:8px;align-items:center">
                <select class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" data-act="cfg-assistente" data-c="briefingSemanalDia">
                  <option value="segunda" ${(cfg.assistente?.briefingSemanalDia || 'segunda') === 'segunda' ? 'selected' : ''}>Segunda-feira</option>
                  <option value="sexta" ${(cfg.assistente?.briefingSemanalDia) === 'sexta' ? 'selected' : ''}>Sexta-feira</option>
                  <option value="sabado" ${(cfg.assistente?.briefingSemanalDia) === 'sabado' ? 'selected' : ''}>Sábado</option>
                </select>
                <input type="time" class="campo-texto" style="height:30px;font-size:12px;padding:0 6px" value="${cfg.assistente?.briefingSemanalHorario || '08:00'}" data-act="cfg-assistente" data-c="briefingSemanalHorario">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Manutenção Preventiva & Pós-Venda</div>
        <div class="mini" style="margin-bottom:10px">Parâmetros globais para alertas automáticos e follow-up com frotistas.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">Alerta Preventiva (Km antecedência):</label>
            <input type="number" class="campo-texto" value="${cfg.manutencaoPreventiva?.alertaKmPadrao || 1000}" data-act="cfg-prev" data-c="alertaKmPadrao" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">Alerta Preventiva (Dias antecedência):</label>
            <input type="number" class="campo-texto" value="${cfg.manutencaoPreventiva?.alertaDiasPadrao || 15}" data-act="cfg-prev" data-c="alertaDiasPadrao" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Guia de Implantação & Demonstração</div>
        <div class="mini" style="margin-bottom:10px">Controle o banner de ativação e carregue ou limpe os dados de demonstração.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-neutro btn-pequeno" type="button" data-act="${cfg.onboardingConcluido ? 'reabrir-onboarding' : 'concluir-onboarding'}">
            ${cfg.onboardingConcluido ? 'Reabrir Checklist de Onboarding' : 'Marcar Onboarding Concluído'}
          </button>
          <button class="btn btn-neutro btn-pequeno" type="button" data-act="carregar-demo">Carregar Dados Demo</button>
          <button class="btn btn-perigo btn-pequeno" type="button" data-act="remover-demo">Remover Dados Demo</button>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;margin-top:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Integração APIBrasil (Consulta de Placas)</div>
        <div class="mini" style="margin-bottom:10px">Insira as credenciais para puxar marca, modelo e cor pela placa automaticamente.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label class="mini" style="font-weight:600;display:block">DeviceToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.deviceToken) || '')}" data-act="cfg-apibrasil" data-c="deviceToken" style="width:100%;height:32px">
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">BearerToken:</label>
            <input type="password" class="campo-texto" value="${esc((cfg.apibrasil && cfg.apibrasil.bearerToken) || '')}" data-act="cfg-apibrasil" data-c="bearerToken" style="width:100%;height:32px">
          </div>
        </div>
      </div>

      <div style="border-top:1px solid var(--aco-200);padding-top:14px;display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-perigo" data-act="zerar">Restaurar Demonstração</button>
        <button class="btn btn-primario" data-act="salvar-cfg">Salvar Alterações</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- Gerenciamento de Modais / Folhas ---------------- */
function abrirFolha(fn) {
  folhaAtual = fn;
  renderFolha();
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.add('on');
  if (folha) folha.classList.add('on');
}

function renderFolha() {
  const folha = document.getElementById('folha');
  if (folha && folhaAtual) {
    folha.innerHTML = folhaAtual();
  }
}

function fecharFolha() {
  const vidro = document.getElementById('vidro');
  const folha = document.getElementById('folha');
  if (vidro) vidro.classList.remove('on');
  if (folha) folha.classList.remove('on');
  folhaAtual = null;
}

/* =====================================================================
   INICIALIZAÇÃO DO SISTEMA (BOOT)
===================================================================== */
(async function boot() {
  const salvo = await armazem.ler();
  S = salvo && salvo.os ? salvo : sementes();
  S.ui = Object.assign({
    view: 'patio',
    filtro: 'todos',
    abaFin: 'dashboard',
    abaOS: 'servicos',
    abaCad: 'clientes',
    abaZap: 'cobranca',
    busca: '',
    buscaPlaca: ''
  }, S.ui || {});

  if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
    S.ui.perfilAtivo = 'mecanico';
  }

  S.extrato = S.extrato || [];
  S.nfsRecebidas = S.nfsRecebidas || [];
  S.compras = S.compras || [];
  if (!S.zap || !S.zap.regua) S.zap = zapPadrao();

  render();

  // Sincronização Periódica em Tempo Real com o Servidor (Auto-Refresh quando chegar OS do WhatsApp)
  let _checandoSync = false;
  async function checarAtualizacoesServidor() {
    if (_checandoSync) return;
    if (document.visibilityState === 'hidden') return;
    if (pendingLocalSave || folhaAtual) return;
    const generation = localGeneration;
    _checandoSync = true;
    try {
      const res = await fetch('/api/versao');
      if (res.ok) {
        const info = await res.json();
        const versaoLocal = S.versao || 0;
        const osLocal = (S.os || []).length;
        const veiLocal = (S.veiculos || []).length;

        if ((info.versao && info.versao > versaoLocal) || info.totalOS !== osLocal || info.totalVei !== veiLocal) {
          const resEst = await fetch('/api/estado');
          if (resEst.ok) {
            const novo = await resEst.json();
            if (novo && novo.os) {
              // Uma edição iniciada durante o fetch invalida esta atualização.
              if (pendingLocalSave || folhaAtual || generation !== localGeneration) return;
              const ui = S.ui;
              S = novo;
              S.ui = ui;
              if (S.perfil === 'mecanico' || (S.user && S.user.role === 'mecanico')) {
                S.ui.perfilAtivo = 'mecanico';
              }
              armazem.base = PatioSync.clone(novo);
              try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}

              // Re-renderiza em tempo real se nenhuma folha/modal estiver sendo editada
              if (!folhaAtual && typeof render === 'function') {
                render();
                const statusEl = document.getElementById('status-salvo');
                if (statusEl) {
                  statusEl.textContent = '● Pátio Atualizado';
                  statusEl.style.color = 'var(--verde)';
                  setTimeout(() => { if (statusEl) statusEl.textContent = '● Salvo'; }, 2000);
                }
              }
            }
          }
        }
      }
    } catch (_) {
    } finally {
      _checandoSync = false;
    }
  }
  setInterval(checarAtualizacoesServidor, 5000);
})();

// Exportações explícitas no escopo global window
if (typeof window !== 'undefined') {
  window.render = render;
  window.viewPainelInicial = viewPainelInicial;
  window.blocoTitulosPainel = blocoTitulosPainel;
  window.renderGraficosPainel = renderGraficosPainel;
  window.viewConfiguracoes = viewConfiguracoes;
  window.abrirFolha = abrirFolha;
  window.renderFolha = renderFolha;
  window.fecharFolha = fecharFolha;
}
