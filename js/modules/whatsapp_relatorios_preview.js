/* =====================================================================
   PÁTIO CRM — WHATSAPP RELATÓRIOS MATINAIS & PREVIEWS
   Submódulo para prévia de relatórios executivos, imagens e envio a grupos
   ===================================================================== */

function blocoRelatorioAdmin() {
  const cfg = S.cfg || {};
  let grupoAdminId = cfg.grupoAdminId || '';
  if (grupoAdminId === '120363428179962435@g.us' || grupoAdminId === '120363428840376088@g.us') {
    grupoAdminId = '';
    cfg.grupoAdminId = '';
  }
  const grupoOperacaoId = cfg.grupoOperacaoId || '';
  const horaEnvio = cfg.horaRelatorioDiario || '07:30';
  const autoEnvio = cfg.envioAutomaticoRelatorio !== false;
  const apenasDiasUteis = cfg.relatorioApenasDiasUteis !== false;
  const responderApenasGrupos = cfg.responderApenasGrupos !== false;
  const wppStatusStr = (S.ui && S.ui.wppStatus && S.ui.wppStatus.status) || 'inicializando';

  if (S.ui && !S.ui.gruposWppCarregados && wppStatusStr === 'pronto') {
    S.ui.gruposWppCarregados = true;
    const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao() : {};
    fetch('/api/whatsapp/grupos', { headers })
      .then(r => r.json())
      .then(d => {
        if (d && d.grupos) {
          S.ui.gruposWpp = d.grupos;
          if (typeof render === 'function') render();
        }
      })
      .catch(() => {});
  }

  const grupos = ((S.ui && S.ui.gruposWpp) || []).filter(g => {
    const n = (g.name || '').toLowerCase();
    return !n.includes('faturamento') && !n.includes('compras') && g.id !== '120363428179962435@g.us' && g.id !== '120363428840376088@g.us';
  });

  const statusMap = {
    pronto: { label: 'Conectado & Operante', cor: 'var(--verde)' },
    autenticado: { label: 'Autenticado', cor: 'var(--verde)' },
    aguardando_qr: { label: 'Aguardando Leitura de QR', cor: 'var(--amarelo)' },
    carregando: { label: 'Inicializando...', cor: 'var(--azul)' },
    desconectado: { label: 'Desconectado', cor: 'var(--tijolo)' },
    erro: { label: 'Erro de Conexão', cor: 'var(--tijolo)' }
  };
  const st = statusMap[wppStatusStr] || { label: wppStatusStr, cor: 'var(--aco-400)' };

  return `
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card card-p">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="font-size:16px;font-weight:700;margin:0">Roteamento por Grupos & Relatórios Matinais</h3>
          <div class="mini" style="margin-top:2px">Configuração dos 2 grupos de WhatsApp (Administração vs Operação) e envio matinal às 07:30</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secundario" data-act="ver-imagem-preview" style="font-size:12px;padding:5px 10px">
            🖼️ Ver Imagem JPG
          </button>
          <button class="btn btn-secundario" data-act="preview-relatorio-admin" style="font-size:12px;padding:5px 10px">
            👁️ Prévia Admin
          </button>
          <button class="btn btn-secundario" data-act="preview-relatorio-operacao" style="font-size:12px;padding:5px 10px">
            👁️ Prévia Operação
          </button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:14px">
        <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-150)">
          <div class="entre" style="margin-bottom:6px">
            <label style="font-weight:700;font-size:13.5px;color:var(--azul)">
              👑 Grupo da Administração (Relatório Completo + Imagem JPG)
            </label>
            <button class="btn btn-primario" data-act="disparar-grupo-admin" style="font-size:11.5px;padding:3px 10px;font-weight:600">
              🚀 Disparar Grupo Admin
            </button>
          </div>
          <div class="mini" style="color:var(--aco-600);margin-bottom:8px">
            Recebe 3 mensagens detalhadas (Caixa, Pátio, Veículos Amanhecidos) + Infográfico visual em JPG. Acesso a todos os comandos financeiros e operacionais.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label class="mini" style="font-weight:600;display:block;margin-bottom:3px">Selecionar dos Grupos Conectados:</label>
              <select class="campo-select" id="cfg_grupo_admin_sel" style="width:100%;height:34px" onchange="document.getElementById('cfg_grupo_admin_id').value = this.value">
                <option value="">-- Escolha um Grupo --</option>
                ${grupos.map(g => `<option value="${g.id}" ${g.id === grupoAdminId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="mini" style="font-weight:600;display:block;margin-bottom:3px">ID do Grupo no WhatsApp:</label>
              <input type="text" class="campo-texto" id="cfg_grupo_admin_id" placeholder="Ex: 120363xxx@g.us" value="${esc(grupoAdminId)}" style="width:100%;height:34px;font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <div style="background:var(--aco-050);padding:12px;border-radius:8px;border:1px solid var(--aco-150)">
          <div class="entre" style="margin-bottom:6px">
            <label style="font-weight:700;font-size:13.5px;color:var(--petroleo)">
              🚛 Grupo da Operação / Pátio (Sem Informações Financeiras)
            </label>
            <button class="btn btn-primario" data-act="disparar-grupo-operacao" style="font-size:11.5px;padding:3px 10px;font-weight:600">
              🚀 Disparar Grupo Operação
            </button>
          </div>
          <div class="mini" style="color:var(--aco-600);margin-bottom:8px">
            Recebe 2 mensagens (Pátio/Boxes e Veículos amanhecidos/peças). <b>Valores monetários (R$) são 100% ocultados</b>. Permite abertura de OS, consulta de status e fotos.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label class="mini" style="font-weight:600;display:block;margin-bottom:3px">Selecionar dos Grupos Conectados:</label>
              <select class="campo-select" id="cfg_grupo_op_sel" style="width:100%;height:34px" onchange="document.getElementById('cfg_grupo_op_id').value = this.value">
                <option value="">-- Escolha um Grupo --</option>
                ${grupos.map(g => `<option value="${g.id}" ${g.id === grupoOperacaoId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="mini" style="font-weight:600;display:block;margin-bottom:3px">ID do Grupo no WhatsApp:</label>
              <input type="text" class="campo-texto" id="cfg_grupo_op_id" placeholder="Ex: 120363yyy@g.us" value="${esc(grupoOperacaoId)}" style="width:100%;height:34px;font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label class="rotulo" style="display:block;margin-bottom:4px">Horário e Frequência do Envio Matinal:</label>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <input type="time" class="campo-texto" id="cfg_hora_relatorio" value="${esc(horaEnvio)}" style="width:120px;height:36px;font-weight:700">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="cfg_auto_envio" ${autoEnvio ? 'checked' : ''}>
              <b>Envio Ativo</b>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="cfg_apenas_dias_uteis" ${apenasDiasUteis ? 'checked' : ''}>
              <b>Apenas Dias Úteis (Seg à Sex)</b>
            </label>
          </div>
          <div class="mini" style="color:var(--aco-500);margin-top:4px">
            ⏰ Às <b>${esc(horaEnvio)}</b> ${apenasDiasUteis ? 'de <b>segunda a sexta-feira</b> (dias úteis)' : 'todos os dias'}, o robô disparará automaticamente os relatórios aos grupos.
          </div>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center">
          <label class="rotulo" style="display:block;margin-bottom:4px">Lista de Grupos:</label>
          <button class="btn btn-secundario" data-act="atualizar-grupos-wpp" style="font-size:12.5px;height:36px">
            🔄 Sincronizar Grupos do WhatsApp (${grupos.length})
          </button>
        </div>
      </div>

      <div style="background:var(--aco-050);padding:10px 12px;border-radius:8px;border:1px solid var(--aco-150);margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="cfg_responder_apenas_grupos" ${responderApenasGrupos ? 'checked' : ''}>
          <b>🔒 Responder Apenas nos Grupos Cadastrados (Silencioso no Privado)</b>
        </label>
        <div class="mini" style="color:var(--aco-600);margin-top:4px;padding-left:22px">
          Desativa respostas automáticas para números individuais (DMs/privado), mantendo o agente 100% silencioso para clientes e números cadastrados. O agente responde exclusivamente dentro dos grupos cadastrados.
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;border-top:1px solid var(--aco-150);padding-top:10px">
        <button class="btn btn-sucesso" data-act="salvar-config-grupos" style="font-size:13px;padding:6px 18px">
          💾 Salvar Configurações dos Grupos
        </button>
      </div>
    </div>

    <div>
      <div class="card card-p" style="margin-bottom:14px">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px">Status do Agente WhatsApp</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${st.cor}"></span>
          <span style="font-weight:600;font-size:13px;color:${st.cor}">${st.label}</span>
        </div>
        <button class="btn btn-secundario" data-act="conectar-wpp" style="width:100%;font-size:12px;padding:6px 0">
          📱 Gerenciar Conexão / QR Code
        </button>
      </div>

      <div class="card card-p">
        <div style="font-weight:700;font-size:14px;margin-bottom:6px">Regras de Segurança & Privacidade</div>
        <div style="font-size:12px;line-height:1.6;display:flex;flex-direction:column;gap:8px">
          <div style="background:var(--aco-050);padding:8px;border-radius:6px;border-left:3px solid var(--verde)">
            <b>🔒 Atendimento a Clientes:</b> O robô fica 100% silencioso nas conversas privadas (DMs) com clientes, deixando o contato humano livre.
          </div>
          <div style="background:var(--aco-050);padding:8px;border-radius:6px;border-left:3px solid var(--laranja)">
            <b>🛡️ Grupo Operação:</b> Qualquer tentativa de consultar <code>!caixa</code> ou saldo é bloqueada com aviso de restrição.
          </div>
          <div style="background:var(--aco-050);padding:8px;border-radius:6px;border-left:3px solid var(--azul)">
            <b>📸 Fotos de Placas:</b> Envie foto no grupo do pátio para abrir OS automaticamente com leitura OCR.
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card card-p">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px">📋 Como funciona o envio matinal para cada grupo?</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px">
      <div style="background:var(--branco);padding:12px;border-radius:8px;border:1px solid var(--aco-150)">
        <div style="font-weight:700;font-size:13.5px;color:var(--azul);margin-bottom:6px">👑 Grupo Administração (3 Mensagens + JPG)</div>
        <div style="font-size:12.5px;color:var(--aco-700);line-height:1.5">
          • <b>Mensagem 1 (com Infográfico JPG):</b> Saldo real em caixa, entradas/saídas de hoje, contas da semana e inadimplência.<br>
          • <b>Mensagem 2:</b> Ocupação dos boxes mecânicos, veículos na fila de espera e triagem.<br>
          • <b>Mensagem 3:</b> Caminhões que amanheceram na oficina, dias de pátio e alertas de peças aguardando fornecedor.
        </div>
      </div>
      <div style="background:var(--branco);padding:12px;border-radius:8px;border:1px solid var(--aco-150)">
        <div style="font-weight:700;font-size:13.5px;color:var(--petroleo);margin-bottom:6px">🚛 Grupo Operação (2 Mensagens sem Finanças)</div>
        <div style="font-size:12.5px;color:var(--aco-700);line-height:1.5">
          • <b>Mensagem 1:</b> Posição de atendimento, ocupação dos boxes e fila de espera no pátio.<br>
          • <b>Mensagem 2:</b> Caminhões amanhecidos, tempo na oficina, mecânico responsável e peças pendentes.<br>
          • <b>Sigilo Total:</b> Nenhum cifrão (R$) ou valor financeiro é exposto à equipe operacional.
        </div>
      </div>
    </div>
  </div>`;
}

function folhaRelatorioPreview(textoPreview) {
  return `
  <div class="card card-p" style="max-width:680px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700;margin:0">Pré-visualização do Relatório Executivo (Admin)</h3>
        <div class="mini">Formatação enviada ao Grupo da Administração no WhatsApp</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="background:#0b141a;color:#e9edef;font-family:monospace;font-size:13px;line-height:1.5;padding:16px;border-radius:8px;white-space:pre-wrap;max-height:480px;overflow-y:auto;border:1px solid #202c33;margin-bottom:14px">
${esc(textoPreview)}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="copiar-texto-relatorio" data-txt="${esc(textoPreview)}">
        📋 Copiar Texto
      </button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Fechar</button>
        <button class="btn btn-primario" data-act="disparar-grupo-admin" style="font-weight:600">
          🚀 Disparar para Grupo Admin
        </button>
      </div>
    </div>
  </div>`;
}

function folhaRelatorioOperacaoPreview(textoPreview) {
  return `
  <div class="card card-p" style="max-width:680px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700;margin:0">Pré-visualização Operacional (Pátio)</h3>
        <div class="mini">Formatação enviada ao Grupo da Operação (zero dados financeiros)</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="background:#0b141a;color:#e9edef;font-family:monospace;font-size:13px;line-height:1.5;padding:16px;border-radius:8px;white-space:pre-wrap;max-height:480px;overflow-y:auto;border:1px solid #202c33;margin-bottom:14px">
${esc(textoPreview)}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="copiar-texto-relatorio" data-txt="${esc(textoPreview)}">
        📋 Copiar Texto
      </button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Fechar</button>
        <button class="btn btn-primario" data-act="disparar-grupo-operacao" style="font-weight:600">
          🚀 Disparar para Grupo Operação
        </button>
      </div>
    </div>
  </div>`;
}

function folhaImagemPreview() {
  const src = `/api/whatsapp/imagem-preview.jpg?t=${Date.now()}`;
  return `
  <div class="card card-p" style="max-width:840px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700;margin:0">🖼️ Infográfico Executivo em JPG</h3>
        <div class="mini">Renderizado dinamicamente pelo servidor para envio ao Grupo da Administração</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="text-align:center;background:#0b0f19;padding:16px;border-radius:8px;margin-bottom:14px">
      <img src="${src}" alt="Infográfico Executivo" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.6);display:inline-block" />
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--aco-150);padding-top:12px">
      <a href="${src}" target="_blank" class="btn btn-secundario" style="text-decoration:none;font-size:12.5px;padding:6px 14px">
        🔍 Abrir Imagem em Nova Aba
      </a>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secundario" data-act="fechar">Fechar</button>
        <button class="btn btn-primario" data-act="disparar-grupo-admin" style="font-weight:600">
          🚀 Disparar Grupo Admin com esta Imagem
        </button>
      </div>
    </div>
  </div>`;
}

const exportsZapRelatorios = { blocoRelatorioAdmin, folhaRelatorioPreview, folhaRelatorioOperacaoPreview, folhaImagemPreview };
if (typeof window !== 'undefined') Object.assign(window, exportsZapRelatorios);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsZapRelatorios);

