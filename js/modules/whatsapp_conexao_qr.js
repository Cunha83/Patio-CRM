/* =====================================================================
   PÁTIO CRM — WHATSAPP CONEXÃO, QR CODE & DISPARO
   Submódulo para conexão QR code, configuração de API e fila de disparo
   ===================================================================== */

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

function folhaConectarWpp() {
  const wpp = (S.ui && S.ui.wppStatus) || { status: 'carregando' };

  let conteudoStatus = '';
  if (wpp.status === 'pronto') {
    conteudoStatus = `
      <div style="background:#e8f5e9;border:1px solid #81c784;color:#2e7d32;padding:16px;border-radius:8px;text-align:center;margin-bottom:16px">
        <div style="font-size:24px;margin-bottom:4px">✅</div>
        <div style="font-weight:700;font-size:16px">WhatsApp Conectado e Pronto!</div>
        <div style="font-size:13px;margin-top:4px;color:#1b5e20">Número Conectado: <b>${esc(wpp.user || 'Sessão Ativa')}</b></div>
        <div style="font-size:12px;margin-top:8px;color:#388e3c">O Agente com Inteligência Artificial Gemini está ouvindo mensagens e pronto para abrir OS e tirar dúvidas.</div>
      </div>
    `;
  } else if (wpp.status === 'aguardando_qr' && (wpp.qrImage || wpp.qr)) {
    const srcImg = wpp.qrImage || `/api/whatsapp/qr.png?t=${Date.now()}`;
    conteudoStatus = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-weight:600;font-size:14px;margin-bottom:12px;color:var(--aco-800)">
          Escaneie o QR Code abaixo com o WhatsApp do seu celular:
        </div>
        <div style="display:inline-block;padding:12px;background:#ffffff;border:2px solid var(--verde);border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.12)">
          <img src="${srcImg}" alt="QR Code WhatsApp" style="width:260px;height:260px;display:block;image-rendering:pixelated" />
        </div>
        <div style="margin-top:10px">
          <a href="/api/whatsapp/qr.png" target="_blank" class="btn btn-secundario" style="font-size:11px;padding:4px 10px;text-decoration:none;display:inline-block">
            🔍 Abrir QR Code em tela cheia / Imagem Direta
          </a>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--aco-500);line-height:1.5">
          1. Abra o <b>WhatsApp</b> no celular<br>
          2. Toque em <b>Mais opções (⋮)</b> ou <b>Configurações</b> > <b>Aparelhos conectados</b><br>
          3. Toque em <b>Conectar um aparelho</b> e aponte a câmera
        </div>
      </div>
    `;
  } else {
    conteudoStatus = `
      <div style="text-align:center;padding:24px;color:var(--aco-500)">
        <div style="font-size:24px;margin-bottom:8px">⏳</div>
        <div style="font-weight:600">Inicializando serviço do WhatsApp...</div>
        <div style="font-size:12px;margin-top:4px">O navegador virtual está subindo. Aguarde alguns segundos.</div>
      </div>
    `;
  }

  return `
  <div class="card card-p" style="max-width:520px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
      <div>
        <h3 style="font-size:17px;font-weight:700">📱 WhatsApp Web & Agente IA</h3>
        <div class="mini">Servidor Central Pátio CRM</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    ${conteudoStatus}

    <div style="background:var(--aco-050);padding:12px;border-radius:8px;margin-bottom:14px;border:1px solid var(--aco-150);font-size:12px">
      <div style="font-weight:600;margin-bottom:4px">🌐 Acesso na Rede Local (Wi-Fi):</div>
      <div>Outros computadores ou celulares podem acessar: <b style="color:var(--azul)">http://192.168.15.15:3000</b></div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--aco-150);padding-top:12px">
      <button class="btn btn-secundario" data-act="recarregar-qr-wpp" style="font-size:12px">
        🔄 Atualizar Status
      </button>
      <button class="btn btn-primario" data-act="fechar" style="font-size:12px">
        Fechar
      </button>
    </div>
  </div>`;
}

function folhaDisparo() {
  const d = S.ui && S.ui.disparo;
  if (!d || !d.lista || d.ix >= d.lista.length) {
    return `<div class="card card-p">Disparo concluído! ${d ? d.enviados : 0} mensagens registradas.<br><br><button class="btn btn-primario" data-act="fechar-disparo">Concluir</button></div>`;
  }

  const cli = d.lista[d.ix];
  const textoPronto = (typeof preencher === 'function') ? preencher(d.texto, ctxCliente(cli)) : d.texto;

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
        <a href="${typeof linkZap === 'function' ? linkZap(cli.fone, textoPronto) : '#'}" target="_blank" class="btn btn-sucesso" data-act="disparo-enviar" style="text-decoration:none;font-weight:600;padding:0 16px">
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
    empresa: (S.cfg && S.cfg.empresa) || 'Oficina Mecânica',
    placa: 'Veículo da Frota'
  };
}

function registrarEnvio(reg) {
  S.zap = S.zap || (typeof zapPadrao === 'function' ? zapPadrao() : {});
  S.zap.envios = S.zap.envios || [];
  const idEnvio = (typeof uid === 'function' ? uid('en') : 'en_' + Date.now());
  S.zap.envios.unshift(Object.assign({ id: idEnvio, data: hoje() }, reg));
  if (typeof salvar === 'function') salvar();
}

const exportsZapConexao = { folhaAPI, folhaConectarWpp, folhaDisparo, destinatarios, ctxCliente, registrarEnvio };
if (typeof window !== 'undefined') Object.assign(window, exportsZapConexao);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsZapConexao);

