/* =====================================================================
   PÁTIO CRM — MÓDULO DE COMUNICAÇÃO & RÉGUA DE COBRANÇA WHATSAPP
===================================================================== */

function viewMensagens() {
  const zap = S.zap || zapPadrao();
  const abas = [
    ['cobranca', 'Fila de Cobrança'],
    ['campanhas', 'Campanhas & Pós-Venda'],
    ['regua', 'Régua Automática'],
    ['historico', 'Histórico de Envios (' + (zap.envios ? zap.envios.length : 0) + ')']
  ];
  const a = S.ui.abaZap || 'cobranca';

  let corpo = '';
  if (a === 'cobranca') corpo = blocoCobranca();
  else if (a === 'campanhas') corpo = blocoCampanhas();
  else if (a === 'regua') corpo = blocoRegua();
  else corpo = blocoHistoricoZap();

  return `
  <div class="kpis" style="margin-bottom:14px">
    <div class="kpi bom">
      <div class="r">${ico('zap', 14)} Módulo WhatsApp</div>
      <div class="v" style="font-size:20px;color:${zap.ativo ? 'var(--verde)' : 'var(--aco-400)'}">
        ${zap.ativo ? '● Ativo' : '○ Pausado'}
      </div>
      <div class="d">Régua e disparos habilitados</div>
    </div>
    <div class="kpi neutro">
      <div class="r">${ico('doc', 14)} Títulos em Régua</div>
      <div class="v">${filaCobranca().length}</div>
      <div class="d">Clientes na fila de cobrança</div>
    </div>
    <div class="kpi bom">
      <div class="r">${ico('check', 14)} Mensagens Enviadas</div>
      <div class="v">${(zap.envios || []).length}</div>
      <div class="d">Registros no histórico</div>
    </div>
    <div class="kpi aviso">
      <div class="r">${ico('cfg', 14)} Etapas da Régua</div>
      <div class="v">${(zap.regua || []).filter(r => r.ativo).length}</div>
      <div class="d">Gatilhos automáticos configurados</div>
    </div>
  </div>

  <div class="entre" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div class="abas" style="margin:0">
      ${abas.map(([k, r]) => `<button data-act="aba-zap" data-k="${k}" aria-selected="${a === k}">${r}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ${zap.ativo ? 'btn-secundario' : 'btn-sucesso'}" data-act="liga-zap" style="font-size:13px;padding:6px 14px">
        ${zap.ativo ? 'Pausar Régua' : 'Ativar Régua'}
      </button>
      <button class="btn btn-secundario" data-act="ver-api" style="font-size:13px;padding:6px 14px">
        ${ico('cfg', 14)} Configurar API WhatsApp
      </button>
    </div>
  </div>

  ${corpo}`;
}

function zapPadrao() {
  return {
    ativo: true,
    soUteis: true,
    regua: [
      { id: 'r1', quando: -2, ativo: true, nome: 'Lembrete de Vencimento (2 dias antes)', texto: 'Olá {nome}, tudo bem? Passando para lembrar do título de {valor} com vencimento em {venc}. Caso precise do boleto ou chave Pix, estamos à disposição! 🚛 {empresa}' },
      { id: 'r2', quando: 1, ativo: true, nome: 'Aviso de Vencimento Hoje / D+1', texto: 'Olá {nome}! Identificamos que o título referente à {desc} no valor de {valor} venceu em {venc}. Podemos confirmar o pagamento ou reenviar a chave Pix? Obrigado! {empresa}' },
      { id: 'r3', quando: 7, ativo: true, nome: 'Cobrança Preventiva (7 dias em atraso)', texto: 'Olá {contato}, tudo bem? Não localizamos o pagamento da {desc} no valor de {valor} (vencida em {venc}). Poderia nos enviar o comprovante ou nos dar uma previsão para regularização? Obrigado, {empresa}.' }
    ],
    campanhas: [],
    envios: [],
    modelos: [
      { nome: 'OS Pronta para Retirada', texto: 'Olá {nome}! Informamos que a OS do caminhão placa *{placa}* foi concluída com sucesso! 🚛 O veículo já está testado e liberado para retirada no pátio da {empresa}.' },
      { nome: 'Orçamento para Aprovação', texto: 'Olá {nome}! O orçamento da OS do veículo *{placa}* ficou em *{valor}* com previsão de entrega para {prev}. Podemos dar início aos serviços? {empresa}' },
      { nome: 'Revisão Preventiva de 10.000 km', texto: 'Olá {nome}! Constatamos que já faz algum tempo desde a última revisão do seu caminhão placa *{placa}*. A manutenção preventiva evita paradas não programadas na rodovia! Agende seu horário: {empresa}.' }
    ],
    api: { url: '', token: '' }
  };
}

function foneZap(f) {
  let d = soDigitos(f);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return d;
}

function linkZap(fone, texto) {
  return 'https://wa.me/' + foneZap(fone) + '?text=' + encodeURIComponent(texto || '');
}

function preencher(txt, ctx) {
  return String(txt || '').replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] !== undefined ? ctx[k] : m));
}

function ctxCobranca(c, cli) {
  return {
    nome: cli ? (cli.contato || cli.fantasia || cli.nome) : c.parte,
    contato: cli ? (cli.contato || cli.nome) : c.parte,
    empresa: S.cfg.empresa,
    desc: c.desc,
    valor: brl(c.valor),
    venc: dataBRfull(c.venc),
    pix: S.cfg.chavePix || ''
  };
}

function filaCobranca() {
  const rec = emAberto('receber');
  const dH = hoje();
  const regua = (S.zap && S.zap.regua) ? S.zap.regua.filter(r => r.ativo) : [];
  const fila = [];

  rec.forEach(c => {
    const diff = diasEntre(dH, c.venc);
    const cli = S.clientes.find(x => x.nome === c.parte || x.id === c.cli);

    regua.forEach(regra => {
      // Regra de quando: se diff === regra.quando
      if (diff === regra.quando || (regra.quando > 0 && diff >= regra.quando && diff < regra.quando + 3)) {
        const chave = `${c.id}_${regra.id}`;
        const jaEnviado = (S.zap.envios || []).some(e => e.chave === chave);
        if (!jaEnviado) {
          fila.push({
            chave,
            conta: c,
            cli,
            regra,
            diff,
            texto: preencher(regra.texto, ctxCobranca(c, cli))
          });
        }
      }
    });
  });

  return fila;
}

function blocoCobranca() {
  const fila = filaCobranca();

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Fila de Mensagens Automáticas de Cobrança (${fila.length})</div>
      <div class="mini">Títulos em vencimento ou atraso mapeados pelas etapas da régua</div>
    </div>
    ${fila.length ? `<button class="btn btn-primario" onclick="torrar('Disparo em massa iniciado (simulação).', 'sucesso')" style="font-weight:600">${(typeof ico === 'function' ? ico('zap', 14) : '⚡')} Disparar para Todos</button>` : ''}
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr>
            <th>Etapa / Regra</th>
            <th>Cliente / Sacado</th>
            <th>Documento / Vencimento</th>
            <th style="width:110px;text-align:right">Valor</th>
            <th style="width:160px;text-align:center">Ações WhatsApp</th>
          </tr>
        </thead>
        <tbody>
          ${fila.length ? fila.map(item => {
            let statusBadge = item.diff < 0 
              ? `<span style="display:inline-block;margin-top:4px;padding:2px 6px;background:var(--tijolo);color:#fff;border-radius:4px;font-size:11px;font-weight:600">Atrasado há ${Math.abs(item.diff)} dias</span>`
              : (item.diff === 0 
                ? `<span style="display:inline-block;margin-top:4px;padding:2px 6px;background:var(--laranja);color:#fff;border-radius:4px;font-size:11px;font-weight:600">Vence Hoje</span>`
                : `<span style="display:inline-block;margin-top:4px;padding:2px 6px;background:var(--verde);color:#fff;border-radius:4px;font-size:11px;font-weight:600">Vence em ${item.diff} dias</span>`);

            return `
            <tr>
              <td>
                <span class="selo selo-aprovacao">${esc(item.regra.nome)}</span><br>
                ${statusBadge}
              </td>
              <td>
                <b>${esc(item.cli ? (item.cli.fantasia || item.cli.nome) : item.conta.parte)}</b>
                <div class="mini">Tel: ${esc(item.cli ? item.cli.fone : '—')}</div>
              </td>
              <td>
                <div>${esc(item.conta.desc)}</div>
                <div class="mini mono">Vencimento: ${dataBRfull(item.conta.venc)}</div>
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(item.conta.valor)}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <a href="${linkZap(item.cli ? item.cli.fone : '', item.texto)}" target="_blank" class="btn btn-sucesso" data-act="enviar-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px;text-decoration:none">
                    ${ico('zap', 12)} Enviar
                  </a>
                  <button class="btn btn-secundario" data-act="copiar-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px" title="Copiar texto">
                    ${ico('copiar', 12)}
                  </button>
                  <button class="btn btn-secundario" data-act="pular-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px" title="Pular">
                    ${ico('x', 12)}
                  </button>
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr>
              <td colspan="5" style="text-align:center;padding:36px;color:var(--aco-400)">
                <div style="margin-bottom:8px">${ico('check', 28)}</div>
                <b>Fila de cobrança zerada!</b><br>
                Nenhum cliente necessitando de contato no dia de hoje.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function blocoCampanhas() {
  const camp = S.ui.camp = S.ui.camp || { seg: 'todos', texto: '', nome: 'Campanha de Revisão' };
  const modelos = S.zap.modelos || [];

  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">Disparo de Campanhas & Pós-Venda</div>

      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Modelo Pré-Pronto:</label>
          <select class="campo-select" data-act="camp-modelo" style="width:100%;height:34px">
            <option value="">-- Escolha um modelo --</option>
            ${modelos.map((m, idx) => `<option value="${idx}">${esc(m.nome)}</option>`).join('')}
          </select>
        </div>

        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Segmento de Destinatários:</label>
          <select class="campo-select" data-act="camp" data-c="seg" style="width:100%;height:34px">
            <option value="todos" ${camp.seg === 'todos' ? 'selected' : ''}>Todos os Clientes Cadastrados (${S.clientes.length})</option>
            <option value="frotistas" ${camp.seg === 'frotistas' ? 'selected' : ''}>Transportadoras & Frotistas</option>
            <option value="inativos" ${camp.seg === 'inativos' ? 'selected' : ''}>Sem Manutenção há mais de 60 Dias</option>
          </select>
        </div>

        <div>
          <label style="font-weight:600;display:block;margin-bottom:4px">Texto da Mensagem:</label>
          <textarea class="campo-texto" data-act="camp" data-c="texto" rows="5" placeholder="Digite a mensagem ou use marcadores como {nome}, {placa}, {empresa}..." style="width:100%">${esc(camp.texto || '')}</textarea>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{nome}">{nome}</span>
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{placa}">{placa}</span>
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{empresa}">{empresa}</span>
          <span class="selo" style="cursor:pointer" data-act="copiar-var" data-v="{valor}">{valor}</span>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
          <button class="btn btn-secundario" data-act="copiar-camp">${ico('copiar', 14)} Copiar Mensagem</button>
          <button class="btn btn-primario" data-act="disparar-camp">${ico('zap_send', 14)} Iniciar Disparos</button>
        </div>
      </div>
    </div>

    <div class="card card-p">
      <div style="font-weight:700;font-size:15px;margin-bottom:10px">Histórico de Campanhas Realizadas</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${(S.zap.campanhas || []).length ? S.zap.campanhas.map(cp => `
          <div class="entre" style="padding:8px;background:var(--aco-050);border-radius:6px;font-size:13px">
            <div>
              <b>${esc(cp.nome)}</b>
              <div class="mini">Data: ${dataBRfull(cp.data)} · Segmento: ${esc(cp.seg)}</div>
            </div>
            <span class="selo selo-finalizada">${cp.enviados} disparos</span>
          </div>
        `).join('') : `
          <div style="text-align:center;padding:30px;color:var(--aco-400)">Nenhuma campanha disparada ainda.</div>
        `}
      </div>
    </div>
  </div>`;
}

function blocoRegua() {
  const regua = (S.zap && S.zap.regua) || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div>
      <div style="font-weight:700;font-size:15px">Configuração dos Gatilhos da Régua</div>
      <div class="mini">Defina quando cada notificação será gerada em relação ao vencimento do título</div>
    </div>
    <button class="btn btn-primario" data-act="add-regra" style="font-size:13px;padding:6px 14px">
      ${ico('mais', 14)} Nova Etapa
    </button>
  </div>

  <div style="display:flex;flex-direction:column;gap:12px">
    ${regua.map(r => `
      <div class="card card-p" style="border-left:4px solid ${r.ativo ? 'var(--petroleo)' : 'var(--aco-300)'}">
        <div class="entre" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" ${r.ativo ? 'checked' : ''} data-act="liga-regra" data-i="${r.id}">
            <b style="font-size:14px">${esc(r.nome)}</b>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-icone-perigo" data-act="rm-regra" data-i="${r.id}">${ico('lixo', 14)}</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:140px 1fr;gap:12px;align-items:center">
          <div>
            <label class="mini" style="font-weight:600;display:block">Disparar no dia:</label>
            <input type="number" class="campo-texto" value="${r.quando}" data-act="regra" data-c="quando" data-i="${r.id}" style="width:100%;height:32px;text-align:center">
            <div class="mini" style="font-size:10.5px;color:var(--aco-500);margin-top:2px">negativo = antes<br>positivo = após venc.</div>
          </div>
          <div>
            <label class="mini" style="font-weight:600;display:block">Mensagem Padrão:</label>
            <textarea class="campo-texto" data-act="regra" data-c="texto" data-i="${r.id}" rows="2" style="width:100%">${esc(r.texto)}</textarea>
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function blocoHistoricoZap() {
  const envios = (S.zap && S.zap.envios) || [];

  return `
  <div class="entre" style="margin-bottom:12px">
    <div style="font-weight:700;font-size:15px">Registro Geral de Envios WhatsApp (${envios.length})</div>
    ${envios.length ? `<button class="btn btn-perigo" data-act="limpar-hist" style="font-size:12px;padding:4px 10px">Limpar Histórico</button>` : ''}
  </div>

  <div class="card">
    <div class="tabela-responsiva">
      <table class="tabela">
        <thead>
          <tr><th>Data / Hora</th><th>Destinatário</th><th>Tipo / Campanha</th><th>Mensagem Registrada</th><th style="width:90px;text-align:center">Status</th></tr>
        </thead>
        <tbody>
          ${envios.length ? envios.map(e => `
            <tr>
              <td class="mono">${dataBRfull(e.data || hoje())}</td>
              <td><b>${esc(e.cliente || '—')}</b><div class="mini">${esc(e.fone || '')}</div></td>
              <td><span class="selo">${esc(e.rotulo || e.tipo)}</span></td>
              <td style="font-size:12.5px;color:var(--aco-700)">${esc(e.texto)}</td>
              <td style="text-align:center"><span class="selo ${e.status === 'enviado' ? 'selo-finalizada' : 'selo-fila'}">${esc(e.status)}</span></td>
            </tr>
          `).join('') : `
            <tr><td colspan="5" style="text-align:center;padding:30px;color:var(--aco-400)">Nenhum envio registrado até o momento.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>`;
}

function folhaAPI() {
  const api = (S.zap && S.zap.api) || {};

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:700">Configuração de Gateway WhatsApp API</h3>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div class="mini">
        Integre seu gateway (Evolution API, Z-API, Baileys ou Z-Stack) para permitir disparos de mensagens 100% automáticos sem abrir o navegador.
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Endpoint / URL da API:</label>
        <input type="text" class="campo-texto" placeholder="https://api.seugateway.com/message/sendText" data-act="api-cfg" data-c="url" value="${esc(api.url || '')}" style="width:100%;height:34px">
      </div>

      <div>
        <label style="font-weight:600;display:block;margin-bottom:4px">Token de Autenticação / Bearer:</label>
        <input type="password" class="campo-texto" placeholder="Bearer eyJhbGciOi..." data-act="api-cfg" data-c="token" value="${esc(api.token || '')}" style="width:100%;height:34px">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-primario" data-act="fechar">Salvar Configurações</button>
    </div>
  </div>`;
}

function folhaDisparo() {
  const d = S.ui.disparo;
  if (!d || !d.lista || d.ix >= d.lista.length) {
    return `<div class="card card-p">Disparo concluído! ${d ? d.enviados : 0} mensagens registradas.<br><br><button class="btn btn-primario" data-act="fechar-disparo">Concluir</button></div>`;
  }

  const cli = d.lista[d.ix];
  const textoPronto = preencher(d.texto, ctxCliente(cli));

  return `
  <div class="card card-p" style="max-width:550px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">Disparo de Campanha (${d.ix + 1}/${d.lista.length})</h3>
        <div class="mini">Campanha: <b>${esc(d.nome)}</b></div>
      </div>
      <button class="btn-fechar" data-act="fechar-disparo">${ico('x', 18)}</button>
    </div>

    <div style="background:var(--aco-050);padding:12px;border-radius:8px;margin-bottom:14px;border:1px solid var(--aco-150)">
      <div><b>Destinatário:</b> ${esc(cli.nome)}</div>
      <div class="mini">Telefone: <b>${esc(cli.fone || 'Sem número')}</b></div>
    </div>

    <div style="font-weight:600;font-size:13px;margin-bottom:6px">Mensagem Personalizada:</div>
    <div style="background:var(--branco);border:1px solid var(--aco-200);padding:12px;border-radius:8px;font-size:13px;line-height:1.4;margin-bottom:16px;white-space:pre-wrap">
      ${esc(textoPronto)}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-secundario" data-act="disparo-pular">Pular Contato</button>
      <div style="display:flex;gap:8px">
        <a href="${linkZap(cli.fone, textoPronto)}" target="_blank" class="btn btn-sucesso" data-act="disparo-enviar" style="text-decoration:none;font-weight:600;padding:0 16px">
          ${ico('zap', 14)} Abrir e Enviar
        </a>
      </div>
    </div>
  </div>`;
}

function destinatarios(seg) {
  const lista = S.clientes || [];
  if (seg === 'frotistas') return lista.filter(c => c.doc && c.doc.length > 14);
  return lista;
}

function ctxCliente(cli) {
  return {
    nome: cli.contato || cli.fantasia || cli.nome,
    contato: cli.contato || cli.nome,
    empresa: S.cfg.empresa,
    placa: 'Veículo da Frota'
  };
}

function registrarEnvio(reg) {
  S.zap = S.zap || zapPadrao();
  S.zap.envios = S.zap.envios || [];
  S.zap.envios.unshift(Object.assign({ id: uid('en'), data: hoje() }, reg));
  salvar();
}
