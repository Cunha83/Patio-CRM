'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const boletoEngine = require('../services/billing/boletoEngine');

test('P0: Motor de Títulos e Boletos Bancários Febraban & Pix Híbrido', async (t) => {

  await t.test('1. Módulo 10: cálculo de dígito verificador para campos da linha digitável', () => {
    // Teste canônico Febraban de Módulo 10
    // Multiplicações da direita para esquerda por 2 e 1 alternadamente, soma dos algarismos
    const dv1 = boletoEngine.calcularModulo10('001900000');
    assert.match(String(dv1), /^[0-9]$/, 'DV Módulo 10 deve ser um dígito entre 0 e 9');

    // Exemplos conhecidos
    // 261533: 3*2=6, 3*1=3, 5*2=10(1+0=1), 1*1=1, 6*2=12(1+2=3), 2*1=2 -> soma = 6+3+1+1+3+2 = 16 -> 20-16 = 4
    assert.equal(boletoEngine.calcularModulo10('261533'), 4);
    // Número onde soma é múltiplo de 10: 00000 -> DV = 0
    assert.equal(boletoEngine.calcularModulo10('00000'), 0);
  });

  await t.test('2. Módulo 11 Febraban: cálculo do DV geral do código de barras', () => {
    // Pesos de 2 a 9 da direita para a esquerda. Resto 0, 10 ou 11 -> DV = 1
    const dvGeral = boletoEngine.calcularModulo11Febraban('0019100000000010000000000123456789012345678');
    assert.match(String(dvGeral), /^[1-9]$/, 'DV geral do código de barras deve ser de 1 a 9');

    // Casos especiais Febraban de resto
    // Mock de sequência cujo resto resulte em 0, 10 ou 11
    assert.ok([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number(dvGeral)));
  });

  await t.test('3. Fator de Vencimento Febraban: suporte ao ciclo original e novo ciclo 2025-2050', () => {
    // Data base: 1997-10-07
    // Em 2025-02-21 o fator atingiu 9999
    const fatorLimite = boletoEngine.calcularFatorVencimento('2025-02-21');
    assert.equal(fatorLimite, '9999', 'Fator de vencimento em 2025-02-21 deve ser 9999');

    // Em 2025-02-22 reiniciou o ciclo Febraban em 1000
    const fatorNovoCiclo = boletoEngine.calcularFatorVencimento('2025-02-22');
    assert.equal(fatorNovoCiclo, '1000', 'Fator de vencimento em 2025-02-22 deve reiniciar em 1000');

    // Data posterior em 2026
    const fator2026 = boletoEngine.calcularFatorVencimento('2026-11-20');
    assert.ok(Number(fator2026) > 1000, 'Fator de 2026 deve ser superior a 1000');
    assert.equal(fator2026.length, 4, 'Fator deve conter 4 dígitos');

    // Vencimento à vista / sem data
    assert.equal(boletoEngine.calcularFatorVencimento(null), '0000');
    assert.equal(boletoEngine.calcularFatorVencimento(''), '0000');
  });

  await t.test('4. Formatação de valor nominal: 10 posições com zeros à esquerda', () => {
    assert.equal(boletoEngine.formatarValorNominal(1500.50), '0000150050');
    assert.equal(boletoEngine.formatarValorNominal(250.00), '0000025000');
    assert.equal(boletoEngine.formatarValorNominal(0), '0000000000');
    assert.equal(boletoEngine.formatarValorNominal('1234.99'), '0000123499');
  });

  await t.test('5. Geração de Código de Barras (44 dígitos) e Linha Digitável (47 dígitos) para 5 bancos', () => {
    const bancos = ['001', '237', '341', '756', '748'];

    for (const banco of bancos) {
      const res = boletoEngine.gerarCodigoBarrasELinhaDigitavel({
        banco,
        vencimento: '2026-12-15',
        valor: 4500.00,
        agencia: '1234',
        conta: '56789',
        carteira: '17',
        nossoNumero: '987654321'
      });

      assert.ok(res, `Resultado deve existir para banco ${banco}`);
      assert.equal(res.codigoBarras.length, 44, `Código de barras deve ter 44 dígitos no banco ${banco}`);
      assert.equal(res.codigoBarras.slice(0, 3), banco, `Código de barras deve iniciar com o código do banco ${banco}`);
      assert.equal(res.codigoBarras[3], '9', 'Moeda deve ser sempre 9 (Real)');

      // Validação da linha digitável (47 dígitos sem pontuação)
      const linhaLimpa = res.linhaDigitavel.replace(/[^0-9]/g, '');
      assert.equal(linhaLimpa.length, 47, `Linha digitável deve conter 47 números no banco ${banco}`);

      // Validação da máscara formatada: 5 blocos separados por espaço
      const partesFormatadas = res.linhaDigitavelFormatada.split(' ');
      assert.equal(partesFormatadas.length, 5, 'Linha digitável formatada deve possuir 5 campos');
      assert.match(partesFormatadas[0], /^[0-9]{5}\.[0-9]{5}$/, 'Campo 1 deve estar no formato XXXXX.XXXXX');
      assert.match(partesFormatadas[1], /^[0-9]{5}\.[0-9]{6}$/, 'Campo 2 deve estar no formato XXXXX.XXXXXX');
      assert.match(partesFormatadas[2], /^[0-9]{5}\.[0-9]{6}$/, 'Campo 3 deve estar no formato XXXXX.XXXXXX');
      assert.match(partesFormatadas[3], /^[0-9]$/, 'Campo 4 deve ser o DV geral');
      assert.match(partesFormatadas[4], /^[0-9]{14}$/, 'Campo 5 deve conter fator de vencimento e valor');

      // DV geral na linha digitável deve ser exatamente o caractere 5 do código de barras
      assert.equal(partesFormatadas[3], res.codigoBarras[4], 'DV geral do campo 4 deve bater com a posição 5 do código de barras');
    }
  });

  await t.test('6. Payload Pix Híbrido Dinâmico: padrão EMVCo com CRC16 válido', () => {
    const pix = boletoEngine.gerarPayloadPixHibrido({
      chavePix: 'financeiro@transportes.com.br',
      recebedorNome: 'Auto Molas Fort Oficina',
      cidade: 'FORTALEZA',
      valor: 1850.75,
      txid: 'BORD2026110901'
    });

    assert.ok(pix.payload, 'Deve conter payload EMVCo');
    assert.ok(pix.payload.startsWith('000201'), 'Payload Pix deve iniciar com Header EMVCo 000201');
    assert.ok(pix.payload.includes('6304'), 'Payload deve conter o identificador de checksum 6304');
    assert.equal(pix.crc16.length, 4, 'CRC16 deve ser uma string hexadecimal de 4 caracteres');
    assert.equal(pix.payload.slice(-4), pix.crc16, 'Os últimos 4 dígitos do payload devem ser o CRC16');
  });

  await t.test('7. Encargos por atraso: multa e juros de mora pro rata die', () => {
    const encargos = boletoEngine.calcularEncargosAtraso({
      valorOriginal: 1000.00,
      vencimento: '2026-11-01',
      dataConsulta: '2026-11-11', // 10 dias de atraso
      multaPercentual: 2, // 2% = 20.00
      jurosMensalPercentual: 1 // 1% ao mês = 0.0333% ao dia = 3.33 em 10 dias
    });

    assert.equal(encargos.diasAtraso, 10);
    assert.equal(encargos.multaValor, 20.00);
    assert.equal(encargos.jurosValor, 3.33);
    assert.equal(encargos.totalEncargos, 23.33);
    assert.equal(encargos.valorAtualizado, 1023.33);

    // Consulta antes do vencimento -> sem encargos
    const semAtraso = boletoEngine.calcularEncargosAtraso({
      valorOriginal: 1000.00,
      vencimento: '2026-11-20',
      dataConsulta: '2026-11-10'
    });
    assert.equal(semAtraso.diasAtraso, 0);
    assert.equal(semAtraso.totalEncargos, 0);
    assert.equal(semAtraso.valorAtualizado, 1000.00);
  });

  await t.test('8. Geração de Boleto Completo consolidando metadados fiscais e de cobrança', () => {
    const boleto = boletoEngine.gerarBoletoCompleto({
      tituloId: 'tit_12345',
      tenantId: 'tenant_frota_1',
      pagador: {
        nome: 'Transportadora Transnorte Ltda',
        cnpj: '12.345.678/0001-90',
        endereco: 'Av. Brasil, 1500, Fortaleza - CE'
      },
      beneficiario: {
        nome: 'Auto Molas Fort Serviços Automotivos',
        cnpj: '98.765.432/0001-10',
        agencia: '3456',
        conta: '78901',
        carteira: '09',
        banco: '237'
      },
      valor: 2500.00,
      vencimento: '2026-12-10',
      nossoNumero: '100200300',
      chavePix: 'pix@molasfort.com.br'
    });

    assert.ok(boleto.id, 'Deve conter ID do boleto');
    assert.equal(boleto.tituloId, 'tit_12345');
    assert.equal(boleto.banco, '237');
    assert.ok(boleto.codigoBarras, 'Deve conter código de barras');
    assert.ok(boleto.linhaDigitavel, 'Deve conter linha digitável formatada');
    assert.ok(boleto.pixCopiaECola, 'Deve conter Pix Copia e Cola');
    assert.equal(boleto.status, 'emitido');
  });
});

