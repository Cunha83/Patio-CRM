'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

// Helper para instanciar sandbox frontend com ambiente DOM mínimo
function criarSandbox() {
  const window = {
    S: {
      ui: {},
      os: [],
      clientes: [],
      veiculos: [],
      boxes: [],
      contas: [],
      borderos: [],
      workers: []
    },
    esc: (x) => String(x || ''),
    brl: (n) => `R$ ${Number(n || 0).toFixed(2)}`,
    ico: (n, s) => `<svg class="icon-${n}"></svg>`,
    hoje: () => '2026-11-09'
  };
  window.globalThis = window;
  const ctx = vm.createContext(window);
  return ctx;
}

test('P0: Componentes Frontend Sprint 4.3 (Linha Pesada, Borderô e Comissões)', async (t) => {

  await t.test('1. UI de Conjuntos Articulados: renderSeletorArticuladoHtml, renderAlvoItemBadge e renderSubtotaisArticuladoOS', () => {
    const articuladoUiPath = path.join(rootDir, 'js', 'modules', 'patio_articulado_ui.js');
    assert.ok(fs.existsSync(articuladoUiPath), 'patio_articulado_ui.js deve existir');

    const ctx = criarSandbox();
    const code = fs.readFileSync(articuladoUiPath, 'utf8');
    vm.runInContext(code, ctx);

    // 1.1 renderSeletorArticuladoHtml para veículo simples vs articulado
    const htmlSimples = ctx.renderSeletorArticuladoHtml({});
    assert.ok(htmlSimples.includes('Veículo Individual'), 'Deve conter opção de veículo individual');
    assert.ok(htmlSimples.includes('data-act="toggle-tipo-entrada"'), 'Deve conter ação de toggle de entrada');

    const htmlArticulado = ctx.renderSeletorArticuladoHtml({ tipoEntrada: 'articulado', carretaPlaca: 'CAR1A22' });
    assert.ok(htmlArticulado.includes('Placa da Carreta / Semirreboque'), 'Deve exibir campo de placa da carreta');
    assert.ok(htmlArticulado.includes('CAR1A22'), 'Deve conter o valor da placa da carreta');

    // 1.2 renderAlvoItemBadge
    const osArticulada = {
      veiculo: { tipo: 'articulado', placa: 'CAV1A00' },
      conjuntoArticulado: {
        cavalo: { placa: 'CAV1A00' },
        carretas: [{ placa: 'CAR1A22' }]
      }
    };
    const badgeCavalo = ctx.renderAlvoItemBadge({ id: 's1', alvo: 'cavalo' }, 'servicos', osArticulada);
    assert.ok(badgeCavalo.includes('Cavalo'), 'Deve indicar alvo Cavalo');

    const badgeCarreta = ctx.renderAlvoItemBadge({ id: 's2', alvo: 'carreta' }, 'servicos', osArticulada);
    assert.ok(badgeCarreta.includes('Carreta'), 'Deve indicar alvo Carreta');

    // 1.3 renderSubtotaisArticuladoOS
    const osComItens = {
      ...osArticulada,
      servicos: [
        { id: 's1', alvo: 'cavalo', valor: 500, qtd: 1 },
        { id: 's2', alvo: 'carreta', valor: 700, qtd: 1 }
      ],
      pecas: [
        { id: 'p1', alvo: 'cavalo', valor: 300, qtd: 1 },
        { id: 'p2', alvo: 'carreta', valor: 400, qtd: 1 }
      ]
    };
    const resumoSubtotais = ctx.renderSubtotaisArticuladoOS(osComItens);
    assert.ok(resumoSubtotais.includes('R$ 800.00'), 'Subtotal cavalo deve ser 500 + 300 = 800');
    assert.ok(resumoSubtotais.includes('R$ 1100.00'), 'Subtotal carreta deve ser 700 + 400 = 1100');
  });

  await t.test('2. Tela de Fechamento de Faturas / Borderô de Frotas: blocoBorderoFrotas e cálculo de seleção', () => {
    const borderoUiPath = path.join(rootDir, 'js', 'modules', 'financeiro_bordero_ui.js');
    assert.ok(fs.existsSync(borderoUiPath), 'financeiro_bordero_ui.js deve existir');

    const ctx = criarSandbox();
    ctx.S.clientes = [
      { id: 'cli_transp_1', nome: 'Transportadora Cearense', doc: '01.222.333/0001-44' }
    ];
    ctx.S.os = [
      {
        id: 'os_401',
        num: '401',
        cli: 'cli_transp_1',
        st: 'finalizada',
        veiculo: { placa: 'FRO1A01', modelo: 'Volvo FH' },
        servicos: [{ valor: 1000 }],
        pecas: [{ valor: 500, qtd: 1 }],
        total: 1500
      }
    ];

    const code = fs.readFileSync(borderoUiPath, 'utf8');
    vm.runInContext(code, ctx);

    const html = ctx.blocoBorderoFrotas();
    assert.ok(html.includes('Faturamento de Frotas'), 'Deve conter título do painel');
    assert.ok(html.includes('Transportadora Cearense'), 'Deve listar cliente frotista');
    assert.ok(html.includes('os_401'), 'Deve listar a OS faturável');
    assert.ok(html.includes('Gerar Borderô e Boletos'), 'Deve conter botão de ação para emissão de borderô');

    // Cálculo de totais
    const totais = ctx.calcularTotaisBorderoFrontend(['os_401'], 100, { iss: 2, irrf: 1.5 });
    assert.equal(totais.subtotalBruto, 1500);
    assert.equal(totais.totalMaoDeObra, 1000);
    assert.equal(totais.totalPecas, 500);
    assert.equal(totais.descontoGeral, 100);
    // ISS: 1000 * 0.02 = 20, IRRF: 1500 * 0.015 = 22.50 -> Retencoes = 42.50
    assert.equal(totais.totalRetencoes, 42.50);
    // Liquido: 1500 - 100 - 42.50 = 1357.50
    assert.equal(totais.totalLiquido, 1357.50);
  });

  await t.test('3. Modal de Cobrança e Espelho da Frota: modalDetalhesBorderoHtml', () => {
    const modalBorderoPath = path.join(rootDir, 'js', 'modules', 'financeiro_bordero_modal.js');
    assert.ok(fs.existsSync(modalBorderoPath), 'financeiro_bordero_modal.js deve existir');

    const ctx = criarSandbox();
    const mockBordero = {
      id: 'bord_test_1',
      num: 'BORD-0005',
      clienteNome: 'Viação Transbrasiliana',
      clienteDoc: '11.222.333/0001-99',
      status: 'faturado',
      totais: {
        totalMaoDeObra: 2000,
        totalPecas: 1000,
        subtotalBruto: 3000,
        descontoGeral: 100,
        totalRetencoes: 50,
        totalLiquido: 2850
      },
      parcelas: [
        {
          numero: 1,
          vencimento: '2026-12-05',
          valor: 2850,
          linhaDigitavel: '00190.00009 01234.567890 00017.000001 1 16390000285000',
          pixCopiaECola: '00020126420014br.gov.bcb.pix...'
        }
      ],
      resumoOS: [
        {
          num: '501',
          placa: 'BRA2E19',
          modelo: 'Volvo FH 540',
          totalOS: 3000,
          totalMaoDeObra: 2000,
          totalPecas: 1000,
          discriminacaoArticulado: [
            { alvo: 'cavalo', placa: 'BRA2E19', total: 1800 },
            { alvo: 'carreta', placa: 'CAR9A99', total: 1200 }
          ]
        }
      ]
    };

    const code = fs.readFileSync(modalBorderoPath, 'utf8');
    vm.runInContext(code, ctx);

    const html = ctx.modalDetalhesBorderoHtml(mockBordero);
    assert.ok(html.includes('BORD-0005'), 'Deve conter número do borderô');
    assert.ok(html.includes('Viação Transbrasiliana'), 'Deve conter razão social da transportadora');
    assert.ok(html.includes('00190.00009'), 'Deve exibir linha digitável');
    assert.ok(html.includes('data-act="copiar-linha-digitavel"'), 'Deve conter botão de cópia de linha digitável');
    assert.ok(html.includes('BRA2E19'), 'Deve conter a placa do veículo');
    assert.ok(html.includes('CAR9A99'), 'Deve discriminar a placa da carreta');
    assert.ok(html.includes('data-act="enviar-wa-bordero-modal"'), 'Deve conter botão para envio de WhatsApp');
  });

  await t.test('4. Extrato de Produtividade e Comissões: blocoExtratoComissoesHtml e calcularExtratoComissoes', () => {
    const comissoesPath = path.join(rootDir, 'js', 'modules', 'analista_comissoes_ui.js');
    assert.ok(fs.existsSync(comissoesPath), 'analista_comissoes_ui.js deve existir');

    const ctx = criarSandbox();
    ctx.S = {
      os: [
        {
          id: 'os_c1',
          num: '601',
          placa: 'ABC1D23',
          cliente: 'Transportes Rápidos',
          mecanico: 'Tião Molas',
          st: 'finalizada',
          finalizadoEm: '2026-11-05T10:00:00.000Z',
          servicos: [
            { desc: 'Revisão de Feixes', preco: 1000, comissaoPct: 20 }
          ]
        },
        {
          id: 'os_c2',
          num: '602',
          placa: 'XYZ9K88',
          cliente: 'Expresso Cargas',
          mecanico: 'Zé do Freio',
          st: 'finalizada',
          finalizadoEm: '2026-11-20T14:00:00.000Z',
          servicos: [
            { desc: 'Troca de Tambor', preco: 800, comissaoPct: 15 }
          ]
        }
      ],
      mecanicos: [
        { id: 'mec_1', nome: 'Tião Molas', taxaComissaoPct: 20 },
        { id: 'mec_2', nome: 'Zé do Freio', taxaComissaoPct: 15 }
      ],
      ui: {
        comissoesPeriodo: 'quinzena_1',
        comissoesMecanicoId: 'all'
      }
    };

    const code = fs.readFileSync(comissoesPath, 'utf8');
    vm.runInContext(code, ctx);

    // Na quinzena 1 (dias 01 a 15), apenas a OS 601 deve entrar
    const calcQ1 = ctx.calcularExtratoComissoes(ctx.S, 'quinzena_1', 'all');
    assert.equal(calcQ1.qtdOS, 1, 'Quinzena 1 deve conter exatamente 1 OS');
    assert.equal(calcQ1.totalMaoDeObra, 1000);
    assert.equal(calcQ1.totalComissao, 200);

    // No mês completo, ambas as OSs devem entrar
    const calcMes = ctx.calcularExtratoComissoes(ctx.S, 'mes_completo', 'all');
    assert.equal(calcMes.qtdOS, 2, 'Mês completo deve conter 2 OSs');
    assert.equal(calcMes.totalMaoDeObra, 1800);
    assert.equal(calcMes.totalComissao, 320); // 200 + 120

    const html = ctx.blocoExtratoComissoesHtml();
    assert.ok(html.includes('Extrato de Comissões'), 'Deve renderizar título de extrato');
    assert.ok(html.includes('Tião Molas'), 'Deve exibir nome do mecânico');
    assert.ok(html.includes('data-act="mudar-periodo-comissoes"'), 'Deve conter botões de alternância de período');
    assert.ok(html.includes('data-act="copiar-extrato-comissoes"'), 'Deve conter botão de cópia de extrato');
  });
});
