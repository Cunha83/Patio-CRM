/* Submódulo de Ações Rápidas do Topo e Modais: navigation_actions.js */
/* Pátio-CRM — Submódulo extraído de js/modules/navigation.js (< 350 linhas) */

function toggleDropdownNovo() {
  const el = document.getElementById('dropdown-novo-menu');
  if (el) {
    const aberto = el.classList.contains('aberto') || el.style.display === 'block';
    if (aberto) {
      el.classList.remove('aberto');
      el.style.display = 'none';
    } else {
      el.classList.add('aberto');
      el.style.display = 'block';
    }
  }
}

function fecharDropdownNovo() {
  const el = document.getElementById('dropdown-novo-menu');
  if (el) {
    el.classList.remove('aberto');
    el.style.display = 'none';
  }
}

function abrirModalNovaOS(boxId = null) {
  S.ui.rascunho = null;
  if (typeof abrirFolha === 'function' && typeof novaOSFolha === 'function') {
    abrirFolha(() => novaOSFolha(boxId));
  } else {
    S.ui.view = 'patio';
    if (typeof render === 'function') render();
  }
}

function abrirModalNovoCliente() {
  S.ui.cadTipo = 'clientes';
  S.ui.rascCad = {};
  if (typeof abrirFolha === 'function' && typeof folhaCadastro === 'function') {
    abrirFolha(folhaCadastro);
  } else {
    S.ui.view = 'cadastros';
    if (typeof render === 'function') render();
  }
}

function abrirModalNovoLancamento(tipo = 'pagar') {
  S.ui.contaTipo = tipo;
  S.ui.rascConta = { venc: typeof hoje === 'function' ? hoje() : new Date().toISOString().substring(0, 10), valor: '' };
  if (typeof abrirFolha === 'function' && typeof folhaConta === 'function') {
    abrirFolha(folhaConta);
  } else {
    S.ui.view = 'financeiro';
    if (typeof render === 'function') render();
  }
}

// Fecha dropdowns se clicar fora
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const wrap = e.target.closest('.dropdown-novo-wrap');
    if (!wrap) {
      fecharDropdownNovo();
    }
    const buscaWrap = e.target.closest('.busca-global-wrap');
    if (!buscaWrap) {
      const popover = document.getElementById('busca-global-popover');
      if (popover) popover.style.display = 'none';
    }
  });

  // Atalho global Ctrl+K para busca
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('campo-busca-global');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });
}

// Modal / Toast de Tutoriais do Módulo
function abrirTutorialModulo(view) {
  const dicas = {
    patio: 'Dica do Pátio: Arraste os veículos entre as colunas para atualizar a situação do box. Clique sobre o veículo para editar serviços e peças.',
    vendas: 'Dica de Vendas: Utilize as abas de Vendas e Devoluções para separar faturamento e devoluções de balcão. O botão WhatsApp envia o link direto ao cliente.',
    compras: 'Dica de Compras: Arraste um arquivo XML da SEFAZ para importar o cabeçalho, duplicatas e dar entrada automática no estoque.',
    estoque: 'Dica de Almoxarifado: Controle estoque mínimo de molas e peças críticas. Itens com estoque zerado são sinalizados em vermelho.',
    financeiro: 'Dica Financeira: Acompanhe o DRE gerencial do mês e concilie boletos e Pix diretamente pela régua automatizada.',
    fiscal: 'Dica Fiscal: Emita NF-e de peças ou NFS-e de mão de obra a partir de qualquer Ordem de Serviço concluída com um clique.',
    cadastros: 'Dica de Cadastros: Cadastre transportadores e fornecedores vinculando tags de segmento para acelerar emissões e orçamentos.'
  };
  const msg = dicas[view] || 'Pátio CRM: Tecnologia inovadora para gestão completa e alta lucratividade em oficinas mecânicas pesadas.';
  if (typeof torrar === 'function') torrar(msg);
  else alert(msg);
}


if (typeof window !== 'undefined') {
  window.toggleDropdownNovo = toggleDropdownNovo;
  window.fecharDropdownNovo = fecharDropdownNovo;
  window.abrirModalNovaOS = abrirModalNovaOS;
  window.abrirModalNovoCliente = abrirModalNovoCliente;
  window.abrirModalNovoLancamento = abrirModalNovoLancamento;
  window.abrirTutorialModulo = abrirTutorialModulo;
}
if (typeof globalThis !== 'undefined') {
  globalThis.toggleDropdownNovo = toggleDropdownNovo;
  globalThis.fecharDropdownNovo = fecharDropdownNovo;
  globalThis.abrirModalNovaOS = abrirModalNovaOS;
  globalThis.abrirModalNovoCliente = abrirModalNovoCliente;
  globalThis.abrirModalNovoLancamento = abrirModalNovoLancamento;
  globalThis.abrirTutorialModulo = abrirTutorialModulo;
}
