/**
 * Módulo: estoque_ocr_notas.js
 * Pátio-CRM — Importação de NF-e XML e OCR de Danfe Inteligente
 * Arquitetura Modular (< 350 linhas).
 */

(function (global) {
  'use strict';

  function folhaXML() {
    const nota = S.ui.nota;

    return `
    <div class="card card-p" style="max-width:650px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <h3 style="font-size:17px;font-weight:700">Importação de NF-e via XML</h3>
          <div class="mini">Entrada automática de peças e geração de Contas a Pagar</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      ${!nota ? `
        <div style="border:2px dashed var(--aco-300);padding:30px 20px;border-radius:10px;text-align:center;background:var(--aco-050)">
          <div style="margin-bottom:10px;color:var(--petroleo)">${ico('upload', 36)}</div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Selecione o arquivo .XML da Nota Fiscal</div>
          <div class="mini" style="margin-bottom:16px">Você pode selecionar um ou vários arquivos de fornecedores de autopeças.</div>
          <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            ${ico('doc', 14)} Escolher Arquivo XML
            <input type="file" accept=".xml" data-act="arquivo-xml" multiple style="display:none">
          </label>
        </div>
      ` : `
        <div style="background:var(--aco-050);padding:12px;border-radius:8px;margin-bottom:14px;border:1px solid var(--aco-150)">
          <div class="entre">
            <div><b>NF-e Nº:</b> ${esc(nota.num)} · <b>Série:</b> ${esc(nota.serie || '1')}</div>
            <div class="num" style="font-weight:700;font-size:15px;color:var(--verde)">${brl(nota.total)}</div>
          </div>
          <div class="mini" style="margin-top:4px">
            <b>Fornecedor:</b> ${esc(nota.forn)} · CNPJ: ${esc(nota.cnpj || '—')} · Emissão: ${dataBRfull(nota.data)}
          </div>
        </div>

        <div style="font-weight:600;font-size:13px;margin-bottom:8px">Itens Identificados na Nota Fiscal (${nota.itens.length}):</div>
        <div style="max-height:220px;overflow-y:auto;border:1px solid var(--aco-150);border-radius:6px;margin-bottom:14px">
          <table class="tabela" style="font-size:12.5px">
            <thead>
              <tr>
                <th>Cód. / Descrição</th>
                <th style="width:60px;text-align:center">Qtd</th>
                <th style="width:90px;text-align:right">Custo Unit.</th>
                <th style="width:90px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${nota.itens.map(it => `
                <tr>
                  <td><b>${esc(it.nome)}</b><div class="mini mono">${esc(it.cod)}</div></td>
                  <td style="text-align:center">${it.qtd} ${esc(it.un)}</td>
                  <td style="text-align:right">${brl(it.custo)}</td>
                  <td style="text-align:right;font-weight:600">${brl(it.qtd * it.custo)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-secundario" data-act="fechar">Cancelar</button>
          <button class="btn btn-sucesso" data-act="confirmar-xml" style="font-weight:600;padding:0 18px">
            ${ico('check', 14)} Confirmar Entrada no Estoque & Contas a Pagar
          </button>
        </div>
      `}
    </div>`;
  }

  function lerXML(texto) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(texto, 'text/xml');
    const txt = (no, tag) => {
      const el = no ? no.getElementsByTagName(tag)[0] : null;
      return el ? el.textContent.trim() : '';
    };

    const infNFe = xml.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('Estrutura de NF-e não reconhecida.');

    const ide = infNFe.getElementsByTagName('ide')[0];
    const emit = infNFe.getElementsByTagName('emit')[0];
    const totalNo = infNFe.getElementsByTagName('ICMSTot')[0] || infNFe.getElementsByTagName('total')[0];

    const num = txt(ide, 'nNF');
    const serie = txt(ide, 'serie');
    const data = (txt(ide, 'dhEmi') || txt(ide, 'dEmi') || hoje()).slice(0, 10);
    const forn = txt(emit, 'xNome') || txt(emit, 'xFant') || 'Fornecedor';
    const cnpj = txt(emit, 'CNPJ') || txt(emit, 'CPF');
    const total = parseFloat(txt(totalNo, 'vNF') || '0');

    const detList = infNFe.getElementsByTagName('det');
    const itens = [];

    for (let i = 0; i < detList.length; i++) {
      const prod = detList[i].getElementsByTagName('prod')[0];
      if (!prod) continue;
      itens.push({
        cod: txt(prod, 'cProd'),
        nome: txt(prod, 'xProd'),
        un: txt(prod, 'uCom') || 'un',
        qtd: parseFloat(txt(prod, 'qCom') || '1'),
        custo: parseFloat(txt(prod, 'vUnCom') || '0')
      });
    }

    return { num, serie, data, forn, cnpj, total, itens };
  }

  function confirmarXML() {
    const n = S.ui.nota;
    if (!n) return;

    // 1. Atualizar ou criar peças no almoxarifado
    n.itens.forEach(it => {
      let p = S.pecas.find(x => x.cod === it.cod || x.nome.toLowerCase() === it.nome.toLowerCase());
      if (p) {
        p.qtd = (p.qtd || 0) + it.qtd;
        p.custo = it.custo;
        if (p.venda <= it.custo) p.venda = Math.round(it.custo * 1.6);
      } else {
        S.pecas.push({
          id: uid('p'),
          cod: it.cod,
          nome: it.nome,
          un: it.un,
          qtd: it.qtd,
          min: 2,
          custo: it.custo,
          venda: Math.round(it.custo * 1.6),
          loc: 'Almoxarifado',
          forn: n.forn
        });
      }
    });

    // 2. Registrar no Contas a Pagar
    S.contas.push({
      id: uid('ct'),
      tipo: 'pagar',
      desc: `NF-e ${n.num} — ${n.forn}`,
      parte: n.forn,
      valor: n.total,
      venc: addDias(hoje(), 28),
      pago: false,
      cat: 'Fornecedores Peças',
      doc: `NF-${n.num}`
    });

    // 3. Salvar registro de NF recebida
    S.nfsRecebidas = S.nfsRecebidas || [];
    S.nfsRecebidas.unshift(n);

    S.ui.nota = null;
    fecharFolha();
    salvar();
    render();
    torrar(`NF ${n.num} importada: ${n.itens.length} itens lançados no estoque!`);
  }

  function folhaSimulacaoOCR() {
    return `
    <div class="card card-p" style="max-width:650px;margin:0 auto">
      <div class="entre" style="border-bottom:1px solid var(--aco-150);padding-bottom:10px;margin-bottom:14px">
        <div>
          <h3 style="font-size:17px;font-weight:700">Leitor OCR de Notas & Danfe</h3>
          <div class="mini">Reconhecimento visual automático para notas em PDF ou foto</div>
        </div>
        <button class="btn-fechar" data-act="fechar">${ico('x', 18)}</button>
      </div>

      <div style="border:2px dashed var(--aco-300);padding:24px;border-radius:10px;text-align:center;background:var(--aco-050);margin-bottom:16px">
        <div style="margin-bottom:8px;color:var(--ardosia)">${ico('qr', 36)}</div>
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">Envie a Foto ou PDF da Nota Fiscal / Danfe</div>
        <div class="mini" style="margin-bottom:14px">O sistema fará o escaneamento inteligente de itens, valores e fornecedor.</div>
        <label class="btn btn-primario" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          ${ico('upload', 14)} Selecionar Arquivo para OCR
          <input type="file" accept="image/*,application/pdf" data-act="arquivo-ocr" style="display:none">
        </label>
      </div>

      <div class="card card-p" style="background:var(--branco);border:1px solid var(--aco-150)">
        <div class="entre" style="margin-bottom:10px">
          <span style="font-weight:600;font-size:13px">Simulação de Nota Escaneada (Exemplo):</span>
          <button class="btn btn-secundario" data-act="carregar-exemplo-ocr" style="font-size:12px;padding:4px 10px">Carregar Exemplo Real</button>
        </div>
        <div style="font-size:12.5px;color:var(--aco-700);line-height:1.5">
          <b>Fornecedor:</b> ZF do Brasil Sistemas Automotivos Ltda<br>
          <b>CNPJ:</b> 61.088.883/0001-08 · <b>NF Nº:</b> 784102 · <b>Total:</b> R$ 3.840,00<br>
          <b>Itens Detectados:</b> 4x Jogo de Lonas de Freio Heavy Duty (R$ 480,00 un) + 2x Cilindro Mestre de Embreagem (R$ 960,00 un).
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--aco-150);padding-top:12px">
        <button class="btn btn-secundario" data-act="fechar">Fechar</button>
        <button class="btn btn-sucesso" data-act="importar-exemplo-ocr" style="font-weight:600;padding:0 16px">
          ${ico('check', 14)} Lançar Dados Reconhecidos
        </button>
      </div>
    </div>`;
  }

  // Exportações explícitas para window e globalThis
  global.folhaXML = folhaXML;
  global.lerXML = lerXML;
  global.confirmarXML = confirmarXML;
  global.folhaSimulacaoOCR = folhaSimulacaoOCR;

  if (typeof window !== 'undefined') {
    window.folhaXML = folhaXML;
    window.lerXML = lerXML;
    window.confirmarXML = confirmarXML;
    window.folhaSimulacaoOCR = folhaSimulacaoOCR;
  }
})(typeof window !== 'undefined' ? window : globalThis);

