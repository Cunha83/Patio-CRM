function csvSafe(val) {
  if (val == null) return '';
  let s = String(val);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportarCSV(tipo) {
  let csv = '', nomeArquivo = '';

  if (tipo === 'os') {
    nomeArquivo = `patio_ordens_servico_${hoje()}.csv`;
    csv = 'Numero;Data Abertura;Status;Placa;Modelo;Cliente;Mecanico;Servicos (R$);Pecas (R$);Desconto (R$);Total (R$)\n';
    (S.os || []).forEach(o => {
      const v = V(o.vei), c = C(o.cli);
      const totServ = soma(o.servicos, i => (i.qtd || 1) * (i.valor || 0));
      const totPec = soma(o.pecas, i => (i.qtd || 1) * (i.valor || 0));
      const total = totOS(o);
      csv += `${o.num};"${o.abertura}";"${ST[o.st].r}";${csvSafe(v.placa)};${csvSafe(v.modelo)};${csvSafe(c.nome)};${csvSafe(o.mec || '')};${totServ.toFixed(2)};${totPec.toFixed(2)};${(o.desc || 0).toFixed(2)};${total.toFixed(2)}\n`;
    });
  } else if (tipo === 'pecas') {
    nomeArquivo = `patio_estoque_pecas_${hoje()}.csv`;
    csv = 'Codigo;Descricao;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Localizacao;Fornecedor\n';
    (S.pecas || []).forEach(p => {
      csv += `${csvSafe(p.cod)};${csvSafe(p.nome)};${csvSafe(p.un || 'un')};${p.qtd};${p.min};${p.custo.toFixed(2)};${p.venda.toFixed(2)};${csvSafe(p.loc || '')};${csvSafe(p.forn || '')}\n`;
    });
  } else if (tipo === 'financeiro') {
    nomeArquivo = `patio_movimentacoes_caixa_${hoje()}.csv`;
    csv = 'Data;Tipo;Descricao;Categoria;Forma;Valor (R$);Conciliado\n';
    (S.movimentos || []).forEach(m => {
      csv += `"${m.data}";"${m.tipo}";${csvSafe(m.desc)};${csvSafe(m.cat || 'Geral')};${csvSafe(m.forma || '')};${m.valor.toFixed(2)};${m.conc ? 'Sim' : 'Nao'}\n`;
    });
  } else if (tipo === 'clientes') {
    nomeArquivo = `patio_clientes_${hoje()}.csv`;
    csv = 'Razao Social;Fantasia;CNPJ_CPF;Telefone;Contato;Cidade;UF;Prazo (dias)\n';
    (S.clientes || []).forEach(c => {
      csv += `${csvSafe(c.nome)};${csvSafe(c.fantasia || '')};${csvSafe(c.doc || '')};${csvSafe(c.fone || '')};${csvSafe(c.contato || '')};${csvSafe(c.cidade || '')};${csvSafe(c.uf || '')};${c.prazo || 0}\n`;
    });
  }

  baixarArquivo('\uFEFF' + csv, nomeArquivo, 'text/csv;charset=utf-8;');
  torrar(`Relatório exportado: ${nomeArquivo}`);
}

function exportarBackupJSON() {
  const dados = JSON.stringify(S, null, 2);
  const nome = `backup_patio_crm_${hoje()}_${Date.now()}.json`;
  baixarArquivo(dados, nome, 'application/json');
  torrar('Backup completo baixado com sucesso!');
}

function baixarArquivo(conteudo, nome, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Submódulo de Processamento de Arquivos e Templates: migracao_processamento.js */
/* Pátio-CRM — Submódulo extraído de js/relatorios.js (< 350 linhas) */

function baixarTemplateCSV(tipo) {
  let csv = '', nome = '';
  if (tipo === 'clientes') {
    nome = 'modelo_importacao_clientes.csv';
    csv = 'Razao Social;Nome Fantasia;CNPJ_CPF;Telefone;Contato;Email;Cidade;UF;CEP;Endereco;Inscricao Estadual;Prazo Dias\n' +
      'TransRodrigues Transportes Ltda;TransRodrigues;23.456.789/0001-12;11987654321;Carlos Rodrigues;manutencao@transrodrigues.com.br;Campinas;SP;13050-000;Av. das Industrias, 1500;123.456.789.000;30\n' +
      'Expresso Vale Logistica;Expresso Vale;34.567.890/0001-23;19981234567;Marcos Silveira;frota@expressovale.com.br;Sumare;SP;13170-000;Rua dos Galpoes, 340;234.567.890.111;28\n';
  } else if (tipo === 'veiculos') {
    nome = 'modelo_importacao_veiculos.csv';
    csv = 'Placa;Modelo;Marca;Ano;Km Atual;Tipo;Cliente (Nome ou CNPJ)\n' +
      'BRA2E19;R 450 6x2 Highline;Scania;2021;382400;Cavalo Mecanico;TransRodrigues Transportes Ltda\n' +
      'QRF8J44;FH 540 6x4 Globetrotter;Volvo;2022;295100;Cavalo Mecanico;23.456.789/0001-12\n';
  } else if (tipo === 'pecas') {
    nome = 'modelo_importacao_pecas_estoque.csv';
    csv = 'Codigo;Descricao da Peca;Unidade;Estoque Atual;Estoque Minimo;Preco Custo;Preco Venda;Localizacao;Fornecedor;NCM;CFOP\n' +
      'SCN-1875892;Jogo de Pastilhas de Freio Scania;jg;8;3;320.00;540.00;Prat. A-02;Fras-le Pecas;87083019;5102\n' +
      'VLV-2134567;Filtro Separador Racor Volvo FH;un;14;5;85.00;165.00;Prat. B-01;Donaldson Filtros;84212300;5102\n';
  } else if (tipo === 'servicos') {
    nome = 'modelo_importacao_servicos.csv';
    csv = 'Descricao do Servico;Preco Padrao (R$);Tempo Estimado (Horas);Codigo ISS;Aliquota ISS (%)\n' +
      'Revisao Completa de Freios;850.00;4.5;14.01;5.0\n' +
      'Troca de Kit de Embreagem;1600.00;8.0;14.01;5.0\n' +
      'Troca de Oleo e Filtros;380.00;1.5;14.01;5.0\n';
  } else if (tipo === 'contas') {
    nome = 'modelo_importacao_contas.csv';
    csv = 'Tipo (pagar/receber);Descricao;Favorecido ou Cliente;Valor;Vencimento (DD/MM/AAAA);Pago (sim/nao);Categoria;Numero Documento\n' +
      'receber;Manutencao Preventiva Frota;TransRodrigues Transportes Ltda;6850.00;25/09/2026;nao;Servicos & Pecas;NF-1040\n' +
      'pagar;Compra Valvulas EBS;ZF Wabco Brasil;5400.00;20/09/2026;nao;Fornecedores Pecas;NF-98412\n';
  }

  baixarArquivo('\uFEFF' + csv, nome, 'text/csv;charset=utf-8;');
  torrar(`Planilha modelo baixada: ${nome}`);
}


function lerArquivoTexto(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file, 'UTF-8');
  });
}

window._onMigracaoFileChange = function(input) {
  if (input && input.files && input.files.length > 0) {
    abrirFolha(folhaImportacaoSistemas);
    processarArquivosMigracao(input.files);
    input.value = '';
  }
};

// Mantido para compatibilidade com qualquer chamada anterior
function processarArquivoMigracao(arquivo) {
  if (arquivo) processarArquivosMigracao([arquivo]);
}

// Execução da Importação
async function executarImportacaoConfirmada() {
  if (!window._dadosMigracao || !window._dadosMigracao.dados) {
    torrar('Nenhum dado selecionado para importação.');
    return;
  }

  const radioModo = document.querySelector('input[name="modo-importacao"]:checked');
  const modo = radioModo ? radioModo.value : 'mesclar';
  const dados = window._dadosMigracao.dados;

  // Se for substituição completa, gera snapshot de segurança antes
  if (modo === 'substituir') {
    torrar('Gerando snapshot de segurança antes de substituir...');
    exportarBackupJSON();
    await new Promise(r => setTimeout(r, 400));
  }

  try {
    await flushSave();
    if (pendingLocalSave || saving) throw new Error('Resolva as alterações pendentes antes de importar.');
    const res = await fetch('/api/backup/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados, modo, versao: S.versao || 0 })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const resposta = await res.json();

    // Após a importação, lê o estado confirmado; não reaplica o backup localmente.
    const refresh = await fetch('/api/estado');
    if (!refresh.ok) throw new Error('Importação concluída, mas a atualização da tela falhou. Recarregue a página.');
    const novoEstado = await refresh.json();
    if (!novoEstado.os) throw new Error('Estado retornado inválido.');
    S = { ...novoEstado, ui: S.ui };
    armazem.base = PatioSync.clone(novoEstado);
    try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (_) {}
    fecharFolha();
    render();

    const st = resposta.stats || {};
    const detalhes = [
      st.clientes?.inseridos ? `${st.clientes.inseridos} clientes` : null,
      st.veiculos?.inseridos ? `${st.veiculos.inseridos} veículos` : null,
      st.pecas?.inseridos ? `${st.pecas.inseridos} peças` : null,
      st.servicos?.inseridos ? `${st.servicos.inseridos} serviços` : null,
      st.contas?.inseridos ? `${st.contas.inseridos} contas` : null
    ].filter(Boolean).join(', ');

    alert(`✅ Importação Concluída com Sucesso!\n\nModo aplicado: ${modo === 'mesclar' ? 'Mesclagem / Incremento' : 'Substituição Completa'}\nRegistros inseridos: ${detalhes || 'Dados integrados'}`);
    torrar('Base de dados atualizada com sucesso!');
  } catch (err) {
    console.error('[Migração] Erro ao gravar importação:', err);
    alert('Erro ao persistir importação no servidor: ' + err.message);
  } finally {
    window._dadosMigracao = null;
  }
}

// Mantido para compatibilidade com qualquer chamada anterior
function restaurarBackupJSON(arquivo) {
  processarArquivoMigracao(arquivo);
}


if (typeof window !== 'undefined') {
  window.baixarTemplateCSV = baixarTemplateCSV;
  window.lerArquivoTexto = lerArquivoTexto;
  window.processarArquivoMigracao = processarArquivoMigracao;
  window.restaurarBackupJSON = restaurarBackupJSON;
}
if (typeof globalThis !== 'undefined') {
  globalThis.baixarTemplateCSV = baixarTemplateCSV;
  globalThis.lerArquivoTexto = lerArquivoTexto;
  globalThis.processarArquivoMigracao = processarArquivoMigracao;
  globalThis.restaurarBackupJSON = restaurarBackupJSON;
}

if (typeof window !== 'undefined') {
  window.csvSafe = csvSafe;
  window.exportarCSV = exportarCSV;
  window.exportarBackupJSON = exportarBackupJSON;
  window.baixarArquivo = baixarArquivo;
}
if (typeof globalThis !== 'undefined') {
  globalThis.csvSafe = csvSafe;
  globalThis.exportarCSV = exportarCSV;
  globalThis.exportarBackupJSON = exportarBackupJSON;
  globalThis.baixarArquivo = baixarArquivo;
}
