/* =====================================================================
   PÁTIO CRM — WHATSAPP COBRANÇA, RÉGUA & CAMPANHAS
   Submódulo de fila de cobrança automática, campanhas de pós-venda e régua
   ===================================================================== */

function blocoCobranca() {
  const fila = (typeof filaCobranca === 'function') ? filaCobranca() : [];

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
                <div class="mini mono">Vencimento: ${typeof dataBRfull === 'function' ? dataBRfull(item.conta.venc) : item.conta.venc}</div>
              </td>
              <td style="text-align:right;font-weight:700" class="num">${brl(item.conta.valor)}</td>
              <td style="text-align:center">
                <div style="display:inline-flex;gap:4px">
                  <a href="${typeof linkZap === 'function' ? linkZap(item.cli ? item.cli.fone : '', item.texto) : '#'}" target="_blank" class="btn btn-sucesso" data-act="enviar-cob" data-k="${item.chave}" style="padding:4px 8px;font-size:12px;text-decoration:none">
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
  const camp = (S.ui && (S.ui.camp = S.ui.camp || { seg: 'todos', texto: '', nome: 'Campanha de Revisão' })) || {};
  const modelos = (S.zap && S.zap.modelos) || [];
  const clientes = S.clientes || [];

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
            <option value="todos" ${camp.seg === 'todos' ? 'selected' : ''}>Todos os Clientes Cadastrados (${clientes.length})</option>
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
        ${(S.zap && S.zap.campanhas && S.zap.campanhas.length) ? S.zap.campanhas.map(cp => `
          <div class="entre" style="padding:8px;background:var(--aco-050);border-radius:6px;font-size:13px">
            <div>
              <b>${esc(cp.nome)}</b>
              <div class="mini">Data: ${typeof dataBRfull === 'function' ? dataBRfull(cp.data) : cp.data} · Segmento: ${esc(cp.seg)}</div>
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
              <td class="mono">${typeof dataBRfull === 'function' ? dataBRfull(e.data || hoje()) : (e.data || '')}</td>
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

const exportsZapCobranca = { blocoCobranca, blocoCampanhas, blocoRegua, blocoHistoricoZap };
if (typeof window !== 'undefined') Object.assign(window, exportsZapCobranca);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsZapCobranca);

