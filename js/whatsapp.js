/* =====================================================================
   PÁTIO CRM — MÓDULO DE COMUNICAÇÃO & RÉGUA DE COBRANÇA WHATSAPP
   Fachada Central e Orquestrador (Padrão Facade / Re-export)
   Submódulos:
   - js/modules/whatsapp_cobranca_campanhas.js: Fila de cobrança e régua
   - js/modules/whatsapp_conexao_qr.js: Conexão QR Code, gateway e disparo
   - js/modules/whatsapp_relatorios_preview.js: Prévia de relatórios e grupos
   ===================================================================== */

function viewMensagens() {
  const zap = S.zap || (typeof zapPadrao === 'function' ? zapPadrao() : {});
  const abas = [
    ['cobranca', 'Fila de Cobrança'],
    ['campanhas', 'Campanhas & Pós-Venda'],
    ['regua', 'Régua Automática'],
    ['relatorioAdmin', 'Grupos & Relatórios 📊'],
    ['historico', 'Histórico de Envios (' + (zap.envios ? zap.envios.length : 0) + ')']
  ];
  const a = (S.ui && S.ui.abaZap) || 'cobranca';

  let corpo = '';
  if (a === 'cobranca') corpo = (typeof blocoCobranca === 'function') ? blocoCobranca() : '';
  else if (a === 'campanhas') corpo = (typeof blocoCampanhas === 'function') ? blocoCampanhas() : '';
  else if (a === 'regua') corpo = (typeof blocoRegua === 'function') ? blocoRegua() : '';
  else if (a === 'relatorioAdmin') corpo = (typeof blocoRelatorioAdmin === 'function') ? blocoRelatorioAdmin() : '';
  else corpo = (typeof blocoHistoricoZap === 'function') ? blocoHistoricoZap() : '';

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
      <div class="v">${(typeof filaCobranca === 'function' ? filaCobranca() : []).length}</div>
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
      <button class="btn btn-primario" data-act="conectar-wpp" style="font-size:13px;padding:6px 14px">
        📱 Conectar WhatsApp Web
      </button>
      <button class="btn ${zap.ativo ? 'btn-secundario' : 'btn-sucesso'}" data-act="liga-zap" style="font-size:13px;padding:6px 14px">
        ${zap.ativo ? 'Pausar Régua' : 'Ativar Régua'}
      </button>
      <button class="btn btn-secundario" data-act="ver-api" style="font-size:13px;padding:6px 14px">
        ${ico('cfg', 14)} Gateway Externo
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
  let d = (typeof soDigitos === 'function') ? soDigitos(f) : String(f || '').replace(/\D/g, '');
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
    empresa: (S.cfg && S.cfg.empresa) || 'Oficina Mecânica',
    desc: c.desc,
    valor: brl(c.valor),
    venc: typeof dataBRfull === 'function' ? dataBRfull(c.venc) : c.venc,
    pix: (S.cfg && S.cfg.chavePix) || ''
  };
}

function filaCobranca() {
  const rec = (typeof emAberto === 'function') ? emAberto('receber') : [];
  const dH = hoje();
  const regua = (S.zap && S.zap.regua) ? S.zap.regua.filter(r => r.ativo) : [];
  const fila = [];

  rec.forEach(c => {
    const diff = (typeof diasEntre === 'function') ? diasEntre(dH, c.venc) : 0;
    const cli = (S.clientes || []).find(x => x.nome === c.parte || x.id === c.cli);

    regua.forEach(regra => {
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

// Binds no escopo global
const exportsZap = {
  viewMensagens,
  zapPadrao,
  foneZap,
  linkZap,
  preencher,
  ctxCobranca,
  filaCobranca,
  blocoCobranca: typeof blocoCobranca !== 'undefined' ? blocoCobranca : undefined,
  blocoCampanhas: typeof blocoCampanhas !== 'undefined' ? blocoCampanhas : undefined,
  blocoRegua: typeof blocoRegua !== 'undefined' ? blocoRegua : undefined,
  blocoHistoricoZap: typeof blocoHistoricoZap !== 'undefined' ? blocoHistoricoZap : undefined,
  folhaAPI: typeof folhaAPI !== 'undefined' ? folhaAPI : undefined,
  folhaConectarWpp: typeof folhaConectarWpp !== 'undefined' ? folhaConectarWpp : undefined,
  folhaDisparo: typeof folhaDisparo !== 'undefined' ? folhaDisparo : undefined,
  destinatarios: typeof destinatarios !== 'undefined' ? destinatarios : undefined,
  ctxCliente: typeof ctxCliente !== 'undefined' ? ctxCliente : undefined,
  registrarEnvio: typeof registrarEnvio !== 'undefined' ? registrarEnvio : undefined,
  blocoRelatorioAdmin: typeof blocoRelatorioAdmin !== 'undefined' ? blocoRelatorioAdmin : undefined,
  folhaRelatorioPreview: typeof folhaRelatorioPreview !== 'undefined' ? folhaRelatorioPreview : undefined,
  folhaRelatorioOperacaoPreview: typeof folhaRelatorioOperacaoPreview !== 'undefined' ? folhaRelatorioOperacaoPreview : undefined,
  folhaImagemPreview: typeof folhaImagemPreview !== 'undefined' ? folhaImagemPreview : undefined
};

if (typeof window !== 'undefined') Object.assign(window, exportsZap);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsZap);
if (typeof module !== 'undefined' && module.exports) module.exports = exportsZap;
