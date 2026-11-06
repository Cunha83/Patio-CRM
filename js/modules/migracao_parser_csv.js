/* Submódulo de Parsing e Validação de CSV Universal: migracao_parser_csv.js */
/* Pátio-CRM — Submódulo extraído de js/relatorios.js (< 350 linhas) */

   /* Central de Migração e Importação de Sistemas */
window._dadosMigracao = null;

// Parser CSV universal resiliente com auto-detecção de delimitador
function parseCSVUniversal(texto) {
  if (!texto || typeof texto !== 'string') return { headers: [], rows: [] };
  // Remove BOM UTF-8 se presente
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);

  const primeiraLinha = texto.split(/\r?\n/)[0] || '';
  const pontovirgulas = (primeiraLinha.match(/;/g) || []).length;
  const virgulas = (primeiraLinha.match(/,/g) || []).length;
  const tabs = (primeiraLinha.match(/\t/g) || []).length;
  const pipes = (primeiraLinha.match(/\|/g) || []).length;

  let sep = ';';
  if (tabs > pontovirgulas && tabs > virgulas) sep = '\t';
  else if (virgulas > pontovirgulas && virgulas > pipes) sep = ',';
  else if (pipes > pontovirgulas && pipes > virgulas) sep = '|';

  const linhas = [];
  let linhaAtual = [];
  let campoAtual = '';
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const proximo = texto[i + 1];

    if (dentroAspas) {
      if (c === '"') {
        if (proximo === '"') {
          campoAtual += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campoAtual += c;
      }
    } else {
      if (c === '"') {
        dentroAspas = true;
      } else if (c === sep) {
        linhaAtual.push(campoAtual.trim());
        campoAtual = '';
      } else if (c === '\r') {
        // ignora carriage return
      } else if (c === '\n') {
        linhaAtual.push(campoAtual.trim());
        if (linhaAtual.some(col => col.length > 0)) {
          linhas.push(linhaAtual);
        }
        linhaAtual = [];
        campoAtual = '';
      } else {
        campoAtual += c;
      }
    }
  }

  if (campoAtual.length > 0 || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual.trim());
    if (linhaAtual.some(col => col.length > 0)) {
      linhas.push(linhaAtual);
    }
  }

  if (linhas.length === 0) return { headers: [], rows: [] };

  const headers = linhas[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows = [];

  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i];
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

// Helpers de normalização
function normalizarNumero(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).replace(/R\$\s?/gi, '').trim();
  if (s.includes(',') && s.includes('.')) {
    // Ex: 1.250,50 -> 1250.50
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // Ex: 1250,50 -> 1250.50
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizarData(val) {
  if (!val) return '';
  const s = String(val).trim();
  // Formato DD/MM/YYYY ou DD-MM-YYYY
  const mBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mBR) {
    const dia = mBR[1].padStart(2, '0');
    const mes = mBR[2].padStart(2, '0');
    const ano = mBR[3];
    return `${ano}-${mes}-${dia}`;
  }
  // Formato YYYY-MM-DD
  const mISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (mISO) {
    const ano = mISO[1];
    const mes = mISO[2].padStart(2, '0');
    const dia = mISO[3].padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  return s.slice(0, 10);
}

function limparChaveHeader(h) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sem acentos
    .replace(/[^a-z0-9]/g, ''); // sem pontuações ou espaços
}

function detectarEntidadeCSV(headers) {
  const norm = headers.map(limparChaveHeader);
  const tem = (termos) => termos.some(t => norm.some(h => h.includes(t)));

  if (tem(['placa', 'chassi', 'renavam', 'carroceria'])) return 'veiculos';
  if (tem(['estoque', 'preco', 'custo', 'venda', 'ncm', 'sku', 'cfop', 'peca'])) return 'pecas';
  if (tem(['servico', 'maodeobra', 'iss', 'horas'])) return 'servicos';
  if (tem(['vencimento', 'pagar', 'receber', 'despesa', 'receita', 'contas'])) return 'contas';
  if (tem(['fornecedor', 'vendor', 'supplier'])) return 'fornecedores';
  if (tem(['cliente', 'razao', 'fantasia', 'cpf', 'cnpj', 'doc', 'contato'])) return 'clientes';
  if (tem(['os', 'ordem', 'mecanico', 'queixa', 'defeito'])) return 'os';

  return 'clientes'; // fallback
}

// Analisador Universal de Dados Importados (JSON ou CSV)

if (typeof window !== 'undefined') {
  window.parseCSVUniversal = parseCSVUniversal;
  window.normalizarNumero = normalizarNumero;
  window.normalizarData = normalizarData;
  window.limparChaveHeader = limparChaveHeader;
  window.detectarEntidadeCSV = detectarEntidadeCSV;
}
if (typeof globalThis !== 'undefined') {
  globalThis.parseCSVUniversal = parseCSVUniversal;
  globalThis.normalizarNumero = normalizarNumero;
  globalThis.normalizarData = normalizarData;
  globalThis.limparChaveHeader = limparChaveHeader;
  globalThis.detectarEntidadeCSV = detectarEntidadeCSV;
}
