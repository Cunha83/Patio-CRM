/* Submódulo de Interface da Folha de Importação de Sistemas: migracao_importador_ui.js */
/* Pátio-CRM — Submódulo extraído de js/relatorios.js (< 350 linhas) */

  function abrirImportadorSistemas() {
  window._dadosMigracao = null;
  abrirFolha(folhaImportacaoSistemas);
}

function folhaImportacaoSistemas() {
  const mig = window._dadosMigracao;

  let previaHtml = '';
  let resumoCards = '';

  if (mig && mig.dados) {
    const d = mig.dados;
    const totais = [
      { label: 'Clientes', qtd: (d.clientes || []).length, icoName: 'cad' },
      { label: 'Veículos', qtd: (d.veiculos || []).length, icoName: 'patio' },
      { label: 'Peças Estoque', qtd: (d.pecas || []).length, icoName: 'pecas' },
      { label: 'Serviços', qtd: (d.servicos || []).length, icoName: 'cfg' },
      { label: 'Fornecedores', qtd: (d.fornecedores || []).length, icoName: 'cad' },
      { label: 'Ordens Serviço', qtd: (d.os || []).length, icoName: 'doc' },
      { label: 'Contas Fin.', qtd: (d.contas || []).length, icoName: 'fin' }
    ].filter(t => t.qtd > 0);

    resumoCards = `
    <div style="background:var(--aco-050);padding:14px;border-radius:10px;border:1px solid var(--aco-200);margin-bottom:16px">
      <div class="entre" style="margin-bottom:10px">
        <div>
          <b style="font-size:14px">📁 Arquivos Identificados (${mig.arquivos ? mig.arquivos.length : 1}):</b>
        </div>
        <button class="btn btn-secundario mini" data-act="cancelar-migracao" style="padding:4px 10px">
          ${ico('x', 12)} Limpar Seleção
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${(mig.arquivos || []).map(a => `
          <div class="entre" style="background:#fff;padding:8px 12px;border-radius:6px;border:1px solid var(--aco-200);font-size:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span>📄</span>
              <b>${esc(a.nome)}</b>
              <span class="mini" style="color:var(--aco-400)">(${(a.tamanho / 1024).toFixed(1)} KB)</span>
            </div>
            <div>
              <span class="selo selo-executando" style="font-size:10.5px">${esc(a.tipoDetectado)}</span>
              <span class="selo selo-finalizada" style="font-size:10.5px;margin-left:4px">${a.totalItens} registros</span>
            </div>
          </div>
        `).join('')}
      </div>

      ${mig.erros && mig.erros.length > 0 ? `
        <div style="background:var(--tijolo-fraco);color:var(--tijolo);padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:12px">
          <b>⚠️ Avisos na leitura:</b>
          ${mig.erros.map(e => `<div>• ${esc(e)}</div>`).join('')}
        </div>
      ` : ''}

      <div style="font-weight:700;font-size:13px;margin-bottom:8px">Total Consolidado Pronto para Importação:</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:8px">
        ${totais.map(t => `
          <div style="background:#fff;padding:10px;border-radius:8px;border:1px solid var(--aco-200);text-align:center">
            <div style="font-size:11px;color:var(--aco-500);display:flex;align-items:center;justify-content:center;gap:4px">
              ${ico(t.icoName, 12)} ${t.label}
            </div>
            <div style="font-size:20px;font-weight:800;color:var(--aco-900);margin-top:2px">${t.qtd}</div>
          </div>
        `).join('')}
      </div>
    </div>`;

    // Pré-visualização dos primeiros itens
    let itensAmostra = [];
    let tituloAmostra = '';
    if ((d.clientes || []).length > 0) {
      tituloAmostra = `Amostra de Clientes (primeiros 5 de ${d.clientes.length})`;
      itensAmostra = d.clientes.slice(0, 5).map(c => `<tr><td><b>${esc(c.nome)}</b><div class="mini">${esc(c.fantasia || '')}</div></td><td class="mono">${esc(c.doc || '—')}</td><td>${esc(c.fone || '—')}</td><td>${esc(c.cidade || '—')}/${esc(c.uf || '')}</td></tr>`);
    } else if ((d.veiculos || []).length > 0) {
      tituloAmostra = `Amostra de Veículos (primeiros 5 de ${d.veiculos.length})`;
      itensAmostra = d.veiculos.slice(0, 5).map(v => `<tr><td class="mono"><b>${esc(v.placa)}</b></td><td>${esc(v.modelo)}</td><td>${esc(v.marca)}</td><td>${esc(v.ano || '—')}</td></tr>`);
    } else if ((d.pecas || []).length > 0) {
      tituloAmostra = `Amostra de Peças (primeiras 5 de ${d.pecas.length})`;
      itensAmostra = d.pecas.slice(0, 5).map(p => `<tr><td class="mono"><b>${esc(p.cod)}</b></td><td>${esc(p.nome)}</td><td>${p.qtd} ${esc(p.un)}</td><td class="num">${brl(p.venda)}</td></tr>`);
    } else if ((d.servicos || []).length > 0) {
      tituloAmostra = `Amostra de Serviços (primeiros 5 de ${d.servicos.length})`;
      itensAmostra = d.servicos.slice(0, 5).map(s => `<tr><td><b>${esc(s.nome)}</b></td><td class="num">${brl(s.valor)}</td><td>${s.horas}h</td></tr>`);
    } else if ((d.contas || []).length > 0) {
      tituloAmostra = `Amostra de Contas (primeiras 5 de ${d.contas.length})`;
      itensAmostra = d.contas.slice(0, 5).map(c => `<tr><td><b>${esc(c.desc)}</b><div class="mini">${esc(c.parte)}</div></td><td><span class="selo ${c.tipo === 'receber' ? 'selo-finalizada' : 'selo-peca'}">${c.tipo.toUpperCase()}</span></td><td class="num">${brl(c.valor)}</td><td class="mono">${dataBR(c.venc)}</td></tr>`);
    }

    if (itensAmostra.length > 0) {
      previaHtml = `
      <div style="margin-bottom:16px">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">${tituloAmostra}</div>
        <div style="max-height:180px;overflow-y:auto;border:1px solid var(--aco-200);border-radius:8px">
          <table class="tabela" style="font-size:12px">
            <tbody>${itensAmostra.join('')}</tbody>
          </table>
        </div>
      </div>`;
    }
  }

  return `
  <div class="card card-p" style="max-width:720px;margin:0 auto">
    <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:12px;margin-bottom:16px">
      <div>
        <h3 style="font-size:18px;font-weight:800;color:var(--aco-900)">Central de Migração & Importação</h3>
        <div class="mini">Envio simultâneo de arquivos CSV e backups JSON para testes em produção</div>
      </div>
      <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
    </div>

    ${!mig ? `
      <!-- Área de Seleção de Arquivo (Suporte a múltiplos CSVs e JSON) -->
      <div style="border:2px dashed var(--petroleo);padding:35px 20px;border-radius:12px;text-align:center;background:var(--petroleo-fraco);margin-bottom:20px">
        <div style="color:var(--petroleo);margin-bottom:12px">${ico('upload', 42)}</div>
        <div style="font-weight:800;font-size:16px;margin-bottom:6px;color:var(--aco-900)">
          Selecione os Arquivos para Upload
        </div>
        <div class="mini" style="max-width:520px;margin:0 auto 18px auto;color:var(--aco-600);line-height:1.5">
          💡 <b>Envio simultâneo ativado:</b> você pode selecionar vários arquivos de uma só vez (ex: segure <kbd style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-weight:bold">Ctrl</kbd> e selecione <b>clientes.csv</b>, <b>veiculos.csv</b>, <b>pecas.csv</b> ou um backup <b>.json</b>).
        </div>
        <div style="display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap">
          <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:11px 24px;font-size:14px;font-weight:700;box-shadow:var(--sombra)">
            ${ico('doc', 16)} Escolher Arquivo(s) no Computador
            <input type="file" accept=".json,.csv,.txt" multiple data-act="arquivo-migracao-input" style="display:none" onchange="window._onMigracaoFileChange(this)">
          </label>
        </div>
      </div>

      <!-- Caixa de Modelos de Planilha -->
      <div style="background:var(--aco-050);padding:14px;border-radius:10px;border:1px solid var(--aco-200)">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:4px">Modelos Prontos para Preenchimento no Excel</div>
        <div class="mini" style="margin-bottom:12px">Baixe a planilha modelo correspondente, cole seus dados e importe diretamente acima:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="clientes" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Clientes
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="veiculos" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Veículos
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="pecas" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Peças/Estoque
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="servicos" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Serviços
          </button>
          <button class="btn btn-secundario" data-act="baixar-template-csv" data-tipo="contas" style="font-size:12px;padding:6px 12px">
            ${ico('download', 13)} Planilha Contas
          </button>
        </div>
      </div>
    ` : `
      <!-- Visualização dos Arquivos Carregados e Confirmação -->
      ${resumoCards}
      ${previaHtml}

      <!-- Opção de Modo de Importação -->
      <div style="background:#fff;padding:14px;border-radius:10px;border:1px solid var(--aco-200);margin-bottom:18px">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:10px">Selecione o Modo de Importação:</div>

        <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;cursor:pointer">
          <input type="radio" name="modo-importacao" value="mesclar" checked style="margin-top:3px">
          <div>
            <div style="font-weight:700;color:var(--petroleo)">Mesclar e Incrementar (Recomendado para Produção)</div>
            <div class="mini">Adiciona os novos registros e atualiza os existentes (sem apagar histórico de OSs, parametrização fiscal ou conexões WhatsApp).</div>
          </div>
        </label>

        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
          <input type="radio" name="modo-importacao" value="substituir" style="margin-top:3px">
          <div>
            <div style="font-weight:700;color:var(--tijolo)">Substituição Completa da Base</div>
            <div class="mini">Substitui integralmente os registros pelos arquivos importados. <b>Um backup de segurança do estado atual será baixado automaticamente antes de prosseguir.</b></div>
          </div>
        </label>
      </div>

      <!-- BLOCO DE CONFIRMAÇÃO EM GRANDE DESTAQUE COM O BOTÃO DE AÇÃO -->
      <div style="background:var(--verde-fraco);padding:18px;border-radius:10px;border:2px solid var(--verde);text-align:center;margin-bottom:16px">
        <div style="font-weight:800;font-size:16px;color:var(--verde);margin-bottom:4px">
          Tudo pronto para iniciar a importação!
        </div>
        <div class="mini" style="margin-bottom:14px;color:var(--aco-700)">
          Os dados dos arquivos foram analisados. Clique no botão abaixo para confirmar a seleção e gravar no sistema:
        </div>
        <button class="btn btn-primario" data-act="executar-importacao-confirmada" style="background:var(--verde);border-color:var(--verde);font-size:15px;font-weight:800;padding:12px 32px;box-shadow:0 4px 14px rgba(16, 185, 129, 0.4);cursor:pointer">
          ${ico('salvar', 16)} Confirmar Seleção e Iniciar Importação
        </button>
      </div>

      <!-- Botões de Apoio -->
      <div class="entre" style="gap:10px">
        <label class="btn btn-secundario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:8px 14px">
          ${ico('doc', 13)} Adicionar / Selecionar Outros Arquivos
          <input type="file" accept=".json,.csv,.txt" multiple data-act="arquivo-migracao-input" style="display:none" onchange="window._onMigracaoFileChange(this)">
        </label>
        <button class="btn btn-secundario" data-act="cancelar-migracao" style="font-size:12px;padding:8px 14px">
          Cancelar
        </button>
      </div>
    `}
  </div>`;
}

// Leitura de Múltiplos Arquivos de Migração (CSV / JSON simultâneos)
async function processarArquivosMigracao(fileList) {
  if (!fileList || !fileList.length) {
    torrar('Nenhum arquivo selecionado.');
    return;
  }
  const files = Array.from(fileList);
  torrar(`Lendo ${files.length} arquivo(s)...`);

  const dadosAcumulados = {
    clientes: [],
    veiculos: [],
    pecas: [],
    servicos: [],
    fornecedores: [],
    contas: [],
    os: []
  };

  const arquivosProcessados = [];
  const erros = [];

  for (const file of files) {
    try {
      const texto = await lerArquivoTexto(file);
      const res = normalizarDadosExternos(texto, file.name);

      let totalNeste = 0;
      for (const ent in res.dados) {
        if (Array.isArray(res.dados[ent]) && res.dados[ent].length > 0) {
          dadosAcumulados[ent].push(...res.dados[ent]);
          totalNeste += res.dados[ent].length;
        }
      }

      arquivosProcessados.push({
        nome: file.name,
        tamanho: file.size,
        tipoDetectado: res.tipoDetectado,
        formato: res.formatoOrigem,
        totalItens: totalNeste
      });
    } catch (err) {
      console.error(`[Migração] Erro ao ler arquivo ${file.name}:`, err);
      erros.push(`${file.name}: ${err.message}`);
    }
  }

  // Tenta vincular veículos sem cliente caso o cliente tenha vindo no mesmo lote de importação
  if (dadosAcumulados.veiculos.length > 0) {
    const todosClientes = [...(S.clientes || []), ...dadosAcumulados.clientes];
    dadosAcumulados.veiculos.forEach(v => {
      if (!v.cli && v._clienteRef) {
        const refLimpo = String(v._clienteRef).replace(/\D/g, '');
        const achado = todosClientes.find(c =>
          (refLimpo && (c.doc || '').replace(/\D/g, '') === refLimpo) ||
          ((c.nome || '').toLowerCase() === String(v._clienteRef).toLowerCase()) ||
          ((c.fantasia || '').toLowerCase() === String(v._clienteRef).toLowerCase())
        );
        if (achado) v.cli = achado.id;
      }
    });
  }

  window._dadosMigracao = {
    arquivos: arquivosProcessados,
    totalArquivos: arquivosProcessados.length,
    dados: dadosAcumulados,
    erros
  };

  renderFolha();
  torrar(`✅ ${arquivosProcessados.length} arquivo(s) analisado(s)!`);
}


if (typeof window !== 'undefined') {
  window.abrirImportadorSistemas = abrirImportadorSistemas;
  window.folhaImportacaoSistemas = folhaImportacaoSistemas;
}
if (typeof globalThis !== 'undefined') {
  globalThis.abrirImportadorSistemas = abrirImportadorSistemas;
  globalThis.folhaImportacaoSistemas = folhaImportacaoSistemas;
}
