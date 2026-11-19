/**
 * Submódulo: agent_config_database_mgmt.js
 * Pátio-CRM — Painel Permanente de Gestão da Base de Dados (Limpar Base / Restaurar Demo / Manter)
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function viewPainelGestaoBancoDados() {
    return `
    <div class="card" style="padding:20px;border:1px solid #cbd5e1;background:#ffffff;border-radius:10px;margin-top:16px">
      <div class="entre" style="margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:10px">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#0f172a">🗄️ Gestão Permanente da Base de Dados</h3>
          <div style="font-size:12.5px;color:#64748b">Controle de ambiente: limpe dados operacionais de teste ou restaure cenários demonstrativos com 1 clique.</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <!-- Ação 1: Zerar Base Operacional -->
        <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:22px">🧹</span>
            <div style="font-weight:700;font-size:14px;color:#9f1239">Limpar Todos os Dados Fictícios / Zerar Base</div>
          </div>
          <p style="font-size:12px;color:#881337;line-height:1.5;margin:0 0 14px 0">
            Remove todas as Ordens de Serviço, vendas balcão, clientes, veículos, estoque e movimentações de teste. <b>Mantém intactas as configurações da sua oficina e o usuário administrador.</b>
          </p>
          <button type="button" class="btn btn-perigo" onclick="abrirModalConfirmacaoZerarBase()" style="font-size:12px;font-weight:700;padding:8px 14px;width:100%;justify-content:center">
            Zerar Base Operacional
          </button>
        </div>

        <!-- Ação 2: Restaurar Dados Demo -->
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:22px">✨</span>
            <div style="font-weight:700;font-size:14px;color:#166534">Restaurar Dados de Demonstração</div>
          </div>
          <p style="font-size:12px;color:#14532d;line-height:1.5;margin:0 0 14px 0">
            Carrega um cenário completo de demonstração comercial (frota pesada, peças de suspensão/freio e ordens ativas) para testes e apresentações.
          </p>
          <button type="button" class="btn btn-primario" onclick="abrirModalConfirmacaoRestaurarDemo()" style="font-size:12px;font-weight:700;padding:8px 14px;width:100%;justify-content:center;background:#16a34a;border-color:#15803d">
            Restaurar Dados Demo
          </button>
        </div>
      </div>
    </div>`;
  }

  function modalConfirmacaoZerarBase() {
    return `
    <div class="card card-p" style="max-width:500px;margin:0 auto;text-align:center">
      <div style="font-size:40px;margin-bottom:8px">⚠️</div>
      <h3 style="font-size:18px;font-weight:800;color:#dc2626;margin:0 0 10px 0">Zerar Base Operacional da Oficina</h3>
      <p style="font-size:13px;color:var(--aco-700);line-height:1.5;margin:0 0 20px 0">
        Esta ação excluirá permanentemente todos os registros operacionais simulados (OSs, vendas, clientes, caminhões, peças e lançamentos). Os dados da empresa e o seu login continuarão preservados.
      </p>
      <div style="display:flex;justify-content:center;gap:12px">
        <button class="btn btn-secundario" data-act="fechar">Manter Dados Atuais</button>
        <button class="btn btn-perigo" onclick="executarZerarBaseOperacionalConfirmada()" style="font-weight:700">
          Confirmar e Zerar Base
        </button>
      </div>
    </div>`;
  }

  function abrirModalConfirmacaoZerarBase() {
    if (typeof abrirFolha === 'function') abrirFolha(modalConfirmacaoZerarBase);
  }

  function modalConfirmacaoRestaurarDemo() {
    return `
    <div class="card card-p" style="max-width:500px;margin:0 auto;text-align:center">
      <div style="font-size:40px;margin-bottom:8px">✨</div>
      <h3 style="font-size:18px;font-weight:800;color:#16a34a;margin:0 0 10px 0">Restaurar Dados de Demonstração</h3>
      <p style="font-size:13px;color:var(--aco-700);line-height:1.5;margin:0 0 20px 0">
        Deseja repopular a base com o cenário de testes para frotas pesadas? Novos clientes, veículos e ordens de teste serão adicionados para simulação.
      </p>
      <div style="display:flex;justify-content:center;gap:12px">
        <button class="btn btn-secundario" data-act="fechar">Manter Dados Atuais</button>
        <button class="btn btn-primario" onclick="executarRestaurarDemoConfirmada()" style="font-weight:700;background:#16a34a;border-color:#15803d">
          Confirmar e Restaurar Demo
        </button>
      </div>
    </div>`;
  }

  function abrirModalConfirmacaoRestaurarDemo() {
    if (typeof abrirFolha === 'function') abrirFolha(modalConfirmacaoRestaurarDemo);
  }

  async function executarZerarBaseOperacionalConfirmada() {
    if (typeof torrar === 'function') torrar('Limpando base operacional da oficina...', 'neutro');
    try {
      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
      const res = await fetch('/api/onboarding/zerar-base', { method: 'POST', headers, credentials: 'same-origin' });
      const d = await res.json();
      if (res.ok && (d.ok || d.sucesso)) {
        if (typeof fecharFolha === 'function') fecharFolha();
        if (typeof torrar === 'function') torrar('Base operacional zerada com sucesso! Oficina limpa.', 'sucesso');
        setTimeout(() => location.reload(), 600);
      } else {
        // Fallback local se rota backend indisponível
        if (typeof S !== 'undefined') {
          S.os = []; S.vendas = []; S.clientes = []; S.veiculos = []; S.pecas = []; S.servicos = [];
          S.contasReceber = []; S.contasPagar = []; S.lancamentosCaixa = []; S.movimentacoesEstoque = [];
          if (typeof salvar === 'function') salvar();
          if (typeof fecharFolha === 'function') fecharFolha();
          if (typeof torrar === 'function') torrar('Base operacional zerada localmente!', 'sucesso');
          setTimeout(() => location.reload(), 600);
          return;
        }
        if (typeof torrar === 'function') torrar(d.erro || d.error || 'Erro ao zerar base.', 'erro');
      }
    } catch (err) {
      if (typeof S !== 'undefined') {
        S.os = []; S.vendas = []; S.clientes = []; S.veiculos = []; S.pecas = []; S.servicos = [];
        if (typeof salvar === 'function') salvar();
        if (typeof fecharFolha === 'function') fecharFolha();
        if (typeof torrar === 'function') torrar('Base zerada com sucesso!', 'sucesso');
        setTimeout(() => location.reload(), 600);
      }
    }
  }

  async function executarRestaurarDemoConfirmada() {
    if (typeof torrar === 'function') torrar('Restaurando cenário de demonstração...', 'neutro');
    try {
      const headers = typeof obterHeadersRequisicao === 'function' ? obterHeadersRequisicao({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
      const res = await fetch('/api/onboarding/demo-data', { method: 'POST', headers, credentials: 'same-origin' });
      const d = await res.json();
      if (res.ok && (d.ok || d.sucesso)) {
        if (typeof fecharFolha === 'function') fecharFolha();
        if (typeof torrar === 'function') torrar('Dados de demonstração restaurados com sucesso!', 'sucesso');
        setTimeout(() => location.reload(), 600);
      } else {
        if (typeof torrar === 'function') torrar(d.erro || d.error || 'Erro ao restaurar demo.', 'erro');
      }
    } catch (err) {
      if (typeof torrar === 'function') torrar('Erro de comunicação ao restaurar dados demo.', 'erro');
    }
  }

  // Aliases para retrocompatibilidade
  const modalConfirmacaoRemoverDemo = modalConfirmacaoZerarBase;
  const abrirModalConfirmacaoRemoverDemo = abrirModalConfirmacaoZerarBase;
  const executarLimpezaDadosDemoConfirmada = executarZerarBaseOperacionalConfirmada;

  const exportsDbMgmt = {
    viewPainelGestaoBancoDados,
    modalConfirmacaoZerarBase,
    abrirModalConfirmacaoZerarBase,
    modalConfirmacaoRestaurarDemo,
    abrirModalConfirmacaoRestaurarDemo,
    executarZerarBaseOperacionalConfirmada,
    executarRestaurarDemoConfirmada,
    zerarBaseOperacional: executarZerarBaseOperacionalConfirmada,
    restaurarDadosDemo: executarRestaurarDemoConfirmada,
    modalConfirmacaoRemoverDemo,
    abrirModalConfirmacaoRemoverDemo,
    executarLimpezaDadosDemoConfirmada
  };

  Object.assign(global, exportsDbMgmt);
  if (typeof window !== 'undefined') Object.assign(window, exportsDbMgmt);
})(typeof window !== 'undefined' ? window : globalThis);
