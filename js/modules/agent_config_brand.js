/* Submódulo de Identidade Visual, Motor Camaleão e Integrações API: agent_config_brand.js */
/* Pátio-CRM — Submódulo extraído de js/modules/agent_config.js (< 350 linhas) */

/* =====================================================================
   PÁTIO CRM — SUPER-MENU DE CONFIGURAÇÕES ENTERPRISE (12 ABAS)
===================================================================== */

const ABAS_CONFIGURACOES = [
  { id: 'geral', label: 'GERAL', icon: '🏢' },
  { id: 'plano_contas', label: 'PLANO DE CONTAS', icon: '📊' },
  { id: 'contas_caixa', label: 'CONTAS CAIXA', icon: '🏦' },
  { id: 'operacoes', label: 'OPERAÇÕES', icon: '🚛' },
  { id: 'formas_pgto', label: 'FORMAS PGTO', icon: '💳' },
  { id: 'boletos', label: 'BOLETOS', icon: '📄' },
  { id: 'cobrancas', label: 'COBRANÇAS', icon: '📲' },
  { id: 'fiscal', label: 'FISCAL', icon: '🧾' },
  { id: 'dados_tributarios', label: 'DADOS TRIBUTÁRIOS', icon: '⚖️' },
  { id: 'contabil', label: 'CONTÁBIL', icon: '📑' },
  { id: 'usuarios', label: 'USUÁRIOS', icon: '👥' },
  { id: 'api', label: 'API', icon: '🔌' }
];

function setAbaConfiguracoes(abaId) {
  S.ui.abaCfg = abaId;
  render();
}

function processarUploadLogoCamaleao(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    
    // Extrai paleta usando motor camaleão
    if (typeof extrairPaletaDaImagem === 'function') {
      extrairPaletaDaImagem(base64, (paleta) => {
        S.cfg = S.cfg || {};
        S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
        S.cfg.identidadeVisual.logo = base64;
        S.cfg.identidadeVisual.logoUrl = base64;
        S.cfg.identidadeVisual.paleta = paleta;

        if (typeof aplicarTemaDinamico === 'function') {
          aplicarTemaDinamico(paleta);
        }
        salvarLocal();
        render();
        torrar('✨ Logotipo processado! Cores Camaleão extraídas e aplicadas em tempo real.', 'sucesso');
      });
    } else {
      S.cfg = S.cfg || {};
      S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
      S.cfg.identidadeVisual.logo = base64;
      salvarLocal();
      render();
      torrar('Logotipo salvo com sucesso!', 'sucesso');
    }
  };
  reader.readAsDataURL(file);
}

function atualizarCorManual(varName, cor) {
  document.documentElement.style.setProperty(varName, cor);
  S.cfg = S.cfg || {};
  S.cfg.identidadeVisual = S.cfg.identidadeVisual || {};
  S.cfg.identidadeVisual.coresManuais = S.cfg.identidadeVisual.coresManuais || {};
  S.cfg.identidadeVisual.coresManuais[varName] = cor;
  
  if (varName === '--brand-primary') {
    document.documentElement.style.setProperty('--brand-primary-hover', cor);
  }
  salvarLocal();
  torrar(`Cor ${varName} atualizada para ${cor}`, 'neutro');
}

function restaurarCoresPadrao() {
  const defaultPrimary = '#0f766e';
  const defaultAccent = '#f59e0b';
  document.documentElement.style.setProperty('--brand-primary', defaultPrimary);
  document.documentElement.style.setProperty('--brand-primary-hover', '#115e59');
  document.documentElement.style.setProperty('--brand-primary-light', '#f0fdfa');
  document.documentElement.style.setProperty('--brand-accent', defaultAccent);
  
  if (S.cfg && S.cfg.identidadeVisual) {
    delete S.cfg.identidadeVisual.coresManuais;
    delete S.cfg.identidadeVisual.paleta;
  }
  salvarLocal();
  render();
  torrar('Paleta restaurada para o padrão Pátio CRM!', 'sucesso');
}

function salvarConfigGeralForm() {
  S.cfg = S.cfg || {};
  S.cfg.empresa = document.getElementById('cfg_empresa_nome')?.value || S.cfg.empresa;
  S.cfg.razaoSocial = document.getElementById('cfg_razao_social')?.value || S.cfg.razaoSocial;
  S.cfg.cnpj = document.getElementById('cfg_cnpj')?.value || S.cfg.cnpj;
  S.cfg.ie = document.getElementById('cfg_ie')?.value || S.cfg.ie;
  S.cfg.fone = document.getElementById('cfg_fone')?.value || S.cfg.fone;
  S.cfg.endereco = document.getElementById('cfg_endereco')?.value || S.cfg.endereco;
  S.cfg.email = document.getElementById('cfg_email')?.value || S.cfg.email;
  S.cfg.chavePix = document.getElementById('cfg_chave_pix')?.value || S.cfg.chavePix;

  salvarLocal();
  torrar('Configurações gerais salvas com sucesso!', 'sucesso');
}


function renderAbaIntegracoesApi() {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px">
      <h3 style="margin:0 0 14px 0;font-size:16px;font-weight:700;color:#0f172a">🔌 API Enterprise & Webhooks</h3>
      
      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Chave de API (Secret Key):</label>
        <div style="display:flex;gap:8px">
          <input type="text" readonly class="campo-texto" value="patio_live_sk_948293847291847298374928" style="flex:1;height:36px;font-family:monospace;font-size:12px;background:#f8fafc">
          <button class="btn btn-secundario" onclick="navigator.clipboard.writeText('patio_live_sk_948293847291847298374928');torrar('Chave de API copiada!','sucesso')">Copiar</button>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:#334155;display:block;margin-bottom:4px">Webhook URL (Notificações Pix / Boletos):</label>
        <input type="text" class="campo-texto" value="https://api.automolasfort.com.br/webhooks/patio" style="width:100%;height:36px;font-size:13px">
      </div>

      <div style="padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
        <div>
          <b style="font-size:13.5px;color:#0f172a">Assistente Operacional & Configuração de Voz</b>
          <div style="font-size:12px;color:#64748b">Ajuste o timbre de voz e personalidade da assistente Verônica</div>
        </div>
        <button class="btn btn-primario" onclick="abrirConfiguracoesAgente()">Abrir Painel de Voz</button>
      </div>
    </div>`;
}

if (typeof window !== 'undefined') {
  window.ABAS_CONFIGURACOES = ABAS_CONFIGURACOES;
  window.setAbaConfiguracoes = setAbaConfiguracoes;
  window.processarUploadLogoCamaleao = processarUploadLogoCamaleao;
  window.atualizarCorManual = atualizarCorManual;
  window.restaurarCoresPadrao = restaurarCoresPadrao;
  window.salvarConfigGeralForm = salvarConfigGeralForm;
  window.renderAbaIntegracoesApi = renderAbaIntegracoesApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ABAS_CONFIGURACOES = ABAS_CONFIGURACOES;
  globalThis.setAbaConfiguracoes = setAbaConfiguracoes;
  globalThis.processarUploadLogoCamaleao = processarUploadLogoCamaleao;
  globalThis.atualizarCorManual = atualizarCorManual;
  globalThis.restaurarCoresPadrao = restaurarCoresPadrao;
  globalThis.salvarConfigGeralForm = salvarConfigGeralForm;
  globalThis.renderAbaIntegracoesApi = renderAbaIntegracoesApi;
}
